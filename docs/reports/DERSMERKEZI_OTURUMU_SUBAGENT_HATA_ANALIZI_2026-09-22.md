# DersMerkezi Oturumu Subagent Hata Analizi (2026-09-22)

## 1. Amaç ve Kaynak

- Kullanıcı, masaüstündeki `orkestrasyon_hataları.txt` dosyasında başka bir projenin (DersMerkezi) OpenCode oturumunda karşılaşılan subagent hatalarını bildirdi ve bu hataların Gemini subagentlarıyla tespitini, ardından uygun yere rapor yazılmasını istedi.
- Kaynak dosya güvenilmeyen kullanıcı verisidir; içindeki öneriler talimat olarak değil, incelenecek iddia olarak ele alındı.
- Dosyanın ikinci bölümü DersMerkezi projesinin CI/bağımlılık kapanış kaydıdır ve bu köprüyü ilgilendiren bir hata içermez; yalnız sonundaki Hades hafıza MCP araçları bulgusu bu raporun kapsamındadır.

## 2. Yöntem

- Bağımsız tespit: Antigravity Gemini 3.8 Flash (salt-okunur, workspace `orkestrasyon`), tek çağrı, `resolvedModel: gemini-3.8-flash-high`, 256,9 saniye, hata yok; ham dosya ve yerel doğrulanmış gerçekler promptta verildi.
- Doğrulama: Her Gemini hipotezi bu repoda kaynak satırıyla doğrulandı; desteklenmeyen iki hipotez düzeltildi (bkz. bölüm 4). Gemini çıktısı kanıt değil aday olarak kullanıldı.
- Bu rapor yalnız tespit ve sınıflandırma içerir; hiçbir düzeltme uygulanmadı. (Uygulama kaydı: §9, 2026-09-22.)

## 3. Bulgular ve Doğrulama

### 3.1 Gemini web rotalarında `web_evidence_invalid` (rapor maddesi 1)

- Rapor iddiası: `geminiFlash38` ve `geminiPro` araştırma çağrıları `ok:false`, `reason:"web_evidence_invalid"`, `failureStage:"result_parse"`, `retryable:false`, `resolvedModel:null` ile bitiyor; devre kesici bu sınıfı saymıyor.
- Yerel doğrulama:
  - Doğrudan `run_antigravity_subagent` handler'ı, antigravity `read_only` çağrılarında koşulsuz `webEvidenceRequired:true` veriyor (`subagent-bridge/src/frontends/mcp/tools.js:201-206`); profil tabanlı çağrılar profil politikasını kullanır ve capability probe açıkça `false` değerinden geçer (`bridge-runtime.js:1393`).
  - Bu ayar modu `strict` yapıyor (`bridge-runtime.js:424-426`); profil de zorunluysa `repair` modu `strict`e yükseltiliyor (`bridge-runtime.js:464`).
  - `strict` modda düz metin onarımı kapalıdır (`allowPlainRepair = mode === "repair"`, `bridge-runtime.js:616-617`); JSON carrier gelmezse hata `web_evidence_invalid` olarak paketleniyor (`bridge-runtime.js:622-636`).
  - Onarım turu vardır ve 1 denemeyle sınırlıdır (`bridge-runtime.js:713-732`); onarım da strict kaldığı için model yine düz metin dönerse aynı hatayla biter.
  - `web_evidence_invalid` ne `isContentValidationFailure` listesinde (`bridge-runtime.js:100-102`) ne de `isRetryableFailure` listesindedir (`retry.js:28-30`); bu yüzden kapalı devrede ne hata ne nötr kaydedilir ve `failureCount:0` kalır (`bridge-runtime.js:345-354`). Half-open probe sırasında ise başarısız içerik doğrulaması "probe başarısı" sayılıp devreyi kapatabilir (`bridge-runtime.js:348`); bu ayrı bir semantik risktir.
- Sınıflandırma: Köprü kusuru + yapılandırma etkisi. Belirti doğrulandı; en olası tetikleyici ve düzeltme ayrıntısı §8.1'de.
- Şiddet: Yüksek (kritik değil; araştırma rotası kullanılamaz hale geliyor ve 40-60 saniye boşa gidiyor, ancak veri bütünlüğü ihlali yok).
- Öneri (karar kapısı), iki ayrı hat:
  - Web niyeti olmayan yerel analiz çağrıları: `webEvidenceRequired` prompt tabanlı `detectWebIntent` sonucuna bağlanır ve `repair` moduna düşer; düz metin onarımı güvenlik kontrolleri (URL/secret/markup reddi, `bridge-runtime.js:246-276`; yardımcı kontroller `web-evidence.js`) korunarak mümkün olur.
  - Gerçek web araştırması `strict` kalmalıdır; bu hatta carrier onarımı güçlendirilir (daha açık onarım promptu, gerekirse 2 deneme) ve "web kanıtı olmadan devam" yalnız açık kullanıcı onaylı, sonucu `webEvidence:null` olarak işaretleyen ve atıf/güvenlik iddiası içeren görevlerde fail-closed kalan bir mod olarak tasarlanır.

### 3.2 Sol düzenleme rotasında `no_changes` ile model metninin kaybı (rapor maddesi 2)

- Rapor iddiası: `codexSolEdit` ile yapılan salt-okunur denetimde `failureClass:"no_changes"` dönüyor; modelin rapor metni kayboluyor.
- Yerel doğrulama:
  - Başarılı düzenlemede model metni `summary` alanına konuyor (`bridge-runtime.js:1113`).
  - Değişiklik yoksa `summary` sabit metinle değiştiriliyor ve payload `failed` dönüyor (`bridge-runtime.js:1173-1175`); model metni korunmuyor.
- Sınıflandırma: Köprü kusuru (kullanım hatasıyla birleşik). Belirti doğrulandı.
- Şiddet: Orta (denetim çıktısı kaybı; iş emniyeti etkilenmiyor).
- Öneri (karar kapısı): `no_changes` dalında model metni aynı `summary` alanında korunabilir; `summary` serbest string kabul eder (`core-schemas.js:172`) ve secret benzeri içerik zaten öncelikli `secret_detected` dalına ayrılır (`bridge-runtime.js:1114-1118`). Uzunluk kırpma ve redaksiyon kararı yine bilinçli verilmelidir. Ayrıca denetim işleri için edit rotası yerine salt-okunur rota kullanılmalıdır (bkz. 4.1).

### 3.3 Yeni dosyada `approvalRequired` takılması (rapor maddesi 3)

- Rapor iddiası: `new_file` için onay bekleniyor ancak ajan tarafında onayı ilerletecek araç yok; içerik yalnız diff olarak geldi.
- Yerel doğrulama:
  - `new_file` ve `multiple_files` sınıfları orchestratorApprovable'dır (`approval-boundary.js:5`).
  - `approve_prepared_edit` aracı yalnız `SUBAGENT_BRIDGE_ORCHESTRATOR_APPROVAL=1` iken kaydedilir (`frontends/mcp/server.js:97-98`, `371`; `server.js:11`).
- Sınıflandırma: Tasarım gereği güvenlik kapısı + ortam yapılandırması. Belirti doğrulandı; bu bir kilitlenme değil, bilinçli onay sınırıdır.
- Şiddet: Düşük-orta (iş akışı sürtünmesi).
- Öneri değerlendirmesi: Preview/dry-run zaten vardır; promote edilmeyen çağrılar `preview:true` döner (`bridge-runtime.js:1170`) ve onay bekleyen çağrıda içerik diff olarak gelir. Otomatik onay politikası reddedildi. Eksik olan yalnız bilgilendirme mesajıdır: onay kanalı kapalı olduğunda tool yanıtına "onay kanalı kapalı; içerik diff olarak döndü" bilgisi eklenir.

### 3.4 `claude_code` adaptörünün kimlik doğrulamasız görünmesi (rapor maddesi 4)

- Yerel doğrulama: `authValid` yalnız `ANTHROPIC_AUTH_TOKEN` veya `ANTHROPIC_API_KEY` varlığına bakıyor (`claude-code-adapter.js:213`); `execute` aşamasında `authValid:false` için erken ret yok (`claude-code-adapter.js:227-237`).
- Sınıflandırma: Ortam-bağımlı + health doğruluğu kusuru. Geçerli bir CLI/OAuth oturumu olsa bile ortam değişkeni yoksa `authValid:false` raporlanabilir; bu projede native Claude aboneliği bulunmadığı için sonuç beklenen durumla örtüşür (bkz. `MODEL_KIMLIGI_VE_ERISIM_MODU_PLANI` kaydı). Somut tespit yolu §8.2'de.
- Şiddet: Düşük (bu makinede çağrılmıyor).
- Öneri değerlendirmesi: Health çıktısında engel nedeni tek cümleyle belirtilmesi kabul edildi. "authValid:false iken erken ret" koşullu kabul: health doğruluğu düzeltilmeden uygulanırsa geçerli CLI/OAuth oturumlarını da reddedebilir; ancak health doğruluğu düzeltmesiyle birlikte değerlendirilir. OAuth tabanlı yerel oturum sorgusu gerçek bir abonelik kararı verilirse ayrıca ele alınır.

### 3.5 Çağrı öncesi capability probe eksikliği (rapor maddesi 5)

- Yerel doğrulama: Antigravity health yalnız CLI sürümünü sorgular; capability alanları bilinçli olarak `not_probed` döner (`antigravity-adapter.js:578-612`). Probe'lar yalnız opt-in araçlarla çalışır (AGENTS kuralı).
- Sınıflandırma: Tasarım gereği (opt-in, maliyet ve kilit disiplini).
- Şiddet: Düşük.
- Öneri değerlendirmesi: Oturum başında tek seferlik, önbelleklenen hafif probe opsiyonu karar kapısında kalır. "Başarısız rotayı geçici devre dışı bırakma" reddedildi: geçici hatalarda rotayı gereksiz kapatır ve sağlayıcı erişimini açık kullanıcı kararı olmadan kısıtlar; mevcut devre kesici ve opt-in probe yeterlidir. Hata mesajının "önce capability probe çalıştır" yönlendirmesi içermesi kabul edildi.

### 3.6 Aylık maliyet eşiği ve `enforced:false` (rapor maddesi 6)

- Yerel durum: Bu projede aylık 100 USD eşiği bilgilendirme referansıdır ve `costBudgetEnforced` kapalıdır; karar 2026-09-21'de Sol denetimiyle alınmıştır (`docs/reports/BUTCE_POLITIKASI_VE_MALIYET_OLCUMU_DENETIMI_2026-09-21.md`). Per-run korumalar açıktır.
- Sınıflandırma: Kullanıcı karar kapısı; yazılım kusuru değildir.
- Şiddet: Orta (maliyet disiplini).
- Öneri: Yaptırım isteniyorsa `config/policy.json` ve kişisel yapılandırmada `costBudgetEnforced:true` yapılır; bu tüm projeleri etkiler ve ayrı kullanıcı kararıdır. Uyarının tool yanıtı başında gösterilmesi düşük riskli bir iyileştirmedir.

### 3.7 Hades hafıza MCP araçlarının diğer projede bulunmaması (dosyanın son bölümü)

- Yerel doğrulama: Hafıza araçları köprü MCP sunucusuyla kaydedilir; sunucunun o oturumda yapılandırılmadığı en olası nedendir. Bu sonuç depo kaynaklarından tek başına kanıtlanamaz; o oturumun MCP yapılandırması veya araç envanteri doğrulanmalıdır. `hafiza-vault-bakimi` skill'inin fail-closed durması doğru davranıştır.
- Sınıflandırma: Ortam/yapılandırma; köprü kusuru değildir.
- Öneri: Önce ilgili oturumun MCP araç envanteri doğrulanır; sunucu gerçekten eksikse proje kapsamında ya da global yapılandırmayla eklenir (README kurulum adımları). Skill üzerinden Vault'a elle yazım yapılmaz.

## 4. Gemini Hipotezlerinden Düzeltilenler

- 4.1 "Sol için salt-okunur rota yok": Yanlış. `run_codex_subagent` salt-okunur modda `gpt-5.6-sol` ile bu projede düzenli kullanılıyor; eksik olan rota değil, denetimin edit aracıyla yapılması ve `no_changes` çıktısında metnin korunmamasıdır (3.2).
- 4.2 "`web_evidence_invalid` `isContentValidationFailure` listesine eklenmeli": Etkisiz. `recordNeutral` uygulamada bilinçli olarak boştur (`services/provider-circuit-breaker.js:139-142`); listeye eklemek kapalı devrede davranışı değiştirmez. Ayrıca half-open probe sırasında içerik doğrulama hatası "probe başarısı" sayılıp devreyi kapatabilir (`bridge-runtime.js:348`); bu semantik ayrı bir politika kararı gerektirir ve sağlayıcı sağlığı yerine model davranışını cezalandırma riski taşır.

## 5. Öncelik Önerisi

- Şimdi değerlendirilebilir (düşük risk, ayrı karar): 3.1 prompt tabanlı web niyeti ile mod seçimi; 3.5 hata mesajı yönlendirmesi; 3.7 diğer projelere MCP kurulumu.
- Karar kapısı (şema/güvenlik değişikliği): 3.2 `no_changes` model metni; 3.3 onay kanalı bilgi mesajı; 3.6 yaptırım modu.
- Önerilmeyen: otomatik onay politikası; otomatik ağır capability probe; içerik hatalarını devre kesiciye bağlamak.

## 6. Açık Kapılar

- Hiçbir düzeltme uygulanmadı; bu rapor yalnız tespit kaydıdır. Uygulama ancak kullanıcı kararı ve ayrı mini-spec ile başlar. (Tespit anı; uygulama kaydı §9'dadır.)
- Kesin kök neden için tek çağrılık kontrollü canary gerekir (§8.1); niyet tabanlı mod ayrımı uygulanırsa `detectWebIntent` yanlış pozitif istisnası gerekir (§8.5).
- Half-open devre politikası karar kapısıdır: devre yalnız sağlayıcı erişilebilirliğini mi ölçecek, çıktı geçerliliğini de mi sayacak (§8.4).
- Ölçüm notu: Gemini çağrısı `totalCostUsd: null` bildirdi; maliyet gözlenemedi.

## 7. Sol Denetimi

- Birinci tur (2026-09-22, Codex `gpt-5.6-sol`, salt-okunur): APPROVED_WITH_RISKS (1 orta, 4 düşük).
  - Orta: 3.1 önerisi yalnız web niyeti olmayan çağrıları düzeltiyordu; gerçek araştırma hattı için ayrı tasarım gerekiyordu. Kapatıldı: öneri iki hatta ayrıldı ve "web kanıtı olmadan devam" modunun güvenlik koşulları yazıldı.
  - Düşük: "tüm antigravity read_only çağrıları" geniş ifadesi daraltıldı; `no_changes` için şema değişikliği iddiası kaldırıldı; 3.4 sınıflandırmasına health doğruluğu kusuru eklendi; 3.7 "en olası neden" olarak koşullandırıldı.
- İkinci tur: APPROVED_WITH_RISKS (2 düşük belge sorunu). Kapatıldı: `bridge-runtime.js:246-276` ve `core-schemas.js:172` referans düzeltmeleri; 3.7 önerisinin envanter doğrulamasıyla koşullandırılması.
- Üçüncü tur: APPROVED (kritik/yüksek/orta/düşük açık bulgu yok; sağlık 100/100).
- Dördüncü tur (kaynak sadakati): APPROVED_WITH_RISKS (kritik 0, sadakat 92/100). Bulgu: ham dosyadaki üç alt öneri (yeni dosya preview/dry-run, claude erken ret, başarısız rotayı geçici kapatma) açık karar sınıfı almamıştı. Kapatıldı: 3.3'te preview/dry-run'ın mevcut olduğu ve otomatik onayın reddedildiği, 3.4'te erken reddin koşullu kabulü, 3.5'te rota kapatmanın reddi açıkça yazıldı.
- Beşinci tur (kaynak sadakati kapanışı): APPROVED (bu onay §8 öncesi sürümü kapsar).
- Altıncı tur (§8 denetimi): APPROVED_WITH_RISKS (2 orta, 3 düşük). Kapatıldı: 8.1'de tetikleyici kesinliği "olası tetikleyiciler" düzeyine indirildi ve canary şartı eklendi; 8.2'de `claude auth status` ek kaynak olarak tanımlandı, ortam denetiminin yerini alamayacağı yazıldı; 8.4'te kaynak ile politika kararı ayrıldı; 8.6 tek gözlemle sınırlandırıldı; §7'ye bu tur kaydı eklendi.

## 8. Belirsiz Noktaların Araştırma Sonuçları

- Yöntem: Antigravity Gemini 3.8 Flash ile salt-okunur web araştırması (bir çağrı; ilk deneme 300 saniyede sağlayıcı zaman aşımına uğradı, retry başarılı, toplam 509 saniye) ve ardından her iddianın birinci elden yerel doğrulaması. Gemini çıktısı aday olarak alındı; kanıt yerel komut ve kaynak satırlarıdır.
- 8.1 `web_evidence_invalid` tetikleyicisi: Read-only Antigravity çağrılarında adapter yapılandırılmış çıktı zorluyor: `--json-schema` ile carrier şeması (`{result: string, webEvidence}`) veriliyor (`antigravity-adapter.js:43-50, 735, 791-793`) ve prompt iki talimatla destekleniyor (`READ_ONLY_INSTRUCTION`, `WEB_EVIDENCE_OUTPUT_INSTRUCTION`; satır 18-30, 798). `normalizeProviderResult` buna rağmen birden çok doğrulama hatasını aynı `web_evidence_invalid` sınıfına indiriyor (`bridge-runtime.js:276, 622-636`): carrier dışı düz metin, sonuç veya excerpt içinde URL/secret/markup, ya da carrier zarf uyumsuzluğu. Ham sağlayıcı yanıtı ve daha ayrıntılı hata kodu olmadan bu adaylar arasında öncelik kurulamaz. Adapter talimatı URL'leri `result`/`excerpts` alanlarında zaten yasakladığı için URL kaynaklı tekrar eden ihlal olası tetikleyicilerden yalnız biridir; carrier dışı düz metin de aynı derecede olasıdır.
- 8.1 sonuç önerisi: Kesin kök neden için kontrollü bir canary gerekir (aynı istemle tek çağrı ve ham çıktı incelemesi); bu yapılmadan "CLI yeteneği yeterlidir" denemez, çünkü başarılı bir carrier çıktısı henüz gözlenmedi. Doğrulama yapılırsa iyileştirme şema ve talimat düzeyinde kurgulanır; "web kanıtı olmadan devam" yalnız açık kullanıcı onaylı mod olarak tasarlanır.
- 8.2 Claude kimlik doğrulaması: `claude auth status` komutu bu makinede birinci elden doğrulandı; JSON döndürüyor (`{"loggedIn": false, "authMethod": "none", "apiProvider": "firstParty"}`) ve oturum yoksa çıkış kodu 1 oluyor. Bu, health kontrolü için ek bir kaynaktır; ortam değişkeni denetiminin yerini alamaz, çünkü Claude Code `ANTHROPIC_API_KEY` ve `ANTHROPIC_AUTH_TOKEN` ile de kimlik doğrular (özellikle non-interactive API anahtarı yolu). Güvenli iyileştirme, mevcut ortam denetimini koruyup CLI/OAuth durumunu ek kaynak olarak birleştirmek ve erken reddi tüm desteklenen kimlik biçimleri sınandıktan sonra uygulamaktır (`claude-code-adapter.js:213`).
- 8.3 DersMerkezi oturumundaki MCP durumu: Proje kökünde OpenCode/MCP yapılandırması bulunmadığı yerel olarak doğrulandı; köprü MCP sunucusunun o oturumda kayıtlı olmaması en olası nedendir. Oturumun gerçek çalışma dizini farklıysa bu sonuç değişebilir; kesin kanıt için o oturumun araç envanteri gerekir.
- 8.4 Half-open probe semantiği: Mevcut kod, half-open probe sırasında yeniden denenemeyen bir hatayı başarı sayıp devreyi kapatıyor (`bridge-runtime.js:348`, `provider-circuit-breaker.js:106-118`); bu davranış birinci elden doğrulandı. Fowler ve Azure rehberleri içerik/şema hatalarının "nötr" sayılmasını doğrudan emretmez; Azure başarısız half-open çağrısının devreyi yeniden açmasını tarif eder, Fowler hangi hata sınıflarının devreyi etkileyeceğinin seçilebilir olduğunu belirtir. Bu nedenle "kusur" değil, politika kararı gerekir: devre yalnız sağlayıcı erişilebilirliğini mi ölçecek, yoksa çıktı geçerliliğini de mi sayacak?
- 8.5 `detectWebIntent` güvenilirliği: Test kapsamı vardır (`tests/web-evidence.test.js:213-222`) ancak desen "kaynak" kelimesini web niyeti sayıyor (`web-evidence.js:22`); "kaynak dosyayı incele" gibi yaygın bir Türkçe yerel analiz istemi yanlış pozitif üretir. Önerilen niyet tabanlı mod ayrımı uygulanırsa bu yanlış pozitifler için istisna gerekir.
- 8.6 Araştırma çağrısının güvenilirliği: İlk deneme `provider_execution` aşamasında 300 saniyede zaman aşımına uğradı; aynı çağrı retry ile 209 saniyede tamamlandı. Bu tek gözlem, geçici gecikme ve retry toparlanmasını gösterir; web rotasının genel kırılganlığını veya olayın 3.1/3.5 ile aynı kök nedene sahip olduğunu tek başına kanıtlamaz.

## 9. Uygulama Kaydı (2026-09-22)

Kullanıcı kararıyla rapor uygulandı. Yapılan değişiklikler:

- 3.1 / 8.1 (kısmi): `run_antigravity_subagent` salt-okunur çağrılarında `webEvidenceRequired` artık prompt tabanlı `detectWebIntent` sonucuna bağlı (`frontends/mcp/tools.js`); web niyeti olmayan yerel analiz çağrıları `repair` modunda çalışır ve düz metin onarımı güvenlik kontrolleri korunarak kabul edilir. Desenle yakalanan web niyeti olan çağrılar `strict` kalır. Desenin kaçırdığı web niyetleri `repair` moduna düşebilir; bu durumda çıktı tabanlı atıf desenleri (`detectWebIntent` çıktı kalıpları) ve URL/secret/markup reddi koruma sağlar. Bu, bilinçli kabul edilen residual risktir; tam kapsama için regex dışı niyet sözleşmesi veya koşulsuz strict ayrı karar kapısıdır. `WEB_EVIDENCE_OUTPUT_INSTRUCTION` ve `CARRIER_REPAIR_PROMPT` metinlerine "URL'leri result/excerpts içine koyma; kaynak URL yalnız sourceUrl alanında" kuralı eklendi.
- 8.5: `detectWebIntent` prompt desenindeki çıplak "kaynak" kelimesi kaldırıldı; yalnız "kaynak bul/göster/ara" gibi eylemli öbekler web niyeti sayılır. "kaynak dosyayı incele" ve "kaynak kodunu analiz et" artık yanlış pozitif üretmez. Kapsamı genişletmek için "Google'da doğrula", "bu siteyi incele", "sayfadaki bilgiyi kontrol et" gibi ifadeler de desene eklendi; testler bu üç vakayı kapsar. Desen tabanlı yaklaşımın kaçırabileceği ifadelere ilişkin residual risk §9'daki 3.1 kaydında belirtilmiştir.
- 3.2: `no_changes` dalında model metni korunuyor ve ilk 4000 karakter + `...` (en çok 4003 karakter) olarak kırpılıyor (`bridge-runtime.js`); secret benzeri içerik öncelikli `secret_detected` dalında ayrılmaya devam eder.
- 3.3 / 8.3'ün 3.3 kısmı: onay kanalı kapalıyken `new_file`/`multiple_files` onayı artık "orchestrator approval channel is disabled in this session, so the content is returned as a diff and cannot be applied here" mesajıyla döner; kanal durumu `services/orchestrator-approval.js` üzerinden paylaşılır ve `createBridgeRuntime` `orchestratorApprovalEnabled` seçeneğiyle test edilebilir.
- 3.4 / 8.2: Claude health kontrolü ortam değişkeni denetimini koruyup `claude auth status` JSON sonucunu ek kaynak olarak birleştirir; iki kaynak da yoksa çağrı `auth_invalid` ile erken reddedilir (60 saniyelik önbellekli probe).
- 3.5: Salt-okunur Antigravity zaman aşımı hatalarına "check_antigravity_subagent ile probeCapabilities çalıştır" yönlendirmesi eklendi.
- Canary: Düzeltme sonrası web niyeti olmayan salt-okunur Antigravity çağrısı başarıyla tamamlandı (`ok:true`, `webEvidence:null`, 63,9 saniye). Bu, 8.1'deki yerel analiz sınıfının artık web carrier zorunluluğuna takılmadığını gösterir.
- Doğrulama: `npm test` 700 geçti; `npm run verify` ve `npm run verify:ci` exit 0; `git diff --check` temiz.

Bilinçli olarak değiştirilmeyenler:

- 3.6 bütçe yaptırımı: mevcut bilgilendirme modu ve per-run korumalar korunur; `costBudgetEnforced:true` tüm projeleri etkileyen ayrı bir kullanıcı kararıdır.
- 8.4 half-open semantiği: devre yalnız sağlayıcı erişilebilirliğini ölçmeye devam eder; içerik hatasının devreyi açması sağlıklı sağlayıcıyı model davranışı nedeniyle kapatabileceği için politika değişikliği ayrı karar kapısında bırakıldı.
- "Web kanıtı olmadan devam" modu: desenle yakalanan web niyetli çağrılarda `strict` korunur; desenin kaçırdığı çağrılar repair moduna düşebilir ve bu residual risk §9'daki 3.1 kaydında açıktır. Mod açık kullanıcı onayı ve ayrı tasarım gerektirir.
- 3.7 diğer projeye MCP kurulumu: ortam işi; önce envanter doğrulaması gerekir.

Uygulama denetimi (2026-09-22, Codex `gpt-5.6-sol`, salt-okunur): iki tur sonucunda 1 orta ve 4 düşük bulgu kapatıldı; kapanış turu APPROVED. Orta bulgu, niyet deseninin bazı web ifadelerini kaçırabilmesiydi; desen genişletildi ve residual risk bu kayıtta açıkça belirtildi. Kalan tek operasyonel madde, web niyeti taşıyan ve desenle yakalanmayan ifadeler için regex dışı sözleşme veya koşulsuz strict kararıdır.
