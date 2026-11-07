import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getCodexProjectRoot, inspectCodexProjectConfiguration } from "./codex-project-config.js";

function regularFileExists(filePath) {
  try {
    const stat = fs.lstatSync(filePath);
    return stat.isFile() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}

function findExecutable(executableName, environment, platform = process.platform) {
  const pathEntries = environment.PATH || environment.Path || "";
  const extensions = platform === "win32"
    ? (environment.PATHEXT || ".COM;.EXE;.BAT;.CMD").split(";")
    : [""];
  for (const directory of pathEntries.split(path.delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      const candidate = path.join(directory, `${executableName}${extension}`);
      if (regularFileExists(candidate)) return true;
    }
  }
  return false;
}

export function buildCodexDiagnostics(projectRoot, environment = process.env, platform = process.platform) {
  const resolvedRoot = fs.realpathSync(projectRoot);
  const config = inspectCodexProjectConfiguration(resolvedRoot);
  const entryPoint = path.join(resolvedRoot, "subagent-bridge", "src", "server.js");
  const prerequisites = {
    node: process.execPath && regularFileExists(process.execPath),
    git: findExecutable("git", environment, platform),
    codexCli: findExecutable("codex", environment, platform),
    hadesEntrypoint: regularFileExists(entryPoint)
  };
  const report = {
    schemaVersion: 1,
    status: config.projectMcpReady && Object.values(prerequisites).every(Boolean) ? "ready" : "needs_attention",
    project: { rootSha256: crypto.createHash("sha256").update(resolvedRoot).digest("hex") },
    projectConfiguration: {
      status: config.status,
      projectMcpReady: config.projectMcpReady,
      checks: config.checks,
      managedChangeCount: config.changes.filter((change) => change.operation !== "match").length,
      preservedUnknownHadesFieldCount: config.preservedUnknownHadesFieldCount
    },
    prerequisites,
    runtime: {
      desktopHades: "not_observed",
      activeRuntimeConfiguration: "not_attested",
      restart: "operator_managed"
    },
    validation: {
      syntheticStdioE2e: "not_run",
      command: "npm run verify:local"
    },
    externalAccess: {
      providerInference: "not_run",
      capabilityProbe: "not_run",
      personalVault: "not_accessed",
      userGlobalCodexConfiguration: "not_read"
    }
  };
  return report;
}

export function main() {
  try {
    const projectRoot = getCodexProjectRoot(fileURLToPath(import.meta.url));
    const report = buildCodexDiagnostics(projectRoot);
    process.stdout.write(`${JSON.stringify(report)}\n`);
    if (report.status !== "ready") process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ schemaVersion: 1, status: "diagnostic_failed", error: error instanceof Error ? error.message : "diagnostic_failed" })}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) main();
