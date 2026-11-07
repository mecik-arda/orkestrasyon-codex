import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  appendRedactedRunMetric,
  listPendingDirectEditFeedback,
  listRoutingCandidates,
  listPendingRoutingFeedback,
  recordDirectEditDisposition,
  recordDirectEditFeedback,
  recordRoutingDisposition,
  recordRoutingFeedback
} from "../subagent-bridge/src/metrics.js";

function createState(context) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-feedback-identity-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return {
    root,
    configuration: {
      statePaths: { logs: root },
      observability: { maxMetricFileBytes: 65536 }
    }
  };
}

function executionRecord(label, mode = "read_only", extra = {}) {
  return {
    schemaVersion: 2,
    manifestVersion: 2,
    recordedAt: "2026-11-06T00:00:00.000Z",
    backend: "codex",
    modelHash: crypto.createHash("sha256").update("model").digest("hex"),
    requestedModelHash: crypto.createHash("sha256").update("model").digest("hex"),
    executionIdHash: crypto.createHash("sha256").update(label).digest("hex"),
    workspaceHash: crypto.createHash("sha256").update("workspace").digest("hex"),
    mode,
    profile: mode === "read_only" ? "analysis" : "implementation",
    outcomeStatus: "completed",
    failureClass: null,
    failureStage: null,
    providerCode: null,
    retryStopReason: null,
    usage: { durationMs: 100, totalCostUsd: 0.001 },
    attempts: [],
    retries: 0,
    queueWaitMs: 0,
    cacheHit: false,
    ...extra
  };
}

function appendRawMetric(configuration, fileName, record) {
  const metricsDirectory = path.join(configuration.statePaths.logs, "metrics");
  fs.mkdirSync(metricsDirectory, { recursive: true });
  fs.appendFileSync(path.join(metricsDirectory, fileName), `${JSON.stringify(record)}\n`, "utf8");
}

function metricBytes(configuration) {
  const metricsDirectory = path.join(configuration.statePaths.logs, "metrics");
  if (!fs.existsSync(metricsDirectory)) return new Map();
  return new Map(fs.readdirSync(metricsDirectory)
    .filter((entry) => entry.endsWith(".jsonl"))
    .map((entry) => [entry, fs.readFileSync(path.join(metricsDirectory, entry))]));
}

function metricsDirectory(configuration) {
  return path.join(configuration.statePaths.logs, "metrics");
}

function runBytes(configuration) {
  return new Map([...metricBytes(configuration)].filter(([name]) => !name.includes("feedback") && !name.includes("baseline")));
}

function recordCount(configuration, recordType) {
  return [...metricBytes(configuration)].flatMap(([, bytes]) => bytes.toString("utf8").split("\n").filter(Boolean))
    .map((line) => JSON.parse(line))
    .filter((record) => record.recordType === recordType).length;
}

test("aynı routing run satırının tekrarı tek adaydır ve tek disposition yazılır", async (context) => {
  const { configuration } = createState(context);
  const run = executionRecord("duplicate-routing");
  appendRawMetric(configuration, "codex-runs.jsonl", run);
  appendRawMetric(configuration, "codex-runs.jsonl", run);
  const candidates = listRoutingCandidates(configuration);
  assert.equal(candidates.length, 1);
  const result = await recordRoutingDisposition(configuration, run.executionIdHash, "eligible_real_user", "user_confirmed");
  assert.equal(result.recorded, true);
  assert.equal(result.feedbackId, run.executionIdHash.slice(0, 12));
  await recordRoutingFeedback(configuration, run.executionIdHash, "useful");
  assert.equal(fs.readFileSync(path.join(configuration.statePaths.logs, "metrics", "routing-evaluation-runs.jsonl"), "utf8")
    .split("\n").filter(Boolean).length, 2);
});

test("farklı dosyalardaki key sırası farklı duplicate aynı routing kimliğini korur", async (context) => {
  const { configuration } = createState(context);
  const run = executionRecord("duplicate-cross-file");
  appendRawMetric(configuration, "codex-runs.jsonl", run);
  appendRawMetric(configuration, "opencode-runs.jsonl", Object.fromEntries(Object.entries(run).reverse()));
  const candidates = listRoutingCandidates(configuration);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].feedbackId, run.executionIdHash.slice(0, 12));
  const result = await recordRoutingDisposition(configuration, run.executionIdHash, "eligible_real_user", "user_confirmed");
  assert.equal(result.recorded, true);
  assert.equal(recordCount(configuration, "routing_disposition"), 1);
});

test("aynı tam kimlikte completed ile failed veya farklı mode çakışınca yazım reddedilir", async (context) => {
  for (const [suffix, conflictingFields] of [
    ["outcome", { outcomeStatus: "failed" }],
    ["mode", { mode: "edit" }],
    ["profile", { profile: "different_profile" }]
  ]) {
    const { configuration } = createState(context);
    const run = executionRecord(`conflict-${suffix}`);
    appendRawMetric(configuration, "codex-runs.jsonl", run);
    appendRawMetric(configuration, "other-runs.jsonl", { ...run, ...conflictingFields });
    const before = runBytes(configuration);
    await assert.rejects(
      () => recordRoutingDisposition(configuration, run.executionIdHash, "eligible_real_user", "user_confirmed"),
      /conflicting identities/
    );
    assert.deepEqual(runBytes(configuration), before);
    assert.equal(recordCount(configuration, "routing_disposition"), 0);
  }
});

test("çelişen direct-edit execution kayıtları disposition ve feedback yazımını reddeder", async (context) => {
  const { configuration } = createState(context);
  const run = executionRecord("conflicting-direct-edit", "edit");
  appendRawMetric(configuration, "codex-runs.jsonl", run);
  appendRawMetric(configuration, "other-runs.jsonl", { ...run, outcomeStatus: "failed" });
  const before = runBytes(configuration);
  assert.throws(() => listPendingDirectEditFeedback(configuration), /conflicting identities/);
  await assert.rejects(
    () => recordDirectEditDisposition(configuration, run.executionIdHash, "eligible_real_user", "user_confirmed"),
    /conflicting identities/
  );
  await assert.rejects(() => recordDirectEditFeedback(configuration, run.executionIdHash, "accepted"), /conflicting identities/);
  assert.deepEqual(runBytes(configuration), before);
  assert.equal(recordCount(configuration, "direct_edit_disposition"), 0);
  assert.equal(recordCount(configuration, "direct_edit_feedback"), 0);
});

test("çakışan kısa prefix listede uzar, belirsiz kısa seçim reddedilir ve tam hash doğru executionı seçer", async (context) => {
  const { configuration } = createState(context);
  const prefix = "a".repeat(12);
  const first = executionRecord("prefix-first", "read_only", { executionIdHash: `${prefix}0${"1".repeat(51)}` });
  const second = executionRecord("prefix-second", "read_only", { executionIdHash: `${prefix}f${"2".repeat(51)}` });
  appendRawMetric(configuration, "codex-runs.jsonl", first);
  appendRawMetric(configuration, "other-runs.jsonl", second);
  const candidates = listRoutingCandidates(configuration);
  assert.equal(candidates.length, 2);
  assert.ok(candidates.every((candidate) => candidate.feedbackId.length === 13));
  assert.notEqual(candidates[0].feedbackId, candidates[1].feedbackId);
  const before = runBytes(configuration);
  await assert.rejects(
    () => recordRoutingDisposition(configuration, prefix, "eligible_real_user", "user_confirmed"),
    /ambiguous/
  );
  assert.deepEqual(runBytes(configuration), before);
  await recordRoutingDisposition(configuration, second.executionIdHash, "eligible_real_user", "user_confirmed");
  const dispositions = fs.readFileSync(path.join(metricsDirectory(configuration), "routing-evaluation-runs.jsonl"), "utf8");
  assert.match(dispositions, new RegExp(second.executionIdHash));
  assert.doesNotMatch(dispositions, new RegExp(first.executionIdHash));
});

test("listeleme sonrasında eklenen prefix çakışması eski kısa ID ile yazımı engeller", async (context) => {
  const { configuration } = createState(context);
  const prefix = "b".repeat(12);
  const first = executionRecord("prefix-late-first", "read_only", { executionIdHash: `${prefix}0${"3".repeat(51)}` });
  appendRawMetric(configuration, "codex-runs.jsonl", first);
  const listedId = listRoutingCandidates(configuration)[0].feedbackId;
  assert.equal(listedId, prefix);
  const second = executionRecord("prefix-late-second", "read_only", { executionIdHash: `${prefix}f${"4".repeat(51)}` });
  appendRawMetric(configuration, "other-runs.jsonl", second);
  const before = runBytes(configuration);
  await assert.rejects(
    () => recordRoutingDisposition(configuration, listedId, "eligible_real_user", "user_confirmed"),
    /ambiguous/
  );
  assert.deepEqual(runBytes(configuration), before);
  assert.equal(recordCount(configuration, "routing_disposition"), 0);
});

test("routing feedback duplicate run ve mevcut disposition ile tek kez yazılır", async (context) => {
  const { configuration } = createState(context);
  const run = executionRecord("routing-existing-disposition");
  appendRawMetric(configuration, "codex-runs.jsonl", run);
  const feedbackId = listRoutingCandidates(configuration)[0].feedbackId;
  await recordRoutingDisposition(configuration, feedbackId, "eligible_real_user", "user_confirmed");
  appendRawMetric(configuration, "other-runs.jsonl", Object.fromEntries(Object.entries(run).reverse()));
  assert.equal(listRoutingCandidates(configuration).length, 0);
  assert.equal(listPendingRoutingFeedback(configuration).length, 1);
  await recordRoutingFeedback(configuration, feedbackId, "useful");
  await assert.rejects(() => recordRoutingFeedback(configuration, feedbackId, "partial"), /already recorded/);
  assert.equal(recordCount(configuration, "routing_feedback"), 1);
});

test("direct-edit duplicate kimlik tek adaydır ve mevcut eligibility kuralları korunur", async (context) => {
  const { configuration } = createState(context);
  const run = executionRecord("direct-edit-duplicate", "edit");
  appendRawMetric(configuration, "codex-runs.jsonl", run);
  appendRawMetric(configuration, "other-runs.jsonl", run);
  assert.equal(listPendingDirectEditFeedback(configuration).length, 1);
  await recordDirectEditDisposition(configuration, run.executionIdHash, "eligible_real_user", "user_confirmed");
  await recordDirectEditFeedback(configuration, run.executionIdHash, "accepted");
  await assert.rejects(() => recordDirectEditFeedback(configuration, run.executionIdHash, "minor_fix"), /already recorded/);
  assert.equal(recordCount(configuration, "direct_edit_disposition"), 1);
  assert.equal(recordCount(configuration, "direct_edit_feedback"), 1);
});

test("çelişen dispositionlar dosya sırasına göre eligibility vermez", async (context) => {
  const { configuration } = createState(context);
  const run = executionRecord("conflicting-disposition");
  appendRawMetric(configuration, "codex-runs.jsonl", run);
  const base = {
    recordType: "routing_disposition",
    recordedAt: "2026-11-06T00:01:00.000Z",
    backend: "routing-evaluation",
    executionIdHash: run.executionIdHash,
    disposition: "eligible_real_user",
    reason: "user_confirmed"
  };
  appendRawMetric(configuration, "routing-evaluation-runs.jsonl", base);
  appendRawMetric(configuration, "other-runs.jsonl", { ...base, disposition: "ineligible_synthetic", reason: "fixture_run" });
  const before = runBytes(configuration);
  assert.throws(() => listPendingRoutingFeedback(configuration), /conflicting identities/);
  await assert.rejects(() => recordRoutingFeedback(configuration, run.executionIdHash, "useful"), /conflicting identities/);
  assert.deepEqual(runBytes(configuration), before);
  assert.equal(recordCount(configuration, "routing_feedback"), 0);
});

test("kısmi son satır kaynak bütünlüğünü düşürür ve hiçbir feedback yazılmaz", async (context) => {
  const { configuration } = createState(context);
  const run = executionRecord("partial-source");
  const filePath = path.join(metricsDirectory(configuration), "codex-runs.jsonl");
  fs.mkdirSync(metricsDirectory(configuration), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(run)}`, "utf8");
  const before = runBytes(configuration);
  await assert.rejects(() => recordRoutingDisposition(configuration, run.executionIdHash, "eligible_real_user", "user_confirmed"), /incomplete or unsafe/);
  assert.deepEqual(runBytes(configuration), before);
  assert.equal(recordCount(configuration, "routing_disposition"), 0);
});

test("desteklenmeyen kayıt türü varmış gibi tek uygun eşleşme üretmez", async (context) => {
  const { configuration } = createState(context);
  const run = executionRecord("unsupported-source-record");
  appendRawMetric(configuration, "codex-runs.jsonl", run);
  appendRawMetric(configuration, "future-records.jsonl", {
    recordType: "future_execution_identity",
    executionIdHash: run.executionIdHash,
    state: "unknown"
  });
  const before = runBytes(configuration);
  await assert.rejects(
    () => recordRoutingDisposition(configuration, run.executionIdHash, "eligible_real_user", "user_confirmed"),
    /incomplete or unsafe/
  );
  assert.deepEqual(runBytes(configuration), before);
  assert.equal(recordCount(configuration, "routing_disposition"), 0);
});

test("geri bildirim kaynağının dosya adedi, aggregate byte, record boyutu ve record adedi limitleri aşılınca reddedilir", async (context) => {
  const fileLimitState = createState(context);
  const fileLimitDirectory = metricsDirectory(fileLimitState.configuration);
  fs.mkdirSync(fileLimitDirectory, { recursive: true });
  for (let index = 0; index < 65; index += 1) fs.writeFileSync(path.join(fileLimitDirectory, `source-${index}.jsonl`), "", "utf8");
  assert.throws(() => listRoutingCandidates(fileLimitState.configuration), /incomplete or unsafe/);

  const byteLimitState = createState(context);
  const byteLimitDirectory = metricsDirectory(byteLimitState.configuration);
  fs.mkdirSync(byteLimitDirectory, { recursive: true });
  fs.closeSync(fs.openSync(path.join(byteLimitDirectory, "oversized.jsonl"), "w"));
  fs.truncateSync(path.join(byteLimitDirectory, "oversized.jsonl"), 64 * 1024 * 1024 + 1);
  assert.throws(() => listRoutingCandidates(byteLimitState.configuration), /incomplete or unsafe/);

  const lineLimitState = createState(context);
  const lineLimitDirectory = metricsDirectory(lineLimitState.configuration);
  fs.mkdirSync(lineLimitDirectory, { recursive: true });
  fs.writeFileSync(path.join(lineLimitDirectory, "oversized-line.jsonl"), `${"x".repeat(256 * 1024 + 1)}\n`, "utf8");
  assert.throws(() => listRoutingCandidates(lineLimitState.configuration), /incomplete or unsafe/);

  const recordLimitState = createState(context);
  const recordLimitDirectory = metricsDirectory(recordLimitState.configuration);
  fs.mkdirSync(recordLimitDirectory, { recursive: true });
  const repeated = {
    recordedAt: "2026-11-06T00:00:00.000Z",
    backend: "codex",
    executionIdHash: crypto.createHash("sha256").update("same-record").digest("hex"),
    mode: "read_only",
    profile: "analysis",
    outcomeStatus: "completed"
  };
  fs.writeFileSync(path.join(recordLimitDirectory, "many-records.jsonl"), `${JSON.stringify(repeated)}\n`.repeat(100001), "utf8");
  assert.throws(() => listRoutingCandidates(recordLimitState.configuration), /incomplete or unsafe/);

  const identityLimitState = createState(context);
  const identityLimitDirectory = metricsDirectory(identityLimitState.configuration);
  fs.mkdirSync(identityLimitDirectory, { recursive: true });
  const identityRecords = [];
  for (let index = 1; index <= 50001; index += 1) {
    identityRecords.push(JSON.stringify({ ...repeated, executionIdHash: index.toString(16).padStart(64, "0") }));
  }
  fs.writeFileSync(path.join(identityLimitDirectory, "many-identities.jsonl"), `${identityRecords.join("\n")}\n`, "utf8");
  assert.throws(() => listRoutingCandidates(identityLimitState.configuration), /incomplete or unsafe/);
});

test("okuma hatası, byte limiti ve kaynak değişimi fail-closed olup geri bildirim eklemez", async (context) => {
  const unreadableState = createState(context);
  const unreadableRun = executionRecord("unreadable-source");
  appendRawMetric(unreadableState.configuration, "codex-runs.jsonl", unreadableRun);
  const unreadablePath = path.join(metricsDirectory(unreadableState.configuration), "codex-runs.jsonl");
  const originalOpen = fs.openSync;
  fs.openSync = (filePath, ...argumentsList) => {
    if (path.resolve(String(filePath)) === unreadablePath) {
      const error = new Error("synthetic read denial");
      error.code = "EACCES";
      throw error;
    }
    return originalOpen(filePath, ...argumentsList);
  };
  try {
    await assert.rejects(() => recordRoutingDisposition(unreadableState.configuration, unreadableRun.executionIdHash, "eligible_real_user", "user_confirmed"), /incomplete or unsafe/);
  } finally {
    fs.openSync = originalOpen;
  }
  assert.equal(recordCount(unreadableState.configuration, "routing_disposition"), 0);

  const mutationState = createState(context);
  const mutationRun = executionRecord("mutated-source");
  appendRawMetric(mutationState.configuration, "codex-runs.jsonl", mutationRun);
  const mutationPath = path.join(metricsDirectory(mutationState.configuration), "codex-runs.jsonl");
  const originalRead = fs.readSync;
  let mutated = false;
  fs.readSync = (...argumentsList) => {
    const result = originalRead(...argumentsList);
    if (!mutated && result > 0) {
      mutated = true;
      fs.appendFileSync(mutationPath, "\n");
    }
    return result;
  };
  try {
    await assert.rejects(() => recordRoutingDisposition(mutationState.configuration, mutationRun.executionIdHash, "eligible_real_user", "user_confirmed"), /incomplete or unsafe/);
  } finally {
    fs.readSync = originalRead;
  }
  assert.equal(mutated, true);
  assert.equal(recordCount(mutationState.configuration, "routing_disposition"), 0);
});

test("hard-link ile paylaşılan geri bildirim kaynağı fail-closed reddedilir", { skip: process.platform === "win32" }, async (context) => {
  const { configuration } = createState(context);
  const run = executionRecord("hard-linked-source");
  appendRawMetric(configuration, "codex-runs.jsonl", run);
  const sourcePath = path.join(metricsDirectory(configuration), "codex-runs.jsonl");
  const aliasPath = path.join(metricsDirectory(configuration), "alias-runs.jsonl");
  fs.linkSync(sourcePath, aliasPath);
  const before = runBytes(configuration);
  assert.throws(() => listRoutingCandidates(configuration), /incomplete or unsafe/);
  await assert.rejects(
    () => recordRoutingDisposition(configuration, run.executionIdHash, "eligible_real_user", "user_confirmed"),
    /incomplete or unsafe/
  );
  assert.deepEqual(runBytes(configuration), before);
  assert.equal(recordCount(configuration, "routing_disposition"), 0);
});

test("aynı execution için eşzamanlı disposition yazımı en fazla bir kez başarılı olur", async (context) => {
  const { configuration } = createState(context);
  const run = executionRecord("concurrent-feedback");
  appendRawMetric(configuration, "codex-runs.jsonl", run);
  const results = await Promise.allSettled([
    recordRoutingDisposition(configuration, run.executionIdHash, "eligible_real_user", "user_confirmed"),
    recordRoutingDisposition(configuration, run.executionIdHash, "ineligible_synthetic", "fixture_run")
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(recordCount(configuration, "routing_disposition"), 1);
});

test("kaynak okuma hatası ayrıntısı metrik yolu veya içerik sızdırmaz", async (context) => {
  const { configuration } = createState(context);
  const pathMarker = "private-metric-path-marker";
  const filePath = path.join(metricsDirectory(configuration), "codex-runs.jsonl");
  fs.mkdirSync(metricsDirectory(configuration), { recursive: true });
  fs.writeFileSync(filePath, `private-content-marker {"broken":\n`, "utf8");
  assert.throws(() => listRoutingCandidates(configuration), (error) => {
    assert.equal(error.message, "feedback source is incomplete or unsafe");
    assert.equal(error.message.includes(pathMarker), false);
    assert.equal(error.message.includes("private-content-marker"), false);
    return true;
  });
});
