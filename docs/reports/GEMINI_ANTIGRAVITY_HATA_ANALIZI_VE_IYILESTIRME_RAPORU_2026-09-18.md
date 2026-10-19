# Gemini / Antigravity Web Erişim Hataları Analizi ve İyileştirme Raporu

- Tarih: 2026-09-18
- Son ek: 2026-09-27 tarihli §11, read-only enforcement düzeltmesi ve OpenCode restart sonrası canlı doğrulamayı kaydeder; 2026-09-18 bulguları tarihsel bağlamını korur.
- Kapsam: Antigravity Gemini subagent çağrılarında web erişimi, video sayfası okuma ve web kanıt sözleşmesi kaynaklı hatalar; güncel ve tarihsel hata envanteri; minimize etme seçenekleri.
- Yöntem: Kaynak kod okuma (`subagent-bridge/src`), redakte metrik özeti (`%LOCALAPPDATA%\subagent-bridge\logs\metrics\antigravity-runs.jsonl`), `agy` CLI help çıktısı, bu oturumdaki canlı hata kayıtları ve önceki rapor notları.
- Sonuç ön izlemesi: Katılık bilinçli bir güvenlik tasarımıdır; ancak iki gerçek kusur vardır: (1) web kanıt hatasında sınırlı onarım denemesi yok, (2) web okuma yetenek probu, gerçek çağrı yoluyla aynı izin ortamında çalışmıyor.
- Kullanıcı talebi: Antigravity ajanlarının video izleyebilmesi (YouTube dahil) istenmektedir. Bu konu Sol (Codex) danışmasına taşınacaktır; ayrıntı Bölüm 10'dadır.

## 1. Yönetici Özeti

- Video izlettirememe tek bir nedenden değil, iki bağımsız engelden kaynaklanır:
  - İzin engeli: Antigravity headless modda araç izni soramaz; web aracı izni verilmezse çağrı `permission_denied` ile fail-closed kapanır. Politika `--dangerously-skip-permissions` benzeri bypass yasaklar.
  - Sözleşme engeli: Salt-okunur her Antigravity çağrısı, MCP yüzeyinde koşulsuz olarak katı web kanıt zarfına (`webEvidenceRequired: true`) bağlanır. Model JSON zarfını birebir üretmezse, içerik güvenli olsa bile görev `provider returned invalid web evidence` ile durur; bu sınıfta otomatik yeniden deneme yoktur.
- Bugünkü oturumda: Gemini 3.1 Pro iki denemede `invalid web evidence` ile düştü; video analizinde URL içeren ilk istem aynı sınıfla reddedildi, URL çıkarılınca aynı içerik başarıyla işlendi; `webRead` yetenek probu `permission_denied` döndü.
- Tarihsel metrik (2026-09-06 .. 2026-09-18, 176 Antigravity koşusu): 90 başarı, 61 `process_exit`, 15 `web_evidence_invalid`, 6 `timeout`, 3 `permission_denied`, 1 `process_error`. 15 web kanıt hatasının 10'u 2026-09-18 tarihlidir ve tamamı `result_parse` aşamasında, `retryDecision: stop` ile kapanmıştır.
- CLI'da kullanılmayan güçlü bir çözüm mevcut: `agy --json-schema` ile yapılandırılmış çıktı zorlanabilir. Bu, en yüksek etkili iyileştirme adayıdır; mevcut adaptör bu bayrağı kullanmıyor.

## 2. Katılığın Kaynağı: Web Kanıt Sözleşmesi Nasıl Çalışıyor

- MCP `runAntigravity` aracı, salt-okunur modda seçenekleri sabit olarak `webEvidenceRequired: true` yapar: `subagent-bridge/src/frontends/mcp/tools.js:179`.
- Çalışma zamanı, bu modda sağlayıcı sonucunun `{ result, webEvidence }` zarfını birebir taşımasını ister ve zarfı yeniden doğrular: `subagent-bridge/src/runtime/bridge-runtime.js:603-621`.
- Zarf katı kurallara bağlıdır: `subagent-bridge/src/web-evidence.js:28-59`.
  - Şema `strict()`: fazladan tek alan bile reddedilir.
  - Kanıt kaynağı yalnız http/https; kullanıcı adı, parola, hassas sorgu parametreleri ve kontrol karakterleri reddedilir (`web-evidence.js:61-111`).
  - Alıntı sınırları: en çok 5 alıntı, alıntı başına 500, toplam 2000 karakter (`web-evidence.js:4-6, 39-47`).
  - Alıntılarda HTML/markup, aktif etiketler, URL metni ve secret benzeri diziler yasaktır (`web-evidence.js:9-20, 39-41, 125-141`).
  - Güven ve doğrulama alanları ana süreç tarafından atanır; model `low`/`unverified` dışında değer veremez (`web-evidence.js:205-207`).
- Düz metin onarımı (repair) yalnız sınırlı koşullarda açılır ve istemde web niyeti sezgisi varsa kapanır: `bridge-runtime.js:257-264`; web niyeti deseni URL, "web", "araştır", "güncel", "kaynak" gibi ifadeleri yakalar (`web-evidence.js:22-23`).
- Herhangi bir doğrulama hatası tek bir sonuca dönüşür ve anında durur: `web_evidence_invalid`, `retryDecision: stop`, devre kesici nötr kayıt (`bridge-runtime.js:348-349, 613-620`).

## 3. Neden Bu Kadar Katı

- Web içeriği güvenilmeyen veridir: prompt injection, secret sızdırma ve zararlı işaretleme taşıyabilir. Zarf, içeriği karantinaya alır, alıntıyı sınırlar ve güven alanlarını ana süreçte tutar.
- Redakte audit ilkesi korunur: ham web gövdesi, URL, başlık, cookie veya kimlik bilgisi sonuç ve kayıt akışına giremez.
- Fail-closed kültürü gereği şema sapması "dene, düzelt, devam et" değil "dur ve görünür ol" olarak ele alınır. Bu, güvenlik açısından doğrudur; kullanılabilirlik maliyeti ise model format sapmalarının görevi tamamen düşürmesidir.

## 4. Hata Envanteri

### 4.1 Güncel (2026-09-18 oturumu)

- Gemini 3.1 Pro kaynak doğrulaması: iki çağrı da `provider returned invalid web evidence`; model erişimi ve workspaceRead probe ile `available` doğrulandı.
- Video analizi (avenox): URL ve video ifadeleri içeren ilk istem aynı sınıfla reddedildi; istemden URL çıkarılıp bağlantı yasağı eklenince aynı model aynı içeriği başarıyla analiz etti.
- `check_antigravity_subagent` webRead probu: `permission_denied` (not_probed olarak raporlandı).
- Metrik doğrulaması: bugün 10 `web_evidence_invalid` kaydı; hepsi `result_parse`, `retry stop`.

### 4.2 Tarihsel

- Metrik dağılımı (176 koşu): 90 başarı (failureClass yok), 61 `process_exit`, 15 `web_evidence_invalid`, 6 `timeout`, 3 `permission_denied`, 1 `process_error`.
- `web_evidence_invalid` kayıtları 2026-09-12'den itibaren dağınık, 2026-09-18'de yoğunlaşmış durumda.
- 16 koşuda `webEvidenceRepair: true` görülüyor: sınırlı düz metin onarımı geçmişte başarıyla çalışmış; yani onarım yolu güvenli biçimde kullanılabilir durumda.
- V3 planı notu: "Gemini 3.8 Flash, video sayfasını ve URL yoğun sayfaları `invalid web evidence` nedeniyle okuyamadı; bu kaynaklar reader proxy ve resmi kurulum rehberi üzerinden alındı" (`docs/plans/yarim-kalanlar/PLAN_IKINCI_BEYIN_V3_DESEN_UYARLAMASI_2026-09-18.md:154`).
- Antigravity dayanıklılık planı: headless araç redlerinin `permission_denied` olarak beklenen fail-closed sonuç olduğu kayıtlı (`docs/plans/yapilanlar/PLAN_ANTIGRAVITY_GEMINI_DAYANIKLILIK_2026-09-10.md:14, 95`).

## 5. Kök Neden Analizi

- Neden 1: Katı zarf ve otomatik onarımın yokluğu. Model prose döndürürse, zarfı fazladan alanla döndürürse veya alıntıya URL/markup koyarsa görev anında ve tek denemede biter.
- Neden 2: Niyet sezgisi, gerçek araç kullanımıyla eşleşmiyor. İstemde URL geçmesi "web niyeti" sayılıp düz metin onarımını kapatıyor; oysa model `read_url` çağırmamış olabilir. Bu durumda güvenli düz metin çıktı bile reddediliyor.
- Neden 3: Prob, gerçek çağrı ortamını ölçmüyor. Yetenek probu `runCapabilityProbeProcess` üzerinden çalışır (`antigravity-adapter.js:460-476, 535-605`) ve salt-okunur izin zorlamasını (ayar kilidi + `enableReadOnlyEnforcement`) uygulamaz; bu zorlama yalnız `execute` yolunda vardır (`antigravity-adapter.js:656-663, 830-832`). Prob ayrıca `--sandbox` ile çalışır. Sonuç: `webRead` için yanlış negatif veya yanıltıcı `permission_denied`.
- Neden 4: Headless izin modeli. CLI izin soramaz; `read_url` izni ancak global `settings.json` geçici olarak değiştirilerek verilir (`antigravity-adapter.js:32-41, 173-199`). `agy --help` çıktısında çağrı başına araç izin listesi bayrağı yoktur; yalnız `--sandbox` ve yasaklı `--dangerously-skip-permissions` vardır. Bu, bilinen ayar izolasyonu sorunudur ve ayrı plan gerektirir.
- Neden 5: Model davranış farkı. Aynı istem altında Flash modelleri zarfı üretirken Pro modeli iki denemede de sözleşmeyi tutturamadı. Katı carrier yollarında model seçimi başarı oranını doğrudan etkiliyor.

## 6. İyileştirme Araştırması

Her başlık: mekanizma, kanıt/dayanak, efor, risk, güvenlik etkisi, doğrulama.

- Onarım A: `--json-schema` ile zarf zorlama (önerilen P0).
  - Mekanizma: Salt-okunur Antigravity çağrısına `agy --json-schema <dosya>` eklenir; zarf şeması (`result` string, `webEvidence` nesne veya null) CLI tarafından zorlanır. Şemaya alıntı desenleri de gömülebilir (URL/markup yasağı desenleri), böylece kısıtlı içerik sunucuda yakalanmadan önce elenir.
  - Dayanak: `agy --help` çıktısında `--json-schema` ve `--output-format json` mevcut; adaptör bu bayrakları şu an kullanmıyor (`antigravity-adapter.js:705-724`).
  - Efor: Orta. Şema dosyası bridge tarafında üretilir, geçici dizine yazılır, çağrı sonrası silinir.
  - Risk: Şema dışı çıktıda CLI hatası yeni hata sınıfları üretebilir; şema sürümü ile zarf sürümü senkron tutulmalıdır.
  - Güvenlik etkisi: Olumlu; ana süreç doğrulaması aynen korunur, zarf üretimi güçlenir.
  - Doğrulama: Aynı istemle 20 çağrılık pilot; `web_evidence_invalid` oranı ve zarf şema uyumu ölçülür.
- Onarım B: Sınırlı carrier onarım denemesi (önerilen P0).
  - Mekanizma: `web_evidence_invalid` için tek denemelik onarım turu; şema onarımı deseni mevcut (`bridge-runtime.js:594-600`, `schemaRepairPrompt`). Onarım istemi zarf örneğini ve "read_url kullanılmadıysa webEvidence null" kuralını içerir; ikinci hata yine fail-closed durur.
  - Dayanak: Geçmişte 16 koşuda düz metin onarımı başarıyla uygulandı (`webEvidenceRepair: true`).
  - Efor: Düşük-orta.
  - Risk: Onarım turu maliyeti artırır; bütçe ve süre sınırlarına tabidir.
  - Güvenlik etkisi: Nötr-olumlu; onarım çıktısı ana süreçte yeniden doğrulanır, kısıtlı içerik reddi sürer.
  - Doğrulama: REC benzeri testlerle "ilk tur bozuk, ikinci tur geçerli" ve "iki tur da bozuk" senaryoları.
- Onarım C: Araç olayına dayalı onarım (önerilen P1).
  - Mekanizma: `--output-format stream-json` ile araç olayları okunur; `read_url` çağrılmadıysa istemde URL geçse bile düz metin onarımına izin verilir. Böylece niyet sezgisi yerine gerçek araç kanıtı kullanılır.
  - Dayanak: CLI `--input-format stream-json` ve `--output-format stream-json` destekliyor; zarf modu ile birlikte "son sonuç" şeması uygulanabilir.
  - Efor: Orta.
  - Risk: Akış ayrıştırma yeni kod yolu; olay şeması sürüm değişimine duyarlı.
  - Güvenlik etkisi: Olumlu; sezgi yerine kanıt.
  - Doğrulama: En az 5 senaryo (URL'siz istem, URL'li ama araçsız istem, read_url başarılı, read_url reddedildi, karışık).
- Onarım D: Prob dürüstlüğü (önerilen P1).
  - Mekanizma: `webRead` probu `execute` ile aynı ayar kilidi ve izin zorlaması altında çalıştırılır; veya bu yapılamıyorsa sonuç `not_probed` + `probe_environment_differs` neden sınıfıyla raporlanır.
  - Dayanak: Prob yolu zorlamayı uygulamıyor (`antigravity-adapter.js:535-605` ile `656-663` karşılaştırması).
  - Efor: Düşük.
  - Risk: Prob çağrıları kullanıcı ayarını geçici değiştirir; mevcut kilit ve sentinel mekanizması bunu zaten yönetiyor.
  - Güvenlik etkisi: Nötr.
  - Doğrulama: Prob sonucunun gerçek çağrı sonucuyla uyumu; yanlış negatif sayısı sıfıra yaklaşmalı.
- Onarım E: Profil bazlı esneklik (önerilen P2, politika kararı).
  - Mekanizma: MCP sabit `true` yerine profil/politika değeri okunur (`config.js:158` alanı mevcut; `policy.json` profillerinde `webEvidenceRequired` tanımlı). Varsayılan katı kalır; yalnız tool-free, URL'siz analiz profilleri `repair` moduna izin verir.
  - Dayanak: V2/V3 planlarında profil mekanizması ve `webEvidenceRequired` alanı zaten var; MCP sert kodlaması esnekliği engelliyor.
  - Efor: Düşük-orta.
  - Risk: Yanlış profil yapılandırması kısıtlı web içeriğinin sonuca sızmasına yol açabilir; bu yüzden `rejectRestricted` korunmalı ve değişiklik güvenlik incelemesi gerektirir.
  - Güvenlik etkisi: Dikkatli tasarlanırsa nötr; yanlış kullanılırsa olumsuz.
  - Doğrulama: Negatif şema testleri (MCP-NEG), injection testleri ve mevcut güvenlik testleri yeşil kalmalı.
- Onarım F: Video ve URL için yerel alım standardı (önerilen P1, düşük risk).
  - Mekanizma: Video/URL içeriği ana orkestratör tarafından yerel araçlarla alınır (`yt-dlp` altyazı, `oembed` künye), Gemini'ye araçsız analiz yaptırılır. Bugün iki video bu yolla başarıyla işlendi.
  - Dayanak: Bu oturumda çalışan yol; V3 notundaki reader proxy yaklaşımının genelleşmiş hali.
  - Efor: Düşük (dokümantasyon; istenirse yardımcı script).
  - Risk: Yerel araç bağımlılığı ve altyazı kalitesi.
  - Güvenlik etkisi: Olumlu; içerik karantina dışına çıkmaz, model araç kullanmaz.
  - Doğrulama: En az 3 farklı video/URL türünde tekrarlanabilir akış.
- Onarım G: Antigravity ayar izolasyonu (dış-bağımlı, ayrı plan).
  - Mekanizma: Global `settings.json` mutasyonu yerine çağrı başına izin profili; CLI'da şu an böyle bir bayrak yok (`agy --help`).
  - Dayanak: Bilinen bulgu #3; `--dangerously-skip-permissions` yasak.
  - Efor: Dış-bağımlı; ürün tarafı destek gerekir.
  - Doğrulama: Kilit ve sentinel davranışı için otomasyon testi; çakışan süreç senaryoları.
- Onarım H: Model seçim politikası (önerilen P1).
  - Mekanizma: Katı carrier gerektiren salt-okunur yollarda Flash modelleri önceliklidir; Pro yalnız araçsız, uzun bağlamlı veya açıkça gerekçelendirilmiş işlerde kullanılır.
  - Dayanak: Bugün iki Pro çağrısı `invalid web evidence` ile düştü; aynı gün Flash modelleri zarf sözleşmesini başarıyla üretti.
  - Efor: Düşük (yönlendirme politikası ve dokümantasyon).
  - Risk: Pro'nun güçlü akıl yürütmesinden bazı işlerde feragat.
  - Güvenlik etkisi: Nötr.
  - Doğrulama: Model bazlı `web_evidence_invalid` oranı metriklerden izlenir.

## 7. Önerilen Uygulama Sırası ve Kabul Kriterleri

- P0: Onarım B (sınırlı carrier onarım denemesi) ve Onarım A (`--json-schema` pilotu). Beklenen etki: `web_evidence_invalid` oranında belirgin düşüş.
- P1: Onarım D (prob dürüstlüğü), Onarım F (yerel alım standardı dokümantasyonu), Onarım H (model seçimi), Onarım C (araç olayı tabanlı onarım).
- P2: Onarım E (profil esnekliği; güvenlik incelemesi ile), Onarım G (dış-bağımlı, ayrı plan).
- Kabul kriterleri:
  - Sonraki 50 salt-okunur Antigravity çağrısında `web_evidence_invalid` oranı yüzde 2 altında.
  - `webRead` probu ile gerçek çağrı sonucu arasında yanlış negatif yok (prob `available` ise gerçek çağrı da izinli; `not_probed` gerekçesi görünür).
  - `--dangerously-skip-permissions` veya eşdeğer bypass kullanılmaz; katı zarf varsayılanı korunur.
  - Güvenlik regresyonu yok: MCP negatif şema testleri, prompt injection testleri, secret tarama testleri ve redakte audit testleri yeşil.
  - `npm test`, `npm run verify`, `npm run verify:ci`, `npm run smoke` başarılı.

## 8. Sınırlar ve Notlar

- Bu rapor yalnız analiz ve öneri içerir; kod değişikliği uygulanmadı.
- `--json-schema` ve stream-json davranışı CLI sürümüne bağlıdır (kurulu sürüm 1.2.6); pilot öncesi küçük bir probe ile doğrulanmalıdır.
- Metrik dosyası model adı yerine model hash taşır; model bazlı oranlar için hash eşlemesi ayrıca tutulmalıdır.
- Kullanıcı ayarına yazma davranışı (settings.json) bu raporun kapsamı dışında ayrı bir mimari iştir; mevcut kilit, sentinel ve geri yükleme mekanizması korunuyorsa geçici olarak kabul edilebilir.

## 9. Kanıt Referansları

- `subagent-bridge/src/frontends/mcp/tools.js:179` salt-okunur Antigravity için `webEvidenceRequired: true`.
- `subagent-bridge/src/runtime/bridge-runtime.js:603-621` zarf zorlaması ve `web_evidence_invalid` üretimi.
- `subagent-bridge/src/runtime/bridge-runtime.js:257-264` düz metin onarım koşulları ve web niyeti engeli.
- `subagent-bridge/src/web-evidence.js:4-6, 9-23, 28-59, 61-111, 125-141, 205-207` zarf şeması ve kısıtlar.
- `subagent-bridge/src/adapters/antigravity-adapter.js:28-41` zarf talimatı ve izin kuralları; `:173-199` ayar mutasyonu; `:326-333` izin sınıflandırması; `:535-605` prob yolu; `:656-663, 705-724, 830-832` çağrı yolu ve zorlama; `:852-856` `agy` yürütücüsü.
- `subagent-bridge/src/config.js:158` profil bazlı `webEvidenceRequired` alanı.
- `config/policy.json` Antigravity profillerinde `webEvidenceRequired: true`.
- Metrikler: `%LOCALAPPDATA%\subagent-bridge\logs\metrics\antigravity-runs.jsonl` (176 koşu; 90 başarı; 61 `process_exit`; 15 `web_evidence_invalid`; 6 `timeout`; 3 `permission_denied`; 1 `process_error`; 16 `webEvidenceRepair`).
- `agy --help` (sürüm 1.2.6): `--json-schema`, `--output-format`, `--input-format`, `--sandbox`, `--dangerously-skip-permissions` (politika gereği kullanılmaz).
- Oturum kayıtları: `docs/reports/PLAN_DURUM_VE_TAMAMLANMA_RAPORU_2026-09-18.md:174`; `docs/plans/yarim-kalanlar/PLAN_IKINCI_BEYIN_V3_DESEN_UYARLAMASI_2026-09-18.md:154`; `docs/plans/yapilanlar/PLAN_ANTIGRAVITY_GEMINI_DAYANIKLILIK_2026-09-10.md:14, 95`.

## 10. Kullanıcı Talebi ve Sol Danışması

- Kullanıcı talebi: Antigravity ajanlarının video izleyebilmesi (YouTube ve benzeri video sayfaları) istenmektedir. Bu, raporun P0-P2 onarım önerilerinin ötesinde, video içeriğinin ajan tarafından doğrudan alınmasını hedefleyen bir yetenektir.
- Karar: Bu konu Sol (Codex `gpt-5.6-sol`) danışmasına taşınacaktır. Sol'dan beklenen: video izleme yolunun güvenlik sözleşmesiyle uyumlu tasarımı, izin modeli (headless araç izni, ayar izolasyonu), web kanıt zarfı ile video içeriğinin nasıl uzlaştırılacağı ve P0-P2 önerilerinin önceliklendirmesi.
- Zamanlama: Codex sağlayıcı kotası tükendiği için Sol danışması kota sıfırlandığında (planlanan 2026-09-19) yapılacaktır. Bu rapor Sol danışmasına girdi belgesi olarak kullanılacaktır.
- Bu bölüm bir karar kaydı değil, danışma talebidir; uygulama kararı Sol görüşü ve kullanıcı onayı sonrasında verilecektir.

### Uygulama Durumu (2026-09-19)

- Kullanıcı onayıyla P0 adımları uygulandı ve Sol denetiminden geçti; danışma kararları uygulamaya alındı.
- CLI sözleşme probu: `agy --json-schema` yalnız BOM'suz şema dosyasıyla çalışıyor; sonuç `structured_output` alanında dönüyor; `nullable: true` kabul ediliyor; model kanıt yokken boş nesne döndürdüğü için adaptörde boş nesne null'a normalize ediliyor.
- Adaptör: salt-okunur çağrılara carrier şeması eklendi; şema dosyası ayar mutasyonundan önce oluşturuluyor, hata halinde geçici dizin temizleniyor ve çağrı sonunda kaldırılıyor.
- Çalışma zamanı: `web_evidence_invalid` için tek denemelik sınırlı carrier onarımı eklendi; onarım istemi özgün görevi taşıyor, ilk bozuk yanıt geri beslenmiyor; deneme ve maliyet bütçe kapıları uygulanıyor; bilinen sağlayıcı maliyeti hata dönüşümünde korunuyor.
- Yerel alım: `subagent-bridge/src/services/video-transcript.js` ve `npm run video:collect` eklendi. URL doğrulama (yalnız YouTube watch/youtu.be, hassas parametre reddi), oEmbed ve `info.id` kimlik doğrulaması, seçilen dil ve altyazı türüyle tek iz indirme, VTT temizleme, 2 MB dosya ve 400 bin karakter sınırı, hash tabanlı `untrusted_video_transcript` zarfı ve kararlı hata sınıfları uygulandı.
- Testler: `VIDEO-01..08`, `AG-AC-15e/g`, `WP2-RUNTIME-13/14`; toplam `npm test` 657/657; `verify`, `smoke` yeşil.
- Sol incelemesi dört tur sonunda APPROVED (kritik bulgu 0); verilen 6 bulgu ve sonraki iki regresyon bulgusu kapatıldı.
- Kalan riskler: otomatik altyazı indirme dalı için doğrudan pozitif test yok; oEmbed kimlik denetimi metin tabanlı; doğrudan `read_url` rotası hâlâ ikincil ve deneysel.

### Video Pilotu (2026-09-19)

- İki video, yerel alım hattıyla toplanan transkript dosyaları workspace'e konularak Antigravity Gemini 3.8 Flash'a dosyadan okutuldu; çağrılar salt-okunur ve araçsız analiz ilkesine uygundu.
- Video 1 (`forn`): transkript 10.175 bayt. İlk deneme `web_evidence_invalid` ile düştü; sınırlı carrier onarımı tek denemede devreye girdi ve ikinci deneme analizle tamamlandı. Bu, onarım mekanizmasının canlı üretimde ilk kez başarıyla çalıştığını kanıtlar.
- Video 2 (`avenox`): transkript 49.533 bayt. İlk deneme doğrudan başarılı oldu; onarım gerekmedi.
- Video 3 (`JEV`, kanal Avenox): transkript 21.597 bayt (manuel Türkçe altyazı, 955 saniye). Şema düzeltmesi ve MCP yeniden başlatması sonrası ilk deneme başarılı: `retries 0`, 114,4 saniye, `webEvidence` null olarak normalize edildi; onarım turu çalışmadı. Rapor: `docs/plans/videolar/avenox_jev_videosu.md`.
- Her iki sonuç da `untrusted` / `quarantined` zarf ve `transcript_only` modalitesiyle döndü; ham URL, başlık veya transkript audit'e yazılmadı.
- Süre maliyeti: onarım gerektiren çağrı yaklaşık 8 dakika (ilk deneme yaklaşık 4,4 dakika boşa gitti), onarımsız çağrı yaklaşık 3,6 dakika. İlk denemenin neden zarfı üretemediği (çıktı boyutu veya model eğilimi) ayrı bir ölçüm konusudur.
- Düzeltme: Avenox videosunun gerçek içeriği 2026-09-18 tarihli ilk raporda yanlış tanımlanmıştı (Fable/Astra 3D-web araçları sanılmıştı). Tam transkript analizi içeriğin Serai adlı çoklu ajan orkestrasyon seansı olduğunu gösterdi; `docs/plans/videolar/avenox_videosu.md` düzeltilmiştir.

### İlk Deneme Zarf Hatasının Kök Nedeni (2026-09-19 ölçümü)

- Yöntem: Başarısız koşuların `agy` konuşma kayıtları SQLite üzerinden adım adım incelendi; hata adımlarındaki ikili (binary) hata alanları çözüldü; ayrıca düzeltme sonrası adaptör taze süreçte doğrudan çalıştırılıp ham çıktı zarf doğrulamasından geçirildi.
- Ölçülen kök neden: CLI, `--json-schema` ile verilen `webEvidence` alanını function-argument doğrulamasında katı biçimde nesne olarak zorluyor ve `nullable` bayrağını yok sayıyordu. Model kanıt olmadığında doğal olarak `null` üretiyor ve şu hatayı alıyordu: "invalid arguments: at '/webEvidence': got null, want object". Zorunlu iç alanlar nedeniyle boş nesne de reddediliyordu: "missing properties 'sourceUrl', 'excerpts'".
- Etki zinciri: Model geçerli bir kanıt değeri üretemedi; var olmayan dosyaları okumaya çalıştı (`tests/antigravity-adapter.test.js`, `logs/metrics/antigravity-runs.jsonl`), izin redleri ve 75 adıma kadar uzayan planlayıcı döngüleri oluştu; CLI zorunlu çağrılarla kapanınca geçerli `structured_output` üretilemedi ve köprü sonucu `web_evidence_invalid` olarak sınıflandırdı.
- Çalışan MCP sunucusu notu: Sonraki canlı MCP denemelerinde hata mesajlarının eski şemayı göstermesi, uzun ömürlü MCP sürecinin modülü bellekte eski sürümle tuttuğunu ortaya koydu; düzeltmeler MCP sunucusu yeniden başlatıldıktan sonra etkin olacaktır.
- Düzeltme: Şemada yalnız `result` zorunlu bırakıldı; `webEvidence` tip kısıtı kaldırıldı (serbest alan) ve kanıt doğrulaması ana süreçteki katı Zod zarfına, secret/URL/markup taramasına ve karantina normalizasyonuna bırakıldı.
- Doğrulama (taze süreç, aynı istem ve transkript): İlk deneme 63 saniyede tamamlandı, `carrier_valid`, `evidenceKind: null_or_absent`. Önceki koşularda ilk deneme 88-264 saniyede düşüp onarım turuna veya döngüye giriyordu.
- Güvenlik etkisi: CLI şeması artık biçim zorlar; kanıt ve kısıtlı içerik denetimi değişmeden ana süreçte kalır; boş/eksik kanıt `null`'a normalize edilir. İçerik doğrulaması zayıflatılmadı.
- MCP yeniden başlatma doğrulaması: Sunucu yeniden başlatıldıktan sonra aynı istem ve transkriptle yapılan canlı çağrı ilk denemede başarılı oldu; `retries: 0`, `adapterAttempts: 1`, süre 133,7 saniye, `webEvidence: null` olarak host tarafından normalize edildi ve onarım turu gerekmedi. Önceki koşullarda ilk deneme 88-264 saniyede düşüyor, onarım veya zaman aşımı ile kapanıyordu.

### Sol Danışma Sonucu (2026-09-19)

- Danışma tamamlandı (Codex `gpt-5.6-sol`, salt-okunur, 109.6 saniye, retry 0). Sol önerisi: hibrit mimari, ancak birincil yol yerel alım + araçsız model analizi olmalı.
- Önerilen akış: orkestratör URL'yi doğrular ve video kimliğini çıkarır; `yt-dlp` ile altyazı ve resmi oEmbed ile künye alınır; içerik normalize edilir, hash'lenir ve karantinaya alınır; Antigravity modeli araçsız olarak yalnız transkript ve künye üzerinde analiz yapar; `read_url` yalnız izin probu başarılıysa ikincil rota olarak denenir ve başarısızlıkta temel analiz etkilenmez.
- Sol değerlendirmesi: `read_url` bir video sayfasını açsa bile modelin videoyu izlediği kabul edilemez; ekrandaki yazı, grafik, kod gösterimi, ses tonu ve altyazı dışı konuşmalar hakkında sonuç üretilmemelidir. Analiz çıktısı `transcript_only` olarak etiketlenmelidir.
- Önceliklendirme değişikliği: yerel video alımı P0'a yükseltildi; `--json-schema` zarf zorlaması ve tek denemelik sınırlı carrier onarımı P0; prob dürüstlüğü, model politikası ve araç-olayı tabanlı karar P1; profil esnekliği ve AGY ayar izolasyonu video hedefi için opsiyonel (doğrudan rota varsayılan olursa zorunlu).
- Güvenlik kapıları önerisi: hassas parametreli/özel ağ/oturum gerektiren/DRM'li/canlı/oynatma listesi/altyazısız içerik reddi; transkriptin güvenilmeyen veri olarak işaretlenmesi; araçsız çağrı; sonuçta URL, secret veya markup taraması; oEmbed, altyazı ve yönlendirme video kimliği eşleşmesi; otomatik ve manuel altyazı için ayrı provenance.
- Önerilen kanıt zarfı: `untrusted_video_transcript` türü, platform, video ve kanal kimliği hash'leri, alım yöntemi, altyazı türü, dil, transkript hash'i, süre ve `analysisModality: transcript_only`; güven alanları ana süreç tarafından üretilir.
- İlk pilot önerisi: yalnız herkese açık YouTube, en fazla 20 video, kısa süre sınırı, tam video/ses indirme yok, geçici içerik çağrıya özel dizinde ve çağrı sonunda silinir; kabul kriterleri arasında secret/URL/transkript audit sızıntısı sıfır, enjeksiyon engelleme, kimlik uyuşmazlığı sıfır ve birincil rotanın webRead izni reddedilse de çalışması vardır.
- Kaçınılması gerekenler: izin bypass, kalıcı global `read_url(*)`, videonun izlendiğini varsaymak, ilk pilotta tam video indirme/kare çıkarma/OCR/oturum kullanımı, doğrulanmamış kullanıcı URL'sini kabuk argümanına geçirmek, promptta URL var diye araç kullanıldığını varsaymak.
- Karar durumu: Bu danışma sonucu öneri niteliğindedir; pilot uygulaması kullanıcı onayına bağlıdır.

## 11. Salt-Okunur Enforcement Başarısızlığı (2026-09-27)

- Önceki envanter görevi `read_only_enforcement_unavailable` nedeniyle provider'a ulaşmadan durdu. Ayrı Antigravity capability probe'unda Gemini 3.8 Flash için `modelAccess`, `toolFreeResponse` ve `workspaceRead` kullanılabilir döndü; bu hata sınıfı model erişimi veya workspace okuma yeteneği değildir.
- Redakte yerel ayar incelemesinde settings dosyası geçerli JSON ve yazılabilir durumdaydı. `permissions.allow` listesinde bir özgül `command(...)` kuralı bulundu; ham kural rapora alınmadı. Eski `hasSafeReadOnlyPermissionBaseline` bu kuralı `command(*)` deny etkinleştirilmeden önce reddediyordu.
- Resmî Antigravity izin belgesi CLI için `Deny > Ask > Allow` önceliğini ve wildcard kuralın daha dar hedefleri kapsamasını belgeliyor; Windows için de aynı sıra geçerlidir: https://antigravity.google/docs/permissions (erişim: 2026-09-27).
- Adapter guard'ı, yalnız allow kuralı karşılığı read-only deny listesinde bulunan eylemleri kabul edecek şekilde düzeltildi. Geçici deny listesi `command(*)`, `unsandboxed(*)`, `write_file(*)`, `mcp(*)` ve `execute_url(*)` kurallarını içeriyor; `read_file(*)` gibi daraltılmamış harici okuma izinleri hâlâ reddediliyor. Mevcut kullanıcı ayarlarının geri yükleme düzeni korunuyor.
- Hedefli Antigravity adapter testi 42/42 geçti. Güncel kaynak değişikliği sonrası restart öncesi iki canlı çağrı aynı enforcement hatasıyla durdu; yerel stdio child sürecini sonlandırmak etkin tool runtime'ını yenilemedi. Kullanıcı OpenCode'u tamamen yeniden başlattıktan sonra modelAccess, toolFreeResponse ve workspaceRead probeları `available` döndü. Resmî Antigravity izin belgesi araştıran salt-okunur görev 104,8 saniyede başarıyla tamamlandı (`retry: 0`, `failureStage: null`, `settingsLockWaitMs: 0`); bu canlı sonuç düzeltmenin yeniden yüklenmiş runtime'da çalıştığını doğruladı.
- Ardından yalnız sağlanan plan özetlerine dayalı aday tutarlılık görevi de başarıyla tamamlandı. Bu görev workspace dosyalarını okumadı; `HAFTA_1` adayının kabul kriterleri ana orkestratör tarafından dosyada bağımsız doğrulandı ve plan `yarim-kalanlar` altına taşındı. Hiçbir izin bypass'ı kullanılmadı.
