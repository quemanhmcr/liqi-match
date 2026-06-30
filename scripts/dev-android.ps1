param(
  [string]$AvdName = $(if ($env:ANDROID_AVD_NAME) { $env:ANDROID_AVD_NAME } else { 'LiqiMatch_Pixel_8' }),
  [int]$BootTimeoutSeconds = 240,
  [switch]$ColdBoot
)

$ErrorActionPreference = 'Stop'

function Resolve-AndroidSdkPath {
  $candidates = @(@(
    $env:ANDROID_HOME,
    $env:ANDROID_SDK_ROOT,
    (Join-Path $env:LOCALAPPDATA 'Android\Sdk')
  ) | Where-Object {
      $_ -and
      (Test-Path (Join-Path $_ 'platform-tools\adb.exe')) -and
      (Test-Path (Join-Path $_ 'emulator\emulator.exe'))
    })

  if ($candidates.Count -eq 0) {
    throw 'Android SDK was not found. Set ANDROID_HOME or install Android Studio with Android SDK.'
  }

  return $candidates[0]
}

function Invoke-Adb {
  param([string[]]$AdbArgs)

  & $script:AdbPath @AdbArgs
}

function Get-OnlineEmulatorSerial {
  $devices = Invoke-Adb -AdbArgs @('devices')

  foreach ($line in $devices) {
    if ($line -match '^(emulator-\d+)\s+device$') {
      return $Matches[1]
    }
  }

  return $null
}

function Test-BootCompleted {
  param([string]$Serial)

  $bootCompleted = (Invoke-Adb -AdbArgs @('-s', $Serial, 'shell', 'getprop', 'sys.boot_completed') 2>$null | Select-Object -First 1).Trim()
  return $bootCompleted -eq '1'
}

function Wait-ForEmulatorBoot {
  $deadline = (Get-Date).AddSeconds($BootTimeoutSeconds)

  while ((Get-Date) -lt $deadline) {
    $serial = Get-OnlineEmulatorSerial

    if ($serial -and (Test-BootCompleted -Serial $serial)) {
      return $serial
    }

    Start-Sleep -Seconds 2
  }

  throw "Android emulator did not finish booting within $BootTimeoutSeconds seconds."
}

$androidSdkPath = Resolve-AndroidSdkPath
$script:AdbPath = Join-Path $androidSdkPath 'platform-tools\adb.exe'
$emulatorPath = Join-Path $androidSdkPath 'emulator\emulator.exe'

if (-not (Test-Path $script:AdbPath)) {
  throw "adb.exe was not found at $script:AdbPath."
}

if (-not (Test-Path $emulatorPath)) {
  throw "emulator.exe was not found at $emulatorPath."
}

$availableAvds = & $emulatorPath -list-avds
if ($availableAvds -notcontains $AvdName) {
  throw "AVD '$AvdName' was not found. Available AVDs: $($availableAvds -join ', ')"
}

Write-Host "Starting adb server..."
Invoke-Adb -AdbArgs @('start-server') | Out-Null

$serial = Get-OnlineEmulatorSerial
if ($serial -and (Test-BootCompleted -Serial $serial)) {
  Write-Host "Using already booted emulator: $serial"
} else {
  $emulatorArgs = @(
    '-avd',
    $AvdName,
    '-gpu',
    'swiftshader_indirect'
  )

  if ($ColdBoot) {
    $emulatorArgs += '-no-snapshot-load'
  }

  Write-Host "Launching Android emulator '$AvdName'..."
  Start-Process -FilePath $emulatorPath -ArgumentList $emulatorArgs

  $serial = Wait-ForEmulatorBoot
  Write-Host "Android emulator is ready: $serial"
}

Write-Host "Waking and unlocking emulator..."
Invoke-Adb -AdbArgs @('-s', $serial, 'shell', 'input', 'keyevent', '82') | Out-Null
Invoke-Adb -AdbArgs @('-s', $serial, 'shell', 'wm', 'dismiss-keyguard') | Out-Null

Write-Host 'Building and launching Liqi Match development build...'
npx expo run:android --device $serial
