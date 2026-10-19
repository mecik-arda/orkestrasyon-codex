import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createDeepSeekApiAdapter } from "../subagent-bridge/src/adapters/deepseek-api-adapter.js";
import { createDeepSeekPilotBudget } from "../subagent-bridge/src/services/deepseek-pilot-budget.js";
import { validateSubagentResult } from "../subagent-bridge/src/schemas/core-schemas.js";

function configuration(overrides = {}) {
  return {
    deepseek: {
      apiBaseUrl: "https://api.deepseek.com",
      apiModel: "deepseek-flash",
      timeoutMs: 1000,
      maxPromptBytes: 240000,
      maxOutputTokens: 2048,
      ...overrides
    }
  };
}

function response(payload, ok = true, status = 200) {
  return { ok, status, async json() { return payload; } };
}

test("DeepSeek adapter JSON mode çağrısını model, completion ve usage ile doğrular", async () => {
  const previousKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "test-secret-value";
  let requestBody;
  const adapter = createDeepSeekApiAdapter(configuration(), {
    budget: {
      async reserve(executionId, reservedUsd) { return { allowed: true, reservationId: executionId, reservedUsd }; },
      async settle(reservationId, actualCostUsd) { return { settled: true, actualCostUsd, overBudget: false }; }
    },
    fetchImplementation: async (url, options) => {
      assert.equal(url, "https://api.deepseek.com/chat/completions");
      assert.equal(options.headers.authorization, "Bearer test-secret-value");
      requestBody = JSON.parse(options.body);
      return response({
        model: "deepseek-flash",
        choices: [{ finish_reason: "stop", message: { content: "{\"status\":\"completed\"}" } }],
        usage: { prompt_tokens: 20, completion_tokens: 7 }
      });
    }
  });
  try {
    const result = await adapter.execute({
      executionId: "adapter-success",
      model: "deepseek-flash",
      mode: "read_only",
      prompt: "Return JSON",
      timeoutMs: 1000
    });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(requestBody.response_format.type, "json_object");
    assert.equal(requestBody.thinking.type, "disabled");
    assert.equal(requestBody.max_tokens, 2048);
    assert.equal(result.metrics.usage.inputTokens, 20);
    assert.equal(result.metrics.usage.outputTokens, 7);
    assert.equal(validateSubagentResult(result).success, true);
  } finally {
    if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previousKey;
  }
});

test("DeepSeek API hataları merkezi sonuç şemasıyla uyumlu provider kodu taşır", async () => {
  const previousKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "test-secret-value";
  const adapter = createDeepSeekApiAdapter(configuration(), {
    budget: {
      async reserve(executionId, reservedUsd) { return { allowed: true, reservationId: executionId, reservedUsd }; },
      async settle() { return { settled: true, overBudget: false }; }
    },
    fetchImplementation: async () => response({}, false, 429)
  });
  try {
    const result = await adapter.execute({
      executionId: "rate-limited",
      model: "deepseek-flash",
      mode: "read_only",
      prompt: "Return JSON",
      timeoutMs: 1000
    });
    assert.equal(result.reason, "rate_limited");
    assert.equal(result.metrics.diagnostics.providerCode, "rate_limited");
    assert.equal(validateSubagentResult(result).success, true);
  } finally {
    if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previousKey;
  }
});

test("DeepSeek adapter uzun veya uydurma model yanıtını kabul etmez", async () => {
  const previousKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "test-secret-value";
  try {
    for (const payload of [
      { model: "deepseek-flash", choices: [{ finish_reason: "length", message: { content: "{}" } }], usage: { prompt_tokens: 1, completion_tokens: 2 } },
      { model: "deepseek-v4-pro", choices: [{ finish_reason: "stop", message: { content: "{}" } }], usage: { prompt_tokens: 1, completion_tokens: 2 } }
    ]) {
      const adapter = createDeepSeekApiAdapter(configuration(), {
        budget: {
          async reserve(executionId, reservedUsd) { return { allowed: true, reservationId: executionId, reservedUsd }; },
          async settle() { return { settled: true, overBudget: false }; }
        },
        fetchImplementation: async () => response(payload)
      });
      const result = await adapter.execute({ executionId: crypto.randomUUID(), model: "deepseek-flash", mode: "read_only", prompt: "{}", timeoutMs: 1000 });
      assert.equal(result.ok, false);
      assert.ok(["output_limit", "output_parse_invalid"].includes(result.reason));
    }
  } finally {
    if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previousKey;
  }
});

test("DeepSeek adapter bütçe reddinde ağa çıkmaz", async () => {
  const previousKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "test-secret-value";
  let requests = 0;
  const adapter = createDeepSeekApiAdapter(configuration(), {
    budget: {
      async reserve() { return { allowed: false, reason: "budget_exhausted" }; },
      async settle() { return { settled: false, overBudget: true }; }
    },
    fetchImplementation: async () => {
      requests += 1;
      return response({});
    }
  });
  try {
    const result = await adapter.execute({ executionId: "budget-denied", model: "deepseek-flash", mode: "read_only", prompt: "{}", timeoutMs: 1000 });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "budget_exhausted");
    assert.equal(requests, 0);
  } finally {
    if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previousKey;
  }
});

test("DeepSeek adapter edit modunu yalnız disposable pilot caller'ına açar", async () => {
  const previousKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "test-secret-value";
  let requests = 0;
  const adapter = createDeepSeekApiAdapter(configuration(), {
    budget: {
      async reserve(executionId, reservedUsd) { return { allowed: true, reservationId: executionId, reservedUsd }; },
      async settle(reservationId, actualCostUsd) { return { settled: true, actualCostUsd, overBudget: false }; }
    },
    fetchImplementation: async () => {
      requests += 1;
      return response({
        model: "deepseek-flash",
        choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ status: "completed", summary: "Updated", changes: [{ path: "src/value.txt", content: "after" }] }) } }],
        usage: { prompt_tokens: 20, completion_tokens: 10 }
      });
    }
  });
  try {
    assert.equal(adapter.capabilities.canWrite, true);
    const denied = await adapter.execute({ executionId: "edit-denied", model: "deepseek-flash", mode: "edit", caller: "deepseek_api", prompt: "{}", timeoutMs: 1000 });
    assert.equal(denied.ok, false);
    assert.equal(denied.reason, "mode_not_allowed");
    const accepted = await adapter.execute({ executionId: "edit-pilot", model: "deepseek-flash", mode: "edit", caller: "deepseek_edit_pilot", prompt: "{}", timeoutMs: 1000 });
    assert.equal(accepted.ok, true, JSON.stringify(accepted));
    assert.equal(requests, 1);
    assert.equal(validateSubagentResult(accepted).success, true);
  } finally {
    if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previousKey;
  }
});

test("DeepSeek pilot bütçesi eşzamanlı rezervasyonları sert tavanda tutar", async (t) => {
  const stateDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "deepseek-budget-"));
  t.after(() => fs.rmSync(stateDirectory, { recursive: true, force: true }));
  const budget = createDeepSeekPilotBudget({ stateDirectory, limitUsd: 1, priorUsageReservationUsd: 0.0000189 });
  const reservations = await Promise.all([
    budget.reserve("first", 0.6),
    budget.reserve("second", 0.6)
  ]);
  assert.equal(reservations.filter((reservation) => reservation.allowed).length, 1);
  assert.equal(reservations.filter((reservation) => !reservation.allowed && reservation.reason === "budget_exhausted").length, 1);
  const accepted = reservations.find((reservation) => reservation.allowed);
  await budget.settle(accepted.reservationId, 0.4);
  const snapshot = await budget.snapshot();
  assert.equal(snapshot.spentUsd, 0.4000189);
  assert.equal(snapshot.reservedUsd, 0);
  assert.equal(snapshot.limitUsd, 1);
});
