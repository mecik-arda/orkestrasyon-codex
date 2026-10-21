import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { loadSkills, requireGitRepository, validateWorkspace } from "./config.js";
import { createFailureResult, parseDeepSeekEnvelope } from "./result.js";
import { checkDeepSeekApi } from "./adapters/deepseek-api-adapter.js";

function createRunId() {
  return crypto.randomUUID();
}

export const DEEPSEEK_FLASH_MODEL_DOCUMENTED_VERSION = "DeepSeek-V4.1-Flash";
export const DEEPSEEK_FLASH_MODEL_VERSION_VERIFIED_AT = "2026-09-16";
export const DEEPSEEK_FLASH_MODEL_VERSION_REVIEW_AFTER = "2026-12-15";
export const DEEPSEEK_FLASH_MODEL_VERSION_SOURCE_URL = "https://api-docs.deepseek.com/quick_start/pricing";

export function isCalendarDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function buildDeepSeekPrompt(input, guidance) {
  const requiredSourceReview = input.reviewEvidenceRequirement === "required" && input.reviewScope?.length > 0;
  const skillSections = guidance.skills.flatMap((skill) => [
    `Etkin skill: ${skill.name}`,
    skill.content
  ]);
  return [
    `Görev: ${input.objective}`,
    ...(skillSections.length > 0
      ? ["Aşağıdaki uzman skill talimatlarını analiz sınırları içinde uygula:", ...skillSections]
      : []),
    `İncelenecek dosyalar: ${input.files.length > 0 ? input.files.join(", ") : "Yok"}`,
    `Ek bağlam dosyaları: ${input.contextFiles.length > 0 ? input.contextFiles.join(", ") : "Yok"}`,
    "Kabul kriterleri:",
    ...input.acceptanceCriteria.map((criterion, index) => `${index + 1}. ${criterion}`),
    "Dosya değiştirme veya komut çalıştırma. Do not modify files or run commands.",
    "Return only valid JSON. Use double-quoted keys and string values. Do not use Markdown, code fences, prose outside JSON, JavaScript object syntax, or YAML.",
    "Return every required key exactly once: status, summary, findings, proposed_steps, risks, questions, requires_human_approval.",
    requiredSourceReview
      ? "Each findings item must contain exactly title, evidence, impact, recommendation, confidence, references. confidence must be high, medium, or low. references must be a non-empty array of objects shaped as {\"path\":\"exact manifest-relative path\",\"lineStart\":1,\"lineEnd\":1}; use only paths and 1-based inclusive line ranges present in the supplied host manifest. Never use key/value findings. Use findings: [] when there is no verified finding."
      : "Each findings item must contain exactly title, evidence, impact, recommendation, confidence. confidence must be high, medium, or low. Never use key/value findings. Use findings: [] when there is no verified finding.",
    requiredSourceReview
      ? "The result must conform to this example shape: {\"status\":\"completed\",\"summary\":\"short summary\",\"findings\":[{\"title\":\"short title\",\"evidence\":\"evidence\",\"impact\":\"impact\",\"recommendation\":\"recommendation\",\"confidence\":\"medium\",\"references\":[{\"path\":\"src/example.js\",\"lineStart\":1,\"lineEnd\":1}]}],\"proposed_steps\":[],\"risks\":[],\"questions\":[],\"requires_human_approval\":false}."
      : "The result must conform to this example shape: {\"status\":\"completed\",\"summary\":\"short summary\",\"findings\":[],\"proposed_steps\":[],\"risks\":[],\"questions\":[],\"requires_human_approval\":false}."
  ].join("\n");
}

export function buildDeepSeekSchemaRepairPrompt(input, guidance) {
  return [
    buildDeepSeekPrompt(input, guidance),
    "Your previous response failed the required JSON schema validation.",
    "Return the complete replacement response now as exactly one JSON object.",
    "Do not add explanation, markdown, a code fence, or any key outside the required schema.",
    "Every array field must be present, even when empty. requires_human_approval must be a JSON boolean."
  ].join("\n");
}

export function buildDeepSeekEditPatchPrompt(input, fileContents) {
  return [
    `Görev: ${input.objective}`,
    `Düzenlenmesine izin verilen dosyalar: ${input.files.join(", ")}`,
    "Kabul kriterleri:",
    ...input.acceptanceCriteria.map((criterion, index) => `${index + 1}. ${criterion}`),
    "Aşağıda her izinli dosyanın güncel içeriği yer alır. Dosyaları yalnız bu içeriklerden üret.",
    ...fileContents.flatMap(({ path: filePath, content }) => [`Dosya: ${filePath}`, "İçerik başlangıcı", content, "İçerik sonu"]),
    "Yalnız izinli dosyaların tam yeni içeriğini döndür. Dosya silme, yeni yol ekleme, kısmi patch veya ek açıklama üretme.",
    "Return only one JSON object with exactly these keys: status, summary, changes.",
    "Set status to completed. changes must contain one or more objects with exactly path and content; path must exactly match one of the permitted relative paths. content must be the complete UTF-8 file content.",
    "Return valid JSON only. Do not use Markdown, code fences, prose outside JSON, or additional keys."
  ].join("\n")
}

export function normalizeDeepSeekResult(value) {
  return parseDeepSeekEnvelope(value);
}

export function hasExactModelId(models, modelId) {
  const modelIds = new Set((models.match(/[a-z0-9._-]+\/[a-z0-9._-]+/gi) || []).map((value) => value.toLocaleLowerCase("en-US")));
  return modelIds.has(modelId.toLocaleLowerCase("en-US"));
}

export async function checkDeepSeek(configuration) {
  const health = await checkDeepSeekApi(configuration);
  return {
    ...health,
    flashModelAlias: "deepseek_flash",
    flashModel: configuration.deepseek.apiModel,
    flashModelDocumentedVersion: DEEPSEEK_FLASH_MODEL_DOCUMENTED_VERSION,
    flashModelVersionVerifiedAt: DEEPSEEK_FLASH_MODEL_VERSION_VERIFIED_AT,
    flashModelVersionReviewAfter: DEEPSEEK_FLASH_MODEL_VERSION_REVIEW_AFTER,
    flashModelVersionSourceUrl: DEEPSEEK_FLASH_MODEL_VERSION_SOURCE_URL,
    flashModelAvailable: health.modelAvailable,
  };
}

export function createDeepSeekRuntimeRequest(configuration, input, trustedWorkspace, abortSignal) {
  const workspace = configuration.allowedRoots
    ? validateWorkspace(trustedWorkspace, configuration.allowedRoots, configuration.deepseek.deniedRootPaths)
    : trustedWorkspace;
  if (configuration.deepseek.requireGitRepository) requireGitRepository(workspace);
  const guidance = {
    skills: input.skills?.length > 0 ? loadSkills(configuration, input.skills) : []
  };
  return {
    target: "deepseek",
    prompt: buildDeepSeekPrompt(input, guidance),
    model: configuration.deepseek.apiModel,
    mode: "read_only",
    trustedWorkspace: workspace,
    caller: "deepseek_api",
    reviewEvidenceRequirement: input.reviewEvidenceRequirement,
    reviewScope: input.reviewScope,
    delegationDepth: 0,
    timeoutMs: configuration.deepseek.timeoutMs,
    abortSignal,
    resultValidator: normalizeDeepSeekResult,
    schemaRepairPrompt: buildDeepSeekSchemaRepairPrompt(input, guidance),
    maxSchemaRepairAttempts: configuration.reliability?.maxSchemaRepairAttempts
  };
}

export function createDeepSeekCheckpoint(input, runtimeResult) {
  const normalized = runtimeResult.ok
    ? normalizeDeepSeekResult(runtimeResult.result)
    : { ok: false, errorClass: runtimeResult.reason || "process_exit" };
  const result = !runtimeResult.ok
    ? createFailureResult(`Subagent execution failed (${runtimeResult.reason || "process_exit"}); no structured review result was produced.`)
    : normalized.ok
      ? normalized.result
      : createFailureResult(`Structured output validation failed (${normalized.errorClass}).`);
  const failureClass = !runtimeResult.ok ? runtimeResult.reason || "process_exit" : normalized.ok ? null : normalized.errorClass;
  return {
    runId: createRunId(),
    taskId: input.taskId,
    agent: "deepseek",
    role: input.role,
    model: runtimeResult.model,
    requestedModel: input.model || "deepseek_flash",
    resolvedModel: runtimeResult.resolvedModel || runtimeResult.model,
    accessMode: "read_only",
    exitCode: normalized.ok && runtimeResult.ok ? runtimeResult.exitCode : 1,
    completedAt: new Date().toISOString(),
    failureClass,
    attempts: Array.isArray(runtimeResult.metrics?.attempts) && runtimeResult.metrics.attempts.length > 0
      ? runtimeResult.metrics.attempts.map((attempt) => ({
        number: attempt.number,
        failureClass: attempt.failureClass,
        exitCode: attempt.exitCode,
        durationMs: attempt.durationMs,
        apiDurationMs: null,
        turns: null,
        totalCostUsd: attempt.totalCostUsd ?? null,
        retryDelayMs: attempt.retryDelayMs ?? null
      }))
      : [{
        number: 1,
        failureClass,
        exitCode: runtimeResult.exitCode,
        durationMs: runtimeResult.durationMs,
        apiDurationMs: null,
        turns: null,
        totalCostUsd: runtimeResult.metrics?.totalCostUsd ?? null,
        retryDelayMs: null
      }],
    usage: {
      durationMs: runtimeResult.durationMs,
      apiDurationMs: null,
      turns: null,
      totalCostUsd: runtimeResult.metrics?.totalCostUsd ?? null,
      inputTokens: runtimeResult.metrics?.usage?.inputTokens ?? null,
      outputTokens: runtimeResult.metrics?.usage?.outputTokens ?? null
    },
    ...(runtimeResult.reviewContract ? { reviewContract: runtimeResult.reviewContract } : {}),
    result
  };
}

export function createDeepSeekEditCheckpoint(input, editResult) {
  return {
    runId: createRunId(),
    taskId: input.taskId,
    agent: "deepseek",
    role: input.role,
    model: editResult.model,
    requestedModel: editResult.requestedModel || input.model || "deepseek_flash",
    resolvedModel: editResult.resolvedModel || editResult.model,
    accessMode: editResult.accessMode,
    exitCode: editResult.status === "completed" ? 0 : 1,
    completedAt: new Date().toISOString(),
    failureClass: editResult.failureClass,
    attempts: [],
    usage: {
      durationMs: null,
      apiDurationMs: null,
      turns: null,
      totalCostUsd: null
    },
    result: {
      status: editResult.status,
       requires_human_approval: editResult.approvalRequired === true
    }
  };
}

export function writeDeepSeekCheckpoint(configuration, checkpoint) {
  const runIdHash = crypto.createHash("sha256").update(checkpoint.runId).digest("hex");
  const checkpointPath = path.join(configuration.statePaths.state, "checkpoints", `${runIdHash}.json`);
  fs.mkdirSync(path.dirname(checkpointPath), { recursive: true });
  const persistedCheckpoint = {
    runIdHash,
    agent: checkpoint.agent,
    role: checkpoint.role,
    model: checkpoint.model,
    requestedModel: checkpoint.requestedModel,
    resolvedModel: checkpoint.resolvedModel,
    accessMode: checkpoint.accessMode,
    exitCode: checkpoint.exitCode,
    completedAt: checkpoint.completedAt,
    failureClass: checkpoint.failureClass,
    attempts: checkpoint.attempts,
    usage: checkpoint.usage,
    result: {
      status: checkpoint.result.status,
      requires_human_approval: checkpoint.result.requires_human_approval
    }
  };
  fs.writeFileSync(checkpointPath, JSON.stringify(persistedCheckpoint, null, 2), "utf8");
  return checkpoint;
}
