import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createSecretPreflightOfflineCorpus } from "../experiments/secret-preflight-offline-corpus.js";
import {
  evaluateSecretClassifierCorpus,
  serializeSecretClassifierEvaluation
} from "../experiments/secret-preflight-offline-evaluation.js";

function safeAssert(condition, message) {
  assert.equal(condition, true, message);
}

function resultById(report, id) {
  return report.fixtures.find((fixture) => fixture.id === id);
}

function copyReport(report) {
  return structuredClone(report);
}

function serializedFailureCode(report) {
  return JSON.parse(serializeSecretClassifierEvaluation(report)).measurementFailureCode;
}

test("SPOE-01: fixed corpus and classifier observations are deterministic and independently labeled", () => {
  const first = evaluateSecretClassifierCorpus();
  const second = evaluateSecretClassifierCorpus();
  safeAssert(first.measurementComplete, "fixed corpus measurement must complete");
  safeAssert(JSON.stringify(first) === JSON.stringify(second), "fixed corpus result must be deterministic");
  safeAssert(first.fixtures.length > 32 && first.fixtures.length <= 64, "fixture count must stay inside the declared bound");
  safeAssert(first.fixtures.every((item) => item.purpose && item.riskExpected), "independent fixture labels must be present");
  safeAssert(first.fixtures.every((item) => item.rationale.length > 0), "independent fixture rationale must be present");
  safeAssert(first.counts.fixtureCount === first.fixtures.length, "aggregate fixture count must match observations");
  safeAssert(first.cohorts.reduce((total, cohort) => total + cohort.fixtureCount, 0) === first.fixtures.length, "cohort counts must partition fixtures");
  safeAssert(first.purposes.reduce((total, purpose) => total + purpose.fixtureCount, 0) === first.fixtures.length, "purpose counts must partition fixtures");
  safeAssert(first.counts.astStaticFindingOnlyCount + first.counts.astReviewRequiredOnlyCount + first.counts.astStaticFindingAndReviewRequiredCount + first.counts.astAnalysisIncompleteCount + first.counts.astNoStaticFindingCount === first.fixtures.length, "exclusive AST outcome classes must partition measured fixtures");
  safeAssert(first.outcomeCountSemantics.includes("can overlap"), "overlapping aggregate totals must be explained");
  safeAssert(first.purposes.every((purpose) => purpose.astStaticFindingOnlyCount + purpose.astReviewRequiredOnlyCount + purpose.astStaticFindingAndReviewRequiredCount + purpose.astAnalysisIncompleteCount + purpose.astNoStaticFindingCount === purpose.fixtureCount - purpose.missingMeasurementCount), "purpose outcome counts must partition each measured cohort");
  safeAssert(first.fixtures.some((item) => item.purpose === "known_limitation" && item.ast.outcome === "no_static_finding"), "known limitation must remain visible as an AST no-finding");
});

test("SPOE-02: ordinary identifier improvements and known risky no-findings remain separate", () => {
  const report = evaluateSecretClassifierCorpus();
  const ordinary = resultById(report, "ordinary-declaration");
  const reflected = resultById(report, "identifier-runtime-reflection");
  safeAssert(ordinary.legacy.outcome === "static_finding", "legacy identifier signal must be measured");
  safeAssert(ordinary.ast.outcome === "no_static_finding", "AST ordinary identifier classification must be measured");
  safeAssert(reflected.ast.outcome === "no_static_finding", "runtime-reflected identifier risk must be reported as a no-finding");
  safeAssert(report.decisionChanges.legacyFindingAstNoStaticFindingFixtureIds.includes(ordinary.id), "legacy-to-AST decision change must be listed");
  safeAssert(report.decisionChanges.riskExpectedAstNoStaticFindingFixtureIds.includes(reflected.id), "risky no-finding must not be averaged away");
});

test("SPOE-03: AST preserves credential findings and distinct dynamic or incomplete outcomes", () => {
  const report = evaluateSecretClassifierCorpus();
  safeAssert(resultById(report, "signature-escaped-identifier").ast.findingKinds.includes("known_signature"), "escaped signature must remain detected");
  safeAssert(resultById(report, "signature-private-identifier").ast.findingKinds.includes("known_signature"), "private signature must remain detected");
  safeAssert(resultById(report, "escaped-signature-string").ast.findingKinds.includes("known_signature"), "escaped literal signature must remain detected");
  safeAssert(resultById(report, "concatenated-signature").ast.findingKinds.includes("known_signature"), "statically concatenated signature must remain detected");
  safeAssert(resultById(report, "sensitive-shorthand").ast.outcome === "review_required", "sensitive shorthand must remain review-required");
  safeAssert(resultById(report, "parse-error").ast.outcome === "analysis_incomplete", "parse failure must not become a true-negative");
  safeAssert(resultById(report, "unsupported-extension").ast.outcome === "analysis_incomplete", "unsupported source must not become a true-negative");
  safeAssert(resultById(report, "source-byte-limit").ast.reason === "source_too_large", "source limit must fail closed");
  safeAssert(resultById(report, "node-limit").ast.reason === "node_limit_exceeded", "node limit must fail closed");
  const overlap = resultById(report, "overlapping-signals").ast;
  safeAssert(overlap.findingCount > overlap.findingKinds.length, "occurrence and unique risk-class counts must remain distinct");
});

test("SPOE-04: context metamorphs keep identifier and literal interpretations distinct", () => {
  const report = evaluateSecretClassifierCorpus();
  const identifier = resultById(report, "same-text-as-identifier");
  const literal = resultById(report, "same-text-as-literal");
  safeAssert(identifier.relationGroup === literal.relationGroup, "metamorphic pair must share a relation id");
  safeAssert(identifier.ast.outcome === "no_static_finding", "identifier context must retain syntax-aware treatment");
  safeAssert(literal.ast.outcome === "static_finding", "literal context must retain static scanning");
  const base = resultById(report, "ordinary-declaration");
  for (const id of ["ordinary-crlf", "ordinary-bom"]) {
    safeAssert(resultById(report, id).ast.outcome === base.ast.outcome, "BOM/line-ending transform must preserve normalized AST class");
    safeAssert(resultById(report, id).legacy.outcome === base.legacy.outcome, "BOM/line-ending transform must preserve legacy class");
  }
});

test("SPOE-05: report serialization excludes source, sentinels, assertions and exception details", () => {
  const corpus = createSecretPreflightOfflineCorpus();
  const sentinel = corpus.find((item) => item.id === "entropy-string").source;
  const report = evaluateSecretClassifierCorpus({
    corpus: [corpus[0]],
    legacyClassifier() {
      throw new Error(sentinel);
    }
  });
  const serialized = serializeSecretClassifierEvaluation(report);
  safeAssert(Buffer.byteLength(serialized, "utf8") <= 64 * 1024, "report must respect the byte limit");
  safeAssert(!serialized.includes(sentinel), "report must not contain fixture source");
  safeAssert(!serialized.includes("stack"), "report must not include exception stack data");
  safeAssert(!serialized.includes("actual"), "report must not include assertion details");
  safeAssert(report.measurementComplete === false, "classifier failure must make measurement incomplete");
  const oversized = serializeSecretClassifierEvaluation({ payload: "x".repeat(64 * 1024 + 1) });
  safeAssert(Buffer.byteLength(oversized, "utf8") < 4096, "oversized reports must collapse to a small closed result");
  safeAssert(JSON.parse(oversized).measurementFailureCode === "report_invalid", "unknown payloads must fail schema validation before serialization");
  safeAssert(!oversized.includes("x".repeat(32)), "closed schema failure must not expose unknown payload data");
});

test("SPOE-06: malformed, duplicate and over-limit corpora fail with closed codes", () => {
  const corpus = createSecretPreflightOfflineCorpus();
  safeAssert(evaluateSecretClassifierCorpus({ corpus: [] }).measurementFailureCode === "corpus_fixture_limit", "empty corpus must fail closed");
  safeAssert(evaluateSecretClassifierCorpus({ corpus: [corpus[0], corpus[0]] }).measurementFailureCode === "duplicate_fixture_id", "duplicate identifiers must fail closed");
  const overLimit = [...corpus, ...corpus].slice(0, 65);
  safeAssert(evaluateSecretClassifierCorpus({ corpus: overLimit }).measurementFailureCode === "corpus_fixture_limit", "fixture cap must fail closed");
  const sourceLimitFixture = corpus.find((item) => item.id === "source-byte-limit");
  const oversizedRecord = { ...sourceLimitFixture, id: "oversized-record", source: "x".repeat(266241) };
  safeAssert(evaluateSecretClassifierCorpus({ corpus: [oversizedRecord] }).measurementFailureCode === "fixture_source_limit", "single record cap must fail closed");
  const oversizedCorpus = Array.from({ length: 5 }, (_, index) => ({
    ...sourceLimitFixture,
    id: `corpus-large-${index}`,
    source: "x".repeat(262145)
  }));
  safeAssert(evaluateSecretClassifierCorpus({ corpus: oversizedCorpus }).measurementFailureCode === "corpus_byte_limit", "aggregate corpus byte cap must fail closed");
  const unknownResult = evaluateSecretClassifierCorpus({
    corpus: [corpus[0]],
    astClassifier() {
      return { status: "complete", decision: "unknown", reason: null, findings: [] };
    }
  });
  safeAssert(unknownResult.measurementComplete === false, "unexpected classifier output must not be treated as a policy pass");
  safeAssert(unknownResult.measurementFailureCode === "classifier_result_invalid", "unexpected output must have a closed failure code");
  const relabeled = evaluateSecretClassifierCorpus({
    corpus: [corpus.find((item) => item.id === "entropy-string")],
    legacyClassifier() {
      return { matches: false, signal: "none", highEntropyCandidateCount: 0 };
    },
    astClassifier() {
      return { status: "complete", decision: "no_static_literal_findings", reason: null, coverage: "parsed_source_literals_comments_and_sensitive_static_values", findings: [] };
    }
  });
  safeAssert(relabeled.fixtures[0].purpose === "synthetic_secret_bearing", "fixture label must not be inferred from classifier output");
  safeAssert(relabeled.fixtures[0].ast.outcome === "no_static_finding", "unexpected policy result must remain visible beside the label");
});

test("SPOE-07: report distinguishes static findings, review-required, incomplete and no-finding", () => {
  const report = evaluateSecretClassifierCorpus();
  safeAssert(report.counts.astStaticFindingCount > 0, "static findings must be counted");
  safeAssert(report.counts.astReviewRequiredCount > 0, "dynamic review requirements must be counted");
  safeAssert(report.counts.astAnalysisIncompleteCount > 0, "analysis failures must be counted");
  safeAssert(report.counts.astNoStaticFindingCount > 0, "no-static-finding observations must be counted");
  safeAssert(report.policyAssessment === "not_decided", "measurement completion must not decide production policy");
  safeAssert(report.policyEvidence.status === "not_decided", "policy evidence must stay separate from decision authority");
  safeAssert(report.policyEvidence.riskExpectedAstNoStaticFindingFixtureIds.length === report.counts.riskExpectedAstNoStaticFindingCount, "risk-labeled no-findings must be listed separately");
});

test("SPOE-08: command output is bounded redacted JSON without provider or Vault environment", () => {
  const corpus = createSecretPreflightOfflineCorpus();
  const sentinel = corpus.find((item) => item.id === "entropy-string").source;
  const scriptPath = fileURLToPath(new URL("../scripts/evaluate-secret-preflight.js", import.meta.url));
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: process.cwd(),
    env: {
      PATH: process.env.PATH || "",
      SystemRoot: process.env.SystemRoot || "",
      TEMP: process.env.TEMP || "",
      TMP: process.env.TMP || ""
    },
    encoding: "utf8",
    timeout: 30000,
    maxBuffer: 128 * 1024,
    windowsHide: true
  });
  safeAssert(result.error === undefined, "evaluation process must finish without process errors");
  safeAssert(result.status === 0, "evaluation process must return the measurement status");
  safeAssert(result.stderr.length === 0, "successful evaluation must not emit diagnostic source to stderr");
  safeAssert(Buffer.byteLength(result.stdout, "utf8") <= 64 * 1024 + 1, "command JSON must respect the report bound");
  safeAssert(!result.stdout.includes(sentinel) && !result.stderr.includes(sentinel), "command output must not disclose fixture source");
  const report = JSON.parse(result.stdout);
  safeAssert(report.measurementComplete === true, "command must emit a complete measurement report");
  safeAssert(report.provenance.classifierMode === "built_in", "normal CLI must use the built-in classifiers");
  safeAssert(report.provenance.builtInClassifierComparison === true, "normal CLI must identify the fixed built-in comparison mode");
  safeAssert(!Object.hasOwn(report.environment, "classifierSourceSha256"), "reference source must not be mislabeled as execution provenance");
  const invalidArguments = spawnSync(process.execPath, [scriptPath, "--custom"], {
    cwd: process.cwd(),
    env: { PATH: process.env.PATH || "", SystemRoot: process.env.SystemRoot || "", TEMP: process.env.TEMP || "", TMP: process.env.TMP || "" },
    encoding: "utf8",
    timeout: 30000,
    maxBuffer: 4096,
    windowsHide: true
  });
  safeAssert(invalidArguments.status === 1, "unexpected CLI arguments must fail");
  safeAssert(JSON.parse(invalidArguments.stdout).measurementFailureCode === "unexpected_cli_arguments", "unexpected arguments must produce a closed failure");
});

test("SPOE-09: injected classifiers do not claim built-in execution provenance", () => {
  const corpus = createSecretPreflightOfflineCorpus();
  const fixed = evaluateSecretClassifierCorpus();
  const custom = evaluateSecretClassifierCorpus({
    corpus: [corpus[0]],
    legacyClassifier() {
      return { matches: true, signal: "high_entropy", highEntropyCandidateCount: 1 };
    },
    astClassifier() {
      return {
        status: "complete",
        decision: "review_required",
        reason: null,
        coverage: "parsed_source_literals_comments_and_sensitive_static_values",
        findings: [{ kind: "sensitive_dynamic_value" }]
      };
    }
  });
  const legacyOnly = evaluateSecretClassifierCorpus({
    corpus: [corpus[0]],
    legacyClassifier() {
      return { matches: true, signal: "high_entropy", highEntropyCandidateCount: 1 };
    }
  });
  const astOnly = evaluateSecretClassifierCorpus({
    corpus: [corpus[0]],
    astClassifier() {
      return { status: "complete", decision: "no_static_literal_findings", reason: null, coverage: "parsed_source_literals_comments_and_sensitive_static_values", findings: [] };
    }
  });
  safeAssert(fixed.provenance.classifierMode === "built_in", "default evaluation must identify built-in classifiers");
  safeAssert(fixed.provenance.builtInClassifierComparison === true, "fixed corpus must identify built-in comparison mode");
  safeAssert(custom.provenance.classifierMode === "custom_or_unverified", "injected classifiers must be explicit");
  safeAssert(custom.provenance.builtInClassifierComparison === false, "injected classifiers must not claim built-in comparison mode");
  safeAssert(custom.provenance.legacyClassifier === "custom_or_unverified", "legacy injection must be identified independently");
  safeAssert(custom.provenance.astClassifier === "custom_or_unverified", "AST injection must be identified independently");
  safeAssert(legacyOnly.provenance.classifierMode === "mixed" && legacyOnly.provenance.astClassifier === "built_in", "legacy-only injection must remain distinguishable");
  safeAssert(astOnly.provenance.classifierMode === "mixed" && astOnly.provenance.legacyClassifier === "built_in", "AST-only injection must remain distinguishable");
  safeAssert(custom.provenance.referenceClassifierSourceSha256 === fixed.provenance.referenceClassifierSourceSha256, "source fingerprint must remain a reference binding rather than execution proof");
  safeAssert(custom.corpusId === "controlled_custom", "a supplied corpus must not inherit the fixed corpus identity");
});

test("SPOE-10: inconsistent report counts become a closed redacted failure", () => {
  const report = evaluateSecretClassifierCorpus({ corpus: [createSecretPreflightOfflineCorpus()[0]] });
  report.counts.fixtureCount = 999;
  const serialized = serializeSecretClassifierEvaluation(report);
  const parsed = JSON.parse(serialized);
  safeAssert(parsed.measurementComplete === false, "inconsistent report must not be published as complete");
  safeAssert(parsed.measurementFailureCode === "report_invalid", "inconsistent report must use a closed failure code");
  safeAssert(!serialized.includes("999"), "invalid aggregate data must not leak into the closed failure");
});

test("SPOE-11: serializer rejects independent aggregate and reference-list corruption", () => {
  const baseline = evaluateSecretClassifierCorpus();
  const mutations = [
    (report) => { report.cohorts[0].fixtureCount += 1; },
    (report) => { report.cohorts[0].fixtureIds.reverse(); },
    (report) => { report.purposes[0].fixtureIds.pop(); },
    (report) => { report.purposes[0].astReviewRequiredOnlyCount += 1; },
    (report) => { report.decisionChanges.analysisIncompleteFixtureIds.push("missing-id"); },
    (report) => { report.decisionChanges.riskExpectedAstNoStaticFindingFixtureIds.push(report.decisionChanges.riskExpectedAstNoStaticFindingFixtureIds[0]); },
    (report) => { report.policyEvidence.riskExpectedAstNoStaticFindingFixtureIds.pop(); },
    (report) => { report.fixtures[1].id = report.fixtures[0].id; },
    (report) => { report.counts.missingMeasurementCount += 1; },
    (report) => { report.counts.astStaticFindingAndReviewRequiredCount += 1; },
    (report) => { report.schemaVersion = 3; },
    (report) => { report.measurementComplete = false; },
    (report) => { report.measurementFailureCode = "classifier_execution_failed"; },
    (report) => { report.provenance.builtInClassifierComparison = false; },
    (report) => { report.provenance.referenceSourceFingerprintEndSha256 = "0".repeat(64); },
    (report) => { report.provenance.corpusMode = "controlled_custom"; }
  ];
  for (const mutate of mutations) {
    const changed = copyReport(baseline);
    mutate(changed);
    safeAssert(serializedFailureCode(changed) === "report_invalid", "inconsistent aggregate or reference list must fail closed");
  }
});

test("SPOE-12: overlapping outcomes and missing measurements preserve independent partitions", () => {
  const corpus = createSecretPreflightOfflineCorpus();
  const mixedFixture = corpus.find((fixture) => fixture.id === "sensitive-call-argument-signature");
  const mixed = evaluateSecretClassifierCorpus({ corpus: [mixedFixture] });
  safeAssert(mixed.counts.fixtureCount === 1 && mixed.counts.measuredFixtureCount === 1, "single mixed fixture must remain one measured fixture");
  safeAssert(mixed.counts.astStaticFindingCount === 1 && mixed.counts.astReviewRequiredCount === 1, "overlapping feature totals must both count the fixture");
  safeAssert(mixed.counts.astStaticFindingAndReviewRequiredCount === 1, "exclusive partition must represent the mixed outcome once");
  safeAssert(mixed.counts.astStaticFindingOnlyCount + mixed.counts.astReviewRequiredOnlyCount + mixed.counts.astStaticFindingAndReviewRequiredCount + mixed.counts.astAnalysisIncompleteCount + mixed.counts.astNoStaticFindingCount === 1, "exclusive classes must partition the single fixture");
  const missing = evaluateSecretClassifierCorpus({
    corpus: [mixedFixture],
    legacyClassifier() {
      throw new Error("synthetic failure sentinel");
    }
  });
  safeAssert(missing.measurementComplete === false, "classifier exception must make measurement incomplete");
  safeAssert(missing.counts.fixtureCount === 1 && missing.counts.measuredFixtureCount === 0 && missing.counts.missingMeasurementCount === 1, "missing fixture must remain visible in aggregate counts");
  safeAssert(missing.cohorts[0].fixtureIds[0] === mixedFixture.id && missing.purposes[0].fixtureIds[0] === mixedFixture.id, "missing fixture must remain in each input partition");
  const serialized = serializeSecretClassifierEvaluation(missing);
  safeAssert(!serialized.includes("synthetic failure sentinel"), "classifier exception content must not enter output");
  safeAssert(JSON.parse(serialized).measurementFailureCode === "classifier_execution_failed", "classifier failure must keep its closed cause");
  const invalidResult = evaluateSecretClassifierCorpus({
    corpus: [mixedFixture],
    astClassifier() {
      return { status: "complete", decision: "not-a-result", reason: null, findings: [] };
    }
  });
  safeAssert(invalidResult.counts.measuredFixtureCount === 0 && invalidResult.counts.missingMeasurementCount === 1, "invalid classifier results must count as missing measurements");
  safeAssert(JSON.parse(serializeSecretClassifierEvaluation(invalidResult)).measurementFailureCode === "classifier_result_invalid", "invalid classifier results must retain a closed cause");
});

test("SPOE-13: unknown nested values, accessors, toJSON and cycles never reach output", () => {
  const baseline = evaluateSecretClassifierCorpus();
  const sentinel = "synthetic serialization sentinel";
  const unknown = copyReport(baseline);
  unknown.extra = { source: sentinel, payload: sentinel, stack: sentinel };
  safeAssert(serializedFailureCode(unknown) === "report_invalid", "unknown nested fields must fail schema validation");
  safeAssert(!serializeSecretClassifierEvaluation(unknown).includes(sentinel), "unknown source-like content must not be emitted");
  const nestedLarge = copyReport(baseline);
  nestedLarge.fixtures[0].findingKinds = [sentinel];
  safeAssert(serializedFailureCode(nestedLarge) === "report_invalid", "nested over-limit or unexpected values must fail closed");
  const longString = copyReport(baseline);
  longString.environment.node = sentinel.repeat(200);
  safeAssert(serializedFailureCode(longString) === "report_invalid", "oversized strings must fail before serialization");
  const oversizedArray = copyReport(baseline);
  oversizedArray.fixtures.push(oversizedArray.fixtures[0]);
  safeAssert(serializedFailureCode(oversizedArray) === "report_invalid", "oversized arrays must fail before serialization");
  const cyclic = copyReport(baseline);
  cyclic.extra = cyclic;
  safeAssert(serializedFailureCode(cyclic) === "report_invalid", "cyclic report values must fail closed");
  let getterCalls = 0;
  const accessor = copyReport(baseline);
  Object.defineProperty(accessor, "measurementComplete", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return true;
    }
  });
  safeAssert(serializedFailureCode(accessor) === "report_invalid", "accessor-backed report fields must fail closed");
  safeAssert(getterCalls === 0, "serializer must not invoke report getters");
  let toJsonCalls = 0;
  const toJson = copyReport(baseline);
  Object.defineProperty(toJson, "toJSON", {
    enumerable: true,
    value() {
      toJsonCalls += 1;
      return sentinel;
    }
  });
  safeAssert(serializedFailureCode(toJson) === "report_invalid", "custom toJSON fields must fail schema validation");
  safeAssert(toJsonCalls === 0, "serializer must not invoke report toJSON");
  const throwingProxy = new Proxy(copyReport(baseline), {
    getPrototypeOf() {
      throw new Error(sentinel);
    }
  });
  const proxyResult = serializeSecretClassifierEvaluation(throwingProxy);
  safeAssert(JSON.parse(proxyResult).measurementFailureCode === "report_serialization_failed", "reflection exceptions must become a closed serialization failure");
  safeAssert(!proxyResult.includes(sentinel), "reflection exception details must not be emitted");
  const unicodeMetadata = copyReport(baseline);
  unicodeMetadata.environment.hashBoundary = "🧪".repeat(64);
  safeAssert(serializedFailureCode(unicodeMetadata) === "report_invalid", "unapproved multi-byte metadata must fail before serialization");
  safeAssert(Buffer.byteLength(serializeSecretClassifierEvaluation(unicodeMetadata), "utf8") < 4096, "multi-byte invalid metadata must collapse to a small bounded result");
});

test("SPOE-14: serialized output remains under the byte ceiling or collapses to a closed size failure", () => {
  const base = createSecretPreflightOfflineCorpus().find((fixture) => fixture.id === "ordinary-declaration");
  const corpus = Array.from({ length: 64 }, (_, index) => ({
    ...base,
    id: `fixture-${String(index).padStart(2, "0")}-${"x".repeat(40)}`,
    cohort: `cohort_${String(index).padStart(2, "0")}_${"y".repeat(30)}`
  }));
  const serialized = serializeSecretClassifierEvaluation(evaluateSecretClassifierCorpus({ corpus }));
  safeAssert(Buffer.byteLength(serialized, "utf8") <= 64 * 1024, "serialized output must remain within its byte ceiling");
  safeAssert(JSON.parse(serialized).measurementFailureCode === "report_byte_limit", "valid but oversized report must collapse to a closed size failure");
});

test("SPOE-15: explicitly supplied invalid classifiers never fall back to built-ins", () => {
  for (const key of ["legacyClassifier", "astClassifier"]) {
    for (const value of [null, undefined, "not-a-function"]) {
      const report = evaluateSecretClassifierCorpus({ [key]: value });
      safeAssert(report.measurementComplete === false, "invalid explicit classifier must not complete with a fallback");
      safeAssert(report.measurementFailureCode === "classifier_unavailable", "invalid explicit classifier must use the closed unavailable code");
      safeAssert(report.provenance === undefined, "invalid explicit classifier must not claim built-in provenance");
    }
  }
  let getterCalls = 0;
  const options = Object.defineProperty({}, "astClassifier", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return null;
    }
  });
  const accessorReport = evaluateSecretClassifierCorpus(options);
  safeAssert(accessorReport.measurementFailureCode === "evaluation_options_invalid", "accessor-backed classifier options must fail closed");
  safeAssert(getterCalls === 0, "option validation must not invoke classifier accessors");
});

test("SPOE-16: every risk disposition is counted if it regresses to no static finding", () => {
  const corpus = createSecretPreflightOfflineCorpus();
  const riskyFixtures = [
    corpus.find((fixture) => fixture.riskExpected === "review_required"),
    corpus.find((fixture) => fixture.riskExpected === "analysis_incomplete")
  ];
  const report = evaluateSecretClassifierCorpus({
    corpus: riskyFixtures,
    astClassifier() {
      return { status: "complete", decision: "no_static_literal_findings", reason: null, coverage: "parsed_source_literals_comments_and_sensitive_static_values", findings: [] };
    }
  });
  safeAssert(report.measurementComplete, "custom observations must remain measurements, not be relabeled from expectations");
  safeAssert(report.counts.riskExpectedAstNoStaticFindingCount === 2, "review-required and fail-closed expectations must both surface as risky no-findings");
  safeAssert(report.policyEvidence.riskExpectedAstNoStaticFindingFixtureIds.includes(riskyFixtures[0].id), "review-required no-finding must be listed by fixture id");
  safeAssert(report.policyEvidence.riskExpectedAstNoStaticFindingFixtureIds.includes(riskyFixtures[1].id), "analysis-incomplete no-finding must be listed by fixture id");
  safeAssert(report.fixtures.every((fixture) => fixture.ast.outcome === "no_static_finding"), "measured outcomes must remain classifier observations");
});
