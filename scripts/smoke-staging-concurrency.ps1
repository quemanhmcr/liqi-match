param(
  [Parameter(Mandatory = $true)]
  [string]$SupabaseUrl,

  [Parameter(Mandatory = $true)]
  [string]$PublishableKey,

  [Parameter(Mandatory = $true)]
  [string]$ServiceRoleKey
)

$ErrorActionPreference = 'Stop'
$users = @()

function New-SmokeUser {
  param([string]$Name)

  $email = "$Name+" + [guid]::NewGuid().ToString('N') + '@example.test'
  $password = 'SmokeTest!123456789'
  $adminBody = @{ email = $email; password = $password; email_confirm = $true } | ConvertTo-Json
  $created = Invoke-RestMethod `
    -Uri "$SupabaseUrl/auth/v1/admin/users" `
    -Method POST `
    -Headers @{ apikey = $ServiceRoleKey; authorization = "Bearer $ServiceRoleKey"; 'content-type' = 'application/json' } `
    -Body $adminBody

  $tokenBody = @{ email = $email; password = $password } | ConvertTo-Json
  $session = Invoke-RestMethod `
    -Uri "$SupabaseUrl/auth/v1/token?grant_type=password" `
    -Method POST `
    -Headers @{ apikey = $PublishableKey; 'content-type' = 'application/json' } `
    -Body $tokenBody

  $profileBody = @{ id = $created.id; display_name = $Name } | ConvertTo-Json
  Invoke-RestMethod `
    -Uri "$SupabaseUrl/rest/v1/profiles" `
    -Method POST `
    -Headers @{ apikey = $PublishableKey; authorization = "Bearer $($session.access_token)"; 'content-type' = 'application/json'; Prefer = 'return=minimal' } `
    -Body $profileBody | Out-Null

  [pscustomobject]@{ id = $created.id; token = $session.access_token }
}

try {
  $a = New-SmokeUser 'concurrency-a'
  $b = New-SmokeUser 'concurrency-b'
  $users = @($a, $b)

  $jobs = @()
  for ($i = 0; $i -lt 10; $i += 1) {
    $jobs += Start-Job -ScriptBlock {
      param($url, $key, $token, $target)
      $body = @{ target_profile_id = $target; direction = 'like' } | ConvertTo-Json
      try {
        Invoke-RestMethod `
          -Uri "$url/rest/v1/rpc/record_swipe" `
          -Method POST `
          -Headers @{ apikey = $key; authorization = "Bearer $token"; 'content-type' = 'application/json' } `
          -Body $body | Out-Null
      }
      catch {
        $response = $_.Exception.Response
        if ($response -and $response.GetResponseStream()) {
          $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
          throw $reader.ReadToEnd()
        }
        throw
      }
    } -ArgumentList $SupabaseUrl, $PublishableKey, $a.token, $b.id

    $jobs += Start-Job -ScriptBlock {
      param($url, $key, $token, $target)
      $body = @{ target_profile_id = $target; direction = 'like' } | ConvertTo-Json
      try {
        Invoke-RestMethod `
          -Uri "$url/rest/v1/rpc/record_swipe" `
          -Method POST `
          -Headers @{ apikey = $key; authorization = "Bearer $token"; 'content-type' = 'application/json' } `
          -Body $body | Out-Null
      }
      catch {
        $response = $_.Exception.Response
        if ($response -and $response.GetResponseStream()) {
          $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
          throw $reader.ReadToEnd()
        }
        throw
      }
    } -ArgumentList $SupabaseUrl, $PublishableKey, $b.token, $a.id
  }

  $jobs | Wait-Job | Out-Null
  $failed = @($jobs | Where-Object { $_.State -ne 'Completed' })
  $jobErrors = @()
  foreach ($job in $jobs) {
    try {
      Receive-Job $job -ErrorAction Stop | Out-Null
    }
    catch {
      $jobErrors += $_.Exception.Message
    }
    Remove-Job $job
  }

  $lowHigh = @($a.id, $b.id) | Sort-Object
  $matches = Invoke-RestMethod `
    -Uri "$SupabaseUrl/rest/v1/matches?select=id&profile_low_id=eq.$($lowHigh[0])&profile_high_id=eq.$($lowHigh[1])" `
    -Method GET `
    -Headers @{ apikey = $ServiceRoleKey; authorization = "Bearer $ServiceRoleKey" }

  $conversations = @()
  if ($matches.Count -eq 1) {
    $conversations = Invoke-RestMethod `
      -Uri "$SupabaseUrl/rest/v1/conversations?select=id&match_id=eq.$($matches[0].id)" `
      -Method GET `
      -Headers @{ apikey = $ServiceRoleKey; authorization = "Bearer $ServiceRoleKey" }
  }

  $swipes = Invoke-RestMethod `
    -Uri "$SupabaseUrl/rest/v1/swipes?select=id&or=(and(actor_id.eq.$($a.id),target_id.eq.$($b.id)),and(actor_id.eq.$($b.id),target_id.eq.$($a.id)))" `
    -Method GET `
    -Headers @{ apikey = $ServiceRoleKey; authorization = "Bearer $ServiceRoleKey" }

  [pscustomobject]@{
    failedJobs = $failed.Count
    jobErrorCount = $jobErrors.Count
    firstJobError = $jobErrors[0]
    swipeCount = $swipes.Count
    matchCount = $matches.Count
    conversationCount = $conversations.Count
    pass = ($failed.Count -eq 0 -and $jobErrors.Count -eq 0 -and $matches.Count -eq 1 -and $conversations.Count -eq 1)
  } | ConvertTo-Json -Compress
}
finally {
  foreach ($user in $users) {
    if ($user.id) {
      try {
        Invoke-RestMethod `
          -Uri "$SupabaseUrl/auth/v1/admin/users/$($user.id)" `
          -Method DELETE `
          -Headers @{ apikey = $ServiceRoleKey; authorization = "Bearer $ServiceRoleKey" } | Out-Null
      } catch {
        Write-Warning "Failed to clean smoke user $($user.id): $($_.Exception.Message)"
      }
    }
  }
}
