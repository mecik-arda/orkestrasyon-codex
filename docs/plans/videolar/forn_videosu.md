Kaynak : https://www.youtube.com/watch?v=LNKj9yh-hhM

> Durum notu (2026-09-27): Video/transkript analizi tamamlandı; aşağıdaki tarihli rapor bu dosyanın teslim edilmiş analiz çıktısıdır.

## Rapor (2026-09-18)

### Yöntem

- Antigravity web okuma yeteneği `permission_denied` döndü (adaptör araç izni sınıfı; model erişimi sağlıklı). Video içeriği yerel `yt-dlp 2026.03.17` ile alındı: Türkçe otomatik altyazı, 253 satır, yaklaşık 9.4 bin karakter.
- Altyazı Gemini 3.8 Flash ile analiz edildi; ardından Gemini 3.7 Flash tam altyazı üzerinden bağımsız doğrulama yaptı. Doğrulamada tüm iddialar "destekliyor" sonucu aldı.
- Ürün ve proje adları otomatik altyazı kaynaklıdır; gerçek adlar bağımsız doğrulanamadı (web erişimi kapalı). Video içeriği güvenilmeyen veri olarak ele alındı.

### Video Künyesi

- Başlık: Yapay Zekada Yeni Bir Dönem mi Başlıyor?
- Kanal: Forn AI
- Konu: Serbest metin yerine yapılandırılmış kararlar, puanlar ve olasılıklar döndüren ucuz ve hızlı bir mikro-karar modelinin çok ajanlı orkestrasyon sistemlerine entegrasyonu
- Bu video, avenox videosunun aksine, doğrudan bizim orkestrasyon mimarimizle ilgilidir

### 1. Video İçeriği

- Ana iddia: Kod yazan ajanların etrafındaki sürekli tekrarlanan küçük kararlar (yönlendirme, alaka tespiti, bağlam ayıklama, adım tamamlama denetimi) pahalı frontier modeller yerine ultra ucuz ve hızlı bir mikro-karar modeline devredilebilir.
- Model: Altyazıda CEV, JEV, CV, C'e, Cevi ve CE olarak geçen model; serbest metin veya kod üretmez; önceden tanımlanmış seçenekler, puanlar ve olasılıklar döndürür.
- Geliştirici: Altyazıda "type safe" olarak anılan şirket (gerçek ad doğrulanamadı).
- Oyun gösterimi: Modele ekran görüntüsü değil sembolik durum verilir (karakter konumu, önündeki engel, yapılabilir hareketler); oyun kodu seçilen hareketi uygular ve yeni durum döngüye girer.
- Paralellik: Birbirinden bağımsız sorular tek istekte paralel değerlendirilir; bağımlı soruların sırasını çağıran kod kurar.
- Topluluk projeleri: Codex Router (işe göre model ve düşünme düzeyi seçimi) ve Winnow/Winov (ilgisiz bağlamın gizlenmesi).
- Maliyet iddiası: Konuşmacı 385 istekte 3 sent harcama gözlemlediğini belirtir; istek başına yaklaşık 0.000078 dolar.
- Kalibrasyon: Şirketin, döndürülen olasılıkların gerçek sonuçlarla uyuşmasını hedefleyen özel bir eğitim yaklaşımı uyguladığı belirtilir.
- Sınırlar: Kod yazamaz, sohbet edemez, bağımlı kararları kendi içinde zincirleyemez, görsel girdi işlemez.
- Konuşmacı uyarıları: Ucuz modele gönderip işi üç kez düzelttirmek tasarrufu anlamsız kılar; Codex Router denenmedi; topluluk projelerinin sonuçları ölçülmedi; yüksek olasılık yüzdesi kesin doğruluk anlamına gelmez.

### 2. Doğrulanan Teknik Detaylar

- Çıktı yapısı: Önceden tanımlı seçenekler, sayısal puanlar ve olasılıklar; serbest metin yok.
- Girdi: Yapılandırılmış sembolik durum; görüntü yok.
- Bağımlı/bağımsız soru ayrımı ve paralel değerlendirme.
- Beş kullanım senaryosu: hata araştırmasında ilgili dosyayı bulma, hazırlanmış değişikliğin koşula uygunluk kontrolü, gelen isteğin uygun modele yönlendirilmesi, ajan bağlamından ilgisiz parçaların gizlenmesi, ajan adımı bitince devam veya doğrulama kararı.
- Araştırma akışı: Kaynakları "konuyla ilgili mi, somut kanıt içeriyor mu, başka kaynağın tekrarı mı" ölçütleriyle puanlama ve sıralama.
- Doğrulanamayanlar: Modelin iç mimarisi, gecikme ölçümleri, girdi token boyutu, kalibrasyon yönteminin ayrıntısı, topluluk projelerinin üretim başarısı, ürün adlarının gerçek yazımı.

### 3. Orkestrasyon Projemize Mimari Öneriler

Aşağıdaki öneriler videodan çıkarılmıştır; her biri mevcut mimarimiz ve kısıtlarımız açısından yerelde değerlendirilmiştir.

- Öneri 1: Ucuz mikro-karar modelini ön yönlendirici olarak konumlandırma.
  - Video gerekçesi: İstek türünü ucuz model değerlendirip uygun modele ve düşünme düzeyine yönlendirirse maliyet ve süre kazancı sağlanır.
  - Yerel değerlendirme: Mevcut durumda yönlendirme rol profilleri, allowlist ve statik config ile yapılıyor; model-fit ölçümü var. Mikro-karar modeli yeni bir sağlayıcı entegrasyonu gerektirir (adapter, config, MCP şeması, health, test, pilot). Ürün ve API bağımsız doğrulanamadı. Bu iş ayrı bir plan ve sağlayıcı ekleme karar kapısına bağlıdır; mevcut sağlayıcılarla yaklaşık çözüm için DeepSeek Flash gibi ucuz modeller sınıflandırma amaçlı denenebilir.
  - Öncelik: Orta. Karar: dış-bağımlı, ayrı plan.
- Öneri 2: Bağlam budama filtresi (Winnow deseni).
  - Video gerekçesi: Kod ajanının bağlamına dolan ilgisiz dosya, log ve arama çıktıları token maliyetini şişirir.
  - Yerel değerlendirme: Kalıcı hafıza hook'umuz zaten sorgu bazlı seçim ve katı bağlam bütçesi uyguluyor; read-only alt ajanlarda araç çıktıları için ikinci aşama alaka filtresi eklenebilir. Mevcut ücretsiz/ucuz sağlayıcılarla prototiplenebilir; ancak kritik satırların gizlenmesi riskine karşı tam bağlam ile karşılaştırmalı ölçüm ve opt-in zorunludur. Testler ve fail-closed kapılar korunur.
  - Öncelik: Orta-yüksek. Karar: opt-in pilot, ölçüm kapısı.
- Öneri 3: Hafıza notu alaka ve çelişki ön puanlaması.
  - Video gerekçesi: Kaynak sayısı arttıkça ilk eleme tekrarlanır; ucuz model ilk elemeyi iyi yaparsa orkestratöre derli toplu malzeme kalır.
  - Yerel değerlendirme: `search_persistent_memory` zaten sıralama ve en fazla beş not sınırı uyguluyor. Ek puanlama yalnız danışmanlık olabilir; not seçimi ve promote kararı ana orkestratörde kalır. Redakte audit ve injection sınırları korunur.
  - Öncelik: Düşük-orta. Karar: opt-in, danışmanlık.
- Öneri 4: Alt ajan adım tamamlama ve doğrulama tetikleme puanlayıcısı.
  - Video gerekçesi: Ajan adımı bitince devam mı doğrulama mı kararı ucuz modele sorulabilir.
  - Yerel değerlendirme: Mevcut mimaride alt ajan çıktısı kanıt değil danışmanlıktır; tamamlanma kararını testler ve ana orkestratör verir. Mikro puanlayıcı yalnız hangi doğrulama komutunun önce çalıştırılacağına dair triyaj için kullanılabilir; onay veya edit yetkisi verilemez.
  - Öncelik: Düşük. Karar: reddedildi (yetki devri); yalnız triyaj fikri danışmanlık olarak not edildi.
- Öneri 5: Araştırma kaynağı çok ölçütlü puanlama.
  - Video gerekçesi: Yüzlerce kaynağın alaka, kanıt ve tekrar ölçütleriyle sıralanması.
  - Yerel değerlendirme: Araştırma raporu sözleşmemizde kanıt, güven düzeyi ve doğrulama durumu alanları var; Gemini aday üretimi ve bağımsız yerel doğrulama akışı bu ihtiyacın bir bölümünü karşılıyor. Puanlama yalnız ön eleme olabilir; iddiaların kaynakta doğrulanması kuralı değişmez.
  - Öncelik: Orta. Karar: mevcut akışa danışmanlık katmanı olarak değerlendirilebilir.
- Öneri 6: Değişiklik ön koşul puanlayıcısı.
  - Video gerekçesi: Hazırlanan diff'in koşullara uygunluğunun ucuz modelle kontrolü.
  - Yerel değerlendirme: Deterministik kontrollerimiz (yasak belirteçler, secret taraması, SHA-256, dosya kapsamı, testler) zaten fail-closed çalışıyor. Yapay zeka puanı bu kapıların yerine geçemez; yalnız ek uyarı üretebilir. Ek değer sınırlıdır.
  - Öncelik: Düşük. Karar: gerekli değil.
- Öneri 7: Mikro karar çağrıları için bütçe ve devre kesici izolasyonu.
  - Video gerekçesi: İstek başına maliyet düşük olsa da yüksek frekanslı döngülerde sağlayıcı sınırlarına takılma riski var.
  - Yerel değerlendirme: Sağlayıcı bazlı circuit breaker, retry bütçeleri, rezervasyon ve redakte metrik altyapımız mevcut; yeni bir sağlayıcı eklenirse aynı bütçe ve devre kesici mekanizmasına bağlanmalıdır.
  - Öncelik: Yüksek (yalnız yeni sağlayıcı eklenirse). Karar: mevcut altyapı yeterli, yeni sağlayıcıda zorunlu.

### 4. Sonuç

- Bu video, mevcut mimarimizle en ilgili iki videodan biri; ancak videodaki model bağımsız doğrulanamadı ve yeni bir sağlayıcı entegrasyonu gerektiriyor.
- Hemen uygulanabilir iki düşük riskli fikir: bağlam budama filtresinin opt-in pilotu (mevcut ucuz modelle, karşılaştırmalı ölçümle) ve araştırma kaynakları için çok ölçütlü ön puanlama (danışmanlık, kaynakta doğrulama kuralı korunarak).
- Yetki devri gerektiren öneriler (otomatik ilerleme, edit ön onayı) reddedilmiştir; mikro modeller yalnız danışmanlık ve triyaj katmanında kalır, fail-closed kapılar ve ana orkestratör kararı korunur.
- Öneri 1 ve 7, yeni sağlayıcı kararı verilirse aynı plan içinde ele alınmalıdır; bu karar kullanıcıya aittir.
