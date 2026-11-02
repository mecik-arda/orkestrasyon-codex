import assert from "node:assert/strict";
import test from "node:test";
import { createMcpToolHandlers, publicToolSchemas } from "../subagent-bridge/src/frontends/mcp/tools.js";

const editProfile = { mode: "edit", model: "gpt-6.1-sol" };
const readOnlyProfile = { mode: "read_only", model: "gpt-6.1-sol" };

function createHandlers({ runtime, taskProfiles }) {
  return createMcpToolHandlers({
    runtime,
    trustedWorkspace: "C:\\trusted-workspace",
    configuration: { orchestration: { taskProfiles } }
  });
}

test("RUN-PROFILE-REVIEW-01: edit profiles reject review requests before runtime dispatch", async () => {
  let editCalls = 0;
  let readCalls = 0;
  const handlers = createHandlers({
    runtime: {
      async runProfileEdit() {
        editCalls += 1;
        return { status: "completed" };
      },
      async run() {
        readCalls += 1;
        return { ok: true };
      }
    },
    taskProfiles: { editor: editProfile }
  });
  const base = { prompt: "review the selected source", profile: "editor", files: ["src/value.js"] };

  await assert.rejects(() => handlers.runProfile({
    ...base,
    reviewScope: ["src/value.js"],
    reviewEvidenceRequirement: "required"
  }), /reviewScope is only available for read-only tasks/u);
  await assert.rejects(() => handlers.runProfile({
    ...base,
    reviewScope: ["src/value.js"]
  }), /reviewScope is only available for read-only tasks/u);

  assert.equal(editCalls, 0);
  assert.equal(readCalls, 0);
});

test("RUN-PROFILE-REVIEW-02: read-only profiles preserve required review data for runtime", async () => {
  let receivedRequest;
  const handlers = createHandlers({
    runtime: {
      async run(request) {
        receivedRequest = request;
        return { ok: true, result: "review completed" };
      }
    },
    taskProfiles: { reviewer: readOnlyProfile }
  });

  const result = await handlers.runProfile({
    prompt: "review the selected source",
    profile: "reviewer",
    reviewScope: ["src/value.js"],
    reviewEvidenceRequirement: "required"
  });

  assert.equal(result.isError, false);
  assert.equal(receivedRequest.mode, "read_only");
  assert.deepEqual(receivedRequest.reviewScope, ["src/value.js"]);
  assert.equal(receivedRequest.reviewEvidenceRequirement, "required");
});

test("RUN-PROFILE-REVIEW-03: ordinary edit and review-free read-only profiles keep their routes", async () => {
  let editCalls = 0;
  let readCalls = 0;
  const handlers = createHandlers({
    runtime: {
      async runProfileEdit() {
        editCalls += 1;
        return { status: "completed" };
      },
      async run(request) {
        readCalls += 1;
        return { ok: true, mode: request.mode };
      }
    },
    taskProfiles: { editor: editProfile, reader: readOnlyProfile }
  });

  const editResult = await handlers.runProfile({ prompt: "edit selected source", profile: "editor", files: ["src/value.js"] });
  const readResult = await handlers.runProfile({ prompt: "answer a question", profile: "reader" });

  assert.equal(editResult.structuredContent.status, "completed");
  assert.equal(readResult.structuredContent.mode, "read_only");
  assert.equal(editCalls, 1);
  assert.equal(readCalls, 1);
});

test("RUN-PROFILE-REVIEW-04: unknown profiles and client policy fields fail before runtime dispatch", async () => {
  let runtimeCalls = 0;
  const handlers = createHandlers({
    runtime: {
      async run() {
        runtimeCalls += 1;
        return { ok: true };
      },
      async runProfileEdit() {
        runtimeCalls += 1;
        return { status: "completed" };
      }
    },
    taskProfiles: { editor: editProfile, reader: readOnlyProfile }
  });
  const base = { prompt: "review", profile: "reader", reviewScope: ["src/value.js"] };

  await assert.rejects(() => handlers.runProfile({ prompt: "question", profile: "missing" }), /unsupported task profile/u);
  assert.equal(publicToolSchemas.runProfile.safeParse({ ...base, mode: "read_only" }).success, false);
  assert.equal(publicToolSchemas.runProfile.safeParse({ ...base, reviewSourceSyntaxAwareClassifierEnabled: true }).success, false);
  assert.equal(publicToolSchemas.runProfile.safeParse({ prompt: "review", profile: "reader", reviewEvidenceRequirement: "required" }).success, false);
  assert.equal(runtimeCalls, 0);
});
