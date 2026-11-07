import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildCodexDiagnostics, buildDiagnosticFailureReport } from "../scripts/codex-diagnostics.js";
import { prepareCodexProjectConfiguration } from "../scripts/codex-project-config.js";

function createReadyProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex diagnostics \u00fc & "));
  fs.mkdirSync(path.join(root, "subagent-bridge", "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "subagent-bridge", "src", "server.js"), "process.exitCode = 0;\n", "utf8");
  const plan = prepareCodexProjectConfiguration(root);
  fs.mkdirSync(path.dirname(plan.configurationPath), { recursive: true });
  fs.writeFileSync(plan.configurationPath, plan.nextBytes);
  return root;
}

test("Codex diagnostics reports project readiness without reading or exposing user configuration", (context) => {
  const root = createReadyProject();
  const binaryDirectory = path.join(root, "bin");
  fs.mkdirSync(binaryDirectory);
  fs.writeFileSync(path.join(binaryDirectory, "codex.cmd"), "", "utf8");
  fs.writeFileSync(path.join(binaryDirectory, "git.cmd"), "", "utf8");
  const configPath = path.join(root, ".codex", "config.toml");
  const originalBytes = fs.readFileSync(configPath);
  const secretSentinel = "diagnostics-must-not-print-this";
  const report = buildCodexDiagnostics(root, {
    PATH: binaryDirectory,
    PATHEXT: ".COM;.EXE;.BAT;.CMD",
    DEEPSEEK_API_KEY: secretSentinel,
    ORCHESTRATOR_CONFIG: secretSentinel
  }, "win32");
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const serialized = JSON.stringify(report);
  assert.equal(report.status, "ready");
  assert.equal(report.projectConfiguration.status, "ready");
  assert.deepEqual(report.prerequisites, { node: true, git: true, codexCli: true, hadesEntrypoint: true });
  assert.equal(report.runtime.desktopHades, "not_observed");
  assert.equal(report.validation.syntheticStdioE2e, "not_run");
  assert.equal(report.externalAccess.personalVault, "not_accessed");
  assert.equal(report.externalAccess.providerInference, "not_run");
  assert.equal(report.externalAccess.userGlobalCodexConfiguration, "not_read");
  assert.equal(serialized.includes(root), false);
  assert.equal(serialized.includes(secretSentinel), false);
  assert.deepEqual(fs.readFileSync(configPath), originalBytes);
  assert.deepEqual(fs.readdirSync(path.join(root, ".codex")), ["config.toml"]);
});

test("Codex diagnostics reports missing prerequisites and an unmanaged project entry without side effects", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex diagnostics missing "));
  fs.mkdirSync(path.join(root, "subagent-bridge", "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "subagent-bridge", "src", "server.js"), "process.exitCode = 0;\n", "utf8");
  const report = buildCodexDiagnostics(root, { PATH: "", PATHEXT: ".EXE;.CMD" }, "win32");
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.equal(report.status, "needs_attention");
  assert.equal(report.projectConfiguration.status, "needs_update");
  assert.equal(report.prerequisites.codexCli, false);
  assert.equal(report.prerequisites.git, false);
  assert.equal(fs.existsSync(path.join(root, ".codex")), false);
});

test("Codex diagnostic failure report does not propagate exception text", () => {
  const secretSentinel = "diagnostic-path-and-secret-sentinel";
  const report = buildDiagnosticFailureReport(new Error(secretSentinel));
  assert.deepEqual(report, { schemaVersion: 1, status: "diagnostic_failed", error: "diagnostic_failed" });
  assert.equal(JSON.stringify(report).includes(secretSentinel), false);
});
