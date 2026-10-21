import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createAdapter } from "../subagent-bridge/src/adapters/agent-adapter-base.js";
import { createBridgeRuntime } from "../subagent-bridge/src/runtime/bridge-runtime.js";
import { createSuccessSubagentResult } from "../subagent-bridge/src/schemas/core-schemas.js";

function configuration(root) {
  return {
    allowedRoots: [root],
    statePaths: { logs: path.join(root, "logs"), state: path.join(root, "state"), cache: path.join(root, "cache") },
    observability: { maxMetricFileBytes: 1048576, maxMetricRetentionDays: 30 },
    reliability: { maxAttempts: 2, maxSchemaRepairAttempts: 0, baseRetryDelayMs: 1, maxRetryDelayMs: 2, maxTotalDurationMs: 60000, maxRetryCostUsd: 1, maxRetryCostReserveUsd: 0.1, maxUnknownAttemptCostUsd: 0.1 },
    codex: { timeoutMs: 30000, allowedModes: ["read_only", "edit"], allowNonGitWorkspace: true },
    orchestration: {
      taskProfiles: {},
      scheduler: { maxQueuedPerWorkspace: 10, staleLockMs: 60000, leaseHeartbeatMs: 1000 },
      readOnlyCache: { enabled: false, ttlMs: 1000, maxEntryBytes: 1024 },
      circuitBreaker: { failureThreshold: 5, windowMs: 60000, openMs: 30000 }
    }
  };
}

async function runCodexProfileEdit(t, model, profile) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-profile-edit-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sourcePath = path.join(root, "src", "value.txt");
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.writeFileSync(sourcePath, "before\n", "utf8");
  const config = configuration(root);
  config.orchestration.taskProfiles[profile] = { target: "codex", model, mode: "edit", priority: 4, cacheable: false };
  const adapter = createAdapter("codex", { canRead: true, canWrite: true, supportsSandbox: true, supportsModelSelection: true });
  adapter.execute = async (request) => {
    assert.equal(request.model, model);
    assert.equal(request.mode, "edit");
    assert.equal(request.caller, "codex_edit");
    assert.notEqual(request.workspace, root);
    fs.writeFileSync(path.join(request.workspace, "src", "value.txt"), "after\n", "utf8");
    return createSuccessSubagentResult("codex", request.model, { result: "completed" });
  };
  const runtime = createBridgeRuntime({ configuration: config, adapters: { codex: adapter }, sleep: async () => {} });
  const result = await runtime.runProfileEdit({ profile, taskId: `profile-${profile}`, model, objective: "change", files: ["src/value.txt"], contextFiles: [], acceptanceCriteria: ["changed"] }, root);
  assert.equal(result.status, "completed", JSON.stringify(result));
  assert.equal(result.backend, "codex");
  assert.equal(result.applied, true);
  assert.deepEqual(result.filesChanged, ["src/value.txt"]);
  assert.equal(fs.readFileSync(sourcePath, "utf8"), "after\n");
}

test("Codex profile edit uses a disposable workspace and applies only selected files", async (t) => {
  await runCodexProfileEdit(t, "gpt-5.6-luna", "luna_implementation");
});

test("Codex Astra profile edit preserves the resolved model identity", async (t) => {
  await runCodexProfileEdit(t, "gpt-6-astra", "astra_implementation");
});
