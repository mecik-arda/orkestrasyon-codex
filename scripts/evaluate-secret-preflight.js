import { runSecretClassifierEvaluation, serializeSecretClassifierEvaluation } from "../experiments/secret-preflight-offline-evaluation.js";

if (process.argv.length > 2) {
  process.stdout.write(`${JSON.stringify({ schemaVersion: 2, reportStatus: "failed", measurementComplete: false, measurementFailureCode: "unexpected_cli_arguments", policyAssessment: "not_decided" })}\n`);
  process.exitCode = 1;
} else {
  const report = runSecretClassifierEvaluation();
  const serializedReport = serializeSecretClassifierEvaluation(report);
  process.stdout.write(`${serializedReport}\n`);
  if (JSON.parse(serializedReport).measurementComplete !== true) process.exitCode = 1;
}
