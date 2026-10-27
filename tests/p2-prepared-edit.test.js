import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createAdapter } from "../subagent-bridge/src/adapters/agent-adapter-base.js";
import { buildCodexArgs } from "../subagent-bridge/src/adapters/codex-adapter.js";
import { createSubagentMcpServer } from "../subagent-bridge/src/frontends/mcp/server.js";
import { createMcpToolHandlers, publicToolSchemas } from "../subagent-bridge/src/frontends/mcp/tools.js";
import { createBridgeRuntime } from "../subagent-bridge/src/runtime/bridge-runtime.js";
import { createFailureSubagentResult, createSuccessSubagentResult } from "../subagent-bridge/src/schemas/core-schemas.js";
import { p2PreparedEditPolicy } from "../subagent-bridge/src/services/p2-prepared-edit-policy.js";

function createConfiguration(root, { enabled = true, ttlMs = 300000 } = {}) {
  return {
    packageRoot: root,
    allowedRoots: [root],
    statePaths: {
      logs: path.join(root, "bridge-state", "logs"),
      state: path.join(root, "bridge-state", "state"),
      cache: path.join(root, "bridge-state", "cache")
    },
    approval: { ttlMs, maxEntries: 20, maxTotalBytes: 1048576 },
    reliability: {
      maxAttempts: 3,
      maxSchemaRepairAttempts: 2,
      baseRetryDelayMs: 1,
      maxRetryDelayMs: 2,
      maxTotalDurationMs: 1200000,
      maxRetryCostUsd: 1,
      maxRetryCostReserveUsd: 0.1,
      maxUnknownAttemptCostUsd: 0.1
    },
    codex: { timeoutMs: 900000, maxRetries: 1, allowedModes: ["read_only", "edit"] },
    orchestration: {
      acceptancePilots: { p2PreparedEdit: { enabled } },
      taskProfiles: {},
      scheduler: { maxQueuedPerWorkspace: 10, staleLockMs: 60000, leaseHeartbeatMs: 1000 },
      readOnlyCache: { enabled: false, ttlMs: 1000, maxEntryBytes: 1024 }
    },
    observability: { maxMetricFileBytes: 1048576, maxMetricRetentionDays: 30 }
  };
}

function createHarness(t, { initialState = "baseline", enabled = true, ttlMs = 300000, beforeResult } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "p2-prepared-edit-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const targetPath = path.join(root, ...p2PreparedEditPolicy.relativePath.split("/"));
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  if (initialState === "baseline") fs.writeFileSync(targetPath, p2PreparedEditPolicy.baselineContent, "utf8");
  const requests = [];
  const adapter = createAdapter("codex", { canRead: true, canWrite: true, supportsSandbox: true, supportsModelSelection: true });
  adapter.execute = async (request) => {
    requests.push(request);
    if (beforeResult) return beforeResult(request, { root, targetPath });
    const disposablePath = path.join(request.workspace, ...p2PreparedEditPolicy.relativePath.split("/"));
    fs.writeFileSync(disposablePath, p2PreparedEditPolicy.preparedContent, "utf8");
    return createSuccessSubagentResult("codex", request.model, { result: "Prepared fixed P2 fixture", durationMs: 1 });
  };
  const configuration = createConfiguration(root, { enabled, ttlMs });
  const runtime = createBridgeRuntime({
    configuration,
    adapters: { codex: adapter },
    sleep: async () => {},
    orchestratorApprovalEnabled: true
  });
  const handlers = createMcpToolHandlers({ runtime, trustedWorkspace: root, configuration });
  return { root, targetPath, requests, runtime, handlers, configuration };
}

async function listRegisteredTools(server) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "p2-prepared-edit-contract-test", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    return { client, tools: (await client.listTools()).tools };
  } catch (error) {
    await client.close();
    throw error;
  }
}

function createP2Server(harness) {
  return createSubagentMcpServer({
    runtime: harness.runtime,
    configuration: harness.configuration,
    trustedWorkspace: harness.root,
    enableOrchestratorApproval: true
  });
}

function preparedArguments() {
  return {};
}

test("P2-EDIT-01: varsayilan kapali MCP aracina provider baslatmaz ve strict bos girdiyi korur", async (t) => {
  const harness = createHarness(t, { enabled: false });
  const server = createP2Server(harness);
  const registration = await listRegisteredTools(server);
  try {
    assert.equal(registration.tools.some((tool) => tool.name === "prepare_p2_acceptance_edit"), false);
    assert.equal(registration.tools.some((tool) => tool.name === "run_task_profile"), true);
    assert.equal(publicToolSchemas.prepareP2AcceptanceEdit.safeParse({}).success, true);
    assert.equal(publicToolSchemas.prepareP2AcceptanceEdit.safeParse({ model: "gpt-6.1-sol" }).success, false);
    await assert.rejects(() => harness.handlers.prepareP2AcceptanceEdit({}), /disabled/u);
    assert.equal(harness.requests.length, 0);
  } finally {
    await registration.client.close();
  }
});

test("P2-EDIT-02: MCP hazirligi low impact degisikligi kaynakta uygulamadan ayri onaya baglar", async (t) => {
  const harness = createHarness(t);
  const server = createP2Server(harness);
  const registration = await listRegisteredTools(server);
  try {
    const prepareTool = registration.tools.find((tool) => tool.name === "prepare_p2_acceptance_edit");
    assert.ok(prepareTool);
    assert.deepEqual(prepareTool.inputSchema.required || [], []);
    const prepared = await registration.client.callTool({ name: "prepare_p2_acceptance_edit", arguments: preparedArguments() });
    assert.equal(prepared.isError, true);
    assert.equal(prepared.structuredContent.failureClass, "approval_required");
    assert.equal(prepared.structuredContent.applied, false);
    assert.equal(prepared.structuredContent.approvalRequired, true);
    assert.equal(prepared.structuredContent.approvalClass, "low_impact");
    assert.equal(prepared.structuredContent.approvalScope, p2PreparedEditPolicy.approvalScope);
    assert.equal(prepared.structuredContent.approvalRequestId.length, 64);
    assert.ok(Date.parse(prepared.structuredContent.approvalExpiresAt) > Date.now());
    assert.deepEqual(prepared.structuredContent.filesChanged, [p2PreparedEditPolicy.relativePath]);
    assert.equal(prepared.structuredContent.diff, [
      `--- a/${p2PreparedEditPolicy.relativePath}`,
      `+++ b/${p2PreparedEditPolicy.relativePath}`,
      "@@ -1,2 +1,2 @@",
      "-P2 approval probe baseline",
      "-",
      "+P2 approval probe",
      "+"
    ].join("\n"));
    assert.equal(fs.readFileSync(harness.targetPath, "utf8"), p2PreparedEditPolicy.baselineContent);
    assert.equal(harness.requests.length, 1);
    assert.equal(harness.requests[0].model, p2PreparedEditPolicy.model);
    assert.equal(harness.requests[0].mode, "edit");
    assert.equal(harness.requests[0].caller, "codex_profile_edit_pilot");
    assert.equal(harness.requests[0].timeoutMs, p2PreparedEditPolicy.timeoutMs);
    assert.equal(harness.requests[0].maxOutputBytes, p2PreparedEditPolicy.maxOutputBytes);
    const command = buildCodexArgs(harness.requests[0], { codex: { execArgs: ["--add-dir", harness.root] } });
    assert.equal(command.args.includes("--add-dir"), false);
    assert.equal(command.args.includes("--skip-git-repo-check"), true);
    assert.equal(command.args.includes("sandbox_workspace_write.network_access=false"), true);
    const applied = await registration.client.callTool({
      name: "approve_prepared_edit",
      arguments: { approvalRequestId: prepared.structuredContent.approvalRequestId }
    });
    assert.equal(applied.isError, false);
    assert.equal(applied.structuredContent.status, "completed");
    assert.equal(applied.structuredContent.applied, true);
    assert.equal(fs.readFileSync(harness.targetPath, "utf8"), p2PreparedEditPolicy.preparedContent);
    assert.equal(fs.readdirSync(path.join(harness.root, "bridge-state", "cache", "deepseek-edit-pilot")).length, 0);
  } finally {
    await registration.client.close();
  }
});

test("P2-EDIT-03: kaynakta olmayan hedef disposable alanda hazirlanir ve sonradan olusturulan hedefte stale olur", async (t) => {
  const harness = createHarness(t, { initialState: "absent" });
  const prepared = await harness.handlers.prepareP2AcceptanceEdit({});
  assert.equal(prepared.structuredContent.approvalClass, "new_file");
  assert.equal(prepared.structuredContent.applied, false);
  assert.equal(fs.existsSync(harness.targetPath), false);
  fs.writeFileSync(harness.targetPath, "created after preparation\n", "utf8");
  const applied = await harness.handlers.approvePreparedEdit({ approvalRequestId: prepared.structuredContent.approvalRequestId });
  assert.equal(applied.structuredContent.failureClass, "approval_invalid");
  assert.equal(applied.structuredContent.applied, false);
  assert.equal(fs.readFileSync(harness.targetPath, "utf8"), "created after preparation\n");
});

test("P2-EDIT-04: kaynak hazirlik sirasinda degisirse onay kaydi uretilmez", async (t) => {
  const harness = createHarness(t, {
    initialState: "absent",
    beforeResult: async (request, { targetPath }) => {
      fs.writeFileSync(targetPath, "external source write\n", "utf8");
      fs.writeFileSync(path.join(request.workspace, ...p2PreparedEditPolicy.relativePath.split("/")), p2PreparedEditPolicy.preparedContent, "utf8");
      return createSuccessSubagentResult("codex", request.model, { result: "Prepared fixed P2 fixture", durationMs: 1 });
    }
  });
  const result = await harness.handlers.prepareP2AcceptanceEdit({});
  assert.equal(result.structuredContent.failureClass, "source_workspace_changed");
  assert.equal(result.structuredContent.applied, false);
  assert.equal(result.structuredContent.approvalRequestId, undefined);
  assert.equal(fs.readFileSync(harness.targetPath, "utf8"), "external source write\n");
});

test("P2-EDIT-05: beklenmeyen disposable icerik red edilir ve kaynak korunur", async (t) => {
  const harness = createHarness(t, {
    beforeResult: async (request) => {
      fs.writeFileSync(path.join(request.workspace, ...p2PreparedEditPolicy.relativePath.split("/")), "unexpected result\n", "utf8");
      return createSuccessSubagentResult("codex", request.model, { result: "Prepared fixed P2 fixture", durationMs: 1 });
    }
  });
  const result = await harness.handlers.prepareP2AcceptanceEdit({});
  assert.equal(result.structuredContent.failureClass, "acceptance_failed");
  assert.equal(result.structuredContent.applied, false);
  assert.equal(result.structuredContent.approvalRequestId, undefined);
  assert.equal(fs.readFileSync(harness.targetPath, "utf8"), p2PreparedEditPolicy.baselineContent);
});

test("P2-EDIT-06: eszamanli onaylardan yalniz biri kaynak yazabilir", async (t) => {
  const harness = createHarness(t);
  const prepared = await harness.handlers.prepareP2AcceptanceEdit({});
  const approval = { approvalRequestId: prepared.structuredContent.approvalRequestId };
  const results = await Promise.all([
    harness.handlers.approvePreparedEdit(approval),
    harness.handlers.approvePreparedEdit(approval)
  ]);
  assert.equal(results.filter((result) => result.structuredContent.status === "completed" && result.structuredContent.applied).length, 1);
  assert.equal(results.filter((result) => result.structuredContent.applied === false).length, 1);
  assert.equal(fs.readFileSync(harness.targetPath, "utf8"), p2PreparedEditPolicy.preparedContent);
});

test("P2-EDIT-07: red ve sure asimi hazirlanan degisikligi uygulamaz", async (t) => {
  const harness = createHarness(t, { ttlMs: 1000 });
  const prepared = await harness.handlers.prepareP2AcceptanceEdit({});
  const rejected = await harness.handlers.rejectPreparedEdit({ approvalRequestId: prepared.structuredContent.approvalRequestId });
  assert.equal(rejected.structuredContent.status, "rejected");
  assert.equal(fs.readFileSync(harness.targetPath, "utf8"), p2PreparedEditPolicy.baselineContent);
  const second = await harness.handlers.prepareP2AcceptanceEdit({});
  await new Promise((resolve) => setTimeout(resolve, 1100));
  const expired = await harness.handlers.approvePreparedEdit({ approvalRequestId: second.structuredContent.approvalRequestId });
  assert.equal(expired.structuredContent.failureClass, "approval_invalid");
  assert.equal(fs.readFileSync(harness.targetPath, "utf8"), p2PreparedEditPolicy.baselineContent);
});

test("P2-EDIT-08: runtime yeniden baslatildiginda bekleyen kayit uygulanamaz", async (t) => {
  const harness = createHarness(t);
  const prepared = await harness.handlers.prepareP2AcceptanceEdit({});
  const restarted = createBridgeRuntime({
    configuration: harness.configuration,
    adapters: {},
    sleep: async () => {},
    orchestratorApprovalEnabled: true
  });
  const afterRestart = await restarted.approvePreparedEdit({ approvalRequestId: prepared.structuredContent.approvalRequestId }, harness.root);
  assert.equal(afterRestart.failureClass, "approval_invalid");
  assert.equal(afterRestart.applied, false);
  assert.equal(fs.readFileSync(harness.targetPath, "utf8"), p2PreparedEditPolicy.baselineContent);
});

test("P2-EDIT-08B: hazirlik sirasinda gercek surec cokerse kaynak degismez ve onay olusmaz", async (t) => {
  const harness = createHarness(t);
  const childPath = fileURLToPath(new URL("./fixtures/p2-prepared-edit-crash-child.js", import.meta.url));
  const child = spawnSync(process.execPath, [childPath, harness.root, JSON.stringify(harness.configuration), "prepare"], { encoding: "utf8", timeout: 60000 });
  assert.equal(child.status, 73);
  assert.equal(fs.readFileSync(harness.targetPath, "utf8"), p2PreparedEditPolicy.baselineContent);
  const restarted = createBridgeRuntime({ configuration: harness.configuration, adapters: {}, orchestratorApprovalEnabled: true });
  const result = await restarted.approvePreparedEdit({ approvalRequestId: "0".repeat(64) }, harness.root);
  assert.equal(result.failureClass, "approval_invalid");
  assert.equal(result.applied, false);
  assert.equal(fs.readFileSync(harness.targetPath, "utf8"), p2PreparedEditPolicy.baselineContent);
});

test("P2-EDIT-08C: promotion ortasinda surec cokerse recovery engeli yeniden uygulamayi durdurur", async (t) => {
  const harness = createHarness(t);
  const childPath = fileURLToPath(new URL("./fixtures/p2-prepared-edit-crash-child.js", import.meta.url));
  const child = spawnSync(process.execPath, [childPath, harness.root, JSON.stringify(harness.configuration), "promotion"], { encoding: "utf8", timeout: 60000 });
  assert.equal(child.status, 75);
  assert.equal(fs.existsSync(harness.targetPath), false);
  const parent = path.dirname(harness.targetPath);
  const artifacts = fs.readdirSync(parent).filter((entry) => entry.startsWith(".p2-approval-probe.txt.") && (entry.endsWith(".tmp") || entry.endsWith(".tmp.backup")));
  assert.equal(artifacts.length, 2);
  const prepared = await harness.handlers.prepareP2AcceptanceEdit({});
  const blocked = await harness.handlers.approvePreparedEdit({ approvalRequestId: prepared.structuredContent.approvalRequestId });
  assert.equal(blocked.structuredContent.failureClass, "recovery_required");
  assert.equal(blocked.structuredContent.applied, false);
  const backup = artifacts.find((entry) => entry.endsWith(".backup"));
  const temporary = artifacts.find((entry) => entry.endsWith(".tmp"));
  fs.renameSync(path.join(parent, backup), harness.targetPath);
  fs.rmSync(path.join(parent, temporary));
  assert.equal(fs.readFileSync(harness.targetPath, "utf8"), p2PreparedEditPolicy.baselineContent);
  const fresh = await harness.handlers.prepareP2AcceptanceEdit({});
  const approved = await harness.handlers.approvePreparedEdit({ approvalRequestId: fresh.structuredContent.approvalRequestId });
  assert.equal(approved.structuredContent.applied, true);
  assert.equal(fs.readFileSync(harness.targetPath, "utf8"), p2PreparedEditPolicy.preparedContent);
});

test("P2-EDIT-09: promotion recovery artifakti onayli uygulamayi fail closed tutar", async (t) => {
  const harness = createHarness(t);
  const prepared = await harness.handlers.prepareP2AcceptanceEdit({});
  const recoveryArtifact = path.join(path.dirname(harness.targetPath), ".p2-approval-probe.txt.123.456.abcdef.tmp");
  fs.writeFileSync(recoveryArtifact, "interrupted promotion\n", "utf8");
  const blocked = await harness.handlers.approvePreparedEdit({ approvalRequestId: prepared.structuredContent.approvalRequestId });
  assert.equal(blocked.structuredContent.failureClass, "recovery_required");
  assert.equal(blocked.structuredContent.applied, false);
  assert.equal(fs.readFileSync(harness.targetPath, "utf8"), p2PreparedEditPolicy.baselineContent);
  fs.rmSync(recoveryArtifact);
  const approved = await harness.handlers.approvePreparedEdit({ approvalRequestId: prepared.structuredContent.approvalRequestId });
  assert.equal(approved.structuredContent.applied, true);
  assert.equal(fs.readFileSync(harness.targetPath, "utf8"), p2PreparedEditPolicy.preparedContent);
});

test("P2-EDIT-10: adapter basarisizligi ve kaynak precondition hatasi approval kaydi uretmez", async (t) => {
  const failedProvider = createHarness(t, {
    beforeResult: async (request) => createFailureSubagentResult("codex", request.model, { error: "synthetic failure", durationMs: 1, retryable: true })
  });
  const failed = await failedProvider.handlers.prepareP2AcceptanceEdit({});
  assert.equal(failed.structuredContent.applied, false);
  assert.equal(failed.structuredContent.approvalRequestId, undefined);
  assert.equal(failedProvider.requests.length, 1);
  assert.equal(fs.readFileSync(failedProvider.targetPath, "utf8"), p2PreparedEditPolicy.baselineContent);
  const changedSource = createHarness(t);
  fs.writeFileSync(changedSource.targetPath, "unexpected precondition\n", "utf8");
  const preconditionFailure = await changedSource.handlers.prepareP2AcceptanceEdit({});
  assert.equal(preconditionFailure.structuredContent.failureClass, "fixture_precondition_failed");
  assert.equal(preconditionFailure.structuredContent.applied, false);
  assert.equal(changedSource.requests.length, 0);
});

test("P2-EDIT-11: cleanup hatasi bekleyen onay kaydini gecersizlestirir", async (t) => {
  const harness = createHarness(t);
  const originalRemove = fs.rmSync;
  const disposableRoot = path.resolve(harness.root, "bridge-state", "cache", "deepseek-edit-pilot");
  fs.rmSync = function (target, ...arguments_) {
    const resolvedTarget = path.resolve(target);
    if (resolvedTarget.startsWith(`${disposableRoot}${path.sep}`)) {
      const error = new Error("synthetic cleanup denial");
      error.code = "EPERM";
      throw error;
    }
    return originalRemove.call(fs, target, ...arguments_);
  };
  let result;
  try {
    result = await harness.handlers.prepareP2AcceptanceEdit({});
  } finally {
    fs.rmSync = originalRemove;
  }
  assert.equal(result.structuredContent.failureClass, "cleanup_failed");
  assert.equal(result.structuredContent.approvalRequestId, undefined);
  assert.equal(result.structuredContent.applied, false);
  assert.equal(fs.readFileSync(harness.targetPath, "utf8"), p2PreparedEditPolicy.baselineContent);
});
