import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureRuntimeDirectories, loadRuntimeConfiguration } from "../subagent-bridge/src/config.js";
import { createBridgeRuntime } from "../subagent-bridge/src/runtime/bridge-runtime.js";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const relativePath = "pilot-workspace/src/sum.js";
const sourcePath = path.join(projectRoot, relativePath);
const sourceBefore = fs.readFileSync(sourcePath);
const sourceText = sourceBefore.toString("utf8");
const lineEnding = sourceText.includes("\r\n") ? "\r\n" : "\n";
const sumLines = ["export function sum(left, right) {", "  return left + right;", "}"];
const expectedSource = [...sumLines, ""].join(lineEnding);
if (!sourceBefore.equals(Buffer.from(expectedSource))) throw new Error("Unexpected DeepSeek edit pilot fixture");

const configuration = loadRuntimeConfiguration();
ensureRuntimeDirectories(configuration);
const runtime = createBridgeRuntime({ configuration });
const result = await runtime.runDeepSeekEditPilot({
  taskId: "deepseek-edit-disposable-pilot",
  model: "deepseek_flash",
  objective: "Add an exported subtract(left, right) function without changing the existing sum function.",
  files: [relativePath],
  contextFiles: [],
  acceptanceCriteria: [
    "Keep the existing sum function byte for byte, including its line endings.",
    "Append one blank line and an exported subtract function that returns left minus right. Match the fixture's line endings.",
    "Do not use shell commands or access external directories."
  ],
  timeout_seconds: 300
}, projectRoot);
console.log(JSON.stringify(result, null, 2));
const expectedLines = [...sumLines, "", "export function subtract(left, right) {", "  return left - right;", "}"];
const lineEndingMarker = lineEnding === "\r\n" ? "\\r\\n" : "";
const expectedDiff = [
  `--- a/${relativePath}`,
  `+++ b/${relativePath}`,
  `@@ -1,${sumLines.length} +1,${expectedLines.length} @@`,
  ...sumLines.map((line) => `-${line}${lineEndingMarker}`),
  ...expectedLines.map((line) => `+${line}${lineEndingMarker}`)
].join("\n");
if (result.status !== "completed" || result.resolvedModel !== "deepseek-flash" || result.cleanupCompleted !== true ||
  result.applied !== false || result.preview !== true || result.filesChanged.length !== 1 ||
  result.filesChanged[0] !== relativePath || result.diff !== expectedDiff ||
  !fs.readFileSync(sourcePath).equals(sourceBefore)) {
  console.error("DeepSeek edit pilot did not produce the exact isolated preview");
  process.exitCode = 1;
}
