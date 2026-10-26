import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { closeKernelFileDescriptor, kernelLockAcquisitionAvailable, lockOpenFileDescriptor, openKernelFileLock } from "./kernel-file-lock.js";

function workspaceKey(workspace) {
  return crypto.createHash("sha256").update(workspace).digest("hex");
}

function executionKey(executionId) {
  return crypto.createHash("sha256").update(executionId).digest("hex");
}

function compareWriterIntentOrder(left, right) {
  return right.priority - left.priority || left.enqueuedAt - right.enqueuedAt || left.entry.localeCompare(right.entry, "en");
}

export function withGuard(directory, staleLockMs, callback) {
  const guardPath = path.join(directory, "guard.lock");
  const guardLock = openKernelFileLock(guardPath);
  if (!guardLock) return null;
  let result;
  try {
    result = callback();
  } catch (error) {
    guardLock.release();
    throw error;
  }
  if (!guardLock.release()) {
    if (typeof result?.release === "function") result.release();
    return null;
  }
  return result;
}

export function createWorkspaceCoordinator({ lockDirectory, staleLockMs = 1500000, maxQueuedPerWorkspace = 100, maxWaitAttempts = 12000 } = {}) {
  const directory = lockDirectory || path.join(process.cwd(), ".subagent-bridge-locks");
  const queues = new Map();
  const active = new Map();
  const pending = new Map();
  const writerIntentLocks = new Map();
  const pendingIntentCleanups = new Map();
  const intentCleanupAttempts = new Map();

  function lockDirectoryFor(workspace) {
    const target = path.join(directory, "coordinator-v2", workspaceKey(workspace));
    fs.mkdirSync(target, { recursive: true });
    return target;
  }

  function writerIntentPath(workspace, executionId, intentOwnerId) {
    return path.join(lockDirectoryFor(workspace), `writer-${executionKey(executionId)}-${intentOwnerId}.intent`);
  }

  function registerWriterIntent(workspace, executionId, priority, enqueuedAt, intentOwnerId) {
    const currentLock = writerIntentLocks.get(intentOwnerId);
    if (currentLock?.isOwner()) return currentLock;
    if (currentLock) {
      if (!currentLock.release()) return null;
      writerIntentLocks.delete(intentOwnerId);
    }
    try {
      const target = lockDirectoryFor(workspace);
      return withGuard(target, staleLockMs, () => {
        removeAbandonedWriterIntents(target);
        const intentPath = writerIntentPath(workspace, executionId, intentOwnerId);
        let descriptor;
        try {
          descriptor = fs.openSync(intentPath, "wx+");
          fs.writeFileSync(descriptor, JSON.stringify({ priority, enqueuedAt, intentOwnerId }), "utf8");
          fs.fsyncSync(descriptor);
          const intentLock = lockOpenFileDescriptor(descriptor, { shared: true });
          if (!intentLock) {
            closeKernelFileDescriptor(descriptor);
            descriptor = undefined;
            fs.rmSync(intentPath, { force: true });
            return null;
          }
          writerIntentLocks.set(intentOwnerId, intentLock);
          descriptor = undefined;
          return intentLock;
        } catch {
          if (descriptor !== undefined) {
            closeKernelFileDescriptor(descriptor);
            descriptor = undefined;
          }
          try {
            fs.rmSync(intentPath, { force: true });
          } catch {
          }
          return null;
        }
      }) || null;
    } catch {
      return null;
    }
  }

  function finishWriterIntentCleanup(intentOwnerId) {
    const pendingCleanup = pendingIntentCleanups.get(intentOwnerId);
    if (pendingCleanup) clearTimeout(pendingCleanup.timer);
    pendingIntentCleanups.delete(intentOwnerId);
    intentCleanupAttempts.delete(intentOwnerId);
  }

  function scheduleWriterIntentCleanup(workspace, executionId, intentOwnerId) {
    if (pendingIntentCleanups.has(intentOwnerId) || !kernelLockAcquisitionAvailable()) return;
    const attempts = (intentCleanupAttempts.get(intentOwnerId) || 0) + 1;
    intentCleanupAttempts.set(intentOwnerId, attempts);
    const delayMs = Math.min(1000, 25 * 2 ** Math.min(attempts - 1, 5));
    const timer = setTimeout(() => {
      pendingIntentCleanups.delete(intentOwnerId);
      clearWriterIntent(workspace, executionId, intentOwnerId);
    }, delayMs);
    timer.unref?.();
    pendingIntentCleanups.set(intentOwnerId, { timer, workspace, executionId });
  }

  function clearWriterIntent(workspace, executionId, intentOwnerId) {
    try {
      const target = lockDirectoryFor(workspace);
      const intentPath = writerIntentPath(workspace, executionId, intentOwnerId);
      const currentLock = writerIntentLocks.get(intentOwnerId);
      const result = withGuard(target, staleLockMs, () => {
        if (currentLock) {
          if (!currentLock.release()) return false;
          writerIntentLocks.delete(intentOwnerId);
        } else {
          const staleLock = openKernelFileLock(intentPath);
          if (!staleLock) return !fs.existsSync(intentPath);
          if (!staleLock.release()) return false;
        }
        fs.rmSync(intentPath, { force: true });
        return true;
      });
      if (result === true) {
        finishWriterIntentCleanup(intentOwnerId);
        return true;
      }
      scheduleWriterIntentCleanup(workspace, executionId, intentOwnerId);
      return false;
    } catch {
      scheduleWriterIntentCleanup(workspace, executionId, intentOwnerId);
      return false;
    }
  }

  function removeAbandonedWriterIntents(target) {
    for (const entry of fs.readdirSync(target).filter((name) => name.startsWith("writer-") && name.endsWith(".intent"))) {
      const intentPath = path.join(target, entry);
      const staleLock = openKernelFileLock(intentPath);
      if (!staleLock) continue;
      if (!staleLock.release()) continue;
      try {
        fs.rmSync(intentPath, { force: true });
      } catch {
      }
    }
  }

  function earliestWriterIntent(target) {
    return fs.readdirSync(target)
      .filter((entry) => entry.startsWith("writer-"))
      .map((entry) => {
        try {
          const value = JSON.parse(fs.readFileSync(path.join(target, entry), "utf8"));
          return { entry, priority: Number.isFinite(value.priority) ? value.priority : 0, enqueuedAt: Number.isFinite(value.enqueuedAt) ? value.enqueuedAt : 0 };
        } catch {
          return { entry, priority: 0, enqueuedAt: 0 };
        }
      })
      .sort(compareWriterIntentOrder)[0] || null;
  }

  function acquireExternal(workspace, mode, executionId, priority, enqueuedAt, intentOwnerId) {
    try {
      const target = lockDirectoryFor(workspace);
      return withGuard(target, staleLockMs, () => {
        removeAbandonedWriterIntents(target);
        const selectedWriterIntent = earliestWriterIntent(target);
        const writerIntentExists = selectedWriterIntent !== null;
        if (mode === "read_only" && writerIntentExists) return null;
        if (mode === "edit" && selectedWriterIntent?.entry !== path.basename(writerIntentPath(workspace, executionId, intentOwnerId))) {
          return null;
        }
        return openKernelFileLock(path.join(target, "execution.lock"), { shared: mode === "read_only" });
      });
    } catch {
      return null;
    }
  }

  function queueFor(workspace) {
    const key = workspaceKey(workspace);
    if (!queues.has(key)) queues.set(key, []);
    return queues.get(key);
  }

  function scheduleDrain(workspace, queue) {
    if (queue.retryTimer) return;
    queue.retryTimer = setTimeout(() => {
      queue.retryTimer = null;
      drain(workspace);
    }, 50);
  }

  function drain(workspace) {
    const queue = queueFor(workspace);
    while (queue.length > 0) {
      const queuedWriter = queue.filter((entry) => entry.mode === "edit").sort((left, right) => right.priority - left.priority || left.enqueuedAt - right.enqueuedAt
        || path.basename(writerIntentPath(workspace, left.executionId, left.intentOwnerId)).localeCompare(path.basename(writerIntentPath(workspace, right.executionId, right.intentOwnerId)), "en"))[0];
      const next = queuedWriter || queue.sort((left, right) => right.priority - left.priority || left.enqueuedAt - right.enqueuedAt || left.executionId.localeCompare(right.executionId, "en"))[0];
      if (next.cancelled) {
        queue.splice(queue.indexOf(next), 1);
        if (next.mode === "edit") clearWriterIntent(workspace, next.executionId, next.intentOwnerId);
        next.resolve(null);
        continue;
      }
      if (next.mode === "edit" && !registerWriterIntent(workspace, next.executionId, next.priority, next.enqueuedAt, next.intentOwnerId)) {
        next.waitAttempts = (next.waitAttempts || 0) + 1;
        if (next.waitAttempts > maxWaitAttempts) {
          queue.splice(queue.indexOf(next), 1);
          clearWriterIntent(workspace, next.executionId, next.intentOwnerId);
          next.resolve(null);
          continue;
        }
        scheduleDrain(workspace, queue);
        break;
      }
      const release = acquireExternal(workspace, next.mode, next.executionId, next.priority, next.enqueuedAt, next.intentOwnerId);
      if (!release) {
        next.waitAttempts = (next.waitAttempts || 0) + 1;
        if (next.waitAttempts > maxWaitAttempts) {
          queue.splice(queue.indexOf(next), 1);
          if (next.mode === "edit") clearWriterIntent(workspace, next.executionId, next.intentOwnerId);
          next.resolve(null);
          continue;
        }
        scheduleDrain(workspace, queue);
        break;
      }
      if (next.mode === "edit" && !clearWriterIntent(workspace, next.executionId, next.intentOwnerId)) {
        release.release();
        next.waitAttempts = (next.waitAttempts || 0) + 1;
        if (next.waitAttempts > maxWaitAttempts) {
          queue.splice(queue.indexOf(next), 1);
          next.resolve(null);
          continue;
        }
        scheduleDrain(workspace, queue);
        break;
      }
      queue.splice(queue.indexOf(next), 1);
      active.set(next.executionId, { workspace, release: () => release.release(), isOwner: release.isOwner });
      next.resolve({ queueWaitMs: Date.now() - next.enqueuedAt });
    }
    if (queue.length === 0) {
      if (queue.retryTimer) clearTimeout(queue.retryTimer);
      queues.delete(workspaceKey(workspace));
    }
  }

  function queuedExecution(executionId) {
    return [...queues.values()].flat().find((entry) => entry.executionId === executionId) || null;
  }

  function cancelQueuedEntry(entry) {
    if (entry.settled) return false;
    entry.cancelled = true;
    if (entry.retryTimer) clearTimeout(entry.retryTimer);
    const isPendingEntry = pending.get(entry.executionId) === entry;
    if (isPendingEntry) pending.delete(entry.executionId);
    const queue = queues.get(workspaceKey(entry.workspace));
    const queueIndex = queue?.indexOf(entry) ?? -1;
    if (queueIndex >= 0) queue.splice(queueIndex, 1);
    if (entry.mode === "edit") clearWriterIntent(entry.workspace, entry.executionId, entry.intentOwnerId);
    entry.resolve(null);
    if (queueIndex >= 0) drain(entry.workspace);
    return isPendingEntry || queueIndex >= 0;
  }

  function acquire(workspace, mode, executionId, priority = 0, { signal } = {}) {
    if (signal?.aborted) return Promise.resolve(null);
    if (active.has(executionId) || pending.has(executionId) || queuedExecution(executionId)) return Promise.resolve(null);
    const queue = queueFor(workspace);
    const pendingForWorkspace = [...pending.values()].filter((entry) => workspaceKey(entry.workspace) === workspaceKey(workspace)).length;
    if (queue.length + pendingForWorkspace >= maxQueuedPerWorkspace) return Promise.resolve(null);
    return new Promise((resolve) => {
      const enqueuedAt = Date.now();
      const entry = { workspace, mode, executionId, priority, enqueuedAt, intentOwnerId: mode === "edit" ? crypto.randomUUID() : null, cancelled: false, retryTimer: null };
      entry.resolve = (value) => {
        if (entry.settled) return;
        entry.settled = true;
        signal?.removeEventListener?.("abort", entry.abortListener);
        resolve(value);
      };
      entry.abortListener = () => {
        cancelQueuedEntry(entry);
      };
      const enqueue = () => {
        if (entry.cancelled) {
          if (pending.get(executionId) === entry) pending.delete(executionId);
          if (mode === "edit") clearWriterIntent(workspace, executionId, entry.intentOwnerId);
          entry.resolve(null);
          return;
        }
        if (mode === "edit" && !registerWriterIntent(workspace, executionId, priority, enqueuedAt, entry.intentOwnerId)) {
          clearWriterIntent(workspace, executionId, entry.intentOwnerId);
          entry.waitAttempts = (entry.waitAttempts || 0) + 1;
          if (entry.waitAttempts > maxWaitAttempts) {
            if (pending.get(executionId) === entry) pending.delete(executionId);
            clearWriterIntent(workspace, executionId, entry.intentOwnerId);
            entry.resolve(null);
            return;
          }
          pending.set(executionId, entry);
          entry.retryTimer = setTimeout(enqueue, 50);
          return;
        }
        pending.delete(executionId);
        queueFor(workspace).push(entry);
        drain(workspace);
      };
      signal?.addEventListener?.("abort", entry.abortListener, { once: true });
      if (signal?.aborted) {
        entry.abortListener();
        if (!entry.settled) entry.resolve(null);
        return;
      }
      enqueue();
    });
  }

  function tryAcquire(workspace, executionId, priority = 0) {
    if (active.has(executionId) || pending.has(executionId) || queuedExecution(executionId)) return null;
    const enqueuedAt = Date.now();
    const intentOwnerId = crypto.randomUUID();
    if (!registerWriterIntent(workspace, executionId, priority, enqueuedAt, intentOwnerId)) {
      return null;
    }
    const release = acquireExternal(workspace, "edit", executionId, priority, enqueuedAt, intentOwnerId);
    if (!release || !clearWriterIntent(workspace, executionId, intentOwnerId)) {
      release?.release();
      clearWriterIntent(workspace, executionId, intentOwnerId);
      return null;
    }
    active.set(executionId, { workspace, release: () => release.release(), isOwner: release.isOwner });
    return { queueWaitMs: 0 };
  }

  function release(executionId) {
    const entry = active.get(executionId);
    if (!entry) return;
    if (!entry.release()) return;
    active.delete(executionId);
    drain(entry.workspace);
  }

  function assertOwner(workspace, executionId) {
    const entry = active.get(executionId);
    return Boolean(entry && entry.workspace === workspace && entry.isOwner());
  }

  function cancel(executionId) {
    const pendingEntry = pending.get(executionId);
    const queuedEntry = queuedExecution(executionId);
    return pendingEntry ? cancelQueuedEntry(pendingEntry) : Boolean(queuedEntry && cancelQueuedEntry(queuedEntry));
  }

  function snapshot(now = Date.now()) {
    const queuedEntries = [...queues.values()].flatMap((queue) => [...queue]);
    const pendingEntries = [...pending.values()];
    const waitingEntries = [...queuedEntries, ...pendingEntries];
    const externalFiles = [];
    try {
      const coordinatorDirectory = path.join(directory, "coordinator-v2");
      const workspaceDirectories = fs.existsSync(coordinatorDirectory) ? fs.readdirSync(coordinatorDirectory, { withFileTypes: true }) : [];
      for (const workspaceDirectory of workspaceDirectories) {
        if (!workspaceDirectory.isDirectory()) continue;
        const workspaceLockDirectory = path.join(coordinatorDirectory, workspaceDirectory.name);
        for (const entry of fs.readdirSync(workspaceLockDirectory, { withFileTypes: true })) {
          if (entry.isFile() && entry.name !== "guard.lock") externalFiles.push(path.join(workspaceDirectory.name, entry.name));
        }
      }
    } catch {
    }
    externalFiles.sort((left, right) => left.localeCompare(right, "en"));
    return {
      localActive: active.size,
      localQueued: waitingEntries.length,
      oldestQueueEntryMs: waitingEntries.length > 0 ? Math.max(0, now - Math.min(...waitingEntries.map((entry) => entry.enqueuedAt))) : null,
      externalDiskLocks: externalFiles.map((_, index) => `lock-${index + 1}`),
      lockCount: externalFiles.length,
      kernelLocks: true
    };
  }

  return { acquire, tryAcquire, release, cancel, assertOwner, snapshot };
}
