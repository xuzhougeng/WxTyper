[CmdletBinding()]
param([switch]$NoBuild)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$version = (Get-Content -LiteralPath (Join-Path $repo 'VERSION') -Raw).Trim()
$source = Join-Path $repo 'build/windows'
$output = Join-Path $repo 'dist'
$bootstrapper = Join-Path $repo 'build/MicrosoftEdgeWebview2Setup.exe'
if (-not $NoBuild) { & (Join-Path $PSScriptRoot 'build-windows.ps1') }
if (-not (Test-Path -LiteralPath (Join-Path $source 'WxTyper.exe'))) { throw 'Build the Windows app first.' }
New-Item -ItemType Directory -Path $output -Force | Out-Null

# Bundle Microsoft's small Evergreen installer; it downloads the runtime only when missing.
Invoke-WebRequest 'https://go.microsoft.com/fwlink/p/?LinkId=2124703' -OutFile $bootstrapper
$signature = Get-AuthenticodeSignature -LiteralPath $bootstrapper
if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation') {
    throw 'WebView2 bootstrapper does not have a valid Microsoft signature.'
}
$compiler = Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6/ISCC.exe'
if (-not (Test-Path -LiteralPath $compiler)) {
    $compiler = (Get-Command ISCC.exe -ErrorAction Stop).Source
}
& $compiler "/DAppVersion=$version" "/DSourceDir=$source" "/DOutputDir=$output" "/DWebViewBootstrapper=$bootstrapper" (Join-Path $PSScriptRoot 'windows-installer.iss')
if ($LASTEXITCODE -ne 0) { throw 'Windows installer compilation failed.' }
Compress-Archive -Path (Join-Path $source '*') -DestinationPath (Join-Path $output "WxTyper-$version-Windows-x64-portable.zip") -Force
Write-Host "Packages: $output"
