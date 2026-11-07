import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const executionMarker = "CODEX_FILE_EXECUTION_ALLOWED";
const allowedSpawnErrorCodes = new Set(["EACCES", "E2BIG", "ENOENT", "EPERM", "ETIMEDOUT"]);

function safeSpawnErrorCode(errorCode) {
  return allowedSpawnErrorCodes.has(errorCode) ? errorCode : errorCode ? "OTHER" : null;
}

function hasExecutionPolicyDenial(stderr) {
  const categoryConfirmsPowerShellSecurityException = /\bCategoryInfo\s*:\s*SecurityError:[\s\S]{0,600}\bPSSecurityException\b/u.test(stderr);
  const errorIdConfirmsScriptAccessDenial = /\bFullyQualifiedErrorId\s*:\s*UnauthorizedAccess(?:\b|,)/u.test(stderr);
  const messageConfirmsExecutionPolicy = /running scripts is disabled|execution of scripts is disabled|not digitally signed/iu.test(stderr);
  return categoryConfirmsPowerShellSecurityException && errorIdConfirmsScriptAccessDenial && messageConfirmsExecutionPolicy;
}

export function classifyPowerShellProbeResult({ available, result, markerObserved }) {
  if (!available) return { status: "unavailable", reason: "windows_powershell_unavailable" };

  const spawnErrorCode = safeSpawnErrorCode(result?.error?.code);
  if (spawnErrorCode === "ETIMEDOUT") return { status: "failed", reason: "probe_timeout", spawnErrorCode };
  if (spawnErrorCode) return { status: "failed", reason: "probe_spawn_failed", spawnErrorCode };
  if (result?.status === 0 && markerObserved) return { status: "available", reason: null, spawnErrorCode: null };

  if (Number.isInteger(result?.status) && result.status !== 0 && !markerObserved && hasExecutionPolicyDenial(result.stderr || "")) {
    return { status: "blocked", reason: "execution_policy_denied", spawnErrorCode: null };
  }

  if (result?.status === null || result?.status === undefined) {
    return { status: "failed", reason: "probe_terminated_without_exit_code", spawnErrorCode: null };
  }

  if (result.status === 0) return { status: "failed", reason: "probe_marker_missing", spawnErrorCode: null };
  return { status: "failed", reason: "probe_unexpected_exit", spawnErrorCode: null };
}

export function createWindowsProcessEnvironment({ systemRoot, tempDirectory, pathEntries }) {
  const resolvedSystemRoot = systemRoot || "C:\\Windows";
  const environmentPath = pathEntries.join(path.delimiter);
  return {
    PATH: environmentPath,
    PATHEXT: ".COM;.EXE;.BAT;.CMD",
    SystemRoot: resolvedSystemRoot,
    WINDIR: resolvedSystemRoot,
    ComSpec: path.join(resolvedSystemRoot, "System32", "cmd.exe"),
    TEMP: tempDirectory,
    TMP: tempDirectory
  };
}

export function probePowerShellFileExecution({
  platform = process.platform,
  systemRoot = process.env.SystemRoot,
  tempBase = os.tmpdir(),
  spawn = spawnSync
} = {}) {
  if (platform !== "win32") return { status: "unavailable", reason: "windows_powershell_unavailable" };

  const resolvedSystemRoot = systemRoot || "C:\\Windows";
  const powerShellPath = path.join(resolvedSystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  if (!fs.existsSync(powerShellPath)) return { status: "unavailable", reason: "windows_powershell_unavailable" };

  let root;
  let probeResult;
  let markerObserved = false;
  let setupFailed = false;
  let spawnThrew = false;
  let thrownSpawnErrorCode = null;
  let cleanupFailed = false;

  try {
    root = fs.mkdtempSync(path.join(tempBase, "codex-powershell-probe-"));
    const scriptPath = path.join(root, "file-execution-probe.ps1");
    fs.writeFileSync(scriptPath, `[Console]::Out.WriteLine('${executionMarker}')\n`, "utf8");
    const systemPath = path.join(resolvedSystemRoot, "System32");
    try {
      probeResult = spawn(powerShellPath, ["-NoLogo", "-NoProfile", "-NonInteractive", "-File", scriptPath], {
        cwd: root,
        env: createWindowsProcessEnvironment({
          systemRoot: resolvedSystemRoot,
          tempDirectory: root,
          pathEntries: [systemPath]
        }),
        encoding: "utf8",
        timeout: 10000,
        windowsHide: true
      });
    } catch (error) {
      spawnThrew = true;
      thrownSpawnErrorCode = safeSpawnErrorCode(error?.code);
    }
    markerObserved = (probeResult?.stdout || "").includes(executionMarker);
  } catch {
    setupFailed = true;
  } finally {
    if (root) {
      try {
        fs.rmSync(root, { recursive: true, force: true });
      } catch {
        cleanupFailed = true;
      }
    }
  }

  let outcome = setupFailed
    ? { status: "failed", reason: "probe_setup_failed", spawnErrorCode: null }
    : spawnThrew
      ? { status: "failed", reason: "probe_spawn_failed", spawnErrorCode: thrownSpawnErrorCode }
      : classifyPowerShellProbeResult({ available: true, result: probeResult, markerObserved });

  if (cleanupFailed) {
    outcome = {
      status: "failed",
      reason: outcome.status === "failed" ? outcome.reason : "probe_cleanup_failed",
      primaryStatus: outcome.status,
      cleanupStatus: "failed"
    };
  } else {
    outcome.cleanupStatus = root ? "removed" : "not_created";
  }

  return outcome;
}
