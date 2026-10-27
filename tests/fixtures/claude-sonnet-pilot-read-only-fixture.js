import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createAntigravityAdapter } from "../../subagent-bridge/src/adapters/antigravity-adapter.js";
import { createBridgeRuntime } from "../../subagent-bridge/src/runtime/bridge-runtime.js";
import { validateSubagentResult } from "../../subagent-bridge/src/schemas/core-schemas.js";
import { createMcpToolHandlers } from "../../subagent-bridge/src/frontends/mcp/tools.js";
import { readRecentRuns } from "../../subagent-bridge/src/recent-runs.js";
import { evaluateClaudeSonnetAcceptance } from "../support/claude-sonnet-acceptance.js";

const root = process.env.PILOT_FIXTURE_ROOT;
const scenario = process.env.PILOT_SCENARIO;
const settingsDirectory = path.join(os.homedir(), ".gemini", "antigravity-cli");
const settingsPath = path.join(settingsDirectory, "settings.json");
const settingsLockPath = path.join(settingsDirectory, "settings.lock");
const settingsSentinelPath = path.join(os.tmpdir(), "agy-bridge-readonly-sentinel");
const initialSettings = Buffer.from(JSON.stringify({
  allowNonWorkspaceAccess: true,
  permissions: { allow: [], deny: [] }
}, null, 2));
const processCalls = [];
const processObservations = [];
let providerPurposeStarts = 0;

assert.equal(typeof root, "string");
assert.equal(["preflight_failure", "preflight_spawn_failure", "preflight_non_spawn_permission_failure", "temporary_workspace_failure", "success", "valid_response_carrier", "invalid_task_json", "wrong_task_type", "wrong_carrier_type", "missing_carrier_result", "empty_output", "truncated_output", "multiple_output_records", "provider_failure", "provider_spawn_failure"].includes(scenario), true);
fs.mkdirSync(settingsDirectory, { recursive: true });
fs.writeFileSync(settingsPath, initialSettings);
const originalMkdtempSync = fs.mkdtempSync;
if (scenario === "temporary_workspace_failure") {
  fs.mkdtempSync = (prefix, ...options) => {
    if (String(prefix).includes("hades-claude-sonnet-pilot-")) {
      const error = new Error("Operation not permitted");
      error.code = "EPERM";
      throw error;
    }
    return originalMkdtempSync(prefix, ...options);
  };
}

const adapter = createAntigravityAdapter({
  antigravity: {
    executable: "fake-agy",
    defaultSandbox: true,
    maxOutputBytes: 65536,
    timeoutMs: 60000
  }
}, {
  runProcess: async (executable, args, options) => {
    processCalls.push({ executable, args, options });
    if (args.includes("mcp") && args.includes("list")) {
      if (scenario === "preflight_spawn_failure") {
        const error = new Error("spawn fake-agy EPERM");
        error.code = "EPERM";
        error.syscall = "spawn fake-agy";
        throw error;
      }
      if (scenario === "preflight_non_spawn_permission_failure") {
        const error = new Error("open fake-agy EPERM");
        error.code = "EPERM";
        error.syscall = "open";
        throw error;
      }
      return {
        code: 0,
        stdout: scenario === "preflight_failure" ? "Unexpected MCP listing" : "No MCP servers configured.\n",
        stderr: "",
        signal: null
      };
    }
    if (!args.includes("--print")) throw new Error("unexpected fake process purpose");
    providerPurposeStarts += 1;
    if (scenario === "provider_spawn_failure") {
      const error = new Error("spawn fake-agy EPERM");
      error.code = "EPERM";
      error.syscall = "spawn fake-agy";
      throw error;
    }
    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    processObservations.push({
      executable,
      args,
      options,
      readOnlyEnforcement: settings.allowNonWorkspaceAccess === false
        && settings.permissions?.deny?.includes("write_file(*)") === true,
      settingsLock: fs.existsSync(settingsLockPath),
      settingsSentinel: fs.existsSync(settingsSentinelPath),
      temporaryCwd: options.cwd,
      emptyTemporaryCwd: typeof options.cwd === "string"
        && path.resolve(options.cwd) !== path.resolve(root)
        && path.resolve(options.cwd).startsWith(`${path.resolve(os.tmpdir())}${path.sep}`)
        && fs.existsSync(options.cwd)
        && fs.readdirSync(options.cwd).length === 0
    });
    if (scenario === "provider_failure") return { code: 1, stdout: "", stderr: "", signal: null };
    if (scenario === "empty_output") return { code: 0, stdout: "", stderr: "", signal: null };
    if (scenario === "truncated_output") return { code: 0, stdout: '{"structured_output":{"result":', stderr: "", signal: null };
    if (scenario === "multiple_output_records") return { code: 0, stdout: `${JSON.stringify({ response: "first" })}\n${JSON.stringify({ response: "second" })}`, stderr: "", signal: null };
    const outputByScenario = {
      success: { structured_output: { result: "{\"result\":42}", webEvidence: null } },
      valid_response_carrier: { response: "{\"result\":\"{\\\"result\\\":42}\",\"webEvidence\":null}" },
      invalid_task_json: { structured_output: { result: "{\"result\":42", webEvidence: null } },
      wrong_task_type: { structured_output: { result: "{\"result\":\"42\"}", webEvidence: null } },
      wrong_carrier_type: { structured_output: { result: 42, webEvidence: null } },
      missing_carrier_result: { structured_output: { webEvidence: null } },
      preflight_failure: { response: "unused" },
      preflight_spawn_failure: { response: "unused" },
      preflight_non_spawn_permission_failure: { response: "unused" },
      temporary_workspace_failure: { response: "unused" },
      provider_spawn_failure: { response: "unused" }
    };
    return { code: 0, stdout: JSON.stringify(outputByScenario[scenario]), stderr: "", signal: null };
  }
});

const configuration = {
  statePaths: {
    logs: path.join(root, "logs"),
    state: path.join(root, "state"),
    cache: path.join(root, "cache")
  },
  allowedRoots: [root],
  antigravity: { executable: "fake-agy", timeoutMs: 60000, maxRetries: 2, defaultMode: "read_only", allowedModes: ["read_only"] },
  orchestration: {
    acceptancePilots: { claudeSonnet: { enabled: true } },
    taskProfiles: {},
    scheduler: { maxQueuedPerWorkspace: 10, staleLockMs: 60000, leaseHeartbeatMs: 1000 },
    readOnlyCache: { enabled: false, ttlMs: 1000, maxEntryBytes: 1024 },
    circuitBreaker: { failureThreshold: 5, windowMs: 60000, openMs: 30000 }
  },
  reliability: {
    maxAttempts: 3,
    maxSchemaRepairAttempts: 2,
    maxRetryCostUsd: 1,
    maxRetryCostReserveUsd: 0.1,
    maxUnknownAttemptCostUsd: 0.1,
    baseRetryDelayMs: 1,
    maxRetryDelayMs: 2,
    maxTotalDurationMs: 300000
  }
};
const runtime = createBridgeRuntime({ configuration, adapters: { antigravity: adapter }, sleep: async () => {} });
const handlers = createMcpToolHandlers({ runtime, trustedWorkspace: root, configuration });
const response = await handlers.runClaudeSonnetAcceptancePilot({});
const payload = response.structuredContent;
const validation = validateSubagentResult(payload);
assert.equal(validation.success, true);
const result = validation.data;
const attempt = result.metrics.attempts?.[0] || null;
const diagnostics = result.metrics.diagnostics || {};
const providerObservation = processObservations[0] || null;
const providerArguments = providerObservation?.args || [];
const workingDirectory = providerObservation?.options?.cwd || null;
const settingsRestored = fs.readFileSync(settingsPath).equals(initialSettings);
const fallbackAttempts = result.metrics.fallbacks || 0;
const recentRuns = readRecentRuns(configuration, { limit: 1 });
const recentRun = recentRuns.runs[0] || null;
fs.mkdtempSync = originalMkdtempSync;

process.stdout.write(JSON.stringify({
  strictSchemaPassed: validation.success,
  mcpIsError: response.isError,
  acceptancePassed: evaluateClaudeSonnetAcceptance(response).accepted,
  preflightCalls: processCalls.filter((call) => call.args.includes("mcp") && call.args.includes("list")).length,
  providerPurposeStarts,
  adapterAttempts: result.metrics.adapterAttempts,
  runtimeRetries: result.metrics.retries,
  repairDisabled: result.metrics.webEvidenceRepair !== true && result.reason !== "web_evidence_invalid",
  fallbackAttempts,
  telemetryWriteStatus: result.metrics.telemetryWriteStatus,
  telemetryWriteFailureClass: result.metrics.telemetryWriteFailureClass,
  recentRunCount: recentRuns.runCount,
  recentRunSourceStatus: recentRuns.sourceStatus,
  recentFailureClass: recentRun?.failureClass || null,
  recentFailureStage: recentRun?.failureStage || null,
  recentProviderCode: recentRun?.providerCode || null,
  recentExitCode: recentRun?.exitCode ?? null,
  recentOsErrorCode: recentRun?.osErrorCode || null,
  recentOutputIntegrity: recentRun?.outputIntegrity || null,
  recentTaskCompletion: recentRun?.taskCompletion || null,
  reason: result.reason || null,
  requestedModel: result.requestedModel || null,
  resolvedModel: result.resolvedModel || null,
  outputIntegrity: result.metrics.outputIntegrity || null,
  taskCompletion: result.metrics.taskCompletion || null,
  failureStage: attempt?.failureStage || diagnostics.failureStage || null,
    providerCode: attempt?.providerCode || diagnostics.providerCode || null,
    osErrorCode: attempt?.osErrorCode || diagnostics.osErrorCode || null,
  readOnlyEnforcementObserved: providerObservation?.readOnlyEnforcement === true,
  settingsLockObserved: providerObservation?.settingsLock === true && providerObservation?.settingsSentinel === true,
  readOnlyPlanMode: providerArguments[providerArguments.indexOf("--mode") + 1] === "plan",
  emptyTemporaryCwd: providerObservation?.emptyTemporaryCwd === true,
  workspaceGrantAbsent: !providerArguments.includes("--add-dir"),
  temporaryCwdRemoved: typeof workingDirectory === "string" && !fs.existsSync(workingDirectory),
  readOnlyStateRestored: settingsRestored && !fs.existsSync(settingsLockPath) && !fs.existsSync(settingsSentinelPath),
  providerFailureDiagnostics: {
    failureClass: attempt?.failureClass || null,
    failureStage: attempt?.failureStage || null,
    providerCode: attempt?.providerCode || null,
    osErrorCode: attempt?.osErrorCode || null,
    exitCode: attempt?.exitCode ?? null,
    timedOut: result.timedOut,
    durationMs: result.durationMs,
    stdoutBytes: diagnostics.stdoutBytes ?? null,
    stderrBytes: diagnostics.stderrBytes ?? null,
    settingsLockWaitMs: diagnostics.settingsLockWaitMs ?? null,
    providerExecutionMs: diagnostics.providerExecutionMs ?? null
  }
}));
