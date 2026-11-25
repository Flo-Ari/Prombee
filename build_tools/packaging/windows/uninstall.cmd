@echo off
setlocal
set "PROMBEE_UNINSTALL_SCRIPT=%~f0"
set "PROMBEE_UNINSTALL_DIR=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$body = (Get-Content -LiteralPath $env:PROMBEE_UNINSTALL_SCRIPT -Encoding UTF8 | Select-Object -Skip 7) -join [Environment]::NewLine; & ([ScriptBlock]::Create($body))"
exit /b %errorlevel%
rem PowerShell program follows. Keep the seven-line launcher above intact.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
$directory = $env:PROMBEE_UNINSTALL_DIR
try {
    $installed = @(Get-ChildItem -LiteralPath $directory -File | Where-Object { $_.Name -match '^unins\d{3}\.exe$' })
    if ($installed.Count -gt 0) {
        $process = Start-Process -FilePath $installed[0].FullName -Wait -PassThru
        exit $process.ExitCode
    }
    $files = @(Get-ChildItem -LiteralPath $directory -File | Where-Object {
        $_.Name -eq 'Prombee.exe' -or $_.Name -match '^Prombee-\d+\.\d+\.\d+(?:-Windows-x64-Portable)?\.exe$'
    })
    if ($files.Count -eq 0) { throw '请将卸载程序放在 Prombee 便携版 EXE 所在的文件夹，再次运行。' }
    $message = "请先保存内容并退出提示蜂。卸载以下程序？词集及用户数据将保留。`n`n" + (($files | ForEach-Object { $_.Name }) -join "`n")
    $answer = [System.Windows.Forms.MessageBox]::Show($message, '卸载提示蜂 / Uninstall Prombee', 'YesNo', 'Question')
    if ($answer -ne [System.Windows.Forms.DialogResult]::Yes) { exit 0 }
    foreach ($file in $files) { Remove-Item -LiteralPath $file.FullName -ErrorAction Stop }
    [System.Windows.Forms.MessageBox]::Show('卸载完成，词集及用户数据已保留。', '提示蜂 / Prombee', 'OK', 'Information') | Out-Null
} catch {
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, '卸载失败 / Uninstall failed', 'OK', 'Error') | Out-Null
    exit 1
}
