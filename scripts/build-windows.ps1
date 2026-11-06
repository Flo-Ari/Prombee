$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
if (-not (Test-Path '.venv-windows/Scripts/python.exe')) {
    py -3.12 -m venv .venv-windows
    if ($LASTEXITCODE -ne 0) { throw 'Python 3.12 is required for building.' }
}
$Python = '.venv-windows/Scripts/python.exe'
& $Python -m pip install -r requirements-windows.txt
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
& $Python -m PyInstaller Prombee-windows.spec --noconfirm --workpath work/pyinstaller-windows --distpath dist/windows
if ($LASTEXITCODE -ne 0) { throw 'Windows build failed.' }
Write-Host 'Ready: dist/windows/Prombee.exe'
