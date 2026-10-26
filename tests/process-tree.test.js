import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createExecutionHandle, createExecutionId, runProcess, killProcessTree } from "../subagent-bridge/src/services/execution-service.js";

function processIsRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code !== "ESRCH";
  }
}

async function waitForProcessExit(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (processIsRunning(pid) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return !processIsRunning(pid);
}

async function assertProcessTerminatedBeforeSideEffect(child, pid, markerPath, message) {
  try {
    child.stdin.write("probe");
  } catch {
  }
  const deadline = Date.now() + 5000;
  while (!fs.existsSync(markerPath) && processIsRunning(pid) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(fs.existsSync(markerPath), false, message);
  assert.equal(await waitForProcessExit(pid, 5000), true, "child process should be terminated");
}

test("PROCESS-TREE: platform termination strategy invoked, child handles verified", async () => {
  console.log("  Platform:", process.platform);
  console.log(`  killProcessTree: ${killProcessTree.toString().includes("taskkill") ? "Windows taskkill /T" : "POSIX process group SIGKILL"}`);

  const handle = createExecutionHandle(createExecutionId());
  let processOutput = "";
  let parentPid = null;
  let childPid = null;
  let outputChanged;
  let readinessTimer;
  const outputReady = new Promise((resolve) => { outputChanged = resolve; });

  const promise = runProcess("node", [
    "-e",
    `
      const { spawn } = require('child_process');
      console.log("PARENT:" + process.pid);
      const child = spawn(process.execPath, ['-e', 'console.log("CHILD:" + process.pid); setInterval(() => {}, 30000)'], {
        stdio: 'pipe'
      });
      child.stdout.on('data', (d) => process.stdout.write(d));
      setInterval(() => {}, 30000);
    `
  ], {
    timeoutMs: 30000,
    abortController: handle.abortController,
    onSpawn: (child) => {
      parentPid = child.pid;
      handle.attachChild(child);
    },
    onStdout: (chunk) => {
      processOutput += chunk.toString("utf8");
      const match = processOutput.match(/CHILD:(\d+)/);
      if (match) {
        childPid = Number(match[1]);
        outputChanged();
      }
    }
  });

  let timeout;
  try {
    await Promise.race([
      outputReady,
      new Promise((_, reject) => {
        readinessTimer = setTimeout(() => reject(new Error("child process did not become ready")), 10000);
        readinessTimer.unref?.();
      })
    ]);
    assert.ok(Number.isInteger(childPid), "child PID should be observed before cancellation");
    timeout = setTimeout(() => handle.cancel(), 0);
    try {
      const result = await promise;
      assert.ok(result.signal !== null || result.code !== 0, "cancelled parent should not exit successfully");
    } catch (error) {
      assert.match(error.message, /abort/i);
    }
    assert.equal(await waitForProcessExit(parentPid, 5000), true, "parent process should be terminated");
    assert.equal(await waitForProcessExit(childPid, 5000), true, "descendant process should be terminated");
  } finally {
    clearTimeout(timeout);
    clearTimeout(readinessTimer);
    if (Number.isInteger(parentPid) && processIsRunning(parentPid)) killProcessTree(parentPid);
    if (Number.isInteger(childPid) && processIsRunning(childPid)) killProcessTree(childPid);
  }
  console.log("  Parent killed: confirmed");
});

test("PROCESS-TREE: killProcessTree function smoke test", () => {
  if (process.platform === "win32") {
    const funcStr = killProcessTree.toString();
    assert.match(funcStr, /taskkill/);
    assert.match(funcStr, /\/T/);
    console.log("  Windows: taskkill /T /F /PID strategy confirmed");
  } else {
    const funcStr = killProcessTree.toString();
    assert.match(funcStr, /SIGKILL/);
    console.log("  POSIX: process group SIGKILL strategy confirmed");
  }
});

test("PROCESS-TREE: direct AbortController cancellation terminates descendants", async () => {
  const abortController = new AbortController();
  let abortListenerRemovals = 0;
  const originalRemoveAbortListener = abortController.signal.removeEventListener.bind(abortController.signal);
  abortController.signal.removeEventListener = (...args) => {
    if (args[0] === "abort") abortListenerRemovals += 1;
    return originalRemoveAbortListener(...args);
  };
  let parentPid = null;
  let childPid = null;
  let processOutput = "";
  let outputChanged;
  let readinessTimer;
  const childReady = new Promise((resolve) => { outputChanged = resolve; });
  const promise = runProcess(process.execPath, [
    "--input-type=module",
    "--eval",
    "import { spawn } from \"node:child_process\"; const child = spawn(process.execPath, [\"--eval\", \"setInterval(() => {}, 30000)\"], { stdio: \"ignore\" }); console.log(`CHILD:${child.pid}`); setInterval(() => {}, 30000);"
  ], {
    timeoutMs: 30000,
    abortController,
    onSpawn: (child) => { parentPid = child.pid; },
    onStdout: (chunk) => {
      processOutput += chunk.toString("utf8");
      const match = processOutput.match(/CHILD:(\d+)/);
      if (match) {
        childPid = Number(match[1]);
        outputChanged();
        abortController.abort();
      }
    }
  });
  try {
    await Promise.race([
      childReady,
      new Promise((_, reject) => {
        readinessTimer = setTimeout(() => reject(new Error("child process did not become ready")), 10000);
        readinessTimer.unref?.();
      })
    ]);
    await assert.rejects(promise, (error) => error.name === "AbortError" && error.code === "ABORT_ERR");
    assert.equal(await waitForProcessExit(parentPid, 5000), true, "parent process should be terminated");
    assert.equal(await waitForProcessExit(childPid, 5000), true, "descendant process should be terminated");
    assert.equal(abortListenerRemovals, 1);
  } finally {
    clearTimeout(readinessTimer);
    if (Number.isInteger(parentPid) && processIsRunning(parentPid)) killProcessTree(parentPid);
    if (Number.isInteger(childPid) && processIsRunning(childPid)) killProcessTree(childPid);
  }
});

test("PROCESS-TREE: onSpawn callback failure terminates its child process", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-spawn-callback-failure-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const markerPath = path.join(root, "survived.txt");
  let childPid = null;
  let childProcess = null;
  const script = `import fs from "node:fs"; process.stdin.on("data", () => fs.writeFileSync(${JSON.stringify(markerPath)}, "survived", "utf8")); process.stdin.resume(); setInterval(() => {}, 30000);`;
  const promise = runProcess(process.execPath, ["--input-type=module", "--eval", script], {
    timeoutMs: 30000,
    keepStdinOpen: true,
    onSpawn: (child) => {
      childPid = child.pid;
      childProcess = child;
      throw Object.freeze(new Error("spawn callback failed"));
    }
  });
  try {
    await assert.rejects(promise, /spawn callback failed/);
    await assertProcessTerminatedBeforeSideEffect(childProcess, childPid, markerPath, "spawned process must not continue after callback failure");
  } finally {
    if (Number.isInteger(childPid) && processIsRunning(childPid)) killProcessTree(childPid);
  }
});

test("PROCESS-TREE: immutable streaming failure still terminates its child process", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-stream-failure-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const markerPath = path.join(root, "survived.txt");
  let childPid = null;
  let childProcess = null;
  const script = `import fs from "node:fs"; process.stdin.on("data", () => fs.writeFileSync(${JSON.stringify(markerPath)}, "survived", "utf8")); process.stdin.resume(); process.stdout.write("ready"); setInterval(() => {}, 30000);`;
  const promise = runProcess(process.execPath, ["--input-type=module", "--eval", script], {
    timeoutMs: 30000,
    keepStdinOpen: true,
    onSpawn: (child) => { childPid = child.pid; childProcess = child; },
    streamingOutputConsumer: {
      onStdout() {
        throw Object.freeze(new Error("stream consumer failed"));
      },
      onStderr() {},
      snapshot() { return {}; },
      finish() { return {}; }
    }
  });
  try {
    await assert.rejects(promise, /stream consumer failed/);
    await assertProcessTerminatedBeforeSideEffect(childProcess, childPid, markerPath, "streaming failure must prevent delayed child side effects");
  } finally {
    if (Number.isInteger(childPid) && processIsRunning(childPid)) killProcessTree(childPid);
  }
});

test("PROCESS-TREE: immutable output callback failures terminate their child processes", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-output-callback-failure-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const stream of ["stdout", "stderr"]) {
    const markerPath = path.join(root, `${stream}-survived.txt`);
    let childPid = null;
    let childProcess = null;
    const script = `import fs from "node:fs"; process.stdin.on("data", () => fs.writeFileSync(${JSON.stringify(markerPath)}, "survived", "utf8")); process.stdin.resume(); process.${stream}.write("ready"); setInterval(() => {}, 30000);`;
    const promise = runProcess(process.execPath, ["--input-type=module", "--eval", script], {
      timeoutMs: 30000,
      keepStdinOpen: true,
      onSpawn: (child) => { childPid = child.pid; childProcess = child; },
      [stream === "stdout" ? "onStdout" : "onStderr"]() {
        throw Object.freeze(new Error(`${stream} callback failed`));
      }
    });
    try {
      await assert.rejects(promise, new RegExp(`${stream} callback failed`));
      await assertProcessTerminatedBeforeSideEffect(childProcess, childPid, markerPath, `${stream} callback failure must prevent delayed child side effects`);
    } finally {
      if (Number.isInteger(childPid) && processIsRunning(childPid)) killProcessTree(childPid);
    }
  }
});

test("PROCESS-TREE: successful execution removes its AbortSignal listener", async () => {
  const abortController = new AbortController();
  let abortListenerRemovals = 0;
  const originalRemoveAbortListener = abortController.signal.removeEventListener.bind(abortController.signal);
  abortController.signal.removeEventListener = (...args) => {
    if (args[0] === "abort") abortListenerRemovals += 1;
    return originalRemoveAbortListener(...args);
  };
  const result = await runProcess(process.execPath, ["--eval", "process.stdout.write('complete')"], {
    timeoutMs: 30000,
    abortController
  });
  assert.equal(result.stdout, "complete");
  assert.equal(abortListenerRemovals, 1);
});

test("PROCESS-TREE: timeout destekleyen süreçte önce stdin ile graceful shutdown dener", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-graceful-shutdown-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const markerPath = path.join(root, "closed.txt");
  await assert.rejects(runProcess(process.execPath, [
    "--input-type=module",
    "--eval",
    `import fs from "node:fs"; process.stdin.resume(); process.stdin.on("end", () => { fs.writeFileSync(${JSON.stringify(markerPath)}, "closed", "utf8"); process.exit(0); });`
  ], {
    timeoutMs: 100,
    gracefulShutdownMs: 1000,
    keepStdinOpen: true
  }), /timed out/i);
  assert.equal(fs.existsSync(markerPath), process.platform !== "win32");
  if (process.platform !== "win32") assert.equal(fs.readFileSync(markerPath, "utf8"), "closed");
});

test("PROCESS-TREE: timeout parent kapanırken bağımsız descendant'ı sonlandırır", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-timeout-descendant-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const markerPath = path.join(root, "closed.txt");
  let parentPid = null;
  let childPid = null;
  let processOutput = "";
  let outputChanged;
  let readinessTimer;
  const childReady = new Promise((resolve) => { outputChanged = resolve; });
  const promise = runProcess(process.execPath, [
    "--input-type=module",
    "--eval",
    `import { spawn } from "node:child_process"; import fs from "node:fs"; const child = spawn(process.execPath, ["--eval", "setInterval(() => {}, 30000)"], { stdio: "ignore" }); console.log("CHILD:" + child.pid); process.stdin.resume(); process.stdin.on("end", () => { fs.writeFileSync(${JSON.stringify(markerPath)}, "closed", "utf8"); process.exit(0); }); setInterval(() => {}, 30000);`
  ], {
    timeoutMs: 300,
    gracefulShutdownMs: 1000,
    keepStdinOpen: true,
    onSpawn: (child) => { parentPid = child.pid; },
    onStdout: (chunk) => {
      processOutput += chunk.toString("utf8");
      const match = processOutput.match(/CHILD:(\d+)/);
      if (match) {
        childPid = Number(match[1]);
        outputChanged();
      }
    }
  });
  try {
    await Promise.race([
      childReady,
      new Promise((_, reject) => {
        readinessTimer = setTimeout(() => reject(new Error("child process did not become ready")), 10000);
        readinessTimer.unref?.();
      })
    ]);
    await assert.rejects(promise, /timed out/i);
    assert.equal(await waitForProcessExit(parentPid, 5000), true, "parent process should be terminated");
    assert.equal(await waitForProcessExit(childPid, 5000), true, "descendant process should be terminated");
    if (process.platform !== "win32") assert.equal(fs.readFileSync(markerPath, "utf8"), "closed");
  } finally {
    clearTimeout(readinessTimer);
    if (Number.isInteger(parentPid) && processIsRunning(parentPid)) killProcessTree(parentPid);
    if (Number.isInteger(childPid) && processIsRunning(childPid)) killProcessTree(childPid);
  }
});
