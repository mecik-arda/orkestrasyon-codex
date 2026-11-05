import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createAdapter } from "../subagent-bridge/src/adapters/agent-adapter-base.js";
import { createSuccessSubagentResult } from "../subagent-bridge/src/schemas/core-schemas.js";
import { createBridgeRuntime } from "../subagent-bridge/src/runtime/bridge-runtime.js";

function configuration(root) {
  return {
    allowedRoots: [root],
    statePaths: {
      logs: path.join(root, "logs"),
      state: path.join(root, "state"),
      cache: path.join(root, "cache")
    },
    observability: { maxMetricFileBytes: 1048576, maxMetricRetentionDays: 30 },
    reliability: {
      maxAttempts: 2,
      maxSchemaRepairAttempts: 1,
      baseRetryDelayMs: 1,
      maxRetryDelayMs: 2,
      maxTotalDurationMs: 60000,
      maxRetryCostUsd: 1,
      maxRetryCostReserveUsd: 0.1,
      maxUnknownAttemptCostUsd: 0.1
    },
    orchestration: {
      taskProfiles: {},
      scheduler: { maxQueuedPerWorkspace: 10, staleLockMs: 60000, leaseHeartbeatMs: 1000 },
      readOnlyCache: { enabled: false, ttlMs: 1000, maxEntryBytes: 1024 }
    },
    deepseek: {
      apiBaseUrl: "https://api.deepseek.com",
      apiModel: "deepseek-flash",
      pilotBudgetUsd: 1,
      priorUsageReservationUsd: 0.0000189,
      maxPromptBytes: 240000,
      maxOutputTokens: 2048,
      maxOutputBytes: 32768,
      timeoutMs: 30000,
      deniedRootPaths: []
    },
  };
}

function pilotInput() {
  return {
    taskId: "deepseek-edit-pilot-test",
    role: "implementer",
    model: "deepseek_flash",
    objective: "Update the selected file",
    files: ["src/value.txt"],
    contextFiles: [],
    acceptanceCriteria: ["Change the value"]
  };
}

test("DeepSeek yapılandırılmış edit pilotu yalnız disposable kopyayı değiştirir", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deepseek-edit-disposable-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sourcePath = path.join(root, "src", "value.txt");
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.writeFileSync(sourcePath, "before\n", "utf8");
  let executions = 0;
  const deepseek = createAdapter("deepseek", { canRead: true, canWrite: true, supportsSandbox: true, supportsModelSelection: true });
  deepseek.execute = async (request) => {
    executions += 1;
    assert.equal(request.mode, "edit");
    assert.equal(request.caller, "deepseek_edit_pilot");
    assert.equal(request.maxOutputBytes, 32768);
    return createSuccessSubagentResult("deepseek", "deepseek-flash", {
      result: JSON.stringify({ status: "completed", summary: "Value updated", changes: [{ path: "src/value.txt", content: "after\n" }] }),
      durationMs: 1,
      exitCode: 0,
      metrics: { totalCostUsd: 0.0001, reservedCostUsd: 0.0002, usage: { inputTokens: 10, outputTokens: 5 } }
    });
  };
  const runtime = createBridgeRuntime({ configuration: configuration(root), adapters: { deepseek }, sleep: async () => {} });
  const result = await runtime.runDeepSeekEditPilot(pilotInput(), root);
  assert.equal(result.status, "completed");
  assert.equal(result.resolvedModel, "deepseek-flash");
  assert.equal(result.preview, true);
  assert.equal(result.applied, false);
  assert.equal(result.cleanupCompleted, true);
  assert.deepEqual(result.filesChanged, ["src/value.txt"]);
  assert.match(result.diff, /\+after/);
  assert.equal(fs.readFileSync(sourcePath, "utf8"), "before\n");
  assert.equal(executions, 1);
  assert.deepEqual(fs.readdirSync(path.join(root, "cache", "deepseek-edit-pilot")), []);
});

test("DeepSeek structured edit pilot path traversal reddeder ve kaynak değişmez", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deepseek-edit-traversal-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sourcePath = path.join(root, "src", "value.txt");
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.writeFileSync(sourcePath, "before\n", "utf8");
  const deepseek = createAdapter("deepseek", { canRead: true, canWrite: true, supportsSandbox: true, supportsModelSelection: true });
  deepseek.execute = async () => createSuccessSubagentResult("deepseek", "deepseek-flash", {
    result: JSON.stringify({ status: "completed", summary: "Value updated", changes: [{ path: "../value.txt", content: "after\n" }] }),
    durationMs: 1,
    exitCode: 0,
    metrics: { totalCostUsd: 0.0001, reservedCostUsd: 0.0002, usage: { inputTokens: 10, outputTokens: 5 } }
  });
  const runtime = createBridgeRuntime({ configuration: configuration(root), adapters: { deepseek }, sleep: async () => {} });
  const result = await runtime.runDeepSeekEditPilot(pilotInput(), root);
  assert.equal(result.status, "failed");
  assert.equal(result.failureClass, "pilot_failed");
  assert.equal(result.cleanupCompleted, true);
  assert.equal(fs.readFileSync(sourcePath, "utf8"), "before\n");
  assert.deepEqual(fs.readdirSync(path.join(root, "cache", "deepseek-edit-pilot")), []);
});

test("DeepSeek edit isteği yapılandırılmış patch desteği olmadan fail-closed reddedilir", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deepseek-edit-api-disabled-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sourcePath = path.join(root, "src", "value.txt");
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.writeFileSync(sourcePath, "before\n", "utf8");
  const runtime = createBridgeRuntime({ configuration: configuration(root), adapters: {}, sleep: async () => {} });
  const result = await runtime.runDeepSeek({ ...pilotInput(), mode: "edit" }, root);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "mode_not_allowed");
  assert.equal(fs.readFileSync(sourcePath, "utf8"), "before\n");
});
