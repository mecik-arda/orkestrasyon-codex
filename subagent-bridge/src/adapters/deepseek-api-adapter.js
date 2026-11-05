import crypto from "node:crypto";
import { TextDecoder } from "node:util";
import { createAdapter } from "./agent-adapter-base.js";
import { createFailureSubagentResult, createSuccessSubagentResult } from "../schemas/core-schemas.js";

export const DEEPSEEK_API_MODEL_ID = "deepseek-flash";
export const DEEPSEEK_API_BASE_URL = "https://api.deepseek.com";
export const DEEPSEEK_PEAK_INPUT_PRICE_PER_MILLION = 0.3;
export const DEEPSEEK_PEAK_OUTPUT_PRICE_PER_MILLION = 1.2;

const outputLimitCode = "DEEPSEEK_RESPONSE_BODY_LIMIT";

function createOutputLimitError(limitBytes, observedBytes) {
  const error = new Error("DeepSeek API response body exceeded the configured byte limit");
  error.code = outputLimitCode;
  error.outputLimitBytes = limitBytes;
  error.outputBytesObserved = observedBytes;
  return error;
}

function cancelResponseBody(response, reason) {
  try {
    const cancellation = response?.body?.cancel(reason);
    if (cancellation && typeof cancellation.catch === "function") cancellation.catch(() => {});
  } catch {
  }
}

function cancelReader(reader, reason) {
  try {
    const cancellation = reader.cancel(reason);
    if (cancellation && typeof cancellation.catch === "function") cancellation.catch(() => {});
  } catch {
  }
}

function readWithAbort(reader, signal) {
  if (!signal) return reader.read();
  if (signal.aborted) return Promise.reject(signal.reason || new Error("DeepSeek response read aborted"));
  return new Promise((resolve, reject) => {
    const finish = (callback, value) => {
      signal.removeEventListener("abort", abort);
      callback(value);
    };
    const abort = () => finish(reject, signal.reason || new Error("DeepSeek response read aborted"));
    signal.addEventListener("abort", abort, { once: true });
    reader.read().then((value) => finish(resolve, value), (error) => finish(reject, error));
  });
}

async function readBoundedResponseBytes(response, maxOutputBytes, signal) {
  const reader = response?.body?.getReader?.();
  if (!reader) return Buffer.alloc(0);
  const chunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      const result = await readWithAbort(reader, signal);
      if (result.done) break;
      if (!(result.value instanceof Uint8Array)) throw new TypeError("DeepSeek response stream returned a non-byte chunk");
      const chunkBytes = result.value.byteLength;
      if (chunkBytes > maxOutputBytes - totalBytes) {
        throw createOutputLimitError(maxOutputBytes, totalBytes + chunkBytes);
      }
      chunks.push(Buffer.from(result.value));
      totalBytes += chunkBytes;
    }
    return Buffer.concat(chunks, totalBytes);
  } catch (error) {
    cancelReader(reader, error);
    throw error;
  } finally {
    try {
      reader.releaseLock();
    } catch {
    }
  }
}

function parseJsonResponseBytes(bytes) {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  return JSON.parse(text);
}

function calculatePeakCostUsd(promptBytes, outputTokens) {
  const reservedInputTokens = promptBytes * 4;
  return (reservedInputTokens * DEEPSEEK_PEAK_INPUT_PRICE_PER_MILLION + outputTokens * DEEPSEEK_PEAK_OUTPUT_PRICE_PER_MILLION) / 1000000;
}

function calculateObservedPeakCostUsd(usage) {
  const inputTokens = usage.prompt_tokens;
  const outputTokens = usage.completion_tokens;
  if (!Number.isSafeInteger(inputTokens) || inputTokens < 0 || !Number.isSafeInteger(outputTokens) || outputTokens < 0) return null;
  return (inputTokens * DEEPSEEK_PEAK_INPUT_PRICE_PER_MILLION + outputTokens * DEEPSEEK_PEAK_OUTPUT_PRICE_PER_MILLION) / 1000000;
}

function createDiagnostics(providerCode, providerExecutionMs, failureStage = "provider_execution") {
  return {
    failureStage,
    providerCode,
    settingsLockWaitMs: null,
    providerExecutionMs,
    stdoutBytes: null,
    stderrBytes: null
  };
}

function failureReason(status) {
  if (status === 401) return { reason: "authentication_failure", retryable: false, providerCode: "unauthenticated" };
  if (status === 402) return { reason: "insufficient_balance", retryable: false, providerCode: "unclassified" };
  if (status === 403) return { reason: "permission_denied", retryable: false, providerCode: "permission_denied" };
  if (status === 429) return { reason: "rate_limited", retryable: true, providerCode: "rate_limited" };
  if (status >= 500) {
    const providerCode = status === 502 ? "bad_gateway" : status === 503 ? "unavailable" : status === 504 ? "gateway_timeout" : "internal_error";
    return { reason: "server", retryable: true, providerCode };
  }
  return { reason: "invalid_model", retryable: false, providerCode: "unclassified" };
}

function createController(request, activeRequests) {
  const controller = new AbortController();
  const handle = {
    controller,
    timeout: null,
    abortSignal: request.abortSignal,
    abort: null,
    abortKind: null
  };
  const abort = (kind, reason) => {
    if (controller.signal.aborted) return false;
    handle.abortKind = kind;
    controller.abort(reason);
    return true;
  };
  handle.abort = () => abort("cancelled", request.abortSignal?.reason || new Error("DeepSeek request cancelled"));
  request.abortSignal?.addEventListener("abort", handle.abort, { once: true });
  activeRequests.set(request.executionId, handle);
  handle.stopTimeout = () => {
    if (handle.timeout) clearTimeout(handle.timeout);
    handle.timeout = null;
  };
  handle.startTimeout = (timeoutMs) => {
    if (controller.signal.aborted) return;
    handle.timeout = setTimeout(() => abort("timeout", new Error("DeepSeek request timed out")), timeoutMs);
  };
  handle.cancel = () => {
    handle.stopTimeout();
    return abort("cancelled", new Error("DeepSeek request cancelled"));
  };
  handle.release = () => {
    handle.stopTimeout();
    request.abortSignal?.removeEventListener("abort", handle.abort);
    if (activeRequests.get(request.executionId) === handle) activeRequests.delete(request.executionId);
  };
  return handle;
}

export function createDeepSeekApiAdapter(configuration, options = {}) {
  const fetchImplementation = options.fetchImplementation || globalThis.fetch;
  const budget = options.budget || {
    async reserve() { return { allowed: false, reason: "budget_state_unavailable" }; },
    async settle() { return { settled: false, overBudget: true }; }
  };
  const model = configuration.deepseek.apiModel;
  const baseUrl = configuration.deepseek.apiBaseUrl;
  const maxPromptBytes = configuration.deepseek.maxPromptBytes;
  const maxOutputTokens = configuration.deepseek.maxOutputTokens;
  const configuredMaxOutputBytes = configuration.deepseek.maxOutputBytes;
  const timeoutMs = configuration.deepseek.timeoutMs;
  const activeRequests = new Map();
  const adapter = createAdapter("deepseek", {
    canRead: true,
    canWrite: true,
    supportsSandbox: true,
    supportsModelSelection: true
  });

  return {
    ...adapter,
    async healthCheck() {
      const apiKey = process.env.DEEPSEEK_API_KEY;
      return {
        installed: true,
        version: "1.0.0",
        authValid: typeof apiKey === "string" && apiKey.length > 0,
        executable: "https"
      };
    },
    async execute(request) {
      const editPilotAllowed = request.mode === "edit" && request.caller === "deepseek_edit_pilot";
      if (request.mode !== "read_only" && !editPilotAllowed) {
        return createFailureSubagentResult("deepseek", model, {
          error: "DeepSeek API edit mode is limited to the disposable edit pilot",
          reason: "mode_not_allowed",
          durationMs: 0,
          exitCode: 1
        });
      }
      if (request.model !== model) {
        return createFailureSubagentResult("deepseek", request.model || "unknown", {
          error: "DeepSeek API model is not allowed",
          reason: "invalid_model",
          durationMs: 0,
          exitCode: 1
        });
      }
      const apiKey = process.env.DEEPSEEK_API_KEY;
      if (typeof apiKey !== "string" || apiKey.length === 0) {
        return createFailureSubagentResult("deepseek", model, {
          error: "DeepSeek API authentication is unavailable",
          reason: "authentication_failure",
          durationMs: 0,
          exitCode: 1
        });
      }
      const requestedMaxOutputBytes = request.maxOutputBytes ?? configuredMaxOutputBytes;
      if (!Number.isSafeInteger(configuredMaxOutputBytes) || configuredMaxOutputBytes <= 0 || configuredMaxOutputBytes > 8388608
        || !Number.isSafeInteger(requestedMaxOutputBytes) || requestedMaxOutputBytes <= 0) {
        return createFailureSubagentResult("deepseek", model, {
          error: "DeepSeek API response byte limit is unavailable",
          reason: "unclassified",
          durationMs: 0,
          exitCode: 1
        });
      }
      const maxResponseBodyBytes = Math.min(configuredMaxOutputBytes, requestedMaxOutputBytes);
      const prompt = request.reviewSourcePayload ? `${request.prompt}\n\n${request.reviewSourcePayload}` : request.prompt;
      const body = {
        model,
        messages: [
          { role: "system", content: editPilotAllowed ? "Return one JSON object matching the requested disposable patch schema. Do not use tools, run commands, access the network, or modify files." : "Return one JSON object matching the requested schema. Do not use tools or modify files." },
          { role: "user", content: prompt }
        ],
        max_tokens: Math.min(request.maxOutputTokens || maxOutputTokens, maxOutputTokens),
        response_format: { type: "json_object" },
        thinking: { type: "disabled" },
        stream: false
      };
      const requestBody = JSON.stringify(body);
      const promptBytes = Buffer.byteLength(requestBody, "utf8");
      if (promptBytes > maxPromptBytes) {
        return createFailureSubagentResult("deepseek", model, {
          error: "DeepSeek request exceeded the configured prompt byte limit",
          reason: "prompt_transport_limit",
          durationMs: 0,
          exitCode: 1,
          metrics: { totalCostUsd: 0, reservedCostUsd: 0 }
        });
      }
      const reservedUsd = calculatePeakCostUsd(promptBytes, body.max_tokens);
      const startedAt = Date.now();
      const cancellationResult = (reservedCostUsd, totalCostUsd = reservedCostUsd === 0 ? 0 : null, usage = null) => createFailureSubagentResult("deepseek", model, {
        error: "DeepSeek API request was cancelled",
        reason: "cancelled",
        retryable: false,
        timedOut: false,
        exitCode: null,
        durationMs: Date.now() - startedAt,
        metrics: { totalCostUsd, reservedCostUsd, ...(usage ? { usage } : {}) }
      });
      if (request.abortSignal?.aborted) return cancellationResult(0);
      if (activeRequests.has(request.executionId)) {
        return createFailureSubagentResult("deepseek", model, {
          error: "DeepSeek API execution ID is already active",
          reason: "duplicate_execution_id",
          durationMs: 0,
          exitCode: 1,
          metrics: { totalCostUsd: 0, reservedCostUsd: 0 }
        });
      }
      const handle = createController(request, activeRequests);
      const controller = handle.controller;
      let reservation;
      let settlementAttempted = false;
      const settleReservation = async (actualCostUsd) => {
        if (settlementAttempted) return { settled: false, overBudget: false };
        settlementAttempted = true;
        try {
          return await budget.settle(reservation.reservationId, actualCostUsd);
        } catch {
          return { settled: false, overBudget: false };
        }
      };
      try {
        try {
          reservation = await budget.reserve(request.executionId, reservedUsd);
        } catch {
          reservation = { allowed: false, reason: "budget_state_unavailable" };
        }
        if (handle.abortKind === "cancelled") {
          if (reservation?.allowed === true) await settleReservation(null);
          return cancellationResult(reservation?.allowed === true ? reservation.reservedUsd : 0);
        }
        if (reservation?.allowed !== true) {
          return createFailureSubagentResult("deepseek", model, {
            error: "DeepSeek pilot budget admission rejected the request",
            reason: reservation?.reason || "budget_exhausted",
            durationMs: Date.now() - startedAt,
            exitCode: 1,
            metrics: { totalCostUsd: 0, reservedCostUsd: 0 }
          });
        }
        handle.startTimeout(Math.min(request.timeoutMs || timeoutMs, timeoutMs));
        if (handle.abortKind === "cancelled") {
          await settleReservation(null);
          return cancellationResult(reservation.reservedUsd);
        }
        const response = await fetchImplementation(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${apiKey}`,
            "content-type": "application/json"
          },
          body: requestBody,
          signal: controller.signal
        });
        if (!response.ok) {
          const failure = failureReason(response.status);
          handle.stopTimeout();
          cancelResponseBody(response);
          await settleReservation(null);
          if (handle.abortKind === "cancelled") return cancellationResult(reservation.reservedUsd);
          return createFailureSubagentResult("deepseek", model, {
            error: "DeepSeek API returned an unsuccessful response",
            reason: failure.reason,
            retryable: failure.retryable,
            timedOut: false,
            exitCode: response.status,
            durationMs: Date.now() - startedAt,
            metrics: {
              totalCostUsd: null,
              reservedCostUsd: reservation.reservedUsd,
              diagnostics: createDiagnostics(failure.providerCode, Date.now() - startedAt)
            }
          });
        }
        const responseBytes = await readBoundedResponseBytes(response, maxResponseBodyBytes, controller.signal);
        handle.stopTimeout();
        let payload;
        try {
          payload = parseJsonResponseBytes(responseBytes);
        } catch {
          await settleReservation(null);
          if (handle.abortKind === "cancelled") return cancellationResult(reservation.reservedUsd);
          return createFailureSubagentResult("deepseek", model, {
            error: "DeepSeek API response body was not valid UTF-8 JSON",
            reason: "output_parse_invalid",
            retryable: false,
            timedOut: false,
            exitCode: 1,
            durationMs: Date.now() - startedAt,
            metrics: {
              totalCostUsd: null,
              reservedCostUsd: reservation.reservedUsd,
              diagnostics: createDiagnostics("unclassified", Date.now() - startedAt, "result_parse")
            }
          });
        }
        const choice = payload?.choices?.[0];
        const content = choice?.message?.content;
        const usage = payload?.usage;
        const observedCostUsd = calculateObservedPeakCostUsd(usage || {});
        const settled = await settleReservation(observedCostUsd);
        if (settled?.settled !== true && settled?.overBudget !== true) {
          return createFailureSubagentResult("deepseek", model, {
            error: "DeepSeek API usage could not be committed to the pilot budget",
            reason: "budget_state_unavailable",
            retryable: false,
            timedOut: false,
            exitCode: 1,
            durationMs: Date.now() - startedAt,
            metrics: {
              totalCostUsd: observedCostUsd,
              reservedCostUsd: reservation.reservedUsd,
              usage: observedCostUsd === null ? null : { inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens }
            }
          });
        }
        if (handle.abortKind === "cancelled") {
          return cancellationResult(reservation.reservedUsd, observedCostUsd, { inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens });
        }
        if (payload?.model !== model || choice?.finish_reason !== "stop" || typeof content !== "string" || observedCostUsd === null || settled?.overBudget === true) {
          return createFailureSubagentResult("deepseek", model, {
            error: "DeepSeek API response failed model, completion, usage or budget validation",
            reason: settled?.overBudget ? "budget_exhausted" : choice?.finish_reason === "length" ? "output_limit" : "output_parse_invalid",
            retryable: false,
            timedOut: false,
            exitCode: 1,
            durationMs: Date.now() - startedAt,
            metrics: {
              totalCostUsd: observedCostUsd,
              reservedCostUsd: reservation.reservedUsd,
              usage: observedCostUsd === null ? null : { inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens }
            }
          });
        }
        return createSuccessSubagentResult("deepseek", model, {
          result: content,
          durationMs: Date.now() - startedAt,
          metrics: {
            totalCostUsd: observedCostUsd,
            reservedCostUsd: reservation.reservedUsd,
            usage: { inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens },
            diagnostics: createDiagnostics(null, Date.now() - startedAt)
          }
        });
      } catch (error) {
        if (reservation?.allowed === true) await settleReservation(null);
        const timedOut = handle.abortKind === "timeout";
        const cancelled = handle.abortKind === "cancelled";
        const outputLimited = error?.code === outputLimitCode;
        return createFailureSubagentResult("deepseek", model, {
          error: outputLimited ? "DeepSeek API response body exceeded the configured byte limit" : timedOut ? "DeepSeek API request timed out" : cancelled ? "execution cancelled" : "DeepSeek API request failed",
          reason: outputLimited ? "output_limit" : timedOut ? "timeout" : cancelled ? "cancelled" : "network",
          retryable: outputLimited ? false : timedOut || !cancelled,
          timedOut,
          exitCode: null,
          durationMs: Date.now() - startedAt,
          metrics: {
            totalCostUsd: null,
            reservedCostUsd: reservation.reservedUsd,
            diagnostics: {
              ...createDiagnostics(outputLimited ? "output_limit" : timedOut ? "timeout" : cancelled ? "unclassified" : "network_error", Date.now() - startedAt),
              ...(outputLimited ? {
                outputLimitBytes: error.outputLimitBytes,
                outputBytesObserved: error.outputBytesObserved,
                outputLimitScope: "http_response_body"
              } : {})
            }
          }
        });
      } finally {
        handle.release();
      }
    },
    async cancel(executionId) {
      const handle = activeRequests.get(executionId);
      if (!handle) return;
      handle.cancel();
    }
  };
}

export async function checkDeepSeekApi(configuration, fetchImplementation = globalThis.fetch) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const model = configuration.deepseek.apiModel;
  const maxOutputBytes = configuration.deepseek.maxOutputBytes;
  if (typeof apiKey !== "string" || apiKey.length === 0) {
    return { available: false, authenticated: false, model, modelAvailable: false, exitCode: 1 };
  }
  if (!Number.isSafeInteger(maxOutputBytes) || maxOutputBytes <= 0 || maxOutputBytes > 8388608) {
    return { available: false, authenticated: true, model, modelAvailable: false, exitCode: 1 };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let response;
  try {
    response = await fetchImplementation(`${configuration.deepseek.apiBaseUrl}/models`, {
      method: "GET",
      headers: { authorization: `Bearer ${apiKey}` },
      signal: controller.signal
    });
    if (!response.ok) {
      cancelResponseBody(response);
      return { available: false, authenticated: response.status !== 401, model, modelAvailable: false, exitCode: response.status };
    }
    const responseBytes = await readBoundedResponseBytes(response, maxOutputBytes, controller.signal);
    const payload = parseJsonResponseBytes(responseBytes);
    const modelAvailable = Array.isArray(payload?.data) && payload.data.some((entry) => entry?.id === model);
    return { available: modelAvailable, authenticated: true, model, modelAvailable, exitCode: modelAvailable ? 0 : 1 };
  } catch {
    cancelResponseBody(response);
    return { available: false, authenticated: null, model, modelAvailable: false, exitCode: 1 };
  } finally {
    clearTimeout(timeout);
  }
}
