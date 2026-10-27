import { validateSubagentResult } from "../../subagent-bridge/src/schemas/core-schemas.js";
import { validateClaudeSonnetAcceptanceOutput } from "../../subagent-bridge/src/services/claude-sonnet-acceptance.js";

function failedAcceptance(failureClass) {
  return { accepted: false, failureClass };
}

function validateNormalizedTaskOutput(normalizedResult) {
  const validation = validateClaudeSonnetAcceptanceOutput(normalizedResult);
  return validation.ok
    ? { accepted: true, failureClass: null }
    : failedAcceptance(validation.errorClass);
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
