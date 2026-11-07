import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { openKernelFileLock } from "../subagent-bridge/src/services/kernel-file-lock.js";

const environmentNames = [
  "DEEPSEEK_API_KEY",
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_MODEL",
  "ANTHROPIC_DEFAULT_OPUS_MODEL",
  "ANTHROPIC_DEFAULT_SONNET_MODEL",
  "ANTHROPIC_DEFAULT_HAIKU_MODEL",
  "CLAUDE_CODE_SUBAGENT_MODEL",
  "CLAUDE_CODE_EFFORT_LEVEL",
  "ENABLE_TOOL_SEARCH"
];

const managedServerValues = [
  { key: ["mcp_servers", "hades-orchestrator", "command"], value: () => process.execPath },
  { key: ["mcp_servers", "hades-orchestrator", "args"], value: (root) => [path.join(root, "subagent-bridge", "src", "server.js")] },
  { key: ["mcp_servers", "hades-orchestrator", "cwd"], value: (root) => root },
  { key: ["mcp_servers", "hades-orchestrator", "env_vars"], value: () => [...environmentNames] },
  { key: ["mcp_servers", "hades-orchestrator", "startup_timeout_sec"], value: () => 30 },
  { key: ["mcp_servers", "hades-orchestrator", "tool_timeout_sec"], value: () => 3600 },
  { key: ["mcp_servers", "hades-orchestrator", "required"], value: () => true },
  { key: ["mcp_servers", "hades-orchestrator", "env", "SUBAGENT_BRIDGE_TRUSTED_WORKSPACE"], value: (root) => root },
  { key: ["mcp_servers", "hades-orchestrator", "env", "SUBAGENT_BRIDGE_ORCHESTRATOR_APPROVAL"], value: () => "1" }
];

function encodeTomlString(value) {
  return JSON.stringify(value);
}

function renderTomlValue(value) {
  if (typeof value === "string") return encodeTomlString(value);
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return `[${value.map(renderTomlValue).join(", ")}]`;
  throw new Error("Unsupported managed TOML value");
}

function isPathReparsePoint(stat) {
  return stat.isSymbolicLink() || (stat.mode & 0xf000) === 0xa000 || (stat.attributes & 0x400) !== 0;
}

function readPathInformation(filePath, { allowMissing = false, requireDirectory = false } = {}) {
  let stat;
  try {
    stat = fs.lstatSync(filePath);
  } catch (error) {
    if (allowMissing && error.code === "ENOENT") return null;
    throw error;
  }
  if (isPathReparsePoint(stat)) throw new Error("Codex project configuration paths cannot be symlinks or junctions");
  if (requireDirectory && !stat.isDirectory()) throw new Error("Codex project configuration parent is not a directory");
  if (!requireDirectory && (!stat.isFile() || stat.nlink > 1)) throw new Error("Codex project configuration must be a single-link regular file");
  return { dev: stat.dev, ino: stat.ino, size: stat.size, mtimeMs: stat.mtimeMs, mode: stat.mode, nlink: stat.nlink };
}

function parseQuotedKey(source, start) {
  const quote = source[start];
  let index = start + 1;
  let value = "";
  while (index < source.length) {
    const character = source[index];
    if (character === quote) return { value, end: index + 1 };
    if (quote === '"' && character === "\\") {
      const escaped = source[index + 1];
      const replacements = { b: "\b", t: "\t", n: "\n", f: "\f", r: "\r", '"': '"', "\\": "\\" };
      if (Object.hasOwn(replacements, escaped)) {
        value += replacements[escaped];
        index += 2;
        continue;
      }
      const hexLength = escaped === "u" ? 4 : escaped === "U" ? 8 : 0;
      if (hexLength > 0) {
        const digits = source.slice(index + 2, index + 2 + hexLength);
        if (!new RegExp(`^[a-fA-F0-9]{${hexLength}}$`, "u").test(digits)) throw new Error("Unsupported quoted TOML key");
        const codePoint = Number.parseInt(digits, 16);
        if (codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) throw new Error("Invalid Unicode code point in TOML key");
        value += String.fromCodePoint(codePoint);
        index += 2 + hexLength;
        continue;
      }
      throw new Error("Unsupported escape in TOML key");
    }
    value += character;
    index += 1;
  }
  throw new Error("Unterminated TOML key");
}

function parseKeyPath(source) {
  const segments = [];
  let index = 0;
  while (index < source.length) {
    while (/\s/u.test(source[index] || "")) index += 1;
    const start = index;
    let segment;
    if (source[index] === '"' || source[index] === "'") {
      const parsed = parseQuotedKey(source, index);
      segment = parsed.value;
      index = parsed.end;
    } else {
      while (index < source.length && /[A-Za-z0-9_-]/u.test(source[index])) index += 1;
      if (index === start) throw new Error("Unsupported TOML key syntax");
      segment = source.slice(start, index);
    }
    segments.push(segment);
    while (/\s/u.test(source[index] || "")) index += 1;
    if (index === source.length) break;
    if (source[index] !== ".") throw new Error("Unsupported TOML key separator");
    index += 1;
    if (index === source.length) throw new Error("Incomplete dotted TOML key");
  }
  if (segments.length === 0) throw new Error("Empty TOML key");
  return segments;
}

function removeInlineComment(source) {
  const commentIndex = findInlineCommentIndex(source);
  return commentIndex < 0 ? source.trimEnd() : source.slice(0, commentIndex).trimEnd();
}

function findInlineCommentIndex(source) {
  let quote = null;
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quote === '"') {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quote = null;
    } else if (quote === "'") {
      if (character === "'") quote = null;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === "#") {
      return index;
    }
  }
  return -1;
}

function findAssignmentEquals(source) {
  let quote = null;
  let escaped = false;
  let squareDepth = 0;
  let curlyDepth = 0;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quote === '"') {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quote = null;
    } else if (quote === "'") {
      if (character === "'") quote = null;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === "[") squareDepth += 1;
    else if (character === "]") squareDepth -= 1;
    else if (character === "{") curlyDepth += 1;
    else if (character === "}") curlyDepth -= 1;
    else if (character === "=" && squareDepth === 0 && curlyDepth === 0) return index;
  }
  return -1;
}

class TomlValueReader {
  constructor(source) {
    this.source = source;
    this.index = 0;
  }

  skipWhitespace() {
    while (/\s/u.test(this.source[this.index] || "")) this.index += 1;
  }

  readString() {
    const quote = this.source[this.index];
    this.index += 1;
    let value = "";
    while (this.index < this.source.length) {
      const character = this.source[this.index];
      if (character === quote) {
        this.index += 1;
        return value;
      }
      if (quote === '"' && character === "\\") {
        const escaped = this.source[this.index + 1];
        const replacements = { b: "\b", t: "\t", n: "\n", f: "\f", r: "\r", '"': '"', "\\": "\\" };
        if (Object.hasOwn(replacements, escaped)) {
          value += replacements[escaped];
          this.index += 2;
          continue;
        }
        const hexLength = escaped === "u" ? 4 : escaped === "U" ? 8 : 0;
        if (hexLength > 0) {
          const digits = this.source.slice(this.index + 2, this.index + 2 + hexLength);
          if (!new RegExp(`^[a-fA-F0-9]{${hexLength}}$`, "u").test(digits)) throw new Error("Invalid Unicode escape in TOML value");
          const codePoint = Number.parseInt(digits, 16);
          if (codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) throw new Error("Invalid Unicode code point in TOML value");
          value += String.fromCodePoint(codePoint);
          this.index += 2 + hexLength;
          continue;
        }
        throw new Error("Unsupported escape in TOML value");
      }
      if (character === "\n" || character === "\r") throw new Error("Multiline TOML strings are not supported by the safe project updater");
      value += character;
      this.index += 1;
    }
    throw new Error("Unterminated TOML string");
  }

  readArray() {
    this.index += 1;
    const values = [];
    this.skipWhitespace();
    if (this.source[this.index] === "]") {
      this.index += 1;
      return values;
    }
    while (this.index < this.source.length) {
      values.push(this.readValue());
      this.skipWhitespace();
      if (this.source[this.index] === "]") {
        this.index += 1;
        return values;
      }
      if (this.source[this.index] !== ",") throw new Error("Invalid TOML array separator");
      this.index += 1;
      this.skipWhitespace();
      if (this.source[this.index] === "]") {
        this.index += 1;
        return values;
      }
    }
    throw new Error("Unterminated TOML array");
  }

  readInlineTable() {
    this.index += 1;
    const values = {};
    this.skipWhitespace();
    if (this.source[this.index] === "}") {
      this.index += 1;
      return values;
    }
    while (this.index < this.source.length) {
      const keyStart = this.index;
      let quote = null;
      let escaped = false;
      while (this.index < this.source.length) {
        const character = this.source[this.index];
        if (quote === '"') {
          if (escaped) escaped = false;
          else if (character === "\\") escaped = true;
          else if (character === '"') quote = null;
        } else if (quote === "'") {
          if (character === "'") quote = null;
        } else if (character === '"' || character === "'") quote = character;
        else if (character === "=") break;
        this.index += 1;
      }
      if (this.source[this.index] !== "=") throw new Error("Invalid TOML inline table key");
      const keySegments = parseKeyPath(this.source.slice(keyStart, this.index).trim());
      this.index += 1;
      this.skipWhitespace();
      const value = this.readValue();
      const key = keySegments.join(".");
      if (Object.hasOwn(values, key)) throw new Error("Duplicate TOML inline table key");
      values[key] = value;
      this.skipWhitespace();
      if (this.source[this.index] === "}") {
        this.index += 1;
        return values;
      }
      if (this.source[this.index] !== ",") throw new Error("Invalid TOML inline table separator");
      this.index += 1;
      this.skipWhitespace();
    }
    throw new Error("Unterminated TOML inline table");
  }

  readValue() {
    this.skipWhitespace();
    const character = this.source[this.index];
    if (character === '"' || character === "'") return this.readString();
    if (character === "[") return this.readArray();
    if (character === "{") return this.readInlineTable();
    const start = this.index;
    while (this.index < this.source.length && !/[\s,\]}]/u.test(this.source[this.index])) this.index += 1;
    const token = this.source.slice(start, this.index);
    if (token === "true") return true;
    if (token === "false") return false;
    if (/^[+-]?(?:0|[1-9](?:_?\d)*)(?:\.\d(?:_?\d)*)?(?:[eE][+-]?\d(?:_?\d)*)?$/u.test(token)
      || /^0[xX][0-9a-fA-F](?:_?[0-9a-fA-F])*$/u.test(token)
      || /^0[oO][0-7](?:_?[0-7])*$/u.test(token)
      || /^0[bB][01](?:_?[01])*$/u.test(token)) {
      const numericValue = Number(token.replaceAll("_", ""));
      if (!Number.isFinite(numericValue) || (Number.isInteger(numericValue) && !Number.isSafeInteger(numericValue))) {
        throw new Error("TOML numeric value exceeds the safe comparison range");
      }
      return numericValue;
    }
    if (/^[+-]?(?:inf|nan)$/u.test(token)) return { tomlSpecialFloat: token };
    const temporal = parseTomlTemporal(token);
    if (temporal) return temporal;
    throw new Error("Unsupported or invalid TOML value");
  }

  read() {
    const value = this.readValue();
    this.skipWhitespace();
    if (this.index !== this.source.length) throw new Error("Trailing TOML value content");
    return value;
  }
}

function parseTomlValue(source) {
  return new TomlValueReader(source).read();
}

function validTomlDate(year, month, day) {
  if (year < 1 || month < 1 || month > 12) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthLengths = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= monthLengths[month - 1];
}

function validTomlTime(hour, minute, second) {
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 && second >= 0 && second <= 60;
}

function parseTomlTemporal(token) {
  const date = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(token);
  if (date) {
    if (!validTomlDate(Number(date[1]), Number(date[2]), Number(date[3]))) throw new Error("Invalid TOML calendar date");
    return { tomlTemporal: token };
  }
  const dateTime = /^(\d{4})-(\d{2})-(\d{2})[Tt ](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(?:[Zz]|([+-])(\d{2}):(\d{2}))?$/u.exec(token);
  if (dateTime) {
    const validDate = validTomlDate(Number(dateTime[1]), Number(dateTime[2]), Number(dateTime[3]));
    const validTime = validTomlTime(Number(dateTime[4]), Number(dateTime[5]), Number(dateTime[6]));
    const validOffset = dateTime[8] === undefined
      || (Number(dateTime[9]) <= 23 && Number(dateTime[10]) <= 59);
    if (!validDate || !validTime || !validOffset) throw new Error("Invalid TOML offset date-time");
    return { tomlTemporal: token };
  }
  const localTime = /^(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?$/u.exec(token);
  if (localTime) {
    if (!validTomlTime(Number(localTime[1]), Number(localTime[2]), Number(localTime[3]))) throw new Error("Invalid TOML local time");
    return { tomlTemporal: token };
  }
  return null;
}

function parseTableHeader(source) {
  const clean = removeInlineComment(source).trim();
  const arrayTable = clean.startsWith("[[") && clean.endsWith("]]" );
  const ordinaryTable = clean.startsWith("[") && clean.endsWith("]") && !arrayTable;
  if (!arrayTable && !ordinaryTable) throw new Error("Unsupported TOML table header");
  const inner = clean.slice(arrayTable ? 2 : 1, arrayTable ? -2 : -1);
  return { path: parseKeyPath(inner), arrayTable };
}

function splitLines(text) {
  const lines = [];
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  if (text.includes("\r\n") && text.replace(/\r\n/gu, "").includes("\n")) throw new Error("Mixed TOML line endings are unsupported");
  let offset = 0;
  while (offset < text.length) {
    const next = text.indexOf("\n", offset);
    if (next < 0) {
      lines.push({ text: text.slice(offset), newline: "" });
      break;
    }
    const hasCarriageReturn = next > offset && text[next - 1] === "\r";
    lines.push({ text: text.slice(offset, hasCarriageReturn ? next - 1 : next), newline: hasCarriageReturn ? "\r\n" : "\n" });
    offset = next + 1;
  }
  if (text.length === 0) lines.push({ text: "", newline: "" });
  return { lines, newline };
}

function valueCompletionState(source) {
  let quote = null;
  let escaped = false;
  let squareDepth = 0;
  let curlyDepth = 0;
  for (const character of source) {
    if (quote === '"') {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quote = null;
    } else if (quote === "'") {
      if (character === "'") quote = null;
    } else if (character === '"' || character === "'") quote = character;
    else if (character === "[") squareDepth += 1;
    else if (character === "]") squareDepth -= 1;
    else if (character === "{") curlyDepth += 1;
    else if (character === "}") curlyDepth -= 1;
    if (squareDepth < 0 || curlyDepth < 0) throw new Error("Unbalanced TOML value delimiters");
  }
  return { complete: quote === null && squareDepth === 0 && curlyDepth === 0, quote, squareDepth, curlyDepth };
}

function parseTomlDocument(text) {
  const hasBom = text.charCodeAt(0) === 0xfeff;
  const source = hasBom ? text.slice(1) : text;
  const { lines } = splitLines(source);
  const tables = new Map();
  const assignments = new Map();
  let currentTable = [];
  let arrayTableCounts = new Map();
  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].text.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
    const cleanLine = removeInlineComment(lines[index].text).trim();
    if (cleanLine.startsWith("[")) {
      const header = parseTableHeader(cleanLine);
      const tableKey = header.path.join("\u0000");
      const count = arrayTableCounts.get(tableKey) || 0;
      if (!header.arrayTable && tables.has(tableKey)) throw new Error("Duplicate TOML table");
      if (header.arrayTable) arrayTableCounts.set(tableKey, count + 1);
      else tables.set(tableKey, { path: header.path, lineStart: index, lineEnd: null });
      for (const table of tables.values()) {
        if (table.lineEnd === null && table.lineStart < index) table.lineEnd = index;
      }
      currentTable = header.arrayTable ? [...header.path.slice(0, -1), `${header.path.at(-1)}#${count}`] : header.path;
      continue;
    }
    const firstLineClean = removeInlineComment(lines[index].text);
    const equalsIndex = findAssignmentEquals(firstLineClean);
    if (equalsIndex < 1) throw new Error("Unsupported TOML statement");
    const keySource = firstLineClean.slice(0, equalsIndex).trim();
    const keyPath = parseKeyPath(keySource);
    const valueStart = equalsIndex + 1;
    let valueSource = firstLineClean.slice(valueStart).trim();
    const lineStart = index;
    const commentIndex = findInlineCommentIndex(lines[index].text);
    const valuePrefix = lines[index].text.slice(valueStart).match(/^\s*/u)?.[0] || "";
    let completion = valueCompletionState(valueSource);
    while (!completion.complete && index + 1 < lines.length) {
      index += 1;
      const nextClean = removeInlineComment(lines[index].text);
      valueSource += `\n${nextClean.trim()}`;
      completion = valueCompletionState(valueSource);
    }
    if (!completion.complete) throw new Error("Incomplete TOML value");
    const parsedValue = parseTomlValue(valueSource);
    const absolutePath = [...currentTable, ...keyPath];
    const absoluteKey = absolutePath.join("\u0000");
    if (assignments.has(absoluteKey)) throw new Error("Duplicate TOML key");
    assignments.set(absoluteKey, {
      key: absolutePath,
      value: parsedValue,
      lineStart,
      lineEnd: index,
      prefix: `${lines[lineStart].text.slice(0, equalsIndex + 1)}${valuePrefix}`,
      inlineComment: commentIndex < 0 ? "" : lines[lineStart].text.slice(commentIndex).trimEnd()
    });
  }
  for (const table of tables.values()) if (table.lineEnd === null) table.lineEnd = lines.length;
  for (const assignment of assignments.values()) {
    for (const table of tables.values()) {
      if (assignment.key.length <= table.path.length
        && assignment.key.every((segment, index) => segment === table.path[index])) {
        throw new Error("TOML key conflicts with an explicit table");
      }
    }
  }
  return { source, hasBom, lines, tables, assignments };
}

function getManagedValues(projectRoot) {
  return managedServerValues.map(({ key, value }) => ({ key, value: value(projectRoot) }));
}

function keyId(key) {
  return key.join("\u0000");
}

function createConfigurationPath(projectRoot) {
  const realProjectRoot = fs.realpathSync(projectRoot);
  const codexDirectory = path.join(realProjectRoot, ".codex");
  const configurationPath = path.join(codexDirectory, "config.toml");
  const serverPath = path.join(realProjectRoot, "subagent-bridge", "src", "server.js");
  if (!fs.statSync(serverPath).isFile()) throw new Error("Hades MCP server entrypoint is missing");
  return { projectRoot: realProjectRoot, codexDirectory, configurationPath };
}

function readConfiguration(planPaths) {
  const parentInfo = readPathInformation(planPaths.codexDirectory, { allowMissing: true, requireDirectory: true });
  if (parentInfo === null) return { exists: false, bytes: Buffer.alloc(0), identity: null, text: "" };
  const identity = readPathInformation(planPaths.configurationPath, { allowMissing: true });
  if (identity === null) return { exists: false, bytes: Buffer.alloc(0), identity: null, text: "" };
  const bytes = fs.readFileSync(planPaths.configurationPath);
  const text = bytes.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(bytes)) throw new Error("Codex TOML configuration is not valid UTF-8");
  return { exists: true, bytes, identity, text };
}

function existingManagedValues(parsed) {
  return new Map([...parsed.assignments.entries()].filter(([, assignment]) => assignment.key[0] === "mcp_servers" && assignment.key[1] === "hades-orchestrator"));
}

function createPlan(projectRoot) {
  const planPaths = createConfigurationPath(projectRoot);
  const configuration = readConfiguration(planPaths);
  const parsed = parseTomlDocument(configuration.text);
  const desiredValues = getManagedValues(planPaths.projectRoot);
  const currentValues = existingManagedValues(parsed);
  const changes = desiredValues.map(({ key, value }) => {
    const current = currentValues.get(keyId(key));
    return { key: key.slice(2).join("."), operation: current === undefined ? "add" : JSON.stringify(current.value) === JSON.stringify(value) ? "match" : "update" };
  });
  const unknownFields = [...currentValues.values()]
    .filter((assignment) => !desiredValues.some((entry) => keyId(entry.key) === keyId(assignment.key)))
    .map((assignment) => assignment.key.slice(2).join("."));
  return {
    ...planPaths,
    originalExists: configuration.exists,
    originalBytes: configuration.bytes,
    originalHash: crypto.createHash("sha256").update(configuration.bytes).digest("hex"),
    originalIdentity: configuration.identity,
    parsed,
    desiredValues,
    changes,
    unknownFields,
    nextBytes: null
  };
}

function hasPathCollision(parsed, managedKey) {
  return parsed.tables.has(managedKey.join("\u0000"))
    || [...parsed.assignments.values()].some((assignment) => assignment.key.length < managedKey.length
      && managedKey.slice(0, assignment.key.length).every((segment, index) => segment === assignment.key[index]));
}

function createNextText(plan) {
  const { parsed, desiredValues, newline } = { ...plan, newline: plan.originalBytes.includes(Buffer.from("\r\n")) ? "\r\n" : "\n" };
  for (const entry of desiredValues) {
    if (hasPathCollision(parsed, entry.key)) throw new Error("Managed Hades MCP keys conflict with an existing TOML value or table");
  }
  const existingValues = existingManagedValues(parsed);
  const lines = parsed.lines.map((line) => ({ ...line }));
  const replacements = [];
  const additionsByTable = new Map();
  const tableKeys = [
    ["mcp_servers", "hades-orchestrator"],
    ["mcp_servers", "hades-orchestrator", "env"]
  ];
  for (const entry of desiredValues) {
    const existing = existingValues.get(keyId(entry.key));
    if (existing && JSON.stringify(existing.value) === JSON.stringify(entry.value)) continue;
    const rendered = `${existing?.prefix || `${"  ".repeat(Math.max(0, entry.key.length - 3))}${entry.key.at(-1)} = `}${renderTomlValue(entry.value)}${existing?.inlineComment ? ` ${existing.inlineComment}` : ""}`;
    if (existing) {
      if (existing.lineEnd !== existing.lineStart) throw new Error("Cannot safely update a multiline managed TOML value");
      replacements.push({ start: existing.lineStart, end: existing.lineEnd, value: [{ text: rendered, newline }] });
      continue;
    }
    const tableKey = entry.key.slice(0, -1);
    const identity = keyId(tableKey);
    if (!additionsByTable.has(identity)) additionsByTable.set(identity, []);
    additionsByTable.get(identity).push({ text: `${"  ".repeat(Math.max(0, entry.key.length - 3))}${entry.key.at(-1)} = ${renderTomlValue(entry.value)}`, newline });
  }
  for (const replacement of replacements.sort((left, right) => right.start - left.start)) {
    lines.splice(replacement.start, replacement.end - replacement.start + 1, ...replacement.value);
  }
  const reparsedLines = parseTomlDocument(lines.map((line) => line.text + line.newline).join(""));
  const tableLines = new Map(tableKeys.map((key) => [keyId(key), reparsedLines.tables.get(keyId(key))]));
  const mainTableKey = keyId(tableKeys[0]);
  const envTableKey = keyId(tableKeys[1]);
  if (!tableLines.get(mainTableKey)) {
    if (tableLines.get(envTableKey)) throw new Error("Hades MCP env table exists without its parent table");
    const currentText = parsed.source;
    const separator = currentText.length === 0 ? "" : currentText.endsWith(newline) ? newline : `${newline}${newline}`;
    return `${parsed.hasBom ? "\ufeff" : ""}${currentText}${separator}${renderManagedBlock(plan.projectRoot, newline)}${newline}`;
  }
  const orderedAdditions = [...additionsByTable.entries()].sort((left, right) => {
    const leftLine = tableLines.get(left[0])?.lineStart ?? -1;
    const rightLine = tableLines.get(right[0])?.lineStart ?? -1;
    return rightLine - leftLine;
  });
  for (const [tableIdentity, additions] of orderedAdditions) {
    const table = tableLines.get(tableIdentity);
    if (!table) continue;
    const nextHeaderIndex = lines.findIndex((line, index) => index > table.lineStart && /^\s*\[\[?[^\]]+\]\]?\s*(?:#.*)?$/u.test(line.text));
    const insertionIndex = nextHeaderIndex >= 0 ? nextHeaderIndex : lines.length;
    const existingTail = lines.slice(Math.max(table.lineStart + 1, insertionIndex - 1), insertionIndex).some((line) => line.text.trim().length > 0);
    const prefix = existingTail && insertionIndex > 0 ? [{ text: "", newline }] : [];
    lines.splice(insertionIndex, 0, ...prefix, ...additions);
  }
  if (!tableLines.get(envTableKey)) {
    const envValues = desiredValues.filter((entry) => entry.key.length === 4);
    if (envValues.length > 0) {
      if (lines.length > 0 && lines.at(-1).text.trim() !== "") lines.push({ text: "", newline });
      lines.push({ text: `[mcp_servers.hades-orchestrator.env]`, newline });
      for (const entry of envValues) lines.push({ text: `${entry.key.at(-1)} = ${renderTomlValue(entry.value)}`, newline });
    }
  }
  if (lines.length > 0 && !parsed.source.endsWith("\n")) lines[lines.length - 1].newline = "";
  const result = lines.map((line) => line.text + line.newline).join("");
  parseTomlDocument(result);
  return `${parsed.hasBom ? "\ufeff" : ""}${result}`;
}

function renderManagedBlock(projectRoot, newline) {
  const entries = getManagedValues(projectRoot);
  const baseEntries = entries.filter((entry) => entry.key.length === 3);
  const environmentEntries = entries.filter((entry) => entry.key.length === 4);
  return [
    "[mcp_servers.hades-orchestrator]",
    ...baseEntries.map((entry) => `${entry.key.at(-1)} = ${renderTomlValue(entry.value)}`),
    "",
    "[mcp_servers.hades-orchestrator.env]",
    ...environmentEntries.map((entry) => `${entry.key.at(-1)} = ${renderTomlValue(entry.value)}`)
  ].join(newline);
}

function configurationSummary(plan, action, status) {
  return {
    ok: status === "ready" || status === "written" || status === "unchanged",
    action,
    projectMcpReady: status === "ready" || status === "unchanged",
    status,
    checks: {
      projectConfigPath: "verified",
      tomlSyntax: "verified",
      serverEntrypoint: "verified",
      managedHadesEntry: status === "ready" || status === "unchanged" ? "matches" : "needs_update",
      userGlobalConfig: "not_read"
    },
    changes: plan.changes,
    preservedUnknownHadesFieldCount: plan.unknownFields.length
  };
}

export function inspectCodexProjectConfiguration(projectRoot) {
  const plan = createPlan(projectRoot);
  const needsWrite = plan.changes.some((change) => change.operation !== "match");
  return configurationSummary(plan, "check", needsWrite ? "needs_update" : "ready");
}

export function prepareCodexProjectConfiguration(projectRoot) {
  const plan = createPlan(projectRoot);
  plan.nextBytes = Buffer.from(createNextText(plan), "utf8");
  return plan;
}

function fileInformationMatches(expected, actual) {
  return expected === null ? actual === null : actual !== null
    && expected.dev === actual.dev
    && expected.ino === actual.ino
    && expected.size === actual.size
    && expected.mtimeMs === actual.mtimeMs
    && expected.nlink === actual.nlink;
}

function assertConfigurationUnchanged(plan) {
  const latest = readConfiguration(plan);
  if (!fileInformationMatches(plan.originalIdentity, latest.identity)
    || crypto.createHash("sha256").update(latest.bytes).digest("hex") !== plan.originalHash) {
    throw new Error("Codex project configuration changed while the update was being prepared");
  }
}

function createBackup(plan) {
  if (!plan.originalExists) return null;
  const backupDirectory = path.join(plan.codexDirectory, ".local-config-backups");
  const backupDirectoryInfo = readPathInformation(backupDirectory, { allowMissing: true, requireDirectory: true });
  if (backupDirectoryInfo === null) fs.mkdirSync(backupDirectory);
  readPathInformation(backupDirectory, { requireDirectory: true });
  const backupPath = path.join(backupDirectory, `config.toml.${Date.now()}.${crypto.randomUUID()}.bak`);
  fs.copyFileSync(plan.configurationPath, backupPath, fs.constants.COPYFILE_EXCL);
  const backupBytes = fs.readFileSync(backupPath);
  if (!backupBytes.equals(plan.originalBytes)) {
    fs.rmSync(backupPath, { force: true });
    throw new Error("Codex project configuration backup verification failed");
  }
  return backupPath;
}

async function acquireConfigurationLock(lockPath) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const lock = openKernelFileLock(lockPath);
    if (lock) return lock;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Codex project configuration lock unavailable");
}

function writeAtomically(plan, bytes) {
  const temporaryPath = `${plan.configurationPath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  let descriptor;
  let published = false;
  try {
    descriptor = fs.openSync(temporaryPath, "wx", 0o600);
    fs.writeFileSync(descriptor, bytes);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    assertConfigurationUnchanged(plan);
    createBackup(plan);
    if (plan.originalExists) fs.renameSync(temporaryPath, plan.configurationPath);
    else fs.linkSync(temporaryPath, plan.configurationPath);
    published = true;
    if (!plan.originalExists) fs.unlinkSync(temporaryPath);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (!published) fs.rmSync(temporaryPath, { force: true });
  }
}

export async function publishCodexProjectConfiguration(plan) {
  const needsWrite = !plan.originalBytes.equals(plan.nextBytes);
  if (!needsWrite) return configurationSummary(plan, "write", "unchanged");
  fs.mkdirSync(plan.codexDirectory, { recursive: true });
  readPathInformation(plan.codexDirectory, { requireDirectory: true });
  const lock = await acquireConfigurationLock(path.join(plan.codexDirectory, "config.toml.lock"));
  try {
    assertConfigurationUnchanged(plan);
    writeAtomically(plan, plan.nextBytes);
  } finally {
    if (!lock.release()) throw new Error("Codex project configuration lock release is uncertain");
  }
  return configurationSummary(plan, "write", "written");
}

export async function applyCodexProjectConfiguration(projectRoot) {
  return publishCodexProjectConfiguration(prepareCodexProjectConfiguration(projectRoot));
}

export function getCodexProjectRoot(scriptPath) {
  return fs.realpathSync(path.resolve(path.dirname(scriptPath), ".."));
}
