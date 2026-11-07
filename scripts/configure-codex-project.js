import { fileURLToPath } from "node:url";
import { applyCodexProjectConfiguration, getCodexProjectRoot, inspectCodexProjectConfiguration } from "./codex-project-config.js";

const action = process.argv[2];
if (!new Set(["--write", "--check"]).has(action)) {
  process.stderr.write("Use --write to update the managed Hades MCP entry or --check for a read-only diagnostic.\n");
  process.exitCode = 2;
} else {
  try {
    const projectRoot = getCodexProjectRoot(fileURLToPath(import.meta.url));
    const report = action === "--write"
      ? await applyCodexProjectConfiguration(projectRoot)
      : inspectCodexProjectConfiguration(projectRoot);
    process.stdout.write(`${JSON.stringify(report)}\n`);
    if (!report.ok) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, action, status: "rejected", error: error instanceof Error ? error.message : "configuration_update_failed" })}\n`);
    process.exitCode = 1;
  }
}
