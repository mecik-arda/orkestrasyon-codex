import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import test from "node:test";
import { searchPersistentMemory } from "../../subagent-bridge/src/memory.js";

function createConfiguration(vaultRootPath) {
  return {
    memory: {
      enabled: true,
      vaultRootPath,
      ignoredDirectories: ["05_Attachments", "node_modules"],
      maxIndexedFiles: 5000,
      maxSearchResults: 10,
      maxSearchFileBytes: 131072,
      maxExcerptCharacters: 300
    }
  };
}

test("hafıza araması 5000 notta performans sınırını korur", { timeout: 35000 }, (context) => {
  const vaultRootPath = fs.mkdtempSync(path.join(os.tmpdir(), "orchestrator-memory-search-benchmark-"));
  context.after(() => fs.rmSync(vaultRootPath, { recursive: true, force: true }));
  const noteDirectory = path.join(vaultRootPath, "03_Resources");
  fs.mkdirSync(noteDirectory, { recursive: true });
  for (let index = 0; index < 5000; index += 1) {
    fs.writeFileSync(path.join(noteDirectory, `Not-${index}.md`), [
      "---",
      `title: "Not ${index}"`,
      "created: \"2026-08-11T00:00:00.000Z\"",
      "updated: \"2026-08-11T00:00:00.000Z\"",
      "confidence: \"high\"",
      "verification: \"verified\"",
      "stage: \"published\"",
      "memory_type: \"semantic\"",
      "tags:",
      `  - \"etiket-${index}\"`,
      "sources:",
      "---",
      "",
      `# Not ${index}`,
      "",
      `kelime${index} alfa${index} beta${index} gama${index} delta${index} epsilon${index} zeta${index}`
    ].join("\n"), "utf8");
  }
  const configuration = createConfiguration(vaultRootPath);
  const startedAt = performance.now();
  const result = searchPersistentMemory(configuration, { query: "kelime4321", limit: 5 });
  assert.ok(performance.now() - startedAt < 30000);
  assert.equal(result.matches.some((match) => match.relativePath.endsWith("Not-4321.md")), true);
});
