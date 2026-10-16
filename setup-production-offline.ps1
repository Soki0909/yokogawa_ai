$ErrorActionPreference = 'Stop'
$projectDirectory = $PSScriptRoot
function Get-ProductionSha256([string]$file) {
  $stream = [System.IO.File]::OpenRead($file)
  $algorithm = [System.Security.Cryptography.SHA256]::Create()
  try { return [System.BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() } finally { $stream.Dispose(); $algorithm.Dispose() }
}
function Get-ProductionTextSha256([string]$file) {
  $text = [System.IO.File]::ReadAllText($file).Replace("`r`n", "`n")
  $algorithm = [System.Security.Cryptography.SHA256]::Create()
  try { return [System.BitConverter]::ToString($algorithm.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($text))).Replace('-', '').ToLowerInvariant() } finally { $algorithm.Dispose() }
}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$manifest = Get-Content -LiteralPath (Join-Path $projectDirectory 'vendor/runtime-manifest.json') -Raw | ConvertFrom-Json
foreach ($entry in $manifest.archives) {
  $archivePath = Join-Path $projectDirectory $entry.file
  if ((Get-ProductionSha256 $archivePath) -ne $entry.sha256) { throw "Archive SHA256 mismatch: $($entry.file)" }
}
if ((Get-ProductionTextSha256 (Join-Path $projectDirectory 'package-lock.json')) -ne $manifest.packageLockSha256) { throw 'package-lock changed. Rebuild the offline dependency archive before using this setup.' }
$runtimeDirectory = Join-Path $projectDirectory '.runtime'
$nodePath = Join-Path $runtimeDirectory 'node-v22.15.0-win-x64/node.exe'
if (-not (Test-Path -LiteralPath $nodePath)) { [System.IO.Compression.ZipFile]::ExtractToDirectory((Join-Path $projectDirectory 'vendor/node-v22.15.0-win-x64.zip'), $runtimeDirectory) }
$dependenciesDirectory = Join-Path $projectDirectory 'node_modules'
$stamp = Join-Path $dependenciesDirectory '.yokogawa-offline.sha256'
$dependencyHash = ($manifest.archives | Where-Object { $_.file -eq 'vendor/production-node-modules.zip' }).sha256
if (Test-Path -LiteralPath $dependenciesDirectory) {
  if (-not (Test-Path -LiteralPath $stamp) -or (Get-Content -LiteralPath $stamp -Raw).Trim() -ne $dependencyHash) { throw 'Existing node_modules is preserved. Run this setup in a fresh project folder.' }
} else {
  [System.IO.Compression.ZipFile]::ExtractToDirectory((Join-Path $projectDirectory 'vendor/production-node-modules.zip'), $projectDirectory)
  [System.IO.File]::WriteAllText($stamp, $dependencyHash)
}
& $nodePath --version
Push-Location $projectDirectory
try { & $nodePath scripts/verify-production-portability.mjs; if ($LASTEXITCODE -ne 0) { throw 'Production portability verification failed' } } finally { Pop-Location }
Write-Host 'Offline setup complete. Run start-yokogawa-ai-single-pc.cmd.'
