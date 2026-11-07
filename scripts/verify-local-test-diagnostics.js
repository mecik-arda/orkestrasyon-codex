import path from "node:path";
import { TextDecoder } from "node:util";

export const maximumDiagnosticBytes = 131072;
export const maximumDiagnosticRecordBytes = 1024;
export const maximumDiagnosticPendingBytes = 1024;
export const maximumDiagnosticFailureSamples = 20;
export const maximumDiagnosticEvents = 100000;

const failureClasses = new Set(["assertion", "syntax_error", "timeout", "cancelled", "test_failure", "unknown"]);
const testNameHashStatuses = new Set(["available", "omitted_too_large", "unavailable"]);

function exactKeys(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function safeCount(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= maximumDiagnosticEvents;
}

function normalizeAllowedPath(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 1024 || path.isAbsolute(value)) return null;
  if (value.startsWith("file:") || value.includes("\\") || value.split("/").includes("..")) return null;
  return value;
}

export function createUnavailableTestDiagnostics(stageId, reason, observedBytes = 0, accountedOutputBytes = 0, partialFailureSamples = []) {
  return {
    stageId,
    status: "unavailable",
    reason,
    failureCount: null,
    suiteFailureCount: null,
    passedCount: null,
    skippedCount: null,
    todoCount: null,
    observedEvents: null,
    omittedEvents: null,
    failureSamples: partialFailureSamples.slice(0, maximumDiagnosticFailureSamples),
    omittedFailureSamples: null,
    unmappedFailureCount: null,
    nameHashOmittedCount: null,
    testOutputBytes: accountedOutputBytes,
    diagnosticBytes: observedBytes
  };
}

export function createTestDiagnosticsCollector({ stageId, projectRoot, allowedTestFiles } = {}) {
  const normalizedFiles = Array.isArray(allowedTestFiles)
    ? allowedTestFiles.map(normalizeAllowedPath).filter((value) => value !== null)
    : [];
  const allowed = new Set(normalizedFiles);
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const state = {
    stageId: typeof stageId === "string" ? stageId : "unknown",
    projectRoot: typeof projectRoot === "string" ? path.resolve(projectRoot) : null,
    allowed,
    pending: Buffer.alloc(0),
    discardingOversizeRecord: false,
    diagnosticBytes: 0,
    accountedOutputBytes: 0,
    samples: [],
    summary: null,
    reason: null,
    truncated: false
  };

  const markIncomplete = (reason) => {
    if (state.reason === null) state.reason = reason;
  };

  function acceptRecord(record) {
    if (state.summary) {
      markIncomplete("record_after_summary");
      return;
    }
    if (!record || typeof record !== "object" || Array.isArray(record) || record.version !== 1 || typeof record.kind !== "string") {
      markIncomplete("malformed_record");
      return;
    }
    if (record.kind === "output") {
      if (!exactKeys(record, ["version", "kind", "bytes"]) || !Number.isSafeInteger(record.bytes) || record.bytes <= 0) {
        markIncomplete("malformed_output_record");
        return;
      }
      if (record.bytes > maximumDiagnosticBytes || state.accountedOutputBytes + record.bytes > Number.MAX_SAFE_INTEGER) {
        state.accountedOutputBytes = Number.MAX_SAFE_INTEGER;
        markIncomplete("output_accounting_limit");
        return;
      }
      state.accountedOutputBytes += record.bytes;
      return;
    }
    if (record.kind === "failure") {
      if (!exactKeys(record, ["version", "kind", "role", "file", "line", "column", "testNameSha256", "testNameHashStatus", "failureClass"])) {
        markIncomplete("malformed_failure_record");
        return;
      }
      if (!["leaf", "container"].includes(record.role)) {
        markIncomplete("untrusted_failure_record");
        return;
      }
      const validFile = record.file === null || (typeof record.file === "string" && state.allowed.has(record.file));
      const validLocation = (record.line === null || (Number.isSafeInteger(record.line) && record.line > 0 && record.line <= 10000000))
        && (record.column === null || (Number.isSafeInteger(record.column) && record.column > 0 && record.column <= 10000000));
      const validHash = record.testNameSha256 === null || (typeof record.testNameSha256 === "string" && /^[a-f0-9]{64}$/.test(record.testNameSha256));
      if (!validFile || !validLocation || !validHash || !testNameHashStatuses.has(record.testNameHashStatus) || !failureClasses.has(record.failureClass)) {
        markIncomplete("untrusted_failure_record");
        return;
      }
      if (state.samples.length >= maximumDiagnosticFailureSamples) {
        state.truncated = true;
        return;
      }
      state.samples.push({
        role: record.role,
        file: record.file,
        line: record.line,
        column: record.column,
        testNameSha256: record.testNameSha256,
        testNameHashStatus: record.testNameHashStatus,
        failureClass: record.failureClass
      });
      return;
    }
    if (record.kind === "summary") {
      const expectedKeys = [
        "version", "kind", "status", "failureCount", "suiteFailureCount", "passedCount", "skippedCount", "todoCount",
        "observedEvents", "omittedEvents", "failureSamples", "omittedFailureSamples", "unmappedFailureCount",
        "testOutputBytes", "nameHashOmittedCount"
      ];
      const boundedCounts = [record.failureCount, record.suiteFailureCount, record.passedCount, record.skippedCount,
        record.todoCount, record.observedEvents, record.failureSamples, record.omittedFailureSamples,
        record.unmappedFailureCount, record.nameHashOmittedCount].every(safeCount);
      const valid = exactKeys(record, expectedKeys)
        && ["complete", "truncated"].includes(record.status)
        && boundedCounts
        && Number.isSafeInteger(record.omittedEvents) && record.omittedEvents >= 0
        && Number.isSafeInteger(record.testOutputBytes) && record.testOutputBytes >= 0
        && record.failureSamples === state.samples.length
        && record.testOutputBytes === state.accountedOutputBytes
        && record.omittedFailureSamples <= record.failureCount + record.suiteFailureCount;
      if (!valid) {
        markIncomplete("malformed_summary");
        return;
      }
      state.summary = record;
      state.truncated = record.status === "truncated"
        || record.omittedEvents > 0
        || record.omittedFailureSamples > 0
        || record.unmappedFailureCount > 0;
      return;
    }
    markIncomplete("unknown_record_kind");
  }

  function processLine(line) {
    if (line.length === 0) {
      markIncomplete("empty_record");
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(decoder.decode(line));
    } catch {
      markIncomplete("malformed_record");
      return;
    }
    acceptRecord(parsed);
  }

  function consume(chunk) {
    const input = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    state.diagnosticBytes = Math.min(Number.MAX_SAFE_INTEGER, state.diagnosticBytes + input.length);
    if (state.diagnosticBytes > maximumDiagnosticBytes) markIncomplete("diagnostic_byte_limit");
    let accountedBytes = 0;
    let offset = 0;
    while (offset < input.length) {
      const newlineIndex = input.indexOf(10, offset);
      const end = newlineIndex < 0 ? input.length : newlineIndex;
      const segment = input.subarray(offset, end);
      if (state.discardingOversizeRecord) {
        if (newlineIndex >= 0) state.discardingOversizeRecord = false;
      } else if (state.pending.length + segment.length > maximumDiagnosticPendingBytes
        || state.pending.length + segment.length > maximumDiagnosticRecordBytes) {
        state.pending = Buffer.alloc(0);
        state.discardingOversizeRecord = newlineIndex < 0;
        markIncomplete("record_byte_limit");
      } else if (newlineIndex >= 0) {
        const line = state.pending.length === 0 ? Buffer.from(segment) : Buffer.concat([state.pending, segment]);
        state.pending = Buffer.alloc(0);
        const before = state.accountedOutputBytes;
        processLine(line);
        accountedBytes += state.accountedOutputBytes - before;
      } else if (segment.length > 0) {
        state.pending = state.pending.length === 0 ? Buffer.from(segment) : Buffer.concat([state.pending, segment]);
      }
      offset = end + (newlineIndex >= 0 ? 1 : 0);
    }
    return { accountedOutputBytes: accountedBytes };
  }

  function finish({ primaryStatus, spawnError = false } = {}) {
    if (state.pending.length > 0 || state.discardingOversizeRecord) markIncomplete("missing_final_record");
    if (!state.summary && state.reason === null) markIncomplete(spawnError ? "reporter_unavailable" : "missing_summary");
    if (state.summary && state.summary.testOutputBytes !== state.accountedOutputBytes) markIncomplete("output_accounting_mismatch");
    if (state.projectRoot === null || normalizedFiles.length !== allowed.size || allowed.size === 0) markIncomplete("stage_allowlist_invalid");
    if (["timeout", "cancelled", "output_limit"].includes(primaryStatus)) {
      if (state.reason === null) state.reason = "process_terminated_before_summary";
    }
    const validAllowlist = state.projectRoot !== null && normalizedFiles.length === allowed.size && allowed.size > 0;
    if (state.reason !== null) {
      return createUnavailableTestDiagnostics(state.stageId, state.reason, state.diagnosticBytes, state.accountedOutputBytes, validAllowlist ? state.samples : []);
    }
    if (!state.summary) return createUnavailableTestDiagnostics(state.stageId, "missing_summary", state.diagnosticBytes, state.accountedOutputBytes, validAllowlist ? state.samples : []);
    return {
      stageId: state.stageId,
      status: state.truncated ? "truncated" : "complete",
      reason: null,
      countsComplete: state.summary.omittedEvents === 0,
      failureCount: state.summary.failureCount,
      suiteFailureCount: state.summary.suiteFailureCount,
      passedCount: state.summary.passedCount,
      skippedCount: state.summary.skippedCount,
      todoCount: state.summary.todoCount,
      observedEvents: state.summary.observedEvents,
      omittedEvents: state.summary.omittedEvents,
      failureSamples: state.samples,
      omittedFailureSamples: state.summary.omittedFailureSamples,
      unmappedFailureCount: state.summary.unmappedFailureCount,
      nameHashOmittedCount: state.summary.nameHashOmittedCount,
      testOutputBytes: state.accountedOutputBytes,
      diagnosticBytes: state.diagnosticBytes
    };
  }

  return { consume, finish };
}
