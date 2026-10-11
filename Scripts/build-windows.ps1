[CmdletBinding()]
param(
    [ValidateSet('Debug', 'Release')][string]$Configuration = 'Release',
    [switch]$Run,
    [switch]$NoRestore
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$project = Join-Path $repo 'Native/Windows/WxTyper.WinUI/WxTyper.WinUI.csproj'
$output = Join-Path $repo 'build/windows'
$arguments = @('publish', $project, '-c', $Configuration, '-p:Platform=x64', '-o', $output, '--nologo')
if ($NoRestore) { $arguments += '--no-restore' }
& dotnet @arguments
if ($LASTEXITCODE -ne 0) { throw 'Windows build failed.' }
Write-Host "Built: $output/WxTyper.exe"
if ($Run) { Start-Process -FilePath (Join-Path $output 'WxTyper.exe') }
