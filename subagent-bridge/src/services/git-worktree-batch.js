import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { operatingSystemErrorCodeValues } from "../schemas/core-schemas.js";

const safeVerificationCommand = "git diff --check";

function hashValue(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function runGit(workspace, args, options = {}) {
  return execFileSync("git", args, {
    cwd: workspace,
    encoding: options.encoding || "utf8",
    timeout: options.timeoutMs || 60000,
    maxBuffer: options.maxBuffer || 64 * 1024 * 1024,
    env: options.env || process.env,
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function normalizeRelativePath(value) {
  return value.replaceAll("\\", "/").replace(/^\.\//, "");
}

function isPathWithinRoot(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === ""
    || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function createDirectoryAnchor(directory) {
  const realPath = fs.realpathSync(directory);
  const status = fs.statSync(realPath);
  if (!status.isDirectory()) throw new Error("workspace root is not a directory");
  return { path: realPath, dev: status.dev, ino: status.ino };
}

function isDirectoryAnchorStable(anchor) {
  try {
    const realPath = fs.realpathSync(anchor.path);
    const entryStatus = fs.lstatSync(anchor.path);
    const status = fs.statSync(anchor.path);
    return realPath === anchor.path
      && !entryStatus.isSymbolicLink()
      && status.isDirectory()
      && status.dev === anchor.dev
      && status.ino === anchor.ino;
  } catch {
    return false;
  }
}

function inspectContainedPath(workspace, relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  const segments = normalized.split("/");
  if (!normalized || normalized.startsWith("/") || /^[a-zA-Z]:/.test(normalized) || segments.some((segment) => !segment || segment === "." || segment === "..")) {
    return { ok: false, reason: "path_rejected", path: normalized };
  }
  let root;
  try {
    root = fs.realpathSync(workspace);
  } catch {
    return { ok: false, reason: "workspace_unavailable", path: normalized };
  }
  const candidate = path.resolve(root, ...segments);
  if (!isPathWithinRoot(root, candidate)) return { ok: false, reason: "path_rejected", path: normalized };
  let current = root;
  for (let index = 0; index < segments.length; index += 1) {
    current = path.join(current, segments[index]);
    let status;
    try {
      status = fs.lstatSync(current);
    } catch (error) {
      if (error.code === "ENOENT") return { ok: true, state: "absent", path: candidate };
      return { ok: false, reason: "path_unreadable", path: normalized };
    }
    if (status.isSymbolicLink()) return { ok: false, reason: "symlink_rejected", path: normalized };
    let realPath;
    try {
      realPath = fs.realpathSync(current);
    } catch {
      return { ok: false, reason: "path_unreadable", path: normalized };
    }
    if (!isPathWithinRoot(root, realPath)) return { ok: false, reason: "path_escape_rejected", path: normalized };
    if (index < segments.length - 1 && !status.isDirectory()) return { ok: false, reason: "path_parent_rejected", path: normalized };
    if (index === segments.length - 1) return { ok: true, state: "present", path: current, status };
  }
  return { ok: false, reason: "path_rejected", path: normalized };
}

function parseStatusEntries(porcelain) {
  const entries = [];
  for (const line of porcelain.split("\n")) {
    if (!line.trim()) continue;
    const status = line.slice(0, 2);
    let filePath = line.slice(3).trim();
    if (filePath.includes(" -> ")) filePath = filePath.split(" -> ").pop().trim();
    const normalized = normalizeRelativePath(filePath.replace(/^"|"$/g, ""));
    entries.push({ status, path: normalized, untracked: status === "??" });
  }
  return entries;
}

function changeTypeFor(entry) {
  if (entry.untracked || entry.status.includes("A")) return "created";
  if (entry.status.includes("D")) return "deleted";
  return "modified";
}

function fileModeFromStatus(status) {
  return (status.mode & 0o111) === 0 ? "100644" : "100755";
}

function permissionsFromFileMode(fileMode) {
  if (fileMode === "100644") return 0o644;
  if (fileMode === "100755") return 0o755;
  throw new Error("promotion file mode is invalid");
}

function createIsolatedGitEnvironment() {
  return {
    PATH: process.env.PATH || "",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
    GIT_CONFIG_SYSTEM: process.platform === "win32" ? "NUL" : "/dev/null",
    GIT_ATTR_NOSYSTEM: "1",
    GIT_TERMINAL_PROMPT: "0",
    GIT_OPTIONAL_LOCKS: "0",
    ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
    ...(process.env.WINDIR ? { WINDIR: process.env.WINDIR } : {})
  };
}

function readLocalGitFilterNames(workspace) {
  const result = spawnSync("git", ["config", "--local", "--includes", "--name-only", "--get-regexp", "^filter\\..*\\.(clean|smudge|process)$"], {
    cwd: workspace,
    encoding: "utf8",
    timeout: 10000,
    maxBuffer: 1024 * 1024,
    env: createIsolatedGitEnvironment()
  });
  if (result.error) throw result.error;
  if (result.status === 1 && !result.stdout) return [];
  if (result.status !== 0) throw new Error("Git filter configuration could not be checked safely");
  const names = new Set();
  for (const key of result.stdout.split(/\r?\n/).filter(Boolean)) {
    const match = /^filter\.([A-Za-z0-9_.-]+)\.(?:clean|smudge|process)$/i.exec(key);
    if (!match) throw new Error("Git filter configuration contains an invalid name");
    names.add(match[1]);
    if (names.size > 64) throw new Error("Git filter configuration exceeds the supported limit");
  }
  return [...names];
}

export function integrationPayloadHash(changes) {
  const payload = changes
    .map((change) => ({
      relativePath: change.relativePath,
      mode: change.mode,
      fileMode: change.fileMode,
      contentBase64: change.contentBase64
    }))
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  return hashValue(JSON.stringify(payload));
}

export function integrationApprovalHash(diffPreviewHash, changePayloadHash) {
  return hashValue(JSON.stringify({ diffPreviewHash, changePayloadHash }));
}

function integrationDiffHash(diff, changes) {
  const diffPreviewHash = hashValue(diff);
  const changePayloadHash = integrationPayloadHash(changes);
  return {
    diffHash: integrationApprovalHash(diffPreviewHash, changePayloadHash),
    diffPreviewHash,
    changePayloadHash
  };
}

function classifyGitFailure(error) {
  const message = `${error?.message || ""}\n${error?.stderr || ""}`.toLowerCase();
  if (/ntcreatedirectoryobject|failed to start|unable to start/.test(message)) return "process_start";
  if (/permission denied|access is denied|operation not permitted/.test(message)) return "filesystem_permission";
  if (/index\.lock|could not lock/.test(message)) return "git_lock";
  if (/not a git repository|repository.*not found/.test(message)) return "git_repository";
  if (/bad object|invalid object|bad revision|unknown revision/.test(message)) return "git_object";
  if (/pathspec|invalid path/.test(message)) return "git_path";
  if (/index/.test(message)) return "git_index";
  return "git_process_error";
}

export function createGitWorktreeBatchManager({
  sourceWorkspace,
  worktreeRoot,
  verificationCommands = [],
  runGitCommand = runGit,
  runVerificationCommand = null,
  writePromotionFile = fs.writeFileSync,
  renamePromotionFile = fs.renameSync,
  removePromotionFile = (filePath, options) => fs.rmSync(filePath, options),
  removeTaskPath = (filePath, options) => fs.rmSync(filePath, options),
  restorePromotionFile = fs.writeFileSync,
  maxFilesChanged = 100,
  maxFileBytes = 524288,
  maxTotalDiffBytes = 2097152
} = {}) {
  if (!sourceWorkspace) throw new Error("source workspace is required");
  if (!worktreeRoot) throw new Error("worktree root is required");
  const heldDiffs = new Map();
  const taskWorktreeStates = new Map();
  const sourceWorkspaceAnchor = createDirectoryAnchor(sourceWorkspace);
  const sourceWorkspaceHash = hashValue(sourceWorkspaceAnchor.path);
  const promotionJournalDirectory = path.join(worktreeRoot, "promotion-journals", sourceWorkspaceHash);
  const disabledHooksDirectory = path.join(promotionJournalDirectory, "disabled-hooks");
  fs.mkdirSync(disabledHooksDirectory, { recursive: true, mode: 0o700 });
  const disabledHooksAnchor = createDirectoryAnchor(disabledHooksDirectory);
  const recoveredCommittedPromotions = new Map();
  let promotionRecoveryRequired = true;
  fs.mkdirSync(promotionJournalDirectory, { recursive: true, mode: 0o700 });

  function ensureDisabledHooksDirectory() {
    if (!isDirectoryAnchorStable(disabledHooksAnchor) || fs.readdirSync(disabledHooksDirectory).length > 0) {
      throw new Error("disabled Git hooks directory is not empty or stable");
    }
  }

  const executeHostVerification = runVerificationCommand || ((workspace) => {
    const options = {
      env: createIsolatedGitEnvironment(),
      timeoutMs: 120000,
      maxBuffer: 16 * 1024 * 1024
    };
    const hooksPathArgument = ["-c", `core.hooksPath=${disabledHooksDirectory}`, "-c", `core.autocrlf=${process.platform === "win32" ? "true" : "false"}`];
    let workingTreeOutput;
    try {
      workingTreeOutput = runGitCommand(workspace, [...hooksPathArgument, "-c", "core.fsmonitor=false", "-c", "core.untrackedCache=false", "--no-pager", "diff", "--no-ext-diff", "--no-textconv", "--check"], options);
    } catch (error) {
      error.verificationStage = "working_tree";
      throw error;
    }
    let indexOutput;
    try {
      indexOutput = runGitCommand(workspace, [...hooksPathArgument, "-c", "core.fsmonitor=false", "-c", "core.untrackedCache=false", "--no-pager", "diff", "--no-ext-diff", "--no-textconv", "--cached", "--check"], options);
    } catch (error) {
      error.verificationStage = "index";
      throw error;
    }
    return `${workingTreeOutput}${indexOutput}`;
  });

  function git(args, options) {
    return gitAt(sourceWorkspace, args, options);
  }

  function gitAt(workspace, args, options) {
    ensureDisabledHooksDirectory();
    const autocrlf = process.platform === "win32" ? "true" : "false";
    const filterOverrides = readLocalGitFilterNames(workspace).flatMap((name) => [
      "-c", `filter.${name}.clean=`,
      "-c", `filter.${name}.smudge=`,
      "-c", `filter.${name}.process=`,
      "-c", `filter.${name}.required=false`
    ]);
    return runGitCommand(workspace, ["-c", `core.hooksPath=${disabledHooksDirectory}`, "-c", "core.fsmonitor=false", "-c", "core.untrackedCache=false", "-c", `core.autocrlf=${autocrlf}`, ...filterOverrides, ...args], {
      ...options,
      env: createIsolatedGitEnvironment()
    });
  }

  function stageRawFile(workspace, relativePath, fileMode) {
    if (!["100644", "100755"].includes(fileMode)) throw new Error("promotion file mode is invalid");
    let objectId;
    try {
      objectId = gitAt(workspace, ["hash-object", "-w", `--path=${relativePath}`, "--", relativePath]).trim();
    } catch (error) {
      error.failureOperation = "hash_object";
      throw error;
    }
    if (!/^[a-f0-9]{40,64}$/.test(objectId)) throw new Error("Git returned an invalid object identifier");
    try {
      gitAt(workspace, ["update-index", "--add", "--cacheinfo", fileMode, objectId, relativePath]);
    } catch (error) {
      error.failureOperation = "update_index";
      throw error;
    }
  }

  function inspectSourcePath(relativePath) {
    if (!isDirectoryAnchorStable(sourceWorkspaceAnchor)) return { ok: false, reason: "source_workspace_rebound", path: relativePath };
    const inspected = inspectContainedPath(sourceWorkspace, relativePath);
    if (!inspected.ok) return inspected;
    if (!isPathWithinRoot(sourceWorkspaceAnchor.path, inspected.path) || !isDirectoryAnchorStable(sourceWorkspaceAnchor)) {
      return { ok: false, reason: "source_workspace_rebound", path: relativePath };
    }
    if (inspected.state === "present" && (!inspected.status.isFile() || inspected.status.nlink !== 1)) {
      return { ok: false, reason: "source_path_rejected", path: relativePath };
    }
    return inspected;
  }

  function syncFile(filePath) {
    const fileDescriptor = fs.openSync(filePath, "r+");
    try {
      fs.fsyncSync(fileDescriptor);
    } finally {
      fs.closeSync(fileDescriptor);
    }
  }

  function syncDirectory(directoryPath) {
    if (process.platform === "win32") return;
    const fileDescriptor = fs.openSync(directoryPath, "r");
    try {
      fs.fsyncSync(fileDescriptor);
    } finally {
      fs.closeSync(fileDescriptor);
    }
  }

  function promotionJournalPath(batchId) {
    if (!/^[a-f0-9]{16,64}$/.test(batchId)) throw new Error("promotion batch identifier is invalid");
    return path.join(promotionJournalDirectory, `${batchId}.json`);
  }

  function promotionCommitPath(batchId) {
    if (!/^[a-f0-9]{16,64}$/.test(batchId)) throw new Error("promotion batch identifier is invalid");
    return path.join(promotionJournalDirectory, `${batchId}.commit.json`);
  }

  function writeDurableJson(filePath, value, assertOwner = () => true) {
    const temporaryPath = `${filePath}.${crypto.randomUUID()}.tmp`;
    let fileDescriptor;
    try {
      assertPromotionOwner(assertOwner);
      fileDescriptor = fs.openSync(temporaryPath, "wx", 0o600);
      fs.writeFileSync(fileDescriptor, `${JSON.stringify(value)}\n`, "utf8");
      assertPromotionOwner(assertOwner);
      fs.fsyncSync(fileDescriptor);
      fs.closeSync(fileDescriptor);
      fileDescriptor = undefined;
      assertPromotionOwner(assertOwner);
      fs.renameSync(temporaryPath, filePath);
      assertPromotionOwner(assertOwner);
      syncDirectory(path.dirname(filePath));
    } catch (error) {
      if (fileDescriptor !== undefined) fs.closeSync(fileDescriptor);
      if (error.failureClass !== "workspace_lock_lost" && assertOwner() === true) fs.rmSync(temporaryPath, { force: true });
      throw error;
    }
  }

  function writePromotionJournal(batchId, journal, assertOwner = () => true) {
    const journalPath = promotionJournalPath(batchId);
    if (fs.existsSync(journalPath) || fs.existsSync(promotionCommitPath(batchId))) throw new Error("promotion journal already exists");
    writeDurableJson(journalPath, journal, assertOwner);
    return hashValue(JSON.stringify(journal));
  }

  function assertPromotionOwner(assertOwner) {
    if (assertOwner() !== true) throw Object.assign(new Error("workspace integration lock was lost"), { failureClass: "workspace_lock_lost" });
  }

  function removePromotionJournal(batchId, assertOwner = () => true) {
    assertPromotionOwner(assertOwner);
    fs.rmSync(promotionJournalPath(batchId), { force: true });
    assertPromotionOwner(assertOwner);
    fs.rmSync(promotionCommitPath(batchId), { force: true });
    assertPromotionOwner(assertOwner);
    syncDirectory(promotionJournalDirectory);
  }

  function readPromotionJournal(batchId) {
    const journalPath = promotionJournalPath(batchId);
    const status = fs.lstatSync(journalPath);
    if (!status.isFile() || status.isSymbolicLink() || status.nlink !== 1 || status.size > 64 * 1024 * 1024) {
      throw new Error("promotion journal is not a bounded regular file");
    }
    const serialized = fs.readFileSync(journalPath, "utf8");
    const journal = JSON.parse(serialized);
    if (![1, 2].includes(journal?.version) || journal.batchId !== batchId || journal.sourceWorkspaceHash !== sourceWorkspaceHash || !["applying", "committed"].includes(journal.phase)) {
      throw new Error("promotion journal metadata is invalid");
    }
    if (!/^[a-f0-9]{64}$/.test(journal.diffHash || "")) throw new Error("promotion journal diff hash is invalid");
    if (!Array.isArray(journal.files) || journal.files.length === 0 || journal.files.length > 100) {
      throw new Error("promotion journal file list is invalid");
    }
    const seenPaths = new Set();
    for (const file of journal.files) {
      const normalized = normalizeRelativePath(file?.relativePath || "");
      if (!normalized || normalized !== file.relativePath || seenPaths.has(normalized)) throw new Error("promotion journal path is invalid");
      seenPaths.add(normalized);
      const segments = normalized.split("/");
      if (segments.some((segment) => !segment || segment === "." || segment === "..") || /^[a-zA-Z]:/.test(normalized)) {
        throw new Error("promotion journal path is invalid");
      }
      const temporaryPath = normalizeRelativePath(file?.temporaryRelativePath || "");
      if (!temporaryPath || temporaryPath !== file.temporaryRelativePath || path.posix.dirname(temporaryPath) !== path.posix.dirname(normalized)) {
        throw new Error("promotion journal temporary path is invalid");
      }
      const temporarySegments = temporaryPath.split("/");
      if (temporarySegments.some((segment) => !segment || segment === "." || segment === "..") || /^[a-zA-Z]:/.test(temporaryPath)) {
        throw new Error("promotion journal temporary path is invalid");
      }
      if (temporaryPath === normalized || !temporarySegments.at(-1).startsWith(`.${path.posix.basename(normalized)}.`) || !temporaryPath.endsWith(".promotion")) {
        throw new Error("promotion journal temporary path is invalid");
      }
      if (file.previousContentBase64 === null) {
        if (file.previousSha256 !== null || (journal.version >= 2 && file.previousFileMode !== null)) throw new Error("promotion journal absence marker is invalid");
      } else {
        if (typeof file.previousContentBase64 !== "string") throw new Error("promotion journal content is invalid");
        const previousContent = Buffer.from(file.previousContentBase64, "base64");
        if (previousContent.toString("base64") !== file.previousContentBase64
          || hashValue(previousContent) !== file.previousSha256) throw new Error("promotion journal content hash is invalid");
        if (journal.version >= 2 && !["100644", "100755"].includes(file.previousFileMode)) throw new Error("promotion journal previous file mode is invalid");
      }
      if (file.promotedState === "absent") {
        if (file.promotedContentBase64 !== null || file.promotedSha256 !== null || (journal.version >= 2 && file.promotedFileMode !== null)) throw new Error("promotion journal promoted absence marker is invalid");
      } else if (file.promotedState === "present") {
        if (typeof file.promotedContentBase64 !== "string") throw new Error("promotion journal promoted content is invalid");
        const promotedContent = Buffer.from(file.promotedContentBase64, "base64");
        if (promotedContent.toString("base64") !== file.promotedContentBase64
          || hashValue(promotedContent) !== file.promotedSha256) throw new Error("promotion journal promoted content hash is invalid");
        if (journal.version >= 2 && !["100644", "100755"].includes(file.promotedFileMode)) throw new Error("promotion journal promoted file mode is invalid");
      } else {
        throw new Error("promotion journal promoted state is invalid");
      }
    }
    for (const file of journal.files) {
      if (seenPaths.has(file.temporaryRelativePath)) throw new Error("promotion journal temporary path overlaps a target");
    }
    if (serialized !== `${JSON.stringify(journal)}\n`) throw new Error("promotion journal encoding is invalid");
    return { journal, journalHash: hashValue(JSON.stringify(journal)) };
  }

  function restorePromotionJournalFile(file, assertOwner = () => true) {
    assertPromotionOwner(assertOwner);
    const temporary = inspectSourcePath(file.temporaryRelativePath);
    if (!temporary.ok) throw new Error("promotion recovery temporary path rejected");
    if (temporary.state === "present") {
      if (!temporary.status.isFile() || temporary.status.nlink !== 1) throw new Error("promotion recovery temporary target is unsafe");
      assertPromotionOwner(assertOwner);
      removePromotionFile(temporary.path, { force: true });
      assertPromotionOwner(assertOwner);
    }
    const inspected = inspectSourcePath(file.relativePath);
    if (!inspected.ok) throw new Error("promotion recovery path rejected");
    const actualState = inspected.state === "absent"
      ? { state: "absent", sha256: null, fileMode: null }
      : inspected.status.isFile() && inspected.status.nlink === 1
        ? { state: "present", sha256: hashValue(fs.readFileSync(inspected.path)), fileMode: fileModeFromStatus(inspected.status) }
        : { state: "rejected", sha256: null, fileMode: null };
    const previousState = file.previousContentBase64 === null ? "absent" : "present";
    const previousMatches = actualState.state === previousState
      && (previousState !== "present" || (actualState.sha256 === file.previousSha256 && (!file.previousFileMode || actualState.fileMode === file.previousFileMode)));
    const promotedMatches = actualState.state === file.promotedState
      && (file.promotedState !== "present" || (actualState.sha256 === file.promotedSha256 && (!file.promotedFileMode || actualState.fileMode === file.promotedFileMode)));
    if (previousMatches) return;
    if (!promotedMatches) throw new Error("promotion recovery target changed independently");
    if (file.previousContentBase64 === null) {
      if (inspected.state === "present") {
        if (!inspected.status.isFile()) throw new Error("promotion recovery target is not a regular file");
        assertPromotionOwner(assertOwner);
        removePromotionFile(inspected.path, { force: true });
        assertPromotionOwner(assertOwner);
        syncDirectory(path.dirname(inspected.path));
      }
      return;
    }
    const previousContent = Buffer.from(file.previousContentBase64, "base64");
    const targetPath = inspected.path;
    assertPromotionOwner(assertOwner);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    assertPromotionOwner(assertOwner);
    const temporaryPath = path.resolve(sourceWorkspace, ...file.temporaryRelativePath.split("/"));
    const previousFileMode = file.previousFileMode || "100644";
    const previousPermissions = permissionsFromFileMode(previousFileMode);
    try {
      assertPromotionOwner(assertOwner);
      restorePromotionFile(temporaryPath, previousContent, { mode: previousPermissions });
      assertPromotionOwner(assertOwner);
      if (process.platform !== "win32") fs.chmodSync(temporaryPath, previousPermissions);
      assertPromotionOwner(assertOwner);
      syncFile(temporaryPath);
      assertPromotionOwner(assertOwner);
      renamePromotionFile(temporaryPath, targetPath);
      assertPromotionOwner(assertOwner);
      syncDirectory(path.dirname(targetPath));
    } catch (error) {
      if (error.failureClass !== "workspace_lock_lost") {
        assertPromotionOwner(assertOwner);
        removePromotionFile(temporaryPath, { force: true });
      }
      throw error;
    }
    const restored = inspectSourcePath(file.relativePath);
    if (!restored.ok || restored.state !== "present" || !restored.status.isFile()) throw new Error("promotion recovery verification failed");
    if (hashValue(fs.readFileSync(restored.path)) !== file.previousSha256
      || (file.previousFileMode && fileModeFromStatus(restored.status) !== file.previousFileMode)) throw new Error("promotion recovery content mismatch");
  }

  function recoverPromotionJournal(batchId, assertOwner = () => true) {
    assertPromotionOwner(assertOwner);
    const journalPath = promotionJournalPath(batchId);
    const commitPath = promotionCommitPath(batchId);
    if (!fs.existsSync(journalPath)) {
      const committed = fs.existsSync(commitPath);
      let marker = null;
      if (committed) {
        const status = fs.lstatSync(commitPath);
        if (!status.isFile() || status.isSymbolicLink() || status.nlink !== 1 || status.size > 4096) throw new Error("promotion commit marker is invalid");
        marker = JSON.parse(fs.readFileSync(commitPath, "utf8"));
        if (marker?.version !== 1 || marker.batchId !== batchId || marker.sourceWorkspaceHash !== sourceWorkspaceHash
          || !/^[a-f0-9]{64}$/.test(marker.diffHash || "") || !/^[a-f0-9]{64}$/.test(marker.journalHash || "")) {
          throw new Error("promotion commit marker binding is invalid");
        }
      }
      if (committed) recoveredCommittedPromotions.set(batchId, marker.diffHash);
      return committed;
    }
    const stored = readPromotionJournal(batchId);
    let committed = false;
    if (fs.existsSync(commitPath)) {
      const commitStatus = fs.lstatSync(commitPath);
      if (!commitStatus.isFile() || commitStatus.isSymbolicLink() || commitStatus.nlink !== 1 || commitStatus.size > 4096) {
        throw new Error("promotion commit marker is invalid");
      }
      const marker = JSON.parse(fs.readFileSync(commitPath, "utf8"));
      if (marker?.version !== 1 || marker.batchId !== batchId || marker.sourceWorkspaceHash !== sourceWorkspaceHash
        || marker.journalHash !== stored.journalHash || marker.diffHash !== stored.journal.diffHash) {
        throw new Error("promotion commit marker binding is invalid");
      }
      committed = true;
    }
    if (committed) {
      recoveredCommittedPromotions.set(batchId, stored.journal.diffHash);
      return true;
    }
    for (const file of stored.journal.files) {
      const inspected = inspectSourcePath(file.relativePath);
      if (!inspected.ok) throw new Error("promotion recovery path rejected");
      const actualState = inspected.state === "absent"
        ? { state: "absent", sha256: null, fileMode: null }
        : inspected.status.isFile() && inspected.status.nlink === 1
          ? { state: "present", sha256: hashValue(fs.readFileSync(inspected.path)), fileMode: fileModeFromStatus(inspected.status) }
          : { state: "rejected", sha256: null, fileMode: null };
      const previousState = file.previousContentBase64 === null ? "absent" : "present";
      const previousMatches = actualState.state === previousState
        && (previousState !== "present" || (actualState.sha256 === file.previousSha256 && (!file.previousFileMode || actualState.fileMode === file.previousFileMode)));
      const promotedMatches = actualState.state === file.promotedState
        && (file.promotedState !== "present" || (actualState.sha256 === file.promotedSha256 && (!file.promotedFileMode || actualState.fileMode === file.promotedFileMode)));
      if (!previousMatches && !promotedMatches) throw new Error("promotion recovery found a conflicting source change");
    }
    for (const file of [...stored.journal.files].reverse()) restorePromotionJournalFile(file, assertOwner);
    removePromotionJournal(batchId, assertOwner);
    return committed;
  }

  function finalizePromotion(batchId, { workspaceHash = sourceWorkspaceHash, diffHash, assertLockOwner = () => true } = {}) {
    let committed;
    try {
      if (workspaceHash !== sourceWorkspaceHash) return { ok: false, reason: "promotion_workspace_mismatch" };
      if (!fs.existsSync(promotionJournalPath(batchId)) && !fs.existsSync(promotionCommitPath(batchId))) {
        recoveredCommittedPromotions.delete(batchId);
        return { ok: true };
      }
      committed = recoverPromotionJournal(batchId, assertLockOwner);
      if (!committed) return { ok: false, reason: "promotion_commit_not_found" };
      const recoveredDiffHash = recoveredCommittedPromotions.get(batchId);
      if (diffHash !== undefined && recoveredDiffHash !== diffHash) return { ok: false, reason: "promotion_diff_mismatch" };
      removePromotionJournal(batchId, assertLockOwner);
      recoveredCommittedPromotions.delete(batchId);
      return { ok: true };
    } catch {
      promotionRecoveryRequired = true;
      return { ok: false, reason: "promotion_recovery_required" };
    }
  }

  function recoverPendingPromotions({ assertLockOwner = () => true } = {}) {
    let recoveryFailed = false;
    const batchIds = new Set();
    for (const entry of fs.readdirSync(promotionJournalDirectory)) {
      const journalMatch = /^([a-f0-9]{16,64})\.json$/.exec(entry);
      const commitMatch = /^([a-f0-9]{16,64})\.commit\.json$/.exec(entry);
      if (journalMatch) batchIds.add(journalMatch[1]);
      if (commitMatch) batchIds.add(commitMatch[1]);
    }
    for (const batchId of batchIds) {
      try {
        recoverPromotionJournal(batchId, assertLockOwner);
      } catch {
        recoveryFailed = true;
      }
    }
    promotionRecoveryRequired = recoveryFailed;
    return { ok: !recoveryFailed, reason: recoveryFailed ? "promotion_recovery_required" : null };
  }

  function hasPendingPromotions() {
    return fs.readdirSync(promotionJournalDirectory).some((entry) => /^[a-f0-9]{16,64}(?:\.commit)?\.json$/.test(entry));
  }

  function completePromotionRecoveryIfEmpty() {
    if (hasPendingPromotions()) return { ok: false, reason: "promotion_recovery_pending" };
    promotionRecoveryRequired = false;
    return { ok: true, reason: null };
  }

  function capturePromotionJournal(batchId, integration) {
    const files = integration.changes.map((change) => {
      const inspected = inspectSourcePath(change.relativePath);
      if (!inspected.ok) throw Object.assign(new Error("promotion journal path rejected"), { failureClass: inspected.reason });
      const temporaryRelativePath = path.posix.join(path.posix.dirname(change.relativePath), `.${path.posix.basename(change.relativePath)}.${crypto.randomUUID()}.promotion`);
      let previousContentBase64 = null;
      let previousSha256 = null;
      let previousFileMode = null;
      if (inspected.state === "present") {
        if (!inspected.status.isFile() || inspected.status.nlink !== 1) throw Object.assign(new Error("promotion journal target rejected"), { failureClass: "promotion_target_rejected" });
        const previousContent = fs.readFileSync(inspected.path);
        previousContentBase64 = previousContent.toString("base64");
        previousSha256 = hashValue(previousContent);
        previousFileMode = fileModeFromStatus(inspected.status);
      }
      const promotedContent = change.mode === "delete" ? null : Buffer.from(change.contentBase64, "base64");
      const promotedFileMode = promotedContent === null ? null : change.fileMode;
      if (promotedContent !== null && !["100644", "100755"].includes(promotedFileMode)) {
        throw Object.assign(new Error("promotion file mode is invalid"), { failureClass: "promotion_file_mode_invalid" });
      }
      return {
        relativePath: change.relativePath,
        temporaryRelativePath,
        previousContentBase64,
        previousSha256,
        previousFileMode,
        promotedState: promotedContent === null ? "absent" : "present",
        promotedContentBase64: promotedContent?.toString("base64") ?? null,
        promotedSha256: promotedContent === null ? null : hashValue(promotedContent),
        promotedFileMode
      };
    });
    const expectedStates = new Map((integration.sourceFileStates || []).map((state) => [state.relativePath, state]));
    for (const file of files) {
      const expected = expectedStates.get(file.relativePath);
      const state = file.previousContentBase64 === null ? "absent" : "present";
      if (!expected || expected.state !== state || (state === "present" && (expected.sha256 !== file.previousSha256 || expected.fileMode !== undefined && expected.fileMode !== file.previousFileMode))) {
        throw Object.assign(new Error("source file changed while preparing promotion recovery"), { failureClass: "source_file_state_changed" });
      }
    }
    return { version: 2, batchId, sourceWorkspaceHash, phase: "applying", diffHash: integration.diffHash, files };
  }

  function isGitRepository() {
    return isDirectoryAnchorStable(sourceWorkspaceAnchor) && fs.existsSync(path.join(sourceWorkspaceAnchor.path, ".git"));
  }

  function applyIntegrationPayload(integrationPath, change) {
    const inspected = inspectContainedPath(integrationPath, change.relativePath);
    if (!inspected.ok) return { ok: false, reason: inspected.reason };
    if (change.mode === "delete") {
      if (inspected.state === "absent") return { ok: true };
      if (!inspected.status.isFile() || inspected.status.isSymbolicLink() || inspected.status.nlink !== 1) {
        return { ok: false, reason: "integration_target_rejected" };
      }
      fs.rmSync(inspected.path, { force: true });
      return { ok: true };
    }
    if (change.mode !== "replace" || typeof change.contentBase64 !== "string" || !["100644", "100755"].includes(change.fileMode)) {
      return { ok: false, reason: "integration_payload_invalid" };
    }
    if (inspected.state === "present" && (!inspected.status.isFile() || inspected.status.isSymbolicLink() || inspected.status.nlink !== 1)) {
      return { ok: false, reason: "integration_target_rejected" };
    }
    const content = Buffer.from(change.contentBase64, "base64");
    if (content.toString("base64") !== change.contentBase64) return { ok: false, reason: "integration_payload_invalid" };
    fs.mkdirSync(path.dirname(inspected.path), { recursive: true });
    const target = inspectContainedPath(integrationPath, change.relativePath);
    if (!target.ok || target.state === "present" && (!target.status.isFile() || target.status.isSymbolicLink() || target.status.nlink !== 1)) {
      return { ok: false, reason: "integration_target_rejected" };
    }
    const temporaryPath = path.join(path.dirname(target.path), `.${path.basename(target.path)}.${crypto.randomUUID()}.integration`);
    const filePermissions = permissionsFromFileMode(change.fileMode);
    try {
      fs.writeFileSync(temporaryPath, content, { flag: "wx", mode: filePermissions });
      if (process.platform !== "win32") fs.chmodSync(temporaryPath, filePermissions);
      fs.renameSync(temporaryPath, target.path);
    } catch (error) {
      fs.rmSync(temporaryPath, { force: true });
      return { ok: false, reason: "integration_payload_write_failed", message: String(error.message).slice(0, 300) };
    }
    const promoted = inspectContainedPath(integrationPath, change.relativePath);
    if (!promoted.ok || promoted.state !== "present" || !promoted.status.isFile() || promoted.status.nlink !== 1
      || hashValue(fs.readFileSync(promoted.path)) !== hashValue(content)
      || fileModeFromStatus(promoted.status) !== change.fileMode) {
      return { ok: false, reason: "integration_payload_mismatch" };
    }
    return { ok: true };
  }

  function captureHead() {
    if (!isDirectoryAnchorStable(sourceWorkspaceAnchor)) throw new Error("source workspace root changed");
    const head = git(["rev-parse", "HEAD"]).trim();
    if (!isDirectoryAnchorStable(sourceWorkspaceAnchor)) throw new Error("source workspace root changed");
    return head;
  }

  function captureRefState() {
    const head = captureHead();
    const refs = git(["for-each-ref", "--format=%(refname):%(objectname)"]);
    if (!isDirectoryAnchorStable(sourceWorkspaceAnchor)) throw new Error("source workspace root changed");
    return { head, refsHash: hashValue(refs) };
  }

  function assertRefStateUnchanged(expectedRefsHash) {
    if (!expectedRefsHash) return { ok: true };
    const current = captureRefState();
    if (current.refsHash !== expectedRefsHash) return { ok: false, reason: "source_ref_changed", head: current.head };
    return { ok: true };
  }

  function assertCleanSource() {
    if (promotionRecoveryRequired) return { ok: false, reason: "promotion_recovery_required" };
    if (!isDirectoryAnchorStable(sourceWorkspaceAnchor)) return { ok: false, reason: "source_workspace_rebound" };
    if (!isGitRepository()) return { ok: false, reason: "source_workspace_not_git" };
    const porcelain = git(["status", "--porcelain=v1", "--untracked-files=all"]);
    if (!isDirectoryAnchorStable(sourceWorkspaceAnchor)) return { ok: false, reason: "source_workspace_rebound" };
    if (porcelain.trim().length > 0) return { ok: false, reason: "source_workspace_dirty" };
    return { ok: true, head: captureHead() };
  }

  function worktreePathFor(batchId, taskId) {
    return path.join(worktreeRoot, batchId, taskId);
  }

  function taskRepositoryPathFor(batchId, taskId) {
    return path.join(worktreeRoot, batchId, ".task-repositories", taskId);
  }

  function taskWorktreeKey(worktreePath) {
    return path.resolve(worktreePath).toLocaleLowerCase("en-US");
  }

  function readTaskWorktreeState(worktreePath, repositoryPath) {
    const markerPath = path.join(worktreePath, ".git");
    const gitDirectory = path.join(repositoryPath, ".git");
    const configPath = path.join(gitDirectory, "config");
    const infoDirectory = path.join(gitDirectory, "info");
    const attributesPath = path.join(infoDirectory, "attributes");
    const markerStatus = fs.lstatSync(markerPath);
    const configStatus = fs.lstatSync(configPath);
    const infoStatus = fs.lstatSync(infoDirectory);
    if (!markerStatus.isFile() || markerStatus.isSymbolicLink() || markerStatus.nlink !== 1
      || !configStatus.isFile() || configStatus.isSymbolicLink() || configStatus.nlink !== 1
      || !infoStatus.isDirectory() || infoStatus.isSymbolicLink()) return null;
    let attributesHash = null;
    try {
      const attributesStatus = fs.lstatSync(attributesPath);
      if (!attributesStatus.isFile() || attributesStatus.isSymbolicLink() || attributesStatus.nlink !== 1 || attributesStatus.size > 65536) return null;
      attributesHash = crypto.createHash("sha256").update(fs.readFileSync(attributesPath)).digest("hex");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    return {
      markerHash: crypto.createHash("sha256").update(fs.readFileSync(markerPath)).digest("hex"),
      configHash: crypto.createHash("sha256").update(fs.readFileSync(configPath)).digest("hex"),
      attributesHash,
      repositoryPath
    };
  }

  function verifyTaskWorktreeState(worktreePath) {
    const expected = taskWorktreeStates.get(taskWorktreeKey(worktreePath));
    if (!expected) return { ok: false, reason: "task_git_metadata_unavailable" };
    try {
      const current = readTaskWorktreeState(worktreePath, expected.repositoryPath);
      if (!current || current.markerHash !== expected.markerHash || current.configHash !== expected.configHash || current.attributesHash !== expected.attributesHash) {
        return { ok: false, reason: "task_git_metadata_changed" };
      }
    } catch {
      return { ok: false, reason: "task_git_metadata_unreadable" };
    }
    return { ok: true };
  }

  function assertTaskWorktreeIntegrity({ batchId, taskId, worktreePath }) {
    const expected = taskWorktreeStates.get(taskWorktreeKey(worktreePath));
    if (!expected || expected.batchId !== batchId || expected.taskId !== taskId) return { ok: false, reason: "task_git_metadata_unavailable" };
    return verifyTaskWorktreeState(worktreePath);
  }

  function createTaskWorktree({ batchId, taskId, baseCommit }) {
    if (!isDirectoryAnchorStable(sourceWorkspaceAnchor)) return { ok: false, reason: "source_workspace_rebound" };
    if (!isGitRepository()) return { ok: false, reason: "source_workspace_not_git" };
    const worktreePath = worktreePathFor(batchId, taskId);
    const repositoryPath = taskRepositoryPathFor(batchId, taskId);
    let hostOperation = "prepare_directories";
    try {
      fs.mkdirSync(path.dirname(worktreePath), { recursive: true });
      fs.mkdirSync(path.dirname(repositoryPath), { recursive: true });
      hostOperation = "clone";
      git(["clone", "--shared", "--quiet", sourceWorkspaceAnchor.path, repositoryPath]);
      if (!isDirectoryAnchorStable(sourceWorkspaceAnchor)) throw Object.assign(new Error("source workspace root changed"), { failureClass: "source_workspace_rebound" });
      hostOperation = "remove_origin";
      gitAt(repositoryPath, ["remote", "remove", "origin"]);
      hostOperation = "add_worktree";
      gitAt(repositoryPath, ["worktree", "add", "--detach", "--quiet", worktreePath, baseCommit]);
      hostOperation = "capture_git_metadata";
      const repositoryState = readTaskWorktreeState(worktreePath, repositoryPath);
      if (!repositoryState) throw new Error("task Git metadata could not be captured");
      if (!isDirectoryAnchorStable(sourceWorkspaceAnchor)) throw Object.assign(new Error("source workspace root changed"), { failureClass: "source_workspace_rebound" });
      taskWorktreeStates.set(taskWorktreeKey(worktreePath), { ...repositoryState, batchId, taskId });
    } catch (error) {
      try {
        removeTaskPath(worktreePath, { recursive: true, force: true });
      } catch {
      }
      try {
        removeTaskPath(repositoryPath, { recursive: true, force: true });
      } catch {
      }
      return {
        ok: false,
        reason: error.failureClass || "worktree_create_failed",
        diagnostics: {
          failureStage: "workspace_setup",
          providerCode: error.code === "ENOENT" ? "executable_missing" : "process_error",
          osErrorCode: operatingSystemErrorCodeValues.includes(error.code) ? error.code : null,
          processExitCode: Number.isInteger(error.status) ? error.status : null,
          hostOperation,
          gitFailureCode: classifyGitFailure(error)
        }
      };
    }
    return { ok: true, worktreePath, repositoryPath, baseCommit };
  }

  function collectTaskDiff({ worktreePath, allowedPaths = [], prohibitedPaths = [], maxFilesChanged = 100, maxTotalDiffBytes = 2097152, maxFileBytes = 524288 }) {
    const metadataCheck = verifyTaskWorktreeState(worktreePath);
    if (!metadataCheck.ok) return { ok: false, reason: metadataCheck.reason };
    let porcelain;
    try {
      porcelain = gitAt(worktreePath, ["status", "--porcelain=v1", "--untracked-files=all"]);
    } catch (error) {
      return { ok: false, reason: "worktree_status_failed", message: error.message };
    }
    const entries = parseStatusEntries(porcelain);
    if (entries.length === 0) return { ok: false, reason: "no_changes", filesChanged: [] };
    if (entries.length > maxFilesChanged) return { ok: false, reason: "max_files_exceeded", filesChanged: entries.map((entry) => entry.path) };
    const allowed = allowedPaths.length > 0 ? new Set(allowedPaths.map(normalizeRelativePath)) : null;
    const prohibited = new Set(prohibitedPaths.map(normalizeRelativePath));
    for (const entry of entries) {
      if (prohibited.has(entry.path)) return { ok: false, reason: "prohibited_path_touched", filesChanged: [entry.path] };
      if (allowed && !allowed.has(entry.path)) return { ok: false, reason: "path_not_allowed", filesChanged: [entry.path] };
      if (entry.path.startsWith(".git/") || entry.path === ".git") return { ok: false, reason: "git_metadata_touched", filesChanged: [entry.path] };
      const safePath = inspectContainedPath(worktreePath, entry.path);
      if (!safePath.ok) return { ok: false, reason: safePath.reason, filesChanged: [entry.path] };
    }
    for (const entry of entries) {
      const filePath = path.resolve(worktreePath, ...entry.path.split("/"));
      try {
        const status = fs.lstatSync(filePath);
        if (status.isSymbolicLink()) return { ok: false, reason: "symlink_rejected", filesChanged: [entry.path] };
        if (status.isFile() && status.size > maxFileBytes) return { ok: false, reason: "file_size_exceeded", filesChanged: [entry.path] };
      } catch {
      }
    }
    let failureOperation = "change_manifest";
    try {
      try {
        gitAt(worktreePath, ["read-tree", "HEAD"]);
      } catch (error) {
        error.failureOperation = "read_tree";
        throw error;
      }
      const changes = entries.map((entry) => {
        const filePath = path.join(worktreePath, ...entry.path.split("/"));
        const exists = fs.existsSync(filePath);
        let contentBase64 = null;
        let fileMode = null;
        let mode = "replace";
        if (!exists) mode = "delete";
        else {
          const status = fs.lstatSync(filePath);
          if (!status.isFile() || status.isSymbolicLink()) throw new Error("task diff path is not a regular file");
          contentBase64 = fs.readFileSync(filePath).toString("base64");
          fileMode = fileModeFromStatus(status);
        }
        return { relativePath: entry.path, mode, fileMode, contentBase64, changeType: changeTypeFor(entry) };
      });
      for (const change of changes) {
        if (change.mode !== "delete") {
          try {
            stageRawFile(worktreePath, change.relativePath, change.fileMode);
          } catch (error) {
            error.failureOperation ||= "index_stage";
            throw error;
          }
        }
      }
      failureOperation = "diff_render";
      const diff = gitAt(worktreePath, ["diff", "--binary", "--no-color", "--no-ext-diff", "--no-textconv", "HEAD", "--", ...entries.map((entry) => entry.path)], { maxBuffer: 64 * 1024 * 1024 });
      const diffBytes = Buffer.byteLength(diff, "utf8");
      if (diffBytes > maxTotalDiffBytes) return { ok: false, reason: "diff_size_exceeded", filesChanged: entries.map((entry) => entry.path) };
      return {
        ok: true,
        diff,
        diffHash: hashValue(diff),
        filesChanged: entries.map((entry) => entry.path),
        changes
      };
    } catch (error) {
      return {
        ok: false,
        reason: "diff_collect_failed",
        diagnostics: {
          failureStage: "workspace_setup",
          providerCode: error.code === "ENOENT" ? "executable_missing" : error.code === "ETIMEDOUT" ? "timeout" : "process_error",
          osErrorCode: operatingSystemErrorCodeValues.includes(error.code) ? error.code : null,
          processExitCode: Number.isInteger(error.status) ? error.status : null,
          hostOperation: error.failureOperation || failureOperation,
          gitFailureCode: classifyGitFailure(error)
        }
      };
    }
  }

  function cleanupTaskWorktree({ batchId, taskId }) {
    const worktreePath = worktreePathFor(batchId, taskId);
    const repositoryPath = taskRepositoryPathFor(batchId, taskId);
    const metadataCheck = verifyTaskWorktreeState(worktreePath);
    if (metadataCheck.ok) {
      try {
        gitAt(repositoryPath, ["worktree", "remove", "--force", worktreePath]);
      } catch {
        try {
          fs.rmSync(worktreePath, { recursive: true, force: true });
          gitAt(repositoryPath, ["worktree", "prune"]);
        } catch {
          return { cleaned: false };
        }
      }
    } else {
      try {
        fs.rmSync(worktreePath, { recursive: true, force: true });
      } catch {
        return { cleaned: false };
      }
    }
    try {
      fs.rmSync(repositoryPath, { recursive: true, force: true });
    } catch {
      return { cleaned: false };
    }
    taskWorktreeStates.delete(taskWorktreeKey(worktreePath));
    return { cleaned: true };
  }

  function runVerification(workspace, commands = verificationCommands) {
    const results = [];
    if (taskWorktreeStates.has(taskWorktreeKey(workspace))) {
      const metadataCheck = verifyTaskWorktreeState(workspace);
      if (!metadataCheck.ok) return { ok: false, reason: metadataCheck.reason, results };
    }
    if (readLocalGitFilterNames(workspace).length > 0) return { ok: false, reason: "verification_filter_config_unsupported", results };
    for (const command of commands) {
      if (!verificationCommands.includes(command)) return { ok: false, reason: "verification_command_not_allowed", results };
      if (command !== safeVerificationCommand) return { ok: false, reason: "verification_command_unsafe", results };
      try {
        const stdout = executeHostVerification(workspace, command);
        results.push({ commandHash: hashValue(command), exitCode: 0, outputBytes: Buffer.byteLength(stdout, "utf8") });
      } catch (error) {
        const outputBytes = Buffer.byteLength(`${error.stdout || ""}${error.stderr || ""}`, "utf8");
        const osErrorCode = operatingSystemErrorCodeValues.includes(error.code) ? error.code : null;
        const failureKind = error.code === "ETIMEDOUT" || error.killed === true
          ? "timeout"
          : error.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER"
            ? "output_limit"
            : osErrorCode !== null
              ? "process_start"
              : Number.isInteger(error.status)
                ? "nonzero_exit"
                : "unknown";
        results.push({
          commandHash: hashValue(command),
          exitCode: Number.isInteger(error.status) ? error.status : 1,
          outputBytes,
          verificationStage: ["working_tree", "index"].includes(error.verificationStage) ? error.verificationStage : null,
          failureKind,
          processExitCode: Number.isInteger(error.status) ? error.status : null,
          osErrorCode
        });
        return { ok: false, reason: "verification_failed", results };
      }
    }
    return { ok: true, results };
  }

  function releaseBatchTaskDiffs(batchId) {
    const prefix = `${batchId}:`;
    for (const key of heldDiffs.keys()) {
      if (key.startsWith(prefix)) heldDiffs.delete(key);
    }
  }

  function prepareIntegration(input) {
    try {
      return prepareIntegrationInternal(input);
    } finally {
      releaseBatchTaskDiffs(input?.batchId);
    }
  }

  function prepareIntegrationInternal({ batchId, baseCommit, tasks, expectedRefHash = null }) {
    if (promotionRecoveryRequired) return { ok: false, reason: "promotion_recovery_required" };
    if (!isGitRepository()) return { ok: false, reason: "source_workspace_not_git" };
    const refCheck = assertRefStateUnchanged(expectedRefHash);
    if (!refCheck.ok) return { ok: false, reason: refCheck.reason };
    const sourceCheck = assertCleanSource();
    if (!sourceCheck.ok || sourceCheck.head !== baseCommit) return { ok: false, reason: sourceCheck.reason || "source_head_changed" };
    const integrationPath = path.join(worktreeRoot, batchId, "integration");
    fs.mkdirSync(path.dirname(integrationPath), { recursive: true });
    try {
      git(["worktree", "add", "--detach", "--quiet", integrationPath, baseCommit]);
    } catch (error) {
      return { ok: false, reason: "integration_worktree_failed", message: String(error.stderr || error.message).trim().slice(0, 500) };
    }
    const accepted = [];
    const expectedChanges = new Map();
    const expectedOwners = new Map();
    try {
      for (const task of tasks) {
        const held = heldDiffs.get(`${batchId}:${task.taskId}`);
        if (!held) {
          if (task.status === "completed") return { ok: false, reason: "task_diff_missing", taskId: task.taskId };
          continue;
        }
        for (const change of held.changes || []) {
          if (expectedChanges.has(change.relativePath)) return { ok: false, reason: "integration_path_ownership_conflict", taskId: task.taskId };
          expectedChanges.set(change.relativePath, change);
          expectedOwners.set(change.relativePath, task.taskId);
        }
        accepted.push(task.taskId);
      }
      if (expectedChanges.size === 0 && accepted.length > 0) return { ok: false, reason: "task_diff_payload_missing" };
      const changes = [...expectedChanges.values()].sort((left, right) => left.relativePath < right.relativePath ? -1 : left.relativePath > right.relativePath ? 1 : 0);
      for (const change of changes) {
        const applied = applyIntegrationPayload(integrationPath, change);
        if (!applied.ok) return { ok: false, reason: applied.reason, taskId: expectedOwners.get(change.relativePath) };
        if (change.mode !== "delete") stageRawFile(integrationPath, change.relativePath, change.fileMode);
      }
      const captureIntegrationFileState = (relativePath) => {
        const inspected = inspectContainedPath(integrationPath, relativePath);
        if (!inspected.ok) return { state: "rejected" };
        if (inspected.state === "absent") return { state: "absent" };
        if (!inspected.status.isFile() || inspected.status.nlink !== 1) return { state: "rejected" };
        return {
          state: "present",
          sha256: hashValue(fs.readFileSync(inspected.path)),
          fileMode: fileModeFromStatus(inspected.status)
        };
      };
      const preVerificationEntries = parseStatusEntries(gitAt(integrationPath, ["status", "--porcelain=v1", "--untracked-files=all"]));
      const preVerificationUnexpected = preVerificationEntries.filter((entry) => !expectedChanges.has(entry.path));
      if (preVerificationUnexpected.length > 0) return { ok: false, reason: "integration_contains_unowned_files", filesChanged: preVerificationUnexpected.map((entry) => entry.path) };
      const preVerificationStates = new Map([...expectedChanges.keys()].map((relativePath) => [relativePath, captureIntegrationFileState(relativePath)]));
      if ([...preVerificationStates.values()].some((state) => state.state === "rejected")) return { ok: false, reason: "integration_file_state_rejected" };
      for (const change of changes) {
        const actualState = preVerificationStates.get(change.relativePath);
        if (change.mode === "delete") {
          if (actualState.state !== "absent") return { ok: false, reason: "integration_payload_mismatch", filesChanged: [change.relativePath] };
        } else if (actualState.state !== "present"
          || actualState.sha256 !== hashValue(Buffer.from(change.contentBase64, "base64"))
          || actualState.fileMode !== change.fileMode) {
          return { ok: false, reason: "integration_payload_mismatch", filesChanged: [change.relativePath] };
        }
      }
      const verification = runVerification(integrationPath);
      if (!verification.ok) return { ok: false, reason: verification.reason, verification: verification.results };
      const listed = parseStatusEntries(gitAt(integrationPath, ["status", "--porcelain=v1", "--untracked-files=all"]));
      const unexpectedPaths = listed.filter((entry) => !expectedChanges.has(entry.path));
      if (unexpectedPaths.length > 0) return { ok: false, reason: "verification_created_unowned_files", filesChanged: unexpectedPaths.map((entry) => entry.path) };
      for (const [relativePath, expectedState] of preVerificationStates) {
        const actualState = captureIntegrationFileState(relativePath);
        if (JSON.stringify(actualState) !== JSON.stringify(expectedState)) {
          return { ok: false, reason: "verification_changed_integration_files", filesChanged: [relativePath] };
        }
      }
      const expectedPaths = changes.map((change) => change.relativePath);
      const diff = gitAt(integrationPath, ["diff", "--binary", "--no-color", "--no-ext-diff", "--no-textconv", "HEAD", "--", ...expectedPaths], { maxBuffer: 64 * 1024 * 1024 });
      if (!diff.trim()) return { ok: false, reason: "integration_empty_diff" };
      const sourceFileStates = captureSourceFileStates(changes.map((change) => change.relativePath));
      if (sourceFileStates.some((state) => state.state === "rejected")) return { ok: false, reason: "source_state_rejected" };
      const approvalHashes = integrationDiffHash(diff, changes);
      return {
        ok: true,
        integrationPath,
        acceptedTaskIds: accepted,
        diffHash: approvalHashes.diffHash,
        diffPreviewHash: approvalHashes.diffPreviewHash,
        changePayloadHash: approvalHashes.changePayloadHash,
        diff,
        filesChanged: changes.map((change) => change.relativePath),
        sourceFileStates,
        changes,
        verification: verification.results
      };
    } finally {
      try {
        git(["worktree", "remove", "--force", integrationPath]);
      } catch {
      }
    }
  }

  function holdTaskDiff({ batchId, taskId, changes }) {
    heldDiffs.set(`${batchId}:${taskId}`, { changes });
  }

  function captureSourceFileStates(relativePaths) {
    return relativePaths.map((relativePath) => {
      const normalized = normalizeRelativePath(relativePath);
      const inspected = inspectSourcePath(normalized);
      if (!inspected.ok) return { relativePath: normalized, state: "rejected" };
      if (inspected.state === "absent") return { relativePath: normalized, state: "absent" };
      if (!inspected.status.isFile()) return { relativePath: normalized, state: "rejected" };
      return { relativePath: normalized, state: "present", sha256: crypto.createHash("sha256").update(fs.readFileSync(inspected.path)).digest("hex"), fileMode: fileModeFromStatus(inspected.status) };
    });
  }

  function captureSourceFileIdentityStates(relativePaths) {
    return relativePaths.map((relativePath) => {
      const normalized = normalizeRelativePath(relativePath);
      const inspected = inspectSourcePath(normalized);
      if (!inspected.ok) return { relativePath: normalized, state: "rejected" };
      if (inspected.state === "absent") return { relativePath: normalized, state: "absent" };
      if (!inspected.status.isFile() || inspected.status.nlink !== 1) return { relativePath: normalized, state: "rejected" };
      const before = inspected.status;
      let descriptor;
      try {
        descriptor = fs.openSync(inspected.path, fs.constants.O_RDONLY);
        const opened = fs.fstatSync(descriptor);
        if (!opened.isFile() || opened.nlink !== 1 || opened.dev !== before.dev || opened.ino !== before.ino) {
          return { relativePath: normalized, state: "rejected" };
        }
        const content = fs.readFileSync(descriptor);
        const after = fs.fstatSync(descriptor);
        const currentPath = fs.lstatSync(inspected.path);
        if (!currentPath.isFile() || currentPath.isSymbolicLink() || currentPath.nlink !== 1
          || after.dev !== before.dev || after.ino !== before.ino || currentPath.dev !== before.dev || currentPath.ino !== before.ino
          || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs
          || after.size !== currentPath.size || after.mtimeMs !== currentPath.mtimeMs || after.ctimeMs !== currentPath.ctimeMs) {
          return { relativePath: normalized, state: "rejected" };
        }
        return {
          relativePath: normalized,
          state: "present",
          sha256: hashValue(content),
          fileMode: fileModeFromStatus(after),
          dev: after.dev,
          ino: after.ino
        };
      } catch {
        return { relativePath: normalized, state: "rejected" };
      } finally {
        if (descriptor !== undefined) fs.closeSync(descriptor);
      }
    });
  }

  function committedFileState(commit, relativePath) {
    if (!/^[a-f0-9]{40,64}$/.test(commit)) return { ok: false, reason: "source_snapshot_invalid" };
    const normalized = normalizeRelativePath(relativePath);
    if (!normalized || normalized !== relativePath || normalized.startsWith("/") || /^[a-zA-Z]:/.test(normalized)
      || normalized.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
      return { ok: false, reason: "source_snapshot_invalid" };
    }
    try {
      const output = git(["ls-tree", "-z", commit, "--", `:(literal)${normalized}`]);
      const records = output.split("\0").filter(Boolean);
      if (records.length === 0) return { ok: true, state: "absent" };
      if (records.length !== 1) return { ok: false, reason: "source_snapshot_invalid" };
      const separator = records[0].indexOf("\t");
      if (separator < 0 || records[0].slice(separator + 1) !== normalized) return { ok: false, reason: "source_snapshot_invalid" };
      const [mode, objectType, objectId] = records[0].slice(0, separator).split(" ");
      if (objectType !== "blob" || !["100644", "100755"].includes(mode) || !/^[a-f0-9]{40,64}$/.test(objectId)) {
        return { ok: false, reason: "source_snapshot_invalid" };
      }
      const content = git(["cat-file", "blob", objectId], { encoding: "buffer" });
      return { ok: true, state: "present", objectId, fileMode: mode, sha256: hashValue(content) };
    } catch {
      return { ok: false, reason: "source_snapshot_invalid" };
    }
  }

  function revalidateIntegration({ batchId, originalBaseCommit, currentBaseCommit, originalSourceFileStates, changes, acceptedTasks, expectedRefHash, expectedDiffHash, expectedDiffPreviewHash, expectedChangePayloadHash }) {
    if (promotionRecoveryRequired) return { ok: false, reason: "promotion_recovery_required" };
    const clean = assertCleanSource();
    if (!clean.ok) return clean;
    if (clean.head !== currentBaseCommit || !/^[a-f0-9]{40,64}$/.test(originalBaseCommit || "")) return { ok: false, reason: "source_head_changed" };
    try {
      git(["merge-base", "--is-ancestor", originalBaseCommit, currentBaseCommit]);
    } catch {
      return { ok: false, reason: "source_head_unrelated" };
    }
    const initialRefState = captureRefState();
    if (initialRefState.head !== currentBaseCommit || initialRefState.refsHash !== expectedRefHash) return { ok: false, reason: "source_ref_changed" };
    if (!/^[a-f0-9]{64}$/.test(expectedDiffHash || "") || !/^[a-f0-9]{64}$/.test(expectedDiffPreviewHash || "")
      || !/^[a-f0-9]{64}$/.test(expectedChangePayloadHash || "")
      || !Array.isArray(changes) || changes.length === 0 || !Array.isArray(acceptedTasks) || acceptedTasks.length === 0
      || changes.length > maxFilesChanged * acceptedTasks.length
      || !Array.isArray(originalSourceFileStates) || originalSourceFileStates.length !== changes.length) {
      return { ok: false, reason: "integration_payload_invalid" };
    }
    const expectedPaths = [...changes].map((change) => change?.relativePath).sort();
    if (expectedPaths.some((relativePath, index) => typeof relativePath !== "string" || (index > 0 && relativePath === expectedPaths[index - 1]))) {
      return { ok: false, reason: "integration_payload_invalid" };
    }
    const oldStates = new Map();
    for (const state of originalSourceFileStates) {
      if (!state || typeof state.relativePath !== "string" || oldStates.has(state.relativePath)
        || !["present", "absent"].includes(state.state)
        || Object.hasOwn(state, "dev") || Object.hasOwn(state, "ino")) {
        return { ok: false, reason: "source_snapshot_invalid" };
      }
      if (state.state === "present" && (!/^[a-f0-9]{64}$/.test(state.sha256 || "") || !["100644", "100755"].includes(state.fileMode))) {
        return { ok: false, reason: "source_snapshot_invalid" };
      }
      const expectedStateKeys = state.state === "present"
        ? ["fileMode", "relativePath", "sha256", "state"]
        : ["relativePath", "state"];
      if (Object.keys(state).sort().join("|") !== expectedStateKeys.join("|")) return { ok: false, reason: "source_snapshot_invalid" };
      if (state.state === "absent" && (Object.hasOwn(state, "sha256") || Object.hasOwn(state, "fileMode"))) {
        return { ok: false, reason: "source_snapshot_invalid" };
      }
      oldStates.set(state.relativePath, state);
    }
    if (oldStates.size !== expectedPaths.length || expectedPaths.some((relativePath) => !oldStates.has(relativePath))) {
      return { ok: false, reason: "source_snapshot_invalid" };
    }
    const currentStates = captureSourceFileIdentityStates(expectedPaths);
    if (currentStates.some((state) => state.state === "rejected")) return { ok: false, reason: "source_state_rejected" };
    for (const relativePath of expectedPaths) {
      const original = oldStates.get(relativePath);
      const originalGit = committedFileState(originalBaseCommit, relativePath);
      const currentGit = committedFileState(currentBaseCommit, relativePath);
      const current = currentStates.find((state) => state.relativePath === relativePath);
      if (!originalGit.ok || !currentGit.ok) return { ok: false, reason: "source_snapshot_invalid" };
      if (original.state !== originalGit.state || original.state !== currentGit.state
        || (original.state === "present" && (original.sha256 !== originalGit.sha256 || original.fileMode !== originalGit.fileMode
          || originalGit.objectId !== currentGit.objectId || originalGit.fileMode !== currentGit.fileMode
          || current.sha256 !== original.sha256 || current.fileMode !== original.fileMode))
        || (original.state === "absent" && current.state !== "absent")) {
        return { ok: false, reason: "source_file_state_changed" };
      }
    }
    const taskOwners = new Map();
    for (const task of acceptedTasks) {
      if (!task || typeof task.taskId !== "string" || task.status !== "completed" || !Array.isArray(task.filesChanged)) {
        return { ok: false, reason: "integration_payload_invalid" };
      }
      for (const relativePath of task.filesChanged) {
        if (taskOwners.has(relativePath)) return { ok: false, reason: "integration_path_ownership_conflict" };
        taskOwners.set(relativePath, task.taskId);
      }
    }
    const changeOwners = new Map();
    for (const change of changes) {
      const relativePath = change?.relativePath;
      if (typeof relativePath !== "string" || taskOwners.get(relativePath) === undefined
        || changeOwners.has(relativePath) || !["replace", "delete"].includes(change.mode)
        || !["created", "modified", "deleted"].includes(change.changeType)) {
        return { ok: false, reason: "integration_payload_invalid" };
      }
      if (Object.keys(change).sort().join("|") !== "changeType|contentBase64|fileMode|mode|relativePath") {
        return { ok: false, reason: "integration_payload_invalid" };
      }
      if (change.mode === "replace") {
        if (!(["100644", "100755"].includes(change.fileMode)) || typeof change.contentBase64 !== "string") return { ok: false, reason: "integration_payload_invalid" };
        const content = Buffer.from(change.contentBase64, "base64");
        if (content.toString("base64") !== change.contentBase64 || content.length > maxFileBytes) return { ok: false, reason: "integration_payload_invalid" };
      } else if (change.fileMode !== null || change.contentBase64 !== null) {
        return { ok: false, reason: "integration_payload_invalid" };
      }
      changeOwners.set(relativePath, taskOwners.get(relativePath));
    }
    if (taskOwners.size !== changeOwners.size || [...taskOwners.keys()].some((relativePath) => !changeOwners.has(relativePath))) {
      return { ok: false, reason: "integration_payload_invalid" };
    }
    for (const task of acceptedTasks) {
      const taskChanges = changes.filter((change) => changeOwners.get(change.relativePath) === task.taskId);
      if (taskChanges.length > 0) holdTaskDiff({ batchId, taskId: task.taskId, changes: taskChanges });
    }
    const preparation = prepareIntegration({
      batchId,
      baseCommit: currentBaseCommit,
      tasks: acceptedTasks,
      expectedRefHash
    });
    if (!preparation.ok) return preparation;
    if (preparation.diffHash !== expectedDiffHash || preparation.diffPreviewHash !== expectedDiffPreviewHash
      || preparation.changePayloadHash !== expectedChangePayloadHash || preparation.changePayloadHash !== integrationPayloadHash(changes)) {
      return { ok: false, reason: "integration_payload_mismatch" };
    }
    if (preparation.filesChanged.length > maxFilesChanged * acceptedTasks.length
      || Buffer.byteLength(preparation.diff, "utf8") > maxTotalDiffBytes * acceptedTasks.length) {
      return { ok: false, reason: "integration_artifact_too_large" };
    }
    const finalRefState = captureRefState();
    const finalSourceStates = captureSourceFileIdentityStates(expectedPaths);
    const finalClean = assertCleanSource();
    if (finalRefState.head !== initialRefState.head || finalRefState.refsHash !== initialRefState.refsHash) return { ok: false, reason: "source_ref_changed" };
    if (!finalClean.ok || finalClean.head !== currentBaseCommit) return { ok: false, reason: finalClean.reason || "source_head_changed" };
    if (finalSourceStates.some((state) => state.state === "rejected")) return { ok: false, reason: "source_state_rejected" };
    if (JSON.stringify(currentStates) !== JSON.stringify(finalSourceStates)) return { ok: false, reason: "source_file_identity_changed" };
    if (preparation.sourceFileStates.some((state, index) => state.relativePath !== currentStates[index].relativePath
      || state.state !== currentStates[index].state
      || (state.state === "present" && (state.sha256 !== currentStates[index].sha256 || state.fileMode !== currentStates[index].fileMode)))) {
      return { ok: false, reason: "source_file_state_changed" };
    }
    return {
      ...preparation,
      baseCommit: currentBaseCommit,
      sourceRefHash: initialRefState.refsHash,
      sourceFileIdentities: currentStates
    };
  }

  function applyIntegration({ batchId, approvalRef, expectedDiffHash, manifest, assertLockOwner = () => true }) {
    if (promotionRecoveryRequired) return { ok: false, reason: "promotion_recovery_required", message: "promotion recovery must finish before another integration" };
    if (assertLockOwner() !== true) return { ok: false, reason: "workspace_lock_lost", message: "workspace integration lock is no longer owned" };
    const integration = manifest.integration;
    if (!integration || integration.diffHash !== expectedDiffHash) return { ok: false, reason: "integration_hash_mismatch", message: "integration diff hash does not match" };
    if (!Array.isArray(integration.changes)
      || integration.changePayloadHash !== integrationPayloadHash(integration.changes)
      || integration.diffHash !== integrationApprovalHash(integration.diffPreviewHash, integration.changePayloadHash)) {
      return { ok: false, reason: "integration_payload_hash_mismatch", message: "integration payload does not match its approval hash" };
    }
    if (!approvalRef || integration.approvalRef !== approvalRef) return { ok: false, reason: "approval_ref_mismatch", message: "approval reference does not match" };
    let currentHead;
    try {
      currentHead = captureHead();
    } catch (error) {
      return { ok: false, reason: "source_head_unavailable", message: error.message };
    }
    if (currentHead !== integration.baseCommit) return { ok: false, reason: "source_head_changed", message: "source HEAD changed after integration preparation" };
    if (integration.sourceRefHash) {
      const refCheck = assertRefStateUnchanged(integration.sourceRefHash);
      if (!refCheck.ok) return { ok: false, reason: refCheck.reason, message: "source refs changed after integration preparation" };
    }
    const beforeStates = captureSourceFileStates(integration.filesChanged);
    if (beforeStates.some((entry) => entry.state === "rejected")) return { ok: false, reason: "source_state_rejected" };
    if (integration.revalidation?.schemaVersion === 1) {
      const expectedIdentities = integration.revalidation.sourceFileIdentities;
      if (!Array.isArray(expectedIdentities) || expectedIdentities.length !== integration.filesChanged.length) {
        return { ok: false, reason: "source_file_identity_changed", message: "source file identity snapshot is unavailable" };
      }
      const currentIdentities = captureSourceFileIdentityStates(integration.filesChanged);
      if (currentIdentities.some((state) => state.state === "rejected")
        || JSON.stringify(currentIdentities) !== JSON.stringify(expectedIdentities)) {
        return { ok: false, reason: "source_file_identity_changed", message: "source files changed after revalidation" };
      }
    }
    if (!Array.isArray(integration.sourceFileStates) || integration.sourceFileStates.length !== beforeStates.length) {
      return { ok: false, reason: "source_state_unavailable", message: "source file state snapshot is missing" };
    }
    const sourceStatesMatch = beforeStates.every((state, index) => {
      const expected = integration.sourceFileStates[index];
      return state.relativePath === expected?.relativePath
        && state.state === expected.state
        && (state.state !== "present" || (state.sha256 === expected.sha256 && (expected.fileMode === undefined || state.fileMode === expected.fileMode)));
    });
    if (!sourceStatesMatch) return { ok: false, reason: "source_file_state_changed", message: "source files changed after integration preparation" };
    let journal;
    try {
      if (assertLockOwner() !== true) return { ok: false, reason: "workspace_lock_lost", message: "workspace integration lock is no longer owned" };
      journal = capturePromotionJournal(batchId, integration);
      assertPromotionOwner(assertLockOwner);
      writePromotionJournal(batchId, journal, assertLockOwner);
      assertPromotionOwner(assertLockOwner);
    } catch (error) {
      return { ok: false, reason: error.failureClass || "promotion_journal_unavailable", message: "durable promotion recovery state could not be prepared" };
    }
    const temporaryPaths = new Set();
    let committed = false;
    try {
      for (const change of integration.changes) {
        assertPromotionOwner(assertLockOwner);
        const beforeCreation = inspectSourcePath(change.relativePath);
        if (!beforeCreation.ok) throw Object.assign(new Error("promotion path rejected"), { failureClass: beforeCreation.reason });
        const candidate = beforeCreation.path;
        assertPromotionOwner(assertLockOwner);
        fs.mkdirSync(path.dirname(candidate), { recursive: true });
        assertPromotionOwner(assertLockOwner);
        const beforeWrite = inspectSourcePath(change.relativePath);
        if (!beforeWrite.ok) throw Object.assign(new Error("promotion path rejected"), { failureClass: beforeWrite.reason });
        if (beforeWrite.state === "present" && !beforeWrite.status.isFile()) throw Object.assign(new Error("promotion target rejected"), { failureClass: "promotion_target_rejected" });
        const journalFile = journal.files.find((file) => file.relativePath === change.relativePath);
        const currentState = beforeWrite.state === "present" ? "present" : "absent";
        const currentHash = currentState === "present" ? hashValue(fs.readFileSync(candidate)) : null;
        const currentFileMode = currentState === "present" ? fileModeFromStatus(beforeWrite.status) : null;
        if (!journalFile || (journalFile.previousContentBase64 === null ? "absent" : "present") !== currentState
          || (currentState === "present" && (journalFile.previousSha256 !== currentHash || journalFile.previousFileMode && journalFile.previousFileMode !== currentFileMode))) {
          throw Object.assign(new Error("source file changed during promotion"), { failureClass: "source_file_state_changed" });
        }
        if (change.mode === "delete") {
          if (beforeWrite.state === "present") {
            assertPromotionOwner(assertLockOwner);
            removePromotionFile(candidate, { force: true });
          }
          assertPromotionOwner(assertLockOwner);
          syncDirectory(path.dirname(candidate));
        } else {
          const temporaryPath = path.resolve(sourceWorkspace, ...journalFile.temporaryRelativePath.split("/"));
          const existingTemporary = inspectSourcePath(journalFile.temporaryRelativePath);
          if (!existingTemporary.ok || existingTemporary.state !== "absent") throw Object.assign(new Error("promotion temporary path is unavailable"), { failureClass: "promotion_path_rejected" });
          temporaryPaths.add(temporaryPath);
          const filePermissions = permissionsFromFileMode(change.fileMode);
          assertPromotionOwner(assertLockOwner);
          writePromotionFile(temporaryPath, Buffer.from(change.contentBase64, "base64"), { mode: filePermissions });
          assertPromotionOwner(assertLockOwner);
          if (process.platform !== "win32") fs.chmodSync(temporaryPath, filePermissions);
          assertPromotionOwner(assertLockOwner);
          syncFile(temporaryPath);
          assertPromotionOwner(assertLockOwner);
          renamePromotionFile(temporaryPath, candidate);
          assertPromotionOwner(assertLockOwner);
          temporaryPaths.delete(temporaryPath);
          syncDirectory(path.dirname(candidate));
        }
      }
      if (assertLockOwner() !== true) throw Object.assign(new Error("workspace integration lock was lost"), { failureClass: "workspace_lock_lost" });
      writeDurableJson(promotionCommitPath(batchId), {
        version: 1,
        batchId,
        sourceWorkspaceHash,
        diffHash: journal.diffHash,
        journalHash: hashValue(JSON.stringify(journal))
      }, assertLockOwner);
      committed = true;
      recoveredCommittedPromotions.set(batchId, journal.diffHash);
    } catch (error) {
      if (error.failureClass === "workspace_lock_lost") {
        promotionRecoveryRequired = true;
        return { ok: false, reason: "workspace_lock_lost", message: "integration recovery must reconcile the durable journal" };
      }
      let rollbackFailed = false;
      let recoveredCommit = false;
      try {
        assertPromotionOwner(assertLockOwner);
        for (const temporaryPath of temporaryPaths) {
          assertPromotionOwner(assertLockOwner);
          removePromotionFile(temporaryPath, { force: true });
        }
        recoveredCommit = recoverPromotionJournal(batchId, assertLockOwner);
      } catch {
        rollbackFailed = true;
        promotionRecoveryRequired = true;
      }
      if (committed || recoveredCommit) {
        return {
          ok: true,
          integration: {
            diffHash: integration.diffHash,
            approvalRef: integration.approvalRef,
            baseCommit: integration.baseCommit,
            filesChanged: integration.filesChanged,
            appliedAt: new Date().toISOString()
          }
        };
      }
      if (rollbackFailed) {
        for (const file of journal.files) {
          const inspected = inspectSourcePath(file.relativePath);
          if (!inspected.ok) promotionRecoveryRequired = true;
        }
      }
      return {
        ok: false,
        reason: rollbackFailed ? "promotion_rollback_failed" : error.failureClass || "promotion_failed",
        message: rollbackFailed ? "integration recovery is pending and source files require recovery" : error.message
      };
    }
    return {
      ok: true,
      integration: {
        diffHash: integration.diffHash,
        approvalRef: integration.approvalRef,
        baseCommit: integration.baseCommit,
        filesChanged: integration.filesChanged,
        appliedAt: new Date().toISOString()
      }
    };
  }

  return {
    isGitRepository,
    captureHead,
    captureRefState,
    assertRefStateUnchanged,
    assertCleanSource,
    createTaskWorktree,
    collectTaskDiff,
    cleanupTaskWorktree,
    prepareIntegration,
    revalidateIntegration,
    captureSourceFileIdentityStates,
    holdTaskDiff,
    releaseBatchTaskDiffs,
    applyIntegration,
    runVerification,
    recoverPendingPromotions,
    hasPendingPromotions,
    completePromotionRecoveryIfEmpty,
    recoveredCommittedPromotionBatchIds: () => [...recoveredCommittedPromotions.keys()],
    recoveredCommittedPromotions: () => [...recoveredCommittedPromotions].map(([batchId, diffHash]) => ({ batchId, diffHash })),
    finalizePromotion,
    promotionRecoveryStatus: () => ({
      ok: !promotionRecoveryRequired && recoveredCommittedPromotions.size === 0,
      reason: promotionRecoveryRequired
        ? "promotion_recovery_required"
        : recoveredCommittedPromotions.size > 0 ? "promotion_reconciliation_required" : null
    })
  };
}
