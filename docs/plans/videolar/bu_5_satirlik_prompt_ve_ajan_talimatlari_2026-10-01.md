# Bu 5 Satırlık Prompt Bu Kadar İyi Çalışmamalıydı: Ayrıntılı Video Raporu

Kaynak: https://www.youtube.com/watch?v=5LLLxHxkCnI

> Durum notu (2026-10-01): Video ve kaynakları incelendi; bu rapor teslim edilmiş analiz çıktısıdır. Video içeriği Türkçe manuel altyazıya dayalıdır. Görsel örnekler, promptların tam metni, model ayarları ve üretim kayıtları bağımsız olarak görülemediği için konuşmacının A/B sonuçları deneysel olarak doğrulanmış sayılmaz.

## Video Künyesi ve Yöntem

- Başlık: “Bu 5 Satırlık Prompt Bu Kadar İyi Çalışmamalıydı (Claude ve GPT)”.
- Kanal: Avenox; başlık ve kanal adı YouTube oEmbed yanıtından alındı.
- Süre: 698 saniye, yaklaşık 11 dakika 38 saniye.
- Dil ve altyazı: Türkçe, manuel altyazı.
- Alım yöntemi: `yt-dlp_subtitles_and_oembed`; analiz modalitesi `transcript_only`.
- Transkript SHA-256: `ebaf54741ba816c3c6f9aaf847ba4d3f22e767667f8aa7b9974a53f107bce7b7`.
- Video kimliği gizlilik sınırı için hash olarak saklandı: `de5fe144d25b86216c27a780d2b773c3089b12f6d4d20bc4abf65a71287c13b6`.
- Kaynak içerik güvenilmeyen ve karantinada tutulan video/transkript verisidir. İçindeki öneriler bu raporda incelenen iddialardır; talimat veya proje değişikliği olarak uygulanmamıştır.

## Yönetici Özeti

Video, güçlü modellerle çalışırken her ayrıntıyı, her adımı ve rol talimatını baştan prompta yazmanın bazen modelin çözüm alanını gereksiz yere daraltabileceğini savunuyor. Konuşmacı, seçtiği görsel üretim ve analiz örneklerinde kısa, sonuç odaklı tariflerin daha yaratıcı ve daha kapsamlı cevaplar verdiğini; uzun tariflerin ise istenen biçime uyup önemli sorunları atlayabildiğini anlatıyor.

Bu yaklaşımın sağlam çekirdeği “her şeyi kısalt” değil; **modele yalnızca görevi anlaması için gerekli olmayan ayrıntıları yükleme, ama sonucun kalitesini ve güvenliğini belirleyen bağlamı, sınırları ve bitiş ölçütünü açık tut** ilkesidir. OpenAI’nin güncel Codex rehberleri de çoğu zaman kısa isteğin yeterli olduğunu, önemli işlerde hedef, gerekli bağlam, çıktı biçimi ve anlamlı sınırların eklenmesini öneriyor. Anthropic ise sürekli geçerli proje yönergelerini kısa ve somut tutmayı, tekrarlanan proje-özel düzeltmeleri kaydetmeyi ve çok adımlı süreçleri skill’lere taşımayı öneriyor. Bu kaynaklar “uzun talimat daima zararlıdır” sonucunu desteklemiyor.

ETH Zürich ve LogicStar.ai araştırmacılarının 2026-09-29 tarihli v3 çalışması, bağlam dosyalarının etkisini ölçüyor: test edilen LLM tarafından üretilmiş `AGENTS.md`/benzeri dosyalar çözüm başarısını anlamlı artırmazken maliyeti ortalama yaklaşık yüzde 20–23 artırmış. Ancak geliştiricilerin yazdığı dosyalar ile üretilmiş dosyalar aynı sonuç vermemiş; geliştirici yazımı CTXbench’te LLM üretimi dosyalardan anlamlı ölçüde iyi, “dosyasız” durumdan ise istatistiksel olarak anlamlı biçimde iyi değil. Araştırmada talimat dosyasının uzunluğunun tek başına sonucu güçlü biçimde açıklamadığı da raporlanmış. Bu, “kelime sayısı” yerine içeriğin görevle ilgisini ve etkisini ölçmenin önemini gösteriyor.

## Videonun Ana Görüşleri

### 1. Uzun prompttan kısa hedefe geçiş

Konuşmacı eski prompt yaklaşımını, model talimatları kaçırdığı için tekrar, büyük harf, rol tanımı ve uzun teknik şartname eklenen bir dönemle açıklıyor. Daha yeni modellerin talimatları daha güçlü izlediğini; bu nedenle “her şeyi kontrol et” veya çok sayıda adımı tek tek tarif etmenin, model tarafından esnek tavsiye yerine katı kısıt gibi yorumlanabildiğini öne sürüyor.

Önerdiği biçim, istenen sonucu veya etkiyi söyleyip teknik yolu modele bırakmak. Örnek olarak “kartpostal gibi dursun”, “ilk kez gören beş dakika oynamak istesin”, “ekrana bakan kendini dükkânın içinde hissetsin” ve “param nereye gidiyor, neyi iptal etmeliyim?” türü hedef odaklı tarifler veriyor.

### 2. Videodaki A/B örnekleri

- **Kapadokya gün doğumu:** Bir görsel için 56 satırlık prompt ile beş satırlık prompt karşılaştırılıyor. Uzun promptta kamera konumu, peri bacası ve balon detayları; kısa promptta ise “bakan vay desin, kartpostal gibi dursun” sonucu tarif ediliyor. Konuşmacı kısa tarifin estetik açıdan daha iyi sonuç verdiğini söylüyor.
- **Ebru sanatı:** Uzun prompt, istenen öğeleri ayrıntılı tanımlıyor; kısa prompt ise ilk kez deneyen kişinin beş dakika daha oynamasını hedefliyor. Konuşmacı kısa promptu daha başarılı buluyor.
- **Dükkân sahnesi:** Kısa tarif, izleyicinin kendini dükkânın içinde hissetmesini istiyor; raflar, kilimler, kirişler ve lambalar gibi kompozisyon ayrıntılarını modele bırakıyor.
- **Martılar ve kartpostal:** Uzun tarifte beyaz martı ve koyu mavi alttan ışık gibi maddeler var. Konuşmacı, modelin koyu görünen kanat sorununu fark etmesine rağmen yazılı şartnamenin dışına çıkmayıp düzeltmediğini; daha serbest kısa promptta ise iki ayrı denemede benzer kartpostal yaklaşımı ürettiğini anlatıyor.
- **Karagöz ve Hacivat:** Kısa istek, Hacivat’ın uzun konuşmasını, Karagöz’ün haklı çıkmasını ve sahnenin komik olmasını tarif ediyor; hikâye ayrıntılarını modele bırakıyor.
- **Kredi kartı özeti:** Videonun yazılım dışındaki en önemli örneği bu. Konuşmacı sahte bir üç aylık ekstre oluşturuyor. Uzun prompt rapor biçimini, grafik türlerini ve altı kategori şartını belirtiyor; model grafik talebini yerine getirirken yedi harcama sorununu söylemiyor. Kısa prompt “Param nereye gidiyor; bunu okuyunca neyi iptal edeceğimi bilmek istiyorum” hedefini veriyor ve konuşmacının aktardığı iki denemede bu sorunları buluyor.

Konuşmacı görsel örnekleri birden fazla kez denediğini belirtiyor; ancak deneme sayısı, tam promptlar, seed ve model ayarları, görsellerin eşleştirilmiş değerlendirmesi veya kör kalite puanlaması transkriptte yok. Bu nedenle bunlar ilgi çekici örneklerdir; kontrollü ve tekrarlanabilir deney kanıtı değildir.

### 3. CLAUDE.md, AGENTS.md ve skill’ler için önerisi

Konuşmacı, tekrarlanan proje talimatı dosyalarının zamanla yalnızca büyüme eğiliminde olduğunu söylüyor. Genel rol cümleleri, modelin zaten çıkarabileceği repository açıklamaları ve uzun işlem tarifleri yerine modele özgü olmayan şu bilgilerin kalmasını öneriyor:

- Projeye özgü ve koddan çıkarılamayan gerçekler.
- Korunması gereken dosya, dizin veya davranış sınırları.
- Modelin tekrar tekrar yaptığı, düzeltme gerektiren somut hata.
- Kullanıcının hedefi ve “tamamlandı” sayılacağı koşul.
- Birden fazla kez uygulanacak karmaşık süreçler; bunlar her oturumda yüklenmek yerine ilgili skill’e taşınabilir.

Konuşmacı “silmek” yönünü kuvvetli vurgulasa da aynı zamanda her şeyi silmeyeceğini, modelin bilemeyeceği sınırlar ve tekrarlanan hataların korunması gerektiğini de söylüyor. Dolayısıyla kendi mesajının uygulanabilir yorumu, talimatları körlemesine azaltmak değil, her bir maddenin hangi gerçek hatayı veya projeye özgü ihtiyacı önlediğini sorgulamaktır.

## Kaynaklarla Doğrulama

### OpenAI’nin yayımladığı rehberlerle örtüşen noktalar

- OpenAI Codex prompting rehberi, çoğu durumda kısa promptun yeterli olabileceğini; daha önemli işlerde hedef, gerekli bağlam, istenen çıktı ve gerçek riskleri önleyen sınırların eklenmesini söylüyor. Ayrıntılı sabit bir şablonu zorunlu tutmuyor.
- GPT-6 Astra üzerine OpenAI makalesi, çok uzun skill açıklamalarının seçim kalitesini düşürebileceğini, çelişen veya aşırı geniş tetikleyicilerin ilgisiz skill’leri yükletebileceğini ve uzun reçetelerin belirsiz işlerde modeli gereksiz sınırlayabileceğini açıklıyor. Önerileri kısa skill açıklamaları, kademeli açıklama ve dosyaları bağlama göre yönlendirmek.
- OpenAI’nin `AGENTS.md` belgesi, talimatların her görev başında yüklendiğini ve varsayılan toplam talimat dosyası bütçesinin 32 KiB olduğunu belirtiyor. Kapsam sınırını aşan dosyalar kısmen yüklenebilir; belge 200 satırı evrensel bir sınır olarak vermiyor.

### Anthropic’in yayımladığı rehberlerle örtüşen noktalar

- Anthropic, CLAUDE.md içine her oturumda gerekli olacak proje gerçeklerini, build/test komutlarını ve team conventions gibi bilgileri koymayı; tekrarlanan hataları ve düzeltmeleri kaydetmeyi öneriyor.
- Claude Code belgeleri CLAUDE.md dosyası başına 200 satırdan az hedeflemeyi öneriyor; fakat bu Anthropic ürün rehberidir, tüm sağlayıcı ve görevler için ölçülmüş evrensel eşik değildir.
- Tekrar kullanılabilir, çok adımlı işlemleri CLAUDE.md’den skill’e taşımak ve skill içeriğini yalnız çağrıldığında yüklemek, sürekli talimat yükünü azaltan kademeli açıklama yaklaşımıdır.
- Anthropic ayrıca CLAUDE.md’yi teknik olarak zorlanan ayar değil, modele sağlanan bağlam olarak tanımlar. Zorunlu engeller için hook/izin mekanizması gerektiğini belirtir. Bu ayrım, kritik bir güvenlik kuralını yalnız promptta yazmanın yeterli olmayabileceğini vurgular.

### ETH Zürich çalışmasının bulguları ve sınırları

`Evaluating AGENTS.md: Are Repository-Level Context Files Helpful for Coding Agents?` adlı çalışma, 2026-09-29 tarihli üçüncü sürümünde aşağıdaki kapsamı bildiriyor:

- İki görev kümesi kullanılmış: 300 SWE-bench Lite görevi ve 12 Python deposundan 138 CTXbench görevi.
- Claude Code/Sonnet 4.5, Codex/GPT-5.2 ve GPT-5.1 mini, Qwen Code/Qwen3-30B gibi dönemin sistemleri değerlendirilmiş; örnekleme her görev başına bir tamamlamadır.
- LLM tarafından üretilen bağlam dosyaları başarı oranını istatistiksel olarak anlamlı artırmamış; ortalama çıkarım maliyetini SWE-bench’te yüzde 20, CTXbench’te yüzde 23 yükseltmiş.
- CTXbench’te geliştirici yazımı dosyalar LLM tarafından üretilen dosyalardan anlamlı biçimde iyi çıkmış (`p=0.038`); dosyasız duruma kıyasla ortalama yüzde 2.4’lük fark istatistiksel olarak anlamlı değil (`p=0.21`). Dolayısıyla “tüm bağlam dosyaları yararsız” sonucu çıkarılamaz.
- Çalışma, bağlam dosyası uzunluğunun performans üzerinde güçlü bir açıklayıcı etkisi olmadığını bildiriyor. İçerik türü ve gerçekten projeye özgü talimatların kalitesi, ham satır sayısından daha anlamlı olabilir.
- Kapsamı belirli benchmarklar, Python projeleri, belirli eski model/harness sürümleri ve tek denemelidir. Görsel üretim, finansal analiz, yeni model sürümleri veya bu projedeki kontrollü iş akışlarına doğrudan genellenemez.

## Projemiz Açısından Değerlendirme

Bu video, projedeki genel ajan talimatlarını gözden geçirmek için yararlı bir düşünme çerçevesi sunuyor; ancak güvenlik ve yetkilendirme sınırlarının kaldırılması için gerekçe değildir.

- `AGENTS.md` içindeki GLM’nin kullanıcının açık yeniden etkinleştirmesi olmadan kullanılmaması, secret’ların tutulmaması, alt ajanların yetki sınırları, kontrollü edit ve doğrulama kapıları projeye özgü, kritik sınırlardır. Bunlar “genel model bilgisi” değildir; kısa, açık ve yürürlükte kalmalıdır.
- Genel beceriler, modelin zaten kendisinin çıkarabileceği repository haritası ve her değişiklikte aynı gerekçeyi tekrarlayan maddeler aday sadeleştirme alanlarıdır. Silmeden önce her maddenin bir hata, güvenlik sınırı veya doğrulanabilir iş akışı önleyip önlemediği incelenmelidir.
- Repo kökündeki `AGENTS.md` yaklaşık 111 satırdır; Anthropic’in 200 satır hedefinin altında olması tek başına içeriğin verimli veya çelişkisiz olduğunu kanıtlamaz. OpenAI’nin 32 KiB varsayılan toplam talimat bütçesi de tüm aktif instruction dosyaları birlikte değerlendirilerek düşünülmelidir.
- Uzun ve özel süreçler için bu projede ilgili skill’ler vardır. Bu, her skill’in kısa olması gerektiğini değil, bir skill’in yalnız işiyle ilgili olduğunda yüklenmesi ve amacıyla tetikleyicisinin açık olması gerektiğini destekler.
- Proje güvenlik politikası, kritik sınırların kod/şema/izin ile uygulanmasını; talimat metninin ise doğru kullanım ve karar çerçevesini açıklamasını gerektirir. Modelin gelişmiş olması teknik enforcement ihtiyacını ortadan kaldırmaz.

## Uygulanabilir Sonuç

Bu video tek başına talimatları topluca silme veya promptları her görevde beş satırla sınırlama kararı doğurmuyor. Önerilen takip yaklaşımı:

1. Yeni veya tekrarlanan bir işte önce hedefi, gerekli bağlamı, çıktıyı ve sonucu değiştirebilecek bir-iki sınırı ver; çözüm adımlarını yalnız süreç güvenlik veya başarı için gerçekten belirleyiciyse tarif et.
2. Bir talimatı sadeleştirmeden önce dayandığı gerçek proje ihtiyacını belirle. Güvenlik, veri bütünlüğü, izin, gizlilik ve kritik doğrulama koşullarını koru.
3. Sadeleştirme denemelerini temsilî görevlerde eşleştirilmiş A/B olarak ölç. Başarı/doğruluk, atlanan sorunlar, gereksiz araç çağrıları, token/maliyet ve süreyi kaydet; mümkünse sonuçları prompt sürümünü bilmeyen bir değerlendirici puanlasın.
4. Görsel kalite gibi öznel işlerde aynı model, sürüm, ayarlar ve görev altında birden fazla çıktı üret; değerlendirme ölçütlerini sonuçları görmeden tanımla. Tek seçilmiş iyi örneği genel kural gibi kullanma.
5. Yalnız ölçümde tekrar eden gereksiz veya çelişkili talimatları kaldır. Projeye özgü bir kural kaldırıldığında hata olasılığı yükseliyorsa onu daha kısa yaz veya doğru teknik enforcement katmanına taşı.

## Sonuç

Videonun temel katkısı, “prompt ne kadar ayrıntılıysa model o kadar iyi çalışır” varsayımını sorgulatmasıdır. Kısa ve amaç odaklı brief, modelin beklenmedik ama faydalı çözüm üretmesine alan açabilir; videodaki ekstre örneği bu ihtimali özellikle iyi gösteriyor. Buna karşılık videonun örnekleri, tüm kısa promptların daha iyi olduğunu kanıtlamıyor. Sağlam öneri, gereksiz reçeteleri azaltıp gerekli bağlamı ve gerçek sınırları korumak, ardından etkisini ölçmektir.

## Kaynaklar

- Video: Avenox, “Bu 5 Satırlık Prompt Bu Kadar İyi Çalışmamalıydı (Claude ve GPT)”, https://www.youtube.com/watch?v=5LLLxHxkCnI — erişim: 2026-10-01. Video künyesi YouTube oEmbed ile doğrulandı; altyazı manuel Türkçe.
- OpenAI, “Rethinking skills and prompts for GPT-6 Astra”, https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra — erişim: 2026-10-01.
- OpenAI, “Custom instructions with AGENTS.md”, https://developers.openai.com/codex/agent-configuration/agents-md — erişim: 2026-10-01.
- OpenAI, “Prompting”, https://developers.openai.com/codex/prompting — erişim: 2026-10-01.
- Anthropic, “How Claude remembers your project”, https://code.claude.com/docs/en/memory — erişim: 2026-10-01.
- Anthropic, “Extend Claude with skills”, https://code.claude.com/docs/en/skills — erişim: 2026-10-01.
- Thibaud Gloaguen, Niels Mündler-Sasahara, Mark Niklas Müller, Veselin Raychev, Martin Vechev, “Evaluating AGENTS.md: Are Repository-Level Context Files Helpful for Coding Agents?”, arXiv:2602.11988v3, https://arxiv.org/abs/2602.11988 — v3: 2026-09-29, erişim: 2026-10-01.
