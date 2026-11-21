# Codex–Hades entegrasyonu: yeniden değerlendirme

## 2026-11-21 — PR #2 yayın durumu

GitHub karşılaştırması `main` dalını `213b12d679559f79b6c3d8ab7bd556abf9008a1a`, feature dalı `codex/hades-codex-startup-fix` dalını `95c807b96facdf3e424c0fd087b4ccfc49f9754a` üzerinde gösterdi. PR #2 `main` hedefiyle açık; karşılaştırmada feature dalı 8 commit ahead ve 1 commit behind idi. PR #2 içindeki değişiklikler `main`'e alınmış değildir. Kullanıcının talimatıyla hosted CI bu geçişin kabul kapısı değildir; bu kayıtta kontrol sonuçları yayın kararı için kullanılmadı. PR'ı birleştirme işlemi yapılmadı. Bu bilgi, mevcut kişisel `.codex/config.toml` değişikliğini kapsam veya commit etmez.

## 2026-11-21 — Tam plan uygulama denetimi

Bu denetim, `docs/plans/CODEX_DESKTOP_UCTAN_UCA_GECIS_PLANI_2026-10-18.md` kabul maddelerini mevcut feature checkout'u, güncel rapor kayıtları ve salt-okunur canlı workspace kaynaklarıyla karşılaştırdı. Önceki canlı provider görevleri ve tam test paketi tekrarlanmadı.

- **P0 — bağlantı ve güven sınırı:** Hades `resources/list` başarılı oldu. `processCwdSha256` ve `trustedWorkspaceSha256` değerlerinin ikisi de `f876a30710252f1eb140af2b915ce9ce3252ca89aa7345ba25caf4fef1ccda61` ile mevcut worktree'nin üretim `fingerprintTrustedWorkspace` sonucu olarak hesaplanan hash ile eşleşti. Rules resource'u `verified/match`, manifest `ad960e7449e09d92747588ce8181ecedc9e6eeb9c027f2cf19a7d1ff268511db` döndürdü. `startup_context=unavailable`; bunlar çalışan kaynak revision'ı veya etkin config için host attestation değildir.
- **P1 — Codex yürütmesi:** Önceki raporlardaki Desktop→MCP→Codex strict read-only görevleri ve redakte metrik eşleşmesi geçerlidir. Bu denetimde yeni görev çağrısı yapılmadı.
- **P1b — seçili modeller:** Gemini 3.8 Flash High/Medium/Low ile GPT-OSS 120B için canonical kimlik ve başarılı salt-okunur görev kayıtları mevcuttur. Claude Code ve Claude model görevleri kullanıcı abonelik kararıyla bu kabul kapsamının dışındadır. Gemini High `web_research` için tamamlanmış web-tool olayı ve aynı URL'ye bağlı kanıt zarfı yoktur; bu ayrı kabiliyet geçişin özgün P1b model yürütme ölçütü değildir. GPT-OSS read-only görevi geçmişte `42`, exit 0 ve tek denemeyle tamamlanmıştır, ancak eşlik eden probe `process_error` verdiği için geçici dizin temizliği doğrulanmamıştır.
- **P2–P5 — işlevsel geçiş:** Kontrollü edit/onay/recovery, read-only ve edit batch, doğrudan DeepSeek API kabulü ve aktif OpenCode yürütmesinin kaldırılması mevcut kabul kayıtlarında tamamlanmıştır. Bu denetimde canlı edit, batch, provider veya approval aracı çağrılmadı.
- **P6 — işletim ve belgeler:** README, plan, indeks ve geçiş kayıtları yukarıdaki kapsam ayrımlarını yansıtacak şekilde uzlaştırıldı. Sol bağımsız incelemesi kullanıcı tarafından iptal edilmiştir ve bu hedef için kapı değildir. Kullanıcının talimatıyla hosted CI sonucu da kabul ölçütü değildir. AST classifier varsayılanı kapalı kalır.
- **GitHub yayını:** PR #1 `213b12d679559f79b6c3d8ab7bd556abf9008a1a` ile `main`'e merge edilmiştir. Kaynak denetimi anındaki GitHub karşılaştırması feature dalını `main`'e göre altı commit ahead ve bir commit behind gösterdi; o andaki altı feature commit'i `main`'de değildi. Denetimden sonra yalnız dört durum belgesini içeren `d1187ca0e51f12c679ca1c4f96a10352ce26ee6c` commit'i oluşturulup aynı feature dalına push edildi. Kaynak kodu değişmedi; `main`'e merge yapılmadı.
- **Yerel doğrulama:** Güncel kaynak commit'i `6b0db5fbd037488e1e8d2713c4a719cffd04cae4` için son `npm run verify:local` kaydı tüm beş aşamanın geçtiğini; 1.268 başarılı, 5 koşullu atlanan ve 0 başarısız testi; 7.963 ms benchmark'ı ve sabit kaynak snapshot'ını bildirir. Bu tam koşu bu denetimde yeniden çalıştırılmadı. Yerel kullanıcı `.codex/config.toml` değişikliği korundu; belge düzenlemesinden ayrı tutuldu.

**Sonuç:** Özgün planın P0–P5 işlevsel kabulü feature checkout'unda kayıtlı kanıtla karşılanmıştır. Gemini High canlı web araştırması, GPT-OSS geçici alan temizliği, çalışan revision attestation'ı ve güncel feature değişikliklerinin `main`'e alınması ayrı kalan durumlardır. Bunlar özgün P0–P5 işlevsel kabulini geriye dönük başarısız yapmaz; bu nedenle sonuç “feature dalında plan kapsamı işlevsel olarak uygulandı” şeklindedir, “GitHub main güncel” veya “her kabiliyet canlı kabul edildi” değildir.

## 2026-11-21 — Kapalı backend dispatch kapısı

Plan uyum denetiminde `enabled=false` ayarının health çıktısını `disabled` yaptığı, fakat `runInternal` dispatch yolunun aynı ayarı denetlemediği bulundu. Doğrudan `native_claude`/`claude_code` hedefi runtime üzerinden çalıştırılabilir durumdaydı; böylece kapalı işaretlenen sağlayıcı adapter'a ulaşabiliyordu. Runtime artık route çözüldükten ve adapter bulunma kontrolünden sonra, diğer dispatch hazırlıklarından önce ilgili backend için açık `enabled=false` değerini `provider_disabled` ile reddediyor. Bu, fallback'i başlatmadan önce başarısız sonuç verir; adapter deneme sayısı sıfırdır.

Kullanıcının Claude Code aboneliği olmadığı kararıyla `config/agents.json` dağıtım şablonundaki `claude_code.enabled` false yapıldı. Runtime regresyonu sahte adapter'ın hiç çağrılmadığını ve `adapterAttempts=0` olduğunu doğrular; config regresyonu dağıtım varsayılanını sınar. Bu değişiklik kullanıcının kişisel `~/.config/subagent-bridge/agents.json` dosyasını veya çalışan Hades sürecini değiştirmez. Antigravity üzerinden sunulan Claude model alias'ları ayrı sağlayıcı yoludur ve bu değişiklik onları kapatmaz.

Üç tam suite denemesinde farklı süreç/Git yoğun testler aralıklı başarısız oldu; ilgili testler izole çalıştırmada geçti. Bunu test dosyası eşzamanlılığının makine kaynakları üzerindeki baskısı olarak değerlendirmek makul, fakat her failure için kesin kök neden kanıtlanmadı. `npm test` ve `verify:local` test-suite aşaması artık aynı iki-dosya concurrency sınırını, seri performans benchmark'ı da concurrency 1 ayarını kullanıyor. `verify:local` bu ayarla tam geçti: verify-ci; 96 test dosyasında 1.268 başarılı, 5 koşullu atlama, 0 başarısızlık; benchmark 7.963 ms; sentetik MCP smoke; sentetik config/Vault verify. Toplam süre 470.060 ms ve kaynak snapshot'ı baştan sona aynı kaldı. Gerçek Vault veya provider kimlik bilgileri kullanılmadı. Hedefli config/runtime/verify-local testleri 101/101 geçti. Kişisel config ve çalışan Hades süreci değiştirilmedi.

## 2026-11-21 — Antigravity web izi ve tam yerel doğrulama

Akış izleyicisi, yalnız `DONE` durumundaki `read_url`/`read_url_content` olaylarını görerek tamamlanmış kaynak okuması sayıyordu. Antigravity CLI `ACTIVE` olayı üretip aynı çalıştırmada tamamlanmış olay üretmezse önceki sınıflandırma `not_invoked` sonucuna düşebiliyordu. İzleyici artık `ACTIVE` olayını başlatılmış fakat tamamlanmış kanıtı gözlenmemiş durum olarak `not_observed` sınıfına alıyor; URL hash'ini veya başarı kanıtını yalnız tamamlanmış, çıktılı `DONE` olayından üretiyor. Geçmiş canlı denemelerin ham olay akışı tutulmadığından bu kusurun önceki High sonuçlarını açıklayıp açıklamadığı belirlenemiyor.

Regresyon; `ACTIVE` olayındaki çıktı metninin sızmamasını, kaynak hash'i oluşturmamasını ve tamamlanmış kullanım sayılmamasını doğruluyor. Test ayrıca tamamlanmış web kanıtı için mevcut aynı-deneme URL bağı şartını koruyor. Odaklı Antigravity capability, adapter ve web-evidence paketi 92/92 geçti.

Son `npm run verify:local`, normal izin mekanizması altında beş aşamanın tamamını geçti: `verify:ci`; 96 dosyalı tam test paketi (1.267 geçti, 5 koşullu atlama, 0 başarısız); zorunlu benchmark (11.297 ms); sentetik stdio smoke; sentetik config/Vault verify. Kaynak snapshot SHA-256 `65de853ebde05de598c5350748d680920f04864a849266c6777c9cb2bbce959a` başlangıç ve bitişte aynı kaldı. Sandboxed ilk koşuda test aşaması başarısız oldu; aynı loopback HTTP regresyonları sandbox dışında 10/10 geçti ve izinli tam koşu yeşil sonuç verdi. Gerçek Vault veya provider kullanılmadı.

P1b'nin özgün kabul koşulu seçili model için erişim, gerçek canonical kimlik ve başarılı salt-okunur pilot olduğundan, Gemini High'ın yerel dosya pilotu bu model-yürütme kapısını karşılar; web-tool kullanımı bu ölçütte şart değildir. P1b, seçili Gemini High/Medium/Low modelleri için tamamlanmıştır. `web_research` profilinin istediği canlı web kanıtı ayrı kabiliyet olarak açık kalıyor: tamamlanmış web-tool izi ve aynı URL'ye bağlı kanıt zarfı gösteren başarılı canlı Hades/model sonucu yok. Yeni canlı tanı çağrısı platform auto-review kullanım sınırında çalıştırma öncesi durdu; ret aşılmadı ve istek tekrarlanmadı. Önceki High denemelerinin ham olay akışı tutulmadığından yeni sınıflandırıcının tarihsel sonuçları geriye dönük değiştirdiği iddia edilemez.

GPT-OSS 120B için 21 Kasım canlı eki: `check_antigravity_subagent` `gpt_oss_120b` modelinde `modelAccess=available` ve `gpt-oss-120b-medium` canonical kimliğini bildirdi. Tek salt-okunur görev `42`, exit 0, completed, tam çıktı, bir adapter denemesi ve sıfır retry ile tamamlandı; maliyet alanı `null`. Probe cevabındaki `failureClass=process_error`, adapter kaynak akışında geçici dizin temizliğinin başarısız olduğu durumda üretilir. Temizlik başarılı doğrulanmadığından olası temp artığı hakkında olumlu iddia yoktur; bu durum model görevi sonucundan ayrıdır. Resmi model kataloğu erişim 2026-11-21 tarihinde bu model için kaldırılma tarihini 2026-11-30 olarak gösteriyordu.

## 2026-11-20 — Geçiş planı kapanış kontrolü

- **P0 ve P1 geçti.** Canlı Hades'in process ve trusted workspace özetleri bu checkout ile eşleşti. Model alanı verilmeden yapılan salt-okunur aritmetik görev ve açık modelle yapılan seçili fixture görevi, ayrı çağrılarda `gpt-6.1-sol` istendi ve çözümlendi. Her ikisi `42`, çıkış 0, tek adapter denemesi ve yazılmış redakte telemetri döndürdü. Fixture ve Git kapsamı korundu. Varsayılan görev 7.432 ms, fixture görevi 12.026 ms sürdü. Astra seçilmedi.
- **P1b kısmi.** Antigravity CLI 1.5.13 ile canlı Gemini Medium, `gemini_flash_3_8_medium` → `gemini-3.8-flash-medium` olarak tek denemede `42` döndürdü. İlk denemede web kullanımını açıkça yasaklayan istem yanlışlıkla web isteği sayılmıştı. Düzeltmeden sonraki canlı sonuç 27.066 ms ve çıkış 0 verdi. Low için önceki canlı salt-okunur kabul ve High için önceki yerel dosya görevi geçerli.
- **High canlı web kanıtı açık.** İlk High görevi 115.192 ms sonunda `timeout` verdi, web aracı çağrısı gözlenmedi. Daha kısa görev 104.978 ms'de çıkış 0 verdi ancak `webReadStatus=not_invoked` ve `web_evidence_invalid/web_evidence_missing` döndürdü. CLI çıktı şemasının yalnız tanı koşusunda çıkarılması sonucu değiştirmedi. Hades'in sıkı doğrulaması, çalışma alanı yalıtımı ve izin kuralları her koşuda korundu. Global web ask/deny kuralı veya strict araç politikası gözlenmedi ve katalogda ayrı bir web araştırma ajanı bulunmadı. Canlı kabul, aynı denemede başarılı terminal durum, tamamlanmış web aracı olayı ve o URL ile eşleşen kanıt zarfı ister. [Antigravity headless sözleşmesi](https://antigravity.google/docs/cli/headless/)
- **P2–P5 geçti.** Kontrollü edit ve recovery, paralel batch ve DeepSeek'in doğrudan API pilotları özgün işlevsel ölçütleri karşılıyor. Aktif OpenCode yürütmesi kaldırıldı. Ayrı pilotta read-only batch, planı hazırlayan Hades sürecinde ayrı kullanıcı onayıyla başlatılıp terminal sonuca ulaştı. [Batch kabul kaydı](../handoffs/CODEX_BATCH_P2_P3_KABUL_YOLU.md#2026-11-19-canlı-salt-okunur-batch-pilotu)
- **P6 ve dağıtım.** Güncel karar plan ve indeksle uyumlu. Önceki doğrulama paketi feature dalında, bu düzeltmeler worktree'de. Native Claude ve bağımsız Sol follow-up önceki kullanıcı kararı kapsamındadır. Açık High web kabulü nedeniyle genel geçiş kapanmadı.

**Düzeltmeler ve testler.** Antigravity başarısız terminal durumlarını reddediyor ve problarda tam yanıtı doğruluyor. Workspace probu göreli fixture adını kullanıyor. Tek başına web yasağı web görevi sayılmıyor. Gerçek URL ve açık web aracı talebi kanıt istemeyi sürdürüyor. Windows probe dizini temizliğinde sınırlı tekrar uygulanıyor ve temizleme hatası ham yol yerine kapalı hata sınıfıyla sonuçlanıyor. Hedefli paket 101/101 geçti. `verify:local` beş aşamada tamamlandı: 1.267 başarılı test, 5 koşullu atlama, 0 hata ve 10,21 saniye benchmark. Test boyunca kaynak snapshot'ı sabit kaldı.

Canlı Gemini koşuları kısa ömürlü Hades işlemlerinde, ek krediye geçiş kapalı ve her görev için bir denemeyle yapıldı. İstekler yalnız sentetik aritmetik veya kamuya açık IANA sayfası içerdi. Son kontrolde global Antigravity ayar dosyası başlangıçla eşleşti ve geçici state temizlendi. Codex çağrılarından önce hesabın plan kotası gözlendi, kullanılabilir ek kredi raporlanmadı. [Antigravity kredi ayarı](https://antigravity.google/docs/cli-settings) [Codex plan kullanımı](https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan)

## 2026-11-17 — Başlangıç onarımı ve public aktarım

Yerel onarımda eski oturum için native `account/read`, `thread/resume`, Hades bağlantısı ve iki resource okuması başarılı oldu; kullanıcı normal CLI açılışını ayrıca doğruladı. Bu gözlem çalışan commit/config attestation’ı değildir. Public aktarım yalnız güncel uzak tabandaki ilgili updater, regresyon ve belgelere uygulanır; eski ayrışmış geçmişler veya kullanıcıya ait yollar aktarılmaz. `.codex`-relative `cwd=".."` varsayımı geçerli değildir. Güncel davranış ve test kanıtı [başlangıç onarım raporundadır](CODEX_MCP_CALISMA_DIZINI_VE_ACCOUNT_READ_ONARIMI_2026-11-17.md).

## 2026-11-08: Sonraki eval teslimi

Karar değişmedi: AST sınıflandırıcı üretim varsayılanı kapalı kalır; bağımsız Sol follow-up incelemesi kullanıcı kararıyla ertelenmiştir ve tamamlanmış sayılmaz. Sabit sentetik corpus ölçümünde benign etiketli sekiz örneğin legacy bulgusu AST'de bulgusuz kaldı; dört risk etiketli örnek de statik bulgusuz sonuç verdi. Bu ölçüm genel etkinleştirme veya kaynak teslimi için yeterli değildir; hedefli eval testleri 16/16 geçti.

Eval düzeltme paketi `0d13fd015fbcab545d5c1021f9c5d28a47e1472c` commit'iyle yerel `main` dalına alındı ve `origin/main` dalına push edildi. Commit sekiz görev dosyası içerir. Bu teslim, Sol incelemesini veya P6 koşulsuz kapanışını tamamlamaz. Bu kayıt önceki bölümlerdeki commit edilmemiş paket/Git durumu açıklamalarını güncel teslim açısından geçersiz kılar; tarihsel araştırma bulgularını değiştirmez.

## 2026-11-08: Güncel teslim ve politika kararı

Bu not aşağıdaki tarihsel açık kararların güncel durumunu belirtir. Kullanıcı, bağımsız Sol incelemesini daha sonraya bırakmış ve politika seçimini ana orkestratöre devretmiştir. Karar, AST sınıflandırıcısının varsayılan kapalı tutulması ve offline eval paketinin yalnız deneysel değerlendirme aracı olarak korunmasıdır. Üretim policy'sinde ilgili alan false olarak doğrulandı; bu işlemde üretim kodu, kişisel config veya canlı Hades ayarı değiştirilmedi.

Ana checkout günlük kullanım hedefidir; ba10 yeniden bağlanmayacaktır. Önceki opt-in kapatma ve restart sonrası katalog gözlemi bölüm 9'da kayıtlıdır. P2/P3/P4 işlevsel kabulleri korunur; Claude P1b ertelenmiş durumdadır. Bunlar genel bağımsız denetimin tamamlandığı anlamına gelmez.

Eval paketinin mevcut kaynakları için hedefli testler bu kapanış kontrolünde 16/16 geçti. Önceki tam verify:local kaydı 1.256 başarılı, 5 Windows koşullu atlama, sıfır başarısızlık ve 18.950 ms benchmark bildirir; bu turda tam paket yeniden çalıştırılmadı. Bu turdaki değişiklik yalnız iki rapordaki karar ve teslim kaydıdır. Ayrıntılar ve seçili kaynak hash'leri [preflight raporunun güncel kapanış bölümündedir](REVIEW_PREFLIGHT_RET_KATMANI_VE_KARAR_2026-10-27.md).

Ana checkout HEAD'i c9793ebc262699f6dbe90421423b260284ff399f; index boş, eval ve belge dosyaları commit edilmemiştir. Son kontrol sekiz değişmiş veya untracked dosya gösterdi. Kullanıcının stage/commit/push yapmama sınırı korunur. Bağımsız inceleme açık ve ertelenmiştir; kaynak teslimi, model veya provider çağrısı yapılmadı. Gelecekteki Sol bulguları yerel kaynak ve uygun regresyonlarla doğrulanmadan otomatik kabul veya uygulama yetkisi sayılmaz.


Rapor zamanı: 2026-11-07T20:52:36Z / 7 Kasım 2026 23:52:36 Türkiye saati.

İncelenen ana repository: C:\Users\user\Desktop\Yazılım_Siber\orkestrasyon-codex.

Bu sohbetin çalışma alanı: C:\Users\user\.codex\worktrees\ba10\orkestrasyon.

Son doğrulanan HEAD: c9793ebc262699f6dbe90421423b260284ff399f.

## Karar

Ana checkout için Codex Desktop/CLI ile Hades MCP bağlantısı çalışmaktadır. Bu sonuç, bütün worktree'lerin doğru hedefe bağlı olduğu veya genel geçişin bütün güvence kapılarıyla kapandığı anlamına gelmez.

Günlük kullanımın hedefi ana checkout ise temel yerel entegrasyon hazırdır. Kullanım hedefi bu sohbetin ba10 worktree'si ise mevcut Hades kaydı ayrıca değerlendirilmelidir: salt okunur kontrol bu worktree için needs_update döndürmüştür.

Bağımsız kaynak incelemesi, kabul sonrası opt-in tercihinin netleştirilmesi ve commit dışında kalan eval çalışmasının teslim durumu ayrı açık maddelerdir. Çalışan commit/config için bağımsız attestation bulunmaması, tek başına yeni bir entegrasyon özelliği geliştirme zorunluluğu değildir.

## Araştırma yöntemi ve sınırları

Bu değerlendirme aynı oturumda yapılan kaynak incelemesi, yerel salt okunur komutlar, canlı MCP resource gözlemleri ve yeni bir izole stdio bağlantı kontrolüne dayanır.

- Proje veya kişisel config değiştirilmedi.
- Provider/model görevi, capability probe, canlı batch, approval veya revalidation çağrılmadı.
- Gerçek Vault notu veya runtime metrics/bütçe defteri okunmadı.
- Tam test paketi bu araştırmada yeniden çalıştırılmadı.
- Mevcut Hades süreci yeniden başlatılmadı veya sonlandırılmadı.
- Yeni stdio kontrolü için yalnız mevcut sentetik ortam yardımcısının oluşturduğu geçici config/state alanı kullanıldı; kontrol sonunda temizlendi.
- Mevcut eval değişiklikleri korunmuştur.

Bu raporun kaydedilmesi, araştırmadan sonraki tek repository yazımı olarak ayrıca yetkilendirilmiştir. Stage, commit veya push kapsamda değildir.

## 1. Ana checkout kaydı

Doğrudan şu iki salt okunur giriş çalıştırıldı:

- node scripts/configure-codex-project.js --check
- node scripts/codex-diagnostics.js

İlk sonuç ok=true, status=ready, projectMcpReady=true verdi. Command, args, cwd, env_vars, timeout, required ve iki yönetilen env alanının tamamı match durumundaydı. Yayın yapılmadı; yedek ve koordinasyon kilidi oluşturulmadı.

İkinci sonuç status=ready verdi. Node, Git, Codex CLI ve Hades giriş dosyası gereksinimleri mevcut olarak raporlandı. Bu tanı user-global Codex config'ini okumadı; kendi başına canlı Desktop runtime veya sentetik E2E çalıştırmış gibi davranmadı.

Yapılandırılmış zincir:

- Node: Yerel Windows kurulumu
- Server: ana repository içindeki subagent-bridge\src\server.js
- cwd: ana repository kökü
- SUBAGENT_BRIDGE_TRUSTED_WORKSPACE: ana repository kökü

Kaynaklar: [proje kaydı](../../.codex/config.toml), [config giriş komutu](../../scripts/configure-codex-project.js), [yerel tanı](../../scripts/codex-diagnostics.js).

## 2. Canlı Hades gözlemi

Mevcut Hades bağlantısından iki resource listelendi ve okundu:

- hades://workspace/identity/v1
- hades://rules/attestation/v1

Workspace resource'u status=verified verdi. Hem processCwdSha256 hem trustedWorkspaceSha256 şu değerle eşleşti:

dc3d26eb65bfc4ef48a71103bfb33d44b73e7a1873139d2c6d7917b97248e68b

Bu değer, ana checkout'un yerel canonical yolundan hesaplanan hash ile de eşleşti.

Rule resource'u status=verified ve comparison=match verdi. Manifest SHA-256:

12fc701c8de57f7640e0f907da889381db4b66ff3aa218e328f1382c848caa1a

AGENTS.md, CLAUDE.md ve config/agent-rules.md için dönen boyut/hash değerleri, aynı dosyaların yerel ham baytlarıyla ayrıca karşılaştırılıp eşleşti.

Sınırlar:

- Resource startup_context=unavailable bırakmaktadır.
- Hash eşleşmesi, başlangıç kurallarının gerçekten modele yüklendiğini kanıtlamaz.
- Çalışan kaynak commit'i veya aktif config için bağımsız, kriptografik host attestation'ı yoktur.
- Mevcut araç envanteri erişilebilirliği gösterir; her sağlayıcının bugün yeni bir görevi başarıyla tamamlayacağını göstermez.

Kaynaklar: [workspace seçimi](../../subagent-bridge/src/frontends/mcp/workspace-context.js), [MCP server](../../subagent-bridge/src/frontends/mcp/server.js).

## 3. Yeni sentetik stdio kontrolü

Güncel ana checkout kodundan, gerçek MCP SDK Client ve StdioClientTransport ile ayrı bir Node server süreci başlatıldı. Mevcut createSmokeExecutionContext yardımcısının provider credential'ları dışlayan sentetik ortamı kullanıldı.

Kontrol; initialize/connect, tools/list, resources/list ve iki resource read işleminden oluştu. Genel smoke betiğinin health veya memory tool adımları çağrılmadı.

Gözlenen sonuçlar:

| Kontrol | Sonuç |
| --- | --- |
| Gerçek stdio bağlantısı | Başarılı |
| Araç sayısı | 18 |
| run_codex_subagent, run_task_profile, run_deepseek_subagent, run_antigravity_subagent | Mevcut |
| Emekli OpenCode/GLM/Kimi/Qwen/Space Bunny araçları | Yok |
| Dağıtım varsayılanında parallel batch aracı | Sunulmuyor |
| Sentetik child için approve_prepared_edit | Sunulmuyor |
| Workspace hash'leri | Beklenen ana checkout ile eşleşiyor |
| Rule manifesti | verified / match |
| Startup context | unavailable |
| Provider/model görev çağrısı | 0 |
| Health çağrısı | 0 |
| Hafıza aracı çağrısı | 0 |

Client kapatıldı ve bu kontrole ait geçici sentetik alan temizlendi. Bu başarı mevcut Desktop Hades sürecinin revizyonu, kişisel Vault sağlığı veya canlı provider erişimi için kanıt değildir.

Kaynak: [sentetik ortam yardımcısı](../../scripts/smoke-mcp-support.js).

## 4. Ana checkout ile ba10 worktree aynı hedef değil

Aynı güncel salt okunur config denetleyicisi iki canonical kök için çalıştırıldı.

| Hedef | Kök hash'i | Kayıt sonucu |
| --- | --- | --- |
| Ana checkout | dc3d26eb65bfc4ef48a71103bfb33d44b73e7a1873139d2c6d7917b97248e68b | ready |
| ba10 worktree | cfd9eb523277c24d99909ff6fcf90b34b1601506b510af5ed1105643cf85002c | needs_update |

Worktree için güncellenmesi gerektiği bildirilen alanlar:

- args
- cwd
- env.SUBAGENT_BRIDGE_TRUSTED_WORKSPACE

Canlı Hades ana checkout'u doğrulamaktadır. Bu sohbet ba10 worktree'sinde bulunduğu için Hades araçlarının otomatik olarak sohbetin worktree'sini hedeflediği varsayılmamalıdır. Mevcut resolver açık trusted-workspace env değerini cwd'nin önünde kullanır.

Bu rapor otomatik bir worktree yeniden bağlamasını yetkilendirmez. Önce kullanıcının hedefinin ana checkout mu yoksa ba10 worktree'si mi olduğu kesinleştirilmelidir. Config yazımı ve gereken restart ayrı operasyonel işlemlerdir.

## 5. Kabul sonrası opt-in durumu

Yerel loadRuntimeConfiguration çağrısı yalnız seçilmiş güvenli alanları raporlayacak biçimde kullanıldı. Config ve agents kaynakları okundu; credential değerleri, Vault notları ve runtime defteri okunmadı veya çıktılanmadı.

Yerel loader sonucu:

- Şema geçerli.
- Kaynak config v2; loader'ın bellekteki etkin şeması v3.
- parallelBatch.enabled=true.
- parallelBatch.editEnabled=true.
- reviewSourceSyntaxAwareClassifierEnabled=false.

Bu sonuç bu inceleme sürecinin diskteki config'i çözümlemesidir; çalışan Hades config'inin bağımsız attestation'ı değildir. Canlı katalogda parallel batch araçlarının sunulması ayrıca gözlenmiştir.

Geçiş planının kabul sonrası kararı, batch ve edit opt-in'lerinin kapalı tutulması ve gerektiğinde ayrı açılmasıdır. Mevcut açık değerler daha sonraki bilinçli kullanım tercihi olabilir; kayıtlar bu tercihi netleştirmeden bunu yetki atlama veya otomatik hata olarak nitelemek doğru değildir.

Kapanış için açık kalan soru: bu iki opt-in, güncel kullanım için bilinçli olarak mı açık tutuluyor? Bu araştırmada hiçbir değer değiştirilmemiştir.

Kaynak: [geçiş planı](../plans/CODEX_DESKTOP_UCTAN_UCA_GECIS_PLANI_2026-10-18.md), özellikle kullanıcı kararları ve P3 bölümü.

## 6. İşlevsel kabul ve bağımsız inceleme

Mevcut plan/durum kayıtları P2, P3 ve P4'ün özgün işlevsel kabullerinin tamamlandığını bildirir. Bu araştırma geçmiş provider/pilot/entegrasyon görevlerini tekrar çalıştırmamıştır.

- P2: hazırlık, ayrı onaylı uygulama, red, stale ve Windows disposable recovery kanıtları.
- P3: DAG/izleme, iptal/restart ve ayrı onaylı normal kaynak entegrasyonu kanıtları.
- P4: canonical DeepSeek read-only ve kaynak checkout'unu değiştirmeyen disposable edit kanıtı.
- Claude P1b: başarısız geçmişiyle kullanıcı kararı sonucu ertelenmiş; desteklenmiş sayılmaz.
- Son bağımsız kaynak incelemesi: bütün güncel kaynak kapsamı için tamamlanmamış.

Yerel preflight açıklamaları ve sentetik policy eval, bağımsız model incelemesi veya kaynak teslim onayı değildir. Bağımsız inceleme açığı çalışır MCP bağlantısından ayrı bir güvence kapısıdır.

Kaynaklar: [uygulama durumu](CODEX_DESKTOP_GECIS_UYGULAMA_DURUMU_2026-10-18.md), [bağımsız inceleme paketi](GECIS_BAGIMSIZ_INSAN_INCELEME_PAKETI_2026-11-02.md).

## 7. Son kayıtlı test ve Git kanıtının sınırı

Mevcut README ve eval raporundaki son kayıtlı tam verify:local sonucu:

- 1.254 başarılı test.
- 5 Windows koşullu atlama.
- 0 başarısızlık.
- Zorunlu seri benchmark 13,060 saniye.
- Sentetik stdio smoke ve sentetik config/Vault verify başarılı.
- Koşu kaynak snapshot SHA-256: ad286d2230bc899698f9e3e0a1d0d385debc02fec2e28421c0e698d58c71306c.

Bunlar önceki son-kaynak koşusunun kayıtlarıdır; bu araştırmada yeni bir tam test sonucu üretilmemiştir. Önceki aralıklı launcher hatasının kesin tetikleyicisi bilinmiyor olarak kalır.

HEAD c9793ebc262699f6dbe90421423b260284ff399f doğrulandı. Yerel origin/main ile rev-list karşılaştırması 0/35 verdi; fetch yapılmadığından uzak sunucunun güncelliği iddia edilmiyor.

Dört eval kaynak/test dosyasının dosya sisteminde bulunduğu ve HEAD ağacına dahil olmadığı doğrulandı. Bunların tam staged/unstaged durumu bu araştırmada bağımsız olarak yeniden doğrulanamadı: git status/diff komutları bu sandbox bağlamında worktree/erişim hatası verdi. Önceki kullanıcı raporu stage alanının boş olduğunu bildiriyor; bu rapor yeni bir “çalışma ağacı temiz” iddiası kurmaz.

Kaynaklar: [README](../../README.md), [eval ve politika raporu](REVIEW_PREFLIGHT_RET_KATMANI_VE_KARAR_2026-10-27.md).

## 8. Öncelikli sonraki kararlar

1. Günlük kullanımın hedefi ana checkout mu, ba10 worktree'si mi? Bağ doğru hedefe göre korunmalı veya ayrı yetkili işlemle güncellenmelidir.
2. Parallel batch/edit opt-in'leri bilinçli kullanım için açık mı kalacak, kabul sonrası kapalı duruma mı dönecek?
3. Eval değişiklikleri, kullanıcının mevcut commit/push yapmama tercihi korunarak hangi teslim durumunda tutulacak?
4. Bağımsız kaynak incelemesi için mevcut güvenlik kapılarına uygun yol nasıl sağlanacak? Yerel ölçüm bu kapıyı kendiliğinden kapatmaz.

Bu maddeler netleşmeden bütün worktree'ler, bütün sağlayıcılar ve bütün denetim kapıları için koşulsuz tamamlanma iddiası kullanılmamalıdır. Ana checkout'un yerel MCP entegrasyonu ise bu araştırmada doğrudan doğrulanmıştır.

## Resmî Codex kaynakları

Erişim tarihi: 7 Kasım 2026.

- [Model Context Protocol](https://learn.chatgpt.com/docs/extend/mcp): command/args/env/env_vars/cwd sözleşmesi ve proje config'i.
- [Config basics](https://learn.chatgpt.com/docs/config-file/config-basic): proje güveni ve config katmanı öncelikleri.

Proje config'inin varlığı tek başına etkin config yüklemesini kanıtlamaz. Bu nedenle dosya denetimi, canlı resource gözlemi, sentetik stdio kontrolü ve geçmiş kabul kanıtları bu raporda ayrı tutulmuştur.

## 11. 2026-11-19 checkout başlatma ve Antigravity alias kapanış kontrolü

Bu kontrol `codex/hades-codex-startup-fix` dalında, HEAD `fd2bca63ed36db1572e42979e7e3f278def5131d` üzerinde yapıldı. Başlangıç çalışma ağacı kullanıcı değişiklikleri içeriyordu; doğrulama runner'ı bunları silmeden başlangıç ve bitiş snapshot'larını karşılaştırdı. Snapshot SHA-256 `39d40b4fb5c8fc7baba09e12e617398895efbeea64d3913d383605dc9ccede73` iki uçta aynı kaldı.

Codex launcher regresyonu artık launcher'ı checkout dışındaki geçici çağıran dizininden başlatıp alt sürecin `cwd` değerinin proje kökü olduğunu doğrular. Antigravity adapter ve MCP şemasına `gemini_flash_3_8_low` → `gemini-3.8-flash-low` eşlemesi eklendi; alias eşleme ve probe şema testleri güncellendi. README'de her checkout için ayrı proje yapılandırması gerektiği açıklanır. Takip edilen `.codex/config.toml` içindeki yerel mutlak cwd kullanıcı ayarıdır ve public şablon değişikliği olarak değerlendirilmemelidir.

İlk tam `verify:local` koşusu `tests/parallel-batch-state.test.js` içindeki çalışan batch iptali testinde zamanlamaya bağlı bir assertion hatasıyla sonlandı. Testin 100 ms sabit beklemesi, sahte runtime handler'ının gerçekten başladığını garanti etmiyordu. Regresyon deterministik başlangıç sinyali bekleyecek şekilde düzeltildi; odaklı test 1/1 ve dosyanın tüm testleri 14/14 geçti. Sonraki tam koşu başarılı oldu.

Restart öncesi kaydedilen `npm run verify:local` sonucu:

- Beş aşama geçti: `verify:ci`, tam test paketi, zorunlu benchmark, sentetik stdio MCP smoke ve sentetik config/Vault verify.
- Ana test paketi 1.265 başarılı, 5 Windows koşullu atlama, 0 başarısız sonuçlandı.
- Benchmark 10.148 ms sürdü; toplam süre 378.875 ms oldu.
- Node v24.17.0 / Windows x64 kullanıldı. Sentetik config ve Vault kullanıldı; provider credential'ı aktarılmadı.
- Koşu sonunda geçici sentetik kök temizlendi. Gerçek Vault, provider inference veya çalışan Desktop Hades işlemi bu doğrulamanın parçası değildi.

### Restart sonrası canlı doğrulama

- Restart öncesi yüklü şema Low alias'ını sunmuyordu. Restart sonrasında canlı katalog ve Antigravity yönlendirme tablosu `gemini_flash_3_8_low` eşlemesini gösterdi.
- Canlı `resources/list` başarılı oldu. Process ve trusted workspace hash'leri checkout kökünün üretim fingerprint'iyle eşleşti. Rules sonucu `verified/match`, startup context durumu `unavailable` kaldı. Bu gözlem doğru workspace bağlantısını gösterir. Çalışan commit veya etkin yapılandırma için bağımsız attestation sağlamaz.
- Tek salt-okunur Low görevi `gemini_flash_3_8_low` → `gemini-3.8-flash-low` eşleşmesini, beklenen `42` sonucunu, çıkış kodu 0, bir adapter denemesi ve sıfır retry ile doğruladı. Runtime 8.595 ms, maliyet alanı `null` idi.
- Gemini Medium için son `rate_limited` sonucu ve Gemini High için açık canlı web kanıtı kabulü korunuyor. Yerel web regresyonları ve salt-okunur Low görevi bu iki kabulü kapsamaz.
- `npm run codex:check` proje MCP kaydını `ready` buldu. `codex:diagnose` yerel kaydı inceler; canlı MCP kaynakları ayrıca gözlendi.

DeepSeek salt-okunur pilotu, MCP alt sürecini kendisini çalıştıran Node yürütücüsüyle başlatır. Pilotun örnek görevi sentetik, sağlayıcı çağrısı canlıdır. Sağlayıcı erişimi gerektirmeyen yerel uçtan uca doğrulama için `npm run verify:local` kullanılır.

### Yayın öncesi yerel doğrulama

- `npm run verify:local` beş seri aşamada geçti. Ana test paketi 1.265 başarılı, 5 koşullu atlama ve 0 başarısızlık kaydetti. Benchmark 9,82 saniye sürdü. Kaynak snapshot'ı koşunun iki ucunda aynı kaldı.
- DeepSeek salt-okunur pilotu ve iki disposable edit pilotu sentetik API yanıtlarıyla geçti. Stdio kabulü beklenen diff'i, `applied=false` durumunu ve başarılı temizliği doğruladı. Canlı sağlayıcıya istek gönderilmedi ve gerçek Vault kullanılmadı.
- Sağlayıcı hata senaryoları `npm run drill` ile 10/10 geçti.

Takip edilen dağıtım şablonundan yerel olarak üretilen mutlak çalışma dizini makineye özgüdür ve public değişiklik kapsamının dışındadır.

## 9. 2026-11-08 operatör restart sonrası kapanış kaydı

Kullanıcı Hades MCP'yi yeniden başlattığını bildirdi. Salt okunur kontrolde yapılandırılmış başlangıç zinciri doğrulandı; canlı workspace identity'nin repository köküyle eşleştiği ve kural kaynağı karşılaştırmasının tutarlı olduğu gözlendi. Identity kaydı çalışan commit'i, etkin kişisel config'i veya startup sırasında yüklenen kuralları kriptografik olarak doğrulamaz; kaynak context attestation'ı mevcut değildi.

Canlı katalog 21 araç gösterdi; paralel batch ve entegrasyon araçları sunulmuyordu. run_codex_subagent ve run_task_profile görünür durumdaydı. Bu salt okunur katalog gözlemi, gizli/başka oturum durumuna veya çalıştırma yoluna dair ek kanıt sayılmaz.

Bu operasyonel gözlem, önceki opt-in kapatma işleminin ardından pilot yüzeyinin yeniden başlatma sonrasında katalogdan kalktığını destekler. P2/P3/P4 plan kapsamındaki işlevsel kabuller kayıtlı tamamlanmış durumdadır; Claude P1b başarısız geçmişi korunarak ertelenmiştir. Bağımsız kaynak incelemesinin kapsam açığı kapanmamıştır. Bu not kaynak kodu, kişisel config'i veya katalog durumunu değiştirmez ve bağımsız denetim ya da genel geçişin koşulsuz kapanışı anlamına gelmez.

## 10. 2026-11-11 ana checkout Hades resource doğrulaması

Bu oturumda Git kökü ve çalışma dizini ana checkout’un kanonik yolu ile eşleşti. İlk `resources/list` çağrısı yanlış `hades_orchestrator` sunucu kimliğiyle `unknown MCP server` hatası verdi. Tek düzeltilmiş çağrı yapılandırmadaki exact `hades-orchestrator` kimliğiyle başarılı oldu; ardından yalnız `hades://workspace/identity/v1` ve `hades://rules/attestation/v1` okundu.

Identity resource'u `status=verified` döndürdü. `processCwdSha256` ve `trustedWorkspaceSha256` değerleri `dc3d26eb65bfc4ef48a71103bfb33d44b73e7a1873139d2c6d7917b97248e68b` idi; aynı oturumda kanonik Git kökünün UTF-8 SHA-256 değeri de eşleşti. Bu, Hades resource yüzeyinin doğru hedef workspace için yanıt verdiğine dair operasyonel kanıttır.

Rules resource'u `comparison=match` ve manifest SHA-256 `12fc701c8de57f7640e0f907da889381db4b66ff3aa218e328f1382c848caa1a` döndürdü. `sourceClass=mcp_resource` ve `startup_context.status=unavailable` sınırları geçerlidir: bu kayıt çalışan commit'i, etkin config'i veya başlangıçta kuralların yüklendiğini kriptografik olarak doğrulamaz. Doğrudan initialize protokol yanıtı ayrıca kaydedilmedi.

Bu kontrolde config, kaynak veya Git değiştirilmedi; provider, health, probe ya da görev aracı çağrılmadı. Hades bağlantı ve hedef workspace gözlemi, bağımsız kaynak incelemesi veya genel geçiş kapanışı değildir.
