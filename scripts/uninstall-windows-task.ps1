$ErrorActionPreference = "Stop"

$TaskName = "PhoneChargeGuardian"

Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

Write-Host "Uninstalled $TaskName"
