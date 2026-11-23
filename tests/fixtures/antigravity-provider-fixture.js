import fs from "node:fs";
import path from "node:path";

const scenario = process.argv[2] || "success";
const invocation = process.argv.slice(3);
const addDirIndex = invocation.indexOf("--add-dir");
const workspace = addDirIndex >= 0 ? invocation[addDirIndex + 1] : null;

if (invocation.includes("mcp")) {
  process.stdout.write("No MCP servers configured.\n");
  process.exitCode = 0;
} else if (scenario === "success") {
  process.stdout.write(`${JSON.stringify({ response: "fixture-ok" })}\n`);
  process.exitCode = 0;
} else if (scenario === "empty") {
  process.exitCode = 0;
} else if (scenario === "process_exit") {
  process.stderr.write("unclassified provider failure\n");
  process.exitCode = 1;
} else if (scenario === "rate_limited") {
  process.stderr.write("RESOURCE_EXHAUSTED\n");
  process.exitCode = 1;
} else if (scenario === "server") {
  process.stderr.write("HTTP 503 service unavailable\n");
  process.exitCode = 1;
} else if (scenario === "auth") {
  process.stderr.write("UNAUTHENTICATED\n");
  process.exitCode = 1;
} else if (scenario === "network") {
  process.stderr.write("ECONNRESET\n");
  process.exitCode = 1;
} else if (scenario === "unicode") {
  process.stderr.write("é".repeat(600));
  process.exitCode = 1;
} else if (scenario === "probe-ready") {
  process.stdout.write(`${JSON.stringify({ response: "READY" })}\n`);
  process.exitCode = 0;
} else if (scenario === "probe-ready-inexact") {
  process.stdout.write(`${JSON.stringify({ status: "SUCCESS", response: "NOT READY" })}\n`);
} else if (scenario === "probe-ready-failed") {
  process.stdout.write(`${JSON.stringify({ status: "ERROR", response: "READY" })}\n`);
} else if (scenario === "probe-sandbox-failure") {
  process.stderr.write("Windows sandbox helper failed to initialize\n");
  process.exitCode = 1;
} else if (["probe-workspace", "probe-workspace-inexact"].includes(scenario)) {
  const marker = fs.readFileSync(path.join(workspace || ".", "probe.txt"), "utf8");
  if (!invocation.at(-1)?.includes("Read the file probe.txt") || invocation.at(-1)?.includes(workspace) || invocation.at(-1)?.includes(marker)) {
    process.stderr.write("expected a relative, marker-free workspace probe prompt\n");
    process.exitCode = 1;
  } else {
    const response = scenario === "probe-workspace" ? marker : `unexpected prefix ${marker}`;
    process.stdout.write(`${JSON.stringify({ response })}\n`);
  }
} else if (scenario === "probe-workspace-wrong") {
  process.stdout.write(`${JSON.stringify({ response: "NOT_THE_MARKER" })}\n`);
  process.exitCode = 0;
} else if (["probe-web", "probe-web-no-tool", "probe-web-wrong-url", "probe-web-error-output"].includes(scenario)) {
  const prompt = invocation.at(-1) || "";
  if (!prompt.includes("read_url_content")) {
    process.stderr.write("probe prompt did not name the canonical web tool\n");
    process.exitCode = 1;
  } else {
    const events = [{ event: "init", init: { tools: ["read_url_content"] } }];
    if (scenario !== "probe-web-no-tool") {
      events.push({ event: "step_update", step_update: {
        state: "DONE",
        step_type: "tool",
        tool_name: "read_url_content",
        tool_info: {
          name: "read_url_content",
          parameters: { Url: scenario === "probe-web" ? "https://example.com/" : "https://example.org/" },
          output: scenario === "probe-web-error-output" ? "Navigation failed: upstream returned an error" : "Example Domain page content"
        }
      } });
    }
    events.push({ event: "result", result: { status: "SUCCESS", response: "Example Domain" } });
    process.stdout.write(events.map((event) => JSON.stringify(event)).join("\n") + "\n");
    process.exitCode = 0;
  }
} else if (scenario === "probe-web-denied") {
  process.stderr.write("tool required the 'read_url' permission, auto-denied\n");
  process.exitCode = 1;
} else if (["web-source-match", "web-source-mismatch", "web-source-missing", "web-source-interrupted", "web-source-content-mismatch"].includes(scenario)) {
  const observedUrl = scenario === "web-source-mismatch" ? "https://example.org/guide" : "https://example.com/guide";
  const events = [
    { event: "init", init: { tools: ["read_url_content"] } },
    { event: "step_update", step_update: {
      state: "DONE",
      step_type: "tool",
      tool_name: "read_url_content",
      tool_info: {
        name: "read_url_content",
        ...(scenario !== "web-source-missing" ? { parameters: { Url: observedUrl } } : {}),
        output: scenario === "web-source-match" ? "RAW_WEB_PAGE_SENTINEL Short excerpt" : scenario === "web-source-content-mismatch" ? "Different page content" : "RAW_WEB_PAGE_SENTINEL"
      }
    } },
    { event: "result", result: {
      status: scenario === "web-source-interrupted" ? "INTERRUPTED" : "SUCCESS",
      structured_output: {
        result: "A short report",
        webEvidence: { sourceUrl: "https://EXAMPLE.com:443/guide", excerpts: ["Short excerpt"] }
      }
    } }
  ];
  process.stdout.write(events.map((event) => JSON.stringify(event)).join("\n") + "\n");
} else if (scenario === "probe-auth") {
  process.stderr.write("UNAUTHENTICATED\n");
  process.exitCode = 1;
} else if (scenario === "hang") {
  setInterval(() => {}, 1000);
} else {
  process.exitCode = 0;
}
