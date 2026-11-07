import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { openKernelFileLock } from "../../subagent-bridge/src/services/kernel-file-lock.js";
import { prepareCodexProjectConfiguration, publishCodexProjectConfiguration } from "../../scripts/codex-project-config.js";

const [mode, projectRoot, fault = "none"] = process.argv.slice(2);
const resolvedRoot = path.resolve(projectRoot);
const configPath = path.join(resolvedRoot, ".codex", "config.toml");
const lockPath = path.join(resolvedRoot, ".codex", "config.toml.lock");
const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

function send(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function readCommand() {
  return new Promise((resolve) => input.once("line", resolve));
}

function failWithCode() {
  const error = new Error("synthetic filesystem failure");
  error.code = "EIO";
  throw error;
}

function installFault() {
  if (fault === "write-close") {
    const originalWrite = fs.writeFileSync;
    const originalClose = fs.closeSync;
    let temporaryDescriptor = null;
    fs.writeFileSync = (target, ...argumentsList) => {
      if (typeof target === "number") {
        temporaryDescriptor = target;
        failWithCode();
      }
      return originalWrite(target, ...argumentsList);
    };
    fs.closeSync = (descriptor) => {
      if (descriptor === temporaryDescriptor) {
        originalClose(descriptor);
        failWithCode();
      }
      return originalClose(descriptor);
    };
    return;
  }
  if (fault === "write") {
    const original = fs.writeFileSync;
    let injected = false;
    fs.writeFileSync = (...argumentsList) => {
      if (!injected && typeof argumentsList[0] === "number") {
        injected = true;
        failWithCode();
      }
      return original(...argumentsList);
    };
    return;
  }
  if (fault === "fsync") {
    const original = fs.fsyncSync;
    let injected = false;
    fs.fsyncSync = (...argumentsList) => {
      if (!injected) {
        injected = true;
        failWithCode();
      }
      return original(...argumentsList);
    };
    return;
  }
  if (fault === "temporary-close") {
    const original = fs.closeSync;
    let injected = false;
    fs.closeSync = (descriptor) => {
      if (!injected) {
        injected = true;
        original(descriptor);
        failWithCode();
      }
      return original(descriptor);
    };
    return;
  }
  if (fault === "backup-open") {
    const original = fs.openSync;
    fs.openSync = (filePath, ...argumentsList) => {
      if (String(filePath).endsWith(".bak")) failWithCode();
      return original(filePath, ...argumentsList);
    };
    return;
  }
  if (["backup-write", "backup-close"].includes(fault)) {
    const originalOpen = fs.openSync;
    let backupDescriptor = null;
    fs.openSync = (filePath, ...argumentsList) => {
      const descriptor = originalOpen(filePath, ...argumentsList);
      if (String(filePath).endsWith(".bak")) backupDescriptor = descriptor;
      return descriptor;
    };
    if (fault === "backup-write") {
      const originalWrite = fs.writeFileSync;
      fs.writeFileSync = (target, ...argumentsList) => {
        if (target === backupDescriptor) failWithCode();
        return originalWrite(target, ...argumentsList);
      };
    } else {
      const originalClose = fs.closeSync;
      fs.closeSync = (descriptor) => {
        if (descriptor === backupDescriptor) {
          originalClose(descriptor);
          failWithCode();
        }
        return originalClose(descriptor);
      };
    }
    return;
  }
  if (fault === "backup-verify") {
    const original = fs.readFileSync;
    fs.readFileSync = (filePath, ...argumentsList) => String(filePath).endsWith(".bak")
      ? Buffer.from("synthetic backup verification mismatch")
      : original(filePath, ...argumentsList);
    return;
  }
  if (fault === "rename-before" || fault === "crash-before-rename" || fault === "crash-after-rename") {
    const original = fs.renameSync;
    fs.renameSync = (sourcePath, destinationPath) => {
      if (path.resolve(destinationPath) !== configPath) return original(sourcePath, destinationPath);
      if (fault === "crash-before-rename") {
        fs.writeSync(process.stdout.fd, `${JSON.stringify({ event: "crash_before_rename" })}\n`);
        process.exit(71);
      }
      if (fault === "rename-before") failWithCode();
      const result = original(sourcePath, destinationPath);
      if (fault === "crash-after-rename") {
        fs.writeSync(process.stdout.fd, `${JSON.stringify({ event: "crash_after_rename" })}\n`);
        process.exit(72);
      }
      return result;
    };
    return;
  }
  if (fault === "link-cleanup") {
    const original = fs.unlinkSync;
    fs.unlinkSync = (filePath, ...argumentsList) => {
      if (String(filePath).startsWith(`${configPath}.`) && String(filePath).endsWith(".tmp")) failWithCode();
      return original(filePath, ...argumentsList);
    };
    return;
  }
  if (fault === "lock-release") {
    const originalOpen = fs.openSync;
    let lockDescriptor = null;
    fs.openSync = (filePath, ...argumentsList) => {
      const descriptor = originalOpen(filePath, ...argumentsList);
      if (path.resolve(String(filePath)) === lockPath) lockDescriptor = descriptor;
      return descriptor;
    };
    const originalClose = fs.closeSync;
    let injected = false;
    fs.closeSync = (descriptor) => {
      if (!injected && descriptor === lockDescriptor) {
        injected = true;
        originalClose(descriptor);
        failWithCode();
      }
      return originalClose(descriptor);
    };
  }
}

async function runPublish() {
  const plan = prepareCodexProjectConfiguration(resolvedRoot);
  send({ event: "planned", noOp: plan.originalBytes.equals(plan.nextBytes), originalHash: plan.originalHash });
  if (await readCommand() !== "publish") process.exit(64);
  installFault();
  send({ event: "publishing" });
  try {
    const result = await publishCodexProjectConfiguration(plan);
    send({ event: "result", result });
  } catch (error) {
    send({
      event: "error",
      publicCode: error.publicCode || "configuration_update_failed",
      failureStage: error.failureStage || "unknown",
      publicationState: error.publicationState || "not_published",
      cleanupStatus: error.cleanupStatus || "not_needed",
      backupStatus: error.backupStatus || "not_created",
      lockStatus: error.lockStatus || "not_observed"
    });
  }
  input.close();
}

async function runHoldLock() {
  const lock = openKernelFileLock(lockPath);
  if (!lock) process.exit(65);
  send({ event: "lock_held" });
  if (await readCommand() !== "release") process.exit(66);
  if (!lock.release()) process.exit(67);
  send({ event: "lock_released" });
  input.close();
}

if (mode === "publish") await runPublish();
else if (mode === "hold-lock") await runHoldLock();
else process.exitCode = 64;
