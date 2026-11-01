import fs from "node:fs";
import path from "node:path";
import { createBridgeRuntime } from "../../subagent-bridge/src/runtime/bridge-runtime.js";

const root = process.argv[2];
const configuration = JSON.parse(process.argv[3]);
const crashAfterRestoreLink = process.argv[4] === "crash-after-restore-link";
const crashAfterRollbackRecord = process.argv[4] === "crash-after-rollback-record";
const runtime = createBridgeRuntime({ configuration, adapters: {}, orchestratorApprovalEnabled: true });
if (crashAfterRestoreLink) {
  const originalLink = fs.linkSync;
  fs.linkSync = (source, target) => {
    originalLink(source, target);
    if (String(source).endsWith(".backup")) process.exit(76);
  };
}
if (crashAfterRollbackRecord) {
  const originalRename = fs.renameSync;
  fs.renameSync = (source, target) => {
    originalRename(source, target);
    if (String(target).endsWith(".json")) {
      const journal = JSON.parse(fs.readFileSync(target, "utf8"));
      if (journal.decision === "rollback" && journal.phase === "cleanup_pending") process.exit(78);
    }
  };
}
const result = await runtime.recoverP2PreparedEdits(root);
const targetPath = path.join(root, "tests", "fixtures", "codex-profile-edit-pilot", "p2-approval-probe.txt");
const targetExists = fs.existsSync(targetPath);
const target = targetExists ? fs.statSync(targetPath, { bigint: true }) : null;
process.stdout.write(JSON.stringify({ result, targetExists, targetIdentity: target ? { dev: target.dev.toString(), ino: target.ino.toString(), links: target.nlink.toString(), mode: target.mode.toString() } : null }));
