import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifySecretLikeContent } from "../subagent-bridge/src/memory.js";
import {
  classifyJavaScriptOrTypeScriptSource,
  SYNTAX_AWARE_NODE_LIMIT,
  SYNTAX_AWARE_SOURCE_LIMIT_BYTES
} from "../subagent-bridge/src/services/review-source-syntax-classifier.js";
import { createSecretPreflightOfflineCorpus } from "./secret-preflight-offline-corpus.js";

const purposeRationales = Object.freeze({
  benign_syntax: "syntax-only control without an intended static secret",
  synthetic_secret_bearing: "deterministic non-account sentinel intentionally represents secret-shaped content",
  ambiguous_dynamic: "the value depends on runtime data and cannot be resolved from the static source",
  unsupported_or_invalid: "the input is unsupported, invalid, or beyond an analysis limit",
  known_limitation: "the fixture exposes a known risk boundary without asserting a real credential"
});
const policyEvidenceRationale = "Observed identifier false-positive reduction and risk-labeled no-findings require a separate security decision; no source delivery or production eligibility follows from this eval.";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const maximumFixtureCount = 64;
const maximumCorpusBytes = 1024 * 1024;
const maximumReportBytes = 64 * 1024;
const maximumFindingCount = 5000;
const maximumReportDepth = 20;
const maximumReportNodes = 20000;
const allowedPurposes = new Set([
  "benign_syntax",
  "synthetic_secret_bearing",
  "ambiguous_dynamic",
  "unsupported_or_invalid",
  "known_limitation"
]);
const allowedRiskExpectations = new Set([
  "no_known_static_secret",
  "must_review",
  "review_required",
  "analysis_incomplete",
  "known_limitation"
]);
const allowedFindingKinds = new Set([
  "known_signature",
  "high_entropy",
  "sensitive_dynamic_value",
  "computed_property_unresolved"
]);
const allowedBlockedReasons = new Set([
  "invalid_input",
  "parser_unavailable",
  "unsupported_language",
  "source_too_large",
  "invalid_source_text",
  "parse_error",
  "parser_failure",
  "node_limit_exceeded"
]);

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function closedFailure(code) {
  return {
    schemaVersion: 2,
    reportStatus: "failed",
    measurementComplete: false,
    measurementFailureCode: code,
    policyAssessment: "not_decided"
  };
}

function validateCorpus(corpus) {
  if (!Array.isArray(corpus) || corpus.length === 0 || corpus.length > maximumFixtureCount) return "corpus_fixture_limit";
  const ids = new Set();
  let corpusBytes = 0;
  for (const item of corpus) {
    if (!item || typeof item !== "object" || typeof item.id !== "string" || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(item.id)) return "corpus_fixture_invalid";
    if (ids.has(item.id)) return "duplicate_fixture_id";
    ids.add(item.id);
    if (typeof item.cohort !== "string" || !/^[a-z0-9][a-z0-9_]{0,47}$/.test(item.cohort)) return "corpus_fixture_invalid";
    if (!allowedPurposes.has(item.purpose) || !allowedRiskExpectations.has(item.riskExpected)) return "corpus_fixture_invalid";
    if (item.rationale !== purposeRationales[item.purpose]) return "corpus_fixture_invalid";
    if (typeof item.fileName !== "string" || item.fileName.length > 32 || typeof item.source !== "string") return "corpus_fixture_invalid";
    if (item.relationGroup !== null && (typeof item.relationGroup !== "string" || !/^[a-z0-9][a-z0-9-]{0,47}$/.test(item.relationGroup))) return "corpus_fixture_invalid";
    const sourceBytes = Buffer.byteLength(item.source, "utf8");
    if (sourceBytes > SYNTAX_AWARE_SOURCE_LIMIT_BYTES + 4096) return "fixture_source_limit";
    corpusBytes += sourceBytes;
    if (corpusBytes > maximumCorpusBytes) return "corpus_byte_limit";
  }
  return null;
}

function classifyLegacy(result) {
  if (!result || typeof result.matches !== "boolean" || !["none", "high_entropy", "known_signature", "mixed"].includes(result.signal)
    || !Number.isInteger(result.highEntropyCandidateCount) || result.highEntropyCandidateCount < 0) return null;
  if (result.matches !== (result.signal !== "none")) return null;
  if ((result.signal === "none" || result.signal === "known_signature") && result.highEntropyCandidateCount !== 0) return null;
  if ((result.signal === "high_entropy" || result.signal === "mixed") && result.highEntropyCandidateCount === 0) return null;
  return {
    outcome: result.matches ? "static_finding" : "no_static_finding",
    signal: result.signal,
    highEntropyCandidateCount: result.highEntropyCandidateCount
  };
}

function classifyAst(result) {
  if (!result || !["complete", "blocked"].includes(result.status)
    || !["review_required", "no_static_literal_findings"].includes(result.decision)
    || !Array.isArray(result.findings) || result.findings.length > maximumFindingCount) return null;
  if (result.status === "blocked") {
    if (result.decision !== "review_required" || !allowedBlockedReasons.has(result.reason) || result.findings.length !== 0) return null;
    return { outcome: "analysis_incomplete", reason: result.reason, findingKinds: [], findingCount: 0 };
  }
  if (result.reason !== null || result.coverage !== "parsed_source_literals_comments_and_sensitive_static_values") return null;
  if (result.findings.some((finding) => !finding || !allowedFindingKinds.has(finding.kind))) return null;
  if (result.decision === "no_static_literal_findings" && result.findings.length !== 0) return null;
  if (result.decision === "review_required" && result.findings.length === 0) return null;
  const findingKinds = [...new Set(result.findings.map((finding) => finding.kind))].sort();
  const hasStaticFinding = findingKinds.some((kind) => kind === "known_signature" || kind === "high_entropy");
  const hasReviewFinding = findingKinds.some((kind) => kind === "sensitive_dynamic_value" || kind === "computed_property_unresolved");
  const outcome = hasStaticFinding && hasReviewFinding
    ? "static_finding_and_review_required"
    : hasStaticFinding
      ? "static_finding"
      : hasReviewFinding
        ? "review_required"
        : "no_static_finding";
  return { outcome, reason: null, findingKinds, findingCount: result.findings.length };
}

function isRiskExpectedNoStaticFinding(fixtureResult) {
  return fixtureResult.riskExpected !== "no_known_static_secret" && fixtureResult.ast.outcome === "no_static_finding";
}

function aggregate(fixtures) {
  const cohorts = new Map();
  for (const fixtureResult of fixtures) {
    let cohort = cohorts.get(fixtureResult.cohort);
    if (!cohort) {
      cohort = {
        cohort: fixtureResult.cohort,
        fixtureIds: [],
        fixtureCount: 0,
        measuredFixtureCount: 0,
        missingMeasurementCount: 0,
        legacyFindingCount: 0,
        astStaticFindingCount: 0,
        astReviewRequiredCount: 0,
        astStaticFindingOnlyCount: 0,
        astReviewRequiredOnlyCount: 0,
        astStaticFindingAndReviewRequiredCount: 0,
        astAnalysisIncompleteCount: 0,
        astNoStaticFindingCount: 0,
        legacyBlockedAstNoStaticFindingCount: 0,
        riskExpectedAstNoStaticFindingCount: 0,
        missingMeasurementCount: 0
      };
      cohorts.set(fixtureResult.cohort, cohort);
    }
    cohort.fixtureCount += 1;
    cohort.fixtureIds.push(fixtureResult.id);
    if (!fixtureResult.measured) {
      cohort.missingMeasurementCount += 1;
      continue;
    }
    cohort.measuredFixtureCount += 1;
    if (fixtureResult.legacy.outcome === "static_finding") cohort.legacyFindingCount += 1;
    if (["static_finding", "static_finding_and_review_required"].includes(fixtureResult.ast.outcome)) cohort.astStaticFindingCount += 1;
    if (["review_required", "static_finding_and_review_required"].includes(fixtureResult.ast.outcome)) cohort.astReviewRequiredCount += 1;
    if (fixtureResult.ast.outcome === "static_finding") cohort.astStaticFindingOnlyCount += 1;
    if (fixtureResult.ast.outcome === "review_required") cohort.astReviewRequiredOnlyCount += 1;
    if (fixtureResult.ast.outcome === "static_finding_and_review_required") cohort.astStaticFindingAndReviewRequiredCount += 1;
    if (fixtureResult.ast.outcome === "analysis_incomplete") cohort.astAnalysisIncompleteCount += 1;
    if (fixtureResult.ast.outcome === "no_static_finding") cohort.astNoStaticFindingCount += 1;
    if (fixtureResult.legacy.outcome === "static_finding" && fixtureResult.ast.outcome === "no_static_finding") cohort.legacyBlockedAstNoStaticFindingCount += 1;
    if (isRiskExpectedNoStaticFinding(fixtureResult)) cohort.riskExpectedAstNoStaticFindingCount += 1;
  }
  return [...cohorts.values()].sort((left, right) => left.cohort.localeCompare(right.cohort));
}

function aggregatePurposes(fixtures) {
  const purposes = new Map();
  for (const fixtureResult of fixtures) {
    let purpose = purposes.get(fixtureResult.purpose);
    if (!purpose) {
      purpose = {
        purpose: fixtureResult.purpose,
        fixtureIds: [],
        fixtureCount: 0,
        measuredFixtureCount: 0,
        missingMeasurementCount: 0,
        legacyFindingCount: 0,
        astStaticFindingCount: 0,
        astReviewRequiredCount: 0,
        astStaticFindingOnlyCount: 0,
        astReviewRequiredOnlyCount: 0,
        astStaticFindingAndReviewRequiredCount: 0,
        astAnalysisIncompleteCount: 0,
        astNoStaticFindingCount: 0,
        legacyBlockedAstNoStaticFindingCount: 0,
        riskExpectedAstNoStaticFindingCount: 0,
        missingMeasurementCount: 0
      };
      purposes.set(fixtureResult.purpose, purpose);
    }
    purpose.fixtureCount += 1;
    purpose.fixtureIds.push(fixtureResult.id);
    if (!fixtureResult.measured) {
      purpose.missingMeasurementCount += 1;
      continue;
    }
    purpose.measuredFixtureCount += 1;
    if (fixtureResult.legacy.outcome === "static_finding") purpose.legacyFindingCount += 1;
    if (["static_finding", "static_finding_and_review_required"].includes(fixtureResult.ast.outcome)) purpose.astStaticFindingCount += 1;
    if (["review_required", "static_finding_and_review_required"].includes(fixtureResult.ast.outcome)) purpose.astReviewRequiredCount += 1;
    if (fixtureResult.ast.outcome === "static_finding") purpose.astStaticFindingOnlyCount += 1;
    if (fixtureResult.ast.outcome === "review_required") purpose.astReviewRequiredOnlyCount += 1;
    if (fixtureResult.ast.outcome === "static_finding_and_review_required") purpose.astStaticFindingAndReviewRequiredCount += 1;
    if (fixtureResult.ast.outcome === "analysis_incomplete") purpose.astAnalysisIncompleteCount += 1;
    if (fixtureResult.ast.outcome === "no_static_finding") purpose.astNoStaticFindingCount += 1;
    if (fixtureResult.legacy.outcome === "static_finding" && fixtureResult.ast.outcome === "no_static_finding") purpose.legacyBlockedAstNoStaticFindingCount += 1;
    if (isRiskExpectedNoStaticFinding(fixtureResult)) purpose.riskExpectedAstNoStaticFindingCount += 1;
  }
  return [...purposes.values()].sort((left, right) => left.purpose.localeCompare(right.purpose));
}

function countTotals(fixtures) {
  const measured = fixtures.filter((item) => item.measured);
  return {
    fixtureCount: fixtures.length,
    measuredFixtureCount: measured.length,
    missingMeasurementCount: fixtures.length - measured.length,
    legacyFindingCount: measured.filter((item) => item.legacy.outcome === "static_finding").length,
    astStaticFindingCount: measured.filter((item) => ["static_finding", "static_finding_and_review_required"].includes(item.ast.outcome)).length,
    astReviewRequiredCount: measured.filter((item) => ["review_required", "static_finding_and_review_required"].includes(item.ast.outcome)).length,
    astStaticFindingOnlyCount: measured.filter((item) => item.ast.outcome === "static_finding").length,
    astReviewRequiredOnlyCount: measured.filter((item) => item.ast.outcome === "review_required").length,
    astStaticFindingAndReviewRequiredCount: measured.filter((item) => item.ast.outcome === "static_finding_and_review_required").length,
    astAnalysisIncompleteCount: measured.filter((item) => item.ast.outcome === "analysis_incomplete").length,
    astNoStaticFindingCount: measured.filter((item) => item.ast.outcome === "no_static_finding").length,
    legacyBlockedAstNoStaticFindingCount: measured.filter((item) => item.legacy.outcome === "static_finding" && item.ast.outcome === "no_static_finding").length,
    riskExpectedAstNoStaticFindingCount: measured.filter(isRiskExpectedNoStaticFinding).length
  };
}

function createPolicyEvidence(fixtures) {
  const benignSyntaxFixtures = fixtures.filter((item) => item.purpose === "benign_syntax" && item.measured);
  return {
    status: "not_decided",
    benignSyntaxFixtureCount: benignSyntaxFixtures.length,
    benignSyntaxLegacyFindingCount: benignSyntaxFixtures.filter((item) => item.legacy.outcome === "static_finding").length,
    benignSyntaxAstNoStaticFindingCount: benignSyntaxFixtures.filter((item) => item.ast.outcome === "no_static_finding").length,
    riskExpectedAstNoStaticFindingFixtureIds: fixtures
      .filter((item) => item.measured && isRiskExpectedNoStaticFinding(item))
      .map((item) => item.id),
    knownLimitationAstNoStaticFindingFixtureIds: fixtures
      .filter((item) => item.measured && item.riskExpected === "known_limitation" && item.ast.outcome === "no_static_finding")
      .map((item) => item.id),
    rationale: policyEvidenceRationale
  };
}

function createInputFingerprint(corpus) {
  const inputs = corpus.map((item) => ({
    id: item.id,
    cohort: item.cohort,
    purpose: item.purpose,
    rationale: item.rationale,
    riskExpected: item.riskExpected,
    relationGroup: item.relationGroup,
    fileName: item.fileName,
    sourceBytes: Buffer.byteLength(item.source, "utf8"),
    sourceSha256: sha256(item.source)
  }));
  return sha256(JSON.stringify(inputs));
}

function classifierSourceFingerprint() {
  const legacyPath = path.resolve(moduleDirectory, "../subagent-bridge/src/memory.js");
  const syntaxPath = path.resolve(moduleDirectory, "../subagent-bridge/src/services/review-source-syntax-classifier.js");
  return sha256(JSON.stringify([
    ["memory.js", sha256(fs.readFileSync(legacyPath))],
    ["review-source-syntax-classifier.js", sha256(fs.readFileSync(syntaxPath))]
  ]));
}

function readEvaluationOptions(options) {
  if (!options || typeof options !== "object") return null;
  try {
    if (Array.isArray(options)) return null;
    const prototype = Object.getPrototypeOf(options);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const keys = Reflect.ownKeys(options);
    const allowed = new Set(["corpus", "legacyClassifier", "astClassifier"]);
    if (keys.some((key) => typeof key !== "string" || !allowed.has(key))) return null;
    const values = Object.create(null);
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(options, key);
      if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, "value")) return null;
      values[key] = descriptor.value;
    }
    return values;
  } catch {
    return null;
  }
}

function createProvenance(options, corpusMode, sourceFingerprintStart, sourceFingerprintEnd) {
  const legacyClassifier = Object.hasOwn(options, "legacyClassifier") ? options.legacyClassifier : classifySecretLikeContent;
  const astClassifier = Object.hasOwn(options, "astClassifier") ? options.astClassifier : classifyJavaScriptOrTypeScriptSource;
  const legacyMode = legacyClassifier === classifySecretLikeContent ? "built_in" : "custom_or_unverified";
  const astMode = astClassifier === classifyJavaScriptOrTypeScriptSource ? "built_in" : "custom_or_unverified";
  const classifierMode = legacyMode === "built_in" && astMode === "built_in"
    ? "built_in"
    : legacyMode === "custom_or_unverified" && astMode === "custom_or_unverified"
      ? "custom_or_unverified"
      : "mixed";
  return {
    corpusMode,
    legacyClassifier: legacyMode,
    astClassifier: astMode,
    classifierMode,
    builtInClassifierComparison: corpusMode === "fixed_corpus" && classifierMode === "built_in" && sourceFingerprintStart === sourceFingerprintEnd,
    referenceClassifierSourceSha256: sourceFingerprintEnd,
    referenceSourceFingerprintStartSha256: sourceFingerprintStart,
    referenceSourceFingerprintEndSha256: sourceFingerprintEnd,
    referenceSourceBindingStable: sourceFingerprintStart === sourceFingerprintEnd,
    referenceFingerprintMeaning: "On-disk reference source binding only; not proof of the loaded function implementation or runtime attestation."
  };
}

export function evaluateSecretClassifierCorpus(options = {}) {
  const resolvedOptions = readEvaluationOptions(options);
  if (!resolvedOptions) return closedFailure("evaluation_options_invalid");
  const hasCustomCorpus = Object.hasOwn(resolvedOptions, "corpus");
  const corpus = hasCustomCorpus ? resolvedOptions.corpus : createSecretPreflightOfflineCorpus();
  const legacyClassifier = Object.hasOwn(resolvedOptions, "legacyClassifier") ? resolvedOptions.legacyClassifier : classifySecretLikeContent;
  const astClassifier = Object.hasOwn(resolvedOptions, "astClassifier") ? resolvedOptions.astClassifier : classifyJavaScriptOrTypeScriptSource;
  let invalidCorpusCode;
  try {
    invalidCorpusCode = validateCorpus(corpus);
  } catch {
    return closedFailure("corpus_fixture_invalid");
  }
  if (invalidCorpusCode) return closedFailure(invalidCorpusCode);
  if (typeof legacyClassifier !== "function" || typeof astClassifier !== "function") return closedFailure("classifier_unavailable");
  let sourceFingerprintStart;
  try {
    sourceFingerprintStart = classifierSourceFingerprint();
  } catch {
    return closedFailure("reference_source_unavailable");
  }
  const fixtureResults = [];
  let measurementFailureCode = null;
  for (const item of corpus) {
    let legacy;
    let ast;
    try {
      legacy = classifyLegacy(legacyClassifier(item.source));
      ast = classifyAst(astClassifier({ fileName: item.fileName, source: item.source }));
    } catch {
      measurementFailureCode = measurementFailureCode || "classifier_execution_failed";
    }
    if (!legacy || !ast) measurementFailureCode = measurementFailureCode || "classifier_result_invalid";
    fixtureResults.push({
      id: item.id,
      cohort: item.cohort,
      purpose: item.purpose,
      rationale: item.rationale,
      riskExpected: item.riskExpected,
      relationGroup: item.relationGroup,
      inputBytes: Buffer.byteLength(item.source, "utf8"),
      inputSha256: sha256(item.source),
      measured: Boolean(legacy && ast),
      legacy: legacy || { outcome: "measurement_missing", signal: "measurement_missing", highEntropyCandidateCount: null },
      ast: ast || { outcome: "measurement_missing", reason: "measurement_missing", findingKinds: [], findingCount: 0 }
    });
  }
  const cohorts = aggregate(fixtureResults);
  const counts = countTotals(fixtureResults);
  let sourceFingerprintEnd;
  try {
    sourceFingerprintEnd = classifierSourceFingerprint();
  } catch {
    return closedFailure("reference_source_unavailable");
  }
  if (sourceFingerprintStart !== sourceFingerprintEnd) measurementFailureCode = measurementFailureCode || "reference_source_changed";
  const report = {
    schemaVersion: 2,
    reportStatus: measurementFailureCode === null ? "complete" : "incomplete",
    corpusId: hasCustomCorpus ? "controlled_custom" : "secret-preflight-synthetic-v1",
    measurementComplete: measurementFailureCode === null,
    measurementFailureCode,
    policyAssessment: "not_decided",
    outcomeCountSemantics: "Exclusive AST outcome classes partition measured fixtures; static-finding and review-required feature totals are secondary and can overlap.",
    assessmentBoundary: "Local synthetic observations do not authorize production policy or source delivery.",
    environment: {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
      corpusSha256: createInputFingerprint(corpus),
      corpusTotalBytes: corpus.reduce((total, item) => total + Buffer.byteLength(item.source, "utf8"), 0),
      largestFixtureBytes: Math.max(...corpus.map((item) => Buffer.byteLength(item.source, "utf8"))),
      hashBoundary: "Synthetic input and classifier source hashes are bindings, not privacy guarantees or runtime attestations.",
      sourceLimitBytes: SYNTAX_AWARE_SOURCE_LIMIT_BYTES,
      nodeLimit: SYNTAX_AWARE_NODE_LIMIT,
      maximumFixtureCount,
      maximumCorpusBytes,
      maximumReportBytes
    },
    provenance: createProvenance(resolvedOptions, hasCustomCorpus ? "controlled_custom" : "fixed_corpus", sourceFingerprintStart, sourceFingerprintEnd),
    counts,
    cohorts,
    purposes: aggregatePurposes(fixtureResults),
    policyEvidence: createPolicyEvidence(fixtureResults),
    decisionChanges: {
      legacyFindingAstNoStaticFindingFixtureIds: fixtureResults
        .filter((item) => item.measured && item.legacy.outcome === "static_finding" && item.ast.outcome === "no_static_finding")
        .map((item) => item.id),
      riskExpectedAstNoStaticFindingFixtureIds: fixtureResults
        .filter((item) => item.measured && isRiskExpectedNoStaticFinding(item))
        .map((item) => item.id),
      ambiguousReviewRequiredFixtureIds: fixtureResults
        .filter((item) => item.measured && ["review_required", "static_finding_and_review_required"].includes(item.ast.outcome))
        .map((item) => item.id),
      analysisIncompleteFixtureIds: fixtureResults
        .filter((item) => item.measured && item.ast.outcome === "analysis_incomplete")
        .map((item) => item.id)
    },
    fixtures: fixtureResults
  };
  return report;
}

class InvalidReportError extends Error {}
class ReportByteLimitError extends Error {}

function failReportValidation() {
  throw new InvalidReportError();
}

function boundedString(maximumLength, pattern = null) {
  return (value) => {
    if (typeof value !== "string" || value.length > maximumLength || (pattern && !pattern.test(value))) failReportValidation();
    return value;
  };
}

function boundedInteger(maximum = 1000000000) {
  return (value) => {
    if (!Number.isSafeInteger(value) || value < 0 || value > maximum) failReportValidation();
    return value;
  };
}

function oneOf(values) {
  const accepted = new Set(values);
  return (value) => {
    if (!accepted.has(value)) failReportValidation();
    return value;
  };
}

function nullable(validator) {
  return (value) => value === null ? null : validator(value);
}

function reportArray(itemValidator, maximumLength) {
  return (value) => {
    if (!Array.isArray(value)) failReportValidation();
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    if (!lengthDescriptor || !Number.isSafeInteger(lengthDescriptor.value) || lengthDescriptor.value < 0 || lengthDescriptor.value > maximumLength) failReportValidation();
    const keys = Reflect.ownKeys(value);
    if (keys.length !== lengthDescriptor.value + 1 || keys.some((key) => typeof key !== "string" || (key !== "length" && !/^(0|[1-9][0-9]*)$/.test(key)))) failReportValidation();
    const projected = [];
    for (let index = 0; index < lengthDescriptor.value; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, "value")) failReportValidation();
      projected.push(itemValidator(descriptor.value));
    }
    return projected;
  };
}

function reportRecord(fields) {
  const expectedKeys = Object.keys(fields);
  const expected = new Set(expectedKeys);
  return (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) failReportValidation();
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) failReportValidation();
    const keys = Reflect.ownKeys(value);
    if (keys.length !== expectedKeys.length || keys.some((key) => typeof key !== "string" || !expected.has(key))) failReportValidation();
    const projected = Object.create(null);
    for (const key of expectedKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, "value")) failReportValidation();
      projected[key] = fields[key](descriptor.value);
    }
    return projected;
  };
}

const reportFailureCodes = [
  "evaluation_options_invalid", "corpus_fixture_limit", "corpus_fixture_invalid", "duplicate_fixture_id",
  "fixture_source_limit", "corpus_byte_limit", "classifier_unavailable", "classifier_execution_failed",
  "classifier_result_invalid", "reference_source_unavailable", "reference_source_changed", "report_invalid",
  "report_byte_limit", "report_serialization_failed", "evaluation_failed", "unexpected_cli_arguments"
];
const failureCodeValidator = oneOf(reportFailureCodes);
const identifierValidator = boundedString(64, /^[a-z0-9][a-z0-9-]{0,63}$/);
const hashValidator = boundedString(64, /^[a-f0-9]{64}$/);
const integerValidator = boundedInteger();
const purposeValidator = oneOf([...allowedPurposes]);
const riskValidator = oneOf([...allowedRiskExpectations]);
const astOutcomeValidator = oneOf([
  "static_finding", "review_required", "static_finding_and_review_required", "analysis_incomplete", "no_static_finding", "measurement_missing"
]);
const legacyOutcomeValidator = oneOf(["static_finding", "no_static_finding", "measurement_missing"]);
const findingKindValidator = oneOf([...allowedFindingKinds]);
const legacyRecordValidator = reportRecord({
  outcome: legacyOutcomeValidator,
  signal: oneOf(["none", "high_entropy", "known_signature", "mixed", "measurement_missing"]),
  highEntropyCandidateCount: nullable(integerValidator)
});
const astRecordValidator = reportRecord({
  outcome: astOutcomeValidator,
  reason: nullable(oneOf([...allowedBlockedReasons, "measurement_missing"])),
  findingKinds: reportArray(findingKindValidator, allowedFindingKinds.size),
  findingCount: integerValidator
});
const fixtureRecordValidator = reportRecord({
  id: identifierValidator,
  cohort: boundedString(48, /^[a-z0-9][a-z0-9_]{0,47}$/),
  purpose: purposeValidator,
  rationale: boundedString(256),
  riskExpected: riskValidator,
  relationGroup: nullable(boundedString(48, /^[a-z0-9][a-z0-9-]{0,47}$/)),
  inputBytes: boundedInteger(maximumCorpusBytes),
  inputSha256: hashValidator,
  measured: (value) => {
    if (typeof value !== "boolean") failReportValidation();
    return value;
  },
  legacy: legacyRecordValidator,
  ast: astRecordValidator
});

const metricKeys = [
  "fixtureCount", "measuredFixtureCount", "missingMeasurementCount", "legacyFindingCount", "astStaticFindingCount",
  "astReviewRequiredCount", "astStaticFindingOnlyCount", "astReviewRequiredOnlyCount",
  "astStaticFindingAndReviewRequiredCount", "astAnalysisIncompleteCount", "astNoStaticFindingCount",
  "legacyBlockedAstNoStaticFindingCount", "riskExpectedAstNoStaticFindingCount"
];
const metricsFields = Object.fromEntries(metricKeys.map((key) => [key, integerValidator]));
const fixtureIdsValidator = reportArray(identifierValidator, maximumFixtureCount);
const cohortRecordValidator = reportRecord({
  cohort: boundedString(48, /^[a-z0-9][a-z0-9_]{0,47}$/),
  fixtureIds: fixtureIdsValidator,
  ...metricsFields
});
const purposeRecordValidator = reportRecord({
  purpose: purposeValidator,
  fixtureIds: fixtureIdsValidator,
  ...metricsFields
});
const countsRecordValidator = reportRecord(metricsFields);
const policyEvidenceValidator = reportRecord({
  status: oneOf(["not_decided"]),
  benignSyntaxFixtureCount: integerValidator,
  benignSyntaxLegacyFindingCount: integerValidator,
  benignSyntaxAstNoStaticFindingCount: integerValidator,
  riskExpectedAstNoStaticFindingFixtureIds: fixtureIdsValidator,
  knownLimitationAstNoStaticFindingFixtureIds: fixtureIdsValidator,
  rationale: (value) => value === policyEvidenceRationale ? value : failReportValidation()
});
const decisionChangesValidator = reportRecord({
  legacyFindingAstNoStaticFindingFixtureIds: fixtureIdsValidator,
  riskExpectedAstNoStaticFindingFixtureIds: fixtureIdsValidator,
  ambiguousReviewRequiredFixtureIds: fixtureIdsValidator,
  analysisIncompleteFixtureIds: fixtureIdsValidator
});
const environmentValidator = reportRecord({
  node: boundedString(32, /^v\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]{1,12})?$/),
  platform: oneOf(["aix", "android", "darwin", "freebsd", "haiku", "linux", "openbsd", "sunos", "win32"]),
  architecture: oneOf(["arm", "arm64", "ia32", "loong64", "mips", "mipsel", "ppc", "ppc64", "riscv64", "s390", "s390x", "x64"]),
  corpusSha256: hashValidator,
  corpusTotalBytes: boundedInteger(maximumCorpusBytes),
  largestFixtureBytes: boundedInteger(SYNTAX_AWARE_SOURCE_LIMIT_BYTES + 4096),
  hashBoundary: boundedString(256),
  sourceLimitBytes: boundedInteger(SYNTAX_AWARE_SOURCE_LIMIT_BYTES),
  nodeLimit: boundedInteger(SYNTAX_AWARE_NODE_LIMIT),
  maximumFixtureCount: boundedInteger(maximumFixtureCount),
  maximumCorpusBytes: boundedInteger(maximumCorpusBytes),
  maximumReportBytes: boundedInteger(maximumReportBytes)
});
const provenanceValidator = reportRecord({
  corpusMode: oneOf(["fixed_corpus", "controlled_custom"]),
  legacyClassifier: oneOf(["built_in", "custom_or_unverified"]),
  astClassifier: oneOf(["built_in", "custom_or_unverified"]),
  classifierMode: oneOf(["built_in", "custom_or_unverified", "mixed"]),
  builtInClassifierComparison: (value) => {
    if (typeof value !== "boolean") failReportValidation();
    return value;
  },
  referenceClassifierSourceSha256: hashValidator,
  referenceSourceFingerprintStartSha256: hashValidator,
  referenceSourceFingerprintEndSha256: hashValidator,
  referenceSourceBindingStable: (value) => {
    if (typeof value !== "boolean") failReportValidation();
    return value;
  },
  referenceFingerprintMeaning: boundedString(256)
});
const successfulReportValidator = reportRecord({
  schemaVersion: (value) => value === 2 ? value : failReportValidation(),
  reportStatus: oneOf(["complete", "incomplete"]),
  corpusId: oneOf(["secret-preflight-synthetic-v1", "controlled_custom"]),
  measurementComplete: (value) => {
    if (typeof value !== "boolean") failReportValidation();
    return value;
  },
  measurementFailureCode: nullable(failureCodeValidator),
  policyAssessment: oneOf(["not_decided"]),
  outcomeCountSemantics: boundedString(256),
  assessmentBoundary: boundedString(256),
  environment: environmentValidator,
  provenance: provenanceValidator,
  counts: countsRecordValidator,
  cohorts: reportArray(cohortRecordValidator, maximumFixtureCount),
  purposes: reportArray(purposeRecordValidator, allowedPurposes.size),
  policyEvidence: policyEvidenceValidator,
  decisionChanges: decisionChangesValidator,
  fixtures: reportArray(fixtureRecordValidator, maximumFixtureCount)
});
const closedFailureValidator = reportRecord({
  schemaVersion: (value) => value === 2 ? value : failReportValidation(),
  reportStatus: (value) => value === "failed" ? value : failReportValidation(),
  measurementComplete: (value) => value === false ? value : failReportValidation(),
  measurementFailureCode: failureCodeValidator,
  policyAssessment: (value) => value === "not_decided" ? value : failReportValidation()
});

function expectedMetrics(fixtures) {
  const measured = fixtures.filter((fixture) => fixture.measured);
  return {
    fixtureCount: fixtures.length,
    measuredFixtureCount: measured.length,
    missingMeasurementCount: fixtures.length - measured.length,
    legacyFindingCount: measured.filter((fixture) => fixture.legacy.outcome === "static_finding").length,
    astStaticFindingCount: measured.filter((fixture) => fixture.ast.outcome === "static_finding" || fixture.ast.outcome === "static_finding_and_review_required").length,
    astReviewRequiredCount: measured.filter((fixture) => fixture.ast.outcome === "review_required" || fixture.ast.outcome === "static_finding_and_review_required").length,
    astStaticFindingOnlyCount: measured.filter((fixture) => fixture.ast.outcome === "static_finding").length,
    astReviewRequiredOnlyCount: measured.filter((fixture) => fixture.ast.outcome === "review_required").length,
    astStaticFindingAndReviewRequiredCount: measured.filter((fixture) => fixture.ast.outcome === "static_finding_and_review_required").length,
    astAnalysisIncompleteCount: measured.filter((fixture) => fixture.ast.outcome === "analysis_incomplete").length,
    astNoStaticFindingCount: measured.filter((fixture) => fixture.ast.outcome === "no_static_finding").length,
    legacyBlockedAstNoStaticFindingCount: measured.filter((fixture) => fixture.legacy.outcome === "static_finding" && fixture.ast.outcome === "no_static_finding").length,
    riskExpectedAstNoStaticFindingCount: measured.filter(isRiskExpectedNoStaticFinding).length
  };
}

function equalJson(left, right) {
  if (left === right) return true;
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  if (Array.isArray(left)) {
    if (left.length !== right.length) return false;
    for (let index = 0; index < left.length; index += 1) if (!equalJson(left[index], right[index])) return false;
    return true;
  }
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => Object.hasOwn(right, key) && equalJson(left[key], right[key]));
}

function assertReportInvariants(report) {
  if (report.corpusId !== (report.provenance.corpusMode === "fixed_corpus" ? "secret-preflight-synthetic-v1" : "controlled_custom")) failReportValidation();
  const fixtureIds = report.fixtures.map((fixture) => fixture.id);
  if (new Set(fixtureIds).size !== fixtureIds.length) failReportValidation();
  for (const fixture of report.fixtures) {
    if (fixture.rationale !== purposeRationales[fixture.purpose]) failReportValidation();
    if (fixture.measured === (fixture.legacy.outcome === "measurement_missing" || fixture.ast.outcome === "measurement_missing")) failReportValidation();
    if (!fixture.measured && fixture.legacy.outcome !== "measurement_missing" && fixture.ast.outcome !== "measurement_missing") failReportValidation();
    if (fixture.measured && (fixture.legacy.outcome === "measurement_missing" || fixture.ast.outcome === "measurement_missing")) failReportValidation();
    if (fixture.legacy.outcome !== "measurement_missing") {
      const hasLegacyFinding = fixture.legacy.signal !== "none";
      if ((fixture.legacy.outcome === "static_finding") !== hasLegacyFinding) failReportValidation();
      if (["none", "known_signature"].includes(fixture.legacy.signal) && fixture.legacy.highEntropyCandidateCount !== 0) failReportValidation();
      if (["high_entropy", "mixed"].includes(fixture.legacy.signal) && fixture.legacy.highEntropyCandidateCount < 1) failReportValidation();
    }
    if (fixture.ast.outcome === "measurement_missing") {
      if (fixture.ast.reason !== "measurement_missing" || fixture.ast.findingCount !== 0 || fixture.ast.findingKinds.length !== 0) failReportValidation();
    } else if (fixture.ast.outcome === "analysis_incomplete") {
      if (!allowedBlockedReasons.has(fixture.ast.reason) || fixture.ast.findingCount !== 0 || fixture.ast.findingKinds.length !== 0) failReportValidation();
    } else {
      if (fixture.ast.reason !== null || fixture.ast.findingKinds.some((kind, index, kinds) => kinds.indexOf(kind) !== index)) failReportValidation();
      if (!equalJson(fixture.ast.findingKinds, [...fixture.ast.findingKinds].sort())) failReportValidation();
      if (fixture.ast.findingCount < fixture.ast.findingKinds.length || fixture.ast.findingCount > maximumFindingCount) failReportValidation();
      const hasStatic = fixture.ast.findingKinds.some((kind) => kind === "known_signature" || kind === "high_entropy");
      const hasReview = fixture.ast.findingKinds.some((kind) => kind === "sensitive_dynamic_value" || kind === "computed_property_unresolved");
      const expectedOutcome = hasStatic && hasReview ? "static_finding_and_review_required" : hasStatic ? "static_finding" : hasReview ? "review_required" : "no_static_finding";
      if (fixture.ast.outcome !== expectedOutcome) failReportValidation();
    }
  }
  const totals = expectedMetrics(report.fixtures);
  if (!equalJson(report.counts, totals)) failReportValidation();
  if (report.environment.corpusTotalBytes !== report.fixtures.reduce((total, fixture) => total + fixture.inputBytes, 0)) failReportValidation();
  if (report.environment.largestFixtureBytes !== Math.max(...report.fixtures.map((fixture) => fixture.inputBytes))) failReportValidation();
  if (report.environment.maximumFixtureCount !== maximumFixtureCount || report.environment.maximumCorpusBytes !== maximumCorpusBytes
    || report.environment.maximumReportBytes !== maximumReportBytes || report.environment.sourceLimitBytes !== SYNTAX_AWARE_SOURCE_LIMIT_BYTES
    || report.environment.nodeLimit !== SYNTAX_AWARE_NODE_LIMIT) failReportValidation();
  const measured = report.fixtures.filter((fixture) => fixture.measured);
  const exclusiveOutcomeTotal = totals.astStaticFindingOnlyCount + totals.astReviewRequiredOnlyCount
    + totals.astStaticFindingAndReviewRequiredCount + totals.astAnalysisIncompleteCount + totals.astNoStaticFindingCount;
  if (exclusiveOutcomeTotal !== totals.measuredFixtureCount) failReportValidation();
  if (totals.astStaticFindingCount !== totals.astStaticFindingOnlyCount + totals.astStaticFindingAndReviewRequiredCount) failReportValidation();
  if (totals.astReviewRequiredCount !== totals.astReviewRequiredOnlyCount + totals.astStaticFindingAndReviewRequiredCount) failReportValidation();
  for (const [groupKey, groups, labelKey] of [["cohort", report.cohorts, "cohort"], ["purpose", report.purposes, "purpose"]]) {
    const names = [...new Set(report.fixtures.map((fixture) => fixture[groupKey]))].sort((left, right) => left.localeCompare(right));
    if (groups.length !== names.length || !equalJson(groups.map((group) => group[labelKey]), names)) failReportValidation();
    for (const group of groups) {
      const members = report.fixtures.filter((fixture) => fixture[groupKey] === group[labelKey]);
      if (!equalJson(group.fixtureIds, members.map((fixture) => fixture.id))) failReportValidation();
      const metrics = expectedMetrics(members);
      for (const key of metricKeys) if (group[key] !== metrics[key]) failReportValidation();
      const groupOutcomeTotal = group.astStaticFindingOnlyCount + group.astReviewRequiredOnlyCount
        + group.astStaticFindingAndReviewRequiredCount + group.astAnalysisIncompleteCount + group.astNoStaticFindingCount;
      if (groupOutcomeTotal !== group.measuredFixtureCount) failReportValidation();
    }
  }
  const expectedDecisionChanges = {
    legacyFindingAstNoStaticFindingFixtureIds: measured.filter((fixture) => fixture.legacy.outcome === "static_finding" && fixture.ast.outcome === "no_static_finding").map((fixture) => fixture.id),
    riskExpectedAstNoStaticFindingFixtureIds: measured.filter(isRiskExpectedNoStaticFinding).map((fixture) => fixture.id),
    ambiguousReviewRequiredFixtureIds: measured.filter((fixture) => fixture.ast.outcome === "review_required" || fixture.ast.outcome === "static_finding_and_review_required").map((fixture) => fixture.id),
    analysisIncompleteFixtureIds: measured.filter((fixture) => fixture.ast.outcome === "analysis_incomplete").map((fixture) => fixture.id)
  };
  if (!equalJson(report.decisionChanges, expectedDecisionChanges)) failReportValidation();
  const benign = measured.filter((fixture) => fixture.purpose === "benign_syntax");
  const expectedPolicyEvidence = {
    status: "not_decided",
    benignSyntaxFixtureCount: benign.length,
    benignSyntaxLegacyFindingCount: benign.filter((fixture) => fixture.legacy.outcome === "static_finding").length,
    benignSyntaxAstNoStaticFindingCount: benign.filter((fixture) => fixture.ast.outcome === "no_static_finding").length,
    riskExpectedAstNoStaticFindingFixtureIds: expectedDecisionChanges.riskExpectedAstNoStaticFindingFixtureIds,
    knownLimitationAstNoStaticFindingFixtureIds: measured.filter((fixture) => fixture.riskExpected === "known_limitation" && fixture.ast.outcome === "no_static_finding").map((fixture) => fixture.id),
    rationale: report.policyEvidence.rationale
  };
  if (!equalJson(report.policyEvidence, expectedPolicyEvidence)) failReportValidation();
  if (report.measurementComplete !== (report.reportStatus === "complete")) failReportValidation();
  if (report.measurementComplete !== (report.measurementFailureCode === null)) failReportValidation();
  if (report.measurementComplete && totals.missingMeasurementCount !== 0) failReportValidation();
  if (!report.measurementComplete && report.measurementFailureCode !== "reference_source_changed" && totals.missingMeasurementCount === 0) failReportValidation();
  const expectedClassifierMode = report.provenance.legacyClassifier === "built_in" && report.provenance.astClassifier === "built_in"
    ? "built_in"
    : report.provenance.legacyClassifier === "custom_or_unverified" && report.provenance.astClassifier === "custom_or_unverified"
      ? "custom_or_unverified"
      : "mixed";
  if (report.provenance.classifierMode !== expectedClassifierMode) failReportValidation();
  if (report.provenance.referenceClassifierSourceSha256 !== report.provenance.referenceSourceFingerprintEndSha256) failReportValidation();
  if (report.provenance.referenceSourceBindingStable !== (report.provenance.referenceSourceFingerprintStartSha256 === report.provenance.referenceSourceFingerprintEndSha256)) failReportValidation();
  const expectedBuiltInComparison = report.provenance.corpusMode === "fixed_corpus" && expectedClassifierMode === "built_in" && report.provenance.referenceSourceBindingStable;
  if (report.provenance.builtInClassifierComparison !== expectedBuiltInComparison) failReportValidation();
  if (report.provenance.referenceFingerprintMeaning !== "On-disk reference source binding only; not proof of the loaded function implementation or runtime attestation.") failReportValidation();
  if (report.outcomeCountSemantics !== "Exclusive AST outcome classes partition measured fixtures; static-finding and review-required feature totals are secondary and can overlap.") failReportValidation();
  if (report.assessmentBoundary !== "Local synthetic observations do not authorize production policy or source delivery.") failReportValidation();
  if (report.environment.hashBoundary !== "Synthetic input and classifier source hashes are bindings, not privacy guarantees or runtime attestations.") failReportValidation();
}

function accountEncodedText(value, state) {
  const byteLength = Buffer.byteLength(value, "utf8");
  if (state.bytes + byteLength > maximumReportBytes) throw new ReportByteLimitError();
  state.bytes += byteLength;
  return value;
}

function encodeProjectedJson(value, depth = 0, state = { nodes: 0, bytes: 0, ancestors: new Set() }) {
  state.nodes += 1;
  if (state.nodes > maximumReportNodes || depth > maximumReportDepth) failReportValidation();
  if (value === null || typeof value === "boolean" || typeof value === "string") return accountEncodedText(JSON.stringify(value), state);
  if (typeof value === "number" && Number.isSafeInteger(value)) return accountEncodedText(String(value), state);
  if (Array.isArray(value)) {
    if (state.ancestors.has(value)) failReportValidation();
    state.ancestors.add(value);
    const encoded = [accountEncodedText("[", state)];
    for (let index = 0; index < value.length; index += 1) {
      if (index > 0) encoded.push(accountEncodedText(",", state));
      encoded.push(encodeProjectedJson(value[index], depth + 1, state));
    }
    encoded.push(accountEncodedText("]", state));
    state.ancestors.delete(value);
    return encoded.join("");
  }
  if (!value || typeof value !== "object") failReportValidation();
  if (state.ancestors.has(value)) failReportValidation();
  state.ancestors.add(value);
  const encoded = [accountEncodedText("{", state)];
  let propertyIndex = 0;
  for (const key of Object.keys(value)) {
    if (propertyIndex > 0) encoded.push(accountEncodedText(",", state));
    encoded.push(accountEncodedText(JSON.stringify(key), state));
    encoded.push(accountEncodedText(":", state));
    encoded.push(encodeProjectedJson(value[key], depth + 1, state));
    propertyIndex += 1;
  }
  encoded.push(accountEncodedText("}", state));
  state.ancestors.delete(value);
  return encoded.join("");
}

function serializeFailure(code) {
  return JSON.stringify(closedFailure(code));
}

export function serializeSecretClassifierEvaluation(report) {
  try {
    const statusDescriptor = report && typeof report === "object" ? Object.getOwnPropertyDescriptor(report, "reportStatus") : null;
    const validator = statusDescriptor && Object.hasOwn(statusDescriptor, "value") && statusDescriptor.value === "failed"
      ? closedFailureValidator
      : successfulReportValidator;
    const projected = validator(report);
    if (validator === successfulReportValidator) assertReportInvariants(projected);
    return encodeProjectedJson(projected);
  } catch (error) {
    if (error instanceof ReportByteLimitError) return serializeFailure("report_byte_limit");
    return serializeFailure(error instanceof InvalidReportError ? "report_invalid" : "report_serialization_failed");
  }
}

export function runSecretClassifierEvaluation() {
  try {
    return evaluateSecretClassifierCorpus();
  } catch {
    return closedFailure("evaluation_failed");
  }
}
