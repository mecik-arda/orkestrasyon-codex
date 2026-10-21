import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("provider routing apply migrates legacy config before strict validation", (context) => {
  const temporaryRoot = fs.mkdtempSync(path.join(projectRoot, ".tmp-routing-config-"));
  context.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
  const template = JSON.parse(fs.readFileSync(path.join(projectRoot, "config", "policy.json"), "utf8"));
  const legacy = structuredClone(template);
  legacy.configVersion = 2;
  legacy.deepseek.openCodeModel = "legacy-model";
  legacy.deepseek.openCodeFlashModel = "legacy-flash";
  legacy.kimi = { timeoutMs: 1000 };
  legacy.qwen = { timeoutMs: 1000 };
  legacy.glm = { timeoutMs: 1000 };
  legacy.orchestration.taskProfiles.retired = {
    target: "opencode",
    model: "legacy-model",
    mode: "read_only",
    priority: 1,
    cacheable: false
  };
  legacy.parallelBatch.providerConcurrency.opencode = 1;
  legacy.parallelBatch.allowedTargets.push("opencode");
  const configurationPath = path.join(temporaryRoot, "policy.json");
  fs.writeFileSync(configurationPath, `${JSON.stringify(legacy, null, 2)}\n`, "utf8");

  execFileSync(process.execPath, [path.join(projectRoot, "scripts", "apply-provider-routing.js")], {
    cwd: projectRoot,
    env: { ...process.env, ORCHESTRATOR_CONFIG: configurationPath },
    windowsHide: true,
    timeout: 30000,
    stdio: "pipe"
  });

  const applied = JSON.parse(fs.readFileSync(configurationPath, "utf8"));
  assert.equal(applied.configVersion, 3);
  assert.equal(Object.hasOwn(applied, "kimi"), false);
  assert.equal(Object.hasOwn(applied, "qwen"), false);
  assert.equal(Object.hasOwn(applied, "glm"), false);
  assert.equal(Object.hasOwn(applied.deepseek, "openCodeModel"), false);
  assert.equal(Object.hasOwn(applied.deepseek, "openCodeFlashModel"), false);
  assert.equal(Object.hasOwn(applied.orchestration.taskProfiles, "retired"), false);
  assert.equal(applied.parallelBatch.allowedTargets.includes("opencode"), false);
  assert.equal(Object.hasOwn(applied.parallelBatch.providerConcurrency, "opencode"), false);
  assert.deepEqual(applied.allowedRoots, legacy.allowedRoots);
  assert.equal(fs.readdirSync(path.join(temporaryRoot, "backups")).length, 1);
});
