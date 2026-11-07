import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const launcherSource = path.join(repositoryRoot, "scripts", "start-codex.ps1");
const windowsPowerShellPath = process.platform === "win32"
  ? path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
  : null;
const powerShellAvailable = windowsPowerShellPath !== null && fs.existsSync(windowsPowerShellPath);
const powerShellExecutionStatus = probePowerShellFileExecution();

function probePowerShellFileExecution() {
  if (!powerShellAvailable) return { allowed: false, reason: "windows_powershell_unavailable" };
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-powershell-policy-"));
  const scriptPath = path.join(root, "policy-probe.ps1");
  try {
    fs.writeFileSync(scriptPath, "[Console]::Out.WriteLine('CODEX_FILE_EXECUTION_ALLOWED')\n", "utf8");
    const result = spawnSync(windowsPowerShellPath, ["-NoLogo", "-NoProfile", "-NonInteractive", "-File", scriptPath], {
      cwd: root,
      env: {
        PATH: process.env.Path || process.env.PATH || "",
        SystemRoot: process.env.SystemRoot || "C:\\Windows",
        WINDIR: process.env.WINDIR || process.env.SystemRoot || "C:\\Windows",
        TEMP: root,
        TMP: root
      },
      encoding: "utf8",
      timeout: 10000,
      windowsHide: true
    });
    if (result.status === 0 && result.stdout.includes("CODEX_FILE_EXECUTION_ALLOWED")) return { allowed: true, reason: null };
    return { allowed: false, reason: "powershell_file_execution_policy_blocked" };
  } catch {
    return { allowed: false, reason: "powershell_file_execution_unavailable" };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

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
  const environment = Object.fromEntries(Object.entries({
    PATH: binaryDirectory,
    PATHEXT: ".COM;.EXE;.BAT;.CMD",
    SystemRoot: process.env.SystemRoot,
    WINDIR: process.env.WINDIR,
    ComSpec: process.env.ComSpec,
    TEMP: root,
    TMP: root,
    CODEX_CAPTURE: capturePath,
    CODEX_EXIT_CODE: "37",
    FAKE_CODEX_NODE: process.execPath,
    FAKE_CODEX_SCRIPT: helperPath
  }).filter(([, value]) => typeof value === "string"));
  return { root, binaryDirectory, capturePath, environment };
}

function invokeLauncher(fixture, argumentsList = []) {
  return spawnSync(windowsPowerShellPath, [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-File",
    path.join(fixture.root, "scripts", "start-codex.ps1"),
    ...argumentsList
  ], { cwd: fixture.root, env: fixture.environment, encoding: "utf8", timeout: 15000, windowsHide: true });
}

test("Codex launcher preserves explicit arguments and exit code without provider credentials", { skip: !powerShellExecutionStatus.allowed && powerShellExecutionStatus.reason }, (context) => {
  const fixture = createLauncherFixture();
  context.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }));
  const argumentsList = ["--model", "gpt-6.1-sol", "--profile", "Personal Profile", "--", "A & B"];
  const result = invokeLauncher(fixture, argumentsList);
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 37, result.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(fixture.capturePath, "utf8")), { arguments: argumentsList, credentials: [] });
});

test("Codex launcher fails clearly when Codex CLI is missing", { skip: !powerShellExecutionStatus.allowed && powerShellExecutionStatus.reason }, (context) => {
  const fixture = createLauncherFixture({ includeCodex: false });
  context.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }));
  const result = invokeLauncher(fixture);
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /Codex CLI not found/u);
  assert.equal(fs.existsSync(fixture.capturePath), false);
});

test("Codex launcher fails before launch when Node or Git is missing", { skip: !powerShellExecutionStatus.allowed && powerShellExecutionStatus.reason }, (context) => {
  for (const options of [{ includeNode: false }, { includeGit: false }]) {
    const fixture = createLauncherFixture(options);
    context.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }));
    const result = invokeLauncher(fixture);
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /Required executable not found: (?:node|git)/u);
    assert.equal(fs.existsSync(fixture.capturePath), false);
  }
});

test("Codex launcher source preserves the caller-selected CLI and has no provider credential gate", () => {
  const source = fs.readFileSync(launcherSource, "utf8");
  assert.match(source, /Get-Command -Name "codex" -CommandType Application/u);
  assert.match(source, /\$forwardedArguments = @\(\$args\)/u);
  assert.match(source, /& \$codexExecutable\.Source @forwardedArguments/u);
  assert.doesNotMatch(source, /ANTHROPIC_AUTH_TOKEN|DEEPSEEK_API_KEY|--model\s+["']gpt-/u);
});
