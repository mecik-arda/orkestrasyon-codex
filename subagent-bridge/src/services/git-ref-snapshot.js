import crypto from "node:crypto";

export const gitRefSnapshotSchemaVersion = 1;
export const gitRefSnapshotMaxEntries = 4096;
export const gitRefSnapshotMaxOutputBytes = 1048576;
export const gitRefSnapshotMaxSerializedBytes = 1048576;
export const gitRefSnapshotMaxPublicChanges = 24;

const gitRefCategories = new Set(["branch", "remote_tracking", "tag", "codex_turn_checkpoint", "other"]);

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function categoryForRefName(referenceName) {
  if (referenceName.startsWith("refs/heads/")) return "branch";
  if (referenceName.startsWith("refs/remotes/")) return "remote_tracking";
  if (referenceName.startsWith("refs/tags/")) return "tag";
  if (referenceName.startsWith("refs/codex/turn-diffs/checkpoints/")) return "codex_turn_checkpoint";
  return "other";
}

function snapshotPayload(refsHash, entries) {
  return {
    schemaVersion: gitRefSnapshotSchemaVersion,
    refCount: entries.length,
    refsHash,
    entries
  };
}

export function validateGitRefSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return false;
  const expectedKeys = ["entries", "refCount", "refsHash", "schemaVersion", "snapshotHash"];
  if (Object.keys(snapshot).sort().join("|") !== expectedKeys.join("|")) return false;
  if (snapshot.schemaVersion !== gitRefSnapshotSchemaVersion
    || !Number.isSafeInteger(snapshot.refCount) || snapshot.refCount < 0 || snapshot.refCount > gitRefSnapshotMaxEntries
    || !/^[a-f0-9]{64}$/.test(snapshot.refsHash || "")
    || !/^[a-f0-9]{64}$/.test(snapshot.snapshotHash || "")
    || !Array.isArray(snapshot.entries) || snapshot.entries.length !== snapshot.refCount) return false;
  let previousFingerprint = null;
  const seenFingerprints = new Set();
  for (const entry of snapshot.entries) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)
      || Object.keys(entry).sort().join("|") !== "category|referenceFingerprint|targetFingerprint"
      || !gitRefCategories.has(entry.category)
      || !/^[a-f0-9]{64}$/.test(entry.referenceFingerprint || "")
      || !/^[a-f0-9]{64}$/.test(entry.targetFingerprint || "")
      || seenFingerprints.has(entry.referenceFingerprint)
      || (previousFingerprint !== null && previousFingerprint >= entry.referenceFingerprint)) return false;
    previousFingerprint = entry.referenceFingerprint;
    seenFingerprints.add(entry.referenceFingerprint);
  }
  const expectedHash = sha256(canonicalJson(snapshotPayload(snapshot.refsHash, snapshot.entries)));
  return snapshot.snapshotHash === expectedHash
    && Buffer.byteLength(canonicalJson(snapshot), "utf8") <= gitRefSnapshotMaxSerializedBytes;
}

export function createGitRefSnapshot(refOutput) {
  if (typeof refOutput !== "string" || Buffer.byteLength(refOutput, "utf8") > gitRefSnapshotMaxOutputBytes) {
    return { ok: false, reason: "ref_snapshot_limit_exceeded" };
  }
  const rows = refOutput.split("\n").filter((line) => line.length > 0);
  if (rows.length > gitRefSnapshotMaxEntries) return { ok: false, reason: "ref_snapshot_limit_exceeded" };
  const entries = [];
  for (const row of rows) {
    const separator = row.lastIndexOf(":");
    if (separator <= 0) return { ok: false, reason: "ref_snapshot_invalid" };
    const referenceName = row.slice(0, separator);
    const targetObjectId = row.slice(separator + 1);
    if (!referenceName.startsWith("refs/") || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(targetObjectId)) {
      return { ok: false, reason: "ref_snapshot_invalid" };
    }
    entries.push({
      category: categoryForRefName(referenceName),
      referenceFingerprint: sha256(referenceName),
      targetFingerprint: sha256(targetObjectId)
    });
  }
  entries.sort((left, right) => left.referenceFingerprint.localeCompare(right.referenceFingerprint));
  const refsHash = sha256(refOutput);
  const payload = snapshotPayload(refsHash, entries);
  const snapshot = { ...payload, snapshotHash: sha256(canonicalJson(payload)) };
  if (!validateGitRefSnapshot(snapshot)) return { ok: false, reason: "ref_snapshot_limit_exceeded" };
  return { ok: true, snapshot };
}

export function compareGitRefSnapshots(previousSnapshot, currentSnapshot) {
  if (!validateGitRefSnapshot(previousSnapshot) || !validateGitRefSnapshot(currentSnapshot)) {
    return {
      schemaVersion: gitRefSnapshotSchemaVersion,
      status: "unavailable",
      reason: previousSnapshot === null || previousSnapshot === undefined ? "legacy_snapshot_unavailable" : "snapshot_invalid",
      addedCount: 0,
      removedCount: 0,
      updatedCount: 0,
      truncated: false,
      changes: []
    };
  }
  const previousByFingerprint = new Map(previousSnapshot.entries.map((entry) => [entry.referenceFingerprint, entry]));
  const currentByFingerprint = new Map(currentSnapshot.entries.map((entry) => [entry.referenceFingerprint, entry]));
  const added = currentSnapshot.entries.filter((entry) => !previousByFingerprint.has(entry.referenceFingerprint)).map((entry) => ({
    operation: "added",
    category: entry.category,
    referenceFingerprint: entry.referenceFingerprint,
    previousTargetFingerprint: null,
    currentTargetFingerprint: entry.targetFingerprint
  }));
  const removed = previousSnapshot.entries.filter((entry) => !currentByFingerprint.has(entry.referenceFingerprint)).map((entry) => ({
    operation: "removed",
    category: entry.category,
    referenceFingerprint: entry.referenceFingerprint,
    previousTargetFingerprint: entry.targetFingerprint,
    currentTargetFingerprint: null
  }));
  const updated = currentSnapshot.entries.filter((entry) => {
    const previous = previousByFingerprint.get(entry.referenceFingerprint);
    return previous && previous.targetFingerprint !== entry.targetFingerprint;
  }).map((entry) => ({
    operation: "updated",
    category: entry.category,
    referenceFingerprint: entry.referenceFingerprint,
    previousTargetFingerprint: previousByFingerprint.get(entry.referenceFingerprint).targetFingerprint,
    currentTargetFingerprint: entry.targetFingerprint
  }));
  const changes = [...added, ...removed, ...updated].sort((left, right) => {
    const operationOrder = ["added", "removed", "updated"];
    return operationOrder.indexOf(left.operation) - operationOrder.indexOf(right.operation)
      || left.referenceFingerprint.localeCompare(right.referenceFingerprint);
  });
  return {
    schemaVersion: gitRefSnapshotSchemaVersion,
    status: "available",
    reason: null,
    addedCount: added.length,
    removedCount: removed.length,
    updatedCount: updated.length,
    truncated: changes.length > gitRefSnapshotMaxPublicChanges,
    changes: changes.slice(0, gitRefSnapshotMaxPublicChanges)
  };
}
