[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$version = (Get-Content -LiteralPath (Join-Path $repo 'VERSION') -Raw).Trim()
$installer = Join-Path $repo "dist/WxTyper-$version-Windows-x64-Setup.exe"
$testRoot = Join-Path $repo ('test-results/installer-' + [guid]::NewGuid().ToString('N'))
$installDirectory = Join-Path $testRoot 'application'
New-Item -ItemType Directory -Path $testRoot -Force | Out-Null
$previousDataDirectory = $env:WXTYPER_DATA_DIR
$app = $null
try {
    $process = Start-Process -FilePath $installer -ArgumentList @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/SP-', "/DIR=`"$installDirectory`"", "/LOG=`"$testRoot/install.log`"") -WindowStyle Hidden -PassThru
    if (-not $process.WaitForExit(120000)) { Stop-Process -Id $process.Id; throw 'Installer timed out.' }
    if ($process.ExitCode -ne 0) { throw "Installer failed: $($process.ExitCode)" }
    $executable = Join-Path $installDirectory 'WxTyper.exe'
    if (-not (Test-Path -LiteralPath $executable)) { throw 'Installed executable is missing.' }
    if ((Get-Item -LiteralPath $executable).VersionInfo.ProductVersion -notlike "$version*") { throw 'Installed version is incorrect.' }
    $env:WXTYPER_DATA_DIR = Join-Path $testRoot 'settings'
    $app = Start-Process -FilePath $executable -WindowStyle Hidden -PassThru
    if ($app.WaitForExit(8000)) { throw "Installed application exited early: $($app.ExitCode)" }
    Write-Host 'PASS installer and installed application launch'
}
finally {
    if ($app -and -not $app.HasExited) { Stop-Process -Id $app.Id; $app.WaitForExit() }
    $env:WXTYPER_DATA_DIR = $previousDataDirectory
    $uninstaller = Join-Path $installDirectory 'unins000.exe'
    if (Test-Path -LiteralPath $uninstaller) {
        $process = Start-Process -FilePath $uninstaller -ArgumentList '/VERYSILENT /SUPPRESSMSGBOXES /NORESTART' -WindowStyle Hidden -PassThru
        if (-not $process.WaitForExit(60000)) { Stop-Process -Id $process.Id; throw 'Uninstaller timed out.' }
        if ($process.ExitCode -ne 0) { throw "Uninstaller failed: $($process.ExitCode)" }
        if (Test-Path -LiteralPath (Join-Path $installDirectory 'WxTyper.exe')) { throw 'Uninstaller did not remove the app.' }
        Write-Host 'PASS uninstaller'
    }
}
