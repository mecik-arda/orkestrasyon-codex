import { validateSubagentResult } from "../../subagent-bridge/src/schemas/core-schemas.js";

const refusalPattern = /^(?:i(?:'m| am) sorry|i cannot|i can't|i am unable|i'm unable|i won't|i will not|i must decline|i refuse)\b/i;

function failedAcceptance(failureClass) {
  return { accepted: false, failureClass };
}

function validateNormalizedTaskOutput(normalizedResult) {
  if (typeof normalizedResult !== "string") return failedAcceptance("carrier_parse_error");
  const output = normalizedResult.trim();
  if (refusalPattern.test(output)) return failedAcceptance("refusal");

  let parsed;
  try {
    parsed = JSON.parse(output);
  } catch {
    return failedAcceptance("inner_json_error");
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return failedAcceptance("inner_json_error");
  const keys = Object.keys(parsed);
  if (keys.length !== 1 || keys[0] !== "result") return failedAcceptance("inner_json_error");
  if (typeof parsed.result !== "number") return failedAcceptance("wrong_type");
  if (parsed.result !== 42) return failedAcceptance("wrong_value");
  return { accepted: true, failureClass: null };
}

export function evaluateClaudeSonnetAcceptance(response) {
  if (!response || response.isError !== false) return failedAcceptance("carrier_parse_error");
  const validation = validateSubagentResult(response.structuredContent);
  if (!validation.success) return failedAcceptance("carrier_parse_error");

  const result = validation.data;
  if (
    result.ok !== true
    || result.backend !== "antigravity"
    || result.requestedModel !== "claude_sonnet"
    || result.resolvedModel !== "claude-sonnet-4-6"
  ) return failedAcceptance("model_identity_mismatch");

  if (result.metrics.taskCompletion !== "completed" || result.metrics.outputIntegrity !== "complete") {
    return failedAcceptance("task_incomplete");
  }

  return validateNormalizedTaskOutput(result.result);
}
