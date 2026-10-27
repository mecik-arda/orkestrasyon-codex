import { createHash } from "node:crypto";
import { z } from "zod";
import { validateWorkspace } from "../../config.js";
import { ANTIGRAVITY_MODEL_MAP } from "../../adapters/antigravity-adapter.js";
import { detectWebIntent } from "../../web-evidence.js";
import { validateClaudeSonnetAcceptanceOutput } from "../../services/claude-sonnet-acceptance.js";
import { controlledEditResultSchema, preparedEditRejectionResultSchema } from "../../schemas/core-schemas.js";
import {
  approveParallelIntegrationRequestSchema,
  applyAuthorizedParallelIntegrationRequestSchema,
  cancelParallelBatchRequestSchema,
  getParallelBatchRequestSchema,
  getParallelTaskDetailRequestSchema,
  prepareParallelBatchRequestSchema,
  revalidateParallelIntegrationRequestSchema,
  startParallelBatchRequestSchema
} from "../../schemas/parallel-batch-schema.js";

const readOnlyModeSchema = z.literal("read_only").default("read_only");
const timeoutSecondsSchema = z.number().int().min(10).max(1200).optional();
const profileSchema = z.string().min(1).max(64);
const reviewScopeSchema = z.array(z.string().min(1).max(500)).min(1).max(50).optional();
const reviewEvidenceRequirementSchema = z.enum(["best_effort", "required"]).default("best_effort");
const approvalRequestIdSchema = z.string().regex(/^[a-f0-9]{64}$/);
const refineDirectReviewScope = (value, context) => {
  if (value.reviewEvidenceRequirement === "required" && (!value.reviewScope || value.reviewScope.length === 0)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["reviewScope"], message: "required review evidence needs an explicit non-empty reviewScope" });
  }
  if (value.mode === "edit" && value.reviewScope?.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["reviewScope"], message: "reviewScope is only available for read-only tasks" });
  }
};
const refineAntigravityReviewScope = (value, context) => {
  if (value.reviewEvidenceRequirement === "required" || value.reviewScope?.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["reviewScope"], message: "Antigravity does not support host source-bundle reviewScope" });
  }
};
const riskSignalsSchema = z.object({
  externalService: z.boolean().optional(),
  irreversible: z.boolean().optional()
}).strict();

export const antigravityProbeFields = {
  probeModels: z.array(z.enum(["gemini_pro", "gemini_flash", "gemini_flash_3_7", "gemini_flash_3_8", "claude_sonnet"])).max(5).default([]),
  probeCapabilities: z.array(z.enum(["modelAccess", "toolFreeResponse", "workspaceRead", "webRead", "sandboxStartup"])).max(5).default([]),
  workspaceReadTarget: z.enum(["temp_workspace", "trusted_workspace"]).default("temp_workspace")
};

export const antigravityProbeSchema = z.object(antigravityProbeFields).strict();

export const storeMemorySchema = z.object({
  relativePath: z.string().min(3).max(500),
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(60000),
  tags: z.array(z.string().min(1).max(60)).max(20).default([]),
  sources: z.array(z.object({
    title: z.string().min(1).max(300),
    url: z.string().url().refine((value) => value.startsWith("https://"), "Kaynak URL HTTPS olmalı"),
    accessedAt: z.string().datetime()
  })).max(30).default([]),
  confidence: z.enum(["low", "medium", "high"]),
  verificationStatus: z.enum(["user-provided", "verified", "provisional"]),
  memoryType: z.enum(["semantic", "episodic", "procedural", "preference", "decision"]).optional(),
  stage: z.enum(["draft", "published"]).optional(),
  reviewAfter: z.string().datetime().optional(),
  validUntil: z.string().datetime().optional(),
  taskId: z.string().min(1).max(120),
  acknowledgeMemoryConflicts: z.boolean().default(false),
  acknowledgeExpiredMemory: z.boolean().default(false),
  acknowledgeInjectionRisk: z.boolean().default(false),
  expectedSha256: z.string().regex(/^[a-f0-9]{64}$/).optional()
}).strict();

export const publicToolSchemas = {
  runClaudeSonnetAcceptancePilot: z.object({}).strict(),
  runCodexProfileEditPilot: z.object({}).strict(),
  runAntigravity: z.object({
    prompt: z.string().min(1).max(60000),
    model: z.enum(["gemini_flash", "gemini_flash_3_8", "claude_sonnet"]),
    mode: readOnlyModeSchema,
    timeout_seconds: timeoutSecondsSchema,
    workspace: z.string().min(1).optional(),
    reviewEvidenceRequirement: reviewEvidenceRequirementSchema,
    reviewScope: reviewScopeSchema
  }).strict().superRefine(refineAntigravityReviewScope),
  runClaudeCode: z.object({
    prompt: z.string().min(1).max(60000),
    model: z.string().min(1).optional(),
    mode: readOnlyModeSchema,
    timeout_seconds: timeoutSecondsSchema,
    reviewEvidenceRequirement: reviewEvidenceRequirementSchema,
    reviewScope: reviewScopeSchema
  }).strict().superRefine(refineDirectReviewScope),
  runCodex: z.object({
    prompt: z.string().min(1).max(60000),
    model: z.string().min(1).max(120).default("gpt-6.1-sol"),
    mode: readOnlyModeSchema,
    timeout_seconds: timeoutSecondsSchema,
    reviewEvidenceRequirement: reviewEvidenceRequirementSchema,
    reviewScope: reviewScopeSchema
  }).strict().superRefine(refineDirectReviewScope),
  runProfile: z.object({
    prompt: z.string().min(1).max(60000),
    profile: profileSchema,
    taskId: z.string().min(1).max(120).optional(),
    files: z.array(z.string().min(1).max(500)).max(100).default([]),
    contextFiles: z.array(z.string().min(1).max(500)).max(100).default([]),
    reviewScope: reviewScopeSchema,
    reviewEvidenceRequirement: reviewEvidenceRequirementSchema,
    acceptanceCriteria: z.array(z.string().min(1).max(4000)).max(50).default([]),
    timeout_seconds: timeoutSecondsSchema,
    riskSignals: riskSignalsSchema.optional()
  }).strict().superRefine(refineDirectReviewScope),
  runDeepSeek: z.object({
    taskId: z.string().min(1).max(120),
    role: z.enum(["analyst", "researcher", "reviewer", "planner", "implementer"]),
    model: z.literal("deepseek_flash").default("deepseek_flash"),
    mode: readOnlyModeSchema,
    objective: z.string().min(1).max(12000),
    workspace: z.string().min(1),
    files: z.array(z.string()).max(200).default([]),
    contextFiles: z.array(z.string()).max(100).default([]),
    skills: z.array(z.enum(["commit-at", "guvenlik-ve-sertlestirme", "kod-denetleyicisi", "otomatik-dokumantasyon", "veri-seti-analizcisi", "proje-kesif-planlama", "model-saglayici-ekleme", "dogrulama-kapisi", "mcp-sozlesme-denetimi", "hafiza-vault-bakimi", "maliyet-ve-butce-denetimi", "bagimlilik-guvenligi", "subagent-orkestrasyonu"])).max(12).default([]),
    acceptanceCriteria: z.array(z.string()).min(1).max(50),
    riskSignals: riskSignalsSchema.optional()
  }).strict().superRefine((value, context) => {
    if (value.mode === "read_only" && value.role === "reviewer" && value.files.length + value.contextFiles.length === 0) context.addIssue({ code: z.ZodIssueCode.custom, path: ["files"], message: "verified reviewer tasks require at least one selected source path" });
  }),
  runDeepSeekEditPilot: z.object({
    taskId: z.string().min(1).max(120),
    model: z.literal("deepseek_flash").default("deepseek_flash"),
    objective: z.string().min(1).max(12000),
    files: z.array(z.string().min(1).max(500)).min(1).max(100),
    contextFiles: z.array(z.string().min(1).max(500)).max(100).default([]),
    acceptanceCriteria: z.array(z.string()).min(1).max(50),
    timeout_seconds: timeoutSecondsSchema,
    riskSignals: riskSignalsSchema.optional()
  }).strict(),
  approvePreparedEdit: z.object({
    approvalRequestId: approvalRequestIdSchema
  }).strict(),
  rejectPreparedEdit: z.object({
    approvalRequestId: approvalRequestIdSchema
  }).strict(),
  prepareParallelBatch: prepareParallelBatchRequestSchema,
  startParallelBatch: startParallelBatchRequestSchema,
  getParallelBatch: getParallelBatchRequestSchema,
  getParallelTaskDetail: getParallelTaskDetailRequestSchema,
  cancelParallelBatch: cancelParallelBatchRequestSchema,
  approveParallelIntegration: approveParallelIntegrationRequestSchema,
  applyAuthorizedParallelIntegration: applyAuthorizedParallelIntegrationRequestSchema,
  revalidateParallelIntegration: revalidateParallelIntegrationRequestSchema,
  checkProviderCapability: z.object({
    provider: z.enum(["antigravity", "codex", "claude_code"]),
    model: z.string().min(1).max(120).optional(),
    probeWorkspaceRead: z.boolean().default(false)
  }).strict()
};

function parse(schema, input) {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new Error(`invalid public tool arguments: ${result.error.issues.map((issue) => issue.message).join("; ")}`);
  }
  return result.data;
}

function toMcpResult(result) {
  return {
    isError: result.ok === false,
    content: [{ type: "text", text: result.ok === false ? result.error : JSON.stringify(result, null, 2) }],
    structuredContent: result
  };
}

function toParallelBatchResult(result) {
  if (!result || result.ok === false) {
    const payload = { ok: false, reason: result?.reason || "parallel_batch_failed", message: result?.message || null };
    return { isError: true, content: [{ type: "text", text: JSON.stringify(payload) }], structuredContent: payload };
  }
  const summary = result.summary || null;
  const payload = {
    ok: true,
    planId: result.planId ?? summary?.planId ?? null,
    planHash: result.planHash ?? summary?.planHash ?? null,
    batchId: result.batchId ?? summary?.batchId ?? null,
    ...(result.alreadyStarted ? { alreadyStarted: true } : {}),
    ...(result.allocation ? { allocation: result.allocation } : {}),
    ...(result.dashboard ? { dashboard: result.dashboard } : {}),
    ...(result.cancellation ? { cancellation: result.cancellation } : {}),
    ...(result.page ? { page: result.page } : {}),
    summary
  };
  return { isError: false, content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], structuredContent: payload };
}

function createRuntimeRequest(input, target, trustedWorkspace, caller, abortSignal, options = {}) {
  return {
    target,
    prompt: input.prompt,
    model: input.model,
    mode: input.mode,
    trustedWorkspace,
    caller,
    delegationDepth: 0,
    timeoutMs: input.timeout_seconds ? input.timeout_seconds * 1000 : undefined,
    profile: input.profile,
    reviewEvidenceRequirement: input.reviewEvidenceRequirement,
    reviewScope: input.reviewScope,
    abortSignal,
    ...options
  };
}

const CARRIER_REPAIR_PROMPT = "Your previous response was rejected because it did not match the required JSON carrier. Return exactly one JSON object with a result field and nothing else. Never place URLs or citation links inside result or excerpts; when read_url was used, put the source URL only in webEvidence.sourceUrl and keep excerpts free of URLs, headers, cookies, and credentials. When read_url was not used, omit webEvidence or set it to an empty object {}; the host normalizes absent evidence to null. When read_url was used, include sourceUrl and a non-empty excerpts list. Do not include URLs, headers, cookies, credentials, tool, model, permission, fallback or edit fields in result or excerpts.";

function resolveAntigravityWorkspace(input, trustedWorkspace, configuration) {
  if (!input.workspace) return trustedWorkspace;
  if (input.mode !== "read_only") {
    throw new Error("external workspace is only available in read_only mode");
  }
  return validateWorkspace(
    input.workspace,
    configuration.allowedRoots || [],
    configuration.workspacePolicy?.antigravityDeniedRootPaths || []
  );
}

function requireImplementerEdit(input) {
  if (input.mode === "edit" && input.role !== "implementer") throw new Error("edit mode requires implementer role");
  if (input.mode === "edit" && input.files.length === 0) throw new Error("edit mode requires selected target files");
}

export function createMcpToolHandlers({ runtime, trustedWorkspace, caller = "codexDesktop", configuration = {} }) {
  return {
    async runClaudeSonnetAcceptancePilot(input, context = {}) {
      if (configuration.orchestration?.acceptancePilots?.claudeSonnet?.enabled !== true) {
        throw new Error("Claude Sonnet acceptance pilot is disabled until explicitly enabled in the active runtime configuration");
      }
      parse(publicToolSchemas.runClaudeSonnetAcceptancePilot, input);
      const pilotInput = {
        prompt: "Calculate 6 × 7. Return the required JSON carrier with its result string containing only {\"result\":42}.",
        model: "claude_sonnet",
        mode: "read_only",
        timeout_seconds: 60
      };
      return toMcpResult(await runtime.run(createRuntimeRequest(pilotInput, "claude_sonnet", trustedWorkspace, caller, context.signal, {
        claudeSonnetAcceptancePilot: true,
        maxOutputBytes: 65536,
        resultValidator: validateClaudeSonnetAcceptanceOutput
      })));
    },
    async runCodexProfileEditPilot(input, context = {}) {
      if (configuration.orchestration?.acceptancePilots?.codexProfileEdit?.enabled !== true) {
        throw new Error("Codex disposable edit pilot is disabled until explicitly enabled in the active runtime configuration");
      }
      parse(publicToolSchemas.runCodexProfileEditPilot, input);
      const result = await runtime.runCodexProfileEditPilot(trustedWorkspace, context.signal);
      const validation = controlledEditResultSchema.safeParse(result);
      const expectedDisposableFileHash = createHash("sha256").update("after\n").digest("hex");
      if (!validation.success || validation.data.backend !== "codex" || validation.data.model !== "gpt-6.1-sol" || validation.data.resolvedModel !== "gpt-6.1-sol" || validation.data.applied !== false || validation.data.fallbacks !== 0 || validation.data.filesChanged.some((file) => file !== "tests/fixtures/codex-profile-edit-pilot/value.txt") || (validation.data.status === "completed" && (validation.data.filesChanged.length !== 1 || !validation.data.changeSetHash || !validation.data.sourceFileSha256Before || validation.data.sourceFileSha256Before !== validation.data.sourceFileSha256After || validation.data.disposableFileSha256 !== expectedDisposableFileHash))) {
        throw new Error("Codex disposable edit pilot result failed host validation");
      }
      const payload = {
        status: validation.data.status,
        backend: "codex",
        model: "gpt-6.1-sol",
        requestedModel: "gpt-6.1-sol",
        resolvedModel: "gpt-6.1-sol",
        accessMode: "edit",
        summary: validation.data.status === "completed" ? "Codex disposable edit pilot completed" : "Codex disposable edit pilot failed",
        failureClass: validation.data.failureClass,
        filesChanged: validation.data.filesChanged,
        diff: validation.data.diff,
        applied: false,
        fallbacks: 0,
        cleanupCompleted: validation.data.cleanupCompleted,
        ...(validation.data.executionIdHash ? { executionIdHash: validation.data.executionIdHash } : {}),
        ...(validation.data.changeSetHash ? { changeSetHash: validation.data.changeSetHash } : {}),
        ...(validation.data.sourceFileSha256Before ? { sourceFileSha256Before: validation.data.sourceFileSha256Before } : {}),
        ...(validation.data.sourceFileSha256After ? { sourceFileSha256After: validation.data.sourceFileSha256After } : {}),
        ...(validation.data.disposableFileSha256 ? { disposableFileSha256: validation.data.disposableFileSha256 } : {}),
        ...(validation.data.metrics ? { metrics: validation.data.metrics } : {}),
        ...(validation.data.status === "completed" ? { preview: true } : {})
      };
      const strictValidation = controlledEditResultSchema.safeParse(payload);
      if (!strictValidation.success) throw new Error("Codex disposable edit pilot result failed host validation");
      return { isError: strictValidation.data.status !== "completed", content: [{ type: "text", text: JSON.stringify(strictValidation.data, null, 2) }], structuredContent: strictValidation.data };
    },
    async runAntigravity(input, context = {}) {
      const parsed = parse(publicToolSchemas.runAntigravity, input);
      const workspace = resolveAntigravityWorkspace(parsed, trustedWorkspace, configuration);
      const options = parsed.mode === "read_only"
        ? {
          ...(detectWebIntent(parsed.prompt, "") ? { webEvidenceRequired: true } : {}),
          webEvidenceRepairPrompt: CARRIER_REPAIR_PROMPT,
          maxWebEvidenceRepairAttempts: 1
        }
        : {};
      return toMcpResult(await runtime.run(createRuntimeRequest(parsed, parsed.model, workspace, caller, context.signal, options)));
    },
    async runClaudeCode(input, context = {}) {
      const parsed = parse(publicToolSchemas.runClaudeCode, input);
      return toMcpResult(await runtime.run(createRuntimeRequest(parsed, "native_claude", trustedWorkspace, caller, context.signal)));
    },
    async runCodex(input, context = {}) {
      const parsed = parse(publicToolSchemas.runCodex, input);
      return toMcpResult(await runtime.run(createRuntimeRequest(parsed, "codex", trustedWorkspace, caller, context.signal)));
    },
    async runProfile(input, context = {}) {
      const parsed = parse(publicToolSchemas.runProfile, input);
      const profile = configuration.orchestration?.taskProfiles?.[parsed.profile];
      if (!profile) throw new Error(`unsupported task profile: ${parsed.profile}`);
      if (profile.mode === "edit") {
        requireImplementerEdit({ ...parsed, mode: "edit", role: "implementer" });
        const result = await runtime.runProfileEdit({ ...parsed, objective: parsed.prompt, role: "implementer", mode: "edit", model: profile.model }, trustedWorkspace, context.signal);
        return { isError: result.status !== "completed", content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result };
      }
      const mode = profile.mode;
      return toMcpResult(await runtime.run(createRuntimeRequest({ ...parsed, mode }, "profile", trustedWorkspace, caller, context.signal)));
    },
    async runDeepSeek(input, context = {}) {
      const parsed = parse(publicToolSchemas.runDeepSeek, input);
      requireImplementerEdit(parsed);
      const reviewScope = parsed.role === "reviewer" ? [...new Set([...parsed.files, ...parsed.contextFiles])] : undefined;
      const result = await runtime.runDeepSeek({ ...parsed, reviewScope, reviewEvidenceRequirement: parsed.role === "reviewer" ? "required" : "best_effort" }, trustedWorkspace, context.signal);
      return {
        isError: result.status ? result.status !== "completed" : result.ok === false,
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result
      };
    },
    async runDeepSeekEditPilot(input, context = {}) {
      const parsed = parse(publicToolSchemas.runDeepSeekEditPilot, input);
      const result = await runtime.runDeepSeekEditPilot(parsed, trustedWorkspace, context.signal);
      return {
        isError: result.status !== "completed",
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result
      };
    },
    async approvePreparedEdit(input) {
      const parsed = parse(publicToolSchemas.approvePreparedEdit, input);
      const result = await runtime.approvePreparedEdit(parsed, trustedWorkspace);
      return { isError: result.status !== "completed", content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result };
    },
    async rejectPreparedEdit(input) {
      const parsed = parse(publicToolSchemas.rejectPreparedEdit, input);
      const result = preparedEditRejectionResultSchema.parse(await runtime.rejectPreparedEdit(parsed, trustedWorkspace));
      return { isError: result.status !== "rejected", content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result };
    },
    async prepareParallelBatch(input) {
      const parsed = parse(publicToolSchemas.prepareParallelBatch, input);
      return toParallelBatchResult(await runtime.prepareParallelBatch(parsed, trustedWorkspace));
    },
    async startParallelBatch(input) {
      const parsed = parse(publicToolSchemas.startParallelBatch, input);
      return toParallelBatchResult(await runtime.startParallelBatch(parsed, trustedWorkspace));
    },
    async getParallelBatch(input) {
      const parsed = parse(publicToolSchemas.getParallelBatch, input);
      return toParallelBatchResult(await runtime.getParallelBatch(parsed, trustedWorkspace));
    },
    async getParallelTaskDetail(input) {
      const parsed = parse(publicToolSchemas.getParallelTaskDetail, input);
      return toParallelBatchResult(await runtime.getParallelTaskDetail(parsed, trustedWorkspace));
    },
    async cancelParallelBatch(input) {
      const parsed = parse(publicToolSchemas.cancelParallelBatch, input);
      return toParallelBatchResult(await runtime.cancelParallelBatch(parsed, trustedWorkspace));
    },
    async approveParallelIntegration(input) {
      const parsed = parse(publicToolSchemas.approveParallelIntegration, input);
      return toParallelBatchResult(await runtime.approveParallelIntegration(parsed, trustedWorkspace));
    },
    async applyAuthorizedParallelIntegration(input) {
      const parsed = parse(publicToolSchemas.applyAuthorizedParallelIntegration, input);
      return toParallelBatchResult(await runtime.applyAuthorizedParallelIntegration(parsed, trustedWorkspace));
    },
    async revalidateParallelIntegration(input) {
      const parsed = parse(publicToolSchemas.revalidateParallelIntegration, input);
      return toParallelBatchResult(await runtime.revalidateParallelIntegration(parsed, trustedWorkspace));
    },
    async checkProviderCapability(input) {
      const parsed = parse(publicToolSchemas.checkProviderCapability, input);
      if (parsed.provider === "antigravity" && !parsed.model) throw new Error("capability probe requires a model for this provider");
      if (parsed.provider === "antigravity" && !Object.hasOwn(ANTIGRAVITY_MODEL_MAP, parsed.model)) throw new Error("capability probe model is not an Antigravity alias");
      const target = parsed.provider === "antigravity" ? parsed.model : parsed.provider === "claude_code" ? "native_claude" : parsed.provider;
      const result = await runtime.probeCapability({
        target,
        model: parsed.provider === "antigravity" ? undefined : parsed.model,
        trustedWorkspace,
        probeWorkspaceRead: parsed.probeWorkspaceRead
      });
      return { isError: false, content: [{ type: "text", text: JSON.stringify({ ...result, provider: parsed.provider }, null, 2) }], structuredContent: { ...result, provider: parsed.provider } };
    }
  };
}
