Kaynak : https://www.youtube.com/watch?v=-qxPjBXp2Ks

> Durum notu (2026-09-27): Video/transkript analizi tamamlandı; aşağıdaki tarihli rapor bu dosyanın teslim edilmiş analiz çıktısıdır.

## Rapor (2026-09-19)

### Yöntem

- Transkript yerel alım hattıyla toplandı (`npm run video:collect`): otomatik Türkçe altyazı, süre 835 saniye, 15.766 bayt; `untrusted_video_transcript` zarfı ve `transcript_only` modalitesi.
- Analiz Antigravity Gemini 3.8 Flash ile yapıldı (salt-okunur, dosyadan okuma, araçsız analiz). İlk deneme başarılı: `retries 0`, 85,8 saniye; onarım turu gerekmedi; `webEvidence` null olarak normalize edildi.

### Video Künyesi

- Başlık: Yapay Zekayla İlk Projene Sıfırdan Başla
- Kanal: Forn AI (aynı kanalın ikinci incelenen videosu; ilk rapor `docs/plans/videolar/forn_videosu.md`)
- Konu: Yapay zeka ile sıfırdan proje geliştirmede mimari kontrol, ontolojik bağımlılık ağı ve karar yönetimi için "Orvent" adlı skill yaklaşımı.

### 1. Video İçeriği

- Ana anlatı: Tekil görevler yapay zeka ile kolayca yürütülüyor; asıl sorun büyüyen projelerde mimari yetersizlik, plansızlık ve karar/görev kopukluğu. Konuşmacı bu sorunu çözmek için geliştirdiği "Orvent" skill'ini tanıtıyor.
- Akış bölümleri: problem tespiti; skill kavramı; Claude ve Codex/ChatGPT için kurulum; `/orvent` ile başlatma; freelancer iş teslimi örnek projesi; "ürün akışı.md" ile akış şeması, başarı ölçütleri ve açık sorular; ontoloji ve nesne haritası; kampanya örneğiyle ağın büyümesi; token tüketim felsefesi; öneri ve kesin karar ayrımı; karar geçersiz kılma; etki önizlemesi; ön koşul blokajı; kısıtlı bağlamla üretim; kalite denetim raporları ve kapanış.
- Adı geçen araçlar: Orvent (skill, `/orvent` komutu), Claude/Claude Code, ChatGPT/Codex, GitHub, Python yardımcı betikleri, `agents.md`/`claude.md` talimat dosyaları, `ürün akışı.md` takip dosyası.
- Örnekler: afiş incelemesi zinciri, kısa kampanya metni ve teslim paketi, masa lambası revizyonu, oyun karakteri kılıç değişiminin tetiklediği kontrol listesi.

### 2. Teknik Detaylar (video iddiaları)

- Önerilen akış: skill kurulumu → `/orvent` ile başlatma → çekirdek kapsam ve "ürün akışı.md" üretimi → ontolojik bağımlılık ağının (yönlü DAG) kurulması → ön koşulsuz işlerin yürütülmesi, ön koşullu işlerin bekletilmesi → değişiklikte etki önizlemesi ve "kontrol gerektirir" işaretlemesi → başarı kriterlerine göre doğrulama ve raporlama.
- Öne çıkan mimari yaklaşımlar: ontoloji ve yönlü bağımlılık modeli; öneri ile bağlayıcı kararın ayrı tutulması; karar geçersiz kılma ve eski bağımlılıkların uyarılması; DAG tabanlı ön koşul yönetimi; deterministik yerel betiklerle LLM rollerinin ayrıştırılması (hibrit çalışma zamanı).
- Maliyet iddiası: Kontrol katmanı token maliyetini artırır; buna karşılık kontrolsüz ilerlemede kodun 10-15 kez baştan yazılmasını önlediği savunulur. Asıl token harcaması kod yazımında değil, mimari denetim ve bağlam yönetiminde olmalıdır.
- Sınırlar ve uyarılar: videodaki adım adım onay akışı gösterim amaçlıdır, gerçek projede bu düzeyde mikro yönetim süreci yavaşlatır; küçük ve tekil işlerde ağır ontolojiye gerek yoktur; kısıtlanmamış serbest promptlar halüsinasyona açıktır, üretim ontolojik kaynağa bağlanmalıdır.

### 3. Orkestrasyon Projemize Uyarlanabilir Mimari Öneriler

- Öneri 1: Öneri (proposal) ile kesin karar (committed) ayrımı.
  - Yerel değerlendirme: Hafızada `draft` → `promote` akışı ve edit tarafında onay sınıfları zaten bu ayrımı sağlıyor. Ek katman şu an gerekli değil; karar kapısı.
  - Öncelik: Yüksek (mevcut tasarımla büyük ölçüde karşılanıyor).
- Öneri 2: Ontolojik DAG ve etki önizleme kapısı (promotion öncesi etkilenen modül/test listesi).
  - Yerel değerlendirme: Yeni ve büyük bir yetenek; statik bağımlılık analizi yanlış pozitif riski taşır. Ölçülmüş ihtiyaç oluşmadan başlatılmamalı.
  - Öncelik: Orta. Karar: ölçüm/karar kapısı (ayrı plan).
- Öneri 3: Karar geçersiz kılma ve eskimiş bağlamın temizliği.
  - Yerel değerlendirme: Hafızada `reviewAfter`/`validUntil`, inceleme ve geçersiz kılma araçları var; supersede akışının veri modeli genişletmesi gerekiyor ve bu, piyasa araştırmasındaki **O5** maddesiyle aynı kapıya düşüyor.
  - Öncelik: Orta. Karar: O5 tetikleyicisine bağlı.
- Öneri 4: Ön koşul blokajı ve sıralı yürütme kapısı.
  - Yerel değerlendirme: Zaten uygulanıyor: `dogrulama-kapisi` akışı, test/verify kapıları ve fail-closed varsayılanı bu işlevi görüyor.
  - Öncelik: Yüksek (mevcut).
- Öneri 5: Token bütçesini doğrulama ve denetime tahsis etme.
  - Yerel değerlendirme: Model kademelendirmesi (Luna/Terra/Sol/Astra), bütçe politikaları ve redakte metrikler bu stratejiyle uyumlu; mevcut.
  - Öncelik: Orta (mevcut).
- Öneri 6: Deterministik yerel betikler ile LLM rollerinin ayrıştırılması.
  - Yerel değerlendirme: Projenin çekirdek ilkesi: MCP Zod şemaları, deterministik servisler ve hash kontrolleri. Mevcut.
  - Öncelik: Kritik (mevcut).

### 4. Transkriptten Doğrulanamayan Noktalar

- Olası altyazı hataları: "Fighton/Fight scriptleri" → Python ve Python betikleri; "cloud/kod ekranında" → Claude/Claude Code; "kitab" → GitHub; "slashvent" → `/orvent`; "EA'ya yaptırabilir" → yapay zekaya.
- Doğrulanamayan teknik detaylar: Python betiklerinin iç yapısı ve kütüphaneleri; paylaşıldığı belirtilen GitHub deposunun adı ve kurulum komutunun tam metni; ontoloji verisinin saklama biçimi (JSON, YAML, Mermaid, SQLite veya özel format); skill yönergelerinin tam metni; görsel şemaların biçimi (`transcript_only` modalitesi nedeniyle görüntü incelenmedi).

### 5. Sonuç

- Video, ilk incelenen Forn AI videosundaki (`forn_videosu.md`) mimari fikirlerin somut bir skill ürününe dönüşmüş halini anlatıyor. Bizde karşılığı olmayan tek güçlü fikir ontolojik bağımlılık ağı ve etki önizlemesi; onun da ölçülmüş ihtiyaç doğmadan uygulanmaması öneriliyor.
- Hemen uygulanacak yeni bir kod işi yok; öneriler mevcut mimariyle büyük ölçüde karşılanıyor veya karar kapılarında bekliyor.
- Bu rapor 2026-09-19 canlı pilotuyla (yerel alım + Antigravity Gemini, ilk deneme başarılı) üretilmiştir.
