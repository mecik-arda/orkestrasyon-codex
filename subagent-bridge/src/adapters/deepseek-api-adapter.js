import crypto from "node:crypto";
import { createAdapter } from "./agent-adapter-base.js";
import { createFailureSubagentResult, createSuccessSubagentResult } from "../schemas/core-schemas.js";

export const DEEPSEEK_API_MODEL_ID = "deepseek-flash";
export const DEEPSEEK_API_BASE_URL = "https://api.deepseek.com";
export const DEEPSEEK_PEAK_INPUT_PRICE_PER_MILLION = 0.3;
export const DEEPSEEK_PEAK_OUTPUT_PRICE_PER_MILLION = 1.2;

const activeRequests = new Map();

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

function createDiagnostics(providerCode, providerExecutionMs) {
  return {
    failureStage: "provider_execution",
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

function createController(request, handle) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("DeepSeek request timed out")), request.timeoutMs);
  const abort = () => controller.abort(request.abortSignal?.reason);
  request.abortSignal?.addEventListener("abort", abort, { once: true });
  activeRequests.set(request.executionId, { controller, timeout, abortSignal: request.abortSignal, abort });
  handle.release = () => {
    clearTimeout(timeout);
    request.abortSignal?.removeEventListener("abort", abort);
    activeRequests.delete(request.executionId);
  };
  return controller;
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
  const timeoutMs = configuration.deepseek.timeoutMs;
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
      let reservation;
      try {
        reservation = await budget.reserve(request.executionId, reservedUsd);
      } catch {
        reservation = { allowed: false, reason: "budget_state_unavailable" };
      }
      if (reservation?.allowed !== true) {
        return createFailureSubagentResult("deepseek", model, {
          error: "DeepSeek pilot budget admission rejected the request",
          reason: reservation?.reason || "budget_exhausted",
          durationMs: 0,
          exitCode: 1,
          metrics: { totalCostUsd: 0, reservedCostUsd: 0 }
        });
      }
      const startedAt = Date.now();
      const handle = {};
      const controller = createController({ ...request, timeoutMs: Math.min(request.timeoutMs || timeoutMs, timeoutMs) }, handle);
      try {
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
          await budget.settle(reservation.reservationId, null);
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
        const payload = await response.json();
        const choice = payload?.choices?.[0];
        const content = choice?.message?.content;
        const usage = payload?.usage;
        const observedCostUsd = calculateObservedPeakCostUsd(usage || {});
        const settled = await budget.settle(reservation.reservationId, observedCostUsd);
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
        await budget.settle(reservation.reservationId, null);
        const timedOut = controller.signal.aborted && !request.abortSignal?.aborted;
        return createFailureSubagentResult("deepseek", model, {
          error: timedOut ? "DeepSeek API request timed out" : request.abortSignal?.aborted ? "execution cancelled" : "DeepSeek API request failed",
          reason: timedOut ? "timeout" : request.abortSignal?.aborted ? "cancelled" : "network",
          retryable: timedOut || !request.abortSignal?.aborted,
          timedOut,
          exitCode: null,
          durationMs: Date.now() - startedAt,
          metrics: { totalCostUsd: null, reservedCostUsd: reservation.reservedUsd, diagnostics: createDiagnostics(timedOut ? "timeout" : "network_error", Date.now() - startedAt) }
        });
      } finally {
        handle.release();
      }
    },
    async cancel(executionId) {
      const handle = activeRequests.get(executionId);
      if (!handle) return;
      clearTimeout(handle.timeout);
      handle.abortSignal?.removeEventListener("abort", handle.abort);
      handle.controller.abort();
      activeRequests.delete(executionId);
    }
  };
}

export async function checkDeepSeekApi(configuration, fetchImplementation = globalThis.fetch) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const model = configuration.deepseek.apiModel;
  if (typeof apiKey !== "string" || apiKey.length === 0) {
    return { available: false, authenticated: false, model, modelAvailable: false, exitCode: 1 };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetchImplementation(`${configuration.deepseek.apiBaseUrl}/models`, {
      method: "GET",
      headers: { authorization: `Bearer ${apiKey}` },
      signal: controller.signal
    });
    if (!response.ok) return { available: false, authenticated: response.status !== 401, model, modelAvailable: false, exitCode: response.status };
    const payload = await response.json();
    const modelAvailable = Array.isArray(payload?.data) && payload.data.some((entry) => entry?.id === model);
    return { available: modelAvailable, authenticated: true, model, modelAvailable, exitCode: modelAvailable ? 0 : 1 };
  } catch {
    return { available: false, authenticated: null, model, modelAvailable: false, exitCode: 1 };
  } finally {
    clearTimeout(timeout);
  }
}
