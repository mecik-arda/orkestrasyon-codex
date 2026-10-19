# Video Kaynaklı Planların Mimariye Uygunluk ve Fayda-Zarar Analizi

Tarih: 2026-09-21
Durum: Analiz raporu; kod değişikliği içermez.

## 1 Yöntem

- Mimari özeti Antigravity Gemini 3.8 Flash ile salt-okunur çıkarıldı (README, AGENTS.md, DURUM_INDEKSI, policy.json, memory.js, bridge-runtime.js, router.js, metrics.js, skill listesi).
- Uygunluk ve fayda-zarar analizi ikinci bir Gemini 3.8 Flash turuyla altı video raporu ve iki video kaynaklı plan üzerinden yapıldı.
- Gemini bulguları hipotez kabul edildi; durum ve kapsam iddiaları ana orkestratör tarafından kaynak raporlarda doğrulandı. Ürün adları, fiyatlandırma ve performans iddiaları videolarda bağımsız doğrulanamayan verilerdir ve karara dayanak yapılmadı.

## 2 Mimari Özet (ilgili yüzey)

- MCP araç yüzeyi: 26 koşulsuz araç; orkestratör onayı etkinken bir ek araç (toplam 27); kalıcı hafıza, subagent çalıştırma, görev profilleri, kilit ve sağlık kontrolleri; kural attestation v1 salt-okunur resource.
- Kalıcı hafıza: iki aşamalı yazma (taslak `00_Inbox` -> SHA-256 kontrollü promote), PII/injection/secret kapıları, karantina, optimistic concurrency, mutasyon niyet günlüğü, redakte audit.
- Hook pilotu (M2): opt-in, salt-okunur, en fazla beş alıntı ve 1200 karakter; canlı pilot açık (15 etiketli oturum veya 2 hafta).
- Yönlendirme: kanonik sağlayıcı çözümleme, görev profilleri, model-fit ölçümü, tek derinlikli delegasyon ve workspace kilidi.
- Kontrollü edit: disposable workspace, onay kapısı, dosya kapsamı ve fail-closed doğrulama.
- Dayanıklılık: sınırlı retry, tek denemelik şema onarımı, model bazlı circuit breaker.
- Maliyet: atomik rezervasyon/settlement, gözlenen ve tahmini maliyet ayrımı, kapsama oranı; aylık eşik bilgilendirme, enforcement varsayılan kapalı.
- Web kanıtı: strict carrier şeması, alıntı sınırları ve karantina zarfı.
- Dağıtım: 12 skill, AGENTS kuralları, public/private tek yönlü senkron ve sanitizasyon.

## 3 Uygulanmış veya Mevcut Mimaride Karşılanan Desenler

- Asimetrik rol dağıtımı (avenox_videosu): pahalı modeller planlama/denetim, ucuz modeller icra. Bizde rol profilleri, model kademelendirmesi ve subagent seçim kapısı bunu karşılıyor. Fayda yüksek, ek iş yok; zarar riski düşük (zayıf modelin karmaşık işte tekrar döngüsü riski seçim kapısıyla sınırlanır).
- Deterministik bekçi ve devre kesici (selma_kocabiyik_ajan_videosu): Zod şemaları, şema dışı çıktının reddi, sağlayıcı/model bazlı circuit breaker ve retry bütçeleri mevcut. Videodaki kurulum bizim yaklaşımı bağımsız doğruluyor.
- Atomik durum ve SHA-256 mutasyon (selma): WAL niyet günlüğü, kilit, optimistic concurrency ve fail-closed orphan guard videodakinin ötesinde mevcut.
- Öneri ile kesin karar ayrımı (forn_ilk_proje_videosu): hafızada taslak/promote ayrımı, edit tarafında onay kapıları ve deterministik testler bu gereksinimi karşılıyor.
- Harici derin planlamanın yerel icradan ayrılması (avenox): harici raporlar `docs/reports` veya Vault taslağı olarak alınır ve doğrulama kapılarından geçer.
- Mikro karar çağrıları için bütçe ve devre kesici izolasyonu (forn_videosu): mevcut altyapı yeterli; yeni bir sağlayıcı eklenirse aynı mekanizmaya bağlanması zorunlu.
- Deterministik bağlam dilimleme ve sıfır çağrı durum denetimi (selma): hook sınırlı sonuç enjekte eder, `runs:recent` ve metrikler yerel kalır.

## 4 Koşullu, Karar Kapısında veya Açık Olanlar

- M2 canlı hook pilotu (PLAN_IKINCI_BEYIN_V3_DESEN_UYARLAMASI): altyapı ve güvenlik invariantları hazır. Bekleyen kabul: 15 etiketli gerçek oturum veya 2 hafta + Sol denetimi. Fayda: oturum başında ilgili notların otomatik sunulması. Zarar riski: bağlam kirliliği, açılış gecikmesi (1500 ms bütçesi) ve ilgisiz enjeksiyon; invariantlarla sınırlandırılmıştır. Uygunluk: koşullu, pilot kararına bağlı.
- Handoff ve durum sözleşmesi (CONTEXT_ORKESTRASYONU_VE_GUVENLI_SECOND_BRAIN_PLANI): Aşama 1 tamam; Aşama 2 durum notu formatı ve kayıpsız devir kabulü açıktır ve gerçek çok oturumlu iş doğduğunda ele alınır. Fayda: kayıpsız devir. Zarar riski: küçük işlerde gereksiz dokümantasyon yükü. Uygunluk: koşullu/açık.
- Mini-spec sözleşmesinin doğrulanması (CONTEXT planı Aşama 3): orta karmaşıklıkta gerçek bir değişiklikte spec kabul kriterlerinin diff ve testle birebir doğrulanması açıktır; şablon mevcut olsa da resmi kabul yapılmamıştır. Uygunluk: koşullu/açık.
- Context Aşama 4-5 resmi kapanışı (CONTEXT planı): kontrollü paralel araştırma ve güvenlik/kalite kapıları fiilen uygulanıyor; resmi kapanış gerçek iş üzerinde yapılacaktır. Uygunluk: koşullu/açık.
- Karar geçersiz kılma ve eskimiş bağlam temizliği (forn_ilk_proje_videosu, O5): eski kararların uyarılması ve geçersiz kılınan bağlamın temizlenmesi orta öncelikli karar kapısıdır; DURUM_INDEKSI O5'i açık tutar. Fayda: bağlam tazeliği. Zarar riski: yanlış geçersiz kılma ve ek bakım yükü. Uygunluk: koşullu.
- Bağlam budama filtresi, Winnow deseni (forn_videosu): opt-in pilot ve karşılaştırmalı ölçüm şartıyla. Fayda: token ve bağlam tasarrufu. Zarar riski: kritik satırların yanlış pozitifle budanması. Uygunluk: koşullu; ölçüm kapısı.
- Hata kaydı kümeleme ve tekilleştirme (avenox_videosu): mevcut redakte JSONL metrikleri hata sınıflarını zaten yapılandırılmış tutuyor. Fayda, ham log hacmi ölçülmeden sınırlıdır. Uygunluk: karar kapısı; ayrı plan.
- Ontolojik DAG ve değişiklik etki önizlemesi (forn_ilk_proje_videosu): statik analiz karmaşıklığı ve yüksek bakım yükü nedeniyle ölçülmüş ihtiyaç doğmadan başlatılmamalı. Uygunluk: koşullu.
- Çok ölçütlü kaynak puanlama (forn_videosu): yalnız danışmanlık katmanı olabilir; kaynakta doğrulama kuralı değişmez. Uygunluk: koşullu.
- Hibrit niyet yönlendirme ve ucuz sınıflandırıcı (selma ve önceki raporlar): araçlar MCP şemalarıyla adlandırılmış olsa da araç sayısı ve yanlış yönlendirme oranı ölçülmemiştir; ölçülmüş yönlendirme hatası olmadan eklenmemeli ve yeni sağlayıcı kararı gerektirir. Uygunluk: ölçüm kapısı, dış-bağımlı.
- Dinamik araç budama ve şema filtreleme (avenox_jev_videosu): araç yüzeyi 26-27 araçtır ve bağlam maliyeti ölçülmemiştir; ölçüm olmadan uygulanmamalıdır. Uygunluk: koşullu; ölçüm kapısı.
- Tetikleyici kaynağına duyarlı çift kademeli önbellek (selma): projede otonom zamanlanmış koşu yok. Uygunluk: ihtiyaç kapısı.
- Durum odaklı hook frekansı (avenox_videosu): hook zaten opt-in, sessiz ve bütçeli; kazanım ölçülmeden değiştirilmemeli. Uygunluk: karar kapısı.

## 5 Reddedilen veya Uygun Olmayanlar (zarar baskın)

- Hook veya otomasyon üzerinden otomatik hafıza yazımı (V3 planı): kullanıcı niyeti, taslak, injection/PII kapısı ve SHA-256 promote zincirini atlatamaz; veri kirliliği ve zehirleme riski nedeniyle tasarım gereği yasak.
- Harici bulut semantik katman (Mem0, forn_jev_beyin_videosu): Vault kökünü dışa açmama, secret sınırları ve üçüncü taraf bağımlılığı yasağı ile çelişir.
- Doğrulama ve ilerleme yetkisinin modele devri (forn_videosu): alt ajan çıktısı kanıt değil danışmanlıktır; tamamlanma kararı deterministik testlerde ve ana orkestratörde kalır.
- Sağlayıcı hatalarının refleks modelle ikincil sınıflandırılması (avenox_jev_videosu): deterministik sınıflandırma fail-closed ve gecikmesizdir; hata anında harici model çağrısı yeni kırılma noktası ekler.
- Diff ön koşul puanlayıcısı ve yapay zeka ön onayı (forn_videosu): deterministik kapıların yerini alamaz; ek değer sınırlı.

## 6 Sonuç ve Öneriler

- Video kaynaklı plan ve önerilerin büyük bölümü mevcut mimariyle karşılanıyor veya ölçüm gerektiren karar kapılarında bekliyor; zarar riski yüksek olanlar (otomatik yazma, bulut katman, yetki devri) zaten reddedilmiş durumda.
- Altyapısı kurulu ve açık başlıca yatırım M2 hook pilotudur; kabul için gerçek etiketli oturum gerekir ve ayrı ücretli sağlayıcı çağrısı gerektirmez (yerel hook akışı). Bunun yanında koşullu/açık maddeler de vardır: Context Aşama 2-3 (format ve mini-spec doğrulaması), Context Aşama 4-5 resmi kapanışı ve O5 karar geçersiz kılma.
- Ücretli yeni sağlayıcı gerektiren öneriler (mikro-karar modeli, ucuz sınıflandırıcı) kullanıcı kararına bağlıdır; ölçüm eşiği ve onay defteri olmadan başlatılmamalıdır.
- Koşullu önerilerde ortak risk, gereksiz karmaşıklık ve bakım yüküdür; her biri kendi ölçüm kapısıyla daraltılmalıdır.
- Rapor, plan statülerini DURUM_INDEKSI ile aynı sınıflandırmayla yansıtır; Context Aşama 4-5 resmi kapanışı da açık maddeler arasında sayılmıştır. Bu rapor planları geriye dönük değiştirmez, yalnız uygunluk değerlendirmesi sunar.

## 7 Kaynaklar

- Video raporları: `docs/plans/videolar/avenox_videosu.md`, `docs/plans/videolar/avenox_jev_videosu.md`, `docs/plans/videolar/forn_videosu.md`, `docs/plans/videolar/forn_ilk_proje_videosu.md`, `docs/plans/videolar/forn_jev_beyin_videosu.md`, `docs/plans/videolar/selma_kocabiyik_ajan_videosu.md`.
- Video kaynaklı planlar: `docs/plans/yarim-kalanlar/PLAN_IKINCI_BEYIN_V3_DESEN_UYARLAMASI_2026-09-18.md`, `docs/plans/yarim-kalanlar/CONTEXT_ORKESTRASYONU_VE_GUVENLI_SECOND_BRAIN_PLANI_2026-08-21.md`.
- Mimari kanıt: `README.md`, `AGENTS.md`, `docs/plans/DURUM_INDEKSI.md`, `config/policy.json`, `subagent-bridge/src/memory.js`, `subagent-bridge/src/runtime/bridge-runtime.js`, `subagent-bridge/src/runtime/router.js`, `subagent-bridge/src/metrics.js`.
- Yöntem: 2026-09-21, Antigravity Gemini 3.8 Flash, iki salt-okunur çağrı; orkestratör yerel doğrulaması.

## 8 Sol Denetimi

- Birinci tur (2026-09-21, Codex `gpt-5.6-sol`, salt-okunur): APPROVED_WITH_RISKS (0 kritik, 3 orta, 1 düşük).
  - Orta: MCP araç sayısı yanlıştı (14 yazılmıştı). Kapatıldı: 22 sabit + 4 dinamik Kimi/Qwen = 26 koşulsuz, onay aracıyla 27; araç yüzeyi gerekçeleri ölçüm kapısına çevrildi.
  - Orta: Context Aşama 2 "format hazır" olarak ileri sınıflandırılmıştı. Kapatıldı: format tanımı ve kayıpsız devir kabulü açık olarak yazıldı.
  - Orta: Sıkıştırmada iki açık madde kaybolmuştu (mini-spec Aşama 3 doğrulaması, O5 karar geçersiz kılma). Kapatıldı: ikisi de §4'e eklendi.
  - Düşük: M2 için "maliyeti yoktur" ifadesi fazla kesindi. Kapatıldı: "ayrı ücretli sağlayıcı çağrısı gerektirmez" olarak daraltıldı.
- İkinci tur: APPROVED_WITH_RISKS (tek orta bulgu: §6'daki "tek açık yatırım" mutlak ifadesi ve Context Aşama 4-5 kapsamı). Kapatıldı: §4'e Aşama 4-5 maddesi eklendi; §6 "başlıca yatırım" olarak daraltıldı ve açık maddeler sayıldı.
- Üçüncü tur: APPROVED (yeni risk saptanmadı; DURUM_INDEKSI ve Context plan durum notuyla uyumlu).
