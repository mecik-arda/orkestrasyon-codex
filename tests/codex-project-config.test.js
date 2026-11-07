import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildConfigurationFailureReport } from "../scripts/codex-project-config-report.js";
import {
  applyCodexProjectConfiguration,
  inspectCodexProjectConfiguration,
  prepareCodexProjectConfiguration,
  publishCodexProjectConfiguration
} from "../scripts/codex-project-config.js";

const processFixturePath = fileURLToPath(new URL("./fixtures/codex-project-config-process.js", import.meta.url));

function createProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex project ü & "));
  fs.mkdirSync(path.join(root, "subagent-bridge", "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "subagent-bridge", "src", "server.js"), "process.exitCode = 0;\n", "utf8");
  return root;
}

function createOutdatedConfiguredProject() {
  const root = createProject();
  const configDirectory = path.join(root, ".codex");
  fs.mkdirSync(configDirectory);
  fs.writeFileSync(path.join(configDirectory, "config.toml"), 'model = "gpt-6.1-sol"\n', "utf8");
  return root;
}

function removeProject(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

function startProcessFixture(context, root, mode = "publish", fault = "none") {
  const environment = {};
  for (const key of ["PATH", "Path", "PATHEXT", "SystemRoot", "WINDIR", "TEMP", "TMP"]) {
    if (process.env[key] !== undefined) environment[key] = process.env[key];
  }
  const child = spawn(process.execPath, [processFixturePath, mode, root, fault], { stdio: ["pipe", "pipe", "pipe"], env: environment });
  let bufferedOutput = "";
  let bufferedError = "";
  const messages = [];
  const waiters = [];
  const exit = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal, stderr: bufferedError }));
  });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    bufferedOutput += chunk;
    while (bufferedOutput.includes("\n")) {
      const newlineIndex = bufferedOutput.indexOf("\n");
      const line = bufferedOutput.slice(0, newlineIndex);
      bufferedOutput = bufferedOutput.slice(newlineIndex + 1);
      const message = JSON.parse(line);
      const waiter = waiters.shift();
      if (waiter) waiter.resolve(message);
      else messages.push(message);
    }
  });
  child.stderr.on("data", (chunk) => { bufferedError += chunk; });
  context.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await exit.catch(() => {});
  });
  return {
    nextMessage(timeoutMs = 15000) {
      if (messages.length > 0) return Promise.resolve(messages.shift());
      return new Promise((resolve, reject) => {
        let timer;
        const waiter = {
          resolve: (message) => { clearTimeout(timer); resolve(message); },
          reject
        };
        timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error("fixture process did not produce the expected message"));
        }, timeoutMs);
        waiters.push(waiter);
      });
    },
    send(command) { child.stdin.write(`${command}\n`); },
    exit
  };
}

test("Codex config check is read-only and configure creates an isolated managed entry idempotently", async (context) => {
  const root = createProject();
  context.after(() => removeProject(root));
  const configDirectory = path.join(root, ".codex");
  assert.equal(inspectCodexProjectConfiguration(root).status, "needs_update");
  assert.equal(fs.existsSync(configDirectory), false);
  const written = await applyCodexProjectConfiguration(root);
  assert.equal(written.status, "written");
  assert.equal(written.projectMcpReady, true);
  assert.equal(written.checks.managedHadesEntry, "updated");
  const configPath = path.join(configDirectory, "config.toml");
  const firstBytes = fs.readFileSync(configPath);
  const firstIdentity = fs.statSync(configPath);
  const second = await applyCodexProjectConfiguration(root);
  assert.equal(second.status, "unchanged");
  assert.equal(second.publicationState, "not_needed");
  assert.equal(second.lockStatus, "released");
  assert.deepEqual(fs.readFileSync(configPath), firstBytes);
  const secondIdentity = fs.statSync(configPath);
  assert.equal(secondIdentity.ino, firstIdentity.ino);
  assert.equal(secondIdentity.mtimeMs, firstIdentity.mtimeMs);
  assert.equal(fs.existsSync(path.join(configDirectory, ".local-config-backups")), false);
  const checked = inspectCodexProjectConfiguration(root);
  assert.equal(checked.status, "ready", JSON.stringify(checked.changes));
  assert.equal(firstBytes.toString("utf8").includes(JSON.stringify(root)), true);
});

test("configuration failure reports redact exception text and distinguish unchanged lock uncertainty", () => {
  const secretSentinel = "configuration-path-and-secret-sentinel";
  const failure = new Error(`${secretSentinel} raw filesystem details`);
  failure.publicCode = "lock_release_uncertain";
  failure.publicationState = "not_needed";
  failure.failureStage = "lock_release";
  failure.lockStatus = "uncertain";
  const report = buildConfigurationFailureReport("--write", failure, "ready");
  assert.equal(report.status, "unchanged_lock_release_uncertain");
  assert.equal(report.publicationState, "not_needed");
  assert.equal(report.projectMcpReady, true);
  assert.equal(report.lockStatus, "uncertain");
  assert.equal(JSON.stringify(report).includes(secretSentinel), false);
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

test("Codex config publication rejects a stale no-op plan and preserves the external change", async (context) => {
  const root = createProject();
  context.after(() => removeProject(root));
  await applyCodexProjectConfiguration(root);
  const configPath = path.join(root, ".codex", "config.toml");
  const plan = prepareCodexProjectConfiguration(root);
  assert.deepEqual(plan.originalBytes, plan.nextBytes);
  const externalChange = 'model = "externally-updated-model"\n';
  fs.writeFileSync(configPath, externalChange, "utf8");
  await assert.rejects(publishCodexProjectConfiguration(plan), /changed while the update was being prepared/u);
  assert.equal(fs.readFileSync(configPath, "utf8"), externalChange);
  assert.equal(inspectCodexProjectConfiguration(root).projectMcpReady, false);
  assert.equal(fs.existsSync(path.join(root, ".codex", ".local-config-backups")), false);
});

test("Codex config publication rejects deleted and same-content replacement snapshots", async (context) => {
  const root = createProject();
  context.after(() => removeProject(root));
  await applyCodexProjectConfiguration(root);
  const configPath = path.join(root, ".codex", "config.toml");
  const deletedPlan = prepareCodexProjectConfiguration(root);
  fs.rmSync(configPath);
  await assert.rejects(publishCodexProjectConfiguration(deletedPlan), /changed while the update was being prepared/u);
  await applyCodexProjectConfiguration(root);
  const replacementPlan = prepareCodexProjectConfiguration(root);
  const originalIdentity = fs.statSync(configPath);
  const replacementPath = `${configPath}.replacement`;
  fs.writeFileSync(replacementPath, replacementPlan.originalBytes);
  const replacementIdentity = fs.statSync(replacementPath);
  assert.notEqual(replacementIdentity.ino, originalIdentity.ino);
  fs.rmSync(configPath);
  fs.renameSync(replacementPath, configPath);
  await assert.rejects(publishCodexProjectConfiguration(replacementPlan), /changed while the update was being prepared/u);
  assert.deepEqual(fs.readFileSync(configPath), replacementPlan.originalBytes);
});

test("independent publisher processes serialize one shared snapshot and reject the stale writer", async (context) => {
  const root = createOutdatedConfiguredProject();
  context.after(() => removeProject(root));
  const first = startProcessFixture(context, root);
  const second = startProcessFixture(context, root);
  assert.equal((await first.nextMessage()).event, "planned");
  assert.equal((await second.nextMessage()).event, "planned");
  first.send("publish");
  second.send("publish");
  assert.equal((await first.nextMessage()).event, "publishing");
  assert.equal((await second.nextMessage()).event, "publishing");
  const firstResult = await first.nextMessage();
  const secondResult = await second.nextMessage();
  assert.equal((await first.exit).code, 0);
  assert.equal((await second.exit).code, 0);
  const results = [firstResult, secondResult];
  assert.equal(results.filter((result) => result.event === "result" && result.result.status === "written").length, 1);
  assert.equal(results.filter((result) => result.event === "error" && result.publicCode === "stale_plan").length, 1);
  assert.equal(inspectCodexProjectConfiguration(root).status, "ready");
  assert.equal(fs.readdirSync(path.join(root, ".codex", ".local-config-backups")).length, 1);
});

test("publisher revalidates the planned snapshot after waiting for another process lock", async (context) => {
  const root = createOutdatedConfiguredProject();
  context.after(() => removeProject(root));
  const holder = startProcessFixture(context, root, "hold-lock");
  assert.equal((await holder.nextMessage()).event, "lock_held");
  const publisher = startProcessFixture(context, root);
  assert.equal((await publisher.nextMessage()).event, "planned");
  publisher.send("publish");
  assert.equal((await publisher.nextMessage()).event, "publishing");
  const configPath = path.join(root, ".codex", "config.toml");
  const externalBytes = 'model = "external-during-lock-wait"\n';
  fs.writeFileSync(configPath, externalBytes);
  holder.send("release");
  assert.equal((await holder.nextMessage()).event, "lock_released");
  const result = await publisher.nextMessage();
  assert.equal(result.event, "error");
  assert.equal(result.publicCode, "stale_plan");
  assert.equal(result.publicationState, "not_published");
  assert.equal((await holder.exit).code, 0);
  assert.equal((await publisher.exit).code, 0);
  assert.equal(fs.readFileSync(configPath, "utf8"), externalBytes);
  assert.equal(fs.existsSync(path.join(root, ".codex", ".local-config-backups")), false);
});

test("pre-publication filesystem failures preserve the target and remove owned temporary artifacts", async (context) => {
  for (const fault of ["write", "write-close", "fsync", "temporary-close", "backup-open", "backup-write", "backup-close", "backup-verify"]) {
    const root = createOutdatedConfiguredProject();
    context.after(() => removeProject(root));
    const configPath = path.join(root, ".codex", "config.toml");
    const beforeBytes = fs.readFileSync(configPath);
    const publisher = startProcessFixture(context, root, "publish", fault);
    assert.equal((await publisher.nextMessage()).event, "planned");
    publisher.send("publish");
    assert.equal((await publisher.nextMessage()).event, "publishing");
    const result = await publisher.nextMessage();
    assert.equal(result.event, "error", fault);
    assert.equal(result.publicationState, "not_published", fault);
    if (fault === "write-close") {
      assert.equal(result.failureStage, "temporary_write");
      assert.equal(result.cleanupStatus, "failed");
    }
    if (fault.startsWith("backup-")) {
      assert.equal(result.failureStage, "backup", fault);
      assert.equal(result.backupStatus, fault === "backup-open" ? "not_created" : "removed_after_failure", fault);
      assert.equal(result.cleanupStatus, fault === "backup-close" ? "failed" : "complete", fault);
    }
    assert.equal((await publisher.exit).code, 0);
    assert.deepEqual(fs.readFileSync(configPath), beforeBytes, fault);
    assert.equal(fs.readdirSync(path.join(root, ".codex")).some((name) => name.endsWith(".tmp")), false, fault);
    assert.equal(fs.existsSync(path.join(root, ".codex", ".local-config-backups")) && fs.readdirSync(path.join(root, ".codex", ".local-config-backups")).length > 0, false, fault);
  }
});

test("process exit before and after atomic publication is distinguished by a fresh process observation", async (context) => {
  const beforeRoot = createOutdatedConfiguredProject();
  const afterRoot = createOutdatedConfiguredProject();
  context.after(() => removeProject(beforeRoot));
  context.after(() => removeProject(afterRoot));
  const beforeConfigPath = path.join(beforeRoot, ".codex", "config.toml");
  const beforeBytes = fs.readFileSync(beforeConfigPath);
  const before = startProcessFixture(context, beforeRoot, "publish", "crash-before-rename");
  assert.equal((await before.nextMessage()).event, "planned");
  before.send("publish");
  assert.equal((await before.nextMessage()).event, "publishing");
  assert.equal((await before.nextMessage()).event, "crash_before_rename");
  assert.equal((await before.exit).code, 71);
  assert.deepEqual(fs.readFileSync(beforeConfigPath), beforeBytes);
  assert.equal(inspectCodexProjectConfiguration(beforeRoot).status, "needs_update");

  const afterConfigPath = path.join(afterRoot, ".codex", "config.toml");
  const after = startProcessFixture(context, afterRoot, "publish", "crash-after-rename");
  assert.equal((await after.nextMessage()).event, "planned");
  after.send("publish");
  assert.equal((await after.nextMessage()).event, "publishing");
  assert.equal((await after.nextMessage()).event, "crash_after_rename");
  assert.equal((await after.exit).code, 72);
  assert.equal(inspectCodexProjectConfiguration(afterRoot).status, "ready");
  assert.equal(fs.readFileSync(afterConfigPath, "utf8").includes("hades-orchestrator"), true);
});

test("publication remains reported when first-file cleanup or lock release fails", async (context) => {
  const linkRoot = createProject();
  context.after(() => removeProject(linkRoot));
  const linkPublisher = startProcessFixture(context, linkRoot, "publish", "link-cleanup");
  assert.equal((await linkPublisher.nextMessage()).event, "planned");
  linkPublisher.send("publish");
  assert.equal((await linkPublisher.nextMessage()).event, "publishing");
  const linkResult = await linkPublisher.nextMessage();
  assert.equal(linkResult.event, "error");
  assert.equal(linkResult.publicationState, "published");
  assert.equal(linkResult.failureStage, "published_temporary_cleanup");
  assert.equal(linkResult.cleanupStatus, "failed");
  assert.equal((await linkPublisher.exit).code, 0);
  assert.equal(fs.readFileSync(path.join(linkRoot, ".codex", "config.toml"), "utf8").includes("hades-orchestrator"), true);
  assert.equal(fs.readdirSync(path.join(linkRoot, ".codex")).filter((name) => name.endsWith(".tmp")).length, 1);
  assert.throws(() => inspectCodexProjectConfiguration(linkRoot), /single-link regular file/u);

  const lockRoot = createOutdatedConfiguredProject();
  context.after(() => removeProject(lockRoot));
  const lockPublisher = startProcessFixture(context, lockRoot, "publish", "lock-release");
  assert.equal((await lockPublisher.nextMessage()).event, "planned");
  lockPublisher.send("publish");
  assert.equal((await lockPublisher.nextMessage()).event, "publishing");
  const lockResult = await lockPublisher.nextMessage();
  assert.equal(lockResult.event, "error");
  assert.equal(lockResult.publicCode, "lock_release_uncertain");
  assert.equal(lockResult.publicationState, "published");
  assert.equal(lockResult.lockStatus, "uncertain");
  assert.equal((await lockPublisher.exit).code, 0);
  assert.equal(inspectCodexProjectConfiguration(lockRoot).status, "ready");
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
