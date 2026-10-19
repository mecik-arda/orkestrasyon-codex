# Hades Orchestrator Kurulum ve Doğrulama Raporu

## Etkin mimari

- OpenCode Host, `@orchestrator` ve local stdio MCP üzerinden provider-neutral `subagent-bridge` araçlarını çağırır.
- Gemini Pro ve Gemini Flash yalnız AntigravityAdapter ile AGY üzerinden yönlendirilir.
- CodexAdapter official Windows standalone Codex CLI'ı kullanır.
- ClaudeCodeAdapter native Claude Code yoludur; Antigravity Claude Sonnet'tan ayrıdır.
- OpenCodeAdapter yalnız açıkça yapılandırılmış bağımsız OpenCode provider/model execution'ı içindir ve Gemini backend'i değildir.
- DeepSeek Pro ve Flash, OpenCodeAdapter üzerinden doğrudan `deepseek/deepseek-v4-pro` ve canonical `deepseek/deepseek-flash` modellerine yönlendirilir; `flashModelAlias` `deepseek_flash` bu canonical kimliğe ve DeepSeek-V4.1-Flash sürümüne çözülür. Legacy `deepseek/deepseek-v4-flash` uyumluluk için allowlist'te tutulur. Sürüm metadata'sı `flashModelVersionVerifiedAt` ve `flashModelVersionReviewAfter` ile tarihe bağlanır; opencode hedefli profil modelleri ve deepseek model alanları yükleme sınırında `allowedModels` allowlist'ine karşı doğrulanır.
- GLM 5.2, HighSpeed, 5.3 ve 5.3 Flash, OpenCodeAdapter üzerinden sırasıyla `zai-coding-plan/glm-5.2`, `zai-coding-plan/glm-5.2-highspeed`, `zai-coding-plan/glm-5.3` ve `zai-coding-plan/glm-5.3-flash` modellerine yönlendirilir.
- Host/orchestrator modeli subagent backend'inden bağımsızdır.

## MCP araçları

- `check_deepseek_subagent`
- `run_deepseek_subagent`
- `run_deepseek_edit_pilot`
- `run_glm_subagent`
- `run_glm_edit_pilot`
- `check_glm_subagent`
- `check_antigravity_subagent`
- `run_antigravity_subagent`
- `run_claude_code_subagent`
- `run_opencode_subagent`
- `run_codex_subagent`
- `run_task_profile`
- `check_subagent_bridge`
- `check_workspace_lock`
- `check_persistent_memory`
- `search_persistent_memory`
- `read_persistent_memory`
- `review_persistent_memory`
- `analyze_memory_write`
- `store_persistent_memory`
- `promote_memory`

## Güvenlik kontrolleri

- Antigravity read-only policy `write_file(*)` erişimini reddeder ve genel `command(*)` izni vermez; harici MCP sunucusu veya dar allowlist dışı kalıtsal izin varsa provider başlamadan reddedilir.
- Gemini routing OpenCodeAdapter üzerinden yapılamaz.
- Codex read-only modu native `read-only`, edit modu native `workspace-write` sandbox kullanır.
- Codex normal execution path sandbox veya approval bypass içermez.
- Delegation depth `MAX_DELEGATION_DEPTH = 1` ile sınırlandırılır.
- Edit modundaki belirsiz mutation state otomatik retry edilmez.
- Provider timeout sonrasında orchestrator kullanıcı talebi olmadan farklı timeout ile aynı provider'ı tekrar çağırmaz.

- Yerel analiz rollerinde ağ araçları bulunmaz.
- Web araştırması rolünde yerel dosya araçları bulunmaz.
- DeepSeek varsayılan salt-okunur modda çalışır; `run_deepseek_subagent` içindeki kontrollü implementer edit yalnız atanmış dosyalarda disposable doğrulama ve promotion üzerinden uygulanır. `run_deepseek_edit_pilot` ana workspace'i değiştirmeden diff üretir. Kabuk, delegation, Vault veya kısıtlanmamış yazma erişimi yoktur.
- GLM, `run_glm_subagent` ile aynı kontrollü `read_only/edit` sözleşmesini kullanır. Edit yalnız `implementer`, seçilmiş hedef dosyalar ve disposable workspace üzerinden promotion ile uygulanır.
- GLM read-only sonucu sıkı JSON şemasıyla doğrulanır ve redacted checkpoint metadata'sı saklanır. `check_glm_subagent` model eşlemesini doğrular; `run_glm_edit_pilot` ana workspace'i değiştirmeden disposable diff üretir.
- Native Claude Code oturum kalıcılığı kapalıdır.
- İzinli workspace kökü ve korunan bellek kökü reddi korunur; salt-okunur DeepSeek çağrıları Git olmayan izinli projelerde de çalışır.
- Secret değerleri kaynak koduna veya checkpoint'e yazılmaz.
- Proje içindeki `memory` Vault'u DeepSeek çalışma alanı olarak reddedilir; DeepSeek Vault'u doğrudan okuyamaz veya değiştiremez.
- Kalıcı hafıza yalnızca Codex tarafından ihtiyaç halinde aranır; yazma işlemleri izinli PARA klasörleri, SHA-256 eşzamanlılık denetimi ve secret taramasıyla sınırlandırılır. Arama/okuma çıktıları da secret taramasından geçer; injection şüphelileri fail-closed karantinaya alınır ve güvenli alıntılar `UNTRUSTED_CONTENT` olarak işaretlenir.
- Süresi dolan notlar normal aramada soft-expiry ile gizlenir; yazma öncesi tekrar/çelişki analizi ve redacted hash tabanlı audit journal uygulanır.
- Yeni hafıza notları Inbox draft olarak oluşturulur; yayınlama SHA-256 kontrollü, çift kilitli ve idempotent `promote_memory` akışıyla yapılır.

## Güvenilirlik ve yerel gözlemlenebilirlik

- Final host acceptance gerçek Gemini Pro ve Codex file-backed sonuçlarını iki bağımsız execution ile almış ve synthesis tamamlamıştır.
- Acceptance sırasında provider başına tek çağrı, sıfır timeout override, sıfır orchestrator provider retry ve sıfır fallback gözlenmiştir.
- Repository mutation ve test-created orphan process sayısı sıfırdır.
- Antigravity settings orijinal byte içeriğine dönmüş ve stale sentinel kalmamıştır.
- Güncel regresyon baseline `411/411 PASS`; tam doğrulama `npm run verify`, `npm run verify:ci`, `npm run smoke`, `npm run memory:review`, `npm run memory:evaluate`, kontrollü DeepSeek komutları ve GLM `npm run accept:read:glm` ile `npm run accept:edit:glm` acceptance komutlarını kapsar.

- DeepSeek çıktısı köprüde Zod ile çalışma zamanında doğrulanır; OpenCode serbest metni danışmanlık şemasına normalize edildikten sonra yeniden doğrulanır.
- Geçici ağ, zaman aşımı, hız limiti ve sunucu hatalarında jitter içeren sınırlı üstel geri çekilme uygulanır.
- İzin, path traversal, secret veya diğer güvenlik ihlallerinde fail-fast davranılır; yeniden deneme yapılmaz.
- Deneme sayısı, toplam süre ve retry maliyet bütçeleri `~/.config/subagent-bridge/config.json` içindeki `reliability` alanında tanımlıdır.
- Redacted çalışma metrikleri `%LOCALAPPDATA%\subagent-bridge\logs\metrics\<backend>-runs.jsonl` içinde yerel tutulur; prompt, araç çıktısı, Vault içeriği, workspace yolu, görev kimliği ve secret kaydedilmez.
- Yerel metrik özeti `npm run metrics`, metric retention temizliği `npm run metrics:prune`, audit retention temizliği `npm run memory:prune-audit` ile alınır.
- Hafıza yaşam döngüsü `npm run memory:review`, retrieval kalite baseline'ı `npm run memory:evaluate` ile doğrulanır.
- Policy `configVersion: 2` şemasıyla doğrulanır; eski version 1 policy çalışma belleğinde version 2'ye migrate edilir.
- Aktif workspace lock'ları heartbeat lease ile yenilenir; stale cleanup yaşayan uzun işlemin lock'unu kaldırmaz.
- Günlük ve aylık maliyet limitleri atomik reservation/settlement journal ile hard cap olarak uygulanır; provider health circuit breaker ayrı state makinesidir.
- Named-provider çağrıları fallback yapmaz. Read-only task profillerinde fallback tanımlı değildir. Yalnız policy'de açık hedefleri bulunan edit task profile çağrıları her denemede temiz disposable workspace, tek provider denemesi, secret fail-closed kontrolü ve doğrulanmış promotion ile fallback kullanabilir.
- Kişisel global OpenCode entegrasyonu Codex Luna, Terra ve Sol için seçilmiş dosyalarla sınırlı controlled-edit araçlarını ve edit task profile aracını açar; doğrudan workspace yazma yetkisi vermez.

## Ortak kurallar ve skill'ler

- Codex başlangıç kuralları `AGENTS.md` içindedir.
- DeepSeek çağrısına yalnız seçilen skill içeriği ve dar görev sözleşmesi eklenir.
- On iki uzman skill `.agents/skills` altında tutulur ve `.claude/skills` altına eşlenir; proje dışında da kullanılabilmesi için `~/.config/opencode/skills`, `~/.codex/skills`, `~/.claude/skills` ve `~/.agents/skills` global dizinlerine aynı içerikle kurulur.
- `npm run verify` izinli skill'ler için proje `.agents/skills` ve `.claude/skills` kopyalarının SHA-256 özetlerini karşılaştırır; elle kurulan global kopyalar bu kapının dışındadır.

## Başlatma

```powershell
Set-Location -LiteralPath "C:\Users\user\Desktop\Yazılım_Siber\orkestrasyon"
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\start-codex.ps1"
```

Mevcut Codex veya Codex Desktop oturumu ortam değişkenleri ayarlanmadan önce açıldıysa kapatılıp yeniden başlatılmalıdır.

Codex proje kapsamındaki `.codex/config.toml` dosyasını yalnızca güvenilir projelerde yükler. İlk açılışta `C:\Users\user\Desktop\Yazılım_Siber\orkestrasyon` klasörü için güven istemi onaylanmalıdır. Bu onay verilene kadar `deepseek-subagent` MCP sunucusu Codex araç listesinde görünmez.

## Canonical executables

```text
Antigravity:
C:\Users\user\AppData\Local\agy\bin\agy.exe

Codex:
C:\Users\user\.codex\packages\standalone\releases\0.147.0-x86_64-pc-windows-msvc\bin\codex.exe
```

Antigravity `1.1.11` ve Codex `codex-cli 0.147.0` gerçek provider acceptance sırasında doğrulanmıştır. Codex standalone paketinde `codex.exe`, `codex-code-mode-host.exe`, `rg.exe`, `codex-command-runner.exe` ve `codex-windows-sandbox-setup.exe` bulunmuştur. Legacy `.codex\.sandbox-bin\codex.exe` mevcut olabilir ancak bridge tarafından kullanılmaz.

Canonical verified baseline, provider matrisi, teknik borç ve freeze kuralları için `README.md` içindeki `Verified baseline` bölümü esas alınır.

## Plan uygulama denetimi

İlk beş planın uygulanma durumu `docs/reports/PLAN_UYGULAMA_DENETIMI_2026-09-18.md` içinde kanıta dayalı olarak denetlenmiştir. Her planın başında tarihli durum notu bulunur; güncel doğrulama için plan içindeki sabit test sayıları yerine `npm test` ve `npm run verify:ci` esas alınır. DeepSeek edit operasyonel kabulü `npm run pilot:edit:deepseek` ve `npm run accept:edit:deepseek` canlı çalıştırmalarıyla alınmıştır.

## API anahtarı notu

DeepSeek provider kimlik bilgileri OpenCode'un kullanıcı yapılandırmasında tutulur. Kimlik bilgileri kaynak koda, policy dosyasına, prompta, checkpoint'e veya loglara yazılmaz.
