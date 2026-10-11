[CmdletBinding()]
param(
    [string]$ArticlePath,
    [switch]$NoRestore
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$project = Join-Path $repo 'Native/Windows/WxTyper.PreviewTests/WxTyper.PreviewTests.csproj'
$binaryDirectory = Join-Path $repo 'build/preview-tests'
$resultDirectory = Join-Path $repo ('test-results/preview-native-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
$buildArguments = @('publish', $project, '-c', 'Release', '-p:Platform=x64', '-o', $binaryDirectory, '--nologo')
if ($NoRestore) { $buildArguments += '--no-restore' }
& dotnet @buildArguments
if ($LASTEXITCODE -ne 0) { throw 'Preview test build failed.' }
$testArguments = '"' + $resultDirectory + '"'
if ($ArticlePath) { $testArguments += ' "' + (Resolve-Path -LiteralPath $ArticlePath).Path + '"' }
$testProcess = Start-Process -FilePath (Join-Path $binaryDirectory 'WxTyper.PreviewTests.exe') -ArgumentList $testArguments -WindowStyle Hidden -PassThru
if (-not $testProcess.WaitForExit(60000)) {
    Stop-Process -Id $testProcess.Id
    throw 'Preview tests exceeded 60 seconds.'
}
$resultPath = Join-Path $resultDirectory 'result.json'
if (-not (Test-Path -LiteralPath $resultPath)) { throw "Preview test exited without a report: $resultDirectory" }
$result = Get-Content -LiteralPath $resultPath -Raw | ConvertFrom-Json
foreach ($check in $result.checks) { Write-Host "PASS $check" }
if (-not $result.passed) { throw $result.error }
Write-Host "Report: $resultPath"
