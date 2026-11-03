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
      return {
        exitCode: 0,
        failureClass: null,
        result: {
          status: "completed",
          summary: "Pilot route accepted",
          findings: [],
          proposed_steps: [],
          risks: [],
          questions: [],
          requires_human_approval: false
        }
      };
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

test("MCP-DEEPSEEK-ERROR-01: runtime checkpoint failure remains an MCP tool error", async () => {
  const failure = {
    exitCode: 1,
    failureClass: "authentication_failure",
    result: {
      status: "failed",
      summary: "Subagent execution failed.",
      findings: [],
      proposed_steps: [],
      risks: [],
      questions: [],
      requires_human_approval: false
    }
  };
  const server = createSubagentMcpServer({
    runtime: { runDeepSeek: async () => failure },
    configuration: {},
    trustedWorkspace: os.tmpdir()
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "deepseek-tool-error-contract-test", version: "1.0.0" });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

  try {
    const result = await client.callTool({
      name: "run_deepseek_subagent",
      arguments: {
        taskId: "deepseek-mcp-failure-contract",
        role: "analyst",
        model: "deepseek_flash",
        mode: "read_only",
        objective: "Sentetik runtime hata sözleşmesini denetle.",
        workspace: os.tmpdir(),
        files: [],
        contextFiles: [],
        skills: [],
        acceptanceCriteria: ["Runtime checkpoint hatası MCP hata işaretini korur."]
      }
    });
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent.failureClass, "authentication_failure");
    assert.equal(result.structuredContent.result.status, "failed");
  } finally {
    await client.close();
    await server.close();
  }
});

test("MCP-DEEPSEEK-ERROR-02: contradictory and non-terminal checkpoints remain MCP errors", async () => {
  const outcomes = [
    { exitCode: 1, failureClass: null, result: { status: "completed" } },
    { exitCode: 0, failureClass: "schema_invalid", result: { status: "completed" } },
    { exitCode: 0, failureClass: null, result: { status: "failed" } },
    { exitCode: 0, failureClass: null, result: { status: "blocked" } },
    { exitCode: 0, failureClass: null, result: { status: "needs_context" } },
    { exitCode: 0, failureClass: null, result: { status: "approval_required" } },
    { exitCode: 0, failureClass: null, result: { status: "preview" } },
    { failureClass: null, result: { status: "completed" } }
  ];
  let nextOutcome = 0;
  const server = createSubagentMcpServer({
    runtime: { runDeepSeek: async () => outcomes[nextOutcome++] },
    configuration: {},
    trustedWorkspace: os.tmpdir()
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "deepseek-tool-status-contract-test", version: "1.0.0" });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

  try {
    for (let index = 0; index < outcomes.length; index += 1) {
      const result = await client.callTool({
        name: "run_deepseek_subagent",
        arguments: {
          taskId: `deepseek-status-contract-${index}`,
          role: "analyst",
          model: "deepseek_flash",
          mode: "read_only",
          objective: "Doğrulama için sentetik MCP checkpoint sınıflandırmasını denetle.",
          workspace: os.tmpdir(),
          files: [],
          contextFiles: [],
          skills: [],
          acceptanceCriteria: ["Eksik veya çelişkili checkpoint MCP hatası olur."]
        }
      });
      assert.equal(result.isError, true, `outcome index ${index}`);
    }
  } finally {
    await client.close();
    await server.close();
  }
});
