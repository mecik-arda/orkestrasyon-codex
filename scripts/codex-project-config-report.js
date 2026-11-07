export function buildConfigurationFailureReport(action, error, currentConfigurationStatus = "not_observed") {
  const publicationStates = new Set(["not_published", "published", "unknown", "not_needed"]);
  const publicationState = publicationStates.has(error?.publicationState)
    ? error.publicationState
    : action === "--write" ? "not_published" : "not_attempted";
  let status = publicationState === "published"
    ? "published_cleanup_or_lock_uncertain"
    : publicationState === "unknown" ? "publication_outcome_unknown"
      : error?.publicCode === "stale_plan" ? "stale_plan" : "rejected";
  if (error?.publicCode === "lock_release_uncertain" && publicationState === "not_needed") {
    status = "unchanged_lock_release_uncertain";
  }
  const safeCodes = new Set(["stale_plan", "publication_outcome_unknown", "lock_release_uncertain"]);
  return {
    ok: false,
    action,
    status,
    projectMcpReady: currentConfigurationStatus === "ready",
    currentConfigurationStatus,
    publicationState,
    failureStage: typeof error?.failureStage === "string" ? error.failureStage : "planning_or_io",
    cleanupStatus: typeof error?.cleanupStatus === "string" ? error.cleanupStatus : "not_observed",
    backupStatus: typeof error?.backupStatus === "string" ? error.backupStatus : "not_observed",
    lockStatus: typeof error?.lockStatus === "string" ? error.lockStatus : "not_observed",
    error: safeCodes.has(error?.publicCode) ? error.publicCode : "configuration_update_failed"
  };
}
