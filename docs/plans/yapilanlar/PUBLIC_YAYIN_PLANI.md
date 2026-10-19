# Public Yayın Planı

## Amaç ve karar durumu

Bu repo (mevcut ad: `orkestrasyon`, paket adı: `hades-orchestrator`) public yapılacaktır. Kabul edilen strateji: **sıfır geçmişli yeni public repo** kurmak; mevcut private repo ve geçmişi dokunulmadan arşivde kalır. Public repo, temizlenmiş ağaçtan tek squashed commit ile açılır.

> Durum notu (2026-09-18): Plan uygulandı. Public repo `hades-orchestrator-public` (`main`) mevcuttur; `scripts/export-public.ps1` kişisel içeriği dışlar, sanitizasyon ve secret taraması uygular; dört mimari doküman `docs/architecture` altına taşınmıştır; ilk yayın tek import commit'i ile yapılmıştır ve sonraki senkronlar private → public tek yönlüdür. Kalan izleme: her yayın öncesi tarama ve Actions doğrulaması.

Durum notu (2026-10-10): Güncel private `master` commit'i `659db8a` olarak `origin/master`'a; sanitized public export `af78c8c` olarak `hades-orchestrator/main` dalına push edilmiştir. `hades-orchestrator-public` yerel staging klasörünün adıdır; GitHub repository adı `hades-orchestrator`'dır. Dışa aktarımda secret/kişisel-yol taraması temiz geçti; private kurulum raporu, hafıza, log/state/cache, private plan/raporlar ve üretilmiş `.opencode/plugins` içeriği dışarıda kaldı. OpenCode batch-progress eklentisi portable `templates/opencode/parallel-batch-progress.js` olarak public'e taşındı ve README kopyalama adımıyla hizalandı. MCP SDK `1.32.1` ve `proxy-addr` `2.0.8` güncellemeleriyle `npm audit --omit=dev` her iki ağaçta 0 bulgu verdi.

Durum notu (2026-10-11): Private `master` güncellemeleri `3ee6a31` ve public-only test exclusion düzeltmesi `b83a2e1` `origin/master`'a push edildi. Güncel sanitized export `1db94ac` olarak public `main`'e push edildi. Public staging'de `npm ci` 0 audit bulgusu, `npm test` 915 toplam/911 geçti/4 POSIX-only atlandı/0 başarısız, `npm run verify:ci` ve `git diff --check` geçti; exporter'ın kişisel yol/secret taraması temizdi. Exporter scripti ve yalnız bu scripti test eden `tests/export-public.test.js` private kaldı. `docs/plans`, `docs/reports`, hafıza ve yerel state public'e aktarılmadı. Aynı gün V2 pilot yedeği ayrı private `orkestrasyon-v2-pilot-backup-2026-10-11` reposuna `efbacd0` HEAD'iyle push edildi; V2 pilot worktree/cutover bu işlemde değiştirilmedi.

Durum notu (2026-10-12): Yerinde denetim düzeltmeleri private `5d7084d` ve pilot kaldırma kaydı `a2e293a` olarak `origin/master`'a; sanitized export `1443bea` olarak public `main`'e push edildi. Public staging'de `npm ci` 0 audit bulgusu, `npm test` 920 toplam/916 geçti/4 POSIX-only atlandı/0 başarısız, `npm run verify:ci` ve `git diff --check` geçti; exporter gizlilik taraması temizdi. Export ilk denemede staging `node_modules` üzerindeki geçici dosya kilidi nedeniyle durdu; kilit geçince script yeniden çalıştırıldı, `.git` korundu ve tam staging doğrulaması yeniden yapıldı. Private-only plan/rapor/dizin değişiklikleri ve `tests/export-public.test.js` public'e taşınmadı. V2 pilot linked worktree'si kullanıcı isteğiyle kaldırıldı; private `efbacd0` backup reposu ve ana `master` ancestry'si korunuyor.

Durum notu (2026-10-12, ikinci tur): V2 sürüm bilgisi ve CI düzeltmesi private `c505e33` olarak `origin/master`'a; sanitized export `c8656cf` olarak public `main`'e push edildi. README'ye Orkestrasyon V2 yetenek özeti eklendi (iki aşamalı batch onay akışı, salt-okunur DAG dalgaları, izole worktree'lerde tek dalgalı edit batch'leri, opak detail referanslı bounded özetler, approval-bound entegrasyon ve kalıcı recovery journal, settled iptal semantiği, fail-closed varsayılanlar) ve CI bölümü gerçek `.github/workflows/validate.yml` ile hizalandı. Public staging: `npm ci` 0 audit; `npm test` 920 toplam/916 geçti/4 POSIX-only atlandı/0 başarısız; `verify:ci` ve `git diff --check` geçti; exporter taraması temiz. Düzeltme: 2026-10-10 notundaki ".github/workflows bulunmadığı" ifadesi hatalıydı; `validate.yml` her iki repoda takiplidir. Private repo Actions koşuları 2026-10-06'dan beri GitHub faturalama engeliyle başlatılamıyor (kaynak kodu hatası değil); kullanıcı kararıyla repo değişikliği yapılmadı ve durum denetim raporuna kaydedildi. Public koşular aynı workflow ile yeşil.

Durum notu (2026-10-13): Private provider-admission/review-integrity güncellemesi `d0703e0` olarak `origin/master`'a push edildi; sanitizer'dan geçirilmiş public eşleşmesi `3674bd9` olarak `hades-orchestrator/main`'e push edildi. Public staging'de `npm ci` 0 vulnerability, `npm test` 932 toplam/928 geçti/4 platform testi atlandı/0 başarısız, `npm run verify:ci` ve `git diff --check` geçti; exporter'ın kişisel-yol/secret taraması temizdi. README, public runtime, test ve policy değişiklikleri aktarıldı; private planlar/raporlar public staging dışında kaldı.

Durum notu (2026-10-13, Codex JSONL/review düzeltme senkronu): Private `4b24aba` `origin/master`'a push edildi; public staging `scripts/export-public.ps1` ile taze kopyadan yeniden üretildi, sanitizer kişisel-yol/secret taramasını temiz tamamladı ve public commit `ca298e4` `hades-orchestrator/main`'e push edildi. Public staging'de `npm ci` 0 vulnerability, `npm test` 941 toplam/937 pass/4 platform skip/0 fail, `npm run verify:ci`, `npm run smoke` ve `git diff --check` geçti. Public README Codex JSONL parsing ve required review sözleşmesini açıklar; private planlar, durum/indeks kayıtları ve raporlar export dışında kaldı.

Durum notu (2026-10-14, Gemini model erişimi): Private `ef4fad1` `origin/master`'a push edildi; sanitized public export `9a23fec` olarak `hades-orchestrator/main`'e detaylı doğrulama gövdesiyle push edildi. Exporter kişisel-yol/secret taramasını temiz geçti. Public staging'de `npm ci` ve `npm audit --omit=dev` 0 vulnerability, `npm test` 943 toplam/939 geçti/4 platform skip/0 fail, `npm run verify:ci`, `npm run smoke` ve `git diff --check` başarılı oldu. README ile curated `MODEL_KIMLIGI_VE_ERISIM_MODU_PLANI.md` güncellendi; private durum indeksi/raporlar export dışında kaldı. Gemini Pro/Flash 3.7 normal run rotalarından kaldırıldı; `check_antigravity_subagent` diagnostic probe'u korundu.

Durum notu (2026-10-14, global OpenCode multi-agent erişimi): Private kaynak commit'i `dd87e73` `origin/master`'a push edildi; sanitized public export `e00c00a` olarak `hades-orchestrator/main`'e push edildi. Exporter'ın kişisel-yol/secret taraması temizdi. Public staging'de `npm ci` ve `npm audit --omit=dev` 0 vulnerability, `npm test` 943 toplam/939 geçti/4 platform skip/0 fail, `npm run verify:ci`, `npm run smoke` ve `git diff --check` başarılı oldu. README'de global batch MCP kurulumu ve tekil araç kontrolü/batch MCP ayrımı belgelendi; global kullanıcı yapılandırması ve private plan/raporlar public export dışında tutuldu.

Takip düzeltmesi (2026-10-14): Ayrı `hades-orchestrator` inline agent tanımı kaldırıldı; batch araç izinleri önceden var olan global/proje `orchestrator` agent tanımlarına taşındı. Private `c7cc410` `origin/master`'a; sanitized public `d116ca4` `hades-orchestrator/main`'e push edildi. Public staging taraması temizdi; `npm ci` ve `npm audit --omit=dev` 0 vulnerability, `npm test` 943 toplam/939 geçti/4 platform skip/0 fail, `npm run verify:ci`, `npm run smoke` ve `git diff --check` başarılı oldu. README ve proje agent talimatı mevcut Orchestrator adına göre güncellendi; global kullanıcı yapılandırması public export'a alınmadı.

Güncel doğrulama (2026-10-10): Private ve public staging'de `npm ci` ve tam `npm test` geçti (907 toplam, 903 geçti, 4 POSIX'e özgü test atlandı); private `npm run verify`, private/public `npm run verify:ci`, `npm run smoke`, `npm run drill` (9/9), public export gizlilik taraması ve `git diff --check` geçti. Kontrollü canlı P0/P2 E2E'leri de geçti; Windows P2A harness'i bulunmayan `opencode.ps1` yerine kurulu `opencode.exe`'yi çağıracak biçimde düzeltildi ve tekrar doğrulandı. Bu snapshot'ta `.github/workflows` bulunmadığından GitHub Actions workflow sonucu yoktur; uygulanabilir doğrulama `verify:ci` ile yapılmıştır. Gelecek her senkron öncesi export taraması ve staging doğrulaması zorunludur.

Durum notu (2026-09-27): M2 cohort değişiklikleri public export'ta `norn`/`dersmerkezi` yerine `project_alpha`/`project_beta` etiketlerine dönüştürülür; sızıntı taraması bu özel etiketler kalırsa export'u durdurur. Sanitized public sync `hades-orchestrator-public/main` dalına `46f8b22` commit'iyle gönderildi. Staging doğrulaması: `npm ci`, `npm test`, `npm run verify:ci`, `npm run smoke` ve export gizlilik taraması başarılı. `npm run verify`, public kopyada bilerek bulunmayan yerel `memory` Vault'u beklediği için uygulanabilir değil. `npm audit --omit=dev` önceki public commit ile aynı lockfile'da 2 high (`fast-uri`, `sharp`) ve 2 moderate (`hono`, `qs`) bulgusu raporladı; dependency lock değiştirilmedi, bu ayrı güvenlik güncelleme takibidir.

## Sınırlar

- Public repoya aktarılacak içerik, çalışma zamanında makineye özgü değer gerektirmeyen kaynak, test, şablon ve taşınabilir dokümantasyondur.
- Kişisel hafıza, log, state, cache, pilot çalışma alanı ve kişisel yapılandırma public repoya girmez.
- Secret taraması yayın öncesi hem yerel hem staging üzerinde tekrarlanır.

## Girdiler

- Ana orkestratör envanteri: takip edilen dosyalarda `user`, mutlak Windows yolu ve secret kalıbı taraması (9 dosyada kişisel yol; gerçek secret yok).
- Gemini 3.8 Flash yayın prosedürü: dosya kapsamı, staging, tek commit, yayın sonrası GitHub güvenlik ayarları, senkronizasyon değerlendirmesi.

## Dosya sınıflandırması ve aksiyonlar

### A) Public şablon olur, placeholder gerekir

- `config/policy.json`: `allowedWorkspaceRoots` altındaki `C:\Users\user\Desktop\Yazılım_Siber` değeri göreli/placeholder köke çevrilir. Makineye özgü izinli kök kişisel `~/.config/subagent-bridge` override'ında tutulur.
- `config/agents.json`: codex/agy `executable` mutlak yolları kaldırılır; varsayılan çıplak komut adı kullanılır.
- `config/deepseek-subagent-rules.md`, `config/agent-rules.md`, `config/memory-evaluation.json`: içerik taraması sonrası gerekirse placeholder.

### B) Example şablonuna çevrilir, gerçeği yerel kalır

- `opencode.jsonc` → `opencode.jsonc.example` (gerçek dosya `.gitignore`'a eklenir veya yerelde tutulur).
- `.codex/config.toml` → public dışı (`.codex/` gitignore); istenirse `.codex/config.toml.example` eklenir.

### C) Test ve görev şablonu fixture, sahte yolla değiştirilir

- `tests/config.test.js`: `C:\Users\user\...` kökleri `C:\Users\ornek\...` gibi sahte, platformdan bağımsız yollara çevrilir; test mantığı değişmez.
- `tasks/templates/task.template.json`: `workspace` örnek değeri `/path/to/workspace` yapılır.

### D) Betikler parametrik hale getirilir (public'e dahil edilir)

- `scripts/start-codex.ps1`: sabit legacy `sandbox-bin` yolu kaldırılır; PATH/env tabanlı `codex` çağrısına çevrilir.
- `scripts/pilot-mcp.js`: sabit `projectRoot` → `process.cwd()` / env.

### E) Dokümanlar genelleştirilir

- `README.md`: mutlak yollar `%LOCALAPPDATA%\agy\bin\agy.exe` vb. genel biçimlere; kişisel `~/.config/subagent-bridge` anlatımı korunur; bayat Codex 0.147.0 sandbox-bin referansları silinir; public hedef kitleye göre bölüm yapısı güncellenir; güvenlik/model izolasyon ve hafıza kuralları özeti README'ye taşınır.
- `CLAUDE.md`, `AGENTS.md`, `.opencode/agent/orchestrator.md`: tarama sonrası kişisel yol kalmışsa temizlenir; kural içerikleri public için uygunsa korunur.
- Public mimari dokümanlar: 4 dosya `docs/architecture` altına taşınır; içlerindeki kişisel yol referansları temizlenir.

### F) Public repoya hiç girmeyecekler

- `memory/`, `logs/`, `state/`, `cache/`, `pilot-workspace/`, `.hades/`, `.codex/`, `.env`, `*.log`, `node_modules/`, `.git/`.
- `KURULUM_RAPORU.md`, `scripts/export-public.ps1`, `tests/export-public.test.js` (private exporter-specific integration test requires the excluded script).
- `docs/reports/`, `docs/handoffs/` ve `docs/plans/` içinden mimari 4 dosya dışındaki tüm dokümanlar (PUBLIC_YAYIN_PLANI dahil).

## Yayın öncesi .gitignore genişletmesi

Mevcut .gitignore kapsamına eklenmesi önerilenler: `.codex/`, `opencode.jsonc` (example kullanılacaksa), `pilot-workspace/`, `.hades/` (varsa zaten var). Kesinleştirilecek.

## Yayın adımları (staging ile)

1. Staging dizininde temiz kopya: `robocopy <kaynak> <hedef> /E /XD .git node_modules memory logs state cache pilot-workspace .hades .codex /XF .env *.log`
2. Staging içinde placeholder/example dönüşümleri ve doküman genelleştirmesi uygulanır (B bölümü).
3. `git init -b main`, `git add .`, tek squashed commit (mesaj taslağı aşağıda).
4. Doğrulama: `rg` + `git grep` ile `user`/mutlak yol/secret taraması; büyük/ikili dosya kontrolü; `npm ci && npm test`; `git status --ignored` incelemesi.
5. Yeni GitHub public remote eklenir ve `git push -u origin main`.
6. GitHub ayarları: Secret scanning + push protection açık, branch koruma (main), Actions read-only, lisans/güvenlik dosyaları.

## Tek yönlü dışa aktarma (gelecek senkronizasyon)

- `scripts/export-public.ps1` oluşturulur: private çalışma ağacından `.git`, `memory`, `logs`, `state`, `cache`, `pilot-workspace`, `.hades`, `.codex`, `KURULUM_RAPORU.md`, `.env`, `*.log` hariç kopyayı public staging'e alır; sanitize kuralını (placeholder/env) uygular; public repo'da yeni commit açar ve push eder.
- Bu betik aynı zamanda ilk yayında da kullanılır, böylece tek doğruluk kaynağı olur.

## Kesinleşmiş kararlar

1. Public repo adı: **hades-orchestrator** (paket adıyla tutarlı).
2. Lisans: **Apache-2.0** (`LICENSE` dosyası staging'e eklenir).
3. `KURULUM_RAPORU.md`: **private kalır** (kişisel kurulum günlüğü; public kopyaya aktarılmaz). `docs/plans` içeriği: yalnız 4 mimari doküman public'e taşınır — `CONTEXT_ORKESTRASYONU_VE_GUVENLI_SECOND_BRAIN_PLANI_2026-08-21.md`, `DEEPSEEK_EDIT_PILOT_VE_MIRROR_KARARLILIK_PLANI.md`, `MODEL_KIMLIGI_VE_ERISIM_MODU_PLANI.md`, `RECENT_RUNS_GOZLEMLENEBILIRLIK_PLANI.md` — ve `docs/architecture` altına taşınır (Gemini 3.1 Pro karar danışması). Tarihli araştırma/iç notlar, `docs/reports`, `docs/handoffs` ve bu plan dokümanı private kalır.
4. `scripts/start-codex.ps1` ve `scripts/pilot-mcp.js`: **düzeltilip public'e dahil edilir** (parametrik/env tabanlı).
5. Gelecek senkronizasyon: **tek yönlü dışa aktarma** — private'ta geliştirme sürer; `scripts/export-public.ps1` betiği sanitize edilmiş ağacı staging'e kopyalayıp public repo'da yeni commit üretir (taslak adım 7'de).
6. Public köküne eklenecekler: `LICENSE` (Apache-2.0), `SECURITY.md`, `CONTRIBUTING.md`. `.gitignore` genişletmesi: `.codex/`, `opencode.jsonc` (example kullanılacaksa), `pilot-workspace/`.

## Squashed commit mesajı taslağı

```text
feat: initial open source release of hades orchestrator

- Multi-agent coordination bridge for DeepSeek, GLM, and Codex models
- Sandboxed execution, controlled promotion, and persistent memory layout
- Standardized automation scripts, test suites, and CI workflows
```
