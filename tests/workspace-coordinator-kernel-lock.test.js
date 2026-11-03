import assert from "node:assert/strict";
import childProcess from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createWorkspaceCoordinator } from "../subagent-bridge/src/services/workspace-coordinator.js";
import { openKernelFileLock } from "../subagent-bridge/src/services/kernel-file-lock.js";

const workerPath = path.resolve("tests/fixtures/workspace-coordinator-process.js");

function spawnWorker(mode, root, markers, identity) {
  const child = childProcess.spawn(process.execPath, [workerPath, mode, root, markers, identity], { stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.setEncoding("utf8").on("data", (chunk) => { output += chunk; });
  child.stderr.setEncoding("utf8").on("data", (chunk) => { output += chunk; });
  child.output = () => output;
  return child;
}

test("uncertain lock close is never retried and future acquisitions fail closed", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-coordinator-close-failure-"));
  const markers = path.join(root, "markers");
  fs.mkdirSync(markers);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const worker = spawnWorker("guard-close-failure", root, markers, "close-failure");
  assert.equal(await waitForExit(worker), 0, worker.output());
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(markers, "close-failure-result"), "utf8")), { value: null, closeAttempts: 1, successor: false });
});

test("intent descriptor close uncertainty is tracked without closing the descriptor twice", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-coordinator-intent-close-failure-"));
  const markers = path.join(root, "markers");
  fs.mkdirSync(markers);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const worker = spawnWorker("coordinator-intent-close-failure", root, markers, "intent-close-failure");
  assert.equal(await waitForExit(worker), 0, worker.output());
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(markers, "intent-close-failure-result"), "utf8")), { result: false, closeAttempts: 1, successor: false });
});

test("uncertain intent cleanup guard close does not report try or async acquisition as granted", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-coordinator-cleanup-guard-failure-"));
  const markers = path.join(root, "markers");
  fs.mkdirSync(markers);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const identity of ["try", "async"]) {
    const worker = spawnWorker("coordinator-guard-close-failure", path.join(root, identity), markers, identity);
    assert.equal(await waitForExit(worker), 0, worker.output());
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(markers, `${identity}-result`), "utf8")), { granted: false, owner: false, closeAttempts: 1 });
  }
});
async function waitForMarker(markers, name, children = []) {
  const markerPath = path.join(markers, name);
  const deadline = Date.now() + 10000;
  while (!fs.existsSync(markerPath)) {
    const stopped = children.find((child) => child.exitCode !== null);
    if (stopped) throw new Error(`child ${stopped.pid} exited ${stopped.exitCode}: ${stopped.output()}`);
    if (Date.now() >= deadline) throw new Error(`barrier timeout: ${name}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

async function waitForAnyMarker(markers, names, children = []) {
  const deadline = Date.now() + 10000;
  while (true) {
    const found = names.find((name) => fs.existsSync(path.join(markers, name)));
    if (found) return found;
    const stopped = children.find((child) => child.exitCode !== null);
    if (stopped) throw new Error(`child ${stopped.pid} exited ${stopped.exitCode}: ${stopped.output()}`);
    if (Date.now() >= deadline) throw new Error(`barrier timeout: ${names.join(",")}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function waitForExit(child) {
  if (child.exitCode !== null) return Promise.resolve(child.exitCode);
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code));
  });
}

test("guard fixture retries after lock contention before reporting entry", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-coordinator-guard-retry-"));
  const markers = path.join(root, "markers");
  fs.mkdirSync(markers);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const blocker = openKernelFileLock(path.join(root, "guard.lock"));
  assert.ok(blocker);
  const worker = spawnWorker("guard-hold", root, markers, "retry");
  t.after(async () => { if (worker.exitCode === null) { worker.kill(); await waitForExit(worker); } });
  await waitForMarker(markers, "retry-contended", [worker]);
  assert.equal(worker.exitCode, null);
  assert.equal(blocker.release(), true);
  await waitForMarker(markers, "retry-entered", [worker]);
  fs.writeFileSync(path.join(markers, "retry-release"), "1");
  assert.equal(await waitForExit(worker), 0, worker.output());
  assert.equal(fs.readFileSync(path.join(markers, "retry-result"), "utf8"), "true");
});

async function waitForResults(workspace, names, children) {
  const deadline = Date.now() + 10000;
  while (!names.every((name) => fs.existsSync(path.join(workspace, `${name}-result`)))) {
    const stopped = children.find((child) => child.exitCode !== null);
    if (stopped && children.every((child) => child.exitCode !== null)) throw new Error(`all contenders exited before results: ${stopped.output()}`);
    if (Date.now() >= deadline) throw new Error("barrier timeout: contender results");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

test("stale guard gözlemi yeni sahibin kilidini sildiremez", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-coordinator-stale-guard-race-"));
  const guardDirectory = path.join(root, "locks");
  const markers = path.join(root, "markers");
  fs.mkdirSync(guardDirectory);
  fs.mkdirSync(markers);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const guardPath = path.join(guardDirectory, "guard.lock");
  const owner = spawnWorker("guard-hold", guardDirectory, markers, "owner");
  let contender;
  t.after(() => {
    for (const child of [owner, contender]) if (child && child.exitCode === null) child.kill();
  });

  await waitForMarker(markers, "owner-entered", [owner]);
  const ownerFileIdentity = fs.statSync(guardPath).ino;
  const staleTime = new Date(Date.now() - 60000);
  fs.utimesSync(guardPath, staleTime, staleTime);
  contender = spawnWorker("guard-try", guardDirectory, markers, "contender");
  assert.equal(await waitForExit(contender), 0, contender.output());
  assert.equal(fs.readFileSync(path.join(markers, "contender-result"), "utf8"), "null");
  assert.equal(fs.existsSync(path.join(markers, "contender-entered")), false);
  assert.equal(owner.exitCode, null);
  assert.equal(fs.statSync(guardPath).ino, ownerFileIdentity);
  fs.writeFileSync(path.join(markers, "owner-release"), "1");
  assert.equal(await waitForExit(owner), 0, owner.output());
  assert.equal(fs.existsSync(guardPath), true);
  assert.equal(fs.statSync(guardPath).ino, ownerFileIdentity);
});

test("AbortSignal kuyruktaki writer intenti temizler ve bekleyen çağrıyı çözer", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-coordinator-abort-queued-intent-"));
  const lockDirectory = path.join(root, "locks");
  const workspace = path.join(root, "workspace");
  fs.mkdirSync(workspace);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const coordinator = createWorkspaceCoordinator({ lockDirectory });
  const blocker = await coordinator.acquire(workspace, "read_only", "abort-reader-blocker");
  assert.ok(blocker);
  const controller = new AbortController();
  const pending = coordinator.acquire(workspace, "edit", "abort-queued-writer", 0, { signal: controller.signal });
  const workspaceHash = crypto.createHash("sha256").update(workspace).digest("hex");
  const workspaceLockDirectory = path.join(lockDirectory, "coordinator-v2", workspaceHash);
  const deadline = Date.now() + 5000;
  while (!fs.existsSync(workspaceLockDirectory) || !fs.readdirSync(workspaceLockDirectory).some((name) => name.startsWith("writer-") && name.endsWith(".intent"))) {
    if (Date.now() >= deadline) throw new Error("writer intent was not registered");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  controller.abort();
  assert.equal(await pending, null);
  assert.equal(fs.readdirSync(workspaceLockDirectory).some((name) => name.startsWith("writer-") && name.endsWith(".intent")), false);
  coordinator.release("abort-reader-blocker");
});

test("guard çekişmesi iptal cleanup'ını kaybetmez ve intent sonradan silinir", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-coordinator-abort-cleanup-retry-"));
  const lockDirectory = path.join(root, "locks");
  const workspace = path.join(root, "workspace");
  const markers = path.join(root, "markers");
  fs.mkdirSync(workspace);
  fs.mkdirSync(markers);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const coordinator = createWorkspaceCoordinator({ lockDirectory });
  const blocker = await coordinator.acquire(workspace, "read_only", "abort-cleanup-reader");
  assert.ok(blocker);
  const controller = new AbortController();
  const pending = coordinator.acquire(workspace, "edit", "abort-cleanup-writer", 0, { signal: controller.signal });
  const workspaceHash = crypto.createHash("sha256").update(workspace).digest("hex");
  const workspaceLockDirectory = path.join(lockDirectory, "coordinator-v2", workspaceHash);
  const intentDeadline = Date.now() + 5000;
  while (!fs.existsSync(workspaceLockDirectory) || !fs.readdirSync(workspaceLockDirectory).some((name) => name.startsWith("writer-") && name.endsWith(".intent"))) {
    if (Date.now() >= intentDeadline) throw new Error("writer intent was not registered");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  const guardOwner = spawnWorker("guard-hold", workspaceLockDirectory, markers, "cleanup-guard");
  t.after(async () => { if (guardOwner.exitCode === null) { guardOwner.kill(); await waitForExit(guardOwner); } });
  await waitForMarker(markers, "cleanup-guard-entered", [guardOwner]);
  controller.abort();
  assert.equal(await pending, null);
  assert.equal(fs.readdirSync(workspaceLockDirectory).some((name) => name.startsWith("writer-") && name.endsWith(".intent")), true);
  fs.writeFileSync(path.join(markers, "cleanup-guard-release"), "1");
  assert.equal(await waitForExit(guardOwner), 0, guardOwner.output());
  const cleanupDeadline = Date.now() + 5000;
  while (fs.readdirSync(workspaceLockDirectory).some((name) => name.startsWith("writer-") && name.endsWith(".intent"))) {
    if (Date.now() >= cleanupDeadline) throw new Error("cancelled writer intent cleanup did not retry");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  coordinator.release("abort-cleanup-reader");
});

test("async edinim aynı execution kimliğiyle açık kilit kaydını ezemez", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-coordinator-async-replay-"));
  const lockDirectory = path.join(root, "locks");
  const workspace = path.join(root, "workspace");
  fs.mkdirSync(workspace);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const coordinator = createWorkspaceCoordinator({ lockDirectory });
  const blocker = await coordinator.acquire(workspace, "read_only", "async-replay-blocker");
  assert.ok(blocker);
  const first = coordinator.acquire(workspace, "read_only", "async-replay-execution");
  assert.equal(await coordinator.acquire(workspace, "read_only", "async-replay-execution"), null);
  coordinator.release("async-replay-blocker");
  assert.ok(await first);
  assert.equal(coordinator.assertOwner(workspace, "async-replay-execution"), true);
  coordinator.release("async-replay-execution");
  assert.equal(coordinator.tryAcquire(workspace, "async-replay-successor") !== null, true);
  coordinator.release("async-replay-successor");
});

test("başarısız acquire AbortSignal dinleyicisini kaldırır ve eski iptal yeni execution'ı etkileyemez", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-coordinator-abort-cleanup-"));
  const lockDirectory = path.join(root, "locks");
  const workspace = path.join(root, "workspace");
  fs.mkdirSync(workspace);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const coordinator = createWorkspaceCoordinator({ lockDirectory, maxWaitAttempts: 0 });
  const blocker = await coordinator.acquire(workspace, "read_only", "abort-cleanup-blocker");
  assert.ok(blocker);
  const controller = new AbortController();
  let additions = 0;
  let removals = 0;
  const originalAdd = controller.signal.addEventListener.bind(controller.signal);
  const originalRemove = controller.signal.removeEventListener.bind(controller.signal);
  controller.signal.addEventListener = (...args) => { additions += 1; return originalAdd(...args); };
  controller.signal.removeEventListener = (...args) => { removals += 1; return originalRemove(...args); };
  assert.equal(await coordinator.acquire(workspace, "edit", "abort-cleanup-execution", 0, { signal: controller.signal }), null);
  assert.equal(additions, 1);
  assert.equal(removals, 1);
  coordinator.release("abort-cleanup-blocker");
  assert.ok(await coordinator.acquire(workspace, "read_only", "abort-cleanup-execution"));
  controller.abort();
  assert.equal(coordinator.assertOwner(workspace, "abort-cleanup-execution"), true);
  coordinator.release("abort-cleanup-execution");
});

test("zorla kapatılan guard sahibi sonrası kernel kilidi yeni sürece güvenle geçer", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-coordinator-guard-crash-"));
  const guardDirectory = path.join(root, "locks");
  const markers = path.join(root, "markers");
  fs.mkdirSync(guardDirectory);
  fs.mkdirSync(markers);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const owner = spawnWorker("guard-hold", guardDirectory, markers, "crashed-owner");
  let successor;
  t.after(() => {
    for (const child of [owner, successor]) if (child && child.exitCode === null) child.kill();
  });

  await waitForMarker(markers, "crashed-owner-entered", [owner]);
  owner.kill("SIGKILL");
  assert.notEqual(await waitForExit(owner), 0);
  successor = spawnWorker("guard-try", guardDirectory, markers, "successor");
  assert.equal(await waitForExit(successor), 0, successor.output());
  assert.equal(fs.readFileSync(path.join(markers, "successor-result"), "utf8"), "true");
  assert.equal(fs.existsSync(path.join(guardDirectory, "guard.lock")), true);
});

test("sahip kritik bölümdeyken ayrı süreç edinemez ve release sonrası ilerler", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-coordinator-recovery-race-"));
  const lockDirectory = path.join(root, "locks");
  const workspace = path.join(root, "workspace");
  const markers = path.join(root, "markers");
  fs.mkdirSync(workspace);
  fs.mkdirSync(markers);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const first = spawnWorker("coordinator-hold", lockDirectory, markers, "first");
  let second;
  t.after(() => {
    for (const child of [first, second]) if (child.exitCode === null) child.kill();
  });

  await waitForMarker(markers, "first-entered", [first]);
  second = spawnWorker("coordinator-try", lockDirectory, markers, "second");
  assert.equal(await waitForExit(second), 0, second.output());
  assert.equal(fs.readFileSync(path.join(markers, "second-result"), "utf8"), "false");
  assert.equal(fs.existsSync(path.join(markers, "second-entered")), false);
  assert.equal(first.exitCode, null);
  fs.writeFileSync(path.join(markers, "first-release"), "1");
  assert.equal(await waitForExit(first), 0, first.output());
  const successor = spawnWorker("coordinator-try", lockDirectory, markers, "successor");
  await waitForMarker(markers, "successor-entered", [successor]);
  assert.equal(fs.readFileSync(path.join(markers, "successor-result"), "utf8"), "true");
  fs.writeFileSync(path.join(markers, "successor-release"), "1");
  assert.equal(await waitForExit(successor), 0, successor.output());
});

test("çöken execution kilidi sahibinden sonra yeni süreç kilidi devralabilir", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-coordinator-execution-crash-"));
  const lockDirectory = path.join(root, "locks");
  const workspace = path.join(root, "workspace");
  const markers = path.join(root, "markers");
  fs.mkdirSync(workspace);
  fs.mkdirSync(markers);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const owner = spawnWorker("coordinator-hold", lockDirectory, workspace, "crashed-execution-owner");
  let successor;
  t.after(() => {
    for (const child of [owner, successor]) if (child && child.exitCode === null) child.kill();
  });

  await waitForMarker(workspace, "crashed-execution-owner-entered", [owner]);
  const workspaceHash = crypto.createHash("sha256").update(workspace).digest("hex");
  const executionLockPath = path.join(lockDirectory, "coordinator-v2", workspaceHash, "execution.lock");
  assert.equal(fs.existsSync(executionLockPath), true);
  owner.kill("SIGKILL");
  assert.notEqual(await waitForExit(owner), 0);
  successor = spawnWorker("coordinator-try", lockDirectory, workspace, "execution-successor");
  await waitForMarker(workspace, "execution-successor-entered", [successor]);
  assert.equal(fs.readFileSync(path.join(workspace, "execution-successor-result"), "utf8"), "true");
  fs.writeFileSync(path.join(workspace, "execution-successor-release"), "1");
  assert.equal(await waitForExit(successor), 0, successor.output());
  assert.equal(fs.existsSync(executionLockPath), true);
});

test("eşzamanlı recovery terk edilmiş writer intent'i tek yazarlıkla kaldırır", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-coordinator-orphan-recovery-"));
  const lockDirectory = path.join(root, "locks");
  const workspace = path.join(root, "workspace");
  const markers = path.join(root, "markers");
  fs.mkdirSync(workspace);
  fs.mkdirSync(markers);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const blocker = createWorkspaceCoordinator({ lockDirectory });
  assert.ok(await blocker.acquire(workspace, "read_only", "orphan-recovery-reader"));
  const abandonedWriter = spawnWorker("coordinator-queue", lockDirectory, workspace, "abandoned-recovery-writer");
  let first;
  let second;
  t.after(() => {
    if (abandonedWriter.exitCode === null) abandonedWriter.kill();
    for (const child of [first, second]) if (child && child.exitCode === null) child.kill();
    blocker.release("orphan-recovery-reader");
  });

  await waitForMarker(workspace, "abandoned-recovery-writer-queued", [abandonedWriter]);
  abandonedWriter.kill("SIGKILL");
  assert.notEqual(await waitForExit(abandonedWriter), 0);
  blocker.release("orphan-recovery-reader");
  first = spawnWorker("coordinator-recovery-race", lockDirectory, workspace, "orphan-first");
  second = spawnWorker("coordinator-recovery-race", lockDirectory, workspace, "orphan-second");
  await waitForMarker(workspace, "orphan-first-ready", [first]);
  await waitForMarker(workspace, "orphan-second-ready", [second]);
  fs.writeFileSync(path.join(workspace, "recovery-race-go"), "1");
  const firstOwnerMarker = await waitForAnyMarker(workspace, ["orphan-first-entered", "orphan-second-entered"], [first, second]);
  const owner = firstOwnerMarker.startsWith("orphan-first") ? first : second;
  const successor = owner === first ? second : first;
  const ownerName = owner === first ? "orphan-first" : "orphan-second";
  const successorName = owner === first ? "orphan-second" : "orphan-first";
  assert.equal(fs.existsSync(path.join(workspace, `${successorName}-entered`)), false);
  fs.writeFileSync(path.join(workspace, `${ownerName}-release`), "1");
  assert.equal(await waitForExit(owner), 0, owner.output());
  await waitForMarker(workspace, `${successorName}-entered`, [successor]);
  assert.equal(fs.readFileSync(path.join(workspace, `${successorName}-result`), "utf8"), "true");
  fs.writeFileSync(path.join(workspace, `${successorName}-release`), "1");
  assert.equal(await waitForExit(successor), 0, successor.output());
});

test("canlı writer intent başka süreçteki recovery tarafından kaldırılamaz", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-coordinator-live-intent-"));
  const lockDirectory = path.join(root, "locks");
  const workspace = path.join(root, "workspace");
  const markers = path.join(root, "markers");
  fs.mkdirSync(workspace);
  fs.mkdirSync(markers);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const blocker = createWorkspaceCoordinator({ lockDirectory });
  assert.ok(await blocker.acquire(workspace, "read_only", "live-intent-reader"));
  const liveWriter = spawnWorker("coordinator-queue", lockDirectory, workspace, "live-writer");
  t.after(() => {
    if (liveWriter.exitCode === null) liveWriter.kill();
    blocker.release("live-intent-reader");
  });

  await waitForMarker(workspace, "live-writer-queued", [liveWriter]);
  const workspaceHash = crypto.createHash("sha256").update(workspace).digest("hex");
  const workspaceLockDirectory = path.join(lockDirectory, "coordinator-v2", workspaceHash);
  const intentName = fs.readdirSync(workspaceLockDirectory).find((name) => name.startsWith("writer-") && name.endsWith(".intent"));
  assert.ok(intentName);
  const intentPath = path.join(workspaceLockDirectory, intentName);
  const intentIdentity = fs.statSync(intentPath).ino;
  const recovery = createWorkspaceCoordinator({ lockDirectory, maxWaitAttempts: 0 });

  assert.equal(recovery.tryAcquire(workspace, "competing-recovery"), null);
  assert.equal(fs.existsSync(intentPath), true);
  assert.equal(fs.statSync(intentPath).ino, intentIdentity);
  assert.equal(liveWriter.exitCode, null);
  blocker.release("live-intent-reader");
  assert.equal(await waitForExit(liveWriter), 0, liveWriter.output());
});

test("aynı execution kimliğiyle tekrar edinim aktif ve başka süreç sahibi varken reddedilir", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-coordinator-replay-"));
  const lockDirectory = path.join(root, "locks");
  const workspace = path.join(root, "workspace");
  fs.mkdirSync(workspace);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const first = createWorkspaceCoordinator({ lockDirectory });
  const second = createWorkspaceCoordinator({ lockDirectory });

  assert.ok(first.tryAcquire(workspace, "replay-owner"));
  assert.equal(first.tryAcquire(workspace, "replay-owner"), null);
  assert.equal(second.tryAcquire(workspace, "replay-owner"), null);
  first.release("replay-owner");
  assert.ok(second.tryAcquire(workspace, "replay-owner"));
  second.release("replay-owner");
});

test("çöken kuyruk yazarı intent kilidini bırakır ve sonraki recovery intenti budar", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-coordinator-intent-crash-"));
  const lockDirectory = path.join(root, "locks");
  const workspace = path.join(root, "workspace");
  const markers = path.join(root, "markers");
  fs.mkdirSync(workspace);
  fs.mkdirSync(markers);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const coordinator = createWorkspaceCoordinator({ lockDirectory });
  const reader = await coordinator.acquire(workspace, "read_only", "reader-blocker");
  assert.ok(reader);
  const writer = spawnWorker("coordinator-queue", lockDirectory, workspace, "queued-writer");
  t.after(() => {
    if (writer.exitCode === null) writer.kill();
    coordinator.cancel("recovery-writer");
    coordinator.release("reader-blocker");
    coordinator.release("recovery-writer");
  });

  await waitForMarker(workspace, "queued-writer-queued", [writer]);
  const workspaceHash = crypto.createHash("sha256").update(workspace).digest("hex");
  const workspaceLockDirectory = path.join(lockDirectory, "coordinator-v2", workspaceHash);
  assert.equal(fs.readdirSync(workspaceLockDirectory).filter((name) => name.startsWith("writer-") && name.endsWith(".intent")).length, 1);
  writer.kill("SIGKILL");
  assert.notEqual(await waitForExit(writer), 0);
  coordinator.release("reader-blocker");
  const recovered = await coordinator.acquire(workspace, "edit", "recovery-writer");
  assert.ok(recovered);
  assert.equal(fs.readdirSync(workspaceLockDirectory).some((name) => name.startsWith("writer-") && name.endsWith(".intent")), false);
  coordinator.release("recovery-writer");
});

test("intent fsync sonrasında kilit alınmadan çöken süreçten sonra recovery ilerler", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-coordinator-fsync-crash-"));
  const lockDirectory = path.join(root, "locks");
  const workspace = path.join(root, "workspace");
  const markers = path.join(root, "markers");
  fs.mkdirSync(workspace);
  fs.mkdirSync(markers);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const crashed = spawnWorker("coordinator-fsync-intent-crash", lockDirectory, workspace, "fsync-crash");
  assert.notEqual(await waitForExit(crashed), 0);
  const workspaceHash = crypto.createHash("sha256").update(workspace).digest("hex");
  const workspaceLockDirectory = path.join(lockDirectory, "coordinator-v2", workspaceHash);
  const intents = fs.readdirSync(workspaceLockDirectory).filter((name) => name.startsWith("writer-") && name.endsWith(".intent"));
  assert.equal(intents.length, 1);
  assert.doesNotThrow(() => JSON.parse(fs.readFileSync(path.join(workspaceLockDirectory, intents[0]), "utf8")));
  const coordinator = createWorkspaceCoordinator({ lockDirectory, maxWaitAttempts: 0 });

  assert.ok(coordinator.tryAcquire(workspace, "after-fsync-crash"));
  assert.equal(fs.readdirSync(workspaceLockDirectory).some((name) => name.startsWith("writer-") && name.endsWith(".intent")), false);
  coordinator.release("after-fsync-crash");
});

test("intent fsync hatası kaydı yayımlamadan fail-closed kalır", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-coordinator-fsync-failure-"));
  const lockDirectory = path.join(root, "locks");
  const workspace = path.join(root, "workspace");
  fs.mkdirSync(workspace);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const coordinator = createWorkspaceCoordinator({ lockDirectory, maxWaitAttempts: 0 });
  const workspaceHash = crypto.createHash("sha256").update(workspace).digest("hex");
  const workspaceLockDirectory = path.join(lockDirectory, "coordinator-v2", workspaceHash);
  const originalFsyncSync = fs.fsyncSync;
  let injectedFailure = false;
  fs.fsyncSync = function () {
    injectedFailure = true;
    const error = new Error("simulated intent fsync failure");
    error.code = "EIO";
    throw error;
  };
  t.after(() => { fs.fsyncSync = originalFsyncSync; });

  assert.equal(coordinator.tryAcquire(workspace, "fsync-failure"), null);
  assert.equal(injectedFailure, true);
  assert.equal(fs.readdirSync(workspaceLockDirectory).some((name) => name.startsWith("writer-") && name.endsWith(".intent")), false);
  fs.fsyncSync = originalFsyncSync;
  assert.ok(coordinator.tryAcquire(workspace, "fsync-failure"));
  coordinator.release("fsync-failure");
});

test("geçici intent silme hatası sonrası kuyruk sahibi intenti yeniden kurup ilerler", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-coordinator-intent-delete-retry-"));
  const lockDirectory = path.join(root, "locks");
  const workspace = path.join(root, "workspace");
  fs.mkdirSync(workspace);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const coordinator = createWorkspaceCoordinator({ lockDirectory, maxWaitAttempts: 5 });
  const originalRmSync = fs.rmSync;
  let injectedFailure = false;
  fs.rmSync = function (target, ...args) {
    const name = path.basename(String(target));
    if (!injectedFailure && name.startsWith("writer-") && name.endsWith(".intent")) {
      injectedFailure = true;
      const error = new Error("simulated transient writer intent unlink failure");
      error.code = "EACCES";
      throw error;
    }
    return originalRmSync.call(this, target, ...args);
  };
  t.after(() => { fs.rmSync = originalRmSync; });

  const grant = await coordinator.acquire(workspace, "edit", "intent-delete-retry");
  assert.ok(grant);
  assert.equal(injectedFailure, true);
  assert.equal(coordinator.assertOwner(workspace, "intent-delete-retry"), true);
  fs.rmSync = originalRmSync;
  coordinator.release("intent-delete-retry");
});

test("intent yazımının ortasında çöken süreçten sonra bozuk kayıt recovery ile temizlenir", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-coordinator-partial-intent-crash-"));
  const lockDirectory = path.join(root, "locks");
  const workspace = path.join(root, "workspace");
  const markers = path.join(root, "markers");
  fs.mkdirSync(workspace);
  fs.mkdirSync(markers);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const crashed = spawnWorker("coordinator-partial-intent-crash", lockDirectory, workspace, "partial-crash");
  assert.notEqual(await waitForExit(crashed), 0);
  const workspaceHash = crypto.createHash("sha256").update(workspace).digest("hex");
  const workspaceLockDirectory = path.join(lockDirectory, "coordinator-v2", workspaceHash);
  const partialIntents = fs.readdirSync(workspaceLockDirectory).filter((name) => name.startsWith("writer-") && name.endsWith(".intent"));
  assert.equal(partialIntents.length, 1);
  assert.equal(fs.readFileSync(path.join(workspaceLockDirectory, partialIntents[0]), "utf8"), "{");
  const coordinator = createWorkspaceCoordinator({ lockDirectory, maxWaitAttempts: 0 });

  assert.ok(coordinator.tryAcquire(workspace, "after-partial-crash"));
  assert.equal(fs.readdirSync(workspaceLockDirectory).some((name) => name.startsWith("writer-") && name.endsWith(".intent")), false);
  coordinator.release("after-partial-crash");
});
