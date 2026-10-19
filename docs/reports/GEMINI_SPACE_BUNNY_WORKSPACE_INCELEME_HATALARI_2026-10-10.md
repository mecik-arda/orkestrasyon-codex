# Gemini ve Space Bunny Workspace İnceleme Hataları

Tarih: 2026-10-10
Durum: GPT-6.1 Sol bağımsız denetimi sonrası P1 düzeltmeler uygulandı; zorunlu doğrulamalar ve kullanıcı onaylı kontrollü pilot geçti
Amaç: Plan klasörü incelemesinde Gemini 3.8 Flash ve Space Bunny Free çağrılarının neden başlayamadığını veya workspace erişimini başarısız raporladığını ayırmak; orkestratör girdisi, Bridge sözleşmesi, yerel güvenlik filtresi ve sağlayıcı davranışını mevcut kanıtla sınıflandırmak.
Kapsam: `subagent-bridge` runtime ve adapter kaynakları, ilgili testler, redakte edilmiş bridge/capability sonuçları ve sınırlı salt-okunur canlı okumalar.
Kapsam dışı: Provider ham prompt/çıktı dökümleri, secret içeriğinin incelenmesi veya raporlanması, izin/güvenlik bypass'ı ve kod değişikliği.
Hazırlayan: Ana orkestratör

## GPT-6.1 Sol Denetimi ve Uygulama Güncellemesi (2026-10-10)

GPT-6.1 Sol, salt-okunur workspace erişimiyle raporu ve ilişkili runtime, MCP şeması, provider adapter'ları, testler ve transport planını bağımsız inceledi. Bridge sonucu `requestedModel=resolvedModel=gpt-6.1-sol`, `accessMode=read_only` idi. Sol'un ana önerisi, Gemini için yeni transport yazmadan önce preflight sözleşmesini, kaynak-bundle gizlilik sınırını ve capability probu sınıflandırmasını düzeltmekti.

Sol'un bağımsız kanıt değerlendirmesi ve orkestratör doğrulaması:

- Antigravity'nin `reviewScope` isteği runtime preflight'ında provider/adapter başlamadan reddetmesi kaynak koduyla doğrulandı. Public `run_antigravity_subagent` şemasının bu girdiyi kabul edip araç açıklamasında sınırı belirtmemesi de doğrulandı.
- Space Bunny reviewer'ın çağrı öncesi kapsam kontrolü doğrulandı. Secret filtresinin `hasSecretLikeContent` üzerinden genel imza eşleşmeleri ve yüksek-entropili dizeleri reddettiği doğrulandı.
- `DURUM_INDEKSI.md` için yeniden çalıştırılan içeriksiz ölçüm 57 uzun aday ve eşik üstü 47 yüksek-entropili aday buldu; 47/47 aday doğrudan `.md` uzantısından önce geliyor. Aynı yüksek-entropili adaylar bellekte değiştirilince detector eşleşmeyi bırakıyor. Bu indeks çağrısında saptanan neden Markdown dosya adı/referansı biçimindeki uzun dizelerdir; bu, farklı kaynak dosyalarının tamamının güvenli olduğunu göstermez.
- Space Bunny genel workspace-read probunun iki eski sonucu ile gerçek `README.md` okuması çelişiyordu. Runtime tam metin eşitliği kullanıyor, modelin doğal cevabı ise ek açıklama içeriyordu. Eski probe cevapları kalıcılaştırılmadığından o iki denemede sentinel'in okunup okunmadığı geriye dönük kesinleştirilemiyor.
- Sol'un OpenCode için tespit ettiği sürüm varsayımı da doğrulandı: kaynak bundle stdin aktarımı yalnız `1.18.35` ile planlanıp gözlenmişti; adapter'da sürüm kapısı yoktu. Bu sürüm bu oturumdaki CLI'da `opencode --version` ile `1.18.35` olarak ölçüldü.
- `reviewSourcePayload` öncesi yalnız parent stdin akışının tamamlanması ölçülüyor; bu tek başına CLI'ın/modelin her baytı kullandığını kanıtlamaz. `1.18.35` sürüm kapısı belgelenmiş CLI append davranışını sınırlar; semantic model kavrayışına veya dosya içi `filesRead` iddiasına kanıt değildir.

Sol önerisine göre uygulanan düzeltmeler:

- Antigravity MCP şeması artık `reviewScope` veya `reviewEvidenceRequirement=required` girdisini provider öncesi açık hata ile reddeder; araç açıklaması sınırlamayı belirtir. Runtime preflight tanısı `mcp_preflight` olarak raporlanır ve adapter çağrı sayısı sıfır kalır.
- Workspace-read probu, başarıyla dönen cevaptaki marker'ın varlığını kontrol eder: marker varsa `available`, başarılı cevapta marker yoksa `inconclusive`, provider/izin yürütme hatasında `unavailable` olur. Sentinel temizliği bağımsız `workspaceReadCleanupStatus` alanında raporlanır; cleanup hatası okuma sonucunu silmez.
- Secret-scope retleri hâlâ fail-closed'dur. Anlık hata yanıtı yalnız normalize edilmiş scope sırası, detector sinyali ve yüksek-entropili aday sayısını verir; dosya yolu, eşleşen dize ve kaynak içeriği verilmez ve bu tanı kalıcı metriğe yazılmaz.
- OpenCode source-bundle review yalnız doğrulanmış CLI sürümü `1.18.35`'te yürütülür; başka veya tanınmayan sürüm provider review başlatılmadan reddedilir. Scoped reviewer için project config kapatılır ve yalnız host bundle'ını alan, bütün tool/read/web/external erişimi deny olan özel agent kullanılır. Böylece `reviewScope` sadece prompt tavsiyesi değil, OpenCode reviewer'ın ek workspace okumasını engelleyen araç-izin sınırı olur.
- Yeni Antigravity/Gemini source-bundle transport'u eklenmedi. Gemini'nin workspace okuma yeteneği, manifestli kaynak aktarım desteği yerine geçirilmedi.
- Capability `workspaceRead=available` yalnız host sentinel marker'ının yanıtta gözlendiğini, `inconclusive` ise başarılı provider yanıtında marker kanıtının bulunmadığını ifade eder. `workspaceReadCleanupStatus` geçici sentinel klasörünün temizlenmesini ayrı raporlar. Bunlar geniş semantik review veya modelin tüm içerikleri okuduğunu ispatlamaz.

Bu güncellemede hedefli runtime testleri 91/91 geçti. Tam `npm test`: 914 testte 910 geçti, 4 POSIX'e özgü test atlandı, başarısızlık olmadı. `npm run verify`, `npm run verify:ci`, gerçek stdio MCP `npm run smoke`, `npm run drill` (9/9) ve `git diff --check` geçti. Kullanıcı onayıyla `npm run pilot` çalıştırıldı: DeepSeek Pro sentetik MCP/structured-output görevi bir provider attempt'inde başarılı oldu; Bridge-reported maliyet `$0.010691032` olup sağlayıcı faturası değildir. Pilot, genel DeepSeek MCP rotasının çalıştığını doğrular; OpenCode source-bundle review payload'ının veya modelin scoped reviewer agent'ını semantik olarak kullandığını kanıtlamaz.

## İlk Kod Düzeltmesi Öncesi Bulgular

## Yönetici Özeti

Gözlenen sorunlar model erişim hesabının kapalı olduğunu göstermiyor. Gemini 3.8 Flash için model erişimi, araçsız yanıt ve trusted-workspace okuma probu başarılıydı. İlk Gemini çağrısı, Antigravity'nin desteklemediği `reviewScope` kaynak-paketi yoluyla gönderildiğinden Bridge tarafından provider başlamadan reddedildi. `reviewScope` olmadan yapılan sınırlı canlı workspace okuması başarılı oldu.

Space Bunny Free model erişimi ve araçsız yanıt probe'unda kullanılabilir durumdaydı. İlk reviewer çağrısında açık dosya kapsamı verilmemesi orkestratör çağrı hatasıydı. Kapsam eklenen ikinci çağrı, Bridge'in secret-like içerik filtresinde provider çalışmadan reddedildi. Aynı filtreyi yerel olarak uygulayan redakte tanılama, ilk sıralı kapsam dosyası olan `docs/plans/DURUM_INDEKSI.md` dosyasının da eşleştiğini doğruladı; eşleşme değerleri rapora alınmadı.

Space Bunny trusted-workspace capability probu iki ayrı denemede de `workspaceRead=unavailable` döndürdü. Aradaki sınırlı canlı çağrı `README.md` başlığını doğru okudu. Probe'un model cevabını sentinel metniyle tam eşitlik üzerinden değerlendirmesi, modelin ek açıklama üretmesi halinde yanlış negatif oluşturabilir. Bu nedenle kesin sonuç şudur: capability probe genel workspace okuma yeteneğini güvenilir biçimde ölçmüyor; iki probe reddi de provider hesabının workspace'e erişemediğini kanıtlamıyor.

## Kanıt ve Bulgular

### VERIFIED: Gemini hatası desteklenmeyen `reviewScope` rotasından kaynaklandı

- `subagent-bridge/src/runtime/bridge-runtime.js:703-716`, boş required scope'u ve `reviewScope` taşıması desteklenmeyen backend'leri adapter çalışmadan reddeder. Codex, OpenCode ve Claude Code dışındaki backend'lerde `review_source_transport_unsupported` sonucu üretilir; kullanıcıya görünen hata `provider transport cannot guarantee source bundle delivery` olur.
- `docs/plans/yapilanlar/SUBAGENT_PROCESS_TRANSPORT_VE_GOREV_GUVENILIRLIGI_PLANI_2026-10-09.md:60,65,93` Antigravity source-bundle transport'un desteklenmediğini ve açık review scope'unun provider öncesi reddedileceğini belgeler.
- Önceki Gemini reviewer çağrısında `reviewScope` gönderildi; hata provider transport aşamasına ulaşmadan Bridge preflight'ında üretildi. Hata, Gemini model erişimi veya Antigravity hesabının başarısızlığı değildi.
- `reviewScope` olmadan yapılan sınırlı Gemini workspace okuması başarılı oldu ve `DURUM_INDEKSI.md` ilk başlığını doğru döndürdü. Öncesinde aynı model için `modelAccess`, `toolFreeResponse` ve trusted `workspaceRead` probeleri de `available` idi.
- İlk kod taramasında `review_source_transport_unsupported` için doğrudan test yoktu. Sol önerisi sonrası `tests/review-source-manifest.test.js` içindeki `RSM-08` eklendi; adapter çağrısının sıfır, hata aşamasının `mcp_preflight` olduğunu doğrular. `tests/faz-p0-runtime.test.js` public şemanın scope ve required-evidence retlerini kapsar.

Sınıflandırma: Orkestratör/provider-route sözleşmesi uyumsuzluğu. Antigravity'ye evidence-bundle gerektiren reviewer işi gönderilmemeli; bu model yalnız scope manifesti olmadan aday üretimi veya dar salt-okunur workspace işleri için seçilmelidir.

### VERIFIED: Space Bunny'nin reviewer çağrısı önce eksik kapsam, sonra yerel secret filtresi nedeniyle durdu

- İlk Space Bunny reviewer çağrısında `files` ve `contextFiles` verilmedi. Reviewer araç sözleşmesi bu alanlardan açık kaynak kapsamı kurar ve boş kapsamı reddeder (`subagent-bridge/src/frontends/mcp/tools.js:106,322-323`). İlk ret provider erişim hatası değildi.
- İkinci çağrıda kapsam verildi, ancak Bridge sonucu `review_scope_secret_detected` oldu ve `adapterAttempts=0` raporlandı. Bu, OpenCode/Space Bunny provider sürecinin başlamadığı anlamına gelir.
- `subagent-bridge/src/services/review-source-manifest.js:126-137` dosyayı kayıpsız UTF-8 olarak okuduktan sonra `classifySecretLikeContent` kontrolünü uygular; eşleşme olursa manifest tamamlanmaz. `subagent-bridge/src/memory.js:12-25,140-170` bilinen secret desenlerinin yanında 32 veya daha uzun, yüksek entropili dizeleri de algılar.
- Aynı detector yerel, değerleri göstermeyen tanılamada 17 dosyalı çağrı kapsamına uygulandı; 15 dosya eşleşti. `docs/plans/DURUM_INDEKSI.md` sıralanmış ilk dosya olarak eşleşti, dolayısıyla provider preflight'ının hangi dosyada durduğu da belirlendi. Bu dosyada 32+ karakterlik 57 aday dize bulundu; 47'si detector'un 4.2 bit/karakter entropi eşiğini geçti. Bu 47 yüksek-entropili adaylar içerik göstermeden değiştirildiğinde aynı `hasSecretLikeContent` fonksiyonu dosyayı artık eşleşmiş saymadı. Böylece bu dosyadaki blokajın yüksek-entropili uzun dizelerden kaynaklandığı tekrar üretildi; eşleşen değerler rapora alınmadı.
- Bu bulgu gerçek credential bulunduğunu kanıtlamaz. Ölçülen kesin olgu, detector'un yüksek-entropili uzun dizeler nedeniyle dosyayı eşleşmiş saymasıdır. Eşleşen dizelerin credential mı yoksa zararsız tanımlayıcı/örnek mi olduğu içerik değerleri rapora alınmadan doğrulanmamıştır. Fail-closed reddi, bu ayrım yapılmadan kapsamın modele gönderilmesini önlemiştir.
- Genel davranış için test vardır: `tests/review-source-manifest.test.js:88-100` secret-like içerik ve geçersiz encoding'in provider öncesi reddedildiğini, hata mesajında sentetik değerin gösterilmediğini doğrular.

Sınıflandırma: İlk hata çağrı parametrelerinin eksik verilmesiydi. İkinci hata, Bridge'in kasıtlı ve fail-closed güvenlik kontrolüdür; kapsamın çok geniş seçilmesi plana özel bir false-positive olasılığını artırmıştır. Eşleşme değerini görmeden filtreyi gevşetmek için kanıt yoktur.

### VERIFIED: Space Bunny workspace-okuma probu ile doğrudan dosya okuma sonucu çelişiyor

- İlk probe uygulaması trusted workspace içinde `.bridge-capability-read-*` sentinel klasörü oluşturuyor ve `readText === marker` tam eşitliğini arıyordu. Bu raporda kaydedilen iki canlı `unavailable` sonucu o uygulamayla alındı. Sol denetimi sonrası güncel kod marker'ı yanıtta arar, başarılı ama marker kanıtsız cevabı `inconclusive` sayar ve cleanup durumunu ayrı verir (`subagent-bridge/src/runtime/bridge-runtime.js:1803-1864`).
- Aynı capability probe 2026-10-10 tarihinde 13:35:29Z ve 13:56:06Z'de iki kez çalıştırıldı. İki denemede de model erişimi ve araçsız yanıt `available`, workspace okuması `unavailable` döndü; her ikisi de `failureClass=workspace_read` olarak kaydedildi.
- Sonraki, küçük ve salt-okunur Space Bunny çağrısı `README.md` dosyasının ilk başlığını doğru döndürdü; bu değer yerel dosyanın ilk satırıyla doğrulandı. Dolayısıyla sıradan bir trusted-workspace dosyasını okuma yolunun çalıştığına dair pozitif canlı kanıt vardır. Çağrı istenen tek satırdan fazla açıklama döndürdüğünden probe'daki `readText === marker` koşulunun doğal yanıtı yanlışlıkla başarısız sayabileceği de canlı yanıt biçimiyle gösterilmiştir.
- İki probe'un her birinde sentinel'in gerçekten okunup okunmadığı geriye dönük belirlenemez: `probeCapability` yalnız durum enum'larını redacted metriğe yazar, ham sentinel yanıtını saklamaz (`bridge-runtime.js:1833-1860`). Bu, bilinçli redaksiyon nedeniyle mevcut kayıttan çıkarılamayan tek alt ayrımdır: provider sentinel dosyasını okuyamadı mı, yoksa okuduğu halde ek metin mi döndürdü? Gizli sentinel yolunun etkisi de bu eski çağrılardan kanıtlanamaz.

Sınıflandırma: Sağlayıcı erişim arızası kanıtı yok; normal workspace okuması canlı çağrıyla doğrulandı. Tam metin eşitliğine bağlı eski sınıflandırma düzeltilmiştir. Eski iki probe'un sentinel'i okuyup okumadığı mevcut telemetry'den kurtarılamaz; bunu sonradan kesinleştirmek için güvenli kanıt yoktur. Güncel probe `inconclusive` ve `workspaceReadCleanupStatus` ayrımını redakte olarak kaydeder.

### VERIFIED: Space Bunny model erişimi genel olarak kapalı değildi

- 2026-10-10 provider capability sonuçları `opencode/space-bunny-free` için her iki denemede `modelAccess=available` ve `toolFreeResponse=available` bildirdi.
- Sonraki salt-okunur README denemesi başarıyla tamamlandı; Bridge sonucu `ok=true`, `exitCode=0`, `adapterAttempts=1` idi. Yanıt istenenden daha genişti; bu yüzden doğrulanmış kanıt yalnızca ilk başlığın doğru okunmasıdır. Modelin yalnız o dosyayı açtığına ilişkin kendi beyanı ayrı host-side okuma kaydıyla doğrulanmamıştır. Bu tek görev sağlayıcının her kapsamı okuyabildiğini veya tüm inceleme görevlerini doğru yapacağını kanıtlamaz.
- Space Bunny katalog kontrolü exact model kimliğini ve sıfır fiyat metadata'sını doğrular; kendi açıklaması gereği auth veya canlı erişimi tek başına kanıtlamaz. Canlı capability ve görev sonuçları ayrı kanıttır.

## Kök Neden Ayrımı

- Gemini ilk reviewer çağrısı: orkestratör çağrısı desteklenmeyen transport sözleşmesini kullandı; provider'a ulaşmadı.
- Space Bunny ilk reviewer çağrısı: açık kaynak kapsamı verilmedi; araç sözleşmesi reddetti.
- Space Bunny ikinci reviewer çağrısı: kaynak kapsamı yerel secret-benzeri içerik kontrolüne takıldı; provider'a ulaşmadı. Eşleşme gerçek secret mı, belgelenmiş/uzun hash benzeri metin mi, mevcut kanıtla bilinmiyor.
- Space Bunny capability sonucu: iki kez aynı `unavailable` raporlandı. Doğrudan dosya okuma denemesi başarılı olduğundan probe sonucu normal workspace erişiminin yokluğunu kanıtlamaz. Eski probe'ların sentinel yanıtları kasıtlı olarak saklanmadığından sentinel'in okunma/yanıt-biçimi alt ayrımı geriye dönük belirlenemez.
- Hiçbir gözlem model hesabının, kimlik doğrulamanın veya genel provider kullanılabilirliğinin kapalı olduğunu göstermiyor.

Bu incelemede çağrıları durduran kök nedenler kesinleştirildi: Gemini için desteklenmeyen transport, Space Bunny ilk denemesinde eksik dosya kapsamı, ikinci denemesinde yerel high-entropy filtresi. İlk capability probe uygulamasındaki tam eşitlik kusuru düzeltildi. Belirsiz kalan tek tarihsel ayrıntı, Space Bunny'nin iki eski gizli sentinel okumasında marker'ı okuyup okumadığıdır; ham yanıtın redaksiyonla saklanmaması nedeniyle bu ayrım mevcut kanıtla geri kazanılamaz.

## Öneriler

1. `[Uygulandı: çağrı sözleşmesi]` Gemini/Antigravity görevlerinde `reviewScope` kullanma. Kaynak manifestiyle doğrulanmış inceleme gerekiyorsa bu transport'u destekleyen backend seç; Gemini'yi yalnızca açıkça sağlanan özet üzerinden aday üretimi veya scope'suz workspace işi için kullan. Yeni Gemini transport'u ayrı karar olarak bekliyor.
2. `[Uygulandı: redakte tanılama]` Space Bunny reviewer çağrısında yalnızca görev için zorunlu dosyaları seç. Secret filtresi fail-closed kalır. Ret yanıtı yalnız sıralı scope indeksi, sinyal türü ve aday sayısı verir; eşleşen içerik veya yol loglanmaz.
3. `[Uygulandı: capability sözleşmesi]` Marker gözlenmeyen başarılı yanıt `inconclusive`; cleanup sonucu ayrı `workspaceReadCleanupStatus` alanıdır. Eski probe yanıtları ham biçimde saklanmadığından tarihsel sentinel alt ayrımı bilinçli olarak kapatılamaz.
4. `[Uygulandı: MCP/runtime testi]` Antigravity explicit `reviewScope` preflight'ında adapter çağrısı sıfırdır; MCP schema ve runtime regresyonları eklendi. OpenCode source-bundle reviewer'a read, web, shell veya harici erişim izni verilmez ve stdin route'u yalnız doğrulanmış `1.18.35` sürümünde açılır.

## Güvenlik ve Kanıt Sınırları

- Hiçbir secret değeri, eşleşen içerik parçası, prompt, ham sağlayıcı çıktısı veya workspace'in mutlak yolu bu rapora alınmamıştır.
- İçerik filtresi eşleşmesi gerçek credential bulunduğunu göstermez; eşleşme çözülmeden sıradan/zararsız olduğu da varsayılamaz.
- Capability probe `workspaceRead=available` tek başına modelin geniş kaynak kapsamını doğru okuduğunu veya semantik review'unu doğrulamaz. Bir başarılı README okuması da yalnız o dar görev için pozitif kanıttır.
- Bridge'in gözlediği sıfır maliyet/provider metadata'sı sağlayıcı faturası değildir.

## Kaynaklar

- `subagent-bridge/src/runtime/bridge-runtime.js:703-735,1803-1864`
- `subagent-bridge/src/runtime/bridge-runtime.js:1833-1860`
- `subagent-bridge/src/services/review-source-manifest.js:85-153`
- `subagent-bridge/src/memory.js:12-25,140-170`
- `subagent-bridge/src/frontends/mcp/tools.js:30,80,106,322-323`
- `subagent-bridge/src/adapters/opencode-adapter.js:151-240,320-363`
- `tests/review-source-manifest.test.js:88-100`
- `docs/plans/yapilanlar/SUBAGENT_PROCESS_TRANSPORT_VE_GOREV_GUVENILIRLIGI_PLANI_2026-10-09.md:60-66,90-105`
