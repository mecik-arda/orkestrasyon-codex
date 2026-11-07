import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { runCommand } from "../scripts/verify-local.js";
import { classifyPowerShellProbeResult, createWindowsProcessEnvironment, probePowerShellFileExecution } from "./support/start-codex-launcher.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const launcherSource = path.join(repositoryRoot, "scripts", "start-codex.ps1");
const windowsPowerShellPath = process.platform === "win32"
  ? path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
  : null;
const powerShellProbe = probePowerShellFileExecution();
const behaviorSkipReason = powerShellProbe.status === "blocked" || powerShellProbe.status === "unavailable"
  ? powerShellProbe.reason
  : false;

function createLauncherFixture({ includeCodex = true, includeNode = true, includeGit = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex launcher ü & "));
  const scriptsDirectory = path.join(root, "scripts");
  const serverDirectory = path.join(root, "subagent-bridge", "src");
  const binaryDirectory = path.join(root, "bin");
  const helperDirectory = path.join(root, "helper");
  fs.mkdirSync(scriptsDirectory, { recursive: true });
  fs.mkdirSync(serverDirectory, { recursive: true });
  fs.mkdirSync(binaryDirectory, { recursive: true });
  fs.mkdirSync(helperDirectory, { recursive: true });
  fs.copyFileSync(launcherSource, path.join(scriptsDirectory, "start-codex.ps1"));
  fs.writeFileSync(path.join(serverDirectory, "server.js"), "process.exitCode = 0;\n", "utf8");
  const helperPath = path.join(helperDirectory, "capture-arguments.js");
  fs.writeFileSync(helperPath, [
    "const fs = require('node:fs');",
    "const names = ['DEEPSEEK_API_KEY', 'ANTHROPIC_AUTH_TOKEN'];",
    "fs.writeFileSync(process.env.CODEX_CAPTURE, JSON.stringify({ arguments: process.argv.slice(2), credentials: names.filter((name) => Object.hasOwn(process.env, name)) }), 'utf8');",
    "process.exit(Number(process.env.CODEX_EXIT_CODE));",
    ""
  ].join("\n"), "utf8");
  const executable = (name, body) => fs.writeFileSync(path.join(binaryDirectory, `${name}.cmd`), body, "utf8");
  if (includeNode) executable("node", "@exit /b 0\r\n");
  if (includeGit) executable("git", "@exit /b 0\r\n");
  if (includeCodex) executable("codex", [
    "@echo off",
    '"%FAKE_CODEX_NODE%" "%FAKE_CODEX_SCRIPT%" %*',
    "@exit /b %ERRORLEVEL%",
    ""
  ].join("\r\n"));
  const capturePath = path.join(root, "captured.json");
  const environment = {
    ...createWindowsProcessEnvironment({
      systemRoot: process.env.SystemRoot,
      tempDirectory: root,
      pathEntries: [binaryDirectory]
    }),
    CODEX_CAPTURE: capturePath,
    CODEX_EXIT_CODE: "37",
    FAKE_CODEX_NODE: process.execPath,
    FAKE_CODEX_SCRIPT: helperPath
  };
  return { root, binaryDirectory, capturePath, environment };
}

function invokeLauncher(fixture, argumentsList = [], timeout = 15000) {
  return spawnSync(windowsPowerShellPath, [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-File",
    path.join(fixture.root, "scripts", "start-codex.ps1"),
    ...argumentsList
  ], { cwd: fixture.root, env: fixture.environment, encoding: "utf8", timeout, windowsHide: true });
}

function assertProcessExited(result) {
  if (result.error?.code === "ETIMEDOUT") assert.fail("child process timed out");
  if (result.error) {
    const errorCode = /^[A-Za-z0-9_]+$/u.test(result.error.code || "") ? result.error.code : "OTHER";
    assert.fail(`child process spawn failed: ${errorCode}`);
  }
  if (result.signal) assert.fail(`child process ended by signal: ${result.signal}`);
  assert.ok(Number.isInteger(result.status), "process did not report a normal exit code");
}

test("PowerShell capability probe only skips a structurally identified policy denial", () => {
  const unavailable = classifyPowerShellProbeResult({ available: false });
  assert.deepEqual(unavailable, { status: "unavailable", reason: "windows_powershell_unavailable" });

  const policyDenied = classifyPowerShellProbeResult({
    available: true,
    markerObserved: false,
    result: {
      status: 1,
      stderr: "running scripts is disabled on this system\nCategoryInfo : SecurityError: (:) [], PSSecurityException\nFullyQualifiedErrorId : UnauthorizedAccess"
    }
  });
  assert.deepEqual(policyDenied, { status: "blocked", reason: "execution_policy_denied", spawnErrorCode: null });

  const policyTextWithoutNormalExit = classifyPowerShellProbeResult({
    available: true,
    markerObserved: false,
    result: {
      status: null,
      signal: "SIGTERM",
      stderr: "running scripts is disabled on this system\nCategoryInfo : SecurityError: (:) [], PSSecurityException\nFullyQualifiedErrorId : UnauthorizedAccess"
    }
  });
  assert.deepEqual(policyTextWithoutNormalExit, { status: "failed", reason: "probe_terminated_without_exit_code", spawnErrorCode: null });

  const accessDenied = classifyPowerShellProbeResult({
    available: true,
    markerObserved: false,
    result: { status: 1, stderr: "Access is denied." }
  });
  assert.deepEqual(accessDenied, { status: "failed", reason: "probe_unexpected_exit", spawnErrorCode: null });

  const authorizationManagerDenied = classifyPowerShellProbeResult({
    available: true,
    markerObserved: false,
    result: {
      status: 1,
      stderr: "AuthorizationManager check failed.\nCategoryInfo : SecurityError: (:) [], ParentContainsErrorRecordException\nFullyQualifiedErrorId : UnauthorizedAccess"
    }
  });
  assert.deepEqual(authorizationManagerDenied, { status: "failed", reason: "probe_unexpected_exit", spawnErrorCode: null });

  const timedOut = classifyPowerShellProbeResult({
    available: true,
    markerObserved: false,
    result: { status: null, error: { code: "ETIMEDOUT" } }
  });
  assert.deepEqual(timedOut, { status: "failed", reason: "probe_timeout", spawnErrorCode: "ETIMEDOUT" });

  const spawnDenied = classifyPowerShellProbeResult({
    available: true,
    markerObserved: false,
    result: { status: null, error: { code: "EACCES" } }
  });
  assert.deepEqual(spawnDenied, { status: "failed", reason: "probe_spawn_failed", spawnErrorCode: "EACCES" });

  const missingMarker = classifyPowerShellProbeResult({
    available: true,
    markerObserved: false,
    result: { status: 0, stderr: "" }
  });
  assert.deepEqual(missingMarker, { status: "failed", reason: "probe_marker_missing", spawnErrorCode: null });
});

test("PowerShell capability probe fails visibly for unknown Windows execution outcomes", { skip: process.platform !== "win32" }, () => {
  assert.notEqual(powerShellProbe.status, "failed", `PowerShell capability probe failed: ${powerShellProbe.reason}`);
  if (powerShellProbe.status !== "unavailable") assert.equal(powerShellProbe.cleanupStatus, "removed");
});

test("PowerShell timeout is distinguished and the owned process and directory are cleaned", { skip: powerShellProbe.status !== "available", timeout: 10000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-powershell-timeout-"));
  const scriptPath = path.join(root, "timeout-probe.ps1");
  try {
    fs.writeFileSync(scriptPath, "[System.Threading.Thread]::Sleep(5000)\n", "utf8");
    const result = await runCommand({
      executable: windowsPowerShellPath,
      args: ["-NoLogo", "-NoProfile", "-NonInteractive", "-File", scriptPath],
      cwd: root,
      env: createWindowsProcessEnvironment({
        systemRoot: process.env.SystemRoot,
        tempDirectory: root,
        pathEntries: [path.join(process.env.SystemRoot || "C:\\Windows", "System32")]
      }),
      timeoutMs: 500,
      maxOutputBytes: 1024
    });
    assert.equal(result.status, "timeout");
    assert.equal(result.processTreeCleanup.directChildExited, true);
    assert.equal(result.processTreeCleanup.stdioClosed, true);
    assert.equal(result.processTreeCleanup.status, "confirmed");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("Codex launcher preserves explicit arguments and exit code without provider credentials", { skip: behaviorSkipReason }, (context) => {
  const fixture = createLauncherFixture();
  context.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }));
  assert.equal(fixture.environment.PATH, fixture.binaryDirectory);
  assert.deepEqual(Object.keys(fixture.environment).sort(), [
    "CODEX_CAPTURE",
    "CODEX_EXIT_CODE",
    "ComSpec",
    "FAKE_CODEX_NODE",
    "FAKE_CODEX_SCRIPT",
    "PATH",
    "PATHEXT",
    "SystemRoot",
    "TEMP",
    "TMP",
    "WINDIR"
  ]);
  const argumentsList = ["--model", "gpt-6.1-sol", "--profile", "Personal Profile", "C:\\tail\\", "--", "A & B", "雪 & blue"];
  const result = invokeLauncher(fixture, argumentsList);
  assertProcessExited(result);
  assert.equal(result.status, 37, "launcher did not preserve the child exit code");
  const capture = JSON.parse(fs.readFileSync(fixture.capturePath, "utf8"));
  assert.deepEqual(capture.arguments, argumentsList, "launcher changed the explicit argument vector");
  assert.deepEqual(capture.credentials, [], "fixture child inherited a provider credential variable");
});

test("Codex launcher rejects command-shim arguments that PowerShell cannot round-trip", { skip: behaviorSkipReason }, (context) => {
  for (const argument of ["", 'quoted "value"', "%CODEX_CAPTURE%"]) {
    const fixture = createLauncherFixture();
    context.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }));
    const result = invokeLauncher(fixture, [argument]);
    assertProcessExited(result);
    assert.notEqual(result.status, 0);
    assert.equal(/cannot safely preserve empty, quoted, or percent-expanded arguments/u.test(`${result.stdout}${result.stderr}`), true);
    assert.equal(fs.existsSync(fixture.capturePath), false);
  }
});

test("Codex launcher fails clearly when Codex CLI is missing", { skip: behaviorSkipReason }, (context) => {
  const fixture = createLauncherFixture({ includeCodex: false });
  context.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }));
  const result = invokeLauncher(fixture);
  assertProcessExited(result);
  assert.notEqual(result.status, 0);
  assert.equal(/Codex CLI not found/u.test(`${result.stdout}${result.stderr}`), true, "missing Codex was not classified by the launcher");
  assert.equal(fs.existsSync(fixture.capturePath), false);
});

test("Codex launcher fails before launch when Node is missing", { skip: behaviorSkipReason }, (context) => {
  const fixture = createLauncherFixture({ includeNode: false });
  context.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }));
  const result = invokeLauncher(fixture);
  assertProcessExited(result);
  assert.notEqual(result.status, 0);
  assert.equal(/Required executable not found: node/u.test(`${result.stdout}${result.stderr}`), true, "missing Node was not classified by the launcher");
  assert.equal(fs.existsSync(fixture.capturePath), false);
});

test("Codex launcher fails before launch when Git is missing", { skip: behaviorSkipReason }, (context) => {
  const fixture = createLauncherFixture({ includeGit: false });
  context.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }));
  const result = invokeLauncher(fixture);
  assertProcessExited(result);
  assert.notEqual(result.status, 0);
  assert.equal(/Required executable not found: git/u.test(`${result.stdout}${result.stderr}`), true, "missing Git was not classified by the launcher");
  assert.equal(fs.existsSync(fixture.capturePath), false);
});

test("Codex launcher fixtures remain isolated when two bounded launches overlap", { skip: behaviorSkipReason, timeout: 20000 }, async (context) => {
  const firstFixture = createLauncherFixture();
  const secondFixture = createLauncherFixture();
  context.after(() => fs.rmSync(firstFixture.root, { recursive: true, force: true }));
  context.after(() => fs.rmSync(secondFixture.root, { recursive: true, force: true }));
  const firstArguments = ["--profile", "first fixture", "--", "A & B"];
  const secondArguments = ["--profile", "second fixture", "--", "雪 path"];
  const firstRun = runCommand({
    executable: windowsPowerShellPath,
    args: ["-NoLogo", "-NoProfile", "-NonInteractive", "-File", path.join(firstFixture.root, "scripts", "start-codex.ps1"), ...firstArguments],
    cwd: firstFixture.root,
    env: firstFixture.environment,
    timeoutMs: 15000,
    maxOutputBytes: 4096
  });
  const secondRun = runCommand({
    executable: windowsPowerShellPath,
    args: ["-NoLogo", "-NoProfile", "-NonInteractive", "-File", path.join(secondFixture.root, "scripts", "start-codex.ps1"), ...secondArguments],
    cwd: secondFixture.root,
    env: secondFixture.environment,
    timeoutMs: 15000,
    maxOutputBytes: 4096
  });
  const [firstResult, secondResult] = await Promise.all([firstRun, secondRun]);
  assert.equal(firstResult.status, "failed");
  assert.equal(firstResult.exitCode, 37);
  assert.equal(secondResult.status, "failed");
  assert.equal(secondResult.exitCode, 37);
  assert.deepEqual(JSON.parse(fs.readFileSync(firstFixture.capturePath, "utf8")).arguments, firstArguments);
  assert.deepEqual(JSON.parse(fs.readFileSync(secondFixture.capturePath, "utf8")).arguments, secondArguments);
  assert.notEqual(firstFixture.capturePath, secondFixture.capturePath);
  assert.notEqual(firstFixture.binaryDirectory, secondFixture.binaryDirectory);
});

test("PowerShell launcher spawn failure remains separate from a normal exit", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-powershell-spawn-error-"));
  try {
    const missingExecutable = path.join(root, "missing-powershell.exe");
    const result = await runCommand({
      executable: missingExecutable,
      args: [],
      cwd: root,
      env: createWindowsProcessEnvironment({
        systemRoot: process.env.SystemRoot,
        tempDirectory: root,
        pathEntries: [path.join(process.env.SystemRoot || "C:\\Windows", "System32")]
      }),
      timeoutMs: 1000,
      maxOutputBytes: 1024
    });
    assert.equal(result.status, "spawn_error");
    assert.equal(result.exitCode, null);
    assert.equal(result.errorCode, "ENOENT");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("Codex launcher source preserves the caller-selected CLI and has no provider credential gate", () => {
  const source = fs.readFileSync(launcherSource, "utf8");
  assert.match(source, /Get-Command -Name "codex" -CommandType Application/u);
  assert.match(source, /\$forwardedArguments = @\(\$args\)/u);
  assert.match(source, /& \$codexExecutable\.Source @forwardedArguments/u);
  assert.doesNotMatch(source, /ANTHROPIC_AUTH_TOKEN|DEEPSEEK_API_KEY|--model\s+["']gpt-/u);
});
