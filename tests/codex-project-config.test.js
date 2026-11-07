import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  applyCodexProjectConfiguration,
  inspectCodexProjectConfiguration,
  prepareCodexProjectConfiguration,
  publishCodexProjectConfiguration
} from "../scripts/codex-project-config.js";

function createProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex project ü & "));
  fs.mkdirSync(path.join(root, "subagent-bridge", "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "subagent-bridge", "src", "server.js"), "process.exitCode = 0;\n", "utf8");
  return root;
}

function removeProject(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

test("Codex config check is read-only and configure creates an isolated managed entry idempotently", async (context) => {
  const root = createProject();
  context.after(() => removeProject(root));
  const configDirectory = path.join(root, ".codex");
  assert.equal(inspectCodexProjectConfiguration(root).status, "needs_update");
  assert.equal(fs.existsSync(configDirectory), false);
  const written = await applyCodexProjectConfiguration(root);
  assert.equal(written.status, "written");
  const configPath = path.join(configDirectory, "config.toml");
  const firstBytes = fs.readFileSync(configPath);
  const second = await applyCodexProjectConfiguration(root);
  assert.equal(second.status, "unchanged");
  assert.deepEqual(fs.readFileSync(configPath), firstBytes);
  assert.equal(fs.existsSync(path.join(configDirectory, ".local-config-backups")), false);
  const checked = inspectCodexProjectConfiguration(root);
  assert.equal(checked.status, "ready", JSON.stringify(checked.changes));
  assert.equal(firstBytes.toString("utf8").includes(JSON.stringify(root)), true);
});

test("Codex config update preserves unrelated TOML, quoted tables, comments, CRLF, and unknown Hades fields", async (context) => {
  const root = createProject();
  context.after(() => removeProject(root));
  const configDirectory = path.join(root, ".codex");
  fs.mkdirSync(configDirectory);
  const configPath = path.join(configDirectory, "config.toml");
  const original = [
    'model = "gpt-6.1-sol"',
    'model_reasoning_effort = "high"',
    "[features]",
    "prefer_mxc = true",
    "release_date = 2024-02-29",
    "release_time = 12:34:56.123",
    "release_at = 2024-02-29T12:34:56+03:00",
    "[mcp_servers.\"unrelated.worker\"]",
    'command = "worker # executable" # unrelated comment',
    "[mcp_servers.hades-orchestrator]",
    'command = "old-node" # keep this comment',
    'custom_policy = "preserve"',
    "[mcp_servers.hades-orchestrator.env]",
    'CUSTOM_VALUE = "keep # inside string"',
    ""
  ].join("\r\n");
  fs.writeFileSync(configPath, original, "utf8");
  const planned = prepareCodexProjectConfiguration(root);
  assert.equal(planned.unknownFields.length, 2);
  const report = await publishCodexProjectConfiguration(planned);
  assert.equal(report.status, "written");
  const result = fs.readFileSync(configPath, "utf8");
  assert.equal(result.includes("\n") && result.replace(/\r\n/gu, "").includes("\n"), false);
  assert.match(result, /model = "gpt-6\.1-sol"\r\nmodel_reasoning_effort = "high"/u);
  assert.match(result, /prefer_mxc = true/u);
  assert.match(result, /release_date = 2024-02-29/u);
  assert.match(result, /release_time = 12:34:56\.123/u);
  assert.match(result, /release_at = 2024-02-29T12:34:56\+03:00/u);
  assert.match(result, /\[mcp_servers\."unrelated\.worker"\]/u);
  assert.match(result, /command = "worker # executable" # unrelated comment/u);
  assert.match(result, /command =\s+"[^"]+" # keep this comment/u);
  assert.match(result, /custom_policy = "preserve"/u);
  assert.match(result, /CUSTOM_VALUE = "keep # inside string"/u);
  const checked = inspectCodexProjectConfiguration(root);
  if (checked.status !== "ready") throw new Error(JSON.stringify({ changes: checked.changes, relevantLines: result.split(/\r?\n/u).filter((line) => line.includes("SUBAGENT_BRIDGE_") || line.includes("CUSTOM_VALUE") || line.includes("[mcp_servers.hades-orchestrator.env]")) }));
});

test("Codex config malformed or duplicate TOML is rejected without changing original bytes", async (context) => {
  const root = createProject();
  context.after(() => removeProject(root));
  const configDirectory = path.join(root, ".codex");
  fs.mkdirSync(configDirectory);
  const configPath = path.join(configDirectory, "config.toml");
  for (const invalid of [
    '[mcp_servers.hades-orchestrator]\ncommand = "unterminated\n',
    '[mcp_servers.hades-orchestrator]\nrequired = true\n[mcp_servers.hades-orchestrator]\n',
    '[deployment]\nrelease_date = 2026-99-40\n'
  ]) {
    fs.writeFileSync(configPath, invalid, "utf8");
    const before = fs.readFileSync(configPath);
    assert.throws(() => prepareCodexProjectConfiguration(root));
    assert.deepEqual(fs.readFileSync(configPath), before);
  }
});

test("Codex config refuses to rewrite a changed multiline managed value", async (context) => {
  const root = createProject();
  context.after(() => removeProject(root));
  const configDirectory = path.join(root, ".codex");
  fs.mkdirSync(configDirectory);
  const configPath = path.join(configDirectory, "config.toml");
  const original = [
    "[mcp_servers.hades-orchestrator]",
    'command = "old-node"',
    'args = ["old-server.js"]',
    'cwd = "old-workspace"',
    `env_vars = [ ${String.fromCharCode(35)} keep managed-value comment`,
    '  "OLD_PROVIDER_KEY",',
    "]",
    "startup_timeout_sec = 30",
    "tool_timeout_sec = 3600",
    "required = true",
    ""
  ].join("\n");
  fs.writeFileSync(configPath, original, "utf8");
  const before = fs.readFileSync(configPath);
  await assert.rejects(applyCodexProjectConfiguration(root), /multiline managed TOML value/u);
  assert.deepEqual(fs.readFileSync(configPath), before);
});

test("Codex config publication rejects an external change after planning and does not create a backup", async (context) => {
  const root = createProject();
  context.after(() => removeProject(root));
  const configDirectory = path.join(root, ".codex");
  fs.mkdirSync(configDirectory);
  const configPath = path.join(configDirectory, "config.toml");
  fs.writeFileSync(configPath, 'model = "gpt-6.1-sol"\n', "utf8");
  const plan = prepareCodexProjectConfiguration(root);
  const externalChange = 'model = "gpt-6.1-sol"\nmodel_reasoning_effort = "high"\n';
  fs.writeFileSync(configPath, externalChange, "utf8");
  await assert.rejects(publishCodexProjectConfiguration(plan), /changed while the update was being prepared/u);
  assert.equal(fs.readFileSync(configPath, "utf8"), externalChange);
  assert.equal(fs.existsSync(path.join(configDirectory, ".local-config-backups")), false);
});

test("separate checkout roots produce separate managed workspace bindings", async (context) => {
  const firstRoot = createProject();
  const secondRoot = createProject();
  context.after(() => removeProject(firstRoot));
  context.after(() => removeProject(secondRoot));
  await applyCodexProjectConfiguration(firstRoot);
  await applyCodexProjectConfiguration(secondRoot);
  const firstConfig = fs.readFileSync(path.join(firstRoot, ".codex", "config.toml"), "utf8");
  const secondConfig = fs.readFileSync(path.join(secondRoot, ".codex", "config.toml"), "utf8");
  assert.equal(firstConfig.includes(JSON.stringify(firstRoot)), true);
  assert.equal(secondConfig.includes(JSON.stringify(secondRoot)), true);
  assert.notEqual(firstConfig, secondConfig);
});
