# Codex–Hades entegrasyonu: yeniden değerlendirme

## 2026-11-23 — Araçsız Antigravity isteğinde web-evidence yanlış zorlaması

Bu oturumda `hades://workspace/identity/v1` resource'u doğrudan okundu. `processCwdSha256` ve `trustedWorkspaceSha256`, bu worktree'nin Node `fs.realpathSync(process.cwd())` sonucu için hesaplanan `f876a30710252f1eb140af2b915ce9ce3252ca89aa7345ba25caf4fef1ccda61` değeriyle eşleşti. Rules resource'u `verified/match` verdi ve üç yerel kural dosyasının boyut/hash değerleri eşleşti. `startup_context=unavailable`; bu, çalışan commit veya config için attestation değildir.

Canlı Antigravity capability kontrolünde Gemini High ve GPT-OSS 120B alias'ları canonical kimliklerine çözüldü. Her ikisi için `modelAccess=available` ve `toolFreeResponse=available`; `webRead=unavailable`, `failureClass=unclassified` gözlendi. Bu capability sonucu model erişimini gösterir; web erişimini göstermez.

`gpt_oss_120b` üzerinden bir kez araçsız `6 × 7` kabul isteği yapıldı. Sonuç `gpt-oss-120b-medium` olarak çözüldü; ilk deneme `server/internal_error` ile exit 3 ve retry kararı, ikinci deneme exit 0 ile tamamlandı fakat host `web_evidence_missing` üretti. `webReadStatus=not_invoked`, `taskCompletion=partial`, toplam iki adapter denemesi/bir retry gözlendi; maliyet null idi. İstek açıkça web ve araç kullanımını yasakladığı hâlde host strict web kanıtı istedi. Bu, model çıktısı başarısızlığı değil, negatif direktif sınıflandırmasındaki yerel hataydı.

`subagent-bridge/src/web-evidence.js` içindeki `standaloneWebProhibitionPattern`, yasaklı eylemlerden browse eyleminin önce geldiği bu sıralamayı tanıyacak biçimde düzeltildi. `tests/web-evidence-runtime.test.js` içinde canlı prompt biçimi için regresyon eklendi. Hedefli test komutu `node --test tests/web-evidence-runtime.test.js` **18/18 geçti**. Bu düzeltme henüz çalışan Hades sürecine yüklenmiş sayılmaz; canlı kabul tekrarı restart ve güncel identity doğrulamasından sonra yapılmalıdır.

Son kaynakla `npm run verify:local` tamamlandı ve beş aşamanın tümü geçti: `verify:ci`, 96 test dosyalı ana suite, zorunlu seri benchmark (**16.072 ms**), sentetik stdio smoke ve sentetik config/Vault verify. Toplam süre 553.740 ms; provider credential'ları aktarılmadı, gerçek Vault kullanılmadı ve kaynak snapshot'ı koşu boyunca sabit kaldı (`3aec3f48de6a9ca8c1feec0b627b199b664691ea8c38f193d874db7f38f38181`). Ana suite'in kesin pass/skip sayısı rapor çıktısında mevcut değildi; bu nedenle sayı iddia edilmiyor. İlk sandbox koşusu 114 Windows test hatasıyla durdu; tekil `tests/codex-project-config-startup.test.js` tekrarında `fs.linkSync` `EPERM` ile reddedildi. Aynı tam koşu standart kullanıcı TEMP/TMP ve normal izin yükseltmesiyle başarılı oldu. Bu ortam hatası ürün kusuru kanıtı değildir.

Gemini High web-read capability probu `unavailable` döndüğünden web araştırması kabul edilmedi. Aynı başarısız web kabulini yeniden denemedim. Bu, P1b'nin önceki seçili model erişimi/araçsız görev kabulinden ayrı tutulur. Önceki başarılı GPT-OSS `42` görevi P1b model kabul kanıtı olarak durur; bu yeni istek host sınıflandırma hatası nedeniyle kabul kanıtı değildir. Eski probe'daki geçici dizin cleanup `process_error` geriye dönük çözülemez. Kullanıcının son kararı uyarınca Sol incelemesi bu tamamlanma hedefinde zorunlu kapı değildir; Sol incelemesinin yapılmış olduğu iddia edilmez. Native Claude Code abonelik yokluğu nedeniyle, hosted CI ise kullanıcı kararıyla kapsam dışıdır.

## 2026-11-22 — PR #2 post-merge doğrulaması

GitHub PR API, PR #2'nin `closed` ve `merged=true` olduğunu; squash merge commit'inin `573de4380f3c63479a4383e2aa0ad73f58ef2e31`, parent'ının `213b12d679559f79b6c3d8ab7bd556abf9008a1a` ve commit tree'sinin `2d4264e34802eb0e83e5a5d316c96baff537e19e` olduğunu bildirdi. Yerel feature HEAD `9d2a2c5c89ef5e10c16ff7d2b3dbadac2fd4560e` aynı tree SHA'ya sahip. Dolayısıyla PR #2 kaynak ve belge ağacı main'e alınmıştır; bu yerel worktree'nin branch pointer'ı main'e taşınmış değildir.

Bu doğrulama eski “PR açık/merge edilmedi” kayıtlarından sonradır; aşağıdaki 21-22 Kasım notları olay anındaki tarihsel durumu anlatır. 11-22 tarihli önceki 35 dosyalı preflight ölçümü 1.491.250 kaynak baytıydı. 11-23'te son Sol girişiminde seçilen 35 dosya için ayrı ölçüm 1.497.453 bayt çıktı. Kayıtlı manifest bağları bu iki ölçümün aynı içerik snapshot'ı olduğunu göstermediğinden bayt değerleri ayrı tarihli teşhislerdir. Her iki preflight da README'deki `high_entropy` sinyaliyle `review_scope_secret_detected` sonucunda erken durdu; toplam/bundle sınırları çalıştırılmadı ve payload oluşturulmadı. Ayrı bir beş dosyalı DeepSeek incelemesi de `review_scope_secret_detected` nedeniyle kaynak tesliminden önce durdu. Önceden başarıyla tamamlanan üç dosyalı DeepSeek incelemesi yalnız kendi manifest sınırındaki `config.js`, MCP registration ve provider-admission kodu için geçerlidir; tüm diff için genellenemez. Gemini Low'un hipotez çağrıları `web_evidence_missing` ile strict kabul edilmedi; bu denemeler kod incelemesi değildir.

Özgün plan P0–P5 işlevsel kabulü belgelenen kapsam için geçerlidir. Ayrı Gemini High web-evidence kabulü tamamlanmadı; eski GPT-OSS cleanup hatası geriye dönük doğrulanamaz. Kullanıcı native Claude Code'u abonelik olmadığı için kapsam dışı bıraktı ve hosted CI'ı geçiş kabul kapısı saymıyor. Kullanıcı ayrıca yeni bir Sol incelemesi istedi; henüz tamamlanmış Sol incelemesi veya tüm entegrasyon için “hatasız” kararı yoktur. Canlı Hades workspace/rules gözlemleri kök ve kuralları eşledi, fakat `startup_context=unavailable` kaldığından çalışan revision attestation'ı değildir. Her checkout için yerel Hades kaydı ayrıca yapılandırılır.

## 2026-11-23 — Tam yerel doğrulama ve inceleme kapısı

Standart kullanıcı TEMP/TMP ortamında, normal izin yükseltmesiyle `npm run verify:local` başarıyla tamamlandı. Beş aşamanın tümü geçti: `verify:ci`; 96 test dosyasında 1.268 başarılı, 5 Windows koşullu atlama, 0 başarısız; 13.475 ms seri benchmark; sentetik stdio MCP smoke; sentetik config/Vault verify. Toplam süre 454.943 ms. Koşu boyunca kaynak snapshot'ı sabit kaldı ve provider credential'ı child süreçlerine aktarılmadı.

İlk sandbox koşusunda 113 raporlanmış test başarısızlığı vardı. Standart `spec` reporter ile seçili testlerde loopback HTTP çağrıları sandbox altında çalışmadı ve `tests` fixture'ındaki symlink yaratımı `EPERM` aldı. Aynı tam verify:local koşusunun izin yükseltilmiş normal TEMP/TMP tekrarı geçti. Bu nedenle sandbox sonucu ürün kusuru kanıtı değildir; sandbox gereksinimleriyle tam test koşusu uyumlu değildir.

Güncel PR #2 snapshot'ının tamamı için Sol source review preflight'ı bir kez çalıştırıldı: 35 dosya, 1.497.453 kaynak baytı; README üzerinde `high_entropy` sinyali ve 29 aday nedeniyle `review_scope_secret_detected`. Dosya-başı sınıflandırma erken durduğu için toplam/bundle kontrolü çalışmadı, payload oluşturulmadı ve Sol/provider çağrısı başlamadı. Aynı exact 35 dosyalı scope ile `run_codex_subagent` bir kez çağrıldı; Hades MCP preflight'ı `mcp_preflight` aşamasında aynı sınıfla reddetti, `adapterAttempts=0`, `resolvedModel=null`, kaynak teslimi `not_attempted`. Tam 35 dosyalı diff'ten ayrı beş dosyalı DeepSeek review girişi de yerel secret preflight'ında teslim öncesi engellendi. Başka bir doğal üç dosyalı Antigravity/runtime/web-evidence DeepSeek incelemesinde kaynak API'ye teslim edildi, fakat çıktı `output_limit` nedeniyle kesildi (`taskCompletion=partial`, `outputIntegrity=truncated`, strict review sonucu yok); bu sonuç geçerli kod incelemesi sayılmaz ve aynı istek tekrarlanmadı. Başarıyla tamamlanan ayrı üç dosyalı DeepSeek review'u `config.js`, MCP server registration ve provider-admission kapsamını içerdi; manifest SHA-256 `0362f394265475644e4a5ba8fbb7f424a7c1fe705b5965526886f0b15f29a86f`, üç dosya ve 61.481 bayt, strict sonuçta doğrulanmış bulgu yoktu. Bu dar inceleme tüm PR diff'inin bağımsız denetimi sayılmaz. Gemini Low'un başarılı kısa çağrısı yalnız risk hipotezleri üretti, kod denetimi değildi; diğer çağrılar `web_evidence_missing` ile strict kabul edilmedi. Preflight veya platform kararını aşan alternatif teslimat denenmedi.

Kamuya açık squash merge commit'inin GitHub API metadata'sında kişisel e-posta görünür. Bu, credential sızıntısı değildir; kişisel veri/mahremiyet bulgusudur. Mevcut public history'den kaldırmak için `main` geçmişini yeniden yazıp force-push etmek gerekir; bu işlem bu kayıtta yapılmadı. Geçmiş yeniden yazımı için ayrı açık karar gerekir.

## 2026-11-23 — Web evidence doğrulamasındaki yerel bulgu

Üç parçalı yerel denetimde Antigravity stream trace'inin `DONE` durumundaki `read_url` olayını yalnızca boş olmayan `tool_info.output` metnine bakarak başarılı saydığı doğrulandı. Böylece `Navigation failed: upstream returned an error` çıktısı, modelin `Example Domain` yanıtı ve doğru URL hash'iyle birleşince capability probe için yanlış `available` sonucu üretebiliyordu. Önceki test fixture'ı da araç çıktısında iddia edilen excerpt'in bulunmasını zorunlu tutmuyordu.

Adapter artık bilinen fetch/navigation hata metinlerini başarısız sayıyor. Web capability probe beklenen `Example Domain` başlığının aynı URL için araç çıktısında bulunduğunu doğruluyor. Normal web-evidence carrier'ında her excerpt'in aynı denemedeki, aynı canonical URL hash'ine ait başarılı araç çıktısında bulunduğu kontrol ediliyor; eşleşmeyen iddia `web_evidence_invalid` ve `web_source_content_not_observed` ile fail-closed reddediliyor. Ham sayfa çıktısı sonuca eklenmiyor.

Regresyonlar, başarısız araç çıktısıyla başarılı görünen probe'u ve doğru URL'ye rağmen kaynak excerpt'i içermeyen carrier'ı reddediyor; geçerli kaynak excerpt'i yolunu koruyor. Hedefli Antigravity testleri 74/74 geçti. Ardından tam `npm run verify:local` geçti: 96 test dosyasında 1.268 başarılı, 5 Windows koşullu atlama, 0 başarısız; seri benchmark 15.211 ms; verify-ci, sentetik stdio smoke ve sentetik config/Vault verify başarılı. Koşu 540.871 ms sürdü, kaynak snapshot'ı sabit kaldı ve provider credential'ı aktarılmadı.

Bu düzeltme, gözlenen yerel sınıflandırma/kanıt bağlama kusurunu kapatır; Antigravity web aracının gerçek ağdan veri alabildiğini veya canlı Gemini High web kabulini kanıtlamaz. Bilinmeyen biçimli hata metinleri için genel bir başarı protokolü attestation'ı değildir. Son Sol incelemesi yerel secret preflight'ında engelli kaldı; bu değişiklik bağımsız Sol onayı almış değildir.

Üç yerel alt denetim farklı kapsamları inceledi. Runtime/provider kapsamındaki denetim doğrulanmış ek bulgu bildirmedi. Codex bootstrap denetimi launcher/config bağında doğrulanmış kusur bulmadı; checkout başına yerel config gereksinimini ve canlı process attestation sınırını teyit etti. Kabul/test kapsamındaki denetimin web-read yanlış pozitifi yukarıdaki düzeltmeyle kapatıldı. Beş dosyalı DeepSeek follow-up çağrısı önce auto-review tarafından özel kaynak kodunun dış API'ye gönderilmesi riskiyle reddedildi. Kullanıcı aynı exact beş dosyanın DeepSeek API'ye gönderilmesine açık onay verdikten sonra aynı kapsam bir kez yeniden çağrıldı ve tamamlandı: `deepseek-flash`, 5 dosya/159.732 bayt, manifest SHA-256 `ad7d7a0fb1f873aad8553e8055c5077b86cf6b9a5875e251ba477fee8f4d6f37`, `complete_to_api`, strict sonuç doğrulandı, 1 deneme/0 retry, 7.311 ms; host maliyet tahmini 0,0174588 USD olup gerçek fatura bilinmiyor. Reviewer bu değişiklik kapsamı için doğrulanmış ek kusur bildirmedi; canlı ağ erişiminin kanıtlanmadığını özellikle belirtti. Genel 35 dosyalı Sol incelemesi yerel repository preflight'ında hâlâ engellidir ve tamamlanmış sayılmaz.

## 2026-11-22 — PR #2 çatışma uzlaştırması

Başlangıç GitHub karşılaştırması main (213b12d679559f79b6c3d8ab7bd556abf9008a1a) ile codex/hades-codex-startup-fix (4eca3d2bdde65006053717bcc8c9f0434f8d85d1) arasında 9 commit ahead ve 1 commit behind gösterdi. GitHub PR #2'de README, geçiş planı, durum indeksi ve bu rapor için çatışmalar bildirdi. Çözümde daha yeni feature dalı kabul/yayın kayıtları korundu; launcher yönergelerinin feature README'sinde bulunduğu doğrulandı. Bu uzlaştırma feature dalını günceller; PR #2'yi main'e merge etmez. Kullanıcının kararı gereği hosted CI kabul kapısı değildir.

## 2026-11-22 — Gemini High web kabul denemesi ve açık temizlik kanıtı

Feature worktree'de `gemini_flash` / `gemini-3.8-flash-high` için tek bounded, salt-okunur kamuya açık web kabul görevi çalıştırıldı. İstek yalnız IANA'nın reserved domains sayfasını `read_url_content` ile okumayı hedefliyordu; yerel dosya, kabuk, MCP veya yazma erişimi istenmedi. Host sonucu kabul koşulunu karşılamadı:

- İlk adapter denemesi `web_evidence_invalid` / `web_evidence_missing` ile sonlandı; süreç exit 0 olsa da tamamlanmış web aracı kanıtı ve kanıt zarfı yoktu.
- Host'un yapılandırılmış tek retry denemesi `timeout` ile bitti. Nihai görev `taskCompletion=partial`, `outputIntegrity=unknown`, `webReadStatus=not_invoked`; `exitCode` yok, toplam iki adapter denemesi ve bir retry olarak kaydedildi. Maliyet `null`; fatura tutarı bilinmiyor.
- Bu nedenle Gemini High model yürütme kabulini geriye dönük değiştirmeyen ayrı `web_research` kabul kapısı başarısız/kanıtsız kaldı. Aynı web görevi tekrar edilmedi.
- Sonraki capability tanısı `modelAccess=available`, `webRead=unavailable`, `failureClass=unclassified` döndürdü. Bu, model erişimini doğrular; web izninin neden kullanılamadığını açıklamaz ve başarılı web kanıtının yerine geçmez.

**Karar:** Yeni kaynak kusuru kanıtı yok; Hades'in tamamlanmış web olayı/kanıt gereksinimi fail-closed çalıştı. Platformun web aracı/izin davranışının kök nedeni bu gözlemlerle belirlenemedi. Ek izin, global Antigravity ayarı veya araç politikası değiştirilmedi; yeni model görevi başlatılmamalı, web capability yeniden değerlendirilmesi için izin/araç engeli ayrıca çözülmelidir.

### GPT-OSS probe cleanup incelemesi

Kaynakta capability probe'un `finally` bloğu, probe workspace'lerini `fs.promises.rm` ile sınırlı Windows retry ayarlarıyla kaldırıyor. Herhangi bir silme reddedilirse probe `failureClass=process_error` kaydediyor; workspace-read istendiyse o capability de unavailable oluyor. Var olan testler normal/sentinel cleanup başarısını sınar. Önceki GPT-OSS `process_error` kaydı bu kaynak dalıyla tutarlıdır, ancak hangi dizinin kaldığına veya artığın hâlâ mevcut olduğuna dair tarihsel kanıt yoktur. Eski olay artık geriye dönük doğrulanamaz. Yeni bir GPT-OSS provider/probe çağrısı yapılmadı; kaynakta tekrarlanabilir bir kusur gösterilmediğinden bu turda cleanup davranışı değiştirilmedi.

Canlı web denemesi sırasında kaynak kodu, policy ve kişisel config değiştirilmedi; yalnız bu rapor ve README'deki güncel durum özeti belgelendi. Bu deneme anında tam test/verify çalıştırılmamıştı; sonraki birleşik-checkout doğrulaması aşağıdaki ayrı kayıtta yer alır. PR #2 birleştirilmedi; kullanıcı talimatıyla PR son adımdır.

## 2026-11-22 — PR #1 kaynak uzlaştırması sonrası yerel doğrulama

Uzak feature dalındaki PR #1 merge commit'i (`213b12d679559f79b6c3d8ab7bd556abf9008a1a`) ve PR #2 belge uzlaştırması yerel feature dalına alındıktan sonra `npm run verify:local`, commit `27bacebfb94aadef0b9aaf0d1e5013b44dd0c60c` üzerinde tamamlandı.

- Beş aşamanın tümü geçti: `verify:ci`, test paketi, seri benchmark, sentetik stdio smoke ve sentetik config/Vault verify.
- Tam test sonucu: 96 dosya, 1.268 başarılı, beş Windows koşullu atlama, sıfır başarısızlık. Zorunlu benchmark 9.049 ms; toplam koşu 453.860 ms sürdü.
- Koşu `Node v24.17.0`, Windows x64 kullandı. Sentetik smoke/config ve Vault fixture'ları kullanıldı; sağlayıcı kimlik bilgileri child süreçlerine aktarılmadı.
- Başlangıç ve bitiş kaynak snapshot'ı aynıydı (`b21809df…b4b65cb`). Başlangıç ve bitişteki kirli Git durumu yalnız çalışma ağacındaki, commit dışı checkout `cwd` ayarı değişikliğinden kaynaklandı; bu dosya commit'e dahil edilmedi.
- Bu sonuç hosted CI değildir; kullanıcı kararıyla hosted CI ayrı kabul kapısı değildir. Canlı Gemini web kabulinin başarısız/kanıtsız ve GPT-OSS tarihsel cleanup sonucunun belirsiz olduğu durumu değiştirmez.

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

## 2026-11-23 yinelenen negasyon ve canlı kabul durumu

Araçsız GPT-OSS kabul isteği, yasak eylemlerin cümledeki sırasına bağlı host web-intent sezgisi nedeniyle `web_evidence_missing` ile reddedilmişti. İlk düzeltmenin ardından yerel gözden geçirme yinelenen olumsuzluk biçimini (`Do not browse the web, and do not search the web.`) ve “İnternette gezinmeyin” ifadesini eksik buldu. Başka bir gözden geçirme, `and search` ile başlayan açık olumlu eylemin olumsuz listeyle birlikte silinebildiğini belirledi. Ek regresyon ve düzeltme, yalnız olumsuz olan İngilizce eylem listelerini, yinelenen açık `do not` öğelerini ve kapsama alınmış Türkçe biçimleri temizler; `and`/`;`/satır sonu sonrası olumlu web isteğini korur. Belirsiz cümleler fail-closed biçimde web evidence niyeti olarak kalır.

Doğrulama sonuçları:

- `tests/web-evidence-runtime.test.js`: 18/18 başarılı.
- `tests/antigravity-capability-probes.test.js`, `tests/faz-1-antigravity.test.js` ve `tests/web-evidence-runtime.test.js`: son ek hata-biçimi ve negasyon regresyonlarından önce seçili adapter/capability paketi 92/92, son runtime paketi 18/18 başarılı. Probe yolu başarısız `read_url` çıktısını reddeder ve başarıyı yalnız istenen URL hash'i yanında beklenen sayfa başlığını taşıyan aynı tamamlanmış tool çıktısına bağlar. Hata açıklaması marker içerse bile (`The fetch is unavailable. Example Domain is the expected title.`) probe `unavailable` döndürür. Fixture'lar yanlış URL, eksik araç, izin reddi, standart hata ve marker içeren hata çıktısını ayırır.
- Son `npm run verify:local`: beş aşama geçti. 96 test dosyasında 1.268 başarılı, 5 koşullu atlama, 0 başarısızlık; zorunlu seri benchmark 24.008 ms; sentetik smoke 3.148 ms ve sentetik config/Vault verify 386 ms. Toplam 635.238 ms, Node v24.17.0 / Windows x64.
- Koşu kaynağı `a1c9b7f1eb174cd4404049d8cfced9053e294da10c679b93a89fa8391b3ee92d` ile başlangıç ve bitişte aynı kaldı. Runner başlangıç/bitiş Git durumunu kirli bildirdi; bu kapsama `.codex/config.toml` kullanıcı değişikliği ile follow-up kaynak/test diff'i dahildi. Sentetik fixture kökü temizlendi; gerçek Vault/provider kimlik bilgileri verify sürecine aktarılmadı.

İnceleme girişimleri bağımsız doğrulama sayılmaz: source-free DeepSeek analyst görevi `output_limit` ile yapılandırılmış sonuç üretmedi (2.048 çıkış tokeni; host maliyet tahmini 0,0032541 USD, fatura değil). Source-free Gemini Flash Low isteği `web_evidence_invalid/result_contains_restricted_content` ile iki adapter denemesinden sonra sonuçsuz kaldı; web-read aracı çağrılmadı ve maliyet bilinmiyor. Gemini cevabı test fikri olarak dahi doğrulanabilir bulgu sağlamadı. Sol incelemesi kullanıcı tarafından kapsam dışı bırakıldı.

Son doğrulama anında commit HEAD `9c35d3677bf2f02254ddc2fadda28a69916122d4` idi; follow-up kod ve test dosyaları henüz commit/push edilmemişti. `.codex/config.toml` içindeki yerel mutlak `cwd` değişikliği kullanıcıya ait olup teslim kapsamına alınmamalı. Hades bu follow-up commit'i yüklemek üzere yeniden başlatılmadı. Bu nedenle kaynak düzeltmeleri yerel testlerden geçti, fakat canlı Codex/Hades süreçte yeni, araçsız GPT-OSS `42` kabulü henüz yapılmadı. Bu sonuç Gemini High web araştırması kabulini de değiştirmez; canlı `web_research` kanıt yolu ayrı ve açık kalır.

Kod ve regresyonlar `f7fcf4098f40ccdfe9c60105f14eeec3ef6c3690` commit'iyle `codex/hades-codex-startup-fix` dalına gönderildi. Commit yalnız README, durum indeksi, bu rapor, iki adapter/runtime dosyası ve üç test/fixture dosyasını içerir. Commit-range Gitleaks taramasında secret eşleşmesi yoktu. `.codex/config.toml` içindeki kullanıcıya ait cwd değişikliği commit dışında bırakıldı.

### Restart sonrası canlı kabul

Kullanıcının restart bildiriminden sonra yalnız `hades-orchestrator` kaynak listesi, `hades://workspace/identity/v1` ve `hades://rules/attestation/v1` okundu. `processCwdSha256` ve `trustedWorkspaceSha256`, kanonik worktree kökünün SHA-256'sı `f876a30710252f1eb140af2b915ce9ce3252ca89aa7345ba25caf4fef1ccda61` ile eşleşti. Rules `verified/match` döndürdü; `startup_context` `unavailable` kaldı, dolayısıyla bu gözlem çalışan commit'in kriptografik attestation'ı değildir.

`gpt_oss_120b` için iki dosyasız araçsız canlı görev tamamlandı. Basit görev ve özellikle `Do not browse the web, and do not search the web` yönergesini içeren sınıflandırma regresyon görevi `result="42"`, `exitCode=0`, `taskCompletion=completed`, `outputIntegrity=complete`, `resolvedModel=gpt-oss-120b-medium`, bir adapter denemesi ve sıfır retry döndürdü. Sınıflandırma regresyon çağrısı 13.837 ms sürdü; maliyet alanı `null`, gerçek fatura bilinmiyor. Bu, önceki `web_evidence_missing` host false-positive yolunun canlı Hades reload'undan sonra geçtiğini doğrular.

Ayrı `check_antigravity_subagent` probe'u `gemini_flash` alias'ını `gemini-3.8-flash-high` olarak çözdü; CLI 1.5.15 mevcut ve model alias şeması geçerliydi. Yalnız `webRead` prob edildi; sonuç `unavailable`, `failureClass=unclassified`; `modelAccess` ve `toolFreeResponse` prob edilmedi. Bu, Gemini High web araştırmasının kabulü değildir. Native Claude Code abonelik kararı nedeniyle kapsam dışıdır. Source-free DeepSeek analizi `output_limit` ile sonuçsuz kaldı, Gemini kavramsal çağrısı `web_evidence_invalid` verdi; bunlar bağımsız denetim veya kabul kanıtı sayılmaz. Sol incelemesi kullanıcı tarafından açıkça kapsam dışı bırakıldı.

## 2026-11-23 — PR #2 sonrası takip dalı

PR #2'nin squash merge commit'i `573de4380f3c63479a4383e2aa0ad73f58ef2e31` ile aynı ağaçta başlayan `codex/post-pr2-followup` dalına yalnız merge sonrası beş takip commit'i taşındı: web evidence bağlama, Antigravity web niyeti, hata çıktısına karşı probe, teslim kaydı ve restart sonrası GPT-OSS kabul kaydı. Bu dalın PR #2 öncesi değişiklikleri taşımadığı, başlangıç ağacının merge commit'iyle aynı olması ve merge commit'inden dal başına diff'in 11 dosya ile sınırlı kalmasıyla doğrulandı. Takip kaynak ağacının SHA-1 tree kimliği `999c40f7d1e192c3aeb5d9a90cde1c6e978aa894`; bu, son `npm run verify:local` koşusunun test edilmiş kaynak ağacıyla aynıdır. O tam doğrulamada beş aşamanın tümü geçti: 96 test dosyasında 1.268 başarılı, 5 koşullu atlama, 0 başarısız; zorunlu benchmark 24.008 ms; sentetik smoke ve sentetik config/Vault verify başarılı. GitHub merge tabanı ile takip ağacı arasındaki diff'in Gitleaks taramasında 5 commit ve yaklaşık 45.92 KB tarandı, eşleşme bulunmadı. Kullanıcıya ait `.codex/config.toml` mutlak `cwd` değişikliği çalışma ağacında unstaged kaldı ve dal diff'ine alınmadı.

Bu takip dalı PR #2'den ayrı yayınlanmalıdır; PR #2 zaten squash-merged durumdadır. Gemini High `webRead` kabiliyeti hâlâ canlı kabul edilmedi ve bu takip işinin tamamlanmış web araştırması kanıtı olarak sunulamaz. Kullanıcı Sol bağımsız incelemesini bu hedef için kapsam dışı bıraktı; inceleme yapılmış sayılmaz. Hosted CI da kullanıcı kararıyla bu hedefin kapısı değildir.

## 2026-11-25 — PR #3 merge durumu

GitHub PR API, PR #3'ün `main` tabanına squash-merge edildiğini doğruladı. Merge commit `32c69540a1e1bb99cbc3d4d4094ca7308826f16b`, parent `573de4380f3c63479a4383e2aa0ad73f58ef2e31`, merge zamanı `2026-11-24T13:41:48Z`. Merge commit tree SHA-1 `4b613fb0921677d8e29b9e118bb33732a53974f8`, PR head `716eec6886a434e2a052aae0f59f21137a7626ad` tree SHA-1 ile aynıdır. PR #3 on bir dosyayı ve altı takip commit'ini içerdi; PR #2 değişikliklerini yeniden oynatmadı.

Kod ve test dosyalarındaki son değişikliklerden sonra `npm run verify:local` beş aşamada geçti: 96 test dosyasında 1.268 başarılı, 5 Windows koşullu atlama, 0 başarısız; zorunlu benchmark 24.008 ms; sentetik smoke ve sentetik config/Vault verify başarılı. Verify koşusundan sonraki commit'ler dokümantasyon değişiklikleriydi. Takip commit aralığı için Gitleaks taraması altı commit ve yaklaşık 48.64 KB içerik taradı; eşleşme bulmadı. Bu yerel doğrulama hosted CI sonucu değildir; hosted CI kullanıcı kararıyla kabul kapısı değildir.

PR #3 merge edildikten sonra yerel `main`, `origin/main` ile `32c69540a1e1bb99cbc3d4d4094ca7308826f16b` üzerinde eşitlendi. Bu kayıt, Hades identity resource'unun workspace yolunu doğrulama sınırını değiştirmez: `startup_context` veya çalışan commit attestation'ı sağlanmadı. Kullanıcı Sol incelemesini bu hedef için iptal etti; bağımsız inceleme yapılmış sayılmaz. Gemini High `webRead`/`web_research` ayrı canlı kabiliyet olarak hâlâ kabul edilmedi. Native Claude Code abonelik kararı nedeniyle kapsam dışıdır.

Kod ve dokümanlar yerel olarak `46b8034edbf1110a4fa755e07c6cf135b843b144` HEAD'ine kadar iki commit olarak `codex/hades-codex-startup-fix` dalına push edildi. Branch origin ile eşit; çalışma ağacındaki tek değişiklik kullanıcıya ait `.codex/config.toml` mutlak `cwd` satırıdır ve commit kapsamı dışındadır. PR #2'nin squash merge'i daha eski `573de4380f3c63479a4383e2aa0ad73f58ef2e31` commit'idir; bu follow-up branch henüz `main`'e merge edilmemiştir. Bu nedenle canlı Hades workspace bağlantısı ve GPT-OSS araçsız kabul testi geçti; Gemini High web-read capability ve main branch yayın durumu ayrı açık kalır.
