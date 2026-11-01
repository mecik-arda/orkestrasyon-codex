import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { applyPreparedChanges } from "../subagent-bridge/src/services/disposable-workspace.js";

test("promotion rollback preserves a different file created while the original is backed up", (t) => {
  const base = fs.realpathSync(os.tmpdir());
  const root = fs.mkdtempSync(path.join(base, "p2-promotion-conflict-"));
  t.after(() => {
    assert.equal(path.dirname(root), base);
    assert.equal(fs.realpathSync(root), root);
    fs.rmSync(root, { recursive: true, force: true });
  });
  const target = path.join(root, "fixture.txt");
  const original = "before\n";
  fs.writeFileSync(target, original);
  const originalIdentity = fs.statSync(target, { bigint: true });
  const digest = crypto.createHash("sha256").update(original).digest("hex");
  const rename = fs.renameSync;
  let externalIdentity;
  let injected = false;
  try {
    fs.renameSync = (source, destination) => {
      if (!injected && String(source).endsWith(".tmp") && destination === target) {
        injected = true;
        fs.writeFileSync(target, original, { flag: "wx" });
        externalIdentity = fs.statSync(target, { bigint: true });
        throw Object.assign(new Error("synthetic promotion failure"), { code: "EIO" });
      }
      return rename(source, destination);
    };
    assert.throws(() => applyPreparedChanges(root, [{ relativePath: "fixture.txt", content: Buffer.from("after\n") }], [{ relativePath: "fixture.txt", state: "present", sha256: digest }]), (error) => error.failureClass === "mutation_state_unknown");
  } finally {
    fs.renameSync = rename;
  }
  assert.equal(injected, true);
  assert.notEqual(externalIdentity.ino, originalIdentity.ino);
  const current = fs.statSync(target, { bigint: true });
  assert.equal(current.dev, externalIdentity.dev);
  assert.equal(current.ino, externalIdentity.ino);
  assert.equal(fs.readFileSync(target, "utf8"), original);
  const backup = fs.readdirSync(root).find((entry) => entry.endsWith(".tmp.backup"));
  assert.ok(backup);
  const backupIdentity = fs.statSync(path.join(root, backup), { bigint: true });
  assert.equal(backupIdentity.dev, originalIdentity.dev);
  assert.equal(backupIdentity.ino, originalIdentity.ino);
});

test("rollback preserves an independently replaced promoted file", (t) => {
  const base = fs.realpathSync(os.tmpdir());
  const root = fs.mkdtempSync(path.join(base, "p2-promotion-conflict-"));
  t.after(() => {
    assert.equal(path.dirname(root), base);
    assert.equal(fs.realpathSync(root), root);
    fs.rmSync(root, { recursive: true, force: true });
  });
  const first = path.join(root, "first.txt");
  const second = path.join(root, "second.txt");
  fs.writeFileSync(first, "before\n");
  fs.writeFileSync(second, "before\n");
  const digest = crypto.createHash("sha256").update("before\n").digest("hex");
  const rename = fs.renameSync;
  let externalIdentity;
  try {
    fs.renameSync = (source, destination) => {
      if (String(source).endsWith(".tmp") && destination === second) {
        fs.unlinkSync(first);
        fs.writeFileSync(first, "after\n", { flag: "wx" });
        externalIdentity = fs.statSync(first, { bigint: true });
        throw Object.assign(new Error("synthetic promotion failure"), { code: "EIO" });
      }
      return rename(source, destination);
    };
    const changes = ["first.txt", "second.txt"].map((relativePath) => ({ relativePath, content: Buffer.from("after\n") }));
    const states = ["first.txt", "second.txt"].map((relativePath) => ({ relativePath, state: "present", sha256: digest }));
    assert.throws(() => applyPreparedChanges(root, changes, states), (error) => error.failureClass === "mutation_state_unknown");
  } finally {
    fs.renameSync = rename;
  }
  const current = fs.statSync(first, { bigint: true });
  assert.equal(current.dev, externalIdentity.dev);
  assert.equal(current.ino, externalIdentity.ino);
  assert.equal(fs.readFileSync(first, "utf8"), "after\n");
  assert.equal(fs.readFileSync(second, "utf8"), "before\n");
  assert.ok(fs.readdirSync(root).some((entry) => entry.startsWith(".first.txt.") && entry.endsWith(".tmp.backup")));
});

test("rollback restores the original file when promotion fails without a conflict", (t) => {
  const base = fs.realpathSync(os.tmpdir());
  const root = fs.mkdtempSync(path.join(base, "p2-promotion-conflict-"));
  t.after(() => {
    assert.equal(path.dirname(root), base);
    assert.equal(fs.realpathSync(root), root);
    fs.rmSync(root, { recursive: true, force: true });
  });
  const target = path.join(root, "fixture.txt");
  fs.writeFileSync(target, "before\n");
  const originalIdentity = fs.statSync(target, { bigint: true });
  const digest = crypto.createHash("sha256").update("before\n").digest("hex");
  const rename = fs.renameSync;
  try {
    fs.renameSync = (source, destination) => {
      if (String(source).endsWith(".tmp") && destination === target) throw Object.assign(new Error("synthetic promotion failure"), { code: "EIO" });
      return rename(source, destination);
    };
    assert.throws(() => applyPreparedChanges(root, [{ relativePath: "fixture.txt", content: Buffer.from("after\n") }], [{ relativePath: "fixture.txt", state: "present", sha256: digest }]), { code: "EIO" });
  } finally {
    fs.renameSync = rename;
  }
  const current = fs.statSync(target, { bigint: true });
  assert.equal(current.dev, originalIdentity.dev);
  assert.equal(current.ino, originalIdentity.ino);
  assert.equal(current.mode, originalIdentity.mode);
  assert.equal(fs.readFileSync(target, "utf8"), "before\n");
  assert.deepEqual(fs.readdirSync(root), ["fixture.txt"]);
});

test("rollback preserves modified contents in the promoted file identity", (t) => {
  const base = fs.realpathSync(os.tmpdir());
  const root = fs.mkdtempSync(path.join(base, "p2-promotion-conflict-"));
  t.after(() => {
    assert.equal(path.dirname(root), base);
    assert.equal(fs.realpathSync(root), root);
    fs.rmSync(root, { recursive: true, force: true });
  });
  const first = path.join(root, "first.txt");
  const second = path.join(root, "second.txt");
  fs.writeFileSync(first, "before\n");
  fs.writeFileSync(second, "before\n");
  const digest = crypto.createHash("sha256").update("before\n").digest("hex");
  const rename = fs.renameSync;
  let changedIdentity;
  try {
    fs.renameSync = (source, destination) => {
      if (String(source).endsWith(".tmp") && destination === second) {
        changedIdentity = fs.statSync(first, { bigint: true });
        fs.writeFileSync(first, "external change\n");
        throw Object.assign(new Error("synthetic promotion failure"), { code: "EIO" });
      }
      return rename(source, destination);
    };
    const changes = ["first.txt", "second.txt"].map((relativePath) => ({ relativePath, content: Buffer.from("after\n") }));
    const states = ["first.txt", "second.txt"].map((relativePath) => ({ relativePath, state: "present", sha256: digest }));
    assert.throws(() => applyPreparedChanges(root, changes, states), (error) => error.failureClass === "mutation_state_unknown");
  } finally {
    fs.renameSync = rename;
  }
  const current = fs.statSync(first, { bigint: true });
  assert.equal(current.dev, changedIdentity.dev);
  assert.equal(current.ino, changedIdentity.ino);
  assert.equal(fs.readFileSync(first, "utf8"), "external change\n");
  assert.ok(fs.readdirSync(root).some((entry) => entry.startsWith(".first.txt.") && entry.endsWith(".tmp.backup")));
});

test("rollback retains a promoted target if its backup contents changed", (t) => {
  const base = fs.realpathSync(os.tmpdir());
  const root = fs.mkdtempSync(path.join(base, "p2-promotion-conflict-"));
  t.after(() => {
    assert.equal(path.dirname(root), base);
    assert.equal(fs.realpathSync(root), root);
    fs.rmSync(root, { recursive: true, force: true });
  });
  const first = path.join(root, "first.txt");
  const second = path.join(root, "second.txt");
  fs.writeFileSync(first, "before\n");
  fs.writeFileSync(second, "before\n");
  const digest = crypto.createHash("sha256").update("before\n").digest("hex");
  const rename = fs.renameSync;
  let backup;
  try {
    fs.renameSync = (source, destination) => {
      if (source === first && String(destination).endsWith(".backup")) backup = destination;
      if (String(source).endsWith(".tmp") && destination === second) {
        fs.writeFileSync(backup, "changed backup\n");
        throw Object.assign(new Error("synthetic promotion failure"), { code: "EIO" });
      }
      return rename(source, destination);
    };
    const changes = ["first.txt", "second.txt"].map((relativePath) => ({ relativePath, content: Buffer.from("after\n") }));
    const states = ["first.txt", "second.txt"].map((relativePath) => ({ relativePath, state: "present", sha256: digest }));
    assert.throws(() => applyPreparedChanges(root, changes, states), (error) => error.failureClass === "mutation_state_unknown");
  } finally {
    fs.renameSync = rename;
  }
  assert.equal(fs.readFileSync(first, "utf8"), "after\n");
  assert.equal(fs.readFileSync(backup, "utf8"), "changed backup\n");
});
