# Plan Dosyası Sınıflandırma Denetimi

- Tarih: 2026-09-27
- Kapsam: `docs/plans` altındaki plan, spec, araştırma ve video çıktılarının güncel durum klasörlerini denetlemek.
- Yöntem: İndeks ve klasör envanterini dosyaların tarihli durum notları, uygulama/kapanış raporları, açık iş paketleri ve yerel proje kanıtlarıyla karşılaştırmak. Klasör adını tek başına kanıt saymamak.
- Sonuç: Üç yanlış sınıflandırma düzeltildi. `PLAN_DENETIMI_TEKNIK_TAKIP_PAKETI` ve `HAFTA_1_HIZLI_KAZANIM_PLANI` kendi açık kabul teslimatları nedeniyle kısmi; MCP attestation v2 gelecek-faz planı onaylı olsa da henüz uygulanmadığı için uygulanmayanlar altında tutulmalıdır. İki uygulama denetimi raporu da plan envanterinden çıkarılıp `docs/reports` altına taşındı.

## Karar Ölçütleri

- `yapilanlar`: Belgenin kendi uygulama/araştırma kapsamı tamamlanmıştır. Bilinçli reddedilen veya açıkça başka plana devredilen maddeler ile rutin bakım yeni bir açık teslimat oluşturmuyorsa tamamlanmayı bozmaz. Dış bağımlılık etiketi tek başına açık kabul kriterini kapatmaz.
- `yarim-kalanlar`: Uygulama veya araştırma başlamış ve kısmen tamamlanmıştır; aynı belgenin açık, kabul edilmiş bir teslimatı veya doğrulama kapısı hâlâ vardır.
- `yapilmayanlar`: Plan/spec hiç uygulanmaya başlamamıştır ya da açıkça reddedilmiştir. Tasarımın onaylanması, uygulama başladığı anlamına gelmez.
- Araştırma ve video çıktılarında sınıflandırılan, kaynak belgesinin yazım işi değil, raporun kendisinin tamamlanmış teslimat olup olmadığıdır.

## Sınıflandırma Kararları

### Tamamlanmış planlar

- Uygulama denetimi türündeki `UC_TAN_UCA_DENETIM_RAPORU.md` ve `UCTAN_UCA_DENETIM_RAPORU_2026-09-13.md` `docs/reports` altındadır; AGENTS.md'nin rapor yerleşim kuralı gereği plan envanterinde sayılmazlar.
- `yapilanlar/DEEPSEEK_EDIT_PILOT_VE_MIRROR_KARARLILIK_PLANI.md`: tarihli durum notu operasyonel kabul ve canlı pilotun tamamlandığını kaydediyor.
- `yapilanlar/PLAN_ANTIGRAVITY_GEMINI_DAYANIKLILIK_2026-09-10.md`: İş Paketleri 1-5 ve seri tool-free canary tamamlanmış.
- `yapilanlar/RECENT_RUNS_GOZLEMLENEBILIRLIK_PLANI.md`: tarihli not uygulamayı tamamlanmış ve opt-in mirror'ı varsayılan kapalı kararını teslim edilmiş gösteriyor.
- `yapilanlar/PUBLIC_YAYIN_PLANI.md`: public repo, sanitizasyon ve tek yönlü senkron kurulmuş; devam eden tarama ve Actions kontrolü rutin yayın işletimidir.
- `yapilanlar/MODEL_KIMLIGI_VE_ERISIM_MODU_PLANI.md`: Faz 1-3 uygulanmış; native Claude edit Faz 4 abonelik yokluğu nedeniyle açıkça reddedilerek kapatılmış.
- `yapilanlar/PLAN_SUBAGENT_BRIDGE_STRATEGIC_ROADMAP_2026-09-10.md`: WP1-WP6/WP5-B ve canlı kabul matrisi tamamlanmış, Sol kapanışı APPROVED.
- `yapilanlar/ORKESTRASYON_GELISTIRME_PLANI.md`: tarihli notta hedeflenen P0 ve sürüm fazları uygulanmış; daha sonraki ölçüm kapıları ve genişleme işleri ayrı V2 planına devredilmiş.
- `yapilanlar/MCP_KURAL_DOGRULAMA_PLANI_2026-09-20.md`: v1 salt-okunur resource, negatif güvenlik testleri ve smoke kabulü tamamlanmış. v2 gelecek fazları ayrı plandır.
- `yapilanlar/HADES_HAFIZA_YAZMA_SKILLI_PLANI_2026-09-20.md`: açık yazma akışı uygulanmış ve Sol kapanış denetimi tamamlanmış.
- `yapilanlar/HADES_HAFIZA_KALAN_RISKLER_PLANI_2026-09-20.md`: W1-W6 uygulanmış, plan ve kapanış bulguları kapatılmış.

### Tamamlanmış araştırma/video çıktıları

- Altı video raporu: `avenox_videosu.md`, `avenox_jev_videosu.md`, `forn_videosu.md`, `forn_ilk_proje_videosu.md`, `forn_jev_beyin_videosu.md` ve `selma_kocabiyik_ajan_videosu.md`.
- Kalıcı hafıza piyasa araştırması: `KALICI_HAFIZA_PIYASA_ARASTIRMASI_2026-08-21.md`.
- Deep research raporunun tamamlanmış revizyonları: `deep-research-report.md`, `deep-research-report-v2.md` ve `deep-research-report-v3.md`.
- Araştırma raporlarında belirtilen erişilemeyen kaynaklar veya kamuya açık olmayan ayrıntılar, raporun kendi sınırlılığıdır; ayrı bir açık proje teslimatı olarak tanımlanmamıştır.

### Kısmi planlar ve açık araştırma

- `yarim-kalanlar/ORKESTRASYON_GELISTIRME_PLANI_V2.md`: rol politikası/enstrümantasyon tamam; Faz 4 gerçek kullanıcı edit verisi ve devamındaki Faz 5-7 kapıları açık.
- `yarim-kalanlar/PLAN_IKINCI_BEYIN_V3_DESEN_UYARLAMASI_2026-09-18.md`: M0-M2 uygulanmış; canlı pilot, Antigravity bağımlılığı ve olay/ölçüm kapılı işler açık.
- `yarim-kalanlar/CONTEXT_ORKESTRASYONU_VE_GUVENLI_SECOND_BRAIN_PLANI_2026-08-21.md`: Aşama 1 tamam; Aşama 2-5 gerçek kullanım ve resmi kapanış için açık.
- `yarim-kalanlar/M2_PROJE_COHORT_ETIKETLEME_PLANI_2026-09-24.md`: canonical cohort ve üç tarihsel atıf tamam; gerçek proje registry'si ve istemci trust/reload/context-injection smoke kontrolleri bekliyor.
- `yarim-kalanlar/CODEX_SUBAGENT_CALISTIRMA_ARASTIRMA_NOTU.md`: Codex araştırmasının bir bölümü mevcut; ölçütler ve OpenCode karşılaştırması eksik.
- `yarim-kalanlar/PLAN_DENETIMI_TEKNIK_TAKIP_PAKETI_2026-08-21.md`: İş Paketleri 1-6 tamam, fakat aynı planın açık İş Paketi 7 GLM HighSpeed canlı pilotu hâlâ abonelik blokajında. Önceki indeks bunu `yapilanlar` içinde göstererek paket düzeyindeki blocker'ı kategoriye yansıtmamıştı.
- `yarim-kalanlar/HAFTA_1_HIZLI_KAZANIM_PLANI.md`: Gemini özet-tabanlı aday taramasında işaretlendi; yerel kaynak doğrulaması Madde 3'ün açık kabul kriterleri arasında gerçek read-only/edit pilotu ve provider durumunun `VERIFIED` olmasını istediğini gösterdi. Abonelik blokajı genel dış-bağımlı etiketiyle kapatılamaz.

### Uygulanmayan veya reddedilen

- `yapilmayanlar/ENTROPI_ISTISNASI_MINI_SPEC_2026-09-23.md`: Sol güvenlik incelemesi sonrası açıkça reddedilmiş ve uygulanmamış.
- `yapilmayanlar/MCP_KURAL_ATTESTATION_GELECEK_FAZLARI_PLANI_2026-09-20.md`: Sol tarafından plan düzeyinde onaylanmış, ancak v2 uygulaması hiç başlamamış. Mevcut v1 uygulaması ayrı `docs/plans/yapilanlar/MCP_KURAL_DOGRULAMA_PLANI_2026-09-20.md` kapsamıdır; bu planın kısmi sayılması kapsamları karıştırırdı.

## Gemini Subagent Bulgusu ve Sınırı

- Antigravity capability probe'unda Gemini 3.8 Flash için `modelAccess`, `toolFreeResponse` ve `workspaceRead` kullanılabilir döndü; bu, önceki hatanın model hesabı erişimi olmadığını gösteriyor.
- Yerel redakte ayar incelemesi `settings.json` dosyasının parse edilebilir ve yazılabilir olduğunu, read-only preflight'ı düşüren durumun özgül bir mevcut `command(...)` allow kuralı olduğunu gösterdi. Ham kural veya ayar içeriği rapora alınmadı.
- Kaynak kodundaki guard, tüm `command(...)` allow kurallarını geçici `command(*)` deny uygulanmadan önce reddediyordu. Resmî Antigravity izin belgesi deny kurallarının allow kurallarından öncelikli olduğunu ve Windows CLI için de bu sıranın geçerli olduğunu belirtiyor: https://antigravity.google/docs/permissions (erişim: 2026-09-27).
- Adapter guard'ı, yalnız read-only deny listesiyle kapsanan izinleri kabul edecek şekilde güncellendi; deny listesi komut, unsandboxed yürütme, dosya yazımı, MCP ve etkileşimli URL eylemlerini kapsıyor. `tests/faz-1-antigravity.test.js` 42/42 geçti.
- Kullanıcı OpenCode'u yeniden başlattıktan sonra Antigravity 3.8 Flash için modelAccess, toolFreeResponse ve workspaceRead probeları başarılı oldu. Resmî izin belgesi üzerinde salt-okunur canlı görev de başarıyla tamamlandı (104,8 sn, retry yok); bu, read-only enforcement düzeltmesinin etkin runtime'da çalıştığını doğruladı.
- Gemini yalnız sağlanan plan özetlerinden aday tutarlılık incelemesi yaptı; workspace dosyalarını okumadı veya nihai karar vermedi. `HAFTA_1` adayının kabul kriterleri ana orkestratörce kaynakta doğrulandı; üç düzeltmenin tüm nihai kararları yerel belgelere dayanır.
- `--dangerously-skip-permissions` veya eşdeğer izin bypass'ı kullanılmadı.

## Doküman Güncellemeleri

- `UC_TAN_UCA_DENETIM_RAPORU.md` ve `UCTAN_UCA_DENETIM_RAPORU_2026-09-13.md` uygulama denetimi raporu olarak `docs/reports` altına taşındı; eski yol referansları güncellendi.
- Altı video analiz belgesindeki tamamlanmış işe rağmen kalmış gelecek zamanlı yönergeler tarihli teslimat notuyla değiştirildi.
- Piyasa araştırması raporuna araştırma teslimatı ile ayrı uygulama/ölçüm kapılarının ayrımını belirten durum notu eklendi. Deep-research rapor zincirinde v3 en güncel, v1/v2 tarihsel revizyon olarak işaretlendi.
- Orkestrasyon V1 → V2, MCP v1 ↔ v2 ve Hades yazma → kalan-riskler belgeleri arasındaki referanslar açık yollarla netleştirildi.
- 2026-09-18 tarihli tamamlanma raporuna HAFTA_1'in yeni sınıflandırmasını belirten tarihli takip notu eklendi; eski değerlendirme korunuyor. Gemini hata raporunun başına da §11'deki canlı çözümü belirten ek not yazıldı.
- İndeks ve klasör README sayıları güncellendi; `yapilmayanlar/README.md` sınıflandırılmış plan/çıktı sayısına dahil edilmedi.

## Güncel Envanter

- `yapilanlar`: 20 içerik — 10 tamamlanmış plan ve 10 araştırma/video çıktısı.
- `yarim-kalanlar`: 7 içerik — kısmi uygulama/araştırma ve açık teslimat.
- `yapilmayanlar`: 2 plan/spec — biri reddedilmiş, biri onaylı fakat uygulama başlamamış.
- Kök istisnaları: `DURUM_INDEKSI.md` dizin, `MINI_SPEC_SABLONU.md` şablondur.
- Durum klasörlerinde 29 sınıflandırılmış içerik ve `yapilmayanlar/README.md` açıklaması bulunur (30 Markdown dosyası). Kök dizin ve şablon belgeleri bu sayıma dahil değildir.
