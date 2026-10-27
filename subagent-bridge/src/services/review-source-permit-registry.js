import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { withKernelFileLock } from "./kernel-file-lock.js";

const permitTtlMs = 600_000;
const hashPattern = /^[a-f0-9]{64}$/u;
const headPattern = /^[a-f0-9]{40,64}$/u;
const permitPattern = /^[a-f0-9]{64}$/u;

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function normalizeBinding(binding) {
  if (!binding || typeof binding !== "object"
    || !hashPattern.test(binding.workspaceHash)
    || !headPattern.test(binding.head)
    || typeof binding.caller !== "string" || binding.caller.length === 0
    || typeof binding.target !== "string" || binding.target.length === 0
    || typeof binding.model !== "string" || binding.model.length === 0
    || !hashPattern.test(binding.promptSha256)
    || !hashPattern.test(binding.bundleSha256)
    || !Array.isArray(binding.entries) || binding.entries.length === 0) {
    throw new Error("review permit binding invalid");
  }
  const entries = binding.entries.map((entry) => {
    if (!entry || typeof entry.path !== "string" || entry.path.length === 0
      || !hashPattern.test(entry.sha256)
      || !Number.isSafeInteger(entry.sizeBytes) || entry.sizeBytes < 0
      || !Number.isInteger(entry.mode) || entry.mode < 0 || entry.mode > 0o777) {
      throw new Error("review permit binding invalid");
    }
    return { path: entry.path, sha256: entry.sha256, sizeBytes: entry.sizeBytes, mode: entry.mode };
  }).sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  if (new Set(entries.map((entry) => entry.path)).size !== entries.length) throw new Error("review permit binding invalid");
  return {
    workspaceHash: binding.workspaceHash,
    head: binding.head,
    caller: binding.caller,
    target: binding.target,
    model: binding.model,
    promptSha256: binding.promptSha256,
    bundleSha256: binding.bundleSha256,
    entries
  };
}

function writeExclusive(filePath, content) {
  let descriptor;
  try {
    descriptor = fs.openSync(filePath, "wx", 0o600);
    fs.writeFileSync(descriptor, content);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
  } catch (error) {
    if (descriptor !== undefined) {
      try {
        fs.closeSync(descriptor);
      } catch {
      }
    }
    throw error;
  }
}

function appendAudit(auditPath, event, reason) {
  const record = JSON.stringify({ version: 1, event, reason, at: new Date().toISOString() }) + "\n";
  const descriptor = fs.openSync(auditPath, "a", 0o600);
  try {
    fs.writeFileSync(descriptor, record, "utf8");
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

export function createReviewSourcePermitRegistry({ stateDirectory, now = () => Date.now(), enabled = false } = {}) {
  if (typeof stateDirectory !== "string" || !path.isAbsolute(stateDirectory) || typeof now !== "function") {
    throw new Error("review permit state directory required");
  }
  const directory = path.join(stateDirectory, "review-permits");
  const lockPath = path.join(directory, "registry.lock");
  const auditPath = path.join(directory, "audit.jsonl");

  function requireEnabled() {
    if (enabled !== true) return { ok: false, reason: "disabled" };
    return null;
  }

  function initialize() {
    fs.mkdirSync(directory, { recursive: true });
  }

  function permitPath(permitId) {
    return path.join(directory, `${hash(permitId)}.json`);
  }

  function markerPath(permitId, marker) {
    return path.join(directory, `${hash(permitId)}.${marker}`);
  }

  function readRecord(permitId) {
    try {
      const record = JSON.parse(fs.readFileSync(permitPath(permitId), "utf8"));
      if (record.version !== 1 || record.bindingSha256 !== hash(JSON.stringify(record.binding))
        || !Number.isFinite(record.issuedAt) || !Number.isFinite(record.expiresAt)
        || record.expiresAt - record.issuedAt !== permitTtlMs) return null;
      return record;
    } catch {
      return null;
    }
  }

  function withRegistryLock(callback) {
    initialize();
    const result = withKernelFileLock(lockPath, callback);
    return result === null ? { ok: false, reason: "registry_unavailable" } : result;
  }

  return {
    issue({ binding, humanConfirmed } = {}) {
      const disabled = requireEnabled();
      if (disabled) return disabled;
      if (humanConfirmed !== true) throw new Error("review permit requires human confirmation");
      const normalizedBinding = normalizeBinding(binding);
      return withRegistryLock(() => {
        let permitId;
        let recordPath;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          permitId = crypto.randomBytes(32).toString("hex");
          recordPath = permitPath(permitId);
          if (!fs.existsSync(recordPath)) break;
          permitId = null;
        }
        if (!permitId) return { ok: false, reason: "registry_unavailable" };
        const issuedAt = now();
        const record = {
          version: 1,
          binding: normalizedBinding,
          bindingSha256: hash(JSON.stringify(normalizedBinding)),
          issuedAt,
          expiresAt: issuedAt + permitTtlMs
        };
        try {
          writeExclusive(recordPath, JSON.stringify(record));
          appendAudit(auditPath, "issued", "human_confirmed");
        } catch {
          return { ok: false, reason: "registry_unavailable" };
        }
        return { ok: true, permitId, expiresAt: new Date(record.expiresAt).toISOString() };
      });
    },
    consume({ permitId, binding } = {}) {
      const disabled = requireEnabled();
      if (disabled) return disabled;
      if (typeof permitId !== "string" || !permitPattern.test(permitId)) return { ok: false, reason: "invalid" };
      let normalizedBinding;
      try {
        normalizedBinding = normalizeBinding(binding);
      } catch {
        return { ok: false, reason: "binding_mismatch" };
      }
      return withRegistryLock(() => {
        const record = readRecord(permitId);
        if (!record) return { ok: false, reason: "invalid" };
        if (record.expiresAt <= now()) return { ok: false, reason: "expired" };
        if (record.bindingSha256 !== hash(JSON.stringify(normalizedBinding))) return { ok: false, reason: "binding_mismatch" };
        const consumedPath = markerPath(permitId, "consumed");
        const revokedPath = markerPath(permitId, "revoked");
        if (fs.existsSync(consumedPath)) return { ok: false, reason: "already_consumed" };
        if (fs.existsSync(revokedPath)) return { ok: false, reason: "revoked" };
        try {
          writeExclusive(consumedPath, JSON.stringify({ version: 1, at: now() }));
          appendAudit(auditPath, "consumed", "accepted");
        } catch {
          return { ok: false, reason: "registry_unavailable" };
        }
        return { ok: true };
      });
    },
    revoke({ permitId } = {}) {
      const disabled = requireEnabled();
      if (disabled) return disabled;
      if (typeof permitId !== "string" || !permitPattern.test(permitId)) return { ok: false, reason: "invalid" };
      return withRegistryLock(() => {
        const record = readRecord(permitId);
        if (!record) return { ok: false, reason: "invalid" };
        if (record.expiresAt <= now()) return { ok: false, reason: "expired" };
        const consumedPath = markerPath(permitId, "consumed");
        const revokedPath = markerPath(permitId, "revoked");
        if (fs.existsSync(consumedPath)) return { ok: false, reason: "already_consumed" };
        if (fs.existsSync(revokedPath)) return { ok: false, reason: "revoked" };
        try {
          writeExclusive(revokedPath, JSON.stringify({ version: 1, at: now() }));
          appendAudit(auditPath, "revoked", "cancelled");
        } catch {
          return { ok: false, reason: "registry_unavailable" };
        }
        return { ok: true };
      });
    }
  };
}
