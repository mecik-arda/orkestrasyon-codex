# Review permit uygulama durumu

Tarih: 2026-10-27

## Sonuç

Kullanıcı, varsayılanı kapalı, tek kullanımlık, hash-bağlı review izninin kod/test/dokümantasyon kapsamındaki uygulamasına açıkça yetki verdi. Buna rağmen üretim preflight istisnası için gerekli değişiklik otomatik güvenlik incelemesinde reddedildi. Reddedilen değişiklik `review-source-manifest.js` içinde secret bulgusu olan kaynak içeriğini döndüren yeni snapshot yolu ekliyordu; inceleme bunu preflight reddini aşabilecek dışa açık bir yol olarak sınıflandırdı. Bu dosya değiştirilmedi ve aynı üretim istisnası başka bir katmana taşınmadı.

Üretim sınıflandırıcısı, normal source-review preflight'ı, MCP şeması ve adapter çağrı yolu değişmedi. Kaynak teslimi, izin üretimi/tüketimi, provider ve Sol çağrısı yapılmadı. Kullanıcı onayı gerçek bundle için kullanılmadı. Otomatik güvenlik reddi aşılmadı.

## Yerel test bileşeni

İzole `review-source-permit-registry.js` bileşeni yalnız geçici test state dizinlerinde denendi; varsayılanı kapalıdır ve runtime veya MCP'ye bağlanmadı. Bu bileşen mevcut kaynağı okumaz, review bundle üretmez veya adapter çağırmaz. Testleri default-off davranışı, kalıcı tam bağ hash'ini, 10 dakikalık expiry'yi, iptali, tek tüketimi, kernel kilidi altındaki iki ayrı süreç yarışını, yeniden açılış sonrası replay reddini, işlem sonrası süreç çıkışında iznin tüketilmiş kalmasını, bozuk kayıt reddini ve audit dosyasında bearer/path/prompt hash bulunmamasını doğrular.

Bu testler production akışının kabulü değildir. Registry'deki `humanConfirmed` parametresi yalnız yerel primitif testi içindir; ona güvenen bir public MCP aracı yoktur. Elicitation'ın istemcide tüm değişmez kaynak ve prompt içeriğini gerçekten gösterdiği de bu yerel testlerle kanıtlanmadı.

## Bulgular ve sınırlar

- Mevcut `run_codex_subagent` çağrısı source manifest oluşturulmadan önce secret sinyalinde `mcp_preflight` ile durur; source adapter'a ulaşmaz.
- MCP SDK form elicitation API'si sunar ve istemci capability yoksa istek reddedilir. Ancak kullanıcı arayüzünün büyük elicitation mesajını eksiksiz gösterdiği ve gerçek insan yanıtı sağladığı repository dışı client davranışıdır; yerel sözleşme bu özelliği kanıtlamaz.
- Gerçek feature için tam prompt ve kaynak payload'unu kullanıcıya gösteren, insan kararını model girdisinden ayrı üreten host onay yolu gerekir. İzin yalnız bu onaydan sonra kalıcı kayda yazılmalı; gönderim başlamadan önce bütün bağlar yeniden ölçülmeli ve tek-kullanımlık tüketim kalıcılaştırılmalıdır.
- Platform auto-review bağımsız veto olarak kalır. Repository izni bu vetoyu aşamaz. Gönderim başlangıcı belirsizse permit tüketilmiş kalmalıdır.
- Lock'u kullanmayan dış yazıcılar ve ani makine gücü kesilmesine karşı dosya sistemi dayanıklılığı kanıtlanmadı.

## Doğrulama

- `node --test tests/review-source-permit.test.js`: 8/8 geçti; iki ayrı child process eşzamanlı tüketim yarışına katıldı.
- `tests/review-source-manifest.test.js` ve `tests/mcp-tool-negative.test.js`: Windows sandbox varsayılan `%TEMP%` altındaki rename işlemini `EPERM` ile engelledi. Aynı testler repository içindeki izinli geçici dizin kullanıldığında geçti; 19 test geçti, 2 link yetkisi testi atlandı.
- `RSM-05C` testinde link oluşturma kullanılamadığında `t.skip()` çağrısından sonra test devam edip hata verebiliyordu. Yalnız test akışı düzeltildi; link kurulabildiğinde workspace-rebinding assertion'ı aynen korunuyor.
- `npm test`: son kaynakta 1.024 test, 1.020 başarılı, 4 Windows platform skip, 0 başarısız. Çalıştırma normal Windows test ortamı izniyle yapıldı; sandbox içinde geçici Git repo `.git/config` yazımları EPERM ile engellenmişti.
- `npm run verify`: son kaynakta geçti. Inference çalıştırılmadı; health çıktısında provider API erişilebilirlik/authentication health kontrolü bulundu, model capability probe yapılmadı.
- `npm run smoke`: son kaynakta geçti; gerçek yerel stdio MCP client/server kullanıldı. Smoke sağlık bölümü DeepSeek health endpoint/catalog erişimini yaptı; provider inference ve capability probe yapılmadı. Permit tool'u mevcut sözleşmede yoktur.
- `npm run verify:ci`: son kaynakta geçti.
- `git diff --check`: son kaynakta geçti.
- Gerçek MCP izin/teslim sözleşmesi, sahte provider teslim sayısı ve platform veto davranışı test edilmedi; production bağlantısı reddedilen adım yüzünden tamamlanamadı.
- Bağımsız Sol denetimi yapılmadı. Kullanıcı bu görev için Sol/provider çağrısına yetki vermedi.

## Gerekli karar

Tamamlanmamış iş yalnız genel bir araştırma ihtiyacı değildir. Otomatik inceleme, kullanıcı yetkisinden bağımsız olarak manifest katmanındaki secret-preflight istisnasını reddetti. Üretim özelliğine geçmek için uygulanabilir dar tasarım şu sınırları korumalıdır: ayrı MCP elicitation ile kullanıcıya tam, değişmez prompt ve payload gösterimi; `contentReviewed` ve `noLiveCredential` gibi açık kullanıcı yanıtı; 10 dakikalık persistent kayıt; workspace/HEAD/caller/target/model/prompt/bundle ve dosya path/hash/mode/byte bağlarının yeniden doğrulanması; kernel-lock altında tek tüketim; tüketim sonrası hiçbir retry/fallback; redakte audit; istemci elicitation desteği yoksa default ret. Dış platform auto-review veto olarak kalır.

Bu tasarımın üretim source-delivery istisnası olmasına rağmen yerel uygulama otomatik güvenlik incelemesini geçmedi. Aynı davranış dolaylı kod yoluna taşınarak uygulanmayacaktır. Devam için gereken tek dar dış karar, bu açıkça insan onaylı ve tek bundle/tek çağrı ile sınırlı source-review istisnasının otomatik güvenlik politikasınca kabul edilip edilmeyeceğinin yetkili güvenlik kapısında karara bağlanmasıdır. Bu karar olmadan production preflight davranışının değiştirilmesi uygun değildir.

Option B kapalıdır. P1b, P2, P3 ve P6 canlı kabul kapıları bu yerel çalışma nedeniyle kapanmış sayılmaz.
