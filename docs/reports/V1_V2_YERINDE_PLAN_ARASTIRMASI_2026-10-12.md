# V1/V2 Mevcut Klasörde Uygulama Planı: Araştırma ve Kapsam Düzeltmesi

Tarih: 2026-10-12
Hazırlayan: Ana orkestratör, GPT-6.1 Sol
Durum: Yerel araştırma ve plan revizyonu tamamlandı; güncel tam runtime kabulü henüz yapılmadı.

Kapanış ek notu (2026-10-12): Araştırma sonrasında yerinde Y0-Y4 uygulaması ve tam yerel kabul tamamlandı. Bu belgenin araştırma aşamasındaki kontrol sınırları tarihsel olarak korunur; güncel komut sonuçları ve korunum kanıtı `V1_V2_YERINDE_UYGULAMA_KABUL_2026-10-12.md` içindedir.

## Kullanıcının kesin hedefi

Mevcut `orkestrasyon` klasörü tek canonical proje olarak kalacak. Yeni proje klasörü, clone veya linked worktree oluşturulmayacak. V2, aynı projenin paralel orkestrasyon kapasitesidir; dosya sistemi taşıması değildir. Kullanıcı subagent edit hataları raporlandıktan sonra ana orkestratörün tek başına çalışmasını istedi.

## Kullanılan uzmanlık talimatları

- `proje-kesif-planlama`: hedefe uygun yerel kanıt, kabul ölçütü ve uygulanabilir sıra.
- `otomatik-dokumantasyon`: plan, indeks ve rapor bağlantılarının kaynakla hizalanması.
- `dogrulama-kapisi`: plan revizyonu kontrolü ile gelecekteki runtime kabul komutlarının ayrılması.

Bu talimatlar aynı oturumda proje kopyalarından okunmuştur. Subagent, web araştırması veya yeni provider çağrısı yapılmadı; soru yerel Git/topology ve mevcut kaynak davranışıyla çözüldü.

## Doğrulanan bulgular

- Ana root `master` HEAD'i `6327032cc760b303bf0b4233813be76c177ac7f7`; pilot detached `efbacd0b44f5ba2d8d5ad1b7bc68b6f5bc0e2ccb`.
- `git merge-base HEAD <pilot>` pilot commit'ini döndürdü; pilot tarafında ayrışmış commit yok. İkinci repo/history merge'i gerekmez. Commit mesafesi snapshot bilgisidir; uygulama kabulü değildir.
- `git diff --no-renames --name-only --diff-filter=D <pilot> HEAD -- scripts subagent-bridge tests config` boş çıktı verdi. Bu alanlarda silinmiş pilot dosyası gözlenmedi. Blob değişiklikleri semantik regresyon açısından testlerle kabul edilmelidir; yalnız ancestry tüm özelliklerin çalıştığını kanıtlamaz.
- MCP kaynakta batch prepare/start/get/detail/cancel ve koşullu integration approval kaydı mevcut. Tekil çağrı ve V2 yolları aynı root'tadır.
- Mevcut root'ta `npm run opencode-tools:check` exit 0 ve `ok=true` verdi. Global generated tool kaynak template ile uyumlu; sırf klasör geçişi için reinstall gerekmiyor.
- MCP workspace-context fingerprint'leri eşit; bu runtime kaynağına dair redacted gözlemdir. Host startup context'in tamamen yüklendiği veya tüm politikaların geçtiği anlamına gelmez.
- Sürümlenen `config/policy.json` batch/edit'i kapalı, OpenCode output capability'yi unavailable ve verification allowlist'i boş tutar. Kişisel policy ayrıca salt okunur incelenmelidir.
- Pilot ve public staging status kontrolleri temiz döndü; yeni `Orkestrasyon V2` hedef dizini bulunmadı. Worktree/branch veya global host yolu değiştirilmedi.

## Planın yeni uygulama sırası

1. Mevcut root'ta HEAD/status/fingerprint, aynı-workspace writer/recovery ve dependency baseline'ı alınır.
2. V1/V2 mevcut kaynak ve test kapsamları eşleştirilir; yalnız kanıtlanmış eksik/regresyon düzeltilir. Kod zaten dahil ve kontroller geçiyorsa yapay merge/düzenleme yapılmaz.
3. Güncel `npm test`, `npm run verify`, `npm run verify:ci`, `npm run smoke`, `npm run drill`, global tool check ve diff kontrolüyle yerel kabul yapılır.
4. Kaynak/branch/host/Vault/pilot/public korunumu ve gerçek komut sonuçları uygulama raporuna yazılır.

## Kaldırılan yürütme varsayımları

- Yeni hedef worktree, `master` handoff'u ve eski root'u yedek workspace'e çevirme.
- Global Codex/OpenCode yollarını taşıma, Vault root'u migration için absolute yola çevirme.
- Genel process shutdown, bağımsız migration terminali ve yeni hedef session kabulü.
- Committed remediation dosyalarını pilot/yeni hedefe yeniden kopyalama.

Eski tasarım tarihsel bölümde korunmuştur; aktif talimat değildir. Somut config kusuru bulunup config-time entegrasyon gerçekten değiştirilirse o istemcinin restart kabulü yine gerekli olabilir; mevcut plan toplu restart gerektirmez.

## Ayrı açık kapılar ve kanıt sınırı

- `dış-bağımlı`: Bu oturumdaki DeepSeek rate limit ve Luna sandbox setup hataları operasyonel edit erişimini doğrulanmamış bırakır; bu plan onları kendiliğinden düzeltmez.
- `dış-bağımlı`: Codex remote-write denial ve edit release kanıtı ilgili readiness kaydında ayrı kalır.
- `opt-in`: Canlı edit batch'i, ücretli pilot, feature-gate etkinleştirme, commit/push ve public yayın bu yerinde kabul kapsamına alınmadı.
- Yeni tam test/verify/smoke turu bu araştırmada çalıştırılmadı. `opencode-tools:check` ve salt-okunur Git kontrolleri gerçek gözlemdir; kalan komutlar planın uygulama kapılarıdır.

## Yerel kaynaklar

- `../plans/yapilanlar/ORKESTRASYON_V1_V2_TEKKLASOR_BIRLESTIRME_PLANI_2026-10-10.md`, güncel Y0-Y4 ve kapanış notu.
- `../plans/yarim-kalanlar/ORKESTRASYON_V2_PARALEL_COK_AJANLI_KODLAMA_MIMARISI_2026-09-29.md`, mevcut projeye ek kapasite tanımı.
- `ORKESTRASYON_V2_PRODUCTION_READINESS_2026-10-06.md`, kalan üretim kapıları.
- `V1_V2_GECIS_SUBAGENT_EDIT_HATALARI_2026-10-12.md`, üç başarısız edit çağrısının operasyonel kaydı.
- `subagent-bridge/src/frontends/mcp/server.js`, `scripts/opencode-global-tools.js`, `scripts/install-opencode-global-tools.js`, `scripts/verify-project.js`, `scripts/smoke-mcp.js`, `config/policy.json` ve `package.json`, repository-relative kaynak yolları.
