param(
    [string]$OutputPath = "",
    [switch]$SkipSelfTest
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not $OutputPath) { $OutputPath = Join-Path $projectRoot 'dist\windows-setup\Remi-Magic-Setup.exe' }
$OutputPath = [System.IO.Path]::GetFullPath($OutputPath)
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) { $compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe' }
if (-not (Test-Path -LiteralPath $compiler)) { throw 'Windows .NET Framework C# compiler was not found.' }
$outputDirectory = Split-Path -Parent $OutputPath
[System.IO.Directory]::CreateDirectory($outputDirectory) | Out-Null
$compilerArguments = @(
    '/nologo', '/target:winexe', '/platform:anycpu', '/optimize+', '/utf8output',
    '/reference:System.dll', '/reference:System.Core.dll', '/reference:System.Drawing.dll', '/reference:System.Windows.Forms.dll',
    ('/out:' + $OutputPath),
    ('/win32manifest:' + (Join-Path $projectRoot 'windows-setup\app.manifest')),
    ('/resource:' + (Join-Path $projectRoot 'desktop-cursors\Remi-Wand-Large.ani') + ',RemiMagic.WandLarge.ani'),
    ('/resource:' + (Join-Path $projectRoot 'desktop-cursors\Remi-Wand-Regular.ani') + ',RemiMagic.WandRegular.ani'),
    (Join-Path $projectRoot 'windows-setup\Program.cs')
)
& $compiler @compilerArguments
if ($LASTEXITCODE -ne 0) { throw ('Cursor setup compilation failed: ' + $LASTEXITCODE) }
if (-not $SkipSelfTest) {
    $reportPath = Join-Path $outputDirectory 'self-test-report.txt'
    $process = Start-Process -FilePath $OutputPath -ArgumentList @('--self-test', '--report', ('"' + $reportPath + '"')) -WindowStyle Hidden -PassThru -Wait
    if (Test-Path -LiteralPath $reportPath) { Get-Content -LiteralPath $reportPath -Encoding UTF8 }
    if ($process.ExitCode -ne 0) { throw ('Isolated cursor setup self-test failed: ' + $process.ExitCode) }
}
Write-Output ('Compiler: ' + $compiler)
Write-Output ('Built: ' + $OutputPath)
