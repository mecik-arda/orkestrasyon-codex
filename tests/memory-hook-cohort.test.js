import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  expectedMemoryHookProjectTarget,
  canonicalizeMemoryHookPath,
  memoryHookCohortRegistryMaxBytes,
  memoryHookCohortRegistryPath,
  parseMemoryHookCohortRegistry,
  readMemoryHookCohortRegistry,
  resolveMemoryHookProjectCohort,
  validateMemoryHookProjectInstallation
} from "../subagent-bridge/src/services/memory-hook-cohort.js";

function createRegistryFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "orchestrator-hook-cohort-"));
  const norn = path.join(root, "norn");
  const dersmerkezi = path.join(root, "dersmerkezi");
  fs.mkdirSync(norn);
  fs.mkdirSync(dersmerkezi);
  const registryPath = path.join(root, "settings", "memory-hook-cohorts.json");
  fs.mkdirSync(path.dirname(registryPath));
  const registry = {
    schemaVersion: 1,
    projects: [
      { cohort: "norn", roots: [norn] },
      { cohort: "dersmerkezi", roots: [dersmerkezi] }
    ]
  };
  fs.writeFileSync(registryPath, JSON.stringify(registry), "utf8");
  return { root, norn, dersmerkezi, registryPath, registry };
}

test("HOOK-COHORT-01: registry exact root eşleşmesi ve proje hedefi doğrulanır", (context) => {
  const fixture = createRegistryFixture();
  context.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }));
  const loaded = readMemoryHookCohortRegistry({ registryPath: fixture.registryPath });
  assert.ok(loaded);
  assert.equal(expectedMemoryHookProjectTarget(fixture.norn, "opencode"), null);
  assert.deepEqual(resolveMemoryHookProjectCohort({ projectRoots: [fixture.norn], registryPath: fixture.registryPath }), {
    projectCohort: "norn",
    status: "matched"
  });
  assert.deepEqual(resolveMemoryHookProjectCohort({ projectRoots: [path.join(fixture.norn, "nested")], registryPath: fixture.registryPath }), {
    projectCohort: "unassigned",
    status: "root_unmatched"
  });
  assert.equal(resolveMemoryHookProjectCohort({ projectRoots: [fixture.norn], requestedCohort: "dersmerkezi", registryPath: fixture.registryPath }).status, "cohort_mismatch");
  assert.equal(resolveMemoryHookProjectCohort({ projectRoots: [fixture.norn], requestedCohort: "invalid", registryPath: fixture.registryPath }).projectCohort, "unassigned");
  assert.deepEqual(validateMemoryHookProjectInstallation({
    projectRoot: fixture.norn,
    cohort: "norn",
    client: "codex",
    targetPath: expectedMemoryHookProjectTarget(fixture.norn, "codex"),
    registryPath: fixture.registryPath
  }), {
    valid: true,
    status: "matched",
    expectedTargetPath: expectedMemoryHookProjectTarget(fixture.norn, "codex")
  });
  assert.equal(validateMemoryHookProjectInstallation({
    projectRoot: fixture.norn,
    cohort: "norn",
    client: "codex",
    targetPath: path.join(fixture.root, "elsewhere.js"),
    registryPath: fixture.registryPath
  }).status, "target_scope_invalid");
  const aliasedRoot = path.join(fixture.root, "norn-alias");
  fs.symlinkSync(fixture.norn, aliasedRoot, process.platform === "win32" ? "junction" : "dir");
  const aliasedTarget = path.join(aliasedRoot, ".codex", "hooks.json");
  assert.equal(
    canonicalizeMemoryHookPath(aliasedTarget),
    canonicalizeMemoryHookPath(expectedMemoryHookProjectTarget(fixture.norn, "codex"))
  );
  assert.equal(validateMemoryHookProjectInstallation({
    projectRoot: fixture.norn,
    cohort: "norn",
    client: "codex",
    targetPath: aliasedTarget,
    registryPath: fixture.registryPath
  }).valid, true);
});

test("HOOK-COHORT-02: alias kayıtları explicit olmalı ve ambiguous cohort reddedilmeli", (context) => {
  const fixture = createRegistryFixture();
  context.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }));
  const worktree = path.join(fixture.root, "norn-worktree");
  fs.mkdirSync(worktree);
  assert.equal(resolveMemoryHookProjectCohort({ projectRoots: [worktree], registryPath: fixture.registryPath }).projectCohort, "unassigned");
  fixture.registry.projects[0].roots.push(worktree);
  fs.writeFileSync(fixture.registryPath, JSON.stringify(fixture.registry), "utf8");
  assert.equal(resolveMemoryHookProjectCohort({ projectRoots: [fixture.norn, worktree], registryPath: fixture.registryPath }).projectCohort, "norn");
  fixture.registry.projects[1].roots.push(worktree);
  assert.equal(parseMemoryHookCohortRegistry(fixture.registry), null);
  assert.equal(resolveMemoryHookProjectCohort({
    projectRoots: [fixture.norn, fixture.dersmerkezi],
    registryPath: fixture.registryPath
  }).status, "root_ambiguous");
  assert.equal(resolveMemoryHookProjectCohort({
    projectRoots: [path.join(fixture.root, "unknown"), fixture.norn],
    registryPath: fixture.registryPath
  }).projectCohort, "unassigned");
});

test("HOOK-COHORT-03: bozuk, fazla büyük ve hard-link registry fail-closed olur", (context) => {
  const fixture = createRegistryFixture();
  context.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }));
  const invalidPath = path.join(fixture.root, "invalid.json");
  fs.writeFileSync(invalidPath, JSON.stringify({ schemaVersion: 2, projects: [] }), "utf8");
  assert.equal(readMemoryHookCohortRegistry({ registryPath: invalidPath }), null);
  assert.equal(resolveMemoryHookProjectCohort({ projectRoots: [fixture.norn], registryPath: invalidPath }).status, "invalid_registry");
  assert.equal(resolveMemoryHookProjectCohort({ projectRoots: [fixture.norn], registryPath: path.join(fixture.root, "missing.json") }).status, "registry_unavailable");
  fs.writeFileSync(invalidPath, "x".repeat(memoryHookCohortRegistryMaxBytes + 1), "utf8");
  assert.equal(readMemoryHookCohortRegistry({ registryPath: invalidPath }), null);
  assert.equal(memoryHookCohortRegistryPath({ registryPath: "relative.json" }), null);
  assert.equal(resolveMemoryHookProjectCohort({ projectRoots: [fixture.norn], registryPath: "relative.json" }).status, "invalid_registry");
  const hardLinkPath = path.join(fixture.root, "hard-link.json");
  fs.linkSync(fixture.registryPath, hardLinkPath);
  assert.equal(readMemoryHookCohortRegistry({ registryPath: hardLinkPath }), null);
});

test("HOOK-COHORT-04: global and project hook cohort semantics are distinct", (context) => {
  const fixture = createRegistryFixture();
  context.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }));
  assert.equal(resolveMemoryHookProjectCohort({ projectRoots: [fixture.norn], registryPath: fixture.registryPath }).projectCohort, "norn");
  assert.deepEqual(resolveMemoryHookProjectCohort({ projectRoots: [fixture.norn], requestedCohort: "norn", registryPath: fixture.registryPath }), {
    projectCohort: "norn",
    status: "matched"
  });
  assert.deepEqual(resolveMemoryHookProjectCohort({ projectRoots: [fixture.norn], requestedCohort: "unassigned", registryPath: fixture.registryPath }), {
    projectCohort: "unassigned",
    status: "unassigned"
  });
});
