Kaynak : https://www.youtube.com/watch?v=OhnKe-L5-lU

> Durum notu (2026-09-27): Video/transkript analizi tamamlandı; aşağıdaki tarihli rapor bu dosyanın teslim edilmiş analiz çıktısıdır.

## Rapor (2026-09-19)

### Yöntem

- Transkript yerel alım hattıyla toplandı (`npm run video:collect`): otomatik Türkçe altyazı (`tr-orig`), süre 1903 saniye, 37.602 bayt; `untrusted_video_transcript` zarfı ve `transcript_only` modalitesi.
- Analiz Antigravity Gemini 3.8 Flash ile yapıldı (salt-okunur, dosyadan okuma, araçsız analiz). İlk deneme başarılı: `retries 0`, 144,5 saniye; onarım turu gerekmedi; `webEvidence` null olarak normalize edildi.

### Video Künyesi

- Başlık: Bir Ajan Nasıl Uyanır ve Ne Kadar Harcar? Şirketimin İçi
- Kanal: Selma Kocabıyık
- Konu: "Ajan Şirketi" serisinin ikinci bölümü; çoklu ajan sisteminin uyanma mekanizması, dosya mimarisi, denetim katmanı ve gerçek çalışma maliyetleri.

### 1. Video İçeriği

- Ana anlatı: Her sabah tekrarlanan 15 sabit görevi (sponsorluk yazışmaları, yorum analizi, sosyal medya taraması) otomatize etmek için kurulan ajan sisteminin iç işleyişi anlatılıyor; üç ana ajan (Gözcü, Ölçücü, Yazıcı), denetleyici Bekçi, zamanlayıcı ve insan yayın onayı bileşenleri tanıtılıyor.
- Akış: tetikleme saatleri; iş kuyruğu kontrolü; bağlam yükleme (anayasa, kimlik, kurallar, takım, defter); YouTube yorum analizi koşusu; Telegram yönlendirme hatası ve düzeltmesi; iş yokken yapılan gereksiz harcamanın analizi; ikinci koşu maliyet dökümü; piksel arayüz; X (Twitter) iddia doğrulama hattı; 12 koşudan 2 üretime ulaşan filtreleme sonucu.
- Adı geçen araçlar: Claude Code ve Claude modelleri (Sonnet, Haiku, Opus), Telegram Bot API, Apify, Python yardımcı betikleri, Pixel Agents açık kaynak görselleştirme, VS Code, GitHub, pytest benzetmesi, Obsidian (analoji), Codex Hermes.
- Kişiler ve kurumlar: Selma Kocabıyık (kanal sahibi), Anthropic, OpenAI, BMO karakteri (piksel tasarım esini).

### 2. Teknik Detaylar

- Uyanma ve yaşam döngüsü: zamanlayıcı veya Telegram olayı ile tetikleme; önce iş kuyruğunun denetlenmesi, boşsa anında durma; iş varsa çekirdek bağlamın (anayasa, kimlik, kurallar, takım, defter) yüklenmesi; araç çalıştırma; iddiaların ayrıştırılıp birincil kaynaklardan doğrulanması; eşik kararı; Bekçi denetimi ve düzeltme döngüsü; durum ve defterin güncellenmesi; yayın için insan onayı.
- Mimari bileşenler: klasör tabanlı ajan mimarisi (takım, kurallar, defter, durum dosyaları); dağıtıcı/iş kuyruğu JSON koordinasyonu; paylaşılan anayasa; deterministik denetçi katmanı (yazılım testlerine benzetilen Bekçi); pahalı üretim modelinden önce çalışan ön filtre ajanı; harici araç sarmalayıcıları (Apify ve Python betikleri).
- Maliyet verileri: başarılı YouTube koşusu yaklaşık 0,60 USD; iş yapmadan sabit dosyaları okuyan hatalı koşu 0,40 USD; X iddia doğrulama koşusu 0,90-1,00 USD; X ajanı için koşu başına 2,00 USD tavan; 12 koşudan 2'si yayına uygun (yaklaşık yüzde 83 eleme); günlük manuel yük yaklaşık 15 görev.
- Kıyaslamalar: Sonnet derin analiz, Haiku standart işler, Opus ağır işler; istek başına ödeme yerine abonelik havuzu; resmi YouTube API yerine Apify; LLM niyet yönlendiricisi ile Python anahtar kelime yönlendirmesi.
- Sınırlar ve uyarılar: sonsuz ret döngüsü riskine karşı süre ve bütçe tavanı zorunlu; bağlam şişmesi taban maliyeti yükseltiyor; statik anahtar kelime yönlendirmesi akışı bozabiliyor (örnek: "YouTube analizi" isteğinin X ajanına kaçması); zamanlanmış ve manuel tetiklerde aynı önbellek kuralı gereksiz harcama üretiyor.

### 3. Orkestrasyon Projemize Uyarlanabilir Mimari Öneriler

- Öneri 1: Tetikleyici kaynağına duyarlı çift kademeli önbellek.
  - Yerel değerlendirme: Bizde otonom zamanlanmış koşu yok; tüm çağrılar kullanıcı veya orkestratör tetikli. Zamanlı ajan işi doğmadan uygulanmamalı.
  - Öncelik: Düşük. Karar: ihtiyaç kapısı (zamanlanmış görev senaryosu doğarsa).
- Öneri 2: Ucuz modelle eleme, yüksek maliyetli modelle üretim.
  - Yerel değerlendirme: Zaten çekirdek ilke; AGENTS subagent seçim kapısı ve model kademelendirmesi (Luna/Flash dar işler, Sol zor işler) bunu uyguluyor.
  - Öncelik: Yüksek (mevcut).
- Öneri 3: Deterministik bağlam dilimleme ve sıfır çağrı durum denetimi.
  - Yerel değerlendirme: Kısmen mevcut: hook akışı yalnız sınırlı ve ilgili sonuçları enjekte ediyor; `runs:recent` ve metrikler durum denetimini yerel tutuyor. Kuyruk boşken LLM çağrısı yapılmaması bizim akışta zaten geçerli.
  - Öncelik: Orta (mevcut tasarımın işlevi).
- Öneri 4: Deterministik bekçi katmanı ve devre kesici.
  - Yerel değerlendirme: Zaten uygulanıyor: Zod şemaları, şema dışı çıktının reddi, sağlayıcı/model bazlı circuit breaker, fail-closed davranış ve retry bütçeleri.
  - Öncelik: Kritik (mevcut).
- Öneri 5: Atomik durum yönetimi ve SHA-256 korumalı mutasyon.
  - Yerel değerlendirme: Videodakinin ötesinde mevcut: WAL niyet günlüğü, kilit yönetimi, optimistic concurrency, SHA-256 doğrulaması ve fail-closed orphan guard. Ek iş gerekmiyor.
  - Öncelik: Yüksek (mevcut, daha güçlü).
- Öneri 6: Hibrit niyet yönlendirme (deterministik kalıp + gerektiğinde ucuz sınıflandırıcı).
  - Yerel değerlendirme: Bizde araç yüzeyi MCP şemalarıyla sabit; yanlış ajana kaçma riski düşük. Ucuz sınıflandırıcı fikri önceki video raporlarında da karar kapısı olarak duruyor; ölçülmüş yönlendirme hatası olmadan eklenmemeli.
  - Öncelik: Orta. Karar: ölçüm/karar kapısı.

### 4. Transkriptten Doğrulanamayan Noktalar

- Olası altyazı hataları: "cloud code" → Claude Code; "Fable 5 / Fabone Taki / Fable Sonet" → Claude 3.5 Sonnet ve Claude modelleri; "HQ" → Claude Haiku; "Antropac" → Anthropic; "opify key" → Apify belirteci; "Facess YouTube" → faceless YouTube; "P test" → pytest; "Gitab/gitup" → GitHub; "Walt kısmındımaki" → Vault kısmındaki.
- Doğrulanamayan detaylar: dosya şablonlarının ve klasör ağacının tam yapısı; Bekçi'nin teknik olarak ne olduğu (harici test, kabuk betiği veya ikinci model); piksel arayüzün dosya olaylarını hangi protokolle dinlediği; insan onayının hangi arayüzden verildiği; Apify yorum çekiminin hacmi ve sayfalama parametreleri.

### 5. Sonuç

- Video, bizde zaten uygulanmış güvenlik ve maliyet desenlerini (deterministik denetim, devre kesici, atomik durum, kademeli modeller) bağımsız bir kurulumda doğruluyor; ölçümleri bizim yaklaşımımızla uyumlu.
- Bizde karşılığı olmayan tek belirgin fikir, otonom zamanlanmış koşularda tetikleyici-duyarlı önbellek yönetimi; böyle bir iş kapsamı doğmadan uygulanmamalı.
- Hemen uygulanacak yeni bir kod işi yok; öneriler mevcut mimariyle karşılanıyor veya karar kapılarında bekliyor.
- Bu rapor 2026-09-19 canlı pilotuyla (yerel alım + Antigravity Gemini, ilk deneme başarılı) üretilmiştir.
