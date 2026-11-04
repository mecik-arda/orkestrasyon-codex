import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createSubagentMcpServer } from "../subagent-bridge/src/frontends/mcp/server.js";
import { publicToolSchemas, storeMemorySchema } from "../subagent-bridge/src/frontends/mcp/tools.js";

const wrongTypePayloads = {
  runAntigravity: { prompt: 42, model: "gemini_flash_3_8", mode: "read_only" },
  runClaudeSonnetAcceptancePilot: { unexpected_field_for_test: 42 },
  runCodexProfileEditPilot: { files: ["any-file"] },
  prepareP2AcceptanceEdit: { model: "gpt-6.1-sol" },
  runClaudeCode: { prompt: 42, mode: "read_only" },
  runCodex: { prompt: false, mode: "read_only" },
  runProfile: { prompt: "soru", profile: 42 },
  runDeepSeek: { taskId: 1, role: "analyst", mode: "read_only", objective: "hedef", workspace: "ws", acceptanceCriteria: ["kriter"] },
  runDeepSeekEditPilot: { taskId: "t1", objective: "hedef", files: "dosya", acceptanceCriteria: ["kriter"] },
  approvePreparedEdit: { approvalRequestId: 123 },
  rejectPreparedEdit: { approvalRequestId: 123 },
  prepareParallelBatch: { objective: "hedef", batchMaxReservedCostUsd: 1, tasks: "gorev-listesi" },
  startParallelBatch: { planId: 42, planHash: "b".repeat(64) },
  getParallelBatch: { batchId: 42 },
  getParallelTaskDetail: { batchId: "a".repeat(32), taskId: "task-one", detailRef: 42 },
  cancelParallelBatch: { batchId: false },
  approveParallelIntegration: { batchId: "a".repeat(32), approvalRef: "b".repeat(64), expectedDiffHash: 42 },
  applyAuthorizedParallelIntegration: {
    batchId: "a".repeat(32),
    expectedDiffHash: 42,
    expectedDiffPreviewHash: "b".repeat(64),
    expectedChangePayloadHash: "c".repeat(64),
    expectedDetailRef: "d".repeat(64),
    expectedArtifactExpiresAt: new Date(Date.now() + 60000).toISOString(),
    expectedBaseCommit: "e".repeat(40),
    expectedSourceRefHash: "f".repeat(64),
    expectedSourceFileStatesHash: "1".repeat(64),
    expectedSourceFileIdentityHash: "2".repeat(64),
    authorizationNonce: "3".repeat(64)
  },
  revalidateParallelIntegration: { batchId: "a".repeat(32), approvalRef: 42, expectedDiffHash: "b".repeat(64) },
  checkProviderCapability: { provider: 42 }
};

const validPublicToolInputs = {
  runClaudeSonnetAcceptancePilot: {},
  runCodexProfileEditPilot: {},
  prepareP2AcceptanceEdit: {},
  runAntigravity: { prompt: "Inspect", model: "gemini_flash_3_8" },
  runClaudeCode: { prompt: "Inspect" },
  runCodex: { prompt: "Inspect" },
  runProfile: { prompt: "Inspect", profile: "reader" },
  runDeepSeek: {
    taskId: "task-one",
    role: "analyst",
    objective: "Inspect",
    workspace: ".",
    acceptanceCriteria: ["Return a result"]
  },
  runDeepSeekEditPilot: {
    taskId: "task-one",
    objective: "Inspect",
    files: ["src/value.js"],
    acceptanceCriteria: ["Return a result"]
  },
  approvePreparedEdit: { approvalRequestId: "a".repeat(64) },
  rejectPreparedEdit: { approvalRequestId: "a".repeat(64) },
  prepareParallelBatch: {
    objective: "Inspect",
    batchMaxReservedCostUsd: 1,
    tasks: [{ taskId: "task-one", role: "analyst", target: "codex", objective: "Inspect", readablePaths: ["src/value.js"] }]
  },
  startParallelBatch: { planId: "a".repeat(32), planHash: "b".repeat(64) },
  getParallelBatch: { batchId: "a".repeat(32) },
  getParallelTaskDetail: { batchId: "a".repeat(32), taskId: "task-one", detailRef: "b".repeat(64) },
  cancelParallelBatch: { batchId: "a".repeat(32) },
  approveParallelIntegration: { batchId: "a".repeat(32), approvalRef: "b".repeat(64), expectedDiffHash: "c".repeat(64) },
  applyAuthorizedParallelIntegration: {
    batchId: "a".repeat(32),
    expectedDiffHash: "b".repeat(64),
    expectedDiffPreviewHash: "c".repeat(64),
    expectedChangePayloadHash: "d".repeat(64),
    expectedDetailRef: "e".repeat(64),
    expectedArtifactExpiresAt: "2026-11-05T12:00:00.000Z",
    expectedBaseCommit: "f".repeat(40),
    expectedSourceRefHash: "1".repeat(64),
    expectedSourceFileStatesHash: "2".repeat(64),
    expectedSourceFileIdentityHash: "4".repeat(64),
    authorizationNonce: "3".repeat(64)
  },
  revalidateParallelIntegration: { batchId: "a".repeat(32), approvalRef: "b".repeat(64), expectedDiffHash: "c".repeat(64) },
  checkProviderCapability: { provider: "codex" }
};

test("MCP-NEG-01: her public MCP şeması bilinmeyen alanı reddeder", () => {
  const names = Object.keys(publicToolSchemas);
  assert.ok(names.length >= 12, `beklenen araç sayısı, bulunan: ${names.length}`);
  for (const name of names) {
    const validInput = validPublicToolInputs[name];
    assert.ok(validInput, `${name} için geçerli temel girdi eksik`);
    assert.equal(publicToolSchemas[name].safeParse(validInput).success, true, `${name} temel girdisi geçersiz`);
    const result = publicToolSchemas[name].safeParse({ ...validInput, unexpected_field_for_test: true });
    assert.equal(result.success, false, `${name} bilinmeyen alanı kabul etti`);
    assert.ok(result.error.issues.some((issue) => issue.code === "unrecognized_keys" && issue.keys.includes("unexpected_field_for_test")), `${name} reddi bilinmeyen alana bağlı değil`);
  }
});

test("MCP-NEG-01: bilinmeyen alan gerçek MCP çağrısında runtime dispatch öncesi reddedilir", async () => {
  let runtimeCalls = 0;
  const runtime = {
    async run() {
      runtimeCalls += 1;
      return { ok: true };
    }
  };
  const server = createSubagentMcpServer({
    runtime,
    configuration: {},
    trustedWorkspace: process.cwd()
  });
  const client = new Client({ name: "mcp-negative-contract-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const validInput = validPublicToolInputs.runCodex;
  assert.equal(publicToolSchemas.runCodex.safeParse(validInput).success, true);
  try {
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const validResult = await client.callTool({ name: "run_codex_subagent", arguments: validInput });
    assert.equal(validResult.isError, false);
    assert.equal(runtimeCalls, 1);
    const invalidResult = await client.callTool({
      name: "run_codex_subagent",
      arguments: { ...validInput, unexpected_field_for_test: true }
    });
    assert.equal(invalidResult.isError, true);
    assert.match(invalidResult.content[0].text, /unexpected_field_for_test/u);
    assert.equal(runtimeCalls, 1);
  } finally {
    await Promise.allSettled([client.close(), server.close()]);
  }
});

test("MCP-NEG-02: her public MCP şeması boş girdiyi reddeder", () => {
  for (const [name, schema] of Object.entries(publicToolSchemas)) {
    const result = schema.safeParse({});
    if (name === "runClaudeSonnetAcceptancePilot") {
      assert.equal(result.success, true, `${name} boş girdili sabit pilot sözleşmesini reddetti`);
      continue;
    }
    if (name === "runCodexProfileEditPilot") {
      assert.equal(result.success, true, `${name} boş girdili sabit pilot sözleşmesini reddetti`);
      continue;
    }
    if (name === "prepareP2AcceptanceEdit") {
      assert.equal(result.success, true, `${name} boş girdili sabit pilot sözleşmesini reddetti`);
      continue;
    }
    assert.equal(result.success, false, `${name} boş girdiyi kabul etti`);
  }
});

test("MCP-NEG-03: her public MCP şeması yanlış tipte alanı reddeder", () => {
  for (const [name, schema] of Object.entries(publicToolSchemas)) {
    const payload = wrongTypePayloads[name];
    assert.ok(payload, `${name} için yanlış tip fixture eksik`);
    const result = schema.safeParse(payload);
    assert.equal(result.success, false, `${name} yanlış tipi kabul etti`);
  }
});

test("MCP-NEG-04: store hafıza şeması acknowledgeInjectionRisk tipini doğrular ve bilinmeyen alanı reddeder", () => {
  const base = {
    relativePath: "00_Inbox/Test.md",
    title: "Başlık",
    content: "İçerik",
    confidence: "high",
    verificationStatus: "user-provided",
    taskId: "gorev-1"
  };
  assert.equal(storeMemorySchema.safeParse({ ...base, acknowledgeInjectionRisk: 42 }).success, false);
  assert.equal(storeMemorySchema.safeParse({ ...base, acknowledgeInjectionRisk: true }).success, true);
  assert.equal(storeMemorySchema.safeParse({ ...base, unexpected_field_for_test: true }).success, false);
});

test("MCP-DEEPSEEK-SKILL: yalnız allowlist'teki orkestrasyon skill'i kabul edilir", () => {
  const base = {
    taskId: "route-analysis",
    role: "analyst",
    mode: "read_only",
    objective: "Inspect the local model routing contract",
    workspace: "C:\\workspace",
    acceptanceCriteria: ["Return source references"]
  };
  assert.equal(publicToolSchemas.runDeepSeek.safeParse({ ...base, skills: ["subagent-orkestrasyonu"] }).success, true);
  assert.equal(publicToolSchemas.runDeepSeek.safeParse({ ...base, skills: ["unlisted-skill"] }).success, false);
});
