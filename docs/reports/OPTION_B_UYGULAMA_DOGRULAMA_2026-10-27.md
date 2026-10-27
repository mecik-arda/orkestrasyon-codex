# Option B üretim MCP/runtime uygulaması ve yerel doğrulama

Tarih: 2026-10-27 Türkiye

## Kapsam ve durum

Option B için ayrı, varsayılanı kapalı MCP/runtime akışı eklendi. Kaynakta `config/policy.json` içindeki `parallelBatch.atomicIntegrationEnabled` değeri `false` kaldı; kullanıcı runtime yapılandırması değiştirilmedi. MCP aracı yalnız bu bayrak ve mevcut paralel batch/onay kapıları etkinse kaydedilir. Gerçek stdio smoke varsayılan yapılandırmada bu yeni aracı yayımlamadı. In-memory MCP testinde bayrak yalnız test fixture'ında açılarak gerçek MCP handler → runtime → üretim batch servisi → üretim Git/worktree yöneticisi zinciri sınandı.

Kullanıcının işlemsel yetkisi; önceden okunan detail artifact'inin bitiş süresi, diff/preview/payload hash'leri, base commit, tüm-ref snapshot hash'i, kaynak dosya durumları ve opaque dosya-kimliği hash'i, caller/workspace/batch ilişkisi ve bir nonce ile bağlanır. Uygulama aynı workspace kernel edit kilidini alır, kaynak/ref koşullarını yeniden kontrol eder ve durable tek-kullanımlık işlem kaydını atomik olarak yayımlar. İç `approvalRef` yalnız mevcut üretim apply fonksiyonunun arayüzünü karşılamak için geçici üretilir; kullanıcı yetkisi sayılmaz, saklanan onay referansına geri döndürülür ve public sonuçtan çıkarılır. Nonce yalnız hash biçiminde kalıcı kaydedilir; tekrar çağrı reddedilir.

Operasyon durumları `applying`, isteğe bağlı `cancel_requested`, kalıcı commit kararından sonra `committing`, promotion journal commit marker'ı sonrası `committed`, finalize sonrası `applied` olarak ilerler. İptal `committing` kararından önce CAS ile kazanırsa kaynak uygulanmaz. Karar öncesi çöküşte recovery operasyonu reddeder; commit marker'ı olan işlemde recovery gerçek promotion journal'ını uzlaştırır ve apply'ı tekrarlamaz. Her-ref hash ve kaynak kontrolleri değişmedi; otomatik ref istisnası, isim alanı veya hedef fingerprint tabanlı kabul eklenmedi.

## Yerel kanıt

- Son kaynakta `npm.cmd test`: 1006 test, 1002 başarılı, 4 atlandı, 0 başarısız.
- Option B P3 testleri: bire bir görülen diff/payload uygulaması; nonce tekrarının reddi; varsayılan kapalı davranış; artifact süresi ve source/ref drift; işlem sırasında ref drift; iptal/commit kararı yarışı; recovery; mevcut kernel lock çekişmesi; production commit marker recovery; aynı içerikli farklı dosya kimliğinin reddi.
- MCP negatif şema testleri yanlış tip ve bilinmeyen alanları reddetti. In-memory MCP E2E, gerçek üretim runtime zincirinde edit diff'ini gösterip aynı yetkilendirilmiş işlemde uyguladı ve ek provider çağrısı olmadığını doğruladı.
- `npm.cmd run verify`: başarılı. Codex CLI sürüm/kurulum sağlığı bulundu; model erişimi probe edilmedi. DeepSeek health/API unavailable raporlandı.
- `npm.cmd run smoke`: başarılı. Gerçek yerel stdio MCP client/server tool ve resource yüzeyini, kural attestation eşleşmesini ve workspace hash'ini doğruladı. Varsayılanı kapalı yeni araç listede yoktu. Workspace identity eşleşmesi çalışan kod revision'ı veya startup kural yüklemesini kanıtlamaz. Smoke sağlık kontrolleri inference ya da provider görevi başlatmadı.
- `npm.cmd run verify:ci`: başarılı.
- `git diff --check`: rapor, handoff ve indeks güncellemelerinden sonra başarılı.
- Tam suite'in dört platform atlaması Windows ortamına özgü mevcut skip'lerdir. POSIX doğrulaması yapılmadı; Windows başarısı POSIX kanıtı değildir.

## Bağımsız inceleme durumu

Salt-okunur reviewer çağrısında istenen model `gpt-6.1-sol` olarak verildi. Review preflight, scope içindeki bir öğe için `high_entropy`/`known_signature` güvenlik sinyali bildirerek kaynak teslimini engelledi: adapter denemesi `0`, kaynak teslimi `not_attempted`, model sonucu doğrulanmadı. Reddedilen içeriğin dosyası veya içeriği bu rapora, loga ya da başka prompta kopyalanmadı; inceleme kapsamı bölünerek, kodlanarak veya başka sağlayıcıya taşınarak ret aşılmadı. Bu nedenle değişiklikler bağımsız Sol denetiminden geçmiş değildir ve final bağımsız review açık engel olarak kalır.

## Sınırlar ve canlı durum

Kernel advisory kilidi yalnız aynı güvenilir lock root'unu ve coordinator protokolünü kullanan uyumlu bridge süreçlerini eşgüdümler. Kilide uymayan dış yazıcıya karşı path kontrolü ile rename/unlink arasında tam atomiklik iddia edilmez. Herhangi bir dış yazıcı kaynak/ref'i değiştirdiğinde kontrollere yakalanan drift fail-closed reddedilir; kontrol ve dosya sistemi değişimi arasındaki lock-dışı yarışın tüm ortamlarda önlendiği kanıtlanmış değildir. Güç kaybı ve dosya sistemi dayanıklılığı platforma bağlıdır.

Bu çalışma canlı provider çağrısı, capability probe, batch başlatma, revalidation veya kaynak entegrasyonu yapmadı. Option B akışı kişisel config'te etkinleştirilmedi. P1b, P2'nin kalan canlı kapıları, P3 canlı entegrasyonu ve P6 açık kalır; yerel uygulama ve testler bunları tamamlamaz.
