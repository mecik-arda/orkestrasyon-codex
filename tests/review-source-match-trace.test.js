import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { classifySecretLikeContent, traceSecretLikeContent } from "../subagent-bridge/src/memory.js";
import { diagnoseReviewSourceScope } from "../subagent-bridge/src/services/review-source-manifest.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const diagnosticScript = path.join(projectRoot, "scripts", "diagnose-review-source.js");

function createWorkspace(t) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "review-source-match-trace-"));
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }));
  return workspace;
}

function traceWorkspaceFile(t, fileName, source) {
  const workspace = createWorkspace(t);
  fs.writeFileSync(path.join(workspace, fileName), source, "utf8");
  const result = diagnoseReviewSourceScope(workspace, [fileName], { includeMatchTrace: true });
  return { workspace, result, file: result.files[0] };
}

test("RMT-01: production aggregates and redacted occurrence metadata agree without candidate disclosure", (t) => {
  const suffix = "1234567890ABCDEF";
  const syntheticSignature = ["AKIA", suffix].join("");
  const syntheticEntropy = "A9mX2qT7vB4nC8sD1eF5hJ0kL3pR6wY9zQ2cN7mK";
  const text = `const first = "${syntheticSignature}"; const second = "${syntheticEntropy}"; const third = "${syntheticEntropy}";`;
  const traced = traceSecretLikeContent(text);
  const production = classifySecretLikeContent(text);
  const serialized = JSON.stringify(traced);

  assert.deepEqual(traced.aggregate, production);
  assert.equal(traced.complete, true);
  assert.equal(traced.occurrences.filter((item) => item.signal === "high_entropy").length, production.highEntropyCandidateCount);
  assert.equal(traced.occurrences.some((item) => item.matcherId === "aws_access_key_prefix"), true);
  assert.equal(serialized.includes(syntheticSignature), false);
  assert.equal(serialized.includes(syntheticEntropy), false);
  assert.equal(traced.occurrences.every((item) => Number.isInteger(item.start) && Number.isInteger(item.end) && item.end > item.start), true);
});

test("RMT-02: unicode, CRLF, identifiers, comments, literals, regexes, templates, overlaps, and repeats retain exact locations", (t) => {
  const identifier = "A9mX2qT7vB4nC8sD1eF5hJ0kL3pR6wY9zQ2cN7mK";
  const source = [
    "const marker = \"🙂\";",
    `const marker = "🙂"; const ${identifier} = 1;`,
    `// ${identifier}`,
    `const text = \"${identifier}\";`,
    `const pattern = /${identifier}/;`,
    `const template = \`${identifier}\`;`,
    `const token = \"${["api_key=", "A9mX2qT7vB4nC8sD1eF5hJ0kL3pR6wY9zQ2cN7mK"].join("")}\";`
  ].join("\r\n");
  const { file } = traceWorkspaceFile(t, "matches.js", source);
  const highEntropy = file.matchTrace.occurrences.filter((item) => item.signal === "high_entropy");
  const identifierMatch = highEntropy.find((item) => item.contextClass === "identifier");
  const commentMatch = highEntropy.find((item) => item.contextClass === "comment");
  const stringMatch = highEntropy.find((item) => item.contextClass === "string");
  const regexMatch = highEntropy.find((item) => item.contextClass === "regex");
  const templateMatch = highEntropy.find((item) => item.contextClass === "template");
  const repeated = highEntropy.filter((item) => item.charEnd - item.charStart === identifier.length);
  const uniqueHighEntropy = highEntropy.filter((item) => item.charEnd - item.charStart !== identifier.length);
  const overlaps = file.matchTrace.occurrences.filter((item) => item.signal === "known_signature" || item.matcherId === "high_entropy_token");

  assert.equal(file.matchTrace.complete, true);
  assert.equal(file.matchTrace.aggregateEquivalent, true);
  assert.equal(file.matchTrace.productionAggregateEquivalent, true);
  assert.equal(file.matchTrace.productionDecision, "blocked");
  assert.equal(identifierMatch.line, 2);
  assert.equal(identifierMatch.column, "const marker = \"🙂\"; const ".length + 1);
  assert.equal(identifierMatch.nodeKind, "Identifier");
  assert.equal(commentMatch.line, 3);
  assert.equal(stringMatch.line, 4);
  assert.equal(regexMatch.line, 5);
  assert.equal(templateMatch.line, 6);
  assert.equal(identifierMatch.byteStart - identifierMatch.charStart, 4);
  assert.equal(repeated.length >= 4, true);
  assert.equal(new Set(repeated.map((item) => item.repeatGroupId)).size, 1);
  assert.equal(uniqueHighEntropy.every((item) => item.repeatGroupId === undefined), true);
  assert.equal(overlaps.some((item) => item.matcherId === "credential_assignment"), true);
  assert.equal(JSON.stringify(file.matchTrace).includes(identifier), false);
  assert.equal(JSON.stringify(file.matchTrace).includes("api_key="), false);
});

test("RMT-05: dynamic sensitive contexts and CLI JSON keep source material redacted", (t) => {
  const identifier = "A9mX2qT7vB4nC8sD1eF5hJ0kL3pR6wY9zQ2cN7mK";
  const dynamic = traceWorkspaceFile(t, "dynamic.js", `const token = ${identifier};`);
  const dynamicOccurrence = dynamic.file.matchTrace.occurrences.find((item) => item.signal === "high_entropy");
  assert.equal(dynamicOccurrence.contextClass, "dynamic_sensitive_expression");

  const workspace = createWorkspace(t);
  const syntheticCredential = ["AKIA", "1234567890ABCDEF"].join("");
  fs.writeFileSync(path.join(workspace, "secret-fixture.js"), `const token = "${syntheticCredential}";\n`, "utf8");
  const child = spawnSync(process.execPath, [diagnosticScript, "--workspace", workspace, "--file", "secret-fixture.js", "--trace-matches"], {
    encoding: "utf8",
    timeout: 30000,
    env: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      WINDIR: process.env.WINDIR,
      TEMP: os.tmpdir(),
      TMP: os.tmpdir(),
      USERPROFILE: path.join(workspace, "unused-user-profile"),
      HOME: path.join(workspace, "unused-home"),
      ORCHESTRATOR_CONFIG: path.join(workspace, "unused-config.json"),
      SUBAGENT_BRIDGE_AGENTS_CONFIG: path.join(workspace, "unused-agents.json"),
      SUBAGENT_BRIDGE_TRUSTED_WORKSPACE: path.join(workspace, "unused-workspace"),
      SUBAGENT_MEMORY_PROFILE: "unused-profile"
    }
  });
  assert.equal(child.error, undefined);
  assert.equal(child.status, 2);
  assert.equal(child.stderr, "");
  assert.equal(child.stdout.includes(syntheticCredential), false);
  assert.equal(child.stdout.includes("const token"), false);
  const parsed = JSON.parse(child.stdout);
  assert.equal(parsed.files[0].matchTrace.productionAggregateEquivalent, true);
  assert.equal(parsed.files[0].matchTrace.productionDecision, "blocked");
  assert.equal(parsed.execution.sourcePayloadCreated, false);
});

test("RMT-06: trace occurrence limits produce a partial record without changing the production aggregate", () => {
  const candidate = "A9mX2qT7vB4nC8sD1eF5hJ0kL3pR6wY9zQ2cN7mK";
  const boundedTrace = traceSecretLikeContent(`${candidate} `.repeat(5000));
  assert.equal(boundedTrace.complete, false);
  assert.equal(boundedTrace.occurrences.length, 4096);
  assert.deepEqual(boundedTrace.aggregate, classifySecretLikeContent(`${candidate} `.repeat(5000)));
});

test("RMT-07: repeat groups contain only exact repeated matched spans", (t) => {
  const repeated = "A9mX2qT7vB4nC8sD1eF5hJ0kL3pR6wY9zQ2cN7mK";
  const unique = "R7vB4nC8sD1eF5hJ0kL3pA9mX2qT6wY9zQ2cN8mK4";
  const { file } = traceWorkspaceFile(t, "repeat-groups.js", `const first = ${repeated}; const second = ${unique}; const third = ${repeated};`);
  const entropyMatches = file.matchTrace.occurrences.filter((item) => item.signal === "high_entropy");
  const repeatedMatches = entropyMatches.filter((item) => item.charEnd - item.charStart === repeated.length);
  const uniqueMatch = entropyMatches.find((item) => item.charEnd - item.charStart === unique.length);

  assert.equal(repeatedMatches.length, 2);
  assert.equal(repeatedMatches[0].repeatGroupId, repeatedMatches[1].repeatGroupId);
  assert.equal(uniqueMatch.repeatGroupId, undefined);
});

test("RMT-08: a leading BOM preserves character and byte offsets", (t) => {
  const candidate = "A9mX2qT7vB4nC8sD1eF5hJ0kL3pR6wY9zQ2cN7mK";
  const prefix = "\uFEFFconst ";
  const { file } = traceWorkspaceFile(t, "bom.js", `${prefix}${candidate} = 1;`);
  const occurrence = file.matchTrace.occurrences.find((item) => item.signal === "high_entropy");
  const serializedTrace = JSON.stringify(file.matchTrace);

  assert.equal(file.matchTrace.complete, true);
  assert.equal(file.matchTrace.aggregateEquivalent, true);
  assert.equal(file.matchTrace.productionAggregateEquivalent, true);
  assert.equal(file.matchTrace.productionDecision, "blocked");
  assert.equal(occurrence.line, 1);
  assert.equal(occurrence.column, prefix.length + 1);
  assert.equal(occurrence.charStart, prefix.length);
  assert.equal(occurrence.charEnd, prefix.length + candidate.length);
  assert.equal(occurrence.byteStart, Buffer.byteLength(prefix, "utf8"));
  assert.equal(occurrence.byteEnd - occurrence.byteStart, Buffer.byteLength(candidate, "utf8"));
  assert.equal(occurrence.contextClass, "identifier");
  assert.equal(serializedTrace.includes(candidate), false);
});

test("RMT-03: private identifiers, syntax failures, unsupported sources, limits, and path safety remain fail-closed", (t) => {
  const identifier = "A9mX2qT7vB4nC8sD1eF5hJ0kL3pR6wY9zQ2cN7mK";
  const privateResult = traceWorkspaceFile(t, "private.js", `class Sample { #${identifier} = 1; }`);
  const privateMatch = privateResult.file.matchTrace.occurrences.find((item) => item.signal === "high_entropy");
  assert.equal(privateMatch.contextClass, "private_identifier");
  assert.equal(privateMatch.nodeKind, "PrivateIdentifier");
  assert.equal(privateResult.file.status, "blocked");

  const malformed = traceWorkspaceFile(t, "malformed.js", `const = \"${identifier}\";`);
  assert.equal(malformed.file.status, "blocked");
  assert.equal(malformed.file.matchTrace.complete, false);
  assert.equal(malformed.file.matchTrace.reason, "parse_error");

  const unsupported = traceWorkspaceFile(t, "unsupported.json", `{"sample":"${identifier}"}`);
  assert.equal(unsupported.file.matchTrace.complete, false);
  assert.equal(unsupported.file.matchTrace.reason, "unsupported_language");

  const tooLargeWorkspace = createWorkspace(t);
  fs.writeFileSync(path.join(tooLargeWorkspace, "large.js"), Buffer.alloc(256 * 1024 + 1, 0x61));
  const oversized = diagnoseReviewSourceScope(tooLargeWorkspace, ["large.js"], { includeMatchTrace: true });
  assert.equal(oversized.files[0].failureClass, "review_scope_too_large");
  assert.equal(oversized.files[0].matchTrace, null);

  const outside = path.join(tooLargeWorkspace, "outside.js");
  const link = path.join(tooLargeWorkspace, "linked.js");
  fs.writeFileSync(outside, "const safe = true;\n", "utf8");
  let linkCreated = true;
  try {
    fs.symlinkSync(outside, link, "file");
  } catch (error) {
    if (process.platform === "win32" && ["EPERM", "EACCES"].includes(error.code)) linkCreated = false;
    else throw error;
  }
  if (linkCreated) {
    const linked = diagnoseReviewSourceScope(tooLargeWorkspace, ["linked.js"], { includeMatchTrace: true });
    assert.equal(linked.files[0].failureClass, "review_scope_unsafe_file");
    assert.equal(linked.files[0].matchTrace, null);
  }
});

test("RMT-04: a source that changes during the bounded read yields no mixed-snapshot trace", (t) => {
  const workspace = createWorkspace(t);
  const filePath = path.join(workspace, "changing.js");
  fs.writeFileSync(filePath, "const safe = true;\n", "utf8");
  const originalReadSync = fs.readSync;
  let changed = false;
  fs.readSync = (...argumentsList) => {
    const result = originalReadSync(...argumentsList);
    if (!changed && argumentsList[0] !== undefined) {
      changed = true;
      fs.appendFileSync(filePath, "const changed = true;\n", "utf8");
    }
    return result;
  };
  let result;
  try {
    result = diagnoseReviewSourceScope(workspace, ["changing.js"], { includeMatchTrace: true });
  } finally {
    fs.readSync = originalReadSync;
  }
  assert.equal(result.files[0].failureClass, "review_scope_changed");
  assert.equal(result.files[0].matchTrace, null);
  assert.equal(result.files[0].sha256, null);
});
