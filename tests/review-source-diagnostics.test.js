import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  createReviewSourceManifest,
  REVIEW_SOURCE_MAX_FILE_BYTES,
  REVIEW_SOURCE_MAX_FILES,
  REVIEW_SOURCE_MAX_TOTAL_BYTES
} from "../subagent-bridge/src/services/review-source-manifest.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const diagnosticScript = path.join(projectRoot, "scripts", "diagnose-review-source.js");

function createWorkspace(t) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "review-source-diagnostics-"));
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }));
  return workspace;
}

function executeDiagnostic(workspace, files, extras = [], environmentChanges = {}) {
  const environment = Object.fromEntries(Object.entries({
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    WINDIR: process.env.WINDIR,
    TEMP: os.tmpdir(),
    TMP: os.tmpdir(),
    USERPROFILE: path.join(workspace, "unused-user-profile"),
    HOME: path.join(workspace, "unused-home"),
    ORCHESTRATOR_CONFIG: path.join(workspace, "must-not-read-config.json"),
    SUBAGENT_BRIDGE_AGENTS_CONFIG: path.join(workspace, "must-not-read-agents.json"),
    SUBAGENT_BRIDGE_TRUSTED_WORKSPACE: path.join(workspace, "must-not-use-workspace"),
    SUBAGENT_MEMORY_PROFILE: "must-not-load-profile",
    ...environmentChanges
  }).filter(([, value]) => typeof value === "string"));
  const argumentsList = [diagnosticScript, "--workspace", workspace, ...files.flatMap((file) => ["--file", file]), ...extras];
  const child = spawnSync(process.execPath, argumentsList, { encoding: "utf8", env: environment, timeout: 30000 });
  assert.equal(child.error, undefined);
  assert.equal(child.stderr, "");
  return { exitCode: child.status, stdout: child.stdout, result: JSON.parse(child.stdout) };
}

test("RSD-01: clean diagnostic reuses exact manifest limits and binds source and policy snapshots", (t) => {
  const workspace = createWorkspace(t);
  fs.mkdirSync(path.join(workspace, "src"), { recursive: true });
  fs.writeFileSync(path.join(workspace, "src", "answer.js"), "export const answer = 42;\n", "utf8");
  fs.writeFileSync(path.join(workspace, "src", "notes.txt"), "ordinary selected text\n", "utf8");

  const manifest = createReviewSourceManifest(workspace, ["src/answer.js", "src/notes.txt"]);
  const first = executeDiagnostic(workspace, ["src/notes.txt", "src/answer.js"]);

  assert.equal(first.exitCode, 0);
  assert.equal(first.result.decision, "clean");
  assert.equal(first.result.completeness, "complete");
  assert.equal(first.result.request.requestedFileCount, 2);
  assert.equal(first.result.request.inspectedFileCount, 2);
  assert.equal(first.result.request.sourceBytesComplete, true);
  assert.equal(first.result.request.snapshotSha256, manifest.manifestSha256);
  assert.equal(first.result.request.manifestSha256, manifest.manifestSha256);
  assert.equal(first.result.request.bundleBytes, manifest.sourcePayloadBytes);
  assert.equal(first.result.policy.syntaxAwareJavaScriptEnabled, false);
  assert.equal(first.result.policy.runtimeConfigurationLoaded, false);
  assert.equal(first.result.policy.mayDifferFromActiveRuntime, true);
  assert.equal(first.result.policy.sha256.length, 64);
  assert.equal(first.result.checks.perFilePreflight, "passed");
  assert.equal(first.result.checks.totalSourceBytes, "passed");
  assert.equal(first.result.checks.bundleBytes, "passed");
  assert.deepEqual(first.result.files.map((file) => file.path), ["src/notes.txt", "src/answer.js"]);
  assert.equal(first.result.execution.sourcePayloadCreated, false);
  assert.equal(first.result.execution.providerStarted, false);
  assert.equal(first.result.execution.mcpReviewStarted, false);
  assert.equal(first.result.execution.personalConfigurationLoaded, false);
  assert.equal(first.result.execution.vaultAccessed, false);
  assert.equal(first.stdout.includes(workspace), false);

  const repeated = executeDiagnostic(workspace, ["src/answer.js", "src/notes.txt"], [
    "--expected-snapshot", first.result.request.snapshotSha256,
    "--expected-policy", first.result.policy.sha256
  ]);
  assert.equal(repeated.exitCode, 0);
  assert.equal(repeated.result.request.snapshotSha256, first.result.request.snapshotSha256);
  assert.equal(repeated.result.policy.sha256, first.result.policy.sha256);
  assert.equal(repeated.result.comparison.snapshotState, "matches_expected");
  assert.equal(repeated.result.comparison.policyState, "matches_expected");

  fs.appendFileSync(path.join(workspace, "src", "answer.js"), "export const next = 43;\n", "utf8");
  const changed = executeDiagnostic(workspace, ["src/answer.js", "src/notes.txt"], [
    "--expected-snapshot", first.result.request.snapshotSha256
  ]);
  assert.equal(changed.exitCode, 3);
  assert.equal(changed.result.decision, "clean");
  assert.equal(changed.result.comparison.snapshotState, "changed_since_expected");
  assert.equal(changed.result.comparison.snapshotMatchesExpected, false);
});

test("RSD-02: blocked source is redacted and production fail-fast reach is separate from diagnostic coverage", (t) => {
  const workspace = createWorkspace(t);
  const syntheticCredential = `AKIA${"1234567890ABCDEF"}`;
  fs.writeFileSync(path.join(workspace, "a-blocked.js"), `const token = "${syntheticCredential}";\n`, "utf8");
  fs.writeFileSync(path.join(workspace, "z-clean.txt"), "ordinary selected text\n", "utf8");

  const run = executeDiagnostic(workspace, ["z-clean.txt", "a-blocked.js"]);

  assert.equal(run.exitCode, 2);
  assert.equal(run.result.decision, "blocked");
  assert.equal(run.result.failureClass, "review_scope_secret_detected");
  assert.equal(run.result.firstProductionFailure.inputIndex, 2);
  assert.equal(run.result.firstProductionFailure.path, "a-blocked.js");
  assert.equal(run.result.firstProductionFailure.stage, "legacy_secret_classifier");
  assert.equal(run.result.completeness, "complete");
  assert.equal(run.result.request.inspectedFileCount, 2);
  assert.equal(run.result.request.sourceBytesComplete, true);
  const blockedFile = run.result.files.find((file) => file.path === "a-blocked.js");
  const cleanFile = run.result.files.find((file) => file.path === "z-clean.txt");
  assert.equal(blockedFile.signal, "known_signature");
  assert.equal(blockedFile.productionReached, true);
  assert.equal(cleanFile.status, "clean");
  assert.equal(cleanFile.productionReached, false);
  assert.equal(run.result.checks.bundleBytes, "not_run_after_first_failure");
  assert.equal(run.result.execution.sourcePayloadCreated, false);
  assert.equal(run.stdout.includes(syntheticCredential), false);
  assert.equal(run.stdout.includes("const token"), false);
});

test("RSD-03: unsafe paths and caller policy overrides fail without echoing input paths", (t) => {
  const workspace = createWorkspace(t);
  const privatePath = "../private-review-path-marker";
  const rejectedPath = executeDiagnostic(workspace, [privatePath]);

  assert.equal(rejectedPath.exitCode, 2);
  assert.equal(rejectedPath.result.failureClass, "review_scope_invalid");
  assert.equal(rejectedPath.result.firstProductionFailure.inputIndex, 1);
  assert.equal(rejectedPath.result.firstProductionFailure.path, null);
  assert.equal(rejectedPath.result.files[0].path, null);
  assert.equal(rejectedPath.result.completeness, "partial");
  assert.equal(rejectedPath.stdout.includes(privatePath), false);

  const overrideAttempt = executeDiagnostic(workspace, ["safe.js"], ["--syntax-aware"]);
  assert.equal(overrideAttempt.exitCode, 64);
  assert.equal(overrideAttempt.result.failureClass, "review_diagnostic_arguments_invalid");
  assert.equal(overrideAttempt.result.detailCode, "unknown_option");
  assert.equal(overrideAttempt.result.execution.providerStarted, false);
});

test("RSD-04: file count, per-file, total-source, and serialized-bundle limits report distinct stages", (t) => {
  const workspace = createWorkspace(t);
  fs.writeFileSync(path.join(workspace, "large.txt"), Buffer.alloc(REVIEW_SOURCE_MAX_FILE_BYTES + 1, 0x61));
  fs.writeFileSync(path.join(workspace, "tail.txt"), "safe\n", "utf8");
  const oversizedFile = executeDiagnostic(workspace, ["large.txt", "tail.txt"]);
  assert.equal(oversizedFile.result.firstProductionFailure.failureClass, "review_scope_too_large");
  assert.equal(oversizedFile.result.firstProductionFailure.stage, "file_type_and_identity");
  assert.equal(oversizedFile.result.checks.perFilePreflight, "blocked");
  assert.equal(oversizedFile.result.request.sourceBytesComplete, false);

  const countWorkspace = createWorkspace(t);
  const tooManyFiles = Array.from({ length: REVIEW_SOURCE_MAX_FILES + 1 }, (_, index) => `missing-${index}.txt`);
  const overCount = executeDiagnostic(countWorkspace, tooManyFiles);
  assert.equal(overCount.result.failureClass, "review_scope_invalid");
  assert.equal(overCount.result.request.requestedFileCount, REVIEW_SOURCE_MAX_FILES + 1);
  assert.equal(overCount.result.request.inspectedFileCount, 0);
  assert.equal(overCount.result.completeness, "partial");

  const totalWorkspace = createWorkspace(t);
  const halfTotal = Buffer.alloc(Math.floor(REVIEW_SOURCE_MAX_TOTAL_BYTES / 2) + 1, 0x61);
  fs.writeFileSync(path.join(totalWorkspace, "a.txt"), halfTotal);
  fs.writeFileSync(path.join(totalWorkspace, "b.txt"), halfTotal);
  const overTotal = executeDiagnostic(totalWorkspace, ["a.txt", "b.txt"]);
  assert.equal(overTotal.result.failureClass, "review_scope_too_large");
  assert.equal(overTotal.result.firstProductionFailure.stage, "total_source_bytes");
  assert.equal(overTotal.result.checks.totalSourceBytes, "blocked");
  assert.equal(overTotal.result.checks.bundleBytes, "not_run_after_first_failure");

  const bundleWorkspace = createWorkspace(t);
  fs.writeFileSync(path.join(bundleWorkspace, "newlines.txt"), "\n".repeat(132000), "utf8");
  const overBundle = executeDiagnostic(bundleWorkspace, ["newlines.txt"]);
  assert.equal(overBundle.result.failureClass, "review_scope_too_large");
  assert.equal(overBundle.result.firstProductionFailure.stage, "bundle_bytes");
  assert.equal(overBundle.result.checks.totalSourceBytes, "passed");
  assert.equal(overBundle.result.checks.bundleBytes, "blocked");
  assert.ok(overBundle.result.request.bundleBytes > 256 * 1024);
});
