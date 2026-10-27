import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createAdapter } from "../subagent-bridge/src/adapters/agent-adapter-base.js";
import { buildAntigravityArgs } from "../subagent-bridge/src/adapters/antigravity-adapter.js";
import { createSubagentMcpServer } from "../subagent-bridge/src/frontends/mcp/server.js";
import { createBridgeRuntime } from "../subagent-bridge/src/runtime/bridge-runtime.js";
import { createFailureSubagentResult, createSuccessSubagentResult } from "../subagent-bridge/src/schemas/core-schemas.js";
import { createMcpToolHandlers, publicToolSchemas } from "../subagent-bridge/src/frontends/mcp/tools.js";
import { validateClaudeSonnetAcceptanceOutput } from "../subagent-bridge/src/services/claude-sonnet-acceptance.js";
import { evaluateClaudeSonnetAcceptance } from "./support/claude-sonnet-acceptance.js";

function configuration(root) {
  return {
    statePaths: { logs: path.join(root, "logs"), state: path.join(root, "state"), cache: path.join(root, "cache") },
    allowedRoots: [root],
    antigravity: { timeoutMs: 300000, maxRetries: 2, defaultMode: "read_only", allowedModes: ["read_only"] },
    orchestration: {
      taskProfiles: { acceptanceFallback: { target: "claude_sonnet", model: "claude_sonnet", mode: "read_only", priority: 1, cacheable: false, fallbackTargets: [{ target: "antigravity", model: "gemini_flash_3_8" }] } },
      acceptancePilots: { claudeSonnet: { enabled: true } },
      scheduler: { maxQueuedPerWorkspace: 10, staleLockMs: 60000, leaseHeartbeatMs: 1000 },
      readOnlyCache: { enabled: false, ttlMs: 1000, maxEntryBytes: 1024 },
      circuitBreaker: { failureThreshold: 5, windowMs: 60000, openMs: 30000 }
    },
    reliability: { maxAttempts: 3, maxSchemaRepairAttempts: 2, maxRetryCostUsd: 1, maxRetryCostReserveUsd: 0.1, maxUnknownAttemptCostUsd: 0.1, baseRetryDelayMs: 1, maxRetryDelayMs: 2, maxTotalDurationMs: 300000 },
    state: {}
  };
}

function fakeAdapter(execute) {
  const adapter = createAdapter("antigravity", { canRead: true, canWrite: true, supportsSandbox: true, supportsModelSelection: true });
  adapter.execute = execute;
  return adapter;
}

function validPilotResult(request) {
  return createSuccessSubagentResult("antigravity", request.model, {
    requestedModel: "claude_sonnet",
    resolvedModel: "claude-sonnet-4-6",
    result: "{\"result\":42}",
    webEvidence: null,
    metrics: { totalCostUsd: null, diagnostics: { stdoutBytes: 20 } }
  });
}

test("Claude Sonnet pilot MCP surface is fixed, strict, and disabled by default", async (t) => {
  assert.equal(publicToolSchemas.runClaudeSonnetAcceptancePilot.safeParse({}).success, true);
  assert.equal(publicToolSchemas.runClaudeSonnetAcceptancePilot.safeParse({ prompt: "override" }).success, false);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claude-sonnet-pilot-tool-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let calls = 0;
  const disabled = createMcpToolHandlers({ runtime: { run: async () => { calls += 1; } }, trustedWorkspace: root, configuration: { orchestration: { acceptancePilots: { claudeSonnet: { enabled: false } } } } });
  await assert.rejects(disabled.runClaudeSonnetAcceptancePilot(), /disabled/u);
  assert.equal(calls, 0);
});

test("Claude Sonnet pilot fixes model, task, context and output cap at the host", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claude-sonnet-pilot-host-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let request;
  const handlers = createMcpToolHandlers({ runtime: { run: async (value) => { request = value; return validPilotResult(value); } }, trustedWorkspace: root, configuration: { orchestration: { acceptancePilots: { claudeSonnet: { enabled: true } } } } });
  const response = await handlers.runClaudeSonnetAcceptancePilot({});
  assert.equal(response.isError, false);
  assert.equal(request.target, "claude_sonnet");
  assert.equal(request.model, "claude_sonnet");
  assert.equal(request.mode, "read_only");
  assert.equal(request.timeoutMs, 60000);
  assert.equal(request.maxOutputBytes, 65536);
  assert.equal(request.claudeSonnetAcceptancePilot, true);
  assert.equal(request.profile, undefined);
  assert.equal(request.prompt.includes("6 × 7"), true);
});

test("Claude Sonnet pilot strict empty input is enforced by the actual MCP client before runtime", async () => {
  let runtimeCalls = 0;
  const server = createSubagentMcpServer({
    runtime: { run: async (request) => { runtimeCalls += 1; return validPilotResult(request); } },
    trustedWorkspace: process.cwd(),
    configuration: { orchestration: { acceptancePilots: { claudeSonnet: { enabled: true } } } }
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "claude-sonnet-pilot-contract-test", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const { tools } = await client.listTools();
    const pilot = tools.find((tool) => tool.name === "run_claude_sonnet_acceptance_pilot");
    assert.ok(pilot);
    assert.deepEqual(pilot.inputSchema.properties, {});
    assert.deepEqual(pilot.inputSchema.required || [], []);
    const rejected = await client.callTool({ name: "run_claude_sonnet_acceptance_pilot", arguments: { prompt: "override" } });
    assert.equal(rejected.isError, true);
    assert.equal(runtimeCalls, 0);
    const accepted = await client.callTool({ name: "run_claude_sonnet_acceptance_pilot", arguments: {} });
    assert.equal(accepted.isError, false);
    assert.equal(runtimeCalls, 1);
  } finally {
    await client.close();
  }
});

test("Claude Sonnet pilot makes at most one adapter attempt for every terminal outcome", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claude-sonnet-pilot-count-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const outcomes = [
    { name: "success", result: (request) => validPilotResult(request) },
    { name: "timeout", result: (request) => createFailureSubagentResult("antigravity", request.model, { requestedModel: request.model, error: "execution timed out", retryable: true, timedOut: true, exitCode: null, reason: "timeout" }) },
    { name: "transient", result: (request) => createFailureSubagentResult("antigravity", request.model, { requestedModel: request.model, error: "temporary provider failure", retryable: true, exitCode: 1, reason: "server" }) },
    { name: "empty", result: (request) => createFailureSubagentResult("antigravity", request.model, { requestedModel: request.model, error: "empty output", retryable: true, exitCode: 0, reason: "empty_output" }) },
    { name: "malformed carrier", result: (request) => createFailureSubagentResult("antigravity", request.model, { requestedModel: request.model, error: "carrier parse failed", retryable: true, exitCode: 1, reason: "output_parse_invalid" }) }
  ];
  for (const outcome of outcomes) {
    let attempts = 0;
    let fallbackAttempts = 0;
    const adapter = fakeAdapter(async (request) => { attempts += 1; return outcome.result(request); });
    const runtime = createBridgeRuntime({ configuration: configuration(root), adapters: { antigravity: adapter }, sleep: async () => {} });
    const result = await runtime.run({ target: "profile", prompt: "fixed", profile: "acceptanceFallback", mode: "read_only", caller: "codexDesktop", delegationDepth: 0, trustedWorkspace: root, timeoutMs: 60000, maxOutputBytes: 65536, claudeSonnetAcceptancePilot: true, resultValidator: validateClaudeSonnetAcceptanceOutput });
    if (result.metrics?.fallbacks) fallbackAttempts += result.metrics.fallbacks;
    assert.equal(attempts, 1, `${outcome.name} retried adapter`);
    assert.equal(fallbackAttempts, 0, `${outcome.name} used fallback`);
    assert.equal(result.metrics?.adapterAttempts, 1, `${outcome.name} adapter metric mismatch`);
    if (outcome.name === "success") assert.equal(evaluateClaudeSonnetAcceptance({ isError: false, structuredContent: result }).accepted, true, JSON.stringify(result));
    else assert.equal(result.ok, false, `${outcome.name} should fail closed`);
  }
});

test("pilot CLI args omit workspace grants while normal Antigravity calls retain them", () => {
  const base = { model: "claude_sonnet", mode: "read_only", workspace: "C:\\workspace", prompt: "fixed" };
  const pilotArgs = buildAntigravityArgs({ ...base, noWorkspaceContext: true }, { antigravity: { executable: "agy" } }).args;
  const normalArgs = buildAntigravityArgs(base, { antigravity: { executable: "agy" } }).args;
  assert.equal(pilotArgs.includes("--add-dir"), false);
  assert.equal(normalArgs.includes("--add-dir"), true);
});

test("Antigravity adapter starts one fake provider CLI without granting workspace context", async (t) => {
  const fixturePath = fileURLToPath(new URL("./fixtures/claude-sonnet-pilot-read-only-fixture.js", import.meta.url));
  for (const scenario of ["preflight_failure", "preflight_spawn_failure", "preflight_non_spawn_permission_failure", "temporary_workspace_failure", "success", "valid_response_carrier", "invalid_task_json", "wrong_task_type", "wrong_carrier_type", "missing_carrier_result", "empty_output", "truncated_output", "multiple_output_records", "provider_failure", "provider_spawn_failure"]) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "claude-sonnet-pilot-cli-"));
    const temporaryDirectory = path.join(root, "temporary");
    fs.mkdirSync(temporaryDirectory);
    try {
      const child = spawnSync(process.execPath, [fixturePath], {
        cwd: process.cwd(),
        env: {
          PATH: process.env.PATH,
          SystemRoot: process.env.SystemRoot,
          USERPROFILE: root,
          HOME: root,
          APPDATA: path.join(root, "roaming"),
          LOCALAPPDATA: path.join(root, "local"),
          TEMP: temporaryDirectory,
          TMP: temporaryDirectory,
          TMPDIR: temporaryDirectory,
          PILOT_FIXTURE_ROOT: root,
          PILOT_SCENARIO: scenario
        },
        encoding: "utf8",
        timeout: 10000
      });
      assert.equal(child.status, 0, child.stderr);
      const result = JSON.parse(child.stdout);
      assert.equal(result.strictSchemaPassed, true);
      assert.equal(result.preflightCalls, 1);
      assert.equal(result.adapterAttempts, 1);
      assert.equal(result.runtimeRetries, 0);
      assert.equal(result.repairDisabled, true);
      assert.equal(result.fallbackAttempts, 0);
      assert.equal(result.telemetryWriteStatus, "written");
      assert.equal(result.telemetryWriteFailureClass, "none");
      assert.equal(result.recentRunCount, 1);
      assert.equal(result.recentRunSourceStatus, "available");
      assert.equal(result.readOnlyStateRestored, true);
      if (scenario === "preflight_failure") {
        assert.equal(result.providerPurposeStarts, 0);
        assert.equal(result.reason, "read_only_mcp_isolation_unavailable");
        assert.equal(result.failureStage, "mcp_preflight");
        assert.equal(result.recentFailureClass, "read_only_mcp_isolation_unavailable");
        assert.equal(result.recentFailureStage, "mcp_preflight");
        assert.equal(result.recentProviderCode, null);
        assert.equal(result.recentExitCode, 1);
      } else if (scenario === "preflight_spawn_failure") {
        assert.equal(result.providerPurposeStarts, 0);
        assert.equal(result.reason, "permission_denied");
        assert.equal(result.failureStage, "mcp_preflight");
        assert.equal(result.providerFailureDiagnostics.providerCode, "permission_denied");
        assert.equal(result.providerFailureDiagnostics.osErrorCode, "EPERM");
        assert.equal(result.recentFailureClass, "permission_denied");
        assert.equal(result.recentFailureStage, "mcp_preflight");
        assert.equal(result.recentProviderCode, "permission_denied");
        assert.equal(result.recentOsErrorCode, "EPERM");
        assert.equal(result.recentExitCode, null);
      } else if (scenario === "preflight_non_spawn_permission_failure") {
        assert.equal(result.providerPurposeStarts, 0);
        assert.equal(result.reason, "permission_denied");
        assert.equal(result.failureStage, "mcp_preflight");
        assert.equal(result.providerFailureDiagnostics.providerCode, "permission_denied");
        assert.equal(result.providerFailureDiagnostics.osErrorCode, "EPERM");
        assert.equal(result.recentFailureClass, "permission_denied");
        assert.equal(result.recentFailureStage, "mcp_preflight");
        assert.equal(result.recentProviderCode, "permission_denied");
        assert.equal(result.recentOsErrorCode, "EPERM");
      } else if (scenario === "temporary_workspace_failure") {
        assert.equal(result.providerPurposeStarts, 0);
        assert.equal(result.reason, "permission_denied");
        assert.equal(result.failureStage, "workspace_setup");
        assert.equal(result.providerFailureDiagnostics.providerCode, "permission_denied");
        assert.equal(result.providerFailureDiagnostics.osErrorCode, "EPERM");
        assert.equal(result.providerFailureDiagnostics.exitCode, null);
        assert.equal(result.providerFailureDiagnostics.providerExecutionMs, null);
        assert.equal(result.recentFailureClass, "permission_denied");
        assert.equal(result.recentFailureStage, "workspace_setup");
        assert.equal(result.recentProviderCode, "permission_denied");
        assert.equal(result.recentOsErrorCode, "EPERM");
        assert.equal(result.recentExitCode, null);
      } else if (!["preflight_failure", "preflight_spawn_failure", "preflight_non_spawn_permission_failure", "temporary_workspace_failure", "provider_spawn_failure"].includes(scenario)) {
        assert.equal(result.providerPurposeStarts, 1);
        assert.equal(result.readOnlyEnforcementObserved, true);
        assert.equal(result.settingsLockObserved, true);
        assert.equal(result.readOnlyPlanMode, true);
        assert.equal(result.emptyTemporaryCwd, true);
        assert.equal(result.workspaceGrantAbsent, true);
        assert.equal(result.temporaryCwdRemoved, true);
      }
      if (scenario === "success" || scenario === "valid_response_carrier") {
        assert.equal(result.mcpIsError, false);
        assert.equal(result.acceptancePassed, true);
        assert.equal(result.recentFailureClass, null);
        assert.equal(result.recentFailureStage, null);
        assert.equal(result.recentOutputIntegrity, "complete");
        assert.equal(result.recentTaskCompletion, "completed");
        assert.equal(result.requestedModel, "claude_sonnet");
        assert.equal(result.resolvedModel, "claude-sonnet-4-6", scenario);
        assert.equal(result.outputIntegrity, "complete");
        assert.equal(result.taskCompletion, "completed");
      }
      if (scenario === "invalid_task_json" || scenario === "wrong_task_type") {
        assert.equal(result.mcpIsError, true);
        assert.equal(result.acceptancePassed, false);
        assert.equal(result.reason, "schema_invalid");
        assert.equal(result.failureStage, "result_parse");
        assert.equal(result.requestedModel, "claude_sonnet");
        assert.equal(result.resolvedModel, "claude-sonnet-4-6", scenario);
        assert.equal(result.outputIntegrity, "complete");
        assert.equal(result.taskCompletion, "partial");
        assert.equal(result.recentFailureClass, "schema_invalid");
        assert.equal(result.recentFailureStage, "result_parse");
        assert.equal(result.recentOutputIntegrity, "complete");
        assert.equal(result.recentTaskCompletion, "partial");
      }
      if (["wrong_carrier_type", "missing_carrier_result", "truncated_output", "multiple_output_records"].includes(scenario)) {
        assert.equal(result.mcpIsError, true);
        assert.equal(result.acceptancePassed, false);
        assert.equal(result.reason, "output_parse_invalid");
        assert.equal(result.failureStage, "result_parse");
        assert.equal(result.requestedModel, "claude_sonnet");
        assert.equal(result.resolvedModel, "claude-sonnet-4-6", scenario);
        assert.equal(result.outputIntegrity, "complete");
        assert.equal(result.taskCompletion, "partial");
        assert.equal(result.recentFailureClass, "output_parse_invalid");
        assert.equal(result.recentFailureStage, "result_parse");
        assert.equal(result.recentOutputIntegrity, "complete");
        assert.equal(result.recentTaskCompletion, "partial");
      }
      if (scenario === "empty_output") {
        assert.equal(result.mcpIsError, true);
        assert.equal(result.acceptancePassed, false);
        assert.equal(result.reason, "empty_output");
        assert.equal(result.failureStage, "result_parse");
        assert.equal(result.providerFailureDiagnostics.providerCode, "empty_output");
      }
      if (scenario === "provider_failure") {
        assert.equal(result.mcpIsError, true);
        assert.equal(result.acceptancePassed, false);
        assert.equal(result.providerFailureDiagnostics.failureClass, "process_exit");
        assert.equal(result.providerFailureDiagnostics.failureStage, "provider_process_exit");
        assert.equal(result.providerFailureDiagnostics.providerCode, "process_exit");
        assert.equal(result.providerFailureDiagnostics.exitCode, 1);
        assert.equal(result.providerFailureDiagnostics.timedOut, false);
        assert.equal(result.providerFailureDiagnostics.stdoutBytes, 0);
        assert.equal(result.providerFailureDiagnostics.stderrBytes, 0);
        assert.equal(typeof result.providerFailureDiagnostics.durationMs, "number");
        assert.equal(result.recentFailureClass, "process_exit");
        assert.equal(result.recentFailureStage, "provider_process_exit");
        assert.equal(result.recentProviderCode, "process_exit");
        assert.equal(result.recentExitCode, 1);
      }
      if (scenario === "provider_spawn_failure") {
        assert.equal(result.providerPurposeStarts, 1);
        assert.equal(result.mcpIsError, true);
        assert.equal(result.acceptancePassed, false);
        assert.equal(result.providerFailureDiagnostics.failureClass, "permission_denied");
        assert.equal(result.providerFailureDiagnostics.failureStage, "process_spawn");
        assert.equal(result.providerFailureDiagnostics.providerCode, "permission_denied");
        assert.equal(result.providerFailureDiagnostics.osErrorCode, "EPERM");
        assert.equal(result.providerFailureDiagnostics.exitCode, null);
        assert.equal(result.providerFailureDiagnostics.timedOut, false);
        assert.equal(result.recentFailureClass, "permission_denied");
        assert.equal(result.recentFailureStage, "process_spawn");
        assert.equal(result.recentProviderCode, "permission_denied");
        assert.equal(result.recentOsErrorCode, "EPERM");
        assert.equal(result.recentExitCode, null);
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test("ordinary Antigravity requests keep the configured retry behavior", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claude-sonnet-pilot-normal-retry-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let attempts = 0;
  const adapter = fakeAdapter(async (request) => {
    attempts += 1;
    if (attempts === 1) return createFailureSubagentResult("antigravity", request.model, { error: "temporary provider failure", retryable: true, exitCode: 1, reason: "server" });
    return validPilotResult(request);
  });
  const runtime = createBridgeRuntime({ configuration: configuration(root), adapters: { antigravity: adapter }, sleep: async () => {} });
  const result = await runtime.run({ target: "claude_sonnet", prompt: "ordinary read-only task", model: "claude_sonnet", mode: "read_only", caller: "codexDesktop", delegationDepth: 0, trustedWorkspace: root, timeoutMs: 60000 });
  assert.equal(result.ok, true);
  assert.equal(attempts, 2);
  assert.equal(result.metrics.adapterAttempts, 2);
});
