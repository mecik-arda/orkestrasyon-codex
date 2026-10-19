import test from "node:test";
import assert from "node:assert/strict";
import { createCodexAdapter } from "../subagent-bridge/src/adapters/codex-adapter.js";
import { createOpenCodeAdapter } from "../subagent-bridge/src/adapters/opencode-adapter.js";
import { createJsonlOutputReducer, DEFAULT_MAX_FINAL_RESULT_BYTES, DEFAULT_MAX_JSONL_RECORD_BYTES } from "../subagent-bridge/src/services/jsonl-output-reducer.js";
import { runProcess } from "../subagent-bridge/src/services/execution-service.js";

function createRequest(backend, executionId, overrides = {}) {
  return {
    executionId,
    backend,
    prompt: "Analyze the selected snapshot.",
    model: backend === "codex" ? "gpt-6.1-sol" : "deepseek/deepseek-v4-pro",
    mode: "read_only",
    workspace: process.cwd(),
    delegationDepth: 0,
    caller: "parallel_batch",
    timeoutMs: 15000,
    maxOutputBytes: 1048576,
    ...overrides
  };
}

test("JSONL reducer handles split UTF-8, CRLF, multiple records and an unterminated EOF record", () => {
  const reducer = createJsonlOutputReducer("opencode", { maxJsonlRecordBytes: 4096, maxFinalResultBytes: 4096 });
  const bytes = Buffer.from([
    JSON.stringify({ type: "text", part: { text: "sonuç 🙂" } }),
    JSON.stringify({ type: "step_finish", part: { tokens: { total: 12, input: 4, output: 8, arbitrary: "discard" }, cost: 0.01, extra: "discard" } }),
    JSON.stringify({ type: "text", part: { text: "tamamlandı" } })
  ].join("\r\n"), "utf8");
  const emojiOffset = bytes.indexOf(Buffer.from("🙂")) + 2;
  reducer.onStdout(bytes.subarray(0, emojiOffset));
  reducer.onStdout(bytes.subarray(emojiOffset, emojiOffset + 5));
  reducer.onStdout(bytes.subarray(emojiOffset + 5));
  const result = reducer.finish();
  assert.equal(result.text, "sonuç 🙂\ntamamlandı");
  assert.deepEqual(result.usage, { tokens: { total: 12, input: 4, output: 8 }, cost: 0.01 });
});

test("JSONL reducer rejects record and final-result overflow without retaining the overflowing payload", () => {
  const recordReducer = createJsonlOutputReducer("codex", { maxJsonlRecordBytes: 64, maxFinalResultBytes: 32 });
  assert.throws(() => recordReducer.onStdout(Buffer.from(`${JSON.stringify({ type: "noise", value: "x".repeat(128) })}\n`)), (error) => {
    assert.equal(error.failureClass, "output_limit");
    assert.equal(error.outputLimitScope, "jsonl_record");
    return true;
  });

  const resultReducer = createJsonlOutputReducer("codex", { maxJsonlRecordBytes: 1024, maxFinalResultBytes: 8 });
  assert.throws(() => resultReducer.onStdout(Buffer.from(`${JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "x".repeat(9) } })}\n`)), (error) => {
    assert.equal(error.failureClass, "output_limit");
    assert.equal(error.outputLimitScope, "final_result");
    return true;
  });
});

test("JSONL reducer accepts an 8 MiB record boundary and three concurrent bounded worker streams stay below the RSS gate", async () => {
  const recordReducer = createJsonlOutputReducer("codex", { maxJsonlRecordBytes: DEFAULT_MAX_JSONL_RECORD_BYTES, maxFinalResultBytes: DEFAULT_MAX_FINAL_RESULT_BYTES });
  const prefix = '{"type":"item.completed","item":{"type":"command_execution","aggregated_output":"';
  const suffix = '"}}';
  const fillerLength = DEFAULT_MAX_JSONL_RECORD_BYTES - Buffer.byteLength(prefix) - Buffer.byteLength(suffix);
  const record = Buffer.from(`${prefix}${"x".repeat(fillerLength)}${suffix}\n`);
  assert.equal(record.length, DEFAULT_MAX_JSONL_RECORD_BYTES + 1);
  recordReducer.onStdout(record.subarray(0, record.length - 1));
  recordReducer.onStdout(record.subarray(record.length - 1));
  assert.equal(recordReducer.finish().text, "");

  const baselineRss = process.memoryUsage().rss;
  let peakRss = baselineRss;
  const sample = setInterval(() => {
    peakRss = Math.max(peakRss, process.memoryUsage().rss);
  }, 10);
  const workerScript = `const payload = JSON.stringify({type:"item.completed",item:{type:"command_execution",aggregated_output:"x".repeat(5500000)}})+"\\n"; process.stdout.write(payload, () => setTimeout(() => { process.stdout.write(JSON.stringify({type:"item.completed",item:{type:"agent_message",text:"a".repeat(131072)}})+"\\n", () => setTimeout(() => process.exit(0), 80)); }, 80));`;
  try {
    const results = await Promise.all(["codex", "codex", "codex"].map((backend) => {
      const reducer = createJsonlOutputReducer(backend);
      return runProcess(process.execPath, ["-e", workerScript], {
        timeoutMs: 15000,
        maxOutputBytes: 8388608,
        streamingOutputConsumer: reducer
      });
    }));
    peakRss = Math.max(peakRss, process.memoryUsage().rss);
    assert.equal(results.length, 3);
    assert.equal(results.every((result) => result.code === 0 && result.streamResult.text.length === DEFAULT_MAX_FINAL_RESULT_BYTES), true);
    assert.equal(results.every((result) => result.acceptedStdoutBytes < 8388608), true);
  } finally {
    clearInterval(sample);
  }
  assert.equal(peakRss - baselineRss <= 128 * 1024 * 1024, true, `RSS delta exceeded gate: ${peakRss - baselineRss}`);
});

test("parallel Codex and OpenCode reducers discard large tool events and retain only final response metadata", async () => {
  const codexScript = `const events=[{type:"item.completed",item:{type:"command_execution",aggregated_output:"CODEX_TOOL_PAYLOAD_SENTINEL".repeat(4000)}},{type:"item.completed",item:{type:"agent_message",text:"Codex final answer"}},{type:"turn.completed"}];process.stdout.write(events.map((event)=>JSON.stringify(event)).join("\\n")+"\\n");`;
  const codexAdapter = createCodexAdapter({ codex: { executable: process.execPath, execArgs: ["-e", codexScript] } });
  const codexResult = await codexAdapter.execute(createRequest("codex", "stream-codex-tool-payload"));
  assert.equal(codexResult.ok, true, JSON.stringify(codexResult));
  assert.equal(codexResult.result, "Codex final answer");
  assert.equal(codexResult.result.includes("CODEX_TOOL_PAYLOAD_SENTINEL"), false);
  assert.equal(codexResult.metrics.diagnostics.stdoutBytes, 0);
  assert.equal(codexResult.metrics.diagnostics.acceptedStdoutBytes > 65536, true);

  const opencodeScript = `const events=[{type:"tool_use",part:{id:"tool-1",state:{output:"OPENCODE_TOOL_PAYLOAD_SENTINEL".repeat(4000)}}},{type:"text",part:{text:"OpenCode final answer"}},{type:"step_finish",part:{tokens:{total:9,input:4,output:5},cost:0.02}}];process.stdout.write(events.map((event)=>JSON.stringify(event)).join("\\n")+"\\n");`;
  const opencodeAdapter = createOpenCodeAdapter({
    opencode: { executable: process.execPath, execArgs: ["-e", opencodeScript], allowedModels: ["deepseek/deepseek-v4-pro"] }
  });
  const opencodeResult = await opencodeAdapter.execute(createRequest("opencode", "stream-opencode-tool-payload"));
  assert.equal(opencodeResult.ok, true, JSON.stringify(opencodeResult));
  assert.equal(opencodeResult.result, "OpenCode final answer");
  assert.equal(opencodeResult.result.includes("OPENCODE_TOOL_PAYLOAD_SENTINEL"), false);
  assert.equal(opencodeResult.metrics.diagnostics.stdoutBytes, 0);
  assert.equal(opencodeResult.metrics.diagnostics.acceptedStdoutBytes > 65536, true);
  assert.equal(opencodeResult.artifacts.summary.includes("arbitrary"), false);
});

test("parallel streaming classifies terminal Codex rate limits and OpenCode FreeTier denials", async () => {
  const codexEvents = [
    { type: "turn.failed", error: { code: "rate_limited", message: "provider refused" } }
  ];
  const codexAdapter = createCodexAdapter({ codex: { executable: process.execPath, execArgs: ["-e", `process.stdout.write(${JSON.stringify(`${codexEvents.map((event) => JSON.stringify(event)).join("\n")}\n`)}); process.exit(7);`] } });
  const codexResult = await codexAdapter.execute(createRequest("codex", "stream-codex-rate-limit"));
  assert.equal(codexResult.ok, false);
  assert.equal(codexResult.reason, "rate_limited");
  assert.equal(codexResult.retryable, true);

  const responseBody = JSON.stringify({ error: { type: "FreeTierError" } });
  const errorEvent = { type: "error", error: { name: "APIError", data: { statusCode: 403, responseBody } } };
  const opencodeAdapter = createOpenCodeAdapter({
    opencode: { executable: process.execPath, execArgs: ["-e", `process.stdout.write(${JSON.stringify(`${JSON.stringify(errorEvent)}\n`)}); process.exit(1);`], allowedModels: ["deepseek/deepseek-v4-pro"] }
  });
  const opencodeResult = await opencodeAdapter.execute(createRequest("opencode", "stream-opencode-free-tier"));
  assert.equal(opencodeResult.ok, false);
  assert.equal(opencodeResult.error, "OpenCode Free Tier rejected CLI access");
  assert.equal(opencodeResult.retryable, false);
});

test("parallel streaming fails closed when the final message exceeds 128 KiB", async () => {
  const script = `const events=[{type:"item.completed",item:{type:"agent_message",text:"x".repeat(140000)}},{type:"turn.completed"}];process.stdout.write(events.map((event)=>JSON.stringify(event)).join("\\n")+"\\n");`;
  const adapter = createCodexAdapter({ codex: { executable: process.execPath, execArgs: ["-e", script] } });
  const result = await adapter.execute(createRequest("codex", "stream-final-result-limit", { maxOutputBytes: 1048576 }));
  assert.equal(result.ok, false);
  assert.equal(result.reason, "output_limit");
  assert.equal(result.result, null);
  assert.equal(result.metrics.diagnostics.outputLimitScope, "final_result");
  assert.equal(result.metrics.diagnostics.outputLimitBytes, DEFAULT_MAX_FINAL_RESULT_BYTES);
  assert.equal(Number.isSafeInteger(result.metrics.diagnostics.acceptedStdoutBytes), true);
});

test("parallel OpenCode keeps provider access classification when stderr phrases cross chunks", async () => {
  const script = `process.stderr.write("subscription plan does not ");setTimeout(()=>{process.stderr.write("yet include access to the selected model");process.exit(1)},40);`;
  const adapter = createOpenCodeAdapter({
    opencode: { executable: process.execPath, execArgs: ["-e", script], allowedModels: ["deepseek/deepseek-v4-pro"] }
  });
  const result = await adapter.execute(createRequest("opencode", "stream-split-model-access-denial"));
  assert.equal(result.ok, false);
  assert.equal(result.reason, "model_access_denied");
  assert.equal(result.retryable, false);
  assert.equal(result.metrics.diagnostics.acceptedStderrBytes > 0, true);
});

test("parallel OpenCode classifies bounded authentication diagnostics from stderr", async () => {
  const script = `process.stderr.write("authentication failed: invalid api key");process.exit(1);`;
  const adapter = createOpenCodeAdapter({
    opencode: { executable: process.execPath, execArgs: ["-e", script], allowedModels: ["deepseek/deepseek-v4-pro"] }
  });
  const result = await adapter.execute(createRequest("opencode", "stream-auth-diagnostic"));
  assert.equal(result.ok, false);
  assert.equal(result.reason, "auth_invalid");
  assert.equal(result.retryable, false);
});

test("parallel streaming timeout retains diagnostics without returning an incomplete final result", async () => {
  const script = `process.stdout.write(JSON.stringify({type:"text",part:{text:"partial"}})+"\\n");setTimeout(()=>{},5000);`;
  const adapter = createOpenCodeAdapter({
    opencode: { executable: process.execPath, execArgs: ["-e", script], allowedModels: ["deepseek/deepseek-v4-pro"] }
  });
  const result = await adapter.execute(createRequest("opencode", "stream-timeout", { timeoutMs: 100 }));
  assert.equal(result.ok, false);
  assert.equal(result.reason, "timeout");
  assert.equal(result.result, null);
  assert.equal(Number.isSafeInteger(result.metrics.diagnostics.acceptedStdoutBytes), true);
});

test("parallel OpenCode classifies no-text completion as bounded-retry empty_output and retains reported cost", async () => {
  const events = [
    { type: "reasoning", part: { text: "PRIVATE_REASONING_SENTINEL" } },
    { type: "step_finish", part: { tokens: { total: 13, input: 4, output: 0, reasoning: 9 }, cost: 0.003 } }
  ];
  const script = `const events=${JSON.stringify(events)};process.stdout.write(events.map((event)=>JSON.stringify(event)).join("\\n")+"\\n");`;
  const adapter = createOpenCodeAdapter({
    opencode: { executable: process.execPath, execArgs: ["-e", script], allowedModels: ["deepseek/deepseek-v4-pro"] }
  });
  const result = await adapter.execute(createRequest("opencode", "stream-empty-output-retry"));
  assert.equal(result.ok, false);
  assert.equal(result.reason, "empty_output");
  assert.equal(result.retryable, true);
  assert.equal(result.exitCode, 0);
  assert.equal(result.metrics.totalCostUsd, 0.003);
  assert.equal(result.metrics.diagnostics.acceptedStdoutBytes > 0, true);
  assert.equal(JSON.stringify(result).includes("PRIVATE_REASONING_SENTINEL"), false);
});

test("process output counters preserve the first overflow snapshot and accept an exact byte limit", async () => {
  const consumer = { onStdout() {}, onStderr() {}, snapshot() { return {}; }, finish() { return {}; } };
  const overflow = runProcess(process.execPath, ["-e", "process.stdout.write('1234'); setTimeout(() => process.stdout.write('x'), 80); setTimeout(() => process.stdout.write('later'), 160);"], {
    timeoutMs: 5000,
    maxOutputBytes: 4,
    streamingOutputConsumer: consumer
  });
  await assert.rejects(overflow, (error) => {
    assert.equal(error.outputLimitScope, "process");
    assert.equal(error.acceptedStdoutBytes, 4);
    assert.equal(error.acceptedStderrBytes, 0);
    assert.equal(error.rejectedChunkBytes, 1);
    assert.equal(error.outputBytesObserved, error.acceptedStdoutBytes + error.acceptedStderrBytes + error.rejectedChunkBytes);
    return true;
  });

  const exact = await runProcess(process.execPath, ["-e", "process.stdout.write('1234')"], {
    timeoutMs: 5000,
    maxOutputBytes: 4,
    streamingOutputConsumer: consumer
  });
  assert.equal(exact.acceptedStdoutBytes, 4);
  assert.equal(exact.rejectedChunkBytes, 0);
});

test("streaming process errors retain byte snapshots on spawn and graceful-timeout close paths", async () => {
  const consumer = { onStdout() {}, onStderr() {}, snapshot() { return { snapshotReady: true }; }, finish() { return {}; } };
  await assert.rejects(runProcess("missing-streaming-executable", [], { timeoutMs: 5000, streamingOutputConsumer: consumer }), (error) => {
    assert.equal(error.streamResult.snapshotReady, true);
    assert.equal(error.acceptedStdoutBytes, 0);
    assert.equal(error.acceptedStderrBytes, 0);
    assert.equal(error.rejectedChunkBytes, 0);
    return true;
  });

  await assert.rejects(runProcess(process.execPath, ["-e", "process.stdin.resume(); process.stdin.on('end', () => process.exit(0));"], {
    timeoutMs: 80,
    gracefulShutdownMs: 1000,
    keepStdinOpen: true,
    streamingOutputConsumer: consumer
  }), (error) => {
    assert.match(error.message, /timed out/i);
    assert.equal(error.streamResult.snapshotReady, true);
    assert.equal(error.acceptedStdoutBytes, 0);
    assert.equal(error.acceptedStderrBytes, 0);
    return true;
  });
});
