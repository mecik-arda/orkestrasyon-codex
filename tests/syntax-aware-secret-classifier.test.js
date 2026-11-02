import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { classifySecretLikeContent } from "../subagent-bridge/src/memory.js";
import {
  classifyJavaScriptOrTypeScriptSource,
  SYNTAX_AWARE_NODE_LIMIT,
  SYNTAX_AWARE_SOURCE_LIMIT_BYTES
} from "../subagent-bridge/src/services/review-source-syntax-classifier.js";

function createSyntheticHighEntropyText() {
  return crypto.randomBytes(36).toString("base64url");
}

function createSyntheticCredentialSignature() {
  return ["AKIA", "0".repeat(16)].join("");
}

function createSyntheticBearerText() {
  return ["Bearer", ["synthetic", "placeholder", "value"].join("-")].join(" ");
}

function createSyntheticSensitiveText() {
  return ["synthetic", "placeholder", "value"].join("-");
}

function toUnicodeEscapeLiteral(value) {
  const escaped = [...value].map((character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`).join("");
  return `"${escaped}"`;
}

function hasFinding(result, kind) {
  return result.findings.some((finding) => finding.kind === kind);
}

test("SASC-01: long JavaScript and TypeScript identifiers are separated from literal entropy candidates", () => {
  const identifier = ["applyAuthorized", "ParallelIntegration", "RequestSchema"].join("");
  const javaScript = `const ${identifier} = 1;`;
  const typeScript = `const ${identifier}: number = 1;`;
  assert.equal(classifySecretLikeContent(javaScript).signal, "high_entropy");
  assert.equal(classifySecretLikeContent(typeScript).signal, "high_entropy");
  assert.equal(classifyJavaScriptOrTypeScriptSource({ fileName: "review.js", source: javaScript }).decision, "no_static_literal_findings");
  assert.equal(classifyJavaScriptOrTypeScriptSource({ fileName: "review.ts", source: typeScript }).decision, "no_static_literal_findings");
});

test("SASC-02: the same long text in a string literal remains a high entropy finding", () => {
  const value = createSyntheticHighEntropyText();
  const source = `const value = ${JSON.stringify(value)};`;
  const result = classifyJavaScriptOrTypeScriptSource({ fileName: "review.js", source });
  assert.equal(result.status, "complete");
  assert.equal(hasFinding(result, "high_entropy"), true);
});

test("SASC-03: known credential signatures remain findings in strings, comments, and regular expressions", () => {
  const credentialSignature = createSyntheticCredentialSignature();
  const bearerText = createSyntheticBearerText();
  const source = [
    `const key = ${JSON.stringify(credentialSignature)};`,
    `const matcher = /${credentialSignature}/;`,
    `/* ${bearerText} */`
  ].join("\n");
  const result = classifyJavaScriptOrTypeScriptSource({ fileName: "review.js", source });
  assert.equal(hasFinding(result, "known_signature"), true);
});

test("SASC-11: known credential signatures remain findings in identifiers", () => {
  const credentialSignature = createSyntheticCredentialSignature();
  const source = `const ${credentialSignature} = 1; class Example { #${credentialSignature} = 1; }`;
  const result = classifyJavaScriptOrTypeScriptSource({ fileName: "review.js", source });
  assert.equal(result.findings.filter((finding) => finding.kind === "known_signature").length, 2);
});

test("SASC-12: escaped known credential signatures remain findings in identifiers", () => {
  const escapedIdentifier = [...createSyntheticCredentialSignature()]
    .map((character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`)
    .join("");
  const source = `const ${escapedIdentifier} = 1; class Example { #${escapedIdentifier} = 1; }`;
  const result = classifyJavaScriptOrTypeScriptSource({ fileName: "review.js", source });
  assert.equal(result.findings.filter((finding) => finding.kind === "known_signature").length, 2);
});

test("SASC-04: sensitive fields distinguish literal values from dynamic calls and scan call arguments", () => {
  const dynamicSource = ["const settings = { token:", "crypto.randomUUID()", "};"].join(" ");
  assert.equal(classifySecretLikeContent(dynamicSource).signal, "known_signature");
  const dynamic = classifyJavaScriptOrTypeScriptSource({
    fileName: "review.js",
    source: dynamicSource
  });
  assert.equal(hasFinding(dynamic, "known_signature"), false);
  assert.equal(hasFinding(dynamic, "sensitive_dynamic_value"), true);

  const dynamicWithSensitiveArgument = classifyJavaScriptOrTypeScriptSource({
    fileName: "review.js",
    source: `const settings = { token: issueToken(${JSON.stringify(createSyntheticCredentialSignature())}) };`
  });
  assert.equal(hasFinding(dynamicWithSensitiveArgument, "sensitive_dynamic_value"), true);
  assert.equal(hasFinding(dynamicWithSensitiveArgument, "known_signature"), true);

  const assignment = classifyJavaScriptOrTypeScriptSource({
    fileName: "review.js",
    source: ["settings.token =", "crypto", ".", "randomUUID", "();"].join(" ")
  });
  assert.equal(hasFinding(assignment, "sensitive_dynamic_value"), true);

  const computedAssignment = classifyJavaScriptOrTypeScriptSource({
    fileName: "review.js",
    source: ["settings[\"token\"] =", "crypto.randomUUID();"].join(" ")
  });
  assert.equal(hasFinding(computedAssignment, "sensitive_dynamic_value"), true);

  const logicalAssignment = classifyJavaScriptOrTypeScriptSource({
    fileName: "review.js",
    source: ["settings.token ??=", "crypto.randomUUID();"].join(" ")
  });
  assert.equal(hasFinding(logicalAssignment, "sensitive_dynamic_value"), true);

  const destructuredAssignment = classifyJavaScriptOrTypeScriptSource({
    fileName: "review.js",
    source: ["({ token } =", "resolveSettings());"].join(" ")
  });
  assert.equal(hasFinding(destructuredAssignment, "sensitive_dynamic_value"), true);
});

test("SASC-05: nested objects, arrays, and static computed properties retain sensitive field checks", () => {
  const sensitiveText = JSON.stringify(createSyntheticSensitiveText());
  const source = [
    `const settings = { outer: [{ token: ${sensitiveText} }] };`,
    `const computed = { ["password"]: ${JSON.stringify(createSyntheticSensitiveText())} };`,
    `const highEntropy = { apiKey: ${JSON.stringify(createSyntheticHighEntropyText())} };`
  ].join("\n");
  const result = classifyJavaScriptOrTypeScriptSource({ fileName: "review.js", source });
  assert.equal(hasFinding(result, "known_signature"), true);
  assert.equal(hasFinding(result, "high_entropy"), true);
});

test("SASC-06: dynamic computed keys require review instead of producing a clean result", () => {
  const result = classifyJavaScriptOrTypeScriptSource({
    fileName: "review.js",
    source: "const settings = { [resolveKey()]: resolveValue() };"
  });
  assert.equal(result.decision, "review_required");
  assert.equal(hasFinding(result, "computed_property_unresolved"), true);
});

test("SASC-07: template text is scanned and dynamic sensitive templates remain unresolved", () => {
  const highEntropyText = createSyntheticHighEntropyText();
  const literal = classifyJavaScriptOrTypeScriptSource({
    fileName: "review.ts",
    source: `const token = \`${highEntropyText}\`;`
  });
  assert.equal(hasFinding(literal, "high_entropy"), true);

  const dynamic = classifyJavaScriptOrTypeScriptSource({
    fileName: "review.ts",
    source: "const settings = { token: `prefix-${resolveToken()}` };"
  });
  assert.equal(hasFinding(dynamic, "sensitive_dynamic_value"), true);

  const jsxText = classifyJavaScriptOrTypeScriptSource({
    fileName: "review.tsx",
    source: `<section>${highEntropyText}</section>;`
  });
  assert.equal(hasFinding(jsxText, "high_entropy"), true);
});

test("SASC-08: escaped literals and supported static string concatenation cannot hide candidates", () => {
  const highEntropyText = createSyntheticHighEntropyText();
  const escaped = classifyJavaScriptOrTypeScriptSource({
    fileName: "review.js",
    source: `const token = ${toUnicodeEscapeLiteral(highEntropyText)};`
  });
  assert.equal(hasFinding(escaped, "high_entropy"), true);

  const splitAt = Math.floor(highEntropyText.length / 2);
  const concatenated = classifyJavaScriptOrTypeScriptSource({
    fileName: "review.js",
    source: `const settings = { token: "${highEntropyText.slice(0, splitAt)}" + "${highEntropyText.slice(splitAt)}" };`
  });
  assert.equal(hasFinding(concatenated, "high_entropy"), true);

  const templateConcatenation = classifyJavaScriptOrTypeScriptSource({
    fileName: "review.js",
    source: `const value = \`${highEntropyText.slice(0, splitAt)}${"${"}${JSON.stringify(highEntropyText.slice(splitAt))}${"}"}\`;`
  });
  assert.equal(hasFinding(templateConcatenation, "high_entropy"), true);
});

test("SASC-09: parser failures, unsupported syntax kinds, and invalid inputs fail closed", () => {
  for (const input of [
    { fileName: "review.js", source: "const = ;" },
    { fileName: "review.json", source: '{"token":"value"}' },
    { fileName: "review.ts", source: null },
    { fileName: "review.js", source: ["const", "token", "=", '"', "unterminated"].join(" ") }
  ]) {
    const result = classifyJavaScriptOrTypeScriptSource(input);
    assert.equal(result.status, "blocked");
    assert.equal(result.decision, "review_required");
    assert.deepEqual(result.findings, []);
  }
});

test("SASC-10: source byte and AST node limits fail closed", () => {
  const tooLarge = classifyJavaScriptOrTypeScriptSource({
    fileName: "review.js",
    source: "x".repeat(SYNTAX_AWARE_SOURCE_LIMIT_BYTES + 1)
  });
  assert.equal(tooLarge.reason, "source_too_large");

  const highNodeCountSource = "const a=1;".repeat(Math.ceil(SYNTAX_AWARE_NODE_LIMIT / 4));
  const tooManyNodes = classifyJavaScriptOrTypeScriptSource({ fileName: "review.js", source: highNodeCountSource });
  assert.equal(tooManyNodes.reason, "node_limit_exceeded");
});
