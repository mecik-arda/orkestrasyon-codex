import crypto from "node:crypto";

const syntheticEntropySentinel = Buffer.from(crypto.createHash("sha256").update("secret-preflight-offline-eval-v1").digest()).toString("base64url");
const ordinaryIdentifier = "applyAuthorizedParallelIntegrationRequestSchema";
const signatureIdentifier = ["AKIA", "0".repeat(16)].join("");
const syntheticBearer = ["Bearer", ["offline", "synthetic", "sentinel"].join("-")].join(" ");
const credentialLiteral = `${syntheticEntropySentinel}${Buffer.from(crypto.createHash("sha256").update("secret-preflight-offline-eval-v1-second").digest()).toString("base64url")}`;
const escapedCredentialLiteral = [...credentialLiteral].map((character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`).join("");
const escapedSignatureIdentifier = [...signatureIdentifier].map((character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`).join("");
const tick = String.fromCharCode(96);
const purposeRationales = Object.freeze({
  benign_syntax: "syntax-only control without an intended static secret",
  synthetic_secret_bearing: "deterministic non-account sentinel intentionally represents secret-shaped content",
  ambiguous_dynamic: "the value depends on runtime data and cannot be resolved from the static source",
  unsupported_or_invalid: "the input is unsupported, invalid, or beyond an analysis limit",
  known_limitation: "the fixture exposes a known risk boundary without asserting a real credential"
});

function fixture(id, cohort, purpose, source, options = {}) {
  return Object.freeze({
    id,
    cohort,
    purpose,
    rationale: purposeRationales[purpose],
    fileName: options.fileName || "offline-eval.js",
    source,
    riskExpected: options.riskExpected || "no_known_static_secret",
    relationGroup: options.relationGroup || null
  });
}

export function createSecretPreflightOfflineCorpus() {
  const fixtures = [
    fixture("ordinary-declaration", "ordinary_identifier", "benign_syntax", `const ${ordinaryIdentifier} = 1;`, { relationGroup: "ordinary-base" }),
    fixture("ordinary-import", "ordinary_identifier", "benign_syntax", `import { ${ordinaryIdentifier} } from "./module.js";`),
    fixture("ordinary-property", "ordinary_identifier", "benign_syntax", `const value = object.${ordinaryIdentifier};`),
    fixture("ordinary-private", "ordinary_identifier", "benign_syntax", `class Example { #${ordinaryIdentifier} = 1; }`),
    fixture("ordinary-use", "ordinary_identifier", "benign_syntax", `const ${ordinaryIdentifier} = 1; consume(${ordinaryIdentifier});`),
    fixture("ordinary-crlf", "normalization", "benign_syntax", `const ${ordinaryIdentifier} = 1;\r\n`, { relationGroup: "ordinary-base" }),
    fixture("ordinary-bom", "normalization", "benign_syntax", `\uFEFFconst ${ordinaryIdentifier} = 1;`, { relationGroup: "ordinary-base" }),
    fixture("signature-identifier", "known_signature_identifier", "synthetic_secret_bearing", `const ${signatureIdentifier} = 1;`, { riskExpected: "must_review", relationGroup: "signature-identifier" }),
    fixture("signature-private-identifier", "known_signature_identifier", "synthetic_secret_bearing", `class Example { #${signatureIdentifier} = 1; }`, { riskExpected: "must_review", relationGroup: "signature-identifier" }),
    fixture("signature-escaped-identifier", "known_signature_identifier", "synthetic_secret_bearing", `const ${escapedSignatureIdentifier} = 1;`, { riskExpected: "must_review", relationGroup: "signature-identifier" }),
    fixture("signature-string", "literal_context", "synthetic_secret_bearing", `const value = ${JSON.stringify(signatureIdentifier)};`, { riskExpected: "must_review" }),
    fixture("entropy-string", "literal_context", "synthetic_secret_bearing", `const value = ${JSON.stringify(credentialLiteral)};`, { riskExpected: "must_review" }),
    fixture("entropy-regex", "literal_context", "synthetic_secret_bearing", `const matcher = /${credentialLiteral}/;`, { riskExpected: "must_review" }),
    fixture("entropy-comment", "literal_context", "synthetic_secret_bearing", `void 0; // ${credentialLiteral}`, { riskExpected: "must_review" }),
    fixture("bearer-comment", "literal_context", "synthetic_secret_bearing", `void 0; /* ${syntheticBearer} */`, { riskExpected: "must_review" }),
    fixture("entropy-template", "literal_context", "synthetic_secret_bearing", `const value = ${tick}${credentialLiteral}${tick};`, { riskExpected: "must_review" }),
    fixture("entropy-jsx-text", "literal_context", "synthetic_secret_bearing", `const view = <section>${credentialLiteral}</section>;`, { fileName: "offline-eval.tsx", riskExpected: "must_review" }),
    fixture("escaped-string", "static_representation", "synthetic_secret_bearing", `const token = "${escapedCredentialLiteral}";`, { riskExpected: "must_review" }),
    fixture("escaped-signature-string", "static_representation", "synthetic_secret_bearing", `const token = "${[...signatureIdentifier].map((character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`).join("")}";`, { riskExpected: "must_review" }),
    fixture("concatenated-signature", "static_representation", "synthetic_secret_bearing", `const token = "${signatureIdentifier.slice(0, 4)}" + "${signatureIdentifier.slice(4)}";`, { riskExpected: "must_review" }),
    fixture("concatenated-string", "static_representation", "synthetic_secret_bearing", `const token = "${credentialLiteral.slice(0, 32)}" + "${credentialLiteral.slice(32)}";`, { riskExpected: "must_review" }),
    fixture("parenthesized-string", "static_representation", "synthetic_secret_bearing", `const token = ((${JSON.stringify(credentialLiteral)}));`, { riskExpected: "must_review" }),
    fixture("template-static", "static_representation", "synthetic_secret_bearing", `const token = ${tick}${credentialLiteral.slice(0, 32)}${"${"}${JSON.stringify(credentialLiteral.slice(32))}}${tick};`, { riskExpected: "must_review" }),
    fixture("sensitive-static-property", "sensitive_value", "synthetic_secret_bearing", `const settings = { apiKey: ${JSON.stringify(credentialLiteral)} };`, { riskExpected: "must_review" }),
    fixture("sensitive-dynamic-call", "sensitive_value", "ambiguous_dynamic", "const settings = { token: issueToken() };", { riskExpected: "review_required" }),
    fixture("sensitive-dynamic-property", "sensitive_value", "ambiguous_dynamic", "const settings = { password: values[current] };", { riskExpected: "review_required" }),
    fixture("sensitive-shorthand", "sensitive_value", "ambiguous_dynamic", "const settings = { token };", { riskExpected: "review_required" }),
    fixture("sensitive-computed-key", "sensitive_value", "ambiguous_dynamic", "const settings = { [propertyName]: value };", { riskExpected: "review_required" }),
    fixture("sensitive-computed-static", "sensitive_value", "synthetic_secret_bearing", `const settings = { ["token"]: ${JSON.stringify(credentialLiteral)} };`, { riskExpected: "must_review" }),
    fixture("sensitive-spread", "sensitive_value", "known_limitation", "const settings = { ...defaults };", { riskExpected: "known_limitation" }),
    fixture("sensitive-destructuring-computed", "sensitive_value", "ambiguous_dynamic", "const { [propertyName]: value } = settings;", { riskExpected: "review_required" }),
    fixture("sensitive-destructuring", "sensitive_value", "ambiguous_dynamic", "const { token } = settings;", { riskExpected: "review_required" }),
    fixture("sensitive-logical-assignment", "sensitive_value", "ambiguous_dynamic", "settings.token ??= resolveToken();", { riskExpected: "review_required" }),
    fixture("template-after-interpolation-comment", "template_comment", "synthetic_secret_bearing", `const value = ${tick}prefix ${"${value}"}${tick}; /* ${signatureIdentifier} */`, { riskExpected: "must_review" }),
    fixture("nested-template-comment", "template_comment", "synthetic_secret_bearing", `const value = ${tick}outer ${"${"}${tick}inner ${"${value}"}${tick}}${tick}; // ${signatureIdentifier}`, { riskExpected: "must_review" }),
    fixture("comment-like-string", "template_comment", "synthetic_secret_bearing", `const value = "// ${credentialLiteral}";`, { riskExpected: "must_review" }),
    fixture("comment-like-regex", "template_comment", "benign_syntax", `const value = /\\/\\*.*\\*\\//;`),
    fixture("identifier-runtime-reflection", "identifier_runtime_conversion", "known_limitation", `function ${ordinaryIdentifier}() {} const reflectedName = ${ordinaryIdentifier}.name;`, { riskExpected: "known_limitation" }),
    fixture("identifier-property-key-reflection", "identifier_runtime_conversion", "known_limitation", `const object = { ${ordinaryIdentifier}: 1 }; const names = Object.keys(object);`, { riskExpected: "known_limitation" }),
    fixture("same-text-as-literal", "context_metamorphic", "synthetic_secret_bearing", `const value = ${JSON.stringify(ordinaryIdentifier)};`, { riskExpected: "must_review", relationGroup: "same-text-context" }),
    fixture("same-text-as-identifier", "context_metamorphic", "benign_syntax", `const ${ordinaryIdentifier} = 1;`, { relationGroup: "same-text-context" }),
    fixture("sensitive-call-argument-signature", "sensitive_value", "synthetic_secret_bearing", `const settings = { token: issueToken(${JSON.stringify(signatureIdentifier)}) };`, { riskExpected: "must_review" }),
    fixture("unsupported-extension", "fail_closed", "unsupported_or_invalid", "const value = 1;", { fileName: "offline-eval.json", riskExpected: "analysis_incomplete" }),
    fixture("parse-error", "fail_closed", "unsupported_or_invalid", "const = ;", { riskExpected: "analysis_incomplete" }),
    fixture("unterminated-literal", "fail_closed", "unsupported_or_invalid", "const value = \"unfinished", { riskExpected: "analysis_incomplete" }),
    fixture("source-byte-limit", "fail_closed", "unsupported_or_invalid", "x".repeat(256 * 1024 + 1), { riskExpected: "analysis_incomplete" }),
    fixture("node-limit", "fail_closed", "unsupported_or_invalid", "const a=1;".repeat(22000), { riskExpected: "analysis_incomplete" }),
    fixture("bom-crlf-unicode", "normalization", "benign_syntax", "\uFEFFconst emoji = \"🧪\";\r\nvoid emoji;", { relationGroup: "unicode-line-ending" }),
    fixture("unicode-lf", "normalization", "benign_syntax", "const emoji = \"🧪\";\nvoid emoji;", { relationGroup: "unicode-line-ending" }),
    fixture("repeated-symbol", "overlap_repetition", "known_limitation", `const ${ordinaryIdentifier} = 1; const ${ordinaryIdentifier}Again = 2;`, { riskExpected: "known_limitation" }),
    fixture("overlapping-signals", "overlap_repetition", "synthetic_secret_bearing", `const ${signatureIdentifier} = ${JSON.stringify(signatureIdentifier)};`, { riskExpected: "must_review" }),
    fixture("large-single-record", "overlap_repetition", "benign_syntax", `const value = "${"x".repeat(16384)}";`)
  ];
  return Object.freeze(fixtures);
}
