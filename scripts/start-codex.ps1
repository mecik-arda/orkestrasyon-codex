$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$serverEntryPoint = Join-Path $projectRoot "subagent-bridge\src\server.js"

foreach ($requiredExecutable in @("node", "git")) {
  $resolvedExecutable = Get-Command -Name $requiredExecutable -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($null -eq $resolvedExecutable) {
    throw "Required executable not found: $requiredExecutable"
  }
}

if (-not (Test-Path -LiteralPath $serverEntryPoint -PathType Leaf)) {
  throw "Hades MCP entrypoint not found: $serverEntryPoint"
}

$codexExecutable = Get-Command -Name "codex" -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
if ($null -eq $codexExecutable) {
  throw "Codex CLI not found. Install Codex CLI and add it to PATH."
}

Set-Location -LiteralPath $projectRoot
$forwardedArguments = @($args)
& $codexExecutable.Source @forwardedArguments
exit $LASTEXITCODE
