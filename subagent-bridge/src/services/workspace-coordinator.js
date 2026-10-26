import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function workspaceKey(workspace) {
  return crypto.createHash("sha256").update(workspace).digest("hex");
}

function executionKey(executionId) {
  return crypto.createHash("sha256").update(executionId).digest("hex");
}

function stale(filePath, staleLockMs) {
  try {
    return Date.now() - fs.statSync(filePath).mtimeMs > staleLockMs;
  } catch {
    return false;
  }
}

function staleWorkspaceLease(filePath, staleLockMs) {
  let value;
  try {
    value = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return stale(filePath, staleLockMs);
  }
  if (!value || !Number.isInteger(value.pid) || value.pid <= 0) return stale(filePath, staleLockMs);
  try {
    process.kill(value.pid, 0);
    return false;
  } catch (error) {
    if (error.code === "ESRCH") return true;
    return false;
  }
}

function compareWriterIntentOrder(left, right) {
  return right.priority - left.priority || left.enqueuedAt - right.enqueuedAt || left.entry.localeCompare(right.entry, "en");
}

function cleanStaleLocks(directory, staleLockMs) {
  try {
    const entries = fs.readdirSync(directory);
    const remainingEntries = [];
    for (const entry of entries) {
      const filePath = path.join(directory, entry);
      if (staleWorkspaceLease(filePath, staleLockMs)) {
        fs.rmSync(filePath, { force: true });
      } else {
        remainingEntries.push(entry);
      }
    }
    return remainingEntries;
  } catch {
    return null;
  }
}

function createLease(lockPath, ownerId, leaseHeartbeatMs) {
  const temporaryPath = `${lockPath}.${ownerId}.tmp`;
  let descriptor;
  try {
    descriptor = fs.openSync(temporaryPath, "wx");
    fs.writeFileSync(descriptor, JSON.stringify({ ownerId, pid: process.pid, createdAt: new Date().toISOString() }), "utf8");
    fs.fsyncSync(descriptor);
    fs.linkSync(temporaryPath, lockPath);
  } catch (error) {
    if (descriptor !== undefined) {
      try {
        fs.closeSync(descriptor);
      } catch {
      }
    }
    try {
      fs.rmSync(temporaryPath, { force: true });
    } catch {
    }
    throw error;
  }
  try {
    fs.rmSync(temporaryPath, { force: true });
  } catch {
  }
  const heartbeat = setInterval(() => {
    try {
      fs.futimesSync(descriptor, new Date(), new Date());
    } catch {
      clearInterval(heartbeat);
    }
  }, leaseHeartbeatMs);
  heartbeat.unref?.();
  const release = () => {
    clearInterval(heartbeat);
    try {
      fs.closeSync(descriptor);
    } catch {
    }
    try {
      const current = JSON.parse(fs.readFileSync(lockPath, "utf8"));
      if (current.ownerId === ownerId && current.pid === process.pid) fs.rmSync(lockPath, { force: true });
    } catch {
    }
    try {
      fs.rmSync(temporaryPath, { force: true });
    } catch {
    }
  };
  release.isOwner = () => {
    try {
      const current = JSON.parse(fs.readFileSync(lockPath, "utf8"));
      return current.ownerId === ownerId && current.pid === process.pid;
    } catch {
      return false;
    }
  };
  return release;
}

export function withGuard(directory, staleLockMs, callback) {
  const guardPath = path.join(directory, "guard.lock");
  const ownerId = crypto.randomUUID();
  const temporaryPath = `${guardPath}.${ownerId}.tmp`;
  let descriptor;
  try {
    descriptor = fs.openSync(temporaryPath, "wx");
    fs.writeFileSync(descriptor, ownerId, "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    try {
      fs.linkSync(temporaryPath, guardPath);
    } catch (error) {
      if (error.code !== "EEXIST" || !stale(guardPath, staleLockMs)) return null;
      try {
        fs.rmSync(guardPath, { force: true });
        fs.linkSync(temporaryPath, guardPath);
      } catch {
        return null;
      }
    }
  } catch {
    if (descriptor !== undefined) {
      try {
        fs.closeSync(descriptor);
      } catch {
      }
    }
    return null;
  } finally {
    try {
      fs.rmSync(temporaryPath, { force: true });
    } catch {
    }
  }
  try {
    return callback();
  } finally {
    try {
      if (fs.readFileSync(guardPath, "utf8") === ownerId) fs.rmSync(guardPath, { force: true });
    } catch {
    }
  }
}

export function createWorkspaceCoordinator({ lockDirectory, staleLockMs = 1500000, leaseHeartbeatMs = Math.max(1000, Math.floor(staleLockMs / 3)), maxQueuedPerWorkspace = 100, maxWaitAttempts = 12000 } = {}) {
  const directory = lockDirectory || path.join(process.cwd(), ".subagent-bridge-locks");
  const queues = new Map();
  const active = new Map();
  const pending = new Map();

  function lockDirectoryFor(workspace) {
    const target = path.join(directory, workspaceKey(workspace));
    fs.mkdirSync(target, { recursive: true });
    return target;
  }

  function writerIntentPath(workspace, executionId, intentOwnerId) {
    return path.join(lockDirectoryFor(workspace), `writer-${executionKey(executionId)}-${intentOwnerId}.intent`);
  }

  function registerWriterIntent(workspace, executionId, priority, enqueuedAt, intentOwnerId) {
    try {
      const target = lockDirectoryFor(workspace);
      return withGuard(target, staleLockMs, () => {
        const intentPath = writerIntentPath(workspace, executionId, intentOwnerId);
        try {
          fs.writeFileSync(intentPath, JSON.stringify({ priority, enqueuedAt, intentOwnerId }), { flag: "wx" });
        } catch (error) {
          if (error.code !== "EEXIST") return false;
          let currentIntent;
          try {
            currentIntent = JSON.parse(fs.readFileSync(intentPath, "utf8"));
          } catch {
            return false;
          }
          if (currentIntent?.intentOwnerId !== intentOwnerId) return false;
          const refreshedAt = new Date();
          try {
            fs.utimesSync(intentPath, refreshedAt, refreshedAt);
          } catch {
            return false;
          }
        }
        return true;
      }) === true;
    } catch {
      return false;
    }
  }

  function clearWriterIntent(workspace, executionId, intentOwnerId) {
    try {
      const intentPath = writerIntentPath(workspace, executionId, intentOwnerId);
      fs.rmSync(intentPath, { force: true });
      return true;
    } catch {
      return false;
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
        const entries = cleanStaleLocks(target, staleLockMs) || fs.readdirSync(target);
        const writeExists = entries.includes("write.lock");
        const readExists = entries.some((entry) => entry.startsWith("read-"));
        const selectedWriterIntent = earliestWriterIntent(target);
        const writerIntentExists = selectedWriterIntent !== null;
        if ((mode === "read_only" && (writeExists || writerIntentExists)) || (mode === "edit" && (writeExists || readExists))) {
          return null;
        }
        if (mode === "edit" && selectedWriterIntent?.entry !== path.basename(writerIntentPath(workspace, executionId, intentOwnerId))) {
          return null;
        }
        const lockPath = mode === "edit"
          ? path.join(target, "write.lock")
          : path.join(target, `read-${executionKey(executionId)}.lock`);
        const ownerId = crypto.randomUUID();
        try {
          return createLease(lockPath, ownerId, leaseHeartbeatMs);
        } catch {
          return null;
        }
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
        clearWriterIntent(workspace, next.executionId, next.intentOwnerId);
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
      queue.splice(queue.indexOf(next), 1);
      if (next.mode === "edit") clearWriterIntent(workspace, next.executionId, next.intentOwnerId);
      active.set(next.executionId, { workspace, release, isOwner: release.isOwner });
      next.resolve({ queueWaitMs: Date.now() - next.enqueuedAt });
    }
    if (queue.length === 0) {
      if (queue.retryTimer) clearTimeout(queue.retryTimer);
      queues.delete(workspaceKey(workspace));
    }
  }

  function acquire(workspace, mode, executionId, priority = 0) {
    const queue = queueFor(workspace);
    const pendingForWorkspace = [...pending.values()].filter((entry) => workspaceKey(entry.workspace) === workspaceKey(workspace)).length;
    if (queue.length + pendingForWorkspace >= maxQueuedPerWorkspace) return Promise.resolve(null);
    return new Promise((resolve) => {
      const enqueuedAt = Date.now();
      const entry = { workspace, mode, executionId, priority, enqueuedAt, intentOwnerId: mode === "edit" ? crypto.randomUUID() : null, cancelled: false, resolve, retryTimer: null };
      const enqueue = () => {
        if (entry.cancelled) {
          pending.delete(executionId);
          if (mode === "edit") clearWriterIntent(workspace, executionId, entry.intentOwnerId);
          resolve(null);
          return;
        }
        if (mode === "edit" && !registerWriterIntent(workspace, executionId, priority, enqueuedAt, entry.intentOwnerId)) {
          clearWriterIntent(workspace, executionId, entry.intentOwnerId);
          entry.waitAttempts = (entry.waitAttempts || 0) + 1;
          if (entry.waitAttempts > maxWaitAttempts) {
            pending.delete(executionId);
            clearWriterIntent(workspace, executionId, entry.intentOwnerId);
            resolve(null);
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
      enqueue();
    });
  }

  function tryAcquire(workspace, executionId, priority = 0) {
    if (active.has(executionId) || pending.has(executionId)) return null;
    const enqueuedAt = Date.now();
    const intentOwnerId = crypto.randomUUID();
    if (!registerWriterIntent(workspace, executionId, priority, enqueuedAt, intentOwnerId)) {
      clearWriterIntent(workspace, executionId, intentOwnerId);
      return null;
    }
    const release = acquireExternal(workspace, "edit", executionId, priority, enqueuedAt, intentOwnerId);
    clearWriterIntent(workspace, executionId, intentOwnerId);
    if (!release) return null;
    active.set(executionId, { workspace, release, isOwner: release.isOwner });
    return { queueWaitMs: 0 };
  }

  function release(executionId) {
    const entry = active.get(executionId);
    if (!entry) return;
    active.delete(executionId);
    entry.release();
    drain(entry.workspace);
  }

  function assertOwner(workspace, executionId) {
    const entry = active.get(executionId);
    return Boolean(entry && entry.workspace === workspace && entry.isOwner());
  }

  function cancel(executionId) {
    const pendingEntry = pending.get(executionId);
    if (pendingEntry) {
      pendingEntry.cancelled = true;
      if (pendingEntry.retryTimer) clearTimeout(pendingEntry.retryTimer);
      pending.delete(executionId);
      if (pendingEntry.mode === "edit") clearWriterIntent(pendingEntry.workspace, pendingEntry.executionId, pendingEntry.intentOwnerId);
      pendingEntry.resolve(null);
      return true;
    }
    for (const queue of queues.values()) {
      const entry = queue.find((candidate) => candidate.executionId === executionId);
      if (entry) {
        entry.cancelled = true;
        queue.splice(queue.indexOf(entry), 1);
        if (entry.mode === "edit") clearWriterIntent(entry.workspace, entry.executionId, entry.intentOwnerId);
        entry.resolve(null);
        drain(entry.workspace);
        return true;
      }
    }
    return false;
  }

  function snapshot(now = Date.now()) {
    const queuedEntries = [...queues.values()].flatMap((queue) => [...queue]);
    const pendingEntries = [...pending.values()];
    const waitingEntries = [...queuedEntries, ...pendingEntries];
    const externalFiles = [];
    try {
      const workspaceDirectories = fs.existsSync(directory) ? fs.readdirSync(directory, { withFileTypes: true }) : [];
      for (const workspaceDirectory of workspaceDirectories) {
        if (!workspaceDirectory.isDirectory()) continue;
        const workspaceLockDirectory = path.join(directory, workspaceDirectory.name);
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
      leaseHeartbeatMs
    };
  }

  return { acquire, tryAcquire, release, cancel, assertOwner, snapshot };
}
