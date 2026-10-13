$ErrorActionPreference = "Stop"

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = if ($env:HAMMER_MCP_REPO) { $env:HAMMER_MCP_REPO } else { Split-Path -Parent $here }
$venv = Join-Path $repoRoot ".hammer-mcp\sidecar-venv"
$python = Join-Path $venv "Scripts\python.exe"

if (-not (Test-Path -LiteralPath $python)) {
    Write-Host "creating venv: $venv"
    & python -m venv $venv
}

& $python -m pip install --quiet --upgrade pip
& $python -m pip install --quiet -r (Join-Path $here "requirements.txt")

Write-Host -NoNewline "sidecar ready: "
& $python (Join-Path $here "main.py") health
