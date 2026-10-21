import assert from "node:assert/strict";
import test from "node:test";
import { publicToolSchemas } from "../subagent-bridge/src/frontends/mcp/tools.js";
import { resolveRuntimeRoute } from "../subagent-bridge/src/runtime/router.js";

test("retired provider routes fail closed before adapter dispatch", () => {
  for (const target of ["opencode", "glm", "kimi", "qwen"]) {
    assert.throws(() => resolveRuntimeRoute({ target }), new RegExp(`unsupported runtime target: ${target}`));
  }
});

test("retired provider schemas are absent from the public MCP tool surface", () => {
  for (const name of [
    "runOpenCode",
    "runGlm",
    "runGlmEditPilot",
    "runKimi",
    "runQwen",
    "runSpaceBunny",
    "runSpaceBunnyEditPilot",
    "runCatalogProvider"
  ]) {
    assert.equal(Object.hasOwn(publicToolSchemas, name), false, name);
  }
});
