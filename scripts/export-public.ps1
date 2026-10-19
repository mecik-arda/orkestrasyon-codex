param(
    [string]$Source = (Split-Path -Parent $PSScriptRoot),
    [string]$Staging = (Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "hades-orchestrator-public"),
    [switch]$ScanOnly
)

$ErrorActionPreference = "Stop"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Read-TextFile([string]$Path) {
    return [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
}

function Write-TextFile([string]$Path, [string]$Content) {
    [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

function Replace-InFile([string]$Path, [string]$OldValue, [string]$NewValue) {
    if (-not (Test-Path -LiteralPath $Path)) { return }
    $content = Read-TextFile $Path
    if ($content.Contains($OldValue)) {
        Write-TextFile $Path $content.Replace($OldValue, $NewValue)
        Write-Host "sanitize: $($Path.Substring($Staging.Length + 1))  [$OldValue] -> [$NewValue]"
    }
}

function Copy-FreshStaging {
    $parent = Split-Path -Parent $Staging
    $gitBackup = Join-Path $parent ((Split-Path -Leaf $Staging) + ".git-backup")
    $gitDirectory = Join-Path $Staging ".git"
    if (Test-Path -LiteralPath $gitBackup) {
        if (Test-Path -LiteralPath $gitDirectory) {
            Remove-Item -LiteralPath $gitBackup -Recurse -Force
        } else {
            Move-Item -LiteralPath $gitBackup -Destination $gitDirectory -Force
        }
    }
    if (Test-Path -LiteralPath $Staging) {
        if (Test-Path -LiteralPath $gitDirectory) {
            Move-Item -LiteralPath $gitDirectory -Destination $gitBackup -Force
        }
        Remove-Item -LiteralPath $Staging -Recurse -Force
    }
    New-Item -ItemType Directory -Path $Staging -Force | Out-Null
    $generatedPluginsDirectory = Join-Path $Source ".opencode\plugins"
    robocopy $Source $Staging /E /NFL /NDL /NJH /NJS /NP `
        /XD .git node_modules memory logs state cache pilot-workspace .hades .codex $generatedPluginsDirectory `
        /XF .git .env *.log KURULUM_RAPORU.md export-public.ps1 export-public.test.js > $null
    if ($LASTEXITCODE -ge 8) { throw "robocopy basarisiz oldu (kod $LASTEXITCODE)" }
    if (Test-Path -LiteralPath $gitBackup) {
        Move-Item -LiteralPath $gitBackup -Destination $gitDirectory -Force
    }
}

function Rename-ExampleFiles {
    $opencodeExample = Join-Path $Staging "opencode.jsonc.example"
    if ((Test-Path -LiteralPath (Join-Path $Staging "opencode.jsonc")) -and -not (Test-Path -LiteralPath $opencodeExample)) {
        Move-Item -LiteralPath (Join-Path $Staging "opencode.jsonc") -Destination $opencodeExample
    }
}

function Curate-PublicDocs {
    $architecture = Join-Path $Staging "docs\architecture"
    New-Item -ItemType Directory -Path $architecture -Force | Out-Null
    $publicDocs = @(
        "CONTEXT_ORKESTRASYONU_VE_GUVENLI_SECOND_BRAIN_PLANI_2026-08-21.md",
        "DEEPSEEK_EDIT_PILOT_VE_MIRROR_KARARLILIK_PLANI.md",
        "MODEL_KIMLIGI_VE_ERISIM_MODU_PLANI.md",
        "RECENT_RUNS_GOZLEMLENEBILIRLIK_PLANI.md"
    )
    $plansDirectory = Join-Path $Staging "docs\plans"
    $planSubdirectories = @("yapilanlar", "yarim-kalanlar", "yapilmayanlar")
    foreach ($name in $publicDocs) {
        $matches = @()
        foreach ($subdirectory in $planSubdirectories) {
            $candidate = Join-Path (Join-Path $plansDirectory $subdirectory) $name
            if (Test-Path -LiteralPath $candidate) {
                $matches += $candidate
            }
        }
        if ($matches.Count -eq 0) {
            throw "architecture document source missing: $name"
        }
        if ($matches.Count -gt 1) {
            throw "architecture document source ambiguous: $name"
        }
        Move-Item -LiteralPath $matches[0] -Destination $architecture
    }
    foreach ($directory in @("docs\plans", "docs\reports", "docs\handoffs")) {
        $target = Join-Path $Staging $directory
        if (Test-Path -LiteralPath $target) {
            Remove-Item -LiteralPath $target -Recurse -Force
        }
    }
}

function Apply-SanitizeRules {
    $escaped = @(
        @{ File = "config\agents.json"; Old = "C:\\nvm4w\\nodejs\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe"; New = "claude" },
        @{ File = "config\agents.json"; Old = "C:\\Users\\user\\AppData\\Local\\Programs\\OpenAI\\Codex\\bin\\codex.exe"; New = "codex" },
        @{ File = "config\agents.json"; Old = "C:\\nvm4w\\nodejs\\node_modules\\opencode-ai\\bin\\opencode.exe"; New = "opencode" },
        @{ File = "config\agents.json"; Old = "C:\\Users\\user\\AppData\\Local\\agy\\bin\\agy.exe"; New = "agy" },
        @{ File = "config\policy.json"; Old = "C:\\Users\\user\\Desktop\\Yazılım_Siber"; New = "C:\\Users\\ornek\\Desktop\\Projeler" },
        @{ File = "tests\config.test.js"; Old = "C:\\Users\\user\\Desktop\\Yazılım_Siber"; New = "C:\\Users\\ornek\\Desktop\\Projeler" },
        @{ File = "tasks\templates\task.template.json"; Old = "C:\\Users\\user\\Desktop\\Yazılım_Siber\\proje"; New = "/path/to/workspace" },
        @{ File = "scripts\pilot-mcp.js"; Old = 'const projectRoot = "C:\\Users\\user\\Desktop\\Yazılım_Siber\\orkestrasyon";'; New = "const projectRoot = process.env.ORCHESTRATOR_PROJECT_ROOT || process.cwd();" },
        @{ File = "scripts\pilot-mcp.js"; Old = 'command: "C:\\nvm4w\\nodejs\\node.exe",'; New = "command: process.execPath," },
        @{ File = "scripts\start-codex.ps1"; Old = '& "C:\Users\user\.codex\.sandbox-bin\codex.exe"'; New = "& codex" },
        @{ File = "scripts\smoke-mcp.js"; Old = '"C:\\nvm4w\\nodejs\\node.exe"'; New = "process.execPath" },
        @{ File = "tests\glm-subagent.test.js"; Old = '"C:\\nvm4w\\nodejs\\node_modules\\opencode-ai\\bin\\opencode.exe"'; New = '"opencode"' },
        @{ File = "opencode.jsonc.example"; Old = "C:\\nvm4w\\nodejs\\node.exe"; New = "node" },
        @{ File = "opencode.jsonc.example"; Old = "C:\\Users\\user\\Desktop\\Yazılım_Siber\\orkestrasyon"; New = "<repo-root>" },
        @{ File = "opencode.jsonc.example"; Old = "C:\\Users\\user\\.config\\subagent-bridge\\config.json"; New = "~/.config/subagent-bridge/config.json" }
    )
    foreach ($rule in $escaped) {
        Replace-InFile (Join-Path $Staging $rule.File) $rule.Old $rule.New
    }

    $codeFiles = Get-ChildItem -LiteralPath $Staging -Recurse -File | Where-Object { @(".js", ".json") -contains $_.Extension.ToLowerInvariant() }
    foreach ($file in $codeFiles) {
        Replace-InFile $file.FullName "DersMerkezi" "projectBeta"
        Replace-InFile $file.FullName "Dersmerkezi" "projectBeta"
        Replace-InFile $file.FullName "dersmerkezi" "project_beta"
        Replace-InFile $file.FullName "DERSMERKEZI" "PROJECT_BETA"
        Replace-InFile $file.FullName "Norn" "projectAlpha"
        Replace-InFile $file.FullName "norn" "project_alpha"
        Replace-InFile $file.FullName "NORN" "PROJECT_ALPHA"
    }

    $markdownFiles = Get-ChildItem -LiteralPath $Staging -Recurse -File | Where-Object { $_.Extension -eq ".md" }
    foreach ($file in $markdownFiles) {
        Replace-InFile $file.FullName '`docs/reports/kalici-hafiza-piyasa-arastirma-2026-08-21.md`' 'kaynaklı piyasa araştırması raporu'
        Replace-InFile $file.FullName '`docs/reports/VIDEO_KAYNAKLI_PLANLAR_UYGUNLUK_ANALIZI_2026-09-21.md`' 'video kaynaklı uygunluk değerlendirmesi'
        Replace-InFile $file.FullName '`docs/plans/yapilanlar/KALICI_HAFIZA_PIYASA_ARASTIRMASI_2026-08-21.md`' 'kaynaklı piyasa araştırması raporu'
        Replace-InFile $file.FullName '`docs/plans/yarim-kalanlar/M2_PROJE_COHORT_ETIKETLEME_PLANI_2026-09-24.md`' 'önceden onaylı cohort planı (özel kaynak deposunda)'
        Replace-InFile $file.FullName '`docs/reports` icin rapor dosyasi adlandirma, zorunlu metadata ve kaynak formatini tanimla.' 'Raporlar icin dosya adlandirma, zorunlu metadata ve kaynak formatini tanimla.'
        Replace-InFile $file.FullName '`docs/plans` altinda uygulama oncesi spec sablonu tanimla.' 'Uygulama oncesi kullanilacak mini-spec sablonunu tanimla.'
        Replace-InFile $file.FullName 'hedef dosya yolunu (ör. `docs/plans/<tarih>-<konu>.md`), kaynakta doğrulanmış plan içeriğini' 'hedef dosya yolunu, kaynakta doğrulanmış plan içeriğini'
        Replace-InFile $file.FullName 'yeni ücretli çalışma için açık kullanıcı onayı iste ve kaydı `docs/reports/UCRETLI_CALISMA_ONAY_KAYDI.md` içine işle.' 'yeni ücretli çalışma için açık kullanıcı onayı iste ve onay kaydını yerel çalışma ortamında tut.'
        Replace-InFile $file.FullName "DersMerkezi" "Project Beta"
        Replace-InFile $file.FullName "Dersmerkezi" "Project Beta"
        Replace-InFile $file.FullName "dersmerkezi" "project_beta"
        Replace-InFile $file.FullName "DERSMERKEZI" "PROJECT_BETA"
        Replace-InFile $file.FullName "Norn" "Project Alpha"
        Replace-InFile $file.FullName "norn" "project_alpha"
        Replace-InFile $file.FullName "NORN" "PROJECT_ALPHA"
        Replace-InFile $file.FullName "docs/reports/PLAN_UYGULAMA_DENETIMI_2026-09-18.md" "ayrıntılı denetim kaydı ayrı tutulur"
        Replace-InFile $file.FullName "C:\Users\user\Desktop\Yazılım_Siber\orkestrasyon" "<repo-root>"
        Replace-InFile $file.FullName "C:\nvm4w" "%NVM_HOME%"
        Replace-InFile $file.FullName "C:\Users\user\Desktop\Yazılım_Siber" "C:\Users\ornek\Desktop\Projeler"
        Replace-InFile $file.FullName "C:\Users\user" "C:\Users\ornek"
        Replace-InFile $file.FullName "user" "ornek"
        if ($file.FullName -eq (Join-Path $Staging "AGENTS.md")) {
            Replace-InFile $file.FullName '- `docs/plans` altındaki planlar tarihsel kayıttır. Denetlenen planların başında tarihli durum notu bulunur ve güncel durum bu nottan izlenir.' '- Mimari dokümanlar tarihsel karar bağlamını korur; güncel davranış README ve doğrulama komutlarıyla açıklanır.'
            Replace-InFile $file.FullName '- Tamamlanmış video/transcript analiz raporları `docs/plans/videolar` altında tutulur ve `docs/plans/DURUM_INDEKSI.md` içinde listelenir; plan durum klasörleriyle karıştırılmaz.' '- Public belgelerdeki mimari bağlantılar dağıtımda bulunan dosyalara yönlendirilir.'
            Replace-InFile $file.FullName '- Uygulama denetimleri `docs/reports` altında tutulur ve planları geriye dönük değiştirmez; açık maddeler `karar kapısı`, `dış-bağımlı`, `reddedildi` veya `opt-in` olarak etiketlenir.' '- Denetim bulguları uygulamadan ayrı belgelenir; açık maddeler için karar durumu belirtilir.'
            Replace-InFile $file.FullName '- Public dışa aktarımda `docs/plans` yalnız seçili mimari dokümanları `docs/architecture` altına taşır; private rapor referansları temizlenir.' '- Public mimari dokümanları `docs/architecture` altında tutulur.'
        }
    }
}

function Invoke-VerificationScan {
    $patterns = @("user", "Yazılım_Siber", "nvm4w", "Desktop\\Users", "norn", "dersmerkezi")
    $matches = @()
    foreach ($pattern in $patterns) {
        $hits = Get-ChildItem -LiteralPath $Staging -Recurse -File | Where-Object { $_.FullName -notlike "*\.git\*" } | Select-String -SimpleMatch -Pattern $pattern -List
        foreach ($hit in $hits) { $matches += $hit }
    }
    $secretHits = Get-ChildItem -LiteralPath $Staging -Recurse -File | Select-String -Pattern "sk-[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{30,}|AKIA[0-9A-Z]{16}|BEGIN (RSA|EC|OPENSSH|PGP) PRIVATE KEY" -List
    foreach ($hit in $secretHits) { $matches += $hit }

    if ($matches.Count -gt 0) {
        Write-Host "TARAMA: kişisel yol veya secret kalıbı bulundu:"
        $matches | ForEach-Object { Write-Host ("  {0}:{1}" -f $_.Path.Substring($Staging.Length + 1), $_.LineNumber) }
        exit 2
    }
    Write-Host "TARAMA: temiz — kişisel yol veya secret kalıbı yok."
}

if (-not $ScanOnly) {
    Copy-FreshStaging
    Rename-ExampleFiles
    Curate-PublicDocs
    Apply-SanitizeRules
}
Invoke-VerificationScan

Write-Host ""
Write-Host "Staging hazir: $Staging"
Write-Host "Sonraki adimlar (kullanici onayi ile): git init -b main; git add .; ilk commit; yeni remote; push."
exit 0
