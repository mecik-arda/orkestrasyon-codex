import { createRequire } from "node:module";
import { classifySecretLikeContent } from "../memory.js";

export const SYNTAX_AWARE_SOURCE_LIMIT_BYTES = 256 * 1024;
export const SYNTAX_AWARE_NODE_LIMIT = 100000;

let ts;

const sourceKinds = new Map([
  [".js", "JS"],
  [".jsx", "JSX"],
  [".mjs", "JS"],
  [".cjs", "JS"],
  [".ts", "TS"],
  [".tsx", "TSX"],
  [".mts", "TS"],
  [".cts", "TS"]
]);

const sensitiveNamePattern = /^(?:api[_-]?key|token|password|secret|client_secret|private_key)$/i;

function blockedResult(reason) {
  return {
    status: "blocked",
    decision: "review_required",
    reason,
    findings: []
  };
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

function sourceLocation(lineStarts, offset) {
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

function addFinding(findingsByKey, lineStarts, kind, node, sourceFile) {
  const start = Math.max(0, node.getStart(sourceFile, false));
  const end = Math.max(start, node.getEnd());
  const key = `${kind}:${start}:${end}`;
  if (findingsByKey.has(key)) return;
  findingsByKey.set(key, { kind, ...sourceLocation(lineStarts, start), startOffset: start, endOffset: end });
}

function addClassificationFindings(findingsByKey, lineStarts, classification, node, sourceFile) {
  if (classification.signal === "known_signature" || classification.signal === "mixed") {
    addFinding(findingsByKey, lineStarts, "known_signature", node, sourceFile);
  }
  if (classification.signal === "high_entropy" || classification.signal === "mixed") {
    addFinding(findingsByKey, lineStarts, "high_entropy", node, sourceFile);
  }
}

function classifyTextValue(findingsByKey, lineStarts, value, node, sourceFile) {
  addClassificationFindings(findingsByKey, lineStarts, classifySecretLikeContent(value), node, sourceFile);
}

function resolveStaticString(expression, sourceFile) {
  if (ts.isStringLiteralLike(expression)) return expression.text;
  if (ts.isParenthesizedExpression(expression)) return resolveStaticString(expression.expression, sourceFile);
  if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = resolveStaticString(expression.left, sourceFile);
    const right = resolveStaticString(expression.right, sourceFile);
    return left === null || right === null ? null : left + right;
  }
  if (ts.isTemplateExpression(expression)) {
    let resolved = expression.head.text;
    for (const span of expression.templateSpans) {
      const expressionValue = resolveStaticString(span.expression, sourceFile);
      if (expressionValue === null) return null;
      resolved += expressionValue + span.literal.text;
    }
    return resolved;
  }
  return null;
}

function propertyNameText(name, sourceFile) {
  if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name)) return name.text;
  if (ts.isStringLiteralLike(name)) return name.text;
  if (ts.isComputedPropertyName(name)) return resolveStaticString(name.expression, sourceFile);
  return null;
}

function classifySensitiveStaticValue(findingsByKey, lineStarts, name, value, node, sourceFile) {
  if (!sensitiveNamePattern.test(name)) return;
  const staticValue = resolveStaticString(value, sourceFile);
  if (staticValue === null) {
    addFinding(findingsByKey, lineStarts, "sensitive_dynamic_value", value, sourceFile);
    return;
  }
  addClassificationFindings(
    findingsByKey,
    lineStarts,
    classifySecretLikeContent(`${name}=${JSON.stringify(staticValue)}`),
    node,
    sourceFile
  );
}

function addSensitiveDestructuringFindings(findingsByKey, lineStarts, pattern, sourceFile) {
  const pendingNodes = [pattern];
  while (pendingNodes.length > 0) {
    const node = pendingNodes.pop();
    if (ts.isShorthandPropertyAssignment(node)) {
      if (sensitiveNamePattern.test(node.name.text)) {
        addFinding(findingsByKey, lineStarts, "sensitive_dynamic_value", node, sourceFile);
      }
    } else if (ts.isPropertyAssignment(node)) {
      const name = propertyNameText(node.name, sourceFile);
      if (name === null && ts.isComputedPropertyName(node.name)) {
        addFinding(findingsByKey, lineStarts, "computed_property_unresolved", node.name, sourceFile);
      } else if (name !== null && sensitiveNamePattern.test(name)) {
        addFinding(findingsByKey, lineStarts, "sensitive_dynamic_value", node.initializer, sourceFile);
      }
    } else if (ts.isIdentifier(node) && sensitiveNamePattern.test(node.text)) {
      addFinding(findingsByKey, lineStarts, "sensitive_dynamic_value", node, sourceFile);
    }
    ts.forEachChild(node, (child) => {
      pendingNodes.push(child);
    });
  }
}

function scanComments(source, sourceFile, findingsByKey, lineStarts) {
  const languageVariant = sourceFile.languageVariant;
  const scannedCommentRanges = new Set();
  const scanTriviaRange = (start, end) => {
    if (end <= start) return;
    const trivia = source.slice(start, end);
    const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, languageVariant, trivia);
    let tokenKind = scanner.scan();
    while (tokenKind !== ts.SyntaxKind.EndOfFileToken) {
      if (tokenKind === ts.SyntaxKind.SingleLineCommentTrivia
        || tokenKind === ts.SyntaxKind.MultiLineCommentTrivia
        || tokenKind === ts.SyntaxKind.ShebangTrivia) {
        const commentStart = start + scanner.getTokenPos();
        const commentEnd = start + scanner.getTextPos();
        const rangeKey = `${commentStart}:${commentEnd}`;
        if (!scannedCommentRanges.has(rangeKey)) {
          scannedCommentRanges.add(rangeKey);
          const classification = classifySecretLikeContent(scanner.getTokenText());
          const locationNode = {
            getStart: () => commentStart,
            getEnd: () => commentEnd
          };
          addClassificationFindings(findingsByKey, lineStarts, classification, locationNode, sourceFile);
        }
      }
      tokenKind = scanner.scan();
    }
  };
  const pendingNodes = [sourceFile];
  while (pendingNodes.length > 0) {
    const node = pendingNodes.pop();
    scanTriviaRange(node.getFullStart(), node.getStart(sourceFile, false));
    ts.forEachChild(node, (child) => {
      pendingNodes.push(child);
    });
  }
  const lastStatement = sourceFile.statements[sourceFile.statements.length - 1];
  const trailingComments = ts.getTrailingCommentRanges(source, lastStatement?.end ?? 0) ?? [];
  for (const comment of trailingComments) scanTriviaRange(comment.pos, comment.end);
}

function parseSource(source, fileName, scriptKind) {
  try {
    const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKind);
    if (sourceFile.parseDiagnostics.length > 0) return { error: "parse_error" };
    return { sourceFile };
  } catch {
    return { error: "parser_failure" };
  }
}

export function classifyJavaScriptOrTypeScriptSource({ fileName, source }) {
  if (typeof fileName !== "string" || typeof source !== "string") return blockedResult("invalid_input");
  if (!ts) {
    try {
      ts = createRequire(import.meta.url)("typescript");
    } catch {
      return blockedResult("parser_unavailable");
    }
  }
  const extension = fileName.slice(fileName.lastIndexOf(".")).toLocaleLowerCase("en-US");
  const scriptKindName = sourceKinds.get(extension);
  if (scriptKindName === undefined) return blockedResult("unsupported_language");
  const scriptKind = ts.ScriptKind[scriptKindName];
  if (Buffer.byteLength(source, "utf8") > SYNTAX_AWARE_SOURCE_LIMIT_BYTES) return blockedResult("source_too_large");
  if (source.includes("\u0000") || Buffer.from(source, "utf8").toString("utf8") !== source) return blockedResult("invalid_source_text");

  const parsed = parseSource(source, fileName, scriptKind);
  if (parsed.error) return blockedResult(parsed.error);

  const sourceFile = parsed.sourceFile;
  const lineStarts = createLineStarts(source);
  const findingsByKey = new Map();
  const pendingNodes = [sourceFile];
  let visitedNodeCount = 0;

  while (pendingNodes.length > 0) {
    const node = pendingNodes.pop();
    visitedNodeCount += 1;
    if (visitedNodeCount > SYNTAX_AWARE_NODE_LIMIT) return blockedResult("node_limit_exceeded");

    if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) {
      const identifierClassifications = [
        classifySecretLikeContent(node.text),
        classifySecretLikeContent(node.getText(sourceFile))
      ];
      if (identifierClassifications.some((classification) =>
        classification.signal === "known_signature" || classification.signal === "mixed")) {
        addFinding(findingsByKey, lineStarts, "known_signature", node, sourceFile);
      }
    } else if (ts.isStringLiteralLike(node)) {
      classifyTextValue(findingsByKey, lineStarts, node.text, node, sourceFile);
      classifyTextValue(findingsByKey, lineStarts, node.getText(sourceFile), node, sourceFile);
    } else if (ts.isRegularExpressionLiteral(node)) {
      classifyTextValue(findingsByKey, lineStarts, node.text, node, sourceFile);
      classifyTextValue(findingsByKey, lineStarts, node.getText(sourceFile), node, sourceFile);
    } else if (node.kind === ts.SyntaxKind.TemplateHead
      || node.kind === ts.SyntaxKind.TemplateMiddle
      || node.kind === ts.SyntaxKind.TemplateTail) {
      classifyTextValue(findingsByKey, lineStarts, node.text, node, sourceFile);
      classifyTextValue(findingsByKey, lineStarts, node.getText(sourceFile), node, sourceFile);
    } else if (ts.isJsxText(node)) {
      classifyTextValue(findingsByKey, lineStarts, node.text, node, sourceFile);
    }

    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const staticValue = resolveStaticString(node, sourceFile);
      if (staticValue !== null) classifyTextValue(findingsByKey, lineStarts, staticValue, node, sourceFile);
    } else if (ts.isTemplateExpression(node)) {
      const staticValue = resolveStaticString(node, sourceFile);
      if (staticValue !== null) classifyTextValue(findingsByKey, lineStarts, staticValue, node, sourceFile);
    }

    if (ts.isPropertyAssignment(node)) {
      const propertyName = propertyNameText(node.name, sourceFile);
      if (propertyName === null && ts.isComputedPropertyName(node.name)) {
        addFinding(findingsByKey, lineStarts, "computed_property_unresolved", node.name, sourceFile);
      } else if (propertyName !== null) {
        classifySensitiveStaticValue(findingsByKey, lineStarts, propertyName, node.initializer, node.initializer, sourceFile);
      }
    } else if (ts.isShorthandPropertyAssignment(node) && ts.isObjectLiteralExpression(node.parent)
      && sensitiveNamePattern.test(node.name.text)) {
      addFinding(findingsByKey, lineStarts, "sensitive_dynamic_value", node.name, sourceFile);
    } else if (ts.isPropertyDeclaration(node)) {
      const propertyName = propertyNameText(node.name, sourceFile);
      if (propertyName === null && ts.isComputedPropertyName(node.name)) {
        addFinding(findingsByKey, lineStarts, "computed_property_unresolved", node.name, sourceFile);
      } else if (propertyName !== null && node.initializer) {
        classifySensitiveStaticValue(findingsByKey, lineStarts, propertyName, node.initializer, node.initializer, sourceFile);
      }
    } else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      classifySensitiveStaticValue(findingsByKey, lineStarts, node.name.text, node.initializer, node.initializer, sourceFile);
    } else if (ts.isParameter(node) && ts.isIdentifier(node.name) && node.initializer) {
      classifySensitiveStaticValue(findingsByKey, lineStarts, node.name.text, node.initializer, node.initializer, sourceFile);
    } else if (ts.isBindingElement(node)) {
      const boundName = ts.isIdentifier(node.name) ? node.name.text : null;
      const propertyName = node.propertyName ? propertyNameText(node.propertyName, sourceFile) : boundName;
      if (node.propertyName && propertyName === null && ts.isComputedPropertyName(node.propertyName)) {
        addFinding(findingsByKey, lineStarts, "computed_property_unresolved", node.propertyName, sourceFile);
      } else if (propertyName !== null && sensitiveNamePattern.test(propertyName)) {
        addFinding(findingsByKey, lineStarts, "sensitive_dynamic_value", node, sourceFile);
      }
    } else if (ts.isElementAccessExpression(node) && node.argumentExpression
      && resolveStaticString(node.argumentExpression, sourceFile) === null
      && ts.isBinaryExpression(node.parent)
      && node.parent.left === node
      && ts.isAssignmentOperator(node.parent.operatorToken.kind)) {
      addFinding(findingsByKey, lineStarts, "computed_property_unresolved", node.argumentExpression, sourceFile);
    } else if (ts.isBinaryExpression(node) && ts.isAssignmentOperator(node.operatorToken.kind)) {
      const assignedName = ts.isIdentifier(node.left)
        ? node.left.text
        : ts.isPropertyAccessExpression(node.left)
          ? node.left.name.text
          : ts.isElementAccessExpression(node.left) && node.left.argumentExpression
            ? resolveStaticString(node.left.argumentExpression, sourceFile)
            : null;
      if (assignedName !== null) {
        if (node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
          classifySensitiveStaticValue(findingsByKey, lineStarts, assignedName, node.right, node.right, sourceFile);
        } else if (sensitiveNamePattern.test(assignedName)) {
          addFinding(findingsByKey, lineStarts, "sensitive_dynamic_value", node.right, sourceFile);
        }
      } else {
        const pattern = ts.isParenthesizedExpression(node.left) ? node.left.expression : node.left;
        if (ts.isObjectLiteralExpression(pattern) || ts.isArrayLiteralExpression(pattern)) {
          addSensitiveDestructuringFindings(findingsByKey, lineStarts, pattern, sourceFile);
        }
      }
    }

    ts.forEachChild(node, (child) => {
      pendingNodes.push(child);
    });
  }

  scanComments(source, sourceFile, findingsByKey, lineStarts);

  const findings = [...findingsByKey.values()].sort((left, right) => left.line - right.line || left.column - right.column || left.kind.localeCompare(right.kind));
  return {
    status: "complete",
    decision: findings.length > 0 ? "review_required" : "no_static_literal_findings",
    reason: null,
    coverage: "parsed_source_literals_comments_and_sensitive_static_values",
    findings
  };
}
