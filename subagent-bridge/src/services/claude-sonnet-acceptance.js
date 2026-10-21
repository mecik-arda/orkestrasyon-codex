export function validateClaudeSonnetAcceptanceOutput(normalizedResult) {
  if (typeof normalizedResult !== "string") return { ok: false, errorClass: "schema_invalid" };
  let parsed;
  try {
    parsed = JSON.parse(normalizedResult.trim());
  } catch {
    return { ok: false, errorClass: "schema_invalid" };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false, errorClass: "schema_invalid" };
  const keys = Object.keys(parsed);
  if (keys.length !== 1 || keys[0] !== "result" || typeof parsed.result !== "number" || parsed.result !== 42) {
    return { ok: false, errorClass: "schema_invalid" };
  }
  return { ok: true };
}
