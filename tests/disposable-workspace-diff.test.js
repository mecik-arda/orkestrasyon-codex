import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { provisionDisposableWorkspace } from "../subagent-bridge/src/services/disposable-workspace.js";

function createDiffFixture(t, initialContent) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "disposable-workspace-diff-"));
  const sourcePath = path.join(root, "value.json");
  fs.writeFileSync(sourcePath, initialContent, "utf8");
  const disposable = provisionDisposableWorkspace({ statePaths: { cache: path.join(root, "cache") } }, root, ["value.json"], ["value.json"]);
  t.after(() => {
    disposable.cleanup();
    fs.rmSync(root, { recursive: true, force: true });
  });
  return { disposable, sourcePath };
}

test("disposable preview diff treats one final LF as a line terminator", (t) => {
  const initialContent = "{\n  \"label\": \"bounded-read-only-acceptance\"\n}\n";
  const { disposable, sourcePath } = createDiffFixture(t, initialContent);
  fs.writeFileSync(path.join(disposable.workspace, "value.json"), initialContent.replace("bounded-read-only-acceptance", "bounded-edit-acceptance"), "utf8");
  const diff = disposable.collectChanges().diff;
  assert.match(diff, /@@ -1,3 \+1,3 @@/u);
  assert.doesNotMatch(diff, /(?:^|\n)-\n/u);
  assert.doesNotMatch(diff, /(?:^|\n)\+\n/u);
  assert.equal(fs.readFileSync(sourcePath, "utf8"), initialContent);
});

test("disposable preview diff marks a missing final newline without inventing an empty line", (t) => {
  const initialContent = "{\n  \"label\": \"bounded-read-only-acceptance\"\n}\n";
  const { disposable } = createDiffFixture(t, initialContent);
  fs.writeFileSync(path.join(disposable.workspace, "value.json"), initialContent.replace("bounded-read-only-acceptance", "bounded-edit-acceptance").slice(0, -1), "utf8");
  const diff = disposable.collectChanges().diff;
  assert.match(diff, /@@ -1,3 \+1,3 @@/u);
  assert.match(diff, /\\ No newline at end of file$/u);
  assert.doesNotMatch(diff, /(?:^|\n)\+\n/u);
});

test("disposable preview diff preserves a real added empty final line", (t) => {
  const initialContent = "{\n  \"label\": \"bounded-read-only-acceptance\"\n}\n";
  const { disposable } = createDiffFixture(t, initialContent);
  fs.writeFileSync(path.join(disposable.workspace, "value.json"), `${initialContent.replace("bounded-read-only-acceptance", "bounded-edit-acceptance")}\n`, "utf8");
  const diff = disposable.collectChanges().diff;
  assert.match(diff, /@@ -1,3 \+1,4 @@/u);
  assert.match(diff, /(?:^|\n)\+$/u);
});

test("disposable preview diff preserves a real added empty first line", (t) => {
  const initialContent = "{\n  \"label\": \"bounded-read-only-acceptance\"\n}\n";
  const { disposable } = createDiffFixture(t, initialContent);
  fs.writeFileSync(path.join(disposable.workspace, "value.json"), `\n${initialContent.replace("bounded-read-only-acceptance", "bounded-edit-acceptance")}`, "utf8");
  const diff = disposable.collectChanges().diff;
  assert.match(diff, /@@ -1,3 \+1,4 @@/u);
  const diffLines = diff.split("\n");
  const firstObjectLineIndex = diffLines.indexOf("+{");
  assert.equal(diffLines[firstObjectLineIndex - 1], "+");
});

test("disposable preview diff makes CRLF and LF changes visible", (t) => {
  const initialContent = "{\r\n  \"label\": \"bounded-read-only-acceptance\"\r\n}\r\n";
  const { disposable } = createDiffFixture(t, initialContent);
  fs.writeFileSync(path.join(disposable.workspace, "value.json"), initialContent.replaceAll("\r\n", "\n"), "utf8");
  const diff = disposable.collectChanges().diff;
  assert.match(diff, /-\{\\r\\n/u);
  assert.match(diff, /\+\{/u);
  assert.doesNotMatch(diff, /\+\{\\r\\n/u);
});
