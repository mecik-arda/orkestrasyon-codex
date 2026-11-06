import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { readRecentRuns } from "../subagent-bridge/src/recent-runs.js";

const metricChunkBytes = 16 * 1024;
const maximumRecordBytes = 256 * 1024;
const fixedNow = new Date("2026-11-06T12:00:00.000Z");

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function createFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "recent-runs-bounded-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const config = {
    statePaths: { logs: path.join(root, "logs") },
    orchestration: { taskProfiles: { review: { model: "gpt-test" } } }
  };
  const directory = path.join(config.statePaths.logs, "metrics");
  fs.mkdirSync(directory, { recursive: true });
  const filePath = path.join(directory, "codex-runs.jsonl");
  return { config, directory, filePath };
}

function executionRecord(overrides = {}) {
  return {
    recordedAt: fixedNow.toISOString(),
    backend: "codex",
    modelHash: hash("gpt-test"),
    executionIdHash: hash("execution"),
    workspaceHash: hash("workspace"),
    mode: "read_only",
    profile: "review",
    outcomeStatus: "completed",
    failureClass: null,
    usage: { durationMs: 12, totalCostUsd: 0 },
    attempts: [{ number: 1, failureClass: null, exitCode: 0, durationMs: 12, totalCostUsd: 0, retryDelayMs: null }],
    retries: 0,
    queueWaitMs: 0,
    cacheHit: false,
    ...overrides
  };
}

function writeRecord(filePath, record, ending = "\n") {
  fs.writeFileSync(filePath, `${JSON.stringify(record)}${ending}`, "utf8");
}

function feedbackRecord(recordType, executionIdHash, recordedAt, outcome) {
  const routing = recordType === "routing_feedback";
  return {
    recordType,
    recordedAt,
    backend: routing ? "routing-evaluation" : "direct-edit-baseline",
    executionIdHash,
    outcome
  };
}

function writeUniqueRoutingFeedback(filePath, count, offset = 0) {
  const descriptor = fs.openSync(filePath, "w");
  try {
    const batchSize = 512;
    for (let batchStart = 0; batchStart < count; batchStart += batchSize) {
      const batchEnd = Math.min(count, batchStart + batchSize);
      const lines = [];
      for (let index = batchStart; index < batchEnd; index += 1) {
        lines.push(JSON.stringify(feedbackRecord(
          "routing_feedback",
          hash(`bounded-execution-${offset + index}`),
          fixedNow.toISOString(),
          "useful"
        )));
      }
      fs.writeSync(descriptor, `${lines.join("\n")}\n`, null, "utf8");
    }
  } finally {
    fs.closeSync(descriptor);
  }
  return fs.statSync(filePath).size;
}

function read(config, options = {}) {
  return readRecentRuns(config, { now: fixedNow, ...options });
}

function withReadSyncReplacement(replacement, action) {
  const original = fs.readSync;
  fs.readSync = replacement(original);
  try {
    return action();
  } finally {
    fs.readSync = original;
  }
}

function withOpenSyncReplacement(replacement, action) {
  const original = fs.openSync;
  fs.openSync = replacement(original);
  try {
    return action();
  } finally {
    fs.openSync = original;
  }
}

test("RRB-01: descriptor read grows within the cap and excludes later appended bytes", (t) => {
  const { config, filePath } = createFixture(t);
  writeRecord(filePath, executionRecord());
  const initialSize = fs.statSync(filePath).size;
  let appended = false;
  const result = withReadSyncReplacement((original) => (descriptor, buffer, offset, length, position) => {
    if (!appended) {
      appended = true;
      fs.appendFileSync(filePath, `${"x".repeat(128 * 1024)}\n`);
    }
    return original(descriptor, buffer, offset, length, position);
  }, () => read(config, { maxBytes: initialSize }));
  assert.equal(result.runCount, 1);
  assert.equal(result.snapshot.bytesRead, initialSize);
  assert.equal(result.snapshot.requestedBytes, initialSize);
  assert.equal(result.snapshot.appendedFileCount, 1);
  assert.equal(result.snapshot.status, "partial");
  assert.equal(result.truncated, true);
  assert.ok(result.snapshot.maximumReadRequestBytes <= metricChunkBytes);
  assert.ok(result.snapshot.bytesRead <= initialSize);
  assert.equal(JSON.stringify(result).includes("x".repeat(32)), false);
});

test("RRB-02: exact and tiny budgets bound actual reads and aggregate file selection", (t) => {
  const { config, directory, filePath } = createFixture(t);
  writeRecord(filePath, executionRecord());
  const exactSize = fs.statSync(filePath).size;
  const exact = read(config, { maxBytes: exactSize });
  assert.equal(exact.snapshot.bytesRead, exactSize);
  assert.equal(exact.snapshot.status, "complete");
  assert.equal(exact.truncated, false);
  const tiny = read(config, { maxBytes: 1 });
  assert.equal(tiny.snapshot.bytesRead, 0);
  assert.equal(tiny.snapshot.requestedBytes, 0);
  assert.equal(tiny.truncated, true);
  const secondPath = path.join(directory, "codex-runs-older.jsonl");
  writeRecord(secondPath, executionRecord({ executionIdHash: hash("older") }));
  fs.utimesSync(filePath, new Date("2026-11-06T11:00:00.000Z"), new Date("2026-11-06T11:00:00.000Z"));
  fs.utimesSync(secondPath, new Date("2026-11-06T10:00:00.000Z"), new Date("2026-11-06T10:00:00.000Z"));
  const firstFileSize = fs.statSync(filePath).size;
  const aggregate = read(config, { maxBytes: firstFileSize });
  assert.equal(aggregate.selectedFileCount, 1);
  assert.equal(aggregate.snapshot.bytesRead, firstFileSize);
  assert.equal(aggregate.truncated, true);
});

test("RRB-03: oversized records are discarded once and later records remain readable", (t) => {
  const { config, filePath } = createFixture(t);
  const valid = JSON.stringify(executionRecord());
  fs.writeFileSync(filePath, `${"z".repeat(maximumRecordBytes + metricChunkBytes)}\n${valid}\n`, "utf8");
  const result = read(config);
  assert.equal(result.runCount, 1);
  assert.equal(result.snapshot.oversizedRecordCount, 1);
  assert.equal(result.snapshot.droppedRecordCount, 1);
  assert.equal(result.invalidRecordCount, 1);
  assert.equal(result.truncated, true);
  assert.ok(result.snapshot.maximumPendingRecordBytes <= maximumRecordBytes);
  assert.ok(result.snapshot.requestedBytes <= 64 * 1024 * 1024);
});

test("RRB-03a: record exactly at the line limit is processed", (t) => {
  const { config, filePath } = createFixture(t);
  const propertyPrefix = "{\"ignored\":\"";
  const propertySuffix = "\"}";
  const exactLine = `${propertyPrefix}${"a".repeat(maximumRecordBytes - Buffer.byteLength(propertyPrefix) - Buffer.byteLength(propertySuffix))}${propertySuffix}`;
  assert.equal(Buffer.byteLength(exactLine), maximumRecordBytes);
  fs.writeFileSync(filePath, `${exactLine}\n`, "utf8");
  const result = read(config);
  assert.equal(result.snapshot.processedRecordCount, 1);
  assert.equal(result.snapshot.oversizedRecordCount, 0);
  assert.equal(result.invalidRecordCount, 0);
  assert.equal(result.snapshot.maximumPendingRecordBytes, maximumRecordBytes);
});

test("RRB-03b: oversized newline-free data is counted and discarded once", (t) => {
  const { config, filePath } = createFixture(t);
  const body = Buffer.from("q".repeat(maximumRecordBytes + metricChunkBytes * 4));
  fs.writeFileSync(filePath, body);
  const result = read(config);
  assert.equal(result.runCount, 0);
  assert.equal(result.snapshot.bytesRead, body.length);
  assert.equal(result.snapshot.oversizedRecordCount, 1);
  assert.equal(result.snapshot.partialRecordCount, 0);
  assert.equal(result.snapshot.droppedRecordCount, 1);
  assert.equal(result.truncated, true);
  assert.ok(result.snapshot.maximumPendingRecordBytes <= maximumRecordBytes);
});

test("RRB-04: partial final JSONL record is distinguished from malformed input", (t) => {
  const { config, filePath } = createFixture(t);
  const valid = JSON.stringify(executionRecord());
  fs.writeFileSync(filePath, `${valid}\n{"recordedAt":"unfinished`, "utf8");
  const result = read(config);
  assert.equal(result.runCount, 1);
  assert.equal(result.invalidRecordCount, 0);
  assert.equal(result.snapshot.partialRecordCount, 1);
  assert.equal(result.snapshot.droppedRecordCount, 1);
  assert.equal(result.truncated, true);
});

test("RRB-05: UTF-8 split at a read boundary and CRLF records are framed", (t) => {
  const { config, filePath } = createFixture(t);
  const recordPrefix = "{\"value\":\"";
  const padding = " ".repeat(metricChunkBytes - Buffer.byteLength(recordPrefix) - 1);
  fs.writeFileSync(filePath, `${padding}${recordPrefix}Ж"}\r\n${JSON.stringify(executionRecord())}\r\n`, "utf8");
  const result = read(config);
  assert.equal(result.runCount, 1);
  assert.equal(result.snapshot.processedRecordCount, 2);
  assert.equal(result.invalidRecordCount, 0);
  assert.equal(result.snapshot.partialRecordCount, 0);
  assert.ok(result.snapshot.maximumReadRequestBytes <= metricChunkBytes);
});

test("RRB-06: truncation during descriptor read discards staged records and closes the descriptor", (t) => {
  const { config, filePath } = createFixture(t);
  writeRecord(filePath, executionRecord());
  let truncated = false;
  let closed = 0;
  const originalClose = fs.closeSync;
  fs.closeSync = (...argumentsList) => {
    closed += 1;
    return originalClose(...argumentsList);
  };
  try {
    const result = withReadSyncReplacement((original) => (descriptor, buffer, offset, length, position) => {
      if (!truncated) {
        truncated = true;
        fs.ftruncateSync(descriptor, 0);
      }
      return original(descriptor, buffer, offset, length, position);
    }, () => read(config));
    assert.equal(result.runCount, 0);
    assert.equal(result.snapshot.changedFileCount, 1);
    assert.equal(result.snapshot.status, "partial");
    assert.equal(result.truncated, true);
    assert.equal(closed, 1);
  } finally {
    fs.closeSync = originalClose;
  }
});

test("RRB-06a: descriptor read errors are redacted and descriptors are closed", (t) => {
  const { config, filePath } = createFixture(t);
  writeRecord(filePath, executionRecord());
  const originalClose = fs.closeSync;
  const originalRead = fs.readSync;
  let closeCount = 0;
  fs.closeSync = (...argumentsList) => {
    closeCount += 1;
    return originalClose(...argumentsList);
  };
  fs.readSync = () => {
    const error = new Error("private path must not escape");
    error.code = "EIO";
    throw error;
  };
  try {
    const result = read(config);
    assert.equal(result.runCount, 0);
    assert.equal(result.snapshot.readErrorCount, 1);
    assert.equal(result.snapshot.changedFileCount, 1);
    assert.equal(result.snapshot.status, "partial");
    assert.equal(JSON.stringify(result).includes("private path"), false);
    assert.equal(closeCount, 1);
  } finally {
    fs.readSync = originalRead;
    fs.closeSync = originalClose;
  }
});

test("RRB-07: rotated, replaced, and deleted paths do not produce complete snapshots", (t) => {
  for (const operation of ["rotate", "replace", "delete"]) {
    const { config, filePath } = createFixture(t);
    writeRecord(filePath, executionRecord());
    const original = fs.openSync;
    fs.openSync = (targetPath, flags, ...argumentsList) => {
      if (path.resolve(targetPath) === path.resolve(filePath)) {
        fs.openSync = original;
        if (operation === "rotate") {
          fs.renameSync(filePath, `${filePath}.rotated`);
          writeRecord(filePath, executionRecord({ executionIdHash: hash("rotated") }));
        } else if (operation === "replace") {
          const content = fs.readFileSync(filePath);
          fs.unlinkSync(filePath);
          fs.writeFileSync(filePath, content);
        } else {
          fs.unlinkSync(filePath);
        }
      }
      return original(targetPath, flags, ...argumentsList);
    };
    let result;
    try {
      result = read(config);
    } finally {
      fs.openSync = original;
    }
    assert.equal(result.runCount, 0, operation);
    assert.equal(result.snapshot.status, "partial", operation);
    assert.equal(result.truncated, true, operation);
    assert.equal(result.snapshot.changedFileCount, 1, operation);
  }
});

test("RRB-08: one-file snapshot keeps run and feedback from the same bounded read", (t) => {
  const { config, filePath } = createFixture(t);
  const run = executionRecord();
  const feedback = {
    recordType: "routing_feedback",
    recordedAt: fixedNow.toISOString(),
    backend: "routing-evaluation",
    executionIdHash: run.executionIdHash,
    outcome: "useful"
  };
  fs.writeFileSync(filePath, `${JSON.stringify(run)}\n${JSON.stringify(feedback)}\n`, "utf8");
  let readCalls = 0;
  const result = withReadSyncReplacement((original) => (...argumentsList) => {
    readCalls += 1;
    return original(...argumentsList);
  }, () => read(config));
  assert.equal(readCalls, 1);
  assert.equal(result.runCount, 1);
  assert.deepEqual(result.runs[0].feedback, { routing: "useful", directEdit: "pending" });
  assert.equal(result.snapshot.processedRecordCount, 2);
});

test("RRB-09: read limits reject non-integer, unsafe, negative, and oversized values", (t) => {
  const { config, filePath } = createFixture(t);
  for (const maxBytes of [NaN, Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, 64 * 1024 * 1024 + 1]) {
    assert.throws(() => read(config, { maxBytes }), /maxBytes must be a safe integer/);
  }
  for (const maxFiles of [NaN, Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, 65]) {
    assert.throws(() => read(config, { maxFiles }), /maxFiles must be a safe integer/);
  }
  assert.equal(read(config, { maxBytes: 0, maxFiles: 0 }).snapshot.status, "complete");
  writeRecord(filePath, executionRecord());
  const noFiles = read(config, { maxFiles: 0 });
  assert.equal(noFiles.snapshot.bytesRead, 0);
  assert.equal(noFiles.truncated, true);
});

test("RRB-10: repeated routing and direct-edit feedback stays bounded below the source byte cap", (t) => {
  const { config, directory, filePath } = createFixture(t);
  const run = executionRecord();
  const routingPath = path.join(directory, "routing-evaluation-runs.jsonl");
  const directEditPath = path.join(directory, "direct-edit-baseline-runs.jsonl");
  const routing = feedbackRecord("routing_feedback", run.executionIdHash, fixedNow.toISOString(), "useful");
  const directEdit = feedbackRecord("direct_edit_feedback", run.executionIdHash, fixedNow.toISOString(), "accepted");
  const recordCount = 140000;
  writeRecord(filePath, run);
  fs.writeFileSync(routingPath, `${JSON.stringify(routing)}\n`.repeat(recordCount), "utf8");
  fs.writeFileSync(directEditPath, `${JSON.stringify(directEdit)}\n`.repeat(recordCount), "utf8");
  const totalSourceBytes = fs.statSync(filePath).size + fs.statSync(routingPath).size + fs.statSync(directEditPath).size;
  assert.ok(fs.statSync(routingPath).size < 64 * 1024 * 1024);
  assert.ok(fs.statSync(directEditPath).size < 64 * 1024 * 1024);
  assert.ok(totalSourceBytes < 64 * 1024 * 1024);

  const result = read(config);

  assert.equal(result.runCount, 1);
  assert.equal(result.runs[0].feedback.routing, "useful");
  assert.equal(result.runs[0].feedback.directEdit, "accepted");
  assert.equal(result.snapshot.bytesRead, totalSourceBytes);
  assert.equal(result.snapshot.processedRecordCount, recordCount * 2 + 1);
  assert.equal(result.snapshot.retainedExecutionIdentityCount, 1);
  assert.equal(result.snapshot.maximumRetainedExecutionIdentities, 50000);
  assert.equal(result.snapshot.status, "complete");
  assert.equal(result.truncated, false);
});

test("RRB-11: per-file unique identity budget is exact below, at, and above its boundary", (t) => {
  const { config, directory } = createFixture(t);
  const feedbackPath = path.join(directory, "routing-evaluation-runs.jsonl");

  writeUniqueRoutingFeedback(feedbackPath, 49999);
  const below = read(config);
  assert.equal(below.snapshot.retainedExecutionIdentityCount, 49999);
  assert.equal(below.snapshot.status, "complete");
  assert.equal(below.truncated, false);

  writeUniqueRoutingFeedback(feedbackPath, 50000);
  const exact = read(config);
  assert.equal(exact.snapshot.retainedExecutionIdentityCount, 50000);
  assert.equal(exact.snapshot.status, "complete");
  assert.equal(exact.truncated, false);

  writeUniqueRoutingFeedback(feedbackPath, 50001);
  fs.appendFileSync(feedbackPath, "{}\n", "utf8");
  const above = read(config);
  assert.equal(above.snapshot.retainedExecutionIdentityCount, 0);
  assert.equal(above.snapshot.stateLimitExceededFileCount, 1);
  assert.equal(above.snapshot.stateLimitDroppedRecordCount, 50001);
  assert.equal(above.snapshot.stateLimitSkippedLineCount, 1);
  assert.equal(above.snapshot.status, "partial");
  assert.equal(above.truncated, true);
  assert.equal(above.runCount, 0);
});

test("RRB-12: aggregate identity budget drops an overflowing file as one stage", (t) => {
  const { config, directory } = createFixture(t);
  const firstPath = path.join(directory, "routing-evaluation-runs.jsonl");
  const secondPath = path.join(directory, "routing-evaluation-runs-older.jsonl");
  writeUniqueRoutingFeedback(firstPath, 25000);
  writeUniqueRoutingFeedback(secondPath, 25001, 25000);
  fs.utimesSync(firstPath, new Date("2026-11-06T11:00:00.000Z"), new Date("2026-11-06T11:00:00.000Z"));
  fs.utimesSync(secondPath, new Date("2026-11-06T10:00:00.000Z"), new Date("2026-11-06T10:00:00.000Z"));

  const result = read(config);

  assert.equal(result.selectedFileCount, 2);
  assert.equal(result.snapshot.retainedExecutionIdentityCount, 25000);
  assert.equal(result.snapshot.stateLimitExceededFileCount, 1);
  assert.equal(result.snapshot.stateLimitDroppedRecordCount, 25001);
  assert.equal(result.snapshot.droppedRecordCount, 25001);
  assert.equal(result.snapshot.status, "partial");
  assert.equal(result.truncated, true);
});

test("RRB-13: latest feedback wins while equal timestamps keep deterministic first-in-file order", (t) => {
  const { config, directory } = createFixture(t);
  const run = executionRecord();
  const routingPath = path.join(directory, "routing-evaluation-runs.jsonl");
  const directEditPath = path.join(directory, "direct-edit-baseline-runs.jsonl");
  writeRecord(path.join(directory, "codex-runs.jsonl"), run);
  fs.writeFileSync(routingPath, [
    feedbackRecord("routing_feedback", run.executionIdHash, "2026-11-06T10:00:00.000Z", "useful"),
    feedbackRecord("routing_feedback", run.executionIdHash, "2026-11-06T11:00:00.000Z", "partial"),
    feedbackRecord("routing_feedback", run.executionIdHash, "2026-11-06T11:00:00.000Z", "not_useful")
  ].map((record) => JSON.stringify(record)).join("\n") + "\n", "utf8");
  fs.writeFileSync(directEditPath, [
    feedbackRecord("direct_edit_feedback", run.executionIdHash, "2026-11-06T11:00:00.000Z", "minor_fix"),
    feedbackRecord("direct_edit_feedback", run.executionIdHash, "2026-11-06T10:00:00.000Z", "reverted")
  ].map((record) => JSON.stringify(record)).join("\n") + "\n", "utf8");

  const result = read(config);

  assert.equal(result.runs[0].feedback.routing, "partial");
  assert.equal(result.runs[0].feedback.directEdit, "minor_fix");
});

test("RRB-14: feedback before or after a run is joined by identity and never crosses the selected run", (t) => {
  const { config, directory } = createFixture(t);
  const selected = executionRecord({ executionIdHash: hash("selected"), recordedAt: "2026-11-06T11:50:00.000Z" });
  const unselected = executionRecord({ executionIdHash: hash("unselected"), recordedAt: "2026-11-06T11:30:00.000Z" });
  const routingPath = path.join(directory, "routing-evaluation-runs.jsonl");
  const directEditPath = path.join(directory, "direct-edit-baseline-runs.jsonl");
  fs.writeFileSync(routingPath, `${JSON.stringify(feedbackRecord("routing_feedback", unselected.executionIdHash, "2026-11-06T11:40:00.000Z", "useful"))}\n`, "utf8");
  writeRecord(path.join(directory, "codex-runs.jsonl"), selected);
  writeRecord(path.join(directory, "codex-runs-older.jsonl"), unselected);
  fs.writeFileSync(directEditPath, `${JSON.stringify(feedbackRecord("direct_edit_feedback", unselected.executionIdHash, "2026-11-06T11:45:00.000Z", "accepted"))}\n`, "utf8");
  fs.utimesSync(routingPath, new Date("2026-11-06T11:00:00.000Z"), new Date("2026-11-06T11:00:00.000Z"));
  fs.utimesSync(path.join(directory, "codex-runs.jsonl"), new Date("2026-11-06T10:00:00.000Z"), new Date("2026-11-06T10:00:00.000Z"));
  fs.utimesSync(directEditPath, new Date("2026-11-06T09:00:00.000Z"), new Date("2026-11-06T09:00:00.000Z"));
  fs.utimesSync(path.join(directory, "codex-runs-older.jsonl"), new Date("2026-11-06T08:00:00.000Z"), new Date("2026-11-06T08:00:00.000Z"));

  const result = read(config, { limit: 1 });

  assert.equal(result.runCount, 1);
  assert.equal(result.runs[0].recordedAt, selected.recordedAt);
  assert.deepEqual(result.runs[0].feedback, { routing: "pending", directEdit: "pending" });
});

test("RRB-15: changed file cannot leak staged feedback or run conflicts into a valid file result", (t) => {
  const { config, directory } = createFixture(t);
  const validRunPath = path.join(directory, "codex-runs.jsonl");
  const changedFilePath = path.join(directory, "routing-evaluation-runs.jsonl");
  const validRun = executionRecord();
  writeRecord(validRunPath, validRun);
  fs.writeFileSync(changedFilePath, [
    JSON.stringify({ ...validRun, outcomeStatus: "failed", failureClass: "process_exit" }),
    JSON.stringify(feedbackRecord("routing_feedback", validRun.executionIdHash, "2026-11-06T11:59:00.000Z", "not_useful"))
  ].join("\n") + "\n", "utf8");
  fs.utimesSync(validRunPath, new Date("2026-11-06T11:00:00.000Z"), new Date("2026-11-06T11:00:00.000Z"));
  fs.utimesSync(changedFilePath, new Date("2026-11-06T10:00:00.000Z"), new Date("2026-11-06T10:00:00.000Z"));
  const originalOpen = fs.openSync;
  const originalRead = fs.readSync;
  let changedFileDescriptor = null;
  let truncated = false;
  fs.openSync = (targetPath, ...argumentsList) => {
    const descriptor = originalOpen(targetPath, ...argumentsList);
    if (path.resolve(String(targetPath)) === changedFilePath) changedFileDescriptor = descriptor;
    return descriptor;
  };
  fs.readSync = (descriptor, ...argumentsList) => {
    const bytesRead = originalRead(descriptor, ...argumentsList);
    if (descriptor === changedFileDescriptor && !truncated && bytesRead > 0) {
      truncated = true;
      fs.ftruncateSync(descriptor, 0);
    }
    return bytesRead;
  };
  let result;
  try {
    result = read(config);
  } finally {
    fs.openSync = originalOpen;
    fs.readSync = originalRead;
  }

  assert.equal(truncated, true);
  assert.equal(result.runCount, 1);
  assert.equal(result.conflictCount, 0);
  assert.equal(result.runs[0].outcomeStatus, "completed");
  assert.equal(result.runs[0].feedback.routing, "pending");
  assert.equal(result.snapshot.changedFileCount, 1);
  assert.equal(result.snapshot.status, "partial");
  assert.equal(result.truncated, true);
});

test("RRB-16: identical runs remain harmless and feedback for a conflicting identity is not joined", (t) => {
  const { config, filePath } = createFixture(t);
  const visibleRun = executionRecord({ executionIdHash: hash("visible") });
  const conflictingRun = executionRecord({ executionIdHash: hash("conflicting") });
  const differentRun = { ...conflictingRun, outcomeStatus: "failed", failureClass: "process_exit" };
  const records = [
    visibleRun,
    visibleRun,
    conflictingRun,
    differentRun,
    feedbackRecord("routing_feedback", conflictingRun.executionIdHash, fixedNow.toISOString(), "useful"),
    feedbackRecord("direct_edit_feedback", conflictingRun.executionIdHash, fixedNow.toISOString(), "accepted")
  ];
  fs.writeFileSync(filePath, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`, "utf8");

  const result = read(config);

  assert.equal(result.conflictCount, 1);
  assert.equal(result.runCount, 1);
  assert.equal(result.runs[0].feedback.routing, "pending");
  assert.equal(result.runs[0].feedback.directEdit, "pending");
});
