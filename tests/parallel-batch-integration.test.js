import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createAdapter } from "../subagent-bridge/src/adapters/agent-adapter-base.js";
import { createBridgeRuntime } from "../subagent-bridge/src/runtime/bridge-runtime.js";
import { createParallelArtifactStore } from "../subagent-bridge/src/services/parallel-artifact-store.js";
import { createParallelBatchRegistry } from "../subagent-bridge/src/services/parallel-batch-registry.js";
import { createParallelBatchService } from "../subagent-bridge/src/services/parallel-batch.js";
import { createGitWorktreeBatchManager } from "../subagent-bridge/src/services/git-worktree-batch.js";
import { createWorkspaceCoordinator } from "../subagent-bridge/src/services/workspace-coordinator.js";

function git(repo, args) {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function createRepository(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "parallel-integration-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const workspace = path.join(root, "workspace");
  fs.mkdirSync(path.join(workspace, "src"), { recursive: true });
  git(root, ["init", "-q", "workspace"]);
  git(workspace, ["config", "user.email", "bridge@example.invalid"]);
  git(workspace, ["config", "user.name", "Bridge Test"]);
  fs.writeFileSync(path.join(workspace, "src", "a.txt"), "alpha\n", "utf8");
  fs.writeFileSync(path.join(workspace, "src", "b.txt"), "beta\n", "utf8");
  git(workspace, ["add", "-A"]);
  git(workspace, ["commit", "-qm", "initial"]);
  return { root, workspace, baseCommit: git(workspace, ["rev-parse", "HEAD"]).trim() };
}

function createConfiguration(root, verificationCommands = ["git diff --check"]) {
  const stateRoot = path.join(root, "runtime");
  return {
    packageRoot: root,
    statePaths: {
      logs: path.join(stateRoot, "logs"),
      state: path.join(stateRoot, "state"),
      cache: path.join(stateRoot, "cache")
    },
    reliability: { maxAttempts: 1, maxUnknownAttemptCostUsd: 0.1, dailyCostLimitUsd: 100, monthlyCostLimitUsd: 100, costBudgetEnforced: false },
    observability: { maxMetricFileBytes: 20971520, maxMetricRetentionDays: 45 },
    orchestration: { taskProfiles: {} },
    codex: { timeoutMs: 30000, maxRetries: 0, allowedModes: ["read_only", "edit"], defaultMode: "edit" },
    parallelBatch: {
      enabled: true,
      editEnabled: true,
      maxWorkers: 2,
      providerConcurrency: { codex: 1 },
      defaultProviderConcurrency: 1,
      planTtlMs: 60000,
      maxSummaryCharacters: 4096,
      maxBatchSummaryBytes: 8192,
      maxReadablePathsPerTask: 10,
      maxContextFilesPerTask: 10,
      maxReadableSnapshotBytes: 1048576,
      artifactTtlMs: 60000,
      maxArtifactBytes: 65536,
      maxArtifactTotalBytes: 1048576,
      allowedTargets: ["codex"],
      opencodeOutputCapability: "unavailable",
      codexNetworkOffCapability: "available",
      worktreeRoot: path.join(stateRoot, "worktrees"),
      verificationCommands,
      orphanGraceMs: 1000
    }
  };
}

function createEditAdapter(requests = []) {
  const adapter = createAdapter("codex", { canRead: true, canWrite: true, supportsSandbox: true, supportsModelSelection: true });
  adapter.execute = async (request) => {
    requests.push(request);
    if (request.mode === "edit") fs.writeFileSync(path.join(request.workspace, "src", "a.txt"), "edited by worker\n", "utf8");
    return {
      ok: true,
      backend: "codex",
      model: request.model || "default",
      result: JSON.stringify({ status: "ok", summary: "file edited", action_required: "none" }),
      error: null,
      retryable: false,
      timedOut: false,
      exitCode: 0,
      durationMs: 5,
      metrics: { retries: 0, totalCostUsd: 0.01 }
    };
  };
  return adapter;
}

function readOnlyTask() {
  return {
    taskId: "read-one",
    role: "reviewer",
    mode: "read_only",
    target: "codex",
    objective: "Review the selected companion file",
    readablePaths: ["src/b.txt"]
  };
}

async function waitForBatch(runtime, workspace, batchId, statuses, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let latestSummary = null;
  while (Date.now() < deadline) {
    const result = await runtime.getParallelBatch({ batchId }, workspace);
    if (result.ok) {
      latestSummary = result.summary;
      if (statuses.includes(result.summary.status)) return result.summary;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`timeout waiting for batch statuses: ${statuses.join(", ")}; latest=${JSON.stringify(latestSummary)}`);
}

function editTask(verificationCommands = ["git diff --check"]) {
  return {
    taskId: "edit-one",
    role: "implementer",
    mode: "edit",
    target: "codex",
    objective: "Replace the file content",
    files: ["src/a.txt"],
    acceptanceCriteria: ["File contains the new content"],
    verificationCommands,
    stopConditions: ["Stop if the task needs a file outside the selected set"],
    resourceClaims: ["fixture:edit-repository"],
    maxFilesChanged: 1,
    maxFileBytes: 1024,
    maxTotalDiffBytes: 4096
  };
}

async function createReadyEditFixture(t) {
  const repository = createRepository(t);
  const configuration = createConfiguration(repository.root);
  const observedRequests = [];
  const runtime = createBridgeRuntime({ configuration, adapters: { codex: createEditAdapter(observedRequests) }, sleep: async () => {} });
  const prepared = await runtime.prepareParallelBatch({ objective: "Edit the file", batchMaxReservedCostUsd: 1, tasks: [editTask()] }, repository.workspace);
  assert.equal(prepared.ok, true, JSON.stringify(prepared));
  const started = await runtime.startParallelBatch({ planId: prepared.planId, planHash: prepared.planHash }, repository.workspace);
  assert.equal(started.ok, true);
  const ready = await waitForBatch(runtime, repository.workspace, started.batchId, ["ready_for_approval", "blocked", "failed"]);
  return { ...repository, configuration, observedRequests, runtime, started, ready };
}

async function createSourceRefRejectedFixture(t) {
  const fixture = await createReadyEditFixture(t);
  git(fixture.workspace, ["tag", "refs/codex/revalidation-rejected-test"]);
  const rejected = await fixture.runtime.approveParallelIntegration({
    batchId: fixture.started.batchId,
    approvalRef: fixture.ready.approval.approvalRef,
    expectedDiffHash: fixture.ready.approval.diffHash
  }, fixture.workspace);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.reason, "source_ref_changed");
  return fixture;
}

test("V2-INTEGRATION: edit batch prepares an approval-bound diff and applies it atomically", async (t) => {
  const { root, workspace, baseCommit } = createRepository(t);
  const configuration = createConfiguration(root);
  const observedRequests = [];
  const runtime = createBridgeRuntime({ configuration, adapters: { codex: createEditAdapter(observedRequests) }, sleep: async () => {} });
  const prepared = await runtime.prepareParallelBatch({ objective: "Edit the file and review a file", batchMaxReservedCostUsd: 1, tasks: [editTask(), readOnlyTask()] }, workspace);
  assert.equal(prepared.ok, true, JSON.stringify(prepared));
  const started = await runtime.startParallelBatch({ planId: prepared.planId, planHash: prepared.planHash }, workspace);
  assert.equal(started.ok, true);
  const ready = await waitForBatch(runtime, workspace, started.batchId, ["ready_for_approval", "blocked", "failed"]);
  const editTaskSummary = ready.tasks[0];
  let safeFailureDiagnostics = null;
  if (ready.status !== "ready_for_approval" && editTaskSummary.detailRef) {
    const detail = await runtime.getParallelTaskDetail({ batchId: started.batchId, taskId: editTaskSummary.taskId, detailRef: editTaskSummary.detailRef }, workspace);
    if (detail.ok) {
      const payload = JSON.parse(detail.page.content);
      safeFailureDiagnostics = {
        failureClass: payload.failureClass,
        failureStage: payload.hostDiagnostics?.failureStage || payload.diagnostics?.failureStage || null,
        providerCode: payload.hostDiagnostics?.providerCode || payload.diagnostics?.providerCode || null,
        osErrorCode: payload.hostDiagnostics?.osErrorCode || payload.diagnostics?.osErrorCode || null,
        processExitCode: payload.hostProcessExitCode ?? payload.processExitCode ?? null,
        hostOperation: payload.hostOperation || null,
        gitFailureCode: payload.gitFailureCode || null
      };
    }
  }
  assert.equal(ready.status, "ready_for_approval", JSON.stringify({ status: ready.status, failureClass: editTaskSummary.failureClass, safeFailureDiagnostics }));
  assert.equal(ready.approvalRequired, true);
  assert.deepEqual(ready.tasks[0].filesChanged, ["src/a.txt"]);
  assert.equal(ready.tasks[0].riskLevel, "low_impact");
  assert.equal(ready.tasks[0].verification.length, 1);
  assert.equal(ready.tasks[0].verification[0].exitCode, 0);
  const editRequest = observedRequests.find((request) => request.mode === "edit");
  assert.match(editRequest.prompt, /Stop conditions:/);
  assert.match(editRequest.prompt, /fixture:edit-repository/);
  assert.match(editRequest.prompt, /Host-run verification commands/);
  assert.deepEqual(ready.approval.filesChanged, ["src/a.txt"]);
  assert.match(ready.approval.approvalRef, /^[a-f0-9]{64}$/);
  assert.match(ready.approval.detailRef, /^[a-f0-9]{64}$/);
  const integrationPreview = await runtime.getParallelTaskDetail({
    batchId: started.batchId,
    taskId: "integration",
    detailRef: ready.approval.detailRef
  }, workspace);
  assert.equal(integrationPreview.ok, true);
  assert.match(JSON.parse(integrationPreview.page.content).diff, /edited by worker/);
  assert.equal(fs.readFileSync(path.join(workspace, "src", "a.txt"), "utf8"), "alpha\n");
  fs.writeFileSync(path.join(workspace, "src", "a.txt"), "user edit after preview\n", "utf8");
  const sourceFileDrift = await runtime.approveParallelIntegration({
    batchId: started.batchId,
    approvalRef: ready.approval.approvalRef,
    expectedDiffHash: ready.approval.diffHash
  }, workspace);
  assert.equal(sourceFileDrift.ok, false);
  assert.equal(sourceFileDrift.reason, "source_file_state_changed");
  assert.equal(fs.readFileSync(path.join(workspace, "src", "a.txt"), "utf8"), "user edit after preview\n");
  fs.writeFileSync(path.join(workspace, "src", "a.txt"), "alpha\n", "utf8");
  const competingCoordinator = createWorkspaceCoordinator({
    lockDirectory: path.join(configuration.statePaths.cache, "locks"),
    staleLockMs: 60000,
    leaseHeartbeatMs: 1000
  });
  const readerExecutionId = "approval-test-reader";
  const readGrant = await competingCoordinator.acquire(workspace, "read_only", readerExecutionId);
  assert.ok(readGrant);
  let approvalSettled = false;
  const approvalPromise = runtime.approveParallelIntegration({
    batchId: started.batchId,
    approvalRef: ready.approval.approvalRef,
    expectedDiffHash: ready.approval.diffHash
  }, workspace);
  void approvalPromise.then(() => { approvalSettled = true; });
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(approvalSettled, false);
  assert.equal(fs.readFileSync(path.join(workspace, "src", "a.txt"), "utf8"), "alpha\n");
  competingCoordinator.release(readerExecutionId);
  const applied = await approvalPromise;
  assert.equal(applied.ok, true);
  assert.equal(applied.summary.status, "integrated");
  assert.doesNotMatch(applied.summary.message, /cleanup is pending/);
  assert.equal(fs.readFileSync(path.join(workspace, "src", "a.txt"), "utf8").replaceAll("\r\n", "\n"), "edited by worker\n");
  assert.equal(git(workspace, ["rev-parse", "HEAD"]).trim(), baseCommit);
  const promotionRoot = path.join(configuration.parallelBatch.worktreeRoot, "promotion-journals");
  const pendingJournalFiles = fs.readdirSync(promotionRoot).flatMap((workspaceHash) =>
    fs.readdirSync(path.join(promotionRoot, workspaceHash)).filter((entry) => entry.endsWith(".json")));
  assert.deepEqual(pendingJournalFiles, []);
});

test("V2-INTEGRATION: source-ref rejection can be rebound to a descendant HEAD without applying source files", async (t) => {
  const { workspace, baseCommit, runtime, observedRequests, started, ready } = await createReadyEditFixture(t);
  const taskDiagnostic = ready.tasks[0].detailRef
    ? await runtime.getParallelTaskDetail({ batchId: started.batchId, taskId: ready.tasks[0].taskId, detailRef: ready.tasks[0].detailRef }, workspace)
    : null;
  const diagnosticPayload = taskDiagnostic?.ok ? JSON.parse(taskDiagnostic.page.content) : null;
  assert.equal(ready.status, "ready_for_approval", JSON.stringify({ summary: ready, diagnostics: diagnosticPayload ? { failureClass: diagnosticPayload.failureClass, diagnostics: diagnosticPayload.diagnostics, hostDiagnostics: diagnosticPayload.hostDiagnostics, hostOperation: diagnosticPayload.hostOperation, gitFailureCode: diagnosticPayload.gitFailureCode } : null }));
  const originalApprovalRef = ready.approval.approvalRef;
  const originalDiffHash = ready.approval.diffHash;
  const providerRequestCount = observedRequests.length;
  git(workspace, ["tag", "refs/codex/revalidation-test"]);
  const rejected = await runtime.approveParallelIntegration({ batchId: started.batchId, approvalRef: originalApprovalRef, expectedDiffHash: originalDiffHash }, workspace);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.reason, "source_ref_changed");
  fs.writeFileSync(path.join(workspace, "src", "unrelated.txt"), "unrelated progress\n", "utf8");
  git(workspace, ["add", "src/unrelated.txt"]);
  git(workspace, ["commit", "-qm", "unrelated source progress"]);
  const currentHead = git(workspace, ["rev-parse", "HEAD"]).trim();
  assert.notEqual(currentHead, baseCommit);
  const rebound = await runtime.revalidateParallelIntegration({ batchId: started.batchId, approvalRef: originalApprovalRef, expectedDiffHash: originalDiffHash }, workspace);
  assert.equal(rebound.ok, true, JSON.stringify(rebound));
  assert.equal(rebound.summary.status, "ready_for_approval");
  assert.notEqual(rebound.summary.approval.approvalRef, originalApprovalRef);
  assert.equal(rebound.summary.approval.diffHash, originalDiffHash);
  assert.deepEqual(rebound.summary.approval.filesChanged, ["src/a.txt"]);
  assert.equal(git(workspace, ["rev-parse", "HEAD"]).trim(), currentHead);
  assert.equal(fs.readFileSync(path.join(workspace, "src", "a.txt"), "utf8"), "alpha\n");
  assert.equal(fs.readFileSync(path.join(workspace, "src", "unrelated.txt"), "utf8"), "unrelated progress\n");
  assert.equal(observedRequests.length, providerRequestCount);
  const oldApproval = await runtime.approveParallelIntegration({ batchId: started.batchId, approvalRef: originalApprovalRef, expectedDiffHash: originalDiffHash }, workspace);
  assert.equal(oldApproval.ok, false);
  assert.equal(oldApproval.reason, "approval_ref_mismatch");
  const newDetail = await runtime.getParallelTaskDetail({
    batchId: started.batchId,
    taskId: "integration",
    detailRef: rebound.summary.approval.detailRef
  }, workspace);
  assert.equal(newDetail.ok, true);
  const detailPayload = JSON.parse(newDetail.page.content);
  assert.equal(detailPayload.baseCommit, currentHead);
  assert.equal(detailPayload.diffHash, originalDiffHash);
  assert.match(detailPayload.diff, /edited by worker/);
  const storedManifest = await runtime.getParallelBatch({ batchId: started.batchId }, workspace);
  assert.equal(storedManifest.ok, true);
  assert.equal(storedManifest.summary.approval.approvalRef, rebound.summary.approval.approvalRef);
  const sourceTargetPath = path.join(workspace, "src", "a.txt");
  const replacementTargetPath = path.join(workspace, "src", ".a.txt-replacement");
  fs.writeFileSync(replacementTargetPath, "alpha\n", "utf8");
  fs.rmSync(sourceTargetPath);
  fs.renameSync(replacementTargetPath, sourceTargetPath);
  const changedIdentityApproval = await runtime.approveParallelIntegration({
    batchId: started.batchId,
    approvalRef: rebound.summary.approval.approvalRef,
    expectedDiffHash: rebound.summary.approval.diffHash
  }, workspace);
  assert.equal(changedIdentityApproval.ok, false);
  assert.equal(changedIdentityApproval.reason, "source_file_identity_changed");
  assert.equal(fs.readFileSync(sourceTargetPath, "utf8"), "alpha\n");
});

test("V2-INTEGRATION: repeated source-ref changes can receive fresh bindings and approval", async (t) => {
  const fixture = await createSourceRefRejectedFixture(t);
  const originalApprovalRef = fixture.ready.approval.approvalRef;
  const originalDiffHash = fixture.ready.approval.diffHash;
  const providerRequestCount = fixture.observedRequests.length;
  const firstRevalidation = await fixture.runtime.revalidateParallelIntegration({
    batchId: fixture.started.batchId,
    approvalRef: originalApprovalRef,
    expectedDiffHash: originalDiffHash
  }, fixture.workspace);
  assert.equal(firstRevalidation.ok, true, JSON.stringify(firstRevalidation));
  const firstRevalidatedApproval = firstRevalidation.summary.approval;
  git(fixture.workspace, ["tag", "refs/codex/revalidation-second-rejection"]);
  const secondRefRejection = await fixture.runtime.approveParallelIntegration({
    batchId: fixture.started.batchId,
    approvalRef: firstRevalidatedApproval.approvalRef,
    expectedDiffHash: firstRevalidatedApproval.diffHash
  }, fixture.workspace);
  assert.equal(secondRefRejection.ok, false);
  assert.equal(secondRefRejection.reason, "source_ref_changed");
  assert.equal(fs.readFileSync(path.join(fixture.workspace, "src", "a.txt"), "utf8"), "alpha\n");
  const secondRevalidation = await fixture.runtime.revalidateParallelIntegration({
    batchId: fixture.started.batchId,
    approvalRef: firstRevalidatedApproval.approvalRef,
    expectedDiffHash: firstRevalidatedApproval.diffHash
  }, fixture.workspace);
  assert.equal(secondRevalidation.ok, true, JSON.stringify(secondRevalidation));
  const secondRevalidatedApproval = secondRevalidation.summary.approval;
  assert.notEqual(secondRevalidatedApproval.approvalRef, firstRevalidatedApproval.approvalRef);
  assert.equal(secondRevalidatedApproval.diffHash, originalDiffHash);
  const staleApproval = await fixture.runtime.approveParallelIntegration({
    batchId: fixture.started.batchId,
    approvalRef: firstRevalidatedApproval.approvalRef,
    expectedDiffHash: firstRevalidatedApproval.diffHash
  }, fixture.workspace);
  assert.equal(staleApproval.ok, false);
  assert.equal(staleApproval.reason, "approval_ref_mismatch");
  const applied = await fixture.runtime.approveParallelIntegration({
    batchId: fixture.started.batchId,
    approvalRef: secondRevalidatedApproval.approvalRef,
    expectedDiffHash: secondRevalidatedApproval.diffHash
  }, fixture.workspace);
  assert.equal(applied.ok, true, JSON.stringify(applied));
  assert.equal(applied.summary.status, "integrated");
  assert.equal(fs.readFileSync(path.join(fixture.workspace, "src", "a.txt"), "utf8").replaceAll("\r\n", "\n"), "edited by worker\n");
  assert.equal(fs.readFileSync(path.join(fixture.workspace, "src", "b.txt"), "utf8"), "beta\n");
  assert.equal(fixture.observedRequests.length, providerRequestCount);
});

test("V2-INTEGRATION: source target content drift is rejected during revalidation", async (t) => {
  const { workspace, runtime, started, ready, observedRequests } = await createReadyEditFixture(t);
  git(workspace, ["tag", "refs/codex/target-drift-test"]);
  const sourceRefRejected = await runtime.approveParallelIntegration({
    batchId: started.batchId,
    approvalRef: ready.approval.approvalRef,
    expectedDiffHash: ready.approval.diffHash
  }, workspace);
  assert.equal(sourceRefRejected.reason, "source_ref_changed");
  fs.writeFileSync(path.join(workspace, "src", "a.txt"), "changed source target\n", "utf8");
  git(workspace, ["add", "src/a.txt"]);
  git(workspace, ["commit", "-qm", "change protected target"]);
  const revalidated = await runtime.revalidateParallelIntegration({
    batchId: started.batchId,
    approvalRef: ready.approval.approvalRef,
    expectedDiffHash: ready.approval.diffHash
  }, workspace);
  assert.equal(revalidated.ok, false);
  assert.equal(revalidated.reason, "source_file_state_changed");
  assert.equal(fs.readFileSync(path.join(workspace, "src", "a.txt"), "utf8"), "changed source target\n");
  assert.equal(observedRequests.length, 1);
});

test("V2-INTEGRATION: source target Git mode drift is rejected during revalidation", async (t) => {
  const { workspace, runtime, started, ready, observedRequests } = await createSourceRefRejectedFixture(t);
  git(workspace, ["update-index", "--chmod=+x", "src/a.txt"]);
  git(workspace, ["commit", "-qm", "change protected target mode"]);
  const revalidated = await runtime.revalidateParallelIntegration({
    batchId: started.batchId,
    approvalRef: ready.approval.approvalRef,
    expectedDiffHash: ready.approval.diffHash
  }, workspace);
  assert.equal(revalidated.ok, false);
  assert.equal(revalidated.reason, "source_file_state_changed");
  assert.equal(observedRequests.length, 1);
});

test("V2-INTEGRATION: missing and corrupt stored detail artifacts fail closed", async (t) => {
  const missingFixture = await createSourceRefRejectedFixture(t);
  const missingArtifactPath = path.join(missingFixture.configuration.statePaths.state, "parallel-artifacts", `${missingFixture.ready.approval.detailRef}.json`);
  fs.rmSync(missingArtifactPath);
  const missing = await missingFixture.runtime.revalidateParallelIntegration({
    batchId: missingFixture.started.batchId,
    approvalRef: missingFixture.ready.approval.approvalRef,
    expectedDiffHash: missingFixture.ready.approval.diffHash
  }, missingFixture.workspace);
  assert.equal(missing.ok, false);
  assert.equal(missing.reason, "integration_artifact_unavailable");
  assert.equal(fs.readFileSync(path.join(missingFixture.workspace, "src", "a.txt"), "utf8"), "alpha\n");

  const corruptFixture = await createSourceRefRejectedFixture(t);
  const corruptArtifactPath = path.join(corruptFixture.configuration.statePaths.state, "parallel-artifacts", `${corruptFixture.ready.approval.detailRef}.json`);
  const envelope = JSON.parse(fs.readFileSync(corruptArtifactPath, "utf8"));
  envelope.content = "{}";
  fs.writeFileSync(corruptArtifactPath, JSON.stringify(envelope), "utf8");
  const corrupt = await corruptFixture.runtime.revalidateParallelIntegration({
    batchId: corruptFixture.started.batchId,
    approvalRef: corruptFixture.ready.approval.approvalRef,
    expectedDiffHash: corruptFixture.ready.approval.diffHash
  }, corruptFixture.workspace);
  assert.equal(corrupt.ok, false);
  assert.equal(corrupt.reason, "integration_artifact_invalid");
  assert.equal(fs.readFileSync(path.join(corruptFixture.workspace, "src", "a.txt"), "utf8"), "alpha\n");
  assert.equal(missingFixture.observedRequests.length, 1);
  assert.equal(corruptFixture.observedRequests.length, 1);
});

test("V2-INTEGRATION: expired stored detail artifact cannot be rebound", async (t) => {
  const fixture = await createSourceRefRejectedFixture(t);
  const artifactPath = path.join(fixture.configuration.statePaths.state, "parallel-artifacts", `${fixture.ready.approval.detailRef}.json`);
  const envelope = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  envelope.expiresAt = new Date(0).toISOString();
  fs.writeFileSync(artifactPath, JSON.stringify(envelope), "utf8");
  const revalidated = await fixture.runtime.revalidateParallelIntegration({
    batchId: fixture.started.batchId,
    approvalRef: fixture.ready.approval.approvalRef,
    expectedDiffHash: fixture.ready.approval.diffHash
  }, fixture.workspace);
  assert.equal(revalidated.ok, false);
  assert.equal(revalidated.reason, "integration_artifact_expired");
  assert.equal(fs.readFileSync(path.join(fixture.workspace, "src", "a.txt"), "utf8"), "alpha\n");
  assert.equal(fixture.observedRequests.length, 1);
});

test("V2-INTEGRATION: unrelated HEAD cannot receive a stored integration payload", async (t) => {
  const { workspace, runtime, started, ready, observedRequests } = await createReadyEditFixture(t);
  git(workspace, ["tag", "refs/codex/unrelated-head-test"]);
  const sourceRefRejected = await runtime.approveParallelIntegration({
    batchId: started.batchId,
    approvalRef: ready.approval.approvalRef,
    expectedDiffHash: ready.approval.diffHash
  }, workspace);
  assert.equal(sourceRefRejected.reason, "source_ref_changed");
  git(workspace, ["checkout", "--orphan", "unrelated-head"]);
  git(workspace, ["rm", "-r", "--cached", "--ignore-unmatch", "."]);
  git(workspace, ["add", "-A"]);
  git(workspace, ["commit", "-qm", "unrelated root"]);
  const revalidated = await runtime.revalidateParallelIntegration({
    batchId: started.batchId,
    approvalRef: ready.approval.approvalRef,
    expectedDiffHash: ready.approval.diffHash
  }, workspace);
  assert.equal(revalidated.ok, false);
  assert.equal(revalidated.reason, "source_head_unrelated");
  assert.equal(fs.readFileSync(path.join(workspace, "src", "a.txt"), "utf8"), "alpha\n");
  assert.equal(observedRequests.length, 1);
});

test("V2-INTEGRATION: JSON fixture edit preserves every non-label field before source approval", async (t) => {
  const { root, workspace } = createRepository(t);
  const fixturePath = "src/a.txt";
  const originalValue = { schemaVersion: 1, label: "bounded-read-only-acceptance", left: 6, right: 7, expectedProduct: 42 };
  fs.writeFileSync(path.join(workspace, fixturePath), `${JSON.stringify(originalValue)}\n`, "utf8");
  git(workspace, ["add", fixturePath]);
  git(workspace, ["commit", "-qm", "add JSON edit fixture"]);
  const baseCommit = git(workspace, ["rev-parse", "HEAD"]).trim();
  const configuration = createConfiguration(root);
  const adapter = createAdapter("codex", { canRead: true, canWrite: true, supportsSandbox: true, supportsModelSelection: true });
  adapter.execute = async (request) => {
    const fixtureAbsolutePath = path.join(request.workspace, fixturePath);
    const value = JSON.parse(fs.readFileSync(fixtureAbsolutePath, "utf8"));
    value.label = "bounded-edit-acceptance";
    fs.writeFileSync(fixtureAbsolutePath, `${JSON.stringify(value)}\n`, "utf8");
    return {
      ok: true,
      backend: "codex",
      model: request.model,
      result: JSON.stringify({ status: "ok", summary: "fixture label changed", action_required: "none" }),
      error: null,
      retryable: false,
      timedOut: false,
      exitCode: 0,
      durationMs: 5,
      metrics: { retries: 0, totalCostUsd: 0.01 }
    };
  };
  const runtime = createBridgeRuntime({ configuration, adapters: { codex: adapter }, sleep: async () => {} });
  const prepared = await runtime.prepareParallelBatch({
    objective: "Update the disposable JSON fixture label",
    batchMaxReservedCostUsd: 1,
    tasks: [{
      taskId: "json-label-edit",
      role: "implementer",
      mode: "edit",
      target: "codex",
      objective: "Change only the label field and preserve every other JSON value",
      files: [fixturePath],
      acceptanceCriteria: ["Only label changes to bounded-edit-acceptance"],
      verificationCommands: ["git diff --check"]
    }]
  }, workspace);
  assert.equal(prepared.ok, true, JSON.stringify(prepared));
  const started = await runtime.startParallelBatch({ planId: prepared.planId, planHash: prepared.planHash }, workspace);
  assert.equal(started.ok, true);
  const ready = await waitForBatch(runtime, workspace, started.batchId, ["ready_for_approval", "blocked", "failed"]);
  assert.equal(ready.status, "ready_for_approval", JSON.stringify(ready));
  assert.equal(ready.tasks[0].verification[0].exitCode, 0);
  assert.deepEqual(ready.tasks[0].filesChanged, [fixturePath]);
  const integrationDetail = await runtime.getParallelTaskDetail({
    batchId: started.batchId,
    taskId: "integration",
    detailRef: ready.approval.detailRef
  }, workspace);
  assert.equal(integrationDetail.ok, true);
  const integrationPayload = JSON.parse(integrationDetail.page.content);
  assert.equal(integrationPayload.diffHash, ready.approval.diffHash);
  const addedJsonLines = integrationPayload.diff.split(/\r?\n/).filter((line) => line.startsWith("+") && !line.startsWith("+++"));
  assert.equal(addedJsonLines.length, 1);
  const integratedValue = JSON.parse(addedJsonLines[0].slice(1));
  assert.deepEqual(integratedValue, { ...originalValue, label: "bounded-edit-acceptance" });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(workspace, fixturePath), "utf8")), originalValue);
  assert.equal(git(workspace, ["rev-parse", "HEAD"]).trim(), baseCommit);
  assert.equal(git(workspace, ["status", "--porcelain=v1", "--untracked-files=all"]).trim(), "");
});

test("V2-INTEGRATION: CRLF fixture edits pass working-tree and staged-index verification", async (t) => {
  const { root, workspace } = createRepository(t);
  const fixturePath = "tests/fixtures/parallel-batch-acceptance.json";
  const sourceFixturePath = path.resolve(fixturePath);
  const originalBytes = fs.readFileSync(sourceFixturePath);
  const originalValue = JSON.parse(originalBytes.toString("utf8"));
  fs.mkdirSync(path.dirname(path.join(workspace, fixturePath)), { recursive: true });
  fs.writeFileSync(path.join(workspace, fixturePath), originalBytes);
  git(workspace, ["add", fixturePath]);
  git(workspace, ["commit", "-qm", "add source JSON fixture"]);
  const baseCommit = git(workspace, ["rev-parse", "HEAD"]).trim();
  const configuration = createConfiguration(root);
  const adapter = createAdapter("codex", { canRead: true, canWrite: true, supportsSandbox: true, supportsModelSelection: true });
  adapter.execute = async (request) => {
    const fixtureAbsolutePath = path.join(request.workspace, fixturePath);
    const value = JSON.parse(fs.readFileSync(fixtureAbsolutePath, "utf8"));
    value.label = "bounded-edit-acceptance";
    const content = `${JSON.stringify(value, null, 2)}\n`.replaceAll("\n", "\r\n");
    fs.writeFileSync(fixtureAbsolutePath, content, "utf8");
    return {
      ok: true,
      backend: "codex",
      model: request.model,
      result: JSON.stringify({ status: "ok", summary: "fixture label changed", action_required: "none" }),
      error: null,
      retryable: false,
      timedOut: false,
      exitCode: 0,
      durationMs: 5,
      metrics: { retries: 0, totalCostUsd: 0.01 }
    };
  };
  const runtime = createBridgeRuntime({ configuration, adapters: { codex: adapter }, sleep: async () => {} });
  const prepared = await runtime.prepareParallelBatch({
    objective: "Update only the label in the repository fixture",
    batchMaxReservedCostUsd: 1,
    tasks: [{
      taskId: "crlf-json-label-edit",
      role: "implementer",
      mode: "edit",
      target: "codex",
      objective: "Change the label and preserve every other JSON field",
      files: [fixturePath],
      allowedPaths: [fixturePath],
      acceptanceCriteria: ["Only label changes to bounded-edit-acceptance"],
      verificationCommands: ["git diff --check"],
      maxFilesChanged: 1,
      maxFileBytes: 4096,
      maxTotalDiffBytes: 4096
    }]
  }, workspace);
  assert.equal(prepared.ok, true, JSON.stringify(prepared));
  const started = await runtime.startParallelBatch({ planId: prepared.planId, planHash: prepared.planHash }, workspace);
  assert.equal(started.ok, true);
  const ready = await waitForBatch(runtime, workspace, started.batchId, ["ready_for_approval", "blocked", "failed"]);
  assert.equal(ready.status, "ready_for_approval", JSON.stringify(ready));
  assert.deepEqual(ready.tasks[0].filesChanged, [fixturePath]);
  assert.equal(ready.tasks[0].verification[0].exitCode, 0);
  const integrationDetail = await runtime.getParallelTaskDetail({
    batchId: started.batchId,
    taskId: "integration",
    detailRef: ready.approval.detailRef
  }, workspace);
  assert.equal(integrationDetail.ok, true);
  const integrationPayload = JSON.parse(integrationDetail.page.content);
  assert.equal(integrationPayload.diffHash, ready.approval.diffHash);
  assert.deepEqual(integrationPayload.filesChanged, [fixturePath]);
  const validationWorkspace = path.join(root, "validation");
  fs.mkdirSync(path.dirname(path.join(validationWorkspace, fixturePath)), { recursive: true });
  git(root, ["init", "-q", "validation"]);
  git(validationWorkspace, ["config", "user.email", "bridge@example.invalid"]);
  git(validationWorkspace, ["config", "user.name", "Bridge Test"]);
  fs.writeFileSync(path.join(validationWorkspace, fixturePath), originalBytes);
  git(validationWorkspace, ["add", fixturePath]);
  git(validationWorkspace, ["commit", "-qm", "add validation fixture"]);
  execFileSync("git", ["apply", "--check", "-"], { cwd: validationWorkspace, input: integrationPayload.diff, stdio: ["pipe", "pipe", "pipe"] });
  execFileSync("git", ["apply", "-"], { cwd: validationWorkspace, input: integrationPayload.diff, stdio: ["pipe", "pipe", "pipe"] });
  const changedValue = JSON.parse(fs.readFileSync(path.join(validationWorkspace, fixturePath), "utf8"));
  assert.deepEqual(changedValue, { ...originalValue, label: "bounded-edit-acceptance" });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(workspace, fixturePath), "utf8")), originalValue);
  assert.equal(git(workspace, ["rev-parse", "HEAD"]).trim(), baseCommit);
  assert.equal(git(workspace, ["status", "--porcelain=v1", "--untracked-files=all"]).trim(), "");
});

test("V2-INTEGRATION: trailing whitespace remains rejected before integration approval", async (t) => {
  const { root, workspace } = createRepository(t);
  const fixturePath = "tests/fixtures/parallel-batch-acceptance.json";
  const originalBytes = fs.readFileSync(path.resolve(fixturePath));
  fs.mkdirSync(path.dirname(path.join(workspace, fixturePath)), { recursive: true });
  fs.writeFileSync(path.join(workspace, fixturePath), originalBytes);
  git(workspace, ["add", fixturePath]);
  git(workspace, ["commit", "-qm", "add source JSON fixture"]);
  const baseCommit = git(workspace, ["rev-parse", "HEAD"]).trim();
  const configuration = createConfiguration(root);
  const adapter = createAdapter("codex", { canRead: true, canWrite: true, supportsSandbox: true, supportsModelSelection: true });
  adapter.execute = async (request) => {
    const fixtureAbsolutePath = path.join(request.workspace, fixturePath);
    const value = JSON.parse(fs.readFileSync(fixtureAbsolutePath, "utf8"));
    value.label = "bounded-edit-acceptance";
    const content = `${JSON.stringify(value, null, 2).replace('"schemaVersion": 1,', '"schemaVersion": 1, ')}\n`.replaceAll("\n", "\r\n");
    fs.writeFileSync(fixtureAbsolutePath, content, "utf8");
    return {
      ok: true,
      backend: "codex",
      model: request.model,
      result: JSON.stringify({ status: "ok", summary: "fixture label changed", action_required: "none" }),
      error: null,
      retryable: false,
      timedOut: false,
      exitCode: 0,
      durationMs: 5,
      metrics: { retries: 0, totalCostUsd: 0.01 }
    };
  };
  const runtime = createBridgeRuntime({ configuration, adapters: { codex: adapter }, sleep: async () => {} });
  const prepared = await runtime.prepareParallelBatch({
    objective: "Reject whitespace errors from an isolated JSON fixture edit",
    batchMaxReservedCostUsd: 1,
    tasks: [{
      taskId: "invalid-whitespace-json-edit",
      role: "implementer",
      mode: "edit",
      target: "codex",
      objective: "Change the label but leave a trailing space on the schemaVersion line",
      files: [fixturePath],
      allowedPaths: [fixturePath],
      acceptanceCriteria: ["A host whitespace validation error fails closed"],
      verificationCommands: ["git diff --check"],
      maxFilesChanged: 1,
      maxFileBytes: 4096,
      maxTotalDiffBytes: 4096
    }]
  }, workspace);
  assert.equal(prepared.ok, true, JSON.stringify(prepared));
  const started = await runtime.startParallelBatch({ planId: prepared.planId, planHash: prepared.planHash }, workspace);
  assert.equal(started.ok, true);
  const failed = await waitForBatch(runtime, workspace, started.batchId, ["blocked", "failed"]);
  assert.notEqual(failed.status, "ready_for_approval");
  const failureDetail = failed.tasks[0].detailRef
    ? await runtime.getParallelTaskDetail({ batchId: started.batchId, taskId: failed.tasks[0].taskId, detailRef: failed.tasks[0].detailRef }, workspace)
    : null;
  const failurePayload = failureDetail?.ok ? JSON.parse(failureDetail.page.content) : null;
  const failureDiagnostics = failurePayload ? {
    failureClass: failurePayload.failureClass,
    diagnostics: failurePayload.diagnostics,
    hostDiagnostics: failurePayload.hostDiagnostics,
    hostOperation: failurePayload.hostOperation,
    gitFailureCode: failurePayload.gitFailureCode
  } : null;
  assert.equal(failed.tasks[0].failureClass, "verification_failed", JSON.stringify({ failed, failureDiagnostics }));
  assert.equal(failed.tasks[0].verification[0].verificationStage, "working_tree");
  assert.equal(failed.tasks[0].verification[0].exitCode, 2);
  assert.deepEqual(failed.tasks[0].filesChanged, []);
  assert.equal(fs.readFileSync(path.join(workspace, fixturePath)).equals(originalBytes), true);
  assert.equal(git(workspace, ["rev-parse", "HEAD"]).trim(), baseCommit);
  assert.equal(git(workspace, ["status", "--porcelain=v1", "--untracked-files=all"]).trim(), "");
  assert.equal(fs.existsSync(path.join(configuration.parallelBatch.worktreeRoot, started.batchId, "invalid-whitespace-json-edit")), false);
  assert.equal(fs.existsSync(path.join(configuration.parallelBatch.worktreeRoot, started.batchId, "integration")), false);
  const integrationDetail = await runtime.getParallelTaskDetail({ batchId: started.batchId, taskId: "integration", detailRef: "0".repeat(64) }, workspace);
  assert.equal(integrationDetail.ok, false);
  assert.equal(integrationDetail.reason, "integration_detail_not_found");
  const coordinator = createWorkspaceCoordinator({ lockDirectory: path.join(configuration.statePaths.cache, "locks"), staleLockMs: 60000, leaseHeartbeatMs: 1000 });
  const readGrant = await coordinator.acquire(workspace, "read_only", "invalid-whitespace-recovery-check");
  assert.ok(readGrant);
  coordinator.release("invalid-whitespace-recovery-check");
});

test("V2-INTEGRATION: edit prompt uses host diff limits when task limits are omitted", async (t) => {
  const { root, workspace } = createRepository(t);
  const configuration = createConfiguration(root);
  configuration.parallelBatch.maxFilesChangedPerTask = 7;
  configuration.parallelBatch.maxFileBytesPerTask = 4096;
  configuration.parallelBatch.maxTotalDiffBytesPerTask = 16384;
  const observedRequests = [];
  const task = editTask();
  delete task.maxFilesChanged;
  delete task.maxFileBytes;
  delete task.maxTotalDiffBytes;
  const runtime = createBridgeRuntime({ configuration, adapters: { codex: createEditAdapter(observedRequests) }, sleep: async () => {} });
  const prepared = await runtime.prepareParallelBatch({ objective: "Edit the file", batchMaxReservedCostUsd: 1, tasks: [task] }, workspace);
  assert.equal(prepared.ok, true, JSON.stringify(prepared));
  const started = await runtime.startParallelBatch({ planId: prepared.planId, planHash: prepared.planHash }, workspace);
  const ready = await waitForBatch(runtime, workspace, started.batchId, ["ready_for_approval", "blocked", "failed"]);
  assert.equal(ready.status, "ready_for_approval");
  const editRequest = observedRequests.find((request) => request.mode === "edit");
  assert.match(editRequest.prompt, /max files changed 7; max file bytes 4096; max total diff bytes 16384/);
});

test("V2-INTEGRATION: cancelling a ready diff prevents later approval", async (t) => {
  const { root, workspace } = createRepository(t);
  const configuration = createConfiguration(root);
  const runtime = createBridgeRuntime({ configuration, adapters: { codex: createEditAdapter() }, sleep: async () => {} });
  const prepared = await runtime.prepareParallelBatch({ objective: "Edit the file", batchMaxReservedCostUsd: 1, tasks: [editTask()] }, workspace);
  const started = await runtime.startParallelBatch({ planId: prepared.planId, planHash: prepared.planHash }, workspace);
  const ready = await waitForBatch(runtime, workspace, started.batchId, ["ready_for_approval", "blocked", "failed"]);
  assert.equal(ready.status, "ready_for_approval");

  const competingCoordinator = createWorkspaceCoordinator({
    lockDirectory: path.join(configuration.statePaths.cache, "locks"),
    staleLockMs: 60000,
    leaseHeartbeatMs: 1000
  });
  const readerExecutionId = "cancel-approval-race-reader";
  const readGrant = await competingCoordinator.acquire(workspace, "read_only", readerExecutionId);
  assert.ok(readGrant);
  let approvalSettled = false;
  const approvalPromise = runtime.approveParallelIntegration({
    batchId: started.batchId,
    approvalRef: ready.approval.approvalRef,
    expectedDiffHash: ready.approval.diffHash
  }, workspace);
  void approvalPromise.then(() => { approvalSettled = true; });
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(approvalSettled, false);
  const cancelled = await runtime.cancelParallelBatch({ batchId: started.batchId }, workspace);
  assert.equal(cancelled.ok, true);
  assert.equal(cancelled.summary.status, "cancelled");
  assert.equal(cancelled.cancellation.requested, true);
  competingCoordinator.release(readerExecutionId);
  const approval = await approvalPromise;
  assert.equal(approval.ok, false);
  assert.equal(approval.reason, "integration_not_ready");
  assert.equal(fs.readFileSync(path.join(workspace, "src", "a.txt"), "utf8"), "alpha\n");
});

test("V2-INTEGRATION: task worktree refs are isolated from source refs", async (t) => {
  const { root, workspace, baseCommit } = createRepository(t);
  git(root, ["init", "--bare", "source-origin"]);
  git(workspace, ["remote", "add", "origin", path.join(root, "source-origin")]);
  const configuration = createConfiguration(root);
  const adapter = createEditAdapter();
  const originalExecute = adapter.execute.bind(adapter);
  let workerRefCreated = false;
  let workerRemotes = null;
  adapter.execute = async (request) => {
    if (request.mode === "edit") {
      workerRemotes = git(request.workspace, ["remote"]).trim();
      git(request.workspace, ["branch", "worker-created-ref"]);
      workerRefCreated = true;
    }
    return originalExecute(request);
  };
  const runtime = createBridgeRuntime({ configuration, adapters: { codex: adapter }, sleep: async () => {} });
  const prepared = await runtime.prepareParallelBatch({
    objective: "Test private task worktree Git refs",
    batchMaxReservedCostUsd: 1,
    tasks: [editTask()]
  }, workspace);
  assert.equal(prepared.ok, true, JSON.stringify(prepared));
  const started = await runtime.startParallelBatch({ planId: prepared.planId, planHash: prepared.planHash }, workspace);
  const ready = await waitForBatch(runtime, workspace, started.batchId, ["ready_for_approval", "blocked", "failed"]);
  assert.equal(ready.status, "ready_for_approval");
  assert.equal(ready.tasks[0].status, "completed");
  assert.equal(workerRefCreated, true);
  assert.equal(workerRemotes, "");
  assert.equal(git(workspace, ["rev-parse", "HEAD"]).trim(), baseCommit);
  assert.equal(fs.readFileSync(path.join(workspace, "src", "a.txt"), "utf8"), "alpha\n");
  assert.equal(git(workspace, ["branch", "--list", "worker-created-ref"]).trim(), "");
});

test("V2-INTEGRATION: task Git config mutation blocks host verification and cleanup", async (t) => {
  const { root, workspace, baseCommit } = createRepository(t);
  const configuration = createConfiguration(root);
  const adapter = createEditAdapter();
  const originalExecute = adapter.execute.bind(adapter);
  adapter.execute = async (request) => {
    if (request.mode === "edit") {
      git(request.workspace, ["config", "canary.mutated", "true"]);
      fs.writeFileSync(path.join(request.workspace, "src", "a.txt"), "edited in isolated task\n", "utf8");
    }
    return originalExecute(request);
  };
  const runtime = createBridgeRuntime({ configuration, adapters: { codex: adapter }, sleep: async () => {} });
  const prepared = await runtime.prepareParallelBatch({
    objective: "Test task Git config integrity enforcement",
    batchMaxReservedCostUsd: 1,
    tasks: [editTask()]
  }, workspace);
  assert.equal(prepared.ok, true, JSON.stringify(prepared));
  const started = await runtime.startParallelBatch({ planId: prepared.planId, planHash: prepared.planHash }, workspace);
  const failed = await waitForBatch(runtime, workspace, started.batchId, ["failed"]);
  assert.equal(failed.tasks[0].failureClass, "task_git_metadata_changed");
  assert.equal(failed.approvalRequired, false);
  assert.equal(fs.readFileSync(path.join(workspace, "src", "a.txt"), "utf8"), "alpha\n");
  assert.equal(git(workspace, ["rev-parse", "HEAD"]).trim(), baseCommit);
  assert.equal(git(workspace, ["status", "--porcelain=v1"]).trim(), "");
});

test("V2-INTEGRATION: unsafe host verification policy blocks batch admission", async (t) => {
  const { root, workspace } = createRepository(t);
  const configuration = createConfiguration(root, ["git diff --check", "git rev-parse --verify missing-ref-xyz"]);
  const observedRequests = [];
  const runtime = createBridgeRuntime({ configuration, adapters: { codex: createEditAdapter(observedRequests) }, sleep: async () => {} });
  const prepared = await runtime.prepareParallelBatch({ objective: "Edit the file", batchMaxReservedCostUsd: 1, tasks: [editTask(["git diff --check"])] }, workspace);
  assert.equal(prepared.ok, false);
  assert.equal(prepared.reason, "verification_command_policy_unsafe");
  assert.equal(observedRequests.length, 0);
  assert.equal(fs.readFileSync(path.join(workspace, "src", "a.txt"), "utf8"), "alpha\n");
  assert.equal(git(workspace, ["status", "--porcelain=v1"]).trim(), "");
});

test("V2-INTEGRATION: parallel edit is refused when the capability gate is unavailable", async (t) => {
  const { root, workspace } = createRepository(t);
  const configuration = createConfiguration(root);
  configuration.parallelBatch.codexNetworkOffCapability = "unavailable";
  const runtime = createBridgeRuntime({ configuration, adapters: { codex: createEditAdapter() }, sleep: async () => {} });
  const prepared = await runtime.prepareParallelBatch({ objective: "Edit the file", batchMaxReservedCostUsd: 1, tasks: [editTask()] }, workspace);
  assert.equal(prepared.ok, false);
  assert.equal(prepared.reason, "edit_route_unsupported");
});

test("V2-INTEGRATION: edit task cannot select verification commands outside the host allowlist", async (t) => {
  const { root, workspace } = createRepository(t);
  const configuration = createConfiguration(root);
  const observedRequests = [];
  const runtime = createBridgeRuntime({ configuration, adapters: { codex: createEditAdapter(observedRequests) }, sleep: async () => {} });
  const prepared = await runtime.prepareParallelBatch({
    objective: "Edit the file",
    batchMaxReservedCostUsd: 1,
    tasks: [editTask(["git status --porcelain"])]
  }, workspace);
  assert.equal(prepared.ok, false);
  assert.equal(prepared.reason, "verification_command_not_allowed");
  assert.equal(observedRequests.length, 0);
});

test("V2-INTEGRATION: edit admission excludes profile fallbacks the runtime will not execute", async (t) => {
  const { root, workspace } = createRepository(t);
  const configuration = createConfiguration(root);
  configuration.parallelBatch.editEnabled = true;
  configuration.parallelBatch.codexNetworkOffCapability = "available";
  configuration.orchestration.taskProfiles.edit_with_fallback = {
    target: "codex",
    model: "gpt-5.6-luna",
    mode: "edit",
    priority: 10,
    cacheable: false,
    fallbackTargets: [{ target: "codex", model: "gpt-5.6-sol" }]
  };
  const runtime = createBridgeRuntime({ configuration, adapters: { codex: createEditAdapter() }, sleep: async () => {} });
  const prepared = await runtime.prepareParallelBatch({
    objective: "Edit one selected file",
    batchMaxReservedCostUsd: 0.1,
    tasks: [{
      taskId: "edit-profile-fallback",
      role: "implementer",
      mode: "edit",
      profile: "edit_with_fallback",
      objective: "Replace the selected file",
      files: ["src/a.txt"],
      acceptanceCriteria: ["File content is replaced"],
      verificationCommands: ["git diff --check"]
    }]
  }, workspace);
  assert.equal(prepared.ok, true, JSON.stringify(prepared));
  assert.equal(prepared.allocation.estimatedUsd, 0.1);
});

test("V2-INTEGRATION: task-local Git attributes cannot weaken integration verification", async (t) => {
  const { root, workspace } = createRepository(t);
  const fixturePath = "tests/fixtures/parallel-batch-acceptance.json";
  const fixtureAbsolutePath = path.join(workspace, fixturePath);
  fs.mkdirSync(path.dirname(fixtureAbsolutePath), { recursive: true });
  const originalFixture = "{\"schemaVersion\":1,\"label\":\"bounded-read-only-acceptance\",\"left\":6,\"right\":7,\"expectedProduct\":42} \n";
  fs.writeFileSync(fixtureAbsolutePath, originalFixture, "utf8");
  git(workspace, ["add", "-A"]);
  git(workspace, ["commit", "-qm", "add JSON acceptance fixture"]);
  const originalValue = JSON.parse(originalFixture);
  const stateRoot = path.join(root, "runtime");
  const configuration = createConfiguration(root);
  configuration.parallelBatch.editEnabled = true;
  configuration.parallelBatch.codexNetworkOffCapability = "available";
  configuration.parallelBatch.verificationCommands = ["git diff --check"];
  const registry = createParallelBatchRegistry({ stateDirectory: path.join(stateRoot, "state", "parallel-batches") });
  const artifactStore = createParallelArtifactStore({ rootDirectory: path.join(stateRoot, "state", "parallel-artifacts"), ttlMs: 60000, maxArtifactBytes: 65536, maxTotalBytes: 1048576 });
  const workspaceCoordinator = createWorkspaceCoordinator({ lockDirectory: path.join(stateRoot, "cache", "locks"), staleLockMs: 60000, leaseHeartbeatMs: 1000 });
  const worktreeManager = createGitWorktreeBatchManager({
    sourceWorkspace: workspace,
    worktreeRoot: configuration.parallelBatch.worktreeRoot,
    verificationCommands: configuration.parallelBatch.verificationCommands
  });
  worktreeManager.recoverPendingPromotions();
  let fakeAdapterCalls = 0;
  let adapterValue = null;
  const runtime = {
    async run(request) {
      fakeAdapterCalls += 1;
      const value = JSON.parse(fs.readFileSync(path.join(request.trustedWorkspace, fixturePath), "utf8"));
      value.label = "bounded-edit-acceptance";
      adapterValue = value;
      fs.writeFileSync(path.join(request.trustedWorkspace, fixturePath), `${JSON.stringify(value)} \n`, "utf8");
      const gitDirectory = path.resolve(request.trustedWorkspace, git(request.trustedWorkspace, ["rev-parse", "--git-common-dir"]).trim());
      const attributesPath = path.join(gitDirectory, "info", "attributes");
      fs.mkdirSync(path.dirname(attributesPath), { recursive: true });
      fs.writeFileSync(attributesPath, "*.json whitespace=-blank-at-eol\n", "utf8");
      return {
        ok: true,
        backend: "codex",
        model: request.model,
        result: JSON.stringify({ status: "ok", summary: "fixture label changed", action_required: "none" }),
        error: null,
        reason: null,
        retryable: false,
        timedOut: false,
        exitCode: 0,
        durationMs: 5,
        metrics: { retries: 0, totalCostUsd: 0.01 }
      };
    },
    async cancel() {
      return true;
    }
  };
  const service = createParallelBatchService({
    configuration,
    registry,
    artifactStore,
    runtime,
    trustedWorkspace: workspace,
    caller: "codexDesktop",
    worktreeManager,
    workspaceCoordinator
  });
  const prepared = await service.prepare({
    objective: "Update the fixture label in an isolated worktree",
    batchMaxReservedCostUsd: 1,
    tasks: [{
      taskId: "attribute-fixture-edit",
      role: "implementer",
      mode: "edit",
      target: "codex",
      objective: "Change only the fixture label and preserve all other JSON fields",
      files: [fixturePath],
      acceptanceCriteria: ["Only the label field changes"],
      verificationCommands: ["git diff --check"],
      resourceClaims: ["fixture:git-attribute-verification"]
    }]
  });
  assert.equal(prepared.ok, true, JSON.stringify(prepared));
  const started = await service.start({ planId: prepared.planId, planHash: prepared.planHash });
  assert.equal(started.ok, true);
  const deadline = Date.now() + 30000;
  let terminal = null;
  while (Date.now() < deadline) {
    const current = await service.getBatch({ batchId: started.batchId });
    if (current.ok && ["ready_for_approval", "blocked", "failed"].includes(current.summary.status)) {
      terminal = current.summary;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.ok(terminal);
  const parsedFixture = JSON.parse(fs.readFileSync(fixtureAbsolutePath, "utf8"));
  assert.deepEqual(parsedFixture, originalValue);
  assert.deepEqual(adapterValue, { ...originalValue, label: "bounded-edit-acceptance" });
  assert.equal(git(workspace, ["status", "--porcelain=v1", "--untracked-files=all"]).trim(), "");
  assert.equal(fakeAdapterCalls, 1);
  assert.equal(terminal.status, "failed");
  assert.equal(terminal.tasks[0].failureClass, "task_git_metadata_changed");
  assert.equal(terminal.blockedReason, null);
  assert.equal(terminal.approvalRequired, false);
  assert.equal(fs.existsSync(path.join(configuration.parallelBatch.worktreeRoot, started.batchId, "attribute-fixture-edit")), false);
  assert.equal(fs.existsSync(path.join(configuration.parallelBatch.worktreeRoot, started.batchId, "integration")), false);
  const integrationDetail = await service.getTaskDetail({ batchId: started.batchId, taskId: "integration", detailRef: "0".repeat(64) });
  assert.equal(integrationDetail.ok, false);
  assert.equal(integrationDetail.reason, "integration_detail_not_found");
  const recoveryReaderId = "verification-failure-lock-check";
  const recoveryReadGrant = await workspaceCoordinator.acquire(workspace, "read_only", recoveryReaderId);
  assert.ok(recoveryReadGrant);
  workspaceCoordinator.release(recoveryReaderId);
});
