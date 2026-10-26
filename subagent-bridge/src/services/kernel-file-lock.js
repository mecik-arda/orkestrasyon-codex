import fs from "node:fs";
import path from "node:path";
import { tryLock, unlock } from "fs-native-extensions";

export function lockOpenFileDescriptor(descriptor, { shared = false } = {}) {
  try {
    if (!tryLock(descriptor, 0, 0, { shared })) return null;
  } catch {
    return null;
  }

  let locked = true;
  let descriptorOpen = true;
  return {
    release() {
      if (locked) {
        try {
          unlock(descriptor, 0, 0);
          locked = false;
        } catch {
        }
      }
      if (descriptorOpen) {
        try {
          fs.closeSync(descriptor);
          descriptorOpen = false;
          locked = false;
        } catch {
          try {
            fs.closeSync(descriptor);
            descriptorOpen = false;
            locked = false;
          } catch {
          }
        }
      }
      return !locked && !descriptorOpen;
    },
    isOwner() {
      return locked;
    },
    descriptor
  };
}

export function openKernelFileLock(filePath, { shared = false } = {}) {
  let descriptor;
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    descriptor = fs.openSync(filePath, "a+");
    const lock = lockOpenFileDescriptor(descriptor, { shared });
    if (!lock) {
      fs.closeSync(descriptor);
      return null;
    }
    return lock;
  } catch {
    if (descriptor !== undefined) {
      try {
        fs.closeSync(descriptor);
      } catch {
      }
    }
    return null;
  }
}

export function withKernelFileLock(filePath, callback) {
  const lock = openKernelFileLock(filePath);
  if (!lock) return null;
  try {
    return callback();
  } finally {
    lock.release();
  }
}
