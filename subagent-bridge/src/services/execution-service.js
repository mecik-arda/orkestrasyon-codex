import { spawn, execSync } from "node:child_process";
import crypto from "node:crypto";

const platformEnvironmentNames = ["APPDATA", "COMSPEC", "HOME", "LOCALAPPDATA", "NODE_PATH", "NVM_HOME", "NVM_SYMLINK", "PATH", "PATHEXT", "ProgramData", "SystemRoot", "TEMP", "TMP", "USERPROFILE", "WINDIR"];
const providerEnvironmentNames = {
  antigravity: ["ANTHROPIC_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY"],
  claude_code: ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"],
  codex: ["CODEX_HOME", "OPENAI_API_KEY"],
  deepseek: ["DEEPSEEK_API_KEY"]
};

const safeOperatingSystemErrorCodes = new Set(["E2BIG", "EACCES", "EADDRNOTAVAIL", "EAI_AGAIN", "ECONNREFUSED", "ECONNRESET", "EEXIST", "EHOSTUNREACH", "EPIPE", "ETIMEDOUT", "EMFILE", "ENETUNREACH", "ENFILE", "ENAMETOOLONG", "ENOENT", "ENOTDIR", "ENOTFOUND", "EPERM"]);
const processSpawnErrorCodes = new Set(["E2BIG", "EACCES", "EMFILE", "ENAMETOOLONG", "ENFILE", "ENOENT", "ENOTDIR", "EPERM"]);

export const WINDOWS_CREATE_PROCESS_COMMAND_LINE_LIMIT = 32767;

export function calculateWindowsCommandLineUpperBound(executable, args) {
  const argv = [executable, ...args];
  if (argv.some((argument) => typeof argument !== "string")) {
    throw new TypeError("process arguments must be strings for Windows command-line preflight");
  }
  const utf16CodeUnits = argv.reduce((total, argument) => total + argument.length, 0);
  return 2 * utf16CodeUnits + 4 * argv.length;
}

export function assertProcessCommandLineWithinLimit(executable, args, platform = process.platform) {
  if (platform !== "win32") return;
  if (calculateWindowsCommandLineUpperBound(executable, args) <= WINDOWS_CREATE_PROCESS_COMMAND_LINE_LIMIT) return;
  const error = new Error("process command-line budget exceeded");
  error.code = "ENAMETOOLONG";
  error.failureClass = "prompt_transport_limit";
  throw error;
}

export function createProcessFailureDiagnostics(error, overrides = {}) {
  const osErrorCode = safeOperatingSystemErrorCodes.has(error?.code) ? error.code : null;
  const inferredProviderCode = ({
    E2BIG: "prompt_transport_limit",
    EACCES: "permission_denied",
    EAI_AGAIN: "dns_failure",
    EADDRNOTAVAIL: "network_error",
    ECONNREFUSED: "network_error",
    ECONNRESET: "connection_reset",
    ENOENT: "executable_missing",
    ENOTFOUND: "dns_failure",
    ENOTDIR: "executable_missing",
    ENAMETOOLONG: "prompt_transport_limit",
    ENETUNREACH: "network_error",
    EHOSTUNREACH: "network_error",
    EPIPE: "process_error",
    EMFILE: "process_error",
    ENFILE: "process_error",
    EPERM: "permission_denied",
    ETIMEDOUT: "timeout"
  })[osErrorCode] || null;
  const outputLimitBytes = Number.isSafeInteger(overrides.outputLimitBytes) ? overrides.outputLimitBytes : error?.outputLimitBytes;
  const outputBytesObserved = Number.isSafeInteger(overrides.outputBytesObserved) ? overrides.outputBytesObserved : error?.outputBytesObserved;
  const outputLimitStream = ["stdout", "stderr"].includes(overrides.outputLimitStream) ? overrides.outputLimitStream : error?.outputLimitStream;
  const outputLimitScope = ["process", "jsonl_record", "final_result", "http_response_body"].includes(overrides.outputLimitScope) ? overrides.outputLimitScope : error?.outputLimitScope;
  const acceptedStdoutBytes = Number.isSafeInteger(overrides.acceptedStdoutBytes) ? overrides.acceptedStdoutBytes : error?.acceptedStdoutBytes;
  const acceptedStderrBytes = Number.isSafeInteger(overrides.acceptedStderrBytes) ? overrides.acceptedStderrBytes : error?.acceptedStderrBytes;
  const rejectedChunkBytes = Number.isSafeInteger(overrides.rejectedChunkBytes) ? overrides.rejectedChunkBytes : error?.rejectedChunkBytes;
  return {
    failureStage: overrides.failureStage || (processSpawnErrorCodes.has(osErrorCode) ? "process_spawn" : "provider_execution"),
    providerCode: overrides.providerCode || inferredProviderCode || (error ? "process_error" : null),
    ...(osErrorCode ? { osErrorCode } : {}),
    settingsLockWaitMs: Number.isInteger(overrides.settingsLockWaitMs) ? overrides.settingsLockWaitMs : null,
    providerExecutionMs: Number.isInteger(overrides.providerExecutionMs) ? overrides.providerExecutionMs : null,
    ...(Number.isInteger(overrides.providerAdmissionLeaseMs) ? { providerAdmissionLeaseMs: overrides.providerAdmissionLeaseMs } : {}),
    stdoutBytes: Number.isInteger(overrides.stdoutBytes) ? overrides.stdoutBytes : null,
    stderrBytes: Number.isInteger(overrides.stderrBytes) ? overrides.stderrBytes : null,
    ...(Number.isSafeInteger(outputLimitBytes) && outputLimitBytes > 0 ? { outputLimitBytes } : {}),
    ...(Number.isSafeInteger(outputBytesObserved) && outputBytesObserved >= 0 ? { outputBytesObserved } : {}),
    ...(["stdout", "stderr"].includes(outputLimitStream) ? { outputLimitStream } : {}),
    ...(["process", "jsonl_record", "final_result", "http_response_body"].includes(outputLimitScope) ? { outputLimitScope } : {}),
    ...(Number.isSafeInteger(acceptedStdoutBytes) && acceptedStdoutBytes >= 0 ? { acceptedStdoutBytes } : {}),
    ...(Number.isSafeInteger(acceptedStderrBytes) && acceptedStderrBytes >= 0 ? { acceptedStderrBytes } : {}),
    ...(Number.isSafeInteger(rejectedChunkBytes) && rejectedChunkBytes >= 0 ? { rejectedChunkBytes } : {})
  };
}

const policyExcludedEnvironmentNames = new Set(["OPENCODE_CONFIG", "OPENCODE_CONFIG_CONTENT", "ORCHESTRATOR_CONFIG"]);
const policyExcludedEnvironmentPattern = /^SUBAGENT_BRIDGE_/i;

export function createProviderEnvironment(provider, source = process.env) {
  const names = new Set([...platformEnvironmentNames, ...(providerEnvironmentNames[provider] || [])]);
  const entries = [];
  for (const name of names) {
    if (source[name] === undefined) continue;
    if (policyExcludedEnvironmentNames.has(name) || policyExcludedEnvironmentPattern.test(name)) continue;
    entries.push([name, source[name]]);
  }
  return Object.fromEntries(entries);
}

export function createExecutionId() {
  return crypto.randomUUID();
}

export function runProcess(executable, args, options = {}) {
  assertProcessCommandLineWithinLimit(executable, args);
  const timeoutMs = options.timeoutMs ?? 30000;
  const maxOutputBytes = options.maxOutputBytes ?? 8388608;
  const abortController = options.abortController ?? new AbortController();
  const streamingOutputConsumer = options.streamingOutputConsumer || null;
  const streamingOutput = streamingOutputConsumer !== null;

  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: options.cwd,
      env: options.env || createProviderEnvironment(options.provider),
      shell: false,
      windowsHide: true,
      detached: process.platform !== "win32",
      stdio: ["pipe", "pipe", "pipe"]
    });
    const stdoutChunks = [];
    const stderrChunks = [];
    const stdinBytes = options.stdin === undefined ? 0 : Buffer.byteLength(options.stdin, "utf8");
    let stdinWriteStatus = options.stdin === undefined ? "not_used" : "pending";
    let stdinWriteError = null;
    let outputBytes = 0;
    let acceptedStdoutBytes = 0;
    let acceptedStderrBytes = 0;
    let rejectedChunkBytes = 0;
    let settled = false;
    let timedOut = false;
    let forceTerminationTimer = null;
    let abortExecution;

    const attachStreamingDiagnostics = (error) => {
      if (!streamingOutput) return;
      try {
        if (!error.streamResult) {
          error.streamResult = streamingOutputConsumer.snapshot();
        }
        error.acceptedStdoutBytes = acceptedStdoutBytes;
        error.acceptedStderrBytes = acceptedStderrBytes;
        error.rejectedChunkBytes = rejectedChunkBytes;
      } catch {
      }
    };

    const clearTimers = () => {
      clearTimeout(timer);
      if (forceTerminationTimer) clearTimeout(forceTerminationTimer);
    };

    const removeAbortListener = () => {
      if (abortExecution) abortController.signal.removeEventListener("abort", abortExecution);
    };

    const rejectAfterTermination = (error) => {
      if (settled) return;
      settled = true;
      clearTimers();
      removeAbortListener();
      attachStreamingDiagnostics(error);
      try {
        Object.defineProperties(error, {
          stdout: { value: Buffer.concat(stdoutChunks).toString("utf8"), enumerable: false },
          stderr: { value: Buffer.concat(stderrChunks).toString("utf8"), enumerable: false }
        });
      } catch {
      }
      try {
        killProcessTree(child.pid);
      } catch {
      }
      if (process.platform === "win32" && child.exitCode === null && !child.killed) {
        try {
          child.kill("SIGKILL");
        } catch {
        }
      }
      reject(error);
    };

    const timer = setTimeout(() => {
      if (!settled) {
        timedOut = true;
        const timeoutError = new Error(`Process timed out after ${timeoutMs}ms`);
        const gracefulShutdownMs = options.gracefulShutdownMs ?? 0;
        if (process.platform !== "win32" && gracefulShutdownMs > 0 && child.stdin && !child.stdin.destroyed && !child.stdin.writableEnded) {
          child.stdin.end();
          forceTerminationTimer = setTimeout(() => rejectAfterTermination(timeoutError), gracefulShutdownMs);
          forceTerminationTimer.unref?.();
        } else {
          rejectAfterTermination(timeoutError);
        }
      }
    }, timeoutMs);

    abortExecution = () => {
      if (settled) return;
      const abortError = new Error("The operation was aborted");
      abortError.name = "AbortError";
      abortError.code = "ABORT_ERR";
      rejectAfterTermination(abortError);
    };
    abortController.signal.addEventListener("abort", abortExecution, { once: true });

    const collect = (chunks, chunk, stream) => {
      if (settled) return;
      if (outputBytes + chunk.length > maxOutputBytes) {
        rejectedChunkBytes = chunk.length;
        const outputLimitError = new Error(`Process output exceeded limit: ${maxOutputBytes} bytes`);
        outputLimitError.failureClass = "output_limit";
        outputLimitError.outputLimitScope = "process";
        outputLimitError.outputLimitBytes = maxOutputBytes;
        outputLimitError.outputBytesObserved = outputBytes + rejectedChunkBytes;
        outputLimitError.outputLimitStream = stream;
        rejectAfterTermination(outputLimitError);
        return;
      }
      outputBytes += chunk.length;
      if (stream === "stdout") acceptedStdoutBytes += chunk.length;
      else acceptedStderrBytes += chunk.length;
      if (!streamingOutput) chunks.push(chunk);
      try {
        if (stream === "stdout") streamingOutputConsumer?.onStdout(chunk);
        else streamingOutputConsumer?.onStderr(chunk);
      } catch (error) {
        rejectAfterTermination(error);
      }
    };

    child.stdout.on("data", (chunk) => {
      collect(stdoutChunks, chunk, "stdout");
      if (!settled) {
        try {
          options.onStdout?.(chunk);
        } catch (error) {
          rejectAfterTermination(error);
        }
      }
    });
    child.stderr.on("data", (chunk) => {
      collect(stderrChunks, chunk, "stderr");
      if (!settled) {
        try {
          options.onStderr?.(chunk);
        } catch (error) {
          rejectAfterTermination(error);
        }
      }
    });
    child.stdin.on("finish", () => {
      if (!stdinWriteError) stdinWriteStatus = "complete";
    });
    child.stdin.on("error", (error) => {
      stdinWriteError = error;
      stdinWriteStatus = "failed";
      if (options.requireStdinDelivery === true && !settled) {
        const deliveryError = new Error("stdin delivery failed");
        deliveryError.code = error?.code || "EPIPE";
        rejectAfterTermination(deliveryError);
      }
    });
    child.on("error", (error) => {
      if (!settled) {
        settled = true;
        clearTimers();
        removeAbortListener();
        const processError = timedOut ? new Error(`Process timed out after ${timeoutMs}ms`) : error;
        attachStreamingDiagnostics(processError);
        reject(processError);
      }
    });
    child.on("close", (code, signal) => {
      if (!settled) {
        if (timedOut) killProcessTree(child.pid);
        settled = true;
        clearTimers();
        removeAbortListener();
        if (timedOut) {
          const timeoutError = new Error(`Process timed out after ${timeoutMs}ms`);
          attachStreamingDiagnostics(timeoutError);
          reject(timeoutError);
        } else if (options.requireStdinDelivery === true && stdinWriteStatus !== "complete") {
          const deliveryError = new Error("stdin delivery failed");
          deliveryError.code = stdinWriteError?.code || "EPIPE";
          attachStreamingDiagnostics(deliveryError);
          reject(deliveryError);
        } else {
          try {
            const streamResult = streamingOutput ? streamingOutputConsumer.finish() : undefined;
            resolve({
              code,
              signal,
              stdout: Buffer.concat(stdoutChunks).toString("utf8"),
              stderr: Buffer.concat(stderrChunks).toString("utf8"),
              ...(streamingOutput ? { streamResult, acceptedStdoutBytes, acceptedStderrBytes, rejectedChunkBytes } : {}),
              stdinWriteStatus,
              stdinBytes: stdinWriteStatus === "complete" ? stdinBytes : null
            });
          } catch (error) {
            settled = false;
            rejectAfterTermination(error);
          }
        }
      }
    });

    child.on("spawn", () => {
      setImmediate(() => {
        if (settled) {
          killProcessTree(child.pid);
          return;
        }
        try {
          options.onSpawn?.(child);
        } catch (error) {
          rejectAfterTermination(error);
          return;
        }
        if (abortController.signal.aborted) abortExecution();
        if (settled) return;
        if (options.stdin !== undefined) {
          child.stdin.end(options.stdin);
        } else if (options.keepStdinOpen !== true) {
          child.stdin.end();
        }
      });
    });
  });
}

export function killProcessTree(pid) {
  if (process.platform === "win32") {
    try {
      execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
    } catch {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
      }
    }
  } else {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
      }
    }
  }
}

export function createExecutionHandle(executionId) {
  const abortController = new AbortController();
  let childProcess = null;
  let settled = false;

  return {
    executionId,
    abortController,
    attachChild(child) {
      childProcess = child;
    },
    cancel() {
      if (settled) return;
      settled = true;
      if (childProcess) {
        try {
          const pid = childProcess.pid;
          if (pid) killProcessTree(pid);
        } catch {
        }
      }
      abortController.abort();
    },
    isSettled() {
      return settled;
    }
  };
}
