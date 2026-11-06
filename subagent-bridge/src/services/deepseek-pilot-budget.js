import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { openKernelFileLock } from "./kernel-file-lock.js";

const currentLedgerVersion = 2;
const legacyLedgerVersion = 1;
const moneyScale = 1000000000;
const reservationTtlMs = 1200000;
const lockWaitTimeoutMs = 5000;
const lockPollIntervalMs = 10;
const validHashPattern = /^[a-f0-9]{64}$/;

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function toNanoUsdCeiling(amountUsd) {
  if (!Number.isFinite(amountUsd) || amountUsd < 0) throw new Error("DeepSeek pilot budget amount is invalid");
  const nanoUsd = Math.ceil(amountUsd * moneyScale);
  if (!Number.isSafeInteger(nanoUsd)) throw new Error("DeepSeek pilot budget amount is outside the supported range");
  return nanoUsd;
}

function toNanoUsdFloor(amountUsd) {
  if (!Number.isFinite(amountUsd) || amountUsd < 0) throw new Error("DeepSeek pilot budget limit is invalid");
  const nanoUsd = Math.floor(amountUsd * moneyScale);
  if (!Number.isSafeInteger(nanoUsd)) throw new Error("DeepSeek pilot budget limit is outside the supported range");
  return nanoUsd;
}

function fromNanoUsd(nanoUsd) {
  return nanoUsd / moneyScale;
}

function exactKeys(value, expectedKeys) {
  const keys = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

function validCurrentReservation(reservation) {
  const validShape = reservation !== null
    && typeof reservation === "object"
    && exactKeys(reservation, ["id", "executionIdHash", "amountNanoUsd", "createdAtMs", "expiresAtMs", "status"])
    && typeof reservation.id === "string"
    && reservation.id.length > 0
    && typeof reservation.executionIdHash === "string"
    && validHashPattern.test(reservation.executionIdHash)
    && Number.isSafeInteger(reservation.amountNanoUsd)
    && reservation.amountNanoUsd > 0
    && (reservation.createdAtMs === null || (Number.isSafeInteger(reservation.createdAtMs) && reservation.createdAtMs >= 0))
    && (reservation.expiresAtMs === null || (Number.isSafeInteger(reservation.expiresAtMs) && reservation.expiresAtMs >= 0))
    && ["active", "unknown"].includes(reservation.status);
  if (!validShape) return false;
  if (reservation.status === "active") {
    return Number.isSafeInteger(reservation.expiresAtMs)
      && (reservation.createdAtMs === null || reservation.expiresAtMs > reservation.createdAtMs);
  }
  return reservation.createdAtMs === null
    || reservation.expiresAtMs === null
    || reservation.expiresAtMs > reservation.createdAtMs;
}

function validCurrentLedger(value, limitNanoUsd) {
  if (value === null || typeof value !== "object"
    || !exactKeys(value, ["version", "limitNanoUsd", "legacyAccountedNanoUsd", "usagePricedNanoUsd", "reservations"])
    || value.version !== currentLedgerVersion
    || value.limitNanoUsd !== limitNanoUsd
    || !Number.isSafeInteger(value.legacyAccountedNanoUsd)
    || value.legacyAccountedNanoUsd < 0
    || !Number.isSafeInteger(value.usagePricedNanoUsd)
    || value.usagePricedNanoUsd < 0
    || !Array.isArray(value.reservations)
    || !value.reservations.every(validCurrentReservation)) return false;
  const ids = new Set();
  let reservedNanoUsd = 0n;
  for (const reservation of value.reservations) {
    if (ids.has(reservation.id)) return false;
    ids.add(reservation.id);
    reservedNanoUsd += BigInt(reservation.amountNanoUsd);
  }
  const accountedNanoUsd = BigInt(value.legacyAccountedNanoUsd) + BigInt(value.usagePricedNanoUsd) + reservedNanoUsd;
  return accountedNanoUsd <= BigInt(Number.MAX_SAFE_INTEGER);
}

function createCurrentLedger(limitNanoUsd, legacyAccountedNanoUsd, usagePricedNanoUsd, reservations = []) {
  return {
    version: currentLedgerVersion,
    limitNanoUsd,
    legacyAccountedNanoUsd,
    usagePricedNanoUsd,
    reservations
  };
}

function migrateLegacyLedger(value, limitUsd, limitNanoUsd, nowMs) {
  if (value === null || typeof value !== "object"
    || value.version !== legacyLedgerVersion
    || value.limitUsd !== limitUsd
    || !Number.isFinite(value.settledUsd)
    || value.settledUsd < 0
    || !Array.isArray(value.reservations)) {
    throw new Error("DeepSeek pilot budget ledger is invalid or requires operator review");
  }
  const ids = new Set();
  const reservations = value.reservations.map((reservation) => {
    if (reservation === null || typeof reservation !== "object"
      || typeof reservation.id !== "string" || reservation.id.length === 0
      || typeof reservation.executionIdHash !== "string" || !validHashPattern.test(reservation.executionIdHash)
      || !Number.isFinite(reservation.amountUsd) || reservation.amountUsd <= 0) {
      throw new Error("DeepSeek pilot budget ledger is invalid or requires operator review");
    }
    if (ids.has(reservation.id)) throw new Error("DeepSeek pilot budget ledger is invalid or requires operator review");
    ids.add(reservation.id);
    const amountNanoUsd = toNanoUsdCeiling(reservation.amountUsd);
    const expiresAtMs = Number.isSafeInteger(reservation.expiresAt) && reservation.expiresAt >= 0 ? reservation.expiresAt : null;
    const createdAtMs = Number.isSafeInteger(reservation.createdAtMs) && reservation.createdAtMs >= 0 ? reservation.createdAtMs : null;
    const expiredOrUnbounded = expiresAtMs === null || expiresAtMs <= nowMs;
    return {
      id: reservation.id,
      executionIdHash: reservation.executionIdHash,
      amountNanoUsd,
      createdAtMs,
      expiresAtMs,
      status: expiredOrUnbounded ? "unknown" : "active"
    };
  });
  const legacyAccountedNanoUsd = toNanoUsdCeiling(value.settledUsd);
  if (!validCurrentLedger(createCurrentLedger(limitNanoUsd, legacyAccountedNanoUsd, 0, reservations), limitNanoUsd)) {
    throw new Error("DeepSeek pilot budget ledger is invalid or requires operator review");
  }
  return createCurrentLedger(limitNanoUsd, legacyAccountedNanoUsd, 0, reservations);
}

function atomicWrite(filePath, value) {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  let descriptor;
  try {
    descriptor = fs.openSync(temporaryPath, "wx");
    fs.writeFileSync(descriptor, JSON.stringify(value), "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporaryPath, filePath);
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
}

async function acquireKernelBudgetLock(lockPath) {
  const deadline = Date.now() + lockWaitTimeoutMs;
  while (Date.now() < deadline) {
    const lock = openKernelFileLock(lockPath);
    if (lock) return lock;
    await wait(lockPollIntervalMs);
  }
  throw new Error("DeepSeek budget lock unavailable");
}

async function acquireLegacyMigrationLock(lockPath) {
  const deadline = Date.now() + lockWaitTimeoutMs;
  while (Date.now() < deadline) {
    let descriptor;
    try {
      fs.mkdirSync(path.dirname(lockPath), { recursive: true });
      descriptor = fs.openSync(lockPath, "wx");
      fs.writeFileSync(descriptor, JSON.stringify({ pid: process.pid, ownerId: crypto.randomUUID() }), "utf8");
      return { descriptor, lockPath };
    } catch (error) {
      if (descriptor !== undefined) {
        try {
          fs.closeSync(descriptor);
        } catch {
        }
      }
      if (error.code !== "EEXIST") throw error;
      await wait(lockPollIntervalMs);
    }
  }
  throw new Error("DeepSeek legacy budget protocol is active or requires operator review");
}

function releaseLegacyMigrationLock(lock) {
  try {
    fs.closeSync(lock.descriptor);
  } catch {
    throw new Error("DeepSeek legacy budget migration lock release is uncertain");
  }
  try {
    fs.rmSync(lock.lockPath);
  } catch {
    throw new Error("DeepSeek legacy budget migration lock release is uncertain");
  }
}

function ledgerSummary(ledger) {
  let activeReservedNanoUsd = 0n;
  let unknownReservedNanoUsd = 0n;
  for (const reservation of ledger.reservations) {
    if (reservation.status === "unknown") unknownReservedNanoUsd += BigInt(reservation.amountNanoUsd);
    else activeReservedNanoUsd += BigInt(reservation.amountNanoUsd);
  }
  const accountedNanoUsd = BigInt(ledger.legacyAccountedNanoUsd) + BigInt(ledger.usagePricedNanoUsd);
  const reservedNanoUsd = activeReservedNanoUsd + unknownReservedNanoUsd;
  return {
    accountedNanoUsd,
    activeReservedNanoUsd,
    unknownReservedNanoUsd,
    reservedNanoUsd,
    availableNanoUsd: BigInt(ledger.limitNanoUsd) - accountedNanoUsd - reservedNanoUsd
  };
}

export function createDeepSeekPilotBudget({ stateDirectory, limitUsd = 1, priorUsageReservationUsd = 0.0000189, now = () => Date.now() } = {}) {
  if (!stateDirectory || !Number.isFinite(limitUsd) || limitUsd <= 0 || !Number.isFinite(priorUsageReservationUsd) || priorUsageReservationUsd < 0) {
    throw new Error("DeepSeek pilot budget configuration is invalid");
  }
  const resolvedStateDirectory = path.resolve(stateDirectory);
  const statePath = path.join(resolvedStateDirectory, "deepseek-pilot-budget.json");
  const kernelLockPath = path.join(resolvedStateDirectory, "deepseek-pilot-budget.v2.lock");
  const legacyLockPath = path.join(resolvedStateDirectory, "deepseek-pilot-budget.lock");
  const limitNanoUsd = toNanoUsdFloor(limitUsd);
  const priorUsageNanoUsd = toNanoUsdCeiling(priorUsageReservationUsd);

  function readLedger(nowMs) {
    if (!fs.existsSync(statePath)) return { ledger: createCurrentLedger(limitNanoUsd, priorUsageNanoUsd, 0), needsLegacyLock: true, needsWrite: true };
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(statePath, "utf8"));
    } catch {
      throw new Error("DeepSeek pilot budget ledger is invalid or requires operator review");
    }
    if (parsed?.version === currentLedgerVersion) {
      if (!validCurrentLedger(parsed, limitNanoUsd)) throw new Error("DeepSeek pilot budget ledger is invalid or requires operator review");
      return { ledger: parsed, needsLegacyLock: false, needsWrite: false };
    }
    if (parsed?.version === legacyLedgerVersion) {
      return {
        ledger: migrateLegacyLedger(parsed, limitUsd, limitNanoUsd, nowMs),
        needsLegacyLock: true,
        needsWrite: true
      };
    }
    throw new Error("DeepSeek pilot budget ledger is invalid or requires operator review");
  }

  async function withBudgetLock(callback, { persistReadMigration = true } = {}) {
    const lock = await acquireKernelBudgetLock(kernelLockPath);
    let legacyLock = null;
    let result;
    let callbackError = null;
    let releaseError = null;
    try {
      const nowMs = now();
      if (!Number.isSafeInteger(nowMs) || nowMs < 0) throw new Error("DeepSeek pilot budget clock is invalid");
      let loaded = readLedger(nowMs);
      if (loaded.needsLegacyLock) {
        legacyLock = await acquireLegacyMigrationLock(legacyLockPath);
        loaded = readLedger(nowMs);
        if (loaded.needsWrite && persistReadMigration) atomicWrite(statePath, loaded.ledger);
      }
      result = callback(loaded.ledger, loaded.needsWrite && !persistReadMigration);
    } catch (error) {
      callbackError = error;
    } finally {
      if (legacyLock) {
        try {
          releaseLegacyMigrationLock(legacyLock);
        } catch (error) {
          releaseError = error;
        }
      }
      if (!lock.release()) releaseError = new Error("DeepSeek budget kernel lock release is uncertain");
    }
    if (releaseError) throw releaseError;
    if (callbackError) throw callbackError;
    return result;
  }

  return {
    async reserve(executionId, amountUsd) {
      if (typeof executionId !== "string" || executionId.length === 0 || !Number.isFinite(amountUsd) || amountUsd <= 0) {
        throw new Error("DeepSeek budget reservation is invalid");
      }
      const amountNanoUsd = toNanoUsdCeiling(amountUsd);
      return withBudgetLock((ledger) => {
        const totals = ledgerSummary(ledger);
        if (totals.availableNanoUsd < BigInt(amountNanoUsd)) {
          return {
            allowed: false,
            reason: "budget_exhausted",
            limitUsd,
            availableUsd: fromNanoUsd(Number(totals.availableNanoUsd > 0n ? totals.availableNanoUsd : 0n))
          };
        }
        const nowMs = now();
        const reservation = {
          id: crypto.randomUUID(),
          executionIdHash: crypto.createHash("sha256").update(executionId).digest("hex"),
          amountNanoUsd,
          createdAtMs: nowMs,
          expiresAtMs: nowMs + reservationTtlMs,
          status: "active"
        };
        ledger.reservations.push(reservation);
        if (!validCurrentLedger(ledger, limitNanoUsd)) throw new Error("DeepSeek pilot budget ledger is invalid or requires operator review");
        atomicWrite(statePath, ledger);
        return { allowed: true, reservationId: reservation.id, reservedUsd: fromNanoUsd(amountNanoUsd) };
      });
    },
    async settle(reservationId, actualCostUsd = null) {
      if (typeof reservationId !== "string" || reservationId.length === 0
        || (actualCostUsd !== null && (!Number.isFinite(actualCostUsd) || actualCostUsd < 0))) {
        throw new Error("DeepSeek budget settlement is invalid");
      }
      const actualCostNanoUsd = actualCostUsd === null ? null : toNanoUsdCeiling(actualCostUsd);
      return withBudgetLock((ledger) => {
        const index = ledger.reservations.findIndex((reservation) => reservation.id === reservationId);
        if (index < 0) return { settled: false, overBudget: true, reason: "reservation_not_found" };
        const reservation = ledger.reservations[index];
        if (reservation.status === "unknown" && actualCostNanoUsd === null) {
          return { settled: true, unknown: true, duplicate: true, chargedUsd: null, overBudget: false };
        }
        if (reservation.status !== "active" && reservation.status !== "unknown") {
          throw new Error("DeepSeek pilot budget ledger is invalid or requires operator review");
        }
        if (actualCostNanoUsd === null) {
          reservation.status = "unknown";
          atomicWrite(statePath, ledger);
          return { settled: true, unknown: true, chargedUsd: null, reservedUsd: fromNanoUsd(reservation.amountNanoUsd), overBudget: false };
        }
        ledger.reservations.splice(index, 1);
        ledger.usagePricedNanoUsd += actualCostNanoUsd;
        if (!validCurrentLedger(ledger, limitNanoUsd)) throw new Error("DeepSeek pilot budget ledger is invalid or requires operator review");
        const totals = ledgerSummary(ledger);
        const overBudget = totals.availableNanoUsd < 0n;
        atomicWrite(statePath, ledger);
        return {
          settled: true,
          chargedUsd: fromNanoUsd(actualCostNanoUsd),
          overBudget,
          spentUsd: fromNanoUsd(Number(totals.accountedNanoUsd)),
          usagePricedUsd: fromNanoUsd(ledger.usagePricedNanoUsd)
        };
      });
    },
    async snapshot() {
      return withBudgetLock((ledger) => {
        const totals = ledgerSummary(ledger);
        return {
          limitUsd,
          spentUsd: fromNanoUsd(Number(totals.accountedNanoUsd)),
          accountedUsd: fromNanoUsd(Number(totals.accountedNanoUsd)),
          legacyUnclassifiedUsd: fromNanoUsd(ledger.legacyAccountedNanoUsd),
          usagePricedUsd: fromNanoUsd(ledger.usagePricedNanoUsd),
          activeReservedUsd: fromNanoUsd(Number(totals.activeReservedNanoUsd)),
          unknownReservedUsd: fromNanoUsd(Number(totals.unknownReservedNanoUsd)),
          reservedUsd: fromNanoUsd(Number(totals.reservedNanoUsd)),
          availableUsd: fromNanoUsd(Number(totals.availableNanoUsd > 0n ? totals.availableNanoUsd : 0n)),
          reservationCount: ledger.reservations.length,
          unknownReservationCount: ledger.reservations.filter((reservation) => reservation.status === "unknown").length
        };
      }, { persistReadMigration: false });
    }
  };
}
