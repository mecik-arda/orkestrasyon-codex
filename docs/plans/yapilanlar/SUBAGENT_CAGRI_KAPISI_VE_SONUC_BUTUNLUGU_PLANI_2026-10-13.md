# Subagent Çağrı Kapısı ve Sonuç Bütünlüğü Planı

Durum notu (2026-10-13): Plan metni GPT-6.1 Sol’a required host source-bundle ile sunuldu ve `APPROVE` alındı. Sol onayı plan içeriğine aittir; kodu bağımsız doğruladığı iddiası değildir. Faz A-D uygulandı ve doğrulandı. Faz D istemci session tool-catalog yenileme sınırını Bridge dışı operasyon adımı olarak belgeler. Tam kabul, planın son uygulama kaydındadır.

Tarih: 2026-10-13
Hazırlayan: Ana orkestratör
Kapsam: Orkestrasyon Bridge provider çağrı kabulü, geçici rate-limit yönetimi, görev sonucu tamamlanma durumu, review evidence ve MCP tool capability yüzeyi.
Kapsam dışı: provider/model değiştirme; sandbox veya approval bypass; edit modunda otomatik retry; provider'ın içsel muhakemesini ya da review doğruluğunu kanıtladığını iddia etme.

## Amaç

Tarihsel subagent hatalarında yerel çalışma ortamı, provider/model yanıtı, Bridge transportu ve görev kabul süreci birbirinden ayrıştırılamadı. Mevcut transport, host source manifest, bounded retry ve hata taksonomisi uygulamalarını tekrar etmeksizin kalan riskleri kapatmak; başarısız veya kanıtsız incelemenin başarılı review gibi görünmesini önlemek.

## Karar özeti

- Mevcut BridgeRuntime ve provider adapter mimarisi korunur; yeni genel agent framework'ü eklenmez.
- Codex stdin/argv preflight ve host source-bundle transport'u tamamlanmış temel kabul edilir. Bu plan uzun-prompt taşımasını yeniden tasarlamaz.
- Sağlayıcı kapasite kontrolü batch dışındaki doğrudan çağrıları da kapsamalıdır. İlk policy kararı, Bridge'in aynı yerel provider-profile çağrılarını varsayılan en çok iki, OpenCode DeepSeek Pro/Flash ortak profilini en çok bir eşzamanlı çağrıyla sınırlar. Limit artışı yalnız redakte operasyon metrikleriyle gerekçelendirilir; başka uygulamaların aynı hesabı kullanması Bridge tarafından garanti altına alınamaz.
- Rate-limit tespiti serbest metindeki herhangi bir `429`, `rate limit` veya `quota` alt dizisine dayanarak süreç iptal etmemelidir. Provider/CLI tarafından güvenilir hata sinyali sunulmuyorsa sınıflandırma “belirsiz process çıkışı” olarak kalmalı ve ham stderr saklanmamalıdır.
- Process tamamlanması, output bütünlüğü, source teslimi, task tamamlanması ve evidence geçerliliği ayrı durumlar olmalıdır. `reviewContract` host'un dosya scope'unu ve CLI'a teslimatı kanıtlar; modelin içsel olarak dosyayı okuduğu veya verdict'in doğru olduğu iddiasına yükseltilmez.
- Antigravity'nin host source-bundle review'ı desteklememesi mevcut fail-closed yetenek sınırı olarak korunur. Kaynak kanıtı zorunlu review bu yola yönlendirilmez.

## Kanıt tabanı ve mevcut durum

- Tamamlanmış transport/read-evidence çalışması: `docs/plans/yapilanlar` altındaki 2026-10-09 tarihli plan. Codex stdin taşıması, Windows argv üst sınırı, host manifest ve required review scope, result contract ve capability probe'ları bu plana aittir.
- Olay/kök neden raporu: `docs/reports` altındaki 2026-10-08 tarihli subagent hata mimarisi incelemesi. 39.001 karakterlik Codex çağrısında `ENAMETOOLONG` güçlü transport hipotezidir; tam serialized argv kaydı yoktur. Windows sandbox/helper hataları workspace review verdict'i değildir. Gemini'nin yanlış teknik iddiası kaynakla kontrol edilmiştir. DeepSeek `process_exit` olaylarında sağlayıcı/CLI kök nedenini ayıracak ham içerik bulunmamıştır.
- DeepSeek operational process failure ile schema/output validation failure ayrımı mevcut `subagent-bridge/src/deepseek.js` ve `tests/reliability.test.js` içinde uygulanmıştır (`08c9d97`); bu davranış tekrarlanmamalı veya geri alınmamalıdır.
- `subagent-bridge/src/adapters/opencode-adapter.js` önceki sürümde rate-limit sinyalini stderr parçalarında geniş metin regex'iyle arıyor ve eşleşmede child process'i iptal ediyordu. Faz B uygulaması bu erken cancel yolunu kaldırıp tekil NDJSON `type=error` event'i ve allowlist hata kodlarıyla sınırlar; genel quota/429 metni tek başına pozitif sayılmaz.
- `providerConcurrency` mevcut config ve uygulamada paralel batch admission'ına bağlıdır (`config/policy.json`, `subagent-bridge/src/services/parallel-batch.js`). Doğrudan provider çağrıları için aynı paylaşılan kabul kuyruğu bu incelemede bulunmamıştır.
- `reviewEvidenceRequirement` doğrudan araçlarda varsayılan olarak `best_effort`'tur. MCP aracı reviewer rolünde required scope zorunlu kılabilir; Antigravity için `reviewScope` açıkça provider öncesinde reddedilir. Space Bunny aracı güncel MCP server'da kayıtlıdır ve stdio tool testi vardır; tarihsel oturumdaki görünmeme nedeni mevcut kanıtla belirlenememiştir.
- MXC tercihi kullanıcı onayıyla global Codex ayarına eklenmiştir; restart sonrası dar Codex edit canary'si ve override'sız sandbox komutu başarılıdır. Test çıktıları seçilen sandbox motorunu doğrudan raporlamadığından MXC'nin fiilen kullanıldığı veya tarihsel hatanın kalıcı biçimde kapandığı kesinleşmiş değildir.
- DeepSeek Pro/Flash küçük ve sıralı disposable pilotları başarıyla tamamlandı; `applied=false`, `preview=true` idi ve rate limit görülmedi. Bu sonuçlar bu küçük pilot koşullarını gösterir, büyük/eşzamanlı görevlerde 429 riskini kapatmaz.

## Hata atfı

- **Codex `ENAMETOOLONG`:** Güçlü biçimde Bridge prompt taşıma tasarımı ile Windows process sınırının etkileşimine işaret eder; güncel stdin/preflight uygulaması bu taşıma riskini azaltır. Tarihsel tam argv kaydı olmadığından kesin root cause değildir.
- **Windows sandbox/helper ve Node kernel:** Öncelikli neden yerel Codex/Windows çalışma ortamıdır; Orkestrasyon uygulama mantığı kusuruna dair kanıt değildir. Bridge açısından kalan katkı, çağrı/response başarısını dosya erişim kanıtı gibi sunmamaktır.
- **Gemini 48-layer iddiası:** Model doğruluk hatasıdır. Kaynakla doğrulamadan iddiayı kabul etmek orkestrasyon süreci kusuru olurdu; tarihsel rapor iddiayı doğrulayarak reddetmiştir.
- **DeepSeek `process_exit`/kesik yanıt:** Eski olaylarda kök neden belirsizdir. Operational/schema mesaj karışıklığı Bridge kusuruydu ve düzeltilmiştir; bu düzeltme eski process çıkışının sebebini açıklamaz.
- **Gemini web-evidence retleri:** Carrier sözleşmesi başarısız olmuştur; güvenli ret davranışı korunur. Hatanın model biçimlendirmesi, prompt veya provider taşımasından hangisi olduğu ham payload olmadan bilinmez.
- **Space Bunny tool'unun tarihsel oturumda görünmemesi:** MCP session/tool-catalog yüzeyi adayıdır, provider/model arızası değildir; hangi süreçte stale kaldığına dair kanıt yoktur.
- **DeepSeek 429 gözlemleri:** Provider rate-limit sınıfı gözlenmiştir; kök limit türü bilinmez. Bizim katkı olasılığımız, batch dışı çağrılar için ortak admission limitinin bulunmamasıdır; bu olayın tek kök nedeni olduğu kanıtlanmış değildir.

## Uygulama fazları

### Faz A — Ortak provider admission

Amaç: Bridge'in doğrudan ve batch çağrılarının aynı yerel provider kapasite politikasına uymasını sağlamak.

İşler:

1. Mevcut batch içi `providerConcurrency` ile runtime direct-call yollarını bir admission sözleşmesine bağla. Aktif kapasite sınırı aynı hostta ortak `statePaths.cache/provider-admission-locks` kullanan Bridge süreçleri arasında geçerlidir; her süreç aynı provider-admission policy snapshot'ıyla başlatılmalı, limit değişince tüm ilgili Bridge süreçleri yeniden başlatılmalıdır.
2. Ana kapasite anahtarını secret olmayan yerel provider/auth-profile kimliği olarak tanımla; bu profil limiti canonical modeller arasında ortaktır. İsteğe bağlı model-alt limitleri yalnız profil limitinin altında ek kısıt olabilir; model başına ayrı limitler toplam profil kapasitesini aşamaz. Secret, credential değeri veya geri çözülebilir kimlik metriğe yazılmaz.
3. Queue wait, admission sonucu, lease süresi ve cancel/timeout sonrası slot bırakma davranışını redakte metriklerde göster. Süreçler arası kullanım seçilirse stale lease kurtarma ve host restart davranışını test et.
4. Rate limit sonrası provider/model havuzuna bounded cooldown uygulanıp uygulanmayacağını, mevcut retry jitter ve circuit-breaker ile birlikte belirle. Provider `Retry-After` sinyali gerçekten erişilebilir değilse bu alanı varmış gibi üretme.
5. Edit görevlerindeki `mutation_state_unknown` retry-stop kuralı değişmez. Yeni admission yalnız bir sonraki invocation'ı sıraya alır; başarısız edit'i otomatik tekrar başlatmaz.

Kabul ölçütleri:

- Aynı provider/auth-profile altındaki farklı canonical modellerin doğrudan ve batch çağrılarının toplam eşzamanlılığı profil limitini aşmaz; model-alt limitleri bu toplam sınırı yükseltemez.
- İptal, timeout, process crash ve Bridge restart senaryolarında admission slot'u kaybolmaz veya sonsuza kadar tutulmaz. Bekleyen sıra `BridgeRuntime` örneği başına sınırlıdır; süreçler arası FIFO sırası garanti edilmez.
- Kuyruk beklemesi görev timeout/bütçe hesabında görünür; provider faturası gibi raporlanmaz.
- Fake provider ve süreç testleriyle doğrulanır; canlı provider çağrısı bu fazın kabul şartı değildir.

Uygulama notu (2026-10-13): Runtime direct ve batch worker çağrıları provider profile admission kapısından geçer. Aktif slotlar ortak `statePaths.cache/provider-admission-locks` workspace lease'leriyle Bridge süreçleri arasında paylaşılır ve normal workspace-lock health sayımından ayrıdır; profile başına bekleyen kuyruk kapasitesi her `BridgeRuntime` örneğinde uygulanır, kuyruk sırası süreçler arasında global FIFO değildir. Bütün süreçlerin aynı policy snapshot'ıyla başlaması gerekir; limit değişince restart gerekir. Route profile key canonical model namespace'inden türetilir, `profileByRoute` ile açık yerel alias verilebilir. Mevcut `parallelBatch.providerConcurrency` batch içi ek alt sınır olarak korunur; runtime profile limiti bileşik aktif çağrı üst sınırıdır. Policy'de `opencode:deepseek` limiti 1, diğer profillerin varsayılanı 2'dir. Provider beklemesi mevcut workspace lease alındıktan sonra gerçekleştiği için aynı workspace'teki yazarı bekleme süresince geciktirebilir; kuyruk beklemesi `queueWaitMs` ve runtime duration'a eklenir, `maxWaitMs` ile sınırlanır. Bu tradeoff hedefli testlerde ayrıca izlenmelidir. Başlatılan her provider attempt'inin slot tutma süresi redakte `providerAdmissionLeaseMs` olarak attempt metrics, recent-runs ve replay'e taşınır; tamamlanma/exception/cancel yolunda slot `finally` içinde bırakılır. Faz A için provider admission, workspace lease/cancel, config ve circuit-breaker regresyonları geçti; genel doğrulamalar `npm test`, `npm run verify`, `npm run verify:ci`, `npm run smoke` ve `npm run drill` ile başarılıdır. Bu uygulama sırasında canlı provider çağrısı yapılmadı.

### Faz B — Rate-limit sinyali ve adapter teşhisi

Amaç: Gerçek provider reddiyle sıradan CLI/log metnini ayırmak.

İşler:

1. OpenCode stderr cancel yolundaki regex'in kabul edilebilir provider hata imzalarını tanımla. Güvenilir, yapılandırılmış imza olmayan durumlar erken cancel edilmeden süreç çıkışına kadar izlenir ve belirsiz hata olarak sınıflandırılır.
2. Codex/OpenCode ve Antigravity sonuçlarında ortak, strict bir redakte diagnostics zarfı kullan: failure stage, allowlist OS/provider code, stdout/stderr byte uzunluğu ve mümkünse provider execution süresi. Exit code/signal sonuç üst düzey alanlarında, retry kararı attempt telemetry alanlarında kalır.
3. Raw stderr/stdout, prompt, workspace yolu ve credential loglama; yalnız enum, boyut kovası ve güvenli hata kodu taşı.
4. `429` veya `rate limit` ifadesinin alıntılandığı açıklama/log örneklerini negatif test et. Gerçek provider hata fixture'ları pozitif test olur.

Kabul ölçütleri:

- Yapılandırılmış rate-limit fixture'ı `rate_limited` hata sınıfı ve `provider_rate_limit` failure stage üretir; açıklama metnindeki/alıntıdaki 429 tek başına process cancel etmez.
- Process exit, sandbox setup, workspace read, provider rate-limit ve result/schema hataları ayrı `failureClass`/`failureStage` üretir.
- Her adapter'ın success/failure/cancel/timeout/oversize yolları aynı strict diagnostics schema'sından geçer; metrikte raw output veya secret bulunmaz.
- `npm test`, `npm run verify`, `npm run verify:ci` geçer.

Uygulama notu (2026-10-13): OpenCode yalnız satır bazlı JSON `type=error` event'i içindeki `rate_limited`, `too_many_requests` veya `resource_exhausted` kodlarını rate-limit kabul eder; prose quota mesajı ve başka çıktıda alıntılanmış JSON pozitif değildir. Rate-limit metnini görür görmez child process'i iptal etme kaldırıldı. Codex/OpenCode ve Antigravity adapter'ları ortak strict diagnostics şemasını başarı, hata ve timeout yollarında üretir; OpenCode/Codex manuel iptallerinde `runProcess` sinyalle resolve olduğunda da sonuç `cancelled` olarak korunur. Hedefli `faz-3-opencode`, `faz-3-codex` ve `faz-1-antigravity` testleri geçti.

### Faz C — Task completion ve review eligibility

Amaç: Process başarıyla sonlandı, kaynak scope teslim edildi, yanıt bütünlüğü yeterli ve inceleme sonucu kullanılabilir durumlarını birbirinden ayırmak.

İşler:

1. Mevcut `reviewContract`'ı koru; host source scope ve CLI input teslimiyle sınırlı kalmasını açıkça belirt.
2. Provider tamamlanma işaretini sürüm/adapter bazında doğrulayabildiğimiz yollarda `outputIntegrity` (`complete`, `truncated`, `unknown`) ve host `taskCompletion` (`completed`, `partial`, `unavailable`, `unknown`) alanlarını tanımla. `completed` host tarafından terminal provider/process işareti ve geçerli sonuç zarfı üzerinden türetilir; modelin kendi “tamamlandı” beyanı kanıt sayılmaz. Güvenilir terminal işareti yoksa `unknown` kullan. Required source review sonucunu strict yapılandırılmış JSON zarfıyla doğrula; exit 0 ve boş olmayan serbest metin tek başına yeterli değildir.
3. High-value source review için `reviewEvidenceRequirement=required` ve açık `reviewScope` varsayılan çalışma kuralı olsun. Legacy `best_effort` çağrılarından full review eligibility çıkarma. Required review eligibility koşulunu tek bir host-kontrollü birleşim olarak tanımla: explicit scope mevcut, `sourceScopeStatus=complete`, `sourceDeliveryStatus=complete_to_cli`, `outputIntegrity=complete`, `taskCompletion=completed`, required review JSON şeması geçerli ve tüm source references host manifestine göre doğrulanmış olmalı.
4. Model bulgularındaki source references, host manifestteki path ve geçerli 1-based inclusive line range ile karşılaştırılabilir hale getir. Bu kontrol referansın path/range varlığını doğrular, yorumun doğruluğunu veya modelin kaynağı semantik olarak okuduğunu değil.
5. Antigravity/Gemini için source-bundle support ekleme kararı bu planda verilmez; mevcut preflight rejection ve unsupported behavior korunur. Bu kabiliyet istenirse sürümlü transport/evidence tasarımı ve ayrı karar gerekir.
6. Model iddiası ile host gözlemini ayrı alanlarda tut. `APPROVE`, “review succeeded” veya release verdict'i Bridge tarafından türetilmez.

Kabul ölçütleri:

- Review eligibility yalnızca Faz C iş 3'teki bütün host-kontrollü koşullar aynı anda sağlanırsa verilir. `unknown`, `partial`, `truncated`, source delivery/scope failure ve schema/carrier validation rejection hiçbir zaman eligibility üretmez; hard failure `unavailable`, kanıtı yetersiz durum `unverified` olarak kalır.
- Exit 0 + boş olmayan metin veya model-authored `status=completed` tek başına required review'u eligible yapmaz; strict review result schema'sı başarısızsa eligibility kapalı kalır.
- Provider output limit, parse/validation rejection, carrier rejection ve source delivery failure farklı durumlarla döner.
- Truncated veya tamamlanma kanıtı olmayan sonuç `unknown`/`partial` kalır; success gibi normalize edilmez.
- Kaynak manifest path/line doğrulaması manifestte olmayan path'leri ve geçersiz line range'leri reddeder; ham kaynak/prompt loglanmaz.
- Antigravity'ye required source bundle gönderme provider başlamadan fail-closed reddedilir.
- MCP public result sözleşmesi değişirse geriye uyumluluk fixture'ı ve `npm run smoke` gerekir.

Uygulama notu (2026-10-13): Review contract v2 host'tan türetilen `outputIntegrity`, `taskCompletion` ve `reviewResultValidated` alanlarını taşır. Required source review yalnız strict JSON zarfı geçerli ve her finding'in path/line referansı host manifestindeki kaynakta bulunuyorsa `reviewResultValidated=true` olur. Best-effort kapsamlı çağrılar ve eski v1/v2 eligibility kayıtları `unverified` olarak kalır. Eligible sonucu yalnız complete source scope/delivery, complete output, tamamlanmış host task ve validated review result birlikte verir. Düz metin/whitespace yanıt eligibility almaz; timeout partial/unknown kalır, output limit truncated/partial olur, diagnostics veya güvenilir completion kanıtı olmayan sonuç eligible olmaz. Model-authored completion ya da verdict doğruluk kanıtı sayılmaz.

### Faz D — MCP tool capability freshness

Amaç: Provider health, model kataloğu ve bu session'da gerçekten yayınlanmış invocation tool'larını birbirine karıştırmamak.

İşler:

1. MCP server'ın `listTools` sonucunda gerekli tool kimliklerini doğrula; model configured/available bilgisini tool registration kanıtı sayma.
2. İstemci katalogunda tool eksikse MCP bağlantısını/session'ı yeniden başlatıp `listTools` listesini yenile. Eksik tool için server-side `tool_unavailable` sonucu mümkün değildir: çağrı Bridge'e ulaşmaz ve provider yolu başlamaz.
3. Server registration, in-memory schema/call contract testi ve gerçek stdio `listTools` smoke testi mevcut tool registry/schema'sını kontrol etsin.

Kabul ölçütleri:

- Space Bunny gibi conditional/optional tool'ların registry varlığı, runtime route ve MCP schema birbiriyle uyumludur.
- Missing tool, model access veya provider process error gibi gösterilmez.
- Eski istemci katalogunda görünmeyen tool çağrısı Bridge'e ulaşmaz; bağlantı/session yenilendikten sonra `listTools` yeni registry'yi göstermelidir. Bridge client-side cache durumunu ölçtüğünü iddia etmez.

Uygulama notu (2026-10-13): `run_space_bunny_subagent` MCP registration'ı source'da mevcuttur. `mcp-space-bunny-tool.test.js`, SDK client ile `listTools` schema'sını ve provider yerine stub runtime'a call dispatch'i doğrular; `npm run smoke` gerçek stdio bağlantısında tool registry ve Space Bunny schema'sını listeler. MCP server uzak istemcinin eski `listTools` cache'ini göremez; operatör adımı istemci/session bağlantısını yeniden kurup tool listesini tekrar almaktır. Tool hiç listelenmiyorsa provider/model health sonucu değildir ve çağrı farklı provider'a yönlendirilmemelidir.

Kapanış notu (2026-10-13): Faz A-D uygulaması tamamlandı. Uygulama aşamasında `npm test` 933 testte 929 pass, 4 platform skip ve 0 fail verdi; `npm run verify`, `npm run verify:ci`, `npm run smoke`, `npm run drill` (9/9) ve `git diff --check` başarılı oldu. Bu kapanış anında canlı model üretim çağrısı yapılmamıştı; değişiklikler commit/push edilmedi.


Ek düzeltme notu (2026-10-13, bağımsız Sol bulguları): Required review için strict JSON sonuç şeması sağlayıcıya özgü prompt ile istenir; DeepSeek/GLM mevcut yapılandırılmış envelope'larını korur. Host manifest path/line doğrulaması ve `reviewResultValidated` işareti zorunludur; nonempty process output, best-effort veya eski v1/v2 review kaydı eligibility kazanamaz. Codex adapter ve ortak process-failure classifier `429`/`quota` prose eşleşmesini rate-limit retry kanıtı saymaz; yapılandırılmış rate-limit event'i yoksa nonzero exit `process_exit` kalır. Sol'un üç bulgusu hedefli testlerle doğrulandı ve kapatıldı.

Codex rate-limit tamamlayıcı düzeltme notu (2026-10-13, Sol ikinci görüşü sonrası): Codex CLI JSONL akışı `--json` ile açıkça etkinleştirilir. Adapter yalnız JSONL dış event'lerini okur, terminal başarısızlık event'inde izin verilen yapılandırılmış rate-limit kodunu arar ve tamamlanmış turn içindeki son `agent_message` metnini sonuç olarak döndürür; model mesajı/araç çıktısı içindeki JSON ile stderr prose'u sınıflandırma kaynağı değildir. Sol, Codex'in rate-limit event code sözleşmesinin resmi dokümanda sabitlenmediğini belirtti; bu nedenle yalnız mevcut kapalı code allowlist'i tanınır ve gerçek rate-limit code'u için doğrulama iddia edilmez. Fixture testi JSONL event'ini adapter'dan runtime read-only retry kararına kadar izler. Ardından yerel Codex CLI 0.162.1 ve `gpt-6.1-sol` ile salt-okunur canlı çağrı yapıldı; gerçek JSONL akışı parse edildi ve `CODEX_JSONL_LIVE_OK` yanıtı alındı (9.7 sn, exit 0). Canlı çağrı rate-limit yanıtı üretmedi.

## Sıralama ve karar kapıları

1. **Faz A kapsam kararı (uygulandı):** Aynı hostta ortak `statePaths.cache/provider-admission-locks` kullanan Bridge süreçleri tek provider-profile aktif slot havuzunu paylaşır. Profil limiti canonical model rotaları arasında ortaktır; model-alt limitleri yalnızca toplam sınırı daraltabilir. Bütün Bridge süreçleri aynı policy snapshot'ıyla başlatılır ve admission limiti değiştiğinde yeniden başlatılır. Bridge dışındaki uygulamaların aynı provider hesabı üzerindeki eşzamanlılığı bu kapının kapsamında değildir.
2. **Faz B (uygulandı):** Adapter error fixture'ları ve diagnostics sözleşmesi test edildi; yapılandırılmış rate-limit allowlist'i pozitif/negatif testlerden sonra devreye alındı.
3. **Faz C (uygulandı):** Host task outcome ve review eligibility host sinyallerinden türetilir; bu sürümde JSONL CLI process çıkışı dışında ek completion sinyali yoktur, eksik/ambiguous kanıt `unknown` kalır. App-server veya HTTP API'ye otomatik geçiş yapılmaz.
4. **Faz D (uygulandı, client boundary kaydı):** Server registration, schema contract ve stdio tool list smoke doğrulanır. Uzak MCP istemcisinin cache'i Bridge tarafından gözlenemediğinden yeniden başlatma/reinitialize operasyon runbook'udur.
5. Değişiklik fazları ayrı diff/PR/commit olarak yürütülür. Bu planın yazılması uygulama veya ücretli provider çağrısı onayı değildir.

## Riskler ve değişmezler

- Sıralama kuyruk gecikmesini artırır; provider 429'unu tamamen önleyemez ve Bridge dışındaki aynı hesap çağrılarını yönetmez.
- Pending queue kapasitesi `BridgeRuntime` örneği başınadır; host-wide FIFO/queue cap değildir. Aktif slot sınırı ortak lock dizininde paylaşılır. Canlı fakat takılmış bir Bridge PID'sinin lease'i yalnız mtime eski diye çalınmaz; admission kuyruğu timeout olur ve slot owner süreç iyileşene veya sonlanana dek kullanılamaz kalabilir.
- Rate-limit sınıflandırmasını daraltmak gerçek hatayı geç fark ettirebilir; operatör görünürlüğü için belirsiz process exit sınıfı korunmalıdır.
- Host source delivery, modelin kaynağı semantik olarak okuduğunu veya doğru değerlendirdiğini ispatlamaz.
- Codex MXC canary başarısı motor seçimini doğrudan kanıtlamadığından “sandbox sorunu kalıcı çözüldü” sonucu verilmez.
- Edit çağrılarında otomatik retry, sandbox bypass, permission genişletme, varsayımsal source-read attestation veya model-authored approve kullanılamaz.
- Provider raw output'u, prompt, secret, credential, session ID ve workspace path kalıcı telemetry'ye alınmaz.

## Doğrulama

- Hedefli provider-free adapter, retry, manifest/evidence, MCP registration ve process-limit testleri.
- MCP public schema/registration değişirse `npm run smoke`.
- Genel orkestrasyon değişikliklerinde `npm test`, `npm run verify`, `npm run verify:ci`.
- Provider çağrısı gerektiren canary'ler yalnız kullanıcı tarafından ayrı kapsam/maliyet onayı verilirse; disposable workspace ve tek attempt ile. Pilot sonucu genel kullanılabilirlik veya kalıcı hata kapanışı sayılmaz.

## Kaynaklar

- Olay ve atıf incelemesi: `docs/reports` altındaki 2026-10-08 tarihli subagent hata mimarisi incelemesi.
- Tamamlanmış temel uygulama planı: `docs/plans/yapilanlar` altındaki 2026-10-09 tarihli transport/read-evidence planı.
- Sol görüşü: GPT-6.1 Sol, 2026-10-13; güncel plan tek dosyalı host source-bundle ile eksiksiz teslim edildikten sonra plan metnine `APPROVE` verdi. İlgili uygulama kodu scope'a alınmadı; bu nedenle onay kod incelemesi veya tüm fazlar için uygulama onayı sayılmaz.
- Güncel yerel karşılaştırma: `subagent-bridge/src/adapters/opencode-adapter.js`, `subagent-bridge/src/adapters/codex-adapter.js`, `subagent-bridge/src/adapters/antigravity-adapter.js`, `subagent-bridge/src/deepseek.js`, `subagent-bridge/src/result.js`, `subagent-bridge/src/runtime/bridge-runtime.js`, `subagent-bridge/src/services/parallel-batch.js`, `subagent-bridge/src/frontends/mcp/server.js` ve ilgili testler.
