# Space Bunny Free OpenCode Subagent Planı

> Güncel durum notu (2026-10-13): Kullanıcının açık isteğiyle Bridge `opencode run` üzerinden yapılan gerçek üretim denemesi OpenCode tarafından HTTP 403 `FreeTierError` ile reddedildi; response, o çağrının kullandığı Free Tier erişim yolunun OpenCode içinde kullanımını istedi. Bu yanıt yerel OpenCode CLI session export'undan, ham metni rapora/loglara kopyalamadan doğrulandı. Önceki 2026-09-30 Space Bunny canary'si bu hatadan önce çalışmıştı. OpenCode Console PR [#53963](https://github.com/anomalyco/opencode/pull/53963), 2026-10-08'de `space-bunny-free` keyless isteklerini legacy Zen proxy'den new inference'a taşımış; önceki [#53959](https://github.com/anomalyco/opencode/pull/53959) bu modeli yüksek trafik nedeniyle legacy path'te tutuyordu. [#53967](https://github.com/anomalyco/opencode/pull/53967) sonrasında model allowlist'i `allowAnonymous` metadata'sına bağlandı. Bu tarih/sıra, başarılı eski canary ile yeni 403'ü OpenCode servis tarafındaki keyless route/free-tier enforcement değişikliğiyle açıklayan güçlü kanıttır; ancak exact 403 metni ve bu hesabın eligibility'si nedeniyle tek başına kesin kök neden ispatı değildir. Resmî OpenCode CLI belgesi `opencode run`'ı automation için destekliyor; Console ve Go belgeleri API key'li dış coding-agent kullanımını anlatıyor. Yerel `opencode auth list` görünümünde Console/Go credential'ı bulunmaması ek bir hesap/credential farkıdır, fakat keyless route göçü dikkate alındığında tek başına hata açıklaması sayılamaz. Bridge adapter yalnız yapılandırılmış HTTP 403 + `FreeTierError` yanıtını non-retryable `permission_denied` olarak sınıflandırır; kısıt aşılmaz.

> Durum notu (2026-09-30): Tasarım belirsizlikleri giderildi; statik entegrasyon ve web-only researcher yolu uygulandı. Canonical model/allowlist, sıfır-fiyat preflight, Bridge-owned inline agent izinleri, MCP check/run/edit-pilot araçları, `webResearch:true` araştırmacı modu ve Space Bunny edit approval class eklendi. OpenCode restart sonrası katalog kontrolü aktif/sıfır fiyatlı modeli gösterdi; OS-temp web-only araştırması ve Git worktree dışında sentetik read-only canary gerçek modelle çalıştı. İzole canary'de sentetik okuma başarılı, write aracı sunulmadı, dış dizin okuması izin katmanında durdu ve fixture hash'leri değişmedi. İlk repository-nested canary Git root'a genişledi ve kardeş sentetik marker'ı okuyabildiği için geçersiz sayıldı; fixture temizlenip canary dış temp kökte tekrarlandı. `npm test`, `npm run verify`, `npm run verify:ci`, `npm run smoke`, `npm run drill` geçti. Edit pilotu ayrı açık onay bekliyor. Ücretsiz erişim sınırlı süreli ve sağlayıcı anonim olduğundan gelecekteki ücret ve bağımsız gizlilik güvencesi doğrulanamaz. Son metin için yeni Sol denetimi yapılmadı.

## Hedef ve kapsam

OpenCode kataloğunda bulunan Space Bunny Free modelini Orkestrasyon Bridge üzerinden iki ayrı ve açıkça sınırlandırılmış kullanım yolunda sunmak:

- Salt-okunur subagent: canonical model kimliği `opencode/space-bunny-free`.
- Seçilmiş dosyalarda kontrollü edit subagent: implementer rolü, seçilmiş hedef dosyalar, kabul ölçütleri ve explicit host onayıyla sınırlı.

Canonical provider/model kimliği `opencode/space-bunny-free`, Bridge içi tek alias ise `space_bunny_free` olmalıdır. OpenRouter kimliği `stealth/space-bunny-alpha` bu modelle eşitlenmemelidir.

Bu belge entegrasyon planı ve uygulama durum kaydıdır. Statik araçlar eklendi; live edit pilotu henüz çalıştırılmadı ve her promotion açık onay bekliyor.

## Hedef dışı

- Space Bunny Free'yi varsayılan model, görev profili varsayılanı veya otomatik fallback yapmak.
- Genel `run_opencode_subagent` aracını edit moduna genişletmek.
- Serbest model adı, wildcard allowlist veya kullanıcı tarafından değiştirilebilir model eşleme listesi açmak.
- Space Bunny'nin GPT-6 Luna ile eşdeğer olduğunu ilan etmek.
- Anonim modelin üreticisini, ağırlıklarını veya benzer isimli başka provider modelini varsaymak.
- Secret, Vault, kişisel veri veya hassas özel depo içeriğini ilk pilotlarda modele göndermek.
- Ücretsiz dönem biterse ücretli kullanımı otomatik sürdürmek.
- Edit pilotu çıktısını review ve kullanıcı onayı olmadan kaynak workspace'e terfi ettirmek.

## Araştırma bulguları

### Model kimliği ve kataloğu

Ana orkestratörün 2026-09-28 tarihinde çalıştırdığı `opencode models opencode --verbose --refresh` komutu yerel OpenCode kataloğunu yeniledi. Çıktıda:

- Tam kimlik: `opencode/space-bunny-free`.
- Görünen ad: `Space Bunny Free`.
- Provider: `opencode`; status: `active`; release date: `2026-09-23`.
- Katalog fiyatı: input, output ve cache alanlarında sıfır.
- Context: 1.048.576; input ve output limitleri ayrı ayrı 524.288.
- Reasoning ve tool-call: destekleniyor.
- Image ve video input: metadata'da destekleniyor; audio ve PDF input desteklenmiyor.
- Temperature: desteklenmiyor.

Bu sonuç yerel CLI kataloğundaki metadata'yı doğrular. Tek başına auth, canlı endpoint erişimi, gerçek modality davranışı, ücretsiz erişimin süreceği veya model kalitesi hakkında kanıt değildir. OpenCode Models dokümanı canonical kimlik biçimini `provider_id/model_id` olarak açıklar.

### Anonim sağlayıcı, gizlilik ve geçici fiyat

OpenCode Zen Space Bunny Free'yi “stealth” model olarak tanımlar ve ücretsiz erişimin sınırlı süreli olduğunu bildirir. Resmi belge, provider'ın zero-retention ve no-training politikası izlediğini söyler. Bu, OpenCode'un yayımladığı sağlayıcı beyanıdır; anonim alt sağlayıcının gerçek uygulaması bağımsız denetlenmiş değildir. OpenCode PR geçmişinde ZDR metadata'sı önce geçici olarak kaldırılmış, sonra geri yüklenmiştir; güncel resmi belge ZDR beyanı içerir.

OpenCode'un 2026-09-23 tarihli duyurusu Space Bunny'yi bir hafta ücretsiz, 1M context, multimodal ve ZDR olarak tanıtır. Bu yaklaşık 2026-09-30'a denk gelir; kesin bitiş saati ve pencere sonrası fiyat doğrulanmadı. 2026-09-28 tarihli yerel katalog yenilemesinde model hâlâ `active` ve sıfır fiyatlıydı. Bu zaman-duyarlı bulgu daha sonraki kullanım için garanti değildir.

OpenCode Zen belgesi, bakiye belirli eşiğin altına düştüğünde otomatik yeniden yükleme seçeneğini; OpenCode Providers belgesi ise session title üretiminde Zen'de barındırılan `gpt-5-nano` benzeri düşük maliyetli yardımcı model kullanılabildiğini açıklar. Dolayısıyla Space Bunny'nin kendi katalog fiyatının sıfır görünmesi tek başına tüm CLI işleminin sıfır maliyetli olduğunu kanıtlamaz.

## Belirsizlikleri daraltan 2026-09-30 bulguları

- `opencode models --help` `--refresh` bayrağının modeli models.dev kaynağından yenilediğini belirtir. `opencode models opencode --verbose --refresh` aynı gün çalıştırıldığında `opencode/space-bunny-free` `active`, input/output/cache fiyatları sıfır ve tool-call destekli döndü. Komut JSON metadata'yı metinsel provider/model başlıklarıyla birlikte sunar ve ayrı bir `--json` biçimi göstermez; implementasyonda parser tam JSON metadata nesnesini ayıklayıp doğrulamalı, beklenmeyen CLI çıktısını fail-closed reddetmelidir. Bu, güncel katalog kanıtıdır; Zen hesabı, endpoint erişimi veya faturalandırma taahhüdü değildir.
- Güncel resmi [OpenCode Zen fiyatlandırması](https://opencode.ai/docs/zen/) Space Bunny Free için input, output ve cached-read fiyatlarını Free olarak listeliyor ve erişimin sınırlı süreli olduğunu söylüyor. Bitiş zamanı yayımlanmamış. Dolayısıyla şu anki fiyat doğrulandı; gelecekte ücretsiz kalacağı doğrulanamaz.
- Resmi [OpenCode Providers](https://opencode.ai/docs/providers/) ve [Config](https://opencode.ai/docs/config/) belgeleri session title üretiminde `small_model` kullanıldığını, varsayılanın daha ucuz bir model olabildiğini ve `OPENCODE_CONFIG_CONTENT` inline ayarının standart kullanıcı/workspace config katmanlarından sonra yüklendiğini doğruluyor. Space Bunny çağrısında Bridge, çağrıya özel inline config içinde hem `small_model: opencode/space-bunny-free` hem de agent tanımlarını kendisi verir; child process'e ayrıca `OPENCODE_DISABLE_PROJECT_CONFIG=1` koyarak workspace `opencode.json` config'ini yükletmez. Inherited `OPENCODE_CONFIG_CONTENT` kabul edilmez; mevcut environment filtresi korunur ve yalnız Bridge'in ürettiği sabit JSON child process'e eklenir. Global kullanıcı ayarı değiştirilmez. OS-managed OpenCode ayarları daha yüksek önceliğe sahip olabileceğinden etkin permission birleşimi yine denetlenir; istenen deny izinleri uygulanmıyorsa route açılmaz.
- Resmi [OpenCode Agents](https://opencode.ai/docs/agents/) belgesi agent-specific permission desteğini ve `read`, `glob`, `grep`, `list`, `edit`, `bash`, `task`, `external_directory` permission adlarını doğruluyor. Bridge bir worker CLI sürecini doğrudan başlattığından bu ajanlar OpenCode içinde `mode: primary` olmalı; subagent orkestrasyonu Bridge katmanında kalır. Salt-okunur agent için varsayılan deny ve yalnız gerekli okuma araçlarına allow; edit agent için aynı deny tabanı, yalnız okuma ile edit/write izinleri uygulanır. `bash`, `task` ve `external_directory` iki modda da deny kalır.
- Katalog checker auth doğrulamaz. 2026-09-30 sentetik canary gerçek model erişimini doğruladı; canlı yanıtta marker okundu, write aracı yoktu, dış dizin okuması izin katmanında durdu ve workspace hash'leri değişmedi. Rate limit davranışı bu tek çağrıda ölçülmedi.

### Uygulama sözleşmesi olarak sabitlenen seçimler

- Runtime fiyat preflight'ı her Space Bunny provider çağrısından önce exact model ID ve yenilenmiş katalogdaki input/output/cache fiyatlarının tamamının sıfır olduğunu doğrular; yenileme başarısız, metadata eksik/eski/bozuk veya herhangi bir fiyat nonzero ise `opencode run` başlamaz. `--refresh` çıktısı models.dev katalog kanıtı olarak etiketlenir, Zen hesabı fatura garantisi diye sunulmaz.
- Başlık gibi yardımcı model çağrısı da aynı Space Bunny modeline sabitlenir; `gpt-5-nano` veya başka ücretli yardımcı modele sessiz fallback yapılmaz. Canary trace'i başka model/provider çağrısı gösterirse route kapalı kalır.
- Read-only ve edit agent tanımları istek başına Bridge tarafından üretilen inline config'te yer alır. Kullanıcının global OpenCode dosyası değiştirilmez; repository/workspace içinden gelen config'in izinleri gevşetmesine güvenilmez.
- Her Space Bunny kaynak workspace terfisi için dışarıya `approvalClass=space_bunny_edit` verilir; registry aynı kayıtta `sourceApprovalClass` ve exact `resolvedModel=opencode/space-bunny-free` saklar. Bu sınıfı yalnız dedicated Space Bunny route'u üretebilir. Yalnız kaynak sınıf `low_impact`, `new_file` veya `multiple_files` ise istek hazırlanabilir; `policy_config`, `external_service` ve `irreversible` reddedilir. Approval handler model/route/sınıf bağlarını registry içindeki immutable istekten doğrular ve provider'ı tekrar çalıştırmaz. Public input bu alanları seçemez.
- Prepared approval kanalı kapalıysa edit diff'i yalnız preview olarak döner; kaynak workspace'e hiçbir şekilde uygulanmaz. Live edit pilotu ve normal promotion birbirinden ayrı opt-in kapılarıdır.
- `webResearch: true` yalnız `role=researcher`, `mode=read_only` ile kullanılabilir. Bridge boş bir OS-temp çalışma alanı yaratır; bu route'un inline agent'ı yalnız `websearch` ve `webfetch` araçlarına izin verir, tüm yerel okuma/yazma, shell, delegation ve dış-dizin araçlarını reddeder. Çağrı bittiğinde geçici dizin silinir.

## 2026-09-30 Space Bunny web araştırması

Space Bunny'ye tek bir opt-in web araştırması yaptırıldı; ana orkestratörün kontrol ettiği resmi kaynaklar aşağıdaki noktaları destekliyor:

- OpenCode Zen/Console katalog ve fiyat sayfası `space-bunny-free` kimliğini, `opencode/space-bunny-free` yapılandırma adını ve input/output/cached-read için Free fiyatını listeliyor. Erişim "limited time" olarak belirtilmiş; kesin bitiş zamanı yok.
- OpenCode Go sayfası ayrıca Space Bunny Free'yi Go ve Go Plus listesinde limited-time/unlimited kullanım olarak gösteriyor. Go aboneliği ayrıca aylık $10, Go Plus $40; bu abonelik fiyatını Zen/Console'daki model başına $0 fiyatıyla karıştırmamak gerekir.
- Zen/Console metni sağlayıcıyı "stealth model" diye tanımlıyor; Go sayfası "anonymous model" diyor. Alt sağlayıcı ve gerçek ağırlık/model kimliği açıklanmıyor. Katalogdaki `owned_by: opencode` gateway operatörünü gösterir; üreticiyi açıklamaz.
- OpenCode Zen kaynağı sağlayıcı için zero-retention ve no-training beyanı veriyor. Go privacy tablosu Space Bunny Free için `Not used` / `0 days` gösteriyor. Bunlar OpenCode'un yayınladığı sağlayıcı beyanlarıdır, bağımsız denetim sonucu değildir.
- Canlı Go model endpoint'i `space-bunny-free` kimliğini listeliyor; OpenCode Zen endpoint'i de modeli listeliyor. Yerel yenilenmiş models.dev metadata'sı aktif durumu, sıfır fiyatı, tool-call desteğini, 1,048,576 context'i ve 524,288 output limitini gösterdi. Bu metadata auth veya erişim taahhüdü değildir.
- Resmi X duyurusu 2026-09-23'te "free for the next week" der; bu, bugüne denk gelen yaklaşık bir süre verir, kesin bitiş saati vermez. Buna karşın 2026-09-30'da resmi fiyat sayfası ve modeller endpoint'leri modeli hâlâ free olarak gösteriyordu.
- Zen ve Go model API'lerindeki `created` alanları model listesi genelinde aynı toplu zaman damgasını taşıyor; modelin gerçek yayın tarihi olarak yorumlanmamalıdır.

Kaynaklar: `https://opencode.ai/docs/zen/`, `https://opencode.ai/v2/docs/console/go`, `https://opencode.ai/zen/v1/models`, `https://opencode.ai/zen/go/v1/models`, `https://x.com/opencode/status/2102767716666941864`, erişim tarihi 2026-09-30.

### GPT-6 Luna kıyası

AI Coding Daily'nin 2026-09-28 tarihli leaderboard'ında Space Bunny Max, OpenCode harness'iyle 60 üzerinden 52,61; GPT-6 Luna Max ise Codex CLI harness'iyle 51,99 puan almıştır. Aynı tabloda GPT-6 Luna Xhigh 49,94, High 47,73 ve Medium 40,20 puandır. Space Bunny Max ile Luna Max arasındaki 0,62/60 fark, bu leaderboard içindeki yapılandırmaların yakın olduğunu düşündürür.

Kaynağın kendi metodolojisi skorun yalnızca modeli değil, **model+harness yapılandırmasını** ölçtüğünü belirtir. Space Bunny OpenCode ile, GPT-6 Luna Codex CLI ile test edilmiştir. Bu nedenle sonuç model eşdeğerliği, aynı görevlerde aynı davranış veya Orkestrasyon Bridge kalitesi için garanti sayılamaz. Space Bunny Max varyantı da Space Bunny Free'nin bütün reasoning ayarlarıyla özdeş bir değerlendirme değildir.

88 programatik madde ve 176 çalıştırma kullanan ayrı bir public Space Bunny benchmark deposu audit sonrası yüzde 92,5 sonuç bildirmiştir. Depo frontier modellerini aynı testte çalıştıramadığını ve belirli bir modelle eşleştirme yapamadığını açıkça belirtir; GPT-6 Luna karşılaştırması sağlamaz.

Space Bunny'nin alt sağlayıcısı ve temel ağırlıkları resmi kaynaklarda açıklanmamıştır. MiniMax dâhil topluluk tahminleri doğrulanmış model kimliği değildir.

## Yerel mimari ve önerilen karar

Aşağıdaki yerel kaynak bulguları ana orkestratör tarafından doğrudan repository okuması ve OpenCode CLI kataloğuyla doğrulanmıştır:

- `config/agents.json` ve kişisel Bridge `agents.json`: OpenCode exact `allowedModels` allowlist'i canonical Space Bunny ID'sini içerir; varsayılan mod `read_only` kalır.
- `subagent-bridge/src/adapters/opencode-adapter.js:6-33`: alias çözümlemesi ve allowlist fail-closed kontrolü bulunur. `:106-133` read-only ve edit için agent seçimini yapar.
- `subagent-bridge/src/frontends/mcp/tools.js:61-66, 218-220`: genel `run_opencode_subagent` aracı strict şemalıdır ve yalnız read-only mod sunar. Bu aracı edit'e genişletmek doğru değildir.
- `subagent-bridge/src/frontends/mcp/tools.js:128-139, 195-197, 296-306` ve `subagent-bridge/src/frontends/mcp/server.js:266-281`: Kimi/Qwen katalog deseni strict taskId, role, model, mode, selected files ve acceptance criteria kullanır. Edit için implementer rolü ve hedef dosyası zorunludur.
- `subagent-bridge/src/catalog-provider.js:3-26, 33-73`: model eşleme ve OpenCode kataloğunda exact ID arama örneğidir.
- `subagent-bridge/src/runtime/bridge-runtime.js:1001-1049`: katalog kontrolü sonrası read-only veya controlled edit yoluna yönlendirir. `:1052-1058, 1242-1245`: edit caller ve prompt seçimini içerir. Space Bunny yolu DeepSeek'e özel prompt kullanmamalı; tarafsız katalog edit prompt'u seçmelidir.
- `subagent-bridge/src/config.js:71-104, 377-401`: strict runtime policy şeması ve OpenCode allowed-model kontrollerini içerir.
- `subagent-bridge/src/metrics.js:269-287`: model adını ham saklamak yerine resolved model hash'i kaydeder. Metrik backend'i mevcut `opencode` olarak korumak yeni bir backend enum'u açmaktan daha dardır.
- İlgili test desenleri: `tests/faz-3-opencode.test.js`, `tests/catalog-provider.test.js`, `tests/mcp-tool-negative.test.js`, `tests/deepseek-edit-pilot.test.js`.

### Önerilen entegrasyon sınırları

1. Tek alias `space_bunny_free` kod içinde tek canonical ID'ye sabitlensin. MCP model alanı tek elemanlı literal/enum olsun; serbest model map'i veya wildcard kabul edilmesin.
2. Exact canonical ID OpenCode `allowedModels` listesine eklensin. Runtime policy'de exact modele bağlı Space Bunny fiyat/agent ayarı kullanılsın; şema model ID'sinin başka değere çevrilmesini reddetsin. Kişisel OpenCode config dosyaları değiştirilmesin; çağrıya özel izin/model ayarını yalnız Bridge child process'e sabit inline config olarak versin.
3. `check_space_bunny_subagent` yalnız exact modelin OpenCode kataloğundaki durumunu ve doğrulanabilir fiyat metadata'sını raporlasın. Katalogda görünme veya CLI'nin kurulu olması auth/model erişimi anlamına gelmesin; doğrulanmamış `authValid` null kalsın.
4. Dedicated `run_space_bunny_subagent` strict `read_only`/`edit` modları sunar. `webResearch:true` yalnız `role=researcher`, `mode=read_only` için kabul edilir ve boş OS-temp çalışma alanında yalnız `websearch`/`webfetch` araçlarını açar. Genel OpenCode aracı read-only kalır.
5. Exact model çözümlendikten sonra **ortak `OpenCodeAdapter.execute` fiyat kapısı** çalışmalıdır. Bu kapı generic run, özel araç, profil, edit ve pilot dâhil bütün `opencode run` yollarını korumalıdır.
6. Read-only modda, hangi public araç veya profile yolundan gelirse gelsin, resolved model Space Bunny ise özel `space-bunny-readonly` agent seçilmelidir. Built-in `plan` agent'ın varsayılan `ask` izinleri yeterli güvence sayılmamalıdır.
7. Bridge-owned `space-bunny-readonly` agent inline config'i varsayılan deny ile `read`, `glob`, `grep`, `list` dışındaki tüm araçları, özellikle `edit`, `bash`, `task` ve `external_directory` izinlerini deny etmelidir. Bu config kullanıcıdan veya workspace'ten alınmamalıdır.
8. Salt-okunur güvence, yalnız prompt veya source hash kontrolü değildir. Etkin izin birleşimi incelenmeli; sentetik ve izole trusted workspace canary'sinde yazma ve dış dizin denemeleri reddedilmeli, kaynak/workspace hash'leri aynı kalmalıdır. Bu kanıt yoksa read-only model çağrısı açılmamalıdır.
9. Edit yalnız implementer rolü, seçili dosyalar, acceptance criteria ve Space Bunny edit agent'ıyla çalışmalıdır. Mevcut `executeControlledEdit` ve tarafsız catalog edit prompt'u kullanılmalı; DeepSeek'e özel prompt bu yola girmemelidir.
10. Her gerçek Space Bunny source promotion'ı, düşük etkili tek dosya değişikliği dâhil, `prepared_edit` ve açık `approve_prepared_edit` onayı gerektirmelidir. Route-içi `forceExplicitApproval` public girdiden değiştirilememelidir. Mevcut controlled-edit sonucu `low_impact` için approval-required request'i reddettiğinden, ilgili sonuç şeması ve approval handler'ı bu Space Bunny-only prepared akışını destekleyecek şekilde güncellenmelidir.
11. `approvalClassValues` içine Bridge-owned `space_bunny_edit` sınıfı eklenmeli; bu sınıfı yalnız exact `opencode/space-bunny-free` route'u, public input'tan etkilenemeyen model-specific approval requirement ile üretebilmelidir. Registry'de `approvalClass=space_bunny_edit` ve özgün `sourceApprovalClass` ayrı saklanmalıdır. Yalnız özgün sınıf `low_impact`, `new_file` veya `multiple_files` ise `space_bunny_edit` için sealed prepared request oluşturulup `approve_prepared_edit` ile onaylanabilir. `policy_config`, `external_service` ve `irreversible` özgün sınıfları Space Bunny sınıfına dönüştürülemez; mevcut non-approvable/ret davranışını korur.
12. Sonuç şeması `approvalClass=space_bunny_edit` ve `approvalRequired=true` pending sonucunu kabul etmeli; request ID'yi yalnız Space Bunny binding'i ile ve izin verilen `sourceApprovalClass` değerleri için kabul etmelidir. Approval handler registry'deki exact resolved model, route, workspace/source hash, selected paths, change-set hash, özgün sınıf ve Space Bunny approval class bağlarını doğrulamalıdır. Public `riskSignals`, prompt veya çağıran model bu alanları değiştiremez. Diğer provider'ların `low_impact` davranışı değişmemelidir.
13. Edit pilotu ayrı, disposable ve `promote:false` olmalıdır. Pilot `applied:false`, temizleme başarılı ve kaynak hash'i değişmemiş sonucu üretmeden üretim edit yolu açılmamalıdır.
14. Metrik backend'i `opencode` kalmalı, model kimliği mevcut modelHash ile ayrıştırılmalıdır. Raw model, prompt veya çıktı metni loglanmamalıdır.

## Fiyat ve yardımcı çağrı güvenlik kapıları

Köprü bütçe görünümü 2026-09-28'de aylık limit $100, tahmini harcama yaklaşık $186,57, enforcement kapalı olarak raporlamıştır. 1109 run içinden 84'ünün maliyeti biliniyor, 1025'inin bilinmiyor; kapsama yaklaşık yüzde 7,57'dir. Bu eksik anlık telemetri faturayı göstermez, ancak ücretli pilot için güvenilir bütçe kanıtı da değildir.

Space Bunny Free için ortak preflight:

- Exact resolved ID eşleşmesi provider çağrısından önce yapılır.
- Exact model girdisinin yenilenmiş OpenCode CLI kataloğundaki input/output/cache fiyat metadata'sı makinece güvenilir biçimde okunur ve freshness sınırı uygulanır.
- Model kataloğu güncellenemezse, exact ID bulunmazsa, fiyat alanı eksik/ayrıştırılamazsa veya herhangi bir fiyat sıfır değilse her route fail-closed durur; `opencode run` başlatılmaz.
- Fiyatı tahmin etmek, eski cache'e güvenmek veya genel `costBudgetEnforced: false` değerini onay saymak yasaktır.
- Bu plan ücretli override tanımlamaz. Space Bunny ücretli hale gelirse kullanım kapalı kalır; yeni açık kullanıcı kararı ve ayrı plan gerekir.

OpenCode Providers belgesi session title için `small_model` kullanabildiğini ve varsayılan seçimin daha ucuz bir Zen modeline düşebileceğini açıklar. Space Bunny'nin katalog fiyatı sıfır olsa bile farklı yardımcı model çağrısı beklenmeyen ücret doğurabilir. Bridge çağrıya özel config'te `small_model` değerini aynı exact Space Bunny modeline sabitlemelidir; bu ayar uygulanamıyor veya canary trace'inde başka provider/model görülüyorsa route kapalı kalır. Bu plan `summary` için ayrı yardımcı provider çağrısı olduğunu varsaymaz.

## Kabul kriterleri ve doğrulama

- Exact canonical ID tüm alias, allowlist, checker, MCP araçları ve `resolvedModel` sonucunda aynıdır. Başka model kimliği veya wildcard reddedilir.
- Ortak fiyat kapısı exact Space Bunny ID'si için generic run, dedicated tool, profile, controlled edit ve pilot dâhil tüm çağrı yollarında `opencode run` öncesinde çalışır.
- Fiyat metadata'sı yok, stale, parse edilemiyor veya nonzero ise sağlayıcı süreci başlatılmaz. Bu testler her public/private route için yapılır.
- Katalog/CLI health sonucu auth veya gerçek model erişimini yanlış olumlu bildirmez; auth doğrulanmadıysa null/unverified kalır.
- Read-only çözülmüş model her route'ta `space-bunny-readonly` agent'ını seçer. Etkin deny izinleri ve izole canary'de write/dış-dizin reddiyle hash değişmezliği doğrulanır.
- Web araştırması yalnız açık `webResearch:true` opt-in'iyle çalışır; researcher rolü ve empty OS-temp workspace zorunludur, yerel dosya araçları kapalıdır.
- Genel read-only route, etkin izin birleşimi ve yardımcı model sabitlemesi statik olarak doğrulandı; OS-temp izole sentetik canary 2026-09-30'da geçti.
- Edit için implementer rolü, seçili dosya, kabul ölçütü ve Space Bunny edit agent zorunludur; genel OpenCode aracı edit açmaz.
- Her Space Bunny terfisi `approvalClass=space_bunny_edit` sealed prepared request'i üretir; sonuç şeması `approvalRequired:true` pending sonucunu kabul eder ve açık onay olmadan hiçbir değişiklik uygulanmaz. Registry `sourceApprovalClass` değerini ayrı korur; yalnız `low_impact`, `new_file` ve `multiple_files` bu sınıfa bağlanabilir. `policy_config`, `external_service` ve `irreversible` mevcut non-approvable davranışında kalır.
- Yanlış binding, source workspace/hash değişikliği, seçilmemiş dosya, approval tekrar kullanımı veya sınıf düşürme denemeleri reddedilir.
- Tek dosyalı low-impact Space Bunny edit'i approval öncesi `approvalClass=space_bunny_edit`, `sourceApprovalClass=low_impact`, `approvalRequired:true`, `applied:false` ve geçerli prepared request döndürür; explicit approval sonrası bir kez uygulanır. Özgün `policy_config`, `external_service` veya `irreversible` sınıfı model-specific approval ile approvable hale gelmez. Diğer provider'ların mevcut low-impact davranışı değişmez.
- Pilot `promote:false`, `applied:false`, cleanup successful ve source hash unchanged koşullarını sağlar.
- Metrik tam resolved model hash'ini kaydeder; raw model adı, prompt veya içerik saklamaz.
- Kod değişikliklerinden sonra `npm test`, `npm run verify`, `npm run verify:ci`; MCP şeması değiştiğinden `npm run smoke` başarılıdır. Ek E2E komutları ancak ilgili gerçek yol değişmişse çalıştırılır.

## İş paketleri ve kilometre taşları

### Aşama 1: Exact model ve ortak fiyat kapısı

- Alias, canonical model ID, exact allowlist ve katı policy şemasını ekle.
- Shared OpenCodeAdapter içinde bütün route'lar için exact-model fiyat preflight'ı ekle; metadata kaynağı ve freshness kurallarını test et.
- Availability checker'ı auth/capability iddialarından ayır.
- Unknown, stale, malformed veya nonzero fiyat senaryolarının hiçbirinde provider `run` process'inin başlamadığını doğrula.

### Aşama 2: Salt-okunur agent ve MCP yüzeyi

- `check_space_bunny_subagent` ile `run_space_bunny_subagent` strict şemalarını ekle.
- Resolved model eşleşmesine göre bütün route'lardan `space-bunny-readonly` agent'ını seç.
- Her `opencode run` için Bridge-owned inline config'te özel read-only agent permission deny/allow listesini ve exact `small_model` değerini ver; kullanıcı config dosyalarını değiştirme.
- İzole workspace'te write ve external-directory denemelerini reddeden canary/test uygula. Etkin izinleri doğrulayamıyorsan model kullanımını açma.
- Agent izin birleşimini ve `opencode run` kaynak yolunu kod/config incelemesiyle doğrula; bu ön koşullar canlı model çağrısı yapmadan kapanmalıdır. Genel read-only route bu doğrulama ve sonraki izole canary geçene kadar disabled kalır.

### Aşama 3: Kontrollü edit ve explicit approval

- Dedicated edit agent ve Space Bunny edit caller route'unu tanımla.
- Selected files, implementer role, acceptance criteria, disposable workspace ve tarafsız catalog edit prompt'unu uygula.
- Her Space Bunny editte route-içi explicit approval zorunluluğu ekle; sourceApprovalClass ve Space Bunny approval binding'i ayrı tut.
- Mevcut non-approvable risk sınıflarını koru. Düşük etkili değişikliğin otomatik terfisini negatif testle engelle.
- Ayrı `promote:false` pilot route'u ekle; pilotun `applied:false`, cleanup successful, source hash unchanged olduğuna dair testler yaz.

### Aşama 4: Statik ve canlı doğrulama kapıları

- Resolver/allowlist, fiyat gate, health semantics, mode/role/file gate, permission deny, approval binding, risk-class preservation, cleanup ve redacted metrics testlerini geçir.
- `npm test`, `npm run verify`, `npm run verify:ci`, `npm run smoke` başarılı olmalı.
- İlk canlı çağrıdan önce yenilenmiş sıfır fiyat preflight'ı, `small_model` ve agent inline config'i, etkin read-only deny izinleri kod/config kanıtıyla doğrulandı; eksik kanıt varsa sonraki canary'leri başlatma.
- Bu ön koşullar geçtikten sonra ayrı açık kullanıcı onayıyla yalnız sentetik workspace üzerinde izole, read-only capability canary çalıştır. Canary write/dış dizin girişimini reddetmeli, workspace hash'ini değiştirmemeli ve aynı oturumda başka ücretli yardımcı model çağrısı üretmemelidir. Gerçek çağrı metriklerini ayrıca incele.
- Genel Space Bunny read-only route'u ancak bu canary başarılı olduktan sonra açılabilir.
- Sonraki ayrı kullanıcı onayıyla disposable ve terfi etmeyen edit pilotu çalıştır. Pilot değişikliği hiçbir koşulda kaynak dosyalara uygulanmasın.
- Edit pilotu başarılı olsa dahi normal production edit, her dosya terfisi için prepared approval kapısı uygulanmadan açılmamalıdır.

### Aşama 5: İsteğe bağlı GPT-6 Luna karşılaştırması

- Bu karşılaştırma ilk entegrasyonun kabul ölçütü değildir ve ayrı kullanıcı kararı gerektirir.
- Same-task, same-harness, aynı içerik ve ölçülebilir test sonuçlarıyla benchmark planla; mevcut OpenCode-vs-Codex leaderboard farkını gider.
- Çağrı sayısı, maliyet üst sınırı ve veri kapsamı önceden onaylanır. Sonuç doğrudan kalite eşdeğerliği iddiasına dönüşmez.
- Maliyet approval'ı yoksa veya model ücretsiz değilse ölçüm yapılmaz. Mevcut 7,57% cost coverage ve enforcement kapalı durumu ücret tahminini zayıflatır.

## Riskler ve açık karar kapıları

- **Anonim sağlayıcı ve veri gizliliği — çözülemeyen dış risk:** ZDR/no-training sağlayıcı beyanı bağımsız denetlenmiş değildir. Sentetik pilot kararı sabittir; özel repo, Vault, secret veya kişisel veri gönderimi için ayrıca kullanıcı kararı gerekir.
- **Zaman sınırlı ücretsiz erişim — çalışma anı kapısı:** 2026-09-30'da resmi fiyat sayfası ve yenilenmiş models.dev kataloğu sıfır fiyat gösterdi. Her çağrıda güncel exact metadata tekrar kontrol edilir; ücretli/unknown fiyat, yenileme hatası veya katalog yokluğu halinde çağrı disabled kalır. Ücretsiz erişimin gelecekte süreceği garanti edilemez.
- **Yardımcı model çağrıları — uygulama kararı ve canary kanıtı:** `small_model` aynı exact Space Bunny modeline sabitlenir; canary trace'i başka model/provider çağrısı göstermemelidir.
- **Edit promotion — karar kapısı:** Her terfi explicit prepared approval ister. Özgün risk sınıfını daha düşük gösterme ya da approval sınıfını public input ile değiştirme reddedilir.
- **Read-only izinleri — karar kapısı:** Built-in `plan` agent'ın varsayılan `ask` davranışı yeterli sayılmaz. Model-specific effective deny config ve canary yoksa read-only route disabled kalır.
- **Performans iddiası — karar kapısı:** Leaderboard farkı farklı harness'lerden gelir. Space Bunny'yi Luna ile eşdeğer sayma veya varsayılan/fallback yapma kararı verilmez.
- **Bütçe — dış hesap kapısı:** Paid use bu planın kapsamı dışıdır. Bridge'in sıfır katalog fiyatı ve yardımcı model sabitlemesi hesap düzeyinde billing setting'i doğrulamaz. Gerçek canary öncesi kullanıcı Zen auto-reload/billing limit ayarını kendisi kontrol etmeli; ücretli fiyat gözlenirse bu planla kullanım durur.

## Sınırlamalar ve atlanan adımlar

- DeepSeek Flash yerel analiz çağrısı `rate_limited`, sonra `auth_invalid` döndürdü; tekrar edilmedi.
- Gemini 3.8 Flash web-read capability `permission_denied` verdi. Web kaynakları ana orkestratörce doğrudan açıldı. Gemini yalnız seçilmiş secret içermeyen mimari alıntılar için aday üretici olarak kullanıldı; çıktısı yerel kaynakla kontrol edildi.
- Space Bunny'ye bir resmi-kaynak web araştırması ve bir sentetik OS-temp read-only canary çağrısı yapıldı; gerçek erişim bu çağrılarla gözlendi. GPT-6 Luna karşılaştırması yapılmadı. `check_space_bunny_subagent` tek başına yalnız katalog/fiyat metadata'sını doğrular, auth/model erişimini kanıtlamaz.
- Aktif kişisel OpenCode agent izinleri okunmadı ve uygulama için okunmaları gerekmiyor; Bridge-owned inline config izinleri sabitleyip kullanıcı/workspace agent ayarlarından bağımsız çalışır. Zen billing ayarları da okunmadı; gerçek hesap/billing ayarları canary öncesi kullanıcı tarafından doğrulanır.
- Kod, project/personal Bridge allowlist config'i, MCP şemaları ve project OpenCode orchestrator talimatı değiştirildi. Kullanıcının global OpenCode config'i değiştirilmedi.

## Kaynaklar

İlk araştırma kaynakları ana orkestratör tarafından 2026-09-28'de açıldı; güncel Zen/Go sayfaları ve model endpoint'leri 2026-09-30'da tekrar kontrol edildi.

- **OpenCode Zen:** `https://opencode.ai/docs/zen/` — stealth modeli, süreli ücretsiz erişim, provider ZDR/no-training beyanı ve otomatik bakiye yükleme seçeneği.
- **OpenCode Providers:** `https://opencode.ai/docs/providers/` — session-title için yardımcı `small_model` kullanımını açıklar.
- **OpenCode Config:** `https://opencode.ai/docs/config/` — `small_model`, config precedence ve `OPENCODE_CONFIG_CONTENT` inline override davranışı; erişim 2026-09-30.
- **OpenCode Agents:** `https://opencode.ai/docs/agents/` — agent-specific permission anahtarları ve modları; erişim 2026-09-30.
- **OpenCode Zen güncel fiyatlandırma:** `https://opencode.ai/docs/zen/` — erişim 2026-09-30'da Space Bunny Free sıfır fiyatlı ve limited-time olarak listeleniyordu.
- **OpenCode Models:** `https://opencode.ai/docs/models/` — `provider_id/model_id` kimlik biçimini destekler.
- **OpenCode Agents:** `https://opencode.ai/docs/agents/` — Plan agent varsayılan `ask` izinlerini ve agent-specific permission yapılandırmasını açıklar; bu nedenle built-in plan tek başına deny garantisi değildir.
- **OpenCode resmi X duyurusu, 2026-09-23:** `https://x.com/opencode/status/2102767716666941864` — bir haftalık ücretsiz model, 1M context, multimodal ve ZDR duyurusu; kesin kampanya bitiş zamanı değildir.
- **OpenCode PR #50572:** `https://github.com/anomalyco/opencode/pull/50572` — model promotion ve ZDR metadata değişiklik geçmişi.
- **AI Coding Daily leaderboard:** `https://aicodingdaily.com/leaderboard` — 2026-09-28'deki Space Bunny Max ve GPT-6 Luna Max yapılandırma skorları; model+harness sınırlaması.
- **Space Bunny sonuç sayfası:** `https://aicodingdaily.com/model/space-bunny`.
- **GPT-6 Luna sonuç sayfası:** `https://aicodingdaily.com/model/gpt-6-luna`.
- **AI Coding Daily metodolojisi:** `https://aicodingdaily.com/article/llm-coding-leaderboard-my-methodology-and-scoring-formulas`.
- **Space Bunny exploratory benchmark:** `https://github.com/tak2-08/llm-bench-opencode-spacebunny` — kendi ölçümü ve frontier-model kıyas sınırları.
- **Yerel katalog çıktısı:** `opencode models opencode --verbose --refresh`, 2026-09-28; exact ID ve o anki metadata. Canlı auth veya kalite kanıtı değildir.
- **Yerel runtime görünümü:** `subagent-bridge_check_subagent_bridge`, 2026-09-28; eksik maliyet telemetrisi ve budget enforcement durumu. Fatura kanıtı değildir.

## Sol denetim özeti ve kalan karar kapısı

- GPT-6 Sol'un son fiili incelemesi `APPROVED_WITH_RISKS` verdi; Space Bunny low-impact edit'in geçerli prepared approval üretmesi için model-spesifik approval class gerektiğini, ayrıca session-title atfının OpenCode Providers kaynağına bağlanmasını buldu.
- Bu sürümde Bridge-owned `space_bunny_edit` class'i, ayrı `sourceApprovalClass`, core result schema/registry/handler güncellemesi ve low-impact approval testleri planlandı. `policy_config`, `external_service` ve `irreversible` sınıfları mevcut non-approvable davranışında tutuldu. Session-title kaynağı `docs/providers` olarak netleştirildi ve aynı modelle fiyatlı başka bir yardımcı route'a düşmesi engellendi.
- Kullanıcı başka bir Sol çağrısı yapılmamasını istedi. Bu nedenle son metin bu düzeltmelerden sonra yeniden Sol tarafından incelenmedi. Bu, gözden geçirilmemiş son metin için açık `karar kapısı`dır; Sol onayı gibi sunulmaz.
- Uygulamada `space_bunny_edit` sınıfı, özgün source class'ı hiçbir route veya public alan üzerinden ezememeli; düşük etkili tek dosya değişikliği açık onaya kadar uygulanmamalıdır. Kabul testleri bu invariant'ı kanıtlamadan üretim edit promotion açılmamalıdır.
- Statik entegrasyon ve read-only canary doğrulandı; edit pilotu, production edit terfisi ve son Sol plan incelemesi açık kapılardır.
