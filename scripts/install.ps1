# Builds the project and registers the native messaging host on Windows for Chrome, Edge, Brave and Firefox.
# Runs on Windows PowerShell 5.1 and PowerShell 7:
#   powershell -ExecutionPolicy Bypass -File scripts\install.ps1
# This file is kept ASCII-only: Windows PowerShell 5.1 reads BOM-less scripts in the ANSI code page.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$HostName = 'com.stocki.github_orca'
$Arrow = [string][char]0x2192
$Utf8NoBom = New-Object System.Text.UTF8Encoding $false

function Fail([string]$Message) {
  [Console]::Error.WriteLine($Message)
  exit 1
}

function Find-Tool([string]$Name, [string]$Hint) {
  $cmd = Get-Command $Name -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $cmd) { Fail "Not found in PATH: $Name$Hint" }
  return $cmd.Source
}

function Write-Utf8File([string]$Path, [string]$Content) {
  [System.IO.File]::WriteAllText($Path, $Content, $Utf8NoBom)
}

# cmd.exe decodes batch files in the OEM code page (e.g. 437, 850), not UTF-8.
function Get-OemEncoding {
  return [System.Text.Encoding]::GetEncoding([System.Globalization.CultureInfo]::CurrentCulture.TextInfo.OEMCodePage)
}

function Test-OemRoundTrip([System.Text.Encoding]$Encoding, [string]$Value) {
  return $Encoding.GetString($Encoding.GetBytes($Value)) -ceq $Value
}

# Values inserted into the .bat: `%` would otherwise be expanded by cmd.exe.
function Escape-Bat([string]$Value) {
  return $Value.Replace('%', '%%')
}

$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $Root

$NodeCmd = Find-Tool 'node' ''
$OrcaCmd = Find-Tool 'orca.cmd' " (Orca $Arrow Settings $Arrow enable the shell command)"
$GhCmd = Find-Tool 'gh' ''
$GitCmd = Find-Tool 'git' ''

$ExtIdFile = Join-Path $Root 'extension\extension-id.txt'
$GeckoIdFile = Join-Path $Root 'extension\firefox-id.txt'
if (-not (Test-Path -LiteralPath $ExtIdFile -PathType Leaf)) { Fail 'Run first: npm run gen-key' }
if (-not (Test-Path -LiteralPath $GeckoIdFile -PathType Leaf)) { Fail 'Missing extension/firefox-id.txt' }

if ($env:GITHUB_ORCA_SKIP_BUILD -eq '1') {
  Write-Host 'Skipping build (GITHUB_ORCA_SKIP_BUILD=1)'
} else {
  & npm run build
  if ($LASTEXITCODE -ne 0) { Fail "npm run build failed (exit code $LASTEXITCODE)" }
}

# Browsers start the host without the shell PATH: pin absolute paths (Volta/nvm shims resolve through node itself).
$NodeBin = ([string](& $NodeCmd -p 'process.execPath')).Trim()
if ($LASTEXITCODE -ne 0 -or -not $NodeBin) { Fail 'Could not resolve the node executable' }

$ToolDirs = @(
  (Split-Path -Parent $OrcaCmd),
  (Split-Path -Parent $GhCmd),
  (Split-Path -Parent $GitCmd),
  (Split-Path -Parent $NodeBin)
)
$ToolPath = ((($ToolDirs | ForEach-Object { Escape-Bat $_ }) -join ';') + ';%SystemRoot%\System32;%SystemRoot%')
$ExtId = (Get-Content -LiteralPath $ExtIdFile -Raw).Trim()
$GeckoId = (Get-Content -LiteralPath $GeckoIdFile -Raw).Trim()

$DistDir = Join-Path $Root 'host\dist'
New-Item -ItemType Directory -Force -Path $DistDir | Out-Null
$Wrapper = Join-Path $DistDir 'github-orca-host.bat'
$HostScript = Join-Path $DistDir 'host.cjs'

# %* passes the browser's arguments (caller origin, window handle) through.
$Bat = @(
  '@echo off',
  "set `"PATH=$ToolPath`"",
  'set "GITHUB_ORCA_HOST_MAIN=1"',
  "`"$(Escape-Bat $NodeBin)`" `"$(Escape-Bat $HostScript)`" %*"
) -join "`r`n"
$BatContent = $Bat + "`r`n"
$Oem = Get-OemEncoding
if (-not (Test-OemRoundTrip $Oem $BatContent)) {
  $Offending = @($ToolDirs + @($NodeBin, $HostScript)) | Where-Object { -not (Test-OemRoundTrip $Oem $_) } |
    Select-Object -Unique
  Fail ("These paths contain characters that cmd.exe cannot read in the OEM code page $($Oem.CodePage):`n  " +
    ($Offending -join "`n  ") +
    "`nMove the repository or the tools to a path without such characters, then run this script again.")
}
[System.IO.File]::WriteAllText($Wrapper, $BatContent, $Oem)
Write-Host "Wrapper: $Wrapper"

$Description = "GitHub $Arrow Orca bridge"
$ChromeManifest = [ordered]@{
  name = $HostName
  description = $Description
  path = $Wrapper
  type = 'stdio'
  allowed_origins = @("chrome-extension://$ExtId/")
}
$FirefoxManifest = [ordered]@{
  name = $HostName
  description = $Description
  path = $Wrapper
  type = 'stdio'
  allowed_extensions = @($GeckoId)
}
$ChromeManifestPath = Join-Path $DistDir "$HostName.chrome.json"
$FirefoxManifestPath = Join-Path $DistDir "$HostName.firefox.json"
Write-Utf8File $ChromeManifestPath (($ChromeManifest | ConvertTo-Json -Depth 5) + "`n")
Write-Utf8File $FirefoxManifestPath (($FirefoxManifest | ConvertTo-Json -Depth 5) + "`n")
Write-Host "Manifest: $ChromeManifestPath"
Write-Host "Manifest: $FirefoxManifestPath"

# Each browser looks the host up under HKCU, the key's default value being the manifest path.
$Registrations = @(
  @{ Key = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$HostName"; Manifest = $ChromeManifestPath },
  @{ Key = "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$HostName"; Manifest = $ChromeManifestPath },
  @{ Key = "HKCU:\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\$HostName"; Manifest = $ChromeManifestPath },
  @{ Key = "HKCU:\Software\Mozilla\NativeMessagingHosts\$HostName"; Manifest = $FirefoxManifestPath }
)
foreach ($reg in $Registrations) {
  if (-not (Test-Path -LiteralPath $reg.Key)) {
    New-Item -Path $reg.Key -Force | Out-Null
  }
  Set-ItemProperty -LiteralPath $reg.Key -Name '(default)' -Value $reg.Manifest
  Write-Host "Registered: $($reg.Key) = $($reg.Manifest)"
}

Write-Host "Expected extension ID: $ExtId (Chrome/Edge/Brave), $GeckoId (Firefox)"
