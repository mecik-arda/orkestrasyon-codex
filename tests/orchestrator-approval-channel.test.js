import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createAdapter } from "../subagent-bridge/src/adapters/agent-adapter-base.js";
import { createBridgeRuntime } from "../subagent-bridge/src/runtime/bridge-runtime.js";
import { createSuccessSubagentResult } from "../subagent-bridge/src/schemas/core-schemas.js";
import { createSubagentMcpServer, isOrchestratorApprovalEnabled } from "../subagent-bridge/src/frontends/mcp/server.js";
import { createProviderEnvironment } from "../subagent-bridge/src/services/execution-service.js";
import { provisionDisposableWorkspace } from "../subagent-bridge/src/services/disposable-workspace.js";

async function listToolNames(enableOrchestratorApproval) {
  const runtime = {
    approvePreparedEdit: async () => ({ status: "failed", failureClass: "approval_invalid" }),
    rejectPreparedEdit: async () => ({ status: "failed", outcome: "approval_invalid" })
  };
  const server = createSubagentMcpServer({
    runtime,
    configuration: {},
    trustedWorkspace: os.tmpdir(),
    enableOrchestratorApproval
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "wp5b-approval-channel-test", version: "0.0.0" });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  const tools = await client.listTools();
  await client.close();
  return tools.tools.map((tool) => tool.name);
}

test("WP5B-CHANNEL-01: orkestratör onay bayrağı yalnız tam değerle etkinleşir", () => {
  assert.equal(isOrchestratorApprovalEnabled({ SUBAGENT_BRIDGE_ORCHESTRATOR_APPROVAL: "1" }), true);
  assert.equal(isOrchestratorApprovalEnabled({ SUBAGENT_BRIDGE_ORCHESTRATOR_APPROVAL: "01" }), false);
  assert.equal(isOrchestratorApprovalEnabled({ SUBAGENT_BRIDGE_ORCHESTRATOR_APPROVAL: "true" }), false);
  assert.equal(isOrchestratorApprovalEnabled({ SUBAGENT_BRIDGE_ORCHESTRATOR_APPROVAL: "" }), false);
  assert.equal(isOrchestratorApprovalEnabled({}), false);
  assert.equal(isOrchestratorApprovalEnabled(), typeof process.env.SUBAGENT_BRIDGE_ORCHESTRATOR_APPROVAL === "string");
});

test("WP5B-CHANNEL-02: hazırlanmış edit karar araçları yalnız bayrak açıkken kaydedilir", async () => {
  const disabledTools = await listToolNames(false);
  assert.equal(disabledTools.includes("approve_prepared_edit"), false);
  assert.equal(disabledTools.includes("reject_prepared_edit"), false);
  const enabledTools = await listToolNames(true);
  assert.equal(enabledTools.includes("approve_prepared_edit"), true);
  assert.equal(enabledTools.includes("reject_prepared_edit"), true);
  assert.equal(enabledTools.includes("run_deepseek_subagent"), true);
});

test("WP5B-CHANNEL-05: reject_prepared_edit gerçek MCP strict şemasını ve yanıt sözleşmesini uygular", async () => {
  let rejectionCalls = 0;
  const server = createSubagentMcpServer({
    runtime: {
      approvePreparedEdit: async () => ({ status: "failed", failureClass: "approval_invalid" }),
      rejectPreparedEdit: async () => {
        rejectionCalls += 1;
        return { status: "rejected", outcome: "prepared_edit_rejected" };
      }
    },
    configuration: {},
    trustedWorkspace: os.tmpdir(),
    enableOrchestratorApproval: true
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "prepared-edit-reject-contract-test", version: "1.0.0" });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  try {
    const { tools } = await client.listTools();
    const rejectionTool = tools.find((tool) => tool.name === "reject_prepared_edit");
    assert.ok(rejectionTool);
    assert.equal(rejectionTool.inputSchema.additionalProperties, false);
    const invalidArguments = await client.callTool({
      name: "reject_prepared_edit",
      arguments: { approvalRequestId: "a".repeat(64), unexpected: true }
    });
    assert.equal(invalidArguments.isError, true);
    assert.equal(rejectionCalls, 0);
    const accepted = await client.callTool({
      name: "reject_prepared_edit",
      arguments: { approvalRequestId: "a".repeat(64) }
    });
    assert.equal(accepted.isError, false);
    assert.deepEqual(accepted.structuredContent, { status: "rejected", outcome: "prepared_edit_rejected" });
    assert.equal(rejectionCalls, 1);
  } finally {
    await client.close();
  }
});

test("WP5B-CHANNEL-06: gerçek MCP taşıması strict girdiyi, açık red ve tek-seferlik terfiyi uygular", async (t) => {
  const root = fs.mkdtempSync(path.join(process.cwd(), ".tmp-mcp-prepared-edit-approval-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sourcePath = path.join(root, "src", "new-value.txt");
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  let providerStarts = 0;
  const codexAdapter = createAdapter("codex", { canRead: true, canWrite: true, supportsSandbox: true, supportsModelSelection: true });
  codexAdapter.execute = async (request) => {
    providerStarts += 1;
    const selectedPath = /^Düzenlenebilecek dosyalar: ([^\n]+)/mu.exec(request.prompt)?.[1];
    assert.ok(selectedPath);
    fs.writeFileSync(path.join(request.workspace, selectedPath), "created\n", "utf8");
    return createSuccessSubagentResult("codex", request.model, { result: "Updated selected file", durationMs: 1 });
  };
  const configuration = {
    statePaths: {
      logs: path.join(root, "logs"),
      state: path.join(root, "state"),
      cache: path.join(root, "cache")
    },
    allowedRoots: [root],
    codex: { timeoutMs: 30000, allowedModes: ["read_only", "edit"] },
    reliability: { maxAttempts: 1, maxSchemaRepairAttempts: 0, baseRetryDelayMs: 1, maxRetryDelayMs: 2, maxTotalDurationMs: 30000, maxRetryCostUsd: 1, maxRetryCostReserveUsd: 0.1, maxUnknownAttemptCostUsd: 0.1 },
    orchestration: {
      taskProfiles: { create_profile: { target: "codex", model: "gpt-5.6-sol", mode: "edit", priority: 1, cacheable: false } },
      scheduler: { maxQueuedPerWorkspace: 10, staleLockMs: 60000, leaseHeartbeatMs: 1000 },
      readOnlyCache: { enabled: false, ttlMs: 1000, maxEntryBytes: 1024 }
    },
    observability: { maxMetricFileBytes: 1048576, maxMetricRetentionDays: 30 }
  };
  const runtime = createBridgeRuntime({
    configuration,
    adapters: { codex: codexAdapter },
    sleep: async () => {},
    orchestratorApprovalEnabled: true
  });
  const server = createSubagentMcpServer({ runtime, configuration, trustedWorkspace: root, enableOrchestratorApproval: true });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "prepared-edit-approval-runtime-test", version: "1.0.0" });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  try {
    const { tools } = await client.listTools();
    const approvalTool = tools.find((tool) => tool.name === "approve_prepared_edit");
    assert.ok(approvalTool);
    assert.equal(approvalTool.inputSchema.additionalProperties, false);
    const preview = await client.callTool({
      name: "run_task_profile",
      arguments: {
        profile: "create_profile",
        taskId: "mcp-approval-channel-test",
        prompt: "Update the selected fixture file",
        files: ["src/new-value.txt"],
        acceptanceCriteria: ["The selected fixture exists"]
      }
    });
    assert.equal(preview.structuredContent.failureClass, "approval_required");
    assert.equal(preview.structuredContent.applied, false);
    assert.equal(fs.existsSync(sourcePath), false);
    assert.equal(providerStarts, 1);
    const invalidApproval = await client.callTool({
      name: "approve_prepared_edit",
      arguments: { approvalRequestId: preview.structuredContent.approvalRequestId, unexpected: true }
    });
    assert.equal(invalidApproval.isError, true);
    assert.equal(fs.existsSync(sourcePath), false);
    assert.equal(providerStarts, 1);
    const approved = await client.callTool({
      name: "approve_prepared_edit",
      arguments: { approvalRequestId: preview.structuredContent.approvalRequestId }
    });
    assert.equal(approved.structuredContent.status, "completed");
    assert.equal(approved.structuredContent.applied, true);
    assert.deepEqual(approved.structuredContent.filesChanged, ["src/new-value.txt"]);
    assert.equal(fs.readFileSync(sourcePath, "utf8"), "created\n");
    assert.equal(providerStarts, 1);
    const repeatedApproval = await client.callTool({
      name: "approve_prepared_edit",
      arguments: { approvalRequestId: preview.structuredContent.approvalRequestId }
    });
    assert.equal(repeatedApproval.structuredContent.failureClass, "approval_invalid");
    assert.equal(fs.readFileSync(sourcePath, "utf8"), "created\n");
    assert.equal(providerStarts, 1);
    const rejectedSourcePath = path.join(root, "src", "rejected-value.txt");
    const rejectPreview = await client.callTool({
      name: "run_task_profile",
      arguments: {
        profile: "create_profile",
        taskId: "mcp-approval-reject-test",
        prompt: "Create the selected fixture file",
        files: ["src/rejected-value.txt"],
        acceptanceCriteria: ["The selected fixture exists"]
      }
    });
    assert.equal(rejectPreview.structuredContent.failureClass, "approval_required");
    assert.equal(fs.existsSync(rejectedSourcePath), false);
    assert.equal(providerStarts, 2);
    const rejected = await client.callTool({
      name: "reject_prepared_edit",
      arguments: { approvalRequestId: rejectPreview.structuredContent.approvalRequestId }
    });
    assert.deepEqual(rejected.structuredContent, { status: "rejected", outcome: "prepared_edit_rejected" });
    assert.equal(fs.existsSync(rejectedSourcePath), false);
    const rejectedApproval = await client.callTool({
      name: "approve_prepared_edit",
      arguments: { approvalRequestId: rejectPreview.structuredContent.approvalRequestId }
    });
    assert.equal(rejectedApproval.isError, true);
    assert.equal(fs.existsSync(rejectedSourcePath), false);
    assert.equal(providerStarts, 2);
  } finally {
    await client.close();
  }
});

test("WP5B-CHANNEL-07: approve_prepared_edit MCP taşıması stale kaynak ve recovery engellerini korur", async (t) => {
  const root = fs.mkdtempSync(path.join(process.cwd(), ".tmp-mcp-prepared-edit-recovery-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const staleSourcePath = path.join(root, "src", "stale-value.txt");
  const newSourcePath = path.join(root, "src", "new-value.txt");
  fs.mkdirSync(path.dirname(staleSourcePath), { recursive: true });
  let providerStarts = 0;
  const codexAdapter = createAdapter("codex", { canRead: true, canWrite: true, supportsSandbox: true, supportsModelSelection: true });
  codexAdapter.execute = async (request) => {
    providerStarts += 1;
    if (providerStarts === 1) {
      fs.writeFileSync(path.join(request.workspace, "src", "stale-value.txt"), "prepared\n", "utf8");
    } else {
      fs.writeFileSync(path.join(request.workspace, "src", "new-value.txt"), "created\n", "utf8");
    }
    return createSuccessSubagentResult("codex", request.model, { result: "Updated selected file", durationMs: 1 });
  };
  const configuration = {
    statePaths: {
      logs: path.join(root, "logs"),
      state: path.join(root, "state"),
      cache: path.join(root, "cache")
    },
    allowedRoots: [root],
    codex: { timeoutMs: 30000, allowedModes: ["read_only", "edit"] },
    reliability: { maxAttempts: 1, maxSchemaRepairAttempts: 0, baseRetryDelayMs: 1, maxRetryDelayMs: 2, maxTotalDurationMs: 30000, maxRetryCostUsd: 1, maxRetryCostReserveUsd: 0.1, maxUnknownAttemptCostUsd: 0.1 },
    orchestration: {
      taskProfiles: { create_profile: { target: "codex", model: "gpt-5.6-sol", mode: "edit", priority: 1, cacheable: false } },
      scheduler: { maxQueuedPerWorkspace: 10, staleLockMs: 60000, leaseHeartbeatMs: 1000 },
      readOnlyCache: { enabled: false, ttlMs: 1000, maxEntryBytes: 1024 }
    },
    observability: { maxMetricFileBytes: 1048576, maxMetricRetentionDays: 30 }
  };
  const runtime = createBridgeRuntime({
    configuration,
    adapters: { codex: codexAdapter },
    sleep: async () => {},
    orchestratorApprovalEnabled: true
  });
  const server = createSubagentMcpServer({ runtime, configuration, trustedWorkspace: root, enableOrchestratorApproval: true });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "prepared-edit-stale-recovery-test", version: "1.0.0" });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  try {
    const stalePreview = await client.callTool({
      name: "run_task_profile",
      arguments: {
        profile: "create_profile",
        taskId: "mcp-approval-stale-test",
        prompt: "Update the selected fixture file",
        files: ["src/stale-value.txt"],
        acceptanceCriteria: ["The selected fixture contains prepared"]
      }
    });
    assert.equal(stalePreview.structuredContent.failureClass, "approval_required");
    assert.equal(fs.existsSync(staleSourcePath), false);
    fs.writeFileSync(staleSourcePath, "changed after preview\n", "utf8");
    const staleApproval = await client.callTool({
      name: "approve_prepared_edit",
      arguments: { approvalRequestId: stalePreview.structuredContent.approvalRequestId }
    });
    assert.equal(staleApproval.isError, true);
    const staleResult = staleApproval.structuredContent || JSON.parse(staleApproval.content[0].text);
    assert.equal(staleResult.failureClass, "approval_invalid");
    assert.equal(staleResult.applied, false);
    assert.equal(fs.readFileSync(staleSourcePath, "utf8"), "changed after preview\n");
    assert.equal(providerStarts, 1);
    const recoveryPreview = await client.callTool({
      name: "run_task_profile",
      arguments: {
        profile: "create_profile",
        taskId: "mcp-approval-recovery-test",
        prompt: "Create the selected fixture file",
        files: ["src/new-value.txt"],
        acceptanceCriteria: ["The selected fixture exists"]
      }
    });
    assert.equal(recoveryPreview.structuredContent.failureClass, "approval_required");
    const recoveryArtifactPath = path.join(root, "src", ".new-value.txt.123.456.abcdef.tmp");
    fs.writeFileSync(recoveryArtifactPath, "interrupted promotion\n", "utf8");
    const blockedApproval = await client.callTool({
      name: "approve_prepared_edit",
      arguments: { approvalRequestId: recoveryPreview.structuredContent.approvalRequestId }
    });
    assert.equal(blockedApproval.isError, true);
    const blockedResult = blockedApproval.structuredContent || JSON.parse(blockedApproval.content[0].text);
    assert.equal(blockedResult.failureClass, "recovery_required");
    assert.equal(blockedResult.applied, false);
    assert.equal(fs.existsSync(newSourcePath), false);
    assert.equal(providerStarts, 2);
    fs.rmSync(recoveryArtifactPath);
    const recoveredApproval = await client.callTool({
      name: "approve_prepared_edit",
      arguments: { approvalRequestId: recoveryPreview.structuredContent.approvalRequestId }
    });
    assert.equal(recoveredApproval.structuredContent.status, "completed");
    assert.equal(recoveredApproval.structuredContent.applied, true);
    assert.equal(fs.readFileSync(newSourcePath, "utf8"), "created\n");
    assert.equal(providerStarts, 2);
  } finally {
    await client.close();
  }
});

test("WP5B-CHANNEL-03: sağlayıcı ortamı approval bayrağını ve config override değişkenlerini taşımaz", () => {
  const environment = createProviderEnvironment("deepseek", {
    PATH: "C:\\bin",
    DEEPSEEK_API_KEY: "test-key",
    SUBAGENT_BRIDGE_ORCHESTRATOR_APPROVAL: "1",
    SUBAGENT_BRIDGE_TRUSTED_WORKSPACE: "C:\\workspace",
    OPENCODE_CONFIG: "C:\\opencode.json",
    OPENCODE_CONFIG_CONTENT: "{}",
    ORCHESTRATOR_CONFIG: "C:\\config.json"
  });
  assert.equal(environment.PATH, "C:\\bin");
  assert.equal(environment.DEEPSEEK_API_KEY, "test-key");
  assert.equal(environment.SUBAGENT_BRIDGE_ORCHESTRATOR_APPROVAL, undefined);
  assert.equal(environment.SUBAGENT_BRIDGE_TRUSTED_WORKSPACE, undefined);
  assert.equal(environment.OPENCODE_CONFIG, undefined);
  assert.equal(environment.OPENCODE_CONFIG_CONTENT, undefined);
  assert.equal(environment.ORCHESTRATOR_CONFIG, undefined);
});

test("WP5B-CHANNEL-04: disposable workspace retired provider configuration üretmez", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wp5b-disposable-config-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, "value.txt"), "before\n", "utf8");
  const disposable = provisionDisposableWorkspace({ statePaths: { cache: path.join(root, "cache") } }, root, ["value.txt"], ["value.txt"]);
  assert.equal(fs.existsSync(path.join(disposable.workspace, "opencode.json")), false);
  assert.equal(fs.existsSync(path.join(disposable.workspace, "opencode.jsonc")), false);
  disposable.cleanup();
});
