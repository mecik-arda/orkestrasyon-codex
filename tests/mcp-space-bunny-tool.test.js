import assert from "node:assert/strict";
import os from "node:os";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createSubagentMcpServer } from "../subagent-bridge/src/frontends/mcp/server.js";

test("retired OpenCode provider tools are not published by MCP", async () => {
  const server = createSubagentMcpServer({ runtime: {}, configuration: {}, trustedWorkspace: os.tmpdir() });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "retired-provider-contract-test", version: "1.0.0" });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

  try {
    const tools = await client.listTools();
    const retiredNames = new Set(["run_opencode_subagent", "check_glm_subagent", "run_glm_subagent", "run_glm_edit_pilot", "check_kimi_subagent", "run_kimi_subagent", "check_qwen_subagent", "run_qwen_subagent", "check_space_bunny_subagent", "run_space_bunny_subagent", "run_space_bunny_edit_pilot"]);
    assert.equal(tools.tools.some((entry) => retiredNames.has(entry.name)), false);
  } finally {
    await client.close();
    await server.close();
  }
});

test("MCP-DEEPSEEK-SCHEMA-01: refined public schema is published and dispatched without leaking request context", async () => {
  const runtimeCalls = [];
  const runtime = {
    runDeepSeek: async (input) => {
      runtimeCalls.push(input);
      return { ok: true, result: "Pilot route accepted" };
    }
  };
  const server = createSubagentMcpServer({ runtime, configuration: {}, trustedWorkspace: os.tmpdir() });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "deepseek-tool-schema-contract-test", version: "1.0.0" });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

  try {
    const tools = await client.listTools();
    const tool = tools.tools.find((entry) => entry.name === "run_deepseek_subagent");
    assert.ok(tool);
    assert.deepEqual(Object.keys(tool.inputSchema.properties).sort(), [
      "acceptanceCriteria",
      "contextFiles",
      "files",
      "mode",
      "model",
      "objective",
      "riskSignals",
      "role",
      "skills",
      "taskId",
      "workspace"
    ]);
    assert.deepEqual([...tool.inputSchema.required].sort(), ["acceptanceCriteria", "objective", "role", "taskId", "workspace"]);

    const result = await client.callTool({
      name: "run_deepseek_subagent",
      arguments: {
        taskId: "deepseek-schema-contract",
        role: "analyst",
        model: "deepseek_flash",
        mode: "read_only",
        objective: "Return a short synthetic MCP contract result.",
        workspace: os.tmpdir(),
        files: [],
        contextFiles: [],
        skills: [],
        acceptanceCriteria: ["Return a structured response"]
      }
    });

    assert.equal(result.isError, false);
    assert.equal(runtimeCalls.length, 1);
    assert.equal(runtimeCalls[0].taskId, "deepseek-schema-contract");
    assert.equal(Object.hasOwn(runtimeCalls[0], "signal"), false);
    assert.equal(Object.hasOwn(runtimeCalls[0], "sessionId"), false);
  } finally {
    await client.close();
    await server.close();
  }
});
