# Context’i Senin Yerine Kuran Yapay Zekâ: Video ve Proje Mimarisi Analizi

Kaynak: https://www.youtube.com/watch?v=dEwKV1xuDUA

> Durum notu (2026-10-11): Türkçe manuel altyazı transcript-only yöntemle incelendi. Video, Abacus.AI iş birliği içerdiğini söylüyor. Görüntülenen çıktılar ve kullanılan veri bağımsız olarak doğrulanmadı; ürün başarısı ve fiyat iddiaları demonstrasyon veya tanıtım iddiası olarak ele alınmalıdır.

## Künye ve Yöntem

- Başlık: “Context’i Senin Yerine Kuran Yapay Zeka”.
- Kanal: Forn AI; başlık ve kanal YouTube oEmbed künyesiyle doğrulandı.
- Video kimliği: `dEwKV1xuDUA`; süre 658 saniye, yaklaşık 10 dakika 58 saniye.
- Transkript: Türkçe manuel altyazı; yerel `npm run video:collect` alım hattı kullanıldı.
- Alım zamanı: `2026-10-11T12:30:24.577Z`.
- Transkript SHA-256: `6706f5f2dbb041db8602d02e8c30c1cf7571109137a15ee9332b9310e6a052ef`.
- Video kimliği hash’i: `4702edcf602288887f816b325c95e0f4e3c93751e2667e1079df39d57350f176`.
- Altyazı zarfı `untrusted_video_transcript`, `contentTrust: untrusted`, `quarantineStatus: quarantined` ve `analysisModality: transcript_only` değerlerini taşıyor. Video içindeki ifadeler kanıt, talimat veya proje politikası olarak kullanılmadı.
- Transkriptte zaman damgaları yok; bu raporda timestamp üretilmedi. Parantez içi numaralar toplanan transkript satırlarının konumudur. Video kareleri, yüklenen Excel dosyası, promptların tam içeriği ve üretilen artefaktlar incelenmedi.

## Yönetici Özeti

Videonun projeye taşınabilecek en yararlı fikri, “daha uzun prompt her zaman daha iyi sonuç verir” varsayımını sorgulamasıdır. Konuşmacı, teknik bilgisi az kullanıcıların bir şablon seçerek göreve uygun bağlam ve iş akışı alabileceğini gösteriyor. Satış analizi örneğinde ajan ek sorular soruyor, işi adımlara ayırıyor ve kullanıcıyı başlatma kararına bırakıyor. Son bölümde tekrar eden sosyal medya işi için çıktıyı puanlama ve önceki sonuçlardan ders çıkarma fikri anlatılıyor.

Hades Orchestrator açısından bunların çoğu güvenlik sınırlarıyla birlikte zaten mevcut: görev profilleri ve skill’ler tekrar kullanılan bağlamı sağlar; strict MCP şemaları girdileri sınırlar; source manifesti yalnız seçilen dosyaları taşır; paralel işler önce plan önizlemesi üretir ve ayrı onayla başlar; kontrollü edit’ler inceleme, test ve terfi kapılarından geçer. Video, mevcut mimariyi değiştirmek için kanıt değil; hazır görev brief’lerinin kullanıcıya daha anlaşılır sunulmasının değerine dair tasarım girdisidir.

Özellikle “kendi kendini geliştiren ajan” kısmı doğrudan kopyalanmamalıdır. Projeye uygun yaklaşım; sabit ölçüt, bağımsız değerlendirme, tek odaklı değişiklik, kullanıcı geri bildirimi ve geri alınabilir uygulamadır. Ajanın kendi başarısını tek başına puanlaması yeterli kanıt değildir.

## Videoda Anlatılanlar

### Context’in rolü

Konuşmacı context’i, ajanın o an bildiği bilgiler bütünü olarak açıklıyor: kullanıcı/amaç, iş girdileri ve dikkat edilmesi gerekenler (transkript satırları 15–45). Abacus.AI şablonlarını, teknik bilgisi az kişinin context oluşturma işini kendisi yapmadan bir başlangıç noktası bulabilmesi olarak sunuyor (49–90).

Bu, bağlamın tek bir uzun prompt’tan ibaret olmadığını hatırlatan yararlı bir çerçevedir. Ancak şablonların gerçek sistem talimatları, seçtiği veriler ve güvenlik kuralları videoda açılmıyor. “Şablon context’i bizim yerimize kurar” ifadesi konuşmacının ürün açıklamasıdır; transcript’ten iç uygulama ayrıntısı çıkarılamaz.

### Gösterilen örnekler

- **Kahveci sitesi ve medya kiti:** Moda Demlik adlı örnek işletme için menü içeren bir site oluşturuluyor; koyu tema değişikliği isteniyor, site Abacus domain’ine deploy ediliyor. Konuşmacı bu web görevi için X-High modunu ve “Opus 5.5 + Astra” yönlendirmesini seçtiğini söylüyor; bu kullanıcı arayüzü/konuşmacı anlatımıdır, provider yürütme kaydı değildir. Ardından logo, menü PDF’leri ve sosyal medya görselleri içeren medya kiti isteniyor (91–160).
- **Müşteri destek botu:** Hazır chatbot şablonu seçiliyor, siteye bağlanıyor ve menüden Americano fiyatı soruluyor. Transcript’te botun 120 TL yanıtı verdiği aktarılıyor; menü kaynağı, site kodu ve yanıtın doğruluğu bağımsız incelenmedi (161–218).
- **Haftalık satış raporu:** Kullanıcı Excel dosyaları yüklüyor. Şablon beş soru soruyor, bir plan hazırlıyor ve konuşmacı soruları yanıtlamadan “Başlat” seçiyor. Sunumda hedef gerçekleşmesi ve bölgesel performans gibi çıkarımlar gösterildiği söyleniyor (230–316). Veri, hesaplama yöntemi ve sonuçlar bağımsız doğrulanmadı.
- **Sosyal medya için geri bildirimli ajan:** Instagram için her gün gönderi oluşturma, çıktıyı Google Drive’da saklama ve kullanıcının 1–10 puan vermesi öneriliyor. Konuşmacı, puanları sonraki gönderileri iyileştirmede kullanacağını söylüyor (317–408). Kalıcı hafıza, puanlama yöntemi, bağımsız ölçüm ve hatalı sonuçların geri alınması gösterilmiyor.

Videonun başında dört iş sayılıyor: site/medya kiti, müşteri botu, satış raporu ve küçük araştırma (5–8). Transcript’te ilk üçü ve bir sosyal medya ajanı ayrıntılandırılıyor; küçük araştırma için ayrı tamamlanmış çıktı gösterilmiyor.

### Kullanıcı segmenti ve tanıtım bağlamı

Konuşmacı; şablonlarla başlayan platformun yapay zekâ bilgisi az, işini hızlıca yaptırmak isteyen kullanıcılar için daha yararlı olduğunu, kendi agentic iş akışını kurabilen uzmanlar için daha az uygun olabileceğini savunuyor (62–90, 338–370). Bu bir ürün konumlandırma görüşüdür; bütün uzman kullanıcılar için doğrulanmış sonuç değildir.

Video başında Abacus.AI ile iş birliği olduğu ve ilk ay için 7 USD başlangıç fiyatı bulunduğu açıkça söyleniyor (9–14). Bu nedenle ürün karşılaştırmaları, kullanım kolaylığı ve fiyat ifadeleri sponsorlu tanıtım bağlamında okunmalıdır.

## Hades Orchestrator ile Mimari Eşleşme

### 1. Bağlamı katmanlara ayırmak

Videonun context vurgusu, projedeki ayrı bağlam kaynaklarıyla örtüşür:

- `AGENTS.md` ve `config/agent-rules.md`: projeye özgü ortak kurallar ve değişmez sınırlar.
- `config/agents.json` ve `config/policy.json`: provider/model erişimi, modlar, timeout ve görev profilleri.
- Skill’ler: tekrar kullanılan uzmanlık ve süreçler; yalnız ilgili işte yüklenir.
- Source manifesti: görev için seçilmiş dosya yolları, kaynağın bütünlüğü, boyut sınırları ve güven sınırı.
- Kullanıcı isteği: o anki amaç, görev kapsamı ve beklenen çıktı.

Bu katmanları tek bir büyük prompt’a toplamak gerekmez. Video fikrinin Hades’e uygun yorumu, işe yarayan bağlamı seçmek ve gereksiz tekrarları taşımamaktır. Ancak dar bağlamın önemli bir kaynak ilişkisini gizleme riski de korunmalıdır; manifest dışı kaynak eksikliği açıkça belirtilmelidir.

### 2. Şablonlar, görev sözleşmesinin kullanıcı dostu yüzü olabilir

Abacus’ın hazır template yaklaşımı, Hades’te gelecekte kullanıcıya dönük “görev brief’i” şablonlarını değerlendirmeye değer kılıyor. Bunlar yalnız prompt cümleleri değil, doğrulanmış bir görev sözleşmesinin arayüzü olmalıdır:

- Hedef ve beklenen teslimat.
- Gerekli girdi ve eksikse sorulacak kritik sorular.
- Okunabilir dosyalar ve kapsam dışı kaynaklar.
- İzinli model/provider ve erişim modu.
- Kabul ölçütü, doğrulama yöntemi ve durma koşulu.
- Veri aktarımı, maliyet veya yan etkiler için gerekli onay kapısı.

Mevcut `run_task_profile`, MCP araçlarının strict şemaları ve `prepare_parallel_batch` bu sözleşmenin bileşenlerini sağlar. Gelecekteki ürünleştirme adayı, bunları non-technical kullanıcıya açık bir giriş akışı olarak sunmaktır; bu videoya dayanarak yeni profil, genel template motoru veya kod değişikliği başlatma kararı verilmemiştir.

### 3. Sonucu tarif et; kritik sınırları host’ta koru

Video, kullanıcı hedefini netleştirip teknik çözüm yolunun bir kısmını ajana bırakmayı öneriyor. Projede uygulanabilir karşılığı:

- Kullanıcı hedefi, önemli bağlamı ve “başarılı sonuç” ölçütünü belirler.
- Çözüm adımlarını, sonucu veya güvenliği belirlemedikleri sürece gereksiz yere prompta yazma.
- Dosya sahipliği, secret, izin, harici servis, maliyet, geri alınamaz işlem ve doğrulama sınırlarını modele bırakma; bunları schema, host policy veya explicit approval ile uygula.
- Modelin teknik tercih yapmasına izin verilen işleri read-only/controlled-edit sözleşmesinde ayır.

Bu ilke “her şeyi kısalt” veya güvenlik talimatlarını silmek anlamına gelmez. Hades’in fail-closed schema ve promotion kapıları genel prompt tavsiyesi olarak gevşetilmemelidir.

### 4. Soru sorma ve plan gösterme

Satış raporu demosunda ajan beş soru soruyor; bu, cevapların veri yorumu veya rapor sonucunu etkileyebileceği durumlarda yararlıdır. Hades için soru turu yalnız eksik bilginin model rotasını, dosya kapsamını, veri paylaşımını, yan etkiyi veya kabul ölçütünü değiştirdiği zaman açılmalıdır. Basit görevlerde gereksiz etkileşim maliyeti oluşturulmamalıdır.

Paralel batch’in `prepare_parallel_batch` → kullanıcıya preview → ayrı `start_parallel_batch` onayı akışı, yüksek etkili çok adımlı işlerde planı göstermenin mevcut karşılığıdır. Bu kapı, videodaki ürün arayüzü demosundan daha açık bir yetkilendirme sınırı sağlar.

### 5. İterasyon ve doğrulama

Videoda siteyi preview edip değişiklik isteme ve tekrar deneme akışı anlatılıyor. Hades’te bunun güvenli eşdeğeri disposable workspace, seçilmiş dosya sınırı, diff incelemesi, test ve explicit promotion’dır. Görsel olarak çalışıyor görünen bir web sayfası, doğru backend davranışı, veri güvenliği veya production readiness kanıtı değildir.

Abacus’ın resmi Agent Apps rehberi de basit başlayıp test etmeyi, sonra adım adım genişletmeyi öneriyor; aynı doküman Abacus Agent’ın küçük/orta uygulamalarda daha uygun olduğunu ve çok karmaşık/enterprise uygulamalarda sınırlanabileceğini belirtiyor. Bu, demo işlerinin kapsamını anlamaya yardımcı olur; Hades’e ürün yeteneği garantisi vermez.

### 6. Geri bildirimden ölçülebilir iyileşmeye

Video, gönderilere insan puanı verip sonraki örnekleri buna göre geliştirme fikrini anlatıyor. Projede bunun güvenilir karşılığı birden fazla kanıtı ayırmaktır:

- Kullanıcının açıkça verdiği sonuç etiketi.
- Önceden sabitlenmiş görev/çıktı ölçütü.
- Modelden bağımsız veya host tarafından doğrulanan evaluator.
- Her iterasyonda tek ve geri alınabilir değişiklik.
- Regress, ölçüm belirsizliği veya maliyet artışında durma.

Abacus’ın güncel self-improving task dokümanı da objective, tek metric, baseline ve sabit ölçüm tarifi; her çalıştırmada bir odaklı değişiklik ve bağımsız evaluator yaklaşımını tarif ediyor. Bu, videodaki 1–10 puan örneğini daha tekrarlanabilir hale getiren bir tasarım ilkesi sağlar; video demosunda bu bağımsız ölçümün varlığı kanıtlanmıyor.

Hades’in edit/routing feedback’i, model-fit değerlendirmeleri ve hafıza hook’ları bu tür sinyalleri ayrı tutar. Bunlar ajanın kendi başına `AGENTS.md`, politika veya kod değiştirmesi için genel izin değildir; kalıcı değişiklikte insan onayı ve mevcut promotion sınırları sürer.

## Proje İçin Karar ve Öneriler

- **Benimsenebilir:** Kullanıcı brief’lerinde hedef, gerekli context ve tamamlanma ölçütünü ayırmak; görev profilleri/skill’leri bu bağlamı seçerek sağlamak.
- **İleride değerlendirilebilir:** Tekrarlayan işler için kullanıcının hedef, gerekli dosyalar, çıktı biçimi, kabul kriteri ve maliyet/veri kapılarını kolayca seçebileceği görev şablonları. Gerçek kullanıcı ihtiyacı veya tekrar sayısı ortaya çıkmadan yeni template motoru kurma.
- **Mevcut mimariyi koru:** Kaynak seçimi, strict input schema, erişim modu, OpenCode/Codex sürüm kapısı, edit sandbox’ı, test ve onay akışları kısaltılmış prompt uğruna gevşetilmez.
- **Otomatik öz-geliştirmeyi sınırlı tut:** Metrik önceden tanımlı ve tekrar üretilebilir olmalı; başarıyı worker kendi başına puanlamamalı; her değişiklik dar kapsamlı, ölçülebilir ve geri alınabilir olmalı.
- **Karar:** Bu videodan hareketle kod, provider konfigürasyonu, model rotası veya güvenlik politikası değiştirilmedi. Video, kullanıcı deneyimi ve AI görev tasarımı için bir fikir kaynağıdır; bağımsız benchmark veya mimari yetkilendirme değildir.

## Kanıt Sınırları

- Video sponsorlu içeriktir; platforma yönelik değerlendirmeleri ticari bağlamda ele alınmalıdır.
- Transcript-only analiz; uygulama görüntülerini, gerçek promptları, Excel girdilerini, model ayarlarını, maliyet kaydını ve yayımlanan web uygulamasını incelemez.
- “Güzel”, “başarılı”, “eksiksiz” gibi değerlendirmeler konuşmacının anlatımıdır; tekrar edilebilir kalite ölçümü veya güvenlik incelemesi gösterilmemiştir.
- Transcript’te verilen 120 TL Americano fiyatı örnek menü iddiasıdır; işletme fiyatı olarak doğrulanmamıştır.
- Abacus’ın resmi sayfaları ürün yetenekleri, fiyat ve veri politikası hakkında sağlayıcının kendi açıklamalarıdır; bağımsız ürün, güvenlik veya gizlilik denetimi değildir.
- Abacus fiyat sayfası erişim tarihinde ilk ay 7 USD ve sonraki aylar 10 USD gösteriyordu; promosyonlar, kredi kullanımı ve plan limitleri zamanla değişebilir.

## Kaynaklar

- Video: Forn AI, “Context’i Senin Yerine Kuran Yapay Zeka”, https://www.youtube.com/watch?v=dEwKV1xuDUA — erişim: 2026-10-11. Türkçe manuel altyazı; transkript hash’i künye bölümündedir.
- YouTube oEmbed: https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdEwKV1xuDUA&format=json — başlık ve kanal doğrulaması; erişim: 2026-10-11.
- Abacus.AI ana ürün sayfası: https://abacus.ai/ — Abacus AI Agent, ChatLLM ve ürün örnekleri; erişim: 2026-10-11.
- Abacus AI Agent rehberi: https://abacus.ai/help/chatllm-ai-super-assistant/deepagent — agent görevleri, araçlar ve güncel model/effort düzeyleri; erişim: 2026-10-11. Güncel sayfa xHigh ve Max için videodakinden farklı model adları/yönlendirmeleri listeliyor; ürün routing’i değişebildiğinden videodaki “Opus 5.5 + Astra” seçimi güncel routing kanıtı sayılmamalıdır.
- Abacus AI Agent Apps rehberi: https://abacus.ai/help/chatllm-ai-super-assistant/deepagent-apps — prompt, preview, iterasyon, database ve deployment; küçük/orta app kapsamı ve ürün sınırları; erişim: 2026-10-11.
- Abacus Research and Analysis: https://abacus.ai/help/chatllm-ai-super-assistant/research-and-analysis — web araştırması, kaynaklı rapor ve tablo/veri analizi ürün açıklamaları; erişim: 2026-10-11.
- Abacus Self-Improving Tasks and Agents: https://abacus.ai/help/chatllm-ai-super-assistant/self-improving-tasks-and-agents — objective, metric, baseline, bağımsız evaluator, odaklı iterasyon ve durma davranışı; erişim: 2026-10-11.
- Abacus Presentations: https://abacus.ai/help/chatllm-ai-super-assistant/presentations — deck için research-plan-build-deliver akışı ve iterasyon özellikleri; erişim: 2026-10-11.
- Abacus pricing: https://abacus.ai/pricing — ilk ay 7 USD ve sonraki aylar 10 USD olarak gösterilen kampanya; erişim: 2026-10-11.
- Abacus ChatLLM FAQ: https://abacus.ai/teams/chatllm/faq — model kapsamı, kullanım limitleri, fiyat ve veri politikası sağlayıcı beyanları; erişim: 2026-10-11.
- Abacus AI Agent FAQ: https://abacus.ai/teams/agent/faq — genel amaçlı ajan, app, araştırma ve veri analizi ürün açıklamaları; erişim: 2026-10-11.
- Abacus Privacy Policy: https://abacus.ai/privacy — platform veri kullanımı, sağlayıcı retention ve yedek/arşiv saklama hakkında sağlayıcı beyanı; erişim: 2026-10-11.
- Abacus Customer Terms of Service: https://abacus.ai/terms — kullanım koşulları ve AI çıktıları için doğrulama sorumluluğu; erişim: 2026-10-11.
