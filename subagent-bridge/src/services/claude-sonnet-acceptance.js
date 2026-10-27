export function validateClaudeSonnetAcceptanceOutput(normalizedResult) {
  if (typeof normalizedResult !== "string") return { ok: false, errorClass: "task_json_content_type_invalid" };
  const taskJsonText = normalizedResult.trim();
  if (taskJsonText.length === 0) return { ok: false, errorClass: "task_json_empty" };
  let parsed;
  try {
    parsed = JSON.parse(taskJsonText);
  } catch {
    return { ok: false, errorClass: "task_json_parse_invalid" };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, errorClass: "task_json_top_level_type_invalid" };
  }
  const keys = Object.keys(parsed);
  if (!keys.includes("result")) return { ok: false, errorClass: "task_json_result_missing" };
  if (keys.length !== 1) return { ok: false, errorClass: "task_json_additional_fields" };
  if (typeof parsed.result !== "number") return { ok: false, errorClass: "task_json_result_type_invalid" };
  if (parsed.result !== 42) return { ok: false, errorClass: "task_json_result_value_invalid" };
  return { ok: true };
}
