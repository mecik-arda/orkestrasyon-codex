import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { createDeepSeekApiAdapter } from "../subagent-bridge/src/adapters/deepseek-api-adapter.js";

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function configuration(baseUrl, maxOutputBytes = 8192, timeoutMs = 1000) {
  return {
    deepseek: {
      apiBaseUrl: baseUrl,
      apiModel: "deepseek-flash",
      timeoutMs,
      maxPromptBytes: 240000,
      maxOutputTokens: 2048,
      maxOutputBytes
    }
  };
}

function createBudget() {
  const state = { reserveCalls: 0, settleCalls: 0, actualCosts: [] };
  return {
    state,
    budget: {
      async reserve(executionId, reservedUsd) {
        state.reserveCalls += 1;
        return { allowed: true, reservationId: executionId, reservedUsd };
      },
      async settle(reservationId, actualCostUsd) {
        state.settleCalls += 1;
        state.actualCosts.push(actualCostUsd);
        return { settled: true, actualCostUsd, overBudget: false };
      }
    }
  };
}

function successfulPayload() {
  return JSON.stringify({
    model: "deepseek-flash",
    choices: [{ finish_reason: "stop", message: { content: "{\"status\":\"completed\"}" } }],
    usage: { prompt_tokens: 1, completion_tokens: 1 }
  });
}

async function createLoopbackServer(handler) {
  const server = http.createServer(handler);
  const sockets = new Set();
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
    }
  };
}

function waitFor(promise, label = "operation") {
  let timer;
  return Promise.race([
    promise,
    new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error(`loopback HTTP test safety timeout: ${label}`)), 5000); })
  ]).finally(() => clearTimeout(timer));
}

test("DeepSeek adapter cancellation over loopback Fetch remains cancelled and isolates a concurrent request", async (t) => {
  const previousKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "synthetic-loopback-key";
  const held = deferred();
  const releaseHeld = deferred();
  const heldClosed = deferred();
  let requestCount = 0;
  const server = await createLoopbackServer(async (request, response) => {
    requestCount += 1;
    if (requestCount === 1) {
      response.writeHead(200, { "content-type": "application/json" });
      response.flushHeaders();
      response.write("{\"model\":");
      held.resolve();
      response.once("close", heldClosed.resolve);
      await releaseHeld.promise;
      if (!response.destroyed) response.end("\"deepseek-flash\"}");
      return;
    }
    const payload = successfulPayload();
    response.writeHead(200, { "content-type": "application/json" });
    response.flushHeaders();
    response.write(payload.slice(0, 17));
    await new Promise((resolve) => setImmediate(resolve));
    response.end(payload.slice(17));
  });
  t.after(async () => {
    releaseHeld.resolve();
    await server.close();
    if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previousKey;
  });
  const { budget, state } = createBudget();
  const adapter = createDeepSeekApiAdapter(configuration(`${server.baseUrl}/held`), { budget });
  const cancelledRequest = adapter.execute({ executionId: "loopback-cancelled", model: "deepseek-flash", mode: "read_only", prompt: "cancel", timeoutMs: 3000 });
  await Promise.race([
    waitFor(held.promise, "held request body started"),
    cancelledRequest.then((result) => { throw new Error(`adapter ended before loopback request: ${result.reason}`); })
  ]);
  const successfulRequest = adapter.execute({ executionId: "loopback-survivor", model: "deepseek-flash", mode: "read_only", prompt: "success", timeoutMs: 3000 });
  const successful = await waitFor(successfulRequest, "parallel success");
  await adapter.cancel("loopback-cancelled");
  await adapter.cancel("loopback-cancelled");
  const cancelled = await waitFor(cancelledRequest, "cancelled request completion");
  await waitFor(heldClosed.promise, "cancelled response closed");
  releaseHeld.resolve();
  assert.equal(cancelled.reason, "cancelled");
  assert.equal(cancelled.timedOut, false);
  assert.equal(cancelled.retryable, false);
  assert.equal(successful.ok, true);
  assert.equal(state.reserveCalls, 2);
  assert.equal(state.settleCalls, 2);
  assert.equal(state.actualCosts.filter((cost) => cost === null).length, 1);
  assert.equal(state.actualCosts.filter(Number.isFinite).length, 1);
  assert.equal(requestCount, 2);
  await adapter.cancel("loopback-cancelled");
});

test("DeepSeek cancellation before response headers aborts the loopback request", async (t) => {
  const previousKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "synthetic-loopback-key";
  const requestReceived = deferred();
  const releaseRequest = deferred();
  const connectionClosed = deferred();
  const server = await createLoopbackServer(async (request, response) => {
    requestReceived.resolve();
    request.socket.once("close", connectionClosed.resolve);
    await releaseRequest.promise;
    if (!response.destroyed) response.end(successfulPayload());
  });
  t.after(async () => {
    releaseRequest.resolve();
    await server.close();
    if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previousKey;
  });
  const { budget, state } = createBudget();
  const adapter = createDeepSeekApiAdapter(configuration(server.baseUrl), { budget });
  const pending = adapter.execute({ executionId: "loopback-before-headers", model: "deepseek-flash", mode: "read_only", prompt: "await headers", timeoutMs: 3000 });
  await waitFor(requestReceived.promise, "request received before headers");
  await adapter.cancel("loopback-before-headers");
  const result = await waitFor(pending, "cancel before response headers");
  await waitFor(connectionClosed.promise, "cancelled request connection closed");
  assert.equal(result.reason, "cancelled");
  assert.equal(result.timedOut, false);
  assert.equal(result.retryable, false);
  assert.equal(state.settleCalls, 1);
  assert.deepEqual(state.actualCosts, [null]);
});

test("DeepSeek adapters do not share cancellation ownership for a reused execution ID", async (t) => {
  const previousKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "synthetic-loopback-key";
  const firstReceived = deferred();
  const secondReceived = deferred();
  const releaseFirst = deferred();
  const releaseSecond = deferred();
  const firstClosed = deferred();
  const secondClosed = deferred();
  const server = await createLoopbackServer(async (request, response) => {
    const first = request.url.startsWith("/first/");
    const received = first ? firstReceived : secondReceived;
    const release = first ? releaseFirst : releaseSecond;
    const closed = first ? firstClosed : secondClosed;
    response.writeHead(200, { "content-type": "application/json" });
    response.flushHeaders();
    response.write("{");
    received.resolve();
    response.once("close", closed.resolve);
    await release.promise;
    if (!response.destroyed) response.end(successfulPayload().slice(1));
  });
  t.after(async () => {
    releaseFirst.resolve();
    releaseSecond.resolve();
    await server.close();
    if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previousKey;
  });
  const firstBudget = createBudget();
  const secondBudget = createBudget();
  const firstAdapter = createDeepSeekApiAdapter(configuration(`${server.baseUrl}/first`), { budget: firstBudget.budget });
  const secondAdapter = createDeepSeekApiAdapter(configuration(`${server.baseUrl}/second`), { budget: secondBudget.budget });
  const firstRequest = firstAdapter.execute({ executionId: "reused-execution", model: "deepseek-flash", mode: "read_only", prompt: "first", timeoutMs: 3000 });
  const secondRequest = secondAdapter.execute({ executionId: "reused-execution", model: "deepseek-flash", mode: "read_only", prompt: "second", timeoutMs: 3000 });
  await Promise.all([waitFor(firstReceived.promise, "first request received"), waitFor(secondReceived.promise, "second request received")]);
  await firstAdapter.cancel("reused-execution");
  const firstResult = await waitFor(firstRequest, "first adapter cancellation");
  await waitFor(firstClosed.promise, "first response closed");
  releaseSecond.resolve();
  const secondResult = await waitFor(secondRequest, "second adapter success");
  releaseFirst.resolve();
  assert.equal(firstResult.reason, "cancelled");
  assert.equal(firstResult.timedOut, false);
  assert.equal(secondResult.ok, true);
  assert.equal(firstBudget.state.settleCalls, 1);
  assert.equal(secondBudget.state.settleCalls, 1);
  await secondAdapter.cancel("reused-execution");
});

test("DeepSeek loopback response byte overflow is fail-fast and settles once", async (t) => {
  const previousKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "synthetic-loopback-key";
  let requests = 0;
  const responseClosed = deferred();
  const server = await createLoopbackServer((request, response) => {
    requests += 1;
    response.writeHead(200, { "content-type": "application/json", "transfer-encoding": "chunked" });
    response.flushHeaders();
    response.write("x".repeat(256));
    response.once("close", responseClosed.resolve);
  });
  t.after(async () => {
    await server.close();
    if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previousKey;
  });
  const { budget, state } = createBudget();
  const adapter = createDeepSeekApiAdapter(configuration(server.baseUrl, 64), { budget });
  const result = await waitFor(adapter.execute({ executionId: "loopback-output-limit", model: "deepseek-flash", mode: "read_only", prompt: "bounded", timeoutMs: 3000 }), "output limit result");
  assert.equal(result.reason, "output_limit", result.error || "");
  assert.equal(result.retryable, false);
  assert.equal(requests, 1);
  assert.equal(state.settleCalls, 1);
  assert.deepEqual(state.actualCosts, [null]);
  await waitFor(responseClosed.promise, "oversized response body cancellation");
});

test("DeepSeek unsuccessful HTTP responses cancel an incomplete body and settle once", async (t) => {
  const previousKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "synthetic-loopback-key";
  const headersSent = deferred();
  const releaseBody = deferred();
  const responseClosed = deferred();
  const server = await createLoopbackServer(async (request, response) => {
    response.writeHead(429, { "content-type": "application/json" });
    response.flushHeaders();
    response.write("{");
    headersSent.resolve();
    response.once("close", responseClosed.resolve);
    await releaseBody.promise;
    if (!response.destroyed) response.end("}");
  });
  t.after(async () => {
    releaseBody.resolve();
    await server.close();
    if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previousKey;
  });
  const { budget, state } = createBudget();
  const adapter = createDeepSeekApiAdapter(configuration(server.baseUrl), { budget });
  const pending = adapter.execute({ executionId: "loopback-http-error", model: "deepseek-flash", mode: "read_only", prompt: "rate limit", timeoutMs: 3000 });
  await waitFor(headersSent.promise, "unsuccessful response headers");
  const result = await waitFor(pending, "unsuccessful response result");
  await waitFor(responseClosed.promise, "unsuccessful response body cancellation");
  assert.equal(result.reason, "rate_limited");
  assert.equal(result.retryable, true);
  assert.equal(state.settleCalls, 1);
  assert.deepEqual(state.actualCosts, [null]);
  await adapter.cancel("loopback-http-error");
});

test("DeepSeek loopback timeout and socket reset retain distinct result classes", async (t) => {
  const previousKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "synthetic-loopback-key";
  const timeoutHeaders = deferred();
  const timeoutBodyStarted = deferred();
  const releaseTimeout = deferred();
  const socketReset = deferred();
  const server = await createLoopbackServer(async (request, response) => {
    if (request.url.startsWith("/timeout/")) {
      response.writeHead(200, { "content-type": "application/json" });
      response.flushHeaders();
      timeoutHeaders.resolve();
      response.write("{");
      timeoutBodyStarted.resolve();
      await releaseTimeout.promise;
      if (!response.destroyed) response.end("}");
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.flushHeaders();
    response.write("{");
    response.socket.destroy();
    socketReset.resolve();
  });
  t.after(async () => {
    releaseTimeout.resolve();
    await server.close();
    if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previousKey;
  });
  const timeoutBudget = createBudget();
  const timeoutAdapter = createDeepSeekApiAdapter(configuration(`${server.baseUrl}/timeout`, 8192, 150), { budget: timeoutBudget.budget });
  const timeoutRequest = timeoutAdapter.execute({ executionId: "loopback-timeout", model: "deepseek-flash", mode: "read_only", prompt: "timeout", timeoutMs: 150 });
  await Promise.all([waitFor(timeoutHeaders.promise), waitFor(timeoutBodyStarted.promise)]);
  const timeoutResult = await waitFor(timeoutRequest, "request timeout");
  assert.equal(timeoutResult.reason, "timeout");
  assert.equal(timeoutResult.timedOut, true);
  assert.equal(timeoutBudget.state.settleCalls, 1);
  await timeoutAdapter.cancel("loopback-timeout");

  const socketBudget = createBudget();
  const socketAdapter = createDeepSeekApiAdapter(configuration(server.baseUrl), { budget: socketBudget.budget });
  const socketResult = await waitFor(socketAdapter.execute({ executionId: "loopback-socket-reset", model: "deepseek-flash", mode: "read_only", prompt: "reset", timeoutMs: 3000 }), "socket reset result");
  await waitFor(socketReset.promise, "socket reset sent");
  assert.equal(socketResult.reason, "network");
  assert.equal(socketResult.timedOut, false);
  assert.equal(socketBudget.state.settleCalls, 1);
  assert.deepEqual(socketBudget.state.actualCosts, [null]);
});

test("DeepSeek cancellation before or during budget admission starts no HTTP request", async () => {
  const previousKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "synthetic-loopback-key";
  try {
    const reserveStarted = deferred();
    const allowReservation = deferred();
    const state = { settleCalls: 0 };
    let preAbortedReservations = 0;
    let requests = 0;
    const budget = {
      async reserve(executionId, reservedUsd) {
        reserveStarted.resolve();
        await allowReservation.promise;
        return { allowed: true, reservationId: executionId, reservedUsd };
      },
      async settle(reservationId, actualCostUsd) {
        state.settleCalls += 1;
        assert.equal(actualCostUsd, null);
        return { settled: true, actualCostUsd, overBudget: false };
      }
    };
    const preAbortedAdapter = createDeepSeekApiAdapter(configuration("http://127.0.0.1:1"), {
      budget: {
        async reserve(executionId, reservedUsd) { preAbortedReservations += 1; return { allowed: true, reservationId: executionId, reservedUsd }; },
        async settle(reservationId, actualCostUsd) { state.settleCalls += 1; return { settled: true, actualCostUsd, overBudget: false }; }
      },
      fetchImplementation: async () => {
        requests += 1;
        return new Response(successfulPayload());
      }
    });
    const adapter = createDeepSeekApiAdapter(configuration("http://127.0.0.1:1"), {
      budget,
      fetchImplementation: async () => {
        requests += 1;
        return new Response(successfulPayload());
      }
    });
    const preAborted = new AbortController();
    preAborted.abort();
    const beforeAdmission = await preAbortedAdapter.execute({ executionId: "pre-aborted", model: "deepseek-flash", mode: "read_only", prompt: "pre", timeoutMs: 1000, abortSignal: preAborted.signal });
    assert.equal(beforeAdmission.reason, "cancelled");
    assert.equal(preAbortedReservations, 0);
    assert.equal(requests, 0);

    const pending = adapter.execute({ executionId: "admission-cancel", model: "deepseek-flash", mode: "read_only", prompt: "admission", timeoutMs: 1000 });
    await waitFor(reserveStarted.promise, "reservation started");
    await adapter.cancel("admission-cancel");
    allowReservation.resolve();
    const result = await waitFor(pending, "cancelled reservation completion");
    assert.equal(result.reason, "cancelled");
    assert.equal(result.retryable, false);
    assert.equal(requests, 0);
    assert.equal(state.settleCalls, 1);
    await adapter.cancel("admission-cancel");
  } finally {
    if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previousKey;
  }
});

test("DeepSeek adapter rejects a duplicate active execution ID without replacing its request handle", async () => {
  const previousKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "synthetic-loopback-key";
  try {
    const fetchStarted = deferred();
    const { budget, state } = createBudget();
    let requests = 0;
    const adapter = createDeepSeekApiAdapter(configuration("http://127.0.0.1:1"), {
      budget,
      fetchImplementation: async (url, options) => new Promise((resolve, reject) => {
        requests += 1;
        fetchStarted.resolve();
        options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
      })
    });
    const original = adapter.execute({ executionId: "duplicate-adapter-execution", model: "deepseek-flash", mode: "read_only", prompt: "first", timeoutMs: 1000 });
    await waitFor(fetchStarted.promise, "original adapter request started");
    const duplicate = await adapter.execute({ executionId: "duplicate-adapter-execution", model: "deepseek-flash", mode: "read_only", prompt: "second", timeoutMs: 1000 });
    assert.equal(duplicate.reason, "duplicate_execution_id");
    assert.equal(requests, 1);
    assert.equal(state.reserveCalls, 1);
    await adapter.cancel("duplicate-adapter-execution");
    const result = await waitFor(original, "original request cancellation");
    assert.equal(result.reason, "cancelled");
    assert.equal(state.settleCalls, 1);
  } finally {
    if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previousKey;
  }
});

test("DeepSeek timeout remains terminal when cancellation follows while settlement is pending", async () => {
  const previousKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "synthetic-loopback-key";
  try {
    const requestAborted = deferred();
    const settlementStarted = deferred();
    const releaseSettlement = deferred();
    let settleCalls = 0;
    const adapter = createDeepSeekApiAdapter(configuration("http://127.0.0.1:1", 8192, 100), {
      budget: {
        async reserve(executionId, reservedUsd) { return { allowed: true, reservationId: executionId, reservedUsd }; },
        async settle(reservationId, actualCostUsd) {
          settleCalls += 1;
          settlementStarted.resolve();
          await releaseSettlement.promise;
          return { settled: true, actualCostUsd, overBudget: false };
        }
      },
      fetchImplementation: async (url, options) => new Promise((resolve, reject) => {
        options.signal.addEventListener("abort", () => {
          requestAborted.resolve();
          reject(options.signal.reason);
        }, { once: true });
      })
    });
    const pending = adapter.execute({ executionId: "timeout-cancel-race", model: "deepseek-flash", mode: "read_only", prompt: "race", timeoutMs: 100 });
    await waitFor(requestAborted.promise, "timeout aborted the request");
    await waitFor(settlementStarted.promise, "timeout began reservation settlement");
    await adapter.cancel("timeout-cancel-race");
    releaseSettlement.resolve();
    const result = await waitFor(pending, "timeout terminal result");
    assert.equal(result.reason, "timeout");
    assert.equal(result.timedOut, true);
    assert.equal(result.retryable, true);
    assert.equal(settleCalls, 1);
  } finally {
    if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previousKey;
  }
});

test("DeepSeek cancellation during successful settlement retains observed usage without returning success", async () => {
  const previousKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "synthetic-loopback-key";
  try {
    const settlementStarted = deferred();
    const releaseSettlement = deferred();
    let settleCalls = 0;
    const adapter = createDeepSeekApiAdapter(configuration("http://127.0.0.1:1"), {
      budget: {
        async reserve(executionId, reservedUsd) { return { allowed: true, reservationId: executionId, reservedUsd }; },
        async settle(reservationId, actualCostUsd) {
          settleCalls += 1;
          settlementStarted.resolve();
          await releaseSettlement.promise;
          return { settled: true, actualCostUsd, overBudget: false };
        }
      },
      fetchImplementation: async () => new Response(successfulPayload())
    });
    const pending = adapter.execute({ executionId: "successful-settlement-cancel", model: "deepseek-flash", mode: "read_only", prompt: "cancel settlement", timeoutMs: 1000 });
    await waitFor(settlementStarted.promise, "successful request began budget settlement");
    await adapter.cancel("successful-settlement-cancel");
    releaseSettlement.resolve();
    const result = await waitFor(pending, "cancelled successful settlement result");
    assert.equal(result.reason, "cancelled");
    assert.equal(result.timedOut, false);
    assert.equal(result.retryable, false);
    assert.equal(result.metrics.totalCostUsd, 0.0000015);
    assert.deepEqual(result.metrics.usage, { inputTokens: 1, outputTokens: 1 });
    assert.equal(settleCalls, 1);
  } finally {
    if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previousKey;
  }
});
