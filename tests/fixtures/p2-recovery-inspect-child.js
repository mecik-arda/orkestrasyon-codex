import fs from "node:fs";
import path from "node:path";
import { createWorkspaceCoordinator } from "../../subagent-bridge/src/services/workspace-coordinator.js";
import { createGitWorktreeBatchManager } from "../../subagent-bridge/src/services/git-worktree-batch.js";
import { detectRecoveryArtifacts } from "../../subagent-bridge/src/services/disposable-workspace.js";
import { p2PreparedEditPolicy } from "../../subagent-bridge/src/services/p2-prepared-edit-policy.js";

const root = process.argv[2];
const configuration = JSON.parse(process.argv[3]);
const coordinator = createWorkspaceCoordinator({ lockDirectory: path.join(configuration.statePaths.cache, "locks"), staleLockMs: 60000, leaseHeartbeatMs: 1000 });
const executionId = "p2-recovery-inspection";
const acquired = await coordinator.acquire(root, "edit", executionId);
if (!acquired) process.exit(81);
try {
  const manager = createGitWorktreeBatchManager({ sourceWorkspace: root, worktreeRoot: path.join(root, "batch-worktrees") });
  const before = detectRecoveryArtifacts(root, [p2PreparedEditPolicy.relativePath]);
  const outcome = manager.recoverPendingPromotions({ assertLockOwner: () => coordinator.assertOwner(root, executionId) });
  const after = detectRecoveryArtifacts(root, [p2PreparedEditPolicy.relativePath]);
  const sourceExists = fs.existsSync(path.join(root, ...p2PreparedEditPolicy.relativePath.split("/")));
  process.stdout.write(JSON.stringify({ lockOwned: coordinator.assertOwner(root, executionId), beforeCount: before.affectedPaths.length, afterCount: after.affectedPaths.length, scanFailed: before.scanFailed || after.scanFailed, sourceExists, recoveryOk: outcome.ok }));
} finally {
  coordinator.release(executionId);
}
