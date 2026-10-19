import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { RULE_ATTESTATION_MIME_TYPE, RULE_ATTESTATION_NAME, RULE_ATTESTATION_URI, ruleAttestationSchema } from "../subagent-bridge/src/frontends/mcp/rule-attestation.js";
import { WORKSPACE_IDENTITY_MIME_TYPE, WORKSPACE_IDENTITY_NAME, WORKSPACE_IDENTITY_URI, workspaceIdentitySchema } from "../subagent-bridge/src/frontends/mcp/workspace-identity.js";
import { loadRuntimeConfiguration } from "../subagent-bridge/src/config.js";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const configuration = loadRuntimeConfiguration();
const transport = new StdioClientTransport({
  command: "C:\\nvm4w\\nodejs\\node.exe",
  args: [path.join(projectRoot, "subagent-bridge", "src", "server.js")],
  cwd: projectRoot,
  env: {
    ...process.env,
    SUBAGENT_BRIDGE_TRUSTED_WORKSPACE: projectRoot,
    SUBAGENT_BRIDGE_ORCHESTRATOR_APPROVAL: ""
  }
});
const client = new Client({ name: "hades-orchestrator-smoke-test", version: "2.1.0" });

await client.connect(transport);
const tools = await client.listTools();
const resources = await client.listResources();
const ruleAttestationRead = await client.readResource({ uri: RULE_ATTESTATION_URI });
const ruleAttestation = ruleAttestationSchema.safeParse(JSON.parse(ruleAttestationRead.contents[0].text));
const workspaceIdentityRead = await client.readResource({ uri: WORKSPACE_IDENTITY_URI });
const workspaceIdentity = workspaceIdentitySchema.safeParse(JSON.parse(workspaceIdentityRead.contents[0].text));
const health = await client.callTool({ name: "check_deepseek_subagent", arguments: {} });
const kimiHealth = await client.callTool({ name: "check_kimi_subagent", arguments: {} });
const qwenHealth = await client.callTool({ name: "check_qwen_subagent", arguments: {} });
const antigravityHealth = await client.callTool({ name: "check_antigravity_subagent", arguments: {} });
const bridgeHealth = await client.callTool({ name: "check_subagent_bridge", arguments: {} });
const workspaceLockHealth = await client.callTool({ name: "check_workspace_lock", arguments: {} });
const memoryHealth = await client.callTool({ name: "check_persistent_memory", arguments: {} });
const memoryReview = await client.callTool({ name: "review_persistent_memory", arguments: {} });
const memorySearch = await client.callTool({
  name: "search_persistent_memory",
  arguments: { query: "Orkestrasyon Hafıza İndeksi", limit: 5 }
});
const selectedMemoryPath = memorySearch.structuredContent?.matches?.[0]?.relativePath;
const memoryRead = selectedMemoryPath
  ? await client.callTool({ name: "read_persistent_memory", arguments: { relativePath: selectedMemoryPath } })
  : null;
await client.close();

console.log(JSON.stringify({
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
  health: health.structuredContent,
  kimiHealth: kimiHealth.structuredContent,
  qwenHealth: qwenHealth.structuredContent,
  antigravityHealth: antigravityHealth.structuredContent,
  bridgeHealth: bridgeHealth.structuredContent,
  workspaceLockHealth: workspaceLockHealth.structuredContent,
  memoryHealth: memoryHealth.structuredContent,
  memoryReview: memoryReview.structuredContent?.counts,
  memoryProbe: {
    matchedNotes: memorySearch.structuredContent?.matches?.length || 0,
    selectedMemoryPath,
    bytes: memoryRead?.structuredContent?.bytes || 0,
    sha256: memoryRead?.structuredContent?.sha256 || null
  }
}, null, 2));

const toolNames = new Set(tools.tools.map((tool) => tool.name));
const expectedToolNames = [
  "check_deepseek_subagent",
  "check_glm_subagent",
  "check_subagent_bridge",
  "check_workspace_lock",
  "check_provider_capability",
  "run_deepseek_subagent",
  "run_deepseek_edit_pilot",
  "run_glm_subagent",
  "run_glm_edit_pilot",
  "check_kimi_subagent",
  "run_kimi_subagent",
  "check_qwen_subagent",
  "run_qwen_subagent",
  "run_space_bunny_subagent",
  "run_codex_subagent",
  "run_task_profile",
  "prepare_parallel_batch",
  "get_parallel_batch",
  "check_persistent_memory",
  "search_persistent_memory",
  "read_persistent_memory",
  "review_persistent_memory",
  "analyze_memory_write",
  "store_persistent_memory",
  "promote_memory"
];
const expectedToolsAvailable = expectedToolNames.every((toolName) => toolNames.has(toolName));
const spaceBunnyTool = tools.tools.find((tool) => tool.name === "run_space_bunny_subagent");
const spaceBunnyToolSchemaValid = Boolean(spaceBunnyTool?.inputSchema?.properties?.taskId
  && spaceBunnyTool.inputSchema.properties.role
  && spaceBunnyTool.inputSchema.properties.objective
  && spaceBunnyTool.inputSchema.required?.includes("taskId")
  && spaceBunnyTool.inputSchema.required?.includes("role")
  && spaceBunnyTool.inputSchema.required?.includes("objective"));
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
const memoryProbeValid = Boolean(selectedMemoryPath && memoryRead?.structuredContent?.sha256 && memoryReview.structuredContent?.counts);
const bridgeAdapters = Object.values(bridgeHealth.structuredContent?.adapters || {});
const bridgeHealthValid = Boolean(bridgeHealth.structuredContent?.services?.coreSchemas && bridgeAdapters.length > 0 && bridgeHealth.structuredContent?.circuits && bridgeHealth.structuredContent?.costBudget && bridgeAdapters.every((adapter) => adapter.modePolicy?.defaultMode && Array.isArray(adapter.modePolicy?.allowedModes) && Array.isArray(adapter.configuredModels)));
const antigravityHealthValid = Boolean(antigravityHealth.structuredContent?.modePolicy?.defaultMode && Array.isArray(antigravityHealth.structuredContent?.configuredModels));
const deepseekApiHealthValid = health.structuredContent?.model === "deepseek-flash"
  && health.structuredContent?.modelAvailable === health.structuredContent?.available
  && [true, false, null].includes(health.structuredContent?.authenticated);
const openCodeHealthValid = configuration.opencode?.enabled === false
  ? kimiHealth.structuredContent?.available === false
    && qwenHealth.structuredContent?.available === false
    && bridgeHealth.structuredContent?.adapters?.opencode?.configuredModels?.length === 0
  : false;
const workspaceLockHealthValid = Number.isInteger(workspaceLockHealth.structuredContent?.localActive) && Array.isArray(workspaceLockHealth.structuredContent?.externalDiskLocks);
if (!expectedToolsAvailable || !spaceBunnyToolSchemaValid || !orchestratorApprovalToolAbsent || !expectedResourcesAvailable || !ruleAttestationValid || !workspaceIdentityValid || !deepseekApiHealthValid || !openCodeHealthValid || !antigravityHealthValid || !bridgeHealthValid || !workspaceLockHealthValid || !memoryHealth.structuredContent?.readable || !memoryHealth.structuredContent?.writable || !memoryProbeValid) {
  process.exitCode = 1;
}
