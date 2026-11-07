import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const protocolVersion = 1;
const maximumReporterEvents = 100000;
const maximumFailureSamples = 20;
const maximumTestNameCharacters = 4096;
const maximumReporterBytes = 131072;
const maximumRecordBytes = 1024;
const outputAccountingIntervalBytes = 8192;

function pathKey(value) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function toRepositoryPath(filePath, rootPath, allowedPaths) {
  if (typeof filePath !== "string" || filePath.length === 0 || filePath.length > 2048 || filePath.startsWith("file:")) return null;
  if (filePath.split(/[\\/]/).includes("..")) return null;
  const candidate = path.resolve(path.isAbsolute(filePath) ? filePath : path.join(rootPath, filePath));
  const relativeCandidate = path.relative(rootPath, candidate);
  if (relativeCandidate === ".." || relativeCandidate.startsWith(`..${path.sep}`) || path.isAbsolute(relativeCandidate)) return null;
  const allowedCandidate = allowedPaths.get(pathKey(candidate));
  if (!allowedCandidate) return null;
  try {
    const realCandidate = fs.realpathSync(candidate);
    const realAllowedCandidate = fs.realpathSync(path.join(rootPath, allowedCandidate));
    if (pathKey(realCandidate) !== pathKey(realAllowedCandidate)) return null;
  } catch {
    return null;
  }
  return allowedCandidate.split(path.sep).join("/");
}

function createAllowedPaths(rootPath, argumentsList) {
  const allowedPaths = new Map();
  if (argumentsList.length === 0 || argumentsList.length > 256) return allowedPaths;
  for (const argument of argumentsList) {
    if (typeof argument !== "string" || argument.length === 0 || argument.length > 1024 || argument.startsWith("-") || argument.startsWith("file:")) continue;
    if (argument.split(/[\\/]/).includes("..")) continue;
    const candidate = path.resolve(path.isAbsolute(argument) ? argument : path.join(rootPath, argument));
    const relativeCandidate = path.relative(rootPath, candidate);
    if (relativeCandidate === ".." || relativeCandidate.startsWith(`..${path.sep}`) || path.isAbsolute(relativeCandidate)) continue;
    try {
      const stat = fs.lstatSync(candidate);
      if (!stat.isFile() || stat.isSymbolicLink()) continue;
      const realCandidate = fs.realpathSync(candidate);
      const relativeRealCandidate = path.relative(rootPath, realCandidate);
      if (relativeRealCandidate === ".." || relativeRealCandidate.startsWith(`..${path.sep}`) || path.isAbsolute(relativeRealCandidate)) continue;
      allowedPaths.set(pathKey(candidate), relativeCandidate);
      allowedPaths.set(pathKey(realCandidate), relativeRealCandidate);
    } catch {
    }
  }
  return allowedPaths;
}

function safeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function sourceLocation(value) {
  return safeInteger(value) && value > 0 && value <= 10000000 ? value : null;
}

function hashTestName(name) {
  if (typeof name !== "string") return { hash: null, status: "unavailable" };
  if (name.length > maximumTestNameCharacters) return { hash: null, status: "omitted_too_large" };
  return {
    hash: crypto.createHash("sha256").update(name, "utf8").digest("hex"),
    status: "available"
  };
}

function failureClass(error) {
  try {
    const candidates = [];
    const visited = new Set();
    let candidate = error;
    let genericFailure = false;
    while (candidate && candidates.length < 4 && !visited.has(candidate)) {
      candidates.push(candidate);
      visited.add(candidate);
      candidate = candidate.cause;
    }
    for (const candidateError of candidates) {
      if (candidateError?.code === "ERR_ASSERTION" || candidateError?.name === "AssertionError") return "assertion";
      if (candidateError?.name === "SyntaxError") return "syntax_error";
      if (candidateError?.code === "ERR_TEST_TIMEOUT" || candidateError?.name === "TimeoutError") return "timeout";
      if (candidateError?.code === "ERR_TEST_CANCELLED" || candidateError?.name === "AbortError") return "cancelled";
      if (candidateError?.code === "ERR_TEST_FAILURE") genericFailure = true;
    }
    if (genericFailure) return "test_failure";
  } catch {
    return "unknown";
  }
  return "unknown";
}

function isContainerFailure(data, file, maximumFailedNestingByTest) {
  if (data.details?.type === "suite") return true;
  if (file === null || !safeInteger(data.testNumber) || !safeInteger(data.nesting)) return false;
  const key = `${file}\u0000${data.testNumber}`;
  const previousMaximumNesting = maximumFailedNestingByTest.get(key);
  if (data.nesting > 0 && (previousMaximumNesting === undefined || data.nesting > previousMaximumNesting)) {
    maximumFailedNestingByTest.set(key, data.nesting);
  }
  return previousMaximumNesting !== undefined && previousMaximumNesting > data.nesting;
}

function lineFor(record) {
  const serialized = JSON.stringify(record);
  if (Buffer.byteLength(serialized, "utf8") + 1 > maximumRecordBytes) return null;
  return `${serialized}\n`;
}

export default async function* verifyLocalTestReporter(source) {
  const rootPath = path.resolve(process.cwd());
  const allowedPaths = createAllowedPaths(rootPath, process.argv.slice(1));
  const state = {
    status: "complete",
    failureCount: 0,
    suiteFailureCount: 0,
    passedCount: 0,
    skippedCount: 0,
    todoCount: 0,
    observedEvents: 0,
    omittedEvents: 0,
    failureSamples: 0,
    omittedFailureSamples: 0,
    unmappedFailureCount: 0,
    testOutputBytes: 0,
    pendingOutputBytes: 0,
    nameHashOmittedCount: 0,
    reporterBytes: 0,
    maximumFailedNestingByTest: new Map()
  };

  const emit = (record, reserveSummary = true) => {
    const value = lineFor({ version: protocolVersion, ...record });
    if (value === null) {
      state.status = "truncated";
      return null;
    }
    const valueBytes = Buffer.byteLength(value, "utf8");
    const summaryReserve = reserveSummary ? 1200 : 0;
    if (state.reporterBytes + valueBytes + summaryReserve > maximumReporterBytes) {
      state.status = "truncated";
      return null;
    }
    state.reporterBytes += valueBytes;
    return value;
  };

  const flushOutputBytes = () => {
    if (state.pendingOutputBytes === 0) return null;
    const value = emit({ kind: "output", bytes: state.pendingOutputBytes });
    if (value !== null) {
      state.pendingOutputBytes = 0;
      return value;
    }
    return null;
  };

  try {
    for await (const event of source) {
      if (event?.type === "test:stdout" || event?.type === "test:stderr") {
        const message = event?.data?.message;
        if (typeof message !== "string") {
          state.status = "truncated";
          continue;
        }
        const messageBytes = Buffer.byteLength(message, "utf8");
        state.testOutputBytes = Math.min(Number.MAX_SAFE_INTEGER, state.testOutputBytes + messageBytes);
        state.pendingOutputBytes = Math.min(Number.MAX_SAFE_INTEGER, state.pendingOutputBytes + messageBytes);
        if (state.pendingOutputBytes >= outputAccountingIntervalBytes) {
          const value = flushOutputBytes();
          if (value !== null) yield value;
        }
      }

      if (state.observedEvents >= maximumReporterEvents) {
        state.omittedEvents = Math.min(Number.MAX_SAFE_INTEGER, state.omittedEvents + 1);
        state.status = "truncated";
        continue;
      }
      state.observedEvents += 1;
      if (event?.type === "test:fail") {
        const data = event.data && typeof event.data === "object" ? event.data : {};
        const file = toRepositoryPath(data.file, rootPath, allowedPaths);
        const isContainer = isContainerFailure(data, file, state.maximumFailedNestingByTest);
        if (isContainer) {
          state.suiteFailureCount += 1;
        } else {
          state.failureCount += 1;
        }
        if (file === null) state.unmappedFailureCount += 1;
        const name = hashTestName(data.name);
        if (name.status !== "available") state.nameHashOmittedCount += 1;
        if (state.failureSamples >= maximumFailureSamples) {
          state.omittedFailureSamples += 1;
          state.status = "truncated";
          continue;
        }
        const value = emit({
          kind: "failure",
          role: isContainer ? "container" : "leaf",
          file,
          line: sourceLocation(data.line),
          column: sourceLocation(data.column),
          testNameSha256: name.hash,
          testNameHashStatus: name.status,
          failureClass: failureClass(data.details?.error)
        });
        if (value === null) {
          state.omittedFailureSamples += 1;
          continue;
        }
        state.failureSamples += 1;
        yield value;
      } else if (event?.type === "test:pass") {
        const data = event.data && typeof event.data === "object" ? event.data : {};
        if (data.details?.type === "suite") continue;
        if (data.skip) state.skippedCount += 1;
        else if (data.todo) state.todoCount += 1;
        else state.passedCount += 1;
      }
    }
  } catch {
    state.status = "truncated";
  }

  const outputRecord = flushOutputBytes();
  if (outputRecord !== null) yield outputRecord;
  const summary = emit({
    kind: "summary",
    status: state.status,
    failureCount: state.failureCount,
    suiteFailureCount: state.suiteFailureCount,
    passedCount: state.passedCount,
    skippedCount: state.skippedCount,
    todoCount: state.todoCount,
    observedEvents: state.observedEvents,
    omittedEvents: state.omittedEvents,
    failureSamples: state.failureSamples,
    omittedFailureSamples: state.omittedFailureSamples,
    unmappedFailureCount: state.unmappedFailureCount,
    testOutputBytes: state.testOutputBytes,
    nameHashOmittedCount: state.nameHashOmittedCount
  }, false);
  if (summary !== null) yield summary;
}
