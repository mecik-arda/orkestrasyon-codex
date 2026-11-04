# Review preflight ret katmanı ve gerekli karar

Tarih: 2026-10-27 Türkiye

## Sonuç

Mevcut repository'de `review_scope_secret_detected` için kullanıcı onaylı istisna veya yanlış-pozitif override yolu bulunamadı. `reviewScope` kaynakları üretim `classifySecretLikeContent` sınıflandırıcısından geçer. Sinyal varsa manifest oluşturma durur; runtime `sourceScopeStatus=blocked` ve `sourceDeliveryStatus=not_attempted` ile preflight başarısızlığı döndürür. Tool şeması, config ve bu çağrı zincirinde sinyali, eşiği veya dosyayı muaf tutan yetki alanı yoktur.

Bu ret, boyut sınırından ve platformun daha sonra verdiği auto-review kararından ayrıdır. Mevcut kaynakta veya Hades araç envanterinde önceki subagent çağrılarına ait salt-okunur detail/status aracı olmadı. Bu nedenle aşağıdaki kayıtlar mevcut raporlar, handoff ve konuşmada zaten görülen redakte metadata ile sınırlıdır; çağrı çalıştırma aracı yeniden çağrılmadı.

## Ret katmanları

### Boyut ve taşıma sınırı

2026-10-26 coordinator raporu, tüm patch'i içeren yaklaşık 60.000 karakterlik exact-diff isteğinin prompt/schema sınırına takıldığını ve adapter'a ulaşmadığını kaydediyor. Bu bir boyut/preflight sınırıdır; secret sınıflandırma kararı değildir. Repository kaynak inceleme bundle'ı için ayrıca dosya başına 256 KiB, toplam 256 KiB ve bundle 256 KiB sınırları uygular; bunlar `review_scope_too_large` sınıfıdır.

### Repository secret preflight'ı ve manifest

`review-source-manifest.js` dosya byte'larını okuduktan sonra üretim `classifySecretLikeContent` fonksiyonunu çağırır. Eşleşmede `review_scope_secret_detected` verir ve yalnız sıralı scope indeksi, sınıf ve yüksek-entropi aday sayısı gibi redakte tanıyı taşır. Manifest/payload oluşturma tamamlanmaz. `bridge-runtime.js` hatayı `mcp_preflight` olarak sınıflandırır; `createRuntimeFailure` varsayılanı `adapterAttempts=0` değeridir. `sourceManifest` henüz yoktur; review sözleşmesinin scope'u bloklu, teslimatı denenmemiş, manifest hash'i/dosya sayısı/byte sayısı null kalır. Codex adapter'ının source bundle taşıması manifest başarıyla oluşturulduktan sonraki yoldadır.

İlgili kaynak ve testler: [review-source-manifest.js](../../subagent-bridge/src/services/review-source-manifest.js:7), [bridge-runtime.js](../../subagent-bridge/src/runtime/bridge-runtime.js:257), [MCP tools şeması](../../subagent-bridge/src/frontends/mcp/tools.js:22), [codex-adapter.js](../../subagent-bridge/src/adapters/codex-adapter.js:331), [review-source-manifest.test.js](../../tests/review-source-manifest.test.js:121).

### Güvenli tarihsel metadata

- Option B review kaydı `requestedModel=gpt-6.1-sol`, `adapterAttempts=0`, source delivery `not_attempted` ve `high_entropy`/`known_signature` preflight sinyalini kaydediyor. Tam `reviewScope` listesi korunmadığı için item-index/path eşlemesi veya bir sinyalin kesin hangi dosyada oluştuğu yeniden kurulamıyor.
- 2026-10-26 coordinator raporunda ayrı bir kaynak inceleme girişimi `tests/optimization.test.js` için `known_signature` olarak kaydedilmiş; aynı istek kümesinde `package-lock.json` yerel manifest denetiminde `high_entropy` bulunmuş. Bu rapor tam `reviewScope` dizisini veya her sinyalin Hades yanıtındaki item eşlemesini vermiyor; bu nedenle tam çağrı kapsamı olarak sunulmuyor.
- Bu güvenlik reddinden sonraki scope-parçalama girişiminin platform auto-review tarafından önceki reddi dolanma riski gerekçesiyle reddedildiği ayrıca kayıtlıdır. Bu karar repository sınıflandırıcısının kararı değildir ve yeniden denenmedi.
- Syntax-aware prototipi için önceki çağrı metadata'sında `requestedModel=gpt-6.1-sol`, `backend=codex`, `resolvedModel=null`, `sourceScopeStatus=blocked`, `sourceDeliveryStatus=not_attempted`, `sourceManifestSha256=null`, `sourceFileCount=null`, `sourceBytes=null`, `reviewResultValidated=false` bulunuyor. Bu çağrıda gönderilen dokuz path'lik scope bellidir; ancak Hades metadata'sı ret sinyalini/path'ini göstermedi. Yerel aynı üretim sınıflandırıcısı taramasında bu scope içindeki `package-lock.json` `high_entropy`, `memory.js` ve rapor `known_signature`, indeks ve handoff `mixed` verdi; deneysel modül/testi, `package.json` ve `review-source-manifest.js` sinyal vermedi. Yerel ölçüm olası kaynakları gösterir, Hades'in hangi girdiyi reddettiğini kanıtlamaz.
- Bu bloklu çağrılarda `resolvedModel=null` olduğu için model çalışmış sayılmaz. Option B kaydında sıfır adapter denemesi açıkça bulunur. Syntax-aware çağrı için güvenli görünür metadata provider/model sonucunu göstermiyor; adapter deneme sayısı raporlanmış metadata'da yoktur ve buradan sayı çıkarılmamıştır.

Hades araç envanterinde `get_parallel_task_detail` yalnız parallel batch task'ları içindir; doğrudan Codex subagent incelemeleri için sorgulanabilir run kaydı yoktur. Repository metrik sözleşmesi de ham prompt, kaynak, task ID veya workspace yolu saklamaz. Hades'den gizli/başka oturum state'i alınmadı.

### Hades yetkisi, platform auto-review ve model çalışması

İlgili çağrılar `run_codex_subagent` aracına ulaşıp yapılandırılmış bir bridge/preflight sonucu döndürdü; genel Hades tool permission denial kanıtı yoktur. `review_scope_secret_detected` repository içinde kaynak manifesti oluşturulurken üretilen ayrı bir ret sınıfıdır. 2026-10-26 kaydındaki sonraki scope-parçalama reddi ise platform auto-review kararıdır. Platform kararını repository kodu veya daha küçük scope ile kaldırma yetkisi yoktur. İki katmanın karar metadata'sı birbirinin yerine kullanılamaz.

## Var olan yetki mekanizması

`reviewScope` açık bir path listesi alır; path güvenliği, dosya türü/kimliği, encoding, boyut ve secret sınıflandırması kontrolleri uygulanır. `reviewEvidenceRequirement` yalnız `best_effort` veya `required` değeridir; source scope verilmişse manifest kurulumu her iki durumda da secret taramasından geçer. `best_effort` bir muafiyet değildir. Strict MCP şemalarında bilinmeyen alanlar reddedilir. İstisna sahibi, onay kimliği, kaynak hash'i, kullanım sayısı, son kullanma zamanı veya audit kaydı oluşturan secret override alanı yoktur. Vault için bulunan injection onayı, review-source teslim yetkisi değildir. Scope'u atlamak da reddedilen içeriği incelemeye yetkili kılmaz ve exact source review kanıtı üretmez.

İlgili regresyonlar `RSM-03`, `RSM-04`, `RSM-06`, `RSM-08` ve `RSM-09`'dur. Özellikle `RSM-09` secret preflight'ın yalnız güvenli tanı döndürdüğünü ve `adapterAttempts=0` olduğunu doğrular; `RSM-04` boyut sınırını ayrı sınıfta sınar; `RSM-06` manifestten sonra exact source bundle teslimini doğrular. Var olmayan override'ın kabul edildiği iddia edilmemiştir.

## Tek dar karar önerisi

**Karar:** Üretim source-review preflight'ına yalnız bir çağrı için, kullanıcı tarafından tam byte içeriği görülüp açıkça dış modele gönderilmesi onaylanmış false-positive kaynak bundle'ına yönelik tek kullanımlık istisna mekanizması eklenmesine izin verilsin mi?

Önerilen davranışın sınırları:

- İstisna genel tarama politikasını, imza listesini, entropi eşiğini, dosya allowlist'ini veya default'u değiştirmez. Varsayılan yol aynı şekilde fail-closed kalır.
- Onay, kullanıcının gördüğü tam bundle'ın workspace kimliği ve Git HEAD'i; sıralı göreli path'ler; her dosyanın SHA-256, mode ve byte sayısı; toplam bundle SHA-256; prompt SHA-256; istenen backend/model ve caller ile bağlanır. Bir byte, path, mode, HEAD, prompt, caller veya route farkı onayı geçersiz kılar.
- Onay yalnız bir read-only review çalıştırmasına ve bir kullanıma bağlanır; önerilen expiry 10 dakikadır. Kalıcı CAS/tek-kullanımlık tüketim kaydı replay'i engeller. Süresi geçmiş, iptal edilmiş, eksik, bozuk veya uyuşmayan kayıt adapter çalıştırmadan reddedilir. Bu exception, dış Hades/platform auto-review kararını geçersiz kılamaz.
- Yetki, MCP girdisindeki serbest bir `force` boolean'ından veya içeride üretilen approvalRef'ten gelmez. Tam bundle kullanıcıya gösterildikten sonra trusted host onay yüzeyi açık bir karar alır. Onaylayan kişi içeriğin gerçekten dış modele gönderilebileceğini ve gerçek credential taşımadığını teyit eder.
- Audit kaydı yalnız opaque onay kimliği, actor/caller hash'i, workspace/HEAD/prompt/bundle/file hash'leri, sınıf, zaman, expiry ve sonuç kodunu tutar; ham kaynak, secret adayı, prompt, tam path veya provider çıktısı yazılmaz. İstisna tüketilmeden önce revoke edilebilir. Kaynak gönderildikten sonra remote taraftaki kopyayı geri çağırma garantisi yoktur.
- Ret veya yetki uyuşmazlığında `adapterAttempts=0`, `sourceDeliveryStatus=not_attempted` korunur. Başarılı source bundle teslimi ancak önceki manifest/hash ile byte-byte eşit olduğunda kaydedilir.

Negatif kabul testleri: onaysız, yanlış actor/caller/backend/model, workspace veya HEAD uyuşmazlığı, path ekleme/çıkarma/sıralama değişikliği, file hash/mode/size veya bundle/prompt hash değişimi, expiry, revoke, bozuk/imza geçersiz kayıt, eşzamanlı çift tüketim, tekrar oynatma, sınıra yakın/büyük bundle, dosya büyümesi/değişmesi, symlink/hardlink/path traversal, invalid UTF-8/NUL, source delivery başarısızlığı ve platform auto-review retleri. Her ret sıfır provider başlangıcı ve sıfır kaynak teslimiyle doğrulanmalıdır. Pozitif test yalnız tam kullanıcı-onaylı hash eşleşmesini ve tek tüketimi kapsar.

Bu karar şu an uygulanmış değildir. Eğer kullanıcı bu dar yetkiyi verirse bile platform auto-review onayı ayrı ve zorunlu kalır. Mevcut görev kapsamında kaynak kodu veya üretim karar yolu değiştirilmedi; yerel smoke/inference yapılmadı.

## Yerel doğrulama

Bu rapor yalnız mevcut kaynak/test davranışını belgeliyor; JavaScript veya runtime değişikliği yapmıyor. `node --test tests/review-source-manifest.test.js` 16/16 geçti. `npm run verify:ci` başarılı. `npm audit --json` normal ağ erişimiyle denendi fakat registry bağlantısı kullanılamadı; bu temiz audit sonucu değildir. `git diff --check` belge değişikliklerinden sonra çalıştırılacaktır. JavaScript/runtime değişikliği yapılmadığından tam `npm test`, `npm run verify` ve smoke bu rapor güncellemesi için gerekli değildir.

## 2026-11-04: Yerel preflight teşhisi

Önceki ret kayıtları değiştirilmiyor. Tarihsel çağrılarda tam scope/path eşlemesi saklanmadıysa yeni teşhis aracı geçmiş reddin girdisini geriye dönük kanıtlayamaz. `npm run review:diagnose -- --workspace . --file <relative-path>` komutu yeni, açıkça seçilen kapsam için üretim manifestindeki aynı path, dosya kimliği, byte, encoding ve secret sınıflandırma okuyucusunu kullanır. Komut manifest veya source payload döndürmez; yalnız redakte JSON metadata üretir. Üretim manifesti ilk hatada durduğu için sonuç ayrıca üretim tarafından ulaşılan ilk ret ile tanı amacıyla kontrol edilen sonraki dosyaları ayırır; bundle boyutu kontrolü fail-fast kararı sonrasında çalışmadı olarak gösterilir.

Çıktı şema sürümünü, seçilen policy davranışını, policy kaynak dosyalarının içerik hash'lerini, istenen/denenen/tamamlanan dosya sayılarını, göreli path referanslarını, byte/hash bağlarını, ilk üretim retini, dosya bazındaki çalıştırılan ve atlanan kontrolleri, tamlık durumunu ve kaynak snapshot hash'ini içerir. `--expected-snapshot` ve `--expected-policy` önceki güvenli hash'lerle değişimi karşılaştırır. Tamamlanmamış scope için snapshot karşılaştırması yapılabilir sayılmaz. Hash'ler gizlilik garantisi veya host attestation değildir.

Komut repository içindeki `config/policy.json` varsayılanını ve ilgili kaynak/bağımlılık dosyalarını bağlar. Etkin kişisel runtime config'ini okumaz; bu yüzden çıktı `mayDifferFromActiveRuntime` sınırını taşır ve canlı Hades'in fiilî ayarını kanıtlamaz. Komut provider, model, MCP review veya Vault çağrısı yapmaz; kaynak teslim etmez ve preflight retini override etmez. `clean`, yalnız seçilen dosya kapsamının bu yerel policy ile geçtiğini belirtir.

Sentetik alt süreç regresyonları; temiz kapsam ve production manifest hash/bundle byte eşleşmesini, bilinen imza reddinin redaksiyonunu, production fail-fast ile diagnostic-only kontrollerin ayrımını, unsafe path çıktısının gizlenmesini, kişisel config/Vault/provider çağrısı yapılmamasını ve snapshot drift karşılaştırmasını kapsar. Bu ekleme bugünkü engel sınıflarını gelecekteki yerel teşhis için açıklayabilir; geçmiş Hades/platform reddinin eksik metadata'sını üretmez. Platform Auto-review kararı ve bağımsız model incelemesi ayrı kalır.
