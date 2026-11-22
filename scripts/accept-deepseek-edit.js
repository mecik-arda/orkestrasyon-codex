import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const acceptanceRoot = path.join(projectRoot, "pilot-workspace");
const workspace = fs.mkdtempSync(path.join(acceptanceRoot, ".deepseek-edit-acceptance-"));
const relativePath = "value.js";
const sourcePath = path.join(workspace, relativePath);
const sumLines = ["export function sum(left, right) {", "  return left + right;", "}"];
const expectedSource = Buffer.from([...sumLines, ""].join("\n"));
const expectedLines = [...sumLines, "", "export function subtract(left, right) {", "  return left - right;", "}"];
const expectedDiff = [
  `--- a/${relativePath}`,
  `+++ b/${relativePath}`,
  `@@ -1,${sumLines.length} +1,${expectedLines.length} @@`,
  ...sumLines.map((line) => `-${line}`),
  ...expectedLines.map((line) => `+${line}`)
].join("\n");
const client = new Client({ name: "deepseek-edit-acceptance", version: "1.0.0" });

try {
  fs.writeFileSync(sourcePath, expectedSource, { flag: "wx" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(projectRoot, "subagent-bridge", "src", "server.js")],
    cwd: workspace,
    env: {
      ...process.env,
      SUBAGENT_BRIDGE_TRUSTED_WORKSPACE: workspace
    }
  });
  await client.connect(transport);
  const response = await client.callTool({
    name: "run_deepseek_edit_pilot",
    arguments: {
      taskId: "deepseek-disposable-edit-acceptance",
      model: "deepseek_flash",
      objective: "Append one blank line and an exported subtract(left, right) function that returns left minus right.",
      files: [relativePath],
      contextFiles: [],
      acceptanceCriteria: [
        "Keep the existing sum function byte for byte, including its LF line endings.",
        "Use LF in the new lines and end the file with exactly one LF.",
        "No other file may be changed."
      ],
      timeout_seconds: 120
    }
  }, undefined, {
    timeout: 130000
  });
  const result = response.structuredContent;
  const sourceUnchanged = fs.readFileSync(sourcePath).equals(expectedSource);
  const exactPreview = result?.diff === expectedDiff;
  const accepted = !response.isError && result?.status === "completed" && result.backend === "deepseek" &&
    result.resolvedModel === "deepseek-flash" && result.accessMode === "edit" && result.applied === false &&
    result.preview === true && result.approvalRequired === false && result.fallbacks === 0 &&
    result.cleanupCompleted === true && result.filesChanged.length === 1 && result.filesChanged[0] === relativePath &&
    sourceUnchanged && exactPreview;
  console.log(JSON.stringify({
    accepted,
    status: result?.status ?? null,
    failureClass: result?.failureClass ?? null,
    resolvedModel: result?.resolvedModel ?? null,
    applied: result?.applied ?? null,
    cleanupCompleted: result?.cleanupCompleted ?? null,
    sourceUnchanged,
    exactPreview
  }, null, 2));
  if (!accepted) process.exitCode = 1;
} finally {
  await client.close().catch(() => {});
  fs.rmSync(workspace, { recursive: true, force: true });
}
