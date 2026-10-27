import test from "node:test";
import assert from "node:assert/strict";
import { createSuccessSubagentResult, validateSubagentResult } from "../subagent-bridge/src/schemas/core-schemas.js";
import { validateClaudeSonnetAcceptanceOutput } from "../subagent-bridge/src/services/claude-sonnet-acceptance.js";
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
  assert.deepEqual(evaluateClaudeSonnetAcceptance(createAcceptedEnvelope(' \n\t{"result":42}\r\n ')), { accepted: true, failureClass: null });
});

test("P1b görev doğrulayıcı dizge dışı taşıyıcı sonucunu kapalı içerik tipi hatasıyla reddeder", () => {
  assert.deepEqual(validateClaudeSonnetAcceptanceOutput(42), {
    ok: false,
    errorClass: "task_json_content_type_invalid"
  });
});

test("P1b görev doğrulayıcı boş ve yalnız boşluk içeren task JSON girdisini ayrı sınıflandırır", () => {
  assert.deepEqual(validateClaudeSonnetAcceptanceOutput(""), {
    ok: false,
    errorClass: "task_json_empty"
  });
  assert.deepEqual(validateClaudeSonnetAcceptanceOutput(" \n\t\r "), {
    ok: false,
    errorClass: "task_json_empty"
  });
});

test("P1b yerel kabul: görev JSON retleri kapalı alt nedenlere ayrılır", () => {
  const cases = [
    ['{"result":"42"}', "task_json_result_type_invalid"],
    ['{"result":41}', "task_json_result_value_invalid"],
    ['{"result":42,"extra":true}', "task_json_additional_fields"],
    ['{"other":42}', "task_json_result_missing"],
    ['{}', "task_json_result_missing"],
    ["null", "task_json_top_level_type_invalid"],
    ["[42]", "task_json_top_level_type_invalid"],
    ["42", "task_json_top_level_type_invalid"]
  ];
  for (const [normalizedResult, expectedFailureClass] of cases) {
    assert.equal(evaluateClaudeSonnetAcceptance(createAcceptedEnvelope(normalizedResult)).failureClass, expectedFailureClass);
  }
});

test("P1b yerel kabul: bozuk, fenced, açıklamalı ve çoklu JSON metni ayrıştırma hatasıdır", () => {
  const cases = [
    "{broken}",
    "```json\n{\"result\":42}\n```",
    "Answer: {\"result\":42}",
    "{\"result\":42} {\"result\":42}"
  ];
  for (const normalizedResult of cases) {
    assert.equal(evaluateClaudeSonnetAcceptance(createAcceptedEnvelope(normalizedResult)).failureClass, "task_json_parse_invalid");
  }
});

test("P1b yerel kabul: dış taşıyıcı parse veya şema hatası fail-closed reddedilir", () => {
  assert.equal(evaluateClaudeSonnetAcceptance({ isError: true }).failureClass, "carrier_parse_error");
  assert.equal(evaluateClaudeSonnetAcceptance({ isError: false, structuredContent: { ok: true } }).failureClass, "carrier_parse_error");
});

test("P1b yerel kabul: açık refusal sinyali yoksa metin JSON ayrıştırma hatasıdır", () => {
  assert.equal(evaluateClaudeSonnetAcceptance(createAcceptedEnvelope("I cannot complete that request.")).failureClass, "task_json_parse_invalid");

  const wrongIdentity = createAcceptedEnvelope('{"result":42}');
  wrongIdentity.structuredContent.resolvedModel = "another-model";
  assert.equal(evaluateClaudeSonnetAcceptance(wrongIdentity).failureClass, "model_identity_mismatch");
});

test("P1b yerel kabul: dış MCP şema başarısı iç görev kabulünü geçersiz kılamaz", () => {
  const response = createAcceptedEnvelope('{"result":"42"}');
  assert.equal(validateSubagentResult(response.structuredContent).success, true);
  assert.deepEqual(evaluateClaudeSonnetAcceptance(response), { accepted: false, failureClass: "task_json_result_type_invalid" });
});

test("P1b yerel kabul: eksik tamamlanma kanıtı kabulü kapalı tutar", () => {
  const response = createAcceptedEnvelope('{"result":42}');
  response.structuredContent.metrics.outputIntegrity = "unknown";
  assert.equal(evaluateClaudeSonnetAcceptance(response).failureClass, "task_incomplete");
});
