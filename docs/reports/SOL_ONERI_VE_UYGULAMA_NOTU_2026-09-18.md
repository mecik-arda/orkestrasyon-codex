# Sol Öneri ve Uygulama Notu (2026-09-18)

Durum: Uygulama kaydı; Sol denetimi kullanıcı limiti nedeniyle ertelendi, bu turda Gemini modelleriyle ön inceleme ve yerel doğrulama yapıldı.
Kapsam: Kalan işlerin Sol önceliklendirmesi, uygulanan #16/#17 dilimleri ve önceki P2 onarım komutu.

## 1. Sol önceliklendirme raporu (özet)

Soru: Dört aday açık işten hangileri uygulanmalı?

Önerilen sıra:
1. İkinci Beyin V3 P2 kullanıcı yönlendirmeli onarım komutları. Gerekçe: doktor sorunları sınıflandırıyor, eksik olan güvenli düzeltme yolu. Risk: yanlış dosyanın onarılması veya kullanıcı değişikliğinin ezilmesi. Kabul: varsayılan dry-run, açık `--apply`, çakışmada fail-closed, sınırlı `--force`, atomik yazım, idempotency, redakte audit.
2. #16 audit write-ahead/recovery. Gerekçe: mutasyon tamamlanıp audit başarısız olabiliyor; en anlamlı bütünlük boşluğu. Kabul: her çökme noktasında mutasyon geri kazanılabilir veya uzlaştırılabilir; replay idempotent; başarısız audit sessizce kaybolmaz.
3. #17 promote çökme uzlaştırması. Gerekçe: hedef yazımı ve kaynak silme iki adımlı. Kabul: her iki dosyanın bulunduğu, yalnız hedefin bulunduğu ve kesinti senaryoları veri kayıpsız ve idempotent sonuçlanır.

Yapılmaması önerilenler:
- Kilit sertleştirmesi (aday 1) yeniden uygulanmasın; token, çift okuma, PID canlılık kontrolü ve timeout enjeksiyonu zaten mevcut.
- #21 ve eski yedi test boşluğu topluca açılmasın.
- #19 prune kilit senkronu gerçek yarış kanıtı olmadan ertelensin.
- Aday 4 (DeepSeek doğrulama koşusu) uygulama işi değil; sağlayıcı kotası uygunken fırsatçı deneme.

Sol'un işaret ettiği gizli risk: metric lock'ta son token kontrolü ile silme arasında TOCTOU ve PID yeniden kullanım ihtimali; pratik sıklığı belirsiz. Kritik bulgu yok.

## 2. Gemini 3.8 girdileri ve yerel doğrulama

- Antigravity CLI hook yüzeyi (araçsız çağrı): "bağımsız kullanıcı tanımlı yaşam döngüsü kancaları desteklenmiyor / doğrulanamadı". Plandaki "Antigravity hook yüzeyi doğrulanmadı" notuyla uyumlu; kapsam dışı bırakıldı.
- Envanter incelemesi (araçsız aday üretimi): yayın planı doküman durumu (yerelde doğrulandı, düzeltildi), etiketleme süreci (mevcut `edit:classify` ile karşılandı; eksik olan veri), DeepSeek yarım koşu (dış-bağımlı), promote atomikliği ve prune kilit senkronu (gerçekten açık). "Faz 5/6/7 için iskelet hazırla" önerisi V2 planındaki "veri yetersizse yeni altyapı eklenmez" kapısı gereği reddedildi.
- Web araçlı ilk çağrı kanıt taşıyıcısı nedeniyle reddedildi; aynı prompt körlemesine tekrarlanmadı, araçsız role geçildi.
- Gemini çıktıları hipotez kabul edildi; her madde yerelde dosya ve test kanıtıyla doğrulandı.

## 3. Uygulanan işler

P2 hafıza onarımı (önceki turlar):
- `npm run memory:repair` eklendi; `--kind=vault-schema` (eksik/geçersiz şema), dry-run varsayılan, `--apply`, `--force`, `--path=`.
- Commitler 1c4b4bb, 1324409, 6cf4477; Sol denetimi APPROVED (10/10).
- Gerçek Vault dry-run: 6 not şema damgası bekliyor; `forceRequiredCount 0`, `refusedCount 0`, tarama hatası yok. Kullanıcı onayı olmadan uygulanmadı.

#16 audit WAL ve #17 promote uzlaştırma (commit 966f339):
- `state/memory-mutations/` altında mutasyon niyeti journal'ı; store, promote ve repair akışları yazımdan önce niyet yazar, audit başarısıyla niyeti siler.
- `planMemoryMutationRecovery` ve `applyMemoryMutationRecovery`: audit'i eksik kalan niyetleri tekrar oynatır (idempotent), uygulanmamış niyetleri atar, eşleşmeyenleri `unresolved` raporlar.
- Promote için `complete_promote`: hedef doğrulanmışsa kaynak silinir, audit yazılır, niyet kaldırılır; `memory:repair --kind=promote-reconcile` ile açıkça uygulanır, promote başlangıcında otomatik uzlaştırılır.
- `storePersistentMemory` yalnız güvenli kurtarmayı (audit replay/atma) çalıştırır; promote tamamlama yetkisi promote akışında ve açık onarım komutundadır.
- `memory:doctor` çıktısına `mutationRecovery` sayaçları ve çözülemeyen niyetler eklendi; çözülemeyen niyet `attention` üretir.
- Testler `tests/memory-audit-recovery.test.js` REC-01..06: audit yazılamazsa niyet kalır ve kurtarma replay eder; uygulanmamış niyet atılır; eşleşmeyen unresolved kalır; yarım promote tamamlanır ve idempotenttir; uygulanmamış promote atılır; gerçek store/promote akışı journal'ı temiz bırakır.
- Audit kaydı yalnız hash ve sınıflandırma metadata'sı taşır; journal niyeti state dizinindedir ve çözümlemede silinir.

## 4. Doğrulama

- `npm test` 627/627 PASS.
- `npm run verify` PASS, `npm run verify:ci` PASS, `git diff --check` temiz.

## 5. Gemini ön incelemesi ve yerel doğrulama (2026-09-18)

Sol (Codex) limiti nedeniyle bu turda Gemini modelleriyle ön inceleme yapıldı; hiçbir Gemini çıktısı bağlayıcı denetim sayılmadı, her madde kaynak ve testle doğrulandı.

Gemini 3.8 Flash (6 aday):
- Gerçek çıkan 1: audit taramasının sondan sınırlanması ve normal akıştaki mükerrer kontrolü aynı içerik hash'ine dönüşte olay yutabilir. Düzeltme: mükerrer kontrolü yalnız kurtarma replay yolunda bırakıldı; normal store/promote/onarım audit'i her zaman ekler. Test: REC-07.
- Gerçek çıkan 2: promote hedefi fsync edilmeden kaynak siliniyordu. Düzeltme: promote hedefi kalıcı (fsync + rename + dizin fsync) yazılıyor, sonra kaynak siliniyor.
- Gerçek çıkan 3: var olan journal üzerine yeni niyet yazılabiliyordu. Düzeltme: `writeMutationIntent` mevcut dosyayı ezmez; çözülemeyen niyet görünür kalır. Test: REC-08.
- Kabul edilen kalıntı: çoklu onarım sırasında süreç çökerse dosyalar kısmi kalabilir; her dosya kendi journal'ıyla uzlaşır ve onarım yeniden çalıştırılabilir. Test: REC-09.
- Kapalı: kilit sırası (kilit adları sıralı alınır), çözülemeyen journal'ın yeni mutasyonu engellemesi (REC-08 mutasyonun sürdüğünü kanıtlar).

Gemini 3.7 Flash (5 aday):
- "Promote audit açığı" ve "kısmi rollback" adayları tasarımda kapsanıyor; kanıt testleri REC-10 (kaynak silinmiş yarım promote replay ile kapanır) ve REC-09 eklendi.
- "Normal akışta ikinci audit" beklenen davranıştır: aynı mutasyonun gerçek ikinci uygulaması ayrı olaydır; replay aynı üçlüyü (olay, not hash'i, yeni içerik hash'i) mükerrer yazmaz (REC-07).
- Kilitlenme ve blokaj adayları yerelde doğrulanmadı; mevcut sıralı kilit ve journal koruması kapsamında.

Gemini Pro (web kanıt taşıyıcısı nedeniyle reddedildi; araç izni değil, sağlayıcı çıktı sözleşmesi sınıfı). İkinci görüş Gemini 3.7 Flash ile alındı.

## 6. Actions durumu

- Bugünkü iki kırmızı koşu (private `deba95e`, public `6181344`) yeniden çalıştırıldı ve yeşile döndü; kırmızıların nedeni daha önce düzeltilen OPT-06l zamanlama kırılganlığıydı.
- Eski commit'lerde kalan kırmızılar (private `4d2355b`, `626df3f`, `2e32e4b`; public `552d4f3`, `014c091`, `a0cd5c9`) üzerlerine düzeltme gelmiş tarihsel koşulardır; geçmişi yeniden yazmadan kapatılamaz.
- Her iki repoda en son head koşuları yeşildir.

## 7. Denetim durumu ve sonraki adımlar

- Sol (Codex) denetimi kullanıcı limiti nedeniyle yapılamadı; 2026-09-19'da yapılacak; bağlayıcı kapanış kararı ona aittir.
- Bu turda Gemini modelleriyle yapılan ön inceleme ve yerel doğrulama sonuçları yukarıda kayıtlıdır; Gemini bulguları bağlayıcı denetim değildir.
- Gerçek Vault'taki 6 şema onarımı kullanıcı onayı bekliyor: `npm run memory:repair -- --apply`.

## 8. Uçtan uca doğrulama (2026-09-18)

Yeşil:
- `npm test` 627/627, `npm run verify`, `npm run verify:ci`, `npm run smoke` (0 hata), `git diff --check`.
- `npm run drill` 8/8; `npm run memory:doctor` durum `ok`, `journalCount 0`, `unresolvedCount 0`; `npm run memory:repair` dry-run `repairCount 6`, `refusedCount 0`, `scanErrorCount 0`; `npm run state:migrate` dry-run; `npm run budget`.

Sağlayıcı kotası nedeniyle çalıştırılamadı:
- `npm run p0:e2e`, `npm run p2a:e2e`, `npm run p2b:e2e` Codex kotası tükendiği için başarısız oldu. Kanıt: OpenCode Terra probe `APIError 429 usage_limit_reached`, ikincil pencere %100, sıfırlanma yaklaşık 16 saat. p0 çıktısında codex `auth_invalid`/boş sonuç bu kotanın yansımasıdır; kod regresyonu bulgusu yok. Kota sıfırlandığında yeniden çalıştırılacak.
- Antigravity/Gemini bacakları sağlıklıdır; bu e2e koşuları OpenCode üzerinden Codex modeline bağlı olduğu için tümü etkilenmiştir.

## 9. Tüm bulguların kapatılması (2026-09-18, akşam)

Şema onarımları:
- `npm run memory:repair -- --apply` ile gerçek Vault'ta 6 not onarıldı (eksik `vault_schema` eklendi); altısında da `auditWritten: true`.
- Tekrar dry-run: `repairCount 0`, `refusedCount 0`, `scanErrorCount 0`; `memory:doctor` durum `ok`, `incompatiblePaths []`, `journalCount 0`, `unresolvedCount 0`.

Kapatılan bulgular:
- #16 audit best-effort kaybı: mutasyon journal'ı + kurtarma replay ile kapandı; audit artık sessizce kaybolmaz (journal kalır, doctor görünür, replay idempotent).
- #17 promote iki adımlı atomiklik: journal + `complete_promote` uzlaştırması ile kapandı; hedef fsync edilerek yazılır, kaynak sonra silinir.
- #19 prune kilit senkronu: `pruneMemoryAuditFiles` artık audit kilidi altında çalışır; kilit tutulurken silme yapılmaz (test eklendi).
- Kapsam boşluğu 8: `package.json` node script hedeflerinin varlığını doğrulayan meta test eklendi.
- Kapsam boşluğu 7 / #21: tüm public MCP şemaları için parametrik negatif test eklendi (bilinmeyen alan, boş girdi, yanlış tip).
- RUNS-10 öneri 7: eşzamanlılık koşusuna ilk deneme başarısı, retry sayısı ve hata sınıfı rapor alanları eklendi.
- Kapsam boşlukları 1-6 (katalog runtime, edit fallback + circuit, `model_access_denied`, bozuk bütçe JSONL, config v1→v2 migrate, prune retention) mevcut testlerle kapsanmış durumda; doğrulandı.

Etiketli kalanlar:
- #3 AGY global settings izolasyonu: `dış-bağımlı / ayrı plan` (mimari değişiklik; kullanıcı onayı gerekir).
- #8 Claude Code workspace kaçışı: `reddedildi / kapsam dışı` (native Claude aboneliği yok, çağrı yapılmıyor).
- Kalıcı hafıza O5, O7-O10: `karar kapısı` (ölçüm ve ihtiyaç doğrulaması).
- V2 Faz 4 etiketleme: `karar kapısı` (gerçek kullanıcı etiketi bekliyor).
- Antigravity hook yüzeyi: `dış-bağımlı` (bu sürümde doğrulanmış yüzey yok).
- p0/p2a/p2b yeniden koşusu ve Sol kapanış denetimi: Codex kotası sıfırlanınca yapılacak.

Doğrulama: `npm test` 632/632; `npm run verify`, `npm run verify:ci`, `npm run smoke`, `git diff --check` temiz.
