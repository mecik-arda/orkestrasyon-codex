import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createAdapter } from "../subagent-bridge/src/adapters/agent-adapter-base.js";
import { createMcpToolHandlers, publicToolSchemas } from "../subagent-bridge/src/frontends/mcp/tools.js";
import { createBridgeRuntime } from "../subagent-bridge/src/runtime/bridge-runtime.js";
import { createSuccessSubagentResult } from "../subagent-bridge/src/schemas/core-schemas.js";

const editProfile = { mode: "edit", model: "gpt-6.1-sol" };
const readOnlyProfile = { mode: "read_only", model: "gpt-6.1-sol" };

function createHandlers({ runtime, taskProfiles }) {
  return createMcpToolHandlers({
    runtime,
    trustedWorkspace: "C:\\trusted-workspace",
    configuration: { orchestration: { taskProfiles } }
  });
}

test("RUN-PROFILE-REVIEW-01: edit profiles reject review requests before runtime dispatch", async () => {
  let editCalls = 0;
  let readCalls = 0;
  const handlers = createHandlers({
    runtime: {
      async runProfileEdit() {
        editCalls += 1;
        return { status: "completed" };
      },
      async run() {
        readCalls += 1;
        return { ok: true };
      }
    },
    taskProfiles: { editor: editProfile }
  });
  const base = { prompt: "review the selected source", profile: "editor", files: ["src/value.js"] };

  await assert.rejects(() => handlers.runProfile({
    ...base,
    reviewScope: ["src/value.js"],
    reviewEvidenceRequirement: "required"
  }), /reviewScope is only available for read-only tasks/u);
  await assert.rejects(() => handlers.runProfile({
    ...base,
    reviewScope: ["src/value.js"]
  }), /reviewScope is only available for read-only tasks/u);

  assert.equal(editCalls, 0);
  assert.equal(readCalls, 0);
});

test("RUN-PROFILE-REVIEW-02: read-only profiles preserve required review data for runtime", async () => {
  let receivedRequest;
  const handlers = createHandlers({
    runtime: {
      async run(request) {
        receivedRequest = request;
        return { ok: true, result: "review completed" };
      }
    },
    taskProfiles: { reviewer: readOnlyProfile }
  });

  const result = await handlers.runProfile({
    prompt: "review the selected source",
    profile: "reviewer",
    reviewScope: ["src/value.js"],
    reviewEvidenceRequirement: "required"
  });

  assert.equal(result.isError, false);
  assert.equal(receivedRequest.mode, "read_only");
  assert.deepEqual(receivedRequest.reviewScope, ["src/value.js"]);
  assert.equal(receivedRequest.reviewEvidenceRequirement, "required");
});

test("RUN-PROFILE-REVIEW-03: ordinary edit and review-free read-only profiles keep their routes", async () => {
  let editCalls = 0;
  let readCalls = 0;
  const handlers = createHandlers({
    runtime: {
      async runProfileEdit() {
        editCalls += 1;
        return { status: "completed" };
      },
      async run(request) {
        readCalls += 1;
        return { ok: true, mode: request.mode };
      }
    },
    taskProfiles: { editor: editProfile, reader: readOnlyProfile }
  });

  const editResult = await handlers.runProfile({ prompt: "edit selected source", profile: "editor", files: ["src/value.js"] });
  const readResult = await handlers.runProfile({ prompt: "answer a question", profile: "reader" });

  assert.equal(editResult.structuredContent.status, "completed");
  assert.equal(readResult.structuredContent.mode, "read_only");
  assert.equal(editCalls, 1);
  assert.equal(readCalls, 1);
});

test("RUN-PROFILE-REVIEW-04: unknown profiles and client policy fields fail before runtime dispatch", async () => {
  let runtimeCalls = 0;
  const handlers = createHandlers({
    runtime: {
      async run() {
        runtimeCalls += 1;
        return { ok: true };
      },
      async runProfileEdit() {
        runtimeCalls += 1;
        return { status: "completed" };
      }
    },
    taskProfiles: { editor: editProfile, reader: readOnlyProfile }
  });
  const base = { prompt: "review", profile: "reader", reviewScope: ["src/value.js"] };

  await assert.rejects(() => handlers.runProfile({ prompt: "question", profile: "missing" }), /unsupported task profile/u);
  await assert.rejects(() => handlers.runProfile({ ...base, mode: "read_only" }), /invalid public tool arguments/u);
  await assert.rejects(() => handlers.runProfile({ ...base, reviewSourceSyntaxAwareClassifierEnabled: true }), /invalid public tool arguments/u);
  await assert.rejects(() => handlers.runProfile({ prompt: "review", profile: "reader", reviewEvidenceRequirement: "required" }), /invalid public tool arguments/u);
  assert.equal(publicToolSchemas.runProfile.safeParse({ ...base, mode: "read_only" }).success, false);
  assert.equal(publicToolSchemas.runProfile.safeParse({ ...base, reviewSourceSyntaxAwareClassifierEnabled: true }).success, false);
  assert.equal(publicToolSchemas.runProfile.safeParse({ prompt: "review", profile: "reader", reviewEvidenceRequirement: "required" }).success, false);
  assert.equal(runtimeCalls, 0);
});

test("RUN-PROFILE-REVIEW-05: real handler and runtime preserve read-only review and block edit before adapter execution", async (t) => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "run-profile-review-runtime-"));
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }));
  const filePath = path.join(workspace, "src", "value.js");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "export const value = 42;\n", "utf8");

  const statePaths = {
    logs: path.join(workspace, "state", "logs"),
    state: path.join(workspace, "state", "data"),
    cache: path.join(workspace, "state", "cache")
  };
  for (const directory of Object.values(statePaths)) fs.mkdirSync(directory, { recursive: true });

  const configuration = {
    allowedRoots: [workspace],
    statePaths,
    codex: { timeoutMs: 30000, maxRetries: 0 },
    reliability: {
      maxAttempts: 1,
      maxTotalDurationMs: 30000,
      maxRetryCostUsd: 1,
      maxRetryCostReserveUsd: 0.1,
      maxUnknownAttemptCostUsd: 0.1
    },
    orchestration: {
      scheduler: { maxQueuedPerWorkspace: 10, staleLockMs: 60000, leaseHeartbeatMs: 1000 },
      readOnlyCache: { enabled: false, ttlMs: 1000, maxEntryBytes: 1024 },
      taskProfiles: {
        editor: { target: "codex", model: "gpt-6.1-sol", mode: "edit", priority: 0, cacheable: false },
        reviewer: { target: "codex", model: "gpt-6.1-sol", mode: "read_only", priority: 0, cacheable: false }
      }
    },
    observability: { maxMetricFileBytes: 1048576, maxMetricRetentionDays: 30 }
  };

  const adapter = createAdapter("codex", {
    canRead: true,
    canWrite: false,
    supportsSandbox: true,
    supportsModelSelection: true
  });
  let adapterCalls = 0;
  let observedRequest;
  adapter.execute = async (request) => {
    adapterCalls += 1;
    observedRequest = request;
    const result = JSON.stringify({ summary: "Reviewed the selected source.", findings: [], limitations: [] });
    return createSuccessSubagentResult("codex", request.model, {
      result,
      metrics: {
        retries: 0,
        totalCostUsd: 0,
        stdinWriteStatus: "complete",
        stdinBytes: Buffer.byteLength(request.reviewSourcePayload, "utf8"),
        diagnostics: {
          failureStage: null,
          providerCode: null,
          settingsLockWaitMs: null,
          providerExecutionMs: 1,
          stdoutBytes: Buffer.byteLength(result, "utf8"),
          stderrBytes: 0
        }
      }
    });
  };

  const runtime = createBridgeRuntime({
    configuration,
    adapters: { codex: adapter },
    sleep: async () => {}
  });
  const handlers = createMcpToolHandlers({ runtime, trustedWorkspace: workspace, configuration });

  const reviewResult = await handlers.runProfile({
    prompt: "Review the selected source.",
    profile: "reviewer",
    reviewScope: ["src/value.js"],
    reviewEvidenceRequirement: "required"
  });

  assert.equal(reviewResult.isError, false);
  assert.equal(reviewResult.structuredContent.reviewContract.reviewResultValidated, true);
  assert.equal(adapterCalls, 1);
  assert.equal(observedRequest.mode, "read_only");
  assert.deepEqual(observedRequest.reviewScope, ["src/value.js"]);
  assert.equal(observedRequest.reviewEvidenceRequirement, "required");
  assert.match(observedRequest.reviewSourcePayload, /export const value = 42;/u);

  await assert.rejects(() => handlers.runProfile({
    prompt: "Review the selected source.",
    profile: "editor",
    files: ["src/value.js"],
    reviewScope: ["src/value.js"],
    reviewEvidenceRequirement: "required"
  }), /reviewScope is only available for read-only tasks/u);
  await assert.rejects(() => handlers.runProfile({
    prompt: "Review the selected source.",
    profile: "editor",
    files: ["src/value.js"],
    reviewEvidenceRequirement: "required"
  }), /invalid public tool arguments/u);

  assert.equal(adapterCalls, 1);
  assert.equal(fs.readFileSync(filePath, "utf8"), "export const value = 42;\n");
});
