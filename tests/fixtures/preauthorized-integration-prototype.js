import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { integrationPayloadHash } from "../../subagent-bridge/src/services/git-worktree-batch.js";
import { compareGitRefSnapshots, validateGitRefSnapshot } from "../../subagent-bridge/src/services/git-ref-snapshot.js";

function hashValue(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function ticketPath(directory, grantId) {
  if (typeof grantId !== "string" || !/^[a-f0-9]{32}$/.test(grantId)) throw new Error("invalid prototype grant");
  return path.join(directory, `${grantId}.json`);
}

export function createPreauthorizedIntegrationTicketStore({ directory, clock = () => Date.now() } = {}) {
  if (!directory) throw new Error("prototype ticket directory is required");
  fs.mkdirSync(directory, { recursive: true });

  function update(grantId, mutator) {
    const storedPath = ticketPath(directory, grantId);
    const lockPath = `${storedPath}.lock`;
    let descriptor;
    const ownerId = crypto.randomBytes(16).toString("hex");
    try {
      descriptor = fs.openSync(lockPath, "wx");
      fs.writeFileSync(descriptor, JSON.stringify({ ownerId, pid: process.pid }), "utf8");
      const ticket = JSON.parse(fs.readFileSync(storedPath, "utf8"));
      const next = mutator(ticket);
      if (!next) return { ok: false, reason: "prototype_ticket_state_changed" };
      const temporaryPath = `${storedPath}.${crypto.randomBytes(8).toString("hex")}.tmp`;
      fs.writeFileSync(temporaryPath, `${JSON.stringify(next)}\n`, { encoding: "utf8", flag: "wx" });
      fs.renameSync(temporaryPath, storedPath);
      return { ok: true, ticket: next };
    } catch (error) {
      return { ok: false, reason: error.code === "EEXIST" ? "prototype_ticket_busy" : "prototype_ticket_unavailable" };
    } finally {
      if (descriptor !== undefined) {
        fs.closeSync(descriptor);
        try {
          const lockOwner = JSON.parse(fs.readFileSync(lockPath, "utf8"));
          if (lockOwner.ownerId === ownerId && lockOwner.pid === process.pid) fs.rmSync(lockPath, { force: true });
        } catch {
        }
      }
    }
  }

  function issue({ callerHash, workspaceHash, batchId, preview, acceptedTasks, sourceRefHash, sourceRefSnapshot, permittedRefTransitions = [], baseCommit, expiresAt } = {}) {
    if (typeof callerHash !== "string" || !/^[a-f0-9]{64}$/.test(callerHash)
      || typeof workspaceHash !== "string" || !/^[a-f0-9]{64}$/.test(workspaceHash)
      || typeof batchId !== "string" || !/^[a-f0-9]{32,64}$/.test(batchId)
      || typeof preview?.diff !== "string" || !Array.isArray(preview.changes) || preview.changes.length === 0
      || typeof preview.diffHash !== "string" || !/^[a-f0-9]{64}$/.test(preview.diffHash)
      || typeof preview.diffPreviewHash !== "string" || !/^[a-f0-9]{64}$/.test(preview.diffPreviewHash)
      || !Array.isArray(acceptedTasks) || acceptedTasks.length === 0
      || typeof sourceRefHash !== "string" || !/^[a-f0-9]{64}$/.test(sourceRefHash)
      || !validateGitRefSnapshot(sourceRefSnapshot) || sourceRefSnapshot.refsHash !== sourceRefHash
      || !Array.isArray(permittedRefTransitions)
      || typeof baseCommit !== "string" || !/^[a-f0-9]{40,64}$/.test(baseCommit)
      || !Number.isFinite(expiresAt) || expiresAt <= clock()) return { ok: false, reason: "prototype_authorization_invalid" };
    for (const transition of permittedRefTransitions) {
      if (!transition || !["branch", "remote_tracking", "tag", "codex_turn_checkpoint", "other"].includes(transition.category)
        || !/^[a-f0-9]{64}$/.test(transition.fromFingerprint || "")
        || !/^[a-f0-9]{64}$/.test(transition.toFingerprint || "")
        || transition.fromFingerprint === transition.toFingerprint
        || !/^[a-f0-9]{64}$/.test(transition.targetFingerprint || "")) return { ok: false, reason: "prototype_authorization_invalid" };
      const sourceEntry = sourceRefSnapshot.entries.find((entry) => entry.referenceFingerprint === transition.fromFingerprint);
      if (sourceEntry?.category !== transition.category || sourceEntry.targetFingerprint !== transition.targetFingerprint) {
        return { ok: false, reason: "prototype_authorization_invalid" };
      }
    }
    const payloadHash = integrationPayloadHash(preview.changes);
    if (payloadHash !== preview.changePayloadHash) return { ok: false, reason: "prototype_payload_invalid" };
    const grantId = crypto.randomBytes(16).toString("hex");
    const ticket = {
      version: 1,
      grantId,
      callerHash,
      workspaceHash,
      batchId,
      status: "issued",
      diff: preview.diff,
      diffHash: preview.diffHash,
      diffPreviewHash: preview.diffPreviewHash,
      changePayloadHash: payloadHash,
      filesChanged: [...preview.filesChanged],
      changes: JSON.parse(JSON.stringify(preview.changes)),
      sourceFileStates: JSON.parse(JSON.stringify(preview.sourceFileStates)),
      acceptedTasks: JSON.parse(JSON.stringify(acceptedTasks)),
      baseCommit,
      sourceRefHash,
      sourceRefSnapshot: JSON.parse(JSON.stringify(sourceRefSnapshot)),
      permittedRefTransitions: JSON.parse(JSON.stringify(permittedRefTransitions)),
      expiresAt
    };
    const storedPath = ticketPath(directory, grantId);
    try {
      const temporaryPath = `${storedPath}.${crypto.randomBytes(8).toString("hex")}.tmp`;
      fs.writeFileSync(temporaryPath, `${JSON.stringify(ticket)}\n`, { encoding: "utf8", flag: "wx" });
      fs.renameSync(temporaryPath, storedPath);
      return { ok: true, grantId };
    } catch {
      return { ok: false, reason: "prototype_ticket_unavailable" };
    }
  }

  function claim({ grantId, callerHash, workspaceHash, batchId, expectedDiffHash }) {
    return update(grantId, (ticket) => {
      if (ticket.status !== "issued" || ticket.callerHash !== callerHash || ticket.workspaceHash !== workspaceHash
        || ticket.batchId !== batchId || ticket.diffHash !== expectedDiffHash || ticket.expiresAt <= clock()) return null;
      return { ...ticket, status: "applying", claimedAt: clock() };
    });
  }

  function requestCancel(grantId) {
    return update(grantId, (ticket) => {
      if (ticket.status === "issued") return { ...ticket, status: "cancelled", cancelledAt: clock() };
      if (ticket.status === "applying") return { ...ticket, status: "cancel_requested", cancelRequestedAt: clock() };
      return null;
    });
  }

  function beginCommit(grantId) {
    return update(grantId, (ticket) => ticket.status === "applying" && ticket.expiresAt > clock()
      ? { ...ticket, status: "committing", commitStartedAt: clock() }
      : null);
  }

  function finish(grantId, status, result = null) {
    return update(grantId, (ticket) => new Set(["applying", "committing", "cancel_requested"]).has(ticket.status)
      ? { ...ticket, status, result, finishedAt: clock() }
      : null);
  }

  function read(grantId) {
    try {
      return JSON.parse(fs.readFileSync(ticketPath(directory, grantId), "utf8"));
    } catch {
      return null;
    }
  }

  return { issue, claim, requestCancel, beginCommit, finish, read };
}

export function createPreauthorizedIntegrationPrototype({
  manager,
  workspaceCoordinator,
  ticketStore,
  trustedWorkspace,
  workspaceHash,
  clock = () => Date.now()
} = {}) {
  if (!manager || typeof manager.revalidateIntegration !== "function" || typeof manager.applyIntegration !== "function") throw new Error("production Git integration functions are required");
  if (!workspaceCoordinator || typeof workspaceCoordinator.acquire !== "function" || typeof workspaceCoordinator.release !== "function" || typeof workspaceCoordinator.assertOwner !== "function") throw new Error("workspace coordinator is required");
  if (!ticketStore || typeof ticketStore.claim !== "function" || typeof ticketStore.finish !== "function") throw new Error("prototype ticket store is required");
  if (!trustedWorkspace || !workspaceHash) throw new Error("prototype workspace binding is required");

  async function execute({ grantId, callerHash, request, hooks = {} } = {}) {
    const claimed = ticketStore.claim({
      grantId,
      callerHash,
      workspaceHash,
      batchId: request?.batchId,
      expectedDiffHash: request?.expectedDiffHash
    });
    if (!claimed.ok) return { ok: false, reason: claimed.reason };
    const ticket = claimed.ticket;
    const lockId = crypto.randomUUID();
    const acquired = await workspaceCoordinator.acquire(trustedWorkspace, "edit", lockId);
    if (!acquired) {
      ticketStore.finish(grantId, "rejected", "workspace_lock_unavailable");
      return { ok: false, reason: "workspace_lock_unavailable" };
    }
    const assertOwner = () => workspaceCoordinator.assertOwner(trustedWorkspace, lockId) === true;
    try {
      if (ticket.expiresAt <= clock()) return reject("prototype_grant_expired");
      if (!assertOwner()) return reject("workspace_lock_lost");
      const clean = manager.assertCleanSource();
      if (!clean.ok || clean.head !== ticket.baseCommit) return reject(clean.reason || "source_head_changed");
      const refState = manager.captureRefState();
      if (refState.head !== ticket.baseCommit) return reject("source_head_changed");
      if (refState.refsHash !== ticket.sourceRefHash && !authorizedRefTransition(ticket, refState.refSnapshot)) return reject("source_ref_changed");
      const preparation = manager.revalidateIntegration({
        batchId: ticket.batchId,
        originalBaseCommit: ticket.baseCommit,
        currentBaseCommit: refState.head,
        originalSourceFileStates: ticket.sourceFileStates,
        changes: ticket.changes,
        acceptedTasks: ticket.acceptedTasks,
        expectedDiffHash: ticket.diffHash,
        expectedDiffPreviewHash: ticket.diffPreviewHash,
        expectedChangePayloadHash: ticket.changePayloadHash,
        expectedRefHash: refState.refsHash,
        expectedRefSnapshot: refState.refSnapshot
      });
      if (!preparation.ok) return reject(preparation.reason);
      if (preparation.diff !== ticket.diff || preparation.diffHash !== ticket.diffHash
        || preparation.diffPreviewHash !== ticket.diffPreviewHash
        || preparation.changePayloadHash !== ticket.changePayloadHash
        || canonicalJson(preparation.changes) !== canonicalJson(ticket.changes)
        || canonicalJson(preparation.filesChanged) !== canonicalJson(ticket.filesChanged)) return reject("preauthorized_payload_mismatch");
      if (typeof hooks.afterRevalidation === "function") await hooks.afterRevalidation({ grantId, lockId, assertOwner, refState });
      if (!assertOwner()) return reject("workspace_lock_lost");
      const cleanBeforeApply = manager.assertCleanSource();
      const beforeApply = manager.captureRefState();
      const identitiesBeforeApply = manager.captureSourceFileIdentityStates(preparation.filesChanged);
      if (!cleanBeforeApply.ok || cleanBeforeApply.head !== ticket.baseCommit) return reject(cleanBeforeApply.reason || "source_head_changed");
      if (beforeApply.head !== ticket.baseCommit || beforeApply.refsHash !== refState.refsHash) return reject("source_ref_changed");
      if (canonicalJson(identitiesBeforeApply) !== canonicalJson(preparation.sourceFileIdentities)) return reject("source_file_identity_changed");
      if (!ticketStore.beginCommit(grantId).ok) {
        const current = ticketStore.read(grantId);
        if (current?.status === "cancel_requested") ticketStore.finish(grantId, "cancelled", "cancel_requested");
        else if (current?.status === "applying" && current.expiresAt <= clock()) ticketStore.finish(grantId, "rejected", "prototype_grant_expired");
        return {
          ok: false,
          reason: current?.status === "cancel_requested" ? "cancelled"
            : current?.expiresAt <= clock() ? "prototype_grant_expired" : "prototype_ticket_state_changed"
        };
      }
      if (typeof hooks.afterCommitDecision === "function") await hooks.afterCommitDecision({ grantId, lockId, assertOwner });
      if (!assertOwner()) return { ok: false, reason: "workspace_lock_lost", recoveryRequired: true };
      const approvalRef = crypto.randomBytes(32).toString("hex");
      const integration = {
        ...preparation,
        baseCommit: preparation.baseCommit,
        approvalRef,
        sourceRefHash: preparation.sourceRefHash,
        sourceRefSnapshot: preparation.sourceRefSnapshot,
        revalidation: { schemaVersion: 1, sourceFileIdentities: preparation.sourceFileIdentities }
      };
      const applied = manager.applyIntegration({
        batchId: ticket.batchId,
        approvalRef,
        expectedDiffHash: ticket.diffHash,
        manifest: { batchId: ticket.batchId, baseCommit: ticket.baseCommit, integration },
        assertLockOwner: assertOwner
      });
      if (!applied.ok) {
        const recoveryRequired = ["workspace_lock_lost", "promotion_rollback_failed", "promotion_recovery_required"].includes(applied.reason);
        if (!recoveryRequired) ticketStore.finish(grantId, "rejected", applied.reason);
        return { ok: false, reason: applied.reason, recoveryRequired };
      }
      if (typeof hooks.afterApplyBeforeReceipt === "function") await hooks.afterApplyBeforeReceipt({ grantId, applied });
      const receipt = ticketStore.finish(grantId, "applied", { diffHash: applied.integration.diffHash, baseCommit: applied.integration.baseCommit });
      if (!receipt.ok) return { ok: false, reason: "prototype_receipt_recovery_required", recoveryRequired: true };
      const finalized = manager.finalizePromotion?.(ticket.batchId, { workspaceHash, diffHash: ticket.diffHash, assertLockOwner: assertOwner });
      if (finalized?.ok === false) return { ok: false, reason: finalized.reason, recoveryRequired: true };
      return { ok: true, result: { diffHash: applied.integration.diffHash, filesChanged: applied.integration.filesChanged } };
    } catch {
      const current = ticketStore.read(grantId);
      if (current?.status === "applying") ticketStore.finish(grantId, "rejected", "prototype_execution_failed");
      return { ok: false, reason: current?.status === "committing" ? "prototype_recovery_required" : "prototype_execution_failed", recoveryRequired: current?.status === "committing" };
    } finally {
      workspaceCoordinator.release(lockId);
    }

    function reject(reason) {
      ticketStore.finish(grantId, "rejected", reason);
      return { ok: false, reason };
    }
  }

  function authorizedRefTransition(ticket, currentSnapshot) {
    if (!validateGitRefSnapshot(ticket.sourceRefSnapshot) || !validateGitRefSnapshot(currentSnapshot)) return false;
    const difference = compareGitRefSnapshots(ticket.sourceRefSnapshot, currentSnapshot);
    const transitions = ticket.permittedRefTransitions;
    if (difference.status !== "available" || difference.truncated || difference.updatedCount !== 0
      || difference.changes.length !== transitions.length * 2) return false;
    const remainingChanges = [...difference.changes];
    for (const transition of transitions) {
      const removedIndex = remainingChanges.findIndex((change) => change.operation === "removed"
        && change.category === transition.category
        && change.referenceFingerprint === transition.fromFingerprint
        && change.previousTargetFingerprint === transition.targetFingerprint);
      const addedIndex = remainingChanges.findIndex((change) => change.operation === "added"
        && change.category === transition.category
        && change.referenceFingerprint === transition.toFingerprint
        && change.currentTargetFingerprint === transition.targetFingerprint);
      if (removedIndex < 0 || addedIndex < 0) return false;
      remainingChanges.splice(Math.max(removedIndex, addedIndex), 1);
      remainingChanges.splice(Math.min(removedIndex, addedIndex), 1);
    }
    return remainingChanges.length === 0;
  }

  async function recover({ grantId, callerHash, batchId } = {}) {
    const ticket = ticketStore.read(grantId);
    if (!ticket || ticket.status !== "committing" || ticket.callerHash !== callerHash || ticket.workspaceHash !== workspaceHash || ticket.batchId !== batchId) {
      return { ok: false, reason: "prototype_recovery_not_required" };
    }
    const lockId = crypto.randomUUID();
    const acquired = await workspaceCoordinator.acquire(trustedWorkspace, "edit", lockId);
    if (!acquired) return { ok: false, reason: "workspace_lock_unavailable", recoveryRequired: true };
    const assertOwner = () => workspaceCoordinator.assertOwner(trustedWorkspace, lockId) === true;
    try {
      if (!assertOwner()) return { ok: false, reason: "workspace_lock_lost", recoveryRequired: true };
      const recovered = manager.recoverPendingPromotions({ assertLockOwner: assertOwner });
      if (!recovered.ok) return { ok: false, reason: recovered.reason, recoveryRequired: true };
      const committed = manager.recoveredCommittedPromotions().some((promotion) => promotion.batchId === ticket.batchId && promotion.diffHash === ticket.diffHash);
      if (committed) {
        const receipt = ticketStore.finish(grantId, "applied", { diffHash: ticket.diffHash, baseCommit: ticket.baseCommit });
        if (!receipt.ok) return { ok: false, reason: "prototype_receipt_recovery_required", recoveryRequired: true };
        const finalized = manager.finalizePromotion?.(ticket.batchId, { workspaceHash, diffHash: ticket.diffHash, assertLockOwner: assertOwner });
        if (finalized?.ok === false) return { ok: false, reason: finalized.reason, recoveryRequired: true };
        return { ok: true, recovered: "committed", applied: true };
      }
      const rejected = ticketStore.finish(grantId, "rejected", "recovered_without_commit_marker");
      return rejected.ok ? { ok: true, recovered: "rolled_back", applied: false } : rejected;
    } finally {
      workspaceCoordinator.release(lockId);
    }
  }

  return { execute, recover };
}
