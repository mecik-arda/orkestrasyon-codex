import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
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
  const result = withGuard(root, 5, () => {
    mark(`${identity}-entered`);
    waitForMarkerSync(`${identity}-release`);
    return true;
  });
  mark(`${identity}-result`, JSON.stringify(result));
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
