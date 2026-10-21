import { ANTIGRAVITY_ACTIVE_MODEL_ALIASES, ANTIGRAVITY_DISABLED_MODEL_ALIASES } from "../adapters/antigravity-adapter.js";

const ANTIGRAVITY_TARGETS = new Set(ANTIGRAVITY_ACTIVE_MODEL_ALIASES);

function disabledAntigravityModelError(model) {
  return Object.assign(new Error(`Antigravity model is disabled by the current access policy: ${model}`), {
    failureClass: "model_access_denied"
  });
}

function requireModel(model, target) {
  if (typeof model !== "string" || model.trim().length === 0) {
    throw new Error(`model is required for target '${target}'`);
  }
  return model.trim();
}

export function resolveRuntimeRoute({ target, model, profile }, configuration = {}) {
  if (ANTIGRAVITY_DISABLED_MODEL_ALIASES.has(target)) throw disabledAntigravityModelError(target);
  if (target === "profile") {
    const selectedProfile = configuration.orchestration?.taskProfiles?.[profile];
    if (!selectedProfile) {
      throw new Error(`unsupported task profile: ${profile || "unknown"}`);
    }
    return resolveRuntimeRoute({ target: selectedProfile.target, model: selectedProfile.model }, configuration);
  }
  if (ANTIGRAVITY_TARGETS.has(target)) {
    return { backend: "antigravity", model: target };
  }
  if (target === "antigravity") {
    const selectedModel = requireModel(model, target);
    if (ANTIGRAVITY_DISABLED_MODEL_ALIASES.has(selectedModel)) throw disabledAntigravityModelError(selectedModel);
    if (!ANTIGRAVITY_TARGETS.has(selectedModel)) {
      throw new Error(`unsupported Antigravity model: ${selectedModel}`);
    }
    return { backend: "antigravity", model: selectedModel };
  }
  if (target === "codex") {
    return { backend: "codex", model: model?.trim() || "default" };
  }
  if (target === "deepseek") {
    const selectedModel = model?.trim() || "deepseek_flash";
    if (!["deepseek_flash", "deepseek-flash"].includes(selectedModel)) {
      throw Object.assign(new Error("unsupported DeepSeek API model"), { failureClass: "invalid_model" });
    }
    return { backend: "deepseek", model: "deepseek-flash" };
  }
  if (target === "native_claude" || target === "claude_code") {
    return { backend: "claude_code", model: model?.trim() || "sonnet" };
  }
  throw new Error(`unsupported runtime target: ${target}`);
}
