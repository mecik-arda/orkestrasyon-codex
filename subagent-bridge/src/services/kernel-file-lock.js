import fs from "node:fs";
import path from "node:path";
import { tryLock, unlock } from "fs-native-extensions";

const unresolvedLockReleases = new Set();

export function kernelLockAcquisitionAvailable() {
  return unresolvedLockReleases.size === 0;
}

export function closeKernelFileDescriptor(descriptor, owner = { descriptor }) {
  try {
    fs.closeSync(descriptor);
    return true;
  } catch {
    unresolvedLockReleases.add(owner);
    return false;
  }
}

export function lockOpenFileDescriptor(descriptor, { shared = false } = {}) {
  try {
    if (!tryLock(descriptor, 0, 0, { shared })) return null;
  } catch {
    return null;
  }

  let releaseState = "held";
  return {
    release() {
      if (releaseState === "released") return true;
      if (releaseState === "uncertain") return false;
      try {
        unlock(descriptor, 0, 0);
      } catch {
      }
      if (!closeKernelFileDescriptor(descriptor, this)) {
        releaseState = "uncertain";
        return false;
      }
      releaseState = "released";
      return true;
    },
    isOwner() {
      return releaseState === "held";
    },
    descriptor
  };
}

export function openKernelFileLock(filePath, { shared = false } = {}) {
  if (unresolvedLockReleases.size > 0) return null;
  let descriptor;
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    descriptor = fs.openSync(filePath, "a+");
    const lock = lockOpenFileDescriptor(descriptor, { shared });
    if (!lock) {
      closeKernelFileDescriptor(descriptor);
      return null;
    }
    return lock;
  } catch {
    if (descriptor !== undefined) {
      closeKernelFileDescriptor(descriptor);
    }
    return null;
  }
}

export function withKernelFileLock(filePath, callback) {
  const lock = openKernelFileLock(filePath);
  if (!lock) return null;
  try {
    const result = callback();
    if (!lock.release()) {
      if (typeof result?.release === "function") result.release();
      return null;
    }
    return result;
  } finally {
    if (lock.isOwner()) lock.release();
  }
}
