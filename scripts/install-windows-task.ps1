$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$Node = (Get-Command node).Source
$TaskName = "PhoneChargeGuardian"

$Action = New-ScheduledTaskAction -Execute $Node -Argument "`"$Root\src\server.js`"" -WorkingDirectory $Root
$Trigger = New-ScheduledTaskTrigger -AtLogOn
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -ExecutionTimeLimit 0

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Description "Phone Charge Guardian local watcher" -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName

Write-Host "Installed $TaskName"
Write-Host "Open http://127.0.0.1:3769"
