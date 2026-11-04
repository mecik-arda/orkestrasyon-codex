import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { diagnoseReviewSourceScope, REVIEW_SOURCE_MANIFEST_VERSION } from "../subagent-bridge/src/services/review-source-manifest.js";

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = path.resolve(path.dirname(scriptPath), "..");
const policySourcePaths = [
  "config/policy.json",
  "package.json",
  "package-lock.json",
  "subagent-bridge/src/config.js",
  "subagent-bridge/src/memory.js",
  "subagent-bridge/src/services/review-source-manifest.js",
  "subagent-bridge/src/services/review-source-syntax-classifier.js",
  "scripts/diagnose-review-source.js"
];
const sha256Pattern = /^[a-f0-9]{64}$/iu;

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function parseArguments(argumentsList) {
  const parsed = { workspace: null, files: [], expectedSnapshotSha256: null, expectedPolicySha256: null };
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (!["--workspace", "--file", "--expected-snapshot", "--expected-policy"].includes(argument)) {
      return { ok: false, errorCode: "unknown_option" };
    }
    const value = argumentsList[index + 1];
    if (typeof value !== "string" || value.length === 0 || value.startsWith("--")) {
      return { ok: false, errorCode: "missing_value" };
    }
    index += 1;
    if (argument === "--workspace") {
      if (parsed.workspace !== null) return { ok: false, errorCode: "duplicate_workspace" };
      parsed.workspace = value;
    } else if (argument === "--file") {
      parsed.files.push(value);
    } else if (argument === "--expected-snapshot") {
      if (parsed.expectedSnapshotSha256 !== null || !sha256Pattern.test(value)) return { ok: false, errorCode: "invalid_expected_snapshot" };
      parsed.expectedSnapshotSha256 = value.toLowerCase();
    } else {
      if (parsed.expectedPolicySha256 !== null || !sha256Pattern.test(value)) return { ok: false, errorCode: "invalid_expected_policy" };
      parsed.expectedPolicySha256 = value.toLowerCase();
    }
  }
  if (parsed.workspace === null || parsed.files.length === 0) return { ok: false, errorCode: "workspace_and_files_required" };
  return { ok: true, value: parsed };
}

function readPolicyConfiguration() {
  const policyPath = path.join(repositoryRoot, "config", "policy.json");
  const policyConfiguration = JSON.parse(fs.readFileSync(policyPath, "utf8"));
  const syntaxAwareJavaScriptEnabled = policyConfiguration.orchestration?.reviewSourceSyntaxAwareClassifierEnabled;
  if (typeof syntaxAwareJavaScriptEnabled !== "boolean") throw new Error("policy configuration unavailable");
  return syntaxAwareJavaScriptEnabled;
}

function readPolicyComponents() {
  return policySourcePaths.map((relativePath) => {
    const content = fs.readFileSync(path.join(repositoryRoot, ...relativePath.split("/")));
    return { path: relativePath, sizeBytes: content.length, sha256: sha256(content) };
  });
}

function readGitBinding(workspacePath, filePaths) {
  try {
    const revision = execFileSync("git", ["-C", workspacePath, "rev-parse", "--verify", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    const changedFiles = execFileSync("git", ["-C", workspacePath, "--literal-pathspecs", "status", "--porcelain", "--untracked-files=normal", "--", ...filePaths], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });
    return { commit: /^[a-f0-9]{40,64}$/iu.test(revision) ? revision : null, selectedFilesWorkingTree: changedFiles.length === 0 ? "clean" : "modified" };
  } catch {
    return { commit: null, selectedFilesWorkingTree: "unavailable" };
  }
}

function createPolicyBinding(syntaxAwareJavaScriptEnabled) {
  const components = readPolicyComponents();
  const descriptor = {
    manifestVersion: REVIEW_SOURCE_MANIFEST_VERSION,
    syntaxAwareJavaScriptEnabled,
    runtimeConfigurationLoaded: false,
    runtime: { node: process.version, platform: process.platform, architecture: process.arch },
    components
  };
  return {
    id: `review-source-manifest-v${REVIEW_SOURCE_MANIFEST_VERSION}-${syntaxAwareJavaScriptEnabled ? "syntax-aware" : "legacy-secret-classifier"}`,
    source: "tracked repository policy defaults; active runtime configuration is not loaded",
    syntaxAwareJavaScriptEnabled,
    runtimeConfigurationLoaded: false,
    sha256: sha256(Buffer.from(JSON.stringify(descriptor), "utf8")),
    hashMeaning: "local policy-source fingerprint, not a privacy guarantee or host attestation",
    runtime: descriptor.runtime,
    components,
    sourceRevision: readGitBinding(repositoryRoot, policySourcePaths)
  };
}

function createSafeFailure(failureClass, detailCode = null) {
  return {
    schemaVersion: 1,
    decision: "blocked",
    failureClass,
    detailCode,
    completeness: "partial",
    recordCompleteness: "complete",
    scope: "repository_source_manifest_only",
    request: { requestedFileCount: null, inspectedFileCount: 0, inspectedSourceBytes: 0, sourceBytesComplete: false, snapshotSha256: null, snapshotBinding: "not_available" },
    execution: { providerStarted: false, mcpReviewStarted: false, sourcePayloadCreated: false, sourceDelivery: "not_attempted", sourceDeliveryAuthorized: false, personalConfigurationLoaded: false, vaultAccessed: false, securityOverrideAvailable: false, platformAutoReviewEvaluated: false, providerOutcomeEvaluated: false }
  };
}

function compareExpectedBindings(result, expectedSnapshotSha256, expectedPolicySha256, policySha256) {
  const snapshotComparable = result.request.sourceBytesComplete === true && typeof result.request.snapshotSha256 === "string";
  const snapshotMatches = expectedSnapshotSha256 === null || !snapshotComparable
    ? null
    : result.request.snapshotSha256 === expectedSnapshotSha256;
  const policyMatches = expectedPolicySha256 === null ? null : policySha256 === expectedPolicySha256;
  return {
    expectedSnapshotSha256,
    snapshotComparable,
    snapshotMatchesExpected: snapshotMatches,
    snapshotState: expectedSnapshotSha256 === null
      ? "not_compared"
      : !snapshotComparable
        ? "incomplete_snapshot"
        : snapshotMatches
          ? "matches_expected"
          : "changed_since_expected",
    expectedPolicySha256,
    policyMatchesExpected: policyMatches,
    policyState: expectedPolicySha256 === null ? "not_compared" : policyMatches ? "matches_expected" : "changed_since_expected"
  };
}

function createDiagnosticResult(argumentsList, currentDirectory) {
  const parsedArguments = parseArguments(argumentsList);
  if (!parsedArguments.ok) return { result: createSafeFailure("review_diagnostic_arguments_invalid", parsedArguments.errorCode), exitCode: 64 };
  let initialPolicyBinding;
  let syntaxAwareJavaScriptEnabled;
  try {
    syntaxAwareJavaScriptEnabled = readPolicyConfiguration();
    initialPolicyBinding = createPolicyBinding(syntaxAwareJavaScriptEnabled);
  } catch {
    return { result: createSafeFailure("review_diagnostic_policy_unavailable"), exitCode: 1 };
  }

  const { workspace, files, expectedSnapshotSha256, expectedPolicySha256 } = parsedArguments.value;
  const workspacePath = path.resolve(currentDirectory, workspace);
  const result = diagnoseReviewSourceScope(workspacePath, files, { syntaxAwareJavaScriptEnabled });
  result.policy = {
    ...result.policy,
    source: initialPolicyBinding.source,
    sha256: initialPolicyBinding.sha256,
    hashMeaning: initialPolicyBinding.hashMeaning,
    runtime: initialPolicyBinding.runtime,
    components: initialPolicyBinding.components,
    sourceRevision: initialPolicyBinding.sourceRevision,
    runtimeConfigurationLoaded: false,
    mayDifferFromActiveRuntime: true
  };
  result.request.sourceWorkspace = readGitBinding(workspacePath, files);

  let finalPolicyBinding;
  try {
    const finalSyntaxAwareJavaScriptEnabled = readPolicyConfiguration();
    finalPolicyBinding = createPolicyBinding(finalSyntaxAwareJavaScriptEnabled);
  } catch {
    finalPolicyBinding = null;
  }
  if (!finalPolicyBinding || initialPolicyBinding.sha256 !== finalPolicyBinding.sha256) {
    result.decision = "blocked";
    result.failureClass = "review_diagnostic_policy_changed";
    result.completeness = "partial";
    result.request.snapshotSha256 = null;
    result.request.snapshotBinding = "discarded_policy_changed_during_diagnosis";
    result.unrunControls.push("policy_stability");
    result.policy.stableDuringDiagnosis = false;
  } else {
    result.policy.stableDuringDiagnosis = true;
  }

  result.comparison = compareExpectedBindings(result, expectedSnapshotSha256, expectedPolicySha256, result.policy.sha256);
  const hasDrift = result.comparison.snapshotMatchesExpected === false || result.comparison.policyMatchesExpected === false;
  result.exitCode = hasDrift ? 3 : result.decision === "clean" ? 0 : 2;
  return { result, exitCode: result.exitCode };
}

export { createDiagnosticResult, parseArguments as parseReviewSourceDiagnosticArguments };

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  let execution;
  try {
    execution = createDiagnosticResult(process.argv.slice(2), process.cwd());
  } catch {
    execution = { result: createSafeFailure("review_diagnostic_internal_failure"), exitCode: 1 };
  }
  const { result, exitCode } = execution;
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = exitCode;
}
