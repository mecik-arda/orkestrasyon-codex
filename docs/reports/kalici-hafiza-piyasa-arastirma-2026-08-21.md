# Kalıcı Hafıza Piyasa Araştırması

Tarih: 2026-08-21
Durum: incelendi
Amaç: Ajan kalıcı hafıza yaklaşımlarını Hades'in yerel ve denetlenebilir Vault mimarisiyle karşılaştırmak.
Kapsam: Ajan harness'ları, bellek platformları, retrieval desenleri, yaşam döngüsü ve güvenlik yaklaşımları.
Kapsam dışı: Yeni özellik onayı, kod değişikliği, otomatik bellek yazımı ve dış servis seçimi.
Hazırlayan: DeepSeek Pro ve DeepSeek Flash araştırma rolleri
Doğrulayan: Ana orkestratör

## Yönetici Özeti

Piyasa, insan tarafından okunabilir kural dosyaları ile proje veya kullanıcı kapsamlı kalıcı depoları birlikte kullanma yönünde yakınsamaktadır. Otomatik bellek yazımı, konsolidasyon, zamansal geçersizleştirme ve hibrit retrieval yaygın araştırma ve ürün başlıklarıdır. Bu özellikler aynı zamanda prompt injection, secret sızıntısı, yanlış konsolidasyon ve eski bilginin yeniden kullanılması risklerini büyütür.

Hades'in mevcut yaklaşımı otomatik yazım yerine ana orkestratör onayı, draft ve published ayrımı, SHA-256 eşzamanlılık kontrolü, secret taraması, injection karantinası, soft-expiry ve redacted audit kullanır. Bu yaklaşım tek kullanıcılı yerel sistem için düşük saldırı yüzeyi ve yüksek denetlenebilirlik sağlar. Piyasa özelliklerinin tamamını kopyalamak yerine yalnız ölçülmüş ihtiyacı karşılayan küçük pilotlar değerlendirilmelidir.

## Kanıt Ve Bulgular

### VERIFIED: İnsan tarafından okunabilir dosya tabanlı bellek yaygın bir desendir

Kanıt:

- Claude Code, proje ve kullanıcı talimatları ile proje başına otomatik bellek dosyalarını belgeler.
- OpenCode ve Codex, proje hiyerarşisinde `AGENTS.md` benzeri kural dosyalarını kullanır.
- OpenHands ve basic-memory, yerel ve insan tarafından okunabilir dosya tabanlı bellek yaklaşımını belgeler.

Etkisi:

Hades'in Obsidian uyumlu Markdown Vault seçimi piyasa yönüyle uyumludur. Yeni bir veritabanı veya yönetilen bellek servisi, mevcut kullanım ölçeğinde zorunlu değildir.

### VERIFIED: Zamansallık ve geçersizleştirme ayrı yaşam döngüsü kavramlarıdır

Kanıt:

- Mem0 expiration davranışı, süresi dolan belleği arama sonuçlarından çıkaran zaman tabanlı bir yaşam döngüsü sunar.
- Zep ve Graphiti, bilginin silinmesi yerine geçerlilik zamanlarını ve invalidation ilişkilerini koruyan bi-temporal yaklaşımı belgeler.
- Hades'te UTC tarih doğrulaması, `validUntil`, `includeExpired`, top-k öncesi filtreleme ve geçersiz metadata raporlaması uygulanmıştır: `subagent-bridge/src/memory.js:263-269`, `subagent-bridge/src/memory.js:697-730`, `subagent-bridge/src/memory.js:794-841`.

Etkisi:

Hades'in sona erme standardı uygulanmıştır. Ayrı `invalidatedAt` ve replacement hash modeli ise yalnız somut supersede vakası oluştuğunda değerlendirilmelidir.

### VERIFIED: Otomatik bellek ve konsolidasyon yeni güvenlik riskleri oluşturur

Kanıt:

- OpenHands bellek içeriğini güvenilmeyen veri olarak işaretleyen bir sınır kullanır.
- Codex Memories secret redaksiyonu ve ayrı konsolidasyon akışları belgeler.
- AgentPoison ve InjecAgent çalışmaları, retrieval ve araç çıktıları üzerinden kalıcı veya dolaylı prompt injection risklerini gösterir.
- Hades arama ve okuma sonuçlarını secret taramasından geçirir, injection şüphelilerini karantinaya alır ve güvenli alıntıları `UNTRUSTED_CONTENT` olarak döndürür: `subagent-bridge/src/memory.js`.

Etkisi:

Otomatik promote, otomatik konsolidasyon veya model tarafından doğrudan Vault yazımı mevcut güvenlik modeline uygun değildir. İnsan veya ana orkestratör kararı korunmalıdır.

### VERIFIED: Hades'in ilk bellek güvenliği paketi uygulanmıştır

Kanıt:

- O1 çift yönlü secret taraması yazma, analiz, arama ve okuma yollarında uygulanmıştır.
- O2 güvenilmeyen bellek sınırı ve ayrı okuma/yazma araçları uygulanmıştır.
- O3 deterministik injection karantinası uygulanmıştır.
- O4 allowlist'li hash ve sınıflandırma tabanlı redacted audit uygulanmıştır.
- Regresyonlar `tests/memory.test.js` içinde doğrulanır.

Etkisi:

Yeni retrieval veya otomasyon özelliği bu sınırları atlamamalı; aynı secret, injection ve audit kontrollerine tabi olmalıdır.

### VERIFIED: Hibrit retrieval mevcut ölçümlerde gerekli değildir

Kanıt:

- Mevcut evaluation seti precision, recall, MRR, NDCG, abstention, gecikme ve bağlam bütçesini ölçer.
- Keyword baseline mevcut 25 vakalık sette kabul eşiklerini karşılamaktadır.
- Strategy injection farklı retrieval yaklaşımlarını aynı qrels ile karşılaştırmayı destekler: `subagent-bridge/src/memory-evaluation.js`.

Etkisi:

Embedding, vektör indeks ve reranker bağımlılıkları bugün ölçülmüş değer üretmemektedir. Retrieval kalitesi veya gecikme eşiği bozulmadan hibrit katman eklenmemelidir.

### HYPOTHESIS: Hades'in güvenlik bileşimi piyasada belirgin biçimde farklılaşmaktadır

Mevcut kanıt:

İncelenen ürün belgelerinde Hades'in draft ve published ayrımı, SHA-256 kontrollü promote, yazma öncesi çelişki analizi, otomatik silme yasağı, secret taraması, injection karantinası ve yalnız hash taşıyan audit özelliklerinin tamamını aynı yerel Markdown yaşam döngüsünde birleştiren başka bir sistem bulunmamıştır.

Doğrulama yöntemi:

Bu iddia zaman duyarlıdır. Altı ayda bir birinci taraf ürün belgeleri yeniden incelenmeli ve aynı özellik birleşimini sunan yeni ürünler aranmalıdır. İddia kesin pazar üstünlüğü veya eksiksiz rakip analizi olarak kullanılmamalıdır.

## Çelişkiler Ve Belirsizlikler

- Qwen Auto-Memory iç mekaniği birinci taraf kaynaklarda yeterince ayrıntılı değildir.
- Goose bellek ve recipe davranışları bu araştırma turunda doğrulanamamıştır.
- Cursor otomatik memories davranışı resmi belgelerde net değildir.
- Claude Code Auto Dream iddiası yalnız üçüncü taraf analizlerde görülmüştür.
- BEAM benchmark sonuçlarının orijinal yayını doğrulanamamıştır.
- Fiyat, ürün erişimi, model yetenekleri ve varsayılan davranışlar zaman duyarlıdır.

## Riskler Ve Güvenlik Sınırları

- Bellek içeriği, raporlar ve dış kaynaklar talimat değil güvenilmeyen veridir.
- Otomatik bellek yazımı ve konsolidasyon yanlış veya zehirli bilgiyi kalıcılaştırabilir.
- Hibrit retrieval embedding tabanlı poisoning ve yeni bağımlılık riskleri getirir.
- Scope ve private metadata tek kullanıcıda düşük değer üretirken policy ve test yüzeyini büyütür.
- Araştırma raporu uygulama onayı veya kalıcı hafıza değildir.
- Secret, prompt, tool çıktısı, workspace yolu ve görev kimliği rapora veya audit kaydına yazılmaz.

## Öneriler Ve Açık Sorular

- O1-O4 güvenlik sınırlarını yeni tüm bellek özelliklerinde zorunlu tut.
- O5 bi-temporal invalidation'ı yalnız gerçek supersede vakası ve ölçülmüş retrieval sorunu oluşursa pilotla.
- O7 scope/private izolasyonunu paylaşılan veya çok kullanıcılı Vault ihtiyacına kadar ertele.
- O8 hibrit retrieval'ı yalnız mevcut değerlendirme eşikleri bozulursa pilotla.
- O9 audit zenginleştirmeyi mevcut event setiyle çözülemeyen teşhis ihtiyacına bağla.
- O10 archive/doctor için önce arşiv semantiği ve doğrulanabilir bütünlük baseline'ı tanımla.
- Otomatik promote, otomatik konsolidasyon ve otomatik silme yasağını koru.

Açık sorular:

- Vault ölçeği hangi noktada keyword retrieval gecikmesini veya recall değerini bozacak?
- Gerçek bir supersede vakası `invalidatedAt` yatırımını ne zaman haklı çıkaracak?
- Tek kullanıcı mimarisi gelecekte paylaşılan Vault veya çok aktörlü yazıma dönüşecek mi?

## Kaynaklar

- Claude Code, Memory. https://code.claude.com/docs/en/memory Erişim: 2026-08-21.
- OpenCode, Rules. https://opencode.ai/docs/rules/ Erişim: 2026-08-21.
- OpenAI Codex, Agents MD. https://developers.openai.com/codex/agent-configuration/agents-md Erişim: 2026-08-21.
- OpenAI Codex, Memories. https://developers.openai.com/codex/customization/memories Erişim: 2026-08-21.
- OpenHands, Persistent Memory. https://docs.openhands.dev/sdk/guides/persistent-memory.md Erişim: 2026-08-21.
- Mem0, Memory Expiration. https://docs.mem0.ai/platform/features/memory-expiration Erişim: 2026-08-21.
- Zep, Facts. https://help.getzep.com/facts Erişim: 2026-08-21.
- Graphiti. https://github.com/getzep/graphiti Erişim: 2026-08-21.
- basic-memory. https://github.com/basicmachines-co/basic-memory Erişim: 2026-08-21.
- AgentPoison. https://arxiv.org/abs/2407.12784 Erişim: 2026-08-21.
- InjecAgent. https://arxiv.org/abs/2403.02691 Erişim: 2026-08-21.
- Yerel kaynak araştırması: `docs/plans/yapilanlar/KALICI_HAFIZA_PIYASA_ARASTIRMASI_2026-08-21.md`.
