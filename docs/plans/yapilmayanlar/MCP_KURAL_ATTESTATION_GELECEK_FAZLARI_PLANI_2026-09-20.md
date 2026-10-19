# MCP Kural Attestation Gelecek Fazları Planı

2026-09-27 durum notu: Bu plan yalnız MCP attestation v2 gelecek fazlarını kapsar; v2 uygulaması başlatılmadığı için `yapilmayanlar` altına alındı. Mevcut v1 uygulaması ayrı `docs/plans/yapilanlar/MCP_KURAL_DOGRULAMA_PLANI_2026-09-20.md` kapsamında tamamlandı.

Durum: Taslak, uygulama yapılmadı; Sol denetimi APPROVED
Tarih: 2026-09-20
Kapsam: Mevcut MCP kural doğrulamasından gerçek startup context kanıtına ve imzalı attestation tasarımına geçiş

2026-09-20 durum notu: Mevcut v1 resource uygulaması `hades://rules/attestation/v1` ile sınırlıdır. `startup_context` bilinçli olarak `unavailable` döner ve mevcut `comparison` değeri aynı çalışma içindeki manifest gözlemlerini temsil eden `match` değeridir. Gemini 3.8 Flash kamuya açık MCP ve güvenlik kaynaklarından araştırma adayları üretti; resmi kaynaklar ana orkestratör tarafından ayrıca incelendi. DeepSeek Flash mevcut repository'yi salt-okunur analiz etti. Bu plan, sonraki fazların karar, bağımlılık, durdurma kapısı ve doğrulama sınırlarını kesinleştirir; plan onayı olmadan uygulama başlatılamaz. Sol'un son salt-okunur denetimi `APPROVED` sonucuyla tamamlandı; plan düzeyinde P0/P1/P2 bulgusu kalmadı.

## 1. Hedef

İki farklı güven iddiasını mevcut v1 gözleminden ayırarak, gerektiğinde ayrı sürümlü ve doğrulanabilir iki gelecek faz tasarlamak:

- Trusted host loader'ın kuralları gerçek başlangıç talimat kanalına yüklediğini kanıtlamak.
- Farklı süreçler veya makineler arasında manifest bütünlüğünü ve kaynağın yetkisini imzalı biçimde doğrulamak.

Bu planın sonucu yeni kod değil, uygulamaya hazır ve bağımsız kabul kriterleri olan tek bir gelecek faz tasarımıdır.

## 2. Mevcut Durum ve Kanıt Sınırı

Mevcut v1 uygulamasının sabit sözleşmesi:

- URI: `hades://rules/attestation/v1`
- Resource adı: `rule-attestation-v1`
- MIME türü: `application/json`
- Kural allowlist'i: `AGENTS.md`, `CLAUDE.md`, `config/agent-rules.md`
- Dosya özeti: strict UTF-8 doğrulamasından sonra diskteki ham byte'ların SHA-256 özeti
- Manifest özeti: canonical manifest çekirdeğinin SHA-256 özeti
- `startup_context`: `unavailable`
- Kaynak sınıfı: `mcp_resource`
- Sonuç: untrusted, redacted gözlem

Mevcut v1 şu iddiaları kanıtlamaz:

- MCP resource'unu sağlayan host'un kendi startup loader'ının kuralları gerçekten yüklediğini.
- Modelin kural içeriğini doğru öncelikte aldığını veya uyguladığını.
- Manifestin başka bir süreçten veya güvenilir bir anahtardan geldiğini.
- Kaynak dosyanın hash'inin bağımsız bir çalışma veya süreç tarafından doğrulandığını.

Mevcut kodda `comparison: "match"`, bağımsız bir ikinci manifestle yapılan karşılaştırma değil, aynı üretilen manifestin attestation sonucu olarak kullanılmaktadır. Gelecek fazda bu alan yeniden tanımlanmadan önce bağımsız gözlem girdisi ve karşılaştırma sahibi kesinleştirilecektir.

## 3. Kapsam Dışı

- v1 URI'sinin veya v1 JSON sözleşmesinin geriye dönük olarak değiştirilmesi
- Kural dosyalarının MCP üzerinden ham içerik olarak yayınlanması
- MCP resource'unun sistem veya geliştirici talimatına yükseltilmesi
- Model davranışının veya kural uyumunun attestation ile kanıtlandığının iddia edilmesi
- Secret algılama politikasının imza mekanizmasıyla değiştirilmesi
- Kullanıcı onayı olmadan anahtar üretimi, anahtar rotasyonu veya üretim rollout'u
- HSM, TPM, KMS veya işletim sistemi credential store seçiminin bu plan içinde varsayılması
- MCP SDK veya protokol migration'ının bu plan içinde başlatılması
- Host loader hook'u bulunmadan `startup_context` değerinin tahmin edilmesi

## 4. Kesin Kararlar

### 4.1 Sürümleme

v1 davranışı dondurulacaktır. Gelecek imzalı sözleşme ayrı bir URI ve ayrı bir runtime schema ile yayımlanacaktır:

- URI adayı: `hades://rules/attestation/v2`
- Resource adı adayı: `rule-attestation-v2`
- `contractVersion`: `2`
- v1 client'ları v2 resource'una yönlendiren otomatik fallback olmayacaktır.
- v2 desteklenmiyorsa sonuç `unsupported` olarak kalacaktır.

URI ve alan adları implementasyon başlamadan önce Sol denetiminden ve kullanıcı plan onayından geçmelidir. Bu iki kapı geçilmeden aday adlar kesin API sözleşmesi sayılmayacaktır.

### 4.2 İmzalanacak Payload

İmza, ham Markdown içeriğine değil, redacted ve canonical manifest payload'ına uygulanacaktır. V2 payload'ı startup kanıtını da açıkça bağlayacaktır; evidence yalnız transport alanı olmayacaktır. Payload şu alanları taşımalıdır:

- `contractVersion`
- `hashAlgorithm`
- `byteContract`
- sıralı allowlist entry kayıtları
- `manifestSha256`
- `issuer`
- `keyId`
- `evidence`
- imza bağlamı ve protokol adı

`evidence` status-temelli discriminated union'dır ve `sourceClass` değeri `startup_context` olur. `status: "match"` kolu `manifestSha256`, sıralı rule IDs, `hostAdapter` ve `contextAssemblyDigest` alanlarını taşır. Bu kol için `payload.manifestSha256 == evidence.manifestSha256` zorunludur ve digest girdisi `{ assemblyStage: "post_context_assembly", hostAdapter, manifestSha256: evidence.manifestSha256, ruleIds }` nesnesidir. `status: "mismatch"` kolu `workspaceManifestSha256`, `loaderManifestSha256`, sıralı loader rule IDs, `hostAdapter` ve `contextAssemblyDigest` alanlarını taşır. Bu kol için `payload.manifestSha256 == evidence.workspaceManifestSha256` zorunludur ve digest girdisi `{ assemblyStage: "post_context_assembly", hostAdapter, manifestSha256: evidence.loaderManifestSha256, ruleIds: evidence.loaderRuleIds }` nesnesidir. `status: "unavailable"` kolu yalnız `reason: "no_trusted_loader_observation"` taşır; loader gözlemi yokken rule IDs veya assembly digest üretilmez. Her digest, belirtilen RFC 8785 canonical UTF-8 byte'ları üzerinde SHA-256 olarak hesaplanır. Bu özet yalnız loader'ın gerçek assembly girdisini bağlar; modelin talimatı doğru yorumladığını veya uyguladığını kanıtlamaz.

`observedAt`, transport metadata'sı, challenge, nonce ve çalışma zamanı log alanları v2 payload'ından çıkarılmıştır. V2 imzalı snapshot bütünlüğünü kanıtlar, güncel veya replay edilmemiş bir gözlem olduğunu iddia etmez. Payload dışı alanlar güvenilir bütünlük iddiası taşımayacaktır.

Canonical serialization için RFC 8785 JSON Canonicalization Scheme kullanılacaktır. RFC 8785 I-JSON kısıtları, duplicate object member reddi ve güvenli number sınırları uygulama öncesi strict schema ile doğrulanacaktır. Unicode normalizasyonu yapılmayacak, string code point'leri RFC 8785 davranışına göre korunacaktır. El yapımı canonicalizer v2 implementasyonunun varsayılanı değildir; mevcut v1 helper'ı doğrudan imza formatı olarak yeniden kullanılamaz.

### 4.3 Kriptografi

Kesin imza profili Ed25519 ve Node.js `node:crypto` API'sidir. İmzalanan byte dizisi `hades-mcp-attestation-v2\0` domain separation öneki ve RFC 8785 canonical payload'ın UTF-8 byte'larından oluşur. Node.js çağrısı `crypto.sign(null, payloadBytes, privateKey)` ve doğrulama çağrısı `crypto.verify(null, payloadBytes, publicKey, signatureBytes)` biçimindedir. Signature değeri 64 byte Ed25519 çıktısının padding'siz base64url kodudur. Public key SPKI DER biçiminde tutulur; `keyId`, public key SPKI DER byte'larının SHA-256 fingerprint'inin küçük harf hexadecimal gösterimidir.

Uygulama öncesi şu noktalar hedef Node.js sürümünde çalışan testle doğrulanacaktır:

- canonical payload üzerinde imza üretimi ve doğrulaması
- yanlış payload, yanlış key ve yanlış signature reddi
- `keyId` ile public key fingerprint eşleştirmesi
- imza uzunluğu, base64url padding reddi ve encoding sınırları
- domain separation ve algorithm confusion reddi

`algorithm` yalnız sabit `ed25519` değerini taşıyan signature envelope alanıdır; verifier başka algoritma kabul etmez. `keyId` yalnız canonical payload içinde bulunur; envelope içinde tekrar edilmez. Algoritma, encoding, key formatı ve fingerprint kuralı erken kod değişikliğinden önce kesinleşmiştir; implementasyon bunları değiştiremez.

### 4.4 Trust Anchor

Public key allowlist'i doğrulayıcı tarafın güven kökü olacaktır. İlk deployment modeli, allowlist'in verifier tarafından salt-okunur trusted configuration olarak yüklenmesi, güncellemenin atomik dosya değişimiyle yapılması ve `storeVersion` değerinin geriye alınamamasıdır. Trust anchor seçimi uygulama kararı değil güvenlik karar kapısıdır. Aşağıdaki koşulların tamamı yazılı olarak belirlenmeden implementasyon yapılmayacaktır:

- Hangi host veya deployment public key'i yetkili sayar?
- Public key allowlist'i nerede ve hangi sahiplikle tutulur?
- `keyId` ile fingerprint nasıl ilişkilendirilir?
- Key rotation sırasında eski anahtarın geçerlilik sonu nasıl belirlenir?
- Revocation veya acil iptal mekanizması nedir?
- Allowlist değişikliği hangi review ve dağıtım kapısından geçer?
- Trust store sürümü nasıl monoton ilerler ve rollback nasıl reddedilir?
- Aktivasyon, sona erme ve rotation overlap penceresi nedir?
- Doğrulayıcı, bilinmeyen `keyId` ve bilinmeyen fingerprint için fail-closed nasıl davranır?
- Revocation state kullanılamaz veya bayatsa verifier hangi fail-closed sonucunu üretir?

Private key dosyaya, source code'a, loga, prompta veya plan içeriğine yazılmayacaktır. Private key custody için OS-protected store, HSM, TPM veya KMS seçeneklerinden biri, hedef deployment bağlamı bilindikten sonra ayrı karar olarak seçilecektir.

### 4.5 Replay ve Zaman

V2 açıkça tazelik, current-process, challenge binding veya replay prevention iddiası taşımaz. V2 sonucu “yetkili anahtarla imzalanmış, belirli bir anda üretilmiş manifest ve loader evidence snapshot'ı” olarak adlandırılacaktır. `issuedAt`, `expiresAt`, nonce, challenge ve clock skew v2 sözleşmesine girmez.

Tazelik veya replay prevention gerekli olursa ayrı bir v3 tasarımı açılmalıdır. Bu tasarımda verifier challenge'ının MCP stateless resource read akışına nasıl taşınacağı, challenge entropisi ve uzunluğu, audience/protocol binding'i, tek kullanımlık state'in atomik tüketimi, eşzamanlı replay yarışı, restart sonrası state ve clock skew ayrıca kesinleştirilecektir. Bu karar verilmeden v2'ye challenge alanı eklenmeyecektir.

## 5. Fazlar

### Faz 0: Sözleşme ve Bağımlılık Envanteri

Amaç, v2 uygulamasına başlamadan tüm dış bağımlılıkları ve kararları kilitlemektir.

Girdiler:

- Mevcut v1 planı ve v1 runtime schema
- `rule-attestation.js`, MCP server registration ve smoke testi
- Mevcut host loader başlangıç akışları
- Hedef Node.js sürümü ve desteklenen işletim sistemleri
- Resmi MCP, RFC 8032, RFC 8785 ve Node.js crypto kaynakları

Çıktılar:

- v2 JSON schema taslağı
- canonical payload byte sözleşmesi
- key formatı, encoding ve algorithm kararı
- trust anchor sahibi ve dağıtım modeli
- v2'nin tazelik/replay iddiası taşımadığına dair karar kaydı
- host loader hook noktası veya hook'un mevcut olmadığını kanıtlayan kayıt
- v2'ye özgü threat model ve açık risk listesi

Durdurma kapısı:

- Host loader çağrı sınırı kaynak satırlarıyla gösterilemiyorsa startup fazı durur.
- Trust anchor sahibi belli değilse imzalı faz durur.
- Canonicalization veya crypto API hedef ortamda test edilemiyorsa imzalı faz durur.
- Tazelik veya replay prevention isteniyorsa MCP taşıma ve state tasarımı ayrı v3 planına taşınır; v2 içine sessizce eklenmez.

### Faz 1: Gerçek Startup Context Kanıtı

Amaç, yalnız gerçek host loader yolundan üretilebilen v2 `startup_context` evidence'ını v1'i bozmadan eklemektir. V1 resource her durumda mevcut `startup_context: unavailable` ve `comparison: match` davranışını korur; Faz 1 v1 JSON sözleşmesine yeni durum eklemez.

Girdiler:

- Faz 0'da doğrulanmış host loader hook'u
- Aynı allowlist için üretilen v1 manifest veya ortak, sürümlü manifest helper'ı
- Host adaptörünün yüklediği kural kimlikleri ve manifest snapshot'ı

Uygulama kuralları:

- Hook, trusted host loader'ın gerçek context assembly işlemi tamamlandıktan sonra çağrılabilir.
- MCP client girdisi, model metni veya resource açıklaması startup kanıtı üretemez.
- Loader'ın gerçek okuduğu byte snapshot ile `workspace_file` snapshot'ı aynı manifest hash'i üzerinden karşılaştırılır.
- Snapshot eşleşmiyorsa `mismatch`; loader gözlemi yoksa `unavailable`; eşleşiyorsa `match` raporlanır.
- Evidence, immutable byte snapshot, manifest bağı, `hostAdapter` ve assembly sonrası opak host yaşam döngüsü kimliğiyle aynı trusted callback veya OS ACL'li authenticated local IPC üzerinden signer'a aktarılır.
- Host yeniden başlatması önceki evidence'ı geçerli current-startup kanıtına dönüştürmez; v2 zaten current-process veya replay prevention iddiası taşımaz.
- Startup evidence içinde prompt, workspace yolu, session ID, ham kural içeriği veya secret bulunmaz.
- Loader hook'u kendi başına attestation imzalamaz; imza Faz 2'nin sorumluluğudur.

Faz 1 çıktıları:

- Host adaptörüne özgü, redacted v2 `startup_context` evidence
- `match`, `mismatch`, `unavailable` için host-içi veya v2 runtime schema ve test fixture'ları; v1 schema değişikliği değil
- Host loader snapshot'ının nasıl elde edildiğini gösteren kaynak ve test kanıtı
- v1 uyumluluk raporu

Faz 1 durdurma kapısı:

- Gerçek loader byte snapshot'ı elde edilemiyorsa `startup_context: unavailable` korunur.
- Sadece prompt metninde kural adı görülmesi kanıt kabul edilmez.
- Host API değişikliği gerekiyorsa ayrı host integration planı açılır.

### Faz 2: İmzalı Manifest Attestation

Amaç, Faz 1'deki redacted manifest ve startup evidence çekirdeğinin yetkili signer tarafından üretildiğini doğrulamaktır. V2 doğrulaması tazelik veya replay prevention iddiası taşımaz.

Girdiler:

- Faz 0'da onaylanmış v2 payload schema ve canonicalization
- Faz 0'da onaylanmış trust anchor ve key custody
- Faz 1 çıktısı veya açıkça `startup_context: unavailable` olan v2 snapshot

Uygulama sırası:

1. Canonical payload üreticisini bağımsız golden vector'larla sabitle.
2. Ed25519 sign ve verify işlevlerini dar bir modülde uygula.
3. Public key allowlist ve fingerprint doğrulamasını fail-closed ekle.
4. `keyId`, signature encoding, signature length ve fixed `ed25519` algorithm değerini runtime schema ile doğrula.
5. Canonical payload içindeki evidence çekirdeğinin `manifestSha256`, rule IDs, host adapter ve `contextAssemblyDigest` ile imzaya gerçekten dahil olduğunu doğrula.
6. İmzayı v2 MCP resource'una yalnız redacted envelope olarak bağla.
7. v1 resource'undan v2'ye otomatik dönüş olmadığını test et.
8. Secret, path, link, TOCTOU ve mevcut byte sözleşmesi kontrollerini v2'de koru.

Faz 2 çıktıları:

- v2 resource ve strict runtime schema
- Signer ve verifier sınırları
- Trust anchor configuration ve rotation prosedürü
- İmzalı snapshot verification ve trust-store gözlem kodları
- Golden vector, negative, mutation, rotation ve compatibility testleri
- Operasyonel hata ve rollback runbook'u

Faz 2 durdurma kapısı:

- Private key custody yalnız plaintext dosyaya dayanıyorsa üretim rollout'u durur.
- Public key allowlist bilinmeyen anahtarı kabul ediyorsa release durur.
- Canonical payload doğrulayıcılar arasında byte-for-byte aynı değilse release durur.
- Evidence manifestten kopuksa veya v2 sonucu current/replay-free iddiası gibi sunuluyorsa release durur.
- İmzalı envelope secret veya ham kural içeriği sızdırıyorsa release durur.

### Faz 3: Kademeli Rollout ve İşletim

Amaç, v2'yi v1'in güvenli gözlem davranışını bozmadan opt-in kullanıma açmaktır.

Rollout sırası:

- Önce verifier-only, hiçbir karar akışını değiştirmeyen gözlem modu
- Sonra allowlist ve key rotation gözlemi
- Sonra açıkça yetkilendirilmiş hostlarda v2 doğrulaması
- Her adımda v1 fallback'i yalnız gözlem uyumluluğu için saklanır; v2 doğrulama başarısızlığı v1'den sahte olumlu sonuç üretmez

İzlenecek redacted metrik sınıfları:

- `verified`
- `unsupported`
- `unknown_key`
- `invalid_signature`
- `manifest_mismatch`
- `startup_context_unavailable`
- `stale_snapshot_not_claimed` yalnız dokümantasyon/telemetri sınıflandırmasıdır; v2 doğrulama başarısı değildir
- `unsafe_rule_content`

Prompt, tool çıktısı, public/private key materyali, workspace yolu, nonce değeri ve ham kural içeriği metriklere yazılmayacaktır. Metriklerin hiçbirisi tek başına modelin kural uyumunu veya attestation'ın güncelliğini kanıtlamaz.

## 6. Güvenlik ve Tehdit Modeli

### Güvenilen Bileşenler

- Trusted host loader ve onun doğrulanmış hook'u
- Yerel verifier
- Bridge süreci ve v2 signer modülü
- Onaylanmış public key allowlist'i
- İşletim sistemi dosya ve crypto API'leri
- Trust store dağıtım ve güncelleme sahibi

### Güvenilmeyen Bileşenler

- Model metni
- MCP client girdileri
- Başka MCP sunucularının resource açıklamaları ve annotation alanları
- Public resource içeriğinin talimat olarak yorumlanması
- Kullanıcı tarafından seçilen path veya key identifier
- İmzalı payload dışındaki transport metadata'sı

### Veri Akışı ve Saldırı Varsayımları

Faz 1 veri akışı `workspace_file -> trusted host loader -> post-context-assembly evidence -> trusted signer` şeklindedir. MCP client ve model metni bu akışa giremez. Faz 2 veri akışı `canonical payload + trusted evidence -> trusted signer -> v2 resource -> verifier -> trust-store lookup` şeklindedir. Verifier yalnız trusted allowlist'teki SPKI public key ile imzayı doğrular. Signer bridge içinde ayrı bir modül veya OS ACL'li ayrı süreç olabilir; seçim Faz 0'da yapılır ve callback/IPC peer identity doğrulaması kanıtlanmadan trusted signer kabul edilmez.

Bu plan signer private key'inin ele geçirilmediğini, trusted host loader ve verifier binary/config dağıtımının deployment güvenlik sınırında korunduğunu varsayar. Private key, loader veya trust store compromise edilirse v2 imzası geçerli görünse bile kaynak güveni garanti edilmez; bu durum incident ve key revocation prosedürüdür, model veya MCP client girdisiyle düzeltilemez.

Trust store strict schema'sı en az `storeVersion`, `entries`, `keyId`, `publicKeySpkiDer`, `status`, `notBefore` ve `notAfter` alanlarını taşır. `storeVersion` pozitif güvenli integer olmalı, eski sürüm atomik güncellemede reddedilmeli, `keyId` SPKI DER SHA-256 fingerprint'iyle yeniden hesaplanarak karşılaştırılmalı, revoked veya zaman aralığı dışındaki key fail-closed sonuç üretmelidir. Rotation overlap ve acil revocation prosedürü Faz 0 çıktısı olmadan Faz 2'ye geçilemez.

### Zorunlu Test Tehditleri

- Payload byte'ında tek değişiklik
- Entry sırası değişikliği
- JSON whitespace, Unicode code point ve number encoding farkları; Unicode normalization yapılmamalıdır
- Yanlış key, bilinmeyen key, değiştirilmiş key metadata'sı
- Signature truncation, malformed encoding, duplicate object names ve algorithm confusion
- RFC 8785 I-JSON güvenli number ve canonical byte sınırları
- Key rotation sırasında eski ve yeni key geçişi
- Symlink, junction, reparse point, hard link, path escape ve TOCTOU
- Secret ve NUL içeren kural dosyaları
- Host loader snapshot ile workspace snapshot mismatch'i
- Yetkisiz MCP client'ın resource parametresi veya URI ile kapsam genişletmesi
- Trust store rollback, stale revocation state ve atomik güncelleme yarışı

## 7. Runtime Schema ve Hata Sözleşmesi

V2 schema strict olmalı, bilinmeyen alanları reddetmeli ve imzalı alanlarla transport alanlarını ayırmalıdır.

MCP resource wire envelope'ının üst seviye bölümleri yalnız şunlardır:

- `payload`
- `signature`

`payload` içinde `contractVersion`, canonical ve imzalı alanlar bulunur; güvenlik anlamlı `contractVersion` ve `evidence` başka bir üst seviye alanda tekrar edilmez. `signature` içinde yalnız sabit `algorithm: "ed25519"`, `encoding: "base64url-no-padding"` ve signature değeri bulunur; `keyId` payload içinde tek yerde bulunur. `payload.evidence` yukarıdaki discriminated union'dır ve tek otoritedir. `verification` wire envelope alanı değildir; yalnız trusted verifier'ın envelope doğrulamasından sonra ürettiği ayrı local output schema'sında bulunur.

Hata kodları sabit, düşük ayrıntılı ve secret/path içermeyen değerler olmalıdır. En az şu durumlar birbirinden ayrılmalıdır:

- `attestation_unsupported`
- `attestation_invalid_schema`
- `attestation_unknown_key`
- `attestation_invalid_signature`
- `attestation_manifest_mismatch`
- `attestation_startup_unavailable`
- `attestation_unsafe_file`
- `attestation_unsafe_rule_content`
- `attestation_mutation`

Hata ayrıntısı, saldırganın dosya adı, secret eşleşmesi, key materyali, nonce veya iç path bilgisi çıkarmasına izin vermemelidir. V2 tazelik ve replay iddiası taşımadığı için bu amaçlara ait olumlu veya olumsuz hata kodları v2'de bulunmayacaktır.

## 8. Doğrulama Kapısı

Her fazda ana orkestratör tamamlanma kararını verir. Subagent çıktısı danışmanlıktır; runtime testleri ve kaynak incelemesi kanıtın temelidir.

Faz 0 doğrulaması:

- Resmi kaynak iddialarını URL ve erişim tarihiyle kaydet.
- Host loader çağrı zincirini kaynak kodda doğrula.
- Node.js crypto ve hedef runtime davranışını küçük, secret içermeyen fixture'larla doğrula.
- v2 schema taslağını strict parse testinden geçir.

Faz 1 doğrulaması:

- Gerçek host loader hook'unda startup evidence üretildiğini test et.
- Sahte prompt/resource girdisinin evidence üretemediğini test et.
- Eşleşen, değişen ve bulunamayan snapshot sonuçlarını test et.
- Faz 1 için `npm test`, `npm run smoke`, `npm run verify`, `npm run verify:ci` kapılarını çalıştır.

Faz 2 doğrulaması:

- Golden canonical payload ve signature vector'larını test et.
- Yanlış payload/key/signature üçlüsünü fail-closed test et.
- Unknown key, rotation, revocation state, trust-store rollback ve atomic update testlerini çalıştır.
- Evidence alanlarının manifest, host adapter ve context assembly digest ile imzaya bağlandığını test et.
- `match` için payload/evidence manifest eşitliğini; `mismatch` için payload/workspace eşitliğini ve digest'in loader manifestine bağlandığını strict invariant testleriyle doğrula.
- On-wire envelope'ın yalnız `payload` ve `signature` kabul ettiğini; `verification` alanının resource girdisinde reddedilip yalnız local verifier çıktısında üretildiğini test et.
- İmzalı çıktının secret, ham kural, path ve session kimliği sızdırmadığını test et.
- v1 uyumluluğunu ve v2 unsupported davranışını test et.
- Faz 2 için `npm test`, `npm run smoke`, `npm run verify`, `npm run verify:ci` kapılarını çalıştır.

Faz 3 doğrulaması:

- Rollout gözlem modunda karar davranışının değişmediğini test et.
- Metriklerin redacted olduğunu ve stdout protokolünü bozmadığını test et.
- Rollback sonrası bilinmeyen key ve v2 resource sonuçlarının fail-closed kaldığını test et.
- Güncel proje kapısını çalıştır: `npm test`, `npm run smoke`, `npm run verify`, `npm run verify:ci`.

## 9. Sahiplik ve Sorumluluk

- Ana orkestratör: kapsam, karar kapıları, kullanıcı onayı, son doğrulama ve tamamlanma kararı
- Host adapter sahibi: gerçek startup loader hook'u, snapshot üretimi ve host uyumluluğu
- MCP/runtime sahibi: resource registration, strict schema, redaction ve protocol smoke
- Güvenlik sahibi: trust anchor, key custody, rotation, revocation, replay ve threat model
- Operasyon sahibi: rollout, metrik, alarm, rollback ve incident runbook'u
- Sol: plan ve uygulama tasarımının bağımsız hata denetimi
- Gemini: kamuya açık kaynak ve geniş aday araştırması; nihai doğrulama veya onay kapısı değil
- DeepSeek: yerel repository salt-okunur analiz ve risk adayları; nihai kanıt veya uygulama onayı değil

Sahibi belirlenmemiş bir karar uygulama fazına taşınamaz.

Her faz için accountable owner ve onaylayan ayrıdır:

- Faz 0 accountable: güvenlik sahibi; onaylayan: ana orkestratör ve Sol
- Faz 1 accountable: host adapter sahibi; onaylayan: MCP/runtime sahibi ve ana orkestratör
- Faz 2 accountable: MCP/runtime sahibi; onaylayan: güvenlik sahibi ve Sol
- Faz 3 accountable: operasyon sahibi; onaylayan: ana orkestratör
- Trust store rollout ve rollback accountable: güvenlik sahibi; teknik uygulama: operasyon sahibi
- Private-key custody accountable: deployment güvenlik sahibi; sağlayıcı onayı olmadan signer üretime alınmaz

## 10. Açık Sorular ve Karar Kapıları

Bu sorular cevaplanmadan belirsiz faz tamamlanmış sayılmaz:

- Hangi host adapter gerçek startup loader snapshot'ını sağlayabilir?
- Host loader'ın yüklediği byte snapshot hangi güvenilir API üzerinden alınacaktır?
- v2 resource URI ve payload envelope alanları Sol denetiminden sonra kesinleşti mi?
- Trust anchor hangi deployment bileşenine aittir?
- Private key hangi OS-protected store veya harici KMS içinde tutulacaktır?
- Key rotation ve revocation hangi operasyonel sahip tarafından yürütülecektir?
- Trust store hangi imzalı veya trusted dağıtım kaynağından gelecek, `storeVersion` rollback'i nasıl reddedecektir?
- Rotation overlap ve acil revocation state bayatsa verifier hangi sonucu üretecektir?
- Hangi platformlarda Ed25519 ve seçilen key custody davranışı desteklenmektedir?
- v2 doğrulaması yalnız gözlem mi, yoksa belirli hostlarda karar kapısı mı olacaktır?
- SDK/protokol uyumluluğu değişirse ayrı migration planı gerekip gerekmediği kim tarafından kararlaştırılacaktır?

V2'nin ötesinde tazelik veya replay prevention gerekirse ayrıca cevaplanması gereken sorular:

- Challenge MCP stateless `resources/read` akışına URI template, ayrı resource veya ayrı güvenilir IPC ile mi taşınacaktır?
- Challenge entropisi, TTL'si, audience binding'i ve atomik tüketim protokolü nedir?
- Signer ve verifier restart sonrası hangi state'i koruyacaktır?

Her cevap için kaynak, sahip, kabul kriteri ve geri alma davranışı plan ekinde veya ayrı karar kaydında bulunmalıdır.

## 11. Resmi Kaynaklar ve Araştırma Kaydı

Resmi ve standart kaynaklar 2026-09-20 tarihinde incelendi:

- MCP Architecture: https://modelcontextprotocol.io/specification/2026-07-28/architecture
- MCP Resources: https://modelcontextprotocol.io/specification/2025-06-18/server/resources
- MCP Tools: https://modelcontextprotocol.io/specification/2025-06-18/server/tools
- MCP Security Best Practices: https://modelcontextprotocol.io/specification/2025-06-18/basic/security_best_practices
- MCP 2026-07-28 release: https://blog.modelcontextprotocol.io/posts/2026-07-28/
- RFC 8032 Edwards-Curve Digital Signature Algorithm: https://www.rfc-editor.org/rfc/rfc8032
- RFC 8785 JSON Canonicalization Scheme: https://www.rfc-editor.org/rfc/rfc8785
- Node.js Crypto API: https://nodejs.org/api/crypto.html

RFC 8032 ve RFC 8785 seçilen v2 profilinin normatif kaynaklarıdır. JWS (RFC 7515) ve HTTP Message Signatures (RFC 9421) bu planın envelope profili değildir; ileride alternatif profil değerlendirilirse ayrı karşılaştırma olarak incelenebilir. MCP 2026-07-28 mimarisi ile 2025-06-18 resource/security belgeleri mevcut SDK yüzeyinin uyumluluk girdileridir; hedef MCP protokolü ve `@modelcontextprotocol/sdk` sürümü Faz 0'da açıkça sabitlenmeden resource implementation başlatılmaz.

Araştırma rolleri:

- Gemini 3.8 Flash: kamuya açık MCP güven sınırı, resource/tool ayrımı, prompt injection ve attestation seçenekleri için aday araştırma
- DeepSeek Flash: mevcut repository'de v1 manifest, `startup_context`, comparison ve imza altyapısı analizi
- Ana orkestratör: resmi kaynakların bağımsız kontrolü, mevcut kodla karşılaştırma, kapsam kararı ve bu planın yazımı

Gemini ve DeepSeek çıktıları nihai kanıt olarak kullanılmamıştır. Kaynak satırı, test veya resmi belgeyle doğrulanmayan aday iddialar uygulama kararı değildir.

## 12. Onay Sırası

1. Bu plan Sol tarafından güvenlik, sürümleme, canonicalization, trust anchor, evidence ve kapsam belirsizliği açısından denetlenir.
2. Sol bulguları bu dosyada tarihli durum notuyla veya ayrı raporda kayıt altına alınır; plan geçmiş kararları sessizce silmez.
3. Kullanıcı plan kapsamını ve özellikle startup hook, key custody, trust-store dağıtımı ve v2'nin tazelik iddiası taşımaması kararını onaylar.
4. Yalnız onaylanan tek faz için seçilmiş dosyalarla kontrollü implementasyon başlatılır.
5. Ana orkestratör gerekli testleri çalıştırır ve başarısızlıkta fail-closed durur.

Sol denetimi ve kullanıcı onayı olmadan v2 URI'si, imzalama kodu, key config'i veya startup evidence üretim yolu eklenmeyecektir.
