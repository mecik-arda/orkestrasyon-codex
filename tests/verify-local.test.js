import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync, execFileSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
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
import { createTestDiagnosticsCollector, maximumDiagnosticPendingBytes, maximumDiagnosticRecordBytes } from "../scripts/verify-local-test-diagnostics.js";

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

function createSnapshotGitRepository(context, files, prefix = "verify-local-snapshot-") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  execFileSync("git", ["init", "-q", root]);
  execFileSync("git", ["-C", root, "config", "user.email", "verify-local@example.invalid"]);
  execFileSync("git", ["-C", root, "config", "user.name", "Verify Local Test"]);
  execFileSync("git", ["-C", root, "config", "core.autocrlf", "false"]);
  for (const [relativePath, contents] of Object.entries(files)) {
    const targetPath = path.join(root, ...relativePath.split("/"));
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, contents);
  }
  execFileSync("git", ["-C", root, "add", "--all"]);
  execFileSync("git", ["-C", root, "commit", "-q", "-m", "snapshot fixture"]);
  return root;
}

function createDiagnosticEnvironment() {
  return Object.fromEntries(Object.entries({
    PATH: process.env.Path || process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    WINDIR: process.env.WINDIR,
    ComSpec: process.env.ComSpec,
    PATHEXT: process.env.PATHEXT,
    TEMP: os.tmpdir(),
    TMP: os.tmpdir()
  }).filter(([, value]) => typeof value === "string"));
}

function startDiagnosticTestFiles(context, files, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "verify-local-diagnostics-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [relativePath, contents] of Object.entries(files)) {
    const destination = path.join(root, ...relativePath.split("/"));
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, contents, "utf8");
  }
  const reporterPath = options.reporterSource
    ? path.join(root, "failing-reporter.mjs")
    : path.join(projectRoot, "scripts", "verify-local-test-reporter.js");
  if (options.reporterSource) fs.writeFileSync(reporterPath, options.reporterSource, "utf8");
  const args = [
    "--test",
    `--test-reporter=${pathToFileURL(reporterPath).href}`,
    "--test-reporter-destination=stdout",
    ...Object.keys(files)
  ];
  const result = runCommand({
    executable: process.execPath,
    args,
    cwd: root,
    env: createDiagnosticEnvironment(),
    timeoutMs: options.timeoutMs ?? 10000,
    maxOutputBytes: options.maxOutputBytes ?? 16777216,
    signal: options.signal,
    diagnostics: {
      stageId: options.stageId || "test-suite",
      projectRoot: root,
      allowedTestFiles: Object.keys(files)
    }
  });
  return { result, root, files: Object.keys(files), args };
}

async function runDiagnosticTestFiles(context, files, options = {}) {
  const running = startDiagnosticTestFiles(context, files, options);
  return { ...running, result: await running.result };
}

async function captureWithStreamHook(root, targetPath, signal, hook) {
  const originalOpen = fs.promises.open;
  let hooked = false;
  let openedHandle = null;
  fs.promises.open = async function (filePath, ...argumentsList) {
    const handle = await originalOpen.call(fs.promises, filePath, ...argumentsList);
    if (path.resolve(filePath).toLocaleLowerCase("en-US") === path.resolve(targetPath).toLocaleLowerCase("en-US")) {
      openedHandle = handle;
      const originalCreateReadStream = handle.createReadStream.bind(handle);
      handle.createReadStream = (...streamArguments) => {
        const stream = originalCreateReadStream(...streamArguments);
        stream.once("data", () => {
          hooked = true;
          hook({ stream, handle });
        });
        return stream;
      };
    }
    return handle;
  };
  try {
    try {
      return { result: await captureSourceSnapshot(root, signal), error: null, hooked: () => hooked, openedHandle: () => openedHandle };
    } catch (error) {
      return { result: null, error, hooked: () => hooked, openedHandle: () => openedHandle };
    }
  } finally {
    fs.promises.open = originalOpen;
  }
}

test("VERIFY-LOCAL-01: aşamalar statik kontrol, tam test, benchmark, smoke ve verify sırasındadır", () => {
  const stages = buildVerificationStagePlan(projectRoot);
  assert.deepEqual(stages.map((stage) => stage.id), ["verify-ci", "test-suite", "test-benchmark", "smoke", "verify"]);
  assert.equal(stages[1].packageScript, "npm test");
  assert.equal(stages[2].packageScript, "npm test");
  assert.ok(stages[1].args.includes("tests/verify-local.test.js"));
  assert.ok(stages[1].args.some((argument) => argument.startsWith("--test-reporter=file:///")));
  assert.ok(stages[2].args.includes("--test-reporter-destination=stdout"));
  assert.deepEqual(stages[2].testFiles, ["tests/performance/memory-search.test.js"]);
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

test("VERIFY-LOCAL-04a: gerçek test reporter dosya ve konum bağını korurken bütün ham sentinelleri dışarıda bırakır", { timeout: 20000 }, async (context) => {
  const sentinels = [
    "DIAGNOSTIC_TITLE_SENTINEL_8f14e45fceea",
    "DIAGNOSTIC_ACTUAL_SENTINEL_45c48cce2e2d",
    "DIAGNOSTIC_EXPECTED_SENTINEL_d3d9446802a4",
    "DIAGNOSTIC_MESSAGE_SENTINEL_6512bd43d9ca",
    "DIAGNOSTIC_STDOUT_SENTINEL_c20ad4d76fe9",
    "DIAGNOSTIC_STDERR_SENTINEL_c51ce410c124"
  ];
  const source = [
    'const test = require("node:test");',
    'const assert = require("node:assert/strict");',
    `test(${JSON.stringify(sentinels[0])}, () => {`,
    `  process.stdout.write(${JSON.stringify(`not ok ${sentinels[4]} {"diagnostic":"forged"}`)});`,
    `  process.stderr.write(${JSON.stringify(sentinels[5])});`,
    `  assert.equal(${JSON.stringify(sentinels[1])}, ${JSON.stringify(sentinels[2])}, ${JSON.stringify(sentinels[3])});`,
    "});"
  ].join("\n");
  const run = await runDiagnosticTestFiles(context, { "failure.test.cjs": source });
  assert.equal(run.result.status, "failed");
  assert.equal(run.result.exitCode, 1);
  assert.equal(run.result.diagnostics.status, "complete");
  assert.equal(run.result.diagnostics.failureCount, 1);
  assert.deepEqual(run.result.diagnostics.failureSamples.map((entry) => entry.file), ["failure.test.cjs"]);
  assert.equal(run.result.diagnostics.failureSamples[0].line, 3);
  assert.equal(run.result.diagnostics.failureSamples[0].testNameSha256, crypto.createHash("sha256").update(sentinels[0]).digest("hex"));
  const serializedResult = JSON.stringify(run.result);
  for (const sentinel of sentinels) assert.equal(serializedResult.includes(sentinel), false);
  assert.equal(serializedResult.includes("forged"), false);
});

test("VERIFY-LOCAL-04b: iç içe suite hataları tekil leaf hata sayılır ve aynı ad farklı dosyalarda ayrılır", { timeout: 20000 }, async (context) => {
  const sharedName = "same nested and top-level name";
  const run = await runDiagnosticTestFiles(context, {
    "first.test.cjs": [
      'const test = require("node:test");',
      'const assert = require("node:assert/strict");',
      'test("container", async (context) => {',
      `  await context.test(${JSON.stringify(sharedName)}, () => assert.equal(1, 2));`,
      "});"
    ].join("\n"),
    "second.test.cjs": [
      'const test = require("node:test");',
      'const assert = require("node:assert/strict");',
      `test(${JSON.stringify(sharedName)}, () => assert.equal(3, 4));`
    ].join("\n")
  });
  assert.equal(run.result.status, "failed");
  assert.equal(run.result.diagnostics.status, "complete");
  assert.equal(run.result.diagnostics.failureCount, 2);
  assert.ok(run.result.diagnostics.suiteFailureCount >= 1);
  const leafFailures = run.result.diagnostics.failureSamples.filter((entry) => entry.role === "leaf");
  const containerFailures = run.result.diagnostics.failureSamples.filter((entry) => entry.role === "container");
  assert.deepEqual(new Set(leafFailures.map((entry) => entry.file)), new Set(run.files));
  assert.equal(leafFailures[0].testNameSha256, leafFailures[1].testNameSha256);
  assert.equal(containerFailures.length, run.result.diagnostics.suiteFailureCount);
});

test("VERIFY-LOCAL-04c: Unicode ve aşırı uzun test adları ham metin olmadan hash sınırına uyar", { timeout: 20000 }, async (context) => {
  const longName = `başarısızlık-${"ü漢🙂".repeat(1500)}`;
  const source = [
    'const test = require("node:test");',
    'const assert = require("node:assert/strict");',
    `test(${JSON.stringify(longName)}, () => assert.equal(1, 2));`
  ].join("\n");
  const run = await runDiagnosticTestFiles(context, { "unicode.test.cjs": source });
  assert.equal(run.result.diagnostics.status, "complete");
  assert.equal(run.result.diagnostics.failureCount, 1);
  assert.equal(run.result.diagnostics.nameHashOmittedCount, 1);
  assert.equal(run.result.diagnostics.failureSamples[0].testNameSha256, null);
  assert.equal(run.result.diagnostics.failureSamples[0].testNameHashStatus, "omitted_too_large");
  assert.equal(JSON.stringify(run.result).includes(longName), false);
});

test("VERIFY-LOCAL-04d: hata örnekleri sabit sayıda tutulur ve kesilme sonucu raporlanır", { timeout: 20000 }, async (context) => {
  const cases = Array.from({ length: 35 }, (_, index) => `test(${JSON.stringify(`failure-${index}`)}, () => assert.equal(${index}, -1));`);
  const source = ['const test = require("node:test");', 'const assert = require("node:assert/strict");', ...cases].join("\n");
  const run = await runDiagnosticTestFiles(context, { "many-failures.test.cjs": source });
  assert.equal(run.result.status, "failed");
  assert.equal(run.result.diagnostics.status, "truncated");
  assert.equal(run.result.diagnostics.failureCount, 35);
  assert.equal(run.result.diagnostics.failureSamples.length, 20);
  assert.equal(run.result.diagnostics.omittedFailureSamples, 15);
  assert.equal(run.result.diagnostics.countsComplete, true);
});

test("VERIFY-LOCAL-04e: bozuk, aşırı uzun veya eksik reporter kaydı sınırlı tanıyı unavailable yapar", () => {
  const allowedTestFiles = ["tests/é.test.js"];
  const failureRecord = {
    version: 1,
    kind: "failure",
    role: "leaf",
    file: allowedTestFiles[0],
    line: 8,
    column: 4,
    testNameSha256: "a".repeat(64),
    testNameHashStatus: "available",
    failureClass: "assertion"
  };
  const summaryRecord = {
    version: 1,
    kind: "summary",
    status: "complete",
    failureCount: 1,
    suiteFailureCount: 0,
    passedCount: 0,
    skippedCount: 0,
    todoCount: 0,
    observedEvents: 1,
    omittedEvents: 0,
    failureSamples: 1,
    omittedFailureSamples: 0,
    unmappedFailureCount: 0,
    testOutputBytes: 0,
    nameHashOmittedCount: 0
  };
  const completeBytes = Buffer.from(`${JSON.stringify(failureRecord)}\n${JSON.stringify(summaryRecord)}\n`, "utf8");
  const splitCollector = createTestDiagnosticsCollector({ stageId: "test-suite", projectRoot: os.tmpdir(), allowedTestFiles });
  for (let offset = 0; offset < completeBytes.length; offset += 2) splitCollector.consume(completeBytes.subarray(offset, offset + 2));
  const splitResult = splitCollector.finish({ primaryStatus: "failed" });
  assert.equal(splitResult.status, "complete");
  assert.equal(splitResult.failureSamples[0].file, allowedTestFiles[0]);

  const oversized = createTestDiagnosticsCollector({ stageId: "test-suite", projectRoot: os.tmpdir(), allowedTestFiles });
  oversized.consume(Buffer.from(`${"x".repeat(maximumDiagnosticRecordBytes + maximumDiagnosticPendingBytes)}\n`));
  assert.equal(oversized.finish({ primaryStatus: "failed" }).reason, "record_byte_limit");

  const malformed = createTestDiagnosticsCollector({ stageId: "test-suite", projectRoot: os.tmpdir(), allowedTestFiles });
  malformed.consume(Buffer.from([0xc3, 0x28, 0x0a]));
  assert.equal(malformed.finish({ primaryStatus: "failed" }).reason, "malformed_record");

  const incomplete = createTestDiagnosticsCollector({ stageId: "test-suite", projectRoot: os.tmpdir(), allowedTestFiles });
  incomplete.consume(completeBytes.subarray(0, completeBytes.length - 1));
  assert.equal(incomplete.finish({ primaryStatus: "failed" }).reason, "missing_final_record");
});

test("VERIFY-LOCAL-04f: syntax error ve reporter arızası gerçek child sonucunu geçemez", { timeout: 20000 }, async (context) => {
  const syntax = await runDiagnosticTestFiles(context, { "broken.test.cjs": "const test = require('node:test'); const = broken" });
  assert.equal(syntax.result.status, "failed");
  assert.equal(syntax.result.diagnostics.status, "complete");
  assert.equal(syntax.result.diagnostics.failureCount, 1);
  assert.equal(syntax.result.diagnostics.suiteFailureCount, 0);
  assert.equal(syntax.result.diagnostics.failureSamples[0].file, "broken.test.cjs");
  assert.equal(syntax.result.diagnostics.failureSamples[0].role, "leaf");
  assert.equal(syntax.result.diagnostics.failureSamples[0].failureClass, "test_failure");

  const reporter = await runDiagnosticTestFiles(context, {
    "passes.test.cjs": 'const test = require("node:test"); test("safe", () => {});'
  }, { reporterSource: "throw new Error('REPORTER_FAILURE_SENTINEL');" });
  assert.notEqual(reporter.result.status, "passed");
  assert.equal(reporter.result.diagnostics.status, "unavailable");
  assert.equal(JSON.stringify(reporter.result).includes("REPORTER_FAILURE_SENTINEL"), false);
});

test("VERIFY-LOCAL-04g: test çıktısının byte hesabı mevcut output_limit sonucunu korur", { timeout: 20000 }, async (context) => {
  const source = [
    'const test = require("node:test");',
    'test("bounded output", () => process.stdout.write("x".repeat(5000)));'
  ].join("\n");
  const run = await runDiagnosticTestFiles(context, { "large-output.test.cjs": source }, { maxOutputBytes: 1000 });
  assert.equal(run.result.status, "output_limit");
  assert.ok(run.result.outputBytes > 1000);
  assert.equal(run.result.diagnostics.status, "unavailable");
});

test("VERIFY-LOCAL-04h: suite ve benchmark stage'leri gerçek reporter tanısını aşama sonucuna taşır", { timeout: 20000 }, async (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "verify-local-stage-diagnostics-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const reporter = `--test-reporter=${pathToFileURL(path.join(projectRoot, "scripts", "verify-local-test-reporter.js")).href}`;
  const fileNames = ["suite.test.cjs", "benchmark.test.cjs"];
  for (const fileName of fileNames) {
    fs.writeFileSync(path.join(root, fileName), 'const test = require("node:test"); test("visible result", () => {});', "utf8");
  }
  const stages = fileNames.map((fileName, index) => ({
    id: index === 0 ? "test-suite" : "test-benchmark",
    packageScript: "npm test",
    command: "node --test fixture",
    executable: process.execPath,
    args: ["--test", reporter, "--test-reporter-destination=stdout", fileName],
    timeoutMs: 10000,
    testFiles: [fileName]
  }));
  const result = await executeVerificationStages(stages, { projectRoot: root, environment: createDiagnosticEnvironment() });
  assert.equal(result.failure, null);
  assert.deepEqual(result.stages.map((stage) => stage.diagnostics.stageId), ["test-suite", "test-benchmark"]);
  assert.ok(result.stages.every((stage) => stage.status === "passed" && stage.diagnostics.status === "complete"));
  assert.ok(result.stages.every((stage) => stage.diagnostics.passedCount === 1));

  const failureSentinel = "STAGE_FAILURE_SENTINEL_6f4922f45568161a8cdf4ad2299f6d23";
  fs.writeFileSync(path.join(root, "failed.test.cjs"), [
    'const test = require("node:test");',
    'const assert = require("node:assert/strict");',
    `test(${JSON.stringify(failureSentinel)}, () => assert.equal(1, 2));`
  ].join("\n"), "utf8");
  const failedSequence = await executeVerificationStages([{
    id: "test-suite",
    packageScript: "npm test",
    command: "node --test fixture",
    executable: process.execPath,
    args: ["--test", reporter, "--test-reporter-destination=stdout", "failed.test.cjs"],
    timeoutMs: 10000,
    testFiles: ["failed.test.cjs"]
  }], { projectRoot: root, environment: createDiagnosticEnvironment() });
  const failedStage = failedSequence.stages[0];
  assert.equal(failedSequence.failure.class, "failed");
  assert.equal(failedStage.status, "failed");
  assert.equal(failedStage.exitCode, 1);
  assert.equal(failedStage.diagnostics.status, "complete");
  assert.equal(failedStage.diagnostics.failureCount, 1);
  assert.equal(failedStage.diagnostics.failureSamples[0].file, "failed.test.cjs");
  assert.equal(JSON.stringify(failedSequence).includes(failureSentinel), false);
});

test("VERIFY-LOCAL-04i: reporter channel timeout ve cancellation cleanup'i korur", { timeout: 20000 }, async (context) => {
  const timeoutMarker = path.join(os.tmpdir(), `verify-local-reporter-timeout-${process.pid}-${Date.now()}`);
  const partialMarker = path.join(os.tmpdir(), `verify-local-reporter-partial-${process.pid}-${Date.now()}`);
  const cancelMarker = path.join(os.tmpdir(), `verify-local-reporter-cancel-${process.pid}-${Date.now()}`);
  context.after(() => {
    fs.rmSync(timeoutMarker, { force: true });
    fs.rmSync(partialMarker, { force: true });
    fs.rmSync(cancelMarker, { force: true });
  });
  const timeoutSource = [
    'const fs = require("node:fs");',
    'const test = require("node:test");',
    `test("timeout", async () => { fs.writeFileSync(${JSON.stringify(timeoutMarker)}, "ready"); await new Promise(() => {}); });`
  ].join("\n");
  const timeoutRun = startDiagnosticTestFiles(context, { "timeout.test.cjs": timeoutSource }, { timeoutMs: 500 });
  await waitForFile(timeoutMarker);
  const timeout = await timeoutRun.result;
  assert.equal(timeout.status, "timeout");
  assert.equal(timeout.diagnostics.status, "unavailable");
  assert.equal(timeout.processTreeCleanup.terminationRequested, true);

  const partialSource = [
    'const fs = require("node:fs");',
    'const test = require("node:test");',
    'const assert = require("node:assert/strict");',
    'test("fails before timeout", () => assert.equal(1, 2));',
    `test("keeps process open", async () => { fs.writeFileSync(${JSON.stringify(partialMarker)}, "ready"); await new Promise(() => {}); });`
  ].join("\n");
  const partialRun = startDiagnosticTestFiles(context, { "partial.test.cjs": partialSource }, { timeoutMs: 1000 });
  await waitForFile(partialMarker);
  const partial = await partialRun.result;
  assert.equal(partial.status, "timeout");
  assert.equal(partial.diagnostics.status, "unavailable");
  assert.equal(partial.diagnostics.failureCount, null);
  assert.equal(partial.diagnostics.failureSamples.length, 1);
  assert.equal(partial.diagnostics.failureSamples[0].file, "partial.test.cjs");
  assert.equal(partial.diagnostics.failureSamples[0].line, 4);

  const controller = new AbortController();
  const cancelSource = [
    'const fs = require("node:fs");',
    'const test = require("node:test");',
    `test("cancel", async () => { fs.writeFileSync(${JSON.stringify(cancelMarker)}, "ready"); await new Promise(() => {}); });`
  ].join("\n");
  const cancelRun = startDiagnosticTestFiles(context, { "cancel.test.cjs": cancelSource }, { signal: controller.signal, timeoutMs: 10000 });
  await waitForFile(cancelMarker);
  controller.abort();
  const cancelled = await cancelRun.result;
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.diagnostics.status, "unavailable");
  assert.equal(cancelled.processTreeCleanup.terminationRequested, true);
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

test("VERIFY-LOCAL-06A: ara dizin junction veya symlink dış hedefe izlenmez", { timeout: 30000 }, async (context) => {
  const root = createSnapshotGitRepository(context, { "nested/source.txt": "inside\n" });
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "verify-local-outside-"));
  context.after(() => fs.rmSync(outsideRoot, { recursive: true, force: true }));
  fs.writeFileSync(path.join(outsideRoot, "source.txt"), "outside synthetic source\n");
  fs.rmSync(path.join(root, "nested"), { recursive: true, force: true });
  try {
    fs.symlinkSync(outsideRoot, path.join(root, "nested"), process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP", "EOPNOTSUPP"].includes(error.code)) {
      context.skip("directory junction or symlink creation is unavailable");
      return;
    }
    throw error;
  }
  await assert.rejects(captureSourceSnapshot(root), { code: "source_path_link_unsupported" });
});

test("VERIFY-LOCAL-06B: yaprak symlink hedef içeriğini değil yalnız link metaverisini kapsar", { timeout: 30000 }, async (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "verify-local-link-leaf-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "verify-local-link-target-"));
  context.after(() => fs.rmSync(outsideRoot, { recursive: true, force: true }));
  const externalTarget = path.join(outsideRoot, "target.txt");
  fs.writeFileSync(externalTarget, "first external content\n");
  fs.symlinkSync(externalTarget, path.join(root, "link.txt"), "file");
  execFileSync("git", ["init", "-q", root]);
  execFileSync("git", ["-C", root, "config", "user.email", "verify-local@example.invalid"]);
  execFileSync("git", ["-C", root, "config", "user.name", "Verify Local Test"]);
  execFileSync("git", ["-C", root, "add", "link.txt"]);
  execFileSync("git", ["-C", root, "commit", "-q", "-m", "symlink fixture"]);
  const before = await captureSourceSnapshot(root);
  fs.writeFileSync(externalTarget, "second external content with a different size\n");
  const after = await captureSourceSnapshot(root);
  assert.equal(after.snapshotSha256, before.snapshotSha256);
  assert.equal(after.totalBytes, Buffer.byteLength(externalTarget));
});

test("VERIFY-LOCAL-06C: descriptor kimliği ilk path kontrolünden sonraki aynı içerikli dosya değişimini yakalar", { timeout: 30000 }, async (context) => {
  const root = createSnapshotGitRepository(context, { "source.txt": "same bytes\n" });
  const targetPath = path.join(root, "source.txt");
  const displacedPath = path.join(root, "source.displaced");
  const replacementPath = path.join(root, "source.replacement");
  const originalOpen = fs.promises.open;
  let replaced = false;
  fs.promises.open = async function (filePath, ...argumentsList) {
    if (!replaced && path.resolve(filePath).toLocaleLowerCase("en-US") === targetPath.toLocaleLowerCase("en-US")) {
      replaced = true;
      fs.renameSync(targetPath, displacedPath);
      fs.writeFileSync(replacementPath, "same bytes\n");
      fs.renameSync(replacementPath, targetPath);
    }
    return originalOpen.call(fs.promises, filePath, ...argumentsList);
  };
  try {
    await assert.rejects(captureSourceSnapshot(root), { code: "source_snapshot_unstable" });
  } finally {
    fs.promises.open = originalOpen;
  }
  assert.equal(replaced, true);
});

test("VERIFY-LOCAL-06D: truncate, büyüme veya rename descriptor okumasını kararsız yapar", { timeout: 30000 }, async (context) => {
  for (const mutation of ["truncate", "grow", "rename"]) {
    const prefix = "verify-local-read-" + mutation + "-";
    const root = createSnapshotGitRepository(context, { "source.bin": Buffer.alloc(2 * 1024 * 1024, 7) }, prefix);
    const targetPath = path.join(root, "source.bin");
    const outcome = await captureWithStreamHook(root, targetPath, null, () => {
      if (mutation === "truncate") fs.truncateSync(targetPath, 0);
      else if (mutation === "grow") fs.appendFileSync(targetPath, Buffer.alloc(64 * 1024, 9));
      else fs.renameSync(targetPath, path.join(root, "source.renamed"));
    });
    assert.equal(outcome.hooked(), true);
    assert.equal(outcome.error?.code, "source_snapshot_unstable");
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("VERIFY-LOCAL-06E: okuma ortasında cancellation akışı durdurur ve descriptor'ı kapatır", { timeout: 30000 }, async (context) => {
  const root = createSnapshotGitRepository(context, { "source.bin": Buffer.alloc(2 * 1024 * 1024, 7) });
  const controller = new AbortController();
  const outcome = await captureWithStreamHook(root, path.join(root, "source.bin"), controller.signal, () => controller.abort());
  assert.equal(outcome.hooked(), true);
  assert.equal(outcome.error?.code, "cancelled");
  const handle = outcome.openedHandle();
  assert.ok(handle);
  await assert.rejects(handle.stat());
});

test("VERIFY-LOCAL-06E1: stream hatası ile cancellation çakışınca iptal sonucu korunur", { timeout: 30000 }, async (context) => {
  const root = createSnapshotGitRepository(context, { "source.bin": Buffer.alloc(2 * 1024 * 1024, 7) });
  const controller = new AbortController();
  const outcome = await captureWithStreamHook(root, path.join(root, "source.bin"), controller.signal, ({ stream }) => {
    stream.destroy(Object.assign(new Error("synthetic stream failure"), { code: "EIO" }));
    controller.abort();
  });
  assert.equal(outcome.hooked(), true);
  assert.equal(outcome.error?.code, "cancelled");
  await assert.rejects(outcome.openedHandle().stat());
});

test("VERIFY-LOCAL-06F: pre-abort dosya descriptor'ı açmaz", { timeout: 30000 }, async (context) => {
  const root = createSnapshotGitRepository(context, { "source.txt": "fixture\n" });
  const controller = new AbortController();
  controller.abort();
  let openCount = 0;
  const originalOpen = fs.promises.open;
  fs.promises.open = async function (...argumentsList) {
    openCount += 1;
    return originalOpen.apply(fs.promises, argumentsList);
  };
  try {
    await assert.rejects(captureSourceSnapshot(root, controller.signal), { code: "cancelled" });
  } finally {
    fs.promises.open = originalOpen;
  }
  assert.equal(openCount, 0);
});

test("VERIFY-LOCAL-06G: snapshot sırasında yalnız Git index'i değişirse sonuç kararsızdır", { timeout: 30000 }, async (context) => {
  const root = createSnapshotGitRepository(context, { "source.bin": Buffer.alloc(2 * 1024 * 1024, 7) });
  const targetPath = path.join(root, "source.bin");
  const outcome = await captureWithStreamHook(root, targetPath, null, () => {
    execFileSync("git", ["-C", root, "update-index", "--assume-unchanged", "source.bin"]);
  });
  assert.equal(outcome.hooked(), true);
  assert.equal(outcome.error?.code, "source_snapshot_unstable");
});

test("VERIFY-LOCAL-06H: snapshot sonundaki Git yol kümesi değişikliği reddedilir", { timeout: 30000 }, async (context) => {
  const root = createSnapshotGitRepository(context, { "source.bin": Buffer.alloc(2 * 1024 * 1024, 7) });
  const targetPath = path.join(root, "source.bin");
  const outcome = await captureWithStreamHook(root, targetPath, null, () => {
    fs.writeFileSync(path.join(root, "late-untracked.txt"), "late source\n");
  });
  assert.equal(outcome.hooked(), true);
  assert.equal(outcome.error?.code, "source_snapshot_unstable");
});

test("VERIFY-LOCAL-06H1: hash tamamlandıktan sonra dosya değişirse bitiş doğrulaması reddeder", { timeout: 30000 }, async (context) => {
  const root = createSnapshotGitRepository(context, { "source.txt": "before\n" });
  const targetPath = path.join(root, "source.txt");
  const originalOpen = fs.promises.open;
  let changed = false;
  fs.promises.open = async function (filePath, ...argumentsList) {
    const handle = await originalOpen.call(fs.promises, filePath, ...argumentsList);
    if (!changed && path.resolve(filePath).toLocaleLowerCase("en-US") === targetPath.toLocaleLowerCase("en-US")) {
      const originalClose = handle.close.bind(handle);
      handle.close = async () => {
        await originalClose();
        if (!changed) {
          changed = true;
          fs.writeFileSync(targetPath, "after!\n");
        }
      };
    }
    return handle;
  };
  try {
    await assert.rejects(captureSourceSnapshot(root), { code: "source_snapshot_unstable" });
  } finally {
    fs.promises.open = originalOpen;
  }
  assert.equal(changed, true);
});

test("VERIFY-LOCAL-06H2: okuma sırasında ara dizin junction değişimi fail-closed sonuçlanır", { timeout: 30000 }, async (context) => {
  const root = createSnapshotGitRepository(context, { "nested/source.bin": Buffer.alloc(2 * 1024 * 1024, 7) });
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "verify-local-parent-swap-"));
  context.after(() => fs.rmSync(outsideRoot, { recursive: true, force: true }));
  fs.writeFileSync(path.join(outsideRoot, "source.bin"), "outside synthetic source\n");
  const nestedPath = path.join(root, "nested");
  const displacedPath = path.join(root, "nested.displaced");
  const targetPath = path.join(nestedPath, "source.bin");
  const outcome = await captureWithStreamHook(root, targetPath, null, () => {
    fs.renameSync(nestedPath, displacedPath);
    fs.symlinkSync(outsideRoot, nestedPath, process.platform === "win32" ? "junction" : "dir");
  });
  assert.equal(outcome.hooked(), true);
  assert.ok(["source_snapshot_unstable", "source_entry_unreadable", "source_path_link_unsupported"].includes(outcome.error?.code));
});

test("VERIFY-LOCAL-06I: hard link repo yolunu başka yere yöneltmez ve içeriği snapshot'a dahil eder", { timeout: 30000 }, async (context) => {
  const root = createSnapshotGitRepository(context, { "source.txt": "linked source\n" });
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "verify-local-hard-link-"));
  context.after(() => fs.rmSync(outsideRoot, { recursive: true, force: true }));
  try {
    fs.linkSync(path.join(root, "source.txt"), path.join(outsideRoot, "outside-link.txt"));
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP", "EOPNOTSUPP"].includes(error.code)) {
      context.skip("hard-link creation is unavailable");
      return;
    }
    throw error;
  }
  const snapshot = await captureSourceSnapshot(root);
  assert.equal(snapshot.workingTreeClean, true);
  assert.equal(snapshot.totalBytes, Buffer.byteLength("linked source\n"));
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
  assert.equal(report.schemaVersion, 3);
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
    const resultPromise = runCommand({
      ...command,
      cwd: projectRoot,
      env: process.env,
      timeoutMs: 500,
      maxOutputBytes: 1000,
      diagnostics: { stageId: "test-suite", projectRoot, allowedTestFiles: ["tests/verify-local.test.js"] }
    });
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
    assert.equal(result.diagnostics.status, "unavailable");
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
