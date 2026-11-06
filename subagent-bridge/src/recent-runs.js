import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  failureStageValues,
  operatingSystemErrorCodeValues,
  outputIntegrityValues,
  outputSizeBucketValues,
  processSignalValues,
  providerCodeValues,
  retryDecisionValues,
  retryStopReasonValues,
  taskCompletionValues,
  webEvidenceFailureCodeValues
} from "./schemas/core-schemas.js";

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const tokenSchema = z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/);
const nullableTokenSchema = tokenSchema.nullable();
const finiteNonnegativeSchema = z.number().finite().nonnegative();
const backendSchema = z.enum(["antigravity", "claude_code", "codex", "deepseek", "glm", "kimi", "opencode", "qwen"]);
const modeSchema = z.enum(["read_only", "edit"]);
const outcomeSchema = z.enum(["completed", "failed"]);
const roleSchema = z.enum(["analyst", "researcher", "reviewer", "planner"]);
const reviewContractV1Schema = z.object({
  version: z.literal(1),
  sourceScopeStatus: z.enum(["not_requested", "complete", "blocked"]),
  sourceDeliveryStatus: z.enum(["not_attempted", "complete_to_cli", "failed"]),
  sourceManifestSha256: hashSchema.nullable(),
  sourceFileCount: z.number().int().nonnegative().nullable(),
  sourceBytes: z.number().int().nonnegative().max(256 * 1024).nullable(),
  reviewEligibility: z.enum(["eligible_for_orchestrator_evaluation", "unverified", "unavailable"])
}).strict().transform((value) => ({
  ...value,
  reviewEligibility: value.reviewEligibility === "eligible_for_orchestrator_evaluation" ? "unverified" : value.reviewEligibility
}));
const reviewContractV2Schema = z.object({
  version: z.literal(2),
  sourceScopeStatus: z.enum(["not_requested", "complete", "blocked"]),
  sourceDeliveryStatus: z.enum(["not_attempted", "complete_to_cli", "failed"]),
  sourceManifestSha256: hashSchema.nullable(),
  sourceFileCount: z.number().int().nonnegative().nullable(),
  sourceBytes: z.number().int().nonnegative().max(256 * 1024).nullable(),
  outputIntegrity: z.enum(outputIntegrityValues),
  taskCompletion: z.enum(taskCompletionValues),
  reviewResultValidated: z.boolean().optional(),
  reviewEligibility: z.enum(["eligible_for_orchestrator_evaluation", "unverified", "unavailable"])
}).strict().transform((value) => {
  const reviewResultValidated = value.reviewResultValidated === true;
  return {
    ...value,
    reviewResultValidated,
    reviewEligibility: value.reviewEligibility === "eligible_for_orchestrator_evaluation" && !reviewResultValidated
      ? "unverified"
      : value.reviewEligibility
  };
});
const reviewContractSchema = z.union([reviewContractV1Schema, reviewContractV2Schema]);
const usageSchema = z.object({
  durationMs: finiteNonnegativeSchema.optional().nullable(),
  apiDurationMs: finiteNonnegativeSchema.optional().nullable(),
  turns: z.number().int().nonnegative().optional().nullable(),
  totalCostUsd: finiteNonnegativeSchema.optional().nullable()
}).strict();
const attemptSchema = z.object({
  number: z.number().int().positive().optional(),
  failureClass: nullableTokenSchema.optional(),
  exitCode: z.number().int().optional().nullable(),
  durationMs: finiteNonnegativeSchema.optional().nullable(),
  apiDurationMs: finiteNonnegativeSchema.optional().nullable(),
  turns: z.number().int().nonnegative().optional().nullable(),
  totalCostUsd: finiteNonnegativeSchema.optional().nullable(),
  retryDelayMs: finiteNonnegativeSchema.optional().nullable()
}).strict();
const executionSchema = z.object({
  recordedAt: z.string().datetime(),
  backend: backendSchema,
  modelHash: hashSchema,
  executionIdHash: hashSchema,
  workspaceHash: hashSchema,
  mode: modeSchema,
  profile: tokenSchema.optional().nullable(),
  outcomeStatus: outcomeSchema,
  failureClass: nullableTokenSchema,
  usage: usageSchema,
  attempts: z.array(attemptSchema).max(100),
  retries: z.number().int().nonnegative(),
  queueWaitMs: finiteNonnegativeSchema,
  cacheHit: z.boolean()
}).strict();
const attemptSchemaV2 = z.object({
  number: z.number().int().positive().optional(),
  failureClass: nullableTokenSchema.optional(),
  failureStage: z.enum(failureStageValues).nullable().optional(),
  providerCode: z.enum(providerCodeValues).nullable().optional(),
  osErrorCode: z.enum(operatingSystemErrorCodeValues).nullable().optional(),
  webEvidenceFailureCode: z.enum(webEvidenceFailureCodeValues).nullable().optional(),
  exitCode: z.number().int().optional().nullable(),
  signal: z.enum(processSignalValues).nullable().optional(),
  retryDecision: z.enum(retryDecisionValues).optional(),
  retryStopReason: z.enum(retryStopReasonValues).nullable().optional(),
  settingsLockWaitMs: finiteNonnegativeSchema.optional().nullable(),
  providerExecutionMs: finiteNonnegativeSchema.optional().nullable(),
  providerAdmissionLeaseMs: finiteNonnegativeSchema.optional().nullable(),
  stdoutBucket: z.enum(outputSizeBucketValues).optional().nullable(),
  stderrBucket: z.enum(outputSizeBucketValues).optional().nullable(),
  durationMs: finiteNonnegativeSchema.optional().nullable(),
  totalCostUsd: finiteNonnegativeSchema.optional().nullable()
}).strict();
const executionSchemaV2 = z.object({
  schemaVersion: z.literal(2),
  manifestVersion: z.literal(2).optional(),
  recordedAt: z.string().datetime(),
  backend: backendSchema,
  modelHash: hashSchema,
  requestedModelHash: hashSchema.optional(),
  executionIdHash: hashSchema,
  workspaceHash: hashSchema,
  mode: modeSchema,
  accessMode: modeSchema.optional(),
  profile: tokenSchema.optional().nullable(),
  outcomeStatus: outcomeSchema,
  failureClass: nullableTokenSchema,
  failureStage: z.enum(failureStageValues).nullable(),
  providerCode: z.enum(providerCodeValues).nullable(),
  retryStopReason: z.enum(retryStopReasonValues).nullable(),
  outputIntegrity: z.enum(outputIntegrityValues).optional(),
  taskCompletion: z.enum(taskCompletionValues).optional(),
  usage: usageSchema,
  attempts: z.array(attemptSchemaV2).max(100),
  retries: z.number().int().nonnegative(),
  queueWaitMs: finiteNonnegativeSchema,
  cacheHit: z.boolean(),
  capability: z.object({
    canRead: z.boolean(),
    canWrite: z.boolean(),
    supportsSandbox: z.boolean(),
    supportsModelSelection: z.boolean()
  }).strict().nullable().optional(),
  artifactHashes: z.array(hashSchema).max(100).nullable().optional(),
  webEvidenceRepair: z.boolean().optional(),
  reviewContract: reviewContractSchema.optional()
}).strict();
const legacySchema = z.object({
  recordedAt: z.string().datetime(),
  backend: z.literal("deepseek").optional(),
  runIdHash: hashSchema,
  taskIdHash: hashSchema,
  agent: z.literal("deepseek"),
  role: roleSchema,
  modelHash: hashSchema,
  outcomeStatus: outcomeSchema,
  failureClass: nullableTokenSchema,
  usage: usageSchema,
  attempts: z.array(attemptSchema).max(100)
}).strict();
const routingFeedbackSchema = z.object({
  recordType: z.literal("routing_feedback"),
  recordedAt: z.string().datetime(),
  backend: z.literal("routing-evaluation"),
  executionIdHash: hashSchema,
  outcome: z.enum(["useful", "partial", "not_useful"])
}).strict();
const directEditFeedbackSchema = z.object({
  recordType: z.literal("direct_edit_feedback"),
  recordedAt: z.string().datetime(),
  backend: z.literal("direct-edit-baseline"),
  executionIdHash: hashSchema,
  outcome: z.enum(["accepted", "minor_fix", "reverted", "security_concern"])
}).strict();

const maximumRecentRunFiles = 64;
const maximumRecentRunBytes = 64 * 1024 * 1024;
const maximumMetricRecordBytes = 256 * 1024;
const metricReadChunkBytes = 16 * 1024;
const fatalUtf8Decoder = new TextDecoder("utf-8", { fatal: true });

function isPathInside(candidatePath, rootPath) {
  const relativePath = path.relative(rootPath, candidatePath);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function metricFileIdentity(status) {
  return [status.dev, status.ino, status.mode, status.nlink, status.size, status.mtimeNs, status.ctimeNs].map(String).join(":");
}

function sameMetricFileObject(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.nlink === right.nlink;
}

function sameMetricFileSnapshot(left, right) {
  return metricFileIdentity(left) === metricFileIdentity(right);
}

function validateMetricReadLimit(value, name, maximum) {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new Error(`${name} must be a safe integer between 0 and ${maximum}`);
  }
}

function selectMetricFiles(metricsDirectory, limits) {
  if (!fs.existsSync(metricsDirectory)) return { files: [], canonicalRoot: null, truncated: false, sourceStatus: "missing", droppedFileCount: 0 };
  let rootStatus;
  let canonicalRoot;
  try {
    rootStatus = fs.lstatSync(metricsDirectory, { bigint: true });
    if (!rootStatus.isDirectory() || rootStatus.isSymbolicLink()) return { files: [], canonicalRoot: null, truncated: false, sourceStatus: "unsafe", droppedFileCount: 0 };
    canonicalRoot = fs.realpathSync(metricsDirectory);
  } catch {
    return { files: [], canonicalRoot: null, truncated: false, sourceStatus: "unreadable", droppedFileCount: 0 };
  }
  const candidates = [];
  let droppedFileCount = 0;
  let entries;
  try {
    entries = fs.readdirSync(metricsDirectory, { withFileTypes: true });
  } catch {
    return { files: [], canonicalRoot: null, truncated: false, sourceStatus: "unreadable", droppedFileCount: 0 };
  }
  for (const entry of entries) {
    if (!/-runs(?:-[a-zA-Z0-9-]+)?\.jsonl$/.test(entry.name) || entry.isSymbolicLink()) continue;
    const filePath = path.join(metricsDirectory, entry.name);
    try {
      const status = fs.lstatSync(filePath, { bigint: true });
      if (!status.isFile() || status.isSymbolicLink() || status.nlink !== 1n) {
        droppedFileCount += 1;
        continue;
      }
      const realPath = fs.realpathSync(filePath);
      if (!isPathInside(realPath, canonicalRoot)) {
        droppedFileCount += 1;
        continue;
      }
      candidates.push({ filePath: realPath, snapshot: status, mtimeNs: status.mtimeNs, size: status.size });
    } catch {
      droppedFileCount += 1;
    }
  }
  candidates.sort((left, right) => left.mtimeNs === right.mtimeNs
    ? left.filePath.localeCompare(right.filePath)
    : left.mtimeNs > right.mtimeNs ? -1 : 1);
  const files = [];
  let totalBytes = 0n;
  let truncated = candidates.length > limits.maxFiles;
  const maximumBytes = BigInt(limits.maxBytes);
  for (const candidate of candidates) {
    if (files.length >= limits.maxFiles || totalBytes + candidate.size > maximumBytes) {
      truncated = true;
      break;
    }
    files.push(candidate);
    totalBytes += candidate.size;
  }
  return { files, canonicalRoot, truncated, sourceStatus: "available", droppedFileCount };
}

function createMetricFileStage() {
  return { runs: [], routingFeedback: [], directEditFeedback: [], retainedRecordCount: 0 };
}

function consumeMetricRecord(line, stage, diagnostics, periodStart, nowMs) {
  if (line.length === 0) return;
  diagnostics.processedRecordCount += 1;
  let record;
  try {
    record = JSON.parse(fatalUtf8Decoder.decode(line));
  } catch {
    diagnostics.invalidRecordCount += 1;
    diagnostics.droppedRecordCount += 1;
    return;
  }
  const run = normalizeRun(record);
  if (run) {
    const recordedAt = Date.parse(run.recordedAt);
    if (recordedAt >= periodStart && recordedAt <= nowMs) {
      stage.runs.push({ run, serialized: JSON.stringify(run) });
      stage.retainedRecordCount += 1;
    }
    return;
  }
  const routing = routingFeedbackSchema.safeParse(record);
  if (routing.success) {
    stage.routingFeedback.push(routing.data);
    stage.retainedRecordCount += 1;
    return;
  }
  const directEdit = directEditFeedbackSchema.safeParse(record);
  if (directEdit.success) {
    stage.directEditFeedback.push(directEdit.data);
    stage.retainedRecordCount += 1;
  }
}

function frameMetricBytes(chunk, state, stage, diagnostics, periodStart, nowMs) {
  let offset = 0;
  while (offset < chunk.length) {
    const newlineIndex = chunk.indexOf(10, offset);
    const segmentEnd = newlineIndex < 0 ? chunk.length : newlineIndex;
    const segment = chunk.subarray(offset, segmentEnd);
    if (state.discardingOversizedRecord) {
      if (newlineIndex < 0) return;
      state.discardingOversizedRecord = false;
      state.pending = Buffer.alloc(0);
      offset = newlineIndex + 1;
      continue;
    }
    const combinedLength = state.pending.length + segment.length;
    diagnostics.maximumPendingRecordBytes = Math.max(diagnostics.maximumPendingRecordBytes, Math.min(combinedLength, maximumMetricRecordBytes));
    if (combinedLength > maximumMetricRecordBytes) {
      diagnostics.oversizedRecordCount += 1;
      diagnostics.invalidRecordCount += 1;
      diagnostics.droppedRecordCount += 1;
      diagnostics.truncated = true;
      state.pending = Buffer.alloc(0);
      state.discardingOversizedRecord = newlineIndex < 0;
    } else {
      const line = state.pending.length === 0 ? segment : Buffer.concat([state.pending, segment], combinedLength);
      state.pending = Buffer.alloc(0);
      if (newlineIndex < 0) {
        state.pending = Buffer.from(line);
        return;
      }
      const recordLine = line.length > 0 && line.at(-1) === 13 ? line.subarray(0, line.length - 1) : line;
      consumeMetricRecord(recordLine, stage, diagnostics, periodStart, nowMs);
    }
    if (newlineIndex < 0) return;
    offset = newlineIndex + 1;
  }
}

function finishMetricFileFrame(state, diagnostics) {
  if (state.discardingOversizedRecord) return;
  if (state.pending.length > 0) {
    diagnostics.partialRecordCount += 1;
    diagnostics.droppedRecordCount += 1;
    diagnostics.truncated = true;
    state.pending = Buffer.alloc(0);
  }
}

function metricPathMatchesSnapshot(candidate, canonicalRoot) {
  const pathStatus = fs.lstatSync(candidate.filePath, { bigint: true });
  if (!pathStatus.isFile() || pathStatus.isSymbolicLink() || pathStatus.nlink !== 1n
    || !sameMetricFileSnapshot(pathStatus, candidate.snapshot)) return false;
  const realPath = fs.realpathSync(candidate.filePath);
  return realPath === candidate.filePath && isPathInside(realPath, canonicalRoot);
}

function readMetricFileSnapshot(candidate, selection, remainingBudget, stage, diagnostics, periodStart, nowMs) {
  let descriptor;
  let fileInvalid = false;
  let appended = false;
  const framingState = { pending: Buffer.alloc(0), discardingOversizedRecord: false };
  try {
    if (!metricPathMatchesSnapshot(candidate, selection.canonicalRoot)) {
      fileInvalid = true;
      return;
    }
    const noFollow = fs.constants.O_NOFOLLOW || 0;
    descriptor = fs.openSync(candidate.filePath, fs.constants.O_RDONLY | noFollow);
    const openedStatus = fs.fstatSync(descriptor, { bigint: true });
    if (!openedStatus.isFile() || openedStatus.nlink !== 1n || !sameMetricFileSnapshot(openedStatus, candidate.snapshot)) {
      fileInvalid = true;
      return;
    }
    const snapshotBytes = candidate.snapshot.size;
    const targetBytes = snapshotBytes < BigInt(remainingBudget) ? snapshotBytes : BigInt(remainingBudget);
    const buffer = Buffer.allocUnsafe(metricReadChunkBytes);
    let position = 0n;
    while (position < targetBytes) {
      const requestedBytes = Number((targetBytes - position) < BigInt(metricReadChunkBytes)
        ? targetBytes - position
        : BigInt(metricReadChunkBytes));
      diagnostics.requestedBytes += requestedBytes;
      diagnostics.maximumReadRequestBytes = Math.max(diagnostics.maximumReadRequestBytes, requestedBytes);
      const bytesRead = fs.readSync(descriptor, buffer, 0, requestedBytes, Number(position));
      if (bytesRead === 0) {
        fileInvalid = true;
        break;
      }
      diagnostics.bytesRead += bytesRead;
      position += BigInt(bytesRead);
      frameMetricBytes(buffer.subarray(0, bytesRead), framingState, stage, diagnostics, periodStart, nowMs);
    }
    if (position !== targetBytes || targetBytes !== snapshotBytes) fileInvalid = true;
    const afterStatus = fs.fstatSync(descriptor, { bigint: true });
    const pathStatus = fs.lstatSync(candidate.filePath, { bigint: true });
    const pathRealPath = fs.realpathSync(candidate.filePath);
    if (!sameMetricFileObject(openedStatus, afterStatus)
      || !sameMetricFileObject(openedStatus, pathStatus)
      || !pathStatus.isFile()
      || pathStatus.isSymbolicLink()
      || pathStatus.nlink !== 1n
      || pathRealPath !== candidate.filePath
      || !isPathInside(pathRealPath, selection.canonicalRoot)
      || afterStatus.size < snapshotBytes
      || pathStatus.size < snapshotBytes) {
      fileInvalid = true;
    } else if (afterStatus.size > snapshotBytes || pathStatus.size > snapshotBytes) {
      appended = true;
      diagnostics.truncated = true;
    } else if (afterStatus.mtimeNs !== openedStatus.mtimeNs || afterStatus.ctimeNs !== openedStatus.ctimeNs
      || pathStatus.mtimeNs !== openedStatus.mtimeNs || pathStatus.ctimeNs !== openedStatus.ctimeNs) {
      fileInvalid = true;
    }
    if (!fileInvalid) {
      finishMetricFileFrame(framingState, diagnostics);
      if (appended) diagnostics.appendedFileCount += 1;
    }
  } catch {
    diagnostics.readErrorCount += 1;
    fileInvalid = true;
  } finally {
    if (descriptor !== undefined) {
      try {
        fs.closeSync(descriptor);
      } catch {
        diagnostics.readErrorCount += 1;
        fileInvalid = true;
      }
    }
    if (fileInvalid) {
      diagnostics.changedFileCount += 1;
      diagnostics.truncated = true;
      diagnostics.droppedRecordCount += stage.retainedRecordCount;
      stage.runs.length = 0;
      stage.routingFeedback.length = 0;
      stage.directEditFeedback.length = 0;
      stage.retainedRecordCount = 0;
    }
  }
}

function lastAttemptDiagnosis(attempts, fallback = {}) {
  const lastAttempt = Array.isArray(attempts) && attempts.length > 0 ? attempts.at(-1) : null;
  if (!lastAttempt) {
    return {
      failureStage: fallback.failureStage ?? null,
      providerCode: fallback.providerCode ?? null,
      retryStopReason: fallback.retryStopReason ?? null,
      osErrorCode: fallback.osErrorCode ?? null,
      webEvidenceFailureCode: fallback.webEvidenceFailureCode ?? null,
      exitCode: null,
      signal: null,
      providerAdmissionLeaseMs: fallback.providerAdmissionLeaseMs ?? null
    };
  }
  return {
    failureStage: lastAttempt.failureStage ?? null,
    providerCode: lastAttempt.providerCode ?? null,
    retryStopReason: lastAttempt.retryStopReason ?? null,
    osErrorCode: lastAttempt.osErrorCode ?? null,
    webEvidenceFailureCode: lastAttempt.webEvidenceFailureCode ?? null,
    exitCode: lastAttempt.exitCode ?? null,
    signal: lastAttempt.signal ?? null,
    providerAdmissionLeaseMs: lastAttempt.providerAdmissionLeaseMs ?? null
  };
}

export function validateRunManifestRecord(value) {
  return executionSchemaV2.safeParse(value);
}

function normalizeRun(record) {
  if (record?.schemaVersion === 2) {
    const executionV2 = executionSchemaV2.safeParse(record);
    if (!executionV2.success) return null;
    const value = executionV2.data;
    const diagnosis = lastAttemptDiagnosis(value.attempts, value);
    const lastAttempt = Array.isArray(value.attempts) && value.attempts.length > 0 ? value.attempts.at(-1) : null;
    return {
      kind: "execution",
      identity: value.executionIdHash,
      recordedAt: value.recordedAt,
      fullHash: value.executionIdHash,
      profile: value.profile || null,
      role: null,
      backend: value.backend,
      modelHash: value.modelHash,
      mode: value.mode,
      outcomeStatus: value.outcomeStatus,
      failureClass: lastAttempt ? lastAttempt.failureClass : value.failureClass,
      failureStage: diagnosis.failureStage,
      providerCode: diagnosis.providerCode,
      retryStopReason: diagnosis.retryStopReason,
      osErrorCode: diagnosis.osErrorCode,
      webEvidenceFailureCode: diagnosis.webEvidenceFailureCode,
      exitCode: diagnosis.exitCode,
      signal: diagnosis.signal,
      ...(Number.isFinite(diagnosis.providerAdmissionLeaseMs) ? { providerAdmissionLeaseMs: diagnosis.providerAdmissionLeaseMs } : {}),
      ...(value.outputIntegrity ? { outputIntegrity: value.outputIntegrity } : {}),
      ...(value.taskCompletion ? { taskCompletion: value.taskCompletion } : {}),
      durationMs: value.usage.durationMs ?? null,
      reportedCostUsd: value.usage.totalCostUsd ?? null,
      cacheHit: value.cacheHit,
      retries: lastAttempt ? Math.max(0, value.attempts.length - 1) : value.retries,
      ...(value.reviewContract ? { reviewContract: value.reviewContract } : {})
    };
  }
  const execution = executionSchema.safeParse(record);
  if (execution.success) {
    const value = execution.data;
    return {
      kind: "execution",
      identity: value.executionIdHash,
      recordedAt: value.recordedAt,
      fullHash: value.executionIdHash,
      profile: value.profile || null,
      role: null,
      backend: value.backend,
      modelHash: value.modelHash,
      mode: value.mode,
      outcomeStatus: value.outcomeStatus,
      failureClass: value.failureClass,
      failureStage: null,
      providerCode: null,
      retryStopReason: null,
      osErrorCode: null,
      webEvidenceFailureCode: null,
      exitCode: null,
      signal: null,
      durationMs: value.usage.durationMs ?? null,
      reportedCostUsd: value.usage.totalCostUsd ?? null,
      cacheHit: value.cacheHit,
      retries: value.retries
    };
  }
  const legacy = legacySchema.safeParse(record);
  if (!legacy.success) return null;
  const value = legacy.data;
  return {
    kind: "legacy",
    identity: value.runIdHash,
    recordedAt: value.recordedAt,
    fullHash: value.runIdHash,
    profile: null,
    role: value.role,
    backend: "deepseek",
    modelHash: value.modelHash,
    mode: "not_applicable",
    outcomeStatus: value.outcomeStatus,
    failureClass: value.failureClass,
    failureStage: null,
    providerCode: null,
    retryStopReason: null,
    osErrorCode: null,
    webEvidenceFailureCode: null,
    exitCode: null,
    signal: null,
    durationMs: value.usage.durationMs ?? null,
    reportedCostUsd: value.usage.totalCostUsd ?? null,
    cacheHit: false,
    retries: Math.max(0, value.attempts.length - 1)
  };
}

function uniquePrefixes(hashes) {
  const result = new Map();
  for (const hash of hashes) {
    let length = 12;
    while (length < hash.length && hashes.some((candidate) => candidate !== hash && candidate.startsWith(hash.slice(0, length)))) length += 1;
    result.set(hash, hash.slice(0, length));
  }
  return result;
}

function modelDisplay(run, configuration) {
  const configuredModel = run.profile ? configuration.orchestration?.taskProfiles?.[run.profile]?.model : null;
  if (configuredModel && crypto.createHash("sha256").update(configuredModel).digest("hex") === run.modelHash) return configuredModel;
  return run.modelHash ? run.modelHash.slice(0, 12) : "unknown";
}

export function readRecentRuns(configuration, options = {}) {
  const days = options.days ?? 7;
  const limit = options.limit ?? 20;
  const maxFiles = options.maxFiles ?? 64;
  const maxBytes = options.maxBytes ?? 64 * 1024 * 1024;
  const now = options.now instanceof Date ? options.now : new Date();
  if (!Number.isInteger(days) || days < 1 || days > 45) throw new Error("days must be an integer between 1 and 45");
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new Error("limit must be an integer between 1 and 200");
  validateMetricReadLimit(maxFiles, "maxFiles", maximumRecentRunFiles);
  validateMetricReadLimit(maxBytes, "maxBytes", maximumRecentRunBytes);
  const metricsDirectory = options.metricsDirectory || path.join(configuration.statePaths.logs, "metrics");
  const selection = selectMetricFiles(metricsDirectory, { maxFiles, maxBytes });
  const periodStart = now.getTime() - days * 86400000;
  const runsByIdentity = new Map();
  const conflictingIdentities = new Set();
  const diagnostics = {
    bytesRead: 0,
    requestedBytes: 0,
    maximumReadRequestBytes: 0,
    maximumPendingRecordBytes: 0,
    processedRecordCount: 0,
    droppedRecordCount: 0,
    invalidRecordCount: 0,
    oversizedRecordCount: 0,
    partialRecordCount: 0,
    changedFileCount: 0,
    appendedFileCount: 0,
    readErrorCount: 0,
    truncated: selection.truncated
  };
  const routingFeedbackRecords = [];
  const directEditFeedbackRecords = [];
  for (const candidate of selection.files) {
    const stage = createMetricFileStage();
    const remainingBudget = maxBytes - diagnostics.bytesRead;
    readMetricFileSnapshot(candidate, selection, remainingBudget, stage, diagnostics, periodStart, now.getTime());
    for (const { run, serialized } of stage.runs) {
      const existing = runsByIdentity.get(run.identity);
      if (existing && existing.serialized !== serialized) {
        conflictingIdentities.add(run.identity);
        runsByIdentity.delete(run.identity);
      } else if (!existing && !conflictingIdentities.has(run.identity)) {
        runsByIdentity.set(run.identity, { run, serialized });
      }
    }
    routingFeedbackRecords.push(...stage.routingFeedback);
    directEditFeedbackRecords.push(...stage.directEditFeedback);
  }
  const selectedRuns = [...runsByIdentity.values()].map((entry) => entry.run)
    .sort((left, right) => Date.parse(right.recordedAt) - Date.parse(left.recordedAt))
    .slice(0, limit);
  const selectedExecutionHashes = new Set(selectedRuns.filter((run) => run.kind === "execution").map((run) => run.fullHash));
  const routingFeedback = new Map();
  const directEditFeedback = new Map();
  for (const record of routingFeedbackRecords) {
    if (!selectedExecutionHashes.has(record.executionIdHash)) continue;
    const existing = routingFeedback.get(record.executionIdHash);
    if (!existing || Date.parse(existing.recordedAt) < Date.parse(record.recordedAt)) routingFeedback.set(record.executionIdHash, record);
  }
  for (const record of directEditFeedbackRecords) {
    if (!selectedExecutionHashes.has(record.executionIdHash)) continue;
    const existing = directEditFeedback.get(record.executionIdHash);
    if (!existing || Date.parse(existing.recordedAt) < Date.parse(record.recordedAt)) directEditFeedback.set(record.executionIdHash, record);
  }
  const prefixes = uniquePrefixes(selectedRuns.map((run) => run.fullHash));
  return {
    sourceClass: "canonical_metrics",
    sourceStatus: selection.sourceStatus,
    selectedFileCount: selection.files.length,
    droppedFileCount: selection.droppedFileCount,
    scope: "structural_metadata_only",
    integrity: "best_effort_not_cryptographically_verified",
    truncated: diagnostics.truncated,
    conflictCount: conflictingIdentities.size,
    invalidRecordCount: diagnostics.invalidRecordCount,
    runCount: selectedRuns.length,
    snapshot: {
      status: selection.sourceStatus !== "available"
        ? "unavailable"
        : diagnostics.truncated || selection.droppedFileCount > 0 || diagnostics.readErrorCount > 0 || diagnostics.changedFileCount > 0 ? "partial" : "complete",
      bytesRead: diagnostics.bytesRead,
      requestedBytes: diagnostics.requestedBytes,
      maximumReadRequestBytes: diagnostics.maximumReadRequestBytes,
      maximumPendingRecordBytes: diagnostics.maximumPendingRecordBytes,
      processedRecordCount: diagnostics.processedRecordCount,
      droppedRecordCount: diagnostics.droppedRecordCount,
      oversizedRecordCount: diagnostics.oversizedRecordCount,
      partialRecordCount: diagnostics.partialRecordCount,
      changedFileCount: diagnostics.changedFileCount,
      appendedFileCount: diagnostics.appendedFileCount,
      readErrorCount: diagnostics.readErrorCount
    },
    runs: selectedRuns.map((run) => ({
      recordedAt: run.recordedAt,
      feedbackId: prefixes.get(run.fullHash),
      profile: run.profile,
      role: run.role,
      backend: run.backend,
      modelDisplay: modelDisplay(run, configuration),
      mode: run.mode,
      outcomeStatus: run.outcomeStatus,
      failureClass: run.failureClass,
      failureStage: run.failureStage,
      providerCode: run.providerCode,
      retryStopReason: run.retryStopReason,
      osErrorCode: run.osErrorCode,
      webEvidenceFailureCode: run.webEvidenceFailureCode,
      exitCode: run.exitCode,
      signal: run.signal,
      ...(Number.isFinite(run.providerAdmissionLeaseMs) ? { providerAdmissionLeaseMs: run.providerAdmissionLeaseMs } : {}),
      ...(run.outputIntegrity ? { outputIntegrity: run.outputIntegrity } : {}),
      ...(run.taskCompletion ? { taskCompletion: run.taskCompletion } : {}),
      durationMs: run.durationMs,
      reportedCostUsd: run.reportedCostUsd,
      cacheHit: run.cacheHit,
      retries: run.retries,
      ...(run.reviewContract ? { reviewContract: run.reviewContract } : {}),
      feedback: run.kind === "legacy" ? { routing: "not_applicable", directEdit: "not_applicable" } : {
        routing: routingFeedback.get(run.fullHash)?.outcome || "pending",
        directEdit: directEditFeedback.get(run.fullHash)?.outcome || "pending"
      }
    }))
  };
}

export function parseRecentRunsArguments(argumentsList) {
  const options = {};
  for (const argument of argumentsList) {
    const match = /^--(days|limit)=([0-9]+)$/.exec(argument);
    if (!match || match[1] in options) throw new Error("supported arguments are unique --days=N and --limit=N values");
    options[match[1]] = Number(match[2]);
  }
  return options;
}
