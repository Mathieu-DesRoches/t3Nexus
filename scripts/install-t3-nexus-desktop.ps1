[CmdletBinding()]
param(
  [string] $BuildVersion,
  [switch] $NoInstall,
  [switch] $Silent,
  [switch] $SkipBuild,
  [switch] $SkipPrerequisiteCheck
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$desktopPackagePath = Join-Path $repoRoot "apps\desktop\package.json"
$releaseDir = Join-Path $repoRoot "release"
$fallbackBunPath = Join-Path $env:USERPROFILE ".bun\bin\bun.exe"

function Resolve-BunPath {
  $command = Get-Command bun -ErrorAction SilentlyContinue
  if ($null -ne $command -and $command.Source -and (Test-Path $command.Source)) {
    return $command.Source
  }

  if (Test-Path $fallbackBunPath) {
    return $fallbackBunPath
  }

  throw "Unable to find bun. Expected it on PATH or at $fallbackBunPath."
}

function Resolve-LocalBuildVersion {
  $desktopPackage = Get-Content -LiteralPath $desktopPackagePath -Raw | ConvertFrom-Json
  $baseVersion = [string] $desktopPackage.version
  if (-not $baseVersion) {
    throw "Could not read apps/desktop package version."
  }

  $stamp = Get-Date -Format "yyyyMMdd't'HHmm"
  $shortSha = ""
  $gitResult = & git -C $repoRoot rev-parse --short=8 HEAD 2>$null
  if ($LASTEXITCODE -eq 0) {
    $shortSha = ([string] $gitResult).Trim()
  }

  if ($shortSha -match '^[0-9a-fA-F]{7,12}$') {
    return "$baseVersion-local.$stamp.$($shortSha.ToLowerInvariant())"
  }

  return "$baseVersion-local.$stamp"
}

function Test-VisualStudioCppBuildTools {
  $programFilesX86 = ${env:ProgramFiles(x86)}
  if ([string]::IsNullOrWhiteSpace($programFilesX86)) {
    return $false
  }

  $vswherePath = Join-Path $programFilesX86 "Microsoft Visual Studio\Installer\vswhere.exe"
  if (-not (Test-Path $vswherePath)) {
    return $false
  }

  $installationPath = & $vswherePath -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null
  return $LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace(([string] $installationPath).Trim())
}

$resolvedBuildVersion = if ($BuildVersion) { $BuildVersion } else { Resolve-LocalBuildVersion }
$bunPath = Resolve-BunPath
$startedAt = Get-Date

if (-not $SkipPrerequisiteCheck -and -not (Test-VisualStudioCppBuildTools)) {
  throw "Visual Studio C++ Build Tools were not found. Electron Builder needs the Desktop C++ build tools to rebuild native desktop dependencies on Windows. Install Microsoft.VisualStudio.2022.BuildTools with the VC++ tools workload, or build the installer in GitHub Actions."
}

$buildArgs = @("run", "dist:desktop:win", "--", "--build-version", $resolvedBuildVersion)
if ($SkipBuild) {
  $buildArgs += "--skip-build"
}

Push-Location $repoRoot
try {
  & $bunPath @buildArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Desktop installer build failed with exit code $LASTEXITCODE."
  }
} finally {
  Pop-Location
}

$installer = Get-ChildItem -LiteralPath $releaseDir -Filter "T3-Nexus-$resolvedBuildVersion-*.exe" -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if ($null -eq $installer) {
  $installer = Get-ChildItem -LiteralPath $releaseDir -Filter "T3-Nexus-*.exe" -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -ge $startedAt.AddMinutes(-1) } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
}

if ($null -eq $installer) {
  throw "Build finished, but no T3 Nexus installer was found in $releaseDir."
}

Write-Output "Built T3 Nexus installer: $($installer.FullName)"

if ($NoInstall) {
  return
}

$installArgs = @()
if ($Silent) {
  $installArgs += "/S"
}

$process = Start-Process -FilePath $installer.FullName -ArgumentList $installArgs -Wait -PassThru
if ($process.ExitCode -ne 0) {
  throw "T3 Nexus installer exited with code $($process.ExitCode)."
}

Write-Output "Installed T3 Nexus from: $($installer.FullName)"
