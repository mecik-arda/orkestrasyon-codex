# Hades Hafıza Yazma Skill'i Planı

Durum: APPROVED_WITH_RISKS, uygulandı ve denetlendi
Tarih: 2026-09-20
Kapsam: Açık kullanıcı komutuyla Hades kalıcı hafızasına güvenli ve kolay kayıt

2026-09-20 durum notu: Beşinci Codex Sol plan denetiminin iki medium ve bir low bulgusu plana işlendi; kapanış Sol denetimi kritik bulgu olmadan `APPROVED_WITH_RISKS` verdi. Plan uygulandı: kanonik `.agents/skills/hafiza-vault-bakimi/SKILL.md` açık yazma niyeti, tek yeni-not zinciri, var olan not güncelleme dalı, güvenlik ve sonuç kapıları ile bounded detection sınırlarıyla güncellendi; `AGENTS.md` gelecekte yararlı bilgi kuralı açık kullanıcı niyetiyle hizalandı; `.claude` kopyası preflight kapılı `skills:sync` ile eşitlendi; dört global dağıtım kökü aynı kanonik içerikle güncellendi. Uygulama Sol denetiminden blocker olmadan `APPROVED_WITH_RISKS` ile geçti. Doğrulama kanıtı: `node scripts/verify-project.js` çıkış 0 ve `hafiza-vault-bakimi` senkron true; `npm test` tam paket geçti; `git diff --check` temiz; `.agents`/`.claude` ağaçları byte eşit; global kök eşitliği ayrı deployment doğrulamasıdır. Bu not planı uygulanmış ve denetlenmiş duruma taşır; residual riskler `13. Kalan açık riskler` bölümünde tarihsel kayıt olarak korunur.

2026-09-27 kapanış bağlantısı: Bölüm 13'teki residual risklerin W1-W6 teknik kapanışı `docs/plans/yapilanlar/HADES_HAFIZA_KALAN_RISKLER_PLANI_2026-09-20.md` içinde tamamlandı. `APPROVED_WITH_RISKS` ilk plan denetiminin tarihsel sonucudur; uygulama ve risk-kapatma planı tamamlanmıştır.

Norn ayrı ve ilgisiz bir projedir. Norn, Norn V8, Norn endpoint'leri, Norn taksonomisi ve Norn ile ortak adapter, bağımlılık veya event akışı tamamen kapsam dışıdır. Bu plan Norn'a ait hiçbir iş, karar, test veya doğrulama içermez.

## 1. Hedef ve sahiplik

Kullanıcı hafızaya yaz useful olarak dediğinde Hades Vault'a güvenli, kolay ve tek komutlu kayıt sağlanacaktır. Tek komut kullanıcı deneyimidir; arka planda hedef kapısı, injection ve PII kapısı, bounded analiz, draft yazımı, SHA-256 kontrolü ve promote akışı korunur. Normal edit veya sohbet oturumu kendiliğinden kayıt başlatmaz.

Bu hedef için ayrı bir `hades-memory-write` skill'i oluşturulmayacaktır. Mevcut `.agents/skills/hafiza-vault-bakimi/SKILL.md` açık hafıza yazma, `analyze_memory_write`, `00_Inbox`, SHA doğrulaması ve `promote_memory` akışının tek front-door sahibidir. Yapılacak tasarım, aynı skill'i `hafızaya yaz useful olarak` ergonomisiyle genişletmektir.

Kabul edilen tek zincir şudur:

`hafiza-vault-bakimi` → `analyze_memory_write` → `store_persistent_memory` → sonuç kapısı → `promote_memory` → sonuç kapısı

Kullanıcı komutu bu zincirden tek bir store/promote akışı üretir. İkinci skill, paralel front-door, ayrı policy enum'u veya aynı işi yapan alternatif akış eklenmez.

## 2. Kanonik kaynak, senkronizasyon ve dağıtım

Kanonik proje kaynağı:

`.agents/skills/hafiza-vault-bakimi/SKILL.md`

Claude senkron kopyası:

`.claude/skills/hafiza-vault-bakimi/SKILL.md`

Mevcut global dağıtım kökleri aynı skill klasörü için şunlardır:

- `~/.config/opencode/skills/hafiza-vault-bakimi/SKILL.md`
- `~/.codex/skills/hafiza-vault-bakimi/SKILL.md`
- `~/.claude/skills/hafiza-vault-bakimi/SKILL.md`
- `~/.agents/skills/hafiza-vault-bakimi/SKILL.md`

`.agents` kanonik proje kaynağıdır. `.claude` kopyası `npm run skills:sync` ile bu kaynaktan eşitlenir. Global kopyalar aynı dağıtımın çalışma ortamı kopyalarıdır; proje `verify` kapısının doğrudan konusu değildir.

Mevcut `config/policy.json` içindeki `skills.allowed` listesinde `hafiza-vault-bakimi` zaten vardır. Bu nedenle yeni skill adı, yeni policy enum'u veya policy allowlist değişikliği planlanmaz. `scripts/verify-project.js` mevcut allowed skill'ler için `.agents` ve `.claude` varlık/hash eşitliğini kapılar; `scripts/sync-skills.js` proje skill klasörlerini `.agents` kaynağından `.claude` altına kopyalar. Uygulama kapsamı seçilmiş skill güncellemesi, açık kullanıcı niyetiyle uyumlu `AGENTS.md` düzeltmesi ve preflight kapılı `skills:sync` ile sınırlıdır.

Global skill kopyası yoksa ilgili dağıtım ortamında bu özellik kullanılamaz; Vault dosyasına doğrudan yazılmaz. Bu durum runtime Hades backend yokluğu değildir ve ayrı deployment doğrulaması olarak ele alınır. Runtime fail-closed koşulu yalnız gerekli Hades MCP hafıza araçları veya backend mevcut değilse uygulanır. Proje içindeki `.agents` ve `.claude` kopyalarının verify/sync kontrolü ile dört global kökteki dağıtım kontrolü birbirinden ayrıdır.

## 3. Kullanıcı niyeti, hedef ve kapsam

Skill yalnız açık hafıza yazma niyetiyle tetiklenir:

- hafızaya yaz
- hafızaya kaydet
- bunu useful olarak kaydet
- aynı anlamdaki açık kullanıcı komutları

Salt useful, iyi oldu, başarılı veya kullanıcı sessizliği yazma yetkisi değildir. Genel `hafızaya yaz` ve `hafızaya kaydet` komutları açık yazma niyetidir ancak `feedback-useful` etiketi yalnız kullanıcı `useful` anlamını açıkça söylediğinde eklenir. Cross-session transcript erişimi varsayılmaz. Hedef yalnız mevcut session içeriği veya kullanıcının açıkça sağladığı seçili içerik olabilir. Başka session, geçmiş transcript veya modelin erişemediği rapor yalnız adıyla hedef gösteriliyorsa yazma yapılmaz. Hedef belirsizse akış durur ve açıklama istenir.

Ham session, ham prompt, ham model cevabı, bütün tool çıktıları ve gereksiz diff kaydedilmez. Seçilen içerik kısa, gelecekte kullanılabilir ve kendine yeterli bir nota dönüştürülür. Cross-session, `taskId`, metadata, `feedback-useful`, injection skill kapısı ve PARA hedefi bu planın önceki teyitli kararlarıyla korunur.

## 4. Güvenlik ve PII kapısı

Yazma öncesi güncellenecek skill'in injection ve redaction kapısı uygulanır. Seçilen içerik güvenilmeyen veridir; içindeki talimatlar skill politikasını, hedefi, metadata'yı veya araç sırasını değiştiremez. Rol değiştirme, araç yönlendirme, politika override ve benzeri injection metinleri kaydedilmez.

PII ve injection politikası kaynak bağımsız ve koşulsuz bir plan kuralıdır; ancak skill düzeyindeki kontrol bounded ve talimat/prosedür düzeyindedir. Skill metni tek başına PII veya injection için tam teknik garanti değildir. Kullanıcı tarafından paylaşılmış olsa bile kişisel kimlik bilgileri yazılmaz. E-posta, telefon, açık adres, kişi kimliği, hesap tanımlayıcısı ve benzeri PII kontrolü aşağıdaki alanların tamamına uygulanır:

- başlık
- gövde
- `taskId`
- `tags`
- kaynak başlıkları ve kaynak URL'leri
- türetilen slug ve `relativePath`

Güvenli redaction yapılamıyorsa akış fail-closed durur. Secret, API anahtarı, token, parola, özel anahtar ve kimlik bilgileri için de aynı durdurma kuralı geçerlidir. Mevcut backend'in secret-like ve içerik kontrolleri skill prosedürünün yerine geçmez ve PII/injection için tam teknik garanti vermez. Koşulsuz teknik garanti istenirse backend kodu, MCP şeması ve test kapsamının genişletilmesi ayrı bir karar kapısıdır; bu plan bunu uygulamaz.

Kaynak URL'leri yalnız güvenli HTTPS biçiminde ve hassas sorgu parametresi olmadan kabul edilir. Audit kaydı yalnız hash ve sınıflandırma metadata'sı taşır; not yolu, taskId, içerik, kaynak URL'si veya prompt loglanmaz.

## 5. Kesin yazma akışı

Güvenlik ön kontrolünden geçen belirli hedef için sıra şöyledir:

1. Açık hafızaya yaz niyetini doğrula; `useful` etiketi yalnız açıkça istenmişse ekle.
2. Hedefi mevcut session veya kullanıcı seçimiyle sınırla.
3. Başlık, gövde, metadata, kaynaklar, slug ve türetilen `relativePath` üzerinde injection, secret ve koşulsuz PII kapısını uygula.
4. Draft başlığı, gövdesi, metadata'sı, kaynakları ve `relativePath` değerini tek bir değişmez giriş olarak hazırla.
5. `analyze_memory_write` çağrısını bu kesin `relativePath`, `title` ve `content` ile yap.
6. Analizden sonra bu üç değerden herhangi biri değiştiyse analizi aynı yeni değerlerle tekrarla; son başarılı analiz ile store çağrısı arasında değişiklik olursa store yapılmaz ve analiz tekrarlanır.
7. `store_persistent_memory` ile `00_Inbox` altında draft oluştur.
8. Store sonuç kapısını geçmeden `promote_memory` çağırma.
9. `promote_memory` ile `00_Inbox` dışındaki yayın hedefine taşı.
10. Promote sonuç kapısını geçmeden başarı bildirimi yapma.

### Analyze girdisi ve sınırı

`analyze_memory_write` için `relativePath`, `title` ve `content` tek draftın kesin değerleridir. Store çağrısında aynı değerler byte düzeyinde korunur; normalize edilmiş benzerlik nedeniyle farklı bir değer kullanılamaz. Değerlerden biri değişirse önceki analiz geçersiz sayılır ve analiz tekrarlanır.

### Store sonucu kapısı

Yeni draft için aşağıdaki koşulların tamamı doğrulanmadan promote yapılmaz:

- `created === true`
- `mutationCompleted === true`
- dönen `relativePath`, beklenen draft `relativePath` ile aynı
- dönen `sha256`, store edilen draftın güncel SHA-256 değeridir
- `auditWritten === true`

`auditWritten === false`, audit recovery bekleyen durumdur. Bu sonuç başarısız veya tamamlanmamış kabul edilir; promote ve başarı bildirimi yapılmaz.

### Promote sonucu kapısı

Promote backend'inin normal ve idempotent dönüşleri ayrı sonuç kapılarıdır. Bu iki dönüş biçiminin alanları birbirine eklenmez ve aşağıdaki doğrulamalar tamamlanmadan başarı bildirilmez.

Normal dönüşte (`idempotent === false`) aşağıdaki koşulların tamamı zorunludur:

- `promoted === true`
- `mutationCompleted === true`
- dönen `sourceRelativePath`, beklenen draft yolu ile aynı
- dönen `targetRelativePath`, beklenen yayın yolu ile aynı
- beklenen kaynak SHA'sı `expectedSourceSha256` ile eşleşir
- `auditWritten === true`

Normal promote dönüşünden sonra `read_persistent_memory` beklenen `targetRelativePath` ile çağrılır. Okunan hedef yolu ve SHA, promote dönüşündeki hedef yolu ve backend'in ürettiği yayın `sha256` değeriyle eşleşmelidir. Bu, bağımsız bir hedef SHA iddiası değildir; hedef dosyanın dönüş sonrası bütünlüğünü kontrol eder. Normal dönüşte `auditWritten === true` ayrıca backend audit kapanış kanıtıdır.

Idempotent dönüşte (`idempotent === true`) backend `mutationCompleted` ve `auditWritten` alanlarını döndürmez. Bu durumda `promoted === true`, dönen kaynak/hedef yolları ve dönen `sha256` değeri beklenenlerle eşleşse bile tam başarı bildirilmez. `read_persistent_memory` beklenen `targetRelativePath` ile çağrılır; okunan hedef yolu ve okuma sonucundaki `sha256`, promote dönüşündeki `sha256` ile yeniden doğrulanır. Bu read-back yalnız yayınlanmış hedef dosyanın bütünlüğünü kanıtlar; audit'in tamamlandığını kanıtlamaz. Sonuç `published_audit_unverified` olarak raporlanır ve teknik audit kanıtı oluşmadan `audit_verified` veya tam başarıya dönüştürülemez. Kullanıcı veya ana orkestratör kararı yalnız bu residual riskin kabulünü ve plan yaşam döngüsünü etkileyebilir. Okuma başarısızsa, yol veya SHA eşleşmiyorsa sonuç `manual_recovery_required` olur. Mevcut backend'in mutation recovery davranışı audit journal'ı yeniden oynatabilir; recovery ancak journal replay sonucu, hedef/source uzlaştırması ve sonraki gözlemlenebilir `auditWritten === true` kanıtı varsa kapanmış sayılır. Bu kanıt MCP yüzeyinde üretilemiyorsa durum çözülmemiş kalır.

Normal dönüşte `auditWritten === false`, promote recovery bekleyen durumdur. Kaynak/hedef ve SHA bilgileri tekrar doğrulanmadan işlem tamamlandı sayılmaz. Hedef doluysa veya kaynak SHA değişmişse dosyalar korunur, başarı bildirilmez ve manuel recovery gerekir. Promote hedefi yazıp kaynağı sildikten sonra audit yazılamazsa hedef korunur, kaynak artık bulunmayabilir ve mutation journal recovery gerekir; bu durum hedef-dolu yarış durumuyla aynı değildir.

## 6. Araç sözleşmeleri ve metadata

`analyze_memory_write` yalnız Vault'u değiştirmeden aday duplicate ve conflict sonuçlarını döndürür.

`store_persistent_memory` için `relativePath`, `title`, `content`, `confidence`, `verificationStatus` ve `taskId` zorunludur. Yeni draft `stage: draft` ile `00_Inbox` altında oluşturulur. `acknowledgeMemoryConflicts` otomatik olarak true yapılmaz. Yeni dosyada `expectedSha256` kullanılmaz. `tags`, HTTPS `sources`, uygun `memoryType`, `reviewAfter` ve `validUntil` yalnız gerçek içeriğe göre eklenir.

`promote_memory` için `sourceRelativePath`, `targetRelativePath` ve `expectedSourceSha256` zorunludur. Kaynak `00_Inbox` altında, hedef `00_Inbox` dışında olmalıdır. Varsayılan yayın hedefi `01_Projects/Orkestrasyon/<slug>.md` olur. Generic bilgi için `03_Resources/<slug>.md` yalnız kullanıcı veya ana orkestratör açıkça seçerse kullanılabilir; başka PARA hedefi otomatik tahmin edilmez.

`useful` backend alanı veya enum değildir. Kullanıcı açıkça useful anlamını belirttiğinde kayıt tag'i `feedback-useful` olur; genel `hafızaya yaz` veya `hafızaya kaydet` komutunda bu tag eklenmez. Bu tag M2 hook useful sonucu değildir; `hook:feedback`, `hook:classify` veya sentetik session kaydı başlatmaz.

Mevcut orchestrator `taskId` kullanılabilir. Yoksa prompt, session kimliği, workspace yolu veya kullanıcı kimliği içermeyen bounded opaque bir memory-write kimliği üretilir. DeepSeek sonucu doğrudan hafızaya yazılmaz; ana orkestratör bağımsız doğrulama ve kalıcılaştırma kararını korur.

## 7. Duplicate, conflict ve bounded detection

İlk sürüm duplicate/conflict tespiti bounded detection olarak işaretlenir. Exact duplicate yalnız normalize edilmiş gövde en az 40 karakter olduğunda ve indekslenen mevcut kaydın normalize edilmiş gövdesiyle aynı olduğunda adaylanır. Same-title conflict normalize edilmiş başlığın mevcut başlıkla aynı olmasıyla adaylanır; hedef yol ayrıca karşılaştırılır.

Bu tespit tam semantik eşdeğerlik veya Vault'un tamamı için tamlık garantisi değildir. Mevcut backend `maxIndexedFiles`, dosya okuma boyutu ve inceleme sınırlarıyla çalışır; indeks ve okuma limitleri nedeniyle kapsam dışında kalan kayıtlar görülemeyebilir. İlk sürüm bu sınırlamayı kullanıcıya ve ana orkestratöre açıkça bildirir. Daha güçlü tamlık, semantik eşdeğerlik veya sınırsız kasa taraması backend değişikliği gerektirir ve ayrı karar kapısıdır.

Duplicate veya conflict adayı bulunduğunda `acknowledgeMemoryConflicts` otomatik true yapılmaz. Yayın durur, aday kullanıcı veya ana orkestratörün bilinçli manuel kararına bırakılır, içerik otomatik birleştirilmez ve reddedilen aday otomatik silinmez. Store backend'inin yeniden analizi bu kuralı tekrar uygular.

## 8. Metadata ve doğruluk

- Ajan türevi ve bağımsız doğrulanmamış içerik `provisional` ve medium, belirsizlik yüksekse low olur.
- Kullanıcı tarafından doğrudan verilen içerik `user-provided` olur; bu, PII yazma istisnası değildir.
- `verified` yalnız bağımsız ve kaynakta teyit edilmiş doğrulama varsa kullanılır.
- `memoryType` içeriğe göre `semantic`, `episodic`, `procedural`, `preference` veya `decision` seçilir.
- `useful` ve `feedback-useful` doğruluk kanıtı değildir ve `verificationStatus` yükseltmez.
- Zamana duyarlı bilgi için UTC ISO-8601 `reviewAfter` veya `validUntil` kullanılır.

## 9. Uygulama kapsamı

Uygulama aşamasında mevcut `.agents/skills/hafiza-vault-bakimi/SKILL.md` ergonomi, tek zincir, güvenlik kapıları, sonuç kapıları ve bounded detection sınırlarını açıklayacak şekilde güncellenir. `AGENTS.md` içindeki gelecekte yararlı bilgi kuralı açık kullanıcı niyetiyle hizalanır: gelecekte yararlı görülen bilgi yalnız aday olarak raporlanır, `store_persistent_memory` için açık kullanıcı niyeti gerekir. `skills:sync` öncesi tüm non-target `.agents/skills` ve `.claude/skills` dosyalarının hash eşitliği kontrol edilir; non-target fark varsa broad sync çalıştırılmaz. Preflight temizse sync çalıştırılır, sonrası diff yalnız hedef skill ile sınırlı doğrulanır. Global dört kök, mevcut dağıtım prosedürüyle ayrı deployment doğrulaması altında güncellenir; bunun için yeni skill klasörü oluşturulmaz. Global kopya yokluğu özellik kullanılamazlığıdır ve doğrudan Vault yazımı başlatmaz; runtime fail-closed yalnız gerekli Hades MCP hafıza araçları veya backend yokluğunda uygulanır.

Bu plan kapsamında yeni skill adı, policy enum'u, policy allowlist girdisi, backend, MCP şeması, runtime kodu veya Norn değişikliği yapılmaz. Gerçek Vault kaydı tüm kapılar doğrulanmadan başlatılmaz.

## 10. Kabul kriterleri

1. Kapanış Sol denetimi `APPROVED_WITH_RISKS` vermiştir. Bounded duplicate detection, prosedürel PII/injection kapısı, idempotent audit kanıtı, global deployment doğrulaması ve uygulama öncesi `AGENTS.md`/skill değişiklikleri açık residual risk veya sonraki uygulama kapılarıdır; plan uygulanmış yazılmaz.
2. Bu revizyonda yalnız seçilmiş plan dosyası değiştirilir; kod, config ve başka dosya değiştirilmez.
3. Mevcut `hafiza-vault-bakimi` skill'inin açık yazma akışının tek sahibi olduğu, ayrı `hades-memory-write` skill'i oluşturulmayacağı ve kullanıcı komutunun tek store/promote zinciri üreteceği açıkça belirtilir.
4. Kanonik kaynak `.agents/skills/hafiza-vault-bakimi/SKILL.md`, senkron kopya `.claude/skills/hafiza-vault-bakimi/SKILL.md` ve dört mevcut global dağıtım kökü doğru yazılır. `hafiza-vault-bakimi` mevcut `skills.allowed` listesinde gösterilir; yeni skill veya enum ekleme iddiası bulunmaz. `skills:sync` öncesi non-target kaynak/hedef hash eşitliği sağlanır; fark varsa sync çalıştırılmaz. Sync sonrası diff yalnız hedef skill ile sınırlıdır. Global kopya eksikliği özelliği kullanılamaz kılar ve doğrudan dosya yazımı başlatmaz; gerekli Hades MCP hafıza araçları veya runtime backend yokluğu ise ayrı ve fail-closed runtime koşuludur.
5. `analyze_memory_write`, `store_persistent_memory`, `promote_memory` sırası; aynı kesin draft `relativePath`, `title`, `content` kullanımı; arada değişiklikte yeniden analiz; `00_Inbox`; metadata; `expectedSourceSha256`; cross-session ve bounded opaque `taskId` kuralları açıkça bulunur.
6. PII ve injection politikası kullanıcı tarafından paylaşılmış veriler için de koşulsuzdur ve başlık, gövde, taskId, tags, source title/URL ve türetilen yolda uygulanır; ancak skill düzeyindeki kontrol bounded ve talimat/prosedür düzeyindedir, tam teknik garanti olarak sunulmaz. Güvenli redaction yoksa fail-closed davranış yazılıdır. Koşulsuz teknik garanti talebi backend kodu, MCP şeması ve test kapsamı için ayrı karar kapısıdır.
7. Store başarı kapısı `created=true`, `mutationCompleted=true`, beklenen draft yolu, SHA-256 ve `auditWritten=true` koşullarının tamamını ister. `auditWritten=false` recovery bekleyen durumdur ve promote engellenir.
8. Promote sonucu normal ve idempotent olarak ayrılır. Normal dönüş `promoted=true`, `mutationCompleted=true`, beklenen kaynak/hedef yolları, `expectedSourceSha256`, promote dönüşü ile hedef read-back SHA eşitliği ve `auditWritten=true` koşullarının tamamını ister. Bu hedef SHA, bağımsız beklenen değer iddiası değildir; dönüş sonrası `read_persistent_memory` ile bütünlük kontrolüdür. Idempotent dönüşte backend'in `mutationCompleted` ve `auditWritten` alanlarını döndürmediği kabul edilir; hedef read-back başarılı olsa bile sonuç `published_audit_unverified` olarak kalır. Journal replay ve source/target uzlaştırması sonrası gözlemlenebilir audit kapanış kanıtı yoksa durum çözülmemiştir; okuma başarısızsa `manual_recovery_required` olur ve tam başarı bildirilmez.
9. Exact duplicate yalnız normalize body en az 40 karakter ve aynı olduğunda; same-title conflict normalize title eşleştiğinde bounded adaydır. İndeks/okuma limitleri nedeniyle tam semantik veya tam kasa garantisi verilmez; güçlü tamlık ayrı backend karar kapısıdır.
10. Genel hafıza yazma komutları `feedback-useful` etiketi üretmez; bu tag yalnız kullanıcı useful anlamını açıkça belirttiğinde eklenir ve M2 hook useful sonucundan ayrıdır. Injection skill kapısı, metadata, PARA hedefi, cross-session sınırı ve Norn dışı kapsam korunur.
11. Önceki Sol bulguları ile üçüncü, dördüncü, beşinci ve kapanış altıncı Sol denetimlerinin bulguları, kaynak dosya/satır aralıkları, somut düzeltmeler ve açık riskler planın sonunda yer alır. Kapanış kararı `APPROVED_WITH_RISKS` olsa da plan bu aşamada uygulanmış sayılmaz.
12. `AGENTS.md` açık kullanıcı niyeti şartıyla uyumlu hale getirilmeden skill uygulamaya hazır sayılmaz; gelecekte yararlı bilgi otomatik store yetkisi vermez.
13. `skills:sync` öncesi non-target kaynak/hedef hash eşitliği kontrol edilir; fark varsa broad sync çalıştırılmaz. Sync sonrası değişiklik kapsamı yeniden kontrol edilir; hedef skill dışında `.claude/skills` değişikliği varsa senkronizasyon kabul edilmez.
14. `published_audit_unverified` yalnız teknik audit kapanış kanıtıyla kapanabilir; kullanıcı veya ana orkestratör kararı bunu `audit_verified` ya da tam başarıya dönüştüremez, yalnız plan yaşam döngüsünde residual risk kabulü sağlayabilir. Promote sonrası audit hatasında hedefin korunabileceği, kaynağın bulunmayabileceği ve bunun hedef-dolu yarış durumundan ayrı recovery olduğu açıkça belirtilir.
15. Model raporları ham kopyalanmaz; kaynak dosya ve satır aralıklarıyla sentezlenir.

## 11. Doğrulama kapısı

Bu revizyon sırasında test, build, script, paket yöneticisi veya dosya mutasyonu yapan shell komutu çalıştırılmaz. Doğrulama ana orkestratörün sorumluluğundadır.

Uygulama sonrası doğrulama sırası mevcut düzenle sınırlıdır:

- `AGENTS.md` içindeki gelecekte yararlı bilgi kuralı açık kullanıcı niyeti şartıyla tutarlı hale getirilir; otomatik store yetkisi bırakılmaz.
- `skills:sync` öncesi non-target `.agents/skills` ve `.claude/skills` dosyalarının hash eşitliği kontrol edilir; fark varsa broad sync çalıştırılmaz. Preflight temizse sync çalıştırılır ve `.agents`/`.claude` eşitliği sağlanır.
- `verify` mevcut `skills.allowed` listesindeki `hafiza-vault-bakimi` için varlık ve SHA eşitliğini kapılar.
- `skills:sync` sonrası `git diff -- .claude/skills` kapsamı kontrol edilir; yalnız `hafiza-vault-bakimi` kopyasının beklenen değişikliği kabul edilir, diğer skill değişiklikleri fail-closed durur.
- Global kopyalar dört dağıtım kökünde kanonik skill ile karşılaştırılır; global kopyalar verify kapsamı dışında oldukları için bu ayrı deployment doğrulamasıdır. Global kopya yokluğu özellik kullanılamazlığıdır ve doğrudan Vault yazımı başlatmaz.
- Dry-run ve hedefli senaryolar açık niyet, explicit useful etiketi, cross-session, injection, bounded ve prosedürel PII kapısı, duplicate/conflict bounded sınırı, aynı girdiler, normal promote read-back SHA/audit doğrulaması, idempotent read-back ve `published_audit_unverified` ayrımı, unresolved recovery terminali, hedef doluluğu ve gerekli Hades MCP hafıza araçları/backend yokluğunda runtime fail-closed davranışını doğrular.
- Backend, MCP şeması veya runtime değişirse proje kurallarındaki güncel test, verify, smoke ve kontrollü pilot kapıları ana orkestratör tarafından uygulanır. Bu planda bu dosyalar değiştirilmez ve bu oturumda komut çalıştırılmaz.
- Norn hiçbir doğrulama kapsamına alınmaz.

## 12. Sol denetim bulguları, düzeltmeler ve açık riskler

Sol kararı: `CHANGES_REQUIRED`. Aşağıdaki sentez ham model raporu değildir; bulgular ilgili kaynak davranışıyla eşleştirilmiş ve plan düzeltmesine dönüştürülmüştür.

### Medium bulgu 1: ikinci front-door ve yanlış kanonik kaynak

Kaynaklar: `.agents/skills/hafiza-vault-bakimi/SKILL.md:1-43`; `AGENTS.md:99-105`; `config/policy.json:7-22`; `scripts/verify-project.js:86-103`; `scripts/sync-skills.js:7-18`; `README.md:221, 284`.

Önceki plan ayrı `hades-memory-write` skill'i ve yeni policy kapısı varsayıyordu. Düzeltme: mevcut `hafiza-vault-bakimi` tek sahip ve tek front-door olarak tanımlandı; ergonomi aynı skill'e eklenecek; mevcut allowlist kullanılacak; `.claude` sync ve dört global dağıtım kökü mevcut düzen içinde kalacak. Yeni skill, enum veya policy girdisi planlanmayacak.

### Medium bulgu 2: duplicate/conflict tamlık iddiası

Kaynaklar: `subagent-bridge/src/frontends/mcp/server.js:170-177`; `subagent-bridge/src/memory.js:1321-1343`; `config/policy.json:95-100, 123-127`.

Önceki plan exact duplicate ve same-title sonuçlarını kasa geneline kesinmiş gibi ifade ediyordu. Düzeltme: exact duplicate normalize body en az 40 karakter ve eşitlik ile, same-title normalize title eşitliği ile bounded aday olarak tanımlandı. `maxIndexedFiles`, dosya okuma ve inceleme limitleri nedeniyle tam semantik veya tam kasa garantisi kaldırıldı. Daha güçlü tamlık ayrı backend karar kapısıdır.

### Medium bulgu 3: PII sınırının koşullu ve eksik olması

Kaynaklar: `.agents/skills/hafiza-vault-bakimi/SKILL.md:34-43`; `AGENTS.md:103-109`; `subagent-bridge/src/frontends/mcp/server.js:188-206`; `subagent-bridge/src/memory.js:315-350`.

Önceki plan kullanıcı tarafından paylaşılmış PII için istisna bırakıyor ve kontrol alanlarını tam saymıyordu. Düzeltme: kullanıcı paylaşmış olsa bile e-posta, telefon, adres ve diğer kişisel kimlik bilgileri yazılmaz; başlık, gövde, taskId, tags, source title/URL ve türetilen yolda koşulsuz kontrol edilir. Güvenli redaction yoksa fail-closed uygulanır.

### Medium bulgu 4: store/promote audit ve mutation sonuç kapıları

Kaynaklar: `subagent-bridge/src/memory.js:1428-1438`; `subagent-bridge/src/memory.js:1443-1525`; `subagent-bridge/src/memory.js:1527-1535`.

Önceki plan SHA'yı kontrol ediyor ancak `created`, `promoted`, `mutationCompleted` ve `auditWritten` birleşik kapısını başarı koşulu yapmıyordu. Bu tarihsel düzeltme kaydı bağımsız hedef SHA beklentisi iddiası olarak okunmamalıdır; güncel promote sözleşmesi bölüm 5'te dönüş sonrası hedef read-back ile tanımlanır. Düzeltme: store için created, mutationCompleted, beklenen draft yolu, SHA ve auditWritten; promote için promoted, mutationCompleted, beklenen kaynak/hedef yolları, kaynak SHA, dönüş sonrası hedef read-back ve auditWritten birlikte zorunlu kılındı. `auditWritten=false` her iki aşamada recovery bekleyen ve başarı bildirimi engelleyen durumdur.

### Medium bulgu 5: analyze/store girdilerinin ayrışabilmesi

Kaynaklar: `subagent-bridge/src/frontends/mcp/server.js:170-206`; `subagent-bridge/src/memory.js:1321-1357`; `AGENTS.md:99-101`.

Önceki plan analiz ile store arasında aynı draft girdisinin değişmezliğini yeterince açık kapılamıyordu. Düzeltme: analyze ve store aynı kesin `relativePath`, `title` ve `content` ile çağrılır; arada herhangi bir değişiklik olursa önceki analiz geçersiz sayılır ve analiz tekrarlanır.

### Low bulgular ve düzeltmeler

- Dağıtım kapsamı düşük bulgusu: yalnız OpenCode global kökü belirtilmişti. `README.md:221, 550` kaynak alınarak `.config/opencode/skills`, `.codex/skills`, `.claude/skills` ve `.agents/skills` dört kökü açıkça yazıldı; global kopyaların verify dışı olduğu korundu.
- `useful` ve M2 hook useful karışıklığı düşük bulgusu: `AGENTS.md:76-82` ve `AGENTS.md:99-101` kaynak alınarak `feedback-useful` yalnız metadata etiketi yapıldı; hook feedback/classify veya sentetik session başlatma yasağı korundu.
- Model raporu ve onay dili düşük bulgusu: `AGENTS.md:30-31, 51, 57-73` kaynak alınarak raporların ham kopyalanmaması, kaynakla sentezlenmesi ve Sol onayı alınmadan planın CHANGES_REQUIRED kalması açıkça yazıldı.
- PARA ve kapsam sınırı düşük bulgusu: mevcut skill'in `SKILL.md:18-43` yazma ve metadata sınırları kaynak alınarak varsayılan `01_Projects/Orkestrasyon`, açık seçimli `03_Resources`, otomatik PARA tahmini yasağı ve Norn dışı kapsam kesinleştirildi.

### İkinci Sol denetimi: üç medium ve bir low bulgu

İkinci Sol denetiminin kararı `CHANGES_REQUIRED` olarak korunur. Aşağıdaki kayıt ham rapor değildir; kaynak davranışıyla eşleştirilmiş düzeltme ve kalan karar kapılarını özetler.

### Medium bulgu 6: skill düzeyindeki PII/injection kapısının teknik garanti olarak sunulması

Kaynaklar: `.agents/skills/hafiza-vault-bakimi/SKILL.md:18-29`; `AGENTS.md:103-107`; `subagent-bridge/src/frontends/mcp/server.js:147-149, 170-236`; `subagent-bridge/src/memory.js:315-350`.

Skill talimatları PII ve injection için bounded, prosedürel bir kontrol kapısı sağlar; mevcut backend'in secret-like ve içerik kontrolleri PII/injection için tam teknik garanti değildir. Düzeltme: kullanıcı tarafından sağlanan PII için koşulsuz yazmama politikası korunur, kontrol alanları ve fail-closed redaction kuralı açıkça yazılır, ancak bu kontrolün skill düzeyinde olduğu ve teknik güvence iddiası taşımadığı belirtilir. Koşulsuz teknik garanti istenirse backend kodu, MCP şeması ve test kapsamının genişletilmesi ayrı karar kapısıdır.

### Medium bulgu 7: promote normal ve idempotent dönüşlerinin ayrılmaması

Kaynaklar: `subagent-bridge/src/frontends/mcp/server.js:219-236`; `subagent-bridge/src/memory.js:1443-1471, 1527-1535`.

Düzeltme: normal dönüşte `promoted`, `mutationCompleted`, yollar, SHA ve `auditWritten` birlikte zorunludur. `idempotent=true` dönüşte backend `mutationCompleted` ve `auditWritten` alanlarını döndürmez; bu nedenle beklenen hedef `read_persistent_memory` ile okunur ve okuma sonucundaki yol ile SHA, promote dönüşündeki SHA'ya karşı yeniden doğrulanır. Okuma başarısızlığı veya uyuşmazlık başarı değildir ve manuel recovery gerektirir.

### Medium bulgu 8: global skill kopyası ile runtime backend yokluğunun karıştırılması

Kaynaklar: `README.md:221`; `scripts/sync-skills.js:7-23`; `scripts/verify-project.js:86-103, 105-135`; `subagent-bridge/src/frontends/mcp/server.js:122-236`.

Düzeltme: global skill kopyası eksikse özellik ilgili dağıtım ortamında kullanılamaz ve doğrudan Vault dosyası yazılmaz; bu ayrı deployment doğrulamasıdır. Runtime fail-closed yalnız gerekli Hades MCP hafıza araçları veya backend yokluğunda uygulanır. Proje `.agents`/`.claude` sync ve verify kapısı ile dört global dağıtım kökünün kontrolü aynı yokluk sınıfı değildir.

### Low bulgu: `CHANGES_REQUIRED` durumunun yeniden denetim yaşam döngüsüne bağlanması

Kaynaklar: `AGENTS.md:30-31, 57-73`; `README.md:318`; bu planın `10. Kabul kriterleri` ve `13. Kalan açık riskler ve yeniden denetim` bölümleri.

Düzeltme: yeniden Sol denetimi öncesi karar ve plan durumu `CHANGES_REQUIRED` kalır. İkinci denetim bulguları kapatıldıktan veya açık residual risk kullanıcı tarafından bilinçli biçimde kabul edildikten sonra `APPROVED_WITH_RISKS` ya da uygun yaşam döngüsü durumu seçilebilir. Yeniden denetim ve bu karar gerçekleşmeden plan uygulanmış, onaylanmış veya tamamlanmış sayılmaz.

## 13. Kalan açık riskler ve yeniden denetim

> Tarihsel kapsam notu (2026-09-27): Aşağıdaki maddeler 2026-09-20 uygulama öncesi risk kaydını korur. W1-W6 teknik azaltımları ve kapanış kanıtı `docs/plans/yapilanlar/HADES_HAFIZA_KALAN_RISKLER_PLANI_2026-09-20.md` içindedir; global skill kopyalarının dağıtım sonrası eşitliği ayrı deployment doğrulamasıdır. Aşağıdaki “henüz uygulanmadı” ifadeleri o tarihli baseline'ı anlatır, güncel plan durumunu değil.

- Bounded duplicate/conflict tespiti indeks, dosya okuma ve arama limitleriyle sınırlıdır; tamlık iddiası yoktur. Tamlık ihtiyacı oluşursa backend değişikliği ayrı karar kapısına alınır.
- Audit yazılamaması recovery gerektirir; `auditWritten=false` başarı veya promote için yeterli değildir. Recovery davranışı uygulama doğrulamasında ayrıca kanıtlanmalıdır.
- Idempotent promote dönüşü `mutationCompleted` ve `auditWritten` alanlarını taşımaz; hedefin `read_persistent_memory` ile yol ve SHA bakımından yeniden doğrulanması zorunludur. Başarılı read-back yalnız dosya bütünlüğünü kanıtlar ve sonuç `published_audit_unverified` olarak kalır. Journal replay ve source/target uzlaştırması sonrası gözlemlenebilir audit kapanış kanıtı yoksa durum çözülmemiş terminal residual riskidir; okuma başarısızlığı `manual_recovery_required` olur.
- Global dağıtım kopyaları proje verify kapısının dışındadır; dört kökte dağıtım sonrası ayrı karşılaştırma gerekir. Global kopya eksikliği özellik kullanılamazlığıdır; runtime fail-closed yalnız gerekli Hades MCP hafıza araçları veya backend yokluğuna aittir.
- Skill düzeyindeki PII/injection kapısı bounded ve talimat/prosedür düzeyindedir; mevcut backend PII/injection için tam teknik garanti vermez. PII veya injection güvenli biçimde redakte edilemiyorsa kayıt kaybedilebilir; bu bilinçli fail-closed residual riskidir. Koşulsuz teknik garanti ayrı backend, MCP şeması ve test karar kapısıdır.
- `AGENTS.md` açık kullanıcı niyetiyle hizalanmadan plan uygulamaya hazır değildir; mevcut daha geniş store yetkisi planın hedeflediği normal edit davranışıyla çelişir.
- `skills:sync` tüm skill'leri kopyalayabildiği için hedef dışı kaynak/hedef farklarında sync öncesi durmak zorunludur; sonrası diff kapısı da korunur.
- Idempotent promote read-back hedef dosya ve SHA bütünlüğünü gösterir, audit tamamlanmasını göstermez. `published_audit_unverified` tam başarı değildir ve kullanıcı/ana orkestratör kararıyla `audit_verified` durumuna yükseltilemez; yalnız plan yaşam döngüsünde residual risk kabulü yapılabilir.
- Gerçek skill metni henüz bu plan kapsamında uygulanmamıştır; backend, MCP ve config değişiklikleri kapsam dışıdır.

Beşinci Sol denetiminin ardından gerekli düzeltmeler bu plana işlenmiş ve kapanış altıncı Sol denetimi tamamlanmıştır. Kapanış kararı `APPROVED_WITH_RISKS`, plan durumu planlandı ve uygulanmadı olarak kalır. Bu karar Sol plan onayını gösterir; skill, `AGENTS.md` veya global kopyalar üzerinde uygulama yapıldığı ya da proje doğrulamasının geçtiği anlamına gelmez.

## Kaynak özeti

Kaynak dosyalar ve kullanılan aralıklar: `.agents/skills/hafiza-vault-bakimi/SKILL.md:1-43`; `AGENTS.md:30-31, 51, 57-73, 76-82, 93-109`; `config/policy.json:7-22, 80-127`; `scripts/verify-project.js:86-103, 105-135`; `scripts/sync-skills.js:7-23`; `subagent-bridge/src/frontends/mcp/server.js:122-236`; `subagent-bridge/src/memory.js:315-350, 1321-1438, 1443-1535`; `README.md:221, 284, 318, 550, 613`.

Bu kaynak özeti model raporlarının ham kopyası değildir. Kararlar yalnız ana orkestratörün kaynakta teyit ettiği davranışlar ve Sol'un CHANGES_REQUIRED denetim girdisiyle sınırlıdır.

## Üçüncü Sol Denetimi

Üçüncü Sol denetimi `CHANGES_REQUIRED` verdi. Kritik bulgu yok; iki medium ve bir low bulgu kaldı.

- Medium: Planın yalnız açık kullanıcı komutuyla yazma hedefi, `AGENTS.md` içindeki gelecekte yararlı bilgi oluştuğunda `store_persistent_memory` kullanım izniyle çelişiyor. Düzeltme: `AGENTS.md` kuralının uygulama kapsamında açık kullanıcı niyeti şartıyla hizalanması ve otomatik store yetkisinin kaldırılması planlandı.
- Medium: Idempotent promote read-back dosya yolu ve SHA bütünlüğünü kanıtlıyor, fakat `auditWritten` kanıtı sağlamıyor. Düzeltme: idempotent sonuç tam başarı sayılmayacak; `published_audit_unverified` veya read-back başarısızlığında `manual_recovery_required` bildirilecek.
- Low: `skills:sync` tüm skill klasörlerini kopyalayabiliyor. Düzeltme: sync sonrası `.claude/skills` diff kapsamı kontrol edilecek ve hedef skill dışındaki değişiklikler fail-closed reddedilecek.

Bu bulgular planın kaynaklarına ve kabul kriterlerine işlendi. Dördüncü Sol denetimi zorunludur; yeniden denetim öncesi karar `CHANGES_REQUIRED` ve plan durumu planlandı, uygulanmadı olarak kalır.

## Dördüncü Sol Denetimi

Dördüncü Sol denetimi `CHANGES_REQUIRED` verdi. Kritik bulgu yok; dört medium ve üç low bulgu tespit edildi.

- Medium: Broad `skills:sync` öncesi hedef dışı kaynak/hedef farkı kontrol edilmediğinde post-sync diff yalnızca hasarı tespit eder. Düzeltme: non-target hash eşitliği preflight kapısı eklendi; fark varsa sync çalıştırılmaz.
- Medium: Idempotent read-back audit kapanışını kanıtlamıyor ve recovery terminal durumu tanımsızdı. Düzeltme: `published_audit_unverified` kalıcı non-success terminali olarak tanımlandı; journal replay, source/target uzlaştırması ve gözlemlenebilir audit kapanış kanıtı olmadan kapanmaz.
- Medium: Normal promote için bağımsız hedef SHA kaynağı yoktu. Düzeltme: bağımsız beklenen hedef SHA iddiası kaldırıldı; promote dönüşündeki SHA, hedef `read_persistent_memory` sonucu ile dönüş sonrası bütünlük kontrolü olarak karşılaştırılır.
- Medium: Genel `hafızaya yaz` komutları ile `feedback-useful` etiketi arasındaki semantik belirsizdi. Düzeltme: genel komutlar açık yazma niyeti sayılır, `feedback-useful` yalnız explicit useful ifadesiyle eklenir.
- Low: `AGENTS.md` ve global deployment adımları uygulama kapsamından ayrı görünüyordu. Düzeltme: `AGENTS.md` proje uygulama kapsamına alındı, global kökler ayrı deployment doğrulaması olarak korundu.
- Low: Üst durum notu üçüncü denetimi yansıtmıyordu. Düzeltme: durum notu dördüncü denetim bulgularını yansıtacak şekilde güncellendi.
- Low: Injection kapısı uygulanmış mevcut davranış gibi yazılmıştı ve `policy.allowed` alan adı hatalıydı. Düzeltme: ifade güncellenecek skill kapısı olarak sınırlandı ve alan adı `skills.allowed` olarak düzeltildi.

Bu bulgular planın kaynaklarına ve kabul kriterlerine işlendi. Beşinci Sol denetimi zorunludur; yeniden denetim öncesi karar `CHANGES_REQUIRED` ve plan durumu planlandı, uygulanmadı olarak kalır.

## Beşinci Sol Denetimi

Beşinci Sol denetimi `CHANGES_REQUIRED` verdi. Kritik bulgu yok; iki medium ve bir low bulgu tespit edildi.

- Medium: `published_audit_unverified` kapanış yetkisi kullanıcı/ana orkestratör kararıyla teknik audit doğrulamasının yerini alabilecek şekilde belirsizdi. Düzeltme: yalnız teknik audit kapanış kanıtının durumu kapatabileceği, kullanıcı kararının yalnız plan yaşam döngüsü residual risk kabulü sağlayabileceği açıklandı.
- Medium: Normal promote sonrası audit hatasında kaynak dosyanın silinebileceği belirtilmemişti. Düzeltme: hedef-dolu yarış durumu ile promote sonrası audit recovery ayrıldı; hedef korunabilir, kaynak bulunmayabilir ve mutation journal recovery gerekir.
- Low: Tarihsel promote bulgusunda bağımsız hedef SHA dili güncel sözleşmeyle karışabilirdi. Düzeltme: tarihsel kayıt açıkça sınırlandı; güncel sözleşme dönüş sonrası hedef read-back olarak belirtildi.

Bu bulgular planın kaynaklarına ve kabul kriterlerine işlendi. Altıncı Sol denetimi tamamlandı ve `APPROVED_WITH_RISKS` kararı verdi; plan durumu planlandı, uygulanmadı olarak kalır.
