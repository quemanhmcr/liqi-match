param(
  [string]$AvdName = $(if ($env:ANDROID_AVD_NAME) { $env:ANDROID_AVD_NAME } else { 'LiqiMatch_Pixel_8' }),
  [string]$AppId = $(if ($env:ANDROID_APP_ID) { $env:ANDROID_APP_ID } else { 'com.quemanhmcr.liqimatch.dev' }),
  [int]$BootTimeoutSeconds = 240,
  [int]$MetroPort = 8081,
  [int]$WindowX = 40,
  [int]$WindowY = 40,
  [int]$WindowWidth = 430,
  [int]$WindowHeight = 920,
  [switch]$ColdBoot,
  [switch]$Rebuild
)

$ErrorActionPreference = 'Stop'

Add-Type @'
using System;
using System.Runtime.InteropServices;

public static class WindowTools {
  [DllImport("user32.dll")]
  public static extern bool MoveWindow(IntPtr hWnd, int X, int Y, int nWidth, int nHeight, bool bRepaint);

  [DllImport("user32.dll")]
  public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);
}
'@

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

function Move-EmulatorWindow {
  $windows = Get-Process qemu-system-x86_64, emulator -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowHandle -ne 0 } |
    Sort-Object { if ($_.ProcessName -eq 'qemu-system-x86_64') { 0 } else { 1 } }

  foreach ($window in $windows) {
    [WindowTools]::ShowWindow($window.MainWindowHandle, 9) | Out-Null
    [WindowTools]::MoveWindow($window.MainWindowHandle, $WindowX, $WindowY, $WindowWidth, $WindowHeight, $true) | Out-Null
    [WindowTools]::SetForegroundWindow($window.MainWindowHandle) | Out-Null
    Write-Host "Moved Android emulator window to ${WindowX},${WindowY} (${WindowWidth}x${WindowHeight})."
    return
  }

  Write-Host 'Android emulator window was not found yet.'
}

function Test-AppInstalled {
  param([string]$Serial)

  $packages = Invoke-Adb -AdbArgs @('-s', $Serial, 'shell', 'pm', 'list', 'packages', $AppId)
  return ($packages -match "package:$([regex]::Escape($AppId))").Count -gt 0
}

function Start-MetroIfNeeded {
  $listener = Get-NetTCPConnection -LocalPort $MetroPort -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1

  if ($listener) {
    Write-Host "Metro is already listening on port $MetroPort."
    return
  }

  $logDir = Join-Path (Get-Location) '.expo'
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null

  Write-Host "Starting Metro on port $MetroPort..."
  Start-Process `
    -FilePath 'npm.cmd' `
    -ArgumentList @('run', 'start', '--', '--host', 'lan', '--port', "$MetroPort") `
    -WorkingDirectory (Get-Location) `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $logDir 'android-fast-start.out.log') `
    -RedirectStandardError (Join-Path $logDir 'android-fast-start.err.log')

  $deadline = (Get-Date).AddSeconds(45)
  while ((Get-Date) -lt $deadline) {
    $listener = Get-NetTCPConnection -LocalPort $MetroPort -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($listener) {
      Write-Host "Metro is ready on port $MetroPort."
      return
    }

    Start-Sleep -Seconds 1
  }

  throw "Metro did not start listening on port $MetroPort."
}

function Install-DebugBuild {
  param([string]$Serial)

  Write-Host 'Installing Liqi Match debug build. This is only needed when the app is missing or native code changed.'
  Push-Location (Join-Path (Get-Location) 'android')
  try {
    & .\gradlew.bat :app:installDebug -PreactNativeDevServerPort=$MetroPort
  } finally {
    Pop-Location
  }

  if (-not (Test-AppInstalled -Serial $Serial)) {
    throw "Android package $AppId was not installed."
  }
}

function Open-DevClient {
  param([string]$Serial)

  $encodedUrl = "http%3A%2F%2F127.0.0.1%3A$MetroPort"
  $deepLink = "exp+liqimatch://expo-development-client/?url=$encodedUrl"

  Invoke-Adb -AdbArgs @('-s', $Serial, 'reverse', "tcp:$MetroPort", "tcp:$MetroPort") | Out-Null
  Invoke-Adb -AdbArgs @('-s', $Serial, 'shell', 'input', 'keyevent', '82') | Out-Null
  Invoke-Adb -AdbArgs @('-s', $Serial, 'shell', 'wm', 'dismiss-keyguard') | Out-Null
  Invoke-Adb -AdbArgs @('-s', $Serial, 'shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', $deepLink, $AppId) | Out-Null
}

$androidSdkPath = Resolve-AndroidSdkPath
$script:AdbPath = Join-Path $androidSdkPath 'platform-tools\adb.exe'
$emulatorPath = Join-Path $androidSdkPath 'emulator\emulator.exe'

$availableAvds = & $emulatorPath -list-avds
if ($availableAvds -notcontains $AvdName) {
  throw "AVD '$AvdName' was not found. Available AVDs: $($availableAvds -join ', ')"
}

Write-Host 'Starting adb server...'
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

  Start-Sleep -Seconds 3
  Move-EmulatorWindow

  $serial = Wait-ForEmulatorBoot
  Write-Host "Android emulator is ready: $serial"
}

Move-EmulatorWindow
Start-MetroIfNeeded

if ($Rebuild -or -not (Test-AppInstalled -Serial $serial)) {
  Install-DebugBuild -Serial $serial
}

Write-Host 'Opening Liqi Match development build...'
Open-DevClient -Serial $serial
Move-EmulatorWindow

Write-Host "Done. Fast reopen command: npm run dev:android"
