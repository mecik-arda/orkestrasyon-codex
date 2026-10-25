import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { test } from "node:test";
import { createGitWorktreeBatchManager, integrationPayloadHash } from "../subagent-bridge/src/services/git-worktree-batch.js";
import { createGitRefSnapshot } from "../subagent-bridge/src/services/git-ref-snapshot.js";
import { createWorkspaceCoordinator } from "../subagent-bridge/src/services/workspace-coordinator.js";
import { createPreauthorizedIntegrationPrototype, createPreauthorizedIntegrationTicketStore } from "./fixtures/preauthorized-integration-prototype.js";

const callerHash = crypto.createHash("sha256").update("prototype-caller").digest("hex");
const oldRotationRef = "refs/codex/turn-diffs/checkpoints/prototype-old";
const newRotationRef = "refs/codex/turn-diffs/checkpoints/prototype-new";

function fingerprint(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function git(repository, args) {
  return execFileSync("git", args, { cwd: repository, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function createScenario(t, managerOverrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "preauthorized-integration-prototype-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const repository = path.join(root, "repository");
  fs.mkdirSync(path.join(repository, "src"), { recursive: true });
  git(root, ["init", "-q", "repository"]);
  git(repository, ["config", "user.email", "prototype@example.invalid"]);
  git(repository, ["config", "user.name", "Prototype Test"]);
  fs.writeFileSync(path.join(repository, "src", "a.json"), "{\"value\":1}\n", "utf8");
  fs.writeFileSync(path.join(repository, "src", "b.json"), "{\"value\":2}\n", "utf8");
  git(repository, ["add", "-A"]);
  git(repository, ["commit", "-qm", "initial"]);
  const baseCommit = git(repository, ["rev-parse", "HEAD"]);
  git(repository, ["update-ref", oldRotationRef, baseCommit]);
  const currentWorkspaceHash = crypto.createHash("sha256").update(fs.realpathSync(repository)).digest("hex");
  const worktreeRoot = path.join(root, "worktrees");
  const batchId = crypto.randomBytes(16).toString("hex");
  const managerOptions = typeof managerOverrides === "function" ? managerOverrides(repository) : managerOverrides;
  const manager = createGitWorktreeBatchManager({ sourceWorkspace: repository, worktreeRoot, ...managerOptions });
  assert.equal(manager.recoverPendingPromotions().ok, true);
  const task = manager.createTaskWorktree({ batchId, taskId: "task-one", baseCommit });
  assert.equal(task.ok, true);
  fs.writeFileSync(path.join(task.worktreePath, "src", "a.json"), "{\"value\":10}\n", "utf8");
  fs.writeFileSync(path.join(task.worktreePath, "src", "b.json"), "{\"value\":20}\n", "utf8");
  const diff = manager.collectTaskDiff({ worktreePath: task.worktreePath, allowedPaths: ["src/a.json", "src/b.json"] });
  assert.equal(diff.ok, true);
  manager.holdTaskDiff({ batchId, taskId: "task-one", changes: diff.changes });
  manager.cleanupTaskWorktree({ batchId, taskId: "task-one" });
  const sourceRefs = manager.captureRefState();
  const preview = manager.prepareIntegration({
    batchId,
    baseCommit,
    tasks: [{ taskId: "task-one", status: "completed", filesChanged: diff.filesChanged }],
    expectedRefHash: sourceRefs.refsHash,
    expectedRefSnapshot: sourceRefs.refSnapshot
  });
  assert.equal(preview.ok, true, JSON.stringify(preview));
  const ticketDirectory = path.join(root, "tickets");
  const testClock = { now: Date.now() };
  const ticketStore = createPreauthorizedIntegrationTicketStore({ directory: ticketDirectory, clock: () => testClock.now });
  const issued = ticketStore.issue({
    callerHash,
    workspaceHash: currentWorkspaceHash,
    batchId,
    preview,
    acceptedTasks: [{ taskId: "task-one", status: "completed", filesChanged: diff.filesChanged }],
    sourceRefHash: preview.sourceRefHash,
    sourceRefSnapshot: preview.sourceRefSnapshot,
    permittedRefTransitions: [{
      category: "codex_turn_checkpoint",
      fromFingerprint: fingerprint(oldRotationRef),
      toFingerprint: fingerprint(newRotationRef),
      targetFingerprint: fingerprint(baseCommit)
    }],
    baseCommit,
    expiresAt: testClock.now + 60000,
  });
  assert.equal(issued.ok, true);
  const coordinator = createWorkspaceCoordinator({ lockDirectory: path.join(root, "locks"), staleLockMs: 10000, leaseHeartbeatMs: 1000 });
  const prototype = createPreauthorizedIntegrationPrototype({
    manager,
    workspaceCoordinator: coordinator,
    ticketStore,
    trustedWorkspace: repository,
    workspaceHash: currentWorkspaceHash,
    clock: () => testClock.now
  });
  const execute = (overrides = {}, hooks = {}) => prototype.execute({
    grantId: issued.grantId,
    callerHash,
    request: { batchId, expectedDiffHash: preview.diffHash, ...overrides },
    hooks
  });
  return { root, repository, worktreeRoot, batchId, baseCommit, workspaceHash: currentWorkspaceHash, testClock, manager, preview, ticketStore, issued, coordinator, prototype, execute };
}

function sourceContents(repository) {
  return ["src/a.json", "src/b.json"].map((relativePath) => fs.readFileSync(path.join(repository, relativePath), "utf8"));
}

function crashChildAfterPromotionBoundary(scenario, crashMode, expectedExit) {
  const managerModule = new URL("../subagent-bridge/src/services/git-worktree-batch.js", import.meta.url).href;
  const coordinatorModule = new URL("../subagent-bridge/src/services/workspace-coordinator.js", import.meta.url).href;
  const ticketStoreModule = new URL("./fixtures/preauthorized-integration-prototype.js", import.meta.url).href;
  const childScript = [
    `import fs from "node:fs";`,
    `import path from "node:path";`,
    `import { createGitWorktreeBatchManager } from ${JSON.stringify(managerModule)};`,
    `import { createWorkspaceCoordinator } from ${JSON.stringify(coordinatorModule)};`,
    `import { createPreauthorizedIntegrationPrototype, createPreauthorizedIntegrationTicketStore } from ${JSON.stringify(ticketStoreModule)};`,
    `const [sourceWorkspace, worktreeRoot, ticketDirectory, lockDirectory, grantId, callerHash, workspaceHash, batchId, diffHash, crashMode] = process.argv.slice(1);`,
    `let renameCount = 0;`,
    `const manager = createGitWorktreeBatchManager({ sourceWorkspace, worktreeRoot, renamePromotionFile(source, target) { fs.renameSync(source, target); renameCount += 1; if (crashMode === "partial" && renameCount === 1) process.exit(71); } });`,
    `if (!manager.recoverPendingPromotions().ok) process.exit(73);`,
    `const workspaceCoordinator = createWorkspaceCoordinator({ lockDirectory });`,
    `const ticketStore = createPreauthorizedIntegrationTicketStore({ directory: ticketDirectory });`,
    `const prototype = createPreauthorizedIntegrationPrototype({ manager, workspaceCoordinator, ticketStore, trustedWorkspace: sourceWorkspace, workspaceHash });`,
    `await prototype.execute({ grantId, callerHash, request: { batchId, expectedDiffHash: diffHash }, hooks: crashMode === "committed" ? { afterApplyBeforeReceipt() { process.exit(72); } } : {} });`,
    `process.exit(74);`
  ].join("\n");
  try {
    execFileSync(process.execPath, ["--input-type=module", "-e", childScript, scenario.repository, scenario.worktreeRoot, path.join(scenario.root, "tickets"), path.join(scenario.root, "locks"), scenario.issued.grantId, callerHash, scenario.workspaceHash, scenario.batchId, scenario.preview.diffHash, crashMode], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60000
    });
    assert.fail("child process did not reach the expected crash boundary");
  } catch (error) {
    assert.equal(error.status, expectedExit, error.stderr?.toString() || "child crash boundary was not reached");
  }
}

test("Option B isolated prototype applies only the exact granted diff after same-target ref rotation", async (t) => {
  const scenario = createScenario(t);
  const before = sourceContents(scenario.repository);
  git(scenario.repository, ["update-ref", "-d", oldRotationRef]);
  git(scenario.repository, ["update-ref", newRotationRef, scenario.baseCommit]);
  const result = await scenario.execute();
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(sourceContents(scenario.repository), ["{\"value\":10}\n", "{\"value\":20}\n"]);
  assert.deepEqual(sourceContents(scenario.repository).every((content, index) => content !== before[index]), true);
  assert.equal(scenario.ticketStore.read(scenario.issued.grantId).status, "applied");
  assert.equal(Object.hasOwn(result.result, "approvalRef"), false);
  assert.equal(JSON.stringify(result).includes("refs/"), false);
  assert.equal(JSON.stringify(result).includes(scenario.baseCommit), false);
});

test("Option B isolated prototype rejects a changed request and source file identity drift", async (t) => {
  const changedRequest = createScenario(t);
  const wrongDiff = await changedRequest.execute({ expectedDiffHash: "0".repeat(64) });
  assert.equal(wrongDiff.ok, false);
  assert.equal(changedRequest.ticketStore.read(changedRequest.issued.grantId).status, "issued");
  const wrongCaller = await changedRequest.prototype.execute({
    grantId: changedRequest.issued.grantId,
    callerHash: "a".repeat(64),
    request: { batchId: changedRequest.batchId, expectedDiffHash: changedRequest.preview.diffHash }
  });
  assert.equal(wrongCaller.ok, false);
  assert.equal(changedRequest.ticketStore.claim({
    grantId: changedRequest.issued.grantId,
    callerHash,
    workspaceHash: "b".repeat(64),
    batchId: changedRequest.batchId,
    expectedDiffHash: changedRequest.preview.diffHash
  }).ok, false);
  const wrongBatch = await changedRequest.execute({ batchId: "b".repeat(32) });
  assert.equal(wrongBatch.ok, false);
  const missingArtifact = await changedRequest.prototype.execute({
    grantId: "c".repeat(32),
    callerHash,
    request: { batchId: changedRequest.batchId, expectedDiffHash: changedRequest.preview.diffHash }
  });
  assert.equal(missingArtifact.ok, false);
  const driftedSource = createScenario(t);
  const target = path.join(driftedSource.repository, "src", "a.json");
  fs.writeFileSync(target, "{\"value\":9}\n", "utf8");
  const result = await driftedSource.execute();
  assert.equal(result.ok, false);
  assert.equal(result.reason, "source_workspace_dirty");
  assert.deepEqual(sourceContents(driftedSource.repository), ["{\"value\":9}\n", "{\"value\":2}\n"]);
});

test("Option B isolated prototype rejects a grant expiring before the atomic commit decision", async (t) => {
  const scenario = createScenario(t);
  const originalContents = sourceContents(scenario.repository);
  const result = await scenario.execute({}, { afterRevalidation: () => { scenario.testClock.now = scenario.testClock.now + 60001; } });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "prototype_grant_expired");
  assert.equal(scenario.ticketStore.read(scenario.issued.grantId).status, "rejected");
  assert.deepEqual(sourceContents(scenario.repository), originalContents);
});

test("Option B isolated prototype gives cancel and commit decision a single atomic winner", async (t) => {
  const cancelled = createScenario(t);
  let resumeRevalidation;
  let revalidationReached;
  const reached = new Promise((resolve) => { revalidationReached = resolve; });
  const blocked = new Promise((resolve) => { resumeRevalidation = resolve; });
  const pending = cancelled.execute({}, { afterRevalidation: async () => { revalidationReached(); await blocked; } });
  await reached;
  assert.equal(cancelled.ticketStore.requestCancel(cancelled.issued.grantId).ok, true);
  resumeRevalidation();
  const cancelResult = await pending;
  assert.equal(cancelResult.ok, false);
  assert.equal(cancelled.ticketStore.read(cancelled.issued.grantId).status, "cancelled");
  assert.deepEqual(sourceContents(cancelled.repository), ["{\"value\":1}\n", "{\"value\":2}\n"]);

  const commitWins = createScenario(t);
  let resumeCommit;
  let commitReached;
  const commitSignal = new Promise((resolve) => { commitReached = resolve; });
  const commitBlock = new Promise((resolve) => { resumeCommit = resolve; });
  const applying = commitWins.execute({}, { afterCommitDecision: async () => { commitReached(); await commitBlock; } });
  await commitSignal;
  assert.equal(commitWins.ticketStore.requestCancel(commitWins.issued.grantId).ok, false);
  resumeCommit();
  const applyResult = await applying;
  assert.equal(applyResult.ok, true, JSON.stringify(applyResult));
  assert.equal(commitWins.ticketStore.read(commitWins.issued.grantId).status, "applied");
});

test("Option B isolated prototype stops on lock loss and recovers without unauthorized retry", async (t) => {
  const scenario = createScenario(t);
  const originalContents = sourceContents(scenario.repository);
  let lockId;
  const originalAcquire = scenario.coordinator.acquire;
  const wrappedCoordinator = {
    ...scenario.coordinator,
    async acquire(workspace, mode, executionId, priority) {
      lockId = executionId;
      return originalAcquire(workspace, mode, executionId, priority);
    },
    assertOwner: (...args) => scenario.coordinator.assertOwner(...args),
    release: (...args) => scenario.coordinator.release(...args)
  };
  const prototype = createPreauthorizedIntegrationPrototype({
    manager: scenario.manager,
    workspaceCoordinator: wrappedCoordinator,
    ticketStore: scenario.ticketStore,
    trustedWorkspace: scenario.repository,
    workspaceHash: scenario.workspaceHash
  });
  const result = await prototype.execute({
    grantId: scenario.issued.grantId,
    callerHash,
    request: { batchId: scenario.batchId, expectedDiffHash: scenario.preview.diffHash },
    hooks: { afterRevalidation: () => scenario.coordinator.release(lockId) }
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "workspace_lock_lost");
  assert.deepEqual(sourceContents(scenario.repository), originalContents);
  assert.equal(scenario.ticketStore.read(scenario.issued.grantId).status, "rejected");
  const replay = await prototype.execute({ grantId: scenario.issued.grantId, callerHash, request: { batchId: scenario.batchId, expectedDiffHash: scenario.preview.diffHash } });
  assert.equal(replay.ok, false);
});

test("Option B isolated prototype detects all-ref drift after revalidation before applying", async (t) => {
  const scenario = createScenario(t);
  const originalContents = sourceContents(scenario.repository);
  const result = await scenario.execute({}, {
    afterRevalidation: () => git(scenario.repository, ["update-ref", "refs/tags/prototype-drift", scenario.baseCommit])
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "source_ref_changed");
  assert.deepEqual(sourceContents(scenario.repository), originalContents);
  assert.equal(scenario.ticketStore.read(scenario.issued.grantId).status, "rejected");
});

test("Option B isolated prototype rejects unrelated refs outside its named transition grant", async (t) => {
  const scenario = createScenario(t);
  const originalContents = sourceContents(scenario.repository);
  git(scenario.repository, ["update-ref", "refs/tags/unapproved-target", scenario.baseCommit]);
  const result = await scenario.execute();
  assert.equal(result.ok, false);
  assert.equal(result.reason, "source_ref_changed");
  assert.deepEqual(sourceContents(scenario.repository), originalContents);
});

test("Option B isolated prototype checks refs and source again during promotion", async (t) => {
  const scenario = createScenario(t, (repository) => ({
    renamePromotionFile(source, target) {
      fs.renameSync(source, target);
      if (target === path.join(repository, "src", "a.json")) git(repository, ["update-ref", "refs/tags/prototype-drift-during-apply", git(repository, ["rev-parse", "HEAD"])]);
    }
  }));
  const originalContents = sourceContents(scenario.repository);
  const result = await scenario.execute();
  assert.equal(result.ok, false);
  assert.equal(result.reason, "source_ref_changed");
  assert.equal(Object.hasOwn(result, "refChanges"), false);
  assert.deepEqual(sourceContents(scenario.repository), originalContents);
  assert.equal(scenario.manager.promotionRecoveryStatus().ok, true);
});

test("Option B isolated prototype rejects same-content source replacement before promotion rename", async (t) => {
  let replaced = false;
  let replacementIdentity;
  const scenario = createScenario(t, (repository) => ({
    writePromotionFile(filePath, content, options) {
      fs.writeFileSync(filePath, content, options);
      if (!replaced) {
        const target = path.join(repository, "src", "a.json");
        const replacement = path.join(repository, "src", "replacement.json");
        fs.writeFileSync(replacement, fs.readFileSync(target));
        fs.renameSync(replacement, target);
        const status = fs.statSync(target, { bigint: true });
        replacementIdentity = { dev: status.dev.toString(), ino: status.ino.toString() };
        replaced = true;
      }
    }
  }));
  const originalContents = sourceContents(scenario.repository);
  const originalIdentity = scenario.manager.captureSourceFileIdentityStates(["src/a.json"])[0];
  const originalStatus = fs.statSync(path.join(scenario.repository, "src", "a.json"), { bigint: true });
  assert.equal(originalIdentity.dev, originalStatus.dev.toString());
  assert.equal(originalIdentity.ino, originalStatus.ino.toString());
  const result = await scenario.execute();
  assert.equal(replaced, true);
  assert.notDeepEqual(replacementIdentity, { dev: originalIdentity.dev, ino: originalIdentity.ino });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "source_file_identity_changed");
  assert.deepEqual(sourceContents(scenario.repository), originalContents);
});

test("Option B isolated recovery preserves an independently replaced promoted target", async (t) => {
  let writeCount = 0;
  let independentIdentity;
  const scenario = createScenario(t, (repository) => ({
    writePromotionFile(filePath, content, options) {
      fs.writeFileSync(filePath, content, options);
      writeCount += 1;
      if (writeCount === 2) {
        const target = path.join(repository, "src", "a.json");
        const replacement = path.join(repository, "src", "replacement.json");
        fs.writeFileSync(replacement, "{\"value\":10}\n", "utf8");
        fs.renameSync(replacement, target);
        const status = fs.statSync(target, { bigint: true });
        independentIdentity = { dev: status.dev.toString(), ino: status.ino.toString() };
      }
    }
  }));
  const result = await scenario.execute();
  assert.equal(result.ok, false);
  assert.equal(result.reason, "promotion_rollback_failed");
  assert.equal(result.recoveryRequired, true);
  assert.deepEqual(sourceContents(scenario.repository), ["{\"value\":10}\n", "{\"value\":20}\n"]);
  assert.equal(scenario.manager.recoverPendingPromotions().ok, false);
  const finalStatus = fs.statSync(path.join(scenario.repository, "src", "a.json"), { bigint: true });
  assert.deepEqual({ dev: finalStatus.dev.toString(), ino: finalStatus.ino.toString() }, independentIdentity);
  assert.equal(scenario.ticketStore.read(scenario.issued.grantId).status, "committing");
});

test("Option B isolated prototype recovers a partial write after lock loss without retry", async (t) => {
  let lockLost = false;
  const scenario = createScenario(t, (repository) => ({
    renamePromotionFile(source, target) {
      fs.renameSync(source, target);
      if (target === path.join(repository, "src", "a.json")) lockLost = true;
    }
  }));
  const originalContents = sourceContents(scenario.repository);
  const coordinator = {
    acquire: (...args) => scenario.coordinator.acquire(...args),
    release: (...args) => scenario.coordinator.release(...args),
    assertOwner: (...args) => !lockLost && scenario.coordinator.assertOwner(...args)
  };
  const prototype = createPreauthorizedIntegrationPrototype({
    manager: scenario.manager,
    workspaceCoordinator: coordinator,
    ticketStore: scenario.ticketStore,
    trustedWorkspace: scenario.repository,
    workspaceHash: scenario.workspaceHash
  });
  const applied = await prototype.execute({
    grantId: scenario.issued.grantId,
    callerHash,
    request: { batchId: scenario.batchId, expectedDiffHash: scenario.preview.diffHash }
  });
  assert.equal(applied.ok, false);
  assert.equal(applied.reason, "workspace_lock_lost");
  assert.equal(applied.recoveryRequired, true);
  assert.deepEqual(sourceContents(scenario.repository), ["{\"value\":10}\n", originalContents[1]]);
  lockLost = false;
  const recoveryManager = createGitWorktreeBatchManager({ sourceWorkspace: scenario.repository, worktreeRoot: scenario.worktreeRoot });
  const recoveryPrototype = createPreauthorizedIntegrationPrototype({
    manager: recoveryManager,
    workspaceCoordinator: coordinator,
    ticketStore: scenario.ticketStore,
    trustedWorkspace: scenario.repository,
    workspaceHash: scenario.workspaceHash
  });
  const recovered = await recoveryPrototype.recover({ grantId: scenario.issued.grantId, callerHash, batchId: scenario.batchId });
  assert.deepEqual(recovered, { ok: true, recovered: "rolled_back", applied: false });
  assert.equal(scenario.ticketStore.read(scenario.issued.grantId).status, "rejected");
  assert.deepEqual(sourceContents(scenario.repository), originalContents);
  const replay = await recoveryPrototype.execute({
    grantId: scenario.issued.grantId,
    callerHash,
    request: { batchId: scenario.batchId, expectedDiffHash: scenario.preview.diffHash }
  });
  assert.equal(replay.ok, false);
  assert.deepEqual(sourceContents(scenario.repository), originalContents);
});

test("Option B isolated prototype rolls back a partial source write and refuses replay", async (t) => {
  let promotionRenames = 0;
  const scenario = createScenario(t, {
    renamePromotionFile(source, target) {
      promotionRenames += 1;
      if (promotionRenames === 2) throw new Error("injected rename failure");
      fs.renameSync(source, target);
    }
  });
  const originalContents = sourceContents(scenario.repository);
  const result = await scenario.execute();
  assert.equal(result.ok, false);
  assert.equal(result.reason, "promotion_failed");
  assert.deepEqual(sourceContents(scenario.repository), originalContents);
  assert.equal(scenario.ticketStore.read(scenario.issued.grantId).status, "rejected");
  const replay = await scenario.execute();
  assert.equal(replay.ok, false);
  assert.deepEqual(sourceContents(scenario.repository), originalContents);
});

test("Option B isolated prototype recovery does not duplicate a committed apply", async (t) => {
  const scenario = createScenario(t);
  const result = await scenario.execute({}, {
    afterApplyBeforeReceipt() { throw new Error("simulated process loss after durable commit marker"); }
  });
  assert.equal(result.ok, false);
  assert.equal(result.recoveryRequired, true);
  assert.equal(scenario.ticketStore.read(scenario.issued.grantId).status, "committing");
  const recoveryManager = createGitWorktreeBatchManager({ sourceWorkspace: scenario.repository, worktreeRoot: scenario.worktreeRoot });
  const recoveryStore = createPreauthorizedIntegrationTicketStore({ directory: path.join(scenario.root, "tickets") });
  const recoveryPrototype = createPreauthorizedIntegrationPrototype({
    manager: recoveryManager,
    workspaceCoordinator: scenario.coordinator,
    ticketStore: recoveryStore,
    trustedWorkspace: scenario.repository,
    workspaceHash: scenario.workspaceHash
  });
  const recovered = await recoveryPrototype.recover({ grantId: scenario.issued.grantId, callerHash, batchId: scenario.batchId });
  assert.deepEqual(recovered, { ok: true, recovered: "committed", applied: true });
  assert.equal(recoveryStore.read(scenario.issued.grantId).status, "applied");
  assert.deepEqual(sourceContents(scenario.repository), ["{\"value\":10}\n", "{\"value\":20}\n"]);
  const replay = await recoveryPrototype.execute({ grantId: scenario.issued.grantId, callerHash, request: { batchId: scenario.batchId, expectedDiffHash: scenario.preview.diffHash } });
  assert.equal(replay.ok, false);
  assert.deepEqual(sourceContents(scenario.repository), ["{\"value\":10}\n", "{\"value\":20}\n"]);
});

test("Option B isolated prototype recovers after actual process exit at partial and committed boundaries", async (t) => {
  const partial = createScenario(t);
  crashChildAfterPromotionBoundary(partial, "partial", 71);
  assert.deepEqual(sourceContents(partial.repository), ["{\"value\":10}\n", "{\"value\":2}\n"]);
  const partialRecoveryManager = createGitWorktreeBatchManager({ sourceWorkspace: partial.repository, worktreeRoot: partial.worktreeRoot });
  const partialRecoveryStore = createPreauthorizedIntegrationTicketStore({ directory: path.join(partial.root, "tickets") });
  const partialRecovery = createPreauthorizedIntegrationPrototype({
    manager: partialRecoveryManager,
    workspaceCoordinator: createWorkspaceCoordinator({ lockDirectory: path.join(partial.root, "locks") }),
    ticketStore: partialRecoveryStore,
    trustedWorkspace: partial.repository,
    workspaceHash: partial.workspaceHash
  });
  const rolledBack = await partialRecovery.recover({ grantId: partial.issued.grantId, callerHash, batchId: partial.batchId });
  assert.deepEqual(rolledBack, { ok: true, recovered: "rolled_back", applied: false });
  assert.equal(partialRecoveryStore.read(partial.issued.grantId).status, "rejected");
  assert.deepEqual(sourceContents(partial.repository), ["{\"value\":1}\n", "{\"value\":2}\n"]);

  const committed = createScenario(t);
  crashChildAfterPromotionBoundary(committed, "committed", 72);
  assert.deepEqual(sourceContents(committed.repository), ["{\"value\":10}\n", "{\"value\":20}\n"]);
  const committedRecoveryManager = createGitWorktreeBatchManager({ sourceWorkspace: committed.repository, worktreeRoot: committed.worktreeRoot });
  const committedRecoveryStore = createPreauthorizedIntegrationTicketStore({ directory: path.join(committed.root, "tickets") });
  const committedRecovery = createPreauthorizedIntegrationPrototype({
    manager: committedRecoveryManager,
    workspaceCoordinator: createWorkspaceCoordinator({ lockDirectory: path.join(committed.root, "locks") }),
    ticketStore: committedRecoveryStore,
    trustedWorkspace: committed.repository,
    workspaceHash: committed.workspaceHash
  });
  const reconciled = await committedRecovery.recover({ grantId: committed.issued.grantId, callerHash, batchId: committed.batchId });
  assert.deepEqual(reconciled, { ok: true, recovered: "committed", applied: true });
  assert.equal(committedRecoveryStore.read(committed.issued.grantId).status, "applied");
  const replay = await committedRecovery.execute({ grantId: committed.issued.grantId, callerHash, request: { batchId: committed.batchId, expectedDiffHash: committed.preview.diffHash } });
  assert.equal(replay.ok, false);
  assert.deepEqual(sourceContents(committed.repository), ["{\"value\":10}\n", "{\"value\":20}\n"]);
});

test("Option B isolated ticket store preserves another owner's lock after a busy contender", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "preauthorized-ticket-lock-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const refSnapshot = createGitRefSnapshot("");
  assert.equal(refSnapshot.ok, true);
  const changes = [{
    relativePath: "src/example.json",
    mode: "replace",
    fileMode: "100644",
    changeType: "modified",
    contentBase64: Buffer.from("{}\n").toString("base64")
  }];
  const preview = {
    diff: "exact preview",
    diffHash: "1".repeat(64),
    diffPreviewHash: "2".repeat(64),
    changePayloadHash: integrationPayloadHash(changes),
    filesChanged: ["src/example.json"],
    changes,
    sourceFileStates: [{ relativePath: "src/example.json", state: "present", sha256: "3".repeat(64), fileMode: "100644" }]
  };
  const store = createPreauthorizedIntegrationTicketStore({ directory });
  const issued = store.issue({
    callerHash,
    workspaceHash: "4".repeat(64),
    batchId: "5".repeat(32),
    preview,
    acceptedTasks: [{ taskId: "task-one", status: "completed", filesChanged: ["src/example.json"] }],
    sourceRefHash: refSnapshot.snapshot.refsHash,
    sourceRefSnapshot: refSnapshot.snapshot,
    baseCommit: "6".repeat(40),
    expiresAt: Date.now() + 60000
  });
  assert.equal(issued.ok, true);
  const lockPath = path.join(directory, `${issued.grantId}.json.lock`);
  fs.writeFileSync(lockPath, JSON.stringify({ ownerId: "live-owner", pid: process.pid }), "utf8");
  assert.deepEqual(store.requestCancel(issued.grantId), { ok: false, reason: "prototype_ticket_busy" });
  assert.equal(fs.readFileSync(lockPath, "utf8"), JSON.stringify({ ownerId: "live-owner", pid: process.pid }));
  fs.rmSync(lockPath);
  assert.equal(store.claim({ grantId: issued.grantId, callerHash, workspaceHash: "4".repeat(64), batchId: "5".repeat(32), expectedDiffHash: preview.diffHash }).ok, true);
  const sharedGate = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
  const workerScript = [
    `const { parentPort, workerData } = require("node:worker_threads");`,
    `(async () => {`,
    `const { createPreauthorizedIntegrationTicketStore } = await import(workerData.moduleUrl);`,
    `const store = createPreauthorizedIntegrationTicketStore({ directory: workerData.directory });`,
    `parentPort.postMessage({ ready: true });`,
    `Atomics.wait(new Int32Array(workerData.sharedGate), 0, 0);`,
    `const result = workerData.action === "cancel" ? store.requestCancel(workerData.grantId) : store.beginCommit(workerData.grantId);`,
    `parentPort.postMessage({ result });`,
    `})().catch((error) => parentPort.postMessage({ error: error.message }));`
  ].join("\n");
  const moduleUrl = new URL("./fixtures/preauthorized-integration-prototype.js", import.meta.url).href;
  function startWorker(action) {
    const worker = new Worker(workerScript, { eval: true, workerData: { moduleUrl, directory, grantId: issued.grantId, action, sharedGate } });
    let markReady;
    let markResult;
    const ready = new Promise((resolve, reject) => {
      markReady = resolve;
      worker.once("error", reject);
    });
    const result = new Promise((resolve, reject) => {
      markResult = resolve;
      worker.once("error", reject);
    });
    const exited = new Promise((resolve) => worker.once("exit", resolve));
    worker.on("message", (message) => {
      if (message.ready) markReady();
      else if (message.error) markResult(Promise.reject(new Error(message.error)));
      else markResult(message.result);
    });
    return { worker, ready, result, exited };
  }
  const workers = [startWorker("cancel"), startWorker("commit")];
  await Promise.all(workers.map((entry) => entry.ready));
  Atomics.store(new Int32Array(sharedGate), 0, 1);
  Atomics.notify(new Int32Array(sharedGate), 0, 2);
  const outcomes = await Promise.all(workers.map((entry) => entry.result));
  await Promise.all(workers.map((entry) => entry.exited));
  assert.equal(outcomes.filter((outcome) => outcome.ok).length, 1);
  const finalTicket = store.read(issued.grantId);
  assert.ok(["cancel_requested", "committing"].includes(finalTicket.status));
  assert.equal(finalTicket.status === "cancel_requested", outcomes.some((outcome) => outcome.ok && outcome.ticket?.status === "cancel_requested"));
});
