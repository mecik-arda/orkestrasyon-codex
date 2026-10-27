import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";
import { createReviewSourcePermitRegistry } from "../subagent-bridge/src/services/review-source-permit-registry.js";

function createBinding(overrides = {}) {
  return {
    workspaceHash: "a".repeat(64),
    head: "b".repeat(40),
    caller: "codexDesktop",
    target: "codex",
    model: "gpt-6.1-sol",
    promptSha256: "c".repeat(64),
    bundleSha256: "d".repeat(64),
    entries: [{ path: "src/example.js", sha256: "e".repeat(64), sizeBytes: 18, mode: 420 }],
    ...overrides
  };
}

function createRegistry(t, options = {}) {
  const stateDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "review-source-permit-"));
  t.after(() => fs.rmSync(stateDirectory, { recursive: true, force: true }));
  return { registry: createReviewSourcePermitRegistry({ stateDirectory, enabled: true, ...options }), stateDirectory };
}

test("RSP-00: registry stays disabled unless the host explicitly enables it", (t) => {
  const stateDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "review-source-permit-disabled-"));
  t.after(() => fs.rmSync(stateDirectory, { recursive: true, force: true }));
  const registry = createReviewSourcePermitRegistry({ stateDirectory });
  assert.deepEqual(registry.issue({ binding: createBinding(), humanConfirmed: true }), { ok: false, reason: "disabled" });
  assert.deepEqual(registry.consume({ permitId: "a".repeat(64), binding: createBinding() }), { ok: false, reason: "disabled" });
});

test("RSP-01: permit issuance requires a separate trusted human confirmation", (t) => {
  const { registry } = createRegistry(t);
  assert.throws(() => registry.issue({ binding: createBinding(), humanConfirmed: false }), /human confirmation/u);
  assert.throws(() => registry.issue({ binding: createBinding() }), /human confirmation/u);
});

test("RSP-02: permit binds the full reviewed request and consumes once", (t) => {
  const { registry } = createRegistry(t);
  const binding = createBinding();
  const issued = registry.issue({ binding, humanConfirmed: true });
  assert.equal(registry.consume({ permitId: issued.permitId, binding: createBinding({ model: "gpt-6.0-sol" }) }).ok, false);
  assert.equal(registry.consume({ permitId: issued.permitId, binding }).ok, true);
  assert.equal(registry.consume({ permitId: issued.permitId, binding }).ok, false);
});

test("RSP-03: expiry, cancellation, restart and concurrent consumption fail closed", async (t) => {
  let now = 1_800_000_000_000;
  const { registry, stateDirectory } = createRegistry(t, { now: () => now });
  const binding = createBinding();
  const cancelled = registry.issue({ binding, humanConfirmed: true });
  assert.equal(registry.revoke({ permitId: cancelled.permitId }).ok, true);
  assert.equal(registry.consume({ permitId: cancelled.permitId, binding }).ok, false);
  const expiring = registry.issue({ binding, humanConfirmed: true });
  now += 600_001;
  assert.equal(registry.consume({ permitId: expiring.permitId, binding }).reason, "expired");

  now = 1_800_000_000_000;
  const concurrent = registry.issue({ binding, humanConfirmed: true });
  const readyDirectory = path.join(stateDirectory, "ready");
  fs.mkdirSync(readyDirectory);
  const goPath = path.join(stateDirectory, "go");
  const registryModule = new URL("../subagent-bridge/src/services/review-source-permit-registry.js", import.meta.url).href;
  const worker = `import fs from "node:fs"; const { createReviewSourcePermitRegistry } = await import(process.argv[1]); const [, , stateDirectory, permitId, bindingText, readyPath, goPath] = process.argv; fs.writeFileSync(readyPath, "ready"); while (!fs.existsSync(goPath)) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5); const registry = createReviewSourcePermitRegistry({ stateDirectory, now: () => 1800000000000, enabled: true }); process.stdout.write(JSON.stringify(registry.consume({ permitId, binding: JSON.parse(bindingText) })));`;
  const children = ["first", "second"].map((name) => {
    const readyPath = path.join(readyDirectory, name);
    const child = spawn(process.execPath, ["--input-type=module", "-e", worker, registryModule, stateDirectory, concurrent.permitId, JSON.stringify(binding), readyPath, goPath], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    return { child, get stdout() { return stdout; }, get stderr() { return stderr; }, readyPath };
  });
  const waitForReady = async () => {
    const deadline = Date.now() + 10_000;
    while (children.some(({ readyPath }) => !fs.existsSync(readyPath)) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.equal(children.every(({ readyPath }) => fs.existsSync(readyPath)), true);
  };
  await waitForReady();
  fs.writeFileSync(goPath, "go");
  const results = await Promise.all(children.map((entry) => new Promise((resolve, reject) => {
    entry.child.once("error", reject);
    entry.child.once("close", (code) => code === 0 ? resolve(JSON.parse(entry.stdout)) : reject(new Error(`worker failed ${code}: ${entry.stderr}`)));
  })));
  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.equal(registry.consume({ permitId: concurrent.permitId, binding }).ok, false);
});

test("RSP-04: audit omits bearer values and reviewed content", (t) => {
  const { registry, stateDirectory } = createRegistry(t);
  const binding = createBinding();
  const issued = registry.issue({ binding, humanConfirmed: true });
  registry.consume({ permitId: issued.permitId, binding });
  const persisted = fs.readFileSync(path.join(stateDirectory, "review-permits", "audit.jsonl"), "utf8");
  assert.equal(persisted.includes(issued.permitId), false);
  assert.equal(persisted.includes("src/example.js"), false);
  assert.equal(persisted.includes(binding.promptSha256), false);
  assert.equal(persisted.includes("humanConfirmed"), false);
});

test("RSP-05: incomplete persisted records cannot be consumed", (t) => {
  const { registry, stateDirectory } = createRegistry(t);
  const binding = createBinding();
  const issued = registry.issue({ binding, humanConfirmed: true });
  const records = fs.readdirSync(path.join(stateDirectory, "review-permits")).filter((entry) => entry.endsWith(".json"));
  fs.writeFileSync(path.join(stateDirectory, "review-permits", records[0]), "{broken");
  assert.equal(registry.consume({ permitId: issued.permitId, binding }).ok, false);
});

test("RSP-06: a process exit after durable consumption cannot restore the permit", async (t) => {
  const { registry, stateDirectory } = createRegistry(t);
  const binding = createBinding();
  const issued = registry.issue({ binding, humanConfirmed: true });
  const registryModule = new URL("../subagent-bridge/src/services/review-source-permit-registry.js", import.meta.url).href;
  const worker = `const { createReviewSourcePermitRegistry } = await import(process.argv[1]); const [, , stateDirectory, permitId, bindingText] = process.argv; const registry = createReviewSourcePermitRegistry({ stateDirectory, enabled: true }); registry.consume({ permitId, binding: JSON.parse(bindingText) }); process.exit(91);`;
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", worker, registryModule, stateDirectory, issued.permitId, JSON.stringify(binding)], { stdio: "ignore" });
    child.once("error", reject);
    child.once("close", resolve);
  });
  assert.equal(result, 91);
  assert.equal(registry.consume({ permitId: issued.permitId, binding }).ok, false);
});

test("RSP-07: each workspace, HEAD, caller, route, prompt, bundle and file binding is enforced", (t) => {
  const { registry } = createRegistry(t);
  const binding = createBinding();
  const changedBindings = [
    createBinding({ workspaceHash: "f".repeat(64) }),
    createBinding({ head: "1".repeat(40) }),
    createBinding({ caller: "otherCaller" }),
    createBinding({ target: "claude_code" }),
    createBinding({ model: "other-model" }),
    createBinding({ promptSha256: "2".repeat(64) }),
    createBinding({ bundleSha256: "3".repeat(64) }),
    createBinding({ entries: [{ ...binding.entries[0], path: "src/other.js" }] }),
    createBinding({ entries: [{ ...binding.entries[0], sha256: "4".repeat(64) }] }),
    createBinding({ entries: [{ ...binding.entries[0], sizeBytes: 19 }] }),
    createBinding({ entries: [{ ...binding.entries[0], mode: 493 }] })
  ];
  for (const changedBinding of changedBindings) {
    const issued = registry.issue({ binding, humanConfirmed: true });
    assert.equal(registry.consume({ permitId: issued.permitId, binding: changedBinding }).reason, "binding_mismatch");
    assert.equal(registry.consume({ permitId: issued.permitId, binding }).ok, true);
  }
});
