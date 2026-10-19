import { StringDecoder } from "node:string_decoder";

export const DEFAULT_MAX_JSONL_RECORD_BYTES = 8388608;
export const DEFAULT_MAX_FINAL_RESULT_BYTES = 131072;
const MAX_CLASSIFIER_TEXT_CHARACTERS = 8192;
const supportedBackends = new Set(["codex", "opencode"]);

function createOutputLimitError(scope, limitBytes) {
  const error = new Error(`${scope} output exceeded limit: ${limitBytes} bytes`);
  error.failureClass = "output_limit";
  error.outputLimitScope = scope;
  error.outputLimitBytes = limitBytes;
  return error;
}

function createUtf8Tail() {
  const decoder = new StringDecoder("utf8");
  let text = "";
  return {
    push(chunk) {
      text = `${text}${decoder.write(chunk)}`.slice(-MAX_CLASSIFIER_TEXT_CHARACTERS);
    },
    value() {
      return text;
    }
  };
}

function createJsonlFramer(maxRecordBytes, consumeRecord) {
  let pendingChunks = [];
  let pendingBytes = 0;
  let failed = false;

  const consume = (record) => {
    let end = record.length;
    if (end > 0 && record[end - 1] === 13) end -= 1;
    if (end > maxRecordBytes) throw createOutputLimitError("jsonl_record", maxRecordBytes);
    if (end === 0) return;
    consumeRecord(record.subarray(0, end).toString("utf8"));
  };

  const exceedsRecordLimit = (byteLength, lastByte) => byteLength - (lastByte === 13 ? 1 : 0) > maxRecordBytes;
  const clearPending = () => {
    pendingChunks = [];
    pendingBytes = 0;
  };

  return {
    push(chunk) {
      if (failed) return;
      let start = 0;
      for (let index = 0; index < chunk.length; index += 1) {
        if (chunk[index] !== 10) continue;
        const part = chunk.subarray(start, index);
        const byteLength = pendingBytes + part.length;
        const lastByte = part.length > 0 ? part[part.length - 1] : pendingChunks.at(-1)?.at(-1);
        if (exceedsRecordLimit(byteLength, lastByte)) {
          failed = true;
          throw createOutputLimitError("jsonl_record", maxRecordBytes);
        }
        if (pendingBytes > 0) {
          if (part.length > 0) pendingChunks.push(part);
          consume(Buffer.concat(pendingChunks, byteLength));
          clearPending();
        } else {
          consume(part);
        }
        start = index + 1;
      }
      const remainder = chunk.subarray(start);
      if (remainder.length === 0) return;
      const byteLength = pendingBytes + remainder.length;
      const lastByte = remainder[remainder.length - 1];
      if (exceedsRecordLimit(byteLength, lastByte)) {
        failed = true;
        throw createOutputLimitError("jsonl_record", maxRecordBytes);
      }
      pendingChunks.push(Buffer.from(remainder));
      pendingBytes = byteLength;
    },
    finish() {
      if (pendingBytes > 0) {
        consume(pendingChunks.length === 1 ? pendingChunks[0] : Buffer.concat(pendingChunks, pendingBytes));
      }
      clearPending();
    }
  };
}

function parseRecord(line) {
  try {
    const event = JSON.parse(line);
    return event && typeof event === "object" && !Array.isArray(event) ? event : null;
  } catch {
    return null;
  }
}

function checkFinalResultLimit(text, maxFinalResultBytes) {
  if (Buffer.byteLength(text, "utf8") > maxFinalResultBytes) {
    throw createOutputLimitError("final_result", maxFinalResultBytes);
  }
}

function isStructuredRateLimit(event, acceptedTypes) {
  if (!event || !acceptedTypes.includes(event.type)) return false;
  const error = event.error && typeof event.error === "object" ? event.error : event;
  const code = typeof error.code === "string" ? error.code.toLocaleLowerCase("en-US") : "";
  return ["rate_limited", "too_many_requests", "resource_exhausted"].includes(code);
}

function isFreeTierRestriction(event) {
  if (!event || event.type !== "error") return false;
  const error = event.error && typeof event.error === "object" ? event.error : event;
  const data = error.data && typeof error.data === "object" ? error.data : null;
  if (data?.statusCode !== 403 || typeof data.responseBody !== "string") return false;
  try {
    return JSON.parse(data.responseBody)?.error?.type === "FreeTierError";
  } catch {
    return false;
  }
}

function createBaseReducer(backend, { maxJsonlRecordBytes, maxFinalResultBytes }) {
  const stderrTail = createUtf8Tail();
  const result = {
    backend,
    text: "",
    usage: null,
    invalidOutput: false,
    rateLimited: false,
    freeTierRestriction: false,
    modelAccessDenied: false,
    terminalType: null,
    terminalCode: null,
    stderrText: ""
  };
  const consume = backend === "codex"
    ? (line) => {
        const event = parseRecord(line);
        if (!event || typeof event.type !== "string") {
          result.invalidOutput = true;
          return;
        }
        if (["turn.completed", "turn.failed", "error"].includes(event.type)) {
          result.terminalType = event.type;
          const error = event.error && typeof event.error === "object" ? event.error : event;
          result.terminalCode = typeof error.code === "string" ? error.code : null;
          result.rateLimited = isStructuredRateLimit(event, ["turn.failed", "error"]);
        }
        if (event.type === "item.completed" && event.item?.type === "agent_message" && typeof event.item.text === "string") {
          const text = event.item.text.trim();
          if (text) {
            checkFinalResultLimit(text, maxFinalResultBytes);
            result.text = text;
          }
        }
      }
    : (line) => {
        const event = parseRecord(line);
        if (!event) return;
        if (event.type === "text" && typeof event.part?.text === "string" && event.part.text) {
          const text = `${result.text ? `${result.text}\n` : ""}${event.part.text}`;
          checkFinalResultLimit(text, maxFinalResultBytes);
          result.text = text;
        }
        if (event.type === "step_finish" && event.part?.tokens) {
          const tokenDetails = event.part.tokens;
          const tokens = {};
          for (const key of ["total", "input", "output", "reasoning"]) {
            if (Number.isFinite(tokenDetails[key])) tokens[key] = tokenDetails[key];
          }
          if (tokenDetails.cache && typeof tokenDetails.cache === "object") {
            const cache = {};
            for (const key of ["read", "write"]) {
              if (Number.isFinite(tokenDetails.cache[key])) cache[key] = tokenDetails.cache[key];
            }
            if (Object.keys(cache).length > 0) tokens.cache = cache;
          }
          const usage = {
            tokens,
            ...(Number.isFinite(event.part.cost) ? { cost: event.part.cost } : {})
          };
          result.usage = usage;
        }
        result.rateLimited ||= isStructuredRateLimit(event, ["error"]);
        result.freeTierRestriction ||= isFreeTierRestriction(event);
        const error = event.error && typeof event.error === "object" ? event.error : event;
        const message = [error.message, error.data?.message, error.data?.responseBody].filter((value) => typeof value === "string").join(" ");
        result.modelAccessDenied ||= /subscription plan does not yet include access|plan does not include access|model access (?:is )?not included/i.test(message);
      };
  const framer = createJsonlFramer(maxJsonlRecordBytes, consume);

  return {
    onStdout(chunk) {
      framer.push(chunk);
    },
    onStderr(chunk) {
      stderrTail.push(chunk);
    },
    finish() {
      framer.finish();
      result.stderrText = stderrTail.value();
      return { ...result };
    },
    snapshot() {
      result.stderrText = stderrTail.value();
      return { ...result };
    }
  };
}

export function createJsonlOutputReducer(backend, options = {}) {
  if (!supportedBackends.has(backend)) throw new TypeError("unsupported JSONL reducer backend");
  const maxJsonlRecordBytes = options.maxJsonlRecordBytes ?? DEFAULT_MAX_JSONL_RECORD_BYTES;
  const maxFinalResultBytes = options.maxFinalResultBytes ?? DEFAULT_MAX_FINAL_RESULT_BYTES;
  if (!Number.isSafeInteger(maxJsonlRecordBytes) || maxJsonlRecordBytes < 1) throw new RangeError("maxJsonlRecordBytes must be a positive safe integer");
  if (!Number.isSafeInteger(maxFinalResultBytes) || maxFinalResultBytes < 1) throw new RangeError("maxFinalResultBytes must be a positive safe integer");
  return createBaseReducer(backend, { maxJsonlRecordBytes, maxFinalResultBytes });
}
