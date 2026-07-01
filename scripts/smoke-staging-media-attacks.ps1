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
$users = @()
$objects = @()
$tmpFiles = @()

function New-SmokeUser {
  param([string]$Name)
  $email = "$Name+" + [guid]::NewGuid().ToString('N') + '@example.test'
  $password = 'SmokeTest!123456789'
  $adminBody = @{ email = $email; password = $password; email_confirm = $true } | ConvertTo-Json
  $created = Invoke-RestMethod -Uri "$SupabaseUrl/auth/v1/admin/users" -Method POST -Headers @{ apikey = $ServiceRoleKey; authorization = "Bearer $ServiceRoleKey"; 'content-type' = 'application/json' } -Body $adminBody
  $tokenBody = @{ email = $email; password = $password } | ConvertTo-Json
  $session = Invoke-RestMethod -Uri "$SupabaseUrl/auth/v1/token?grant_type=password" -Method POST -Headers @{ apikey = $PublishableKey; 'content-type' = 'application/json' } -Body $tokenBody
  $profileBody = @{ id = $created.id; display_name = $Name } | ConvertTo-Json
  Invoke-RestMethod -Uri "$SupabaseUrl/rest/v1/profiles" -Method POST -Headers @{ apikey = $PublishableKey; authorization = "Bearer $($session.access_token)"; 'content-type' = 'application/json'; Prefer = 'return=minimal' } -Body $profileBody | Out-Null
  [pscustomobject]@{ id = $created.id; token = $session.access_token }
}

function New-Upload {
  param([string]$Token, [int]$ByteSize = 68, [string]$Checksum = $null)
  $payload = @{ purpose = 'personal_avatar'; originalFilename = 'avatar.png'; mimeType = 'image/png'; byteSize = $ByteSize; width = 1; height = 1 }
  if ($Checksum) {
    $payload.checksum = $Checksum
  }
  $body = $payload | ConvertTo-Json
  Invoke-RestMethod -Uri "$SupabaseUrl/functions/v1/media-create-upload" -Method POST -Headers @{ authorization = "Bearer $Token"; 'content-type' = 'application/json' } -Body $body
}

function Try-Web {
  param([scriptblock]$Call)
  try {
    & $Call | Out-Null
    return [pscustomobject]@{ ok = $true; status = 200 }
  }
  catch {
    return [pscustomobject]@{ ok = $false; status = $_.Exception.Response.StatusCode.value__ }
  }
}

try {
  $owner = New-SmokeUser 'attack-owner'
  $other = New-SmokeUser 'attack-other'
  $users = @($owner, $other)

  $pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='
  $bytes = [Convert]::FromBase64String($pngBase64)
  $pngFile = Join-Path $env:TEMP ('liqi-attack-' + [guid]::NewGuid().ToString('N') + '.png')
  $tmpFiles += $pngFile
  [System.IO.File]::WriteAllBytes($pngFile, $bytes)

  $finalizeBeforeUpload = New-Upload $owner.token
  $objects += $finalizeBeforeUpload.objectKey
  $finalizeBeforeUploadResult = Try-Web {
    $body = @{ assetId = $finalizeBeforeUpload.assetId } | ConvertTo-Json
    Invoke-RestMethod -Uri "$SupabaseUrl/functions/v1/media-finalize-upload" -Method POST -Headers @{ authorization = "Bearer $($owner.token)"; 'content-type' = 'application/json' } -Body $body
  }

  $wrongContentType = New-Upload $owner.token
  $objects += $wrongContentType.objectKey
  $wrongContentTypeCode = & curl.exe -s -o NUL -w "%{http_code}" -X PUT $wrongContentType.uploadUrl -H "content-type: text/plain" -H "content-length: $($bytes.Length)" -H "if-none-match: *" --data-binary "@$pngFile"

  $wrongSize = New-Upload -Token $owner.token -ByteSize ($bytes.Length + 1)
  $objects += $wrongSize.objectKey
  $wrongSizeCode = & curl.exe -s -o NUL -w "%{http_code}" -X PUT $wrongSize.uploadUrl -H "content-type: image/png" -H "content-length: $($bytes.Length)" -H "if-none-match: *" --data-binary "@$pngFile"

  $wrongChecksumValue = [Convert]::ToBase64String((1..32 | ForEach-Object { 0 }))
  $wrongChecksum = New-Upload -Token $owner.token -Checksum $wrongChecksumValue
  $objects += $wrongChecksum.objectKey
  $wrongChecksumCode = & curl.exe -s -o NUL -w "%{http_code}" -X PUT $wrongChecksum.uploadUrl -H "content-type: image/png" -H "content-length: $($bytes.Length)" -H "if-none-match: *" -H "x-amz-checksum-sha256: $wrongChecksumValue" --data-binary "@$pngFile"

  $expired = New-Upload $owner.token
  $objects += $expired.objectKey
  Start-Sleep -Seconds 35
  $expiredCode = & curl.exe -s -o NUL -w "%{http_code}" -X PUT $expired.uploadUrl -H "content-type: image/png" -H "content-length: $($bytes.Length)" -H "if-none-match: *" --data-binary "@$pngFile"

  $valid = New-Upload $owner.token
  $objects += $valid.objectKey
  $uploadCode = & curl.exe -s -o NUL -w "%{http_code}" -X PUT $valid.uploadUrl -H "content-type: image/png" -H "content-length: $($bytes.Length)" -H "if-none-match: *" --data-binary "@$pngFile"
  $otherFinalize = Try-Web {
    $body = @{ assetId = $valid.assetId } | ConvertTo-Json
    Invoke-RestMethod -Uri "$SupabaseUrl/functions/v1/media-finalize-upload" -Method POST -Headers @{ authorization = "Bearer $($other.token)"; 'content-type' = 'application/json' } -Body $body
  }
  $body = @{ assetId = $valid.assetId } | ConvertTo-Json
  $finalized = Invoke-RestMethod -Uri "$SupabaseUrl/functions/v1/media-finalize-upload" -Method POST -Headers @{ authorization = "Bearer $($owner.token)"; 'content-type' = 'application/json' } -Body $body
  $finalizedAgain = Invoke-RestMethod -Uri "$SupabaseUrl/functions/v1/media-finalize-upload" -Method POST -Headers @{ authorization = "Bearer $($owner.token)"; 'content-type' = 'application/json' } -Body $body
  $reuseAfterFinalizeCode = & curl.exe -s -o NUL -w "%{http_code}" -X PUT $valid.uploadUrl -H "content-type: image/png" -H "content-length: $($bytes.Length)" -H "if-none-match: *" --data-binary "@$pngFile"
  $otherDelete = Try-Web {
    Invoke-RestMethod -Uri "$SupabaseUrl/functions/v1/media-delete" -Method POST -Headers @{ authorization = "Bearer $($other.token)"; 'content-type' = 'application/json' } -Body $body
  }

  $patchBody = @{ status = 'ready'; moderation_status = 'approved'; visibility = 'conversation_members' } | ConvertTo-Json
  Invoke-RestMethod -Uri "$SupabaseUrl/rest/v1/media_assets?id=eq.$($valid.assetId)" -Method PATCH -Headers @{ apikey = $ServiceRoleKey; authorization = "Bearer $ServiceRoleKey"; 'content-type' = 'application/json'; Prefer = 'return=minimal' } -Body $patchBody | Out-Null
  $privateNoJwtCode = & curl.exe -s -o NUL -w "%{http_code}" "$MediaBaseUrl/media/$($valid.assetId)"
  $privateWrongJwtCode = & curl.exe -s -o NUL -w "%{http_code}" -H "authorization: Bearer $($other.token)" "$MediaBaseUrl/media/$($valid.assetId)"
  $headersFile = Join-Path $env:TEMP ('liqi-attack-headers-' + [guid]::NewGuid().ToString('N') + '.txt')
  $tmpFiles += $headersFile
  $privateOwnerCode = & curl.exe -s -D $headersFile -o NUL -w "%{http_code}" -H "authorization: Bearer $($owner.token)" "$MediaBaseUrl/media/$($valid.assetId)"
  $privateCacheHeader = (Select-String -Path $headersFile -Pattern '^cache-control:' | Select-Object -First 1).Line

  $statusCodes = @{}
  foreach ($status in @('pending', 'rejected', 'deleted')) {
    $asset = New-Upload $owner.token
    $objects += $asset.objectKey
    $statusPatch = @{
      status = $status
      moderation_status = if ($status -eq 'rejected') { 'rejected' } else { 'approved' }
    } | ConvertTo-Json
    Invoke-RestMethod -Uri "$SupabaseUrl/rest/v1/media_assets?id=eq.$($asset.assetId)" -Method PATCH -Headers @{ apikey = $ServiceRoleKey; authorization = "Bearer $ServiceRoleKey"; 'content-type' = 'application/json'; Prefer = 'return=minimal' } -Body $statusPatch | Out-Null
    $statusCodes[$status] = & curl.exe -s -o NUL -w "%{http_code}" "$MediaBaseUrl/media/$($asset.assetId)"
  }

  $deleteBody = @{ assetId = $valid.assetId } | ConvertTo-Json
  Invoke-RestMethod -Uri "$SupabaseUrl/functions/v1/media-delete" -Method POST -Headers @{ authorization = "Bearer $($owner.token)"; 'content-type' = 'application/json' } -Body $deleteBody | Out-Null

  [pscustomobject]@{
    finalizeBeforeUploadRejected = ($finalizeBeforeUploadResult.status -eq 409)
    wrongContentTypeRejected = ($wrongContentTypeCode -ne '200')
    wrongSizeRejected = ($wrongSizeCode -ne '200')
    wrongChecksumRejected = ($wrongChecksumCode -ne '200')
    expiredUrlRejected = ($expiredCode -ne '200')
    uploadCode = $uploadCode
    otherFinalizeRejected = ($otherFinalize.status -eq 404)
    finalizeIdempotent = ($finalized.status -eq 'uploaded' -and $finalizedAgain.idempotent -eq $true)
    reuseAfterFinalizeRejected = ($reuseAfterFinalizeCode -ne '200')
    otherDeleteRejected = ($otherDelete.status -eq 404)
    workerPendingRejected = ($statusCodes['pending'] -eq '404')
    workerRejectedRejected = ($statusCodes['rejected'] -eq '404')
    workerDeletedRejected = ($statusCodes['deleted'] -eq '404')
    privateNoJwt401 = ($privateNoJwtCode -eq '401')
    privateWrongJwt404 = ($privateWrongJwtCode -eq '404')
    privateOwner200 = ($privateOwnerCode -eq '200')
    privateNoPublicCache = ($privateCacheHeader -match 'private, no-store')
  } | ConvertTo-Json -Compress
}
finally {
  foreach ($file in $tmpFiles) {
    if (Test-Path -LiteralPath $file) {
      Remove-Item -LiteralPath $file -Force
    }
  }

  foreach ($objectKey in $objects) {
    if ($objectKey) {
      try {
        $env:CLOUDFLARE_API_TOKEN = $env:CLOUDFLARE_API_TOKEN
        npx --prefix cloudflare/media-worker wrangler r2 object delete "liqi-match-media-staging/$objectKey" --remote | Out-Null
      } catch {}
    }
  }

  foreach ($user in $users) {
    if ($user.id) {
      try {
        Invoke-RestMethod -Uri "$SupabaseUrl/auth/v1/admin/users/$($user.id)" -Method DELETE -Headers @{ apikey = $ServiceRoleKey; authorization = "Bearer $ServiceRoleKey" } | Out-Null
      } catch {}
    }
  }
}
