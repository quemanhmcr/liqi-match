param(
  [string]$AvdName = $(if ($env:ANDROID_AVD_NAME) { $env:ANDROID_AVD_NAME } else { 'LiqiMatch_Pixel_8' }),
  [string]$AppId = $(if ($env:ANDROID_APP_ID) { $env:ANDROID_APP_ID } else { 'com.quemanhmcr.liqimatch.dev' }),
  [string]$Scheme = $(if ($env:EXPO_DEV_CLIENT_SCHEME) { $env:EXPO_DEV_CLIENT_SCHEME } else { 'exp+liqimatch' }),
  [int]$BootTimeoutSeconds = 240,
  [int]$MetroPort = 8081,
  [int]$WindowX = -1,
  [int]$WindowY = -1,
  [int]$WindowWidth = 330,
  [int]$WindowHeight = 744,
  [switch]$ColdBoot,
  [switch]$Rebuild,
  [switch]$CleanPrebuild,
  [switch]$ClearMetroCache,
  [switch]$ForceTakeoverPort
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$ExpoStateDir = Join-Path $ProjectRoot '.expo'
$MetroStateFile = Join-Path $ExpoStateDir 'dev-android-metro.json'
$MetroOutLog = Join-Path $ExpoStateDir 'android-metro.out.log'
$MetroErrLog = Join-Path $ExpoStateDir 'android-metro.err.log'
$FingerprintFile = Join-Path $ExpoStateDir 'dev-client-android.fingerprint'

New-Item -ItemType Directory -Force -Path $ExpoStateDir | Out-Null

Add-Type -AssemblyName System.Windows.Forms

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

  if ($LASTEXITCODE -ne 0) {
    throw "adb failed: adb $($AdbArgs -join ' ')"
  }
}

function Get-OnlineEmulatorSerials {
  $devices = Invoke-Adb -AdbArgs @('devices')
  $serials = @()

  foreach ($line in $devices) {
    if ($line -match '^(emulator-\d+)\s+device$') {
      $serials += $Matches[1]
    }
  }

  return $serials
}

function Get-EmulatorAvdName {
  param([string]$Serial)

  $name = Invoke-Adb -AdbArgs @('-s', $Serial, 'emu', 'avd', 'name') 2>$null |
    Select-Object -First 1

  if ($name) {
    return ([string]$name).Trim()
  }

  return $null
}

function Get-TargetEmulatorSerial {
  foreach ($serial in Get-OnlineEmulatorSerials) {
    if ((Get-EmulatorAvdName -Serial $serial) -eq $AvdName) {
      return $serial
    }
  }

  return $null
}

function Test-BootCompleted {
  param([string]$Serial)

  $bootCompleted = (Invoke-Adb -AdbArgs @('-s', $Serial, 'shell', 'getprop', 'sys.boot_completed') 2>$null | Select-Object -First 1).Trim()
  $bootAnim = (Invoke-Adb -AdbArgs @('-s', $Serial, 'shell', 'getprop', 'init.svc.bootanim') 2>$null | Select-Object -First 1).Trim()
  return ($bootCompleted -eq '1') -and ($bootAnim -eq 'stopped')
}

function Wait-ForEmulatorBoot {
  $deadline = (Get-Date).AddSeconds($BootTimeoutSeconds)

  while ((Get-Date) -lt $deadline) {
    $serial = Get-TargetEmulatorSerial

    if ($serial -and (Test-BootCompleted -Serial $serial)) {
      return $serial
    }

    Start-Sleep -Seconds 2
  }

  throw "Android emulator did not finish booting within $BootTimeoutSeconds seconds."
}

function Move-EmulatorWindow {
  $workingArea = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
  $targetWidth = [Math]::Min($WindowWidth, $workingArea.Width - 40)
  $targetHeight = [Math]::Min($WindowHeight, $workingArea.Height - 40)
  $targetX = if ($WindowX -ge 0) { $WindowX } else { [Math]::Max($workingArea.Left, [int]($workingArea.Left + (($workingArea.Width - $targetWidth) / 2))) }
  $targetY = if ($WindowY -ge 0) { $WindowY } else { [Math]::Max($workingArea.Top + 20, [int]($workingArea.Top + (($workingArea.Height - $targetHeight) / 2))) }

  $windows = Get-Process qemu-system-x86_64, emulator -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowHandle -ne 0 } |
    Sort-Object { if ($_.ProcessName -eq 'qemu-system-x86_64') { 0 } else { 1 } }

  foreach ($window in $windows) {
    [WindowTools]::ShowWindow($window.MainWindowHandle, 9) | Out-Null
    [WindowTools]::MoveWindow($window.MainWindowHandle, $targetX, $targetY, $targetWidth, $targetHeight, $true) | Out-Null
    [WindowTools]::SetForegroundWindow($window.MainWindowHandle) | Out-Null
    Write-Host "Moved Android emulator window to ${targetX},${targetY} (${targetWidth}x${targetHeight})."
    return
  }

  Write-Host 'Android emulator window was not found yet.'
}

function Test-AppInstalled {
  param([string]$Serial)

  $packages = Invoke-Adb -AdbArgs @('-s', $Serial, 'shell', 'pm', 'list', 'packages', $AppId)
  return ($packages -match "package:$([regex]::Escape($AppId))").Count -gt 0
}

function Get-PortListeners {
  $listeners = @(Get-NetTCPConnection -LocalPort $MetroPort -State Listen -ErrorAction SilentlyContinue)
  $seen = @{}
  $results = @()

  foreach ($listener in $listeners) {
    $key = "$($listener.LocalAddress):$($listener.LocalPort):$($listener.OwningProcess)"
    if (-not $seen.ContainsKey($key)) {
      $seen[$key] = $true
      $results += [pscustomobject]@{
        LocalAddress = $listener.LocalAddress
        LocalPort = $listener.LocalPort
        OwningProcess = [int]$listener.OwningProcess
      }
    }
  }

  $netstatLines = & netstat.exe -ano -p tcp | Select-String "LISTENING" | Select-String ":$MetroPort\s"
  foreach ($line in $netstatLines) {
    $text = ([string]$line.Line).Trim()
    $parts = $text -split '\s+'
    if ($parts.Count -lt 5) {
      continue
    }

    $localAddress = $parts[1]
    $processId = [int]$parts[4]
    $key = "${localAddress}:$processId"
    if (-not $seen.ContainsKey($key)) {
      $seen[$key] = $true
      $results += [pscustomobject]@{
        LocalAddress = $localAddress
        LocalPort = $MetroPort
        OwningProcess = $processId
      }
    }
  }

  return @($results)
}

function Test-MetroHealth {
  foreach ($hostName in @('127.0.0.1', 'localhost')) {
    try {
      $response = Invoke-WebRequest "http://${hostName}:$MetroPort/status" -UseBasicParsing -TimeoutSec 2
      $status = if ($response.Content -is [byte[]]) {
        [System.Text.Encoding]::UTF8.GetString($response.Content)
      } else {
        [string]$response.Content
      }

      if ($status.Trim() -eq 'packager-status:running') {
        return $true
      }
    } catch {
      continue
    }
  }

  return $false
}

function Read-MetroState {
  if (-not (Test-Path $MetroStateFile)) {
    return $null
  }

  try {
    return Get-Content -Path $MetroStateFile -Raw | ConvertFrom-Json
  } catch {
    return $null
  }
}

function Get-DescendantProcessIds {
  param([int]$RootProcessId)

  $allProcesses = @(Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId)
  $known = @($RootProcessId)
  $changed = $true

  while ($changed) {
    $changed = $false

    foreach ($process in $allProcesses) {
      if (($known -contains [int]$process.ParentProcessId) -and -not ($known -contains [int]$process.ProcessId)) {
        $known += [int]$process.ProcessId
        $changed = $true
      }
    }
  }

  return $known
}

function Test-OwnedMetro {
  param($State)

  if ($null -eq $State) {
    return $false
  }

  if (($State.projectRoot -ne $ProjectRoot) -or ([int]$State.port -ne $MetroPort)) {
    return $false
  }

  $listeners = Get-PortListeners
  if ($listeners.Count -eq 0) {
    return $false
  }

  $listenerProcessIds = @($listeners | Select-Object -ExpandProperty OwningProcess -Unique)
  $ownedProcessIds = @()

  if ($State.rootPid) {
    $rootProcess = Get-Process -Id ([int]$State.rootPid) -ErrorAction SilentlyContinue
    if ($null -ne $rootProcess) {
      $ownedProcessIds = Get-DescendantProcessIds -RootProcessId ([int]$State.rootPid)
    }
  }

  if ($ownedProcessIds.Count -gt 0) {
    $allListenersOwnedByRoot = $true
    foreach ($processId in $listenerProcessIds) {
      if (-not ($ownedProcessIds -contains [int]$processId)) {
        $allListenersOwnedByRoot = $false
      }
    }

    if ($allListenersOwnedByRoot) {
      return Test-MetroHealth
    }
  }

  foreach ($processId in $listenerProcessIds) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction SilentlyContinue
    if ($process -and
        $process.CommandLine -and
        ($process.CommandLine -like "*$ProjectRoot*") -and
        ($process.CommandLine -match 'expo\\bin\\cli|expo[\\/]bin[\\/]cli|expo start')) {
      return Test-MetroHealth
    }
  }

  if ($State.listenerPid) {
    foreach ($processId in $listenerProcessIds) {
      if ([int]$State.listenerPid -eq [int]$processId) {
        return Test-MetroHealth
      }
    }
  }

  return $false
}

function Get-MetroListenerPid {
  $listeners = Get-PortListeners
  $listenerProcessIds = @($listeners | Select-Object -ExpandProperty OwningProcess -Unique)

  foreach ($processId in $listenerProcessIds) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction SilentlyContinue
    if ($process -and
        $process.CommandLine -and
        ($process.CommandLine -like "*$ProjectRoot*") -and
        ($process.CommandLine -match 'expo\\bin\\cli|expo[\\/]bin[\\/]cli|expo start')) {
      return [int]$processId
    }
  }

  if ($listenerProcessIds.Count -eq 1) {
    return [int]$listenerProcessIds[0]
  }

  return $null
}

function Stop-OwnedMetro {
  param($State)

  if ($State -and $State.rootPid) {
    taskkill /PID ([int]$State.rootPid) /T /F 2>$null | Out-Null
  }

  Remove-Item -Path $MetroStateFile -Force -ErrorAction SilentlyContinue
}

function Write-PortOwnerDiagnostics {
  param([int[]]$ProcessIds)

  foreach ($processId in $ProcessIds) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction SilentlyContinue
    if ($process) {
      Write-Host "Port $MetroPort owner PID=$($process.ProcessId) Name=$($process.Name)"
      Write-Host "CommandLine=$($process.CommandLine)"
    }
  }
}

function Start-MetroIfNeeded {
  $state = Read-MetroState
  $ownedMetro = Test-OwnedMetro -State $state

  if ($ownedMetro -and -not $ClearMetroCache -and -not $Rebuild) {
    $listenerPid = Get-MetroListenerPid
    if ($listenerPid) {
      $state | Add-Member -NotePropertyName listenerPid -NotePropertyValue $listenerPid -Force
      $state | ConvertTo-Json | Set-Content -Path $MetroStateFile
    }

    Write-Host "Reusing owned Metro on http://127.0.0.1:$MetroPort."
    return
  }

  if ($ownedMetro) {
    Write-Host 'Restarting owned Metro...'
    Stop-OwnedMetro -State $state
    Start-Sleep -Seconds 1
  } else {
    $listeners = Get-PortListeners
    if ($listeners.Count -gt 0) {
      $listenerProcessIds = @($listeners | Select-Object -ExpandProperty OwningProcess -Unique)
      Write-PortOwnerDiagnostics -ProcessIds $listenerProcessIds

      if (-not $ForceTakeoverPort) {
        throw "Port $MetroPort is occupied by a process not owned by this script. Stop it manually or rerun with -ForceTakeoverPort."
      }

      Write-Host "Taking over port $MetroPort by request..."
      foreach ($processId in $listenerProcessIds) {
        taskkill /PID $processId /T /F | Out-Null
      }

      Start-Sleep -Seconds 2
    }
  }

  Write-Host "Starting Metro on port $MetroPort..."
  $metroArgs = @('expo', 'start', '--dev-client', '--localhost', '--port', "$MetroPort")
  if ($ClearMetroCache -or $Rebuild) {
    $metroArgs += '--clear'
  }

  $previousNodeOptions = $env:NODE_OPTIONS
  if ([string]::IsNullOrWhiteSpace($previousNodeOptions)) {
    $env:NODE_OPTIONS = '--dns-result-order=ipv4first'
  } elseif ($previousNodeOptions -notmatch 'dns-result-order') {
    $env:NODE_OPTIONS = "$previousNodeOptions --dns-result-order=ipv4first"
  }

  try {
    $process = Start-Process `
      -FilePath 'npx.cmd' `
      -ArgumentList $metroArgs `
      -WorkingDirectory $ProjectRoot `
      -WindowStyle Hidden `
      -RedirectStandardOutput $MetroOutLog `
      -RedirectStandardError $MetroErrLog `
      -PassThru
  } finally {
    if ($null -eq $previousNodeOptions) {
      Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue
    } else {
      $env:NODE_OPTIONS = $previousNodeOptions
    }
  }

  @{
    projectRoot = $ProjectRoot
    port = $MetroPort
    rootPid = $process.Id
    startedAt = (Get-Date).ToString('o')
  } | ConvertTo-Json | Set-Content -Path $MetroStateFile

  $deadline = (Get-Date).AddSeconds(45)
  while ((Get-Date) -lt $deadline) {
    if ($process.HasExited) {
      throw "Metro exited early. Check $MetroErrLog"
    }

    $startedState = Read-MetroState
    if ((Test-MetroHealth) -and (Test-OwnedMetro -State $startedState)) {
      $listenerPid = Get-MetroListenerPid
      if ($listenerPid) {
        $startedState | Add-Member -NotePropertyName listenerPid -NotePropertyValue $listenerPid -Force
        $startedState | ConvertTo-Json | Set-Content -Path $MetroStateFile
      }

      Write-Host "Metro is ready on http://127.0.0.1:$MetroPort."
      return
    }

    Start-Sleep -Seconds 1
  }

  throw "Metro did not start listening on port $MetroPort."
}

function Get-FileSha256 {
  param([string]$Path)

  if (-not (Test-Path $Path)) {
    return "missing:$Path"
  }

  return (Get-FileHash -Path $Path -Algorithm SHA256).Hash
}

function Get-NativeFingerprint {
  $inputs = [ordered]@{
    appId = $AppId
    avdName = $AvdName
    packageJson = Get-FileSha256 -Path (Join-Path $ProjectRoot 'package.json')
    packageLock = Get-FileSha256 -Path (Join-Path $ProjectRoot 'package-lock.json')
    appConfig = Get-FileSha256 -Path (Join-Path $ProjectRoot 'app.config.ts')
  }

  $json = $inputs | ConvertTo-Json -Compress
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  $sha256 = [System.Security.Cryptography.SHA256]::Create()
  try {
    $hashBytes = $sha256.ComputeHash($bytes)
  } finally {
    $sha256.Dispose()
  }
  $hash = [System.BitConverter]::ToString($hashBytes).Replace('-', '').ToLowerInvariant()

  return [pscustomobject]@{
    hash = $hash
    inputs = $inputs
  }
}

function Assert-NativeFingerprint {
  $fingerprint = Get-NativeFingerprint

  if (-not (Test-Path $FingerprintFile)) {
    $fingerprint | ConvertTo-Json -Depth 4 | Set-Content -Path $FingerprintFile
    Write-Host "Created Android native fingerprint baseline: $($fingerprint.hash)"
    return
  }

  $saved = Get-Content -Path $FingerprintFile -Raw | ConvertFrom-Json
  if ($saved.hash -ne $fingerprint.hash) {
    throw "Android native fingerprint changed. Run 'npm run dev:android:rebuild' after native dependency/config changes, or remove $FingerprintFile only if the installed APK is already known to match."
  }
}

function Save-NativeFingerprint {
  $fingerprint = Get-NativeFingerprint
  $fingerprint | ConvertTo-Json -Depth 4 | Set-Content -Path $FingerprintFile
  Write-Host "Saved Android native fingerprint: $($fingerprint.hash)"
}

function Install-DebugBuild {
  param([string]$Serial)

  Write-Host 'Installing Liqi Match debug build. This is only needed when the app is missing or native code changed.'
  if ($CleanPrebuild) {
    & npx.cmd expo prebuild --clean --platform android
    if ($LASTEXITCODE -ne 0) {
      throw 'expo prebuild failed.'
    }
  }

  if (Test-Path (Join-Path $ProjectRoot 'android\gradlew.bat')) {
    Push-Location (Join-Path $ProjectRoot 'android')
    try {
      & .\gradlew.bat :app:installDebug -PreactNativeDevServerPort=$MetroPort
      if ($LASTEXITCODE -ne 0) {
        throw 'Gradle installDebug failed.'
      }
    } finally {
      Pop-Location
    }
  } else {
    & npx.cmd expo run:android --device $Serial --app-id $AppId --no-bundler
    if ($LASTEXITCODE -ne 0) {
      throw 'expo run:android failed.'
    }
  }

  if (-not (Test-AppInstalled -Serial $Serial)) {
    throw "Android package $AppId was not installed."
  }

  Save-NativeFingerprint
}

function Open-DevClient {
  param([string]$Serial)

  $encodedUrl = [Uri]::EscapeDataString("http://127.0.0.1:$MetroPort")
  $deepLink = "${Scheme}://expo-development-client/?url=$encodedUrl&disableOnboarding=1"
  $shellDeepLink = "'$deepLink'"

  & $script:AdbPath -s $Serial reverse --remove "tcp:$MetroPort" 2>$null | Out-Null
  Invoke-Adb -AdbArgs @('-s', $Serial, 'reverse', "tcp:$MetroPort", "tcp:$MetroPort") | Out-Null
  Invoke-Adb -AdbArgs @('-s', $Serial, 'shell', 'input', 'keyevent', '82') | Out-Null
  Invoke-Adb -AdbArgs @('-s', $Serial, 'shell', 'wm', 'dismiss-keyguard') | Out-Null
  Invoke-Adb -AdbArgs @('-s', $Serial, 'shell', 'am', 'force-stop', $AppId) | Out-Null
  Invoke-Adb -AdbArgs @('-s', $Serial, 'shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-c', 'android.intent.category.BROWSABLE', '-d', $shellDeepLink, $AppId) | Out-Null
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

$serial = Get-TargetEmulatorSerial
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

if ($Rebuild -or -not (Test-AppInstalled -Serial $serial)) {
  Install-DebugBuild -Serial $serial
} else {
  Assert-NativeFingerprint
}

Start-MetroIfNeeded

Write-Host 'Opening Liqi Match development build...'
Open-DevClient -Serial $serial
Move-EmulatorWindow

Write-Host "Done. Fast reopen command: npm run dev:android"
