# Gemini ve Space Bunny Kaynak İnceleme Mimarisi: Kalan Kararlar

Tarih: 2026-10-10

Durum: K1 sentetik kapsamı hazır; OpenCode source-bundle çağrıları `OPENCODE_DB=:memory:` kullanıyor. Gerçek `1.18.35` CLI'ın yerel mock ile provider-free session-storage doğrulaması geçti. P1 tamamlandı. Gemini rotası için K0a auth/Terms, Space Bunny K2 için K0b Zen Terms ve hosted canary kapıları açık; provider canary'si başlamaz.

Güncel ek durum (2026-10-13): Kullanıcının ayrı açık isteğiyle Bridge CLI üzerinden bir genel Space Bunny üretim denemesi yapıldı; OpenCode yeni keyless inference yolunda HTTP 403 `FreeTierError` verdi. Bu deneme manifestli source-bundle/K2 canary'si değildir. OpenCode Console PR [#53963](https://github.com/anomalyco/opencode/pull/53963), Space Bunny keyless isteklerini 2026-10-08'de legacy Zen proxy'den new inference'a taşımıştır; dolayısıyla 2026-09-30 başarılı canary daha önceki backend yolunu doğrular. Güncel CLI erişimi 403 nedeniyle engellendi; adapter non-retryable `permission_denied` raporlar. K0b Terms/data-handling kararı ayrıca açık kalır; teknik erişim izni Terms kapısının yerine geçmez.

## Dış kaynak araştırması (2026-10-10)

Bu bölüm Gemini/DeepSeek web araştırması ve ana orkestratörün doğrudan açtığı resmi sayfalardan oluşturuldu. Model yanıtları tek başına kanıt sayılmadı; kaynaklar dosyanın sonundaki kaynak listesinde verilir.

### Antigravity/Gemini: metin stdin transport'u belgeli; auth/terms kapısı önce gelir

- Resmi Antigravity CLI headless belgesi `--input-format stream-json` ile stdin üzerinden NDJSON kullanıcı mesajı almayı belgeliyor. `message.content` string veya text block listesi olabilir; text dışı block hata verir. Bu, host manifestini düz metin/JSON kullanıcı mesajı olarak aktarabilecek **teknik aday bir kanaldır**; dosya eki veya tipli source-bundle protokolü belgelenmiş değildir. `--output-format stream-json` ve sürekli çalışan input oturumu gerekir. `agy -p` tek prompt'u komut satırından verir; Bridge'in mevcut `--print` çağrısı bu stdin akışını kullanmıyor.
- Bu oturumdaki yerel `agy --version` çıktısı `1.3.3`; `agy --help` aynı kurulumda `--input-format stream-json`, `--output-format stream-json` ve `--add-dir` flag'lerini gösterdi. Resmi CLI reference `/add-dir <path>` komutunu TUI slash command olarak listeliyor, headless flag listesinde `--add-dir` yok. Yerel flag gözlemi bu binary için kanıttır, başka sürüme genellenmez; `--add-dir`ın güvenlik izolasyonu sağladığını kanıtlamaz.
- Google Antigravity Terms of Service, Google Cloud/Gemini Enterprise, Gemini Enterprise for Business veya Gemini Enterprise API key gibi belirtilen enterprise erişimlerini kendi ek şartlarının dışında tutup ilgili enterprise terms'e yönlendiriyor. Aynı Terms, consumer erişiminde Antigravity Service'e üçüncü taraf yazılım/araç üzerinden erişmeyi ihlal olarak tanımlıyor ve Antigravity/OAuth örneğini açıkça veriyor. FAQ da consumer planında `agy`'yi üçüncü taraf coding agent/app içinde sarmalamanın desteklenmediğini söylüyor; üçüncü taraf coding agent ile Gemini kullanımı için Gemini Enterprise veya Google AI Studio API key öneriyor. Enterprise dokümanı Antigravity CLI (`agy`) yüzeyini desteklenen ürün olarak saysa da bu tek başına kurumun Bridge entegrasyonuna onay verdiğini göstermez.
- Mevcut redakte health yüzeyi `authValid=null` döndürüyor; bu, CLI'ın consumer OAuth mu yoksa Cloud/Enterprise kimliği mi kullandığını göstermiyor. Bu nedenle **Antigravity üzerinden Bridge çağrısı için auth/terms kapısı açık ve bloklayıcıdır**: consumer OAuth ise bu üçüncü taraf sarma yolu kullanılmamalı. Enterprise/Cloud şartlarının güncel entegrasyona izin verdiği admin/terms düzeyinde doğrulanmadan plan API taşımayı da otomatik yetkilendirmez. Google AI Studio API key rotası CLI `agy` ile aynı değildir; gerekirse doğrudan Gemini API adapter'ı ayrı tasarlanır.
- Bu plan araştırması sırasında kullanıcı isteğiyle iki public-web Gemini işi Antigravity Bridge üzerinden denendi: geniş ilk istek timeout oldu; daraltılmış OpenCode exact-tag araştırması tamamlandı ve kaynağı ana orkestratör ayrıca açtı. DeepSeek Flash ve Pro dış kaynak araştırmaları da tamamlandı; önemli iddialar resmi sayfalardan doğrudan doğrulandı. Antigravity auth türü redakte health'te görünmediği için Gemini çağrılarının hangi şartlara tabi olduğu belirlenemiyor. Resmi Terms bulgusu çıktıktan sonra başka Antigravity/Gemini Bridge çağrısı yapılmadı; auth kategorisi kullanıcı/kurum tarafından doğrulanana kadar yenisi yapılmamalıdır. Bu belirsizlik consumer hesabı kullanıldığını veya Terms ihlalini tek başına kanıtlamaz.
- Sonuç: “Antigravity'de stdin source text imkânsız” denemez; resmi text-stream kanalı belgeli ve bu yerel CLI da flag'leri gösteriyor. Ancak consumer OAuth ile third-party bridge kullanımı resmi terms/FAQ'da yasaklanmış/desteklenmeyen kullanım olarak belirtiliyor. Auth yöntemi `check_antigravity` redakte health alanlarında `authValid=null` kaldığından bilinmiyor. **Auth ve terms kapısı çözülene kadar Antigravity üzerinden Bridge'e yeni Gemini çağrısı yapılmamalıdır.** Uygun enterprise/API auth doğrulanırsa dahi exact payload/response akışı, izin sınırı, limit ve version fixture ayrıca geçmeden Gemini `reviewScope` fail-closed kalır. Web/workspace model erişimi bu kapıların yerine geçmez.

### Space Bunny Free: OpenCode Zen beyanı var; upstream veri şartları bağımsız doğrulanamıyor

- OpenCode Zen dokümanı `Space Bunny Free` modelini “stealth” ve sınırlı süreli ücretsiz model olarak listeliyor; sağlayıcısının zero-retention/no-training izlediğini açıkça **OpenCode beyanı** olarak söylüyor. `models.dev` metadata'sında canonical `opencode/space-bunny-free`, tool-call true, input/output/cache fiyatları sıfır, `open_weights=false`, upstream lab adı yok ve açıklamada “Anonymous” sözü geçiyor. “Anonymous”, sıfır katalog fiyatı veya `open_weights=false` gizlilik/anonymity taahhüdü değildir.
- OpenCode Privacy Policy, prompts/conversations kategorisinin upstream provider'a service'i sunmak için aktarıldığını ve OpenCode tarafında “Not stored” olduğunu söylüyor; bu kategoriye özgü beyan upstream saklama politikasını kanıtlamaz. Terms of Service ise unpaid account içeriğinin servis geliştirme için kullanılabileceğini ve Third Party Model içeriğinin sağlayıcının retention şartlarına bağlı olduğunu, OpenCode'un upstream retention'ını denetlemediğini belirtiyor. Kamuya açık kaynaklar Space Bunny'nin bu Terms anlamında Third Party Model olup olmadığını veya modelin sıfır katalog fiyatının hesabı “unpaid account” yaptığını açıklamıyor. Upstream provider adı/Terms/Privacy sayfası kamuya açık kaynaklarda bulunamadı.
- Veri yerleşimi de açık değil: Zen dokümanı modelleri US ve EU'da barındırdığını, Zen tanıtım sayfası ise tüm Zen modellerini US'da barındırdığını söylüyor. Space Bunny'nin gerçek endpoint location'ı bu sayfalardan ayrılamıyor.
- Sonuç: Space Bunny'ye yalnız sentetik veya zaten kamuya açık içerikle, ayrıca kullanıcı onaylı canary düşünülebilir. Gerçek private repo, kişisel veri, secret veya gizli iş içeriği; OpenCode bu modelin upstream provider kimliğini, retention/training şartını, unpaid-account maddesinin uygulanışını ve location'ı yazılı netleştirene kadar kapsam dışıdır. Özel workspace'i geçirmek ya da “Anonymous” kataloğu kullanmak bu şartı çözmez.

## Başlangıç kararı ve kanıtın sınırı

İlk karar Gemini için kod yazmak değil, Antigravity'yi Bridge üzerinden kullanmanın mevcut auth türüyle Terms'e uygun olup olmadığını netleştirmektir. Space Bunny için de özel veri aktarımı şartları yazılı doğrulanana kadar gerçek repo review'u açılmaz. Bu iki kapıdan sonra yalnız sentetik, dar kapsamlı OpenCode canary'si değerlendirilir. Host'un kaynak seçimi ve teslim kaydı, modelin bütün dosyaları anladığına veya doğru inceleme yaptığına dönüştürülmemelidir. Başarılı doğrulama sonrasında da nihai bulguyu ana orkestratör yerel kaynakla değerlendirmelidir.

Bu plan, raporun 2026-10-10 güncellemesini güncel durum kabul eder; raporun “İlk Kod Düzeltmesi Öncesi Bulgular” bölümünü yeni iş listesi olarak kullanmaz. İncelenen yerel kaynak ve testler aşağıdaki ayrımı destekler:

- **Tamamlandı:** Antigravity public MCP `reviewScope`/required-evidence preflight reddi ve açıklaması; runtime'da provider öncesi `mcp_preflight` sınıflandırması. Runtime ret yolu `subagent-bridge/src/runtime/bridge-runtime.js:703-715`, adapter'ın çağrılmadığını doğrulayan test `tests/review-source-manifest.test.js:272-309`. Public MCP değişikliğinin ve doğrulamasının kaynağı `docs/reports/GEMINI_SPACE_BUNNY_WORKSPACE_INCELEME_HATALARI_2026-10-10.md:25,52`.
- **Tamamlandı:** Secret-scope reddinde yalnız sıralı kapsam indeksi, sinyal sınıfı ve aday sayısı veren anlık redakte tanı; fail-closed davranış korunuyor. Kaynak: `subagent-bridge/src/services/review-source-manifest.js:130-136`, `subagent-bridge/src/runtime/bridge-runtime.js:721-734`, `tests/review-source-manifest.test.js:312-350`. Tanının kalıcı metriğe yazılmadığı raporda kayıtlıdır (`docs/reports/GEMINI_SPACE_BUNNY_WORKSPACE_INCELEME_HATALARI_2026-10-10.md:27`).
- **Tamamlandı:** Workspace probunda marker gözlenmesi, başarılı fakat marker kanıtsız yanıtın `inconclusive` olması ve bağımsız cleanup durumu. Kaynak: `subagent-bridge/src/runtime/bridge-runtime.js:1808-1863`, `tests/provider-capability-probes.test.js:103-167`.
- **Tamamlandı:** OpenCode source-bundle-only reviewer agent'ları, tool/read/web/external erişimi deny, project config'in kapatılması ve yalnız `1.18.35` sürümünü kabul eden kapı. Kaynak: `subagent-bridge/src/adapters/opencode-adapter.js:152-205,309-364`, `tests/faz-3-opencode.test.js:384-459`. Bunları yeniden uygulamak takip işi değildir.
- **Yerel doğrulama tamamlandı:** Rapor hedefli 91/91 testi, tam testte 910 geçen ve 4 POSIX atlanan testi, verify/CI/smoke/drill kapılarını kaydediyor. Onaylı DeepSeek sentetik pilotu genel MCP rotasını doğruluyor; source-bundle semantiğini doğrulamıyor (`docs/reports/GEMINI_SPACE_BUNNY_WORKSPACE_INCELEME_HATALARI_2026-10-10.md:32`). Bu plan hazırlanırken test veya provider çağrısı çalıştırılmadı.
- **Eklenmedi:** Gemini/Antigravity source-bundle transport'u. Trusted-workspace okumasının çalışması bu desteğin yerine geçmez (`docs/reports/GEMINI_SPACE_BUNNY_WORKSPACE_INCELEME_HATALARI_2026-10-10.md:29-30,48-54`).

İki eski Space Bunny workspace probunun ham yanıtları geri kazanılamaz. Marker'ın okunamaması ile okunup ek açıklama dönülmesi arasındaki tarihsel ayrım açık kalır; yeni bir probe eski kayıtları kesinleştiremez veya geriye dönük `available` yapamaz. Kaynak: `docs/reports/GEMINI_SPACE_BUNNY_WORKSPACE_INCELEME_HATALARI_2026-10-10.md:69-74`. Bu kanıt sınırlaması bir onarım işi değildir.

## İş sırası ve izin sınırları

Bu belgenin kabul edilmesi önce dar kapsam hazırlığını açar. Sonraki kod/config değişikliği, dış sağlayıcı doğrulaması ve özel kaynak aktarımı kendi açık kullanıcı kararını gerektirir. Önceki pilot onayı yeni çağrılara taşınmaz. Ücretli provider takibi için model, veri kapsamı, çağrı sayısı ve harcama sınırı belirtilmiş ayrı açık kullanıcı onayı zorunludur.

Önerilen sıra:

0. **K0a — Antigravity auth/Terms kararı:** Antigravity CLI'ın hangi Google access/product path'i kullandığını kullanıcı veya kurum yöneticisi belirler; secret/credential okunmaz ve yalnız `authValid=null` gözleminden auth türü çıkarılmaz. Consumer OAuth ise üçüncü taraf Bridge üzerinden Antigravity kullanımı durdurulur. Gemini Enterprise/Cloud veya uygun API-key rotası seçilirse o rota için geçerli ayrı terms ve admin yetkisi doğrulanır. Bu kapı kapanmadan Gemini web/read/probe veya source-bundle canary'si yeni çağrıyla tekrarlanmaz.
1. **K0b — OpenCode Zen Terms ve yerel oturum saklama:** OpenCode ToS (yürürlük 2026-08-15), hosted Services kapsamında “automatically or programmatically extracts data or Output” kısıtını içeriyor; Terms ayrıca Input ve Output'u Content olarak tanımlıyor. Bridge CLI cevabını JSON olarak parse ettiği için kullanım bu sözcüklerle doğrudan temas ediyor. Aynı zamanda resmi CLI belgesi `run` komutunu scripting/automation için, `--format json`'ı raw JSON event üretmek için; resmi SDK da OpenCode'u programatik kontrol etmek için belgeliyor. Zen sayfası “Use with any agent” diyor. Bu ürün/teknik belgeleri programatik entegrasyonun ürünce öngörüldüğünü destekler, ancak incelenen kaynaklarda Terms madde 5 için açık istisna oldukları söylenmiyor; yazılı OpenCode açıklaması gerekir. Space Bunny Free no-training/retention beyanının upstream kimliği, “unpaid account” hükmü ve billing path'i üzerindeki kapsamı da netleştirilmelidir. Troubleshooting belgesi session/message verilerinin yerelde tutulduğunu söyler; CLI `--pure` yalnız “without external plugins” olarak tanımlıdır. Exact `1.18.35` kaynağı `OPENCODE_DB=:memory:` değerinin session/message veritabanını RAM'de tuttuğunu gösterir; Bridge bunu yalnız source-bundle çağrılarında ayarlar. `npm run opencode:memory-db:verify` gerçek `1.18.35` CLI'ına `contract.md`/`example.md` sentetik paketini stdin ile verip yalnız localhost mock endpoint'ini kullandı; mock iki kaynak metnini aldı, tool event gözlenmedi, kalıcı `.db` dosyası oluşmadı ve geçici alan temizlendi. Mock yanıtı sabit olduğundan bu test semantik review doğrulamaz. Bu provider-free runtime kanıtı Zen Terms'i çözmez ve K2 source-bundle provider canary'sinin yerine geçmez. Terms açıklaması gelmeden Space Bunny Zen canlı canary'si başlatılmaz; secret/private repo hiçbir halde K2 fixture'ına girmez.
   Kullanıcı 2026-10-10'da OpenCode'a yazılı açıklama talebi e-postası gönderdiğini bildirdi. E-posta; Bridge+CLI+JSON akışının Terms'e uygunluğunu, “any agent” ifadesinin kapsamını, Space Bunny upstream sağlayıcısını, retention/training ve unpaid-account hükümlerini, OpenCode saklama davranışını ve veri bölgesini soruyor. Yanıt henüz alınmadı; e-postanın gönderilmiş olması Terms kapısını kapatmaz.
2. **K1 — Görev ve kapsam hazırlığı:** Ana orkestratör inceleme sorusunu ve asgari dosya listesini belirler; mevcut kullanıcı onayıyla provider çağrısı yapmadan yürütülebilir.
3. **K2 — OpenCode bundle canary'si:** K0b yazılı açıklama ve yerel session-saklama kapısı geçerse yalnız sentetik/kamuya açık kaynaklarla, OpenCode Zen'in exact model/fiyatı ve kullanıcı onayı kapsamında değerlendirilir. Upstream veri şartları netleşene kadar private repo kullanılmaz. CLI sürümü, etkin izinler ve session temizliği geçmeden başlatılmaz.
4. **K3 — Güncel workspace probe'u:** Yalnız workspace kullanan bir görevin seçim kararını etkileyecekse, K2'den bağımsız ve ayrı onaylı çalıştırılır. Bundle-only reviewer kabulünün ön koşulu değildir.
5. **K4 — Sınırlı gerçek kullanım kararı:** K2 sonucu, provider data-terms açıklaması ve kullanıcı veri aktarımı kararı yeterliyse seçili gerçek görev ayrıca ele alınır. Antigravity auth/Terms engeli ve Space Bunny upstream/privacy belirsizliği çözülmeden bu kapı açılmaz. Başarısız veya yetersiz kanıtta yeni transport'a otomatik geçilmez.
6. **K5 — Yeni mimari veya sürüm kabulü:** Yalnız aşağıdaki tetikleyicilerden biri gerçekleşirse ayrı mini-spec ve uygulama kararı açılır.

Canlı görev başına çağrı tavanı, toplam provider attempt tavanı, timeout ve varsa maliyet tavanı onay metninde somutlaştırılmalıdır. Özellikle capability denetimi birden fazla provider çalıştırması içerebilir; tek MCP çağrısı tek ücretli çağrı kabul edilmez. İlk bundle canary'si için bir provider attempt, otomatik retry ve model fallback olmaması önerilir. Başarısızlık yeni ücretli denemeye örtük izin vermez.

## K1: Dar kaynak kapsamı ve ret sonrası doğru seçim

**Yapılacak iş:** Her inceleme için soruyu, seçilmiş tam göreli dosya yollarını ve kapsam dışında kalan bağımlılıkları ana orkestratör belirlesin. Genel durum indeksini her reviewer'a zorunlu bağlam olarak taşımak yerine, yalnız ilgili plan ve davranışı belirleyen kod/test dosyaları seçilsin. Manifestli review gereken iş desteklenen backend'e yönlendirilsin; Gemini özet üzerinden yalnız aday üretirse bu sınırlama sonuçta korunsun.

**Gerekçe:** İlk Space Bunny reddi eksik kapsamdan, ikinci ret yerel filtreden kaynaklandı; provider çalışmadı. Güncel rapor indeksin 47 yüksek-entropili adayının Markdown dosya adı/referansı biçiminde olduğunu ayırıyor. Bu bulgu 17 dosyalı önceki kapsamın diğer eşleşmelerini güvenli ilan etmez (`docs/reports/GEMINI_SPACE_BUNNY_WORKSPACE_INCELEME_HATALARI_2026-10-10.md:18,58-65`). Bu nedenle raporun eski bölümündeki genel belirsizlik, indeks için daha güçlü güncel bulguyla daraltılmalı; bütün dosyalara genellenmemelidir.

**Kabul ve doğrulama:**

- Seçilen her dosyanın inceleme sorusuyla ilişkisi ve dışarıda kalan önemli kaynakların sonuca etkisi belirtilir. Bir dosyanın atlanması bütün kapsam hakkında tamamlanmış review iddiası doğurmaz.
- Mevcut normalize/sıralama, path/encoding/secret/link kontrolleri ve manifest hash'i kullanılır. En fazla 50 dosya; tek dosya, toplam kaynak ve serialized bundle için mevcut 256 KiB sınırları korunur. Truncation veya sessiz kapsam düşürme yapılmaz (`subagent-bridge/src/services/review-source-manifest.js:7-10,48-137,181-219`).
- Ret durumunda anlık indeks yalnız çağrıyı yapan orkestratörün kendi sıralı listesiyle yerelde eşleştirilir. Provider'a tanı için eşleşen içerik gönderilmez; redakte tanı genişletilmez.
- Zorunlu bir kaynak engellenirse o kaynak yerelde incelenir veya görev kısmi kapsamla yeniden tanımlanır. Filtreyi aşmak amacıyla dosya adı/içeriği değiştirilmez. Ana orkestratörün güvenli özeti kullanılırsa bu, özgün dosyanın manifestli incelemesi sayılmaz.

**Fayda ve risk:** Daha az kaynak aktarımı gizlilik ve token maliyetini azaltabilir; henüz ölçülmüş kazanç yoktur. Aşırı dar kapsam çapraz dosya hatalarını kaçırabilir. Bu risk, kapsam eksikliklerini açık tutarak ve nihai bulguları yerelde doğrulayarak yönetilir. K1 için yeni otomatik kapsam seçici veya kalıcı tanı servisi gerekli değildir.

**K1 hazırlık sonucu (2026-10-10, provider çağrısı yapılmadan):** İlk sentetik canary tek bir çapraz dosya kuralını sınar. Geçici disposable workspace'te şu iki kısa dosya oluşturulması planlanır; bunlar repository'ye eklenmez:

`contract.md`

```text
Allowed status values: queued, completed.
A completed entry requires verified: true.
```

`example.md`

```text
status: completed
verified: false
```

Görev, yalnız bu iki dosyayı kullanarak örneğin sözleşmeyle uyumlu olup olmadığını değerlendirmek ve varsa tek çelişkiyi iki dosyanın satırlarıyla raporlamaktır. Beklenen bulgu: `example.md` completed durumunu `verified: false` ile verdiği için `contract.md` kuralını ihlal eder. Dosyalar sentetik ve gizlilik açısından hassas değildir; bu hazırlık OpenCode Terms K0b'yi, canlı provider iznini veya model davranışını doğrulamaz.

K2'ye geçilecekse scope tam olarak `contract.md` ve `example.md` olur, model/attempt `opencode/space-bunny-free`/1 olarak sabitlenir, fallback yapılmaz ve gerçek workspace kaynakları kullanılmaz. Manifestte bu iki path ve byte/hash değerleri doğrulanır. Beklenen bulgu yerel fixture ile karşılaştırılır; modelin kendi “başka dosya okumadım” beyanı izin kanıtı sayılmaz. Bu, planlanmış test brief'idir; dosyalar veya canlı çağrı henüz oluşturulmadı.

## K2: Mevcut OpenCode yolunun sınırlı canlı kabulü

**Çözülecek soru:** Gerçek OpenCode `1.18.35`, Bridge'in stdin bundle'ını reviewer'a kullanılabilir biçimde ekliyor mu ve özel agent'ın etkin izinleri ek kaynak erişimini engelliyor mu?

Mevcut test `OC-REVIEW-02`, Node fixture'ı üzerinden stdin, config ve in-memory DB ayarını geri gözlüyor; gerçek CLI/provider semantiğinin canlı kanıtı değildir (`tests/faz-3-opencode.test.js:405-432`). Runtime `complete_to_cli` değerini `stdinWriteStatus=complete` üzerinden üretir (`subagent-bridge/src/runtime/bridge-runtime.js:970-977`). Bu ayrım korunmalıdır; test eksikliği diye tamamlanmış taşıma uygulaması yeniden yazılmamalıdır.

K2 için yazılı hukuki/ürün açıklaması alınmadan Zen'e bir test prompt'u göndermek de OpenCode hosted service'inden programmatic output alır; canary'nin sentetik olması Terms belirsizliğini kendi başına çözmez. Ayrıca OpenCode CLI çalıştırması user text'i session'a gönderir ve resmi troubleshooting dokümanı session/message verisinin yerelde tutulduğu project storage alanını açıklar. Yerel dokümanda `--pure` yalnız external plugin'leri kapatır; data-store kapatma vaadi değildir. `run` kaynak kodu session yaratıp `session.prompt` çağırır. Böylece “Bridge raw output loglamıyor” ile “OpenCode yerelde session içeriği saklamıyor” ayrı iddialar olarak ele alınır.

İki ek bloklayıcı bu canary'nin varsayılan olarak başlatılamayacağı anlamına gelir:

- OpenCode Terms of Use, hizmeti “automatically or programmatically extracts data or Output” biçiminde kullanmayı yasaklar; Terms yürürlük tarihi 2026-08-15'tir. OpenCode'un CLI belgesi `run` komutunu programatik kullanım/scripting için ve `--format json`'ı ham JSON event'leri için, SDK belgesi de server'ın programatik kontrolünü desteklenen kullanım olarak tanımlar; Zen sayfası “Use with any agent” der. Bridge'in JSON Output'u parse ettiği somut akış bu belgelerle ürün açısından öngörülmüş görünüyor, fakat bu belgeler Terms madde 5 için açık bir carve-out oluşturmuyor. “extracts” kapsamı kamuya açık kaynaklarda tanımlanmadığından hukuki sonuç çıkarılmaz. Canlı K2 provider çağrısı öncesi bu senaryo için OpenCode'dan yazılı açıklama veya yetkili Terms kararı gerekir. Yanıt/karar yoksa K2 başlamaz.
- OpenCode v1.18.35 `run` yeni session yaratıp prompt gönderir. Exact sürümün `Database.path()` kodu `OPENCODE_DB=:memory:` ayarını kabul eder; session, message ve part kayıtları bu SQLite veritabanı üzerinden yürütülür. Bridge source-bundle çağrılarında bu ortam ayarını geçirir. `npm run opencode:memory-db:verify` gerçek CLI'a iki dosyalı sentetik bundle'ı stdin ile verdi; localhost mock bundle'ı aldı, tool event görülmedi, kalıcı DB dosyası oluşmadı ve geçici data root temizlendi. Bu provider-free doğrulama host manifest üretimini veya model semantiğini doğrulamaz; kullanıcı OpenCode data root'una dokunulmadı. `--pure` bu izolasyonun kanıtı değildir; Terms açıklaması alınana dek K2 başlamaz.

**Onay öncesi hazırlanacak somut canary:**

- Git kökü genişlemesi riskini önlemek için repository dışında, yalnız sentetik dosyalar içeren disposable workspace tasarlanır. Önceki repository-nested read-only canary bu nedenle geçersiz sayılmıştır (`docs/plans/yarim-kalanlar/SPACE_BUNNY_FREE_OPENCODE_SUBAGENT_PLANI_2026-09-28.md:3`).
- İki kısa sentetik kaynak ve host'ta belirlenmiş bir çapraz dosya tutarsızlığı seçilir. Dosyaların başı ve sonundaki ayrı olguların birlikte değerlendirilmesi istenir; sadece dosya adlarını tekrar etmek kabul edilmez. Beklenen sonuç yerelde tutulur; görev talimatına çözüm eklenmez.
- Manifest dışında bir sentetik dosya ve kapsam dışı erişim denemesi için güvenli fixture bulunur. Gözlenecekler: doğru agent seçimi, etkin deny izinleri, ek read/web/shell/task erişiminin reddi, kaynak hash'lerinin değişmemesi ve cleanup.
- Canlı trace yalnız gerekli olay türü ve izin sonucuna yerelde bakılarak değerlendirilir; ham prompt, kaynak veya provider çıktısı kalıcı kayda alınmaz. Root-session olaylarının yokluğu tek başına kapsam dışı erişimin imkânsızlığını kanıtlamaz. Eksik gözlem ayrıca belirtilir.

**Başlatma kapısı:** CLI sürümü `1.18.35` olmalı; project config kapalı ve bundle-only agent seçilmiş olmalı. Space Bunny exact kimlik/fiyat kontrolü güncel, sıfır ve başarılı olmalı; `small_model` aynı exact modele sabit kalmalı. Provider-free local mock ile session DB belleği ve temp cleanup doğrulandı. K0b programmatic-output/Zen Terms sorusu yine de yazılı açıklığa kavuşmalı; bu yanıt olmadan Zen'e prompt gönderilmez. Katalog/auth ve hesap billing ayarları farklı kanıtlardır. Kullanıcı hesap limitlerini kendisi kontrol eder; hesap veya secret dizinleri okunmaz. Kaynak: `subagent-bridge/src/adapters/opencode-adapter.js:309-364`, `scripts/verify-opencode-memory-db.js`, `docs/plans/yarim-kalanlar/SPACE_BUNNY_FREE_OPENCODE_SUBAGENT_PLANI_2026-09-28.md:184-205`.

**Kabul ölçütleri:**

- Host manifest count/bytes/hash ve `complete_to_cli` sonucu tutarlı; CLI başarılı dönüşü ayrıca kayıtlıdır.
- Model iki kaynaktaki olguları ve yerelde bilinen tutarsızlığı doğru ilişkilendirir. Sonuç ana orkestratör tarafından fixture ile doğrulanır. Bu, yalnız bu sentetik görevin semantik başarısıdır; bütün baytların tüketildiği veya genel review kalitesinin yüksek olduğu iddiası değildir.
- Kapsam dışı araç girişimi etkin izin katmanında reddedilir; fixture hash'leri değişmez, cleanup tamamlanır. Modelin “yalnız kapsamı okudum” beyanı veya marker'ı anmaması host izin kanıtının yerine geçmez. Girişim/ret gözlenemiyorsa izin doğrulaması açık kalır.
- Provider-free local mock accepted: exact `1.18.35` CLI run with `OPENCODE_DB=:memory:` created no persistent session database in the isolated data root, and the root was removed. The separate Space Bunny hosted canary still needs the K0b Terms answer and its own controlled acceptance evidence.
- Space Bunny çalışmasında başka ücretli yardımcı model görülmez. Telemetri eksikse sıfır fatura sonucu çıkarılmaz; gözlenen ve bilinmeyen maliyet ayrı yazılır.
- Kalıcı sonuç yalnız tarih, exact CLI/model kimliği, manifest özeti, durumlar, attempt sayısı, izin/cleanup sonucu ve bilinen maliyet kapsamını içerir. Ham çıktılar ve fixture içerikleri rapora taşınmaz.

**Başarısızlık kararı:** Bundle teslim başarısı ile semantik başarısızlık ayrı sınıflandırılır. İzin ihlali, beklenmeyen model/fiyat, bilinmeyen sürüm veya cleanup başarısızlığında takip durur; sonuncuda kalan sentetik artık yerelde ele alınır. Sorun yeniden üretilebilir yerel fixture ile daraltılmadan transport veya filtre gevşetilmez. Mevcut geniş model erişimi bu canary'nin başarısızlığı nedeniyle genel olarak yok sayılmaz.

**Maliyet/gizlilik sınırı:** OpenCode Zen, Space Bunny için sınırlı süreli free preview ve zero-retention/no-training beyanı yayımlıyor; bu OpenCode'un sağlayıcı hakkında beyanıdır, upstream provider kimliği/terms'i açıklanmıyor. OpenCode Privacy Policy'nin “Not stored” ifadesi prompts/conversations kategorisinin OpenCode tarafındaki işlenişine aittir; prompt'un upstream'e aktarılmadığını veya upstream'de tutulmadığını göstermez. Terms unpaid-account içeriğinin hizmet geliştirmede kullanılabileceğini ve Third Party Model retention'ının provider politikasına bağlı olduğunu söylüyor; ancak kamuya açık kaynaklar Space Bunny'nin Third Party Model sınıflandırmasını veya sıfır katalog fiyatının hesabı “unpaid account” yaptığını açıklamıyor. Bu hükümlerin Space Bunny Free/Zen billing path'i üzerindeki etkileşimi yazılı açıklığa kavuşana kadar yalnız sentetik veya kamuya açık veriyle devam edilir; private repo, kişisel veri, secret ve gizli iş içeriği kullanılmaz. Zero token price, “Anonymous” katalog açıklaması veya OpenCode beyanı bağımsız upstream ZDR/anonymity garantisi değildir. OpenCode Zen hesap/fiyat akışı ve US-vs-US/EU hosting açıklamaları da birbiriyle tam net değildir; K2'de veri lokasyonu ve hesap billing durumu sonucu olarak raporlanır. Önceki Space Bunny planı da özel repo aktarımına ayrı karar kapısı koyar (`docs/plans/yarim-kalanlar/SPACE_BUNNY_FREE_OPENCODE_SUBAGENT_PLANI_2026-09-28.md:199-205`).

## K3: Workspace capability sözleşmesinin yeni canlı gözlemi

Bu iş, workspace okuyan bir görev için güncel kanıt gereksinimi doğarsa değerlidir. Bundle-only reviewer'ın araçları kapalı olduğundan onun semantik kabulüyle birleştirilmez. Eski iki probe'u açıklamak için tekrarlar yapılmaz.

**Önerilen yürütme:** Ayrı onayla bir güncel Space Bunny trusted-workspace probe'u; gerekirse sonuç yorumunu etkileyen tek kontrollü takip. Her provider çalıştırması onaylı toplam tavana dahildir. İlk tur sentetik workspace'te yapılabilir; belirli gerçek trusted workspace erişimi gerekiyorsa o kök için ayrı kapsam kararı gerekir. Sentetik kök sonucu gerçek köke genellenmez.

**Kabul ve durma koşulları:** Marker görülen başarılı yanıt `available`, marker'sız başarılı yanıt `inconclusive`, provider/izin yürütme hatası `unavailable` kalır. Cleanup ayrı raporlanır ve başarısızsa yeni probe başlatılmaz. Ölçüm yalnız yeni tarihli sentinel gözlemidir; `sandboxStartup=not_probed` read-only probe'dan değiştirilmez. Kaynak: `subagent-bridge/src/runtime/bridge-runtime.js:1808-1863`, `docs/plans/yapilanlar/SUBAGENT_PROCESS_TRANSPORT_VE_GOREV_GUVENILIRLIGI_PLANI_2026-10-09.md:7`.

Marker içeren açıklamalı yanıt ve marker'sız başarılı yanıt zaten yerel test kapsamındadır (`tests/provider-capability-probes.test.js:132-167`). Cleanup arızası veya başka consumer uyumluluğu için yeni test ihtiyacı doğarsa önce mevcut kapsam okunur; yalnız eksik senaryo ayrı uygulama onayına alınır. Ham yanıt saklama, gizli sentinel yolunu topluca değiştirme veya sürekli probe servisi bu kapıyı kapatmak için gerekmez.

## K4 ve K5: Hangi mimari ne zaman değerli?

### Mevcut host bundle + CLI yolunu koru

Seçilmiş teknik seçenek budur. Host manifesti kaynak ve byte sınırını açık tutar; özel reviewer agent ek workspace erişimini kapatır. Mevcut adapter/runtime korunur, ek servis işletimi gerekmez. K2 geçse bile Space Bunny upstream terms/veri işleme belirsizliği çözülmeden gerçek private repo review açılmaz. Model kalitesi ve sağlayıcı gizliliği farklı açık konulardır; otomatik varsayılan/fallback yapılmaz.

### Gemini source-bundle transport'u: metin stdin kanalı belgeli, auth ve izin kapısı açık

Önceki “dökümante transport yok” varsayımı güncel resmi CLI belgeleriyle düzeltilmelidir. `--input-format stream-json`, stdin'den `event=user` NDJSON alır; `message.content` plain string veya yalnız text block listesi olabilir, `--output-format stream-json` zorunludur. Bu, bounded manifesti host tarafından JSON/text string olarak user message içine eklemek için teknik adaydır; file attachment/typed source file block'u belgelenmiş değildir. Bu oturumdaki yerel `agy 1.3.3 --help` de her iki stream flag'ini ve `--add-dir` flag'ini gösterdi; resmi CLI reference `/add-dir`'i slash command olarak listeliyor. `--add-dir` varlığı tek başına file-level review boundary kanıtı değildir.

Teknik imkan auth/terms izninden ayrıdır. Google Terms/FAQ consumer Antigravity erişimini üçüncü taraf coding agent/service içinde kullanmayı açıkça yasaklıyor veya desteklemiyor. K0 kapanmadan `agy` Bridge rotasına yeni Gemini araştırma, workspace-read veya bundle canary çağrısı yapılmaz. Consumer OAuth ise bu wrapper yolu için Gemini araştırması/transport'u ertelenir; uygun Enterprise/Google Cloud/API auth yolu kurum tarafından doğrulanırsa uygulanabilir contract ve izinler tekrar gözden geçirilir. Google AI Studio API key, `agy` CLI auth'uyla aynı şey değildir; direct API kullanımı ayrı adapter mimarisi olur.

**Yeniden açma tetikleyicisi:** (1) K0 auth/terms kapısı uyumlu bir execution path'i doğrular, (2) tekrarlanan gerçek bir görevde supported backend'lerin karşılayamadığı somut ihtiyaç ve Gemini'nin beklenen faydası gösterilir, (3) privacy/retention kararı ve kullanıcı onayı alınır. Yalnız “model erişimi çalışıyor” veya stdin input'un varlığı yeterli değildir. K0 consumer OAuth gösterirse bu route yeniden açılmaz; direct Gemini API alternatifi ayrı planlanır.

**Uygulama öncesi kapı:** Auth türü/terms uyumu ve kullanılacak provider ürün sözleşmesi ilk sıradadır. Uygun olduğu doğrulanan rotada seçili exact CLI sürümünde JSONL string stdin'in tam bounded bundle'ı kayıpsız taşıması; response `stream-json` normalization; Windows/limit/timeout/cancel/cleanup; OpenCode'daki gibi host source scope dışı araç erişiminin kapanması; `--mode plan`, project paths ve `--add-dir`ın etkin güvenlik anlamı provider-free testlerle doğrulanmalıdır. Text stream'in kabulü kendi başına source-bundle eligibility değildir. Exact sürüm/auth/config kanıtı, negatif izin testleri ve MCP/result consumer uyumluluğu geçmeden canlı çağrı yapılmaz. Canlı canary sentetik ve ayrıca onaylı olur; ücretli ise ayrı maliyet onayı gerekir. Consumer auth ile third-party agy wrapper veya scope boundary'si kurulamayan transport önerisi reddedilir.

### OpenCode sürüm yükseltmesini ihtiyaç halinde ele al

Tek exact sürüm kapısı güvenli fakat operasyonel olarak kırılgandır: CLI güncellemesi required review'u kapatabilir. Kapıyı bir semver aralığına çevirmek çözüm sayılmaz. Yeni sürüm zorunlu olduğunda stdin append, config precedence, agent/tool deny, yardımcı model, event projection ve retention/cleanup davranışı yeniden kaynakla karşılaştırılır; adapter fixture'ları ve K2 canary'si o exact sürüm için geçer. Sonrasında yalnız doğrulanmış sürüme izin verilmesi değerlendirilir. Unknown sürümde mevcut fail-closed ret korunur.

Yükseltme ihtiyacı yoksa sürekli sürüm taraması veya otomatik allowlist güncellemesi eklenmez. Eski sürümü sonsuza kadar tutmak da güvenlik stratejisi değildir; somut güvenlik veya uyumluluk gereksiniminde desteklenen başka route seçimi ile kontrollü yükseltme birlikte değerlendirilir.

### HTTP Server API, attachment ve ayrıntılı read telemetry'sini açma

OpenCode `--file`, remote `--attach` ve Server API bu takipte seçilmez. Önceki transport araştırması FilePart yolunda normal permission/cwd guard farkını, Server API'de deneysel protokolü, auth koşulunu, ham tool output ve cleanup belirsizliğini belgelemiştir. Child-session olayları normal CLI JSON akışında tam görünmez (`docs/plans/yapilanlar/SUBAGENT_PROCESS_TRANSPORT_VE_GOREV_GUVENILIRLIGI_PLANI_2026-10-09.md:35-38,50-51`).

Bu seçenekler daha zengin oturum gözlemi sağlayabilir; modelin kavrayışını kanıtlamaz. Yeni dinleyici, kimlik doğrulama, oturum temizliği ve hassas çıktı saklama maliyeti bu görev için faydayı aşar. Ancak zorunlu child-session denetim ihtiyacı mevcut CLI ile karşılanamazsa, ayrı tehdit modeli ve açık kullanıcı kararıyla yeniden incelenebilir.

## Bilinçli erteleme ve reddedilen yollar

- **Entropi/Markdown/URL istisnası yok:** İndeks için yanlış pozitif kanıtı evrensel allowlist gerekçesi değildir. İlgili mini-spec zaten reddedilmiş olarak indekslidir (`docs/plans/DURUM_INDEKSI.md:133`). Yeniden değerlendirme ancak dar kapsam seçiminin gerçek işleri tekrar tekrar durdurduğunu gösteren içeriksiz yerel ölçüm, sentetik pozitif/negatif güvenlik corpus'u ve ayrı güvenlik kararıyla açılır. Bu plan detector eşiğini veya bilinen imzaları değiştirmez.
- **Ham probe/provider çıktısı retention'ı yok:** Geçmiş iki yanıtı kurtarma girişimi ve yeni ham log sistemi yok. Tanı için gerekli statü, count/hash ve izin sonucu yeterli değilse önce somut eksik soru tanımlanır; daha geniş saklama otomatik tercih edilmez.
- **Geniş kalite benchmark'ı ertelendi:** GPT-6 Luna kıyası ilk entegrasyonun kabul koşulu değildir; harness farkı kalite eşitliği çıkarımını zayıflatır. K2 ve gerçek ihtiyaç olmadan ücretli A/B yapılmaz. Daha sonra aynı görev/kapsam ve ölçülebilir yerel sonuçlarla, ayrı çağrı/maliyet/veri onayıyla tasarlanabilir (`docs/plans/yarim-kalanlar/SPACE_BUNNY_FREE_OPENCODE_SUBAGENT_PLANI_2026-09-28.md:190-195`).
- **Edit pilotu ve production terfisi bu planla açılmaz:** Space Bunny edit pilotu ile son metin incelemesi önceki planda açık kalır; review canary'si bunları kapatmaz. Daha önce yeni Sol çağrısı yapılmaması kararı kayıtlıdır; yeniden inceleme için kullanıcı kararı gerekir (`docs/plans/yarim-kalanlar/SPACE_BUNNY_FREE_OPENCODE_SUBAGENT_PLANI_2026-09-28.md:236-242`).
- **Paralel OpenCode/batch gate'leri değişmez:** Bundle canary'si output cap, steps, network-off veya edit izolasyonu kabulü değildir. İndeksteki ayrı release kapıları kendi kanıtlarıyla ele alınır (`docs/plans/DURUM_INDEKSI.md:128`).
- **Shell sandbox probu ertelendi:** Salt-okunur kaynak incelemesi için terminal başlangıcını kanıtlamak gerekli değil. Gerçek shell görevi doğarsa ayrı görev/onay kapısı açılır; mevcut `not_probed` korunur.
- **Genel billing altyapısı bu işe eklenmez:** Sıfır fiyat bilgisi, Bridge maliyet tahmini ve sağlayıcı faturası ayrı tutulur. İndeks budget enforcement'ın kapalı olduğunu kaydeder; bilgilendirme eşiği harcama engeli değildir (`docs/plans/DURUM_INDEKSI.md:71`). Bu nedenle paid takip yalnız açık ve sınırlı onayla yürütülür; bu plan bütçe enforcement projesine dönüştürülmez.

## Sonraki yürütücünün kapanış kaydı

Ana orkestratör K1 kapsamını ve her canlı kapının onayını ayrı kaydeder. Doğrulama sonucu üç bağımsız başlıkta değerlendirilir: host scope/CLI teslimi, gözlenen izin/cleanup davranışı ve yerelde değerlendirilen sınırlı semantik başarı. Tek `ok=true` sonucu bütün kapıları kapatmaz.

Gelecekte kod veya şema değişikliği onaylanırsa ilgili manifest/capability/OpenCode negatif testleri ve değişen consumer fixture'ları çalıştırılır; ardından repository'nin test, verify/CI ve MCP smoke kapıları uygulanır. Drill yalnız değişen failure/retry yoluyla ilgiliyse tekrarlanır. Bunlar gelecekteki yürütme ölçütleridir; bu belge hazırlanırken çalıştırılmamıştır.

K1 sentetik kapsam taslağı tamamlandı; canary fixture dosyaları henüz üretilmedi ve hosted provider çağrısı yapılmadı. OpenCode `1.18.35` CLI'ın localhost mock ile provider-free session-storage doğrulaması geçti; bu Zen Terms veya source-bundle provider semantiği kanıtı değildir. Kullanıcı OpenCode'a K0b açıklama talebini gönderdi; yanıt bekleniyor. K2 için yazılı yanıtın değerlendirilmesi ve hosted canary'nin açık onayı gerekir. K3 yalnız gerekli olduğu görev için açık tutulur. K5 seçenekleri uygulanmadıkları için başarısız sayılmaz; tetikleyici ve kullanıcı kararı olmadan ertelenmiş kalır. İki eski probe'un kanıt kaybı kapanışta da korunur.

Bu plan GPT-6.1-Sol edit profiliyle oluşturuldu ve ana orkestratör tarafından yürütülüyor. P1 Bridge düzeltmeleri tamam; K1 sentetik kapsamı belirlendi; source-bundle çağrılarında `OPENCODE_DB=:memory:` uygulandı ve gerçek CLI/local mock doğrulaması geçti. Zen Terms yanıtı beklediği için Space Bunny hosted K2 canary'si, kalan provider canary'leri ve Gemini transport'u başlamadı.

## Dış kaynaklar

Erişim tarihi bütün kaynaklar için 2026-10-10 UTC'dir.

- Google Antigravity CLI headless input/output/permissions: https://antigravity.google/docs/cli/headless/ . `stream-json` NDJSON stdin event'i ve yalnız string/text-block içerik; non-text block ret; `--print` tek-prompt kanalı.
- Google Antigravity execution modes: https://antigravity.google/docs/cli/modes/ . `--mode=plan` ve read-only plan investigation açıklaması.
- Google Antigravity CLI reference: https://antigravity.google/docs/cli/reference/ . `/add-dir` TUI slash command listesi; headless flag envanteri ayrı kaynak olarak yerel `agy --help` ile karşılaştırılmıştır.
- Google Antigravity Terms of Service: https://antigravity.google/terms . Enterprise/Gemini Enterprise/API erişim istisnası ve consumer Service için third-party access kısıtı.
- Google Antigravity FAQ: https://antigravity.google/docs/faq/ . Consumer planlarında third-party app wrapper desteği ve Gemini Enterprise/API-key önerisi.
- Google Antigravity Enterprise: https://antigravity.google/docs/enterprise/ . Antigravity CLI, Cloud/Enterprise auth ve enterprise service/terms bilgisi.
- OpenCode Zen docs: https://opencode.ai/docs/zen/ . Zen billing, Space Bunny sınırlı süreli free listing, OpenCode'un ZDR/no-training beyanı ve privacy exceptions.
- OpenCode Zen landing page: https://opencode.ai/zen . Zen hesabı/bakiye akışı, public hosting-location ifadesi ve model pricing listesi.
- OpenCode Terms of Service (effective 2026-08-15): https://opencode.ai/legal/terms-of-service . Unpaid-account content use ve third-party-model retention sorumluluğu.
- OpenCode Privacy Policy (effective 2026-03-06): https://opencode.ai/legal/privacy-policy . Prompt/conversation content'in upstream'e aktarılması ve OpenCode tarafındaki “Not stored” sınıflandırması.
- OpenCode troubleshooting/storage docs: https://opencode.ai/docs/troubleshooting/ . Session/message verisinin local application data içinde saklandığını ve project-specific storage yolunu belgeliyor; exact `--pure` etkisini belirtmiyor.
- Space Bunny Free public model metadata: https://raw.githubusercontent.com/anomalyco/models.dev/dev/providers/opencode/models/space-bunny-free.toml . Zero-price/tool-call/closed-weight metadata; bu, upstream provider legal term'i değildir.
- OpenCode exact v1.18.35 CLI source `resolveRunInput`: https://raw.githubusercontent.com/anomalyco/opencode/v1.18.35/packages/opencode/src/cli/cmd/run.ts . Positional message ile non-TTY stdin'in `message + newline + piped stdin` olarak birleştirilmesi.
- OpenCode exact v1.18.35 `run.ts` kaynağı aynı zamanda `sdk.session.create` ve `sdk.session.prompt` akışlarını içerir; bu, CLI'ın conversation/session akışı kurduğunu kanıtlar, tek başına database write/retention ayrıntısını kanıtlamaz.
- OpenCode exact v1.18.35 `packages/core/src/database/database.ts`: `OPENCODE_DB=:memory:` `Database.path()` tarafından açıkça `:memory:` olarak döndürülür; `packages/opencode/src/session/session.ts` session/message/part servislerinin aynı Database servisini kullandığını gösterir. `packages/core/package.json`, `xdg-basedir` sürümünü `5.1.0` olarak pinler; bu sürümün `XDG_DATA_HOME` desteği incelenmiş, ancak auth verisini ayıracağı için Bridge çözümü olarak seçilmemiştir.
- OpenCode exact v1.18.35 database path: https://raw.githubusercontent.com/anomalyco/opencode/v1.18.35/packages/core/src/database/database.ts . `OPENCODE_DB=:memory:` açık davranışı.
- OpenCode exact v1.18.35 session/message persistence: https://raw.githubusercontent.com/anomalyco/opencode/v1.18.35/packages/opencode/src/session/session.ts . Session, message ve part servislerinin ortak Database katmanını kullanması.
- OpenCode exact v1.18.35 global path: https://raw.githubusercontent.com/anomalyco/opencode/v1.18.35/packages/core/src/global.ts . `xdg-basedir` tarafından sağlanan data root.
- `xdg-basedir` exact 5.1.0 source: https://raw.githubusercontent.com/sindresorhus/xdg-basedir/v5.1.0/index.js . `XDG_DATA_HOME` override davranışı.
- OpenCode CLI docs: https://opencode.ai/docs/cli/ . `run` programmatic/scripting kullanımı, `--format json` raw JSON events ve `--pure` external plugin sınırı.
- OpenCode SDK docs: https://opencode.ai/docs/sdk/ . SDK'nın OpenCode server'ını programatik kontrol eden entegrasyonlar için kullanımı.
- OpenCode Zen product page: https://opencode.ai/zen . “Use with any agent” ürün beyanı ve US hosting ifadesi; Terms madde 5'e açık istisna değildir.
- OpenCode exact v1.18.35 release: https://github.com/anomalyco/opencode/releases/tag/v1.18.35 . Release tarihi 2026-10-06; incelenen CLI sürümünün Terms yürürlük tarihinden sonraki sürüm olduğunu doğrular.
- Yerel host gözlemi (2026-10-10): `opencode --version` => `1.18.35`; `opencode run --help` `--pure` seçeneğini “run without external plugins” diye açıklar. Bu flag session/storage yazımını kapattığını iddia etmez; session DB bellekte tutma kanıtı ayrı olarak `OPENCODE_DB=:memory:` source incelemesi ve localhost mock CLI testiyle elde edildi.
- Secret/credential okumayan yerel host CLI gözlemi: `agy --version` => `1.3.3`; `agy --help` `--input-format stream-json`, `--output-format stream-json`, `--add-dir` flag'lerini listeler. Bu yalnız bu kurulumun gözlemidir; diğer sürümlere veya auth türüne genellenmez.
