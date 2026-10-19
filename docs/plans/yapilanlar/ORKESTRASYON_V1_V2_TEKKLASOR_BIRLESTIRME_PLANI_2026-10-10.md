# Orkestrasyon V1/V2 — Mevcut Klasörde Bütünlük ve Kabul Planı

Pilot worktree yaşam döngüsü notu (2026-10-12): Kullanıcının isteğiyle `orkestrasyon-v2-pilot-2026-10-06` linked worktree'si kaldırıldı. Kaldırmadan hemen önce private `mecik-arda/orkestrasyon-v2-pilot-backup-2026-10-11` reposunun `main` ref'i `efbacd0b44f5ba2d8d5ad1b7bc68b6f5bc0e2ccb` ile doğrulandı; pilot HEAD aynı commit'teydi ve Git tarafından raporlanan tracked/untracked çalışma farkı yoktu. Yerel ignored `.opencode` dependency cache/metadata'sı remote commit'in parçası değildi ve worktree kaldırılınca silindi; bunlar yeniden kurulabilir yerel bağımlılık dosyalarıydı. Ana root `master`/HEAD, private backup remote ve public staging değişmedi. V2 tracked kodu ana repository ancestry'sinde ve private remote yedeğinde korunuyor. Artık pilot dizini gerekmez; doğrulama mevcut `orkestrasyon` root'unda yürütülür.

Denetim ek notu (2026-10-12): Yerinde kabul sonrasında kullanıcı uçtan uca test, ana orkestratör denetimi ve commit/push istedi. Source-bundle transport'un kurulu OpenCode sürüm kanıtı güncellendi; settled batch iptal durumu ve verify model metadata'sı düzeltildi; README kaynakla hizalandı. Güncel tam test/verify/smoke/drill, gerçek localhost OpenCode mock ve izole fixture MCP pilotu geçti. İlk kapanışın byte-equality/no-code-change bilgisi o önceki kabul snapshot'ına aittir; yeni seçilmiş runtime/test düzenlemeleri bu denetim kapsamındadır. Ana root/host/Vault/pilot/public yerleşimi aynı kalır. Ayrıntı `../../reports/V1_V2_UCTAN_UCA_DENETIM_2026-10-12.md` içindedir; yeni test sonucu bu denetim raporundan izlenir.

Kapanış notu (2026-10-12): Güncel Y0-Y4 yerinde sözleşmesi ana orkestratör tarafından uygulandı ve yerel kabul PASS oldu. `npm test`, `npm run verify`, `npm run verify:ci`, `npm run smoke`, `npm run drill`, `npm run opencode-tools:check` ve `git diff --check` geçti. Başlangıç source/index/manifest ve host hash'leri runtime kontrolleri sonrasında eşleşti; uygulama kodunda düzeltme gerektiren regresyon gözlenmedi. Mevcut `orkestrasyon` canonical root, master/HEAD, Vault/host yolları, pilot ve public staging korundu; yeni proje klasörü/worktree veya migration yapılmadı. Plan tamamlanmış klasörüne taşındı. Ayrı provider/edit release kapıları açık kalır; ayrıntılı uygulama kanıtı `../../reports/V1_V2_YERINDE_UYGULAMA_KABUL_2026-10-12.md` içindedir. Aşağıdaki hazırlık ve migration notları tarihseldir.

Güncel durum notu (2026-10-12, kullanıcı kapsam düzeltmesi): Tek canonical proje klasörü mevcut `C:\Users\user\Desktop\Yazılım_Siber\orkestrasyon` olarak kalacaktır. Yeni proje klasörü, clone veya linked worktree oluşturulmayacak; branch ve host yolları taşınmayacaktır. Kullanıcı önceki yeni-klasör varsayımını açıkça düzeltti ve yerinde uygulanabilir plan istedi. Aşağıdaki Y0-Y4 sözleşmesi günceldir; tarihsel klasör geçişi ve P1-P3/A0-A5 talimatları uygulanmaz.
Durum: Y0-Y4 yerinde uygulama ve yerel kabul tamamlandı. Önceki Sol verdict'leri bu kapsamın bağımsız onayı değildir; kapanış ana orkestratörün gerçek kontrol sonuçlarına dayanır.
Amaç: Mevcut Git history/remote, tekil V1 çağrı düzeni ve dahil edilmiş V2 kapasitesini aynı `orkestrasyon` çalışma alanında doğrulamak; yalnız kanıtlanmış eksik/regresyon varsa dar kapsamlı düzeltmek.

## Güncel kullanıcı kararı ve kapsam

- Tek etkin çalışma alanı mevcut `orkestrasyon`; `master`, ortak Git deposu, `origin` ve `public` remote adları aynı yerde kalır.
- `Orkestrasyon V2` yeni klasör adı değil, mevcut projeye eklenen paralel orkestrasyon kapasitesinin adıdır.
- Private snapshot yedeği korunur. Yerel pilot worktree kullanıcı isteğiyle private remote yedeği ve temiz Git durumu doğrulandıktan sonra 2026-10-12'de kaldırıldı; pilot klasöründen dosya kopyalanmaz, worktree yeniden oluşturulmaz ve branch detach/switch yapılmaz.
- Repo/global Codex config, hooks, global OpenCode tool, Bridge config, Vault, log/cache/state yolları taşınmaz. Yerinde doğrulama için uygulamaları kapatmak, ayrı migration terminali veya yeni workspace oturumu zorunlu değildir.
- Mevcut kullanıcı farkları korunur; stash/reset/checkout/clean yapılmaz. Commit/push ve public yeniden yayın bu kabul işinin parçası değildir.
- GLM, ücretli canary/provider pilotu, canlı subagent edit ve batch/edit kapılarının etkinleştirilmesi bu plana dahil değildir. Kullanıcının son talimatıyla çalışmayı ana orkestratör tek başına yürütür.

## Yerel araştırmayla doğrulananlar

- Güncel kaynak HEAD `6327032cc760b303bf0b4233813be76c177ac7f7`, branch `master`; bu bir gözlem snapshot'ıdır, yürütme başında tekrar alınır.
- Pilot HEAD `efbacd0b44f5ba2d8d5ad1b7bc68b6f5bc0e2ccb`; `git merge-base HEAD <pilot-HEAD>` aynı pilot commit'ini döndürdü. Ayrı pilot commit'i yoktur; ikinci repository/history entegrasyonu gerekmiyor.
- Pilot ile HEAD arasında `scripts`, `subagent-bridge`, `tests` ve `config` kapsamında silinmiş takipli dosya gözlenmedi. Değişmiş blob'lar sonraki geliştirmelerdir; ancestry veya dosyanın varlığı tek başına davranış eşdeğerliği/özellik kaybı olmaması kanıtı değildir. Bunun kabulü testlerle yapılır.
- MCP server kaynakta prepare/start/get/detail/cancel batch araçlarını ve koşullu integration approval kaydını içeriyor. Tekil provider yolları ile V2 batch yolları aynı mevcut projededir.
- `npm run opencode-tools:check` mevcut root için `ok=true` döndürdü. Global wrapper'ın yeniden kurulması/path değiştirilmesi gerekmiyor.
- MCP `workspaceContext` sonucu worktree ve directory fingerprint'lerini eşit bildirdi. Bu redacted runtime gözlemidir; tek başına host startup context veya genel tool/policy doğruluğunu kanıtlamaz.
- Sürümlenen policy'de batch/edit kapıları kapalı, OpenCode capability `unavailable` ve verification allowlist boştur. Kişisel ayarlar template ile aynı varsayılmaz; gerçek runtime ayarları salt okunur, secret içermeyen alanlarla yürütmede kontrol edilir.
- `ORKESTRASYON_V2_PRODUCTION_READINESS_2026-10-06.md` canlı remote-write/edit release kanıtının ayrı açık kapılar olduğunu belirtir. V2 kodunun mevcut projede bulunması bu kapıların geçtiği anlamına gelmez.
- Yeni hedef klasör yoktur; mevcut pilot ve public staging çalışma ağaçları son kontrolde temizdi. Bu planın belgeleri ve subagent hata raporu mevcut source'taki bilinen yerel farklardır.

## Y0 — Yerinde baseline ve güvenli çalışma

1. Mevcut root'ta `git status --porcelain=v2`, `git rev-parse HEAD`, `git worktree list --porcelain`, remote adları ve private snapshot backup ref'i yeniden doğrulanır. Kaldırılmış pilot dizinini oluşturmaya veya HEAD'ini yerelde incelemeye çalışma; backup repo erişilemiyorsa bunu açık doğrulama sınırı say. Index ve tracked/nonignored untracked byte fingerprint'i içerik loglamadan yerel olarak kaydedilir. Bilinen plan/rapor farkları başlangıç kapsamına dahil edilir; ilgisiz kullanıcı düzenlemesi ezilmez.
2. Git operation marker/lock, aktif kaynak yazarı, batch/edit worker ve pending promotion/recovery kontrol edilir. Açık, boşta duran OpenCode/Codex oturumu tek başına engel değildir. Aynı kaynak dosyasını değiştiren aktif süreç veya aynı-workspace belirsiz mutation/recovery varsa çalışma durur. Toplam disk lock sayısı, başka workspace kilidi veya tarihsel sonuç manifesti tek başına aktif mutation kanıtı değildir; gerçek workspace/task/lease/journal ilişkisi incelenir. Otomatik stale-lock silme veya manifest status değiştirme yapılmaz.
3. Repo ve kişisel config/Vault/trusted workspace yolları salt okunur kontrol edilir. Mevcut root'a çalışan yollar aynı kalır; uyumsuzluk bulunursa yalnız ilgili yüzey için bulgu/düzeltme planlanır. Secret/config içeriği rapora taşınmaz.
4. `package.json` ve `package-lock.json` için Git-normalized diff ve ham SHA-256 baseline alınır. `npm ls --depth=0` mevcut dependency durumunu kontrol eder. Bağımlılıklar hazırsa yeniden `npm ci` çalıştırılmaz. Kurulum eksik/bozuksa yalnız mevcut root'ta `npm ci` yapılır; before/after manifest hash'leri aynı kalmalı, kullanıcı lockfile farkı korunmalıdır. Fail eden dependency kontrolünden sonra npm install/update ile kapsam genişletilmez.

## Y1 — V1/V2 özellik envanteri ve eksik analizi

1. Tekil çağrı yolları, workspace context, hafıza ve onay sınırı ile V2 DAG/scheduler, bounded summary/detail, cancellation, batch/worktree isolation, integration ve recovery kaynakları aynı root'ta eşleştirilir. Kaynak/test referansları mevcut mimari/readiness belgelerinden seçilir; yeni mimari veya yeniden yazım yapılmaz.
2. `tests/faz-0-core.test.js`, `tests/faz-p0-runtime.test.js`, `tests/memory-hook.test.js`, `tests/memory-hook-clients.test.js` ve ilgili `tests/parallel-batch*.test.js`/`tests/review-source-manifest.test.js` kapsamları incelenir. Tam `npm test` bu yolların yerel regression kabulünü sağlar; provider erişimi veya genel üretim sertifikası sayılmaz.
3. Pilot/current tree farkları yalnız eksik veya regresyon hipotezi için incelenir. Ancestry zaten aynı geçmişi kapsıyorsa merge/cherry-pick/kopyalama uygulanmaz. Gerçek kaynak kusuru bulunmazsa uygulama kodu değiştirilmeden doğrulama/kabul tamamlanabilir.

## Y2 — Yalnız doğrulanmış kusurların düzeltilmesi

1. Her bulgu için etkilenen davranış, kaynak yolu, kabul ölçütü ve seçilmiş dosyalar belirlenir. Kaynak kusuru ile bu oturumdaki sağlayıcı hız limiti/sandbox setup hataları ayrı sınıflandırılır. Provider dış hatası yerel bridge kusuru olarak varsayılmaz.
2. Ana orkestratör yalnız seçilmiş mevcut proje dosyalarını düzeltir. Yeni proje klasörü/worktree, toplu dosya aktarımı veya migration yürütücüsü üretmez. Anlamlı regresyon varsa ilgili test eklenir/güncellenir; yorum/docstring/TODO eklenmez.
3. Kişisel ayar değişikliği gerçekten gerekiyorsa yalnız somut bulguya bağlı dosya için private before-hash/backup ve dar alan allowlist'i tutulur; path taşıma yapılmaz. Çalışan config-time entegrasyon değişirse yalnız o istemcinin restart kabulü ayrıca gerekir. Config değişmiyorsa genel restart kapısı yoktur.
4. Hedefli kontrol geçtikten sonra Y3'te değişiklik türlerinin birleşimine karşılık gelen zorunlu kontroller bir kez çalıştırılır. Başarısız provider görevi kör retry ile test sonucu yerine kullanılmaz.

## Y3 — Mevcut root'ta kabul doğrulaması

Aşağıdaki komutlar mevcut `orkestrasyon` çalışma dizininde yürütülür. Native komutların exit code'u ayrı kontrol edilir; başarısız kontrolden sonra tamamlanma bildirilmez.

- `npm test`.
- `npm run verify` ve `npm run verify:ci`.
- `npm run smoke`: gerçek stdio MCP/resource/workspace/Vault akışı; smoke'un read-only availability kontrolleri canlı model task'ı değildir. GLM invocation yapılmaz; GLM tool adının kayıt listesinde bulunması invocation değildir.
- `npm run drill`: fixture tabanlı sağlayıcı hata/dayanıklılık kontrolleri.
- `npm run opencode-tools:check`.
- `git diff --check`.

Skill veya global skill kopyası gerçekten değişirse ilgili strict global senkron kontrolü eklenir. DeepSeek köprü davranışı gerçekten değişirse proje kuralındaki kontrollü pilot ayrıca değerlendirilir; mevcut sağlayıcı hız limiti nedeniyle pilot çalıştırılamazsa bu değişiklik doğrulanmış sayılmaz. Sırf plan doğrulaması için ücretli pilot başlatılmaz.

Mevcut Vault yerinde kalmalı ve erişim smoke/verify ile doğrulanmalıdır. Smoke kontrollü child MCP sürecini kapatır; aynı workspace'te aktif edit/recovery varsa başlatılmaz. Testlerin normal ignored/temp fixture çıktıları yeni canonical proje klasörü oluşturulması değildir; kullanıcı verisi veya private Vault'a kopyalama yapılmaz.

Public sanitizer kodu değişmiyorsa yeniden export gerekmez. Public kontrol istenirse mevcut staging üzerinde exporter `-ScanOnly` salt-okunur taraması kullanılabilir; bu mevcut projeden yeni sanitized export üretildiği anlamına gelmez. Mevcut staging'e normal exporter yazımı bu işin parçası değildir.

## Y4 — Kapanış, kesinti ve kabul ölçütleri

- Canonical yol hâlâ mevcut `orkestrasyon`; kaynak `master`/HEAD/remote'ları baseline ile aynı. Yeni proje klasörü/worktree veya branch handoff yapılmamış olmalı.
- Private backup repo `main` ref'i doğrulanmış pilot commit'ini göstermeli; yerel pilot worktree kullanıcı isteğiyle kaldırılmıştır. Mevcut public staging korunmuş, Vault/host yolları değişmemiş olmalı. Somut config kusuru için onaylı dar düzeltme varsa ayrıca before/after hash ve ilgili istemci kabulü kayıtlı olmalı.
- Başlangıç kullanıcı değişiklikleri byte/index olarak korunmuş; yalnız bu görev için seçilmiş düzeltme ve plan/rapor farkları bulunmalı.
- Y3 komutları güncel çıktı ve exit code'larla geçmeli. Kontrol başarısızsa rapor engeli ve etkilenen kabulü açık bırakır; önceki test sonuçları yeni başarılı koşu gibi yazılmaz.
- Kabul sonucu “V1/V2 mevcut klasörde yerel kaynak/regresyon kabulü”dür. Sağlayıcı edit operasyonlarının tekrar çalıştığı, V2 edit release'in açıldığı veya remote-write denial'ın kanıtlandığı iddia edilmez. Bunlar ilgili readiness planında ayrı `dış-bağımlı`/`opt-in` kapılar olarak kalır.
- Uygulama sonucu `docs/reports` altında secret içermeyen rapora yazılır; plan/indeks yalnız doğrulanmış sonuca göre güncellenir. Ancestry araştırması veya bu plan revizyonu tek başına tamamlanmış uygulama sayılmaz.
- Kesinti durumunda mevcut dosya/hash/status baseline yeniden karşılaştırılır. Branch/host taşınmadığı için migration rollback yoktur. Yalnız bu görevde değiştirilmiş dosyalar after-hash ile eşleşirse before içerikle geri alınabilir; araya kullanıcı düzenlemesi girmişse otomatik restore yapılmaz. Kaynakta reset/stash/clean çalıştırılmaz.

## Araştırma ve karar kanıtı

- Yerel Git ancestry/worktree ve scoped deleted-path kontrolleri, 2026-10-12.
- `subagent-bridge/src/frontends/mcp/server.js`, `scripts/opencode-global-tools.js`, `scripts/install-opencode-global-tools.js`, `scripts/verify-project.js`, `scripts/smoke-mcp.js`, `package.json` ve `config/policy.json` yerel kaynakları.
- Mevcut kapasite tanımı: `../yarim-kalanlar/ORKESTRASYON_V2_PARALEL_COK_AJANLI_KODLAMA_MIMARISI_2026-09-29.md`.
- Ayrı üretim kapıları: `../../reports/ORKESTRASYON_V2_PRODUCTION_READINESS_2026-10-06.md`.
- Bu araştırmanın kısa raporu: `../../reports/V1_V2_YERINDE_PLAN_ARASTIRMASI_2026-10-12.md`.
- Subagent edit hataları: `../../reports/V1_V2_GECIS_SUBAGENT_EDIT_HATALARI_2026-10-12.md`; kullanıcı kararıyla sonraki çalışmada subagent kullanılmaz.

## Tarihsel klasör geçişi tasarımı — uygulanmayacak

Bu bölümdeki eski hedef yolu, linked worktree oluşturma, branch detach/switch, global path/Vault değiştirme, bağımsız migration terminali ve restart talimatları arşivlenmiş tasarımdır. Güncel kullanıcı kararına aykırı olduğundan yürütme adımı veya izin olarak kullanılamaz. Güncel kapsam yalnız yukarıdaki Y0-Y4'tür.

Tarih: 2026-10-10
Güncel durum notu (2026-10-12): Kullanıcı geçişin başlatılıp tamamlanmasını açıkça istedi; ardından planın uygulanabilir hale getirilmesini istedi. Ana orkestratörün yerel incelemesi, bütün uygulamaları en başta kapatma şartının mevcut oturumun yürütme bağlantısını da kestiğini belirledi. Aşağıdaki güncel yürütme sözleşmesi hazırlık ile duruş/handoff'u ayırır; eski A2-A5 sırası ve eski kirli-dosya aktarım talimatları yürütmede kullanılmaz. Bu revizyon bağımsız Sol incelemesi değildir. Plan revize edilmiştir; hedef kurulumu ve cutover henüz yapılmamıştır.
Güncel durum notu (2026-10-11, GPT-6.1 Sol son teyidi): Beşinci salt-okunur review verdict'i `READY WITH EXECUTION-TIME PREFLIGHT`. A2 dependency kurulum sırası ve Windows CRLF uyumlu manifest integrity kontrolü de kapalı. Pilot snapshot için ayrı private `mecik-arda/orkestrasyon-v2-pilot-backup-2026-10-11` reposu oluşturuldu; `main` exact `efbacd0b44f5ba2d8d5ad1b7bc68b6f5bc0e2ccb` commit'ini gösteriyor. Cutover öncesi execution identity altında fresh status/fingerprint, target-specific lock/recovery, host config inventory/backup, hooks/filters, Vault erişimi ve target doğrulaması zorunlu preflight olarak kaldı.
Durum: Güncel iki aşamalı yürütme planı hazır; hazırlık açık oturumda, duruş/handoff bağımsız PowerShell terminalinde yürütülür. Kullanıcı uygulama yetkisini verdi; başarı için aşağıdaki canlı ön kontroller ve yeni oturum kabulü gerekir.
Amaç: Mevcut Orkestrasyon özelliklerini ve Git remote/history'sini koruyarak `Yazılım_Siber/Orkestrasyon V2` yolunu tek etkin proje çalışma alanı yapmak; mevcut eski ve pilot worktree'leri doğrulama boyunca yedek tutmak.
Kapsam: Doğrulanmış Git ancestry'si üzerinden en güncel committed ağacı yeni hedefe linked worktree olarak hazırlama, mevcut kirli ağacı yedek olarak koruma, sınırlı exporter/smoke remediasyonlarını hazırlama, host path'lerini güncelleme, doğrulama, rollback ve public export yolunu sınama.
Kapsam dışı: İkinci bir Git geçmişini import/merge etmek, mevcut kirli değişiklikleri otomatik taşımak veya temizlemek, secret/yerel state taşımak, commit/push yapmak, public repo adını/remote'unu değiştirmek, V2 provider/edit kapılarını açmak ya da ücretli provider pilotu başlatmak.
Hazırlayan: Ana orkestratör

## Tarihsel iki aşamalı yürütme önerisi (2026-10-12, geçersiz)

Bu öneri yeni hedef klasörü varsaymıştı; kullanıcı kapsam düzeltmesiyle geçersizdir. P1-P3 ve aşağıdaki A0-A5 yalnız tarihsel tasarım/inceleme kaydıdır. Güncel Y0-Y4 yerinde yürütme sözleşmesi esas alınır.

### Canlı baseline ve dosya kapsamı

- Kaynak: `C:\Users\user\Desktop\Yazılım_Siber\orkestrasyon`.
- Hedef: `C:\Users\user\Desktop\Yazılım_Siber\Orkestrasyon V2`.
- Son yerel kontrol: kaynak temiz `master`, HEAD `6327032cc760b303bf0b4233813be76c177ac7f7`; hedef yok. Bu HEAD yalnız gözlenen baseline'dır; hazırlık başında yeniden doğrulanır ve tam HEAD yürütme kaydına alınır.
- Altı remediation dosyası artık Git'te takipli ve committed: exporter, smoke, hook installer ve bunların üç test dosyası. Bunlar kaynaktan ayrıca kopyalanmaz. Yeni hedef saved HEAD'ten checkout edilir.
- Hedefin tek izinli tracked farkı `.codex/config.toml` içindeki server entry ve trusted-workspace yolunun hedefe çevrilmesidir. Altı remediation dosyası saved HEAD ile aynı kalır. Hedefte yeni untracked dosya kabul edilmez; `node_modules` ve bilinen test çıktıları yalnız ignored olabilir.
- Bu plan revizyonunun kaynakta oluşturduğu doküman farkları hazırlık baseline'ına dahil edilir ve eski root'ta korunur. Committed olmayan belgeler hedefe taşınmaz; yürütmede commit/push gerekmez.
- Eski root ortak `.git` ve mevcut Vault'un sahibi olarak yerinde kalır. Pilot snapshot değişmez.

### P1 — Mevcut oturum açıkken hazırlık

1. `git status --porcelain=v2`, HEAD, `git worktree list --porcelain`, remote adları, hedefin yokluğu ve pilotun status/HEAD'i yeniden alınır. Kaynak index entry/mode/hash ve tracked/untracked byte fingerprint'i yerel olarak kaydedilir. Kaynak değişiklikleri yalnız bilinen plan belgeleriyle uyumlu olmalı; yeni kullanıcı değişikliğinde baseline yeniden incelenmeden devam edilmez.
2. Git operation marker/lock, checkout hook ve LFS/filter kuralları incelenir. `filter.lfs` varlığı tek başına engel değildir; checkout sırasında gerçekten çalışacak filtre/hook'un davranışı anlaşılmış olmalıdır. Çalışan batch/edit/provider görevi, recovery veya kaynak/hedef yazarı varsa hazırlık da durur. Açık fakat görev çalıştırmayan orkestratör oturumu hazırlığı engellemez; hazırlık boyunca başka oturumdan kaynak/host ayarı düzenlenmez.
3. Hedef parent dizini ve aynı kullanıcı erişimi doğrulanır. `git worktree add --detach "C:\Users\user\Desktop\Yazılım_Siber\Orkestrasyon V2" <saved-HEAD>` uygulanır. Komut exit code'u sıfır olmalı; target status temiz, HEAD saved HEAD ve common-dir kaynak `.git` olmalıdır. Hedef zaten varsa üzerine yazılmaz; HEAD/status/topology incelenerek kaldığı aşama bulunur.
4. Hedefte `git diff --exit-code <saved-HEAD> -- package.json package-lock.json` temiz dönmelidir. İki manifestin ham SHA-256 değerleri kaydedilir. Hedef çalışma dizininde `npm ci` çalıştırılır; ardından Git-normalized eşleşme ve ham SHA-256 eşitliği tekrar doğrulanır. Kaynak `node_modules` kopyalanmaz.
5. Hedefte `node --test tests/export-public.test.js tests/memory-hook.test.js tests/memory-hook-clients.test.js`, `npm test`, `npm run verify:ci`, `npm run drill` ve `git diff --check` çalıştırılır. Her native komutun `$LASTEXITCODE` değeri ayrı kontrol edilir; hata halinde sonraki aşamaya geçilmez. Global config/Vault değişmeden hedefte `verify` veya gerçek smoke başarı beklentisi oluşturulmaz; bunlar P3 kapılarıdır.
6. Hedef `.codex/config.toml` içindeki yalnız iki tanımlı yol hedefe çevrilir. Before/after hash ve tam diff kapsamı doğrulanır; ilgisiz TOML alanları korunur. Hedefte paket manifestleri ve remediation dosyaları saved HEAD ile aynı, status yalnız bu config farkını göstermelidir.
7. Hedef exporter'ı `-Source` ve `-Staging` parametreleriyle ayrı disposable staging'e normal export modunda çalıştırılır. Staging `C:\Users\user\AppData\Local\Temp\opencode` altında yeni, benzersiz bir alt yol olmalı; parent varlığı ve staging/yan `.git-backup` yolunun yokluğu doğrulanmalıdır. Exporter mevcut staging'i silip yeniden oluşturduğundan mevcut public staging seçilmez. `.git` marker/directory, Vault ve private doküman dışlaması, sanitizer sonucu ve exporter exit code'u doğrulanır. `-ScanOnly` normal export'un yerine kullanılmaz.
8. Host ayarlarının dosya envanteri, existence ve ham SHA-256 değerleri yerel olarak kaydedilir. Güvenli backup P2'de, süreçler kapandıktan sonra alınır; P1 hash'leri değişmişse beklenen yeni kullanıcı düzenlemesi incelenmeden overwrite yapılmaz. Secret/config içerikleri terminale, Git'e veya rapora yazılmaz.

P1 bitişi: hedef detached ve test edilmiş; kaynak hâlâ `master`; global host ayarları değişmemiştir. Hazırlık hatasında hedef korunur, branch ve host rollback gerekmez. Açık oturumdan buraya kadar ilerlemek mümkündür.

### P2 — Bağımsız terminalde duruş ve handoff

Yürütücü, aynı Windows kullanıcısının açtığı ayrı PowerShell terminalidir. Terminal mevcut OpenCode/MCP sürecinin child'ı olarak başlatılmaz; kullanıcı Windows Terminal'den açar. Komutlar hedefte yürütülecek şekilde çalışma dizini açıkça seçilir. Bu runbook manuel yürütülür; mevcut olmayan otomatik migration script'i veya background job hazırmış gibi varsayılmaz.

1. P1'in saved HEAD, kaynak fingerprint, hedef hash/status ve başarılı kontrol sonuçları bağımsız terminalden tekrar doğrulanır. Kayda alınmamış dosya değişikliği varsa durulur. Operatör bu belgeyi ve rollback kaydını OpenCode kapanmadan erişilebilir tutar.
2. Kullanıcı migration ile ilişkili OpenCode/Codex/Claude/IDE oturumlarını normal çıkışla kapatır; en son bu orkestratör oturumu kapanır. Migration terminali açık kalır. Süreç adlarına göre toplu `Stop-Process` uygulanmaz; ilişki PID, parent chain, entry point ve workspace kimliğiyle belirlenir. İlgisiz projelerin uygulamalarını kapatmak gerekmez. İlişki belirlenemiyorsa durulur.
3. Aynı kullanıcı altında kaynak, hedef ve ortak runtime state için process/lock/recovery kontrolü tekrarlanır. `localActive=0` veya toplam disk lock sayısı tek başına yeterli değildir. `workspace-coordinator.js` workspace anahtarını verilen workspace string'inin SHA-256'sından üretir; gerçek trusted-workspace çözümlemesi ve observed path biçimleri kullanılarak ilgili lock dizinleri kontrol edilir. Lease PID'si yaşayan, writer intent/guard bulunan veya sahibi belirsiz kilit durdurma nedenidir. İlgisiz workspace kilitleri tek başına engel sayılmaz; stale kilitler otomatik silinmez.
4. Parallel batch manifestleri ve edit/memory mutation journal'ları salt okunur incelenir. Running, integrating, unknown veya pending recovery durumları çözülmeden devam edilmez. Bekleyen ve migration boyunca kullanılmayacak approval nesneleri ayrıca kaydedilir; prepared içerik migration bahanesiyle uygulanmaz. Dosya olmaması ile dosyaların terminal durumda olması ayrı doğrulanır.
5. Dört host dosyası, eski A3'teki migration-backups konumunda yeni timestamp dizinine yedeklenir: global Codex config, Codex hooks, generated OpenCode tool ve Bridge config. Dizin ACL'si yalnız mevcut kullanıcıya erişim verecek şekilde doğrulanır. Var olmayan dosya için absent kaydı tutulur; boş sahte backup üretilmez. Kaynak/backup byte hash'leri eşleşmeli; kullanıcı dosyası P1'den sonra değişmişse önce yeniden incelenmelidir.
6. Kaynakta `git switch --detach <saved-HEAD>` uygulanır; kaynak index/tracked/untracked fingerprint korunmalıdır. Sonra hedefte `git switch master` uygulanır. Başarılı durumda hedef `master`, kaynak ve pilot detached olmalıdır; saved HEAD ve remote adları değişmemiştir. Bir komut başarısızsa sıradaki komut çalıştırılmaz.
7. Global Codex config'e hedef için lowercase absolute trusted-project girdisi eklenir; eski trust girdileri korunur. Duplicate veya ilgisiz alan değişikliği kabul edilmez. Hedefte `npm run hook:install -- --client=codex --global --apply`, `npm run opencode-tools:install` ve `npm run opencode-tools:check` sırayla uygulanır. Codex managed handler tek olmalı, hedefi kullanmalı ve unrelated handler/event/group fingerprint'i korunmalıdır.
8. Global Bridge config'te yalnız `memory.vaultRoot`, mevcut kaynak `memory` dizininin absolute yoluna çevrilir. Provider/policy/state ayarları değiştirilmez. Her host değişiminden hemen sonra after-hash ve semantik allowlist kontrolü alınır. Hash ve yalnız izinli alan değişikliği doğrulanmadan diğer host dosyasına geçilmez.

P2 bitişi: branch ve host yolları hedefe yönlenmiştir; uygulamalar henüz yeniden açılmamıştır. Bu bir kabul sonucu değildir.

### P3 — Terminal doğrulaması ve yeni oturum kabulü

1. Aynı bağımsız terminalde hedef çalışma dizininden `npm run verify`, `npm run verify:ci`, `npm run smoke` ve `git diff --check` çalıştırılır. Smoke kontrollü olarak tek child MCP sunucusu açar ve kapatır; eski host sunucusu kapalı olmalıdır. Smoke'un mevcut araç availability kontrolleri model task/canary değildir; GLM çağrısı yapılmaz. P1 test sonuçları yalnız paket manifesti, dependency kurulumu ve ilgili kaynak dosyaları değişmemişse geçerlidir; değişmişse etkilenen zorunlu kontroller tekrar edilir.
2. Vault'un gerçek yolu eski root'a çözülmeli, readable/writable kontrolü ve smoke'un seçili not salt-okunur erişimi başarılı olmalıdır. Vault içeriği kopyalanmaz; not yazımı bu geçişin kabul adımı değildir.
3. Terminal sonuçları başarılıysa hedef klasör çalışma dizininde yeni OpenCode oturumu açılır. Global config startup'ta yüklendiğinden eski oturumu açık tutmak veya sadece terminalin dizinini değiştirmek yeniden başlatma yerine geçmez.
4. Yeni oturumdan MCP `workspaceContext`/startup identity hedefi göstermeli; generated global tool kontrolü `ok=true` olmalıdır. Codex hedef güven girdisi, managed hook hedefi, source common-dir bağı ve Vault root ayrıca doğrulanır. Yeni oturumun eski kaynak root'a bağlı kalması kabul başarısızlığıdır; gerçek startup gözlemi olmadan geçiş tamamlandı denmez.
5. Kaynak fingerprint korunmalı; hedef status yalnız iki yol değişikliği içeren `.codex/config.toml` farkını göstermeli; pilot ve mevcut public staging korunmalıdır. Detached hedefin test edilmesi tek başına canonical geçişi tamamlamaz.
6. Başarı kanıtı secret içermeyen uygulama raporuna yazılır: saved HEAD, aşama/komut sonucu, target branch, fingerprint equality, backup/hash doğrulaması ve gerçek startup identity sonucu. Plan durum notu/indeks bu kanıta bağlanır; tamamlanmış plan ancak bütün kabul kapıları geçince taşınır. Commit/push bu yürütme kapsamına dahil değildir.

### Kesinti ve rollback

- Terminal veya oturum kesilirse son başarılı aşama ve kaydedilmiş hash'ler esas alınır. Süreçlerin yeniden açılması, kullanıcı dosya değişikliği veya yeni commit gözlenirse kör devam edilmez; baseline yeniden değerlendirilir. Hedefin varlığı başarı sayılmaz ve worktree yeniden oluşturulmaz.
- P1 başarısızlığında branch/host değişmemiştir. Hedef detached olarak korunur; bir sonraki yürütme mevcut hedefin exact HEAD/status/hash'lerini doğrular.
- P2/P3 başarısızlığında hedef uygulamalar normal çıkışla kapatılır. Hedef config ve global host dosyaları yalnız güncel hash kaydedilmiş migration after-hash ile eşleşiyorsa before içerik/backup'a geri alınır. Migration sonrasında kullanıcı düzenlemesi varsa restore uygulanmaz; reconciliation için durulur. Önceden absent olup migration sırasında oluşturulan dosya da yalnız beklenen after-hash ile eşleşiyorsa kaldırılabilir.
- Hedef saved HEAD'te detach edilir; `master` serbest kaldıktan sonra kaynakta `git switch master` yapılır. Kaynak fingerprint ve branch doğrulanır; eski workspace'te yeniden açılan gerçek oturumun startup identity'si kontrol edilir. Kaynağa reset/stash/restore yapılmaz. Restore/branch komutlarının her exit code'u kontrol edilir.
- Backup dosyaları ve her iki eski worktree korunur. Ana root ortak `.git` ve Vault sahibi olduğundan bu plan kapsamında silinmez/taşınmaz.

### Uygulamaya hazırlık kararı ve sınırı

Güncel plan açık oturumdan P1'e başlayabilecek, P2'yi bağımsız terminalde sürdürebilecek ve P3'ü yeni oturumdan kabul edebilecek bir sıra tanımlar. Kullanıcının uygulama yetkisi vardır; yeniden genel onay istenmez. Kaçınılmaz kullanıcı handoff'u bağımsız terminali açmak ve mevcut oturumdan normal çıkmaktır. Yeni oturum gözlemi ile tamamlanan son kabul, kapanmış eski oturum tarafından yapılmış gibi raporlanamaz.

Plan revizyonu hazırlık kontrollerinin geçtiğini, lock/recovery temizliğini veya geçişin gerçekleştiğini iddia etmez. Bunlar yürütmede ölçülür. Önceki Sol verdict'i eski snapshot/sıra içindir; bu revizyona bağımsız onay olarak taşınmaz. Ana orkestratör bu revizyonu yerel kaynak üzerinden incelemiştir.

## Kullanıcının belirttiği hedef

- Eski Orkestrasyon ve Orkestrasyon V2 tek etkin proje çalışma alanında birleşecek; hedef `Yazılım_Siber/Orkestrasyon V2` olacak.
- Eski repository, Git history ve remote'lar canonical kalacak; özellikler kaybolmayacak.
- Eski ve V2 klasörleri doğrulama/rollback süresince yedek kalacak; cutover sonrası yalnız hedef klasör etkin workspace olacak.
- Bu görev planı ve araştırmayı uygulamaya hazırlar; cutover için ayrı kullanıcı talimatı gerekir.

## Doğrulanmış başlangıç durumu (2026-10-11)

- Ana çalışma alanı `Yazılım_Siber/orkestrasyon`; `master` ve `origin/master` aynı `28b9e21e0d85931da71c9c2bbf4cda118ee8e767` commit'indeydi. Yerel remote adları `origin` ve `public`; remote URL'leri bu planda tutulmaz.
- `Yazılım_Siber/orkestrasyon-v2-pilot-2026-10-06` bağımsız clone/depo değildir. `.git` dosyası ana deponun `.git/worktrees/orkestrasyon-v2-pilot-2026-10-06` yönetim alanına işaret eden temiz, detached linked worktree'dir.
- Pilot worktree `efbacd0b44f5ba2d8d5ad1b7bc68b6f5bc0e2ccb` commit'indedir. `git merge-base(28b9e21, efbacd0) = efbacd0`; `git rev-list --left-right --count HEAD...efbacd0` sonucu `10 0`. V2 commit'i mevcut `master`'ın atasıdır; V2'ye özgü ayrı commit geçmişi veya karşılıklı diverge etmiş dal yoktur.
- Commit ağacı karşılaştırmasında ana HEAD 334, V2 snapshot'ı 322 takipli dosya içerir: V2'ye özgü takipli dosya 0, mevcut HEAD'e özgü 12, ortak yolda blob'u farklı 61 dosya vardır. Bu farklar ancestry'deki sonraki 10 commit'in evrimidir; ikinci taraftan merge edilecek bağımsız dosya kümesi değildir.
- Ana çalışma ağacı ilk Sol review anında kirliydi: `git diff --stat` 20 takipli dosyada 488 ekleme/360 silme gösterdi; ayrıca 6 untracked dosya ve staged değişiklik yoktu. Bu sayılar kimlik/fingerprint değildir ve yürütme gününde yeniden alınmalıdır. Bu durum kullanıcı/önceki oturum çalışması kabul edilir; hiçbir geçiş adımı bunları stash, reset, checkout ile ezme veya hedefe otomatik katma yapamaz. Pilot linked worktree temizdi.
- Bu planın ve eşlik eden indeks/klasör açıklaması düzenlemelerinin kaynağı ana root'taki untracked/modified belgeler arasındadır; migration sırasında yeni hedefe kopyalanmayacak ve ana root yedeğinde kalacaktır.
- Hedef `Yazılım_Siber/Orkestrasyon V2` henüz mevcut değil. Bu nedenle hedef, ana çalışma ağacını fiziksel olarak taşıyarak değil, aynı Git deposunda yeni bir linked worktree olarak oluşturulacaktır.
- Git sürümü `2.53.0.windows.2`. `git worktree repair`, taşınmış worktree bağlantılarını onarmak içindir; bu geçişin ana yöntemi değildir.
- Public staging `Yazılım_Siber/hades-orchestrator-public` ayrı ve temiz çalışma ağacı olarak `af78c8c` HEAD'indeydi. `scripts/export-public.ps1` kaynak kökünü script konumundan, staging'i projenin bir üst dizinindeki sabit `hades-orchestrator-public` adından türetir; yeni hedef aynı üst dizinde olduğundan varsayılan exporter yerleşimi değişmez.
- Path envanteri: repo içindeki takipli `.codex/config.toml` eski root'a 2 yol içerir (MCP server entry ve trusted workspace); `~/.codex/config.toml` eski root ve pilot-workspace için 2 project trust girdisi içerir; `~/.codex/hooks.json` 2 eski-root referansı; `~/.config/opencode/tools/subagent-bridge.js` 3 eski-root `file://` modül referansı içerir. `~/.config/opencode/opencode.jsonc`, `~/.claude/settings.json`, `~/.config/subagent-bridge/agents.json` ve repo `opencode.jsonc`'te eski-root metni bulunmadı. `~/.config/subagent-bridge/config.json` içindeki `memory.vaultRoot` değeri `memory`'dir ve paket köküne göre çözülür; eski root'ta `memory/` var, pilot ve hedefte yok. İlgili environment override'ları inceleme anında set değildi. Config içerikleri/secret'lar bu plana kopyalanmaz.
- Runtime logs/state/cache, `personal-layout.js` varsayılanıyla `%LOCALAPPDATA%\subagent-bridge\{logs,state,cache}` altındadır; iki worktree aynı kişisel runtime state'i paylaşır. Bu taşıma sırasında kopyalanmayacak; eski işlemler kapalı ve batch/recovery/lease state'i incelenmiş olmalıdır. Güncel smoke'ta `localActive=0`, `localQueued=0`, ayrıca 7 redacted external lock kaydı görüldü; hangi workspace'e ait oldukları bu çıktıda görünmediğinden target'a özel lock kontrolü cutover preflight'inde yapılmalıdır.

Bu bulgular geçiş mimarisini belirler: en güncel committed `master` snapshot'ı yeni linked worktree'de etkinleştirilir; ana `orkestrasyon` klasörü kirli çalışma ağacı ve ortak `.git` deposunu barındıran yedek olarak kalır; 6 Ekim V2 worktree'si eski snapshot yedeği olarak tutulur.

## Geçiş ilkeleri

- Git geçmişi ve tracked tree zaten bağlantılı olduğundan iki klasörün içeriği kopyalanmayacak, cherry-pick/merge/subtree/import yapılmayacaktır. Hedef, `master`'ın geçiş öncesi kaydedilmiş tam commit'ini checkout edecektir.
- Mevcut kirli ana çalışma ağacı olduğu gibi `orkestrasyon` yolunda korunur; uncommitted değişiklikler hedefe taşınmaz. Cutover'dan önce başlangıç HEAD'i, porcelain status, tracked diff ve untracked adları tekrar kaydedilir.
- Yeni hedef aynı repository'nin linked worktree'sidir. Bu yüzden hedef `.git` dosyası ana `orkestrasyon/.git` ortak depolama alanına bağlı kalır. Ana `orkestrasyon` dizini yedek ve Git common-dir sahibi olduğu sürece silinemez/taşınamaz; daha sonra kaldırılması istenirse ayrı repo-decoupling/backup planı gerekir.
- Başlangıçta hedef detached olarak hazırlanır. Ana worktree'de `master`'ı aynı commit'te detach ettikten sonra `master` hedef worktree'de checkout edilir. Kullanıcı değişiklikleri aynı dosya ağacında bırakılır; HEAD değişimi test edilip önizlenmeden yapılmaz.
- Eski pilot worktree doğrulama/rollback süresince tutulur. Herhangi bir worktree `--force` ile kaldırılmaz, Git metadata'sı elle düzenlenmez, `git worktree prune` çalıştırılmaz.
- Secret, OAuth/session, `.hades`, `memory`, log, cache, `node_modules`, runtime state ve kişisel config hedefe kopyalanmaz. Yeni hedefe taşınan dosyalar Git'in geçiş anında checkout ettiği committed tree ile sınırlıdır.
- Hedefteki izinli path-only config değişiklikleri açık allowlist ve hash'li before/after doğrulamasıyla tanımlanır. Bu nedenle kabul “tamamen temiz status” değil, yalnız önceden belirlenmiş config farkları dışında committed tree ile aynı olma koşuludur; başka her fark geçişi durdurur.
- Public `hades-orchestrator` repo/remote ve tek yönlü sanitizer/export politikası korunur. Candidate export yalnız ayrı disposable staging'de denenir; mevcut public staging'e yazılmaz, commit/push yapılmaz.
- Batch/edit/provider kapıları, yerel policy, onay akışları ve mevcut özellik davranışı bu klasör geçişi sırasında değiştirilmez.

## Aşamalar

### A0 — Onaylanan kararları kaydet ve kaynakları dondur

Kullanıcının bu plandaki kesin kararları yürütme kaydı olarak alınır. Planın oluşturulması entegrasyonu başlatmaz; branch/remote değişikliği, dosya hareketi, rename, commit veya push için ayrıca uygulama isteği gerekir. Kaynak tree'ler salt-okunur envanter bitene kadar değiştirilmez.

### A1 — Salt-okunur repository/worktree envanteri (tamamlandı)

- `git worktree list --porcelain`, `.git` işaretçisi, HEAD/branch/status, remote adları, ancestry ve iki commit tree'si karşılaştırıldı.
- V2 snapshot'ının mevcut `master` atası olduğu, V2-only tracked dosya/commit bulunmadığı, mevcut HEAD'in 10 commit ileride olduğu ve 12 current-only/61 farklı ortak yol bulunduğu kanıtlandı.
- Eski “iki bağımsız repository ve manuel özellik birleştirme” varsayımı geçersizdir. 61 yol için conflict çözüm matrisi gerekmiyor; bunlar current `master`'a ancestry üzerinden zaten taşınmış sonraki değişikliklerdir.
- Ana dirty state ve V2 clean state ayrıca kaydedildi. Yürütme gününde status/HEAD değişmişse bu planın snapshot sayıları değil, yeni canlı envanter esas alınır ve değişiklikte durulur.

### A2 — Hedef linked worktree oluşturma (uygulama sırasında)

1. Tüm OpenCode/MCP/Bridge süreçleri kapatılmış ve workspace lock yok olduğu doğrulanır. Hedef yolun hâlâ bulunmadığı, kaynak root'un `master` olduğu ve kaynak status'un son bilinen snapshot ile uyumlu olduğu kontrol edilir.
2. Ana root'ta `HEAD`, `git status --porcelain=v2`, index entry/mode/hash'leri, tracked dosya byte+mode hash'leri ve untracked dosya byte hash'leri local olarak hesaplanır; secret içerik veya ham diff plan/log'a yazılmaz. Git operation marker/lock, hooks/filters ve status ayrıca denetlenir. Kaynak dosyalar değişmeden kalır.
3. `git -C <ana-root> worktree add --detach <hedef> <kaydedilmiş-HEAD>` çalıştırılır. Hedefte `git status --porcelain` boş, HEAD beklenen commit, `git rev-parse --git-common-dir` ana `.git` ile aynı olmalıdır.
4. Yalnız şu doğrulanmış source remediation dosyaları detached target'a alınır: `scripts/export-public.ps1`, `scripts/smoke-mcp.js`, `scripts/install-memory-hook.js`, `tests/export-public.test.js`, `tests/memory-hook.test.js`, `tests/memory-hook-clients.test.js`. Target `.codex/config.toml` içinde yalnız server entry ve `SUBAGENT_BRIDGE_TRUSTED_WORKSPACE` path değerleri target'a çevrilir. Source/target hash'leri ve status kaydedilir; yeni test untracked, kalan altı repo dosyası modified olmalıdır. Başka dirty path kopyalanmaz; hash/status farklıysa durulur.
5. Windows `core.autocrlf=true` olduğundan checkout dosyalarının ham byte hash'i Git blob hash'iyle karşılaştırılmaz. Önce `git -C <target> diff --exit-code <saved-HEAD> -- package.json package-lock.json` ile Git-normalized tree eşleşmesi doğrulanır; sonra target manifestlerinin ham SHA-256 değerleri kaydedilir (`Get-FileHash -Algorithm SHA256`). Yalnız target'ta `npm ci` çalıştırılır. Kurulumdan sonra aynı `git diff --exit-code` temiz dönmeli ve iki dosyanın ham SHA-256 değerleri npm ci öncesi/sonrası eşleşmelidir; `node_modules` ignored kalmalı. Sonra `node --test tests/export-public.test.js tests/memory-hook.test.js tests/memory-hook-clients.test.js` çalıştırılır. Herhangi bir hata/hash/manifest farkında host ayarı ve branch handoff yapılmadan durulur.
6. Bağımlılık/target dosya testleri geçince ana root'ta aynı commit için `git switch --detach <kaydedilmiş-HEAD>` uygulanır; status/fingerprint değişmediği doğrulanır. Sonra target'ta `git switch master` yapılır ve branch/HEAD'in saved baseline ile aynı olduğu kontrol edilir. Herhangi bir tracked/untracked içerik değişirse veya beklenmeyen branch/ref görülürse durulur; otomatik reset/restore yapılmaz.
7. `git worktree list --porcelain` target'ın `master`, eski ana root'un detached yedek ve pilot kaynağın detached yedek olduğunu göstermelidir. Üç worktree ve ortak `.git` deposu doğrulama boyunca korunur.

Bu yöntem ana worktree'nin dosya sisteminde taşınmasını önler. Git'in resmi `git-worktree` belgesi main worktree taşındığında linked connection'ları `repair` ile onarmayı destekler; ancak bu planda main root `orkestrasyon` yerinde kalır ve `repair` gerekmemelidir. Hedef linked worktree için `.git` dosyasının ana `.git` yoluna bağımlılığı kabul edilmiş tasarım özelliğidir.

### A3 — Host path ve public export kontrolü (uygulama sırasında)

- Host ayarları için, dosyaları değiştirmeden önce şu kişisel dosyalar `%LOCALAPPDATA%\subagent-bridge\state\migration-backups\orkestrasyon-v2\<YYYYMMDDTHHMMSSZ>` altına kopyalanır: `~/.codex/config.toml`, `~/.codex/hooks.json`, `~/.config/opencode/tools/subagent-bridge.js`, `~/.config/subagent-bridge/config.json`. Backup dizini çalışma alanı dışında kalmalı ve Windows ACL'si yalnız mevcut kullanıcı erişimine izin vermelidir. Her kaynağın ve backup kopyasının SHA-256 değerleriyle eşleştiği doğrulanır; contents/token/path values terminal, plan veya log'a yazılmaz.
- Target `.codex/config.toml` içinde yalnız `mcp_servers.deepseek-subagent.args[0]` ve `mcp_servers.deepseek-subagent.env.SUBAGENT_BRIDGE_TRUSTED_WORKSPACE` eski-root değerleri target'a değiştirilir. Bu iki path-only substitution tek tracked config delta'sıdır; her diğer TOML alanı byte-semantically korunur.
- Global `~/.codex/config.toml` içinde canonical target'ın lowercase absolute path'ine `[projects.'<target-path-lowercase>']` girdisi ve `trust_level = "trusted"` eklenir. Mevcut eski-root ve `pilot-workspace` trust girdileri yedek/worktree süresince silinmez veya değiştirilmez.
- Target'tan `npm run hook:install -- --client=codex --global --apply` yürütülür. Sonuçta `~/.codex/hooks.json` içinde `UserPromptSubmit` altında tam bir managed `memory-hook-client.js --client=codex` handler bulunmalı; handler target script path'ini kullanmalı, eski-root handler kalmamalı, ilgisiz handler/event/group alanları migration öncesi fingerprint ile aynı olmalıdır.
- Target'tan `npm run opencode-tools:install` yürütülür. `~/.config/opencode/tools/subagent-bridge.js` içindeki üç modül URL'si sadece target'a çözülmeli; `npm run opencode-tools:check` sonucu `ok=true` olmalıdır. `~/.config/opencode/plugins/second-brain-memory.js` incelemede yoktu; target'ta mevcut install yoksa oluşturulmaz.
- Global Bridge config'teki `memory.vaultRoot: "memory"`, target'ta olmayan `<target>\memory` yoluna çözülür. Geçişte Vault taşınmaz/kopyalanmaz; global `vaultRoot` mevcut `<ana-root>\memory` Vault'unun absolute yoluna çevrilir. Ana root Git common-dir sahibi olarak zaten korunacağı için Vault da aynı konumda kalır; eski root kaldırılacaksa bu ayrı bir repository/Vault de-coupling planıdır. Değişiklik öncesi backup/hash tutulur; `npm run verify` ve smoke için target'tan Vault read/write ve mevcut nota salt-okunur erişim doğrulanır.
- `%LOCALAPPDATA%\subagent-bridge\state` ortak kullanımı bilinçli olarak korunur; cutover öncesi çalışan batch, workspace lock, pending recovery/journal/migration bulunmadığı salt-okunur kontrol edilir. State başka yere kopyalanmaz ve iki server aynı anda başlatılmaz.
- İlgili environment değişkenleri, terminal/IDE workspace, başka global tool ve host MCP tanımları yürütme gününde secret göstermeyen taramayla yeniden envantere alınır. Her surface inspected/absent/inaccessible diye kaydedilir; gerçek OpenCode/Bridge config erişilemezse ilgili update yapılmadan durulur. Eski ve yeni target trusted workspace kimlikleri doğrulanır.
- `%LOCALAPPDATA%\subagent-bridge\state` ortak kullanımı bilinçli olarak korunur; cutover öncesi çalışan batch, workspace lock, pending recovery/journal/migration bulunmadığı salt-okunur kontrol edilir. State başka yere kopyalanmaz ve iki server aynı anda başlatılmaz.
- İlgili environment değişkenleri, terminal/IDE workspace, başka global tool ve host MCP tanımları yürütme anında secret göstermeyen taramayla yeniden envantere alınır. Her surface inspected/absent/inaccessible diye kaydedilir; eski ve yeni target trusted workspace kimlikleri doğrulanır.
- `scripts/export-public.ps1` `/XF .git` ile linked-worktree `.git` marker dosyasını da dışlar; `/XD .git` directory filtresi korunmuştur. Yeni `tests/export-public.test.js` hem `.git` file hem directory fixture'ında source metadata sızıntısı olmadığını ve mevcut disposable staging `.git` directory/config'inin aynen korunduğunu doğrular (2/2).
- `-ScanOnly` yalnız mevcut staging'i tarar; source'dan kopyalama, kürasyon veya sanitizasyon yapmaz. Normal export explicit source ve yeni disposable staging path'iyle çalıştırıldı: exit 0, 263 dosya, `.git` file/directory yok, `memory` ve private `docs/plans` yok. Bu gözlem mevcut dirty root'u kapsar; yeni target oluşturulduğunda aynı candidate export kontrolü tekrar edilir. Mevcut public staging'e yazılmaz, commit/push yapılmaz.
- `scripts/smoke-mcp.js` artık `check_glm_subagent` çağırmaz ve GLM erişimini başarı şartı saymaz. MCP/schema/resource/workspace/memory kontrolleri korunmuştur; `npm run smoke` geçti.
- Sol review remediation'larının target repository allowlist'i tam olarak: `.codex/config.toml` yalnız iki path substitution; `scripts/export-public.ps1`; `scripts/smoke-mcp.js`; `scripts/install-memory-hook.js`; `tests/export-public.test.js`; `tests/memory-hook.test.js`; `tests/memory-hook-clients.test.js`. Global config dosyaları repository status dışı ayrı allowlist'te tutulur. Kaynaktaki diğer kirli dosyalar hedefe taşınmayacaktır.

### A4 — Hedef doğrulama ve kontrollü cutover

- A2'de `npm ci` başarılı ve `package.json`/`package-lock.json` hash'leri saved baseline ile aynı olmalıdır; bu hedef bağımlılık durumu A4 testlerinde kullanılır, burada tekrar `npm ci` yapılmaz. Ardından `npm test`, `npm run verify`, `npm run verify:ci`, GLM çağırmayan smoke, `npm run drill` ve `git diff --check` yürütülür. Vault erişimi target'tan `<ana-root>\memory` absolute root ile sağlanır; Vault taşınmaz. Hedef tracked tree'si geçiş öncesi `master` commit'iyle aynı olmalı, yalnız A3'te tam sayılan 7-path allowlist ve global config backups bulunabilir; testlerin ürettiği ignored state ayrıca denetlenir.
- Yeni workspace ile MCP/Bridge startup, `trustedWorkspace`, Vault erişimi, script entry point ve gerekli host araçları kontrollü şekilde doğrulanır. GLM/provider model çağrısı veya edit pilotu bu path testine dahil edilmez.
- Host config path güncellemelerinden sonra ilgili uygulama/MCP süreçleri yeniden başlatılır; `git worktree list`, target branch/HEAD, yalnız izinli diff'leri içeren status ve workspace kilidi yeniden doğrulanır.
- Başarılı cutover'dan sonra yeni OpenCode session'larında yalnız `Orkestrasyon V2` aktif çalışma hedefi olarak açılır. Eski `orkestrasyon` dirty backup/main common-dir sahibi, 6 Ekim pilot klasörü ise eski snapshot yedeği olarak tutulur; hiçbiri doğrulama penceresinde silinmez.

### A5 — Kabul ve rollback

Kabul için aşağıdakilerin tümü gerekir:

- Yeni hedef `master` branch'ini ve kaydedilmiş HEAD'i taşır; `merge-base`, commit parent ilişkisi, takipli dosya ağacı ve remote isimleri geçiş öncesi baseline ile uyumludur. Kod-level V1/V2 merge yapılmamıştır.
- `git worktree list --porcelain` doğru rollerle target, kirli eski root ve eski pilot snapshot'ını gösterir. Target yalnız `.codex/config.toml`'daki iki path substitution ile altı diğer allowlist dosyasındaki beklenen diff/new test'i taşıyabilir; geri kalan tracked tree kaynak HEAD'le aynı olmalıdır. Eski root'un index, tracked bytes/modes ve untracked bytes başlangıç fingerprint'iyle aynıdır.
- Yeni OpenCode/MCP trusted workspace, Codex ve Bridge config path'leri hedefe göre çalışır; global Vault root, Codex trust/hooks ve generated OpenCode tool değişiklikleri secret içermeyen backup/hash ve rollback adımıyla kayıtlıdır.
- `npm test`, `npm run verify`, `npm run verify:ci`, düzeltilmiş GLM çağırmayan smoke, `npm run drill` ve `git diff --check` geçer. `npm run pilot`, ücretli canary, gerçek provider çağrıları, edit batch'i ve public push ayrıca açık kullanıcı onayı gerektirir.
- Public sanitized export'un dosya seti ve yasak içerik taraması doğrulanır; commit/push ayrı kullanıcı isteği olmadan yapılmaz.

Her kapı başarısızsa yeni session'lar hedefe alınmaz ve public export/push yapılmaz. **Handoff öncesi:** main root hâlâ `master`'daysa branch değişimi yapılmaz; target detached yedek olarak bırakılır. **Handoff sonrası:** target process'leri durdurulur; hedef status ve source/target fingerprint doğrulanır. Hedef `.codex/config.toml` allowlist değişikliği yalnız kayıtlı migration sonrası hash'iyle eşleşiyorsa eski haline alınır. Global Codex trust/hooks, Bridge Vault path'i ve OpenCode generated tools yalnız güncel hash beklenen migration sonucu ile eşleşiyorsa backup'tan geri yüklenir. Sonra target aynı saved HEAD'de detach edilir ve ancak branch serbest kaldıktan sonra eski main root'ta `git switch master` yapılır; main root dirty state ve branch/ref yeniden doğrulanır. Target/source yeni user edit veya commit içeriyorsa hiçbir restore/branch hareketi yapılmaz; iki worktree korunur ve reconciliation için durulur. İlgili süreçler yeniden başlatılıp eski workspace identity kontrol edilir. Ana root'taki başlangıç değişikliklerine reset/stash/checkout uygulanmaz. Ana `orkestrasyon` root'u ortak `.git` deposunu taşıdığı için yedek süresince korunur.

## Kullanıcının onayladığı kararlar ve güncel teknik yorumu

- V2 kaynak yolu `Yazılım_Siber/orkestrasyon-v2-pilot-2026-10-06`; bu bağımsız repository değil, `efbacd0` commit'indeki temiz detached linked worktree'dir.
- Eski/current `orkestrasyon` ortak Git deposu, `master`, `origin` ve `public` remote adları korunur. Yeni hedef aynı Git deposuna bağlı worktree olur; bağımsız import veya merge commit'i yoktur.
- Canonical çalışma alanının yolu `Yazılım_Siber/Orkestrasyon V2` olacaktır.
- Özellik koruma kararı geçerlidir; V2 snapshot'ı güncel `master` ancestry'sinde bulunduğundan en güncel committed HEAD kullanılır. Dosya çatışması çözümü gerektiren divergent dal yoktur.
- Eski ana root'taki mevcut kirli çalışma ağacı otomatik entegrasyona katılmaz; root yedek ve ortak `.git` deposu olarak korunur.
- Public `hades-orchestrator` repo ve tek yönlü sanitizer/export akışı korunur; eski ve pilot klasörleri doğrulama boyunca yedek olur.
- Secret, credentials, `.hades`, `memory`, logs, cache ve runtime state yeni hedefe kopyalanmaz.

## Tamamlanan araştırma ve kalan yürütme kapıları

Araştırmayla kapatılan sorular:

- Ancestry/remote: V2, `master`'ın ancestor commit'idir; iki ayrı repository/history birleştirme gerekmiyor. `origin` ve `public` isimleri aynı ortak repository config'indedir.
- Dosya matrisi: 0 V2-only tracked path, 12 current-only path, 61 aynı yoldaki farklı blob. Farklar current HEAD'in V2'den sonra gelen 10 commit'iyle açıklanır; no-conflict merge yolu seçilmiştir.
- Çalışma ağacı: eski main root kirli ve V2 linked worktree temiz. Kirli diff otomatik taşınmayacak, ana root'ta korunacak.
- Hedef/rollback: hedef yok; eski ana root ve V2 pilot worktree cutover boyunca korunacak. Ana root aynı zamanda linked worktree'lerin ortak Git metadata sahibidir.
- V2 backup: ayrı private GitHub backup reposu `mecik-arda/orkestrasyon-v2-pilot-backup-2026-10-11` doğrulandı; `main` branch'i kaynak pilotun temiz `efbacd0` commit'idir. Backup push'u source worktree'yi/branch'leri değiştirmedi.
- Public export: staging ayrı/temiz; script kaynak ve staging konumlarını göreli hesaplar, yeni sibling hedefle staging yolu değişmez.
- Host path: repo `.codex/config.toml`, global `~/.codex/config.toml`, `~/.codex/hooks.json` ve global OpenCode tool'da eski root referansları bulundu. OpenCode/Claude ana config'lerinde eski path yoktur; bu, üretilmiş integration'ların path içermediği anlamına gelmez.
- Vault/state: global Bridge config `memory.vaultRoot: "memory"` kullanır; relative root paket köküne çözülür. Eski root'ta memory dizini mevcut, hedef ve pilotta yoktur. Runtime state/log/cache varsayılanı global `%LOCALAPPDATA%\subagent-bridge` olup worktree'lerce paylaşılır.
- Export/smoke remediasyonu (2026-10-11): exporter `/XF .git` filtresiyle güncellendi; `.git` file/directory fixture ve staging `.git/config` koruması 2/2 geçti. Normal exporter mevcut dirty root'tan disposable staging'e çalıştırıldı; 263 dosya çıktı, `.git`, `memory` ve private plans yoktu. `-ScanOnly` yalnız mevcut staging'i tarar; target oluşturulduğunda normal candidate export yeniden çalıştırılacak. Smoke'tan GLM tool invocation/availability şartı çıkarıldı; `npm run smoke` geçti.
- Doğrulama (2026-10-11): `npm test` 917 toplam, 913 geçti, 4 POSIX'e özgü test atlandı, 0 başarısız; `npm run verify`, `npm run verify:ci`, önceki GLM'siz `npm run smoke` ve `git diff --check` geçti. Codex hook whitespace/replacement regresyonu Windows'ta hedefli olarak geçti. Provider/model task'ı veya GLM tool call yapılmadı.

Bağımsız uygulamaya-hazırlık incelemesi:

- GPT-6.1 Sol `subagent-bridge_codexSol61` ilk iki salt-okunur review'da `NOT READY` dedi; actionable bulgular her turda kod, test ve plana işlendi.
- Üçüncü GPT-6.1 Sol review verdict'i `READY WITH EXECUTION-TIME PREFLIGHT` oldu. Linked-worktree topology, target allowlist/transfer order, Windows hook quoting/replace-idempotency, exporter `.git` filtresi, GLM'siz smoke ve rollback handoff sırası kapalı değerlendirildi.
- Dördüncü review A2.5 `npm ci` sırasını blocker yaptı; beşinci review bu düzeltmeyi doğruladı. Dependency kurulumunun detached target'ta, branch handoff/global settings öncesi yapılması ve package manifestlerinin CRLF farkını hesaba katan Git-normalized + before/after byte-hash kontrolleri eklendi. Beşinci verdict `READY WITH EXECUTION-TIME PREFLIGHT`; yeni blocker kalmadı.
- Sol, test sayılarını supplied evidence olarak kabul etti; bağımsız olarak testleri yeniden çalıştırmadı. Ana orkestratör Windows'ta `npm test`, `verify`, `verify:ci`, GLM'siz smoke ve hedefli export/hook testlerini çalıştırdı.
- Vault hedefe kopyalanmayacak; Bridge config'in relative `memory` root'u execution sırasında absolute `<ana-root>\memory` yoluna çevrilip hash-yedeklenecek. Eski ana root Git common-dir ve Vault bağımlılığı nedeniyle ayrı decoupling/migration tamamlanmadan kaldırılamaz.
- Branch handoff sırası kirli çalışma ağacında çalıştırılmadı; execution öncesi exact preservation fingerprint, execution identity altında target-specific lock/operation/hook/filter preflight'i, global OpenCode/Bridge config görünürlüğü ve her komut exit-code kontrolü şarttır. Sol review runtime'ında pilot worktree status için ownership reddi gözlendi; aynı identity altında geçerli Git ownership doğrulanmadan mutasyon yapılmaz.

Uygulamaya geçmeden hemen önce yeniden doğrulanması gerekenler:

- Ana HEAD/status, V2 status, hedef yolu ve public staging HEAD/status yürütme gününde yeni fingerprint ile kaydedildi mi?
- Repo/global Codex config, hooks, generated OpenCode tool, Bridge config, Vault, runtime state, workspace env ve IDE/terminal entegrasyonları allowlist/rollback kararıyla envantere alındı mı?
- Cutover anında workspace lock, Git operation marker/lock, pending recovery ve worker yok mu; hooks/filters'in branch switch'e etkisi anlaşıldı mı?
- Kirli root'taki index entries, tracked file bytes/modes ve untracked file bytes branch handoff öncesi/sonrası eşleşiyor mu; her komut exit code'u kontrol ediliyor mu?
- Exporter `.git` file exclusion, GLM'siz smoke ve mevcut-root disposable candidate export geçti; yeni target oluşturulduktan sonra candidate export manifest/sanitizer kontrolü yeniden geçiyor mu?
- Hedefte Vault read/write ve mevcut note read doğrulanabiliyor mu; shared runtime state politikası net mi?
- Host değişiklikleri özel ve güvenli biçimde yedeklenip `.codex/config.toml`, global Codex trust/hooks, Bridge Vault path'i ve OpenCode tool için rollback restore/restart sırası tanımlandı mı?

Bu plan uygulama hazırlığıdır; A2-A5 henüz yürütülmedi. Planı hazırlamak klasör/worktree oluşturma, config güncelleme, branch değiştirme, test/kurulum çalıştırma, commit/push veya eski klasör silme izni değildir. Cutover için kullanıcıdan ayrıca açık talimat gerekir.

## Araştırma kaynakları

- Yerel Git kanıtı: `git worktree list --porcelain`, `git rev-parse`, `git merge-base`, `git rev-list --left-right --count`, `git ls-tree`, `git diff` ve Git 2.53.0 Windows CLI çıktıları, 2026-10-11.
- Git Documentation, `git-worktree` 2.53.0: https://git-scm.com/docs/git-worktree/2.53.0 (erişim: 2026-10-11 UTC). Main ve linked worktree ilişkisini, ortak repository metadata'sını, `worktree add/list/repair/remove` davranışlarını tanımlar.
- Yerel exporter kaynağı: `scripts/export-public.ps1` satır 1-4; staging sibling yolu `hades-orchestrator-public` olarak türetiliyor.
- GPT-6.1 Sol bağımsız incelemesi, kullanıcı isteğiyle `subagent-bridge_codexSol61` üzerinden read-only yapıldı; bulgular ana orkestratör tarafından ilgili yerel kaynaklara karşı kontrol edildi.
- Mevcut ürün kabul/gate kayıtları: `docs/plans/yarim-kalanlar/ORKESTRASYON_V2_PARALEL_COK_AJANLI_KODLAMA_MIMARISI_2026-09-29.md`, `docs/reports/ORKESTRASYON_V2_PRODUCTION_READINESS_2026-10-06.md` ve `docs/plans/yapilanlar/PUBLIC_YAYIN_PLANI.md`. Bunlar klasör geçişi sırasında provider/edit gate'lerinin açılmasına izin vermez.
