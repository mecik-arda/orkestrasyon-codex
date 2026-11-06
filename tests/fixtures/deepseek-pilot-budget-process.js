import crypto from "node:crypto";
import fs from "node:fs";
import readline from "node:readline";
import path from "node:path";
import { createDeepSeekPilotBudget } from "../../subagent-bridge/src/services/deepseek-pilot-budget.js";
import { openKernelFileLock } from "../../subagent-bridge/src/services/kernel-file-lock.js";

const [mode, stateDirectory, ...argumentsList] = process.argv.slice(2);
const resolvedStateDirectory = path.resolve(stateDirectory);
const statePath = path.join(resolvedStateDirectory, "deepseek-pilot-budget.json");
const kernelLockPath = path.join(resolvedStateDirectory, "deepseek-pilot-budget.v2.lock");
const legacyLockPath = path.join(resolvedStateDirectory, "deepseek-pilot-budget.lock");

function send(value) {
  process.stdout.write(`${value}\n`);
}

function nextInputLine() {
  const reader = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  return new Promise((resolve) => reader.once("line", (line) => {
    reader.close();
    process.stdin.pause();
    process.stdin.destroy();
    resolve(line);
  }));
}

function createBudget(now = () => Date.now()) {
  return createDeepSeekPilotBudget({ stateDirectory: resolvedStateDirectory, limitUsd: 1, priorUsageReservationUsd: 0, now });
}

async function reserve() {
  const [executionId, amountUsdText, gated] = argumentsList;
  if (gated === "gated") {
    send("ready");
    const command = await nextInputLine();
    if (command !== "go") process.exit(64);
  }
  const originalOpen = fs.openSync;
  let legacyWaitReported = false;
  fs.openSync = (...openArguments) => {
    try {
      return originalOpen(...openArguments);
    } catch (error) {
      if (!legacyWaitReported && error.code === "EEXIST" && path.resolve(String(openArguments[0])) === legacyLockPath) {
        legacyWaitReported = true;
        send("legacy-waiting");
      }
      throw error;
    }
  };
  const result = await createBudget().reserve(executionId, Number(amountUsdText));
  process.stdin.destroy();
  send(JSON.stringify(result));
}

async function settle() {
  const [reservationId, amountUsdText, stage] = argumentsList;
  installCrashStage(stage);
  const amountUsd = amountUsdText === "null" ? null : Number(amountUsdText);
  const result = await createBudget().settle(reservationId, amountUsd);
  process.stdin.destroy();
  send(JSON.stringify(result));
}

function installCrashStage(stage) {
  if (stage !== "before-publish" && stage !== "after-publish") return;
  const originalRename = fs.renameSync;
  fs.renameSync = (sourcePath, destinationPath) => {
    if (path.resolve(destinationPath) === statePath && stage === "before-publish") {
      fs.writeSync(process.stdout.fd, "crash-before-publish\n");
      process.exit(71);
    }
    const result = originalRename(sourcePath, destinationPath);
    if (path.resolve(destinationPath) === statePath && stage === "after-publish") {
      fs.writeSync(process.stdout.fd, "crash-after-publish\n");
      process.exit(72);
    }
    return result;
  };
}

async function crashReserve() {
  const [executionId, amountUsdText, stage] = argumentsList;
  installCrashStage(stage);
  const result = await createBudget().reserve(executionId, Number(amountUsdText));
  process.stdin.destroy();
  send(JSON.stringify(result));
}

async function holdKernelLock() {
  const lock = openKernelFileLock(kernelLockPath);
  if (!lock) process.exit(65);
  send("kernel-locked");
  const command = await nextInputLine();
  if (command === "crash") process.exit(73);
  if (command !== "release") process.exit(66);
  if (!lock.release()) process.exit(67);
  send("kernel-released");
}

async function waitForKernelLock() {
  const deadline = Date.now() + 10000;
  let waitingReported = false;
  while (Date.now() < deadline) {
    const lock = openKernelFileLock(kernelLockPath);
    if (lock) {
      send("kernel-acquired");
      if (!lock.release()) process.exit(69);
      send("kernel-released");
      return;
    }
    if (!waitingReported) {
      waitingReported = true;
      send("kernel-waiting");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  process.exit(70);
}

async function holdLegacyLock() {
  fs.mkdirSync(resolvedStateDirectory, { recursive: true });
  const descriptor = fs.openSync(legacyLockPath, "wx");
  fs.writeFileSync(descriptor, JSON.stringify({ pid: process.pid, ownerId: crypto.randomUUID() }), "utf8");
  send("legacy-locked");
  const command = await nextInputLine();
  fs.closeSync(descriptor);
  fs.rmSync(legacyLockPath, { force: true });
  if (command !== "release") process.exit(68);
  send("legacy-released");
}

async function legacyReserve() {
  const [executionId, amountUsdText] = argumentsList;
  const descriptor = fs.openSync(legacyLockPath, "wx");
  try {
    const ledger = JSON.parse(fs.readFileSync(statePath, "utf8"));
    if (ledger.version !== 1) {
      send(JSON.stringify({ allowed: false, reason: "legacy_ledger_version_unsupported" }));
      return;
    }
    const amountUsd = Number(amountUsdText);
    const reservedUsd = ledger.reservations.reduce((total, item) => total + item.amountUsd, 0);
    if (ledger.settledUsd + reservedUsd + amountUsd > ledger.limitUsd) {
      send(JSON.stringify({ allowed: false, reason: "budget_exhausted" }));
      return;
    }
    ledger.reservations.push({
      id: crypto.randomUUID(),
      executionIdHash: crypto.createHash("sha256").update(executionId).digest("hex"),
      amountUsd,
      expiresAt: Date.now() + 1200000
    });
    const temporaryPath = `${statePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(ledger), { encoding: "utf8", flag: "wx" });
    fs.renameSync(temporaryPath, statePath);
    send(JSON.stringify({ allowed: true }));
  } finally {
    fs.closeSync(descriptor);
    fs.rmSync(legacyLockPath, { force: true });
  }
}

async function run() {
  if (mode === "reserve") return reserve();
  if (mode === "settle") return settle();
  if (mode === "crash-reserve") return crashReserve();
  if (mode === "hold-kernel") return holdKernelLock();
  if (mode === "wait-kernel") return waitForKernelLock();
  if (mode === "hold-legacy") return holdLegacyLock();
  if (mode === "legacy-reserve") return legacyReserve();
  process.exitCode = 64;
}

await run();
