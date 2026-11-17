import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { applyCodexProjectConfiguration } from "../scripts/codex-project-config.js";
import { createSmokeExecutionContext, removeSyntheticSmokeRoot } from "../scripts/smoke-mcp-support.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const clientModule = import.meta.resolve("@modelcontextprotocol/sdk/client/index.js");
const transportModule = import.meta.resolve("@modelcontextprotocol/sdk/client/stdio.js");

function managedValue(configuration, name) {
  const assignment = configuration.split(/\r?\n/u).find(line => line.startsWith(`${name} = `));
  assert.ok(assignment, name);
  return JSON.parse(assignment.slice(assignment.indexOf("=") + 1));
}

function createLauncherSource() {
  return [
    `import { Client } from ${JSON.stringify(clientModule)};`,
    `import { StdioClientTransport } from ${JSON.stringify(transportModule)};`,
    'const launch = JSON.parse(process.argv[1]);',
    'const transport = new StdioClientTransport({ command: launch.command, args: launch.args, cwd: launch.cwd, env: { ...process.env, ...launch.env }, stderr: "pipe" });',
    'const client = new Client({ name: "configured-workspace-regression", version: "1.0.0" }, { capabilities: {} });',
    'try {',
    '  await client.connect(transport);',
    '  const resources = await client.listResources();',
    '  const response = await client.readResource({ uri: "hades://workspace/identity/v1" });',
    '  const identity = JSON.parse(response.contents.find(item => typeof item.text === "string").text);',
    '  process.stdout.write(JSON.stringify({ launcherCwd: process.cwd(), resourceCount: resources.resources.length, processCwdSha256: identity.processCwdSha256, trustedWorkspaceSha256: identity.trustedWorkspaceSha256 }) + "\\n");',
    '} catch (error) {',
    '  process.stdout.write(JSON.stringify({ failureClass: error.name }) + "\\n");',
    '  process.exitCode = 1;',
    '} finally {',
    '  await client.close();',
    '  await transport.close();',
    '}'
  ].join("\n");
}

test("generated Hades config initializes from an unrelated launcher cwd with an isolated policy", async context => {
  const firstRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hades configured \u00fc & "));
  const secondRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hades configured \u0131 & "));
  const launcherRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hades daemon cwd "));
  const synthetic = createSmokeExecutionContext([], repositoryRoot);
  context.after(() => {
    for (const root of [firstRoot, secondRoot, launcherRoot]) fs.rmSync(root, { recursive: true, force: true });
    removeSyntheticSmokeRoot(synthetic.smokeRoot);
  });
  const policy = JSON.parse(fs.readFileSync(synthetic.configurationPath, "utf8"));
  policy.allowedRoots = [firstRoot, secondRoot];
  fs.writeFileSync(synthetic.configurationPath, JSON.stringify(policy), "utf8");
  const expectedHashes = new Set();
  for (const root of [firstRoot, secondRoot]) {
    fs.mkdirSync(path.join(root, "subagent-bridge", "src"), { recursive: true });
    fs.writeFileSync(path.join(root, "package.json"), '{"type":"module"}\n', "utf8");
    const serverModule = pathToFileURL(path.join(repositoryRoot, "subagent-bridge", "src", "server.js")).href;
    fs.writeFileSync(path.join(root, "subagent-bridge", "src", "server.js"), `await import(${JSON.stringify(serverModule)});\n`, "utf8");
    const configured = await applyCodexProjectConfiguration(root);
    assert.equal(configured.projectMcpReady, true);
    const configuration = fs.readFileSync(path.join(root, ".codex", "config.toml"), "utf8");
    const launch = {
      command: managedValue(configuration, "command"),
      args: managedValue(configuration, "args"),
      cwd: managedValue(configuration, "cwd"),
      env: {
        SUBAGENT_BRIDGE_TRUSTED_WORKSPACE: managedValue(configuration, "SUBAGENT_BRIDGE_TRUSTED_WORKSPACE"),
        SUBAGENT_BRIDGE_ORCHESTRATOR_APPROVAL: managedValue(configuration, "SUBAGENT_BRIDGE_ORCHESTRATOR_APPROVAL")
      }
    };
    assert.equal(path.isAbsolute(launch.cwd), true);
    assert.equal(managedValue(configuration, "required"), true);
    const launched = spawnSync(process.execPath, ["--input-type=module", "-e", createLauncherSource(), JSON.stringify(launch)], {
      cwd: launcherRoot,
      env: synthetic.environment,
      encoding: "utf8",
      windowsHide: true,
      timeout: 20000,
      maxBuffer: 1048576
    });
    assert.equal(launched.status, 0, launched.stdout);
    const result = JSON.parse(launched.stdout);
    const expectedHash = crypto.createHash("sha256").update(fs.realpathSync(root)).digest("hex");
    expectedHashes.add(expectedHash);
    assert.equal(fs.realpathSync(result.launcherCwd), fs.realpathSync(launcherRoot));
    assert.equal(result.resourceCount, 2);
    assert.equal(result.processCwdSha256, expectedHash);
    assert.equal(result.trustedWorkspaceSha256, expectedHash);
  }
  assert.equal(expectedHashes.size, 2);
});
