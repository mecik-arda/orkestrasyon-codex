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

function processIsRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code !== "ESRCH";
  }
}

async function waitForFile(filePath, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (!fs.existsSync(filePath) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(fs.existsSync(filePath), true, `expected process marker ${path.basename(filePath)}`);
  return Number(fs.readFileSync(filePath, "utf8"));
}

async function waitForProcessExit(pid, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (processIsRunning(pid) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return !processIsRunning(pid);
}

function processTreeCommand(markerDirectory) {
  const parentMarker = path.join(markerDirectory, "parent.pid");
  const descendantMarker = path.join(markerDirectory, "descendant.pid");
  const descendantReadyMarker = path.join(markerDirectory, "descendant.ready");
  const releaseMarker = path.join(markerDirectory, "release");
  const descendantSource = `const fs=require("node:fs");fs.writeFileSync(${JSON.stringify(descendantMarker)},String(process.pid));fs.writeFileSync(${JSON.stringify(descendantReadyMarker)},"ready");const interval=setInterval(()=>{if(fs.existsSync(${JSON.stringify(releaseMarker)})){clearInterval(interval);process.exit(0)}},10)`;
  const parentSource = `const {spawn}=require("node:child_process");const fs=require("node:fs");const child=spawn(process.execPath,["-e",${JSON.stringify(descendantSource)}],{stdio:"inherit",detached:true});fs.writeFileSync(${JSON.stringify(parentMarker)},String(process.pid));fs.writeFileSync(${JSON.stringify(descendantMarker)},String(child.pid));child.on("exit",()=>process.exit(0))`;
  return { executable: process.execPath, args: ["-e", parentSource], parentMarker, descendantMarker, descendantReadyMarker, releaseMarker };
}

function stopOwnedProcess(pid) {
  if (!Number.isInteger(pid) || !processIsRunning(pid)) return;
  try {
    process.kill(pid, "SIGKILL");
  } catch {
  }
}

async function waitForTreeMarkers(command) {
  const parentPid = await waitForFile(command.parentMarker);
  const descendantPid = await waitForFile(command.descendantMarker);
  await waitForFile(command.descendantReadyMarker);
  return { parentPid, descendantPid };
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
  assert.equal(report.schemaVersion, 2);
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

test("VERIFY-LOCAL-13: real parent and descendant finish normally", { timeout: 15000 }, async (context) => {
  const markerDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "verify-local-tree-normal-"));
  context.after(() => fs.rmSync(markerDirectory, { recursive: true, force: true }));
  const command = processTreeCommand(markerDirectory);
  const resultPromise = runCommand({ ...command, cwd: projectRoot, env: process.env, timeoutMs: 10000, maxOutputBytes: 1000 });
  const { parentPid, descendantPid } = await waitForTreeMarkers(command);
  fs.writeFileSync(command.releaseMarker, "release");
  const result = await resultPromise;
  assert.equal(result.status, "passed");
  assert.deepEqual(result.processTreeCleanup, {
    status: "not_applied",
    method: "none",
    terminationRequested: false,
    directChildExited: true,
    stdioClosed: true,
    forcedStdioClose: false
  });
  assert.equal(await waitForProcessExit(parentPid), true);
  assert.equal(await waitForProcessExit(descendantPid), true);
});

test("VERIFY-LOCAL-14: Windows taskkill terminates the process tree", { skip: process.platform !== "win32", timeout: 15000 }, async (context) => {
  const markerDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "verify-local-tree-taskkill-"));
  context.after(() => fs.rmSync(markerDirectory, { recursive: true, force: true }));
  const command = processTreeCommand(markerDirectory);
  const controller = new AbortController();
  let parentPid = null;
  let descendantPid = null;
  try {
    const resultPromise = runCommand({ ...command, cwd: projectRoot, env: process.env, timeoutMs: 10000, maxOutputBytes: 1000, signal: controller.signal });
    const markers = await waitForTreeMarkers(command);
    parentPid = markers.parentPid;
    descendantPid = markers.descendantPid;
    controller.abort();
    const result = await resultPromise;
    assert.equal(result.status, "cancelled");
    if (result.processTreeCleanup.method === "taskkill_tree") {
      assert.equal(result.processTreeCleanup.status, "confirmed");
      assert.equal(result.processTreeCleanup.toolExitCode, 0);
      assert.equal(result.processTreeCleanup.forcedStdioClose, false);
      assert.equal(await waitForProcessExit(parentPid), true);
      assert.equal(await waitForProcessExit(descendantPid), true);
    } else {
      assert.equal(result.processTreeCleanup.method, "direct_fallback");
      assert.equal(result.processTreeCleanup.status, "unconfirmed");
      assert.equal(result.processTreeCleanup.forcedStdioClose, true);
    }
  } finally {
    stopOwnedProcess(descendantPid);
    stopOwnedProcess(parentPid);
  }
});

test("VERIFY-LOCAL-15: Windows direct fallback is bounded and reports an unconfirmed tree", { skip: process.platform !== "win32", timeout: 15000 }, async (context) => {
  const markerDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "verify-local-tree-fallback-"));
  context.after(() => fs.rmSync(markerDirectory, { recursive: true, force: true }));
  const command = processTreeCommand(markerDirectory);
  const controller = new AbortController();
  let descendantPid = null;
  try {
    const resultPromise = runCommand({ ...command, cwd: projectRoot, env: process.env, timeoutMs: 10000, maxOutputBytes: 1000, signal: controller.signal }, { taskkillPathResolver: () => null });
    const markers = await waitForTreeMarkers(command);
    descendantPid = markers.descendantPid;
    controller.abort();
    const result = await resultPromise;
    assert.equal(result.status, "cancelled");
    assert.equal(result.processTreeCleanup.status, "unconfirmed");
    assert.equal(result.processTreeCleanup.method, "direct_fallback");
    assert.equal(result.processTreeCleanup.terminationRequested, true);
    assert.equal(result.processTreeCleanup.directChildExited, true);
    assert.equal(result.processTreeCleanup.forcedStdioClose, true);
    assert.ok(result.durationMs < 5000);
    assert.equal(processIsRunning(descendantPid), true);
  } finally {
    stopOwnedProcess(descendantPid);
    const parentPid = fs.existsSync(command.parentMarker) ? Number(fs.readFileSync(command.parentMarker, "utf8")) : null;
    stopOwnedProcess(parentPid);
  }
});

test("VERIFY-LOCAL-15a: an exited parent with a pipe-holding descendant cannot block the runner", { skip: process.platform !== "win32", timeout: 15000 }, async (context) => {
  const markerDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "verify-local-tree-parent-exit-"));
  context.after(() => fs.rmSync(markerDirectory, { recursive: true, force: true }));
  const command = processTreeCommand(markerDirectory);
  let parentPid = null;
  let descendantPid = null;
  try {
    const resultPromise = runCommand({ ...command, cwd: projectRoot, env: process.env, timeoutMs: 500, maxOutputBytes: 1000 });
    const markers = await waitForTreeMarkers(command);
    parentPid = markers.parentPid;
    descendantPid = markers.descendantPid;
    stopOwnedProcess(parentPid);
    assert.equal(await waitForProcessExit(parentPid), true);
    const result = await resultPromise;
    assert.equal(result.status, "timeout");
    assert.equal(result.processTreeCleanup.status, "unconfirmed");
    assert.equal(result.processTreeCleanup.method, "parent_already_exited");
    assert.equal(result.processTreeCleanup.forcedStdioClose, true);
    assert.ok(result.durationMs < 4000);
    assert.equal(processIsRunning(descendantPid), true);
  } finally {
    stopOwnedProcess(descendantPid);
    stopOwnedProcess(parentPid);
  }
});

test("VERIFY-LOCAL-16: Windows taskkill failure is reported before direct fallback", { skip: process.platform !== "win32", timeout: 15000 }, async (context) => {
  const markerDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "verify-local-tree-taskkill-fail-"));
  context.after(() => fs.rmSync(markerDirectory, { recursive: true, force: true }));
  const command = processTreeCommand(markerDirectory);
  const controller = new AbortController();
  let descendantPid = null;
  try {
    const resultPromise = runCommand({ ...command, cwd: projectRoot, env: process.env, timeoutMs: 10000, maxOutputBytes: 1000, signal: controller.signal }, {
      taskkillPathResolver: () => "C:\\Windows\\System32\\taskkill.exe",
      spawnSync: () => ({ status: 1, error: { code: "EACCES" } })
    });
    const markers = await waitForTreeMarkers(command);
    descendantPid = markers.descendantPid;
    controller.abort();
    const result = await resultPromise;
    assert.equal(result.status, "cancelled");
    assert.equal(result.processTreeCleanup.status, "unconfirmed");
    assert.equal(result.processTreeCleanup.method, "direct_fallback");
    assert.equal(result.processTreeCleanup.errorCode, "EACCES");
    assert.equal(result.processTreeCleanup.toolExitCode, 1);
    assert.equal(processIsRunning(descendantPid), true);
  } finally {
    stopOwnedProcess(descendantPid);
    const parentPid = fs.existsSync(command.parentMarker) ? Number(fs.readFileSync(command.parentMarker, "utf8")) : null;
    stopOwnedProcess(parentPid);
  }
});

test("VERIFY-LOCAL-17: direct termination failure stays bounded and preserves the primary status", { skip: process.platform !== "win32", timeout: 15000 }, async (context) => {
  const markerDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "verify-local-tree-fallback-fail-"));
  context.after(() => fs.rmSync(markerDirectory, { recursive: true, force: true }));
  const command = processTreeCommand(markerDirectory);
  const controller = new AbortController();
  let parentPid = null;
  let descendantPid = null;
  try {
    const resultPromise = runCommand({ ...command, cwd: projectRoot, env: process.env, timeoutMs: 10000, maxOutputBytes: 1000, signal: controller.signal }, {
      taskkillPathResolver: () => null,
      sendDirectChildSignal: () => { throw Object.assign(new Error("signal failed"), { code: "EACCES" }); }
    });
    const markers = await waitForTreeMarkers(command);
    parentPid = markers.parentPid;
    descendantPid = markers.descendantPid;
    controller.abort();
    const result = await resultPromise;
    assert.equal(result.status, "cancelled");
    assert.equal(result.processTreeCleanup.status, "failed");
    assert.equal(result.processTreeCleanup.terminationRequested, false);
    assert.equal(result.processTreeCleanup.directChildExited, false);
    assert.equal(result.processTreeCleanup.forcedStdioClose, true);
  } finally {
    stopOwnedProcess(descendantPid);
    stopOwnedProcess(parentPid);
  }
});

test("VERIFY-LOCAL-18: output limit remains the first result when cancellation arrives during termination", { timeout: 10000 }, async () => {
  const controller = new AbortController();
  const result = await runCommand({
    executable: process.execPath,
    args: ["-e", "process.stdout.write('x'.repeat(4096)); setInterval(() => {}, 1000)"],
    cwd: projectRoot,
    env: process.env,
    timeoutMs: 5000,
    maxOutputBytes: 64,
    signal: controller.signal
  }, {
    onTerminationRequested: (status) => {
      if (status === "output_limit") controller.abort();
    }
  });
  assert.equal(result.status, "output_limit");
  assert.equal(result.processTreeCleanup.terminationRequested, true);
  assert.ok(result.outputBytes > 64);
});

test("VERIFY-LOCAL-19: cancellation racing with child exit cannot become passed or resolve twice", async () => {
  const controller = new AbortController();
  let abortListenerRemovals = 0;
  const removeAbortListener = controller.signal.removeEventListener.bind(controller.signal);
  controller.signal.removeEventListener = (...argumentsList) => {
    if (argumentsList[0] === "abort") abortListenerRemovals += 1;
    return removeAbortListener(...argumentsList);
  };
  const result = await runCommand({
    executable: process.execPath,
    args: ["-e", "process.exit(0)"],
    cwd: projectRoot,
    env: process.env,
    timeoutMs: 5000,
    maxOutputBytes: 64,
    signal: controller.signal
  }, {
    onDirectChildExit: () => controller.abort()
  });
  assert.equal(result.status, "cancelled");
  assert.equal(result.exitCode, 0);
  assert.equal(result.processTreeCleanup.status, "unconfirmed");
  assert.equal(result.processTreeCleanup.method, "parent_already_exited");
  assert.equal(abortListenerRemovals, 1);
});

test("VERIFY-LOCAL-20: unconfirmed process cleanup preserves the synthetic root", async () => {
  let smokeRoot = null;
  const report = await runLocalVerification({
    captureSnapshot: async () => syntheticSnapshot(),
    createContext: async (root, environment) => {
      const prepared = prepareSyntheticExecutionContext(root, environment);
      smokeRoot = prepared.context.smokeRoot;
      return prepared;
    },
    runCommand: async () => ({
      status: "timeout",
      exitCode: null,
      durationMs: 10,
      outputBytes: 0,
      processTreeCleanup: { status: "unconfirmed", terminationRequested: true }
    })
  });
  assert.equal(report.status, "failed");
  assert.equal(report.failure.class, "timeout");
  assert.equal(report.cleanup.status, "preserved");
  assert.equal(report.cleanup.reason, "process_tree_cleanup_unconfirmed");
  assert.equal(fs.existsSync(smokeRoot), true);
  removeSyntheticSmokeRoot(smokeRoot);
});

test("VERIFY-LOCAL-21: failed process cleanup is distinguished and its synthetic root is retained", async () => {
  let smokeRoot = null;
  const report = await runLocalVerification({
    captureSnapshot: async () => syntheticSnapshot(),
    createContext: async (root, environment) => {
      const prepared = prepareSyntheticExecutionContext(root, environment);
      smokeRoot = prepared.context.smokeRoot;
      return prepared;
    },
    runCommand: async () => ({
      status: "timeout",
      exitCode: null,
      durationMs: 10,
      outputBytes: 0,
      processTreeCleanup: { status: "failed", terminationRequested: false }
    })
  });
  assert.equal(report.cleanup.status, "preserved");
  assert.equal(report.cleanup.reason, "process_tree_cleanup_failed");
  assert.equal(fs.existsSync(smokeRoot), true);
  removeSyntheticSmokeRoot(smokeRoot);
});
