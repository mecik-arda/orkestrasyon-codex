import { fileURLToPath } from "node:url";
import { applyCodexProjectConfiguration, getCodexProjectRoot, inspectCodexProjectConfiguration } from "./codex-project-config.js";
import { buildConfigurationFailureReport } from "./codex-project-config-report.js";

const action = process.argv[2];
let projectRoot = null;
if (!new Set(["--write", "--check"]).has(action)) {
  process.stderr.write("Use --write to update the managed Hades MCP entry or --check for a read-only diagnostic.\n");
  process.exitCode = 2;
} else {
  try {
    projectRoot = getCodexProjectRoot(fileURLToPath(import.meta.url));
    const report = action === "--write"
      ? await applyCodexProjectConfiguration(projectRoot)
      : inspectCodexProjectConfiguration(projectRoot);
    process.stdout.write(`${JSON.stringify(report)}\n`);
    if (!report.ok) process.exitCode = 1;
  } catch (error) {
    let currentConfigurationStatus = "not_observed";
    if (action === "--write" && projectRoot !== null) {
      try {
        currentConfigurationStatus = inspectCodexProjectConfiguration(projectRoot).status;
      } catch {
        currentConfigurationStatus = "unavailable";
      }
    }
    process.stderr.write(`${JSON.stringify(buildConfigurationFailureReport(action, error, currentConfigurationStatus))}\n`);
    process.exitCode = 1;
  }
}
