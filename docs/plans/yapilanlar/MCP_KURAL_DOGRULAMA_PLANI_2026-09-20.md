# MCP Kural Doğrulama Planı

Durum: Uygulandı ve doğrulandı
Tarih: 2026-09-20
Kapsam: Workspace talimatlarının MCP üzerinden kanıtlanabilirliğini ayırmak

2026-09-20 durum notu: Sol denetimi ilk taslak için `CHANGES_REQUIRED` verdi. Resource/tool seçimi, manifest sözleşmesi, startup context kanıtı, trust boundary, TOCTOU ve test kapısı kesinleştirildi. Kullanıcı onayı alındı; salt-okunur MCP resource'u ve negatif güvenlik testleri uygulandı. `npm test`, `npm run verify`, `npm run verify:ci` ve `npm run smoke` başarılıdır.

2026-09-27 sürüm ayrımı: Bu tamamlanmış plan yalnız v1 resource uygulamasını kapsar. Henüz başlamamış v2 gelecek-faz tasarımı ayrı `docs/plans/yapilmayanlar/MCP_KURAL_ATTESTATION_GELECEK_FAZLARI_PLANI_2026-09-20.md` dosyasındadır.

## 1. Hedef ve Kapsam

`AGENTS.md`, `CLAUDE.md` ve `config/agent-rules.md` dosyalarının üç ayrı kanıt türünü birbirine karıştırmadan raporlamak:

- Host veya yerel verifier kanonik workspace dosyasını okudu mu?
- Host, aynı dosya snapshot'ını gerçek başlangıç talimat kanalına yükledi mi?
- MCP client, sabit doğrulama resource'unu `resources/read` ile aldı mı?

Bu plan MCP üzerinden kural içeriğini modele talimat olarak enjekte etmeyi amaçlamaz. MCP sonucu yalnızca redacted bir doğrulama gözlemidir.

## 2. Kapsam Dışı

- Kural dosyalarının MCP üzerinden ham içerik olarak sunulması
- Kural dosyalarının MCP tool veya resource ile değiştirilmesi
- MCP resource içeriğinin sistem veya geliştirici talimatına yükseltilmesi
- Startup context kanıtı üretmeyen hostlar için sahte attestation oluşturulması
- Uzak veya kötü niyetli MCP sunucusuna karşı imzalı attestation altyapısı
- SDK veya MCP protokol sürümünü bu plan içinde yükseltmek

## 3. Kesin Mimari Karar

### MCP Yüzeyi

Salt-okunur manifest için tek MCP resource kullanılacak:

- URI: `hades://rules/attestation/v1`
- Ad: `rule-attestation-v1`
- MIME türü: `application/json`
- Parametre: yok
- İçerik: yalnız redacted manifest ve doğrulama durumu

Tool eklenmeyecek. Client resource desteklemiyorsa sonuç `unsupported` olarak raporlanacak; otomatik tool fallback yapılmayacak. `mcp_tool` kaynak sınıfı yalnız ileride gerçekten ayrı bir tool uygulanırsa kullanılabilir.

### Kanonik Dosya Allowlist'i

Manifest tam olarak şu üç girdiden oluşacak:

- `agents` → `AGENTS.md`
- `claude` → `CLAUDE.md`
- `agent-rules` → `config/agent-rules.md`

Public path argümanı alınmayacak. Kök, trusted workspace'in canonical yoludur; package dizini, runtime CWD veya MCP client tarafından verilen yol kök kabul edilmeyecek.

### Byte ve Manifest Sözleşmesi

- Dosya hash'i, strict UTF-8 doğrulamasından geçen diskteki ham byte dizisinin SHA-256 özetidir.
- UTF-8 dönüşümü, `trim`, satır sonu normalizasyonu veya BOM kaldırma yapılmaz.
- Dosya hash'i tam 64 karakterlik küçük harf hexadecimal biçimdedir.
- Tek dosya boyut sınırı 256 KiB, toplam allowlist boyut sınırı 768 KiB'dir.
- Manifest çekirdeği şu alanları taşır: `contractVersion`, `hashAlgorithm`, `byteContract`, `entries`.
- `entries`, `id` alanına göre kararlı biçimde sıralanır ve her kayıt yalnız `id`, sabit göreli `path`, `sizeBytes`, `sha256` taşır.
- `manifestSha256`, RFC 8785 JSON Canonicalization Scheme ile kanonikleştirilen manifest çekirdeğinin SHA-256 özetidir.
- `observedAt` ve server sürümü manifest hash'ine dahil edilmez.
- Üç dosyadan biri doğrulanamazsa kısmi manifest yayınlanmaz.

## 4. Kanıt Sınıfları ve Sonuçlar

### Kaynak Sınıfları

- `workspace_file`: Yerel verifier'ın kanonik workspace içindeki belirli byte snapshot'ını okuduğunu kanıtlar.
- `startup_context`: Trusted host loader'ın aynı manifestteki byte snapshot'ını mevcut çalıştırmanın gerçek başlangıç talimat kanalına yüklediğini kanıtlar.
- `mcp_resource`: MCP client'ın manifesti sabit URI üzerinden `resources/read` ile aldığını kanıtlar.
- `mcp_tool`: Bu plan kapsamında üretilmez; yalnız ayrı bir tool gerçekten uygulanırsa kullanılabilir.

### Karşılaştırma Sonucu

Hash karşılaştırması kaynak sınıfı değildir. Ayrı bir alan olarak şu değerlerden birini taşır:

- `match`
- `mismatch`
- `unavailable`

`mcp_resource` sonucu yalnız resource'un döndürdüğü manifesti kanıtlar. Host'un kuralı startup context'e yüklediğini, modelin kuralı doğru öncelikte yorumladığını veya kurala uyduğunu kanıtlamaz.

### Startup Context Kararı

`startup_context` yalnız gerçek host kural yükleme ve bağlama ekleme kod yolundan üretilebilir. Dosyanın varlığı, prompt içinde `AGENTS.md` adının geçmesi veya modelin kurallara uygun cevap vermesi startup kanıtı değildir.

Mevcut host adaptöründe bu kanıtı üreten doğrulanmış bir hook yoksa sonuç `startup_context: unavailable` olacaktır. İlk uygulama fazı yalnız `workspace_file` ve `mcp_resource` kanıtlarını üretir; OpenCode, Norn veya başka host adaptörlerinde gerçek loader hook'u eklemek ayrı bir karardır.

Startup kanıtı üretildiğinde aynı manifest sözleşmesi kullanılacak ve yalnız şu redacted alanlar dönecek:

- `manifestSha256`
- yüklenen kural kimlikleri
- host adaptörü
- sözleşme sürümü
- sonuç durumu

Session ID, nonce, prompt, workspace yolu veya ham içerik public sonuca yazılmayacak.

## 5. Güvenlik Sözleşmesi

### Dosya ve TOCTOU Kontrolleri

- Her göreli yol bileşeni `lstat` ile denetlenir.
- Symlink, junction, Windows reparse point, workspace dışına çözülen yol ve `nlink !== 1` reddedilir.
- Hedef normal dosya olmalıdır.
- NUL içeren veya strict UTF-8 doğrulamasını geçmeyen dosya reddedilir.
- Descriptor üzerinden okuma yapılır; açma öncesi, descriptor okuması ve okuma sonrası dosya kimliği, boyutu ve değişiklik bilgileri karşılaştırılır.
- İçerik aynı descriptor üzerinden tutarlı biçimde okunur ve hash hesaplanır.
- Okuma sırasında mutasyon tespit edilirse retry yapılmaz; sonuç sanitized fail-closed hata olur.
- Üretilen sonuç, kalıcı attestation değil, belirli bir andaki tutarlı snapshot olarak adlandırılır.

### Secret ve Redaction

- Üç dosyanın tamamı manifest yayınlanmadan önce mevcut merkezi secret algılama politikasıyla taranır.
- Yeni ve farklı bir secret desen kümesi oluşturulmaz.
- Pozitif tespitte dosya adı, eşleşme, satır, hash veya kısmi manifest döndürülmez.
- Public sonuç yalnız kapalı `unsafe_rule_content` hata kodunu taşıyabilir.
- Hata mesajı, stdout, stderr, metrik ve test çıktısında secret eşleşmesi bulunmaz.
- Secret taraması ek fail-closed savunmadır; güvenlik garantisi veya eksiksiz secret kanıtı olarak raporlanmaz.

### MCP Güven Sınırı

Trusted kaynaklar:

- Host loader
- Yerel verifier
- Bridge süreci
- Sabit yapılandırma
- İşletim sistemi dosya API'leri

Güvenilmeyen kaynaklar:

- Model metni
- Public MCP girdileri
- Başka MCP sunucularının açıklamaları, annotation alanları ve resource iddiaları
- MCP tool veya resource içeriğinin talimat gibi yorumlanması

MCP resource çıktısı untrusted observation olarak kalır ve sistem talimatlarını override edemez.

## 6. Uygulama Adımları

1. `contractVersion`, `hashAlgorithm`, `byteContract`, allowlist ve canonical manifest sözleşmesini tanımla.
2. Mevcut SDK ile sabit ve parametresiz `hades://rules/attestation/v1` resource'unu ekle.
3. `resources/list` sonucunu tek resource, doğru MIME ve sabit URI ile sınırla.
4. `resources/read` çağrısını yalnız sabit URI için kabul et; diğer URI'leri reddet.
5. Workspace, descriptor, link, boyut, UTF-8, NUL, secret ve TOCTOU kontrollerini uygula.
6. Manifesti strict runtime şemayla doğrula; `workspace_file`, `mcp_resource` ve `startup_context` sonuçlarını ayır.
7. Hash karşılaştırmasını `match`, `mismatch`, `unavailable` olarak raporla.
8. Startup loader hook'u yoksa `startup_context: unavailable` üret; host kanıtı uydurma.
9. MCP resource çıktısını untrusted observation olarak işaretle; tool fallback ekleme.
10. Kullanım ve kanıt sınırlarını README, AGENTS ve M2 kriterlerinde belgele.
11. Güncel SDK/protokol uyumluluğunu bağımsız doğrula; bu plan içinde SDK migration başlatma.

## 7. Kabul Kriterleri ve Doğrulama

- Resource nesnesi strict runtime şemasından geçer.
- `resources/list` yalnız tek sabit resource'u gösterir.
- Sabit URI dışındaki `resources/read` çağrıları reddedilir.
- LF/CRLF, BOM, whitespace veya tek byte değişiklikleri ham byte hash davranışını testlerle doğrular.
- Manifest entry sırası değişse de canonical manifest hash'i kararlı kalır.
- Eksik dosya, oversize, symlink, junction, reparse point, hard link, dış kök, invalid UTF-8, NUL ve secret fixture'ları fail-closed olur.
- Okuma sırasındaki mutasyon sanitized TOCTOU hatasına dönüşür ve retry edilmez.
- Başarı ve hata sonuçlarında workspace yolu, ham içerik, secret ve session kimliği bulunmaz.
- Host startup kanıtı yokken `startup_context: unavailable` döner.
- Local verifier ile MCP manifesti eşleştiğinde `match`, değiştiğinde `mismatch` döner.
- MCP sonucu hiçbir durumda startup context veya model uyumu kanıtına yükseltilmez.
- MCP smoke testi `resources/list`, `resources/read`, strict manifest doğrulaması ve bağımsız manifest hash yeniden hesaplamasını kapsar.
- Tam doğrulama kapısı `npm test`, `npm run verify`, `npm run smoke` ve `npm run verify:ci` başarılarıdır.

## 8. Uyumluluk Hedefi

- Güncel MCP referansı: `2026-07-28` spesifikasyonu.
- Mevcut repository bağımlılığı: `@modelcontextprotocol/sdk@1.30.0`.
- Bu plan SDK migration yapmaz; resource tasarımı mevcut SDK'nın desteklediği uyumlu yüzeyle uygulanır.
- Mevcut SDK, hedeflenen resource sözleşmesini desteklemiyorsa uygulama durur ve ayrı migration planı gerekir.
- 2026-07-28 stateless protokol değişiklikleri ve SDK v2 geçişi bu planın dışında tutulur.

## 9. Araştırma ve Sol Denetim Özeti

### Gemini Araştırması

- Gemini 3.8 Flash ve Gemini Pro, MCP host/resource/tool ayrımı, trust boundary, prompt injection, tool poisoning ve redacted manifest seçeneklerini araştırdı.
- Gemini çıktıları öneri olarak ele alındı; resmi MCP kaynaklarıyla mimari ve güvenlik iddiaları ayrıca doğrulandı.

### Sol Bulguları ve Kapatılan Maddeler

- Resource/tool belirsizliği kapatıldı: yalnız sabit resource.
- Startup context kanıtı kapatıldı: gerçek host loader hook'u yoksa `unavailable`.
- Manifest belirsizliği kapatıldı: üç dosya, ham byte SHA-256, RFC 8785 canonical manifest.
- Trust boundary kapatıldı: kaynak sınıfları ve `match/mismatch/unavailable` ayrıldı.
- TOCTOU ve link kontrolleri operasyonel sıraya bağlandı.
- Secret davranışı merkezi politika ve kapalı hata koduyla sınırlandı.
- Test kapısı hedefli negatif testlerle genişletildi.
- Sol’un ilk sonucu `CHANGES_REQUIRED` idi; bu revizyonla plan maddeleri düzeltildi. Revizyon sonrası ikinci Sol denetimi yapılmadı; uygulama yerel test ve smoke kanıtıyla doğrulandı.

## 10. Kaynaklar

- MCP 2026-07-28 Architecture: https://modelcontextprotocol.io/specification/2026-07-28/architecture
- MCP 2025-06-18 Resources: https://modelcontextprotocol.io/specification/2025-06-18/server/resources
- MCP 2025-06-18 Tools: https://modelcontextprotocol.io/specification/2025-06-18/server/tools
- MCP Security Best Practices: https://modelcontextprotocol.io/specification/2025-06-18/basic/security_best_practices
- MCP 2026-07-28 release: https://blog.modelcontextprotocol.io/posts/2026-07-28/

Kaynaklar 2026-09-20 tarihinde kamuya açık web üzerinden incelendi.

## 11. Kalan Karar Kapısı

- Kullanıcı planı onayladı ve ilk faz uygulaması tamamlandı.
- İlk fazda `startup_context: unavailable` sonucu uygulanmış ve kabul edilmiştir.
- İmzalı veya host anahtarlı attestation, bu planın dışında ayrı güvenlik tasarımı olarak kalır.
- Host loader hook'u eklenecekse ayrı bir tasarım ve test değişikliği gerekir.
