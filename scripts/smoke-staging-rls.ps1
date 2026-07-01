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

  $emailPrefix = ($Name.ToLowerInvariant() -replace '[^a-z0-9]+', '-').Trim('-')
  $email = "$emailPrefix+" + [guid]::NewGuid().ToString('N') + '@example.test'
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

  return [pscustomobject]@{
    id = $created.id
    token = $session.access_token
  }
}

function Invoke-ExpectFailure {
  param([scriptblock]$Call)

  try {
    & $Call | Out-Null
    return $false
  }
  catch {
    return $true
  }
}

try {
  $a = New-SmokeUser 'RLS A'
  $b = New-SmokeUser 'RLS B'
  $c = New-SmokeUser 'RLS C'
  $users = @($a, $b, $c)

  $directMatchBlocked = Invoke-ExpectFailure {
    $matchBody = @{ profile_low_id = $a.id; profile_high_id = $b.id } | ConvertTo-Json
    Invoke-RestMethod `
      -Uri "$SupabaseUrl/rest/v1/matches" `
      -Method POST `
      -Headers @{ apikey = $PublishableKey; authorization = "Bearer $($a.token)"; 'content-type' = 'application/json' } `
      -Body $matchBody
  }

  $orderedMatchIds = @($a.id, $b.id) | Sort-Object
  $matchBody = @{
    profile_low_id = $orderedMatchIds[0]
    profile_high_id = $orderedMatchIds[1]
  } | ConvertTo-Json
  $match = Invoke-RestMethod `
    -Uri "$SupabaseUrl/rest/v1/matches?select=id" `
    -Method POST `
    -Headers @{ apikey = $ServiceRoleKey; authorization = "Bearer $ServiceRoleKey"; 'content-type' = 'application/json'; Prefer = 'return=representation' } `
    -Body $matchBody

  $conversationBody = @{ match_id = $match[0].id } | ConvertTo-Json
  $conversation = Invoke-RestMethod `
    -Uri "$SupabaseUrl/rest/v1/conversations?select=id" `
    -Method POST `
    -Headers @{ apikey = $ServiceRoleKey; authorization = "Bearer $ServiceRoleKey"; 'content-type' = 'application/json'; Prefer = 'return=representation' } `
    -Body $conversationBody

  $membersBody = @(
    @{ conversation_id = $conversation[0].id; profile_id = $a.id },
    @{ conversation_id = $conversation[0].id; profile_id = $b.id }
  ) | ConvertTo-Json
  Invoke-RestMethod `
    -Uri "$SupabaseUrl/rest/v1/conversation_members" `
    -Method POST `
    -Headers @{ apikey = $ServiceRoleKey; authorization = "Bearer $ServiceRoleKey"; 'content-type' = 'application/json'; Prefer = 'return=minimal' } `
    -Body $membersBody | Out-Null

  $messageBody = @{ conversation_id = $conversation[0].id; sender_id = $a.id; body = 'hello' } | ConvertTo-Json
  Invoke-RestMethod `
    -Uri "$SupabaseUrl/rest/v1/messages" `
    -Method POST `
    -Headers @{ apikey = $PublishableKey; authorization = "Bearer $($a.token)"; 'content-type' = 'application/json'; Prefer = 'return=minimal' } `
    -Body $messageBody | Out-Null

  $aMessages = Invoke-RestMethod `
    -Uri "$SupabaseUrl/rest/v1/messages?select=id&conversation_id=eq.$($conversation[0].id)" `
    -Method GET `
    -Headers @{ apikey = $PublishableKey; authorization = "Bearer $($a.token)" }
  $cMessages = Invoke-RestMethod `
    -Uri "$SupabaseUrl/rest/v1/messages?select=id&conversation_id=eq.$($conversation[0].id)" `
    -Method GET `
    -Headers @{ apikey = $PublishableKey; authorization = "Bearer $($c.token)" }

  $blockBody = @{ blocker_id = $a.id; blocked_id = $c.id } | ConvertTo-Json
  Invoke-RestMethod `
    -Uri "$SupabaseUrl/rest/v1/blocks" `
    -Method POST `
    -Headers @{ apikey = $PublishableKey; authorization = "Bearer $($a.token)"; 'content-type' = 'application/json'; Prefer = 'return=minimal' } `
    -Body $blockBody | Out-Null
  $blockedProfileRead = Invoke-RestMethod `
    -Uri "$SupabaseUrl/rest/v1/profiles?select=id&id=eq.$($c.id)" `
    -Method GET `
    -Headers @{ apikey = $PublishableKey; authorization = "Bearer $($a.token)" }
  $blockedSwipeRejected = Invoke-ExpectFailure {
    $swipeBody = @{ target_profile_id = $a.id; direction = 'like' } | ConvertTo-Json
    Invoke-RestMethod `
      -Uri "$SupabaseUrl/rest/v1/rpc/record_swipe" `
      -Method POST `
      -Headers @{ apikey = $PublishableKey; authorization = "Bearer $($c.token)"; 'content-type' = 'application/json' } `
      -Body $swipeBody
  }

  $mediaBody = @{
    owner_id = $b.id
    purpose = 'personal_avatar'
    object_key = 'smoke/rls/' + [guid]::NewGuid().ToString('N') + '.png'
    mime_type = 'image/png'
    byte_size = 68
    visibility = 'public'
    status = 'ready'
    moderation_status = 'approved'
  } | ConvertTo-Json
  $media = Invoke-RestMethod `
    -Uri "$SupabaseUrl/rest/v1/media_assets?select=id" `
    -Method POST `
    -Headers @{ apikey = $ServiceRoleKey; authorization = "Bearer $ServiceRoleKey"; 'content-type' = 'application/json'; Prefer = 'return=representation' } `
    -Body $mediaBody
  Invoke-RestMethod `
    -Uri "$SupabaseUrl/rest/v1/media_assets?id=eq.$($media[0].id)" `
    -Method DELETE `
    -Headers @{ apikey = $PublishableKey; authorization = "Bearer $($a.token)"; Prefer = 'return=minimal' } | Out-Null
  $mediaStillExists = Invoke-RestMethod `
    -Uri "$SupabaseUrl/rest/v1/media_assets?select=id&id=eq.$($media[0].id)" `
    -Method GET `
    -Headers @{ apikey = $ServiceRoleKey; authorization = "Bearer $ServiceRoleKey" }

  [pscustomobject]@{
    directMatchBlocked = $directMatchBlocked
    memberCanReadMessages = ($aMessages.Count -eq 1)
    nonMemberCannotReadMessages = ($cMessages.Count -eq 0)
    blockedUserHidden = ($blockedProfileRead.Count -eq 0)
    blockedSwipeRejected = $blockedSwipeRejected
    userCannotDeleteOthersMedia = ($mediaStillExists.Count -eq 1)
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
      }
      catch {
        Write-Warning "Failed to clean smoke user $($user.id): $($_.Exception.Message)"
      }
    }
  }
}
