import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync, execFileSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildVerificationStagePlan,
  captureSourceSnapshot,
  executeVerificationStages,
  prepareSyntheticExecutionContext,
  runCommand,
  runLocalVerification,
  validateSyntheticExecutionContext
} from "../scripts/verify-local.js";
import { removeSyntheticSmokeRoot } from "../scripts/smoke-mcp-support.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function syntheticSnapshot(sha256 = "a".repeat(64)) {
  return {
    head: "1".repeat(40),
    branch: "main",
    workingTreeClean: true,
    snapshotSha256: sha256,
    trackedFileCount: 1,
    indexedFileCount: 1,
    untrackedFileCount: 0,
    fileCount: 1,
    totalBytes: 10
  };
}

function sampleStages(count = 3) {
  return Array.from({ length: count }, (_, index) => ({
    id: `stage-${index + 1}`,
    packageScript: `npm run stage-${index + 1}`,
    command: `node stage-${index + 1}.js`,
    executable: process.execPath,
    args: [`stage-${index + 1}.js`],
    timeoutMs: 1000
  }));
}

test("VERIFY-LOCAL-01: aşamalar statik kontrol, tam test, benchmark, smoke ve verify sırasındadır", () => {
  const stages = buildVerificationStagePlan(projectRoot);
  assert.deepEqual(stages.map((stage) => stage.id), ["verify-ci", "test-suite", "test-benchmark", "smoke", "verify"]);
  assert.equal(stages[1].packageScript, "npm test");
  assert.equal(stages[2].packageScript, "npm test");
  assert.ok(stages[1].args.includes("tests/verify-local.test.js"));
  assert.equal(stages[2].timeoutMs, 60000);
  assert.throws(() => buildVerificationStagePlan(path.dirname(projectRoot)), { code: "ENOENT" });
});

test("VERIFY-LOCAL-02: aşamalar sırayla çalışır ve ilk başarısızlıktan sonrakiler atlanır", async () => {
  const observed = [];
  const success = await executeVerificationStages(sampleStages(), {
    projectRoot,
    environment: {},
    runCommand: async ({ args }) => {
      observed.push(args[0]);
      return { status: "passed", exitCode: 0, durationMs: 5, outputBytes: 2, processTreeCleanup: null };
    }
  });
  assert.deepEqual(observed, ["stage-1.js", "stage-2.js", "stage-3.js"]);
  assert.equal(success.failure, null);
  assert.ok(success.stages.every((stage) => stage.status === "passed"));

  observed.length = 0;
  const failed = await executeVerificationStages(sampleStages(), {
    projectRoot,
    environment: {},
    runCommand: async ({ args }) => {
      observed.push(args[0]);
      return { status: args[0] === "stage-2.js" ? "failed" : "passed", exitCode: args[0] === "stage-2.js" ? 7 : 0, durationMs: 2, outputBytes: 0 };
    }
  });
  assert.deepEqual(observed, ["stage-1.js", "stage-2.js"]);
  assert.deepEqual(failed.failure, { stageId: "stage-2", class: "failed", exitCode: 7 });
  assert.equal(failed.stages[2].status, "skipped");
  assert.equal(failed.stages[2].skipReason, "previous_stage_failed");
});

test("VERIFY-LOCAL-03: başlamadan iptal edilen aşamalar başarıya dönüşmez", async () => {
  const controller = new AbortController();
  controller.abort();
  const result = await executeVerificationStages(sampleStages(2), {
    projectRoot,
    environment: {},
    signal: controller.signal,
    runCommand: async () => assert.fail("iptal edilen işlem başlatılmamalı")
  });
  assert.deepEqual(result.failure, { stageId: "stage-1", class: "cancelled" });
  assert.ok(result.stages.every((stage) => stage.status === "skipped" && stage.skipReason === "cancelled"));
});

test("VERIFY-LOCAL-03a: cancellation between stages cannot pass verification", async () => {
  const controller = new AbortController();
  const result = await executeVerificationStages(sampleStages(2), {
    projectRoot,
    environment: {},
    signal: controller.signal,
    runCommand: async () => {
      controller.abort();
      return { status: "passed", exitCode: 0, durationMs: 1, outputBytes: 0 };
    }
  });
  assert.deepEqual(result.failure, { stageId: "stage-2", class: "cancelled" });
  assert.equal(result.stages[1].status, "skipped");
  assert.equal(result.stages[1].skipReason, "cancelled");
});

test("VERIFY-LOCAL-04: gerçek alt süreç sonucu, çıktı boyutu ve nonzero exit kodunu kaydeder", async () => {
  const success = await runCommand({
    executable: process.execPath,
    args: ["-e", "process.stdout.write('a'); process.stderr.write('bc')"],
    cwd: projectRoot,
    env: process.env,
    timeoutMs: 5000,
    maxOutputBytes: 10
  });
  assert.equal(success.status, "passed");
  assert.equal(success.exitCode, 0);
  assert.equal(success.outputBytes, 3);

  const failure = await runCommand({
    executable: process.execPath,
    args: ["-e", "process.exit(9)"],
    cwd: projectRoot,
    env: process.env,
    timeoutMs: 5000,
    maxOutputBytes: 10
  });
  assert.equal(failure.status, "failed");
  assert.equal(failure.exitCode, 9);
});

test("VERIFY-LOCAL-05: timeout, cancellation, çıktı sınırı ve başlatma hatası ayrı sonuçlanır", { timeout: 30000 }, async () => {
  const timeout = await runCommand({
    executable: process.execPath,
    args: ["-e", "setTimeout(() => {}, 10000)"],
    cwd: projectRoot,
    env: process.env,
    timeoutMs: 100,
    maxOutputBytes: 100
  });
  assert.equal(timeout.status, "timeout");

  const controller = new AbortController();
  const running = runCommand({
    executable: process.execPath,
    args: ["-e", "setTimeout(() => {}, 10000)"],
    cwd: projectRoot,
    env: process.env,
    timeoutMs: 5000,
    maxOutputBytes: 100,
    signal: controller.signal
  });
  setTimeout(() => controller.abort(), 100);
  const cancelled = await running;
  assert.equal(cancelled.status, "cancelled");

  const outputLimited = await runCommand({
    executable: process.execPath,
    args: ["-e", "process.stdout.write('x'.repeat(1000000))"],
    cwd: projectRoot,
    env: process.env,
    timeoutMs: 5000,
    maxOutputBytes: 128
  });
  assert.equal(outputLimited.status, "output_limit");
  assert.ok(outputLimited.outputBytes > 128);

  const startupError = await runCommand({
    executable: path.join(os.tmpdir(), `verify-local-missing-${process.pid}`),
    args: [],
    cwd: projectRoot,
    env: process.env,
    timeoutMs: 1000,
    maxOutputBytes: 100
  });
  assert.equal(startupError.status, "spawn_error");
  assert.ok(startupError.errorCode);
});

test("VERIFY-LOCAL-06: Git kaynak snapshot'ı kirli dosya ve untracked dosya değişimini yakalar", { timeout: 30000 }, async (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "verify-local-git-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  execFileSync("git", ["init", "-q", root]);
  execFileSync("git", ["-C", root, "config", "user.email", "verify-local@example.invalid"]);
  execFileSync("git", ["-C", root, "config", "user.name", "Verify Local Test"]);
  execFileSync("git", ["-C", root, "config", "core.autocrlf", "false"]);
  fs.writeFileSync(path.join(root, "tracked.txt"), "base\n");
  execFileSync("git", ["-C", root, "add", "tracked.txt"]);
  execFileSync("git", ["-C", root, "commit", "-q", "-m", "snapshot fixture"]);
  const clean = await captureSourceSnapshot(root);
  assert.equal(clean.workingTreeClean, true);
  fs.writeFileSync(path.join(root, "tracked.txt"), "modified\n");
  fs.writeFileSync(path.join(root, "new.txt"), "untracked\n");
  const dirty = await captureSourceSnapshot(root);
  assert.equal(dirty.head, clean.head);
  assert.equal(dirty.workingTreeClean, false);
  assert.equal(dirty.untrackedFileCount, 1);
  assert.notEqual(dirty.snapshotSha256, clean.snapshotSha256);
});

test("VERIFY-LOCAL-07: sentetik doğrulama ortamı kişisel config, ikinci Vault ve credential'ları dışlar", (context) => {
  const inheritedProfile = fs.mkdtempSync(path.join(os.tmpdir(), "verify-local-profile-trap-"));
  const personalConfigPath = path.join(inheritedProfile, "personal-policy.json");
  const personalVault = path.join(inheritedProfile, "personal-vault");
  fs.mkdirSync(personalVault);
  fs.writeFileSync(personalConfigPath, JSON.stringify({ marker: "personal-config-sentinel" }));
  fs.writeFileSync(path.join(personalVault, "marker.md"), "personal-vault-sentinel\n");
  context.after(() => fs.rmSync(inheritedProfile, { recursive: true, force: true }));
  const inheritedEnvironment = {
    ...process.env,
    ORCHESTRATOR_CONFIG: personalConfigPath,
    DEEPSEEK_API_KEY: "synthetic-provider-sentinel",
    OPENAI_API_KEY: "synthetic-openai-sentinel",
    HOME: inheritedProfile,
    USERPROFILE: inheritedProfile
  };
  const { context: synthetic } = prepareSyntheticExecutionContext(projectRoot, inheritedEnvironment);
  context.after(() => removeSyntheticSmokeRoot(synthetic.smokeRoot));
  const validated = validateSyntheticExecutionContext(synthetic, projectRoot);
  assert.notEqual(validated.environment.ORCHESTRATOR_CONFIG, personalConfigPath);
  assert.equal(Object.hasOwn(validated.environment, "DEEPSEEK_API_KEY"), false);
  assert.equal(Object.hasOwn(validated.environment, "OPENAI_API_KEY"), false);
  assert.equal(fs.statSync(validated.environment.USERPROFILE).isDirectory(), true);
  assert.equal(fs.statSync(validated.environment.APPDATA).isDirectory(), true);
  assert.equal(fs.statSync(validated.environment.LOCALAPPDATA).isDirectory(), true);
  assert.equal(Object.keys(validated.environment).every((name) => /(?:API[_-]?KEY|ACCESS[_-]?TOKEN|AUTH[_-]?TOKEN|CLIENT[_-]?SECRET|PASSWORD|PROVIDER[_-]?CREDENTIAL)/i.test(name) === false), true);
  assert.equal(fs.readFileSync(path.join(personalVault, "marker.md"), "utf8"), "personal-vault-sentinel\n");
  assert.equal(JSON.stringify(validated).includes("synthetic-provider-sentinel"), false);
});

test("VERIFY-LOCAL-08: geçersiz sentetik hazırlık aşama başlatmaz ve kendi geçici alanını temizler", async () => {
  let createdContext;
  const report = await runLocalVerification({
    projectRoot,
    captureSnapshot: async () => syntheticSnapshot(),
    createContext: async (root) => {
      const prepared = prepareSyntheticExecutionContext(root, {});
      createdContext = prepared.context;
      prepared.context.environment.DEEPSEEK_API_KEY = "must-not-leak";
      return prepared;
    },
    runCommand: async () => assert.fail("geçersiz ortamda aşama başlatılmamalı")
  });
  assert.equal(report.status, "setup_failed");
  assert.equal(report.failure.errorCode, "synthetic_environment_not_isolated");
  assert.doesNotMatch(JSON.stringify(report), /must-not-leak/);
  assert.equal(report.cleanup.status, "removed");
  assert.equal(fs.existsSync(createdContext.smokeRoot), false);
  assert.ok(report.stages.every((stage) => stage.status === "skipped"));
});

test("VERIFY-LOCAL-09: başarılı deneme küçük JSON sonucu, stage durumları ve kaynak bağını verir", async () => {
  const report = await runLocalVerification({
    projectRoot,
    captureSnapshot: async () => syntheticSnapshot(),
    createContext: async (root, environment) => prepareSyntheticExecutionContext(root, environment),
    runCommand: async () => ({ status: "passed", exitCode: 0, durationMs: 1, outputBytes: 4 })
  });
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.status, "passed");
  assert.equal(report.exitCode, 0);
  assert.equal(report.source.unchangedAtCompletion, true);
  assert.equal(report.environment.providerCredentialsForwarded, false);
  assert.equal(report.cleanup.status, "removed");
  assert.ok(report.stages.every((stage) => stage.status === "passed"));
});

test("VERIFY-LOCAL-10: kaynak drift'i başarısız raporlanır ve sonraki aşamalar atlanır", async () => {
  let snapshots = 0;
  const report = await runLocalVerification({
    projectRoot,
    captureSnapshot: async () => ++snapshots === 1 ? syntheticSnapshot() : syntheticSnapshot("b".repeat(64)),
    createContext: async (root, environment) => prepareSyntheticExecutionContext(root, environment),
    runCommand: async () => ({ status: "passed", exitCode: 0, durationMs: 1, outputBytes: 0 })
  });
  assert.equal(report.status, "source_changed");
  assert.equal(report.exitCode, 1);
  assert.equal(report.source.unchangedAtCompletion, false);
  assert.equal(report.cleanup.status, "removed");
  assert.equal(report.stages.length, 5);
});

test("VERIFY-LOCAL-11: başarısız aşama ile cleanup hatası raporda ayrı kalır", async () => {
  const report = await runLocalVerification({
    projectRoot,
    captureSnapshot: async () => syntheticSnapshot(),
    createContext: async (root, environment) => prepareSyntheticExecutionContext(root, environment),
    cleanupContext: (context) => {
      removeSyntheticSmokeRoot(context.smokeRoot);
      throw Object.assign(new Error("cleanup"), { code: "EACCES" });
    },
    runCommand: async () => ({ status: "failed", exitCode: 4, durationMs: 1, outputBytes: 0 })
  });
  assert.equal(report.status, "failed");
  assert.equal(report.failure.class, "failed");
  assert.equal(report.stages[0].status, "failed");
  assert.equal(report.stages[1].status, "skipped");
  assert.equal(report.cleanup.status, "failed");
  assert.equal(report.cleanup.errorCode, "EACCES");
});

test("VERIFY-LOCAL-12: CLI yardım verir, keyfi argüman ve rapor dosyası seçeneğini reddeder", () => {
  const scriptPath = path.join(projectRoot, "scripts", "verify-local.js");
  const help = spawnSync(process.execPath, [scriptPath, "--help"], { cwd: projectRoot, encoding: "utf8", windowsHide: true });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /npm run verify:local/);
  const rejected = spawnSync(process.execPath, [scriptPath, "--report=target.json"], { cwd: projectRoot, encoding: "utf8", windowsHide: true });
  assert.equal(rejected.status, 2);
  assert.doesNotMatch(rejected.stdout, /target\.json/);
});
