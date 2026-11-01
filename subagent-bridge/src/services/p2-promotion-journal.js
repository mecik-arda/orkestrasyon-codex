import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { p2PreparedEditPolicy } from "./p2-prepared-edit-policy.js";

const journalVersion = 1;
const maximumJournalBytes = 32768;
const maximumContentBytes = 1048576;

function digest(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function journalError(failureClass, message) {
  const error = new Error(message);
  error.failureClass = failureClass;
  return error;
}

function exists(filePath) {
  try {
    fs.lstatSync(filePath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return false;
    throw error;
  }
}

function safeRelativePath(value) {
  if (typeof value !== "string" || value.length === 0 || path.isAbsolute(value)) throw journalError("p2_journal_invalid", "P2 recovery journal path is invalid");
  const normalized = value.replaceAll("\\", "/");
  if (normalized.split("/").some((segment) => segment === "" || segment === "." || segment === "..")) throw journalError("p2_journal_invalid", "P2 recovery journal path is invalid");
  return normalized;
}

function safeFileStatus(root, relativePath, allowMissing = false) {
  const normalizedPath = safeRelativePath(relativePath);
  const absolutePath = path.join(root, ...normalizedPath.split("/"));
  let current = root;
  for (const segment of normalizedPath.split("/")) {
    current = path.join(current, segment);
    let status;
    try {
      status = fs.lstatSync(current, { bigint: true });
    } catch (error) {
      if (allowMissing && error.code === "ENOENT") return null;
      throw error;
    }
    if (status.isSymbolicLink()) throw journalError("p2_recovery_conflict", "P2 recovery encountered a linked path");
    if (current !== absolutePath && !status.isDirectory()) throw journalError("p2_recovery_conflict", "P2 recovery parent path is invalid");
  }
  const status = fs.lstatSync(absolutePath, { bigint: true });
  if (!status.isFile() || status.nlink < 1n || status.size > BigInt(maximumContentBytes)) throw journalError("p2_recovery_conflict", "P2 recovery file identity is invalid");
  return status;
}

function fileSnapshot(root, relativePath, { allowMissing = false, requiredLinks = null } = {}) {
  const normalizedPath = safeRelativePath(relativePath);
  const status = safeFileStatus(root, normalizedPath, allowMissing);
  if (status === null) return null;
  if (requiredLinks !== null && status.nlink !== BigInt(requiredLinks)) throw journalError("p2_recovery_conflict", "P2 recovery link count is invalid");
  const absolutePath = path.join(root, ...normalizedPath.split("/"));
  const descriptor = fs.openSync(absolutePath, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    const opened = fs.fstatSync(descriptor, { bigint: true });
    if (opened.dev !== status.dev || opened.ino !== status.ino || opened.nlink !== status.nlink || opened.size !== status.size) throw journalError("p2_recovery_conflict", "P2 recovery file changed during validation");
    const content = fs.readFileSync(descriptor);
    const completed = fs.fstatSync(descriptor, { bigint: true });
    if (completed.dev !== opened.dev || completed.ino !== opened.ino || completed.size !== opened.size || completed.mtimeNs !== opened.mtimeNs || BigInt(content.length) !== completed.size) throw journalError("p2_recovery_conflict", "P2 recovery file changed during read");
    return {
      identity: { dev: completed.dev.toString(), ino: completed.ino.toString() },
      links: completed.nlink.toString(),
      mode: Number(completed.mode & 0o7777n),
      size: Number(completed.size),
      sha256: digest(content),
      content
    };
  } finally {
    fs.closeSync(descriptor);
  }
}

function sameIdentity(left, right) {
  return Boolean(left && right && left.dev === right.dev && left.ino === right.ino);
}

function matchesSnapshot(actual, expected, expectedLinks = null) {
  return Boolean(actual && expected
    && sameIdentity(actual.identity, expected.identity)
    && actual.sha256 === expected.sha256
    && actual.size === expected.size
    && actual.mode === expected.mode
    && (expectedLinks === null || actual.links === String(expectedLinks)));
}

function ensureJournalDirectory(journalDirectory) {
  const absolute = path.resolve(journalDirectory);
  fs.mkdirSync(absolute, { recursive: true });
  const status = fs.lstatSync(absolute);
  if (!status.isDirectory() || status.isSymbolicLink()) throw journalError("p2_journal_unavailable", "P2 recovery journal directory is unavailable");
  return fs.realpathSync(absolute);
}

function journalPathFor(directory, approvalIdHash) {
  if (!/^[a-f0-9]{64}$/.test(approvalIdHash || "")) throw journalError("p2_journal_invalid", "P2 recovery journal binding is invalid");
  return path.join(directory, `${approvalIdHash}.json`);
}

function publishJournal(filePath, journal, createOnly = false) {
  const serialized = `${JSON.stringify(journal)}\n`;
  if (Buffer.byteLength(serialized, "utf8") > maximumJournalBytes) throw journalError("p2_journal_unavailable", "P2 recovery journal exceeds its size limit");
  const temporaryPath = `${filePath}.${process.pid}.${crypto.randomBytes(8).toString("hex")}.next`;
  let descriptor;
  try {
    descriptor = fs.openSync(temporaryPath, "wx", 0o600);
    fs.writeFileSync(descriptor, serialized, "utf8");
    fs.fsyncSync(descriptor);
    const completedDescriptor = descriptor;
    descriptor = undefined;
    fs.closeSync(completedDescriptor);
    if (createOnly && exists(filePath)) throw journalError("p2_journal_conflict", "P2 recovery journal already exists");
    fs.renameSync(temporaryPath, filePath);
  } catch (error) {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (exists(temporaryPath)) fs.unlinkSync(temporaryPath);
    throw error;
  }
}

function readJournal(filePath, workspaceHash, approvalIdHash) {
  const status = fs.lstatSync(filePath, { bigint: true });
  if (!status.isFile() || status.isSymbolicLink() || status.nlink !== 1n || status.size > BigInt(maximumJournalBytes)) throw journalError("p2_journal_invalid", "P2 recovery journal file is invalid");
  let descriptor;
  let bytes;
  try {
    descriptor = fs.openSync(filePath, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    const opened = fs.fstatSync(descriptor, { bigint: true });
    if (!opened.isFile() || opened.dev !== status.dev || opened.ino !== status.ino || opened.nlink !== 1n || opened.size !== status.size) throw journalError("p2_journal_invalid", "P2 recovery journal identity changed");
    bytes = fs.readFileSync(descriptor);
    const completed = fs.fstatSync(descriptor, { bigint: true });
    if (completed.dev !== opened.dev || completed.ino !== opened.ino || completed.nlink !== 1n || completed.size !== opened.size || completed.mtimeNs !== opened.mtimeNs || bytes.length !== Number(completed.size)) throw journalError("p2_journal_invalid", "P2 recovery journal changed during read");
  } catch (error) {
    if (error.failureClass) throw error;
    throw journalError("p2_journal_invalid", "P2 recovery journal is unreadable");
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
  const serialized = bytes.toString("utf8");
  let journal;
  try {
    journal = JSON.parse(serialized);
  } catch {
    throw journalError("p2_journal_invalid", "P2 recovery journal is unreadable");
  }
  if (serialized !== `${JSON.stringify(journal)}\n`
    || journal.version !== journalVersion
    || journal.workspaceHash !== workspaceHash
    || journal.approvalIdHash !== approvalIdHash
    || !/^[a-f0-9]{64}$/.test(journal.executionIdHash || "")
    || !/^[a-f0-9]{64}$/.test(journal.changeSetHash || "")
    || !/^[a-f0-9]{64}$/.test(journal.contentSha256 || "")
    || !/^[a-f0-9]{32}$/.test(journal.transactionId || "")
    || journal.caller !== "codex_profile_edit_pilot"
    || journal.model !== p2PreparedEditPolicy.model
    || !["present", "absent"].includes(journal.originalState)
    || !["pending", "commit", "rollback"].includes(journal.decision)
    || !["prepared", "backup_moved", "target_linked", "stage_removed", "cleanup_pending", "terminal"].includes(journal.phase)
    || !Number.isSafeInteger(journal.sequence) || journal.sequence < 0
    || typeof journal.relativePath !== "string"
    || safeRelativePath(journal.relativePath) !== journal.relativePath
    || typeof journal.stageRelativePath !== "string"
    || safeRelativePath(journal.stageRelativePath) !== journal.stageRelativePath
    || typeof journal.backupRelativePath !== "string"
    || safeRelativePath(journal.backupRelativePath) !== journal.backupRelativePath
    || journal.relativePath !== p2PreparedEditPolicy.relativePath
    || journal.stageRelativePath !== `${path.posix.dirname(journal.relativePath) === "." ? "" : `${path.posix.dirname(journal.relativePath)}/`}.${path.posix.basename(journal.relativePath)}.${journal.processId}.${journal.createdAt}.${journal.transactionId}.tmp`
    || journal.backupRelativePath !== `${journal.stageRelativePath}.backup`
    || !Number.isSafeInteger(journal.processId)
    || !Number.isSafeInteger(journal.createdAt)
    || !journal.staged?.identity || !/^(?:0|[1-9][0-9]*)$/.test(journal.staged.identity.dev || "")
    || !/^(?:0|[1-9][0-9]*)$/.test(journal.staged.identity.ino || "")
    || !Number.isSafeInteger(journal.staged.mode) || journal.staged.mode < 0 || journal.staged.mode > 0o7777
    || !Number.isSafeInteger(journal.staged.size) || journal.staged.size < 0 || journal.staged.size > maximumContentBytes
    || journal.staged.sha256 !== journal.contentSha256
    || (journal.originalState === "present" && (!journal.original?.identity || !/^(?:0|[1-9][0-9]*)$/.test(journal.original.identity.dev || "") || !/^(?:0|[1-9][0-9]*)$/.test(journal.original.identity.ino || "") || !Number.isSafeInteger(journal.original.mode) || journal.original.mode < 0 || journal.original.mode > 0o7777 || !Number.isSafeInteger(journal.original.size) || journal.original.size < 0 || journal.original.size > maximumContentBytes || !/^[a-f0-9]{64}$/.test(journal.original.sha256 || "")))
    || (journal.originalState === "absent" && journal.original !== null)) {
    throw journalError("p2_journal_invalid", "P2 recovery journal metadata is invalid");
  }
  return journal;
}

function updateJournal(filePath, journal, changes) {
  const updated = { ...journal, ...changes, sequence: journal.sequence + 1 };
  publishJournal(filePath, updated);
  return updated;
}

function cleanupRecordedFile(root, relativePath, expected, expectedLinks = 1) {
  const current = fileSnapshot(root, relativePath, { allowMissing: true });
  if (current === null) return false;
  if (!matchesSnapshot(current, expected, expectedLinks)) throw journalError("p2_recovery_conflict", "P2 recovery artifact ownership changed");
  fs.unlinkSync(path.join(root, ...relativePath.split("/")));
  return true;
}

function resolveJournal(root, filePath, journal) {
  const target = fileSnapshot(root, journal.relativePath, { allowMissing: true });
  const staged = fileSnapshot(root, journal.stageRelativePath, { allowMissing: true });
  const backup = fileSnapshot(root, journal.backupRelativePath, { allowMissing: true });
  const targetSharesOriginal = sameIdentity(target?.identity, backup?.identity);
  const targetSharesStaged = sameIdentity(target?.identity, staged?.identity);
  const targetIsOriginal = matchesSnapshot(target, journal.original, journal.originalState === "present" ? targetSharesOriginal ? 2 : 1 : null);
  const targetIsStaged = matchesSnapshot(target, journal.staged, targetSharesStaged ? 2 : 1);
  const backupIsOriginal = matchesSnapshot(backup, journal.original, targetSharesOriginal ? 2 : 1);
  const stagedIsRecorded = matchesSnapshot(staged, journal.staged, targetSharesStaged ? 2 : 1);
  if (journal.decision === "commit") {
    if (journal.phase === "terminal") {
      if (staged !== null && !stagedIsRecorded) throw journalError("p2_recovery_conflict", "P2 terminal staged artifact changed");
      if (backup !== null && !backupIsOriginal) throw journalError("p2_recovery_conflict", "P2 terminal backup changed");
      if (staged !== null) cleanupRecordedFile(root, journal.stageRelativePath, journal.staged, targetSharesStaged ? 2 : 1);
      if (backup !== null) cleanupRecordedFile(root, journal.backupRelativePath, journal.original, targetSharesOriginal ? 2 : 1);
      return { outcome: "already_terminal", decision: "commit", journal };
    }
    if (!targetIsStaged || (staged !== null && !stagedIsRecorded) || (backup !== null && !backupIsOriginal)) throw journalError("p2_recovery_conflict", "P2 committed target cannot be safely finalized");
    if (staged !== null) cleanupRecordedFile(root, journal.stageRelativePath, journal.staged);
    if (backup !== null) cleanupRecordedFile(root, journal.backupRelativePath, journal.original, targetSharesOriginal ? 2 : 1);
    journal = updateJournal(filePath, journal, { phase: "terminal" });
    return { outcome: "recovered", decision: "commit", journal };
  }
  if (journal.decision === "rollback") {
    if (journal.phase === "terminal") {
      if (backup !== null && !backupIsOriginal) throw journalError("p2_recovery_conflict", "P2 terminal backup changed");
      if (staged !== null && !stagedIsRecorded) throw journalError("p2_recovery_conflict", "P2 terminal staged artifact changed");
      if (backup !== null) cleanupRecordedFile(root, journal.backupRelativePath, journal.original, targetSharesOriginal ? 2 : 1);
      if (staged !== null) cleanupRecordedFile(root, journal.stageRelativePath, journal.staged, targetSharesStaged ? 2 : 1);
      return { outcome: "already_terminal", decision: "rollback", journal };
    }
    if (journal.phase !== "cleanup_pending") throw journalError("p2_journal_invalid", "P2 rollback journal phase is invalid");
    if (journal.originalState === "present" && !targetIsOriginal) throw journalError("p2_recovery_conflict", "P2 rollback target no longer matches the original file");
    if (journal.originalState === "absent" && target !== null) throw journalError("p2_recovery_conflict", "P2 rollback target appeared after recovery");
    if (backup !== null && !backupIsOriginal) throw journalError("p2_recovery_conflict", "P2 rollback backup changed");
    if (staged !== null && !stagedIsRecorded) throw journalError("p2_recovery_conflict", "P2 staged file changed");
    if (backup !== null) cleanupRecordedFile(root, journal.backupRelativePath, journal.original, targetSharesOriginal ? 2 : 1);
    if (staged !== null) cleanupRecordedFile(root, journal.stageRelativePath, journal.staged);
    journal = updateJournal(filePath, journal, { phase: "terminal" });
    return { outcome: "recovered", decision: "rollback", journal };
  }
  if (staged !== null && !stagedIsRecorded) throw journalError("p2_recovery_conflict", "P2 staged file changed");
  if (backup !== null && !backupIsOriginal) throw journalError("p2_recovery_conflict", "P2 backup changed");
  if (target !== null && !targetIsOriginal && !targetIsStaged) throw journalError("p2_recovery_conflict", "P2 target belongs to another writer");
  if (targetIsStaged && journal.originalState === "present" && !matchesSnapshot(backup, journal.original, 1)) throw journalError("p2_recovery_conflict", "P2 original backup is unavailable");
  if (targetIsStaged) fs.unlinkSync(path.join(root, ...journal.relativePath.split("/")));
  const targetAfterRemoval = fileSnapshot(root, journal.relativePath, { allowMissing: true });
  if (journal.originalState === "present") {
    const backupAfterRemoval = fileSnapshot(root, journal.backupRelativePath, { allowMissing: true });
    if (targetAfterRemoval === null && matchesSnapshot(backupAfterRemoval, journal.original, 1)) {
      fs.linkSync(path.join(root, ...journal.backupRelativePath.split("/")), path.join(root, ...journal.relativePath.split("/")));
    } else if (!(matchesSnapshot(targetAfterRemoval, journal.original, backupAfterRemoval === null ? 1 : 2)
      && (backupAfterRemoval === null || matchesSnapshot(backupAfterRemoval, journal.original, 2)))) {
      throw journalError("p2_recovery_conflict", "P2 original source cannot be restored safely");
    }
  } else if (targetAfterRemoval !== null) {
    throw journalError("p2_recovery_conflict", "P2 originally absent target cannot be restored safely");
  }
  journal = updateJournal(filePath, journal, { decision: "rollback", phase: "cleanup_pending" });
  const restored = fileSnapshot(root, journal.relativePath, { allowMissing: true });
  const restoredMatches = journal.originalState === "absent"
    ? restored === null
    : matchesSnapshot(restored, journal.original, journal.original?.identity ? (exists(path.join(root, ...journal.backupRelativePath.split("/"))) ? 2 : 1) : null);
  if (!restoredMatches) throw journalError("p2_recovery_conflict", "P2 recovery terminal source state could not be verified");
  const currentBackup = fileSnapshot(root, journal.backupRelativePath, { allowMissing: true });
  if (currentBackup !== null) cleanupRecordedFile(root, journal.backupRelativePath, journal.original, restored?.links === "2" ? 2 : 1);
  const currentStage = fileSnapshot(root, journal.stageRelativePath, { allowMissing: true });
  if (currentStage !== null) cleanupRecordedFile(root, journal.stageRelativePath, journal.staged);
  journal = updateJournal(filePath, journal, { phase: "terminal" });
  return { outcome: "recovered", decision: "rollback", journal };
}

export function applyP2PreparedChange({ sourceRoot, journalDirectory, workspaceHash, approvalIdHash, executionIdHash, changeSetHash, relativePath, content, expectedState }) {
  const root = fs.realpathSync(sourceRoot);
  const directory = ensureJournalDirectory(journalDirectory);
  const filePath = journalPathFor(directory, approvalIdHash);
  if (!Buffer.isBuffer(content) || content.length > maximumContentBytes || !/^[a-f0-9]{64}$/.test(workspaceHash || "") || !/^[a-f0-9]{64}$/.test(executionIdHash || "") || !/^[a-f0-9]{64}$/.test(changeSetHash || "")) throw journalError("p2_journal_invalid", "P2 promotion binding is invalid");
  if (exists(filePath)) throw journalError("p2_journal_conflict", "P2 approval already has a promotion journal");
  const normalizedPath = safeRelativePath(relativePath);
  if (normalizedPath !== p2PreparedEditPolicy.relativePath) throw journalError("p2_journal_invalid", "P2 promotion target is not permitted");
  const targetPath = path.join(root, ...normalizedPath.split("/"));
  const parentPath = path.dirname(targetPath);
  const parentStatus = fs.lstatSync(parentPath);
  if (!parentStatus.isDirectory() || parentStatus.isSymbolicLink() || fs.realpathSync(parentPath) !== parentPath && !fs.realpathSync(parentPath).startsWith(`${root}${path.sep}`)) throw journalError("p2_recovery_conflict", "P2 source parent is unsafe");
  const original = fileSnapshot(root, normalizedPath, { allowMissing: true });
  const originalState = original === null ? "absent" : "present";
  if (original !== null && original.links !== "1") throw journalError("p2_recovery_conflict", "P2 source has an unsupported link count");
  if (!expectedState || !["absent", "present"].includes(expectedState.state) || (expectedState.state === "present" && !/^[a-f0-9]{64}$/.test(expectedState.sha256 || "")) || (expectedState.state === "absent" && original !== null) || (expectedState.state === "present" && (original === null || original.sha256 !== expectedState.sha256))) throw journalError("source_state_changed", "P2 source changed before promotion");
  const operationId = crypto.randomBytes(16).toString("hex");
  const processId = process.pid;
  const createdAt = Date.now();
  const basename = path.basename(targetPath);
  const prefix = `.${basename}.${processId}.${createdAt}.${operationId}`;
  const stageRelativePath = path.relative(root, path.join(parentPath, `${prefix}.tmp`)).split(path.sep).join("/");
  const backupRelativePath = path.relative(root, path.join(parentPath, `${prefix}.tmp.backup`)).split(path.sep).join("/");
  const stagePath = path.join(root, ...stageRelativePath.split("/"));
  const backupPath = path.join(root, ...backupRelativePath.split("/"));
  fs.writeFileSync(stagePath, content, { flag: "wx", mode: original === null ? 0o644 : original.mode });
  if (original !== null) fs.chmodSync(stagePath, original.mode);
  const staged = fileSnapshot(root, stageRelativePath, { requiredLinks: 1 });
  const journal = {
    version: journalVersion,
    workspaceHash,
    approvalIdHash,
    executionIdHash,
    changeSetHash,
    transactionId: operationId,
    processId,
    createdAt,
    caller: "codex_profile_edit_pilot",
    model: p2PreparedEditPolicy.model,
    contentSha256: digest(content),
    relativePath: normalizedPath,
    originalState,
    original: original === null ? null : { identity: original.identity, mode: original.mode, size: original.size, sha256: original.sha256 },
    staged: { identity: staged.identity, mode: staged.mode, size: staged.size, sha256: staged.sha256 },
    stageRelativePath,
    backupRelativePath,
    decision: "pending",
    phase: "prepared",
    sequence: 0
  };
  try {
    publishJournal(filePath, journal, true);
    const current = fileSnapshot(root, normalizedPath, { allowMissing: true });
    if (originalState === "present" && !matchesSnapshot(current, original, 1)) throw journalError("source_state_changed", "P2 source changed before promotion");
    if (originalState === "absent" && current !== null) throw journalError("source_state_changed", "P2 target appeared before promotion");
    if (originalState === "present") {
      if (exists(backupPath)) throw journalError("p2_recovery_conflict", "P2 backup path already exists");
      fs.linkSync(targetPath, backupPath);
      const linkedSource = fileSnapshot(root, normalizedPath, { requiredLinks: 2 });
      const linkedBackup = fileSnapshot(root, backupRelativePath, { requiredLinks: 2 });
      if (!matchesSnapshot(linkedSource, original, 2) || !matchesSnapshot(linkedBackup, original, 2)) throw journalError("p2_recovery_conflict", "P2 backup identity could not be verified");
      fs.unlinkSync(targetPath);
    }
    let currentJournal = updateJournal(filePath, journal, { phase: originalState === "present" ? "backup_moved" : "prepared" });
    if (originalState === "present" && !matchesSnapshot(fileSnapshot(root, backupRelativePath), original, 1)) throw journalError("p2_recovery_conflict", "P2 backup identity could not be verified");
    fs.linkSync(stagePath, targetPath);
    currentJournal = updateJournal(filePath, currentJournal, { phase: "target_linked" });
    fs.unlinkSync(stagePath);
    currentJournal = updateJournal(filePath, currentJournal, { phase: "stage_removed" });
    const promoted = fileSnapshot(root, normalizedPath, { requiredLinks: 1 });
    if (!matchesSnapshot(promoted, journal.staged, 1)) throw journalError("p2_recovery_conflict", "P2 promoted file verification failed");
    currentJournal = updateJournal(filePath, currentJournal, { decision: "commit", phase: "cleanup_pending" });
    if (originalState === "present") cleanupRecordedFile(root, backupRelativePath, journal.original);
    updateJournal(filePath, currentJournal, { phase: "terminal" });
    return { applied: true, cleanupFailed: false, journalId: approvalIdHash };
  } catch (error) {
    if (exists(filePath)) {
      try {
        const stored = readJournal(filePath, workspaceHash, approvalIdHash);
        const recovery = resolveJournal(root, filePath, stored);
        if (recovery.decision === "commit") return { applied: true, cleanupFailed: false, journalId: approvalIdHash };
      } catch {
        error.failureClass = "recovery_required";
        error.cleanupIncomplete = true;
      }
    } else {
      try {
        cleanupRecordedFile(root, stageRelativePath, journal.staged);
      } catch {
        error.cleanupIncomplete = true;
      }
    }
    throw error;
  }
}

export function recoverP2PreparedChanges({ sourceRoot, journalDirectory, workspaceHash }) {
  const root = fs.realpathSync(sourceRoot);
  const directory = ensureJournalDirectory(journalDirectory);
  const entries = fs.readdirSync(directory);
  for (const entry of entries.filter((candidate) => candidate.endsWith(".next"))) {
    const match = /^([a-f0-9]{64})\.json\.[0-9]+\.[a-f0-9]{16}\.next$/.exec(entry);
    if (!match || !entries.includes(`${match[1]}.json`)) return { outcome: "conflict", failureClass: "p2_journal_invalid" };
    try {
      const temporaryStatus = fs.lstatSync(path.join(directory, entry), { bigint: true });
      if (!temporaryStatus.isFile() || temporaryStatus.isSymbolicLink() || temporaryStatus.nlink !== 1n || temporaryStatus.size > BigInt(maximumJournalBytes)) return { outcome: "conflict", failureClass: "p2_journal_invalid" };
    } catch {
      return { outcome: "conflict", failureClass: "p2_journal_invalid" };
    }
  }
  const journalEntries = entries.filter((entry) => entry.endsWith(".json")).sort();
  const outcomes = [];
  for (const entry of journalEntries) {
    const match = /^([a-f0-9]{64})\.json$/.exec(entry);
    if (!match) return { outcome: "conflict", failureClass: "p2_journal_invalid" };
    try {
      const filePath = path.join(directory, entry);
      const journal = readJournal(filePath, workspaceHash, match[1]);
      if (journal.relativePath !== p2PreparedEditPolicy.relativePath) throw journalError("p2_journal_invalid", "P2 recovery target is not permitted");
      outcomes.push(resolveJournal(root, filePath, journal));
    } catch (error) {
      return { outcome: "conflict", failureClass: error.failureClass || "p2_recovery_conflict", recovered: outcomes.length };
    }
  }
  if (outcomes.length === 0) return { outcome: "no_work", recovered: 0 };
  return { outcome: outcomes.some((item) => item.outcome === "recovered") ? "recovered" : "already_terminal", recovered: outcomes.length };
}
