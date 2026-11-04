import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { RULE_ATTESTATION_MIME_TYPE, RULE_ATTESTATION_NAME, RULE_ATTESTATION_URI, ruleAttestationSchema } from "../subagent-bridge/src/frontends/mcp/rule-attestation.js";
import { WORKSPACE_IDENTITY_MIME_TYPE, WORKSPACE_IDENTITY_NAME, WORKSPACE_IDENTITY_URI, workspaceIdentitySchema } from "../subagent-bridge/src/frontends/mcp/workspace-identity.js";
import { createSmokeExecutionContext, removeSyntheticSmokeRoot, syntheticSmokeQuery } from "./smoke-mcp-support.js";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const smokeExecutionContext = createSmokeExecutionContext(process.argv.slice(2), projectRoot);
const smokeMode = smokeExecutionContext.mode;
const smokeRoot = smokeExecutionContext.smokeRoot;
let client;

try {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(projectRoot, "subagent-bridge", "src", "server.js")],
    cwd: projectRoot,
    env: smokeExecutionContext.environment
  });
  client = new Client({ name: "hades-orchestrator-smoke-test", version: "2.2.0" });
  await client.connect(transport);
  const tools = await client.listTools();
  const resources = await client.listResources();
  const ruleAttestationRead = await client.readResource({ uri: RULE_ATTESTATION_URI });
  const ruleAttestation = ruleAttestationSchema.safeParse(JSON.parse(ruleAttestationRead.contents[0].text));
  const workspaceIdentityRead = await client.readResource({ uri: WORKSPACE_IDENTITY_URI });
  const workspaceIdentity = workspaceIdentitySchema.safeParse(JSON.parse(workspaceIdentityRead.contents[0].text));
  const health = smokeMode === "synthetic" ? await client.callTool({ name: "check_deepseek_subagent", arguments: {} }) : null;
  const antigravityHealth = smokeMode === "synthetic" ? await client.callTool({ name: "check_antigravity_subagent", arguments: {} }) : null;
  const bridgeHealth = smokeMode === "synthetic" ? await client.callTool({ name: "check_subagent_bridge", arguments: {} }) : null;
  const workspaceLockHealth = smokeMode === "synthetic" ? await client.callTool({ name: "check_workspace_lock", arguments: {} }) : null;
  const memoryHealth = await client.callTool({ name: "check_persistent_memory", arguments: {} });
  const memoryReview = smokeMode === "synthetic"
    ? await client.callTool({ name: "review_persistent_memory", arguments: {} })
    : null;
  const memoryQuery = smokeMode === "synthetic" ? syntheticSmokeQuery : "Orkestrasyon Hafıza İndeksi";
  const memorySearch = await client.callTool({
    name: "search_persistent_memory",
    arguments: { query: memoryQuery, limit: 5 }
  });
  const selectedMemoryPath = memorySearch.structuredContent?.matches?.[0]?.relativePath;
  const memoryRead = selectedMemoryPath
    ? await client.callTool({ name: "read_persistent_memory", arguments: { relativePath: selectedMemoryPath } })
    : null;
  await client.close();

  const smokeReport = {
    vaultMode: smokeMode,
    tools: tools.tools.map((tool) => tool.name),
    resources: resources.resources.map((resource) => ({ name: resource.name, uri: resource.uri, mimeType: resource.mimeType })),
    ruleAttestation: ruleAttestation.success ? {
      status: ruleAttestation.data.status,
      sourceClass: ruleAttestation.data.sourceClass,
      comparison: ruleAttestation.data.comparison,
      manifestSha256: ruleAttestation.data.manifestSha256
    } : { status: "invalid" },
    workspaceIdentity: workspaceIdentity.success ? {
      status: workspaceIdentity.data.status,
      processCwdSha256: workspaceIdentity.data.processCwdSha256,
      trustedWorkspaceSha256: workspaceIdentity.data.trustedWorkspaceSha256,
      limitations: workspaceIdentity.data.limitations
    } : { status: "invalid" },
    health: health?.structuredContent || null,
    antigravityHealth: antigravityHealth?.structuredContent || null,
    bridgeHealth: bridgeHealth?.structuredContent || null,
    workspaceLockHealth: workspaceLockHealth?.structuredContent || null,
    memoryHealth: memoryHealth.structuredContent,
    memoryReview: memoryReview?.structuredContent?.counts,
    memoryProbe: {
      matchedNotes: memorySearch.structuredContent?.matches?.length || 0,
      selectedNoteRead: Boolean(memoryRead),
      bytes: memoryRead?.structuredContent?.bytes || 0,
      sha256: memoryRead?.structuredContent?.sha256 || null
    }
  };

  const toolNames = new Set(tools.tools.map((tool) => tool.name));
  const expectedToolNames = [
    "check_deepseek_subagent",
    "check_subagent_bridge",
    "check_workspace_lock",
    "check_provider_capability",
    "run_deepseek_subagent",
    "run_deepseek_edit_pilot",
    "run_codex_subagent",
    "run_task_profile",
    "check_persistent_memory",
    "search_persistent_memory",
    "read_persistent_memory",
    "review_persistent_memory",
    "analyze_memory_write",
    "store_persistent_memory",
    "promote_memory"
  ];
  const expectedToolsAvailable = expectedToolNames.every((toolName) => toolNames.has(toolName));
  const parallelBatchToolsAvailable = toolNames.has("prepare_parallel_batch") && toolNames.has("get_parallel_batch");
  const parallelBatchCatalogValid = smokeExecutionContext.parallelBatchEnabled === null
    || parallelBatchToolsAvailable === smokeExecutionContext.parallelBatchEnabled;
  const retiredToolNames = ["run_opencode_subagent", "run_glm_subagent", "run_glm_edit_pilot", "check_glm_subagent", "run_kimi_subagent", "check_kimi_subagent", "run_qwen_subagent", "check_qwen_subagent", "run_space_bunny_subagent", "check_space_bunny_subagent", "run_space_bunny_edit_pilot"];
  const retiredToolsAbsent = retiredToolNames.every((toolName) => !toolNames.has(toolName));
  const orchestratorApprovalToolAbsent = !toolNames.has("approve_prepared_edit");
  const resourceMap = new Map(resources.resources.map((resource) => [resource.uri, resource]));
  const expectedResourcesAvailable = resources.resources.length === 2
    && resourceMap.get(RULE_ATTESTATION_URI)?.name === RULE_ATTESTATION_NAME
    && resourceMap.get(RULE_ATTESTATION_URI)?.mimeType === RULE_ATTESTATION_MIME_TYPE
    && resourceMap.get(WORKSPACE_IDENTITY_URI)?.name === WORKSPACE_IDENTITY_NAME
    && resourceMap.get(WORKSPACE_IDENTITY_URI)?.mimeType === WORKSPACE_IDENTITY_MIME_TYPE;
  const ruleAttestationValid = ruleAttestation.success
    && ruleAttestation.data.evidence.startup_context.status === "unavailable"
    && ruleAttestation.data.evidence.mcp_resource.status === "verified";
  const workspaceIdentityValid = workspaceIdentity.success;
  const memoryProbeValid = Boolean(selectedMemoryPath && memoryRead?.structuredContent?.sha256)
    && (smokeMode === "real-vault" || Boolean(memoryReview?.structuredContent?.counts));
  const bridgeAdapters = Object.values(bridgeHealth?.structuredContent?.adapters || {});
  const bridgeHealthValid = Boolean(bridgeHealth?.structuredContent?.services?.coreSchemas && bridgeAdapters.length > 0 && bridgeHealth?.structuredContent?.circuits && bridgeHealth?.structuredContent?.costBudget && bridgeAdapters.every((adapter) => adapter.modePolicy?.defaultMode && Array.isArray(adapter.modePolicy?.allowedModes) && Array.isArray(adapter.configuredModels)));
  const antigravityHealthValid = Boolean(antigravityHealth?.structuredContent?.modePolicy?.defaultMode && Array.isArray(antigravityHealth?.structuredContent?.configuredModels));
  const deepseekApiHealthValid = health?.structuredContent?.model === "deepseek-flash"
    && health?.structuredContent?.modelAvailable === health?.structuredContent?.available
    && [true, false, null].includes(health?.structuredContent?.authenticated);
  const retiredAdapterAbsent = !Object.hasOwn(bridgeHealth?.structuredContent?.adapters || {}, "opencode");
  const workspaceLockHealthValid = Number.isInteger(workspaceLockHealth?.structuredContent?.localActive) && Array.isArray(workspaceLockHealth?.structuredContent?.externalDiskLocks);
  const smokeChecks = {
    expectedToolsAvailable,
    retiredToolsAbsent,
    orchestratorApprovalToolAbsent,
    expectedResourcesAvailable,
    ruleAttestationValid,
    workspaceIdentityValid,
    memoryReadable: Boolean(memoryHealth.structuredContent?.readable),
    memoryWritable: Boolean(memoryHealth.structuredContent?.writable),
    memoryProbeValid
  };
  if (smokeMode === "synthetic") {
    Object.assign(smokeChecks, {
      parallelBatchCatalogValid,
      retiredAdapterAbsent,
      deepseekApiHealthValid,
      antigravityHealthValid,
      bridgeHealthValid,
      workspaceLockHealthValid
    });
  }
  smokeReport.checks = smokeChecks;
  console.log(JSON.stringify(smokeReport, null, 2));
  if (Object.values(smokeChecks).some((passed) => !passed)) {
    process.exitCode = 1;
  }
} finally {
  await client?.close().catch(() => {});
  if (smokeRoot) removeSyntheticSmokeRoot(smokeRoot);
}
