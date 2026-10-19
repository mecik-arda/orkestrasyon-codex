import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const exporterPath = path.join(projectRoot, "scripts", "export-public.ps1");
const requiredArchitectureDocuments = [
  "CONTEXT_ORKESTRASYONU_VE_GUVENLI_SECOND_BRAIN_PLANI_2026-08-21.md",
  "DEEPSEEK_EDIT_PILOT_VE_MIRROR_KARARLILIK_PLANI.md",
  "MODEL_KIMLIGI_VE_ERISIM_MODU_PLANI.md",
  "RECENT_RUNS_GOZLEMLENEBILIRLIK_PLANI.md"
];

function createSourceFixture(sourceRoot, gitMarkerType) {
  const privateExporterTest = path.join(sourceRoot, "tests", "export-public.test.js");
  fs.mkdirSync(path.dirname(privateExporterTest), { recursive: true });
  fs.writeFileSync(privateExporterTest, "Private exporter test fixture\n", "utf8");
  for (const documentName of requiredArchitectureDocuments) {
    const documentPath = path.join(sourceRoot, "docs", "plans", "yapilanlar", documentName);
    fs.mkdirSync(path.dirname(documentPath), { recursive: true });
    fs.writeFileSync(documentPath, "Public architecture fixture\n", "utf8");
  }
  if (gitMarkerType === "file") {
    fs.writeFileSync(path.join(sourceRoot, ".git"), "gitdir: C:/private/repository/.git/worktrees/source\n", "utf8");
  } else {
    fs.mkdirSync(path.join(sourceRoot, ".git"), { recursive: true });
    fs.writeFileSync(path.join(sourceRoot, ".git", "config"), "private repository metadata\n", "utf8");
  }
}

for (const gitMarkerType of ["file", "directory"]) {
  test(`public exporter excludes a .git ${gitMarkerType}`, { skip: process.platform !== "win32" }, () => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), `public-export-${gitMarkerType}-`));
    const sourceRoot = path.join(temporaryRoot, "source");
    const stagingRoot = path.join(temporaryRoot, "staging");
    fs.mkdirSync(sourceRoot, { recursive: true });
    fs.mkdirSync(path.join(stagingRoot, ".git"), { recursive: true });
    fs.writeFileSync(path.join(stagingRoot, ".git", "config"), "staging git metadata\n", "utf8");
    createSourceFixture(sourceRoot, gitMarkerType);
    try {
      const result = spawnSync("powershell.exe", [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        exporterPath,
        "-Source",
        sourceRoot,
        "-Staging",
        stagingRoot
      ], { encoding: "utf8", timeout: 120000 });
      assert.equal(result.error, undefined, result.error?.message);
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
      assert.equal(fs.statSync(path.join(stagingRoot, ".git")).isDirectory(), true);
      assert.equal(fs.readFileSync(path.join(stagingRoot, ".git", "config"), "utf8"), "staging git metadata\n");
      assert.equal(fs.existsSync(path.join(stagingRoot, "tests", "export-public.test.js")), false);
      for (const documentName of requiredArchitectureDocuments) {
        assert.equal(fs.existsSync(path.join(stagingRoot, "docs", "architecture", documentName)), true);
      }
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });
}
