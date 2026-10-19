$variableName = "DEEPSEEK_API_KEY"
$currentUserValue = [Environment]::GetEnvironmentVariable($variableName, [EnvironmentVariableTarget]::User)
$shouldConfigure = $true

if (-not [string]::IsNullOrWhiteSpace($currentUserValue)) {
  $overwriteResponse = Read-Host "$variableName zaten tanımlı. Değiştirilsin mi? [y/N]"

  if ($overwriteResponse -notmatch '^(y|yes|e|evet)$') {
    Write-Output "Mevcut kullanıcı değişkeni korunarak işlem iptal edildi."
    $shouldConfigure = $false
    $currentUserValue = $null
    $overwriteResponse = $null
  }
}

if ($shouldConfigure) {
  $secureApiKey = Read-Host "DeepSeek API anahtarını gir" -AsSecureString

  if ($secureApiKey.Length -eq 0) {
    $secureApiKey.Dispose()
    throw "API anahtarı boş olamaz."
  }

  $apiKeyPointer = [IntPtr]::Zero
  $plainApiKey = $null

  try {
    $apiKeyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureApiKey)
    $plainApiKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($apiKeyPointer)
    [Environment]::SetEnvironmentVariable($variableName, $plainApiKey, [EnvironmentVariableTarget]::User)

    $storedUserValue = [Environment]::GetEnvironmentVariable($variableName, [EnvironmentVariableTarget]::User)

    if ([string]::IsNullOrWhiteSpace($storedUserValue)) {
      throw "Kullanıcı ortam değişkeni doğrulanamadı."
    }

    Write-Output "$variableName Windows kullanıcı ortam değişkenine kaydedildi. Codex Desktop'ı yeniden başlat."
  }
  finally {
    if ($apiKeyPointer -ne [IntPtr]::Zero) {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($apiKeyPointer)
    }

    $secureApiKey.Dispose()
    $plainApiKey = $null
    $storedUserValue = $null
    $currentUserValue = $null
    Remove-Variable apiKeyPointer, plainApiKey, secureApiKey, storedUserValue, currentUserValue, overwriteResponse -ErrorAction SilentlyContinue
  }
}
