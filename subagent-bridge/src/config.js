import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { getPersonalBridgeLayout } from "./personal-layout.js";
import { planRuntimeStateMigration } from "./runtime-state-migration.js";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(moduleDirectory, "..", "..");
export const currentConfigurationVersion = 3;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizeForComparison(value) {
  return path.resolve(value).replace(/[\\/]+$/, "").toLocaleLowerCase("en-US");
}

function resolveForComparison(value) {
  const resolvedPath = path.resolve(value);
  return fs.existsSync(resolvedPath) ? fs.realpathSync(resolvedPath) : resolvedPath;
}

function resolvePackagePath(value) {
  return path.isAbsolute(value) ? path.resolve(value) : path.resolve(packageRoot, value);
}

export function createDefaultStatePaths(root) {
  if (!root) {
    const layout = getPersonalBridgeLayout();
    return {
      logs: layout.logs,
      state: layout.state,
      cache: layout.cache
    };
  }
  return {
    logs: path.join(root, "logs"),
    state: path.join(root, "state"),
    cache: path.join(root, "cache")
  };
}

export function migrateConfiguration(rawConfiguration) {
  const sourceVersion = rawConfiguration.configVersion ?? 1;
  if (!Number.isInteger(sourceVersion) || sourceVersion < 1 || sourceVersion > currentConfigurationVersion) {
    throw new Error(`Unsupported configuration version: ${sourceVersion}`);
  }
  let configuration = rawConfiguration;
  if (sourceVersion === 1) {
    configuration = {
      ...configuration,
      configVersion: 2,
      observability: {
        ...configuration.observability,
        maxMetricRetentionDays: configuration.observability?.maxMetricRetentionDays ?? 30
      },
      orchestration: {
        ...configuration.orchestration,
        scheduler: {
          ...configuration.orchestration?.scheduler,
          leaseHeartbeatMs: configuration.orchestration?.scheduler?.leaseHeartbeatMs ?? 300000
        }
      }
    };
  }
  if (sourceVersion <= 2) {
    const { openCodeModel, openCodeFlashModel, ...deepseek } = configuration.deepseek || {};
    const { glm, kimi, qwen, ...currentConfiguration } = configuration;
    const taskProfiles = Object.fromEntries(Object.entries(currentConfiguration.orchestration?.taskProfiles || {})
      .filter(([, profile]) => !["opencode", "glm", "kimi", "qwen"].includes(profile.target))
      .map(([name, profile]) => [name, {
        ...profile,
        fallbackTargets: profile.fallbackTargets?.filter((fallback) => !["opencode", "glm", "kimi", "qwen"].includes(fallback.target))
      }]))
    const profileByRoute = Object.fromEntries(Object.entries(currentConfiguration.orchestration?.providerAdmission?.profileByRoute || {})
      .filter(([route]) => !/^(?:opencode|glm|kimi|qwen):/u.test(route)));
    const profileConcurrency = Object.fromEntries(Object.entries(currentConfiguration.orchestration?.providerAdmission?.profileConcurrency || {})
      .filter(([profile]) => !/^(?:opencode|glm|kimi|qwen):/u.test(profile)));
    const providerConcurrency = Object.fromEntries(Object.entries(currentConfiguration.parallelBatch?.providerConcurrency || {})
      .filter(([provider]) => !["opencode", "glm", "kimi", "qwen"].includes(provider)));
    const { opencodeOutputCapability, opencodeOutputTokens, opencodeSteps, ...parallelBatch } = currentConfiguration.parallelBatch || {};
    if (parallelBatch.allowedTargets) parallelBatch.allowedTargets = parallelBatch.allowedTargets.filter((target) => !["opencode", "glm", "kimi", "qwen"].includes(target));
    configuration = {
      ...currentConfiguration,
      configVersion: 3,
      deepseek,
      orchestration: {
        ...currentConfiguration.orchestration,
        taskProfiles,
        providerAdmission: currentConfiguration.orchestration?.providerAdmission
          ? { ...currentConfiguration.orchestration.providerAdmission, profileByRoute, profileConcurrency }
          : currentConfiguration.orchestration?.providerAdmission
      },
      parallelBatch: currentConfiguration.parallelBatch
        ? { ...parallelBatch, providerConcurrency }
        : currentConfiguration.parallelBatch
    };
  }
  return { configuration, sourceVersion, migrated: sourceVersion !== currentConfigurationVersion };
}

const configurationSchema = z.object({
  configVersion: z.literal(currentConfigurationVersion),
  allowedRoots: z.array(z.string().min(1)).min(1),
  agentRules: z.string().min(1),
  skills: z.object({ root: z.string().min(1), allowed: z.array(z.string().min(1)).min(1) }).strict(),
  deepseek: z.object({
    apiBaseUrl: z.literal("https://api.deepseek.com").optional(),
    apiModel: z.literal("deepseek-flash").optional(),
    pilotBudgetUsd: z.number().positive().max(1).optional(),
    priorUsageReservationUsd: z.number().nonnegative().optional(),
    maxPromptBytes: z.number().int().positive().max(1048576).optional(),
    maxOutputTokens: z.number().int().positive().max(32768).optional(),
    subagentRules: z.string().min(1),
    workspaceTools: z.array(z.string().min(1)),
    researchTools: z.array(z.string().min(1)),
    timeoutMs: z.number().int().positive(),
    maxOutputBytes: z.number().int().positive(),
    requireGitRepository: z.boolean(),
    deniedRoots: z.array(z.string().min(1))
  }).strict(),
  workspacePolicy: z.object({
    antigravityDeniedRoots: z.array(z.string().min(1))
  }).strict().optional(),
  memory: z.object({
    enabled: z.boolean(),
    vaultRoot: z.string().min(1),
    allowedWriteFolders: z.array(z.string().min(1)),
    ignoredDirectories: z.array(z.string().min(1)),
    maxIndexedFiles: z.number().int().positive(),
    maxSearchResults: z.number().int().positive(),
    maxSearchFileBytes: z.number().int().positive(),
    maxExcerptCharacters: z.number().int().positive(),
    maxReadBytes: z.number().int().positive(),
    maxWriteBytes: z.number().int().positive(),
    auditMaxBytes: z.number().int().positive().optional(),
    activeProfile: z.enum(["normal", "economic", "manual"]).optional(),
    consumptionProfiles: z.record(z.enum(["normal", "economic", "manual"]), z.object({
      autoRetrieval: z.boolean(),
      maxResults: z.number().int().min(0).max(5),
      maxContextChars: z.number().int().min(0).max(1200),
      healthCheckIntervalMinutes: z.number().int().positive().max(10080)
    }).strict()).optional(),
    reviewDefaults: z.object({
      sourceStalenessDays: z.number().int().positive(),
      maxDuplicateGroups: z.number().int().positive(),
      maxReadBytesPerFile: z.number().int().positive().optional()
    }).strict().optional()
  }).strict(),
  reliability: z.object({
    maxAttempts: z.number().int().positive(),
    maxSchemaRepairAttempts: z.number().int().min(0),
    baseRetryDelayMs: z.number().int().nonnegative(),
    maxRetryDelayMs: z.number().int().positive(),
    maxTotalDurationMs: z.number().int().positive(),
    maxRetryCostUsd: z.number().nonnegative(),
    maxRetryCostReserveUsd: z.number().nonnegative(),
    maxUnknownAttemptCostUsd: z.number().nonnegative(),
    dailyCostLimitUsd: z.number().positive().optional(),
    monthlyCostLimitUsd: z.number().positive().optional(),
    costBudgetEnforced: z.boolean().optional(),
    warningThresholdPercent: z.number().positive().max(100).optional()
  }).strict(),
  observability: z.object({
    maxMetricFileBytes: z.number().int().positive(),
    maxMetricRetentionDays: z.number().int().positive()
  }).strict(),
  orchestration: z.object({
    taskProfiles: z.record(z.string().min(1), z.object({
      target: z.string().min(1),
      model: z.string().min(1).optional(),
      mode: z.enum(["read_only", "edit"]),
      priority: z.number().int(),
      cacheable: z.boolean(),
      webEvidenceRequired: z.boolean().optional(),
      fallbackTargets: z.array(z.object({
        target: z.string().min(1),
        model: z.string().min(1).optional()
      }).strict()).max(5).optional()
    }).strict()),
    circuitBreaker: z.object({
      failureThreshold: z.number().int().positive(),
      windowMs: z.number().int().positive(),
      openMs: z.number().int().positive()
    }).strict().optional(),
    scheduler: z.object({
      maxQueuedPerWorkspace: z.number().int().positive(),
      staleLockMs: z.number().int().positive(),
      leaseHeartbeatMs: z.number().int().positive()
    }).strict(),
    providerAdmission: z.object({
      defaultConcurrency: z.number().int().min(1).max(10),
      profileConcurrency: z.record(z.string().min(1).max(64), z.number().int().min(1).max(10)).optional(),
      profileByRoute: z.record(z.string().min(1).max(256), z.string().min(1).max(64)).optional(),
      maxQueuedPerProfile: z.number().int().min(1).max(10000),
      pollIntervalMs: z.number().int().min(10).max(1000),
      maxWaitMs: z.number().int().positive().max(1200000)
    }).strict().optional(),
    readOnlyCache: z.object({
      enabled: z.boolean(),
      ttlMs: z.number().int().positive(),
      maxEntryBytes: z.number().int().positive(),
      maxEntries: z.number().int().positive().optional()
    }).strict(),
    acceptancePilots: z.object({
      claudeSonnet: z.object({ enabled: z.boolean() }).strict().optional(),
      codexProfileEdit: z.object({ enabled: z.boolean() }).strict().optional(),
      p2PreparedEdit: z.object({ enabled: z.boolean() }).strict().optional()
    }).strict().optional(),
    reviewSourceSyntaxAwareClassifierEnabled: z.boolean().optional(),
    slo: z.object({
      windowDays: z.number().int().positive().max(90),
      minimumRuns: z.number().int().positive(),
      availabilityTarget: z.number().gt(0).max(1),
      latencyP95Ms: z.number().int().positive().optional()
    }).strict().optional(),
    webIntentHeuristics: z.boolean().optional()
  }).strict(),
  parallelBatch: z.object({
    enabled: z.boolean(),
    editEnabled: z.boolean(),
    atomicIntegrationEnabled: z.boolean().optional(),
    maxWorkers: z.number().int().min(1).max(5),
    providerConcurrency: z.record(z.string().min(1).max(64), z.number().int().min(1).max(10)).optional(),
    defaultProviderConcurrency: z.number().int().min(1).max(10).optional(),
    planTtlMs: z.number().int().positive().optional(),
    maxSummaryCharacters: z.number().int().positive().optional(),
    maxBatchSummaryBytes: z.number().int().min(4096).optional(),
    maxReadablePathsPerTask: z.number().int().positive().max(200).optional(),
    maxContextFilesPerTask: z.number().int().positive().max(200).optional(),
    maxReadableSnapshotBytes: z.number().int().positive().optional(),
    maxFilesChangedPerTask: z.number().int().positive().max(100).optional(),
    maxFileBytesPerTask: z.number().int().positive().max(524288).optional(),
    maxTotalDiffBytesPerTask: z.number().int().positive().max(2097152).optional(),
    maxOutputBytesPerTask: z.number().int().positive().max(8388608).optional(),
    artifactTtlMs: z.number().int().positive().optional(),
    maxArtifactBytes: z.number().int().positive().optional(),
    maxArtifactTotalBytes: z.number().int().positive().optional(),
    allowedTargets: z.array(z.string().min(1).max(64)).min(1).max(20).optional(),
    codexNetworkOffCapability: z.enum(["available", "unavailable"]).optional(),
    autoOpenTerminalDashboard: z.boolean().optional(),
    worktreeRoot: z.string().min(1).optional(),
    verificationCommands: z.array(z.string().min(1).max(200)).max(20).optional(),
    orphanGraceMs: z.number().int().positive().optional()
  }).strict().optional()
}).strict().superRefine((configuration, context) => {
  const retiredTargets = new Set(["opencode", "glm", "kimi", "qwen"]);
  for (const [profileName, profile] of Object.entries(configuration.orchestration.taskProfiles)) {
    if (retiredTargets.has(profile.target)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["orchestration", "taskProfiles", profileName, "target"], message: "retired provider target is not supported" });
    }
    for (const [fallbackIndex, fallback] of (profile.fallbackTargets || []).entries()) {
      if (retiredTargets.has(fallback.target)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["orchestration", "taskProfiles", profileName, "fallbackTargets", fallbackIndex, "target"], message: "retired provider target is not supported" });
      }
    }
  }
  for (const [targetIndex, target] of (configuration.parallelBatch?.allowedTargets || []).entries()) {
    if (retiredTargets.has(target)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["parallelBatch", "allowedTargets", targetIndex], message: "retired provider target is not supported" });
    }
  }
});

export function validateConfiguration(rawConfiguration) {
  return configurationSchema.safeParse(rawConfiguration);
}

export function loadConfiguration(options = {}) {
  const configuredPath = process.env.ORCHESTRATOR_CONFIG;
  const configurationPath = options.configurationPath || configuredPath || getPersonalBridgeLayout().configPath;
  const migration = migrateConfiguration(readJson(configurationPath));
  const validation = validateConfiguration(migration.configuration);
  if (!validation.success) {
    const issues = validation.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`Invalid configuration: ${issues}`);
  }
  const configuration = validation.data;
  const vaultRootPath = resolvePackagePath(configuration.memory.vaultRoot);
  const resolveDeniedRootPaths = (deniedRoots) => [...new Map(
    [...deniedRoots.map(resolvePackagePath), vaultRootPath]
      .map((rootPath) => [normalizeForComparison(resolveForComparison(rootPath)), rootPath])
  ).values()];
  const deepseekDeniedRootPaths = resolveDeniedRootPaths(configuration.deepseek.deniedRoots);
  const antigravityDeniedRootPaths = resolveDeniedRootPaths(configuration.workspacePolicy?.antigravityDeniedRoots || []);
  return {
    ...configuration,
    packageRoot,
    configurationPath,
    configurationVersion: {
      source: migration.sourceVersion,
      active: currentConfigurationVersion,
      migrated: migration.migrated
    },
    statePaths: options.statePaths || createDefaultStatePaths(),
    deepseek: {
      ...configuration.deepseek,
      apiBaseUrl: configuration.deepseek.apiBaseUrl || "https://api.deepseek.com",
      apiModel: configuration.deepseek.apiModel || "deepseek-flash",
      pilotBudgetUsd: configuration.deepseek.pilotBudgetUsd ?? 1,
      priorUsageReservationUsd: configuration.deepseek.priorUsageReservationUsd ?? 0.0000189,
      maxPromptBytes: configuration.deepseek.maxPromptBytes ?? 300000,
      maxOutputTokens: configuration.deepseek.maxOutputTokens ?? 2048,
      deniedRootPaths: deepseekDeniedRootPaths
    },
    workspacePolicy: {
      ...(configuration.workspacePolicy || {}),
      antigravityDeniedRootPaths
    },
    memory: {
      ...configuration.memory,
      vaultRootPath,
      auditMaxBytes: configuration.memory.auditMaxBytes ?? 5242880,
      reviewDefaults: {
        sourceStalenessDays: configuration.memory.reviewDefaults?.sourceStalenessDays ?? 365,
        maxDuplicateGroups: configuration.memory.reviewDefaults?.maxDuplicateGroups ?? 20,
        maxReadBytesPerFile: configuration.memory.reviewDefaults?.maxReadBytesPerFile ?? 32768
      }
    },
    reliability: configuration.reliability,
    observability: configuration.observability,
    orchestration: {
      ...(configuration.orchestration || {}),
      reviewSourceSyntaxAwareClassifierEnabled: configuration.orchestration?.reviewSourceSyntaxAwareClassifierEnabled === true,
      acceptancePilots: {
        ...(configuration.orchestration?.acceptancePilots || {}),
        claudeSonnet: {
          enabled: configuration.orchestration?.acceptancePilots?.claudeSonnet?.enabled === true
        },
        codexProfileEdit: {
          enabled: configuration.orchestration?.acceptancePilots?.codexProfileEdit?.enabled === true
        }
      },
      providerAdmission: {
        defaultConcurrency: configuration.orchestration?.providerAdmission?.defaultConcurrency ?? 2,
        profileConcurrency: configuration.orchestration?.providerAdmission?.profileConcurrency || {},
        profileByRoute: configuration.orchestration?.providerAdmission?.profileByRoute || {},
        maxQueuedPerProfile: configuration.orchestration?.providerAdmission?.maxQueuedPerProfile ?? 50,
        pollIntervalMs: configuration.orchestration?.providerAdmission?.pollIntervalMs ?? 50,
        maxWaitMs: configuration.orchestration?.providerAdmission?.maxWaitMs ?? 600000
      }
    },
    parallelBatch: {
      enabled: configuration.parallelBatch?.enabled === true,
      editEnabled: configuration.parallelBatch?.editEnabled === true,
      maxWorkers: configuration.parallelBatch?.maxWorkers ?? 5,
      providerConcurrency: configuration.parallelBatch?.providerConcurrency || {},
      defaultProviderConcurrency: configuration.parallelBatch?.defaultProviderConcurrency ?? 2,
      planTtlMs: configuration.parallelBatch?.planTtlMs ?? 600000,
      maxSummaryCharacters: configuration.parallelBatch?.maxSummaryCharacters ?? 4096,
      maxBatchSummaryBytes: configuration.parallelBatch?.maxBatchSummaryBytes ?? 20480,
      maxReadablePathsPerTask: configuration.parallelBatch?.maxReadablePathsPerTask ?? 50,
      maxContextFilesPerTask: configuration.parallelBatch?.maxContextFilesPerTask ?? 100,
      maxReadableSnapshotBytes: configuration.parallelBatch?.maxReadableSnapshotBytes ?? 8388608,
      maxOutputBytesPerTask: configuration.parallelBatch?.maxOutputBytesPerTask ?? 8388608,
      artifactTtlMs: configuration.parallelBatch?.artifactTtlMs ?? 86400000,
      maxArtifactBytes: configuration.parallelBatch?.maxArtifactBytes ?? 1048576,
      maxArtifactTotalBytes: configuration.parallelBatch?.maxArtifactTotalBytes ?? 52428800,
      allowedTargets: configuration.parallelBatch?.allowedTargets || ["codex", "claude_code", "native_claude", "antigravity"],
      codexNetworkOffCapability: configuration.parallelBatch?.codexNetworkOffCapability || "unavailable",
      autoOpenTerminalDashboard: configuration.parallelBatch?.autoOpenTerminalDashboard === true,
      worktreeRoot: configuration.parallelBatch?.worktreeRoot
        ? resolvePackagePath(configuration.parallelBatch.worktreeRoot)
        : path.join(options.statePaths?.state || createDefaultStatePaths().state, "worktrees"),
      verificationCommands: configuration.parallelBatch?.verificationCommands || [],
      orphanGraceMs: configuration.parallelBatch?.orphanGraceMs ?? 300000
    },
    agentRulesPath: path.resolve(packageRoot, configuration.agentRules),
    subagentRulesPath: path.resolve(packageRoot, configuration.deepseek.subagentRules),
    skills: {
      ...configuration.skills,
      rootPath: path.resolve(packageRoot, configuration.skills.root)
    }
  };
}

export function loadTextFile(filePath) {
  return fs.readFileSync(filePath, "utf8").trim();
}

export function loadSkills(configuration, requestedSkillNames = []) {
  const allowedSkillNames = new Set(configuration.skills.allowed);
  return requestedSkillNames.map((skillName) => {
    if (!allowedSkillNames.has(skillName)) {
      throw new Error(`İzin verilmeyen skill: ${skillName}`);
    }
    const skillPath = path.join(configuration.skills.rootPath, skillName, "SKILL.md");
    if (!fs.existsSync(skillPath)) {
      throw new Error(`Skill bulunamadı: ${skillName}`);
    }
    return {
      name: skillName,
      content: loadTextFile(skillPath)
    };
  });
}

export function validateWorkspace(workspace, allowedRoots, deniedRoots = []) {
  const requestedWorkspace = path.resolve(workspace);
  const resolvedWorkspace = resolveForComparison(requestedWorkspace);
  const normalizedWorkspace = normalizeForComparison(resolvedWorkspace);
  const denied = deniedRoots.some((root) => {
    const normalizedRoot = normalizeForComparison(resolveForComparison(root));
    return normalizedWorkspace === normalizedRoot || normalizedWorkspace.startsWith(`${normalizedRoot}${path.sep}`);
  });
  if (denied) {
    throw new Error(`Workspace korunan kökün içinde: ${resolvedWorkspace}`);
  }
  const allowed = allowedRoots.some((root) => {
    const normalizedRoot = normalizeForComparison(resolveForComparison(root));
    return normalizedWorkspace === normalizedRoot || normalizedWorkspace.startsWith(`${normalizedRoot}${path.sep}`);
  });
  if (!allowed) {
    throw new Error(`Workspace izinli köklerin dışında: ${resolvedWorkspace}`);
  }
  if (!fs.existsSync(resolvedWorkspace) || !fs.statSync(resolvedWorkspace).isDirectory()) {
    throw new Error(`Workspace bulunamadı: ${resolvedWorkspace}`);
  }
  return resolvedWorkspace;
}

export function requireGitRepository(workspace) {
  if (!fs.existsSync(path.join(workspace, ".git"))) {
    throw new Error(`Git repository gerekli: ${workspace}`);
  }
}

export function ensureRuntimeDirectories(configuration) {
  const migrationPlan = planRuntimeStateMigration({ stateRoot: configuration.statePaths.state });
  if (migrationPlan.failClosed) {
    throw new Error("Runtime state schema is incompatible; run npm run state:migrate");
  }
  const directories = [
    path.join(configuration.statePaths.logs, "runs"),
    path.join(configuration.statePaths.logs, "metrics"),
    path.join(configuration.statePaths.logs, "audit"),
    path.join(configuration.statePaths.state, "checkpoints"),
    path.join(configuration.statePaths.state, "parallel-batches"),
    path.join(configuration.statePaths.state, "parallel-batches", "plans"),
    path.join(configuration.statePaths.state, "parallel-batches", "batches"),
    path.join(configuration.statePaths.state, "parallel-artifacts"),
    configuration.statePaths.cache
  ];
  for (const directory of directories) {
    fs.mkdirSync(directory, { recursive: true });
  }
}

const forbiddenExecutableNames = new Set(["cmd", "cmd.exe", "powershell", "powershell.exe", "pwsh", "pwsh.exe", "sh", "bash"]);

const agentModeSchema = z.enum(["read_only", "edit"]);

const agentConfigSchema = z.object({
  enabled: z.boolean(),
  executable: z.string().min(1).refine((value) => !forbiddenExecutableNames.has(path.basename(value).toLocaleLowerCase("en-US")), "command interpreters are not allowed as executables"),
  execArgs: z.array(z.string()).optional(),
  timeoutMs: z.number().int().positive().optional(),
  probeTimeoutMs: z.number().int().positive().optional(),
  maxRetries: z.number().int().min(0).max(10).optional(),
  maxOutputBytes: z.number().int().positive().optional(),
  defaultSandbox: z.boolean().optional(),
  mode: agentModeSchema.optional(),
  defaultMode: agentModeSchema.optional(),
  allowedModes: z.array(agentModeSchema).min(1).max(2).optional(),
  allowNonGitWorkspace: z.boolean().optional(),
  allowedModels: z.array(z.string().min(1).max(160)).min(1).max(50).optional()
}).strict().superRefine((value, context) => {
  if (value.defaultMode && value.allowedModes && !value.allowedModes.includes(value.defaultMode)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["defaultMode"], message: "defaultMode must be included in allowedModes" });
  }
});

const agentsConfigRootSchema = z.object({
  agents: z.record(z.string().min(1).max(64), agentConfigSchema)
}).strict().superRefine((value, context) => {
  for (const retiredAgent of ["opencode", "glm", "kimi", "qwen"]) {
    if (Object.hasOwn(value.agents, retiredAgent)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["agents", retiredAgent], message: "retired provider agent is not supported" });
    }
  }
});

export function validateAgentsConfig(rawAgentsConfig) {
  return agentsConfigRootSchema.safeParse(rawAgentsConfig);
}

export function loadAgentsConfig(options = {}) {
  const agentsPath = options.agentsPath || process.env.SUBAGENT_BRIDGE_AGENTS_CONFIG || getPersonalBridgeLayout().agentsPath;
  const raw = readJson(agentsPath);
  const agents = Object.fromEntries(Object.entries(raw.agents || {})
    .filter(([name]) => !["opencode", "glm", "kimi", "qwen"].includes(name)));
  const validation = validateAgentsConfig({ ...raw, agents });
  if (!validation.success) {
    const issues = validation.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid config/agents.json: ${issues}`);
  }
  return validation.data;
}

export function loadRuntimeConfiguration(options = {}) {
  const configuration = loadConfiguration(options);
  const agents = loadAgentsConfig(options);
  const reservedKeys = new Set(Object.keys(configuration));
  const agentKeys = Object.keys(agents.agents);
  const collisions = agentKeys.filter((key) => reservedKeys.has(key));
  if (collisions.length > 0) {
    throw new Error(`agents.json backend name collides with policy key: ${collisions.join(", ")}`);
  }
  return {
    ...configuration,
    ...agents.agents,
    parallelBatch: {
      ...configuration.parallelBatch,
      allowedTargets: configuration.parallelBatch.allowedTargets.filter((target) => !["opencode", "glm", "kimi", "qwen"].includes(target))
    }
  };
}
