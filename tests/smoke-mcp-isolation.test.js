import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createSmokeExecutionContext, parseSmokeMode, removeSyntheticSmokeRoot, syntheticSmokeQuery } from "../scripts/smoke-mcp-support.js";

const projectRoot = path.resolve(".");

test("default smoke selects synthetic mode and requires explicit flags for real Vault access", () => {
  assert.equal(parseSmokeMode([]), "synthetic");
  assert.equal(parseSmokeMode(["--real-vault", "--confirm-real-vault-read"]), "real-vault");
  assert.throws(() => parseSmokeMode(["--real-vault"]), /both explicit real-Vault confirmation flags/);
  assert.throws(() => parseSmokeMode(["--confirm-real-vault-read"]), /both explicit real-Vault confirmation flags/);
  assert.throws(() => parseSmokeMode(["--real-vault", "--confirm-real-vault-read", "--other"]), /both explicit real-Vault confirmation flags/);
  const inheritedEnvironment = { ORCHESTRATOR_CONFIG: "personal-config.json", DEEPSEEK_API_KEY: "explicit-real-vault-secret-marker" };
  const explicitRealVaultContext = createSmokeExecutionContext(["--real-vault", "--confirm-real-vault-read"], projectRoot, inheritedEnvironment);
  assert.equal(explicitRealVaultContext.mode, "real-vault");
  assert.equal(explicitRealVaultContext.smokeRoot, null);
  assert.equal(explicitRealVaultContext.environment.ORCHESTRATOR_CONFIG, inheritedEnvironment.ORCHESTRATOR_CONFIG);
  assert.equal(explicitRealVaultContext.environment.DEEPSEEK_API_KEY, inheritedEnvironment.DEEPSEEK_API_KEY);
});

test("default smoke environment redirects MCP memory tools away from inherited Vault configuration", { timeout: 60000 }, async (context) => {
  const inheritedProfile = fs.mkdtempSync(path.join(os.tmpdir(), "hades-mcp-smoke-inherited-"));
  context.after(() => removeSyntheticSmokeRoot(inheritedProfile));

  const trapVaultRoot = path.join(inheritedProfile, "inherited-vault");
  const trapDirectory = path.join(trapVaultRoot, "03_Resources");
  fs.mkdirSync(trapDirectory, { recursive: true });
  const trapQuery = "inherited-vault-must-not-be-read";
  fs.writeFileSync(path.join(trapDirectory, "Trap.md"), [
    "---",
    'title: "Inherited Vault trap"',
    'created: "2026-11-03T00:00:00.000Z"',
    'updated: "2026-11-03T00:00:00.000Z"',
    'confidence: "high"',
    'verification: "verified"',
    'stage: "published"',
    "---",
    "",
    trapQuery,
    ""
  ].join("\n"), "utf8");

  const inheritedConfiguration = JSON.parse(fs.readFileSync(path.join(projectRoot, "config", "policy.json"), "utf8"));
  inheritedConfiguration.memory.vaultRoot = trapVaultRoot;
  const inheritedConfigurationPath = path.join(inheritedProfile, "inherited-policy.json");
  fs.writeFileSync(inheritedConfigurationPath, JSON.stringify(inheritedConfiguration), "utf8");

  const executionContext = createSmokeExecutionContext([], projectRoot, {
    ORCHESTRATOR_CONFIG: inheritedConfigurationPath,
    SUBAGENT_BRIDGE_AGENTS_CONFIG: path.join(inheritedProfile, "inherited-agents.json"),
    USERPROFILE: path.join(inheritedProfile, "inherited-profile"),
    HOME: path.join(inheritedProfile, "inherited-profile"),
    LOCALAPPDATA: path.join(inheritedProfile, "inherited-local-app-data"),
    DEEPSEEK_API_KEY: "synthetic-inherited-secret-marker",
    ANTHROPIC_API_KEY: "synthetic-inherited-secret-marker",
    SUBAGENT_MEMORY_PROFILE: "synthetic-inherited-profile-marker",
    SUBAGENT_MEMORY_HOOK_COHORT_REGISTRY: "synthetic-inherited-registry-marker",
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP
  });
  context.after(() => removeSyntheticSmokeRoot(executionContext.smokeRoot));

  assert.notEqual(executionContext.configurationPath, inheritedConfigurationPath);
  assert.notEqual(executionContext.vaultRoot, trapVaultRoot);
  assert.equal(executionContext.environment.ORCHESTRATOR_CONFIG, executionContext.configurationPath);
  assert.equal(executionContext.environment.USERPROFILE, path.join(executionContext.smokeRoot, "profile"));
  assert.equal(executionContext.environment.HOME, path.join(executionContext.smokeRoot, "profile"));
  assert.equal(executionContext.environment.DEEPSEEK_API_KEY, undefined);
  assert.equal(executionContext.environment.ANTHROPIC_API_KEY, undefined);
  assert.equal(executionContext.environment.SUBAGENT_MEMORY_PROFILE, undefined);
  assert.equal(executionContext.environment.SUBAGENT_MEMORY_HOOK_COHORT_REGISTRY, undefined);
  assert.equal(executionContext.environment.SUBAGENT_BRIDGE_AGENTS_CONFIG, executionContext.agentsConfigurationPath);
  assert.equal(path.dirname(executionContext.environment.LOCALAPPDATA), path.join(executionContext.smokeRoot, "profile", "AppData"));

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(projectRoot, "subagent-bridge", "src", "server.js")],
    cwd: projectRoot,
    env: executionContext.environment
  });
  const client = new Client({ name: "synthetic-vault-smoke-regression", version: "1.0.0" });

  try {
    await client.connect(transport);
    const health = await client.callTool({ name: "check_persistent_memory", arguments: {} });
    assert.equal(health.structuredContent.readable, true);
    assert.equal(health.structuredContent.writable, true);

    const inheritedSearch = await client.callTool({ name: "search_persistent_memory", arguments: { query: trapQuery, limit: 5 } });
    assert.equal(inheritedSearch.structuredContent.matches.length, 0);

    const syntheticSearch = await client.callTool({ name: "search_persistent_memory", arguments: { query: syntheticSmokeQuery, limit: 5 } });
    assert.deepEqual(syntheticSearch.structuredContent.matches.map((match) => match.relativePath), ["03_Resources/Smoke.md"]);
    const syntheticRead = await client.callTool({ name: "read_persistent_memory", arguments: { relativePath: "03_Resources/Smoke.md" } });
    assert.match(syntheticRead.structuredContent.content, new RegExp(syntheticSmokeQuery));
    const expectedHash = crypto.createHash("sha256").update(fs.readFileSync(executionContext.fixturePath)).digest("hex");
    assert.equal(syntheticRead.structuredContent.sha256, expectedHash);
  } finally {
    await client.close().catch(() => {});
  }
});
