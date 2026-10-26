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

export function createPreauthorizedIntegrationTicketStore({ directory, clock = () => Date.now(), beforeAtomicReplace = () => {}, afterAtomicPublish = () => {} } = {}) {
  if (!directory) throw new Error("prototype ticket directory is required");
  fs.mkdirSync(directory, { recursive: true });

  const statuses = new Set(["issued", "applying", "cancel_requested", "committing", "committed", "applied", "rejected", "cancelled"]);
  const ticketKeys = ["acceptedTasks", "baseCommit", "batchId", "callerHash", "changePayloadHash", "changes", "diff", "diffHash", "diffPreviewHash", "expiresAt", "filesChanged", "grantId", "permittedRefTransitions", "sourceFileStates", "sourceRefHash", "sourceRefSnapshot", "status", "version", "workspaceHash"];
  const stateKeys = new Set(["cancelRequestedAt", "cancelledAt", "claimedAt", "commitStartedAt", "committedAt", "finishedAt", "result", "status"]);

  function statePath(grantId, sequence) {
    return path.join(directory, `${path.basename(ticketPath(directory, grantId), ".json")}.state.${String(sequence).padStart(14, "0")}.json`);
  }

  function validTicket(ticket, grantId) {
    return Boolean(ticket && ticket.version === 1 && ticket.grantId === grantId && ticket.status === "issued"
      && Object.keys(ticket).sort().join("|") === ticketKeys.join("|")
      && /^[a-f0-9]{64}$/.test(ticket.callerHash || "") && /^[a-f0-9]{64}$/.test(ticket.workspaceHash || "")
      && /^[a-f0-9]{32,64}$/.test(ticket.batchId || "") && /^[a-f0-9]{40,64}$/.test(ticket.baseCommit || "")
      && /^[a-f0-9]{64}$/.test(ticket.diffHash || "") && /^[a-f0-9]{64}$/.test(ticket.diffPreviewHash || "")
      && /^[a-f0-9]{64}$/.test(ticket.changePayloadHash || "") && integrationPayloadHash(ticket.changes) === ticket.changePayloadHash
      && typeof ticket.diff === "string" && Array.isArray(ticket.filesChanged) && Array.isArray(ticket.changes)
      && Array.isArray(ticket.sourceFileStates) && Array.isArray(ticket.acceptedTasks)
      && /^[a-f0-9]{64}$/.test(ticket.sourceRefHash || "") && validateGitRefSnapshot(ticket.sourceRefSnapshot)
      && ticket.sourceRefSnapshot.refsHash === ticket.sourceRefHash && Array.isArray(ticket.permittedRefTransitions)
      && Number.isFinite(ticket.expiresAt));
  }

  function validStateRecord(record, sequence) {
    return Boolean(record && record.version === 1 && record.sequence === sequence && statuses.has(record.status)
      && record.dynamic && typeof record.dynamic === "object" && !Array.isArray(record.dynamic)
      && Object.keys(record).sort().join("|") === "dynamic|sequence|status|version"
      && Object.keys(record.dynamic).every((key) => stateKeys.has(key)) && record.dynamic.status === record.status);
  }

  function writeNewFile(filePath, value, metadata) {
    const temporaryPath = `${filePath}.${crypto.randomBytes(8).toString("hex")}.tmp`;
    let descriptor;
    try {
      descriptor = fs.openSync(temporaryPath, "wx", 0o600);
      fs.writeFileSync(descriptor, `${JSON.stringify(value)}\n`, "utf8");
      fs.fsyncSync(descriptor);
      fs.closeSync(descriptor);
      descriptor = undefined;
      beforeAtomicReplace(metadata);
      fs.linkSync(temporaryPath, filePath);
      afterAtomicPublish(metadata);
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: error.code === "EEXIST" ? "prototype_ticket_state_changed" : "prototype_ticket_unavailable" };
    } finally {
      if (descriptor !== undefined) fs.closeSync(descriptor);
      try {
        fs.rmSync(temporaryPath, { force: true });
      } catch {
      }
    }
  }

  function read(grantId) {
    try {
      const ticket = JSON.parse(fs.readFileSync(ticketPath(directory, grantId), "utf8"));
      if (!validTicket(ticket, grantId)) return null;
      const stateNames = fs.readdirSync(directory).filter((name) => name.startsWith(`${grantId}.state.`) && name.endsWith(".json"));
      const states = stateNames.map((name) => {
        const match = new RegExp(`^${grantId}\\.state\\.(\\d{14})\\.json$`).exec(name);
        if (!match) return null;
        const sequence = Number(match[1]);
        const record = JSON.parse(fs.readFileSync(path.join(directory, name), "utf8"));
        return validStateRecord(record, sequence) ? record : null;
      });
      if (states.length === 0 || states.some((state) => state === null)) return null;
      states.sort((left, right) => left.sequence - right.sequence);
      if (states.some((state, index) => state.sequence !== index)) return null;
      const allowedTransitions = {
        issued: new Set(["applying", "cancelled"]),
        applying: new Set(["cancel_requested", "committing", "rejected"]),
        cancel_requested: new Set(["cancelled", "rejected"]),
        committing: new Set(["committed", "rejected"]),
        committed: new Set(["applied"]),
        applied: new Set(),
        rejected: new Set(),
        cancelled: new Set()
      };
      if (states[0].status !== "issued" || states.some((state, index) => index > 0 && !allowedTransitions[states[index - 1].status].has(state.status))) return null;
      return { ...ticket, ...states.at(-1).dynamic, status: states.at(-1).status, operationSequence: states.at(-1).sequence };
    } catch {
      return null;
    }
  }

  function update(grantId, mutator) {
    const ticket = read(grantId);
    if (!ticket) return { ok: false, reason: "prototype_ticket_invalid" };
    const next = mutator(ticket);
    if (!next) return { ok: false, reason: "prototype_ticket_state_changed" };
    const dynamic = Object.fromEntries(Object.entries(next).filter(([key]) => !ticketKeys.includes(key) && key !== "operationSequence"));
    dynamic.status = next.status;
    const sequence = ticket.operationSequence + 1;
    const metadata = { operation: "update", status: next.status, grantId, sequence };
    const published = writeNewFile(statePath(grantId, sequence), { version: 1, sequence, status: next.status, dynamic }, metadata);
    return published.ok ? { ok: true, ticket: next } : published;
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
    if (!validTicket(ticket, grantId)) return { ok: false, reason: "prototype_authorization_invalid" };
    const storedPath = ticketPath(directory, grantId);
    const savedTicket = writeNewFile(storedPath, ticket, { operation: "issue", status: ticket.status, grantId });
    if (!savedTicket.ok) return savedTicket;
    const savedState = writeNewFile(statePath(grantId, 0), { version: 1, sequence: 0, status: "issued", dynamic: { status: "issued" } }, { operation: "issue_state", status: "issued", grantId });
    if (!savedState.ok) {
      try {
        fs.rmSync(storedPath, { force: true });
      } catch {
      }
      return savedState;
    }
    return { ok: true, grantId };
  }

  function claim({ grantId, callerHash, workspaceHash, batchId, expectedDiffHash }) {
    return update(grantId, (ticket) => ticket.status === "issued" && ticket.callerHash === callerHash && ticket.workspaceHash === workspaceHash
      && ticket.batchId === batchId && ticket.diffHash === expectedDiffHash && ticket.expiresAt > clock()
      ? { ...ticket, status: "applying", claimedAt: clock() }
      : null);
  }

  function requestCancel(grantId) {
    return update(grantId, (ticket) => ticket.status === "issued"
      ? { ...ticket, status: "cancelled", cancelledAt: clock() }
      : ticket.status === "applying" ? { ...ticket, status: "cancel_requested", cancelRequestedAt: clock() } : null);
  }

  function beginCommit(grantId) {
    return update(grantId, (ticket) => ticket.status === "applying" && ticket.expiresAt > clock()
      ? { ...ticket, status: "committing", commitStartedAt: clock() }
      : null);
  }

  function finish(grantId, status, result = null) {
    if (!new Set(["applied", "rejected", "cancelled"]).has(status)) return { ok: false, reason: "prototype_ticket_state_changed" };
    return update(grantId, (ticket) => {
      const allowed = status === "applied"
        ? ticket.status === "committed"
        : status === "cancelled" ? ticket.status === "cancel_requested" || ticket.status === "issued"
          : new Set(["applying", "committing", "cancel_requested"]).has(ticket.status);
      return allowed ? { ...ticket, status, result, finishedAt: clock() } : null;
    });
  }

  function recordCommit(grantId, result = null) {
    return update(grantId, (ticket) => ticket.status === "committing"
      ? { ...ticket, status: "committed", result, committedAt: clock() }
      : null);
  }

  return { issue, claim, requestCancel, beginCommit, recordCommit, finish, read };
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
  if (!ticketStore || typeof ticketStore.claim !== "function" || typeof ticketStore.finish !== "function" || typeof ticketStore.recordCommit !== "function") throw new Error("prototype ticket store is required");
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
      const finished = ticketStore.finish(grantId, "rejected", "workspace_lock_unavailable");
      return { ok: false, reason: "workspace_lock_unavailable", recoveryRequired: !finished.ok };
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
      const commitDecision = ticketStore.beginCommit(grantId);
      if (!commitDecision.ok) {
        const current = ticketStore.read(grantId);
        if (current?.status === "cancel_requested") {
          const cancelled = ticketStore.finish(grantId, "cancelled", "cancel_requested");
          return { ok: false, reason: cancelled.ok ? "cancelled" : "prototype_receipt_recovery_required", recoveryRequired: !cancelled.ok };
        }
        if (current?.status === "applying" && current.expiresAt <= clock()) {
          const rejected = ticketStore.finish(grantId, "rejected", "prototype_grant_expired");
          return { ok: false, reason: rejected.ok ? "prototype_grant_expired" : "prototype_receipt_recovery_required", recoveryRequired: !rejected.ok };
        }
        return {
          ok: false,
          reason: new Set(["applying", "committing"]).has(current?.status) ? "prototype_commit_decision_recovery_required" : "prototype_ticket_state_changed",
          recoveryRequired: new Set(["applying", "committing"]).has(current?.status)
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
        if (recoveryRequired) return { ok: false, reason: applied.reason, recoveryRequired: true };
        const rejected = ticketStore.finish(grantId, "rejected", applied.reason);
        return {
          ok: false,
          reason: rejected.ok ? applied.reason : "prototype_receipt_recovery_required",
          recoveryRequired: !rejected.ok
        };
      }
      if (typeof hooks.afterApplyBeforeReceipt === "function") await hooks.afterApplyBeforeReceipt({ grantId, applied });
      const committed = ticketStore.recordCommit(grantId, { diffHash: applied.integration.diffHash, baseCommit: applied.integration.baseCommit });
      if (!committed.ok) return { ok: false, reason: "prototype_receipt_recovery_required", recoveryRequired: true };
      const finalized = manager.finalizePromotion?.(ticket.batchId, { workspaceHash, diffHash: ticket.diffHash, assertLockOwner: assertOwner });
      if (finalized?.ok === false) return { ok: false, reason: finalized.reason, recoveryRequired: true };
      const receipt = ticketStore.finish(grantId, "applied", { diffHash: applied.integration.diffHash, baseCommit: applied.integration.baseCommit });
      if (!receipt.ok) return { ok: false, reason: "prototype_receipt_recovery_required", recoveryRequired: true };
      return { ok: true, result: { diffHash: applied.integration.diffHash, filesChanged: applied.integration.filesChanged } };
    } catch {
      const current = ticketStore.read(grantId);
      if (current?.status === "applying") {
        const rejected = ticketStore.finish(grantId, "rejected", "prototype_execution_failed");
        return { ok: false, reason: rejected.ok ? "prototype_execution_failed" : "prototype_receipt_recovery_required", recoveryRequired: !rejected.ok };
      }
      const recoveryRequired = new Set(["committing", "committed", "cancel_requested"]).has(current?.status);
      if (current?.status === "cancel_requested") {
        const cancelled = ticketStore.finish(grantId, "cancelled", "cancel_requested");
        return { ok: false, reason: cancelled.ok ? "cancelled" : "prototype_receipt_recovery_required", recoveryRequired: !cancelled.ok };
      }
      return { ok: false, reason: recoveryRequired ? "prototype_recovery_required" : "prototype_execution_failed", recoveryRequired };
    } finally {
      workspaceCoordinator.release(lockId);
    }

    function reject(reason) {
      const finished = ticketStore.finish(grantId, "rejected", reason);
      return { ok: false, reason: finished.ok ? reason : "prototype_receipt_recovery_required", recoveryRequired: !finished.ok };
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
    if (!ticket || !new Set(["applying", "committing", "committed", "cancel_requested"]).has(ticket.status)
      || ticket.callerHash !== callerHash || ticket.workspaceHash !== workspaceHash || ticket.batchId !== batchId) {
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
      const committedMarker = manager.recoveredCommittedPromotions().some((promotion) => promotion.batchId === ticket.batchId && promotion.diffHash === ticket.diffHash);
      if (ticket.status === "applying" && committedMarker) return { ok: false, reason: "prototype_operation_state_mismatch", recoveryRequired: true };
      if (ticket.status === "applying" || ticket.status === "cancel_requested") {
        const terminal = ticket.status === "cancel_requested" ? "cancelled" : "rejected";
        const receipt = ticketStore.finish(grantId, terminal, "recovered_before_commit_decision");
        return receipt.ok ? { ok: true, recovered: "not_committed", applied: false } : { ...receipt, recoveryRequired: true };
      }
      if (committedMarker || ticket.status === "committed") {
        const commitReceipt = ticket.status === "committing"
          ? ticketStore.recordCommit(grantId, { diffHash: ticket.diffHash, baseCommit: ticket.baseCommit })
          : { ok: true };
        if (!commitReceipt.ok) return { ok: false, reason: "prototype_receipt_recovery_required", recoveryRequired: true };
        const finalized = manager.finalizePromotion?.(ticket.batchId, { workspaceHash, diffHash: ticket.diffHash, assertLockOwner: assertOwner });
        if (finalized?.ok === false) return { ok: false, reason: finalized.reason, recoveryRequired: true };
        const receipt = ticketStore.finish(grantId, "applied", { diffHash: ticket.diffHash, baseCommit: ticket.baseCommit });
        if (!receipt.ok) return { ok: false, reason: "prototype_receipt_recovery_required", recoveryRequired: true };
        return { ok: true, recovered: "committed", applied: true };
      }
      const rejected = ticketStore.finish(grantId, "rejected", "recovered_without_commit_marker");
      return rejected.ok
        ? { ok: true, recovered: "rolled_back", applied: false }
        : { ok: false, reason: "prototype_receipt_recovery_required", recoveryRequired: true };
    } catch {
      return { ok: false, reason: "prototype_recovery_required", recoveryRequired: true };
    } finally {
      workspaceCoordinator.release(lockId);
    }
  }

  return { execute, recover };
}
