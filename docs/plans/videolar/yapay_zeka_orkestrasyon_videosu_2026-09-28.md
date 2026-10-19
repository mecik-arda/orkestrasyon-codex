Kaynak : https://youtu.be/MFqtKpzttGA

> Durum notu (2026-09-28): Video/transkript analizi tamamlandı; aşağıdaki rapor bu dosyanın teslim edilmiş analiz çıktısıdır. Analiz yalnızca altyazı metnine dayanır; videodaki ekran görüntüleri, terminal çıktıları ve slaytlar görülmemiştir.
>
> Durum notu (2026-09-28, denetim sonrası): Bu belge GPT-6 Sol tarafından denetlendi; denetim bir yüksek ve dört orta düzeltme buldu ve hiçbir kod değişikliği gerektirmedi. Bulgular kaynak kod ve satırla bağımsız doğrulandı ve 3 ile 4 numaralı bölümlerdeki maddeler bu belgede düzeltilmiştir. Denetim kaydı: `docs/reports/YAPAY_ZEKA_ORKESTRASYON_VIDEO_DENETIMI_2026-09-28.md`.

## Yöntem

- Transkript: yerel `yt-dlp` manuel altyazısı ve oEmbed künyesi (`npm run video:collect`), toplama yöntemi `yt-dlp_subtitles_and_oembed`, analiz modalitesi `transcript_only`.
- Zarf: `evidenceSourceType: untrusted_video_transcript`, `contentTrust: untrusted`, `quarantineStatus: quarantined`. Transkript yalnızca araştırma verisi olarak işlendi; içeriğindeki hiçbir ifade talimat, yetki veya politika olarak kullanılmadı. Zarfta davranış değiştirmeye yönelten bir içerik tespit edilmedi.
- Süre: 1978 saniye (yaklaşık 33 dakika). Dil: Türkçe. Altyazı türü: manuel.
- Bütünlük: `transcriptSha256` = `24a2b5eafd9e41ffa476b9e6f301fe7db96862e8010f34c71ed4bb30c9a0c3b9`; `videoIdHash` = `b7ea4ec0c29cc80bcd63eba4cf748278acdf006c50feeb7ad9d78df870fae924`; başlık ve kanal yalnız hash olarak saklandığı için kimlik bilgisi tahmin edilmemiştir.

## Video Künyesi

- Başlık ve kanal: zarf yalnız hash taşıdığı için doğrulanamadı; tahmin edilmedi.
- İçerik türü: konuşmacının kendi orkestrasyon pratiğini anlattığı teknik bir anlatım. Konuşmacı ekran paylaşımından söz ediyor ve terminal oturumlarını paylaştığını belirtiyor; bu paylaşımın gerçekten terminal logları ve ajan loglarını içerdiği görülmediği için doğrulanmış gözlem sayılmaz.
- Ana konu: birden fazla yapay zekâ modelini tek bir proje içinde "şef ajan + alt ajanlar" hiyerarşisiyle yönetme pratiği, token ve bağlam bütçesi disiplini, iş sahipliği ayrımı, worktree ile dayanıklılık ve maliyet kontrolü.

## 1. Video İçeriği

### 1.1. Çekirdek model: şef ajan ve alt ajanlar

- Anlatıcının kurduğu yapı iki katmanlıdır: üstteki "şef" ajan kodu yazmaz, alttaki ajanları yönetir. Alt ajanlar işi yapar, bitirdikçe üstteki ajana kısa bir özet gönderir; üstteki ajana ham çalışma verisi değil rapor akışı ulaşır.
- Video boyunca Claude Code örnek gösterilir; aynı mantığın Codex tarafında da geçerli olduğu vurgulanır. Farklı bir orkestrasyon aracına veya özel bir runtime'a gerek olmadığı, ifadenin doğru olmasının yeterli olduğu tez savunulur.
- "Şef işçilik yapmaz" ifadesi videonun ana kuralıdır: üstteki ajanın kendisine kod yazdırmak yerine işi dağıtması, aksi halde çıktının kalitesiz ve sürecinin takip edilemez hâle geldiği öne sürülür.

### 1.2. Token ve bağlam bütçesi gerekçesi

- Konuşmacının paylaştığı ölçüm: üstteki ajanın kendi bağlamına yaklaşık 61.000 token, alt ajanların toplamına ise 311.000 token gitmiş. 61.000'in büyük kısmının sistem promptu ve benzeri sabit maliyet olduğu, asıl iş verisinin çok daha az olduğu belirtilir.
- Bu ayrımın amacı çift yönlü olarak sunulur: alt ajanlarla iş hızlanır, üst ajanın bağlamı dolmaz ve model kafası karışmadan çalışır.
- Bağlam yüzdesi örneği: dağıtım sonrası üstteki ajanın bağlamı yüzde 8'den yüzde 32'ye çıkmıştır. Aynı iş 11 alt ajan kullanılmadan tek ajana yaptırılsaydı iş bitmeden bağlamın dolacağı, sıkıştırma (compaction) yaşanacağı ve iki üst seviye model bağlamının daha pahalı biçimde tükeneceği söylenir.
- Araç çağrısı dağılımı: belirli bir gecede üstteki ajanın toplam araç çağrısındaki payı yüzde 2,7 iken alt ajanların payı 4330 olarak verilir; yaklaşık kırkta bir oranı çıkarılır.

### 1.3. Model seçimi ve yönlendirme

- Üstteki ajan için birincil tercih Claude Opus sürümü olarak konuşulur ("Opus 5.5" ifadesiyle); bu rolün güncellemeyle belirgin biçimde iyileştiği belirtilir.
- Alt ajanlarda uzun süre Codex kullanılmıştır; ancak güncel durumda çoğunlukla aynı güçlü modelin kullanıldığı, bunun da limitlerine bağlı olduğu belirtilir. Alternatif olarak üstte güçlü model, altta Sonnet gibi daha ucuz bir model önerilir.
- Codex tarafında üst ajan için Astra, alt ajan için Sol önerilir; Astra'nın limiti yetmiyorsa her iki katmanın da Sol olabileceği, Codex'de de aynı mantığın çalıştığı gösterilir.
- Luna'nın kullanım alanı olarak ucuz bağlam araması ve toplu tarama işleri; Sonnet'in ise nadiren ve çoğunlukla gereksiz sayıldığı belirtilir. Codex Astra, ikinci görüş ve çok zor işler için saklanır.
- Gerçek log örneğinde görev dağılımı şöyle anlatılır: log taraması ve toplu basit işler bir ucuz modele; hassas iş, görsel üretimi ve ikinci görüş Codex'e; gösteri/ içerik işi için ise üstte Opus, altta hızlı bağlam toplaması için Sonnet.
- Zamanla model seçiminin sadeleştiği, pahalı modellere duyulan ihtiyacın azaldığı belirtilir. "Fable" adı geçen bir model olarak anılır; mimari karar ve yargı işleri için daha önce görevlendirildiği, ancak güncel durumda bu işlerin de Opus'a döndüğü söylenir.

### 1.4. En kritik kural: aynı dosyaya birden fazla ajan gönderilmez

- Videonun en güçlü uyarısı budur: aynı dosyaya, aynı yöne veya aynı göreve birden fazla ajan yollanırsa işler birbirini bozar, ortaya çakışma çıkar ve süreç patlar.
- Bunun yerine sınırlar önceden çizilir: "şu tarafı biri yapacak, bu tarafı diğeri" yaklaşımı. Ortak dosyalar bellidir ve yalnız onunla ilgilenen ajan vardır; diğer alanlarda başka ajan çalışır.
- İki ek çözüm yolu sunulur: (a) sahipliği baştan paylaşmak (prompt bazında), (b) ayrı worktree'lerde çalıştırmak. Sıralı ilerleme çakışmayı önler ama paralellikten kaybettirir; bu nedenle tercih edilen yol sahiplik paylaşımı veya ayrı worktree'dir.
- Worktree'ler bittiğinde olası çakışmaların birleştirilmesi ve çözülmesi gerektiği, bunun üstteki ajanın işi olduğu belirtilir.

### 1.5. Alt ajanlara özel sistem prompt yazılmaz

- "Her alt ajan için ayrı sistem prompt, ayrı karakter, ayrı rol tanımı yazmayın" mesajı birkaç kez tekrarlanır. Üstteki ajan zaten alt ajanlara prompt yazıyor; buna ayrı bir katman eklemek emeğe değmez, durumu karmaşıklaştırır ve verimliliği düşürür.
- Buna karşılık kalıcı bir düzenleme gerektiren davranışlar kurala dönüştürülür: skill, `CLAUDE.md` veya ajan talimat dosyası. Aynı hatayı tekrar tekrar yaşamak yerine kurala çevirip bir daha yaşanmaması hedeflenir.
- Prompt'un "gevşek" (loose brief) olması önerilir: çok detaylı görev vermek modeli aptallaştırır. Genel amacı, endişeleri ve sınırları anlatmak yeterlidir; ayrıntıyı model kendisi ayarlar.

### 1.6. Test, doğrulama ve eleştirel bakış

- Testlerin anlamlı olması gerektiği, sahte testin "geçmiş" olmasının yanıltıcı olduğu vurgulanır. Rapor "testlerden geçiyor" ama bir hata varsa şu döngü kurulur: hatayı yakalayan bir test ekle, sonra ayrı bir inceleyici ajan aç ve düzeltmeleri geri alıp doğru olanı yaptır.
- Kritik işlerde aynı görevin birden fazla ajana farklı bakış açılarıyla verilmesi önerilir. Gerekçe nettir: aynı model, kendi yazdığı kodu incelerken aynı düşünce hatasını yapabilir.
- Uzun süreli görevler için "bütün gece çalış, şu kurallara uy" biçiminde sınır ve kurallar verilerek süreç bırakılabilir.

### 1.7. Commit, rapor ve dayanıklılık

- Ajanlar düzenli commit atmazsa uzun işlerde emek kaybolur. Çözüm: belirli bir ilerlemeden sonra alt ajanların kendi işine ait commit atması; gerekirse ayrı bir branch ile çalışılması. Amaç iş kaybının sıfıra indirilmesi ve ajanın kolay takip edebilmesi.
- Rapor toplama düzeni: tek bir rapor dosyası açılır, her ajan kendi notlarını kendi bölümüne yazar, sonunda başka bir ajan bunları derler. Ajanlara farklı zaman aralıkları verilerek aynı tarafa bakmaları ve tekrarlı iş yapmaları engellenir; ajanların kendi aralarında koordinasyon kurması yeterli görülür.
- Bir ajan API, ağ veya başka bir hata ile durduğunda üstteki ajan ona mesaj atıp kaldığı yerden devam ettirir. Worktree kullanımı bu dayanıklılığın ana mekanizmasıdır: tool hatasında, bilgisayar kapanıp açıldığında veya bağlantı kesildiğinde süreç kaldığı yerden sorunsuz devam eder.
- Gerçek gözlem: bir gece internet 87 dakika kesilmiş, buna rağmen süreç kendiliğinden toparlanmış ve önceki turlarda hiçbir iş kaybolmamış.

### 1.8. Pratik ölçek ve maliyet

- Eylül ayında tek seferde eşzamanlı alt ajan tavanının 20 olduğu belirtilir. Aynı paragrafta "tek bir iş akışında 228 ajanın aynı anda çalıştırıldığı" denmektedir. Bu iki ifade birbiriyle çelişiyor; 228'in eşzamanlı tavanı değil bir akışın toplam ajan sayısı olduğu varsayılmış ve bu varsayım doğrulanamamıştır.
- Bir "workflow" örneğinde yaklaşık 16 ajan yollanmış ve 500 bin tokenın üzerinde tüketilmiştir. Workflow sistemlerinde genellikle iki katman kurulur: biri bulan, diğeri bulunanı doğrulayan.
- Gece boyunca süren gerçek bir iş örneğinde toplam 48 ajan çalışmış, 13 farklı PR çıkmış ve hepsi ana dala alınmıştır. Aynı iş normalde 5-6 gün sürecek şekilde planlanmıştı.
- Maliyet uyarısı ciddidir: 20x paketlik bir hesapta iki günde haftalık limitin yüzde 90'ına ulaşılmış, ikinci bir 20x hesabın yenilenmesi beklenmiştir. Bu tür yoğun kullanımın bilinçli yapıldığı vurgulanır.
- Ayrıca bir sunum işi örneği verilir: görseller, videolar, blog toplama, simülasyon, animasyon, hikâye birleştirme ve dağıtım sıralaması. Tümü elle yıllarca sürecek işlerdir; orkestrasyon sayesinde eşzamanlı yürütülmüştür.

### 1.9. Her iş paralel değildir

- Orkestrasyon her zaman gerekli değildir ve her iş paralel değildir. Somit örnek: commit commit ilerlemek istenen bir işte paralel ajan kullanılmaması, çünkü sıralılık gerekiyor.
- Video, artık bu tür uyarları ajanların kendi yaptığını gösterir: bir Codex oturumuun kendi kontrolü ele alıp "takılıp duruyoruz, gereksiz limit yakıyoruz" diyerek kendi kendini iptal ettiği anlatılır.
- Alt ajanların da log ve iz kaydı tuttuğu, bunların zamanla biriktiği ve karar günlüğü gibi bir kayıt oluşturduğu belirtilir. Karşılaşılan gerçek sorunlardan biri 8 kararın derlenmiş olmasıdır.

### 1.10. Ajanlar arası geçiş: Claude Code içinden Codex

- Bilgisayarda her iki CLI kurulu ve ikisine de giriş yapılmışsa, Claude içinden Codex alt ajan olarak çalıştırılabilir. API kullanımından kaçınılır; giriş yapılmış oturumlar kullanılır.
- Kullanım basittir: `codex exec`. Konuşmacı "codex" demek yeterli olduğunu, modelin kendi ifadesiyle prompt'u Codex'e iletebildiğini vurgular. GitHub'da bu konuyu anlatan bir skill'e atıf yapılır.
- Codex doğrudan uygulamada kullanılıyorsa bu köprüye gerek yoktur; yalnızca Codex'i alt ajan olarak çalıştırmak istendiğinde gerekir.

### 1.11. Felsefe ve kapanış

- "Yapay zekâya kendini düzgünce ifade et" fikri videonun tek cümlelik özetidir. Modeli doğru anlayıp elinde yeterli bilgi varsa gerisini kendisi yapar. Sorun genellikle sorunun kendisinin bilinmemesidir.
- "Bilinen şeyleri alt modellere yönlendirin; sınır koymayın" yaklaşımı: alanı parçalamak yerine bırakmak, modelin kendi kararlarını vermesi.
- Kapanışta orkestrasyonun neden artık zorunlu hale geldiği açıklanır: tek kişinin aynı anda kanal, video, thumbnail, açıklama, yorum yanıtı ve kendi koduyla uğraşması artık sürdürülemez.
- Videonun ayrıntılı orkestrasyon şemaları açıklama kutusunda bir slaytla paylaşıldığı belirtilir (başlangıç bağlamını ayırma, "alt ajanları yolla, veri geri gelsin" düzeni gibi).

## 2. Transcript'ten Doğrulanabilen Teknik Detaylar

- Aşağıdaki sayısal değerlerin tamamı konuşmacının ağzından gelen beyanlardır; bağımsız olarak doğrulanmamıştır ve videodaki ekran çıktılarıyla karşılaştırılamamıştır.
- Token dağılımı: üst ajan bağlamı yaklaşık 61.000 token, alt ajanlar toplamı 311.000 token. Konuşmacı 61.000'in önemli kısmının sistem promptu olduğunu, iş verisinin yaklaşık 10-15.000 civarında olabileceğini söyler.
- Bağlam doluluk örneği: 11 alt ajanla yüzde 8'den yüzde 32'ye çıkış; dağıtımsız senaryoda bağlamın iş bitmeden dolduğu ve sıkıştırma yaşandığı beyanı.
- Araç çağrısı payı: üst ajan yüzde 2,7; alt ajanlar 4330 çağrı; yaklaşık 1/40 oranı.
- Eylül ayı ölçekleri: eşzamanlı alt ajan tavanı 20; tek iş akışında 228 ajan; toplam 2000 ajana iş verilmiş ve 1653 alt ajan açılmış.
- Workflow örneği: yaklaşık 16 ajan, 500 bin token üzeri tüketim, 7 bulgu ve 7 doğrulama.
- Gece koşusu: 48 ajan, 13 PR, tamamı ana dala alındı; normalde 5-6 gün sürecek iş; 87 dakikalık bağlantı kesintisi; 12 saatlik kesintisiz çalışma; bir gece 8 karar kaydı.
- Maliyet: 20x pakette 2 günde haftalık limitin yüzde 90'ı; ikinci 20x hesabın aynı akşam yenilenmesi.
- Aşama önerileri sırası: alan paylaşımı, worktree ayrımı, test engelleme, hedef (goal) tanımları, alt ajan yönlendirmesi.
- Test döngüsü: hatayı yakalayan test ekleme, ayrı inceleyici ajanla düzeltmeyi geri alma ve yeniden yaptırma.
- Yedek ajan yaklaşımının gerekçesi: aynı model kendi yazdığı kodu incelerken aynı düşünce hatasını tekrarlayabilir.

### 2.1. Kaynak Metin Belirsizlikleri

- Altyazı manuel olduğu halde bazı özel adlar bozuk geçiyor: "worktriller" ifadesi "worktree", "Ecolact" ve "EkoWerk" gibi ifadeler net okunmuyor, "IQ agent" denilen bir model adı belirsiz.
- Model sürüm numaraları ağızdan geldiği için birebir doğrulanamıyor: "Opus 5.5", "Sonnet 5.5", "Fable", "Astra", "Luna", "Sol".
- "Ultra Code" ifadesi bir ürün, mod veya çalışma biçimi olarak geçiyor; ne olduğu bu rapor için doğrulanamadı. Yalnızca "ortak kod ve ortak sözleşme etrafında tüm ajanların çalışması" fikri net olarak anlatılıyor.

### 2.2. Doğrulanamayanlar

- Videodaki slaytlar, grafikler, terminal çıktıları ve ajan arayüzü görüntüleri; analiz `transcript_only` modalitesinde yapıldı. Konuşmacı ekran paylaşımından söz ediyor, ancak paylaşımın içeriği doğrulanamadı.
- Konuşmacının paylaştığı tüm sayısal metriklerin ham loglara karşı doğruluğu; GitHub'daki atıf yapılan skill'lerin içeriği.
- Video başlığı, kanal adı ve yayın tarihi; zarf yalnız hash taşıyor.
- "2000 görev / 1653 alt ajan" gibi büyük ölçekli sayıların hangi proje ve döneme ait olduğu.
- Codex Astra, Sol, Luna ve "Ultra Code" için konuşmacının verdiği görev dağılımının kendi ortamında en iyi sonucu verdiği iddiası; bu kişisel bir tercihtir, nesnel bir kıyaslama değildir.

## 3. Orkestrasyon Projemize Mimari Öneriler

- Öneri 1: "Şef ajan kodu yazmaz" kuralını açık bir politika haline getirmek. Bizim ana orkestratör bugün doğrudan dosya düzenler ve commit alır. Video bu ayrımı mutlak bir kural olarak savunuyor. Not: bizim köprümüz kontrollü edit, hazırlanmış edit onayı ve disposable workspace gibi ara katmanlara sahip; bu nedenle "şef hiç yazmaz" yerine "şef yalnız dar ve seçili dosyada yazar, geniş işi alt ajanlara dağıtır" biçiminde somut ve uygulanabilir bir eşik tanımlanabilir.
  - Yerel değerlendirme: Yeni politika değil; AGENTS.md'deki "küçük ve açık görevleri gereksiz yere devretme" ile "geniş keşif için alt model kullan" ilkelerinin sayısallaştırılmış hâli. Ölçüm gerektirir.
  - Öncelik: Orta. Karar: ayrı plan / karar kapısı.
- Öneri 2: Alt ajanlara yazılacak görevlerde gevşek brief uygulaması. Video, aşırı detaylı prompt'un modeli bozduğunu savunuyor. AGENTS.md zaten "dar rol, açık hedef, ilgili dosyalar, kabul kriterleri" diyor; buradaki fark, alt ajana gereğinden fazla adım dayatmamak.
  - Yerel değerlendirme: Mevcut kural uyumlu; deneyim paylaşımı, ölçülmüş bir değişiklik gerektirmiyor.
  - Öncelik: Düşük (mevcut).
- Öneri 3: Paralel alt ajanlara dosya sahipliği ayrımının prompt'ta açıkça yazılması. Aynı dosyaya birden fazla ajan yollanırsa çakışma ve boşa iş çıkar.
  - Yerel değerlendirme: Salt okunur paralel incelemelerde aynı workspace kilidi birden fazla okumaya izin verir; yalnızca yazma kilidi veya yazma niyeti varsa okuma dışlanır (bkz. `subagent-bridge/src/services/workspace-coordinator.js:143`). Bu bilinçli bir davranıştır ve `tests/optimization.test.js:23` ile doğrulanır; aynı dosyanın bağımsız ajanlarca incelenmesi kalite denetimi için faydalıdır. Gerçek eksik olan, tekrarlı okumanın ölçülmemesi ve önlenmemesidir. Salt okunur incelemeyi kısıtlamak yerine edit kapsamının görev bazında açık yazılması doğru yöndür.
  - Öncelik: Orta. Karar: ayrı plan / karar kapısı.
- Öneri 4: Paralel editleme için ayrık worktree filosu. Bizde her edit denemesi kendi disposable workspace'inde çalışıyor ve kaynak workspace'e promotion, kaynak kilidi alındıktan sonra yapılıyor; bu güvenli ama edit kuyruğunu serileştirir.
  - Yerel değerlendirme: Kapsamı büyük. Yeni bir çalışma alanı yönetimi ve birleştirme katmanı gerektirir; kaynak promotion kilidini ve onay bağlarını yeniden tasarlamak zorundadır. Ayrı plan gerekir.
  - Öncelik: Düşük. Karar: dış-bağımlı. Ölçülmüş bir edit kuyruğu sorunu oluşmadan uygulanmaz.
- Öneri 5: Kritik işlerde aynı görevin birden fazla ajana farklı bakış açısıyla verilmesi. Gerekçe ikna edici: aynı model kendi çıktısını incelerken aynı kör noktayı taşıyabilir.
  - Yerel değerlendirme: Biz bunu zaten uyguluyoruz; Sol denetimi ve bağımsız yerel doğrulama bu amaca hizmet ediyor. Yeni bir "çoklu ajanlı kör denetim" modu eklemek ölçümle desteklenirse değerli olur.
  - Öncelik: Düşük (mevcut).
- Öneri 6: Uzun süreli görevlerde alt ajan ilerleme commit'i ve karar günlüğü. Ajanlar "belli ilerlemeden sonra commit at" kuralıyla iş kaybını sıfırlıyor.
  - Yerel değerlendirme: `commit-at` skill'i mevcut, ancak zorunlu bir git kapısı değil: `config/policy.json:44` içinde `requireGitRepository: false` ve alt ajanların kendi adına commit atmasına izin veren bir kural yok; olmamalı da. Hazırlanmış edit onayı ve disposable workspace hazırlanmış değişikliğin kaynağa bağlanmasını sağlar, ancak geçici alan iş sonunda temizlendiği için kalıcı ilerleme kaydı veya kesinti sonrası otomatik devam garantisi değildir. Uzun işlerde bu ihtiyaç ayrı bir tasarım konusudur.
  - Öncelik: Orta. Karar: karar kapısı (kalıcı ilerleme kaydı tasarımı).
- Öneri 7: Maliyet disiplini ve limit farkındalığı. Videoda iki günde haftalık limitin yüzde 90'ına ulaşılması vurgulanıyor.
  - Yerel değerlendirme: `config/policy.json` bütçeleri ve `npm run budget` görünümü var; ancak dönemsel harcama kapısı etkin değil. Aylık limit tanımlı (`config/policy.json:143`), fakat `costBudgetEnforced: false` (`config/policy.json:144`) olduğu için engelleme çalışmıyor ve günlük limit hiç tanımlı değil. `npm run budget` yalnızca görünümdür, durdurma değildir. Maliyet izleme mevcuttur, maliyet kapısı yoktur. Bu, videodan çıkan fikirlerin aksine projedeki en somut açıktır. Ödünç alınacak ilke "yoğun kullanımı bilinçli ve zamanlanmış yap" olmalıdır.
  - Öncelik: Yüksek. Karar: karar kapısı (günlük limit ekleme ve enforcement'i etkinleştirme).
- Öneri 8: Ajanlar arası birbirini tanıma. Video, alt ajanların kendi aralarında koordinasyon kurmasını yeterli görüyor; bizim köprüde delegation derinliği 1 ile sınırlı ve alt ajanların alt ajan çağırması reddediliyor.
  - Yerel değerlendirme: Bilinçli bir güvenlik sınırı. Video bu sınırın kaldırılmasını önermiyor, pratikteki davranışını anlatıyor. Bizim sınırımız korunmalı.
  - Öncelik: Yok (koruma).

### 3.1. Bu Projeye Doğrudan Aktarılabilecek Taktikler

- Alt ajan görev sözleşmesine yazılacak üç satır: proje bağlamı, hedef, yapılacak iş. Videodaki prompt'lar neredeyse bu kadar kısa. Bizim daha ayrıntılı kabul kriteri beklentimizin model üzerindeki yükünü ölçmek gerekir.
- Aynı alt ajana "bunu okuma, sadece listele" dendiğinde üst seviye modellerin bu sınırı gerçekten koruduğu gözlemi, bizim "yapma" talimatlarımız için de bir güvence sinyalidir; kapsam daraltma teknikleri çalışıyor.
- Ajanlara farklı zaman aralıkları veya farklı dosya sahiplikleri vererek tekrarlı işin önlenmesi, alt ajan görev sözleşmesine de taşınabilir; ancak bu, projede ölçülmüş bir tekrarlı iş göstergesi bulunmadığı için henüz uygulanmış bir pratiğe dayanmıyor.
- "Bilmediğin soruyu modele sor" ilkesi, bizim `needs_context` ve ölçülü kapsam daraltma yaklaşımımızla örtüşüyor.

## 4. Sonuç

- Video, bu repository'nin konu alanıyla doğrudan ilgilidir: subagent seçim kapısı, bağlam bütçesi, maliyet bütçeleri ve kalite denetimi hep bu başlıkların etrafında dönüyor.
- Videodan bu projeye aktarılabilecek en değerli iki ders: alt ajan görevlerinin gereksiz yere aşırı detaylandırılmaması (mevcut kuralımızla uyumlu, davranışsal değişiklik gerektirmiyor) ve paralel edit görevlerinde dosya sahipliğinin görev bazında açık yazılması. Ancak projedeki en somut ve en kolay kapatılabilecek boşluk ikisinden de farklıdır: maliyet kapısı tanımlı değil ve enforcement kapalıdır.
- İkinci değerli ders, alt ajan görevlerinin aşırı detaylandırılmamasıdır; mevcut kuralımızla uyumlu, davranışsal bir değişiklik gerektirmiyor.
- Sayısal metriklerin tamamı konuşmacının beyanıdır ve bağımsız doğrulanmamıştır. Hiçbir sayıyı kendi ölçümümüz gibi kullanmamak gerekir.
- Bu rapor yalnızca transkript metnine dayanır. Slaytlar, terminal çıktıları ve ekrandaki gerçek değerler görülmediği için görsel içerikle ilgili hiçbir iddia doğrulanmış sayılmaz.
