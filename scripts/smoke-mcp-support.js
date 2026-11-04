import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const syntheticSmokeQuery = "hades-smoke-fixture-2026-11-03";
const temporaryRootPrefix = "hades-mcp-smoke-";
const inheritedSystemEnvironmentNames = new Set(["comspec", "pathext", "path", "systemroot", "windir"]);

function createSyntheticSmokeBaseEnvironment(inheritedEnvironment) {
  return Object.fromEntries(Object.entries(inheritedEnvironment).filter(([name]) => inheritedSystemEnvironmentNames.has(name.toLowerCase())));
}

export function parseSmokeMode(argumentsList) {
  if (argumentsList.length === 0) return "synthetic";
  if (argumentsList.length === 2 && argumentsList[0] === "--real-vault" && argumentsList[1] === "--confirm-real-vault-read") return "real-vault";
  throw new Error("Use no arguments for synthetic smoke or both explicit real-Vault confirmation flags.");
}

export function createSmokeExecutionContext(argumentsList, projectRoot, inheritedEnvironment = process.env) {
  const mode = parseSmokeMode(argumentsList);
  if (mode === "real-vault") {
    return {
      mode,
      smokeRoot: null,
      parallelBatchEnabled: null,
      environment: {
        ...inheritedEnvironment,
        SUBAGENT_BRIDGE_TRUSTED_WORKSPACE: path.resolve(projectRoot),
        SUBAGENT_BRIDGE_ORCHESTRATOR_APPROVAL: ""
      }
    };
  }

  const smokeRoot = fs.mkdtempSync(path.join(os.tmpdir(), temporaryRootPrefix));
  try {
    const syntheticEnvironment = createSyntheticSmokeEnvironment(projectRoot, smokeRoot, createSyntheticSmokeBaseEnvironment(inheritedEnvironment));
    return {
      mode,
      smokeRoot,
      parallelBatchEnabled: syntheticEnvironment.parallelBatchEnabled,
      ...syntheticEnvironment
    };
  } catch (error) {
    removeSyntheticSmokeRoot(smokeRoot);
    throw error;
  }
}

export function createSyntheticSmokeEnvironment(projectRoot, smokeRoot, inheritedEnvironment = process.env) {
  const resolvedProjectRoot = path.resolve(projectRoot);
  const resolvedSmokeRoot = path.resolve(smokeRoot);
  const resolvedTemporaryRoot = path.resolve(os.tmpdir());
  if (path.dirname(resolvedSmokeRoot) !== resolvedTemporaryRoot || !path.basename(resolvedSmokeRoot).startsWith(temporaryRootPrefix)) {
    throw new Error("Synthetic smoke root must be a task-owned direct child of the system temporary directory.");
  }

  const vaultRoot = path.join(resolvedSmokeRoot, "vault");
  const profileRoot = path.join(resolvedSmokeRoot, "profile");
  const localAppDataRoot = path.join(profileRoot, "AppData", "Local");
  const configurationDirectory = path.join(resolvedSmokeRoot, "configuration");
  fs.mkdirSync(path.join(vaultRoot, "03_Resources"), { recursive: true });
  fs.mkdirSync(configurationDirectory, { recursive: true });

  const configuration = JSON.parse(fs.readFileSync(path.join(resolvedProjectRoot, "config", "policy.json"), "utf8"));
  configuration.memory.vaultRoot = vaultRoot;
  const configurationPath = path.join(configurationDirectory, "policy.json");
  const agentsConfigurationPath = path.join(configurationDirectory, "agents.json");
  fs.writeFileSync(configurationPath, `${JSON.stringify(configuration, null, 2)}\n`, "utf8");
  fs.copyFileSync(path.join(resolvedProjectRoot, "config", "agents.json"), agentsConfigurationPath);

  const fixturePath = path.join(vaultRoot, "03_Resources", "Smoke.md");
  const fixtureContents = [
    "---",
    'title: "Synthetic MCP smoke fixture"',
    'created: "2026-11-03T00:00:00.000Z"',
    'updated: "2026-11-03T00:00:00.000Z"',
    'confidence: "high"',
    'verification: "verified"',
    'stage: "published"',
    "---",
    "",
    "# Synthetic MCP smoke fixture",
    "",
    syntheticSmokeQuery,
    ""
  ].join("\n");
  fs.writeFileSync(fixturePath, fixtureContents, "utf8");

  const profileRootString = path.resolve(profileRoot);
  const drive = path.parse(profileRootString).root.slice(0, 2);
  const homePath = profileRootString.slice(2);
  const environment = {
    ...inheritedEnvironment,
    ORCHESTRATOR_CONFIG: configurationPath,
    SUBAGENT_BRIDGE_AGENTS_CONFIG: agentsConfigurationPath,
    SUBAGENT_BRIDGE_TRUSTED_WORKSPACE: resolvedProjectRoot,
    USERPROFILE: profileRootString,
    HOME: profileRootString,
    HOMEDRIVE: drive,
    HOMEPATH: homePath,
    APPDATA: path.join(profileRootString, "AppData", "Roaming"),
    LOCALAPPDATA: localAppDataRoot,
    TEMP: resolvedSmokeRoot,
    TMP: resolvedSmokeRoot,
    SUBAGENT_BRIDGE_ORCHESTRATOR_APPROVAL: ""
  };

  return {
    environment,
    vaultRoot,
    fixturePath,
    configurationPath,
    agentsConfigurationPath,
    parallelBatchEnabled: configuration.parallelBatch?.enabled === true
  };
}

export function removeSyntheticSmokeRoot(smokeRoot) {
  const resolvedSmokeRoot = path.resolve(smokeRoot);
  const resolvedTemporaryRoot = path.resolve(os.tmpdir());
  if (path.dirname(resolvedSmokeRoot) !== resolvedTemporaryRoot || !path.basename(resolvedSmokeRoot).startsWith(temporaryRootPrefix)) {
    throw new Error("Refusing to remove a path outside the task-owned smoke temporary directory.");
  }
  const rootInformation = fs.lstatSync(resolvedSmokeRoot);
  if (!rootInformation.isDirectory() || rootInformation.isSymbolicLink()) {
    throw new Error("Refusing to remove a synthetic smoke root that is not a regular directory.");
  }
  fs.rmSync(resolvedSmokeRoot, { recursive: true, force: true });
}
