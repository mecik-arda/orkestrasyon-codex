# Entropi Yanlış Pozitifi İstisnası (GitHub URL ve Git-Hash) Mini-Spec

Durum: reddedildi (Sol tur 1, 2026-09-23); uygulanmadı
Tarih: 2026-09-23
Amaç: Kalıcı hafıza secret kapısındaki yüksek entropi kontrolünün, çözümlenebilir GitHub URL'leri ve saf hex git-hash'leri için ürettiği yanlış pozitifi dar bir allowlist ile gidermek; fail-closed davranışı ve bilinen secret desenlerini korumak.

## Sol Tur 1 Bulguları (2026-09-23)

- Geniş URL muafiyeti güvenli değil: `blob|tree` yolundaki rastgele uzun bir segmente konan ve bilinen desenlere uymayan token entropi kontrolünden kaçabilir; `github.com` alan adı yolun güvenli olduğunu kanıtlamaz.
- İstisna yalnız yapılandırılmış `sources[].url` alanına, orada da yalnız biçimi kesin doğrulanan git-hash segmentine uygulanmalı; başlık, gövde ve etiketlere yapıştırılmış URL muafiyet almamalı, diğer uzun yol segmentleri taranmaya devam etmeli.
- Saf hex adayların entropisi en fazla 4,0 bit/karakterdir ve mevcut 4,2 eşiğini tek başına aşamaz; gerçek tetikleyici, eğik çizgi ve tireleri içerebilen tüm-yol adayıdır. Bu nedenle içerik geneline yayılan hex istisnası gereksizdir.
- Tutarlılık şartı: Aynı kural yazma, arama, okuma ve review kapılarında ortak olmalı (`memory.js:428, 440, 1268, 1329, 1731`); aksi halde yazılabilen not arama/okumada gizlenir veya reddedilir. `reviewPersistentMemory` secret kapısını çağırmıyor; kapsam netleştirilmeli.
- Kaynak doğrulaması hassas olmayan sorgu parametrelerine izin veriyor; "sorgulu URL reddedilir" kabul kriteri mevcut davranıştan çıkmıyor.
- Test planına eklenecekler: izinli URL yolunda rastgele yüksek entropili segment; URL'nin gövde/etiket/kaynak başlığında bulunması; temiz ve sakıncalı URL'nin aynı notta olması; kodlanmış varyantlar; izinli URL içinde bilinen secret deseni; store sonrası search/read uçtan uca erişim.
- Karar: REJECTED. Mevcut çözüm yolu, kaynaklarda kısa/çözümlenebilir URL biçimlerinin kullanılmasıdır (2026-09-23 Teams notu böyle kaydedildi).

## Mevcut Davranış

- `hasHighEntropyToken` (`subagent-bridge/src/memory.js:140-151`) içerikte `[A-Za-z0-9+/_=-]{32,}` adaylarını bulur ve Shannon entropisi 4.2 ve üzeri olanı secret sayar.
- `requireSafeMemoryContent` (`memory.js:401-435`) `combinedMemoryContent` içine title, content, taskId, tags ve kaynak başlık/URL'lerini katar; entropi veya desen eşleşmesi yazımı reddeder.
- Sonuç: `github.com/<owner>/<repo>/blob|commit/<uzun-ref>` biçimli kaynak URL'leri ve 40 karakterlik commit hash'leri secret olmadıkları halde reddedilir (2026-09-23 Teams notu kaynak denemesi).

## Hedef Davranış

- Entropi adayı taramasında yalnız iki sınıf güvenli sayılır:
  - Tam eşleşen GitHub kaynak URL'si: `^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/(?:blob|commit|tree)/[A-Za-z0-9._~/-]+$` (sorgu dizesi, fragment ve kullanıcı bilgisi yok; host küçük harf; şema https).
  - Saf küçük harf hex git-hash adayı: tam olarak `[a-f0-9]{7,8}`, `[a-f0-9]{40}` veya `[a-f0-9]{64}` (kısa hash, SHA-1, SHA-256).
- Allowlist dışındaki tüm içerik mevcut davranışla taranır (fail-closed).
- Secret desen taraması, PII taraması, HTTPS ve kaynak kuralları değişmez; allowlist URL'leri desen taramasından muaf tutulmaz, yalnız entropi payını almaz.
- Aynı fonksiyon `analyze_memory_write`, `store_persistent_memory` ve `review_persistent_memory` yollarında ortak kalır.

## Değişecek Dosyalar

- `subagent-bridge/src/memory.js` (entropi kontrolüne dar allowlist ve yardımcı fonksiyonlar)
- `tests/memory.test.js` (pozitif, negatif ve regresyon testleri)
- `README.md` (EN/TR kısa not: kaynak URL entropi istisnası sınırları)

## Kapsam Dışı

- GitHub dışı URL aileleri için istisna yok (ör. uzun slug'lı doküman URL'leri); kısa çözümlenebilir bağlantı kullanılır.
- Entropi eşiği (4.2) ve aday uzunluğu (32) değişmez.
- Desen listesi (PEM, sk-, ghp_, AKIA, JWT, Bearer ve benzerleri) ve PII kuralları değişmez.
- Kapsam dışı serbest metinde ara uzunlukta hex (ör. 32) yakalanmaya devam eder.

## Güvenlik Ve Uyumluluk Sınırları

- Allowlist tam eşleşmeli ve dar karakter sınıflıdır; allowlist dışı fail-closed reddedilir.
- GitHub URL'sinde sorgu ve fragment yasaktır; böylece token taşıma yüzeyi daraltılır.
- Residual risk: allowlist'e uyan URL path'inde düşük duyarlılıklı slug veya hash taşınabilir; desen ve PII taraması yine çalışır. Bu risk kabul edilir ve belgelenir.
- Trusted workspace, allowed root, read-only/edit modu, disposable workspace, redacted audit ve provider routing sözleşmeleri değişmez.
- Rollback: değişiklik tek commit ile geri alınabilir; eski davranış tüm notlar için yeniden geçerli olur.

## Kabul Kriterleri

- Pozitif: uzun slug'lı GitHub blob URL'si, tam commit URL'si (40 hex) ve 40/64 hex hash içeren not yazılabilir.
- Negatif: allowlist dışı yüksek entropili URL reddedilir; karışık harfli rastgele 40 karakter token reddedilir; 32 hex token reddedilir; sorgu dizesi içeren GitHub URL'si reddedilir; mevcut secret desenleri reddedilmeye devam eder.
- Regresyon: mevcut secret, PII ve enjeksiyon testleri aynen geçer.

## Doğrulama

- Test komutları: `npm test`, `npm run verify`, `npm run verify:ci`
- Manuel kontroller: Teams notunun kaynak URL'leriyle store denemesi; allowlist dışı URL ile negatif deneme; `review_persistent_memory` çıktısının değişmediğinin kontrolü.

## Bağımlılıklar Ve Açık Sorular

- Hex istisnasının kapsamı: içerik genelinde dar uzunluk allowlist'i (öneri) mi, yalnız URL bağlamı mı; Sol kararı beklenir.
- GitHub dışı yaygın doküman URL'leri için ikinci bir allowlist ailesi gerekli mi; öneri: hayır, kısa bağlantı yeterli.
