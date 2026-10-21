import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import { loadAgentsConfig, loadConfiguration } from "../subagent-bridge/src/config.js";
import { appendParallelBatchMetric } from "../subagent-bridge/src/metrics.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configuration = loadConfiguration({ configurationPath: path.join(projectRoot, "config", "policy.json") });
const agents = loadAgentsConfig({ agentsPath: path.join(projectRoot, "config", "agents.json") });
const codexModel = process.env.CANARY_CODEX_MODEL || null;
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "parallel-canary-"));

function record(report) {
  void appendParallelBatchMetric(configuration, {
    recordType: "parallel_route_canary",
    recordedAt: new Date().toISOString(),
    backend: report.backend,
    canaryStatus: report.status,
    canaryName: report.canaryName,
    durationMs: report.durationMs,
    roundTripCount: report.roundTripCount ?? 0,
    maxObservedTokens: report.maxObservedTokens ?? undefined,
    costUnknown: true,
    isProviderInvoice: false
  }).catch(() => {});
}

function runCodexCanary() {
  if (process.env.CANARY_SKIP_CODEX === "1") return { backend: "codex", canaryName: "network-off", status: "skipped", accepted: null };
  const repo = path.join(temporaryRoot, "codex-repo");
  fs.mkdirSync(repo, { recursive: true });
  execFileSync("git", ["init", "-q"], { cwd: repo, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "canary@example.invalid"], { cwd: repo });
  execFileSync("git", ["config", "user.name", "Canary"], { cwd: repo });
  fs.writeFileSync(path.join(repo, "README.md"), "codex canary marker\n", "utf8");
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["commit", "-qm", "canary"], { cwd: repo });
  const refsBefore = execFileSync("git", ["for-each-ref", "--format=%(refname):%(objectname)"], { cwd: repo, encoding: "utf8" }).trim();
  const args = [
    "exec",
    "--sandbox", "workspace-write",
    "-c", "sandbox_workspace_write.network_access=false",
    ...(codexModel ? ["-m", codexModel] : []),
    "Run exactly this shell command and report its raw output and exit code: git ls-remote https://github.com/openai/codex.git HEAD . Do not modify any files. Then reply with exactly one JSON object: {\"status\":\"ok\",\"summary\":\"network probe done\",\"action_required\":\"none\"}"
  ];
  const startedAt = Date.now();
  const result = spawnSync(agents.agents.codex.executable, args, {
    cwd: repo,
    encoding: "utf8",
    timeout: 600000,
    windowsHide: true,
    env: { ...process.env }
  });
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  const remoteResolved = /[0-9a-f]{40}\s+HEAD/m.test(output);
  const networkDenied = !remoteResolved;
  const refsAfter = execFileSync("git", ["for-each-ref", "--format=%(refname):%(objectname)"], { cwd: repo, encoding: "utf8" }).trim();
  const refsChanged = refsAfter !== refsBefore;
  const accepted = result.status === 0 && networkDenied && !refsChanged;
  return {
    backend: "codex",
    canaryName: "network-off",
    status: accepted ? "accepted" : "rejected",
    accepted,
    model: codexModel || "default",
    exitCode: result.status,
    durationMs: Date.now() - startedAt,
    networkDenied,
    remoteResolved,
    refsChanged,
    signal: result.signal || null,
    error: result.error?.message || null,
    outputTail: output.slice(-1200)
  };
}

try {
  const reports = [runCodexCanary()].map((report) => {
    record(report);
    return report;
  });
  console.log(JSON.stringify({ canary: "parallel-routes", reports }, null, 2));
  if (reports.some((report) => report.status === "rejected")) process.exitCode = 1;
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
