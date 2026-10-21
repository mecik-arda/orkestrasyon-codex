import test from "node:test";
import assert from "node:assert/strict";
import { createJsonlOutputReducer, DEFAULT_MAX_FINAL_RESULT_BYTES, DEFAULT_MAX_JSONL_RECORD_BYTES } from "../subagent-bridge/src/services/jsonl-output-reducer.js";

test("Codex JSONL reducer handles split UTF-8, CRLF, multiple records and an unterminated EOF record", () => {
  const reducer = createJsonlOutputReducer({ maxJsonlRecordBytes: 4096, maxFinalResultBytes: 4096 });
  const bytes = Buffer.from([
    JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "sonuç 🙂" } }),
    JSON.stringify({ type: "turn.completed", usage: { input_tokens: 4, output_tokens: 8 } })
  ].join("\r\n"), "utf8");
  const emojiOffset = bytes.indexOf(Buffer.from("🙂")) + 2;
  reducer.onStdout(bytes.subarray(0, emojiOffset));
  reducer.onStdout(bytes.subarray(emojiOffset, emojiOffset + 5));
  reducer.onStdout(bytes.subarray(emojiOffset + 5));
  const result = reducer.finish();
  assert.equal(result.text, "sonuç 🙂");
  assert.equal(result.terminalType, "turn.completed");
});

test("Codex JSONL reducer rejects record and final-result overflow without retaining the overflowing payload", () => {
  const recordReducer = createJsonlOutputReducer({ maxJsonlRecordBytes: 64, maxFinalResultBytes: 32 });
  assert.throws(() => recordReducer.onStdout(Buffer.from(`${JSON.stringify({ type: "noise", value: "x".repeat(128) })}\n`)), (error) => {
    assert.equal(error.failureClass, "output_limit");
    assert.equal(error.outputLimitScope, "jsonl_record");
    return true;
  });

  const resultReducer = createJsonlOutputReducer({ maxJsonlRecordBytes: 1024, maxFinalResultBytes: 8 });
  assert.throws(() => resultReducer.onStdout(Buffer.from(`${JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "x".repeat(9) } })}\n`)), (error) => {
    assert.equal(error.failureClass, "output_limit");
    assert.equal(error.outputLimitScope, "final_result");
    return true;
  });
});

test("Codex JSONL reducer captures bounded terminal diagnostics and recognizes structured rate limits", () => {
  const reducer = createJsonlOutputReducer({ maxJsonlRecordBytes: DEFAULT_MAX_JSONL_RECORD_BYTES, maxFinalResultBytes: DEFAULT_MAX_FINAL_RESULT_BYTES });
  reducer.onStderr(Buffer.from("e".repeat(10000)));
  reducer.onStdout(Buffer.from(`${JSON.stringify({ type: "turn.failed", error: { code: "resource_exhausted" } })}\n`));
  const result = reducer.finish();
  assert.equal(result.rateLimited, true);
  assert.equal(result.terminalCode, "resource_exhausted");
  assert.equal(result.stderrText.length, 8192);
});
