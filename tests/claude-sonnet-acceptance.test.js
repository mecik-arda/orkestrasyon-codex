import test from "node:test";
import assert from "node:assert/strict";
import { createSuccessSubagentResult, validateSubagentResult } from "../subagent-bridge/src/schemas/core-schemas.js";
import { evaluateClaudeSonnetAcceptance } from "./support/claude-sonnet-acceptance.js";

function createAcceptedEnvelope(normalizedResult) {
  return {
    isError: false,
    structuredContent: createSuccessSubagentResult("antigravity", "claude-sonnet-4-6", {
      requestedModel: "claude_sonnet",
      resolvedModel: "claude-sonnet-4-6",
      result: normalizedResult,
      metrics: {
        outputIntegrity: "complete",
        taskCompletion: "completed"
      }
    })
  };
}

test("P1b yerel kabul: yalnızca normalize edilmiş sayısal 42 JSON sonucu kabul edilir", () => {
  const accepted = evaluateClaudeSonnetAcceptance(createAcceptedEnvelope('{"result":42}'));
  assert.deepEqual(accepted, { accepted: true, failureClass: null });
});

test("P1b yerel kabul: string sayı, yanlış sayı ve ek anahtarlar reddedilir", () => {
  assert.equal(evaluateClaudeSonnetAcceptance(createAcceptedEnvelope('{"result":"42"}')).failureClass, "wrong_type");
  assert.equal(evaluateClaudeSonnetAcceptance(createAcceptedEnvelope('{"result":41}')).failureClass, "wrong_value");
  assert.equal(evaluateClaudeSonnetAcceptance(createAcceptedEnvelope('{"result":42,"extra":true}')).failureClass, "inner_json_error");
});

test("P1b yerel kabul: dizi, null, bozuk JSON ve code fence reddedilir", () => {
  for (const normalizedResult of [
    "[42]",
    "null",
    "{broken}",
    "```json\n{\"result\":42}\n```"
  ]) {
    assert.equal(evaluateClaudeSonnetAcceptance(createAcceptedEnvelope(normalizedResult)).accepted, false);
  }
});

test("P1b yerel kabul: dış taşıyıcı parse veya şema hatası fail-closed reddedilir", () => {
  assert.equal(evaluateClaudeSonnetAcceptance({ isError: true }).failureClass, "carrier_parse_error");
  assert.equal(evaluateClaudeSonnetAcceptance({ isError: false, structuredContent: { ok: true } }).failureClass, "carrier_parse_error");
});

test("P1b yerel kabul: ret yanıtı ve model kimliği uyuşmazlığı reddedilir", () => {
  assert.equal(evaluateClaudeSonnetAcceptance(createAcceptedEnvelope("I cannot complete that request.")).failureClass, "refusal");

  const wrongIdentity = createAcceptedEnvelope('{"result":42}');
  wrongIdentity.structuredContent.resolvedModel = "another-model";
  assert.equal(evaluateClaudeSonnetAcceptance(wrongIdentity).failureClass, "model_identity_mismatch");
});

test("P1b yerel kabul: dış MCP şema başarısı iç görev kabulünü geçersiz kılamaz", () => {
  const response = createAcceptedEnvelope('{"result":"42"}');
  assert.equal(validateSubagentResult(response.structuredContent).success, true);
  assert.deepEqual(evaluateClaudeSonnetAcceptance(response), { accepted: false, failureClass: "wrong_type" });
});

test("P1b yerel kabul: eksik tamamlanma kanıtı kabulü kapalı tutar", () => {
  const response = createAcceptedEnvelope('{"result":42}');
  response.structuredContent.metrics.outputIntegrity = "unknown";
  assert.equal(evaluateClaudeSonnetAcceptance(response).failureClass, "task_incomplete");
});
