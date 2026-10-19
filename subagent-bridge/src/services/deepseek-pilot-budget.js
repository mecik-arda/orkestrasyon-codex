import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function withBudgetLock(lockPath, callback) {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  const deadline = Date.now() + 5000;
  let descriptor = null;
  while (descriptor === null) {
    try {
      descriptor = fs.openSync(lockPath, "wx");
      fs.writeFileSync(descriptor, JSON.stringify({ pid: process.pid, ownerId: crypto.randomUUID() }), "utf8");
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      try {
        if (Date.now() - fs.statSync(lockPath).mtimeMs > 30000) fs.rmSync(lockPath, { force: true });
      } catch {
      }
      if (Date.now() >= deadline) throw new Error("DeepSeek budget lock unavailable");
      await wait(10);
    }
  }
  try {
    return await callback();
  } finally {
    fs.closeSync(descriptor);
    try {
      fs.rmSync(lockPath, { force: true });
    } catch {
    }
  }
}

function validLedger(value, limitUsd) {
  return value?.version === 1
    && value.limitUsd === limitUsd
    && Number.isFinite(value.settledUsd)
    && value.settledUsd >= 0
    && Array.isArray(value.reservations)
    && value.reservations.every((reservation) => typeof reservation.id === "string"
      && Number.isFinite(reservation.amountUsd)
      && reservation.amountUsd > 0
      && typeof reservation.executionIdHash === "string");
}

function atomicWrite(filePath, value) {
  const temporaryPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(value), { encoding: "utf8", flag: "wx" });
  try {
    fs.renameSync(temporaryPath, filePath);
  } catch (error) {
    try {
      fs.rmSync(temporaryPath, { force: true });
    } catch {
    }
    throw error;
  }
}

export function createDeepSeekPilotBudget({ stateDirectory, limitUsd = 1, priorUsageReservationUsd = 0.0000189, now = () => Date.now() } = {}) {
  if (!stateDirectory || !Number.isFinite(limitUsd) || limitUsd <= 0 || !Number.isFinite(priorUsageReservationUsd) || priorUsageReservationUsd < 0) {
    throw new Error("DeepSeek pilot budget configuration is invalid");
  }
  const statePath = path.join(stateDirectory, "deepseek-pilot-budget.json");
  const lockPath = path.join(stateDirectory, "deepseek-pilot-budget.lock");

  function loadLedger() {
    if (!fs.existsSync(statePath)) {
      return { version: 1, limitUsd, settledUsd: priorUsageReservationUsd, reservations: [] };
    }
    const ledger = JSON.parse(fs.readFileSync(statePath, "utf8"));
    if (!validLedger(ledger, limitUsd)) throw new Error("DeepSeek pilot budget ledger is invalid");
    return ledger;
  }

  return {
    async reserve(executionId, amountUsd) {
      if (typeof executionId !== "string" || executionId.length === 0 || !Number.isFinite(amountUsd) || amountUsd <= 0) {
        throw new Error("DeepSeek budget reservation is invalid");
      }
      return withBudgetLock(lockPath, () => {
        const ledger = loadLedger();
        const nowMs = now();
        ledger.reservations = ledger.reservations.filter((reservation) => Number.isFinite(reservation.expiresAt) && reservation.expiresAt > nowMs);
        const reservedUsd = ledger.reservations.reduce((total, reservation) => total + reservation.amountUsd, 0);
        if (ledger.settledUsd + reservedUsd + amountUsd > limitUsd) {
          atomicWrite(statePath, ledger);
          return { allowed: false, reason: "budget_exhausted", limitUsd, availableUsd: Math.max(0, limitUsd - ledger.settledUsd - reservedUsd) };
        }
        const reservation = {
          id: crypto.randomUUID(),
          executionIdHash: crypto.createHash("sha256").update(executionId).digest("hex"),
          amountUsd,
          expiresAt: nowMs + 1200000
        };
        ledger.reservations.push(reservation);
        atomicWrite(statePath, ledger);
        return { allowed: true, reservationId: reservation.id, reservedUsd: amountUsd };
      });
    },
    async settle(reservationId, actualCostUsd = null) {
      if (typeof reservationId !== "string" || reservationId.length === 0) throw new Error("DeepSeek budget settlement is invalid");
      return withBudgetLock(lockPath, () => {
        const ledger = loadLedger();
        const index = ledger.reservations.findIndex((reservation) => reservation.id === reservationId);
        if (index < 0) return { settled: false, overBudget: true };
        const [reservation] = ledger.reservations.splice(index, 1);
        const chargedUsd = Number.isFinite(actualCostUsd) && actualCostUsd >= 0 ? actualCostUsd : reservation.amountUsd;
        const otherReservedUsd = ledger.reservations.reduce((total, current) => total + current.amountUsd, 0);
        const overBudget = ledger.settledUsd + otherReservedUsd + chargedUsd > limitUsd;
        ledger.settledUsd += chargedUsd;
        atomicWrite(statePath, ledger);
        return { settled: true, chargedUsd, overBudget, spentUsd: ledger.settledUsd };
      });
    },
    async snapshot() {
      return withBudgetLock(lockPath, () => {
        const ledger = loadLedger();
        return {
          limitUsd,
          spentUsd: ledger.settledUsd,
          reservedUsd: ledger.reservations.reduce((total, reservation) => total + reservation.amountUsd, 0),
          reservationCount: ledger.reservations.length
        };
      });
    }
  };
}
