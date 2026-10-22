import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createAdapter } from "../subagent-bridge/src/adapters/agent-adapter-base.js";
import { createFailureSubagentResult, createSuccessSubagentResult } from "../subagent-bridge/src/schemas/core-schemas.js";
import { createBridgeRuntime } from "../subagent-bridge/src/runtime/bridge-runtime.js";
import { createMcpToolHandlers, publicToolSchemas } from "../subagent-bridge/src/frontends/mcp/tools.js";
import { createSubagentMcpServer } from "../subagent-bridge/src/frontends/mcp/server.js";

function readOnlyTask(taskId = "task-one") {
  return {
    taskId,
    role: "analyst",
    mode: "read_only",
    target: "codex",
    objective: "Inspect",
    readablePaths: ["src/a.txt"]
  };
}

function createStubRuntime(overrides = {}) {
  const calls = [];
  return {
    calls,
    async prepareParallelBatch(input) {
      calls.push({ method: "prepare", input });
      return {
        ok: true,
        planId: "a".repeat(32),
        planHash: "b".repeat(64),
        summary: { planId: "a".repeat(32), planHash: "b".repeat(64), status: "planned", contentBytes: 10 },
        allocation: { estimatedUsd: 0.2, capUsd: 1 }
      };
    },
    async startParallelBatch(input) {
      calls.push({ method: "start", input });
      return { ok: true, batchId: "c".repeat(32), summary: { batchId: "c".repeat(32), planId: "a".repeat(32), planHash: "b".repeat(64), status: "queued", contentBytes: 10 } };
    },
    async getParallelBatch(input) {
      calls.push({ method: "get", input });
      return { ok: true, summary: { batchId: input.batchId, status: "running", contentBytes: 10 } };
    },
    async getParallelTaskDetail(input) {
      calls.push({ method: "detail", input });
      return { ok: true, page: { batchId: input.batchId, taskId: input.taskId, detailRef: input.detailRef, content: "page", cursor: 0, nextCursor: null, totalBytes: 4 } };
    },
    async cancelParallelBatch(input) {
      calls.push({ method: "cancel", input });
      return { ok: true, summary: { batchId: input.batchId, status: "cancelled" }, cancellation: { requested: true, cancelledExecutionCount: 1 } };
    },
    async approveParallelIntegration(input) {
      calls.push({ method: "approve", input });
      return { ok: false, reason: "integration_not_ready", message: "not ready" };
    },
    ...overrides
  };
}

test("V2-MCP: public parallel batch schemas reject bridge-owned metadata", () => {
  const prepare = { objective: "x", batchMaxReservedCostUsd: 1, tasks: [readOnlyTask()] };
  assert.equal(publicToolSchemas.prepareParallelBatch.safeParse(prepare).success, true);
  for (const field of ["workspace", "trustedWorkspace", "caller", "executionId", "delegationDepth", "statePaths", "planId"]) {
    assert.equal(publicToolSchemas.prepareParallelBatch.safeParse({ ...prepare, [field]: "injected" }).success, false, field);
  }
  assert.equal(publicToolSchemas.startParallelBatch.safeParse({ planId: "a".repeat(32), planHash: "b".repeat(64), workspace: "C:\\x" }).success, false);
  assert.equal(publicToolSchemas.getParallelBatch.safeParse({ batchId: "a".repeat(32) }).success, true);
  assert.equal(publicToolSchemas.cancelParallelBatch.safeParse({ batchId: "a".repeat(32), force: true }).success, false);
});

test("V2-MCP: prepare handler forwards the parsed plan and returns a bounded payload", async () => {
  const runtime = createStubRuntime();
  const handlers = createMcpToolHandlers({ runtime, trustedWorkspace: "C:\\trusted", caller: "openCode" });
  const result = await handlers.prepareParallelBatch({ objective: "x", batchMaxReservedCostUsd: 1, tasks: [readOnlyTask()] });
  assert.equal(result.isError, false);
  assert.equal(result.structuredContent.planId, "a".repeat(32));
  assert.equal(result.structuredContent.allocation.estimatedUsd, 0.2);
  assert.equal(runtime.calls.length, 1);
  assert.equal(runtime.calls[0].input.tasks[0].taskId, "task-one");
  assert.equal(result.content[0].text.length < 60000, true);
});

test("V2-MCP: start, get, detail, cancel and approve handlers map results and errors", async () => {
  const runtime = createStubRuntime();
  const handlers = createMcpToolHandlers({ runtime, trustedWorkspace: "C:\\trusted", caller: "openCode" });
  const started = await handlers.startParallelBatch({ planId: "a".repeat(32), planHash: "b".repeat(64) });
  assert.equal(started.structuredContent.batchId, "c".repeat(32));
  const fetched = await handlers.getParallelBatch({ batchId: "c".repeat(32) });
  assert.equal(fetched.structuredContent.summary.status, "running");
  const detail = await handlers.getParallelTaskDetail({ batchId: "c".repeat(32), taskId: "task-one", detailRef: "d".repeat(64) });
  assert.equal(detail.structuredContent.page.content, "page");
  const cancelled = await handlers.cancelParallelBatch({ batchId: "c".repeat(32) });
  assert.equal(cancelled.structuredContent.cancellation.requested, true);
  const approved = await handlers.approveParallelIntegration({ batchId: "c".repeat(32), approvalRef: "e".repeat(64), expectedDiffHash: "f".repeat(64) });
  assert.equal(approved.isError, true);
  assert.equal(approved.structuredContent.reason, "integration_not_ready");
});

test("V2-MCP: handlers reject injected bridge fields before runtime access", async () => {
  const runtime = createStubRuntime();
  const handlers = createMcpToolHandlers({ runtime, trustedWorkspace: "C:\\trusted", caller: "openCode" });
  await assert.rejects(
    () => handlers.prepareParallelBatch({ objective: "x", batchMaxReservedCostUsd: 1, tasks: [readOnlyTask()], workspace: "C:\\other" }),
    /invalid public tool arguments/
  );
  assert.equal(runtime.calls.length, 0);
});

test("V2-MCP: server construction honors the parallel batch gate", () => {
  const configuration = { parallelBatch: { enabled: true } };
  assert.doesNotThrow(() => createSubagentMcpServer({
    runtime: createStubRuntime(),
    configuration,
    trustedWorkspace: process.cwd(),
    enableOrchestratorApproval: true
  }));
  assert.doesNotThrow(() => createSubagentMcpServer({
    runtime: createStubRuntime(),
    configuration: { parallelBatch: { enabled: false } },
    trustedWorkspace: process.cwd(),
    enableOrchestratorApproval: false
  }));
});

test("V2-MCP: published process-output contract distinguishes raw bytes from final summaries", async () => {
  const runtime = createStubRuntime({
    async prepareParallelBatch() {
      return {
        ok: true,
        planId: "a".repeat(32),
        planHash: "b".repeat(64),
        allocation: { estimatedUsd: 0.4, capUsd: 0.75 },
        summary: {
          planId: "a".repeat(32),
          planHash: "b".repeat(64),
          status: "planned",
          message: "Per-task limits: task-one=1/30000/4096t/1048576h. CLI internal inference and billing are unobservable.",
          contentBytes: 10
        }
      };
    }
  });
  const server = createSubagentMcpServer({
    runtime,
    configuration: { parallelBatch: { enabled: true } },
    trustedWorkspace: process.cwd()
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "batch-output-contract-test", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const { tools } = await client.listTools();
    const prepare = tools.find((tool) => tool.name === "prepare_parallel_batch");
    const outputCap = prepare.inputSchema.properties.tasks.items.properties.maxOutputBytes;
    assert.equal(outputCap.minimum, 1024);
    assert.equal(outputCap.maximum, 8388608);
    assert.match(outputCap.description, /stdout plus stderr UTF-8 byte cap/u);
    assert.match(outputCap.description, /not the final answer or public summary/u);
    assert.match(prepare.description, /maxOutputBytes ham stdout\+stderr/u);
    assert.match(prepare.description, /output_limit/u);
    const prepared = await client.callTool({
      name: "prepare_parallel_batch",
      arguments: { objective: "Inspect", batchMaxReservedCostUsd: 0.75, tasks: [readOnlyTask()] }
    });
    assert.match(prepared.structuredContent.summary.message, /Per-task limits: task-one=1\/30000\/4096t\/1048576h/u);
    assert.match(prepared.content[0].text, /Per-task limits: task-one=1\/30000\/4096t\/1048576h/u);
  } finally {
    await client.close();
  }
});

async function listRegisteredToolNames(server) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "parallel-batch-registration-test", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const result = await client.listTools();
    return result.tools.map((tool) => tool.name);
  } finally {
    await client.close();
  }
}

test("V2-MCP: parallel tools are registered only under the enabled and approval gates", async () => {
  const enabledTools = await listRegisteredToolNames(createSubagentMcpServer({
    runtime: createStubRuntime(),
    configuration: { parallelBatch: { enabled: true } },
    trustedWorkspace: process.cwd(),
    enableOrchestratorApproval: true
  }));
  for (const name of ["prepare_parallel_batch", "start_parallel_batch", "get_parallel_batch", "get_parallel_task_detail", "cancel_parallel_batch", "approve_parallel_integration"]) {
    assert.equal(enabledTools.includes(name), true, `${name} should be registered`);
  }
  const noApprovalTools = await listRegisteredToolNames(createSubagentMcpServer({
    runtime: createStubRuntime(),
    configuration: { parallelBatch: { enabled: true } },
    trustedWorkspace: process.cwd(),
    enableOrchestratorApproval: false
  }));
  assert.equal(noApprovalTools.includes("prepare_parallel_batch"), true);
  assert.equal(noApprovalTools.includes("approve_parallel_integration"), false);
  const disabledTools = await listRegisteredToolNames(createSubagentMcpServer({
    runtime: createStubRuntime(),
    configuration: { parallelBatch: { enabled: false } },
    trustedWorkspace: process.cwd(),
    enableOrchestratorApproval: true
  }));
  assert.equal(disabledTools.some((name) => name.includes("parallel_batch")), false);
});

test("V2-MCP: get batch keeps progress machine-readable without a custom visual panel", async () => {
  const runtime = createStubRuntime({
    async getParallelBatch(input) {
      return {
        ok: true,
        summary: {
          schemaVersion: 1,
          batchId: input.batchId,
          planId: "a".repeat(32),
          planHash: "b".repeat(64),
          status: "running",
          createdAt: new Date().toISOString(),
          expiresAt: null,
          taskCount: 2,
          completedCount: 1,
          failedCount: 0,
          unknownCount: 0,
          tasks: [
            { taskId: "task-one", status: "completed", summary: "first done", summaryStatus: "full", actionRequired: "none", filesChanged: [], verification: [], riskLevel: null, detailRef: "c".repeat(64), failureClass: null, durationMs: 1000, costUsd: null },
            { taskId: "task-two", status: "running", summary: null, summaryStatus: "not_available", actionRequired: "none", filesChanged: [], verification: [], riskLevel: null, detailRef: null, failureClass: null, durationMs: 0, costUsd: null }
          ],
          progress: { percentage: 50, resolvedCount: 1, totalCount: 2, runningCount: 1, queuedCount: 0, blockedCount: 0, cancelledCount: 0 },
          budget: { capUsd: 1, reservedUsd: 0.1, settledKnownUsd: 0.1, unknownReservedUsd: 0, refundedUsd: 0, remainingUsd: 0.9, isProviderInvoice: false },
          approvalRequired: false,
          approval: null,
          message: null,
          contentBytes: 1000
        }
      };
    }
  });
  const handlers = createMcpToolHandlers({ runtime, trustedWorkspace: "C:\\trusted", caller: "openCode" });
  const result = await handlers.getParallelBatch({ batchId: "d".repeat(32) });
  assert.equal(result.isError, false);
  assert.equal(result.structuredContent.summary.progress.percentage, 50);
  assert.equal(result.structuredContent.summary.progress.runningCount, 1);
  assert.equal(JSON.parse(result.content[0].text).summary.progress.percentage, 50);
  assert.equal(result.content[0].text.includes("┏━ ORKESTRASYON V2"), false);
});

test("V2-MCP-E2E: in-memory MCP client gerçek runtime üzerinden read-only batch'i izler ve iptal eder", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-parallel-runtime-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const workspace = path.join(root, "workspace");
  const stateRoot = path.join(root, "state");
  fs.mkdirSync(path.join(workspace, "src"), { recursive: true });
  fs.writeFileSync(path.join(workspace, "src", "a.txt"), "fixture value=42\n", "utf8");
  let adapterCalls = 0;
  let adapterCancelCalls = 0;
  let releaseCancelledExecution = null;
  let signalCancelledExecution;
  const cancelledExecutionStarted = new Promise((resolve) => { signalCancelledExecution = resolve; });
  const codexAdapter = createAdapter("codex", {
    canRead: true,
    canWrite: false,
    supportsSandbox: true,
    supportsModelSelection: true
  });
  codexAdapter.execute = async (request) => {
    adapterCalls += 1;
    assert.equal(request.mode, "read_only");
    assert.equal(request.model, "gpt-6.1-sol");
    if (request.prompt.includes("wait for host cancellation")) {
      signalCancelledExecution();
      return new Promise((resolve) => {
        releaseCancelledExecution = () => resolve(createFailureSubagentResult("codex", request.model, {
          error: "execution cancelled",
          reason: "cancelled",
          retryable: false,
          retries: 0
        }));
      });
    }
    return createSuccessSubagentResult("codex", request.model, {
      requestedModel: request.model,
      resolvedModel: request.model,
      result: JSON.stringify({ status: "ok", summary: "fixture value=42", action_required: "none" }),
      durationMs: 1,
      metrics: { totalCostUsd: 0.01 }
    });
  };
  codexAdapter.cancel = async () => {
    adapterCancelCalls += 1;
    releaseCancelledExecution?.();
  };
  const configuration = {
    packageRoot: root,
    statePaths: {
      logs: path.join(stateRoot, "logs"),
      state: path.join(stateRoot, "data"),
      cache: path.join(stateRoot, "cache")
    },
    allowedRoots: [workspace],
    reliability: {
      maxAttempts: 1,
      maxTotalDurationMs: 30000,
      maxRetryCostUsd: 1,
      maxRetryCostReserveUsd: 0.1,
      maxUnknownAttemptCostUsd: 0.1,
      dailyCostLimitUsd: 10,
      monthlyCostLimitUsd: 10,
      costBudgetEnforced: false
    },
    observability: { maxMetricFileBytes: 1048576, maxMetricRetentionDays: 30 },
    codex: { timeoutMs: 30000, maxRetries: 0, allowedModes: ["read_only"] },
    orchestration: {
      taskProfiles: {},
      scheduler: { maxQueuedPerWorkspace: 5, staleLockMs: 60000, leaseHeartbeatMs: 1000 },
      readOnlyCache: { enabled: false, ttlMs: 1000, maxEntryBytes: 1024 }
    },
    parallelBatch: {
      enabled: true,
      editEnabled: false,
      maxWorkers: 1,
      providerConcurrency: { codex: 1 },
      defaultProviderConcurrency: 1,
      planTtlMs: 60000,
      maxSummaryCharacters: 4096,
      maxBatchSummaryBytes: 8192,
      maxReadablePathsPerTask: 5,
      maxContextFilesPerTask: 5,
      maxReadableSnapshotBytes: 65536,
      maxOutputBytesPerTask: 65536,
      artifactTtlMs: 60000,
      maxArtifactBytes: 65536,
      maxArtifactTotalBytes: 262144,
      allowedTargets: ["codex"],
      codexNetworkOffCapability: "available",
      worktreeRoot: null,
      verificationCommands: [],
      orphanGraceMs: 100
    }
  };
  const runtime = createBridgeRuntime({
    configuration,
    adapters: { codex: codexAdapter },
    sleep: async () => {},
    orchestratorApprovalEnabled: true
  });
  const server = createSubagentMcpServer({
    runtime,
    configuration,
    trustedWorkspace: workspace,
    enableOrchestratorApproval: true
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "parallel-runtime-e2e-test", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const prepared = await client.callTool({
      name: "prepare_parallel_batch",
      arguments: {
        objective: "Read the selected fixture and confirm its value",
        batchMaxReservedCostUsd: 0.5,
        tasks: [{
          taskId: "fixture-check",
          role: "analyst",
          mode: "read_only",
          target: "codex",
          model: "gpt-6.1-sol",
          objective: "Confirm the fixture text and report its value",
          readablePaths: ["src/a.txt"],
          maxInputBytes: 4096,
          maxOutputBytes: 65536,
          timeoutSeconds: 30
        }]
      }
    });
    assert.equal(prepared.isError, false);
    assert.equal(prepared.structuredContent.summary.status, "planned");
    assert.equal(prepared.structuredContent.allocation.estimatedUsd, 0.1);
    const started = await client.callTool({
      name: "start_parallel_batch",
      arguments: { planId: prepared.structuredContent.planId, planHash: prepared.structuredContent.planHash }
    });
    assert.equal(started.isError, false);
    assert.equal(started.structuredContent.summary.status, "queued");
    const deadline = Date.now() + 10000;
    let observed;
    while (Date.now() < deadline) {
      observed = await client.callTool({
        name: "get_parallel_batch",
        arguments: { batchId: started.structuredContent.batchId }
      });
      if (observed.structuredContent.summary.status === "result_ready") break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(observed.structuredContent.summary.status, "result_ready");
    assert.equal(observed.structuredContent.summary.tasks[0].status, "completed");
    assert.equal(observed.structuredContent.summary.tasks[0].summary, "fixture value=42");
    assert.equal(observed.structuredContent.summary.tasks[0].summaryStatus, "full");
    assert.equal(adapterCalls, 1);
    assert.equal(fs.readFileSync(path.join(workspace, "src", "a.txt"), "utf8"), "fixture value=42\n");
    const detail = await client.callTool({
      name: "get_parallel_task_detail",
      arguments: {
        batchId: started.structuredContent.batchId,
        taskId: "fixture-check",
        detailRef: observed.structuredContent.summary.tasks[0].detailRef
      }
    });
    assert.equal(detail.isError, false);
    assert.equal(detail.structuredContent.page.batchId, started.structuredContent.batchId);
    assert.match(detail.structuredContent.page.content, /fixture value=42/u);

    const cancelPrepared = await client.callTool({
      name: "prepare_parallel_batch",
      arguments: {
        objective: "Cancel one held fixture check",
        batchMaxReservedCostUsd: 0.5,
        tasks: [{
          taskId: "cancel-check",
          role: "analyst",
          mode: "read_only",
          target: "codex",
          model: "gpt-6.1-sol",
          objective: "wait for host cancellation",
          readablePaths: ["src/a.txt"],
          maxInputBytes: 4096,
          maxOutputBytes: 65536,
          timeoutSeconds: 30
        }]
      }
    });
    assert.equal(cancelPrepared.isError, false);
    const cancelStarted = await client.callTool({
      name: "start_parallel_batch",
      arguments: { planId: cancelPrepared.structuredContent.planId, planHash: cancelPrepared.structuredContent.planHash }
    });
    assert.equal(cancelStarted.isError, false);
    await cancelledExecutionStarted;
    const runningCancelBatch = await client.callTool({
      name: "get_parallel_batch",
      arguments: { batchId: cancelStarted.structuredContent.batchId }
    });
    assert.equal(runningCancelBatch.structuredContent.summary.status, "running");
    assert.equal(runningCancelBatch.structuredContent.summary.tasks[0].status, "running");
    const cancelRequested = await client.callTool({
      name: "cancel_parallel_batch",
      arguments: { batchId: cancelStarted.structuredContent.batchId }
    });
    assert.equal(cancelRequested.isError, false);
    assert.equal(cancelRequested.structuredContent.cancellation.requested, true);
    assert.equal(adapterCancelCalls, 1);
    const cancelDeadline = Date.now() + 10000;
    let cancelledBatch;
    while (Date.now() < cancelDeadline) {
      cancelledBatch = await client.callTool({
        name: "get_parallel_batch",
        arguments: { batchId: cancelStarted.structuredContent.batchId }
      });
      if (["cancelled", "unknown"].includes(cancelledBatch.structuredContent.summary.status)) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(cancelledBatch.structuredContent.summary.status, "cancelled");
    assert.equal(cancelledBatch.structuredContent.summary.tasks[0].status, "cancelled");
    assert.equal(adapterCalls, 2);
    assert.equal(fs.readFileSync(path.join(workspace, "src", "a.txt"), "utf8"), "fixture value=42\n");
  } finally {
    await client.close();
  }
});

test("V2-MCP-E2E: edit batch birleşik diff'i MCP üzerinden sunar ve ayrı onaydan önce kaynağı değiştirmez", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-parallel-edit-runtime-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const workspace = path.join(root, "workspace");
  const stateRoot = path.join(root, "state");
  fs.mkdirSync(path.join(workspace, "src"), { recursive: true });
  fs.writeFileSync(path.join(workspace, "src", "a.txt"), "alpha\n", "utf8");
  const runGit = (args) => execFileSync("git", args, { cwd: workspace, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  runGit(["init", "-q"]);
  runGit(["config", "user.email", "mcp-edit-test@example.invalid"]);
  runGit(["config", "user.name", "MCP Edit Test"]);
  runGit(["add", "-A"]);
  runGit(["commit", "-qm", "initial"]);
  let adapterCalls = 0;
  const codexAdapter = createAdapter("codex", {
    canRead: true,
    canWrite: true,
    supportsSandbox: true,
    supportsModelSelection: true
  });
  codexAdapter.execute = async (request) => {
    adapterCalls += 1;
    assert.equal(request.mode, "edit");
    assert.equal(request.model, "gpt-6.1-sol");
    fs.writeFileSync(path.join(request.workspace, "src", "a.txt"), "edited by worker\n", "utf8");
    return createSuccessSubagentResult("codex", request.model, {
      requestedModel: request.model,
      resolvedModel: request.model,
      result: JSON.stringify({ status: "ok", summary: "selected fixture updated", action_required: "none" }),
      durationMs: 1,
      metrics: { totalCostUsd: 0.01 }
    });
  };
  const configuration = {
    packageRoot: root,
    statePaths: {
      logs: path.join(stateRoot, "logs"),
      state: path.join(stateRoot, "data"),
      cache: path.join(stateRoot, "cache")
    },
    allowedRoots: [workspace],
    reliability: {
      maxAttempts: 1,
      maxTotalDurationMs: 30000,
      maxRetryCostUsd: 1,
      maxRetryCostReserveUsd: 0.1,
      maxUnknownAttemptCostUsd: 0.1,
      dailyCostLimitUsd: 10,
      monthlyCostLimitUsd: 10,
      costBudgetEnforced: false
    },
    observability: { maxMetricFileBytes: 1048576, maxMetricRetentionDays: 30 },
    codex: { timeoutMs: 30000, maxRetries: 0, allowedModes: ["read_only", "edit"] },
    orchestration: {
      taskProfiles: {},
      scheduler: { maxQueuedPerWorkspace: 5, staleLockMs: 60000, leaseHeartbeatMs: 1000 },
      readOnlyCache: { enabled: false, ttlMs: 1000, maxEntryBytes: 1024 }
    },
    parallelBatch: {
      enabled: true,
      editEnabled: true,
      maxWorkers: 1,
      providerConcurrency: { codex: 1 },
      defaultProviderConcurrency: 1,
      planTtlMs: 60000,
      maxSummaryCharacters: 4096,
      maxBatchSummaryBytes: 8192,
      maxReadablePathsPerTask: 5,
      maxContextFilesPerTask: 5,
      maxReadableSnapshotBytes: 65536,
      maxOutputBytesPerTask: 65536,
      maxFilesChangedPerTask: 1,
      maxFileBytesPerTask: 1024,
      maxTotalDiffBytesPerTask: 4096,
      artifactTtlMs: 60000,
      maxArtifactBytes: 65536,
      maxArtifactTotalBytes: 262144,
      allowedTargets: ["codex"],
      codexNetworkOffCapability: "available",
      worktreeRoot: path.join(stateRoot, "worktrees"),
      verificationCommands: ["git diff --check"],
      orphanGraceMs: 100
    }
  };
  const runtime = createBridgeRuntime({ configuration, adapters: { codex: codexAdapter }, sleep: async () => {}, orchestratorApprovalEnabled: true });
  const server = createSubagentMcpServer({ runtime, configuration, trustedWorkspace: workspace, enableOrchestratorApproval: true });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "parallel-edit-runtime-e2e-test", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const listed = await client.listTools();
    assert.equal(listed.tools.some((tool) => tool.name === "approve_parallel_integration"), true);
    const prepared = await client.callTool({
      name: "prepare_parallel_batch",
      arguments: {
        objective: "Edit one selected disposable source file and wait for separate integration approval",
        batchMaxReservedCostUsd: 0.5,
        tasks: [{
          taskId: "edit-fixture",
          role: "implementer",
          mode: "edit",
          target: "codex",
          model: "gpt-6.1-sol",
          objective: "Replace the selected fixture content with edited by worker",
          files: ["src/a.txt"],
          acceptanceCriteria: ["Only src/a.txt changes in the task worktree"],
          verificationCommands: ["git diff --check"],
          maxFilesChanged: 1,
          maxFileBytes: 1024,
          maxTotalDiffBytes: 4096,
          maxOutputBytes: 65536,
          timeoutSeconds: 30
        }]
      }
    });
    assert.equal(prepared.isError, false);
    assert.equal(prepared.structuredContent.summary.status, "planned");
    const started = await client.callTool({
      name: "start_parallel_batch",
      arguments: { planId: prepared.structuredContent.planId, planHash: prepared.structuredContent.planHash }
    });
    assert.equal(started.isError, false);
    const deadline = Date.now() + 60000;
    let observed;
    while (Date.now() < deadline) {
      observed = await client.callTool({ name: "get_parallel_batch", arguments: { batchId: started.structuredContent.batchId } });
      if (["ready_for_approval", "blocked", "failed"].includes(observed.structuredContent.summary.status)) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const summary = observed.structuredContent.summary;
    assert.equal(summary.status, "ready_for_approval");
    assert.equal(summary.approvalRequired, true);
    assert.equal(summary.approval.filesChanged.length, 1);
    assert.equal(summary.approval.filesChanged[0], "src/a.txt");
    assert.match(summary.approval.diffHash, /^[a-f0-9]{64}$/);
    assert.match(summary.approval.approvalRef, /^[a-f0-9]{64}$/);
    assert.equal(adapterCalls, 1);
    assert.equal(fs.readFileSync(path.join(workspace, "src", "a.txt"), "utf8"), "alpha\n");
    assert.equal(runGit(["status", "--porcelain"]).trim(), "");
    const detail = await client.callTool({
      name: "get_parallel_task_detail",
      arguments: {
        batchId: started.structuredContent.batchId,
        taskId: "integration",
        detailRef: summary.approval.detailRef
      }
    });
    assert.equal(detail.isError, false);
    const preview = JSON.parse(detail.structuredContent.page.content);
    assert.match(preview.diff, /edited by worker/u);
    assert.equal(preview.diffHash, summary.approval.diffHash);
    assert.equal(fs.readFileSync(path.join(workspace, "src", "a.txt"), "utf8"), "alpha\n");
    assert.equal(runGit(["status", "--porcelain"]).trim(), "");
  } finally {
    await client.close();
  }
});
