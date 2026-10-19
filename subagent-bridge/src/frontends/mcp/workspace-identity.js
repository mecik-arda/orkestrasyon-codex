import { z } from "zod";
import { fingerprintTrustedWorkspace } from "../../runtime/bridge-runtime.js";

export const WORKSPACE_IDENTITY_URI = "hades://workspace/identity/v1";
export const WORKSPACE_IDENTITY_NAME = "workspace-identity-v1";
export const WORKSPACE_IDENTITY_MIME_TYPE = "application/json";
export const WORKSPACE_IDENTITY_CONTRACT_VERSION = "1";

export const workspaceIdentitySchema = z.object({
  contractVersion: z.literal(WORKSPACE_IDENTITY_CONTRACT_VERSION),
  status: z.literal("verified"),
  sourceClass: z.literal("mcp_resource"),
  hashAlgorithm: z.literal("sha256"),
  processCwdSha256: z.string().regex(/^[a-f0-9]{64}$/),
  trustedWorkspaceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  limitations: z.object({
    privacyGuarantee: z.literal(false),
    cryptographicHostAttestation: z.literal(false),
    startupRulesProven: z.literal(false)
  }).strict()
}).strict();

export class WorkspaceIdentityError extends Error {
  constructor() {
    super("workspace identity unavailable");
    this.name = "WorkspaceIdentityError";
  }
}

export function createWorkspaceIdentity(processCwd, trustedWorkspace) {
  try {
    return workspaceIdentitySchema.parse({
      contractVersion: WORKSPACE_IDENTITY_CONTRACT_VERSION,
      status: "verified",
      sourceClass: "mcp_resource",
      hashAlgorithm: "sha256",
      processCwdSha256: fingerprintTrustedWorkspace(processCwd),
      trustedWorkspaceSha256: fingerprintTrustedWorkspace(trustedWorkspace),
      limitations: {
        privacyGuarantee: false,
        cryptographicHostAttestation: false,
        startupRulesProven: false
      }
    });
  } catch {
    throw new WorkspaceIdentityError();
  }
}
