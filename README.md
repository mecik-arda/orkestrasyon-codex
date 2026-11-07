# Hades Orchestrator

[English](#english) | [Türkçe](#türkçe)

# English

Hades Orchestrator is a provider-neutral orchestration system in which Codex Desktop acts as the host and lead orchestrator and invokes independent subagent backends over the local MCP server in `subagent-bridge`. The Codex host/orchestrator model and the subagent backends are separate.

Smoke Vault boundary (2026-11-04): `npm run smoke` creates a temporary policy, runtime profile and synthetic Vault, then runs MCP health, catalog and memory checks only against that fixture. The synthetic child environment keeps only required operating-system variables and does not inherit provider credentials, the personal runtime configuration, or personal profile paths. Passing this smoke verifies the synthetic stdio setup; it does not establish personal Vault health or the state of an already-running Desktop Hades process. `npm run smoke:vault` is a separate explicit opt-in that uses the active personal configuration for MCP catalog and memory-health checks, then searches for and reads one matching Vault note. It skips provider health calls and whole-Vault review. Run it only when that access is specifically needed and authorized. The earlier 2026-11-03 smoke invocation that read a real Vault note was unauthorized; its record is retained in the independent review package and is not treated as valid smoke evidence.

Current transition status (2026-11-05): P2, P3 and P4 original-plan functional acceptance is complete. Claude P1b failed strict acceptance and was deferred; it is not supported. The prior GPT-6.1-Sol review covers only its exact 10-file snapshot. Three later findings were fixed and locally validated, but follow-up review was not completed. The current natural source-review scope is blocked by local preflight; no source payload was delivered. The AST setting remains unset/off. P6 status is reconciled, but unconditional project closure remains open pending independent review.

Operational note (2026-11-05): The user reported an Hades restart after the AST setting was returned to unset; the configured launch chain and workspace identity were checked. Identity does not attest the loaded source revision or active AST setting.

Local P3 resilience tests cover artifact-store failure before provider dispatch, cleanup errors during worktree setup, transient result polling and a fake runtime entry before bridge termination. Live cancellation, timeout and restart-recovery observations are recorded separately. P3 normal edit-batch integration was accepted under its separate exact-diff approval; resilience tests alone would not replace that acceptance.

## What it offers

- Codex, Gemini/Antigravity, native Claude Code and a direct official DeepSeek API adapter through a single MCP surface. Retired OpenCode-backed routes are not remapped to Codex.
- Fail-closed read-only sandbox, controlled edits to selected files, promotion with rollback support.
- Access mode, cost, retry, persistent memory and redacted metric policies.
- Orchestration V2: an additive host-owned parallel batch scheduler (read-only DAG waves, single-wave edit batches in isolated Git worktrees, bounded summaries with opaque detail references, approval-bound integration and explicit cancellation).

## Table of contents

- [Usage](#usage)
- [Verified baseline](#verified-baseline)
- [Quick start](#quick-start)
- [Architecture](#architecture)
- [MCP rule attestation](#mcp-rule-attestation)
- [Personal configuration](#personal-configuration)
- [Orchestration V2 parallel batches](#orchestration-v2-parallel-batches)
- [Canonical routing](#canonical-routing)
- [Task profiles](#task-profiles)
- [Verified provider matrix](#verified-provider-matrix)
- [Antigravity contract](#antigravity-contract)
- [Codex contract](#codex-contract)
- [Shared invariants](#shared-invariants)
- [Final acceptance evidence](#final-acceptance-evidence)
- [Test baseline](#test-baseline)
- [Known non-blocking items](#known-non-blocking-items)
- [Verified baseline freeze](#verified-baseline-freeze)
- [Model roles](#model-roles)
- [Security separation](#security-separation)
- [Skills](#skills)
- [Installation](#installation)
- [Launch](#launch)
- [Command reference](#command-reference)
- [Hard limits](#hard-limits)
- [Persistent memory](#persistent-memory)
- [Reliability and metrics](#reliability-and-metrics)
- [Architecture documents](#architecture-documents)
- [Continuous integration](#continuous-integration)
- [Acknowledgements](#acknowledgements)
- [License and contribution](#license-and-contribution)

## Usage

The runtime policy is loaded from `~/.config/subagent-bridge/config.json`; executable and adapter settings are loaded from `~/.config/subagent-bridge/agents.json`. `ORCHESTRATOR_CONFIG` and `SUBAGENT_BRIDGE_AGENTS_CONFIG` override the locations; `config/policy.json` and `config/agents.json` are distribution templates. The local MCP server uses a workspace-relative command and `cwd`; its trusted workspace uses a non-empty `SUBAGENT_BRIDGE_TRUSTED_WORKSPACE` override when supplied, otherwise the MCP process working directory. Either path is validated against `allowedRoots` and denied roots. Read-only tasks run through global tools, while controlled edits run with selected files and acceptance criteria. Verification: `npm test`, `npm run verify:ci`, `npm run budget`, `npm run metrics`.

## Verified baseline

The package is hades-orchestrator 2.2.0, the runtime is Node.js 20.9+ and ESM; CI uses Node.js 22/24. The canonical record is under `%LOCALAPPDATA%\subagent-bridge\logs\metrics`, with an optional view at `<workspace>/.hades/runs.jsonl`. Latest recorded full local validation: 2026-11-07, `npm run verify:local` passed all five serial stages across 93 test files; its required benchmark completed in 13.165 seconds. Source snapshot `c7aa7df5a4f627723f6d06791c7ccfa9f29f373a84cd623807cd68ff7c0fa6dd` remained unchanged during the runner. An earlier run on a preceding snapshot had one unexplained suite failure that was not reproduced; its cause is unknown and is not recorded as fixed. Synthetic smoke and temporary config/Vault verify passed without provider credentials or real Vault access. These are dated local results, not live Desktop Hades or provider-access evidence.

## Quick start

```powershell
npm ci
npm run codex:check
npm run codex:diagnose
npm run codex:configure
npm run verify:local
npm run runs:recent
```

For daily use, open the repository root as a trusted local project in Codex Desktop. `npm run codex:check` inspects the tracked project MCP entry without writing; `npm run codex:diagnose` reports local prerequisites and managed-entry status without reading user-global Codex configuration, starting Hades, querying providers, or accessing a Vault. If the managed Hades entry needs updating, run `npm run codex:configure`; it preserves unrelated TOML settings and reports only managed-entry metadata. The updater locks and revalidates even a no-op plan. On an ambiguous post-publication cleanup or lock result, inspect the current state with `codex:check` before deciding whether another write is needed. `npm run verify:local` runs the serial local suite with synthetic configuration and Vault fixtures. After changing server code or registration, restart this project's Hades MCP server through Codex Desktop, then inspect its workspace identity and tool/resource surface. Those observations are operational checks, not attestations of the running source revision or effective configuration. `AGENTS.md` provides the project operating rules. Provider credentials stay outside the repository. The tracked configuration contains machine-specific executable and workspace paths. See the [Codex migration report](docs/reports/CODEX_GECISI_VE_OPENCODE_ROTA_DURUMU_2026-10-18.md) for route status and setup limits.

## Architecture

```text
Codex Desktop Host
└─ project MCP configuration → subagent-bridge
     ├─ MCP Frontend         → trusted host workspace injection
     ├─ Bridge Runtime       → canonical router, capability, lock, retry, cancellation
     ├─ AntigravityAdapter   → AGY (Gemini 3.8 Flash, Claude Sonnet)
     ├─ ClaudeCodeAdapter    → native Claude Code
     ├─ CodexAdapter         → official OpenAI Codex CLI
     └─ Observability        → global redacted metrics + opt-in .hades mirror
```

```text
HOST / ORCHESTRATOR MODEL != SUBAGENT BACKEND
PACKAGE LOCATION != ACTIVE WORKSPACE
```

The MCP trusted workspace is not inferred from the package location: it uses a non-empty explicit startup environment override when supplied, otherwise the host-provided MCP process working directory. The selected path is canonicalized and checked against allowed and denied roots.

### MCP rule attestation

The bridge exposes a read-only resource for a redacted workspace-rule manifest:

- URI: `hades://rules/attestation/v1`
- Name: `rule-attestation-v1`
- MIME type: `application/json`
- Files: `AGENTS.md`, `CLAUDE.md`, `config/agent-rules.md`
- Hash contract: SHA-256 of the unchanged raw UTF-8 file bytes

The manifest uses a strict schema, fixed entry order, RFC 8785 canonicalization, fixed file and total-size limits, descriptor reads, link checks, UTF-8 validation, secret scanning and TOCTOU checks. No tool fallback exists. Unsupported resource clients remain `unsupported` rather than invoking a tool.

The result is an untrusted observation with `sourceClass: "mcp_resource"`. `workspace_file` and `mcp_resource` can report a matching snapshot; `startup_context` is `unavailable` until a trusted host loader hook exists. The resource does not prove that the host injected the rules into startup context, that a model followed them, or that the returned resource is a signed attestation. `npm run smoke` validates resource listing, reading and the strict manifest.

The bridge also exposes a separate read-only workspace identity resource:

- URI: `hades://workspace/identity/v1`
- Name: `workspace-identity-v1`
- Output: SHA-256 hashes of the process cwd captured at server startup and the validated canonical trusted workspace.

The strict response contains hashes only. Hashes do not guarantee privacy, do not constitute cryptographic host attestation and do not prove that startup rules were received. The resource does not write files, invoke providers or change workspace selection. Compare both returned hashes with values computed for the intended checkout after restarting the MCP server; the new process is the evidence being checked.

### Personal configuration

It passes `configVersion: 2` schema validation; unknown or missing fields are rejected. Providers are constrained by `defaultMode`/`allowedModes`. `reliability.monthlyCostLimitUsd: 100` and `warningThresholdPercent: 80` are advisory references; admission-time budget enforcement is off by default (`costBudgetEnforced: false`) and can be enabled explicitly. `npm run budget` and `check_subagent_bridge` expose `dailyAccountedUsd`/`monthlyAccountedUsd` (legacy aliases: `dailySpentUsd`/`monthlySpentUsd`). These totals are observed plus estimated costs; estimates include active reservations, and runs without an actual cost or estimate are counted separately, not asserted to cost zero. They are **not provider invoices**. `costAccounting.limitMode` distinguishes `advisory_only`, `admission_blocking` and `no_limit_configured`; with `costBudgetEnforced: false`, remaining/overage/warning fields are informational and do not reject a new request. `measurementStatus: not_observable` means at least one run's actual cost is unknown; the observed/estimated breakdown and cost coverage must be read alongside the aggregate. When enforcement is enabled, the limit is checked atomically at reservation time; a late settlement after an expired reservation is still counted. Codex `allowNonGitWorkspace` is enabled only through the personal machine config; DeepSeek preserves denied-root and Zod validation without requiring a Git repository.

### Orchestration V2 parallel batches

Orchestration V2 is an additive host-owned scheduler in the existing Node bridge; it does not replace single-subagent tools or add an agent framework. “V2” is the feature name, not the package version or `configVersion`. Read-only batches support independent tasks and sequential dependency waves. Workers return bounded JSON summaries; full details are available only through an opaque, caller/workspace/batch/task-bound reference. Edit batches use isolated Git worktrees and remain single-wave. Each edit task uses a private task repository with its own refs and no inherited remote; the host verifies source refs before accepting the task diff. Host-side promotion verification is restricted to the non-executing `git diff --check` check; arbitrary project commands are rejected until an OS-isolated verification runner exists. Run project tests separately before approving integration. `stopConditions` guide the worker and `resourceClaims` serialize tasks that share a named resource. Per-task input/output byte, file-count and diff-byte bounds cannot exceed host ceilings. Input-token limits fail closed where no host-enforced tokenizer limit exists; output-token limits require a route whose provider cap passed its canary.

Orchestration V2 capability summary:

- Two-step batch flow: `prepare_parallel_batch` returns a bounded preview; only a separate user approval turn starts it with the exact `planId`/`planHash`.
- Batch shapes: read-only batches support independent tasks and sequential dependency waves; edit batches are single-wave and run in isolated Git worktrees with per-task private refs.
- Bounded results: workers return small JSON summaries; full detail stays behind opaque, caller/workspace/batch/task-bound references instead of entering the orchestrator context.
- Approval-bound integration: the combined diff preview, diff hash, source HEAD/ref state and changed-file hashes are verified under the source workspace write lock; a durable per-workspace journal restores partial promotions at startup.
- Explicit cancellation: `cancel_parallel_batch` stops queued/running work; settled `result_ready`/`blocked` batches persist a terminal `cancelled` state without re-settling completed tasks or costs.
- Fail-closed defaults: parallel batches remain opt-in; current allowed targets exclude retired OpenCode routes. Host verification currently allows only `git diff --check` because no OS-isolated runner exists yet.
- Optional live view: `npm run parallel:watch -- <batchId>` or the opt-in auto-open Windows Terminal dashboard; `Ctrl+C` stops only the view.

The MCP workflow is deliberately two-step:

1. `prepare_parallel_batch` validates the task DAG, readable paths, provider route and batch-local admission estimate. It starts no workers and returns `planId`, `planHash` and a bounded preview. Edit tasks may select only the safe host verification command `git diff --check` and may declare bounded input/diff limits, stop conditions and shared-resource claims.
2. The lead orchestrator shows that preview to the user. Only a separate, explicit user approval turn permits `start_parallel_batch` with the exact plan ID and hash.
3. `start_parallel_batch` returns a `batchId`; each `get_parallel_batch` poll returns structured progress percentage and per-task states. The percentage counts resolved tasks; `unknown` is not counted as complete, and no token/work percentage is invented for a running task. MCP progress notifications are not a persistent client view. `get_parallel_task_detail` reads a bounded artifact page, and `cancel_parallel_batch` is the explicit cancellation path. A client disconnect does not cancel an accepted batch.
4. Before approving edit integration, fetch the bounded combined diff through `get_parallel_task_detail` with `taskId: "integration"` and the approval's `detailRef`. The separate approval binds the diff hash, source HEAD/ref state and changed-file hashes and applies under the source workspace write lock. Task verification runs in each isolated task worktree, followed by integration verification. A changed source file invalidates the preview. Promotion writes a durable per-workspace recovery journal before replacing files; startup restores a partial promotion or reconciles a committed promotion with the batch manifest. Conflicting external file changes or failed recovery keep the journal and block further edit work. Files are replaced individually, so readers outside the bridge lock can observe an in-progress multi-file promotion. Cancelling a ready diff revokes its approval; once promotion has entered `integrating`, cancellation is refused. Integration does not commit or push.
5. If integration is rejected specifically because all Git refs changed, `revalidate_parallel_integration` can recheck the stored payload without a provider call or source-file application. It requires a clean source, an advanced HEAD descended from the original batch base, unchanged original target-file Git blobs, SHA-256 values and modes, and stable current file identities during host verification. The original historical base/ref binding remains recorded; the operation stores a versioned new binding and issues a new `approvalRef`. The old approval is invalid. Expired, missing, malformed or unauthorized artifacts, unrelated HEADs, changed target files, verification failures and source races fail closed. A later separate user approval is still required. The legacy snapshot has no historical `dev`/`ino`; revalidation records only the current identity and does not claim past identity proof. The new tool is available only with the existing orchestrator approval gate and must be loaded by the active Hades process before use.

Cancelling a settled `result_ready` or `blocked` batch persists the terminal `cancelled` status without changing completed task results or settling costs again. Repeated cancellation is a no-op.

Example `prepare_parallel_batch` arguments:

```json
{
  "objective": "Review the user-facing documentation",
  "batchMaxReservedCostUsd": 0.5,
  "maxWorkers": 2,
  "tasks": [
    {
      "taskId": "readme-review",
      "role": "reviewer",
      "mode": "read_only",
      "target": "codex",
      "model": "gpt-5.6-luna",
      "objective": "Find factual inconsistencies in the README.",
      "readablePaths": ["README.md"],
      "acceptanceCriteria": ["Return a concise evidence-based review."]
    }
  ]
}
```

The returned plan ID/hash are not start permission by themselves; display the preview and wait for a separate user approval turn.

`maxOutputBytes` bounds aggregate raw process stdout plus stderr in UTF-8 bytes, including Codex JSONL and tool events. It does not bound the final answer or public summary. Omitting it uses the existing host process-output cap; the plan preview identifies each effective cap and whether it came from the task or host default. Public summaries remain separately limited by `maxSummaryCharacters` and `maxBatchSummaryBytes`; the Codex JSONL reducer also enforces independent record and final-result byte limits. A short-answer prompt cannot enforce a process-output budget. On `output_limit`, inspect task detail `outputLimitScope`, `outputLimitStream`, accepted/observed bytes and rejected chunk bytes before proposing a narrower task or different bounded process cap. An observed overflow is not the completed output size. Do not replay the unchanged plan or treat an incomplete result as success. See [the P2/P3 acceptance procedure](docs/handoffs/CODEX_BATCH_P2_P3_KABUL_YOLU.md).

Enable the feature in the personal `parallelBatch` config section with `enabled: true`; the distribution template stays disabled. `editEnabled` is a separate opt-in and requires a clean Git workspace and a provider capability that passed its canary. The current host verification allowlist supports only `git diff --check`; other commands fail closed because verification currently has no OS-enforced sandbox. Run project tests separately before approving integration. `batchMaxReservedCostUsd` is a ceiling on internal admission estimates, not a provider invoice or actual-spend guarantee. The estimate sums the configured unknown-attempt cost times the retry allowance for the primary route and, only for read-only tasks, the resolved fallback routes the runtime actually executes; edit tasks do not reserve fallback routes. It is not a provider-enforced output-token or spend cap. A route requiring an actual provider-cost ceiling remains unsupported unless that ceiling is enforced by the provider. Batch reservations are separate from global per-execution cost accounting; queued/running allocation, unknown attempts and unused allocation are reflected separately.

For a persistent live view, set personal `parallelBatch.autoOpenTerminalDashboard: true`; on Windows with Windows Terminal installed, batch start opens a small independent window at the primary display's right edge. This setting is off in the distribution template. If auto-open is disabled or unavailable, open a second terminal and run `npm run parallel:watch -- <batchId>`. The watcher reads only the atomic batch manifest from the configured bridge state directory; it does not start another bridge/runtime or provider task. It refreshes task-resolution percentage, statuses and admission estimates once per second, and stops when the worker phase is terminal. `Ctrl+C` stops only the display, not the batch. This is a separate terminal view, not an embedded panel.

Historical route evidence (2026-10-08): Codex network-off and task-ref isolation canaries passed on disposable workspaces. A disposable local file-remote push canary remained unproven; this does not enable the Codex edit route. A DeepSeek Flash/OpenCode probe observed an output-token cap and `steps=1`; this does not apply to the direct DeepSeek API. `npm run canary:parallel` now runs only the opt-in Codex provider check. Live canaries may consume provider usage.

The OpenCode batch-progress plugin and its installation path are retired.

### Canonical routing

DeepSeek uses the separate official API adapter. Its 2026-10-19 local stdio pilots and 2026-11-03 P4 live Hades read-only and disposable-edit acceptances passed under their exact bounded scopes. The live edit remained a disposable preview and did not change the source workspace. These acceptances do not establish a general DeepSeek edit route or source integration; actual provider cost and CLI-internal inference count remain unknown. OpenCode production runtime registration and provider routes are retired; legacy targets fail closed.

```text
Gemini 3.8 Flash / Antigravity Claude Sonnet → AntigravityAdapter → AGY
Codex                   → CodexAdapter → official standalone codex.exe
Native Claude Code      → ClaudeCodeAdapter
DeepSeek Flash          → DeepSeekApiAdapter → https://api.deepseek.com/chat/completions (deepseek-flash, read-only)
```

Retired OpenCode, GLM, Kimi, Qwen and Space Bunny routes are not callable and are never remapped to Codex.

### Historical Space Bunny Free route record

**Historical Bridge status recorded 2026-10-13:** A previous Space Bunny generation route received a provider-side HTTP 403 `FreeTierError`, classified as non-retryable `permission_denied`. The former route used OpenCode's keyless Free Tier path; its Console/Go API-key paths were not verified through the Bridge. OpenCode's [2026-10-08 Console migration](https://github.com/anomalyco/opencode/pull/53963) moved keyless `space-bunny-free` traffic from the legacy Zen proxy to new inference after an earlier 2026-09-30 canary. This is historical evidence; the route and its checker are no longer registered in the current runtime.

The retired `check_space_bunny_subagent` checker refreshed the OpenCode models.dev catalog and reported exact-model status and price metadata without verifying auth or live endpoint access. The retired call path repeated an exact-model zero-price gate before invoking `opencode run`. A zero model price did not establish an account's “unpaid account” status under OpenCode Terms or prove that no provider-side billing applied.

The retired adapter used `--pure`, disabled project-local OpenCode config and supplied a Bridge-generated per-invocation `OPENCODE_CONFIG_CONTENT`. Its effective permissions denied tools by default except the explicitly allowed read tools or the edit tool in a disposable worker. These former safeguards did not establish model access, and the adapter is no longer callable.

The historical OpenCode source-bundle transport and its CLI-specific verification procedure are retired and are not available in the current runtime.

Historical source-bundle reviews used provider-specific JSON envelopes and host-manifest path/line validation. The former OpenCode and GLM envelopes are not part of the current runtime. Host citation validation established only that a referenced path and range existed in the supplied snapshot, not that a finding was true or that a model semantically read the source.

The historical OpenCode Terms review recorded an August 15, 2026 effective date and a restriction on automatically or programmatically extracting data or Output. Product documentation described CLI scripting and SDK support, but did not expressly define an exception to that restriction. The user reported a written clarification request on 2026-10-10; its response was pending in that historical record. Any future hosted source-bundle work requires a new policy review and separate approval. A local CLI session database does not change upstream data handling or Terms applicability.

The Space Bunny MCP route, catalog checker, web-research variant and edit pilot are retired. The 2026-09-30 canary and 2026-10-13 access-denial analysis remain historical evidence only.

### Historical provider and task-profile records

The provider routes and task-profile examples in this historical table predate the current configuration. Current task profiles are loaded from the active runtime configuration, which contains only Codex, Antigravity and direct DeepSeek targets. Retired targets and fallbacks are removed during legacy configuration migration and rejected in current configuration versions.

`run_task_profile` executes the task with a fixed route; read-only profiles have no fallback. Edit fallback is used only in the policy `fallbackTargets` order, under a clean disposable workspace, a single attempt, secret inspection and verified promotion. Gemini Pro and Gemini 3.7 Flash are disabled from normal execution after live `modelAccess=unavailable` probes on 2026-10-14; the matching task profiles now use the available Gemini 3.8 Flash route. The explicit capability-check tool may still probe the disabled aliases for diagnostics, but this does not make them callable through run tools.

```text
quick_read              → Codex Luna, read_only, 30, cache enabled
low_cost_analysis       → DeepSeek Flash, read_only, 25, cache enabled
deep_analysis           → Inactive legacy DeepSeek Pro profile; no fallback is attempted
low_cost_glm_highspeed  → GLM 5.2 HighSpeed, read_only, 22, cache enabled
glm_analysis            → GLM 5.2, read_only, 18, cache enabled
kimi_analysis           → Kimi K2.5 Instruct, read_only, 18, cache enabled
qwen_analysis           → Qwen3 Coder 480B, read_only, 18, cache enabled
web_research_fast       → Gemini 3.8 Flash, read_only, 25, cache enabled
web_research / file_audit → Gemini 3.8 Flash, read_only, 20, cache enabled
review                  → Codex Terra, read_only, 20, cache enabled
critical_review         → Codex Sol, read_only, 15, cache enabled
sol6_review             → GPT-6 Sol, read_only, 13, cache enabled
sol61_review            → GPT-6.1 Sol, read_only, 13, cache enabled
luna6_review            → GPT-6 Luna, read_only, 13, cache enabled
luna_implementation     → Codex Luna, edit, 12, cache disabled, no fallback
implementation          → Codex Terra, edit, 10, fallback: GLM 5.2 (disabled route skipped)
glm_implementation      → GLM 5.2, edit, 8, fallback: Codex Terra
critical_implementation → Codex Sol, edit, 5, fallback: GLM 5.2 (disabled route skipped)
sol6_implementation     → GPT-6 Sol, edit, 4, fallback: Codex Sol (5.6)
sol61_implementation    → GPT-6.1 Sol, edit, 4, fallback: GPT-6 Sol → Codex Sol (5.6)
luna6_implementation    → GPT-6 Luna, edit, 11, no fallback
```

Profiles live under `orchestration.taskProfiles` in `~/.config/subagent-bridge/config.json`. Codex subagent calls without an explicit model default to `gpt-6.1-sol` at the tool layer (`run_codex_subagent` and the global `codex` tool); an explicit model overrides this default. The global read-only `codexSol61` tool selects GPT-6.1 Sol explicitly, while `codexSol6` remains mapped to GPT-6 Sol. User-global OpenCode wrappers and their installer have been removed; Codex Desktop uses the project MCP registration described in the current setup section. Model access depends on the account and rollout status.

The historical global OpenCode tool wrapper and installer were removed. Codex Desktop uses the project MCP registration described in the current setup section.

OpenCode's user-level MCP registration procedure is retired. Hades MCP is currently registered through the Codex Desktop project configuration.

```powershell
npm run config:apply-routing
npm run config:apply-agent-modes
```

Backups are created under `~/.config/subagent-bridge/backups/`; use `npm run config:rollback -- <backup>` or `npm run config:rollback-agent-modes -- <backup>` to roll back.

### Verified provider matrix

Antigravity Gemini 3.8 Flash and Codex have historical route validation. DeepSeek Flash is configured through the official API adapter; its local stdio pilots and 2026-11-03 bounded live Hades read-only and disposable-edit acceptances passed strict result validation. The live edit remained a disposable preview and did not promote to the source workspace; these results do not prove a general edit capability or current Desktop process revision. Gemini Pro and Gemini 3.7 Flash returned modelAccess unavailable in live probes on 2026-10-14 and are disabled from normal execution. GPT-6 Luna, GPT-6 Sol and GPT-6 Astra are verified Codex identities; GPT-6 Luna/Sol are preferred for those roles. Claude Code requires an active subscription and its native acceptance phase is closed here.

The independent DeepSeek route uses the official `https://api.deepseek.com` API and canonical `deepseek-flash` model ID. `DEEPSEEK_API_KEY` is read from the process environment and can be configured for the Windows user with `scripts/set-deepseek-api-key.ps1`; never place the key in repository files. The adapter uses JSON mode, host-side result validation and an atomic pilot admission ledger capped at 1 USD, including a conservative reservation for the earlier direct smoke call. HTTP response bodies for chat completions and model catalog checks are cumulatively capped by `deepseek.maxOutputBytes` (8 MiB maximum). The cap counts bytes exposed to the application by Fetch, after any transport decoding; it is distinct from API `max_tokens`, process stdout/stderr limits, and the final normalized task-result schema. A narrower execution limit can reduce the host cap but cannot enlarge it. Only `read_only` execution is available through the general tool; the separately gated disposable edit pilot does not promote changes into the source workspace. The 2026-10-19 local stdio pilots passed. In the separate 2026-11-03 P4 live Hades acceptance, bounded read-only and disposable-edit tasks passed; the edit remained a preview and did not change the source workspace. These results do not establish general edit or source promotion, and usage-based cost estimates are not provider invoices.

Pilot budget ledger version 2 records money in integer nanodollars and separates legacy-unclassified accounting, usage-priced settlement and active/unknown reservations. An active or unknown reservation remains admitted against the cap after its TTL; expiry does not release possibly billed work. A valid late settlement can reconcile an unknown reservation, while invalid or replayed settlements cannot charge or release it again. Migration preserves the version 1 settled total as unclassified and carries every reservation forward; expired or unbounded legacy entries become unknown. Invalid, incompatible or limit-mismatched ledgers fail closed. Writes use a flushed temporary file and atomic rename under an OS file lock; legacy migration also fails closed when its compatibility lock is present or uncertain. These controls cover process crashes and cooperating writers, not power-loss durability of directory metadata or external writers that ignore the lock. Usage-priced amounts rely on provider-reported usage and remain estimates, not invoices.

### Antigravity contract

The canonical executable is `%LOCALAPPDATA%\agy\bin\agy.exe` and is invoked as `agy` through PATH.

```text
gemini_flash      → gemini-3.8-flash-high
gemini_flash_3_8  → gemini-3.8-flash-high
claude_sonnet     → claude-sonnet-4-6
```

`gemini_pro` and `gemini_flash_3_7` are disabled for normal run calls after live access probes reported unavailable. They remain accepted only by the explicit `check_antigravity_subagent` capability-probe schema, to allow future access diagnostics; they are absent from active run aliases and task-profile fallbacks. Probe permission does not enable model execution.

Read-only calls are constrained with `--add-dir`, `deny write_file(*)` and `no command(*)` policies. The `agy mcp list` output must be `No MCP servers configured.`; external MCP, permanently broad permissions, mutation and network probing are rejected. Settings are serialized with a PID lock and restored afterwards.

Read-only calls choose the evidence mode from the prompt: web-intent prompts stay in strict mode with the JSON carrier and the single carrier repair attempt, while local analysis prompts run in repair mode where a plain, URL-free result is accepted without web evidence. Antigravity's canonical web tool is `read_url_content`; its permission action is `read_url(domain)`. During read-only execution, the bridge temporarily allows `read_url(*)`, denies command, write, MCP and interactive browser actions, and restores settings afterwards. URLs are allowed only inside `webEvidence.sourceUrl`; `result` and `excerpts` must stay URL-free.

Web-intent Antigravity calls use `stream-json` to observe the canonical web-tool step. If the CLI times out, partial stdout/stderr is inspected in memory to retain only the web-read status; raw provider output is not added to metrics. `used` means the tool step was observed, while the host still validates and quarantines the evidence carrier before accepting a web-research result. Headless CLI permission requests that cannot be approved are soft-denied by Antigravity; see [Permissions](https://antigravity.google/docs/permissions/) and [Headless mode](https://antigravity.google/docs/cli/headless/).

Canonical error classes are `rate_limited`, `authentication_failure`, `permission_denied`, `timeout`, `server`, `network`, `process_exit`, `process_error` and `output_limit`; the real `exitCode` and `signal` are preserved. The provider circuit key is model-scoped for Antigravity (`antigravity:<model>`), so a transient failure in one model does not open the circuit for other Gemini models.

`check_antigravity_subagent` measures `modelAccess`, `toolFreeResponse`, `workspaceRead` and `webRead` per model with opt-in `probeModels` and `probeCapabilities`, serially and without side effects. `authValid: null` means the capability was not probed; `--version` success is not counted as auth success. Permission denial is reported as `not_probed` instead of `unavailable`. The default probe timeout is 300 seconds and is configurable through `antigravity.probeTimeoutMs`.

### Codex contract

The canonical executable is the official standalone `codex` on PATH.

```text
read_only  → codex exec --sandbox read-only --json
edit       → codex exec --sandbox workspace-write --json
```

The adapter consumes Codex's JSONL event stream, returns only the last completed `agent_message`, and does not expose reasoning or tool-event text as the result. Read-only retry for rate limits requires a recognized code on the terminal `turn.failed` or `error` event; prose, stderr examples, and JSON embedded in an agent message do not trigger a rate-limit retry. Malformed JSONL or a missing completed turn is rejected.

Read-only `parallel_batch` calls to Codex reduce JSONL incrementally. Tool and reasoning payloads are discarded; only the bounded final response, terminal/error state, and allowlisted usage fields are retained. The combined process output remains capped at the host limit (8 MiB by default), each JSONL record is capped at 8 MiB, and the final response is capped at 128 KiB. Diagnostics distinguish `process`, `jsonl_record` and `final_result` limits and report raw accepted stdout/stderr bytes separately from retained output bytes. Reasoning is never substituted for a missing final answer. Other call modes keep their existing buffered parsing path.

The normal flow contains no sandbox or approval bypass. Edit tools apply only selected files in a disposable workspace with hash checks, secret scanning and rollback-supported promotion; test, build, script, package manager and mutating shell commands are forbidden. High-impact promotions stay fail-closed until the orchestrator approves the stored prepared edit; multi-file application provides handled-error rollback. Interrupted promotion artifacts block new applications. Preserve temporary promotion artifacts and any existing target until ownership and recovery can be established; matching content alone does not establish file identity. The P2 prepared-edit recovery path has a durable journal and separate-process Windows crash/recovery tests. This does not establish POSIX, power-loss or non-cooperating external-writer guarantees.

### Shared invariants

```text
MAX_DELEGATION_DEPTH = 1
Host → subagent                         ALLOWED
subagent → bridge → another subagent   DENIED
```

Retry is limited to transient read-only failures within `maxRetries`. The workspace lock is the canonical workspace SHA-256; cache is used only for successful read-only results. Timeout and explicit cancel terminate the process tree.

### Final acceptance evidence

Historical acceptance evidence (2026-10-14): timeout override, retry, fallback, repository mutation and orphan process were zero; AGY settings restore succeeded, stale sentinel was absent, and acceptance passed 3x 143/143. This is historical evidence, not the current transition status.

### Test baseline

The current regression baseline is verified with `npm test`; timing-sensitive heavy verifications must run serially on the same machine.

### Known non-blocking items

The historical Codex TMPDIR isolation evaluation and non-reproducible AGY nested ENOENT remain non-blocking items. Original-plan P2/P3/P4 functional acceptance is complete. Claude Sonnet 4.6 P1b acceptance remains failed and user-deferred, not supported. Independent review of later source changes is the remaining condition for unconditional P6 closure; see the independent review package.

### Verified baseline freeze

The shared core is re-opened only for a confirmed production bug, a new provider, a security vulnerability, a measured concurrency defect or a contract-breaking upstream change.

## Model roles

Codex defines scope and architecture, runs code and tests, and verifies results. Gemini 3.8 Flash is the active Antigravity route for web research; Gemini Pro and Gemini 3.7 Flash remain disabled after unavailable access probes. Use an explicitly authorized active Codex model for second opinions; Claude Sonnet 4.6 P1b acceptance is deferred and unverified, and native Claude Code stays disabled without a subscription. DeepSeek has a separate official API adapter; bounded P4 read-only and disposable-edit acceptance passed, but no general DeepSeek edit route is enabled and no retired OpenCode-backed provider route is callable.

## Security separation

- Local analysis and internet access are not combined in the same subagent call.
- `analyst`/`reviewer`/`planner` use only `Read`/`Glob`/`Grep`; `researcher` uses only `WebSearch`/`WebFetch`.
- API keys are never written to prompts, checkpoints or source code.

## Skills

Canonical skills live under `.agents/skills` and Claude-compatible copies under `.claude/skills`: `commit-at`, `guvenlik-ve-sertlestirme`, `kod-denetleyicisi`, `otomatik-dokumantasyon`, `veri-seti-analizcisi`, `proje-kesif-planlama`, `subagent-orkestrasyonu`, `model-saglayici-ekleme`, `dogrulama-kapisi`, `mcp-sozlesme-denetimi`, `hafiza-vault-bakimi`, `maliyet-ve-butce-denetimi`, `bagimlilik-guvenligi`, `m2-hook-oturum-uygunlugu`, `m2-hook-sonuc-geri-bildirimi`, `m2-hook-proje-kohortu`, `m2-hook-tarihsel-atif`, `m2-hook-metrik-incelemesi`. The `subagent-orkestrasyonu` skill covers task/provider/model routing, exact-model verification, read-only versus controlled-edit dispatch and explicit multi-agent batch approval. The five `m2-hook-*` skills separately cover M2 session eligibility, explicit user outcomes, new-session cohort metadata, narrowly approved historical attribution and read-only metrics; none writes Vault notes or classifies YOLO/COCO datasets. Synchronize with `npm run skills:sync`. Global installs copy the same folders into `~/.config/opencode/skills`, `~/.codex/skills`, `~/.claude/skills` and `~/.agents/skills` so the skills are available outside the project; `npm run verify` checks the `.agents` ↔ `.claude` synchronization, while global copies are installed manually and are outside that gate. `npm run skills:check-global` compares the four global copies against the canonical `.agents` source and reports equal, missing and different roots; `--strict` treats missing copies as failures.

Planning selects web research and delegation only when needed. The orchestrator may write an authorized plan directly; delegated edits use a selected plan file. Provider-specific limits load from supporting skill references only for the chosen route. GPT-6.1 Sol self-review does not require a second Sol call and is not independent review. Verification selects checks by change type. Copy complete skill folders, including supporting references, when installing them globally.

## Installation

Requirements: Node.js 20.9+ (22/24 recommended), the official standalone Codex CLI and Git. Active Antigravity routes require the Antigravity CLI. The retired OpenCode backend is not used by the production runtime. The independent DeepSeek API route requires `DEEPSEEK_API_KEY` in the process environment; its local read-only and disposable-edit pilots passed, and the 2026-11-03 P4 live Hades read-only and disposable-edit acceptances passed for their bounded tasks. The live edit did not promote to the source workspace; general source promotion remains separately gated. The optional native Claude Code backend requires a Claude Code subscription and stays disabled without one.

```powershell
npm ci
npm run codex:check
npm run codex:diagnose
npm run codex:configure
npm run verify:local
```

Set the DeepSeek Windows user environment key with `scripts/set-deepseek-api-key.ps1`; the script prompts without echoing the key. Restart Codex Desktop so the MCP process inherits the updated environment. Never place the key in repository files or command history.

## Launch

In daily usage, Codex Desktop opens this repository as a trusted local project and loads the Hades MCP server from the project configuration. The MCP process receives the active workspace context, which is canonicalized and checked against allowed and denied roots before tools run.

## Command reference

```text
npm start                     Start the local MCP stdio bridge
npm run codex:configure       Register Hades MCP in this local Codex project
npm run codex:check           Inspect the local Codex MCP registration
npm run codex:diagnose        Check managed project setup without probing providers or personal state
npm run verify:local          Run serial tests and smoke/verify with temporary synthetic config and Vault
npm run pilot                 DeepSeek Flash synthetic pilot
npm run pilot:flash           DeepSeek Flash synthetic pilot
npm run pilot:edit:deepseek   Disabled until structured patch validation is implemented
npm run accept:edit:deepseek  Re-run the separately gated disposable DeepSeek edit acceptance
npm run smoke                 MCP tools, resources and runtime health with a temporary synthetic Vault
npm run smoke:vault           Explicit real-Vault search/read opt-in
npm run budget                Budget accounting totals (not invoice), observed/estimated cost, coverage and enforcement mode
npm run p0:e2e                Trusted workspace portability acceptance
npm test                      All Node.js regression tests
npm run verify:local          Serial local verification with synthetic config and Vault
npm run verify                Local executable, skill, config and Vault verification
npm run verify:ci             Provider-auth-free CI verification
npm run skills:check-global   Compare the four global skill copies with the canonical source (--strict fails on missing)
npm run metrics               Aggregated redacted metric summary
npm run metrics:prune         Retention-expired rotated metric cleanup
npm run runs:recent           Show recent runs read-only
npm run runs:mirror -- ...    Project-local mirror lifecycle
npm run edit:feedback         Record a direct-edit user outcome
npm run edit:classify         Append-only direct-edit eligibility disposition (list|dispose|classify-legacy)
npm run routing:feedback      Record a task-profile user outcome
npm run routing:classify      Classify a read-only routing run before feedback
npm run hook:feedback          Record a redacted memory-hook session outcome
npm run hook:classify          Classify a memory-hook session before feedback
npm run hook:attribute-history Add a separately approved legacy attribution
npm run memory:review         Persistent memory lifecycle review
npm run memory:doctor         Read-only Vault health, version and audit diagnosis
npm run memory:repair         Explicit Vault repair (dry-run by default, --apply to write)
npm run state:migrate         Explicit runtime state migration (dry-run by default)
npm run video:collect         Collect a public YouTube transcript as an untrusted, hashed envelope (--url=, optional --out=)
npm run hook:install          Generate the opt-in read-only memory hook (--client=codex|claude; optional --project-root= and --cohort=)
npm run memory:evaluate       Retrieval quality evaluation
npm run config:backup         Personal policy backup
```

`npm run verify:local` runs `verify:ci`, the full root-level Node test set, the required serial memory-search benchmark, the synthetic stdio MCP smoke, and `verify` in that order. The runner invokes the package scripts' fixed Node entry points without a shell, stops after the first failed stage, and returns a nonzero exit code. It gives each child the existing synthetic smoke config, Vault, profile, and temporary directory; provider credentials and personal config paths are not inherited. The verify health check receives no DeepSeek credential, so it returns before an API request. The command does not run provider inference, capability probes, live pilots, the real-Vault smoke opt-in, or the Desktop Hades process.

The required test-suite and benchmark stages use a bounded structured Node test reporter. The schema v3 JSON result records only allowlist-validated repository-relative locations, hashes rather than test names, closed failure classes, capped samples, and bounded event/output counters. Incomplete reporter data stays unavailable and never changes the stage result. Test names, assertion values/messages, stacks, and child stdout/stderr are not retained; a diagnostic hash is a lookup aid, not an attestation or privacy guarantee.

Progress is written to stderr and one bounded JSON result is written to stdout; there is no persistent report path. The version 3 result binds the initial and final HEAD, branch, index hash, tracked and non-ignored untracked file contents, dirty state, and a SHA-256 snapshot digest. This local digest is not a host attestation and does not cover ignored files such as `node_modules`, installed tool versions beyond the reported Node/platform values, or runtime state. A dirty tree is reported as dirty and is not cleaned or committed.

Snapshot paths are resolved lexically and checked component by component. A symlink or Windows junction in a parent path is rejected; a leaf symlink is recorded by hashing its link-target bytes without opening the target. Regular files are opened read-only after canonical-path validation, then read through that descriptor. BigInt descriptor metadata is compared before and after reading; the per-file and total byte limits are enforced while chunks are consumed. Cancellation is checked between paths and chunks, destroys the active stream, and closes its descriptor. Before producing the digest, the runner rechecks each sampled path and identity and rereads the Git index and path sets. Hard links are allowed: the snapshot describes content read through the repository path and does not attest that no outside alias exists.

These checks reject observed path, identity, content-size, index, and path-set changes; they are not an atomic filesystem snapshot or continuous lock. A writer that ignores locks can race between observations, and ignored files are outside the source set. POSIX-specific behavior is not established by the Windows test run. A leaf symlink's destination contents are intentionally outside this snapshot.

Each stage reports process cleanup separately from its exit result. `processTreeCleanup.status` is `confirmed`, `failed`, `unconfirmed`, or `not_applied`; the accompanying safe fields distinguish the termination method/request, direct-child exit, stdio closure, and forced stream closure. Windows tree cleanup is confirmed only when `taskkill /T /F` succeeds and the child exits with naturally closed stdio. A direct-child fallback or forced stream closure is never reported as tree confirmation. On POSIX, cleanup is confirmed only after the process group is observed gone. The stage timeout bounds command execution. Cleanup may add up to five seconds for the Windows `taskkill` command, then a separate 1.5-second termination grace and 0.5-second settlement window; without that command it adds at most two seconds. This extension is bounded and reported in the stage duration. If tree cleanup is failed or unconfirmed, the runner preserves its own synthetic root and reports `cleanup.status=preserved`; it does not claim that temporary files are safe to remove while a process may still use them. The bounded fallback can return while an unconfirmed descendant remains alive, which is surfaced in the report.

`verify:local` validates this checkout and local synthetic MCP process; it does not prove personal Vault health, external provider access, a running Desktop Hades revision, or independent source review.

## Hard limits

The DeepSeek edit pilot is restricted to a disposable workspace and never promotes its diff to the source workspace; general DeepSeek edit remains unavailable. Local pilot acceptance is not live Desktop MCP verification by itself. The separate P4 live read-only and disposable-edit acceptances passed only their bounded tasks and do not enable general edit or source promotion.

## Persistent memory

The Obsidian-compatible local Vault under `memory` is outside Git tracking. `check_persistent_memory`, `search_persistent_memory`, `read_persistent_memory`, `review_persistent_memory`, `analyze_memory_write`, `store_persistent_memory` and `promote_memory` manage secure access, drafts and SHA-256 controlled publishing. DeepSeek cannot access the Vault and cannot write to memory.

The write pipeline rejects secret-like, PII-shaped and prompt-injection content before writing; PII detection is checksum-validated for national ID, IBAN and payment cards. The note's `relativePath` is also scanned for PII, injection markers and exact secret signatures; the high-entropy heuristic is limited to non-path content. `store_persistent_memory` stores injection-marked content only with `acknowledgeInjectionRisk: true`, and the attempt is recorded as a redacted `QUARANTINE` audit event. `analyze_memory_write` returns a `coverage` block (indexed files, index cap, truncation), and idempotent `promote_memory` returns `auditWritten` and `recoveryRequired` evidence fields.

`npm run memory:doctor` reports frontmatter, soft-expiry, quarantine, hash-integrity, schema-version and audit-race findings read-only; it never deletes, moves, merges or repairs a note. The Vault and runtime state carry explicit schema versions; incompatible state fails closed at startup and requires `npm run state:migrate`.

The optional hook enriches a client session with at most five read-only Vault excerpts (1200 characters). It never writes or publishes, excludes drafts, expired and quarantined notes, and stays silent when memory is unavailable. Consumption profiles (`normal`, `economic`, `manual`) only change automation parameters; secret scanning, path/symlink protection, SHA-256 locking, schema validation, quarantine and write permissions are invariant. The installer supports Codex (`~/.codex/hooks.json`, requires `/hooks` trust review) and Claude Code (prints a settings snippet for manual merge). OpenCode hook generation is retired; legacy OpenCode session metrics remain readable for historical reporting.

Optional project cohort reporting uses the local registry `~/.config/subagent-bridge/memory-hook-cohorts.json` or an absolute `SUBAGENT_MEMORY_HOOK_COHORT_REGISTRY` override. Its version-1 JSON maps `norn` and `dersmerkezi` to exact canonical project roots and explicitly listed worktrees; the file stays outside Git and its paths never enter metrics. A project install uses `--project-root=<root>`; adding `--cohort=norn|dersmerkezi` enables a named cohort after registry validation. Omitting `--cohort` for a project install fixes that hook to `unassigned`. Global hooks reject a fixed named cohort; omitting the cohort resolves the current root dynamically through the registry, while explicit `--cohort=unassigned` forces the unassigned bucket. Codex project hooks safely merge into `<root>/.codex/hooks.json`; Claude prints a snippet for manual merge into `<root>/.claude/settings.local.json`. OpenCode cohort values are retained only for legacy metric interpretation and cannot be installed. If global and project hooks run together, matching named attributions are idempotent; a named/unassigned mismatch is immutable and recorded as an attribution conflict. Cohort report keys identify project metadata and should be treated as non-anonymous when shared.

Project-local generated Codex hooks include absolute interpreter and orchestrator-install paths, so treat them as machine-specific. Keep them ignored/local unless the path is standardized for every consumer, and review them before committing.

Legacy outcome labels remain `legacy_unattributed` in the canonical M2 view. The one-off `npm run hook:attribute-history` path adds a separate `historicalAttribution` view for explicitly approved legacy sessions. Its closed attribution bases distinguish `user_confirmed` (the OpenCode `not_useful` DersMerkezi session) from `session_metadata_verified` (the two Norn sessions whose metric hashes matched OpenCode session IDs and whose canonical directory/worktree metadata matched Norn). It requires an exact full session-ID confirmation pair plus an orchestrator-supplied one-shot expected hash, verifies the existing eligible session/outcome, and appends a path-free event. It does not edit session/disposition/feedback rows or affect canonical `byProjectCohort`, global M2 totals or `decisionReady`; unrelated legacy labels remain unattributed. This is not a bulk-migration command.

`npm run video:collect -- --url=<watch-url> [--out=<file>]` downloads only subtitles and oEmbed metadata for a public YouTube video through local `yt-dlp`, verifies the video identity, enforces 2 MB subtitle and 400k character transcript limits and prints a hashed `untrusted_video_transcript` envelope. Antigravity read-only calls additionally enforce the JSON carrier with `--json-schema` and allow one bounded carrier repair attempt when validation fails. Nested JSON carrier envelopes are unwrapped to a bounded depth of two; inner `webEvidence` is preserved when the outer layer is empty, and invalid evidence is rejected by the strict schema.

## Reliability and metrics

Routing and direct-edit feedback operations use a separate bounded JSONL snapshot. Duplicate execution rows with identical canonical content count once; conflicting rows or feedback records for the same identity fail closed. Prefix IDs are extended when needed to remain unique, and writes resolve the supplied ID against the current full identity set while holding the feedback lock. The reader rejects incomplete, malformed, unsupported, linked, oversized, or concurrently changed sources without exposing their paths or contents. This feedback snapshot detects cooperative source changes during its scan; it does not guarantee atomicity against writers that ignore the feedback lock or mutate the files after the scan.

DeepSeek results are validated with Zod; transient read-only failures use bounded retry, circuit breaker and a separate atomic pilot budget capped at 1 USD. The local 2026-10-19 stdio read-only pilot passed strict result validation. The separate 2026-11-03 P4 live Hades read-only and disposable-edit acceptances passed only their bounded tasks; the edit did not change the source workspace. Usage-based estimates are not provider invoices, and these acceptances do not attest the current Desktop Hades source revision.

```text
%LOCALAPPDATA%\subagent-bridge\logs\metrics\
├─ codex-runs.jsonl
├─ antigravity-runs.jsonl
├─ opencode-runs.jsonl
├─ claude_code-runs.jsonl
├─ direct-edit-baseline-runs.jsonl
└─ memory-hook-runs.jsonl
```

Records never contain prompt, response, diff, workspace or file paths, task ID or secrets. The optional `<workspace>/.hades/runs.jsonl` mirror is managed with `npm run runs:mirror -- enable|status|view|disable|clear --confirm`.

Execution metrics are written with the `execution_metric_v2` explicit allowlist; they carry `failureStage`, `providerCode`, the real `exitCode`, `signal`, `retryDecision`, `retryStopReason`, `settingsLockWaitMs`, `providerExecutionMs` and stdout/stderr size buckets. `recent-runs` is a strict v1/v2 reader and the operator view shows only the last-attempt diagnosis; the full attempt array stays in the machine metric. The view identifies its source as `canonical_metrics` and distinguishes `available`, `missing`, `unsafe` and `unreadable` source states without exposing a path. The command resolves the runtime root from the invoking process environment; a sandboxed shell can therefore have a different canonical metrics root than the Desktop MCP process. Runtime results expose only the redacted canonical metric write status and a closed failure class; they never include the target path or raw I/O error.

The recent-runs reader opens selected regular files and reads at most 64 files and 64 MiB in 16 KiB positional chunks. It frames LF/CRLF JSONL with a 256 KiB maximum record, parses UTF-8 strictly, and reads runs and feedback from the same descriptor snapshots. Retained aggregation is capped at 50,000 distinct execution identities across runs, conflicts and both feedback types; per-file staging is capped at the same identity count. Each feedback type retains only its newest record per identity, with the first record in deterministic file/line scan order winning timestamp ties. If either identity cap would be exceeded, the affected file stage is dropped and the result is marked `partial`/`truncated`; `stateLimitDroppedRecordCount`, `stateLimitSkippedLineCount` and `stateLimitExceededFileCount` distinguish known records discarded, lines not parsed after a per-file cap, and affected files. A partial result cannot claim that unseen records contain no conflict or newer feedback. This is a record/identity count bound, not a precise JavaScript heap-byte guarantee. `sourceStatus: available` means the directory could be enumerated; `snapshot.status` separately reports `complete`, `partial` or `unavailable`. Byte, read-request, pending-record, processed/dropped-record and observed-mutation counters are returned without paths or record contents. Appends beyond the descriptor size captured for a read are excluded and mark the result partial when observed. Truncation, rotation, replacement or deletion detected during a read discards that file's staged records and marks the result partial. An unterminated final JSONL record is dropped as partial; malformed newline-terminated records increment `invalidRecordCount`. Metadata checks and descriptor identity checks are best effort, not an atomic snapshot against writers that ignore the append protocol or mutate the same file between checks.

## Architecture documents

This private source checkout keeps the four plan documents in their source locations below. The public release plan maps curated copies to docs/architecture; that export directory is not materialized in this checkout. See the [public release plan](docs/plans/yapilanlar/PUBLIC_YAYIN_PLANI.md).

- [CONTEXT_ORKESTRASYONU_VE_GUVENLI_SECOND_BRAIN_PLANI_2026-08-21.md](docs/plans/yarim-kalanlar/CONTEXT_ORKESTRASYONU_VE_GUVENLI_SECOND_BRAIN_PLANI_2026-08-21.md)
- [MODEL_KIMLIGI_VE_ERISIM_MODU_PLANI.md](docs/plans/yapilanlar/MODEL_KIMLIGI_VE_ERISIM_MODU_PLANI.md)
- [DEEPSEEK_EDIT_PILOT_VE_MIRROR_KARARLILIK_PLANI.md](docs/plans/yapilanlar/DEEPSEEK_EDIT_PILOT_VE_MIRROR_KARARLILIK_PLANI.md)
- [RECENT_RUNS_GOZLEMLENEBILIRLIK_PLANI.md](docs/plans/yapilanlar/RECENT_RUNS_GOZLEMLENEBILIRLIK_PLANI.md)

These documents are historical plans. Each audited plan starts with a dated status note; current verification is `npm test` and CI rather than the fixed test or tool counts captured at plan creation time.

## Continuous integration

`.github/workflows/validate.yml` runs `npm ci`, `npm test` and `npm run verify:ci` on Windows and Linux with Node 22/24. `verify:ci` requires no local executable, provider auth or Vault. Use `npm run config:backup` before a personal policy change and `npm run config:rollback -- <backup>` to roll back.

## Acknowledgements

The architectural approach is inspired by [Avenox](https://avenox.lol/) projects and [github.com/avenoxai](https://github.com/avenoxai) repositories.

## License and contribution

- License: [Apache-2.0](LICENSE)
- Security reporting: [SECURITY.md](SECURITY.md)
- Contribution guide: [CONTRIBUTING.md](CONTRIBUTING.md)

# Türkçe

Hades Orchestrator, Codex Desktop ana orkestratörünün yerel MCP sunucusu üzerinden bağımsız subagent backend’lerini çağırdığı sağlayıcıdan bağımsız bir orkestrasyon sistemidir. Çalışma zamanı bileşeni `subagent-bridge`’dir; Codex host modeli ile subagent backend’leri ayrıdır.

Güncel geçiş durumu (2026-11-05): Özgün plan kapsamındaki P2/P3/P4 işlevsel kabulleri tamamlandı. P2 recovery kanıtı ayrı süreçli Windows testlerinde gerçek üretim recovery yolunu kullanır; canlı Hades recovery çağrısı değildir. Claude P1b strict görev kabulü task_json_parse_invalid ile başarısız oldu ve kullanıcı kararıyla ertelendi. Son GPT-6.1-Sol incelemesi yalnız kendi 10 dosyalı snapshot’ını kapsar; üç sonraki yerel düzeltme bağımsız incelenmedi. Güncel doğal kaynak kapsamı local preflight’ta engelli; payload teslim edilmedi ve provider çağrısı yapılmadı. Son tam yerel doğrulama 1.083 testte 1.079 başarı, dört Windows koşullu atlama ve sıfır başarısızlık verdi; zorunlu benchmark 11,4 saniye sürdü. Smoke ve verify sentetik Vault/config ile, verify:ci başarılı çalıştı. AST ayarı unset/kapalıdır. P6 durum belgeleri uzlaştırıldı, fakat bağımsız inceleme beklediğinden geçiş koşulsuz kapatılmış değildir.

## Ne sunar

- Tek MCP yüzeyinden Codex, Gemini/Antigravity, native Claude Code ve doğrudan resmi DeepSeek API adaptörü. Emekliye ayrılan OpenCode rotaları Codex'e yeniden eşlenmemiştir.
- Fail-closed salt-okunur sandbox, seçili dosyalara kontrollü edit, rollback destekli promotion.
- Erişim modu, maliyet, retry, kalıcı hafıza ve redacted metrik politikaları.
- Orkestrasyon V2: yeni eklenen host-owned paralel batch scheduler'ı (salt-okunur DAG dalgaları, izole Git worktree'lerinde tek dalgalı edit batch'leri, opak detail referanslı bounded özetler, approval-bound entegrasyon ve açık iptal).

## İçindekiler

- [Kullanım](#kullanım)
- [Doğrulanmış taban](#doğrulanmış-taban)
- [Hızlı başlangıç](#hızlı-başlangıç)
- [Mimari](#mimari)
- [MCP kural attestation](#mcp-kural-attestation)
- [Kişisel yapılandırma](#kişisel-yapılandırma)
- [Orkestrasyon V2 paralel batch'leri](#orkestrasyon-v2-paralel-batchleri)
- [Kanonik yönlendirme](#kanonik-yönlendirme)
- [Görev profilleri](#görev-profilleri)
- [Doğrulanmış sağlayıcı matrisi](#doğrulanmış-sağlayıcı-matrisi)
- [Antigravity sözleşmesi](#antigravity-sözleşmesi)
- [Codex sözleşmesi](#codex-sözleşmesi)
- [Ortak değişmezler](#ortak-değişmezler)
- [Nihai kabul kanıtı](#nihai-kabul-kanıtı)
- [Test tabanı](#test-tabanı)
- [Bilinen engelleyici olmayan maddeler](#bilinen-engelleyici-olmayan-maddeler)
- [Doğrulanmış taban dondurma](#doğrulanmış-taban-dondurma)
- [Model rolleri](#model-rolleri)
- [Güvenlik ayrımı](#güvenlik-ayrımı)
- [Skill’ler](#skiller)
- [Kurulum](#kurulum)
- [Başlatma](#başlatma)
- [Komut referansı](#komut-referansı)
- [Kalıcı sınırlar](#kalıcı-sınırlar)
- [Kalıcı hafıza](#kalıcı-hafıza)
- [Güvenilirlik ve metrikler](#güvenilirlik-ve-metrikler)
- [Mimari dokümanlar](#mimari-dokümanlar)
- [Sürekli entegrasyon](#sürekli-entegrasyon)
- [Teşekkür](#teşekkür)
- [Lisans ve katkı](#lisans-ve-katkı)

## Kullanım

Runtime policy’si `~/.config/subagent-bridge/config.json`, executable ve adapter ayarları `~/.config/subagent-bridge/agents.json` dosyasından yüklenir. `ORCHESTRATOR_CONFIG` ve `SUBAGENT_BRIDGE_AGENTS_CONFIG` konumları değiştirir; `config/policy.json` ve `config/agents.json` dağıtım şablonudur. Yerel MCP server workspace'e göreli komut ve `cwd` kullanır; dolu `SUBAGENT_BRIDGE_TRUSTED_WORKSPACE` override'ı varsa o, yoksa MCP sürecinin çalışma dizini kullanılır. Her iki yol da `allowedRoots` ve yasaklı köklere göre doğrulanır. Salt-okunur görevler global araçlarla, kontrollü edit ise seçili dosya ve kabul kriterleriyle yürütülür. Doğrulama: `npm test`, `npm run verify:ci`, `npm run budget`, `npm run metrics`.

## Doğrulanmış taban

Paket hades-orchestrator 2.2.0, çalışma zamanı Node.js 20.9+ ve ESM’dir; CI Node.js 22/24 kullanır. Kanonik kayıt `%LOCALAPPDATA%\subagent-bridge\logs\metrics`, isteğe bağlı görünüm `<workspace>/.hades/runs.jsonl` altındadır. Kaydedilen son tam yerel doğrulama 2026-11-05: 1.083 testten 1.079 başarılı, dört Windows koşullu atlama ve sıfır başarısızlık; benchmark 11,4 saniye. Sentetik smoke, sentetik config/Vault verify ve verify:ci aynı kaynak durumunda geçti. Bunlar tarihli yerel kanıttır.

## Hızlı başlangıç

```powershell
npm ci
npm run codex:check
npm run codex:diagnose
npm run codex:configure
npm run verify:local
npm run runs:recent
```

Günlük kullanım için depo kökünü Codex Desktop içinde ayrı ve güvenilen yerel proje olarak açın. `npm run codex:check` proje MCP kaydını salt okunur denetler; `npm run codex:diagnose` yerel config/entrypoint ve PATH önkoşullarını kontrol eder, kullanıcı-genel config'i, Hades'i, sağlayıcıyı veya Vault'u okumaz. Yalnız managed kayıt güncel değilse `npm run codex:configure` çalıştırın; komut diğer TOML ayarlarını koruyarak Hades kaydını günceller. Updater değişmeyen planı da kilit altında yeniden doğrular. Yayın sonrası cleanup veya kilit sonucu belirsizse yeni yazma kararı vermeden önce `codex:check` ile güncel durumu gözleyin. Yerel uçtan uca doğrulama için `npm run verify:local` kullanın; bu komut sentetik config/Vault ve credential taşımayan test ortamı kullanır. Sunucu kodu veya kaydı değiştiğinde Codex Desktop içinden bu projenin Hades MCP sunucusunu yeniden başlatın; ardından canlı workspace identity ve araç/resource yüzeyini operasyonel olarak kontrol edin. Bu gözlemler çalışan commit veya etkin config attestation'ı değildir. `AGENTS.md` proje çalışma kurallarını sağlar. Sağlayıcı kimlik bilgileri repoda tutulmaz. Takip edilen yapılandırma makineye özgü executable ve çalışma alanı yolları içerir. Etkin ve emekli rotalar ile kalan kabul kapıları [Codex Desktop geçiş planında](docs/plans/CODEX_DESKTOP_UCTAN_UCA_GECIS_PLANI_2026-10-18.md) ve [uygulama raporunda](docs/reports/CODEX_DESKTOP_GECIS_UYGULAMA_DURUMU_2026-10-18.md) izlenir.

## Mimari

```text
Codex Desktop Host
└─ project MCP configuration → subagent-bridge
     ├─ MCP Frontend         → trusted host workspace injection
     ├─ Bridge Runtime       → canonical router, capability, lock, retry, cancellation
     ├─ AntigravityAdapter   → AGY (Gemini 3.8 Flash, Claude Sonnet)
     ├─ ClaudeCodeAdapter    → native Claude Code
     ├─ CodexAdapter         → official OpenAI Codex CLI
     └─ Observability        → global redacted metrics + opt-in .hades mirror
```

```text
HOST / ORKESTRATOR MODEL != SUBAGENT BACKEND
PACKAGE LOCATION != ACTIVE WORKSPACE
```

MCP trusted workspace package konumundan türetilmez: dolu bir başlangıç ortam değişkeni override'ı varsa o, yoksa host'un MCP sürecine sağladığı çalışma dizini kullanılır. Seçilen yol canonicalize edilir ve izinli/yasaklı köklere göre doğrulanır.

### MCP kural attestation

Bridge, workspace kural dosyaları için redacted ve salt-okunur bir resource sunar:

- URI: `hades://rules/attestation/v1`
- Ad: `rule-attestation-v1`
- MIME türü: `application/json`
- Dosyalar: `AGENTS.md`, `CLAUDE.md`, `config/agent-rules.md`
- Hash sözleşmesi: değiştirilmemiş ham UTF-8 dosya byte'larının SHA-256 özeti

Manifest strict şema, sabit entry sırası, RFC 8785 canonicalization, dosya ve toplam boyut sınırları, descriptor okuması, link kontrolleri, UTF-8 doğrulaması, secret taraması ve TOCTOU kontrolleri uygular. Tool fallback yoktur. Resource desteklemeyen client `unsupported` kalır ve tool çağrılmaz.

Sonuç `sourceClass: "mcp_resource"` ile güvenilmeyen bir gözlemdir. `workspace_file` ve `mcp_resource` eşleşen snapshot bildirebilir; trusted host loader hook'u bulunana kadar `startup_context` `unavailable` kalır. Resource, host'un kuralları startup context'e enjekte ettiğini, modelin kurallara uyduğunu veya sonucun imzalı attestation olduğunu kanıtlamaz. `npm run smoke` resource listeleme, okuma ve strict manifest doğrulamasını çalıştırır.

Bridge ayrıca workspace kimliği için ayrı bir salt-okunur resource sunar:

- URI: `hades://workspace/identity/v1`
- Ad: `workspace-identity-v1`
- Çıktı: server başlangıcında yakalanan süreç cwd'si ile doğrulanmış kanonik trusted workspace'in SHA-256 özetleri.

Strict yanıt yalnız hash içerir. Hashler gizlilik garantisi vermez, kriptografik host attestation değildir ve başlangıç kurallarının alındığını kanıtlamaz. Resource dosya yazmaz, provider çalıştırmaz ve workspace seçimini değiştirmez. MCP server yeniden başlatıldıktan sonra iki özeti hedef checkout için hesaplanan değerlerle karşılaştırın; doğrulanan süreç yeniden başlatma sonrasındaki süreçtir.

### Kişisel yapılandırma

`configVersion: 2` şema doğrulamasından geçer; bilinmeyen veya eksik alan reddedilir. Provider’lar `defaultMode`/`allowedModes` ile sınırlıdır. `reliability.monthlyCostLimitUsd: 100` ve `warningThresholdPercent: 80` bilgilendirme referansıdır; admission-time bütçe uygulaması varsayılan olarak kapalıdır (`costBudgetEnforced: false`) ve açıkça etkinleştirilebilir. `npm run budget` ve `check_subagent_bridge`, `dailyAccountedUsd`/`monthlyAccountedUsd` alanlarını döndürür (`dailySpentUsd`/`monthlySpentUsd` geriye uyumluluk alias'larıdır). Bu toplam gözlenen ve tahmini maliyetlerden oluşur; tahminler aktif rezervasyonları kapsar, gerçek maliyeti/rezervi bilinmeyen işler ayrı sayılır ve sıfır maliyet diye varsayılmaz. Bu tutarlar **sağlayıcı faturası değildir**. `costAccounting.limitMode`, `advisory_only`, `admission_blocking` veya `no_limit_configured` durumunu belirtir; `costBudgetEnforced: false` iken kalan/aşım/uyarı alanları bilgilendirme amaçlıdır ve yeni isteği reddetmez. `measurementStatus: not_observable`, en az bir çalışmanın gerçek maliyetinin bilinmediğini gösterir; aggregate tutarı observed/estimated ayrımı ve kapsama oranıyla birlikte yorumlayın. Enforcement açıkken limit rezervasyon anında atomik kontrol edilir; süresi dolmuş rezervasyondan sonra gelen geç settlement yine hesaba katılır. Codex `allowNonGitWorkspace` yalnız kişisel machine config ile açılır; DeepSeek Git repository zorunluluğu olmadan denied-root ve Zod doğrulamasını korur.

### Orkestrasyon V2 paralel batch'leri

Orkestrasyon V2, mevcut Node bridge'e eklenen host-owned scheduler'dır; tekil subagent araçlarının yerini almaz ve yeni workflow framework'ü eklemez. “V2” özellik adıdır; paket sürümü veya `configVersion` değildir. Salt-okunur batch'ler bağımsız görevleri ve sıralı bağımlılık dalgalarını destekler. Worker'lar bounded JSON özet döndürür; tam ayrıntı yalnız caller/workspace/batch/task bağlamına bağlı opak referansla okunur. Edit batch'leri Git worktree izolasyonu kullanır ve tek dalgada kalır. Edit task'ları seçilmiş, host allowlist'indeki doğrulama komutlarını ister; `stopConditions` worker'a bildirilir, `resourceClaims` ortak adlı kaynağı kullanan görevleri sıralar. Task başına input/output byte, dosya sayısı ve diff byte limitleri host tavanını aşamaz. Host-enforced tokenizer sınırı olmayan rotada input-token talebi fail-closed reddedilir; output-token sınırı için provider cap canary'si gerekir.

Orkestrasyon V2 yetenek özeti:

- İki aşamalı batch akışı: `prepare_parallel_batch` sınırlı bir önizleme döndürür; yalnız ayrı kullanıcı onay turu aynı `planId`/`planHash` ile başlatır.
- Batch biçimleri: salt-okunur batch'ler bağımsız görevleri ve sıralı bağımlılık dalgalarını destekler; edit batch'leri tek dalgadır ve task başına özel ref'li izole Git worktree'lerinde çalışır.
- Bounded sonuçlar: worker'lar küçük JSON özeti döndürür; tam ayrıntı orkestratör context'ine girmeden opak, caller/workspace/batch/task bağlı referanslarda kalır.
- Approval-bound entegrasyon: birleşik diff önizlemesi, diff hash'i, kaynak HEAD/ref durumu ve değişen dosya hash'leri kaynak workspace write lock'u altında doğrulanır; kalıcı workspace journal'ı başlangıçta yarım promotion'ları geri alır.
- Açık iptal: `cancel_parallel_batch` kuyruktaki/çalışan işleri durdurur; sonuçları yerleşmiş `result_ready`/`blocked` batch'ler tamamlanan görevleri ve maliyeti yeniden settle etmeden kalıcı `cancelled` durumu yazar.
- Fail-closed varsayılanlar: dağıtım şablonunda `enabled: false` ve `editEnabled: false`; `codexNetworkOffCapability: available` yalnız doğrulanmış Codex rotası için geçerlidir. Host doğrulaması yalnız güvenli `git diff --check` ile sınırlıdır.
- İsteğe bağlı canlı görünüm: `npm run parallel:watch -- <batchId>` veya opt-in otomatik Windows Terminal paneli; `Ctrl+C` yalnız görünümü durdurur.

MCP akışı bilinçli olarak iki aşamalıdır:

1. `prepare_parallel_batch` task DAG'ını, okunabilir yolları, provider rotasını ve batch-local admission tahminini doğrular. Worker başlatmaz; `planId`, `planHash` ve sınırlı bir önizleme döndürür. Edit task'ları host allowlist'indeki doğrulama komutlarını seçmelidir; bounded input/diff limitleri, stop koşulları ve paylaşılan kaynak claim'leri belirtebilir.
2. Ana orkestratör önizlemeyi kullanıcıya gösterir. Yalnız ayrı ve açık kullanıcı onay turundan sonra aynı plan ID/hash ile `start_parallel_batch` çağrılır.
3. `start_parallel_batch` hemen `batchId` döndürür; her `get_parallel_batch` poll'u yapılandırılmış ilerleme yüzdesi ve task durumlarını döndürür. Yüzde çözümlenmiş task'ları sayar; `unknown` tamamlanmış sayılmaz ve çalışan task içindeki token/iş yüzdesi uydurulmaz. MCP ilerleme bildirimleri istemcide kalıcı bir görünüm sağlamaz. `get_parallel_task_detail` artifact sayfası okur, `cancel_parallel_batch` açık iptal sağlar. MCP istemcisinin bağlantı kesmesi kabul edilmiş batch'i iptal etmez.
4. Edit entegrasyonunu onaylamadan önce `taskId: "integration"` ve onay özetindeki `detailRef` ile `get_parallel_task_detail` çağırıp birleşik diff'in sınırlı sayfalarını inceleyin. Ayrı onay diff hash'i, kaynak HEAD/ref durumu ve değişen dosya hash'lerine bağlanır; kaynak workspace write lock altında uygulanır. Doğrulama komutları her izole task worktree'sinde ve ardından integration worktree'sinde çalışır. Kaynak dosya değişmişse önizleme geçersizleşir. Dosyalar değiştirilmeden önce workspace'e bağlı durable recovery journal yazılır; başlangıç kurtarması yarım promotion'ı geri alır veya commit edilmiş promotion'ı batch manifestiyle uzlaştırır. Kaynakta çakışan harici değişiklik veya kurtarma hatası journal'ı koruyup yeni edit işlemlerini bloke eder. Dosyalar tek tek değiştirildiğinden bridge write lock'u dışındaki okuyucular tamamlanmakta olan çok dosyalı promotion'ın ara durumunu görebilir. Hazır diff'i iptal etmek onayı düşürür; `integrating` başladıktan sonra iptal reddedilir. Git commit/push yapmaz.

Sonuçları yerleşmiş `result_ready` veya `blocked` batch'inin iptali, tamamlanan task sonuçlarını ve maliyet settlement'ını değiştirmeden kalıcı `cancelled` durumu yazar. Tekrar iptal no-op'tur.

`prepare_parallel_batch` için örnek argümanlar:

```json
{
  "objective": "Kullanıcı dokümantasyonunu gözden geçir",
  "batchMaxReservedCostUsd": 0.5,
  "maxWorkers": 2,
  "tasks": [
    {
      "taskId": "readme-review",
      "role": "reviewer",
      "mode": "read_only",
      "target": "codex",
      "model": "gpt-5.6-luna",
      "objective": "README içindeki olgusal tutarsızlıkları bul.",
      "readablePaths": ["README.md"],
      "acceptanceCriteria": ["Kısa ve kanıta dayalı inceleme döndür."]
    }
  ]
}
```

Dönen plan ID/hash tek başına başlatma izni değildir; önizlemeyi gösterip ayrı kullanıcı onay turunu bekleyin.

`maxOutputBytes`, JSONL ve araç olayları dahil ham süreç stdout+stderr toplamının UTF-8 byte sınırıdır; nihai cevap veya public özet sınırı değildir. Alan atlanırsa mevcut host süreç sınırı kullanılır. Plan önizlemesi task başına etkin sınırı ve task/host varsayılan kaynağını, ayrı public özet karakter/batch byte sınırlarını gösterir. Codex reducer ayrıca bağımsız JSONL record ve final-result byte sınırlarını uygular. Kısa cevap talimatı süreç çıktısını sınırlamaz. `output_limit` sonrasında task ayrıntısındaki scope/stream, kabul edilen/gözlenen byte ve reddedilen chunk ölçümleri incelenmeden aynı plan tekrarlanmaz; eksik çıktı başarı sayılmaz. Gözlenen taşma tamamlanmış çıktı boyutu değildir. [P2/P3 kabul prosedürü](docs/handoffs/CODEX_BATCH_P2_P3_KABUL_YOLU.md) danışmanlık, DAG, edit ve recovery kabulünü ayrı tutar.

Özelliği kişisel `parallelBatch` yapılandırmasında `enabled: true` ile açın; dağıtım şablonu varsayılan olarak kapalıdır. `editEnabled` ayrı opt-in'dir ve temiz Git workspace'i ile canary'den geçmiş provider capability'si gerektirir. Host doğrulaması şimdilik yalnızca güvenli `git diff --check` komutuna izin verir; OS sandbox'ı bulunmadığından diğer komutlar fail-closed reddedilir. Entegrasyonu onaylamadan önce proje testlerini ayrıca çalıştırın. `batchMaxReservedCostUsd` iç admission tahmini için tavan olup sağlayıcı faturası veya gerçek harcama garantisi değildir. Tahmin, primary rota ile yalnız read-only görevlerde runtime'ın gerçekten yürüttüğü çözümlenen fallback rotaları için yapılandırılmış bilinmeyen-attempt maliyeti ile retry sınırının çarpımlarını toplar; edit görevleri fallback rotası rezerve etmez. Bu değer sağlayıcının uyguladığı output-token/harcama tavanı değildir. Gerçek provider maliyet üst sınırı isteyen görev, bu sınırı sağlayıcıda uygulayamayan rotada çalıştırılmaz. Batch havuzu global per-execution maliyet muhasebesinden ayrıdır; queued/running tahsisler, unknown denemeler ve kullanılmayan tahsisler ayrı gösterilir.

Kalıcı canlı görünüm için kişisel `parallelBatch.autoOpenTerminalDashboard: true` ayarını kullanın; Windows Terminal kuruluysa batch başlayınca ana ekranın sağ kenarına yakın küçük, bağımsız bir pencere açar. Dağıtım şablonunda bu ayar kapalıdır. Otomatik açma kapalıysa/uygun değilse ayrı terminalde `npm run parallel:watch -- <batchId>` çalıştırın. Watcher yalnız yapılandırılmış bridge state dizinindeki atomik batch manifestini okur; ikinci bridge/runtime veya provider görevi başlatmaz. Task çözülme yüzdesini, durumları ve admission tahminini saniyede bir yeniler; worker aşaması terminal olduğunda durur. `Ctrl+C` yalnız görünümü kapatır, batch'i iptal etmez.

Tarihsel route kanıtı (2026-10-08): Codex network-off ve disposable workspace task-ref isolation canary'leri geçti. Disposable local file-remote push canary'si `unproven` kaldı; Codex edit rotasını etkinleştirmez. DeepSeek Flash/OpenCode probu yalnız o zamanki eski route için output-token cap ve `steps=1` gözledi; bu, bağımsız DeepSeek API adapter'ına uygulanamaz. Güncel Codex route canary'si `npm run canary:parallel` komutudur; canlı provider kullanımı tüketebilir. MCP yapılandırması veya runtime kaynakları değiştiğinde yeni araç ve davranışların yüklenmesi için Hades MCP sürecini yeniden başlatın.

OpenCode batch ilerleme eklentisi ve kurulum yolu emekliye ayrılmıştır; tarihsel eklenti açıklamaları güncel kullanım talimatı değildir.

### Kanonik yönlendirme

DeepSeek, OpenCode'dan bağımsız resmi API adapter'ı üzerinden çalışır. 2026-10-19 yerel stdio read-only ve disposable edit kabul pilotları `deepseek_flash` → `deepseek-flash` canonical kimliğiyle geçti. Read-only pilot 355 giriş/46 çıkış tokenı için kullanım-tabanlı 0.0001617 USD, disposable edit pilotu 0.00021 USD maliyet hesapladı (provider faturası değildir); edit `applied=false` ile döndü ve ana workspace değişmedi. Ayrıca 2026-11-03 tarihinde P4 kapsamında canlı Hades read-only ve disposable-edit kabulleri kendi sınırlı görevlerinde geçti; canlı edit kaynak workspace'e uygulanmadı. HTTP chat-completion ve model-kataloğu yanıt gövdeleri `deepseek.maxOutputBytes` ile kümülatif sınırlandırılır (en çok 8 MiB); ölçüm Fetch'in uygulamaya sunduğu byte'lar üzerindedir ve sıkıştırılmış ağ aktarım boyutu değildir. Bu sınır API `max_tokens`, süreç stdout/stderr tavanı ve normalize edilmiş nihai görev sonucu şemasından ayrıdır. Bu sonuçlar genel edit veya kaynak terfisi değildir. OpenCode production adapter'ı ve yürütme rotaları yerel koddan emekliye ayrıldı.

```text
Gemini 3.8 Flash / Antigravity Claude Sonnet → AntigravityAdapter → AGY
Codex                   → CodexAdapter → official standalone codex.exe
Native Claude Code      → ClaudeCodeAdapter
DeepSeek Flash          → DeepSeekApiAdapter → https://api.deepseek.com/chat/completions (deepseek-flash, read-only)
```

Emekliye ayrılan OpenCode, GLM, Kimi, Qwen ve Space Bunny rotaları için yeni çağrı veya fallback yapılmaz. Tarihsel rota kayıtları aşağıda yalnız önceki kararların bağlamı için tutulur.

### Güncel görev profilleri

Etkin profiller `config/policy.json` içinde tanımlıdır: Codex read-only/edit, Antigravity Gemini 3.8 Flash read-only ve doğrudan DeepSeek Flash read-only. OpenCode, GLM, Kimi, Qwen ve Space Bunny hedefleri v3 runtime yapılandırmasında reddedilir; eski sürüm yapılandırmalarındaki hedef ve fallback girdileri bellek içi migrasyonda çıkarılır.

`run_task_profile` görevi sabit route ile çalıştırır; read-only profillerde fallback yoktur. Edit fallback’i yalnız policy’deki `fallbackTargets` sırası ile temiz disposable workspace, tek deneme, secret denetimi ve doğrulanmış promotion altında kullanılır.

```text
quick_read              → Codex Luna, read_only, 30, cache açık
low_cost_analysis       → DeepSeek Flash, read_only, 25, cache açık
deep_analysis           → Pasif eski DeepSeek Pro profili; fallback çalıştırılmaz
low_cost_glm_highspeed  → GLM 5.2 HighSpeed, read_only, 22, cache açık
glm_analysis            → GLM 5.2, read_only, 18, cache açık
kimi_analysis           → Kimi K2.5 Instruct, read_only, 18, cache açık
qwen_analysis           → Qwen3 Coder 480B, read_only, 18, cache açık
web_research_fast       → Gemini 3.8 Flash, read_only, 25, cache açık
web_research / file_audit → Gemini 3.8 Flash, read_only, 20, cache açık
review                  → Codex Terra, read_only, 20, cache açık
critical_review         → Codex Sol, read_only, 15, cache açık
sol6_review             → GPT-6 Sol, read_only, 13, cache açık
sol61_review            → GPT-6.1 Sol, read_only, 13, cache açık
luna6_review            → GPT-6 Luna, read_only, 13, cache açık
luna_implementation     → Codex Luna, edit, 12, cache kapalı, fallback yok
implementation          → Codex Terra, edit, 10, fallback: GLM 5.2 (disabled route skipped)
glm_implementation      → GLM 5.2, edit, 8, fallback: Codex Terra
critical_implementation → Codex Sol, edit, 5, fallback: GLM 5.2 (disabled route skipped)
sol6_implementation     → GPT-6 Sol, edit, 4, fallback: Codex Sol (5.6)
sol61_implementation    → GPT-6.1 Sol, edit, 4, fallback: GPT-6 Sol → Codex Sol (5.6)
luna6_implementation    → GPT-6 Luna, edit, 11, fallback yok
```

Profiller etkin runtime config içinde `orchestration.taskProfiles` alanındadır. Model belirtilmeyen Codex subagent çağrıları araç katmanında `gpt-6.1-sol` ile sabitlenir (`run_codex_subagent` ve global `codex` aracı); açıkça verilen model bu varsayılanı geçersiz kılar. Global salt-okunur `codexSol61` aracı GPT-6.1 Sol'u açıkça seçer; `codexSol6` GPT-6 Sol olarak kalır. Tarihsel global OpenCode araç şablonu ve kurulum script'leri kaldırılmıştır.

OpenCode kullanıcı-geneli MCP kayıt yönergesi emekliye ayrılmıştır. Hades MCP, Codex Desktop proje yapılandırması üzerinden kaydedilir.

```powershell
npm run config:apply-routing
npm run config:apply-agent-modes
```

Backup `~/.config/subagent-bridge/backups/` altında oluşturulur; rollback için `npm run config:rollback -- <backup>` veya `npm run config:rollback-agent-modes -- <backup>` kullanılır.

### Doğrulanmış sağlayıcı matrisi

Antigravity Gemini 3.8 Flash ve Codex rotaları geçmişte doğrulanmıştır. DeepSeek Flash resmi API adapter'ında yerel stdio pilotlarını geçti; 2026-11-03 P4 canlı Hades read-only ve disposable-edit kabulleri de kendi sınırlı görevlerinde geçti. Canlı edit kaynak workspace'e terfi etmedi ve bu sonuçlar güncel Desktop Hades kaynak revision'ını veya genel edit yeteneğini kanıtlamaz. Gemini Pro ve Gemini 3.7 Flash 2026-10-14 canlı probe'larında erişilemez döndü ve normal çalıştırmadan devre dışı bırakıldı. GPT-6 Luna, GPT-6 Sol ve GPT-6 Astra doğrulanmış Codex kimlikleridir; Luna/Sol rollerinde GPT-6 sürümleri tercih edilir. Codex Luna hızlı uygulayıcı, Terra dengeli editör, Sol zor hata ayıklama ve denetim modelidir. Claude Code etkin abonelik gerektirir ve native Claude kabul fazı kapalıdır.

### Antigravity sözleşmesi

Kanonik executable `%LOCALAPPDATA%\agy\bin\agy.exe` olup PATH üzerinden `agy` çağrılır.

```text
gemini_flash      → gemini-3.8-flash-high
gemini_flash_3_8  → gemini-3.8-flash-high
claude_sonnet     → claude-sonnet-4-6
```

`gemini_pro` ve `gemini_flash_3_7` normal çalıştırma çağrılarında devre dışıdır. Erişim probe'larında unavailable döndüklerinden etkin run araçlarından ve task-profile fallback'lerinden çıkarılmışlardır. Gelecekteki erişim kontrolü için açıkça çağrılan `check_antigravity_subagent` probe şeması bu iki alias'ı kabul etmeye devam eder; probe edilebilir olmaları çalıştırılabilir oldukları anlamına gelmez.

Salt-okunur çağrı `--add-dir`, `deny write_file(*)` ve `no command(*)` politikalarıyla sınırlanır. `agy mcp list` sonucu `No MCP servers configured.` olmalıdır; harici MCP, kalıcı geniş izin, mutasyon ve network probe reddedilir. Ayarlar PID lock ile serileştirilir ve geri yüklenir.

Salt-okunur çağrılar kanıt modunu prompta göre seçer: web niyeti taşıyan promptlar JSON carrier'lı strict modda kalır ve tek carrier onarım denemesi yapılır; yerel analiz promptları URL içermeyen düz metnin web kanıtı olmadan kabul edildiği repair modunda çalışır. Antigravity'nin kanonik web aracı `read_url_content`, izin eylemi ise `read_url(domain)`'dir. Salt-okunur yürütme sırasında bridge geçici olarak `read_url(*)` izni ekler; command, write, MCP ve etkileşimli browser eylemlerini reddeder ve işlem sonunda ayarları geri yükler. URL yalnızca `webEvidence.sourceUrl` içinde bulunabilir; `result` ve `excerpts` URL içermemelidir.

Web niyetli Antigravity çağrıları kanonik web aracı adımını gözlemek için `stream-json` kullanır. CLI zaman aşımında kısmi stdout/stderr bellekte incelenip yalnız web-okuma durumu korunur; ham sağlayıcı çıktısı metriklere yazılmaz. `used`, araç adımının gözlendiğini belirtir; web araştırma sonucu kabul edilmeden önce kanıt zarfı host tarafından doğrulanıp karantinaya alınır. Onay verilemeyen headless CLI izin istekleri Antigravity tarafından soft-deny edilir. Ayrıntılar: [Permissions](https://antigravity.google/docs/permissions/) ve [Headless mode](https://antigravity.google/docs/cli/headless/).

Kanonik hata sınıfları `rate_limited`, `authentication_failure`, `permission_denied`, `timeout`, `server`, `network`, `process_exit`, `process_error` ve `output_limit`’tir; gerçek `exitCode` ve `signal` korunur. Provider circuit anahtarı Antigravity’de model bazlıdır (`antigravity:<model>`), böylece bir modelin geçici hatası diğer Gemini modellerini kapatmaz.

`check_antigravity_subagent`, opt-in `probeModels` ve `probeCapabilities` ile model başına `modelAccess`, `toolFreeResponse`, `workspaceRead` ve `webRead` yeteneklerini seri ve yan etkisiz ölçer. `authValid: null` probe yapılmadığını ifade eder; `--version` başarısı auth başarısı sayılmaz. İzin reddi `unavailable` yerine `not_probed` raporlanır. Varsayılan probe zaman aşımı 300 sn’dir ve `antigravity.probeTimeoutMs` ile ayarlanır.

### Codex sözleşmesi

Kanonik executable PATH üzerindeki resmi standalone `codex`’tir.

```text
read_only  → codex exec --sandbox read-only --json
edit       → codex exec --sandbox workspace-write --json
```

Adapter Codex’in JSONL event akışını işler; yalnız son tamamlanmış `agent_message` sonucunu döndürür, reasoning veya araç event’lerini sonuç metni olarak sızdırmaz. Rate-limit retry yalnız terminal `turn.failed` veya `error` event’inde tanınan hata koduyla açılır; düz metin, stderr örnekleri ve agent mesajı içindeki JSON rate-limit retry başlatmaz. Bozuk JSONL veya tamamlanma event’i olmayan çıktı reddedilir.

Salt-okunur `parallel_batch` çağrılarında yalnız Codex JSONL akışı artımlı olarak indirgenir. Araç ve reasoning payload’ları atılır; yalnız sınırlandırılmış nihai yanıt, terminal/hata durumu ve izinli kullanım alanları tutulur. Birleşik process çıktısı host tavanına (varsayılan 8 MiB), her JSONL kaydı 8 MiB’a, nihai yanıt 128 KiB’a kadar kabul edilir. Tanılar `process`, `jsonl_record` ve `final_result` sınırlarını ayırır; ham kabul edilen stdout/stderr byte sayaçlarını saklanan çıktı byte’larından ayrı raporlar. Eksik yanıt yerine reasoning gösterilmez. Diğer çağrı modları mevcut tamponlu ayrıştırma yolunu korur.

Normal akış sandbox veya approval bypass içermez. Edit araçları disposable workspace’te yalnız seçili dosyaları hash kontrolü, secret taraması ve rollback destekli promotion ile uygular; test, build, script, paket yöneticisi ve mutasyon yapan shell komutları yasaktır. Yüksek etkili promotion, orkestratör saklanan prepared edit’i onaylayana kadar fail-closed kalır; çok dosyalı uygulama işlenen hatalarda geri alınır. Kesintiye uğramış promotion artifaktları yeni uygulamaları engeller. Sahiplik ve kurtarma belirlenene kadar `.tmp` ve `.tmp.backup` artifaktlarını ve varsa hedefi koruyun; içeriğin eşleşmesi tek başına dosya kimliğini kanıtlamaz. Prepared-edit yolunda kalıcı recovery journal veya doğrulanmış otomatik kurtarma prosedürü yoktur.

### Ortak değişmezler

```text
MAX_DELEGATION_DEPTH = 1
Host → subagent                         ALLOWED
subagent → bridge → another subagent   DENIED
```

Retry yalnız geçici salt-okunur hatalarda `maxRetries` sınırındadır. Workspace lock canonical workspace SHA-256’sıdır; cache yalnız başarılı salt-okunur sonuçlarda kullanılır. Timeout ve explicit cancel süreç ağacını sonlandırır.

### Nihai kabul kanıtı

Gemini Pro ve Codex gerçek file-backed sonuçla çağrıldı; timeout override, retry, fallback, repository mutation ve orphan process `0`; AGY settings restore `YES`, stale sentinel `NO`; acceptance `3x 143/143 PASS`.

### Test tabanı

Güncel regresyon tabanı `npm test` ile doğrulanır; zamanlamaya duyarlı ağır doğrulamalar aynı makinede sıralı çalıştırılmalıdır.

### Bilinen engelleyici olmayan maddeler

Codex `%TMPDIR` isolation değerlendirmesi, yeniden üretilemeyen tarihsel AGY nested `ENOENT`, kapalı native Claude acceptance fazı (Claude Code aboneliği yok) ve bekleyen Faz 5 provider'ları engelleyici değildir.

### Doğrulanmış taban dondurma

Shared core yalnız confirmed production bug, yeni provider, security vulnerability, ölçülmüş concurrency defect veya contract-breaking upstream değişikliğiyle yeniden açılır.

## Model rolleri

Codex kapsamı ve mimariyi belirler, kodu ve testleri yürütür, sonuçları doğrular. Web araştırmasında etkin Antigravity rotası Gemini 3.8 Flash'tır; Gemini Pro ve Gemini 3.7 Flash erişim probu unavailable verdiğinden devre dışıdır. İkinci görüş için ayrıca yetkilendirilmiş etkin bir Codex modeli kullanılır. Claude Sonnet 4.6 P1b kabulü başarısız ve ertelenmiştir; doğrulanmış destek veya reviewer kabulü değildir. DeepSeek bağımsız resmi API adaptörünü kullanır; P4 canlı kabulleri kendi sınırlı görevlerine aittir. Emekliye ayrılan OpenCode rotaları kullanılamaz.

## Güvenlik ayrımı

- Yerel analiz ve internet erişimi aynı subagent çağrısında birleşmez.
- `analyst`/`reviewer`/`planner` yalnız `Read`/`Glob`/`Grep`; `researcher` yalnız `WebSearch`/`WebFetch` kullanır.
- API anahtarları prompta, checkpoint’e veya kaynak koda yazılmaz.

## Skill’ler

Kanonik skill’ler `.agents/skills`, Claude uyumlu kopyalar `.claude/skills` altındadır: `commit-at`, `guvenlik-ve-sertlestirme`, `kod-denetleyicisi`, `otomatik-dokumantasyon`, `veri-seti-analizcisi`, `proje-kesif-planlama`, `subagent-orkestrasyonu`, `model-saglayici-ekleme`, `dogrulama-kapisi`, `mcp-sozlesme-denetimi`, `hafiza-vault-bakimi`, `maliyet-ve-butce-denetimi`, `bagimlilik-guvenligi`, `m2-hook-oturum-uygunlugu`, `m2-hook-sonuc-geri-bildirimi`, `m2-hook-proje-kohortu`, `m2-hook-tarihsel-atif`, `m2-hook-metrik-incelemesi`. `subagent-orkestrasyonu` skill’i görev/sağlayıcı/model yönlendirmesini, gerçek model metadata’sı doğrulamasını, salt-okunur/kontrollü edit ayrımını ve multi-agent batch onayını kapsar. Beş `m2-hook-*` skill’i M2 session uygunluğu, açık kullanıcı outcome’u, yeni session cohort metadatası, dar kapsamlı tarihsel atıf ve salt-okunur metrik incelemesini ayrı yürütür; Vault notu yazmaz ve YOLO/COCO veri seti sınıflandırması yapmaz. Eşitleme: `npm run skills:sync`. Global kurulum aynı klasörleri `~/.config/opencode/skills`, `~/.codex/skills`, `~/.claude/skills` ve `~/.agents/skills` altına kopyalar; `npm run verify` `.agents` ↔ `.claude` eşlemesini doğrular, global kopyalar elle kurulur ve bu kapının dışındadır. `npm run skills:check-global` dört global kopyayı kanonik `.agents` kaynağıyla karşılaştırır ve eşit, eksik ve farklı kökleri raporlar; `--strict` eksik kopyayı hata sayar.

Planlama, web araştırmasını ve delegasyonu yalnız ihtiyaç varsa seçer. Yetkili planı ana orkestratör yazabilir; devredilen edit seçilmiş plan dosyasıyla sınırlıdır. Sağlayıcı sınırları skill'in destek belgelerinden yalnız seçilen rota için yüklenir. GPT-6.1 Sol kendi incelemesi için ikinci Sol çağrısı yapmak zorunda değildir; kendi incelemesi bağımsız denetim sayılmaz. Doğrulama, değişiklik türünün zorunlu kapılarını seçer. Global kurulumda destek belgeleri dahil bütün skill klasörünü kopyalayın.

## Kurulum

Gereksinimler: Node.js 20.9+ (22/24 önerilir), resmi standalone Codex CLI ve Git. Etkin Antigravity rotaları için Antigravity CLI gerekir. DeepSeek pilotları için resmi API anahtarı gerekir; disposable edit pilotu kaynak workspace'e terfi etmez. P4 canlı read-only ve disposable-edit kabulleri yalnız kendi sınırlı görevlerini doğrular; genel edit veya kaynak terfisi sağlamaz. OpenCode'a bağlı eski yürütme rotaları emekliye ayrılmıştır. İsteğe bağlı native Claude Code backend'i Claude Code aboneliği gerektirir ve abonelik yokken kapalı kalır.

```powershell
npm ci
npm run codex:check
npm run codex:diagnose
npm run codex:configure
npm run verify:local
```

DeepSeek Windows kullanıcı ortam değişkeni `scripts/set-deepseek-api-key.ps1` ile anahtar ekrana basılmadan ayarlanır. Ardından Codex Desktop yeniden başlatılmalıdır ki MCP süreci güncel ortamı alsın. Anahtarı proje dosyasına veya komut geçmişine yapıştırmayın.

## Başlatma

Günlük kullanımda Codex Desktop depo kökünü güvenilen yerel proje olarak açar ve Hades MCP sunucusunu proje yapılandırmasından yükler. MCP süreci etkin çalışma alanı bağlamını alır; araçlar çalışmadan önce yol izin verilen ve reddedilen köklerle karşılaştırılarak doğrulanır.

## Komut referansı

```text
npm start                     Local MCP stdio bridge'i başlatır
npm run codex:configure       Bu yerel Codex projesine Hades MCP kaydını kurar
npm run codex:check           Yerel Codex MCP kaydını denetler
npm run codex:diagnose        Provider/Vault erişimi olmadan yerel Codex proje kaydını denetler
npm run verify:local          Sentetik config/Vault ile seri yerel uçtan uca doğrulama
npm run pilot                 DeepSeek Flash sentetik pilotu
npm run pilot:flash           DeepSeek Flash sentetik pilotu
npm run pilot:edit:deepseek   Yapılandırılmış patch doğrulaması tamamlanana dek kapalı
npm run accept:edit:deepseek  Disposable DeepSeek edit kabul adımını yeniden çalıştırır
npm run smoke                 Geçici sentetik Vault ile MCP araç, resource ve runtime health kontrolleri
npm run smoke:vault           Gerçek Vault arama/okuma için açık opt-in
npm run budget                Fatura olmayan muhasebe toplamı, gözlenen/tahmini maliyet, kapsama ve uygulama modu
npm run p0:e2e                Trusted workspace portability kabulü
npm test                      Tüm Node.js regresyon testleri
npm run verify                Yerel executable, skill, config ve Vault doğrulaması
npm run verify:ci             Provider auth gerektirmeyen CI doğrulaması
npm run skills:check-global   Dört global skill kopyasını kanonik kaynakla karşılaştırır (--strict eksikte hata verir)
npm run metrics               Toplu redacted metric özeti
npm run metrics:prune         Retention dışı rotated metric temizliği
npm run runs:recent           Son çalışmaları salt-okunur gösterir
npm run runs:mirror -- ...    Proje-local mirror yaşam döngüsü
npm run edit:feedback         Direct-edit kullanıcı sonucu kaydı
npm run edit:classify         Append-only direct-edit uygunluk sınıflandırması (list|dispose|classify-legacy)
npm run routing:feedback      Task-profile kullanıcı sonucu kaydı
npm run routing:classify      Read-only routing kaydını geri bildirimden önce sınıflandırır
npm run hook:feedback         Redacted hafıza hook oturum sonucu kaydı
npm run hook:classify         Hafıza hook oturumunu geri bildirim öncesi sınıflandırma
npm run hook:attribute-history Ayrı historical view için onaylı legacy atıf
npm run memory:review         Kalıcı hafıza yaşam döngüsü denetimi
npm run memory:doctor         Salt-okunur Vault sağlık, sürüm ve audit teşhisi
npm run review:diagnose -- --workspace . --file src/example.js
npm run memory:repair         Açık Vault onarımı (varsayılan dry-run, yazmak için --apply)
npm run state:migrate         Explicit runtime state migrasyonu (varsayılan dry-run)
npm run video:collect         Herkese açık YouTube altyazısını güvenilmeyen, hashlı zarf olarak toplar (--url=, opsiyonel --out=)
npm run hook:install          Opt-in salt-okunur hafıza hook'u üretir (--client=codex|claude; opsiyonel --project-root= ve --cohort=)
npm run memory:evaluate       Retrieval kalite değerlendirmesi
npm run config:backup         Kişisel policy backup'ı
```

`review:diagnose` yalnız açıkça seçilen review dosyalarını yerel `review-source-manifest` kontrolleriyle inceler. Birden çok dosya için `--file` tekrarlanır. Komut provider, MCP review, kişisel runtime config veya Vault yüklemez; source payload üretmez ve hiçbir ret kararını değiştirmez. JSON sonucu güvenli göreli path, dosya boyutu/hash'i, kapalı hata sınıfı, çalıştırılan/çalıştırılmayan kontroller, tamamlık, policy-source fingerprint'i ve seçili kapsam snapshot hash'ini verir. `completeness=complete`, seçilen her dosyanın tanı kontrolünden geçirildiğini belirtir; bir dosya ret aldığında toplam ve bundle kontrolleri çalıştırılmamış olabilir. Bu durumda `checks` ve `unrunControls` alanları aggregate kontrolün sonucunu ayrı gösterir. `decision=clean` ve exit code `0` yalnız bütün seçili dosyalar ve aggregate kontroller geçtiğinde verilir. Hash'ler gizlilik garantisi veya host attestation değildir.

Çıkış kodu `0` seçilen kapsamın mevcut yerel kontrollerden geçtiğini, `2` yerel preflight engelini, `3` beklenen snapshot veya policy hash'inin değiştiğini, `64` argüman hatasını, `1` tanı politikasının veya çalıştırmanın güvenli biçimde tamamlanamadığını gösterir. Önceki `snapshotSha256` değerini `--expected-snapshot`, `policy.sha256` değerini `--expected-policy` ile karşılaştırabilirsiniz. Eksik snapshot, karşılaştırılamaz olarak raporlanır. Komut repository'deki policy varsayılanını kullanır; etkin Hades kişisel config'ini okumadığı için `policy.mayDifferFromActiveRuntime` sınırı korunur. `clean` yalnız seçili scope için yerel preflight sonucudur; kaynak gönderme izni veya bütün repository için güvenlik onayı değildir.

Örnek redakte sonuç:

```json
{
  "decision": "blocked",
  "failureClass": "review_scope_secret_detected",
  "completeness": "complete",
  "firstProductionFailure": {
    "inputIndex": 1,
    "path": "src/example.js",
    "failureClass": "review_scope_secret_detected",
    "stage": "legacy_secret_classifier"
  },
  "execution": {
    "providerStarted": false,
    "sourcePayloadCreated": false,
    "sourceDelivery": "not_attempted",
    "sourceDeliveryAuthorized": false
  }
}
```

## Kalıcı sınırlar

DeepSeek edit kabulü yalnız deepseek_edit_pilot caller'ı için strict patch yanıtını bridge-owned disposable kopyaya uygular; ana workspace'e edit terfisi ve genel DeepSeek edit çağrısı fail-closed kalır. P2 prepared-edit uygulaması, P3 normal edit-batch entegrasyonu ve P4 doğrudan API disposable pilotu kendi ayrı kapsamlarında kabul edilmiştir; bu sonuçlar genel edit yetkisi vermez. Geri alınamaz işlem, üretim erişimi, dış sistemde yazma ve secret aktarımı insan onayı gerektirir.

## Kalıcı hafıza

`memory` klasöründeki Obsidian uyumlu yerel Vault, Git takibinin dışındadır. `check_persistent_memory`, `search_persistent_memory`, `read_persistent_memory`, `review_persistent_memory`, `analyze_memory_write`, `store_persistent_memory` ve `promote_memory` güvenli erişim, taslak ve SHA-256 kontrollü yayını yönetir. DeepSeek Vault’a erişemez ve belleğe yazamaz.

Yazma hattı secret benzeri, PII biçimli ve prompt injection içeren metni yazımdan önce reddeder; PII tespiti ulusal kimlik, IBAN ve ödeme kartı için checksum doğrulamalıdır. Not `relativePath` değeri de PII, injection işaretleri ve kesin secret imzaları açısından taranır; yüksek entropi sezgisi yol dışı içerikle sınırlıdır. `store_persistent_memory` injection işaretli içeriği yalnız `acknowledgeInjectionRisk: true` ile saklar ve deneme redacted `QUARANTINE` audit olayı olarak kaydedilir. `analyze_memory_write` `coverage` bloğu (indekslenen dosya, indeks üst sınırı, kırpma), idempotent `promote_memory` ise `auditWritten` ve `recoveryRequired` kanıt alanları döndürür.

`npm run memory:doctor` frontmatter, soft-expiry, karantina, hash bütünlüğü, şema sürümü ve audit yarış bulgularını salt-okunur raporlar; hiçbir notu silmez, taşımaz, birleştirmez veya onarmaz. Vault ve runtime state açık şema sürümleri taşır; uyumsuz state başlangıçta fail-closed olur ve `npm run state:migrate` gerektirir.

İsteğe bağlı hook, istemci oturumuna en fazla beş salt-okunur Vault alıntısı (1200 karakter) ekler. Asla yazmaz veya yayınlamaz; taslak, süresi dolmuş ve karantina notlarını dışlar; hafıza erişilemezse sessiz kalır. Tüketim profilleri (`normal`, `economic`, `manual`) yalnız otomasyon parametrelerini değiştirir; secret taraması, path/symlink koruması, SHA-256 kilidi, şema doğrulaması, karantina ve yazma izinleri değişmez. Kurucu Codex (`~/.codex/hooks.json`, `/hooks` güven incelemesi gerekir) ve Claude Code (elle birleştirilecek settings snippet'i) destekler. OpenCode hook üretimi emekliye ayrılmıştır; eski OpenCode session metrikleri tarihsel raporlama için okunabilir.

İsteğe bağlı proje cohort raporlaması `~/.config/subagent-bridge/memory-hook-cohorts.json` yerel registry'sini veya mutlak `SUBAGENT_MEMORY_HOOK_COHORT_REGISTRY` override'ını kullanır. Sürüm 1 JSON, `norn` ve `dersmerkezi` değerlerini tam canonical project root'ları ve ayrıca listelenmiş worktree'lerle eşler; registry Git dışında kalır ve yollar metriklere yazılmaz. Proje kurulumu `--project-root=<root>` alır; `--cohort=norn|dersmerkezi` eklenirse registry doğrulamasından sonra named cohort kullanılır. Proje kurulumunda `--cohort` atlanması o hook'u sabit `unassigned` yapar. Global hook'lar sabit named cohort'u reddeder; cohort atlanırsa mevcut root'u registry ile dinamik çözer, açık `--cohort=unassigned` ise `unassigned` değerini sabitler. Codex proje hook'u `<root>/.codex/hooks.json` ayarını güvenle birleştirir; Claude `<root>/.claude/settings.local.json` içine elle eklenecek snippet üretir. OpenCode cohort değerleri yalnız eski metriklerin yorumlanması için tutulur ve kurulamaz. Global ve proje hook'ları birlikte çalışırsa eşleşen named atıflar idempotenttir; named/unassigned uyuşmazlığı değiştirilemez ve attribution conflict olarak kaydedilir. Cohort anahtarları proje metadata'sıdır; paylaşılan raporlar anonim kabul edilmemelidir.

Eski outcome etiketleri canonical M2 görünümünde `legacy_unattributed` kalır. Tek kullanımlık `npm run hook:attribute-history` akışı yalnız ayrıca onaylanmış eski oturumları `historicalAttribution` görünümüne ekler. Kapalı attribution basis değerleri `user_confirmed` (DersMerkezi OpenCode `not_useful`) ve `session_metadata_verified` (metric hash'i OpenCode session ID'siyle, canonical directory/worktree metadata'sı Norn ile eşleşen iki oturum) ayrımını korur. Tam session-ID confirmation çifti, orchestrator'ın tek-seferlik beklenen hash'i ve eligible session/outcome doğrulanır; path içermeyen append-only event yazılır. Eski session/disposition/feedback kayıtları değişmez; canonical `byProjectCohort`, global M2 toplamları ve `decisionReady` etkilenmez, ilgisiz legacy etiketler atıfsız kalır. Bu komut toplu migrasyon yapmaz.

Proje kapsamlı üretilen Codex hook'ları mutlak interpreter ve orchestrator kurulum yolları içerir; makineye özel kabul edin. Tüm tüketicilerde yol standartlaştırılmadıkça dosyaları local/ignore tutun ve commit öncesi inceleyin.

`npm run video:collect -- --url=<watch-adresi> [--out=<dosya>]` herkese açık bir YouTube videosu için yalnız altyazı ve oEmbed künyesini yerel `yt-dlp` ile indirir, video kimliğini doğrular, 2 MB altyazı ve 400 bin karakter transcript sınırlarını uygular ve hashlı `untrusted_video_transcript` zarfını yazdırır. Antigravity salt-okunur çağrıları ayrıca JSON carrier'ı `--json-schema` ile zorlar ve doğrulama düştüğünde tek denemelik sınırlı carrier onarımına izin verir. İç içe JSON carrier zarfları en fazla iki derinlikte çözülür; dış katman boşken iç `webEvidence` korunur ve geçersiz kanıt strict şemada reddedilir.

## Güvenilirlik ve metrikler

Routing ve direct-edit geri bildirim işlemleri ayrı, sınırlı bir JSONL snapshot kullanır. Kanonik içeriği aynı yinelenen execution satırları tek kayıt sayılır; aynı kimlikte çelişen run veya feedback kayıtları fail-closed reddedilir. Prefix kimlikleri gerektiğinde benzersiz kalacak kadar uzatılır; yazım mevcut tam kimlik kümesine karşı feedback kilidi altında çözülür. Eksik, bozuk, desteklenmeyen, linkli, sınır aşan veya tarama sırasında değişen kaynaklar yol ve içerik göstermeden reddedilir. Bu geri bildirim snapshot’ı tarama sırasındaki kaynak değişikliklerini saptar; feedback kilidini yok sayan yazarlara veya tarama sonrası değişikliklere karşı atomik bütünlük garantisi vermez.

DeepSeek sonucu Zod ile doğrulanır; geçici hatalarda retry, circuit breaker ve atomik maliyet rezervasyonu uygulanır.

```text
%LOCALAPPDATA%\subagent-bridge\logs\metrics\
├─ codex-runs.jsonl
├─ antigravity-runs.jsonl
├─ opencode-runs.jsonl
├─ claude_code-runs.jsonl
├─ direct-edit-baseline-runs.jsonl
└─ memory-hook-runs.jsonl
```

Kayıtlar prompt, cevap, diff, workspace veya dosya yolu, task ID ve secret içermez. İsteğe bağlı `<workspace>/.hades/runs.jsonl` mirror’ı `npm run runs:mirror -- enable|status|view|disable|clear --confirm` ile yönetilir.

Execution metrikleri `execution_metric_v2` explicit allowlist’i ile yazılır; `failureStage`, `providerCode`, gerçek `exitCode`, `signal`, `retryDecision`, `retryStopReason`, `settingsLockWaitMs`, `providerExecutionMs` ve stdout/stderr boyut kovaları taşınır. `recent-runs` strict v1/v2 okuyucusudur ve operatör görünümünde yalnız son attempt tanısı gösterilir; tam attempt dizisi machine metric’te kalır. Görünüm kaynağını `canonical_metrics` olarak işaretler ve yol göstermeden `available`, `missing`, `unsafe` ile `unreadable` durumlarını ayırır. Komut runtime kökünü çağıran sürecin ortamından çözdüğü için sandbox kabuğu Desktop MCP sürecinden farklı bir canonical metrics kökü görebilir. Runtime sonucu yalnız redakte canonical metric yazma durumunu ve kapalı hata sınıfını gösterir; hedef yol veya ham I/O hatası taşımaz.

Recent-runs okuyucusu seçilen normal dosyaları açar ve en fazla 64 dosyayı, toplam 64 MiB’ı, 16 KiB konumsal okuma parçalarını ve JSONL kaydı başına 256 KiB’ı aşmaz. LF/CRLF kayıtlarını UTF-8’i katı doğrulayarak çerçeveler; run ve feedback kayıtlarını aynı descriptor snapshot’ından işler. Biriktirilen durum, run/conflict ve iki feedback türünün birleşiminde en fazla 50.000 farklı execution kimliğiyle; dosya başına geçici aşama da aynı kimlik sayısıyla sınırlıdır. Her feedback türünde kimlik başına yalnız en yeni kayıt tutulur; eşit zaman damgalarında deterministik dosya/satır tarama sırasındaki ilk kayıt kalır. Kimlik sınırı aşılırsa ilgili dosyanın aşaması bütünüyle atılır ve sonuç `partial`/`truncated` olur; `stateLimitDroppedRecordCount`, `stateLimitSkippedLineCount` ve `stateLimitExceededFileCount` bilinen atılan kayıtları, dosya sınırından sonra ayrıştırılmayan satırları ve etkilenen dosyaları ayırır. Kısmi sonuç, görülmeyen kayıtlarda daha yeni feedback veya çatışma olmadığını iddia edemez. Bu kayıt/kimlik sayısı sınırıdır; JavaScript heap byte garantisi değildir. `sourceStatus: available` dizinin listelenebildiğini, `snapshot.status` ise `complete`, `partial` veya `unavailable` sonucunu belirtir. Bayt, okuma isteği, bekleyen kayıt, işlenen/atılan kayıt ve gözlenen değişiklik sayaçları yol veya kayıt içeriği olmadan döner. Okuma descriptor’ının boyut sınırından sonraki append verisi dışarıda kalır; gözlenirse sonuç kısmi işaretlenir. Okuma sırasında tespit edilen truncate, rotation, replacement veya silme o dosyanın geçici kayıtlarını düşürür ve sonucu kısmi yapar. LF ile bitmeyen son JSONL kaydı kısmi kabul edilerek atılır; hatalı ve LF ile biten kayıtlar `invalidRecordCount` değerini artırır. Metadata ve descriptor kontrolleri, ekleme protokolüne uymayan veya kontroller arasında aynı dosyayı değiştiren yazarlara karşı atomik snapshot garantisi vermez.

## Mimari dokümanlar

Bu private kaynak checkout’unda dört plan kendi kaynak konumlarındadır. Public yayın planı seçilmiş kopyaları docs/architecture altına eşler; bu dışa aktarım dizini burada üretilmez. Ayrıntı [public yayın planındadır](docs/plans/yapilanlar/PUBLIC_YAYIN_PLANI.md).

- [CONTEXT_ORKESTRASYONU_VE_GUVENLI_SECOND_BRAIN_PLANI_2026-08-21.md](docs/plans/yarim-kalanlar/CONTEXT_ORKESTRASYONU_VE_GUVENLI_SECOND_BRAIN_PLANI_2026-08-21.md)
- [MODEL_KIMLIGI_VE_ERISIM_MODU_PLANI.md](docs/plans/yapilanlar/MODEL_KIMLIGI_VE_ERISIM_MODU_PLANI.md)
- [DEEPSEEK_EDIT_PILOT_VE_MIRROR_KARARLILIK_PLANI.md](docs/plans/yapilanlar/DEEPSEEK_EDIT_PILOT_VE_MIRROR_KARARLILIK_PLANI.md)
- [RECENT_RUNS_GOZLEMLENEBILIRLIK_PLANI.md](docs/plans/yapilanlar/RECENT_RUNS_GOZLEMLENEBILIRLIK_PLANI.md)

Bu dokümanlar tarihsel planlardır. Denetlenen her planın başında tarihli durum notu bulunur; güncel doğrulama, plan oluşturma anındaki sabit test veya araç sayıları yerine `npm test` ve CI ile yapılır.

## Sürekli entegrasyon

`.github/workflows/validate.yml`, Windows ve Linux üzerinde Node 22/24 ile `npm ci`, `npm test` ve `npm run verify:ci` çalıştırır. `verify:ci` yerel executable, provider auth veya Vault gerektirmez. Kişisel policy değişikliğinden önce `npm run config:backup`, geri alma için `npm run config:rollback -- <backup>` kullanılır.

## Teşekkür

Mimari yaklaşım [Avenox](https://avenox.lol/) projeleri ve [github.com/avenoxai](https://github.com/avenoxai) depolarından ilham alır.

## Lisans ve katkı

- Lisans: [Apache-2.0](LICENSE)
- Güvenlik açığı bildirimi: [SECURITY.md](SECURITY.md)
- Katkı rehberi: [CONTRIBUTING.md](CONTRIBUTING.md)
