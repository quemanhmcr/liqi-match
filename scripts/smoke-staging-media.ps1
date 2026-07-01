param(
  [Parameter(Mandatory = $true)]
  [string]$SupabaseUrl,

  [Parameter(Mandatory = $true)]
  [string]$PublishableKey,

  [Parameter(Mandatory = $true)]
  [string]$ServiceRoleKey,

  [Parameter(Mandatory = $true)]
  [string]$MediaBaseUrl
)

$ErrorActionPreference = 'Stop'

$created = $null
$tmpFiles = @()

function Read-WebErrorBody {
  param([Parameter(Mandatory = $true)]$ErrorRecord)

  $response = $ErrorRecord.Exception.Response
  if (-not $response) {
    return $ErrorRecord.Exception.Message
  }

  $stream = $response.GetResponseStream()
  if (-not $stream) {
    return $ErrorRecord.Exception.Message
  }

  $reader = New-Object System.IO.StreamReader($stream)
  return $reader.ReadToEnd()
}

try {
  $email = 'full-smoke+' + [guid]::NewGuid().ToString('N') + '@example.test'
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
  $token = $session.access_token

  $profileBody = @{ id = $created.id; display_name = 'Full Smoke' } | ConvertTo-Json
  Invoke-RestMethod `
    -Uri "$SupabaseUrl/rest/v1/profiles" `
    -Method POST `
    -Headers @{ apikey = $PublishableKey; authorization = "Bearer $token"; 'content-type' = 'application/json'; Prefer = 'return=minimal' } `
    -Body $profileBody | Out-Null

  $pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='
  $bytes = [Convert]::FromBase64String($pngBase64)
  $uploadFile = Join-Path $env:TEMP ('liqi-smoke-' + [guid]::NewGuid().ToString('N') + '.png')
  $tmpFiles += $uploadFile
  [System.IO.File]::WriteAllBytes($uploadFile, $bytes)

  $mediaBody = @{
    purpose = 'personal_avatar'
    originalFilename = 'avatar.png'
    mimeType = 'image/png'
    byteSize = $bytes.Length
    width = 1
    height = 1
  } | ConvertTo-Json
  $media = Invoke-RestMethod `
    -Uri "$SupabaseUrl/functions/v1/media-create-upload" `
    -Method POST `
    -Headers @{ authorization = "Bearer $token"; 'content-type' = 'application/json' } `
    -Body $mediaBody

  $uploadCode = & curl.exe -s -o NUL -w "%{http_code}" `
    -X PUT $media.uploadUrl `
    -H "content-type: image/png" `
    -H "content-length: $($bytes.Length)" `
    -H "if-none-match: *" `
    --data-binary "@$uploadFile"

  if ($uploadCode -ne '200') {
    throw "R2 PUT failed with HTTP $uploadCode"
  }

  $finalizeBody = @{ assetId = $media.assetId } | ConvertTo-Json
  try {
    $finalize = Invoke-RestMethod `
      -Uri "$SupabaseUrl/functions/v1/media-finalize-upload" `
      -Method POST `
      -Headers @{ authorization = "Bearer $token"; 'content-type' = 'application/json' } `
      -Body $finalizeBody
  }
  catch {
    throw "Finalize failed: $(Read-WebErrorBody $_)"
  }

  $patchBody = @{ status = 'ready'; moderation_status = 'approved' } | ConvertTo-Json
  Invoke-RestMethod `
    -Uri "$SupabaseUrl/rest/v1/media_assets?id=eq.$($media.assetId)" `
    -Method PATCH `
    -Headers @{ apikey = $ServiceRoleKey; authorization = "Bearer $ServiceRoleKey"; 'content-type' = 'application/json'; Prefer = 'return=minimal' } `
    -Body $patchBody | Out-Null

  $downloadFile = Join-Path $env:TEMP ('liqi-smoke-download-' + [guid]::NewGuid().ToString('N') + '.png')
  $tmpFiles += $downloadFile
  $downloadCode = & curl.exe -s -o $downloadFile -w "%{http_code}" "$MediaBaseUrl/media/$($media.assetId)"
  $downloadSize = (Get-Item $downloadFile).Length

  $deleteBody = @{ assetId = $media.assetId } | ConvertTo-Json
  $delete = Invoke-RestMethod `
    -Uri "$SupabaseUrl/functions/v1/media-delete" `
    -Method POST `
    -Headers @{ authorization = "Bearer $token"; 'content-type' = 'application/json' } `
    -Body $deleteBody

  $finalDeleteStatus = $delete.status
  for ($attempt = 0; $attempt -lt 12; $attempt += 1) {
    Start-Sleep -Seconds 2
    $rows = Invoke-RestMethod `
      -Uri "$SupabaseUrl/rest/v1/media_assets?select=status&id=eq.$($media.assetId)" `
      -Method GET `
      -Headers @{ apikey = $ServiceRoleKey; authorization = "Bearer $ServiceRoleKey" }

    if ($rows.Count -gt 0) {
      $finalDeleteStatus = $rows[0].status
    }

    if ($finalDeleteStatus -eq 'deleted') {
      break
    }
  }

  [pscustomobject]@{
    assetId = $media.assetId
    objectKey = $media.objectKey
    uploadCode = $uploadCode
    finalizeStatus = $finalize.status
    downloadCode = $downloadCode
    downloadSize = $downloadSize
    deleteStatus = $delete.status
    finalDeleteStatus = $finalDeleteStatus
  } | ConvertTo-Json -Compress
}
finally {
  foreach ($file in $tmpFiles) {
    if (Test-Path -LiteralPath $file) {
      Remove-Item -LiteralPath $file -Force
    }
  }

  if ($created -and $created.id) {
    try {
      Invoke-RestMethod `
        -Uri "$SupabaseUrl/auth/v1/admin/users/$($created.id)" `
        -Method DELETE `
        -Headers @{ apikey = $ServiceRoleKey; authorization = "Bearer $ServiceRoleKey" } | Out-Null
    }
    catch {
      Write-Warning "Failed to clean smoke user $($created.id): $($_.Exception.Message)"
    }
  }
}
