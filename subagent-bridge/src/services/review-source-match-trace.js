import crypto from "node:crypto";
import { createRequire } from "node:module";
import { traceSecretLikeContent } from "../memory.js";
import { classifyJavaScriptOrTypeScriptSource, SYNTAX_AWARE_NODE_LIMIT, SYNTAX_AWARE_SOURCE_LIMIT_BYTES } from "./review-source-syntax-classifier.js";

const require = createRequire(import.meta.url);
const sourceKinds = new Map([
  [".js", "JS"], [".jsx", "JSX"], [".mjs", "JS"], [".cjs", "JS"],
  [".ts", "TS"], [".tsx", "TSX"], [".mts", "TS"], [".cts", "TS"]
]);

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function createLineStarts(source) {
  const starts = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "\r") {
      if (source[index + 1] === "\n") index += 1;
      starts.push(index + 1);
    } else if (source[index] === "\n" || source[index] === "\u2028" || source[index] === "\u2029") {
      starts.push(index + 1);
    }
  }
  return starts;
}

function locateOffset(lineStarts, offset) {
  let low = 0;
  let high = lineStarts.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (lineStarts[middle] <= offset) low = middle + 1;
    else high = middle;
  }
  const lineIndex = Math.max(0, low - 1);
  return { line: lineIndex + 1, column: offset - lineStarts[lineIndex] + 1 };
}

function createByteOffsetMap(source) {
  const offsets = new Uint32Array(source.length + 1);
  let byteOffset = 0;
  for (let index = 0; index < source.length; index += 1) {
    offsets[index] = byteOffset;
    const codePoint = source.codePointAt(index);
    const character = String.fromCodePoint(codePoint);
    byteOffset += Buffer.byteLength(character, "utf8");
    if (character.length === 2) {
      offsets[index + 1] = byteOffset - Buffer.byteLength(character, "utf8") + 3;
      index += 1;
    }
  }
  offsets[source.length] = byteOffset;
  return offsets;
}

function collectCommentRanges(sourceFile, source, parser) {
  const scanner = parser.createScanner(parser.ScriptTarget.Latest, false, sourceFile.languageVariant, source);
  const ranges = [];
  let token = scanner.scan();
  while (token !== parser.SyntaxKind.EndOfFileToken) {
    if ([parser.SyntaxKind.SingleLineCommentTrivia, parser.SyntaxKind.MultiLineCommentTrivia, parser.SyntaxKind.ShebangTrivia].includes(token)) {
      ranges.push({ start: scanner.getTokenPos(), end: scanner.getTextPos() });
    }
    token = scanner.scan();
  }
  const lastStatement = sourceFile.statements[sourceFile.statements.length - 1];
  const trailingComments = parser.getTrailingCommentRanges(source, lastStatement?.end ?? 0) ?? [];
  for (const range of trailingComments) ranges.push({ start: range.pos, end: range.end });
  return ranges;
}

function nodeContext(node, parser) {
  if (parser.isIdentifier(node)) return "identifier";
  if (parser.isPrivateIdentifier(node)) return "private_identifier";
  if (node.kind === parser.SyntaxKind.NoSubstitutionTemplateLiteral
    || [parser.SyntaxKind.TemplateHead, parser.SyntaxKind.TemplateMiddle, parser.SyntaxKind.TemplateTail].includes(node.kind)) return "template";
  if (parser.isStringLiteralLike(node)) return "string";
  if (parser.isRegularExpressionLiteral(node)) return "regex";
  return "other_syntax";
}

function nodeKindName(node, parser) {
  return node.kind === parser.SyntaxKind.NoSubstitutionTemplateLiteral
    ? "NoSubstitutionTemplateLiteral"
    : parser.SyntaxKind[node.kind];
}

function collectAstNodes(sourceFile, parser) {
  const nodes = [];
  const pending = [sourceFile];
  let count = 0;
  while (pending.length > 0) {
    const node = pending.pop();
    count += 1;
    if (count > SYNTAX_AWARE_NODE_LIMIT) return { complete: false, reason: "node_limit_exceeded", nodes: [] };
    const start = node.getStart(sourceFile, false);
    const end = node.getEnd();
    nodes.push({ node, start, end, width: end - start });
    parser.forEachChild(node, (child) => {
      pending.push(child);
    });
  }
  return { complete: true, nodes };
}

function findSmallestNode(nodes, start, end) {
  let smallest = null;
  for (const candidate of nodes) {
    if (candidate.start <= start && candidate.end >= end && (!smallest || candidate.width < smallest.width)) smallest = candidate;
  }
  return smallest;
}

function findContainingRange(ranges, start, end) {
  return ranges.find((range) => range.start <= start && range.end >= end) || null;
}

function createRepeatedCandidateGroups(source, occurrences) {
  const values = new Map();
  for (const occurrence of occurrences) {
    const value = source.slice(occurrence.charStart, occurrence.charEnd);
    const indexes = values.get(value) || [];
    indexes.push(occurrence);
    values.set(value, indexes);
  }
  let groupIndex = 0;
  for (const indexes of values.values()) {
    if (indexes.length < 2) continue;
    groupIndex += 1;
    for (const occurrence of indexes) occurrence.repeatGroupId = `repeat-${groupIndex}`;
  }
}

function mapOccurrences({ relativePath, source, sourceSha256, legacyClassification, syntaxClassification }) {
  const secretTrace = traceSecretLikeContent(source);
  const lineStarts = createLineStarts(source);
  const byteOffsets = createByteOffsetMap(source);
  const base = {
    path: relativePath,
    sourceSha256,
    sourceSizeBytes: Buffer.byteLength(source, "utf8"),
    productionAggregate: legacyClassification,
    traceAggregate: secretTrace.aggregate,
    aggregateEquivalent: JSON.stringify(legacyClassification) === JSON.stringify(secretTrace.aggregate),
    occurrenceCount: secretTrace.occurrences.length,
    complete: secretTrace.complete,
    reason: secretTrace.complete ? null : "occurrence_limit_exceeded",
    occurrences: []
  };
  if (!secretTrace.complete) return base;
  const extension = relativePath.slice(relativePath.lastIndexOf(".")).toLocaleLowerCase("en-US");
  const scriptKindName = sourceKinds.get(extension);
  if (scriptKindName === undefined) {
    base.complete = false;
    base.reason = "unsupported_language";
  }
  let parser;
  try {
    parser = require("typescript");
  } catch {
    base.complete = false;
    base.reason = "parser_unavailable";
  }
  if (!parser || scriptKindName === undefined || Buffer.byteLength(source, "utf8") > SYNTAX_AWARE_SOURCE_LIMIT_BYTES) {
    if (base.complete && Buffer.byteLength(source, "utf8") > SYNTAX_AWARE_SOURCE_LIMIT_BYTES) {
      base.complete = false;
      base.reason = "source_too_large";
    }
    base.occurrences = secretTrace.occurrences.map((occurrence) => createOccurrenceMetadata(occurrence, source, sourceSha256, lineStarts, byteOffsets, null, null, null, []));
    return base;
  }
  const sourceFile = parser.createSourceFile(relativePath, source, parser.ScriptTarget.Latest, true, parser.ScriptKind[scriptKindName]);
  if (sourceFile.parseDiagnostics.length > 0 || source.includes("\u0000") || Buffer.from(source, "utf8").toString("utf8") !== source) {
    base.complete = false;
    base.reason = sourceFile.parseDiagnostics.length > 0 ? "parse_error" : "invalid_source_text";
    base.occurrences = secretTrace.occurrences.map((occurrence) => createOccurrenceMetadata(occurrence, source, sourceSha256, lineStarts, byteOffsets, null, null, null, []));
    return base;
  }
  const ast = collectAstNodes(sourceFile, parser);
  if (!ast.complete) {
    base.complete = false;
    base.reason = ast.reason;
    base.occurrences = secretTrace.occurrences.map((occurrence) => createOccurrenceMetadata(occurrence, source, sourceSha256, lineStarts, byteOffsets, null, null, null, []));
    return base;
  }
  const comments = collectCommentRanges(sourceFile, source, parser);
  const sensitiveRanges = syntaxClassification.status === "complete"
    ? syntaxClassification.findings.filter((finding) => finding.kind === "sensitive_dynamic_value").map((finding) => ({ start: finding.startOffset, end: finding.endOffset }))
    : [];
  base.occurrences = secretTrace.occurrences.map((occurrence) => createOccurrenceMetadata(occurrence, source, sourceSha256, lineStarts, byteOffsets, ast.nodes, comments, sourceFile, sensitiveRanges, parser));
  return base;
}

function createOccurrenceMetadata(occurrence, source, sourceSha256, lineStarts, byteOffsets, nodes, comments, sourceFile, sensitiveRanges, parser) {
  const location = locateOffset(lineStarts, occurrence.start);
  const smallest = nodes ? findSmallestNode(nodes, occurrence.start, occurrence.end) : null;
  const comment = comments ? findContainingRange(comments, occurrence.start, occurrence.end) : null;
  const sensitive = sensitiveRanges ? findContainingRange(sensitiveRanges, occurrence.start, occurrence.end) : null;
  const contextClass = sensitive
    ? "dynamic_sensitive_expression"
    : comment
      ? "comment"
      : smallest && parser
        ? nodeContext(smallest.node, parser)
        : "unknown";
  const metadata = {
    ...location,
    charStart: occurrence.start,
    charEnd: occurrence.end,
    byteStart: byteOffsets[occurrence.start],
    byteEnd: byteOffsets[occurrence.end],
    matcherId: occurrence.matcherId,
    signal: occurrence.signal,
    characterLength: occurrence.length,
    byteLength: byteOffsets[occurrence.end] - byteOffsets[occurrence.start],
    entropy: occurrence.entropy,
    nodeKind: smallest && parser ? nodeKindName(smallest.node, parser) : null,
    contextClass,
    fingerprint: sha256(`${sourceSha256}:${occurrence.start}:${occurrence.end}:${occurrence.matcherId}`)
  };
  return metadata;
}

export function createRedactedReviewSourceMatchTrace({ relativePath, source, sourceSha256, legacyClassification, syntaxClassification }) {
  const base = mapOccurrences({ relativePath, source, sourceSha256, legacyClassification, syntaxClassification });
  createRepeatedCandidateGroups(source, base.occurrences);
  return base;
}
