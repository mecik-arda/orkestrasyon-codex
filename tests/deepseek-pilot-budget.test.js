import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createDeepSeekPilotBudget } from "../subagent-bridge/src/services/deepseek-pilot-budget.js";

const processFixturePath = fileURLToPath(new URL("./fixtures/deepseek-pilot-budget-process.js", import.meta.url));
const testDirectory = path.dirname(fileURLToPath(import.meta.url));

function createTemporaryStateDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "deepseek-budget-ledger-"));
}

function ledgerPath(stateDirectory) {
  return path.join(stateDirectory, "deepseek-pilot-budget.json");
}

function readLedger(stateDirectory) {
  return JSON.parse(fs.readFileSync(ledgerPath(stateDirectory), "utf8"));
}

function writeLegacyLedger(stateDirectory, ledger) {
  fs.writeFileSync(ledgerPath(stateDirectory), JSON.stringify(ledger), "utf8");
}

function legacyReservation(id, amountUsd, expiresAt) {
  return {
    id,
    executionIdHash: crypto.createHash("sha256").update(id).digest("hex"),
    amountUsd,
    ...(expiresAt === undefined ? {} : { expiresAt })
  };
}

function startFixtureProcess(context, stateDirectory, mode, ...argumentsList) {
  const environment = Object.fromEntries(Object.entries({
    PATH: process.env.Path || process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    WINDIR: process.env.WINDIR,
    ComSpec: process.env.ComSpec,
    PATHEXT: process.env.PATHEXT,
    TEMP: os.tmpdir(),
    TMP: os.tmpdir()
  }).filter(([, value]) => typeof value === "string"));
  const child = spawn(process.execPath, [processFixturePath, mode, stateDirectory, ...argumentsList], {
    cwd: path.resolve(testDirectory, ".."),
    env: environment,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"]
  });
  let buffer = "";
  let stderr = "";
  const lines = [];
  const waiters = [];
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    while (buffer.includes("\n")) {
      const separator = buffer.indexOf("\n");
      const line = buffer.slice(0, separator).replace(/\r$/, "");
      buffer = buffer.slice(separator + 1);
      const waiter = waiters.shift();
      if (waiter) waiter.resolve(line);
      else lines.push(line);
    }
  });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const exit = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
  child.once("close", (code, signal) => {
    const reason = `fixture process exited before synchronization: code=${code} signal=${signal} stderr=${stderr}`;
    for (const waiter of waiters.splice(0)) waiter.reject(new Error(reason));
  });
  context.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill();
    if (child.exitCode === null && child.signalCode === null) await exit;
  });
  return {
    child,
    exit,
    get stderr() { return stderr; },
    nextLine(timeoutMs = 10000) {
      if (lines.length > 0) return Promise.resolve(lines.shift());
      return new Promise((resolve, reject) => {
        const waiter = {
          resolve(line) {
            clearTimeout(timer);
            resolve(line);
          },
          reject(error) {
            clearTimeout(timer);
            reject(error);
          }
        };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error("fixture process did not produce the expected synchronization event"));
        }, timeoutMs);
        waiters.push(waiter);
      });
    },
    send(line) { child.stdin.write(`${line}\n`); }
  };
}

test("süresi geçen aktif rezervasyon yalnız zamana dayanarak bütçeyi serbest bırakmaz", async (context) => {
  const stateDirectory = createTemporaryStateDirectory();
  context.after(() => fs.rmSync(stateDirectory, { recursive: true, force: true }));
  let now = 1000;
  const budget = createDeepSeekPilotBudget({ stateDirectory, limitUsd: 1, priorUsageReservationUsd: 0, now: () => now });
  const first = await budget.reserve("unknown-first", 0.7);
  assert.equal(first.allowed, true);
  now += 1200001;
  const snapshot = await budget.snapshot();
  assert.equal(snapshot.activeReservedUsd, 0.7);
  assert.equal(snapshot.unknownReservedUsd, 0);
  assert.equal(snapshot.availableUsd, 0.3);
  const second = await budget.reserve("second", 0.4);
  assert.equal(second.allowed, false);
  assert.equal(second.reason, "budget_exhausted");
});

test("bilinmeyen settlement kalıcı tutar ve geçerli geç settlement ile uzlaşır", async (context) => {
  const stateDirectory = createTemporaryStateDirectory();
  context.after(() => fs.rmSync(stateDirectory, { recursive: true, force: true }));
  let now = 5000;
  const budget = createDeepSeekPilotBudget({ stateDirectory, limitUsd: 1, priorUsageReservationUsd: 0, now: () => now });
  const reservation = await budget.reserve("unknown-then-late-usage", 0.65);
  const unknownSettlement = await budget.settle(reservation.reservationId, null);
  assert.equal(unknownSettlement.settled, true);
  assert.equal(unknownSettlement.unknown, true);
  assert.equal(unknownSettlement.chargedUsd, null);
  now += 1200001;
  const afterExpiry = await budget.snapshot();
  assert.equal(afterExpiry.unknownReservedUsd, 0.65);
  assert.equal(afterExpiry.availableUsd, 0.35);
  assert.equal((await budget.reserve("blocked", 0.4)).allowed, false);
  const lateSettlement = await budget.settle(reservation.reservationId, 0.2);
  assert.equal(lateSettlement.settled, true);
  assert.equal(lateSettlement.chargedUsd, 0.2);
  assert.equal(lateSettlement.overBudget, false);
  const beforeReplay = await budget.snapshot();
  const replay = await budget.settle(reservation.reservationId, 0.2);
  const afterReplay = await budget.snapshot();
  assert.equal(replay.settled, false);
  assert.equal(replay.reason, "reservation_not_found");
  assert.deepEqual(afterReplay, beforeReplay);
  assert.equal(afterReplay.usagePricedUsd, 0.2);
  assert.equal(afterReplay.unknownReservedUsd, 0);
});

test("geçersiz settlement defter baytlarını ve admission durumunu değiştirmez", async (context) => {
  const stateDirectory = createTemporaryStateDirectory();
  context.after(() => fs.rmSync(stateDirectory, { recursive: true, force: true }));
  const budget = createDeepSeekPilotBudget({ stateDirectory, limitUsd: 1, priorUsageReservationUsd: 0 });
  const reservation = await budget.reserve("invalid-settlement", 0.4);
  const beforeBytes = fs.readFileSync(ledgerPath(stateDirectory));
  await assert.rejects(budget.settle(reservation.reservationId, -0.01), /settlement is invalid/);
  await assert.rejects(budget.settle(reservation.reservationId, Number.NaN), /settlement is invalid/);
  assert.deepEqual(fs.readFileSync(ledgerPath(stateDirectory)), beforeBytes);
  const snapshot = await budget.snapshot();
  assert.equal(snapshot.activeReservedUsd, 0.4);
  assert.equal(snapshot.availableUsd, 0.6);
});

test("bilinmeyen settlement tekrarı ikinci kez yazmadan aynı belirsiz rezervasyonu korur", async (context) => {
  const stateDirectory = createTemporaryStateDirectory();
  context.after(() => fs.rmSync(stateDirectory, { recursive: true, force: true }));
  const budget = createDeepSeekPilotBudget({ stateDirectory, limitUsd: 1, priorUsageReservationUsd: 0 });
  const reservation = await budget.reserve("unknown-repeat", 0.3);
  await budget.settle(reservation.reservationId, null);
  const beforeBytes = fs.readFileSync(ledgerPath(stateDirectory));
  const repeat = await budget.settle(reservation.reservationId, null);
  assert.equal(repeat.duplicate, true);
  assert.deepEqual(fs.readFileSync(ledgerPath(stateDirectory)), beforeBytes);
  assert.equal((await budget.snapshot()).unknownReservedUsd, 0.3);
});

test("settled reservation replay does not write or charge the ledger again", async (context) => {
  const stateDirectory = createTemporaryStateDirectory();
  context.after(() => fs.rmSync(stateDirectory, { recursive: true, force: true }));
  const budget = createDeepSeekPilotBudget({ stateDirectory, limitUsd: 1, priorUsageReservationUsd: 0 });
  const reservation = await budget.reserve("known-repeat", 0.3);
  await budget.settle(reservation.reservationId, 0.12);
  const beforeBytes = fs.readFileSync(ledgerPath(stateDirectory));
  const replay = await budget.settle(reservation.reservationId, 0.12);
  assert.equal(replay.settled, false);
  assert.deepEqual(fs.readFileSync(ledgerPath(stateDirectory)), beforeBytes);
  assert.equal((await budget.snapshot()).usagePricedUsd, 0.12);
});

test("snapshot v1 defterini değiştirmeden geçmiş harcamayı belirsiz ve koruyucu sayar", async (context) => {
  const stateDirectory = createTemporaryStateDirectory();
  context.after(() => fs.rmSync(stateDirectory, { recursive: true, force: true }));
  const now = 2000000;
  writeLegacyLedger(stateDirectory, {
    version: 1,
    limitUsd: 1,
    settledUsd: 0.15,
    reservations: [
      legacyReservation("active-v1", 0.4, now + 1000),
      legacyReservation("expired-v1", 0.3, now - 1),
      legacyReservation("unbounded-v1", 0.1)
    ]
  });
  const beforeBytes = fs.readFileSync(ledgerPath(stateDirectory));
  const budget = createDeepSeekPilotBudget({ stateDirectory, limitUsd: 1, priorUsageReservationUsd: 0, now: () => now });
  const snapshot = await budget.snapshot();
  assert.equal(snapshot.legacyUnclassifiedUsd, 0.15);
  assert.equal(snapshot.usagePricedUsd, 0);
  assert.equal(snapshot.activeReservedUsd, 0.4);
  assert.equal(snapshot.unknownReservedUsd, 0.4);
  assert.equal(snapshot.availableUsd, 0.05);
  assert.deepEqual(fs.readFileSync(ledgerPath(stateDirectory)), beforeBytes);
});

test("v1 migration preserves settled and expired reservations before admission", async (context) => {
  const stateDirectory = createTemporaryStateDirectory();
  context.after(() => fs.rmSync(stateDirectory, { recursive: true, force: true }));
  const now = 4000000;
  writeLegacyLedger(stateDirectory, {
    version: 1,
    limitUsd: 1,
    settledUsd: 0.15,
    reservations: [
      legacyReservation("active-v1", 0.4, now + 1000),
      legacyReservation("expired-v1", 0.3, now - 1)
    ]
  });
  const budget = createDeepSeekPilotBudget({ stateDirectory, limitUsd: 1, priorUsageReservationUsd: 0, now: () => now });
  const next = await budget.reserve("next", 0.2);
  assert.equal(next.allowed, false);
  const ledger = readLedger(stateDirectory);
  assert.equal(ledger.version, 2);
  assert.equal(ledger.legacyAccountedNanoUsd, 150000000);
  assert.equal(ledger.usagePricedNanoUsd, 0);
  assert.equal(ledger.reservations.length, 2);
  assert.equal(ledger.reservations.find((entry) => entry.id === "expired-v1").status, "unknown");
});

test("bozuk legacy reservation sessizce silinmez veya yeni bütçe açmaz", async (context) => {
  const stateDirectory = createTemporaryStateDirectory();
  context.after(() => fs.rmSync(stateDirectory, { recursive: true, force: true }));
  writeLegacyLedger(stateDirectory, {
    version: 1,
    limitUsd: 1,
    settledUsd: 0.1,
    reservations: [legacyReservation("bad", 0.3, 100), { id: "missing-hash", amountUsd: 0.2, expiresAt: 1 }]
  });
  const beforeBytes = fs.readFileSync(ledgerPath(stateDirectory));
  const budget = createDeepSeekPilotBudget({ stateDirectory, limitUsd: 1, priorUsageReservationUsd: 0 });
  await assert.rejects(budget.reserve("new", 0.1), /invalid or requires operator review/);
  assert.deepEqual(fs.readFileSync(ledgerPath(stateDirectory)), beforeBytes);
});

test("limit mismatch and unsupported ledger version fail closed without rewriting state", async (context) => {
  const stateDirectory = createTemporaryStateDirectory();
  context.after(() => fs.rmSync(stateDirectory, { recursive: true, force: true }));
  writeLegacyLedger(stateDirectory, { version: 1, limitUsd: 0.5, settledUsd: 0.1, reservations: [] });
  const beforeBytes = fs.readFileSync(ledgerPath(stateDirectory));
  const wrongLimit = createDeepSeekPilotBudget({ stateDirectory, limitUsd: 1, priorUsageReservationUsd: 0 });
  await assert.rejects(wrongLimit.snapshot(), /invalid or requires operator review/);
  assert.deepEqual(fs.readFileSync(ledgerPath(stateDirectory)), beforeBytes);
  fs.writeFileSync(ledgerPath(stateDirectory), JSON.stringify({ version: 99, limitUsd: 1, settledUsd: 0, reservations: [] }), "utf8");
  const unsupported = createDeepSeekPilotBudget({ stateDirectory, limitUsd: 1, priorUsageReservationUsd: 0 });
  await assert.rejects(unsupported.reserve("new", 0.1), /invalid or requires operator review/);
});

test("v2 active reservation lifecycle fields fail closed when incomplete or inconsistent", async (context) => {
  const stateDirectory = createTemporaryStateDirectory();
  context.after(() => fs.rmSync(stateDirectory, { recursive: true, force: true }));
  const budget = createDeepSeekPilotBudget({ stateDirectory, limitUsd: 1, priorUsageReservationUsd: 0 });
  await budget.reserve("valid", 0.2);
  const validLedger = readLedger(stateDirectory);
  const invalidLedger = structuredClone(validLedger);
  invalidLedger.reservations[0].expiresAtMs = invalidLedger.reservations[0].createdAtMs;
  writeLegacyLedger(stateDirectory, invalidLedger);
  const invalidBytes = fs.readFileSync(ledgerPath(stateDirectory));
  await assert.rejects(budget.snapshot(), /invalid or requires operator review/);
  assert.deepEqual(fs.readFileSync(ledgerPath(stateDirectory)), invalidBytes);
});

test("snapshot başlangıç prior reservation değerini ve kullanım fiyatlı tutarı ayırır", async (context) => {
  const stateDirectory = createTemporaryStateDirectory();
  context.after(() => fs.rmSync(stateDirectory, { recursive: true, force: true }));
  const budget = createDeepSeekPilotBudget({ stateDirectory, limitUsd: 1, priorUsageReservationUsd: 0.0000189 });
  const initial = await budget.snapshot();
  assert.equal(initial.legacyUnclassifiedUsd, 0.0000189);
  assert.equal(initial.usagePricedUsd, 0);
  const reservation = await budget.reserve("usage", 0.3);
  await budget.settle(reservation.reservationId, 0.0000015);
  const settled = await budget.snapshot();
  assert.equal(settled.legacyUnclassifiedUsd, 0.0000189);
  assert.equal(settled.usagePricedUsd, 0.0000015);
  assert.equal(settled.accountedUsd, 0.0000204);
});

test("ayrı Node süreçleri aynı bütçe tavanını aşan rezervasyonları seri biçimde reddeder", async (context) => {
  const stateDirectory = createTemporaryStateDirectory();
  context.after(() => fs.rmSync(stateDirectory, { recursive: true, force: true }));
  const first = startFixtureProcess(context, stateDirectory, "reserve", "process-one", "0.6", "gated");
  const second = startFixtureProcess(context, stateDirectory, "reserve", "process-two", "0.6", "gated");
  assert.equal(await first.nextLine(), "ready");
  assert.equal(await second.nextLine(), "ready");
  first.send("go");
  second.send("go");
  const firstResult = JSON.parse(await first.nextLine());
  const secondResult = JSON.parse(await second.nextLine());
  assert.equal((await first.exit).code, 0, first.stderr);
  assert.equal((await second.exit).code, 0, second.stderr);
  const results = [firstResult, secondResult];
  assert.equal(results.filter((result) => result.allowed).length, 1);
  assert.equal(results.filter((result) => result.reason === "budget_exhausted").length, 1);
  const budget = createDeepSeekPilotBudget({ stateDirectory, limitUsd: 1, priorUsageReservationUsd: 0 });
  assert.equal((await budget.snapshot()).reservedUsd, 0.6);
});

test("kernel kilidi eski mtime ile bozulmaz ve sahibinin çöküşünden sonra serbest kalır", async (context) => {
  const stateDirectory = createTemporaryStateDirectory();
  context.after(() => fs.rmSync(stateDirectory, { recursive: true, force: true }));
  const holder = startFixtureProcess(context, stateDirectory, "hold-kernel");
  assert.equal(await holder.nextLine(), "kernel-locked");
  const lockPath = path.join(stateDirectory, "deepseek-pilot-budget.v2.lock");
  const oldTimestamp = new Date(0);
  fs.utimesSync(lockPath, oldTimestamp, oldTimestamp);
  const beforeStat = fs.statSync(lockPath);
  const contender = startFixtureProcess(context, stateDirectory, "wait-kernel");
  assert.equal(await contender.nextLine(), "kernel-waiting");
  assert.equal(fs.existsSync(lockPath), true);
  const afterStat = fs.statSync(lockPath);
  assert.equal(afterStat.ino, beforeStat.ino);
  assert.equal(afterStat.mtimeMs, 0);
  holder.send("crash");
  assert.equal((await holder.exit).code, 73, holder.stderr);
  assert.equal(await contender.nextLine(), "kernel-acquired");
  assert.equal(await contender.nextLine(), "kernel-released");
  assert.equal((await contender.exit).code, 0, contender.stderr);
  const budget = createDeepSeekPilotBudget({ stateDirectory, limitUsd: 1, priorUsageReservationUsd: 0 });
  assert.equal((await budget.reserve("after-kernel-owner-crash", 0.4)).allowed, true);
});

test("v1 kilit sahibi sürerken migrasyon stale kilidi silmez ve v2 yazıcısı eski protokolü kapatır", async (context) => {
  const stateDirectory = createTemporaryStateDirectory();
  context.after(() => fs.rmSync(stateDirectory, { recursive: true, force: true }));
  writeLegacyLedger(stateDirectory, {
    version: 1,
    limitUsd: 1,
    settledUsd: 0,
    reservations: [legacyReservation("legacy-held", 0.7, 0)]
  });
  const holder = startFixtureProcess(context, stateDirectory, "hold-legacy");
  assert.equal(await holder.nextLine(), "legacy-locked");
  const lockPath = path.join(stateDirectory, "deepseek-pilot-budget.lock");
  const oldTimestamp = new Date(0);
  fs.utimesSync(lockPath, oldTimestamp, oldTimestamp);
  const migration = startFixtureProcess(context, stateDirectory, "reserve", "new-writer", "0.4", "gated");
  assert.equal(await migration.nextLine(), "ready");
  migration.send("go");
  assert.equal(await migration.nextLine(), "legacy-waiting");
  assert.equal(fs.existsSync(lockPath), true);
  assert.equal(fs.statSync(lockPath).mtimeMs, 0);
  holder.send("release");
  assert.equal(await holder.nextLine(), "legacy-released");
  assert.equal((await holder.exit).code, 0, holder.stderr);
  const result = JSON.parse(await migration.nextLine());
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "budget_exhausted");
  assert.equal((await migration.exit).code, 0, migration.stderr);
  const migrated = readLedger(stateDirectory);
  assert.equal(migrated.version, 2);
  assert.equal(migrated.reservations.length, 1);
  assert.equal(migrated.reservations[0].status, "unknown");
  const beforeLegacyReplay = fs.readFileSync(ledgerPath(stateDirectory));
  const legacy = startFixtureProcess(context, stateDirectory, "legacy-reserve", "old-writer", "0.1");
  const legacyResult = JSON.parse(await legacy.nextLine());
  assert.equal(legacyResult.allowed, false);
  assert.equal(legacyResult.reason, "legacy_ledger_version_unsupported");
  assert.equal((await legacy.exit).code, 0, legacy.stderr);
  assert.deepEqual(fs.readFileSync(ledgerPath(stateDirectory)), beforeLegacyReplay);
});

test("yarım legacy lock kaydı migrasyonu fail-closed durdurur ve dosyayı korur", async (context) => {
  const stateDirectory = createTemporaryStateDirectory();
  context.after(() => fs.rmSync(stateDirectory, { recursive: true, force: true }));
  writeLegacyLedger(stateDirectory, { version: 1, limitUsd: 1, settledUsd: 0.1, reservations: [] });
  const beforeBytes = fs.readFileSync(ledgerPath(stateDirectory));
  const legacyLockPath = path.join(stateDirectory, "deepseek-pilot-budget.lock");
  fs.writeFileSync(legacyLockPath, "", "utf8");
  const budget = createDeepSeekPilotBudget({ stateDirectory, limitUsd: 1, priorUsageReservationUsd: 0 });
  await assert.rejects(budget.reserve("blocked-by-partial-legacy-lock", 0.1), /active or requires operator review/);
  assert.equal(fs.existsSync(legacyLockPath), true);
  assert.deepEqual(fs.readFileSync(ledgerPath(stateDirectory)), beforeBytes);
});

test("legacy migration descriptor close failure preserves the exclusion file", async (context) => {
  const stateDirectory = createTemporaryStateDirectory();
  context.after(() => fs.rmSync(stateDirectory, { recursive: true, force: true }));
  writeLegacyLedger(stateDirectory, { version: 1, limitUsd: 1, settledUsd: 0.1, reservations: [] });
  const beforeBytes = fs.readFileSync(ledgerPath(stateDirectory));
  const legacyLockPath = path.join(stateDirectory, "deepseek-pilot-budget.lock");
  const originalOpen = fs.openSync;
  const originalClose = fs.closeSync;
  let legacyLockDescriptor = null;
  fs.openSync = (filePath, ...argumentsList) => {
    const descriptor = originalOpen(filePath, ...argumentsList);
    if (path.resolve(String(filePath)) === legacyLockPath) legacyLockDescriptor = descriptor;
    return descriptor;
  };
  fs.closeSync = (descriptor) => {
    if (descriptor === legacyLockDescriptor) {
      originalClose(descriptor);
      const error = new Error("synthetic descriptor close failure");
      error.code = "EIO";
      throw error;
    }
    return originalClose(descriptor);
  };
  const budget = createDeepSeekPilotBudget({ stateDirectory, limitUsd: 1, priorUsageReservationUsd: 0 });
  try {
    await assert.rejects(budget.reserve("close-failure", 0.1), /migration lock release is uncertain/);
  } finally {
    fs.openSync = originalOpen;
    fs.closeSync = originalClose;
  }
  assert.equal(fs.existsSync(legacyLockPath), true);
  const migratedLedger = readLedger(stateDirectory);
  assert.equal(migratedLedger.version, 2);
  assert.equal(migratedLedger.legacyAccountedNanoUsd, 100000000);
  assert.equal((await budget.snapshot()).activeReservedUsd, 0.1);
});

test("crash öncesi ve sonrası atomik yayın yeni süreçte mevcut defteri korur", async (context) => {
  const beforeDirectory = createTemporaryStateDirectory();
  const afterDirectory = createTemporaryStateDirectory();
  context.after(() => fs.rmSync(beforeDirectory, { recursive: true, force: true }));
  context.after(() => fs.rmSync(afterDirectory, { recursive: true, force: true }));
  const beforeBudget = createDeepSeekPilotBudget({ stateDirectory: beforeDirectory, limitUsd: 1, priorUsageReservationUsd: 0 });
  const original = await beforeBudget.reserve("before-existing", 0.2);
  const beforeCrash = startFixtureProcess(context, beforeDirectory, "crash-reserve", "before-crash", "0.3", "before-publish");
  assert.equal(await beforeCrash.nextLine(), "crash-before-publish");
  assert.equal((await beforeCrash.exit).code, 71, beforeCrash.stderr);
  const beforeSnapshot = await beforeBudget.snapshot();
  assert.equal(beforeSnapshot.activeReservedUsd, 0.2);
  assert.equal(beforeSnapshot.unknownReservedUsd, 0);
  assert.equal(fs.readdirSync(beforeDirectory).some((name) => name.endsWith(".tmp")), true);
  assert.equal((await beforeBudget.settle(original.reservationId, 0.1)).settled, true);

  const afterBudget = createDeepSeekPilotBudget({ stateDirectory: afterDirectory, limitUsd: 1, priorUsageReservationUsd: 0 });
  await afterBudget.reserve("after-existing", 0.2);
  const afterCrash = startFixtureProcess(context, afterDirectory, "crash-reserve", "published-before-response", "0.3", "after-publish");
  assert.equal(await afterCrash.nextLine(), "crash-after-publish");
  assert.equal((await afterCrash.exit).code, 72, afterCrash.stderr);
  const afterSnapshot = await afterBudget.snapshot();
  assert.equal(afterSnapshot.activeReservedUsd, 0.5);
  assert.equal(afterSnapshot.availableUsd, 0.5);
});

test("settlement yayınlanmadan çöküş rezervasyonu korur, yayın sonrası çöküşü yeni süreç uzlaştırır", async (context) => {
  const beforeDirectory = createTemporaryStateDirectory();
  const afterDirectory = createTemporaryStateDirectory();
  context.after(() => fs.rmSync(beforeDirectory, { recursive: true, force: true }));
  context.after(() => fs.rmSync(afterDirectory, { recursive: true, force: true }));
  const beforeBudget = createDeepSeekPilotBudget({ stateDirectory: beforeDirectory, limitUsd: 1, priorUsageReservationUsd: 0 });
  const beforeReservation = await beforeBudget.reserve("settlement-before", 0.3);
  const beforeCrash = startFixtureProcess(context, beforeDirectory, "settle", beforeReservation.reservationId, "0.12", "before-publish");
  assert.equal(await beforeCrash.nextLine(), "crash-before-publish");
  assert.equal((await beforeCrash.exit).code, 71, beforeCrash.stderr);
  const beforeSnapshot = await beforeBudget.snapshot();
  assert.equal(beforeSnapshot.activeReservedUsd, 0.3);
  assert.equal(beforeSnapshot.usagePricedUsd, 0);

  const afterBudget = createDeepSeekPilotBudget({ stateDirectory: afterDirectory, limitUsd: 1, priorUsageReservationUsd: 0 });
  const afterReservation = await afterBudget.reserve("settlement-after", 0.3);
  const afterCrash = startFixtureProcess(context, afterDirectory, "settle", afterReservation.reservationId, "0.12", "after-publish");
  assert.equal(await afterCrash.nextLine(), "crash-after-publish");
  assert.equal((await afterCrash.exit).code, 72, afterCrash.stderr);
  const afterSnapshot = await afterBudget.snapshot();
  assert.equal(afterSnapshot.activeReservedUsd, 0);
  assert.equal(afterSnapshot.usagePricedUsd, 0.12);
  const replay = await afterBudget.settle(afterReservation.reservationId, 0.12);
  assert.equal(replay.settled, false);
  assert.deepEqual(await afterBudget.snapshot(), afterSnapshot);
});
