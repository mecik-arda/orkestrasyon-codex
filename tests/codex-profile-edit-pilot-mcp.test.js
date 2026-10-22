import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildCodexArgs, createCodexAdapter } from "../subagent-bridge/src/adapters/codex-adapter.js";
import { createAdapter } from "../subagent-bridge/src/adapters/agent-adapter-base.js";
import { createBridgeRuntime } from "../subagent-bridge/src/runtime/bridge-runtime.js";
import { createSuccessSubagentResult } from "../subagent-bridge/src/schemas/core-schemas.js";
import { createMcpToolHandlers, publicToolSchemas } from "../subagent-bridge/src/frontends/mcp/tools.js";
import { createSubagentMcpServer } from "../subagent-bridge/src/frontends/mcp/server.js";

const fixturePath = "tests/fixtures/codex-profile-edit-pilot/value.txt";

function configuration(root, enabled = true) {
  return {
    statePaths: {
      logs: path.join(root, "logs"),
      state: path.join(root, "state"),
      cache: path.join(root, "cache")
    },
    allowedRoots: [root],
    codex: { timeoutMs: 900000, maxOutputBytes: 8388608, allowedModes: ["read_only", "edit"], execArgs: ["--add-dir", root] },
    reliability: { maxAttempts: 5, maxSchemaRepairAttempts: 3, baseRetryDelayMs: 1, maxRetryDelayMs: 2, maxTotalDurationMs: 1200000, maxRetryCostUsd: 1, maxRetryCostReserveUsd: 0.1, maxUnknownAttemptCostUsd: 0.1 },
    orchestration: {
      acceptancePilots: { codexProfileEdit: { enabled } },
      scheduler: { maxQueuedPerWorkspace: 10, staleLockMs: 60000, leaseHeartbeatMs: 1000 },
      readOnlyCache: { enabled: false, ttlMs: 1000, maxEntryBytes: 1024 }
    },
    observability: { maxMetricFileBytes: 1048576, maxMetricRetentionDays: 30 }
  };
}

function createFakeAdapter(execute) {
  const adapter = createAdapter("codex", { canRead: true, canWrite: true, supportsSandbox: true, supportsModelSelection: true });
  adapter.execute = execute;
  return adapter;
}

function createFixtureRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-profile-edit-pilot-"));
  const target = path.join(root, fixturePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, "before\n", "utf8");
  return { root, target };
}

function createSuccessResult() {
  const sourceFileSha256 = createHash("sha256").update("before\n").digest("hex");
  const disposableFileSha256 = createHash("sha256").update("after\n").digest("hex");
  return {
    status: "completed",
    backend: "codex",
    model: "gpt-6.1-sol",
    requestedModel: "gpt-6.1-sol",
    resolvedModel: "gpt-6.1-sol",
    accessMode: "edit",
    summary: "provider controlled summary",
    failureClass: null,
    filesChanged: [fixturePath],
    diff: "--- before\n+++ after\n",
    applied: false,
    fallbacks: 0,
    cleanupCompleted: true,
    executionIdHash: "a".repeat(64),
    changeSetHash: "b".repeat(64),
    sourceFileSha256Before: sourceFileSha256,
    sourceFileSha256After: sourceFileSha256,
    disposableFileSha256,
    preview: true
  };
}

test("CODEX-EDIT-PILOT-MCP-01: default gate hides and rejects the fixed pilot without provider work", async () => {
  let calls = 0;
  const handlers = createMcpToolHandlers({
    runtime: { runCodexProfileEditPilot: async () => { calls += 1; return createSuccessResult(); } },
    trustedWorkspace: "C:\\workspace",
    configuration: { orchestration: { acceptancePilots: { codexProfileEdit: { enabled: false } } } }
  });
  assert.equal(publicToolSchemas.runCodexProfileEditPilot.safeParse({}).success, true);
  assert.equal(publicToolSchemas.runCodexProfileEditPilot.safeParse({ files: [fixturePath] }).success, false);
  await assert.rejects(() => handlers.runCodexProfileEditPilot({}), /disabled until explicitly enabled/u);
  assert.equal(calls, 0);
});

test("CODEX-EDIT-PILOT-MCP-02: MCP handler validates and redacts the fixed preview contract", async () => {
  const handlers = createMcpToolHandlers({
    runtime: { runCodexProfileEditPilot: async () => ({ ...createSuccessResult(), diff: "fixed-diff" }) },
    trustedWorkspace: "C:\\workspace",
    configuration: { orchestration: { acceptancePilots: { codexProfileEdit: { enabled: true } } } }
  });
  const response = await handlers.runCodexProfileEditPilot({});
  assert.equal(response.isError, false);
  assert.equal(response.structuredContent.summary, "Codex disposable edit pilot completed");
  assert.equal(response.structuredContent.applied, false);
  assert.equal(response.structuredContent.fallbacks, 0);
  assert.deepEqual(response.structuredContent.filesChanged, [fixturePath]);
  assert.equal(response.structuredContent.diff, "fixed-diff");
  assert.equal(response.structuredContent.sourceFileSha256Before, createHash("sha256").update("before\n").digest("hex"));
  assert.equal(response.structuredContent.sourceFileSha256After, response.structuredContent.sourceFileSha256Before);
  assert.equal(response.structuredContent.disposableFileSha256, createHash("sha256").update("after\n").digest("hex"));
  assert.equal(response.structuredContent.extraField, undefined);
  const invalidHandlers = createMcpToolHandlers({
    runtime: { runCodexProfileEditPilot: async () => ({ ...createSuccessResult(), applied: true }) },
    trustedWorkspace: "C:\\workspace",
    configuration: { orchestration: { acceptancePilots: { codexProfileEdit: { enabled: true } } } }
  });
  await assert.rejects(() => invalidHandlers.runCodexProfileEditPilot({}), /result failed host validation/u);
  const invalidHashResults = [
    { ...createSuccessResult(), sourceFileSha256Before: undefined },
    { ...createSuccessResult(), disposableFileSha256: "invalid" }
  ];
  for (const invalidResult of invalidHashResults) {
    const invalidHashHandlers = createMcpToolHandlers({
      runtime: { runCodexProfileEditPilot: async () => invalidResult },
      trustedWorkspace: "C:\\workspace",
      configuration: { orchestration: { acceptancePilots: { codexProfileEdit: { enabled: true } } } }
    });
    await assert.rejects(() => invalidHashHandlers.runCodexProfileEditPilot({}), /result failed host validation/u);
  }
});

test("CODEX-EDIT-PILOT-MCP-02A: fixed provider pilots forward the MCP cancellation context", async () => {
  const signal = new AbortController().signal;
  let codexSignal;
  let claudeSignal;
  const codexHandlers = createMcpToolHandlers({
    runtime: { runCodexProfileEditPilot: async (_workspace, abortSignal) => { codexSignal = abortSignal; return createSuccessResult(); } },
    trustedWorkspace: "C:\\workspace",
    configuration: { orchestration: { acceptancePilots: { codexProfileEdit: { enabled: true } } } }
  });
  const claudeHandlers = createMcpToolHandlers({
    runtime: { run: async (request) => { claudeSignal = request.abortSignal; return { ok: true, backend: "antigravity", model: "claude-sonnet-4-6" }; } },
    trustedWorkspace: "C:\\workspace",
    configuration: { orchestration: { acceptancePilots: { claudeSonnet: { enabled: true } } } }
  });
  await codexHandlers.runCodexProfileEditPilot({}, { signal });
  await claudeHandlers.runClaudeSonnetAcceptancePilot({}, { signal });
  assert.equal(codexSignal, signal);
  assert.equal(claudeSignal, signal);
});

test("CODEX-EDIT-PILOT-MCP-03: actual MCP registration hides the default-off tool and enforces its strict empty schema", async () => {
  const disabledServer = createSubagentMcpServer({ runtime: {}, configuration: {}, trustedWorkspace: process.cwd() });
  const disabledNames = await listMcpToolNames(disabledServer);
  assert.equal(disabledNames.includes("run_codex_profile_edit_pilot"), false);
  let runtimeCalls = 0;
  const enabledServer = createSubagentMcpServer({
    runtime: { runCodexProfileEditPilot: async () => { runtimeCalls += 1; return createSuccessResult(); } },
    configuration: { orchestration: { acceptancePilots: { codexProfileEdit: { enabled: true } } } },
    trustedWorkspace: process.cwd()
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "codex-edit-pilot-contract-test", version: "1.0.0" });
  await enabledServer.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const { tools } = await client.listTools();
    const pilot = tools.find((tool) => tool.name === "run_codex_profile_edit_pilot");
    assert.ok(pilot);
    assert.deepEqual(pilot.inputSchema.properties, {});
    assert.deepEqual(pilot.inputSchema.required || [], []);
    const rejected = await client.callTool({ name: "run_codex_profile_edit_pilot", arguments: { files: [fixturePath] } });
    assert.equal(rejected.isError, true);
    assert.equal(runtimeCalls, 0);
    const accepted = await client.callTool({ name: "run_codex_profile_edit_pilot", arguments: {} });
    assert.equal(accepted.isError, false);
    assert.equal(accepted.structuredContent.applied, false);
    assert.equal(accepted.structuredContent.fallbacks, 0);
    assert.equal(runtimeCalls, 1);
  } finally {
    await client.close();
  }
});

async function listMcpToolNames(server) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "codex-edit-pilot-registration-test", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const { tools } = await client.listTools();
    return tools.map((tool) => tool.name);
  } finally {
    await client.close();
  }
}

test("CODEX-EDIT-PILOT-RUNTIME-01: successful pilot changes only its disposable fixture and sends fixed host limits", async (t) => {
  const { root, target } = createFixtureRoot();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let processStarts = 0;
  let processOptions;
  let processArgs;
  const codexAdapter = createCodexAdapter(configuration(root), {
    runProcess: async (executable, args, options) => {
      processStarts += 1;
      processOptions = options;
      processArgs = args;
      assert.equal(executable, "codex");
      assert.notEqual(options.cwd, root);
      assert.equal(fs.existsSync(path.join(options.cwd, fixturePath)), true);
      assert.equal(fs.existsSync(path.join(options.cwd, ".git")), false);
      fs.writeFileSync(path.join(options.cwd, fixturePath), "after\n", "utf8");
      return {
        stdout: `${JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "updated fixture" } })}\n${JSON.stringify({ type: "turn.completed" })}\n`,
        stderr: "",
        code: 0,
        signal: null,
        durationMs: 1
      };
    }
  });
  const runtime = createBridgeRuntime({
    configuration: configuration(root),
    adapters: { codex: codexAdapter },
    sleep: async () => {}
  });
  const result = await runtime.runCodexProfileEditPilot(root);
  assert.equal(result.status, "completed", JSON.stringify(result));
  assert.equal(result.applied, false);
  assert.equal(result.preview, true);
  assert.equal(result.fallbacks, 0);
  assert.equal(result.model, "gpt-6.1-sol");
  assert.equal(result.sourceFileSha256Before, createHash("sha256").update("before\n").digest("hex"));
  assert.equal(result.sourceFileSha256After, result.sourceFileSha256Before);
  assert.equal(result.disposableFileSha256, createHash("sha256").update("after\n").digest("hex"));
  assert.ok(result.changeSetHash);
  assert.equal(processStarts, 1);
  assert.equal(processOptions.timeoutMs, 60000);
  assert.equal(processOptions.maxOutputBytes, 65536);
  assert.equal(path.basename(processOptions.cwd), "workspace");
  assert.equal(processArgs.includes("--skip-git-repo-check"), true);
  assert.equal(processArgs.includes("--add-dir"), false);
  assert.equal(processArgs.includes(root), false);
  assert.equal(processArgs.includes("sandbox_workspace_write.network_access=false"), true);
  assert.equal(fs.readFileSync(target, "utf8"), "before\n");
  assert.deepEqual(fs.readdirSync(path.join(root, "cache", "deepseek-edit-pilot")), []);
});

test("CODEX-EDIT-PILOT-RUNTIME-02: adapter failures never retry or fall back", async (t) => {
  for (const failure of [
    { name: "timeout", process: async () => { throw Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }); } },
    { name: "empty output", process: async () => ({ stdout: "", stderr: "", code: 0, signal: null }) },
    { name: "schema failure", process: async () => ({ stdout: "not-json\n", stderr: "", code: 0, signal: null }) },
    { name: "output limit", process: async () => { throw Object.assign(new Error("overflow"), { failureClass: "output_limit" }); } },
    { name: "transient error", process: async () => { throw Object.assign(new Error("temporary"), { code: "ECONNRESET" }); } }
  ]) {
    await t.test(failure.name, async (t) => {
      const { root, target } = createFixtureRoot();
      t.after(() => fs.rmSync(root, { recursive: true, force: true }));
      let processStarts = 0;
      const codexAdapter = createCodexAdapter(configuration(root), {
        runProcess: async () => { processStarts += 1; return failure.process(); }
      });
      const runtime = createBridgeRuntime({
        configuration: configuration(root),
        adapters: { codex: codexAdapter, deepseek: createFakeAdapter(async () => { throw new Error("fallback must not run"); }) },
        sleep: async () => {}
      });
      const result = await runtime.runCodexProfileEditPilot(root);
      assert.equal(result.status, "failed");
      assert.equal(result.applied, false);
      assert.equal(result.fallbacks, 0);
      assert.equal(result.cleanupCompleted, true);
      assert.equal(processStarts, 1);
      assert.equal(fs.readFileSync(target, "utf8"), "before\n");
    });
  }
});

test("CODEX-EDIT-PILOT-RUNTIME-03: missing fixed fixture is rejected before the adapter starts", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-profile-edit-pilot-preflight-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let adapterCalls = 0;
  const runtime = createBridgeRuntime({
    configuration: configuration(root),
    adapters: { codex: createFakeAdapter(async () => { adapterCalls += 1; return createSuccessSubagentResult("codex", "gpt-6.1-sol", { result: "unexpected" }); }) },
    sleep: async () => {}
  });
  const result = await runtime.runCodexProfileEditPilot(root);
  assert.equal(result.status, "failed");
  assert.equal(result.applied, false);
  assert.equal(result.fallbacks, 0);
  assert.equal(adapterCalls, 0);
});

test("CODEX-EDIT-PILOT-RUNTIME-04: unexpected disposable content fails host acceptance and preserves the source", async (t) => {
  const { root, target } = createFixtureRoot();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let processStarts = 0;
  const codexAdapter = createCodexAdapter(configuration(root), {
    runProcess: async (_executable, args, options) => {
      if (args.at(-1) !== "-") return { stdout: "codex 0.163.0", stderr: "", code: 0, signal: null };
      processStarts += 1;
      fs.writeFileSync(path.join(options.cwd, fixturePath), "unexpected\n", "utf8");
      return {
        stdout: `${JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "changed" } })}\n${JSON.stringify({ type: "turn.completed" })}\n`,
        stderr: "",
        code: 0,
        signal: null,
        durationMs: 1
      };
    }
  });
  const runtime = createBridgeRuntime({ configuration: configuration(root), adapters: { codex: codexAdapter }, sleep: async () => {} });
  const result = await runtime.runCodexProfileEditPilot(root);
  assert.equal(result.status, "failed");
  assert.equal(result.failureClass, "acceptance_failed", JSON.stringify(result));
  assert.equal(result.applied, false);
  assert.equal(result.cleanupCompleted, true);
  assert.equal(result.diff, "");
  assert.equal(processStarts, 1);
  assert.equal(fs.readFileSync(target, "utf8"), "before\n");
});

test("CODEX-EDIT-PILOT-RUNTIME-05: changed source fixture is rejected before the adapter starts", async (t) => {
  const { root, target } = createFixtureRoot();
  fs.writeFileSync(target, "changed\n", "utf8");
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let processStarts = 0;
  const runtime = createBridgeRuntime({
    configuration: configuration(root),
    adapters: { codex: createCodexAdapter(configuration(root), { runProcess: async () => { processStarts += 1; throw new Error("provider must not run"); } }) },
    sleep: async () => {}
  });
  const result = await runtime.runCodexProfileEditPilot(root);
  assert.equal(result.status, "failed");
  assert.equal(result.failureClass, "fixture_precondition_failed");
  assert.equal(result.applied, false);
  assert.ok(result.sourceFileSha256Before);
  assert.equal(result.sourceFileSha256After, undefined);
  assert.equal(processStarts, 0);
  assert.equal(fs.readFileSync(target, "utf8"), "changed\n");
});

test("CODEX-EDIT-PILOT-RUNTIME-07: linked or oversized source fixture is rejected before the adapter starts", async (t) => {
  for (const sourceState of ["hardlink", "symlink", "oversized"]) {
    await t.test(sourceState, async (t) => {
      const { root, target } = createFixtureRoot();
      const externalRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-profile-edit-pilot-external-"));
      const externalPath = path.join(externalRoot, "external-target.txt");
      t.after(() => fs.rmSync(root, { recursive: true, force: true }));
      t.after(() => fs.rmSync(externalRoot, { recursive: true, force: true }));
      fs.rmSync(target);
      fs.writeFileSync(externalPath, "external\n");
      if (sourceState === "hardlink") fs.linkSync(externalPath, target);
      else if (sourceState === "symlink") {
        try {
          fs.symlinkSync(externalPath, target, "file");
        } catch (error) {
          if (process.platform === "win32" && ["EPERM", "EACCES"].includes(error.code)) return t.skip("file symlink creation requires Windows symlink privileges");
          throw error;
        }
      } else fs.writeFileSync(target, Buffer.alloc(1048577, 65));
      let processStarts = 0;
      const runtime = createBridgeRuntime({
        configuration: configuration(root),
        adapters: { codex: createCodexAdapter(configuration(root), { runProcess: async () => { processStarts += 1; throw new Error("provider must not run"); } }) },
        sleep: async () => {}
      });
      const result = await runtime.runCodexProfileEditPilot(root);
      assert.equal(result.status, "failed");
      assert.equal(result.failureClass, "fixture_precondition_failed");
      assert.equal(result.sourceFileSha256Before, undefined);
      assert.equal(result.sourceFileSha256After, undefined);
      assert.equal(processStarts, 0);
    });
  }
});

test("CODEX-EDIT-PILOT-RUNTIME-06: source fixture mutation during the provider run fails closed", async (t) => {
  const { root, target } = createFixtureRoot();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let processStarts = 0;
  const codexAdapter = createCodexAdapter(configuration(root), {
    runProcess: async (_executable, args, options) => {
      if (args.at(-1) !== "-") return { stdout: "codex 0.163.0", stderr: "", code: 0, signal: null };
      processStarts += 1;
      fs.writeFileSync(path.join(options.cwd, fixturePath), "after\n", "utf8");
      fs.writeFileSync(target, "external-change\n", "utf8");
      return {
        stdout: `${JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "changed" } })}\n${JSON.stringify({ type: "turn.completed" })}\n`,
        stderr: "",
        code: 0,
        signal: null,
        durationMs: 1
      };
    }
  });
  const runtime = createBridgeRuntime({ configuration: configuration(root), adapters: { codex: codexAdapter }, sleep: async () => {} });
  const result = await runtime.runCodexProfileEditPilot(root);
  assert.equal(result.status, "failed");
  assert.equal(result.failureClass, "source_workspace_changed");
  assert.equal(result.applied, false);
  assert.equal(result.fallbacks, 0);
  assert.notEqual(result.sourceFileSha256After, result.sourceFileSha256Before);
  assert.equal(processStarts, 1);
  assert.equal(fs.readFileSync(target, "utf8"), "external-change\n");
});

test("CODEX-EDIT-PILOT-RUNTIME-08: unsafe post-run source fixture is rejected without returning its hash", async (t) => {
  const { root, target } = createFixtureRoot();
  const externalRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-profile-edit-pilot-external-"));
  const externalPath = path.join(externalRoot, "external-source-content.txt");
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  t.after(() => fs.rmSync(externalRoot, { recursive: true, force: true }));
  let processStarts = 0;
  const codexAdapter = createCodexAdapter(configuration(root), {
    runProcess: async (_executable, args, options) => {
      if (args.at(-1) !== "-") return { stdout: "codex 0.163.0", stderr: "", code: 0, signal: null };
      processStarts += 1;
      fs.writeFileSync(path.join(options.cwd, fixturePath), "after\n", "utf8");
      fs.writeFileSync(externalPath, "external-source-content\n", "utf8");
      fs.rmSync(target);
      fs.linkSync(externalPath, target);
      return {
        stdout: `${JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "changed" } })}\n${JSON.stringify({ type: "turn.completed" })}\n`,
        stderr: "",
        code: 0,
        signal: null,
        durationMs: 1
      };
    }
  });
  const runtime = createBridgeRuntime({ configuration: configuration(root), adapters: { codex: codexAdapter }, sleep: async () => {} });
  const result = await runtime.runCodexProfileEditPilot(root);
  assert.equal(result.status, "failed");
  assert.equal(result.failureClass, "source_workspace_changed");
  assert.equal(result.applied, false);
  assert.equal(result.diff, "");
  assert.ok(result.sourceFileSha256Before);
  assert.equal(result.sourceFileSha256After, undefined);
  assert.equal(JSON.stringify(result).includes("external-source-content"), false);
  assert.equal(processStarts, 1);
  assert.equal(fs.readFileSync(externalPath, "utf8"), "external-source-content\n");
});

test("CODEX-EDIT-PILOT-ADAPTER-01: pilot ignores configured extra CLI arguments and disables sandbox networking", () => {
  const command = buildCodexArgs({ caller: "codex_profile_edit_pilot", mode: "edit", model: "gpt-6.1-sol", workspace: "C:\\temporary\\fixture", prompt: "fixed" }, {
    codex: { executable: "codex", execArgs: ["--add-dir", "C:\\private", "--json"] }
  });
  assert.equal(command.args.includes("--add-dir"), false);
  assert.equal(command.args.includes("C:\\private"), false);
  assert.equal(command.args.includes("--json"), true);
  assert.equal(command.args.includes("--skip-git-repo-check"), true);
  assert.equal(command.args.includes("sandbox_workspace_write.network_access=false"), true);
  assert.equal(command.args.at(-1), "-");
});
