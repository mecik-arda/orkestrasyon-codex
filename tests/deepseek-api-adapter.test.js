import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { checkDeepSeekApi, createDeepSeekApiAdapter } from "../subagent-bridge/src/adapters/deepseek-api-adapter.js";
import { createBridgeRuntime } from "../subagent-bridge/src/runtime/bridge-runtime.js";
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
      maxOutputBytes: 8388608,
      ...overrides
    }
  };
}

function response(payload, ok = true, status = 200) {
  return new Response(JSON.stringify(payload), { status: ok ? status : status || 500 });
}

function streamResponse(chunks, { status = 200, headers = {}, cancelState = null, holdOpen = false } = {}) {
  const body = new ReadableStream({
    pull(controller) {
      if (chunks.length === 0) {
        if (holdOpen) return new Promise(() => {});
        controller.close();
        return;
      }
      controller.enqueue(chunks.shift());
    },
    cancel() {
      if (cancelState) cancelState.cancelled = true;
    }
  });
  return new Response(body, { status, headers });
}

function validApiPayload(content = "{\"status\":\"completed\"}") {
  return {
    model: "deepseek-flash",
    choices: [{ finish_reason: "stop", message: { content } }],
    usage: { prompt_tokens: 20, completion_tokens: 7 }
  };
}

function encodeChunks(value, chunkSize) {
  const bytes = Buffer.from(value, "utf8");
  const chunks = [];
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    chunks.push(bytes.subarray(offset, Math.min(bytes.length, offset + chunkSize)));
  }
  return chunks;
}

function createBudget(overrides = {}) {
  const state = { reserveCalls: 0, settleCalls: 0, settledCost: null };
  const budget = {
    async reserve(executionId, reservedUsd) {
      state.reserveCalls += 1;
      return { allowed: true, reservationId: executionId, reservedUsd };
    },
    async settle(reservationId, actualCostUsd) {
      state.settleCalls += 1;
      state.settledCost = actualCostUsd;
      return { settled: true, actualCostUsd, overBudget: false };
    },
    ...overrides
  };
  return { budget, state };
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

test("DeepSeek HTTP gövdesi eksik Content-Length ile byte sınırının altında ve tam sınırda okunur", async (t) => {
  const previousKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "test-secret-value";
  const payloadText = JSON.stringify(validApiPayload("sonuç ı"));
  const payloadBytes = Buffer.byteLength(payloadText, "utf8");
  t.after(() => {
    if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previousKey;
  });

  for (const maxOutputBytes of [payloadBytes + 1, payloadBytes]) {
    const adapter = createDeepSeekApiAdapter(configuration({ maxOutputBytes }), {
      budget: createBudget().budget,
      fetchImplementation: async () => streamResponse(encodeChunks(payloadText, 1))
    });
    const result = await adapter.execute({ executionId: crypto.randomUUID(), model: "deepseek-flash", mode: "read_only", prompt: "{}", timeoutMs: 1000 });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.metrics.usage.outputTokens, 7);
    assert.equal(validateSubagentResult(result).success, true);
  }
});

test("DeepSeek response body byte ceiling stops a single oversized chunk and ignores Content-Length", async () => {
  const previousKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "test-secret-value";
  const payloadText = `${JSON.stringify(validApiPayload())} `;
  const payloadBytes = Buffer.from(payloadText, "utf8");
  const cancelState = { cancelled: false };
  const { budget, state } = createBudget();
  const adapter = createDeepSeekApiAdapter(configuration({ maxOutputBytes: payloadBytes.length - 1 }), {
    budget,
    fetchImplementation: async () => streamResponse([payloadBytes], { headers: { "content-length": "1" }, cancelState, holdOpen: true })
  });
  try {
    const result = await adapter.execute({ executionId: "body-large-chunk", model: "deepseek-flash", mode: "read_only", prompt: "{}", timeoutMs: 1000 });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "output_limit");
    assert.equal(result.retryable, false);
    assert.equal(result.metrics.diagnostics.outputLimitScope, "http_response_body");
    assert.equal(result.metrics.diagnostics.outputLimitBytes, payloadBytes.length - 1);
    assert.equal(result.metrics.diagnostics.outputBytesObserved, payloadBytes.length);
    assert.equal(result.metrics.diagnostics.stdoutBytes, null);
    assert.equal(result.metrics.diagnostics.stderrBytes, null);
    assert.equal(cancelState.cancelled, true);
    assert.equal(state.settleCalls, 1);
    assert.equal(state.settledCost, null);
    assert.equal(validateSubagentResult(result).success, true);
  } finally {
    if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previousKey;
  }
});

test("DeepSeek response byte ceiling stops many small chunks and preserves request and host caps", async () => {
  const previousKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "test-secret-value";
  const payloadText = JSON.stringify(validApiPayload());
  const payloadBytes = Buffer.from(payloadText, "utf8");
  const cancelState = { cancelled: false };
  const { budget, state } = createBudget();
  const adapter = createDeepSeekApiAdapter(configuration({ maxOutputBytes: payloadBytes.length - 2 }), {
    budget,
    fetchImplementation: async () => streamResponse(encodeChunks(payloadText, 1), { headers: { "content-length": String(payloadBytes.length + 1000) }, cancelState })
  });
  try {
    const result = await adapter.execute({
      executionId: "body-small-chunks",
      model: "deepseek-flash",
      mode: "read_only",
      prompt: "{}",
      timeoutMs: 1000,
      maxOutputBytes: payloadBytes.length + 100
    });
    assert.equal(result.reason, "output_limit");
    assert.equal(result.metrics.diagnostics.outputLimitBytes, payloadBytes.length - 2);
    assert.equal(result.metrics.diagnostics.outputBytesObserved > payloadBytes.length - 2, true);
    assert.equal(result.metrics.diagnostics.outputLimitScope, "http_response_body");
    assert.equal(cancelState.cancelled, true);
    assert.equal(state.settleCalls, 1);
    assert.equal(state.settledCost, null);
  } finally {
    if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previousKey;
  }
});

test("DeepSeek models health response uses the configured response body byte ceiling", async (t) => {
  const previousKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "test-secret-value";
  const payload = Buffer.from(JSON.stringify({ data: [{ id: "deepseek-flash" }] }), "utf8");
  const cancelState = { cancelled: false };
  t.after(() => {
    if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previousKey;
  });
  const result = await checkDeepSeekApi(configuration({ maxOutputBytes: payload.length - 1 }), async (url) => {
    assert.equal(url, "https://api.deepseek.com/models");
    return streamResponse([payload], { cancelState, holdOpen: true });
  });
  assert.deepEqual(result, { available: false, authenticated: null, model: "deepseek-flash", modelAvailable: false, exitCode: 1 });
  assert.equal(cancelState.cancelled, true);
});

test("DeepSeek models health fails closed without a valid response body byte ceiling", async (t) => {
  const previousKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "test-secret-value";
  t.after(() => {
    if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previousKey;
  });
  for (const maxOutputBytes of [undefined, 0, Number.MAX_SAFE_INTEGER + 1]) {
    let fetchCalls = 0;
    const result = await checkDeepSeekApi(configuration({ maxOutputBytes }), async () => {
      fetchCalls += 1;
      return response({ data: [{ id: "deepseek-flash" }] });
    });
    assert.equal(result.available, false);
    assert.equal(result.authenticated, true);
    assert.equal(fetchCalls, 0);
  }
});

test("DeepSeek request byte cap may narrow but never enlarge the configured host cap", async () => {
  const previousKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "test-secret-value";
  const payloadText = JSON.stringify(validApiPayload());
  const payloadBytes = Buffer.from(payloadText, "utf8");
  const { budget } = createBudget();
  const adapter = createDeepSeekApiAdapter(configuration({ maxOutputBytes: payloadBytes.length - 1 }), {
    budget,
    fetchImplementation: async () => streamResponse([payloadBytes])
  });
  try {
    const result = await adapter.execute({ executionId: "host-cap-wins", model: "deepseek-flash", mode: "read_only", prompt: "{}", timeoutMs: 1000, maxOutputBytes: payloadBytes.length + 100 });
    assert.equal(result.reason, "output_limit");
    assert.equal(result.metrics.diagnostics.outputLimitBytes, payloadBytes.length - 1);
  } finally {
    if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previousKey;
  }
});

test("DeepSeek narrower request byte cap is enforced below the configured host cap", async () => {
  const previousKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "test-secret-value";
  const payloadBytes = Buffer.from(JSON.stringify(validApiPayload()), "utf8");
  const { budget } = createBudget();
  const adapter = createDeepSeekApiAdapter(configuration({ maxOutputBytes: payloadBytes.length + 1 }), {
    budget,
    fetchImplementation: async () => streamResponse([payloadBytes])
  });
  try {
    const result = await adapter.execute({
      executionId: "request-cap-narrows",
      model: "deepseek-flash",
      mode: "read_only",
      prompt: "{}",
      timeoutMs: 1000,
      maxOutputBytes: payloadBytes.length - 1
    });
    assert.equal(result.reason, "output_limit");
    assert.equal(result.metrics.diagnostics.outputLimitBytes, payloadBytes.length - 1);
  } finally {
    if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previousKey;
  }
});

test("DeepSeek execution fails closed before admission when the response body byte cap is invalid", async () => {
  const previousKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "test-secret-value";
  try {
    for (const input of [
      { configuredLimit: undefined },
      { configuredLimit: 0 },
      { configuredLimit: 8388609 },
      { configuredLimit: 1024, requestedLimit: Number.MAX_SAFE_INTEGER + 1 }
    ]) {
      const { budget, state } = createBudget();
      let fetchCalls = 0;
      const adapter = createDeepSeekApiAdapter(configuration({ maxOutputBytes: input.configuredLimit }), {
        budget,
        fetchImplementation: async () => {
          fetchCalls += 1;
          return response(validApiPayload());
        }
      });
      const result = await adapter.execute({
        executionId: crypto.randomUUID(),
        model: "deepseek-flash",
        mode: "read_only",
        prompt: "{}",
        timeoutMs: 1000,
        ...(input.requestedLimit === undefined ? {} : { maxOutputBytes: input.requestedLimit })
      });
      assert.equal(result.ok, false);
      assert.equal(result.reason, "unclassified");
      assert.equal(state.reserveCalls, 0);
      assert.equal(fetchCalls, 0);
    }
  } finally {
    if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previousKey;
  }
});

test("DeepSeek invalid UTF-8 and malformed JSON stay output parse failures", async (t) => {
  const previousKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "test-secret-value";
  t.after(() => {
    if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previousKey;
  });
  for (const bytes of [Buffer.alloc(0), Buffer.from("{"), Buffer.from([0xc3, 0x28])]) {
    const { budget, state } = createBudget();
    const adapter = createDeepSeekApiAdapter(configuration(), {
      budget,
      fetchImplementation: async () => streamResponse([bytes])
    });
    const result = await adapter.execute({ executionId: crypto.randomUUID(), model: "deepseek-flash", mode: "read_only", prompt: "{}", timeoutMs: 1000 });
    assert.equal(result.reason, "output_parse_invalid");
    assert.equal(result.retryable, false);
    assert.equal(result.metrics.totalCostUsd, null);
    assert.equal(state.settleCalls, 1);
    assert.equal(state.settledCost, null);
  }
});

test("DeepSeek response stream errors remain network failures", async () => {
  const previousKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "test-secret-value";
  const { budget, state } = createBudget();
  const adapter = createDeepSeekApiAdapter(configuration(), {
    budget,
    fetchImplementation: async () => new Response(new ReadableStream({ pull(controller) { controller.error(new Error("stream failed")); } }))
  });
  try {
    const result = await adapter.execute({ executionId: "body-read-error", model: "deepseek-flash", mode: "read_only", prompt: "{}", timeoutMs: 1000 });
    assert.equal(result.reason, "network");
    assert.equal(result.metrics.totalCostUsd, null);
    assert.equal(state.settleCalls, 1);
    assert.equal(state.settledCost, null);
  } finally {
    if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previousKey;
  }
});

test("DeepSeek body read timeout and cancellation abort pending stream reads", async (t) => {
  const previousKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "test-secret-value";
  t.after(() => {
    if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previousKey;
  });
  for (const mode of ["timeout", "cancel"]) {
    const { budget, state } = createBudget();
    let cancelObserved = false;
    const adapter = createDeepSeekApiAdapter(configuration({ timeoutMs: 1000 }), {
      budget,
      fetchImplementation: async () => new Response(new ReadableStream({
        pull() { return new Promise(() => {}); },
        cancel() { cancelObserved = true; }
      }))
    });
    const abortController = new AbortController();
    const resultPromise = adapter.execute({
      executionId: `body-${mode}`,
      model: "deepseek-flash",
      mode: "read_only",
      prompt: "{}",
      timeoutMs: mode === "timeout" ? 20 : 1000,
      abortSignal: abortController.signal
    });
    if (mode === "cancel") setTimeout(() => abortController.abort(), 20);
    const result = await resultPromise;
    assert.equal(result.reason, mode === "timeout" ? "timeout" : "cancelled");
    assert.equal(result.timedOut, mode === "timeout");
    assert.equal(result.retryable, mode === "timeout");
    assert.equal(state.settleCalls, 1);
    assert.equal(state.settledCost, null);
    assert.equal(cancelObserved, true);
  }
});

test("DeepSeek non-success HTTP body is cancelled and its reservation is settled once", async () => {
  const previousKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "test-secret-value";
  const cancelState = { cancelled: false };
  const { budget, state } = createBudget();
  const adapter = createDeepSeekApiAdapter(configuration(), {
    budget,
    fetchImplementation: async () => streamResponse([Buffer.from("provider error")], { status: 429, cancelState, holdOpen: true })
  });
  try {
    const result = await adapter.execute({ executionId: "http-error-body", model: "deepseek-flash", mode: "read_only", prompt: "{}", timeoutMs: 1000 });
    assert.equal(result.reason, "rate_limited");
    assert.equal(cancelState.cancelled, true);
    assert.equal(state.settleCalls, 1);
    assert.equal(state.settledCost, null);
  } finally {
    if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previousKey;
  }
});

test("DeepSeek budget settlement failure cannot produce adapter success or a duplicate settlement", async () => {
  const previousKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "test-secret-value";
  let settleCalls = 0;
  const adapter = createDeepSeekApiAdapter(configuration(), {
    budget: {
      async reserve(executionId, reservedUsd) { return { allowed: true, reservationId: executionId, reservedUsd }; },
      async settle() { settleCalls += 1; throw new Error("budget storage unavailable"); }
    },
    fetchImplementation: async () => response(validApiPayload())
  });
  try {
    const result = await adapter.execute({ executionId: "settlement-failed", model: "deepseek-flash", mode: "read_only", prompt: "{}", timeoutMs: 1000 });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "budget_state_unavailable");
    assert.equal(settleCalls, 1);
  } finally {
    if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previousKey;
  }
});

test("DeepSeek runtime propagates HTTP body output_limit without retry", async (t) => {
  const previousKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "test-secret-value";
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deepseek-http-body-runtime-"));
  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true });
    if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previousKey;
  });
  const bodyBytes = Buffer.from(JSON.stringify(validApiPayload()), "utf8");
  const { budget, state } = createBudget();
  const deepseek = createDeepSeekApiAdapter({
    deepseek: {
      apiBaseUrl: "https://api.deepseek.com",
      apiModel: "deepseek-flash",
      timeoutMs: 1000,
      maxPromptBytes: 240000,
      maxOutputTokens: 2048,
      maxOutputBytes: bodyBytes.length - 1
    }
  }, {
    budget,
    fetchImplementation: async () => streamResponse([bodyBytes])
  });
  const configurationValue = {
    packageRoot: root,
    statePaths: { logs: path.join(root, "logs"), state: path.join(root, "state"), cache: path.join(root, "cache") },
    deepseek: {
      apiBaseUrl: "https://api.deepseek.com",
      apiModel: "deepseek-flash",
      timeoutMs: 1000,
      maxPromptBytes: 240000,
      maxOutputTokens: 2048,
      maxOutputBytes: bodyBytes.length - 1,
      pilotBudgetUsd: 1,
      priorUsageReservationUsd: 0
    },
    reliability: { maxAttempts: 3 }
  };
  const runtime = createBridgeRuntime({ configuration: configurationValue, adapters: { deepseek }, sleep: async () => {} });
  const result = await runtime.run({
    target: "deepseek",
    model: "deepseek-flash",
    prompt: "Return JSON",
    mode: "read_only",
    trustedWorkspace: root,
    caller: "body-limit-test",
    delegationDepth: 0,
    timeoutMs: 1000,
    maxOutputBytes: 1024
  });
  assert.equal(result.reason, "output_limit");
  assert.equal(result.metrics.adapterAttempts, 1);
  assert.equal(result.metrics.retries, 0);
  assert.equal(result.metrics.diagnostics.outputLimitScope, "http_response_body");
  assert.equal(result.metrics.diagnostics.outputLimitBytes, bodyBytes.length - 1);
  assert.equal(state.settleCalls, 1);
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
