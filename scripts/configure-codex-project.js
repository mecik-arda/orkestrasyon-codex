import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const action = process.argv[2];
if (!new Set(["--write", "--check"]).has(action)) {
  throw new Error("Use --write to configure the project MCP server or --check to inspect the local configuration.");
}

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const codexDirectory = path.join(projectRoot, ".codex");
const configurationPath = path.join(codexDirectory, "config.toml");
const serverNames = new Set(["deepseek-subagent", "hades-orchestrator"]);
const forwardedEnvironmentNames = [
  "DEEPSEEK_API_KEY",
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_MODEL",
  "ANTHROPIC_DEFAULT_OPUS_MODEL",
  "ANTHROPIC_DEFAULT_SONNET_MODEL",
  "ANTHROPIC_DEFAULT_HAIKU_MODEL",
  "CLAUDE_CODE_SUBAGENT_MODEL",
  "CLAUDE_CODE_EFFORT_LEVEL",
  "ENABLE_TOOL_SEARCH"
];

function tomlString(value) {
  return JSON.stringify(value);
}

function getSectionIdentity(line) {
  const match = /^\[mcp_servers\.([^.\]]+)(?:\.[^\]]+)?\]$/u.exec(line.trim());
  return match ? match[1] : null;
}

function removeHadesServerSections(configurationText) {
  const lines = configurationText.split(/\r?\n/u);
  const retainedLines = [];
  let activeServerName = null;

  for (const line of lines) {
    const sectionHeader = /^\[[^\]]+\]$/u.test(line.trim());
    if (sectionHeader) {
      const sectionIdentity = getSectionIdentity(line);
      if (serverNames.has(sectionIdentity)) {
        activeServerName = sectionIdentity;
        continue;
      }

      activeServerName = null;
    }

    if (activeServerName === null) retainedLines.push(line);
  }

  return retainedLines.join("\n").replace(/\n{3,}/gu, "\n\n").trim();
}

function renderMcpConfiguration() {
  const serverPath = path.join(projectRoot, "subagent-bridge", "src", "server.js");
  const environmentEntries = forwardedEnvironmentNames.map(name => `  ${tomlString(name)},`).join("\n");

  return [
    "[mcp_servers.hades-orchestrator]",
    `command = ${tomlString(process.execPath)}`,
    `args = [${tomlString(serverPath)}]`,
    `cwd = ${tomlString(projectRoot)}`,
    "env_vars = [",
    environmentEntries,
    "]",
    "startup_timeout_sec = 30",
    "tool_timeout_sec = 3600",
    "required = true",
    "",
    "[mcp_servers.hades-orchestrator.env]",
    `SUBAGENT_BRIDGE_TRUSTED_WORKSPACE = ${tomlString(projectRoot)}`,
    "SUBAGENT_BRIDGE_ORCHESTRATOR_APPROVAL = \"1\""
  ].join("\n");
}

const existingConfiguration = fs.existsSync(configurationPath) ? fs.readFileSync(configurationPath, "utf8") : "";
const retainedConfiguration = removeHadesServerSections(existingConfiguration);
const generatedConfiguration = renderMcpConfiguration();
const nextConfiguration = [retainedConfiguration, generatedConfiguration].filter(Boolean).join("\n\n") + "\n";
const matches = existingConfiguration === nextConfiguration;

if (action === "--check") {
  console.log(JSON.stringify({ ok: matches, action, projectMcpReady: matches }));
  if (!matches) process.exitCode = 1;
} else {
  fs.mkdirSync(codexDirectory, { recursive: true });
  fs.writeFileSync(configurationPath, nextConfiguration, "utf8");
  console.log(JSON.stringify({ ok: true, action, projectMcpReady: true }));
}
