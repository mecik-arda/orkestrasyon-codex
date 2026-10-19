Kaynak : https://www.youtube.com/watch?v=d_1AH-Nes-E

> Durum notu (2026-09-27): Video/transkript analizi tamamlandı; aşağıdaki tarihli rapor bu dosyanın teslim edilmiş analiz çıktısıdır.

## Rapor (2026-09-20)

### Yöntem

- Transkript yerel alım hattıyla toplandı (`npm run video:collect`): manuel Türkçe altyazı, süre 667 saniye, 13.305 bayt; `untrusted_video_transcript` zarfı ve `transcript_only` modalitesi.
- Analiz Antigravity Gemini 3.8 Flash ile yapıldı (salt-okunur, araçsız analiz). Uzun prompt doğrudan gönderilmedi; transkript workspace içindeki git-dışı `.hades/video-transcripts/` dosyasından okutuldu. İlk deneme başarılı: `retries 0`, 113,7 saniye; `webEvidence` null olarak normalize edildi.
- Video iddiaları ana orkestratör tarafından tam transkript üzerinden çapraz kontrol edildi; video içeriği güvenilmeyen veri olarak ele alındı.

### Video Künyesi

- Başlık: Jev ile Kendime İkinci Bir Beyin Kurdum
- Kanal: Forn AI (aynı kanalın üçüncü incelenen videosu; öncekiler `forn_videosu.md`, `forn_ilk_proje_videosu.md`)
- Konu: JEV karar modelinin ikinci beyin (kalıcı hafıza) sistemine entegrasyonu, fayda gösterimi ve kod gerektirmeyen kurulum rehberi.
- İlgili önceki rapor: `avenox_jev_videosu.md` (Avenox, 2026-09-19; JEV'in refleks katmanı tanıtımı).

### 1. Video İçeriği

- Ana anlatı: Konuşmacı JEV'i son iki gündür inceliyor; modelin pratik entegrasyonu zaman alsa da ikinci beyin sistemine çok iyi uyduğunu savunuyor. Amaç, oturumlar boyunca kararları ve tercihleri unutmayan, aralarında bağlantılı çıkarım yapan bir hafıza sistemi; kurulum abonelik dışında ücretsiz.
- JEV entegrasyon gerekçeleri: sınıflandırma (kargo bildirimi, kişisel mesaj, reklam ayrımı), seçme/önceliklendirme (aciliyet puanı; bağlama göre karar) ve puanlama (ölçütleri kullanıcı tanımlar).
- Hafıza demoları: hafızalı ve hafızasız thumbnail üretimi karşılaştırması; marka kimliği, maskot ve eski tercihlerin kullanımı; "hakkımda ne biliyorsun" sorgusu; oyun projesindeki kararların gerekçesiyle kaydı (ekonomi modelinin reddi, ödül ritmi tercihi); "normal orkestrasyon katmanı kursak daha mı iyi" sorusundan davranış çıkarımı (yeni modelin varlığı ikna etmiyor, somut katkı isteniyor).
- JEV rolü: Hafızadan gelen seçenekleri doğrudan puanlayıp karar vererek süreci hızlandırıyor; simülasyonda kaynak yakalama %81'den %90'a çıkıyor, soru başına kaynak isabeti neredeyse iki katına çıkıyor; 6 alternatif karar puanlanıp en yükseği seçiliyor.
- Kurulum akışı: GitHub'dan paylaşılan tek komut (veya ajana verilecek komut); Linux/Mac ve Windows varyantları; Obsidian yoksa otomatik indirme; Mem0 API anahtarı (isteğe bağlı, önerilen semantik katman); JEV API anahtarı; Obsidian'da "open folder as vault"; istemcinin yeniden başlatılması; kasayı seçip kurulumu başlatma; "ruh dosyası" ile ajan kimliği tanımı.
- İstemci uyumu: Claude Code, Codex ve Antigravity tek komutla uyumlu; birden fazla abonelik aynı hafızaya bağlanabiliyor.

### 2. Teknik Detaylar (video iddiaları)

- Bileşenler: JEV (karar/puanlama modeli), Obsidian (yerel markdown kasası), Mem0 (bulut semantik katman, tek cümlelik kararlar), API anahtarı sağlayıcısı olarak anılan "Vercel", GitHub (kurulum dosyaları), Google/GitHub (Mem0 oturumu).
- Puanlama mekaniği: JEV'e bağlam ve sınırlı seçenek verilir; ölçütler (örneğin aciliyet tanımı) kullanıcı tarafından netleştirilir; puanlama JEV içinde yapılır; en yüksek puanlı seçenek uygulanır.
- Yetenek iddiaları: sınıflandırma, öncelik seçimi, hazır seçenekler arasından doğrudan karar; ajanın tek tek incelemesine kıyasla hız ve verim artışı.
- Ölçüm iddiaları: kaynak yakalama %81 → %90; soru başına kaynak isabeti ~2 kat; JEV kapalıyken kaynak bulunamazken açıkken çok sayıda karar bulunması.
- Kurulum iddiaları: kodlama deneyimi gerekmiyor; Linux/Mac ve Windows için ayrı komut; Obsidian otomatik kurulumu; Mem0 anahtarı terminale girilir (sohbete değil); JEV anahtarı kayıt sonrası 5 dolar kredi ile çok ucuz; istemciler arasında ortak hafıza.
- Sınırlar ve uyarılar: JEV'in pratik kullanımı zor ve entegrasyon zaman alıyor; puanlama ölçütleri net değilse önceliklendirme bozulur; API anahtarı sohbete yapıştırılmamalı; yerleşik model hafızaları seçici, sistemleştirilemiyor ve eski kararlar değiştirilemiyor; kasada hassas veri olabilir.

### 3. Orkestrasyon Projemize Uyarlanabilir Mimari Öneriler

- Öneri 1: Karar ve ret gerekçesinin yapılandırılmış saklanması.
  - Video gerekçesi: Ekonomi modelinin reddi gerekçesiyle kaydedildiği için ajan aynı öneriyi yeni projede tekrar sunmuyor; benzer yaklaşımları baştan eliyor.
  - Yerel değerlendirme: `memoryType: decision`, çelişki/tekrar kapısı (`analyze_memory_write`) ve draft → promote akışı mevcut; kayıt gövdesinde gerekçe ve kaynak tutuluyor. Ek kod gerekmez; karar kapısı.
  - Öncelik: Düşük (mevcut tasarımla karşılanıyor).
- Öneri 2: Çoklu aday puanlama ve eleme kapısı.
  - Video gerekçesi: JEV 6 alternatifi puanlayıp en yükseği seçiyor; kaynak yakalama %81'den %90'a, isabet ~2 katına çıkıyor.
  - Yerel değerlendirme: Rol tabanlı danışma (Sol/Terra/DeepSeek), bağımsız doğrulama kapıları ve retrieval değerlendirmesi mevcut; sayısal ön puanlama ek katman olur ve fayda ölçülmeden eklenmemeli. JEV benzeri mikro-karar modeli ayrı sağlayıcı kararıdır (`forn_videosu.md` Öneri 1 ile aynı kapı).
  - Öncelik: Orta. Karar: karar kapısı (ölçüm), dış-bağımlı.
- Öneri 3: Dosya tabanlı yerel kasa ve çok istemcili ortak hafıza.
  - Video gerekçesi: Obsidian markdown kasası; Claude Code, Codex ve Antigravity aynı hafızaya bağlanıyor.
  - Yerel değerlendirme: Aynı desen mevcut: MCP araçlarıyla Markdown Vault, çok istemcili opt-in salt-okunur hook pilotu (M2). Kurulum otomasyonu farkı; bizde kurulum adımları dokümante ve doğrulanabilir.
  - Öncelik: Yüksek (mevcut). Karar: mevcut tasarım sürdürülür.
- Öneri 4: Ajan kimlik sözleşmesi ("ruh dosyası").
  - Video gerekçesi: Kurulumda ajanın kimliği ve çalışma tarzı kullanıcıya sorularak tanımlanıyor.
  - Yerel değerlendirme: `AGENTS.md`, `CLAUDE.md` ve `.agents/skills` bu rolü karşılıyor; hafızada `preference` türü ve tüketim profilleri mevcut.
  - Öncelik: Düşük (mevcut).
- Öneri 5: İki kademeli bellek (ayrıntılı kasa + bulut semantik katman).
  - Video gerekçesi: Mem0, tek cümlelik kritik kararların hızlı semantik katmanı olarak konumlandırılıyor; zorunlu değil ama öneriliyor.
  - Yerel değerlendirme: İkinci Beyin V3 planı üçüncü taraf ürün veya harici CLI bağımlılığını kapsam dışı bıraktı; Vault kökü dış sağlayıcıya verilmez ve secret sınırları korunur. Bulut semantik katman bu sınırlarla çelişir; yerel retrieval yeterli.
  - Öncelik: Düşük. Karar: reddedildi (kapsam dışı, gizlilik ve bağımlılık sınırı).

### 4. Belirsiz Noktalar

- Konuşmacı "3 başlık" diyor; transkriptte sınıflandırma ve seçme detaylandırılıyor, üçüncü başlık adlandırılmıyor (bağlamdan puanlama).
- JEV API anahtarının "Vercel" üzerinden alındığı söyleniyor; Vercel bir model sağlayıcısı değil. Altyazı veya anlatım kaynaklı ad karışıklığı olabilir; doğrulanamadı.
- "JEV" yazımı ve ürün künyesi, fiyatlandırma (5 dolar kredisi, ücretsiz süre) bağımsız doğrulanamadı.
- Ölçüm iddiaları (%81 → %90, ~2 kat) simülasyon beyanı; veri seti, sorgu sayısı ve değerlendirme yöntemi transkriptte yok.
- Mem0 katmanının veri konumu ve gizlilik modeli transkriptte yok.

### 5. Sonuç

- Video, JEV'i ikinci beyin mimarisine bağlayan uygulamalı bir rehber niteliğinde; mimari desenlerin çoğu bizde mevcut (MCP Vault, çok istemcili salt-okunur hook pilotu, karar/gerekçe kaydı, rol sözleşmeleri).
- Hemen uygulanacak yeni kod işi yok; bir öneri karar kapısında (mikro-karar puanlama), bir öneri kapsam dışı (bulut semantik katman).
- Ölçüm iddiaları deneyim beyanı olarak nitel notta kalır; üretim kararı için bağımsız ölçüm gerekir.
