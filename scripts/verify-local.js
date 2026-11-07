import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createSmokeExecutionContext, removeSyntheticSmokeRoot, syntheticSmokeRootPrefix } from "./smoke-mcp-support.js";
import { createTestDiagnosticsCollector, createUnavailableTestDiagnostics } from "./verify-local-test-diagnostics.js";

const maximumSnapshotFileBytes = 268435456;
const maximumSnapshotTotalBytes = 4294967296;
const maximumStageOutputBytes = 16777216;
const maximumGitOutputBytes = 67108864;
const completeStageTimeoutMs = 2700000;
const benchmarkTimeoutMs = 60000;
const standardStageTimeoutMs = 180000;
const expectedPackageScripts = {
  "verify:ci": "node scripts/verify-project-ci.js",
  test: "node --test --test-timeout=120000 tests/*.test.js && node --test --test-timeout=35000 tests/performance/memory-search.test.js",
  smoke: "node scripts/smoke-mcp.js",
  verify: "node scripts/verify-project.js",
  "verify:local": "node scripts/verify-local.js"
};
const allowedSyntheticEnvironmentNames = new Set([
  "comspec",
  "pathext",
  "path",
  "systemroot",
  "windir",
  "orchestrator_config",
  "subagent_bridge_agents_config",
  "subagent_bridge_trusted_workspace",
  "userprofile",
  "home",
  "homedrive",
  "homepath",
  "appdata",
  "localappdata",
  "temp",
  "tmp",
  "subagent_bridge_orchestrator_approval"
]);
const credentialEnvironmentNamePattern = /(?:API[_-]?KEY|ACCESS[_-]?TOKEN|AUTH[_-]?TOKEN|CLIENT[_-]?SECRET|PASSWORD|PROVIDER[_-]?CREDENTIAL)/i;
const systemEnvironmentNames = new Set(["comspec", "pathext", "path", "systemroot", "windir"]);

export class LocalVerificationError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function createMinimalSystemEnvironment(source = process.env) {
  const environment = Object.fromEntries(Object.entries(source).filter(([name]) => systemEnvironmentNames.has(name.toLowerCase())));
  environment.TEMP = os.tmpdir();
  environment.TMP = os.tmpdir();
  environment.GIT_CONFIG_NOSYSTEM = "1";
  const nullDevice = process.platform === "win32" ? "NUL" : os.devNull;
  environment.GIT_CONFIG_SYSTEM = nullDevice;
  environment.GIT_CONFIG_GLOBAL = nullDevice;
  environment.GIT_OPTIONAL_LOCKS = "0";
  return environment;
}

function gitBuffer(projectRoot, argumentsList) {
  return execFileSync("git", argumentsList, {
    cwd: projectRoot,
    encoding: "buffer",
    env: createMinimalSystemEnvironment(),
    maxBuffer: maximumGitOutputBytes,
    timeout: 30000,
    windowsHide: true
  });
}

function gitText(projectRoot, argumentsList) {
  return gitBuffer(projectRoot, argumentsList).toString("utf8").trim();
}

function nulSeparatedValues(buffer) {
  return buffer.toString("utf8").split("\0").filter(Boolean);
}

function readHeadTree(projectRoot) {
  const entries = new Map();
  const treeRecords = gitBuffer(projectRoot, ["ls-tree", "-r", "-z", "--full-tree", "HEAD"]).toString("utf8");
  for (const record of treeRecords.split("\0").filter(Boolean)) {
    const separator = record.indexOf("\t");
    if (separator < 0) throw new LocalVerificationError("git_tree_parse_failed");
    const [mode, type, objectId] = record.slice(0, separator).split(" ");
    const relativePath = record.slice(separator + 1);
    if (type === "commit" || mode === "160000") throw new LocalVerificationError("git_submodule_snapshot_unsupported");
    entries.set(relativePath, { mode, objectId });
  }
  return entries;
}

function readGitState(projectRoot) {
  const root = gitText(projectRoot, ["rev-parse", "--show-toplevel"]);
  const expectedRoot = path.resolve(projectRoot);
  if (path.resolve(root).toLocaleLowerCase("en-US") !== expectedRoot.toLocaleLowerCase("en-US")) {
    throw new LocalVerificationError("repository_root_mismatch");
  }
  const head = gitText(projectRoot, ["rev-parse", "HEAD"]);
  const branch = gitText(projectRoot, ["branch", "--show-current"]) || null;
  const status = gitBuffer(projectRoot, ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--ignore-submodules=all"]);
  const indexPath = gitText(projectRoot, ["rev-parse", "--git-path", "index"]);
  const absoluteIndexPath = path.isAbsolute(indexPath) ? indexPath : path.resolve(projectRoot, indexPath);
  const indexSha256 = sha256(fs.readFileSync(absoluteIndexPath));
  const headTree = readHeadTree(projectRoot);
  const indexPaths = new Set(nulSeparatedValues(gitBuffer(projectRoot, ["ls-files", "-z", "--cached"])));
  const untrackedPaths = new Set(nulSeparatedValues(gitBuffer(projectRoot, ["ls-files", "-z", "--others", "--exclude-standard"])));
  return {
    root: expectedRoot,
    head,
    branch,
    dirty: status.length > 0,
    indexSha256,
    headTree,
    indexPaths,
    untrackedPaths
  };
}

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function resolveRepositoryPath(projectRoot, relativePath) {
  if (path.posix.isAbsolute(relativePath) || relativePath.split(/[\\/]/).includes("..")) {
    throw new LocalVerificationError("git_path_invalid");
  }
  const absolutePath = path.resolve(projectRoot, ...relativePath.split(/[\\/]/));
  if (!isWithin(projectRoot, absolutePath)) throw new LocalVerificationError("git_path_outside_repository");
  return absolutePath;
}

function statIdentity(stat) {
  return [stat.dev, stat.ino, stat.mode, stat.nlink, stat.size, stat.mtimeNs, stat.ctimeNs].map(String).join(":");
}

function isMissingPathError(error) {
  return error?.code === "ENOENT" || error?.code === "ENOTDIR";
}

async function resolveSafeRepositoryEntryPath(projectRoot, relativePath) {
  const repositoryRoot = await fs.promises.realpath(projectRoot);
  const lexicalPath = resolveRepositoryPath(repositoryRoot, relativePath);
  let parentPath = repositoryRoot;
  const segments = relativePath.split(/[\\/]/);
  for (const segment of segments.slice(0, -1)) {
    parentPath = path.join(parentPath, segment);
    let parentStatus;
    try {
      parentStatus = await fs.promises.lstat(parentPath, { bigint: true });
    } catch (error) {
      if (isMissingPathError(error)) return null;
      throw new LocalVerificationError("source_entry_unreadable");
    }
    if (parentStatus.isSymbolicLink()) throw new LocalVerificationError("source_path_link_unsupported");
    if (!parentStatus.isDirectory()) throw new LocalVerificationError("source_entry_type_unsupported");
  }
  let canonicalParent;
  try {
    canonicalParent = await fs.promises.realpath(parentPath);
  } catch (error) {
    if (isMissingPathError(error)) return null;
    throw new LocalVerificationError("source_entry_unreadable");
  }
  if (!isWithin(repositoryRoot, canonicalParent) || !isWithin(repositoryRoot, lexicalPath)) {
    throw new LocalVerificationError("source_path_outside_repository");
  }
  let parentStatus;
  try {
    parentStatus = await fs.promises.lstat(canonicalParent, { bigint: true });
  } catch {
    throw new LocalVerificationError("source_snapshot_unstable");
  }
  if (!parentStatus.isDirectory() || parentStatus.isSymbolicLink()) {
    throw new LocalVerificationError("source_path_link_unsupported");
  }
  return {
    repositoryRoot,
    parentPath: canonicalParent,
    parentIdentity: statIdentity(parentStatus),
    absolutePath: path.join(canonicalParent, segments.at(-1))
  };
}

function samePath(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const normalizedLeft = path.resolve(left);
  const normalizedRight = path.resolve(right);
  return process.platform === "win32"
    ? normalizedLeft.toLocaleLowerCase("en-US") === normalizedRight.toLocaleLowerCase("en-US")
    : normalizedLeft === normalizedRight;
}

async function assertRepositoryEntryPathUnchanged(projectRoot, relativePath, expectedPath) {
  let currentPath;
  try {
    currentPath = await resolveSafeRepositoryEntryPath(projectRoot, relativePath);
  } catch {
    throw new LocalVerificationError("source_snapshot_unstable");
  }
  if (!currentPath
    || !samePath(currentPath.absolutePath, expectedPath.absolutePath)
    || currentPath.parentIdentity !== expectedPath.parentIdentity) {
    throw new LocalVerificationError("source_snapshot_unstable");
  }
}

async function readSymbolicLinkEntry(relativePath, resolvedPath, before, headEntry, aggregate) {
  let target;
  let after;
  try {
    target = await fs.promises.readlink(resolvedPath.absolutePath, { encoding: "buffer" });
    after = await fs.promises.lstat(resolvedPath.absolutePath, { bigint: true });
  } catch {
    throw new LocalVerificationError("source_snapshot_unstable");
  }
  if (!after.isSymbolicLink() || statIdentity(before) !== statIdentity(after)) {
    throw new LocalVerificationError("source_snapshot_unstable");
  }
  aggregate.bytes += target.length;
  if (aggregate.bytes > maximumSnapshotTotalBytes) throw new LocalVerificationError("source_snapshot_size_limit");
  return {
    entry: { path: relativePath, kind: "symlink", size: target.length, sha256: sha256(target), headMode: headEntry?.mode || null },
    validation: {
      relativePath,
      kind: "symlink",
      identity: statIdentity(after),
      target,
      absolutePath: resolvedPath.absolutePath,
      parentIdentity: resolvedPath.parentIdentity
    }
  };
}

async function consumeSnapshotStream(stream, signal, aggregate) {
  const digest = crypto.createHash("sha256");
  let bytes = 0;
  for await (const chunk of stream) {
    hasAbort(signal);
    bytes += chunk.length;
    aggregate.bytes += chunk.length;
    if (bytes > maximumSnapshotFileBytes || aggregate.bytes > maximumSnapshotTotalBytes) {
      throw new LocalVerificationError("source_snapshot_size_limit");
    }
    digest.update(chunk);
  }
  return { bytes, digest: digest.digest("hex") };
}

async function waitForStreamClose(stream) {
  if (!stream || stream.closed) return;
  stream.destroy();
  if (!stream.closed) await new Promise((resolve) => stream.once("close", resolve));
}

async function hashRepositoryEntry(projectRoot, relativePath, headEntry, aggregate, signal) {
  const resolvedPath = await resolveSafeRepositoryEntryPath(projectRoot, relativePath);
  if (!resolvedPath) return {
    entry: { path: relativePath, kind: "missing", headMode: headEntry?.mode || null },
    validation: { relativePath, kind: "missing" }
  };
  let before;
  try {
    before = await fs.promises.lstat(resolvedPath.absolutePath, { bigint: true });
  } catch (error) {
    if (isMissingPathError(error)) return {
      entry: { path: relativePath, kind: "missing", headMode: headEntry?.mode || null },
      validation: { relativePath, kind: "missing" }
    };
    throw new LocalVerificationError("source_entry_unreadable");
  }
  if (before.isSymbolicLink()) return readSymbolicLinkEntry(relativePath, resolvedPath, before, headEntry, aggregate);
  if (!before.isFile()) throw new LocalVerificationError("source_entry_type_unsupported");
  if (before.size > BigInt(maximumSnapshotFileBytes)) throw new LocalVerificationError("source_snapshot_file_limit");
  let canonicalFilePath;
  try {
    canonicalFilePath = await fs.promises.realpath(resolvedPath.absolutePath);
  } catch {
    throw new LocalVerificationError("source_snapshot_unstable");
  }
  if (!isWithin(resolvedPath.repositoryRoot, canonicalFilePath)
    || !samePath(canonicalFilePath, resolvedPath.absolutePath)) {
    throw new LocalVerificationError("source_path_outside_repository");
  }
  const noFollow = fs.constants.O_NOFOLLOW || 0;
  let handle;
  let stream;
  let abortListener;
  try {
    hasAbort(signal);
    handle = await fs.promises.open(canonicalFilePath, fs.constants.O_RDONLY | noFollow);
    const opened = await handle.stat({ bigint: true });
    if (!opened.isFile() || statIdentity(before) !== statIdentity(opened)) {
      throw new LocalVerificationError("source_snapshot_unstable");
    }
    await assertRepositoryEntryPathUnchanged(projectRoot, relativePath, resolvedPath);
    stream = handle.createReadStream({ autoClose: false });
    const readPromise = consumeSnapshotStream(stream, signal, aggregate);
    if (signal) {
      abortListener = () => stream.destroy(new LocalVerificationError("cancelled"));
      signal.addEventListener("abort", abortListener, { once: true });
      if (signal.aborted) abortListener();
    }
    let content;
    try {
      content = await readPromise;
    } catch (error) {
      if (signal?.aborted || error?.code === "cancelled") throw new LocalVerificationError("cancelled");
      if (error instanceof LocalVerificationError) throw error;
      throw new LocalVerificationError("source_entry_unreadable");
    }
    await assertRepositoryEntryPathUnchanged(projectRoot, relativePath, resolvedPath);
    const completed = await handle.stat({ bigint: true });
    let pathAfter;
    try {
      pathAfter = await fs.promises.lstat(canonicalFilePath, { bigint: true });
    } catch {
      throw new LocalVerificationError("source_snapshot_unstable");
    }
    if (statIdentity(opened) !== statIdentity(completed)
      || statIdentity(opened) !== statIdentity(pathAfter)
      || !pathAfter.isFile()
      || BigInt(content.bytes) !== completed.size) {
      throw new LocalVerificationError("source_snapshot_unstable");
    }
    return {
      entry: {
        path: relativePath,
        kind: "file",
        size: content.bytes,
        executable: Boolean(Number(before.mode & 0o111n)),
        sha256: content.digest,
        headMode: headEntry?.mode || null
      },
      validation: {
        relativePath,
        kind: "file",
        identity: statIdentity(completed),
        canonicalFilePath,
        absolutePath: resolvedPath.absolutePath,
        parentIdentity: resolvedPath.parentIdentity
      }
    };
  } catch (error) {
    if (signal?.aborted) throw new LocalVerificationError("cancelled");
    if (error instanceof LocalVerificationError) throw error;
    if (error?.code === "ENOENT" || error?.code === "ELOOP") throw new LocalVerificationError("source_snapshot_unstable");
    throw new LocalVerificationError("source_entry_unreadable");
  } finally {
    signal?.removeEventListener("abort", abortListener);
    await waitForStreamClose(stream);
    if (handle) await handle.close().catch(() => {});
  }
}

async function verifyRepositoryEntryUnchanged(projectRoot, validation) {
  const resolvedPath = await resolveSafeRepositoryEntryPath(projectRoot, validation.relativePath);
  if (validation.kind === "missing") {
    if (resolvedPath) {
      try {
        await fs.promises.lstat(resolvedPath.absolutePath, { bigint: true });
        throw new LocalVerificationError("source_snapshot_unstable");
      } catch (error) {
        if (!isMissingPathError(error)) throw error;
      }
    }
    return;
  }
  if (!resolvedPath
    || (validation.absolutePath && !samePath(resolvedPath.absolutePath, validation.absolutePath))
    || (validation.parentIdentity && resolvedPath.parentIdentity !== validation.parentIdentity)) {
    throw new LocalVerificationError("source_snapshot_unstable");
  }
  if (validation.kind === "symlink") {
    let current;
    let target;
    try {
      current = await fs.promises.lstat(resolvedPath.absolutePath, { bigint: true });
      target = await fs.promises.readlink(resolvedPath.absolutePath, { encoding: "buffer" });
    } catch {
      throw new LocalVerificationError("source_snapshot_unstable");
    }
    if (!current.isSymbolicLink() || statIdentity(current) !== validation.identity || !target.equals(validation.target)) {
      throw new LocalVerificationError("source_snapshot_unstable");
    }
    return;
  }
  let status;
  try {
    status = await fs.promises.lstat(validation.canonicalFilePath, { bigint: true });
  } catch {
    throw new LocalVerificationError("source_snapshot_unstable");
  }
  const currentRealPath = await fs.promises.realpath(resolvedPath.absolutePath).catch(() => null);
  if (!status.isFile()
    || statIdentity(status) !== validation.identity
    || !samePath(currentRealPath, validation.canonicalFilePath)) {
    throw new LocalVerificationError("source_snapshot_unstable");
  }
}

async function verifySnapshotEntries(projectRoot, validations, signal) {
  for (const validation of validations) {
    hasAbort(signal);
    await verifyRepositoryEntryUnchanged(projectRoot, validation);
  }
}

function sameStringSet(left, right) {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

function hasAbort(signal) {
  if (!signal?.aborted) return;
  throw new LocalVerificationError("cancelled");
}

export async function captureSourceSnapshot(projectRoot, signal) {
  hasAbort(signal);
  const before = readGitState(projectRoot);
  const allPaths = new Set([...before.headTree.keys(), ...before.indexPaths, ...before.untrackedPaths]);
  const normalizedPaths = new Set();
  for (const relativePath of allPaths) {
    const key = relativePath.toLocaleLowerCase("en-US");
    if (normalizedPaths.has(key)) throw new LocalVerificationError("case_colliding_source_paths");
    normalizedPaths.add(key);
  }
  const sortedPaths = [...allPaths].sort((left, right) => left.localeCompare(right, "en-US"));
  const aggregate = { bytes: 0, validations: [] };
  const entries = [];
  for (const relativePath of sortedPaths) {
    hasAbort(signal);
    const result = await hashRepositoryEntry(projectRoot, relativePath, before.headTree.get(relativePath), aggregate, signal);
    entries.push(result.entry);
    if (result.validation) aggregate.validations.push(result.validation);
  }
  hasAbort(signal);
  await verifySnapshotEntries(projectRoot, aggregate.validations, signal);
  const after = readGitState(projectRoot);
  const sameGitView = before.root === after.root
    && before.head === after.head
    && before.branch === after.branch
    && before.dirty === after.dirty
    && before.indexSha256 === after.indexSha256
    && sameStringSet(before.indexPaths, after.indexPaths)
    && sameStringSet(before.untrackedPaths, after.untrackedPaths)
    && sameStringSet(new Set(before.headTree.keys()), new Set(after.headTree.keys()));
  if (!sameGitView) throw new LocalVerificationError("source_snapshot_unstable");
  const manifest = JSON.stringify({
    schemaVersion: 1,
    head: before.head,
    branch: before.branch,
    workingTreeClean: !before.dirty,
    indexSha256: before.indexSha256,
    entries
  });
  return {
    head: before.head,
    branch: before.branch,
    workingTreeClean: !before.dirty,
    snapshotSha256: sha256(manifest),
    trackedFileCount: before.headTree.size,
    indexedFileCount: before.indexPaths.size,
    untrackedFileCount: before.untrackedPaths.size,
    fileCount: entries.length,
    totalBytes: aggregate.bytes
  };
}

function getTestFiles(projectRoot) {
  return fs.readdirSync(path.join(projectRoot, "tests"), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".test.js"))
    .map((entry) => `tests/${entry.name}`)
    .sort((left, right) => left.localeCompare(right, "en-US"));
}

export function buildVerificationStagePlan(projectRoot) {
  const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));
  for (const [scriptName, expected] of Object.entries(expectedPackageScripts)) {
    if (packageJson.scripts?.[scriptName] !== expected) throw new LocalVerificationError("package_script_contract_changed");
  }
  const testFiles = getTestFiles(projectRoot);
  if (testFiles.length === 0) throw new LocalVerificationError("unit_test_files_missing");
  const node = process.execPath;
  const testReporter = `--test-reporter=${pathToFileURL(path.join(projectRoot, "scripts", "verify-local-test-reporter.js")).href}`;
  return [
    {
      id: "verify-ci",
      packageScript: "npm run verify:ci",
      command: "node scripts/verify-project-ci.js",
      executable: node,
      args: ["scripts/verify-project-ci.js"],
      timeoutMs: standardStageTimeoutMs
    },
    {
      id: "test-suite",
      packageScript: "npm test",
      command: `node --test --test-timeout=120000 tests/*.test.js (${testFiles.length} files)`,
      executable: node,
      args: ["--test", "--test-timeout=120000", testReporter, "--test-reporter-destination=stdout", ...testFiles],
      timeoutMs: completeStageTimeoutMs,
      testFiles
    },
    {
      id: "test-benchmark",
      packageScript: "npm test",
      command: "node --test --test-timeout=35000 tests/performance/memory-search.test.js",
      executable: node,
      args: ["--test", "--test-timeout=35000", testReporter, "--test-reporter-destination=stdout", "tests/performance/memory-search.test.js"],
      timeoutMs: benchmarkTimeoutMs,
      testFiles: ["tests/performance/memory-search.test.js"]
    },
    {
      id: "smoke",
      packageScript: "npm run smoke",
      command: "node scripts/smoke-mcp.js",
      executable: node,
      args: ["scripts/smoke-mcp.js"],
      timeoutMs: standardStageTimeoutMs
    },
    {
      id: "verify",
      packageScript: "npm run verify",
      command: "node scripts/verify-project.js",
      executable: node,
      args: ["scripts/verify-project.js"],
      timeoutMs: standardStageTimeoutMs
    }
  ];
}

function regularNonLink(filePath, expectedType) {
  const stat = fs.lstatSync(filePath);
  if (stat.isSymbolicLink()) return false;
  return expectedType === "directory" ? stat.isDirectory() : stat.isFile();
}

export function validateSyntheticExecutionContext(context, projectRoot) {
  if (!context || context.mode !== "synthetic" || typeof context.smokeRoot !== "string") {
    throw new LocalVerificationError("synthetic_context_unavailable");
  }
  const root = path.resolve(context.smokeRoot);
  const temporaryRoot = path.resolve(os.tmpdir());
  if (path.dirname(root).toLocaleLowerCase("en-US") !== temporaryRoot.toLocaleLowerCase("en-US")
    || !path.basename(root).startsWith(syntheticSmokeRootPrefix)
    || !regularNonLink(root, "directory")) {
    throw new LocalVerificationError("synthetic_root_invalid");
  }
  for (const candidate of [context.vaultRoot, context.configurationPath, context.agentsConfigurationPath, context.fixturePath]) {
    if (typeof candidate !== "string" || !isWithin(root, path.resolve(candidate))) throw new LocalVerificationError("synthetic_path_invalid");
  }
  if (!regularNonLink(context.vaultRoot, "directory")
    || !regularNonLink(context.configurationPath, "file")
    || !regularNonLink(context.agentsConfigurationPath, "file")
    || !regularNonLink(context.fixturePath, "file")) {
    throw new LocalVerificationError("synthetic_fixture_invalid");
  }
  const configuration = JSON.parse(fs.readFileSync(context.configurationPath, "utf8"));
  if (path.resolve(configuration.memory?.vaultRoot || "") !== path.resolve(context.vaultRoot)) {
    throw new LocalVerificationError("synthetic_vault_binding_invalid");
  }
  const environment = context.environment;
  if (!environment || typeof environment !== "object") throw new LocalVerificationError("synthetic_environment_missing");
  if (Object.keys(environment).some((name) => !allowedSyntheticEnvironmentNames.has(name.toLowerCase()) || credentialEnvironmentNamePattern.test(name))) {
    throw new LocalVerificationError("synthetic_environment_not_isolated");
  }
  if (environment.ORCHESTRATOR_CONFIG !== context.configurationPath
    || environment.SUBAGENT_BRIDGE_AGENTS_CONFIG !== context.agentsConfigurationPath
    || path.resolve(environment.SUBAGENT_BRIDGE_TRUSTED_WORKSPACE || "") !== path.resolve(projectRoot)
    || path.resolve(environment.USERPROFILE || "") !== path.join(root, "profile")
    || path.resolve(environment.HOME || "") !== path.join(root, "profile")
    || path.resolve(environment.LOCALAPPDATA || "") !== path.join(root, "profile", "AppData", "Local")
    || path.resolve(environment.TEMP || "") !== root
    || path.resolve(environment.TMP || "") !== root) {
    throw new LocalVerificationError("synthetic_environment_binding_invalid");
  }
  return {
    root,
    environment,
    identity: {
      config: "temporary_distribution_copy",
      vault: "temporary_synthetic_fixture",
      providerCredentials: "excluded"
    }
  };
}

export function prepareSyntheticExecutionContext(projectRoot, inheritedEnvironment = process.env) {
  const context = createSmokeExecutionContext([], projectRoot, inheritedEnvironment);
  try {
    return { context, validated: validateSyntheticExecutionContext(context, projectRoot) };
  } catch (error) {
    if (context.smokeRoot) removeSyntheticSmokeRoot(context.smokeRoot);
    throw error;
  }
}

function makeSkippedStage(stage, reason) {
  return {
    id: stage.id,
    packageScript: stage.packageScript,
    command: stage.command,
    status: "skipped",
    skipReason: reason,
    exitCode: null,
    durationMs: 0,
    timeoutMs: stage.timeoutMs,
    outputBytes: 0,
    processTreeCleanup: {
      status: "not_applied",
      method: "stage_not_started",
      terminationRequested: false,
      directChildExited: null,
      stdioClosed: null,
      forcedStdioClose: false
    },
    ...(stage.testFiles ? { diagnostics: createUnavailableTestDiagnostics(stage.id, "stage_not_started") } : {})
  };
}

export async function executeVerificationStages(stages, options = {}) {
  const runner = options.runCommand || runCommand;
  const stageResults = [];
  let failure = null;
  let skipReason = null;
  for (const stage of stages) {
    if (skipReason) {
      stageResults.push(makeSkippedStage(stage, skipReason));
      continue;
    }
    if (options.signal?.aborted) {
      skipReason = "cancelled";
      failure = { stageId: stage.id, class: "cancelled" };
      stageResults.push(makeSkippedStage(stage, skipReason));
      continue;
    }
    options.onStageStart?.(stage);
    let result;
    try {
      result = await runner({
        executable: stage.executable,
        args: stage.args,
        cwd: options.projectRoot,
        env: options.environment,
        timeoutMs: stage.timeoutMs,
        maxOutputBytes: options.maxOutputBytes ?? maximumStageOutputBytes,
        signal: options.signal,
        ...(stage.testFiles ? {
          diagnostics: {
            stageId: stage.id,
            projectRoot: options.projectRoot,
            allowedTestFiles: stage.testFiles
          }
        } : {})
      });
    } catch (error) {
      result = {
        status: "runner_error",
        errorCode: safeErrorCode(error),
        exitCode: null,
        durationMs: 0,
        outputBytes: 0,
        processTreeCleanup: {
          status: "not_applied",
          method: "runner_error",
          terminationRequested: false,
          directChildExited: null,
          stdioClosed: null,
          forcedStdioClose: false
        }
      };
    }
    const item = {
      id: stage.id,
      packageScript: stage.packageScript,
      command: stage.command,
      status: result.status,
      exitCode: result.exitCode ?? null,
      durationMs: result.durationMs,
      timeoutMs: stage.timeoutMs,
      outputBytes: result.outputBytes,
      timedOut: result.status === "timeout",
      cancelled: result.status === "cancelled",
      processTreeCleanup: result.processTreeCleanup ?? null,
      ...(stage.testFiles ? {
        diagnostics: result.diagnostics || createUnavailableTestDiagnostics(stage.id, "runner_diagnostics_missing")
      } : {}),
      ...(result.errorCode ? { errorCode: result.errorCode } : {})
    };
    stageResults.push(item);
    options.onStageComplete?.(stage, item);
    if (result.status !== "passed") {
      failure = {
        stageId: stage.id,
        class: result.status,
        ...(result.errorCode ? { errorCode: result.errorCode } : {}),
        ...(result.exitCode !== undefined ? { exitCode: result.exitCode } : {})
      };
      skipReason = result.status === "cancelled" ? "cancelled" : "previous_stage_failed";
    }
  }
  return { stages: stageResults, failure };
}

function terminationTaskkillPath() {
  const windowsRoot = process.env.SystemRoot || process.env.WINDIR;
  if (!windowsRoot || !/^[A-Za-z]:\\[^\0]*$/.test(windowsRoot)) return null;
  const target = path.join(windowsRoot, "System32", "taskkill.exe");
  try {
    const stat = fs.lstatSync(target);
    return stat.isFile() && !stat.isSymbolicLink() ? target : null;
  } catch {
    return null;
  }
}

function terminateProcessTree(child, processControl = {}) {
  if (!child.pid) return { status: "not_applied", method: "not_spawned", terminationRequested: false, errorCode: null };
  if (child.exitCode !== null || child.signalCode !== null) return { status: "unconfirmed", method: "parent_already_exited", terminationRequested: false, errorCode: null };
  if (process.platform === "win32") {
    const resolveTaskkillPath = processControl.taskkillPathResolver || terminationTaskkillPath;
    const runTaskkill = processControl.spawnSync || spawnSync;
    const sendDirectChildSignal = processControl.sendDirectChildSignal || ((target, signal) => target.kill(signal));
    const taskkillPath = resolveTaskkillPath();
    if (taskkillPath) {
      let taskkillErrorCode = null;
      let taskkillExitCode = null;
      try {
        const result = runTaskkill(taskkillPath, ["/PID", String(child.pid), "/T", "/F"], {
          env: createMinimalSystemEnvironment(),
          timeout: 5000,
          windowsHide: true,
          stdio: "ignore"
        });
        if (result.status === 0) return { status: "unconfirmed", method: "taskkill_tree", terminationRequested: true, errorCode: null, toolExitCode: 0 };
        taskkillErrorCode = result.error ? safeErrorCode(result.error) : null;
        taskkillExitCode = Number.isInteger(result.status) ? result.status : null;
      } catch (error) {
        taskkillErrorCode = safeErrorCode(error);
      }
      try {
        const signalled = sendDirectChildSignal(child, "SIGTERM");
        return {
          status: "unconfirmed",
          method: "direct_fallback",
          terminationRequested: signalled,
          errorCode: taskkillErrorCode,
          ...(Number.isInteger(taskkillExitCode) ? { toolExitCode: taskkillExitCode } : {})
        };
      } catch (error) {
        return { status: "failed", method: "direct_fallback", terminationRequested: false, errorCode: safeErrorCode(error) };
      }
    }
    try {
      const signalled = sendDirectChildSignal(child, "SIGTERM");
      return { status: "unconfirmed", method: "direct_fallback", terminationRequested: signalled, errorCode: null };
    } catch (error) {
      return { status: "failed", method: "direct_fallback", terminationRequested: false, errorCode: safeErrorCode(error) };
    }
  }
  const sendProcessGroupSignal = processControl.sendProcessGroupSignal || ((pid, signal) => process.kill(-pid, signal));
  const processGroupIsRunning = processControl.processGroupIsRunning || ((pid) => {
    try {
      process.kill(-pid, 0);
      return true;
    } catch (error) {
      return error.code !== "ESRCH";
    }
  });
  const sendDirectChildSignal = processControl.sendDirectChildSignal || ((target, signal) => target.kill(signal));
  try {
    sendProcessGroupSignal(child.pid, "SIGTERM");
    const escalationTimer = setTimeout(() => {
      try {
        sendProcessGroupSignal(child.pid, "SIGKILL");
      } catch {
      }
    }, 750).unref();
    return { status: "unconfirmed", method: "process_group", terminationRequested: true, errorCode: null, processGroupIsRunning, escalationTimer };
  } catch (error) {
    try {
      const signalled = sendDirectChildSignal(child, "SIGTERM");
      return { status: signalled ? "unconfirmed" : "failed", method: "direct_fallback", terminationRequested: signalled, errorCode: safeErrorCode(error) };
    } catch (fallbackError) {
      return { status: "failed", method: "direct_fallback", terminationRequested: false, errorCode: safeErrorCode(fallbackError) };
    }
  }
}

const processTerminationGraceMs = 1500;
const processTerminationSettleMs = 500;

export function runCommand(options, processControl = {}) {
  const startedAt = Date.now();
  const diagnostics = options.diagnostics
    ? createTestDiagnosticsCollector(options.diagnostics)
    : null;
  if (options.signal?.aborted) {
    return Promise.resolve({
      status: "cancelled",
      exitCode: null,
      durationMs: 0,
      outputBytes: 0,
      processTreeCleanup: { status: "not_applied", method: "pre_aborted", terminationRequested: false, directChildExited: null, stdioClosed: null, forcedStdioClose: false },
      ...(diagnostics ? { diagnostics: diagnostics.finish({ primaryStatus: "cancelled" }) } : {})
    });
  }
  return new Promise((resolve) => {
    let child;
    let outputBytes = 0;
    let terminalStatus = null;
    let termination = null;
    let directChildExited = false;
    let stdioClosed = false;
    let forcedStdioClose = false;
    let finalized = false;
    let timer;
    let terminationTimer;
    let settleTimer;
    let abortListener;
    const finalize = (exitCode, errorCode = null) => {
      if (finalized) return;
      finalized = true;
      clearTimeout(timer);
      clearTimeout(terminationTimer);
      clearTimeout(settleTimer);
      clearTimeout(termination?.escalationTimer);
      options.signal?.removeEventListener("abort", abortListener);
      let cleanupStatus = "not_applied";
      if (termination) {
        cleanupStatus = termination.status;
        if (termination.status === "unconfirmed" && directChildExited && stdioClosed && !forcedStdioClose) {
          if (termination.method === "process_group") {
            try {
              const groupRunning = termination.processGroupIsRunning(child.pid);
              cleanupStatus = groupRunning === false ? "confirmed" : groupRunning === true ? "failed" : "unconfirmed";
            } catch {
              cleanupStatus = "unconfirmed";
            }
          } else if (termination.method === "taskkill_tree") {
            cleanupStatus = "confirmed";
          }
        }
        if (!directChildExited && cleanupStatus !== "failed") cleanupStatus = "failed";
      }
      resolve({
        status: terminalStatus || (errorCode ? "spawn_error" : exitCode === 0 ? "passed" : "failed"),
        exitCode,
        durationMs: Date.now() - startedAt,
        outputBytes,
        processTreeCleanup: {
          status: cleanupStatus,
          method: termination?.method || "none",
          terminationRequested: termination?.terminationRequested || false,
          directChildExited,
          stdioClosed,
          forcedStdioClose,
          ...(termination?.errorCode ? { errorCode: termination.errorCode } : {}),
          ...(Number.isInteger(termination?.toolExitCode) ? { toolExitCode: termination.toolExitCode } : {})
        },
        ...(diagnostics ? { diagnostics: diagnostics.finish({ primaryStatus: terminalStatus || (errorCode ? "spawn_error" : exitCode === 0 ? "passed" : "failed"), spawnError: Boolean(errorCode) }) } : {}),
        ...(errorCode ? { errorCode } : {})
      });
    };
    const forceDirectChildTermination = () => {
      if (directChildExited || !child?.pid || child.exitCode !== null || child.signalCode !== null) return false;
      try {
        const sendDirectChildSignal = processControl.sendDirectChildSignal || ((target, signal) => target.kill(signal));
        return sendDirectChildSignal(child, "SIGKILL");
      } catch {
        return false;
      }
    };
    const settleAfterTermination = () => {
      terminationTimer = setTimeout(() => {
        forceDirectChildTermination();
        forcedStdioClose = true;
        child.stdout?.destroy();
        child.stderr?.destroy();
        settleTimer = setTimeout(() => finalize(child.exitCode ?? null), processTerminationSettleMs);
      }, processTerminationGraceMs);
    };
    const stopChildTree = (status) => {
      if (terminalStatus) return;
      terminalStatus = status;
      termination = terminateProcessTree(child, processControl);
      processControl.onTerminationRequested?.(status);
      settleAfterTermination();
    };
    try {
      child = spawn(options.executable, options.args, {
        cwd: options.cwd,
        env: options.env,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        detached: process.platform !== "win32",
        shell: false
      });
    } catch (error) {
      terminalStatus = "spawn_error";
      directChildExited = true;
      stdioClosed = true;
      finalize(null, error.code || "spawn_failed");
      return;
    }
    const countOutput = (chunk, outputType) => {
      outputBytes += chunk.length;
      if (diagnostics && outputType === "stdout") {
        const consumed = diagnostics.consume(chunk);
        outputBytes += consumed.accountedOutputBytes;
      }
      if (outputBytes > options.maxOutputBytes) stopChildTree("output_limit");
    };
    child.stdout.on("data", (chunk) => countOutput(chunk, "stdout"));
    child.stderr.on("data", (chunk) => countOutput(chunk, "stderr"));
    child.on("error", (error) => {
      if (!terminalStatus) terminalStatus = "spawn_error";
      if (!child.pid) {
        directChildExited = true;
        stdioClosed = true;
        finalize(null, error.code || "spawn_failed");
      }
    });
    child.on("exit", () => {
      directChildExited = true;
      processControl.onDirectChildExit?.();
    });
    child.on("close", (exitCode) => {
      directChildExited = true;
      stdioClosed = true;
      finalize(exitCode);
    });
    timer = setTimeout(() => stopChildTree("timeout"), options.timeoutMs);
    abortListener = () => stopChildTree("cancelled");
    options.signal?.addEventListener("abort", abortListener, { once: true });
    if (options.signal?.aborted) stopChildTree("cancelled");
  });
}

function safeErrorCode(error) {
  return typeof error?.code === "string" && /^[A-Za-z0-9_]+$/.test(error.code) ? error.code : "verification_setup_failed";
}

function skippedStages(stages, reason) {
  return stages.map((stage) => makeSkippedStage(stage, reason));
}

export async function runLocalVerification(options = {}) {
  const projectRoot = path.resolve(options.projectRoot || path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));
  const startedAt = new Date().toISOString();
  const startedClock = Date.now();
  const report = {
    schemaVersion: 3,
    status: "setup_failed",
    startedAt,
    finishedAt: null,
    durationMs: null,
    source: { snapshotAvailable: false, unchangedAtCompletion: null },
    environment: { synthetic: true, node: process.version, platform: process.platform, architecture: process.arch },
    stages: [],
    cleanup: { status: "not_started", temporaryRootId: null },
    failure: null
  };
  let stagePlan = [];
  let context = null;
  let startSnapshot = null;
  let primaryFailure = null;
  let cleanupError = null;
  const captureSnapshot = options.captureSnapshot || captureSourceSnapshot;
  const createContext = options.createContext || prepareSyntheticExecutionContext;
  const cleanupContext = options.cleanupContext || ((activeContext) => removeSyntheticSmokeRoot(activeContext.smokeRoot));
  try {
    stagePlan = buildVerificationStagePlan(projectRoot);
    startSnapshot = await captureSnapshot(projectRoot, options.signal);
    report.source = {
      snapshotAvailable: true,
      headAtStart: startSnapshot.head,
      branchAtStart: startSnapshot.branch,
      cleanAtStart: startSnapshot.workingTreeClean,
      snapshotSha256AtStart: startSnapshot.snapshotSha256,
      trackedFileCount: startSnapshot.trackedFileCount,
      indexedFileCount: startSnapshot.indexedFileCount,
      untrackedFileCount: startSnapshot.untrackedFileCount,
      fileCount: startSnapshot.fileCount,
      totalBytes: startSnapshot.totalBytes,
      unchangedAtCompletion: null
    };
    hasAbort(options.signal);
    const prepared = await createContext(projectRoot, options.inheritedEnvironment || process.env);
    context = prepared.context;
    const validatedContext = validateSyntheticExecutionContext(context, projectRoot);
    report.cleanup.temporaryRootId = path.basename(context.smokeRoot);
    report.environment.syntheticConfig = true;
    report.environment.syntheticVault = true;
    report.environment.providerCredentialsForwarded = false;
    const sequence = await executeVerificationStages(stagePlan, {
      projectRoot,
      environment: validatedContext.environment,
      signal: options.signal,
      runCommand: options.runCommand,
      maxOutputBytes: options.maxOutputBytes,
      onStageStart: options.onStageStart,
      onStageComplete: options.onStageComplete
    });
    report.stages = sequence.stages;
    primaryFailure = sequence.failure;
    if (primaryFailure) report.failure = primaryFailure;
  } catch (error) {
    const code = safeErrorCode(error);
    primaryFailure = { class: code === "cancelled" ? "cancelled" : "setup_failed", errorCode: code };
    report.failure = primaryFailure;
    if (report.stages.length === 0 && stagePlan.length > 0) {
      report.stages = skippedStages(stagePlan, code === "cancelled" ? "cancelled" : "setup_failed");
    }
  } finally {
    if (context?.smokeRoot) {
      const uncertainProcessCleanup = report.stages.some((stage) => {
        const processCleanup = stage.processTreeCleanup;
        return processCleanup?.status === "unconfirmed" || processCleanup?.status === "failed";
      });
      if (uncertainProcessCleanup) {
        report.cleanup.status = "preserved";
        report.cleanup.reason = report.stages.some((stage) => stage.processTreeCleanup?.status === "failed")
          ? "process_tree_cleanup_failed"
          : "process_tree_cleanup_unconfirmed";
      } else {
        try {
          cleanupContext(context);
          report.cleanup.status = "removed";
        } catch (error) {
          cleanupError = { class: "cleanup_failed", errorCode: safeErrorCode(error) };
          report.cleanup.status = "failed";
          report.cleanup.errorCode = cleanupError.errorCode;
        }
      }
    } else if (primaryFailure?.class === "setup_failed") {
      report.cleanup.status = "not_created";
    }
    try {
      const endSnapshot = await captureSnapshot(projectRoot);
      report.source.headAtEnd = endSnapshot.head;
      report.source.branchAtEnd = endSnapshot.branch;
      report.source.cleanAtEnd = endSnapshot.workingTreeClean;
      report.source.snapshotSha256AtEnd = endSnapshot.snapshotSha256;
      report.source.unchangedAtCompletion = Boolean(startSnapshot
        && startSnapshot.head === endSnapshot.head
        && startSnapshot.branch === endSnapshot.branch
        && startSnapshot.workingTreeClean === endSnapshot.workingTreeClean
        && startSnapshot.snapshotSha256 === endSnapshot.snapshotSha256);
    } catch (error) {
      report.source.endSnapshotError = safeErrorCode(error);
      report.source.unchangedAtCompletion = false;
    }
  }
  if (cleanupError && !report.failure) report.failure = cleanupError;
  if (primaryFailure?.class === "cancelled") report.status = "cancelled";
  else if (report.source.snapshotAvailable && report.source.unchangedAtCompletion === false) report.status = "source_changed";
  else if (primaryFailure) report.status = primaryFailure.class === "setup_failed" ? "setup_failed" : "failed";
  else if (cleanupError) report.status = "cleanup_failed";
  else report.status = "passed";
  report.finishedAt = new Date().toISOString();
  report.durationMs = Date.now() - startedClock;
  report.exitCode = report.status === "passed" ? 0 : report.status === "cancelled" ? 130 : 1;
  return report;
}

function usageText() {
  return [
    "Usage: npm run verify:local",
    "Runs verify:ci, the serial npm test suite and benchmark, synthetic smoke, and synthetic-config verify.",
    "Progress is written to stderr and one redacted JSON result is written to stdout.",
    "The command does not accept a persistent report path or arbitrary child command."
  ].join("\n");
}

export async function main(argumentsList = process.argv.slice(2)) {
  if (argumentsList.length === 1 && argumentsList[0] === "--help") {
    process.stdout.write(`${usageText()}\n`);
    return 0;
  }
  if (argumentsList.length !== 0) {
    process.stderr.write(`${usageText()}\n`);
    return 2;
  }
  const controller = new AbortController();
  const abort = () => controller.abort();
  process.once("SIGINT", abort);
  process.once("SIGTERM", abort);
  try {
    const report = await runLocalVerification({
      onStageStart(stage) {
        process.stderr.write(`[verify:local] started ${stage.id}\n`);
      },
      onStageComplete(stage, result) {
        process.stderr.write(`[verify:local] ${result.status} ${stage.id} ${result.durationMs}ms\n`);
      },
      signal: controller.signal
    });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.exitCode;
  } finally {
    process.removeListener("SIGINT", abort);
    process.removeListener("SIGTERM", abort);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = await main();
}
