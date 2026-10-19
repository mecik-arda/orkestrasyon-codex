# Hades Hafıza Yazma Kalan Riskler Planı

Durum: UYGULANDI; Sol plan denetimi ve kapanış denetimleri 2026-09-20'de tamamlandı. Sonuç APPROVED_WITH_RISKS; bulgular bölüm 11'de kapatıldı ve kabul koşuları bölüm 12'de kayıtlıdır. Tarih: 2026-09-20. Kapsam: Tamamlanan hafiza-vault-bakimi açık yazma akışının kalan teknik risklerini kapatacak backend, MCP, script ve dokümantasyon değişiklikleri.

Durum notu: Bu plan, docs/plans/yapilanlar/HADES_HAFIZA_YAZMA_SKILLI_PLANI_2026-09-20.md kapanışındaki residual riskleri hedefler. Keşif Gemini 3.8 Flash dış bağlamı ve ana orkestratörün yerel doğrulamasıyla yürütüldü; DeepSeek rotası rate_limited verdi ve sınırlama olarak kaydedildi. Sol denetimi Codex kotası nedeniyle ertelenmişti; kota yenilendikten sonra plan ve kapanış denetimleri 2026-09-20'de çalıştırıldı ve bulgular kapatıldı (bölüm 11).

2026-09-20 uygulama notu: Plan, kullanıcı kararıyla Sol denetimi ertelenerek uygulandı. W1 (idempotent audit kanıtı ve journal kontrolü), W2 (checksum doğrulamalı PII kapısı), W3 (injection store kapısı ve MCP şeması), W4 (analyze kapsam görünürlüğü), W5 (global skill doğrulama aracı) ve W6 (skill/README güncellemesi ve senkronizasyon) tamamlandı. W1 uygulamasında noteIdHash, mevcut PROMOTE audit kaydıyla eşleşmesi için backend'in normalize ettiği yollarla (platform ayırıcılı) hesaplandı; plandaki "ileri eğik çizgili" ifadesi bu gerçekle hizalandı. Doğrulama kanıtı: `npm test` tam paket geçti; `npm run verify`, `npm run smoke` ve `npm run verify:ci` çıkış 0; `npm run skills:check-global` 48/48 EQUAL; `.agents`/`.claude` ağaçları byte eşit; `git diff --check` temiz.

2026-09-20 Sol denetim notu: Sol plan denetimi Codex `gpt-5.6-sol` ile salt-okunur yapıldı ve REJECTED döndü (1 yüksek, 3 orta, 2 düşük bulgu). Bulgular kapatıldı: `relativePath` PII ve injection kapsamına alındı, analyze kapsam beyanı MCP şemasıyla hizalandı, geçerli bekleyen mutation niyeti testi eklendi, plan durumu ve ölçüt ifadeleri düzeltildi, bölüm 3 uygulama öncesi baseline olarak etiketlendi. Kapanış denetimi ve kabul koşuları bölüm 11-12'de kayıtlıdır. Bu turda ayrıca `npm run p2b:e2e` regresyonu (Antigravity carrier iç içe zarf) bulundu ve düzeltildi; ayrıntı `docs/reports/CARRIER_REGRESYON_VE_E2E_KABUL_NOTU_2026-09-20.md` içindedir.

Norn: Norn ayrı ve ilgisiz bir projedir; bu plan Norn'a ait hiçbir iş, karar, test veya doğrulama içermez.

## 1 Hedef ve kapsam

Bu planın iş paketleri aşağıdaki gibidir.

- W1: idempotent promote audit kanıtı ile published_audit_unverified belirsizliğini kapatmak.
- W2: store ve analyze yollarına checksum doğrulamalı PII desenleri eklemek.
- W3: injection kurallarını store tarafına taşımak ve onaysız yazımı durdurmak.
- W4: analyze kapsam görünürlüğü sağlamak.
- W5: dört global kökü karşılaştıran opt-in script eklemek.
- W6: skill, README, plan dokümantasyonu ve test/verify/smoke/verify:ci doğrulaması.

## 2 Hedef dışı bırakılanlar

- Norn.
- Yeni runtime bağımlılığı yok; Presidio, scrubadub, NER/ML, SimHash/MinHash kütüphaneleri kullanılmaz; package.json yalnız yeni npm script satırı kazanır.
- Okuma tarafı karantina, hook ve mevcut güvenlik kapıları değişmez.
- Yeni skill, policy enum'u veya allowlist değişikliği yok.
- Gerçek Vault'a otomatik yazma yok; pilot ayrı kullanıcı kararı.
- Backend ve MCP değişiklikleri W1-W4 ile sınırlı.

## 3 Mevcut durum ve doğrulanmış kanıt

Bu bölüm uygulama öncesi baseline kaydıdır; satır numaraları 2026-09-20 uygulamasından öncesine aittir ve güncel kodla birebir eşleşmez.

- Idempotent promote dalı audit döndürmüyor; memory.js:1455-1471.
- memoryAuditHasEvent mevcut ve replay kullanıyor; memory.js:687-721 ve memory.js:723-733.
- PROMOTE audit noteIdHash = sha256(sourceRelativePath + ":" + targetRelativePath), newSha256 = targetSha256; yazım memory.js:1493-1521.
- Store guard secret kontrol ediyor, PII ve injection kontrol etmiyor; memory.js:315-344.
- Analyze ön kontrolü yalnız başlık ve gövdede secret arıyor; memory.js:346-350.
- Injection kuralları memory.js:23-30 ve detectInjectionCategories memory.js:148-150 mevcut; yalnız okuma yolunda kullanılıyor memory.js:1172 ve memory.js:1236-1248.
- collectMarkdownFiles indeks sınırında sessizce duruyor memory.js:237-265; readLimitedText sessizce kırpıyor memory.js:267-278; analyze dönüşü yalnız safeToWrite, exactDuplicates, potentialConflicts taşıyor memory.js:1339-1343.
- Proje skill hash kapısı scripts/verify-project.js:86-103; global kopyalar elle dağıtılıyor ve verify dışında README.md:221 ve README.md:550.
- MCP store şeması server.js:184-217; injection onay alanı yok.
- Test desenleri: idempotent promote tests/memory.test.js:446; audit yazımı tests/memory.test.js:410; secret reddi tests/memory.test.js:103; redacted audit tests/memory.test.js:263; PROMOTE audit tests/memory.test.js:693; indeks performans sınırı tests/memory.test.js:510 ve tests/memory.test.js:660.

## 4 İş kırılımı ve kilometre taşları

- W1: idempotent dalda noteIdHash backend'in normalize ettiği (platform ayırıcılı) source ve target yollarıyla, targetSha256 ise yayınlanmış hedef içeriğinden hesaplanır, memoryAuditHasEvent ile auditWritten dönüşe eklenir; true teknik kanıttır ve tam başarıdır; false kanıt bulunamadı demektir ve sonuç published_audit_unverified kalır, yokluk kanıtı değildir çünkü retention, rotasyon veya yarış kaydı görünmez kılabilir; skill idempotent bölümü ve bitirme koşulu güncellenir; testler audit varken true ve audit kaldırıldığında false. Idempotent tam başarı ayrıca mutation günlüğü taramasının hatasız olmasını ve bu noteIdHash için bekleyen veya çözülmemiş niyet bulunmamasını gerektirir; tarama hatası veya bekleyen niyet varsa sonuç manual_recovery_required olur ve testler bekleyen niyet durumunu kapsar.
- W2: detectPiiCategories eklenir: e-posta, Türkiye telefon biçimi, TCKN 11 hane ve checksum, IBAN TR ve MOD-97, ödeme kartı Luhn; requireSafeMemoryContent ve requireSafeProposedMemoryContent içinde çalışır. Store yolunda başlık, gövde, taskId, tags, kaynak başlıkları, URL ve relativePath kapsanır; analyze yolunda şemanın kabul ettiği başlık, gövde ve relativePath kapsanır (analyze MCP şeması taskId, tags ve kaynak almaz). Fail-closed hata; telefon ayırıcı ve uzunlukla daraltılır; testler geçerli örnekleri reddeder ve checksumsız benzer dizileri kabul eder.
- W3: injection kontrolü configuration ve normalize edilmiş relativePath erişiminin bulunduğu store noktasında çalıştırılır; requireSafeMemoryContent imzası configuration ve relativePath ile genişletilebilir veya kontrol store çağrısına taşınır; QUARANTINE olayının contentSha256 değeri input içeriğinden hesaplanır; kategori varsa ve acknowledgeInjectionRisk !== true ise recordMemorySecurityEvent QUARANTINE yazılır ve hata verilir; onayla yazım sürer ve QUARANTINE riskCategory ile kaydedilir; MCP store şemasına acknowledgeInjectionRisk z.boolean().default(false) eklenir; mevcut zorunlu alan, tip ve enum doğrulaması ile MCP-NEG negatif şema testleri korunur ve acknowledgeInjectionRisk için yanlış tip negatif testi eklenir; testler onaysız red, onaylı yazım ve redacted audit doğrular; smoke geçer.
- W4: collectMarkdownFiles dönüşüne truncated eklenir; alan indeks üst sınırına ulaşıldığında true olur ve kırpılmış olabilir anlamına gelir; analyze dönüşüne coverage alanı eklenir: indexedFiles, maxIndexedFiles, truncated, readTruncatedCount; skill kapsam sınırını kullanıcıya bildirir; testler küçük maxIndexedFiles ile truncated true, büyük dosyada readTruncatedCount artışı ve geriye uyumluluk.
- W5: scripts/check-global-skills.js eklenir; config/policy.json skills.allowed listesi için .agents/skills/<ad>/SKILL.md SHA-256 değerini dört kökle karşılaştırır: ~/.config/opencode/skills, ~/.codex/skills, ~/.claude/skills, ~/.agents/skills; durumlar EQUAL, MISSING, DIFF; çıktı yalnız skill adı, kök etiketi ve durum taşır; mutlak kişisel yol veya secret basılmaz; DIFF çıkış kodu 1; MISSING varsayılan uyarı ve --strict ile hata; verify kapısına eklenmez; package.json içine skills:check-global; yeni test geçici home dizini kullanır.
- W6: skill değişiklikleri non-target hash preflight sonrası npm run skills:sync ile .claude kopyasına eşitlenir; dört global kök elle güncellenir ve W5 ile doğrulanır; README güncellenir; doğrulama sırası npm test, npm run verify, npm run smoke, npm run verify:ci.

Kilometre taşları:

- 1: W1+W4.
- 2: W2+W3 ve smoke.
- 3: W5+W6.

## 5 Kabul kriterleri ve doğrulama yöntemi

- W1-W4 davranışları dosya ve satır referanslı testlerle kanıtlanır ve test verileri sentetiktir.
- npm test tam paket geçer.
- npm run verify ve npm run verify:ci geçer.
- MCP şeması değiştiği için npm run smoke geçer.
- Runtime bağımlılıkları değişmez ve package.json yalnız script satırı kazanır.
- Skill değişikliklerinde .agents ve .claude eşitliği sağlanır ve dört global kök EQUAL raporlanır.
- Gerçek kişilere ait PII, secret veya kimlik bilgisi plan, test ve rapor metinlerine yazılmaz; testlerde yalnız doğrulanmış sentetik fixture kullanılır.
- Plan uygulanmaya başlamadan önce Sol denetimi tamamlanır ve bulgular kapatılır.
  - Durum notu (2026-09-20): Bu kapı kullanıcı onaylı sapmayla uygulama sonrası kapatıldı; denetimler ve bulgular bölüm 11'dedir.

## 6 Mimari ve teknoloji kararları

- Audit kanıtı yeni okuyucu yazılmadan mevcut memoryAuditHasEvent ile üretilir ve yokluk kanıtlanamama olarak raporlanır.
- PII kapısı native JavaScript regex ve checksum kullanır, yeni bağımlılık yok, NER tabanlı genişletme ayrı karar kapısıdır.
- Injection kapısı mevcut kural setini store tarafına taşır ve onay semantiği okuma tarafındaki acknowledgeQuarantinedContent ile eşleşir.
- Kapsam metadata'sı geriye uyumlu ek alandır.
- Global doğrulama aracı verify dışında tutulur çünkü global kopyalar elle dağıtılan ayrı deployment yüzeyidir.

## 7 Riskler ve azaltma önlemleri

- PII yanlış pozitifi teknik notları engelleyebilir; checksum ve dar desenle sınırlanır ve kullanıcı metni yeniden yazarak ilerleyebilir.
- Telefon deseni sürüm veya hash benzeri dizilerle çakışabilir; bounded heuristic olarak belgelenir.
- Injection onayı kötüye kullanılabilir; QUARANTINE audit kaydı kalıcıdır, okuma karantinası değişmez ve tam garanti iddia edilmez.
- memoryAuditHasEvent retention, rotasyon veya yarış nedeniyle yanlış negatif verebilir; yalnız pozitif kanıt başarı sayılır.
- MCP şeması değişikliği istemci uyumunu bozabilir; alan isteğe bağlı ve varsayılanlıdır ve mevcut şema doğrulaması ile smoke korunur.
- Aylık maliyet limiti check_subagent_bridge çıktısına göre (2026-09-20) aşılmış görünüyor ancak plan yeni ücretli sağlayıcı gerektirmez ve uygulama yerel testlerle yürütülür.

## 8 Doğrulanamayan veya açık noktalar

- Gemini kaynaklarının bir kısmı genel alan adı düzeyindedir; OWASP ve Presidio doğrulandı, SimHash, MinHash, NIST, Stripe ve AWS referansları doğrulanmadı ve plan bunlara bağlayıcı karar dayandırmaz.
- PII desenlerinin gerçek kasa üzerindeki yanlış pozitif oranı ölçülmedi.
- Gerçek uçtan uca pilot kapsamı ve commit stratejisi kullanıcı kararıdır.
- W5 aracının davranışı yerel makinede doğrulanır ve farklı makinelerde dağıtım ayrıca ele alınır.

## 9 Sınırlamalar ve atlanan adımlar

- DeepSeek Flash ve DeepSeek Pro keşif rotası üç çağrıda rate_limited verdi ve yerel analiz ana orkestratör tarafından dosya:satır kanıtlarıyla yapıldı.
- Antigravity capability probeları opt-in olduğu için çalıştırılmadı ve Gemini 3.8 Flash çağrısı başarılı oldu.
- Plan yazımı yalnız bu dosyada yapılır ve Sol denetimi yazımdan sonra yapılır.
- Okuma tarafı hook ve karantina davranışı değiştirilmez.
- Sol plan denetimi Codex kotası tükendiği için authentication_failure sınıfıyla (capability probe, 2026-09-20) önce çalıştırılamadı; kullanıcı kararıyla ertelendi. Kota yenilendikten sonra denetimler 2026-09-20'de çalıştırıldı; bulgular bölüm 11'de kapatıldı.

## 10 Kaynaklar

- Doğrulanan yerel kaynaklar: subagent-bridge/src/memory.js (23-30, 148-150, 237-278, 315-350, 531-577, 687-733, 829-896, 1321-1344, 1443-1538), subagent-bridge/src/frontends/mcp/server.js (122-236), scripts/verify-project.js (86-103), scripts/sync-skills.js (7-23), README.md (221, 550), tests/memory.test.js (103, 263, 410, 446, 510, 660, 693).
- Doğrulanan dış kaynaklar: OWASP GenAI Security Project ve LLM Top 10 genai.owasp.org/llm-top-10/ ve Microsoft Presidio github.com/data-privacy-stack/presidio (MIT lisanslı, Python tabanlı PII tespiti; regex, checksum ve NER kullanır ve tam garanti vermez).
- Doğrulanamayan dış kaynaklar: Gemini yanıtındaki SimHash, MinHash, NIST AI RMF, Stripe ve AWS idempotency ve Martin Fowler referanslarıdır ve tam URL doğrulanmadı.
- Bağlam kaynakları: docs/plans/yapilanlar/HADES_HAFIZA_YAZMA_SKILLI_PLANI_2026-09-20.md ve 06_Metadata/Orkestrasyon/Hafıza Politikası.md (güvenilmeyen alıntı).

## 11 Sol denetim özeti ve kapatılan bulgular

- Orkestratör öz-denetimi (ilk tur, 2026-09-20): W1 mutation günlüğü kontrolü ve bekleyen niyet testi, W3 negatif tip testi, W4 kırpma semantiği.
- Plan denetimi, birinci tur (2026-09-20, Codex `gpt-5.6-sol`, salt-okunur, tek deneme): REJECTED. Bulgular ve kapatma:
  - Yüksek: `relativePath` PII ve injection kapsamı dışındaydı. Kapatıldı: `combinedMemoryContent` PII kapısı store ve analyze yollarında, injection kapısı store yolunda `relativePath` değerini denetler; yol reddi testleri eklendi.
  - Orta: analyze kapsam beyanı MCP şemasıyla uyuşmuyordu (taskId, tags, kaynak alanları analyze girdisinde yok). Kapatıldı: bölüm 4 W2 beyanı gerçek şemayla hizalandı.
  - Orta: W1 için geçerli bekleyen niyet testi yoktu; yalnız bozuk journal tarama hatası kanıtlanıyordu. Kapatıldı: geçerli bekleyen promote niyetiyle `recoveryRequired` ve `auditWritten` testi eklendi.
  - Orta: plan kendi ön-denetim kapısıyla çelişiyordu. Kapatıldı: bölüm 5 kapı notu, bölüm 9 güncel kayıt ve bu bölümdeki denetim kaydı gerçekle hizalandı.
  - Düşük: bölüm 3 satır referansları uygulama sonrası eskimişti. Kapatıldı: bölüm 3 uygulama öncesi baseline olarak etiketlendi.
  - Düşük: "PII yazılmaz" ölçütü sentetik PII fixture'larıyla çelişiyordu. Kapatıldı: ölçüt gerçek kişi verisi yasağı ve doğrulanmış sentetik fixture kuralı olarak netleştirildi.
- Kapanış denetimi, ikinci tur (2026-09-20, `gpt-5.6-sol`, salt-okunur): REJECTED (0 kritik, 0 yüksek, 2 orta, 1 düşük). Bulgular ve kapatma:
  - Orta: `relativePath` yalnız yüksek entropi kontrolünden değil, kesin secret imzalarından da muaftı. Kapatıldı: kesin secret desenleri (sk-, ghp_, AWS, JWT vb.) yol dahil içerikte çalışır; yüksek entropi sezgisi yol false pozitifini önlemek için eski kapsamda kalır; yol secret reddi testleri eklendi.
  - Orta: plan ön-denetim çelişkisi gerçekten kapanmamıştı (bölüm 5 kriteri ve bölüm 9 gelecek zaman ifadeleri). Kapatıldı: bölüm 5 durum notu ve bölüm 9 geçmiş zaman kaydı eklendi.
  - Düşük: iç içe carrier kanıtının uçtan uca strict reddi test edilmiyordu. Kapatıldı: WP2-RUNTIME-16 geçersiz ve geçerli iç içe kanıtı runtime üzerinden doğrular; iç kanıt, dış katman boşken korunur ve AG-AC-16d bu önceliği kanıtlar.
- Kapanış denetimi, üçüncü tur (2026-09-20, `gpt-5.6-sol`, salt-okunur): REJECTED (0 kritik, 0 yüksek, 1 orta, 1 düşük). Bulgular ve kapatma:
  - Orta: kesin secret desen listesi ASIA, github_pat_, glpat- ve npm_ biçimlerini kapsamıyordu. Kapatıldı: desenler eklendi ve yol üzerinden GitHub ile GitLab token reddi testleri genişletildi. Yol secret kapsamı kesin desenlerle sınırlıdır; yüksek entropi sezgisi yol false pozitifini önlemek için kapsam dışıdır ve tam garanti ayrı karar kapısıdır.
  - Düşük: girişteki durum notu denetimin hâlâ ertelendiğini bildiriyordu. Kapatıldı: durum notu denetimlerin yapıldığını ve bulguların bu bölümde kapandığını bildirir.
- Kapanış denetimi, dördüncü tur (2026-09-20, `gpt-5.6-sol`, salt-okunur): APPROVED_WITH_RISKS. İki kapatma doğrulandı; yeni işlevsel regresyon veya atlatma bulunmadı. Düşük notlar: ASIA ve npm_ yolları için doğrudan regresyon testi isteği (bu turda eklendi) ve bu satırın dördüncü tur sonucunu belirtmesi (işlendi).

## 12 Kabul koşuları (2026-09-20)

- `npm test`: 689/689 geçti (yeni: AG-AC-16d iç içe carrier zarfı ve öncelik, W1 bekleyen geçerli niyet, W2 yol PII ve secret reddi, W3 yol injection reddi, WP2-RUNTIME-16 iç içe carrier kanıtı).
- `npm run verify`, `npm run smoke`, `npm run verify:ci`: çıkış 0.
- `npm run skills:check-global`: 48/48 EQUAL.
- `npm run p0:e2e`: çıkış 0 (Gemini ve Codex bacakları ok, mutasyon yok).
- `npm run p2b:e2e`: çıkış 0 (5/5 kabul, bridge mutasyonu yok).
- Ayrıntı: `docs/reports/CARRIER_REGRESYON_VE_E2E_KABUL_NOTU_2026-09-20.md`.
