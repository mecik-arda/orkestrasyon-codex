# Sözdizimi farkındalıklı secret sınıflandırıcı prototipi

Tarih: 2026-10-27 Türkiye

## Kapsam ve güvenlik sınırı

Bu çalışma JavaScript ve TypeScript kaynak metni için ayrı, deneysel bir AST tabanlı prototip ve test harness'i ekler. Üretimde kullanılan `classifySecretLikeContent`, review-source preflight kararı, Vault sınıflandırması ve Option B runtime yolu değiştirilmedi. Prototip üretim yoluna bağlanmadı ve otomatik fallback eklenmedi. Temiz bir prototip sonucu güvenlik onayı değildir; yalnız incelenen statik metin sınıflarının bulunmadığını söyler.

## Önceki preflight kanıtlarının ayrımı

- Option B inceleme kaydında iki `high_entropy` adayı ve kaynak tesliminden önce `adapterAttempts=0` bilgisi bulunuyor. Tam başarısız çağrının `reviewScope` listesi korunmadığından item/path eşlemesi kesinleştirilemiyor.
- Option B değişikliklerinin yerel, redakte ölçümünde `tools.js` içinde 47 karakter uzunluğunda, entropy skoru 4.28 olan iki camelCase kaynak tanımlayıcısı mevcut tarayıcı eşiğine takılabilecek sınıfta. Bu, önceki iki adayla uyumlu bir hipotezdir; tarihsel çağrının kesin dosya ve girdisini kanıtlamaz.
- `known_signature` başka bir çağrıya aittir. `tests/optimization.test.js` içindeki test kilit sahibi metadata'sında `token: crypto.randomUUID()` biçimi mevcut üretim imza kuralını yerel olarak tetikliyor. Boşluk eklenerek parçalanmış `crypto . randomUUID ()` biçimi aynı regex'i tetiklemiyor; bu da sözdizimi farkındalıklı karar karşılaştırmasının metin biçimine bağlı olmaması gereğini gösteriyor. Dinamik üretim ifadesi yerel fixture kanıtıdır; geçmiş reddin nedeni veya gerçek credential olduğu anlamına gelmez.
- `package-lock.json` içindeki standart SHA-512 SRI alanları ayrı bir içerik sınıfıdır. Bunların Option B başarısız incelemesinin scope'unda olduğuna dair kayıt yoktur.
- Ham aday değerleri bu rapora yazılmadı.

## Prototip tasarımı

`experiments/syntax-aware-secret-classifier.js`, yalnız `.js`, `.jsx`, `.mjs`, `.cjs`, `.ts`, `.tsx`, `.mts` ve `.cts` uzantılarını TypeScript Compiler API ile AST'ye ayrıştırır. İncelenen kaynak çalıştırılmaz, import edilmez ve dosya sistemi üzerinden prototipçe açılmaz. Tanımlayıcı düğümleri literal içerik diye taranmaz; string, regex, template parçaları, yorumlar ve JSX metni mevcut üretim sınıflandırıcısının aynı imza/entropi kontrollerine verilir.

Kaçış çözümleme AST'nin literal değerini kullanır. Sabit string birleştirme, parantezli literal ve tamamen sabit template birleştirmesi bir araya getirilerek ayrıca sınıflandırılır. Hassas adla ilişkili literal değer aynı mevcut sınıflandırıcıdan geçer. Hassas alanın dinamik ifadesi `sensitive_dynamic_value` olarak inceleme ister; alt çağrı argümanları normal AST dolaşımında ayrıca taranır. Çözümlenemeyen computed property inceleme ister. Bu ayrım, `token: crypto.randomUUID()` gibi ifadeyi gömülü secret literal'ı saymama olanağı sağlar; fonksiyon çağrısına güvenilir statüsü vermez.

Desteklenmeyen uzantı, bozuk parse, geçersiz metin, 256 KiB üstü kaynak ve 100.000 AST düğümü üstü analiz `blocked/review_required` ile kapanır. Prototip sonucu üretim ön incelemesini geçersiz kılmaz. Çalışma zamanı değerleri, değişken/alias akışı, dolaylı fonksiyon sonuçları, dinamik property çözümlemesi ve AST dışındaki ikili/oluşturulmuş içerikler bütünüyle kapsanmaz. Düzenli ifadeler ve yorumlar içerik olarak taranır; desteklenmeyen yapı için temiz güvenlik sonucu üretilmez.

## Bağımlılık ve bakım

Repository bağımlılıklarında uygun bir JavaScript/TypeScript parser bulunmadı. Prototip için yalnız devDependency olarak tam sürüm `typescript@6.0.3` eklendi. Paket metadata'sı Apache-2.0 lisansını, Node `>=14.17` koşulunu ve runtime bağımlılığı bulunmadığını gösteriyor; proje Node `>=20.9` gerektiriyor. Compiler API'nin `createSourceFile`/AST yüzeyi kullanılıyor. Sürüm sabitlendi; prototip deneysel kaldığından runtime dependency yapılmadı. `npm audit` registry DNS çözümlemesi `ENOTFOUND registry.npmjs.org` nedeniyle çalışmadı; bu paket güvenlik denetiminden geçtiği anlamına gelmez. POSIX kurulum/test doğrulaması yapılmadı.

## Karşılaştırma ve test kanıtı

- SASC-01: mevcut düz sınıflandırıcı uzun JavaScript/TypeScript tanımlayıcılarını `high_entropy` sayarken prototip bunları sözdizimsel tanımlayıcı olarak ayırıyor.
- SASC-02/03: aynı uzun metin literal, sentetik bilinen imza, regex ve yorum içeriği olarak verildiğinde literal/imza bulgusu korunuyor.
- SASC-04/05: hassas alandaki dinamik çağrı inceleme istiyor; çağrı argümanındaki sentetik imza ayrıca yakalanıyor. İç içe nesne/dizi, computed sabit property ve yüksek entropili hassas literal kontrolleri de sınanıyor.
- SASC-04 ek regresyonları: mevcut düz sınıflandırıcı tarihsel fixture biçimindeki `token: crypto.randomUUID()` metnini `known_signature` olarak sınıflandırıyor; sözdizimi prototipi bunu dinamik hassas alan ifadesi olarak işaretliyor ve imza bulgusu üretmiyor. Çağrı argümanındaki literal taraması ayrı testte korunuyor. Statik computed-key ataması, mantıksal assignment operatörü ve destructuring assignment da hassas dinamik değer olarak inceleme ister.
- SASC-06/07/08: dinamik computed key, template/JSX metni, kaçış çözümleme, sabit string birleştirme ve statik template birleştirme sınandı.
- SASC-09/10: hatalı, desteklenmeyen, eksik ve limit üstü kaynak fail-closed sonuç veriyor.
- `node --test tests/syntax-aware-secret-classifier.test.js`: son hedefli koşuda 10 test geçti.
- `node --test tests/review-source-manifest.test.js`: yükseltilmiş normal izinli koşuda 16 test geçti. Önceki sandbox koşusundaki RSM-05C `EPERM`, geçici dizin rename işlemine aitti; izinli koşuda tekrar etmedi.
- Mevcut memory secret testlerinin seçili kümesi normal sandbox'ta geçici journal `EPERM` aldı; aynı gerçek testler normal izin yükseltmesiyle 3/3 geçti. Bu sınıflandırıcı kusuru değildir ve test toleransı değiştirilmedi.
- Son tam suite koşusu `npm.cmd test`: 1016 test, 1012 başarılı, 4 atlandı, 0 başarısız. Suite, sandbox temp rename/journal EPERM'leri nedeniyle normal Windows izinleriyle çalıştırıldı. Çıkış kodu alınamadan kesilen ilk oturum başarı sayılmadı; bu sonuç ayrı son koşudan geldi.
- `npm.cmd run verify` ve `npm.cmd run verify:ci` başarılı. Verify içindeki DeepSeek API/health sonucu `apiAvailable=false`; inference veya capability probe çalıştırılmadı. MCP şeması değişmediğinden smoke çalıştırılmadı.
- `npm audit` registry DNS çözümlemesi `ENOTFOUND registry.npmjs.org` nedeniyle başarısız oldu; bağımlılık zafiyet denetimi tamamlanmadı.
- Son kaynakta hedefli prototip suite'i 10/10, review-source-manifest suite'i 16/16 ve seçili memory secret regresyonları 3/3 geçti. Final `npm.cmd test` 1016 test/1012 geçti/4 atlandı/0 başarısız; `npm.cmd run verify` ve `npm.cmd run verify:ci` başarılıdır. Sandbox içindeki ilk RSM-05C rename ve memory journal işlemleri `EPERM` verdi; aynı hedefli testler normal Windows izinleriyle tekrar başarıyla geçti. `git diff --check` commit öncesinde son kez çalıştırılacak.

## Bağımsız inceleme ve üretim kararı

Option B için önceki inceleme preflight reddi ayrıca kayıttadır; prototip değişikliklerinin incelemesi için yeni bir salt-okunur istek yapıldı. İstek metadata'sında `requestedModel=gpt-6.1-sol`, `backend=codex`, `resolvedModel=null`, `sourceScopeStatus=blocked`, `sourceDeliveryStatus=not_attempted` ve `reviewResultValidated=false` döndü. Bu nedenle gerçek Sol modeli çalıştırılmadı ve bağımsız denetim tamamlanmadı. Metadata'yı okuyabilmek için aynı çağrı bir kez sehven tekrarlandı; ikinci sonuç da bloklu kaldı, kod/doküman scope'u değişmedi ve hiçbir kaynak teslim edilmedi. `adapterAttempts` metadata alanı bulunmadığından sayı çıkarılmadı. Reddedilen içeriği maskeleyip, kodlayıp, bölüp veya başka sağlayıcıya taşıyarak engel aşılmadı; yeni Sol isteği yapılmadı.

Gönderilen dokuz dosyalı kapsam, yerelde aynı üretim `classifySecretLikeContent` fonksiyonuyla ayrıca sınıflandırıldı. Bu ölçümde `package-lock.json` `high_entropy`, `subagent-bridge/src/memory.js` `known_signature`, bu rapor `known_signature`, `DURUM_INDEKSI.md` ile handoff `mixed`; prototip modülü, testi, `package.json` ve `review-source-manifest.js` `none` döndürdü. Review-source-manifest'in kaynakta dosya metni üzerinde çalışan mevcut sınıflandırıcıya bağlandığı doğrulandı. Bu sinyaller istek kapsamının neden preflight engeline takılmış olabileceğine dair yerel kanıttır; MCP sonucu engel sinyali ve aday eşlemesini vermediğinden gerçek reddin hangi girdi/sinyalinden kaynaklandığı kesinleştirilemez. Bu kapsam yeniden gönderilmedi.

Prototipi üretime bağlamak için gereken tek dar karar, mevcut üretim preflight karar yolunun JavaScript/TypeScript dosyalarında bu AST tabanlı sınıflandırıcıyla değiştirilmesine izin verilmesidir. Bu karar; imza ve entropi kontrollerinin aynı kalmasını, tüm blok/fail-closed koşullarını, kapsam dışı verinin mevcut üretim kontrolünde kalmasını ve bağımsız güvenlik incelemesini açıkça kapsamalıdır. Bu karar burada verilmemiştir; üretim davranışı değişmemiştir. Final review preflight reddi için gerekli karar, prototipin denetim girdisini güvenlik kontrolü değişmeden kabul edilebilir hale getirecek yerel nedenin kanıtlanmasına bağlıdır; ret içeriği yeniden gönderilmemelidir.

P1b, P2'nin kalan canlı kapıları, P3 canlı entegrasyonu ve P6 açık kalır. Bu yerel prototip veya test kanıtı canlı kabul değildir. Option B kapalı kalır; canlı provider, batch, revalidation veya entegrasyon yapılmamıştır.
