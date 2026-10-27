export const p2PreparedEditPolicy = Object.freeze({
  backend: "codex",
  model: "gpt-5.6-luna",
  relativePath: "tests/fixtures/codex-profile-edit-pilot/p2-approval-probe.txt",
  baselineContent: "P2 approval probe baseline\n",
  preparedContent: "P2 approval probe\n",
  timeoutMs: 60000,
  maxOutputBytes: 65536,
  approvalScope: "p2_prepared_edit"
});

export function createP2PreparedEditInput() {
  return {
    taskId: "p2-prepared-edit",
    role: "implementer",
    mode: "edit",
    objective: `Update ${p2PreparedEditPolicy.relativePath} so its entire UTF-8 content is exactly ${JSON.stringify(p2PreparedEditPolicy.preparedContent)}.`,
    files: [p2PreparedEditPolicy.relativePath],
    contextFiles: [],
    acceptanceCriteria: [
      `Only ${p2PreparedEditPolicy.relativePath} changes.`,
      `The resulting file contains exactly ${JSON.stringify(p2PreparedEditPolicy.preparedContent)}.`,
      "Do not run commands, tests, scripts, or other tools."
    ]
  };
}
