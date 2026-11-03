import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { openKernelFileLock } from "../../subagent-bridge/src/services/kernel-file-lock.js";
import { createWorkspaceCoordinator, withGuard } from "../../subagent-bridge/src/services/workspace-coordinator.js";

const [mode, root, markers, identity] = process.argv.slice(2);

function mark(name, value = "1") {
  fs.writeFileSync(path.join(markers, name), value, "utf8");
}

function waitForMarkerSync(name) {
  const sleeper = new Int32Array(new SharedArrayBuffer(4));
  const markerPath = path.join(markers, name);
  const deadline = Date.now() + 15000;
  while (!fs.existsSync(markerPath)) {
    if (Date.now() >= deadline) throw new Error(`barrier timeout: ${name}`);
    Atomics.wait(sleeper, 0, 0, 2);
  }
}

async function waitForMarker(name) {
  const markerPath = path.join(markers, name);
  const deadline = Date.now() + 15000;
  while (!fs.existsSync(markerPath)) {
    if (Date.now() >= deadline) throw new Error(`barrier timeout: ${name}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

if (mode === "guard-hold") {
  const deadline = Date.now() + 15000;
  let result = null;
  while (result === null && Date.now() < deadline) {
    result = withGuard(root, 5, () => {
      mark(`${identity}-entered`);
      waitForMarkerSync(`${identity}-release`);
      return true;
    });
    if (result === null) {
      mark(`${identity}-contended`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
    }
  }
  if (result !== true) throw new Error("guard owner could not acquire the lock");
  mark(`${identity}-result`, JSON.stringify(result));
} else if (mode === "guard-close-failure") {
  const originalCloseSync = fs.closeSync;
  let closeAttempts = 0;
  fs.closeSync = function (descriptor) {
    closeAttempts += 1;
    const result = originalCloseSync.call(this, descriptor);
    if (closeAttempts === 1) {
      const error = new Error("simulated uncertain descriptor close result");
      error.code = "EIO";
      throw error;
    }
    return result;
  };
  const value = withGuard(root, 0, () => "completed");
  fs.closeSync = originalCloseSync;
  const successor = openKernelFileLock(path.join(root, "guard.lock"));
  mark(`${identity}-result`, JSON.stringify({ value, closeAttempts, successor: Boolean(successor) }));
  successor?.release();
} else if (mode === "coordinator-intent-close-failure") {
  const originalOpenSync = fs.openSync;
  const originalFsyncSync = fs.fsyncSync;
  const originalCloseSync = fs.closeSync;
  let intentDescriptor = null;
  let closeAttempts = 0;
  fs.openSync = function (filePath, ...args) {
    const descriptor = originalOpenSync.call(this, filePath, ...args);
    if (String(filePath).endsWith(".intent")) intentDescriptor = descriptor;
    return descriptor;
  };
  fs.fsyncSync = function (descriptor) {
    if (descriptor === intentDescriptor) {
      const error = new Error("simulated intent fsync failure");
      error.code = "EIO";
      throw error;
    }
    return originalFsyncSync.call(this, descriptor);
  };
  fs.closeSync = function (descriptor) {
    if (descriptor === intentDescriptor) {
      closeAttempts += 1;
      const result = originalCloseSync.call(this, descriptor);
      const error = new Error("simulated uncertain intent descriptor close result");
      error.code = "EIO";
      throw error;
    }
    return originalCloseSync.call(this, descriptor);
  };
  const workspace = path.join(root, "workspace");
  fs.mkdirSync(workspace, { recursive: true });
  const coordinator = createWorkspaceCoordinator({ lockDirectory: root, maxWaitAttempts: 0 });
  const result = coordinator.tryAcquire(workspace, "intent-close-failure");
  fs.openSync = originalOpenSync;
  fs.fsyncSync = originalFsyncSync;
  fs.closeSync = originalCloseSync;
  const successor = coordinator.tryAcquire(workspace, "intent-close-successor");
  mark(`${identity}-result`, JSON.stringify({ result: Boolean(result), closeAttempts, successor: Boolean(successor) }));
  if (result) coordinator.release("intent-close-failure");
  if (successor) coordinator.release("intent-close-successor");
} else if (mode === "coordinator-guard-close-failure") {
  const originalOpenSync = fs.openSync;
  const originalCloseSync = fs.closeSync;
  const guardDescriptors = [];
  let closeAttempts = 0;
  fs.openSync = function (filePath, ...args) {
    const descriptor = originalOpenSync.call(this, filePath, ...args);
    if (path.basename(String(filePath)) === "guard.lock") guardDescriptors.push(descriptor);
    return descriptor;
  };
  fs.closeSync = function (descriptor) {
    const result = originalCloseSync.call(this, descriptor);
    if (descriptor === guardDescriptors[2]) {
      closeAttempts += 1;
      const error = new Error("simulated uncertain cleanup guard close result");
      error.code = "EIO";
      throw error;
    }
    return result;
  };
  const workspace = path.join(root, "workspace");
  fs.mkdirSync(workspace, { recursive: true });
  const coordinator = createWorkspaceCoordinator({ lockDirectory: root, maxWaitAttempts: 0 });
  const executionId = `guard-close-${identity}`;
  const grant = identity === "async"
    ? await coordinator.acquire(workspace, "edit", executionId)
    : coordinator.tryAcquire(workspace, executionId);
  const owner = coordinator.assertOwner(workspace, executionId);
  fs.openSync = originalOpenSync;
  fs.closeSync = originalCloseSync;
  mark(`${identity}-result`, JSON.stringify({ granted: Boolean(grant), owner, closeAttempts }));
  if (grant) coordinator.release(executionId);
} else if (mode === "guard-try") {
  const result = withGuard(root, 5, () => {
    mark(`${identity}-entered`);
    return true;
  });
  mark(`${identity}-result`, JSON.stringify(result));
} else if (mode === "coordinator-hold") {
  const coordinator = createWorkspaceCoordinator({ lockDirectory: root, maxWaitAttempts: 0 });
  const grant = await coordinator.acquire(markers, "edit", identity);
  if (!grant) process.exit(2);
  mark(`${identity}-entered`);
  await waitForMarker(`${identity}-release`);
  coordinator.release(identity);
  mark(`${identity}-result`, JSON.stringify(true));
} else if (mode === "coordinator-queue") {
  const coordinator = createWorkspaceCoordinator({ lockDirectory: root });
  const grantPromise = coordinator.acquire(markers, "edit", identity);
  const lockDirectory = path.join(root, "coordinator-v2", crypto.createHash("sha256").update(markers).digest("hex"));
  await waitFor(async () => fs.existsSync(lockDirectory) && fs.readdirSync(lockDirectory).some((entry) => entry.startsWith("writer-") && entry.endsWith(".intent")));
  mark(`${identity}-queued`);
  const grant = await grantPromise;
  if (grant) coordinator.release(identity);
} else if (mode === "coordinator-partial-intent-crash") {
  const originalWriteFileSync = fs.writeFileSync;
  fs.writeFileSync = function (target, ...args) {
    if (typeof target === "number") {
      originalWriteFileSync.call(this, target, "{", "utf8");
      process.kill(process.pid, "SIGKILL");
    }
    return originalWriteFileSync.call(this, target, ...args);
  };
  const coordinator = createWorkspaceCoordinator({ lockDirectory: root, maxWaitAttempts: 0 });
  await coordinator.acquire(markers, "edit", identity);
} else if (mode === "coordinator-fsync-intent-crash") {
  const originalFsyncSync = fs.fsyncSync;
  fs.fsyncSync = function (descriptor) {
    originalFsyncSync.call(this, descriptor);
    process.kill(process.pid, "SIGKILL");
  };
  const coordinator = createWorkspaceCoordinator({ lockDirectory: root, maxWaitAttempts: 0 });
  await coordinator.acquire(markers, "edit", identity);
} else if (mode === "coordinator-try") {
  const coordinator = createWorkspaceCoordinator({ lockDirectory: root, maxWaitAttempts: 0 });
  const grant = await coordinator.acquire(markers, "edit", identity);
  mark(`${identity}-result`, JSON.stringify(Boolean(grant)));
  if (grant) {
    mark(`${identity}-entered`);
    await waitForMarker(`${identity}-release`);
    coordinator.release(identity);
  }
} else if (mode === "coordinator-recovery-race") {
  const coordinator = createWorkspaceCoordinator({ lockDirectory: root });
  mark(`${identity}-ready`);
  await waitForMarker("recovery-race-go");
  const grant = await coordinator.acquire(markers, "edit", identity);
  mark(`${identity}-result`, JSON.stringify(Boolean(grant)));
  if (grant) {
    mark(`${identity}-entered`);
    await waitForMarker(`${identity}-release`);
    coordinator.release(identity);
  }
}

async function waitFor(predicate) {
  const deadline = Date.now() + 15000;
  while (!await predicate()) {
    if (Date.now() >= deadline) throw new Error("barrier timeout: writer intent");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
