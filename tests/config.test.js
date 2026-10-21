import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfiguration, loadRuntimeConfiguration, validateAgentsConfig, validateConfiguration, validateWorkspace } from "../subagent-bridge/src/config.js";

test("izinli kök içindeki workspace kabul edilir", () => {
  const root = path.resolve("C:\\Users\\user\\Desktop\\Yazılım_Siber");
  const workspace = path.join(root, "ornek-proje");
  assert.throws(() => validateWorkspace(workspace, [root]), /Workspace bulunamadı/);
});

test("Codex MCP yapılandırması DeepSeek anahtarını yalnız izinli ortam değişkeni olarak aktarır", () => {
  const codexConfiguration = fs.readFileSync(path.resolve(".codex/config.toml"), "utf8");
  const environmentAllowlist = codexConfiguration.match(/env_vars\s*=\s*\[([\s\S]*?)\]/u)?.[1] || "";
  assert.match(environmentAllowlist, /"DEEPSEEK_API_KEY"/u);
  assert.doesNotMatch(codexConfiguration, /^\s*DEEPSEEK_API_KEY\s*=/mu);
});

test("izinli kök dışındaki workspace reddedilir", () => {
  assert.throws(
    () => validateWorkspace("C:\\Windows", ["C:\\Users\\user\\Desktop\\Yazılım_Siber"]),
    /izinli köklerin dışında/
  );
});

test("korunan kök DeepSeek workspace olarak reddedilir", () => {
  const allowedRoot = "C:\\Users\\user\\Desktop\\Yazılım_Siber";
  const memoryRoot = path.join(allowedRoot, "orkestrasyon", "memory");
  assert.throws(
    () => validateWorkspace(memoryRoot, [allowedRoot], [memoryRoot]),
    /korunan kökün içinde/
  );
});

test("Vault kökü boş DeepSeek deny listesinde bile zorunlu olarak reddedilir", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "orchestrator-config-"));
  const vaultRoot = path.join(root, "vault");
  const configurationPath = path.join(root, "policy.json");
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(vaultRoot);
  const policy = JSON.parse(fs.readFileSync(path.resolve("config/policy.json"), "utf8"));
  policy.allowedRoots = [root];
  policy.deepseek.deniedRoots = [];
  policy.workspacePolicy.antigravityDeniedRoots = [];
  policy.memory.vaultRoot = vaultRoot;
  fs.writeFileSync(configurationPath, JSON.stringify(policy), "utf8");
  const configuration = loadConfiguration({ configurationPath });
  assert.deepEqual(configuration.deepseek.deniedRootPaths, [vaultRoot]);
  assert.deepEqual(configuration.workspacePolicy.antigravityDeniedRootPaths, [vaultRoot]);
  assert.equal(configuration.parallelBatch.maxOutputBytesPerTask, 8388608);
  assert.throws(
    () => validateWorkspace(vaultRoot, configuration.allowedRoots, configuration.deepseek.deniedRootPaths),
    /korunan kökün içinde/
  );
  assert.throws(
    () => validateWorkspace(path.join(vaultRoot, "01_Projects"), configuration.allowedRoots, configuration.deepseek.deniedRootPaths),
    /korunan kökün içinde/
  );
});

test("Antigravity deny listesi DeepSeek deny listesinden bağımsızdır", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "orchestrator-antigravity-config-"));
  const vaultRoot = path.join(root, "vault");
  const antigravityDeniedRoot = path.join(root, "antigravity-deny");
  const deepseekDeniedRoot = path.join(root, "deepseek-deny");
  const configurationPath = path.join(root, "policy.json");
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(vaultRoot);
  fs.mkdirSync(antigravityDeniedRoot);
  fs.mkdirSync(deepseekDeniedRoot);
  const policy = JSON.parse(fs.readFileSync(path.resolve("config/policy.json"), "utf8"));
  policy.allowedRoots = [root];
  policy.memory.vaultRoot = vaultRoot;
  policy.workspacePolicy.antigravityDeniedRoots = [antigravityDeniedRoot];
  policy.deepseek.deniedRoots = [deepseekDeniedRoot];
  fs.writeFileSync(configurationPath, JSON.stringify(policy), "utf8");
  const configuration = loadConfiguration({ configurationPath });
  assert.throws(
    () => validateWorkspace(antigravityDeniedRoot, configuration.allowedRoots, configuration.workspacePolicy.antigravityDeniedRootPaths),
    /korunan kökün içinde/
  );
  assert.doesNotThrow(
    () => validateWorkspace(deepseekDeniedRoot, configuration.allowedRoots, configuration.workspacePolicy.antigravityDeniedRootPaths)
  );
});

test("provider rol profilleri exact model kullanır ve edit fallback policy ile sınırlıdır", () => {
  const policy = JSON.parse(fs.readFileSync(path.resolve("config/policy.json"), "utf8"));
  const profiles = policy.orchestration.taskProfiles;
  assert.deepEqual({ target: profiles.quick_read.target, model: profiles.quick_read.model }, { target: "codex", model: "gpt-5.6-luna" });
  assert.deepEqual({ target: profiles.review.target, model: profiles.review.model }, { target: "codex", model: "gpt-5.6-terra" });
  assert.deepEqual({ target: profiles.critical_review.target, model: profiles.critical_review.model }, { target: "codex", model: "gpt-5.6-sol" });
  assert.deepEqual({ target: profiles.sol61_review.target, model: profiles.sol61_review.model, mode: profiles.sol61_review.mode, priority: profiles.sol61_review.priority, cacheable: profiles.sol61_review.cacheable }, { target: "codex", model: "gpt-6.1-sol", mode: "read_only", priority: 13, cacheable: true });
  assert.deepEqual({ target: profiles.luna_implementation.target, model: profiles.luna_implementation.model, mode: profiles.luna_implementation.mode }, { target: "codex", model: "gpt-5.6-luna", mode: "edit" });
  assert.deepEqual({ target: profiles.implementation.target, model: profiles.implementation.model, mode: profiles.implementation.mode }, { target: "codex", model: "gpt-5.6-terra", mode: "edit" });
  assert.deepEqual({ target: profiles.critical_implementation.target, model: profiles.critical_implementation.model, mode: profiles.critical_implementation.mode }, { target: "codex", model: "gpt-5.6-sol", mode: "edit" });
  assert.deepEqual({ target: profiles.sol61_implementation.target, model: profiles.sol61_implementation.model, mode: profiles.sol61_implementation.mode, priority: profiles.sol61_implementation.priority, cacheable: profiles.sol61_implementation.cacheable }, { target: "codex", model: "gpt-6.1-sol", mode: "edit", priority: 4, cacheable: false });
  assert.deepEqual(profiles.sol61_implementation.fallbackTargets, [
    { target: "codex", model: "gpt-6-sol" },
    { target: "codex", model: "gpt-5.6-sol" }
  ]);
  assert.deepEqual({ target: profiles.astra_review.target, model: profiles.astra_review.model, mode: profiles.astra_review.mode, priority: profiles.astra_review.priority, cacheable: profiles.astra_review.cacheable }, { target: "codex", model: "gpt-6-astra", mode: "read_only", priority: 14, cacheable: true });
  assert.deepEqual({ target: profiles.astra_implementation.target, model: profiles.astra_implementation.model, mode: profiles.astra_implementation.mode, priority: profiles.astra_implementation.priority, cacheable: profiles.astra_implementation.cacheable }, { target: "codex", model: "gpt-6-astra", mode: "edit", priority: 4, cacheable: false });
  assert.deepEqual(profiles.astra_implementation.fallbackTargets, [
    { target: "codex", model: "gpt-5.6-sol" }
  ]);
  assert.equal(profiles.web_research.target, "gemini_flash");
  assert.equal(profiles.file_audit.target, "gemini_flash");
  assert.equal(profiles.implementation.mode, "edit");
  assert.equal(profiles.critical_implementation.mode, "edit");
  assert.equal(Object.values(profiles).filter((profile) => profile.mode === "read_only").some((profile) => profile.fallbackTargets), false);
  assert.deepEqual(profiles.implementation.fallbackTargets, []);
  assert.equal(Object.keys(profiles).some((name) => /glm|kimi|qwen|deepseek_pro|deep_analysis/u.test(name)), false);
  assert.deepEqual({ target: profiles.low_cost_analysis.target, model: profiles.low_cost_analysis.model, mode: profiles.low_cost_analysis.mode }, { target: "deepseek", model: "deepseek_flash", mode: "read_only" });
});

test("provider admission profili canonical DeepSeek modellerini ortak limitle sınırlar", () => {
  const policy = JSON.parse(fs.readFileSync(path.resolve("config/policy.json"), "utf8"));
  assert.equal(policy.orchestration.providerAdmission.defaultConcurrency, 2);
  assert.equal(policy.orchestration.providerAdmission.profileConcurrency["deepseek:deepseek-flash"], 1);
  assert.equal(policy.orchestration.providerAdmission.maxQueuedPerProfile, 50);
  assert.equal(validateConfiguration(policy).success, true);
  policy.orchestration.providerAdmission.profileConcurrency["deepseek:deepseek-flash"] = 11;
  assert.equal(validateConfiguration(policy).success, false);
});

test("DeepSeek API policy resmi endpoint ve bir dolar pilot tavanıyla sınırlandırılır", () => {
  const policy = JSON.parse(fs.readFileSync(path.resolve("config/policy.json"), "utf8"));
  assert.equal(validateConfiguration(policy).success, true);
  const alternateEndpoint = JSON.parse(JSON.stringify(policy));
  alternateEndpoint.deepseek.apiBaseUrl = "https://api.example.com";
  assert.equal(validateConfiguration(alternateEndpoint).success, false);
  const overBudget = JSON.parse(JSON.stringify(policy));
  overBudget.deepseek.pilotBudgetUsd = 1.01;
  assert.equal(validateConfiguration(overBudget).success, false);
});

test("DeepSeek Flash canonical API kimliğine bağlıdır ve OpenCode konfigürasyonu kaldırılmıştır", () => {
  const policy = JSON.parse(fs.readFileSync(path.resolve("config/policy.json"), "utf8"));
  assert.equal(policy.configVersion, 3);
  assert.equal(policy.deepseek.apiModel, "deepseek-flash");
  assert.equal(Object.hasOwn(policy.deepseek, "openCodeModel"), false);
  const agents = JSON.parse(fs.readFileSync(path.resolve("config/agents.json"), "utf8"));
  assert.deepEqual(Object.keys(agents.agents).sort(), ["antigravity", "claude_code", "codex"]);
});

test("eski v2 yapılandırması OpenCode hedeflerini bellek içinde çıkarır ve güncel şema strict kalır", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "config-v2-retirement-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const policy = JSON.parse(fs.readFileSync(path.resolve("config/policy.json"), "utf8"));
  policy.configVersion = 2;
  policy.deepseek.openCodeModel = "deepseek/deepseek-v4-pro";
  policy.deepseek.openCodeFlashModel = "deepseek/deepseek-flash";
  policy.glm = { openCodeModel: "glm-legacy" };
  policy.orchestration.taskProfiles.deep_analysis = { target: "opencode", model: "deepseek/deepseek-v4-pro", mode: "read_only", priority: 1, cacheable: true };
  policy.orchestration.taskProfiles.review.fallbackTargets = [{ target: "codex", model: "gpt-6-sol" }, { target: "opencode", model: "deepseek/deepseek-v4-pro" }];
  policy.parallelBatch.providerConcurrency.opencode = 2;
  policy.parallelBatch.opencodeOutputCapability = "unavailable";
  const configurationPath = path.join(root, "policy.json");
  fs.writeFileSync(configurationPath, JSON.stringify(policy), "utf8");
  const configuration = loadConfiguration({ configurationPath });
  assert.equal(configuration.configVersion, 3);
  assert.equal(Object.hasOwn(configuration, "glm"), false);
  assert.equal(Object.hasOwn(configuration.deepseek, "openCodeModel"), false);
  assert.equal(Object.hasOwn(configuration.orchestration.taskProfiles, "deep_analysis"), false);
  assert.deepEqual(configuration.orchestration.taskProfiles.review.fallbackTargets, [{ target: "codex", model: "gpt-6-sol" }]);
  assert.equal(Object.hasOwn(configuration.parallelBatch.providerConcurrency, "opencode"), false);
  assert.equal(Object.hasOwn(configuration.parallelBatch, "opencodeOutputCapability"), false);
  assert.equal(JSON.parse(fs.readFileSync(configurationPath, "utf8")).configVersion, 2);
  assert.equal(validateConfiguration({ ...configuration, deepseek: { ...configuration.deepseek, openCodeModel: "legacy" } }).success, false);
});

test("config v1 migration eksik alanları tamamlar ve v3 retired route migration uygular", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "config-migrate-"));
  const policy = JSON.parse(fs.readFileSync(path.resolve("config/policy.json"), "utf8"));
  const v1Policy = { ...policy, configVersion: 1 };
  delete v1Policy.observability.maxMetricRetentionDays;
  delete v1Policy.orchestration.scheduler.leaseHeartbeatMs;
  const configurationPath = path.join(root, "policy.json");
  fs.writeFileSync(configurationPath, JSON.stringify(v1Policy), "utf8");
  const configuration = loadConfiguration({ configurationPath });
  assert.equal(configuration.configVersion, 3);
  assert.equal(configuration.observability.maxMetricRetentionDays, 30);
  assert.equal(configuration.orchestration.scheduler.leaseHeartbeatMs, 300000);
  fs.rmSync(root, { recursive: true, force: true });
});

test("config desteklenmeyen sürüm reddedilir", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "config-badversion-"));
  const policy = JSON.parse(fs.readFileSync(path.resolve("config/policy.json"), "utf8"));
  policy.configVersion = 99;
  const configurationPath = path.join(root, "policy.json");
  fs.writeFileSync(configurationPath, JSON.stringify(policy), "utf8");
  assert.throws(() => loadConfiguration({ configurationPath }), /Unsupported configuration version/);
  fs.rmSync(root, { recursive: true, force: true });
});

test("agents.json backend adı policy anahtarıyla çakışırsa reddedilir", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "config-collision-"));
  const policy = JSON.parse(fs.readFileSync(path.resolve("config/policy.json"), "utf8"));
  policy.allowedRoots = [root];
  policy.memory.vaultRoot = path.join(root, "vault");
  fs.mkdirSync(policy.memory.vaultRoot);
  const configurationPath = path.join(root, "policy.json");
  fs.writeFileSync(configurationPath, JSON.stringify(policy), "utf8");
  const agents = {
    agents: {
      memory: {
        enabled: true,
        executable: "test.exe",
        defaultMode: "read_only",
        allowedModes: ["read_only"]
      }
    }
  };
  const agentsPath = path.join(root, "agents.json");
  fs.writeFileSync(agentsPath, JSON.stringify(agents), "utf8");
  assert.throws(
    () => loadRuntimeConfiguration({ configurationPath, agentsPath }),
    /collides/i
  );
  fs.rmSync(root, { recursive: true, force: true });
});
