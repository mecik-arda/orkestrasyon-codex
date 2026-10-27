import fs from "node:fs";
import path from "node:path";
import { createAdapter } from "../../subagent-bridge/src/adapters/agent-adapter-base.js";
import { createMcpToolHandlers } from "../../subagent-bridge/src/frontends/mcp/tools.js";
import { createBridgeRuntime } from "../../subagent-bridge/src/runtime/bridge-runtime.js";
import { p2PreparedEditPolicy } from "../../subagent-bridge/src/services/p2-prepared-edit-policy.js";
import { createSuccessSubagentResult } from "../../subagent-bridge/src/schemas/core-schemas.js";

const root = process.argv[2];
const configuration = JSON.parse(process.argv[3]);
const crashPoint = process.argv[4];
const adapter = createAdapter("codex", { canRead: true, canWrite: true, supportsSandbox: true, supportsModelSelection: true });
adapter.execute = async (request) => {
  const target = path.join(request.workspace, ...p2PreparedEditPolicy.relativePath.split("/"));
  fs.writeFileSync(target, p2PreparedEditPolicy.preparedContent, "utf8");
  if (crashPoint === "prepare") process.exit(73);
  return createSuccessSubagentResult("codex", request.model, { result: "Prepared fixed P2 fixture", durationMs: 1 });
};
const runtime = createBridgeRuntime({ configuration, adapters: { codex: adapter }, orchestratorApprovalEnabled: true });
const handlers = createMcpToolHandlers({ runtime, trustedWorkspace: root, configuration });
const prepared = await handlers.prepareP2AcceptanceEdit({});
if (crashPoint === "promotion") {
  const originalRename = fs.renameSync;
  fs.renameSync = function (source, target) {
    originalRename(source, target);
    if (String(target).endsWith(".backup")) process.exit(75);
  };
  await handlers.approvePreparedEdit({ approvalRequestId: prepared.structuredContent.approvalRequestId });
}
process.exit(74);
