import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawn, spawnSync } from "node:child_process";
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
  const temporaryRoot = fs.realpathSync(os.tmpdir());
  const root = fs.mkdtempSync(path.join(temporaryRoot, "p2-prepared-edit-"));
  t.after(() => {
    assert.equal(path.dirname(root), temporaryRoot);
    assert.ok(path.basename(root).startsWith("p2-prepared-edit-"));
    assert.equal(fs.realpathSync(root), root);
    fs.rmSync(root, { recursive: true, force: true });
  });
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

function runRecoveryChild(scriptPath, root, configuration) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, root, JSON.stringify(configuration)], { encoding: "utf8" });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("P2 recovery child exceeded its test deadline"));
    }, 60000);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (status) => {
      clearTimeout(timeout);
      resolve({ status, stdout, stderr });
    });
  });
}

function p2JournalDirectory(root) {
  const base = path.join(root, "bridge-state", "state", "p2-prepared-edit-journals");
  const workspaceDirectories = fs.readdirSync(base).map((entry) => path.join(base, entry));
  assert.equal(workspaceDirectories.length, 1);
  return workspaceDirectories[0];
}

function p2JournalFiles(root) {
  const directory = p2JournalDirectory(root);
  const journalFiles = fs.readdirSync(directory).filter((entry) => entry.endsWith(".json"));
  return journalFiles.map((entry) => path.join(directory, entry));
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
    assert.equal(applied.isError, false, JSON.stringify(applied.structuredContent));
    assert.equal(applied.structuredContent.status, "completed");
    assert.equal(applied.structuredContent.applied, true);
    assert.equal(fs.readFileSync(harness.targetPath, "utf8"), p2PreparedEditPolicy.preparedContent);
    const completedJournal = JSON.parse(fs.readFileSync(p2JournalFiles(harness.root)[0], "utf8"));
    const promotedIdentity = fs.statSync(harness.targetPath, { bigint: true });
    assert.equal(completedJournal.decision, "commit");
    assert.equal(completedJournal.phase, "terminal");
    assert.equal(completedJournal.staged.identity.dev, promotedIdentity.dev.toString());
    assert.equal(completedJournal.staged.identity.ino, promotedIdentity.ino.toString());
    assert.equal(fs.existsSync(path.join(harness.root, ...completedJournal.backupRelativePath.split("/"))), false);
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

test("P2-EDIT-08C: prepared promotion crash is recovered through a new runtime process", async (t) => {
  const harness = createHarness(t);
  const originalIdentity = fs.statSync(harness.targetPath, { bigint: true });
  const childPath = fileURLToPath(new URL("./fixtures/p2-prepared-edit-crash-child.js", import.meta.url));
  const child = spawnSync(process.execPath, [childPath, harness.root, JSON.stringify(harness.configuration), "promotion"], { encoding: "utf8", timeout: 60000 });
  assert.equal(child.status, 75, child.stdout);
  assert.equal(fs.existsSync(harness.targetPath), false);
  const parent = path.dirname(harness.targetPath);
  const artifacts = fs.readdirSync(parent).filter((entry) => entry.startsWith(".p2-approval-probe.txt.") && (entry.endsWith(".tmp") || entry.endsWith(".tmp.backup")));
  assert.equal(artifacts.length, 2);
  const journalPath = p2JournalFiles(harness.root)[0];
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
  const backupPath = path.join(harness.root, ...journal.backupRelativePath.split("/"));
  const stagePath = path.join(harness.root, ...journal.stageRelativePath.split("/"));
  const backupIdentity = fs.statSync(backupPath, { bigint: true });
  const stagedIdentity = fs.statSync(stagePath, { bigint: true });
  assert.equal(journal.decision, "pending");
  assert.equal(journal.phase, "prepared");
  assert.equal(journal.original.identity.dev, originalIdentity.dev.toString());
  assert.equal(journal.original.identity.ino, originalIdentity.ino.toString());
  assert.equal(backupIdentity.dev, originalIdentity.dev);
  assert.equal(backupIdentity.ino, originalIdentity.ino);
  assert.equal(journal.staged.identity.dev, stagedIdentity.dev.toString());
  assert.equal(journal.staged.identity.ino, stagedIdentity.ino.toString());
  const recoveryPath = fileURLToPath(new URL("./fixtures/p2-p2-recovery-child.js", import.meta.url));
  const recovery = spawnSync(process.execPath, [recoveryPath, harness.root, JSON.stringify(harness.configuration)], { encoding: "utf8", timeout: 60000 });
  assert.equal(recovery.status, 0, recovery.stderr);
  const recoveryResult = JSON.parse(recovery.stdout);
  assert.equal(recoveryResult.result.outcome, "recovered", JSON.stringify(recoveryResult.result));
  assert.equal(recoveryResult.targetExists, true);
  const restoredIdentity = fs.statSync(harness.targetPath, { bigint: true });
  assert.equal(restoredIdentity.dev, originalIdentity.dev);
  assert.equal(restoredIdentity.ino, originalIdentity.ino);
  assert.equal(restoredIdentity.mode & 0o7777n, originalIdentity.mode & 0o7777n);
  assert.equal(fs.readFileSync(harness.targetPath, "utf8"), p2PreparedEditPolicy.baselineContent);
  assert.equal(fs.readdirSync(parent).some((entry) => artifacts.includes(entry)), false);
  const fresh = await harness.handlers.prepareP2AcceptanceEdit({});
  const approved = await harness.handlers.approvePreparedEdit({ approvalRequestId: fresh.structuredContent.approvalRequestId });
  assert.equal(approved.structuredContent.applied, true);
  assert.equal(fs.readFileSync(harness.targetPath, "utf8"), p2PreparedEditPolicy.preparedContent);
  assert.equal((await harness.runtime.recoverP2PreparedEdits(harness.root)).outcome, "already_terminal");
  assert.equal(fs.readFileSync(harness.targetPath, "utf8"), p2PreparedEditPolicy.preparedContent);
});

test("P2-RECOVERY-01: recovery crash after hard-link is replayed without applying the payload", async (t) => {
  const harness = createHarness(t);
  const originalIdentity = fs.statSync(harness.targetPath, { bigint: true });
  const childPath = fileURLToPath(new URL("./fixtures/p2-prepared-edit-crash-child.js", import.meta.url));
  const crash = spawnSync(process.execPath, [childPath, harness.root, JSON.stringify(harness.configuration), "promotion"], { encoding: "utf8", timeout: 60000 });
  assert.equal(crash.status, 75, crash.stdout);
  const parent = path.dirname(harness.targetPath);
  const backupPath = path.join(parent, fs.readdirSync(parent).find((entry) => entry.endsWith(".tmp.backup")));
  const recoveryChild = fileURLToPath(new URL("./fixtures/p2-p2-recovery-child.js", import.meta.url));
  const recoveryCrash = spawnSync(process.execPath, [recoveryChild, harness.root, JSON.stringify(harness.configuration), "crash-after-restore-link"], { encoding: "utf8", timeout: 60000 });
  assert.equal(recoveryCrash.status, 76);
  const interruptedJournal = JSON.parse(fs.readFileSync(p2JournalFiles(harness.root)[0], "utf8"));
  assert.equal(interruptedJournal.decision, "pending");
  const linkedTarget = fs.statSync(harness.targetPath, { bigint: true });
  const linkedBackup = fs.statSync(backupPath, { bigint: true });
  assert.equal(linkedTarget.dev, originalIdentity.dev);
  assert.equal(linkedTarget.ino, originalIdentity.ino);
  assert.equal(linkedTarget.nlink, 2n);
  assert.equal(linkedBackup.dev, originalIdentity.dev);
  assert.equal(linkedBackup.ino, originalIdentity.ino);
  assert.equal(fs.readFileSync(harness.targetPath, "utf8"), p2PreparedEditPolicy.baselineContent);
  const recovery = spawnSync(process.execPath, [recoveryChild, harness.root, JSON.stringify(harness.configuration)], { encoding: "utf8", timeout: 60000 });
  assert.equal(recovery.status, 0, recovery.stderr);
  assert.equal(JSON.parse(recovery.stdout).result.outcome, "recovered");
  const restored = fs.statSync(harness.targetPath, { bigint: true });
  assert.equal(restored.dev, originalIdentity.dev);
  assert.equal(restored.ino, originalIdentity.ino);
  assert.equal(restored.nlink, 1n);
  assert.equal(fs.readFileSync(harness.targetPath, "utf8"), p2PreparedEditPolicy.baselineContent);
  assert.equal(fs.existsSync(backupPath), false);
  const terminal = JSON.parse(fs.readFileSync(p2JournalFiles(harness.root)[0], "utf8"));
  assert.equal(terminal.decision, "rollback");
  assert.equal(terminal.phase, "terminal");
  assert.equal(fs.readdirSync(path.dirname(harness.targetPath)).some((entry) => entry.endsWith(".tmp") || entry.endsWith(".tmp.backup")), false);
  const replay = spawnSync(process.execPath, [recoveryChild, harness.root, JSON.stringify(harness.configuration)], { encoding: "utf8", timeout: 60000 });
  assert.equal(replay.status, 0, replay.stderr);
  assert.equal(JSON.parse(replay.stdout).result.outcome, "already_terminal");
  const afterReplay = fs.statSync(harness.targetPath, { bigint: true });
  assert.equal(afterReplay.dev, originalIdentity.dev);
  assert.equal(afterReplay.ino, originalIdentity.ino);
});

test("P2-RECOVERY-01B: rollback journal yayimindan sonraki crash cleanup'i replay ile tamamlar", async (t) => {
  const harness = createHarness(t);
  const originalIdentity = fs.statSync(harness.targetPath, { bigint: true });
  const promotionChild = fileURLToPath(new URL("./fixtures/p2-prepared-edit-crash-child.js", import.meta.url));
  const promotionCrash = spawnSync(process.execPath, [promotionChild, harness.root, JSON.stringify(harness.configuration), "promotion"], { encoding: "utf8", timeout: 60000 });
  assert.equal(promotionCrash.status, 75, promotionCrash.stdout);
  const recoveryChild = fileURLToPath(new URL("./fixtures/p2-p2-recovery-child.js", import.meta.url));
  const recoveryCrash = spawnSync(process.execPath, [recoveryChild, harness.root, JSON.stringify(harness.configuration), "crash-after-rollback-record"], { encoding: "utf8", timeout: 60000 });
  assert.equal(recoveryCrash.status, 78);
  const journal = JSON.parse(fs.readFileSync(p2JournalFiles(harness.root)[0], "utf8"));
  assert.equal(journal.decision, "rollback");
  assert.equal(journal.phase, "cleanup_pending");
  const backupPath = path.join(harness.root, ...journal.backupRelativePath.split("/"));
  const restored = fs.statSync(harness.targetPath, { bigint: true });
  const backup = fs.statSync(backupPath, { bigint: true });
  assert.equal(restored.dev, originalIdentity.dev);
  assert.equal(restored.ino, originalIdentity.ino);
  assert.equal(restored.nlink, 2n);
  assert.equal(backup.dev, originalIdentity.dev);
  assert.equal(backup.ino, originalIdentity.ino);
  const replay = spawnSync(process.execPath, [recoveryChild, harness.root, JSON.stringify(harness.configuration)], { encoding: "utf8", timeout: 60000 });
  assert.equal(replay.status, 0, replay.stderr);
  assert.equal(JSON.parse(replay.stdout).result.outcome, "recovered");
  const terminal = JSON.parse(fs.readFileSync(p2JournalFiles(harness.root)[0], "utf8"));
  assert.equal(terminal.decision, "rollback");
  assert.equal(terminal.phase, "terminal");
  assert.equal(fs.existsSync(backupPath), false);
  const finalIdentity = fs.statSync(harness.targetPath, { bigint: true });
  assert.equal(finalIdentity.dev, originalIdentity.dev);
  assert.equal(finalIdentity.ino, originalIdentity.ino);
  assert.equal(finalIdentity.nlink, 1n);
});

test("P2-RECOVERY-02: staged hedefe link sonrasi process crash yeni P2 recovery ile geri alinir", async (t) => {
  const harness = createHarness(t);
  const originalIdentity = fs.statSync(harness.targetPath, { bigint: true });
  const childPath = fileURLToPath(new URL("./fixtures/p2-prepared-edit-crash-child.js", import.meta.url));
  const crash = spawnSync(process.execPath, [childPath, harness.root, JSON.stringify(harness.configuration), "promotion-target-linked"], { encoding: "utf8", timeout: 60000 });
  assert.equal(crash.status, 77, crash.stdout);
  assert.equal(fs.statSync(harness.targetPath, { bigint: true }).nlink, 2n);
  const journal = JSON.parse(fs.readFileSync(p2JournalFiles(harness.root)[0], "utf8"));
  assert.equal(journal.decision, "pending");
  assert.equal(journal.phase, "backup_moved");
  const recoveryPath = fileURLToPath(new URL("./fixtures/p2-p2-recovery-child.js", import.meta.url));
  const recovery = spawnSync(process.execPath, [recoveryPath, harness.root, JSON.stringify(harness.configuration)], { encoding: "utf8", timeout: 60000 });
  assert.equal(recovery.status, 0, recovery.stderr);
  assert.equal(JSON.parse(recovery.stdout).result.outcome, "recovered");
  const restored = fs.statSync(harness.targetPath, { bigint: true });
  assert.equal(restored.dev, originalIdentity.dev);
  assert.equal(restored.ino, originalIdentity.ino);
  assert.equal(restored.nlink, 1n);
  assert.equal(restored.mode & 0o7777n, originalIdentity.mode & 0o7777n);
  assert.equal(fs.readFileSync(harness.targetPath, "utf8"), p2PreparedEditPolicy.baselineContent);
  const terminal = JSON.parse(fs.readFileSync(p2JournalFiles(harness.root)[0], "utf8"));
  assert.equal(terminal.decision, "rollback");
  assert.equal(terminal.phase, "terminal");
  const parent = path.dirname(harness.targetPath);
  assert.equal(fs.readdirSync(parent).some((entry) => entry.endsWith(".tmp") || entry.endsWith(".tmp.backup")), false);
});

test("P2-RECOVERY-03: ayni icerikli farkli kimlikli dis hedef fail closed korunur", async (t) => {
  const harness = createHarness(t);
  const originalIdentity = fs.statSync(harness.targetPath, { bigint: true });
  const childPath = fileURLToPath(new URL("./fixtures/p2-prepared-edit-crash-child.js", import.meta.url));
  const crash = spawnSync(process.execPath, [childPath, harness.root, JSON.stringify(harness.configuration), "promotion"], { encoding: "utf8", timeout: 60000 });
  assert.equal(crash.status, 75, crash.stdout);
  const journalPath = p2JournalFiles(harness.root)[0];
  const journalBefore = JSON.parse(fs.readFileSync(journalPath, "utf8"));
  fs.writeFileSync(harness.targetPath, p2PreparedEditPolicy.baselineContent, { flag: "wx" });
  const externalIdentity = fs.statSync(harness.targetPath, { bigint: true });
  assert.notEqual(externalIdentity.ino, originalIdentity.ino);
  const parent = path.dirname(harness.targetPath);
  const artifacts = fs.readdirSync(parent).filter((entry) => entry.endsWith(".tmp") || entry.endsWith(".tmp.backup"));
  const recoveryPath = fileURLToPath(new URL("./fixtures/p2-p2-recovery-child.js", import.meta.url));
  const recovery = spawnSync(process.execPath, [recoveryPath, harness.root, JSON.stringify(harness.configuration)], { encoding: "utf8", timeout: 60000 });
  assert.equal(recovery.status, 0, recovery.stderr);
  const result = JSON.parse(recovery.stdout).result;
  assert.equal(result.outcome, "conflict");
  assert.equal(result.failureClass, "p2_recovery_conflict");
  const targetAfter = fs.statSync(harness.targetPath, { bigint: true });
  assert.equal(targetAfter.dev, externalIdentity.dev);
  assert.equal(targetAfter.ino, externalIdentity.ino);
  assert.equal(fs.readFileSync(harness.targetPath, "utf8"), p2PreparedEditPolicy.baselineContent);
  assert.deepEqual(fs.readdirSync(parent).filter((entry) => entry.endsWith(".tmp") || entry.endsWith(".tmp.backup")).sort(), artifacts.sort());
  assert.deepEqual(JSON.parse(fs.readFileSync(journalPath, "utf8")), journalBefore);
});

test("P2-RECOVERY-04: eszamanli ayri surec kurtarmalari journal kararini tekilleyip replay yapar", async (t) => {
  const harness = createHarness(t);
  const originalIdentity = fs.statSync(harness.targetPath, { bigint: true });
  const crashPath = fileURLToPath(new URL("./fixtures/p2-prepared-edit-crash-child.js", import.meta.url));
  const crash = spawnSync(process.execPath, [crashPath, harness.root, JSON.stringify(harness.configuration), "promotion"], { encoding: "utf8", timeout: 60000 });
  assert.equal(crash.status, 75, crash.stdout);
  const recoveryPath = fileURLToPath(new URL("./fixtures/p2-p2-recovery-child.js", import.meta.url));
  const [first, second] = await Promise.all([
    runRecoveryChild(recoveryPath, harness.root, harness.configuration),
    runRecoveryChild(recoveryPath, harness.root, harness.configuration)
  ]);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);
  const outcomes = [JSON.parse(first.stdout).result.outcome, JSON.parse(second.stdout).result.outcome].sort();
  assert.deepEqual(outcomes, ["already_terminal", "recovered"]);
  const restored = fs.statSync(harness.targetPath, { bigint: true });
  assert.equal(restored.dev, originalIdentity.dev);
  assert.equal(restored.ino, originalIdentity.ino);
  assert.equal(restored.nlink, 1n);
  assert.equal(fs.readFileSync(harness.targetPath, "utf8"), p2PreparedEditPolicy.baselineContent);
});

test("P2-RECOVERY-05: baslangicta olmayan hedef staged link crash sonrasi yok kalir", async (t) => {
  const harness = createHarness(t, { initialState: "absent" });
  const childPath = fileURLToPath(new URL("./fixtures/p2-prepared-edit-crash-child.js", import.meta.url));
  const crash = spawnSync(process.execPath, [childPath, harness.root, JSON.stringify(harness.configuration), "promotion-target-linked"], { encoding: "utf8", timeout: 60000 });
  assert.equal(crash.status, 77, crash.stdout);
  assert.equal(fs.existsSync(harness.targetPath), true);
  const journal = JSON.parse(fs.readFileSync(p2JournalFiles(harness.root)[0], "utf8"));
  assert.equal(journal.originalState, "absent");
  assert.equal(journal.original, null);
  const recoveryPath = fileURLToPath(new URL("./fixtures/p2-p2-recovery-child.js", import.meta.url));
  const recovery = spawnSync(process.execPath, [recoveryPath, harness.root, JSON.stringify(harness.configuration)], { encoding: "utf8", timeout: 60000 });
  assert.equal(recovery.status, 0, recovery.stderr);
  assert.equal(JSON.parse(recovery.stdout).result.outcome, "recovered");
  assert.equal(fs.existsSync(harness.targetPath), false);
  const terminal = JSON.parse(fs.readFileSync(p2JournalFiles(harness.root)[0], "utf8"));
  assert.equal(terminal.decision, "rollback");
  assert.equal(terminal.phase, "terminal");
});

test("P2-RECOVERY-06: bozuk journal ve eksik backup dosyalara dokunmadan bloke kalir", async (t) => {
  const corruptJournal = createHarness(t);
  const crashPath = fileURLToPath(new URL("./fixtures/p2-prepared-edit-crash-child.js", import.meta.url));
  const firstCrash = spawnSync(process.execPath, [crashPath, corruptJournal.root, JSON.stringify(corruptJournal.configuration), "promotion"], { encoding: "utf8", timeout: 60000 });
  assert.equal(firstCrash.status, 75, firstCrash.stdout);
  const corruptJournalPath = p2JournalFiles(corruptJournal.root)[0];
  const firstParent = path.dirname(corruptJournal.targetPath);
  const firstArtifacts = fs.readdirSync(firstParent).filter((entry) => entry.endsWith(".tmp") || entry.endsWith(".tmp.backup"));
  fs.writeFileSync(corruptJournalPath, "{", "utf8");
  const recoveryPath = fileURLToPath(new URL("./fixtures/p2-p2-recovery-child.js", import.meta.url));
  const corruptResult = spawnSync(process.execPath, [recoveryPath, corruptJournal.root, JSON.stringify(corruptJournal.configuration)], { encoding: "utf8", timeout: 60000 });
  assert.equal(corruptResult.status, 0, corruptResult.stderr);
  assert.equal(JSON.parse(corruptResult.stdout).result.failureClass, "p2_journal_invalid");
  assert.equal(fs.existsSync(corruptJournal.targetPath), false);
  assert.deepEqual(fs.readdirSync(firstParent).filter((entry) => entry.endsWith(".tmp") || entry.endsWith(".tmp.backup")).sort(), firstArtifacts.sort());

  const missingBackup = createHarness(t);
  const secondCrash = spawnSync(process.execPath, [crashPath, missingBackup.root, JSON.stringify(missingBackup.configuration), "promotion"], { encoding: "utf8", timeout: 60000 });
  assert.equal(secondCrash.status, 75, secondCrash.stdout);
  const journal = JSON.parse(fs.readFileSync(p2JournalFiles(missingBackup.root)[0], "utf8"));
  const backupPath = path.join(missingBackup.root, ...journal.backupRelativePath.split("/"));
  const stagePath = path.join(missingBackup.root, ...journal.stageRelativePath.split("/"));
  fs.unlinkSync(backupPath);
  const missingResult = spawnSync(process.execPath, [recoveryPath, missingBackup.root, JSON.stringify(missingBackup.configuration)], { encoding: "utf8", timeout: 60000 });
  assert.equal(missingResult.status, 0, missingResult.stderr);
  assert.equal(JSON.parse(missingResult.stdout).result.failureClass, "p2_recovery_conflict");
  assert.equal(fs.existsSync(missingBackup.targetPath), false);
  assert.equal(fs.existsSync(stagePath), true);

  const missingBackupAfterTargetLink = createHarness(t);
  const thirdCrash = spawnSync(process.execPath, [crashPath, missingBackupAfterTargetLink.root, JSON.stringify(missingBackupAfterTargetLink.configuration), "promotion-stage-removed"], { encoding: "utf8", timeout: 60000 });
  assert.equal(thirdCrash.status, 79, thirdCrash.stdout);
  const linkedJournal = JSON.parse(fs.readFileSync(p2JournalFiles(missingBackupAfterTargetLink.root)[0], "utf8"));
  const linkedBackupPath = path.join(missingBackupAfterTargetLink.root, ...linkedJournal.backupRelativePath.split("/"));
  fs.unlinkSync(linkedBackupPath);
  const stagedTargetIdentity = fs.statSync(missingBackupAfterTargetLink.targetPath, { bigint: true });
  const targetContent = fs.readFileSync(missingBackupAfterTargetLink.targetPath);
  const targetLinkCount = stagedTargetIdentity.nlink;
  const unavailableBackup = spawnSync(process.execPath, [recoveryPath, missingBackupAfterTargetLink.root, JSON.stringify(missingBackupAfterTargetLink.configuration)], { encoding: "utf8", timeout: 60000 });
  assert.equal(unavailableBackup.status, 0, unavailableBackup.stderr);
  assert.equal(JSON.parse(unavailableBackup.stdout).result.failureClass, "p2_recovery_conflict");
  const preservedTargetIdentity = fs.statSync(missingBackupAfterTargetLink.targetPath, { bigint: true });
  assert.equal(preservedTargetIdentity.dev, stagedTargetIdentity.dev);
  assert.equal(preservedTargetIdentity.ino, stagedTargetIdentity.ino);
  assert.equal(preservedTargetIdentity.nlink, targetLinkCount);
  assert.deepEqual(fs.readFileSync(missingBackupAfterTargetLink.targetPath), targetContent);
});

test("P2-RECOVERY-07: yayimlanmamis durum journal dosyasi gecerli onceki kayitla uzlastirilir", async (t) => {
  const harness = createHarness(t);
  const originalIdentity = fs.statSync(harness.targetPath, { bigint: true });
  const crashPath = fileURLToPath(new URL("./fixtures/p2-prepared-edit-crash-child.js", import.meta.url));
  const crash = spawnSync(process.execPath, [crashPath, harness.root, JSON.stringify(harness.configuration), "promotion-journal-update"], { encoding: "utf8", timeout: 60000 });
  assert.equal(crash.status, 80, crash.stdout);
  assert.equal(fs.existsSync(harness.targetPath), false);
  const recoveryPath = fileURLToPath(new URL("./fixtures/p2-p2-recovery-child.js", import.meta.url));
  const recovery = spawnSync(process.execPath, [recoveryPath, harness.root, JSON.stringify(harness.configuration)], { encoding: "utf8", timeout: 60000 });
  assert.equal(recovery.status, 0, recovery.stderr);
  assert.equal(JSON.parse(recovery.stdout).result.outcome, "recovered");
  const restored = fs.statSync(harness.targetPath, { bigint: true });
  assert.equal(restored.dev, originalIdentity.dev);
  assert.equal(restored.ino, originalIdentity.ino);
  assert.equal(restored.nlink, 1n);
  assert.equal(fs.readFileSync(harness.targetPath, "utf8"), p2PreparedEditPolicy.baselineContent);
  const replay = spawnSync(process.execPath, [recoveryPath, harness.root, JSON.stringify(harness.configuration)], { encoding: "utf8", timeout: 60000 });
  assert.equal(replay.status, 0, replay.stderr);
  assert.equal(JSON.parse(replay.stdout).result.outcome, "already_terminal");
});

test("P2-RECOVERY-08: ilk journal yayimindan once crash kaynagi degistirmeden fail closed kalir", async (t) => {
  const harness = createHarness(t);
  const originalIdentity = fs.statSync(harness.targetPath, { bigint: true });
  const crashPath = fileURLToPath(new URL("./fixtures/p2-prepared-edit-crash-child.js", import.meta.url));
  const crash = spawnSync(process.execPath, [crashPath, harness.root, JSON.stringify(harness.configuration), "promotion-initial-journal"], { encoding: "utf8", timeout: 60000 });
  assert.equal(crash.status, 81);
  assert.equal(fs.readFileSync(harness.targetPath, "utf8"), p2PreparedEditPolicy.baselineContent);
  const currentIdentity = fs.statSync(harness.targetPath, { bigint: true });
  assert.equal(currentIdentity.dev, originalIdentity.dev);
  assert.equal(currentIdentity.ino, originalIdentity.ino);
  const journalDirectory = p2JournalDirectory(harness.root);
  const entries = fs.readdirSync(journalDirectory);
  assert.equal(entries.some((entry) => entry.endsWith(".json")), false);
  assert.equal(entries.some((entry) => entry.endsWith(".next")), true);
  const recoveryPath = fileURLToPath(new URL("./fixtures/p2-p2-recovery-child.js", import.meta.url));
  const recovery = spawnSync(process.execPath, [recoveryPath, harness.root, JSON.stringify(harness.configuration)], { encoding: "utf8", timeout: 60000 });
  assert.equal(recovery.status, 0, recovery.stderr);
  assert.equal(JSON.parse(recovery.stdout).result.failureClass, "p2_journal_invalid");
  const afterRecovery = fs.statSync(harness.targetPath, { bigint: true });
  assert.equal(afterRecovery.dev, originalIdentity.dev);
  assert.equal(afterRecovery.ino, originalIdentity.ino);
  assert.equal(fs.readFileSync(harness.targetPath, "utf8"), p2PreparedEditPolicy.baselineContent);
});

test("P2-EDIT-09: promotion recovery artifakti onayli uygulamayi fail closed tutar", async (t) => {
  const harness = createHarness(t);
  await harness.handlers.prepareP2AcceptanceEdit({});
  const recoveryArtifact = path.join(path.dirname(harness.targetPath), ".p2-approval-probe.txt.123.456.abcdef.tmp");
  fs.writeFileSync(recoveryArtifact, "interrupted promotion\n", "utf8");
  await assert.rejects(() => harness.handlers.prepareP2AcceptanceEdit({}), /legacy recovery artifacts/u);
  assert.equal(fs.readFileSync(harness.targetPath, "utf8"), p2PreparedEditPolicy.baselineContent);
  fs.rmSync(recoveryArtifact);
  const fresh = await harness.handlers.prepareP2AcceptanceEdit({});
  const approved = await harness.handlers.approvePreparedEdit({ approvalRequestId: fresh.structuredContent.approvalRequestId });
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

test("P2-EDIT-12: promotion hard-linked kaynakta journal veya mutation baslatmaz", async (t) => {
  const harness = createHarness(t);
  const siblingPath = path.join(path.dirname(harness.targetPath), "p2-approval-probe-hardlink.txt");
  fs.linkSync(harness.targetPath, siblingPath);
  const originalIdentity = fs.statSync(harness.targetPath, { bigint: true });
  const prepared = await harness.handlers.prepareP2AcceptanceEdit({});
  assert.equal(prepared.structuredContent.applied, false);
  assert.equal(prepared.structuredContent.failureClass, "fixture_precondition_failed");
  assert.equal(harness.requests.length, 0);
  assert.equal(fs.readFileSync(harness.targetPath, "utf8"), p2PreparedEditPolicy.baselineContent);
  assert.equal(fs.readFileSync(siblingPath, "utf8"), p2PreparedEditPolicy.baselineContent);
  const current = fs.statSync(harness.targetPath, { bigint: true });
  const sibling = fs.statSync(siblingPath, { bigint: true });
  assert.equal(current.dev, originalIdentity.dev);
  assert.equal(current.ino, originalIdentity.ino);
  assert.equal(current.nlink, 2n);
  assert.equal(sibling.dev, originalIdentity.dev);
  assert.equal(sibling.ino, originalIdentity.ino);
  assert.equal(p2JournalFiles(harness.root).length, 0);
});

test("P2-EDIT-12B: backup hedefindeki baska dosya link ile ezilmeden korunur", async (t) => {
  const harness = createHarness(t);
  const prepared = await harness.handlers.prepareP2AcceptanceEdit({});
  const originalLink = fs.linkSync;
  const externalContent = Buffer.from("external backup occupant\n");
  let externalPath;
  let externalIdentity;
  fs.linkSync = (source, target) => {
    if (source === harness.targetPath && String(target).endsWith(".tmp.backup")) {
      externalPath = target;
      fs.writeFileSync(externalPath, externalContent, { flag: "wx" });
      externalIdentity = fs.statSync(externalPath, { bigint: true });
    }
    return originalLink(source, target);
  };
  let result;
  try {
    result = await harness.handlers.approvePreparedEdit({ approvalRequestId: prepared.structuredContent.approvalRequestId });
  } finally {
    fs.linkSync = originalLink;
  }
  assert.equal(result.structuredContent.failureClass, "recovery_required");
  assert.equal(result.structuredContent.applied, false);
  assert.equal(fs.readFileSync(harness.targetPath, "utf8"), p2PreparedEditPolicy.baselineContent);
  const preserved = fs.statSync(externalPath, { bigint: true });
  assert.equal(preserved.dev, externalIdentity.dev);
  assert.equal(preserved.ino, externalIdentity.ino);
  assert.deepEqual(fs.readFileSync(externalPath), externalContent);
  assert.equal(JSON.parse(fs.readFileSync(p2JournalFiles(harness.root)[0], "utf8")).decision, "pending");
});

test("P2-EDIT-13: P2 dosya hatasi public summary icinde kaynak yolunu aciklamaz", async (t) => {
  const harness = createHarness(t);
  const prepared = await harness.handlers.prepareP2AcceptanceEdit({});
  const originalLink = fs.linkSync;
  const privatePath = `${harness.root}\\private-test-path`;
  fs.linkSync = (source, target) => {
    if (String(source).endsWith(".tmp") && target === harness.targetPath) throw Object.assign(new Error(`synthetic denial ${privatePath}`), { code: "EPERM" });
    return originalLink(source, target);
  };
  let result;
  try {
    result = await harness.handlers.approvePreparedEdit({ approvalRequestId: prepared.structuredContent.approvalRequestId });
  } finally {
    fs.linkSync = originalLink;
  }
  assert.equal(result.structuredContent.failureClass, "approval_apply_failed");
  assert.equal(result.structuredContent.applied, false);
  assert.equal(result.structuredContent.summary.includes(privatePath), false);
  assert.equal(fs.readFileSync(harness.targetPath, "utf8"), p2PreparedEditPolicy.baselineContent);
  const recovery = await harness.runtime.recoverP2PreparedEdits(harness.root);
  assert.equal(recovery.outcome, "already_terminal");
  assert.equal(fs.readFileSync(harness.targetPath, "utf8"), p2PreparedEditPolicy.baselineContent);
});
