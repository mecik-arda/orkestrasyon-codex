# Orkestrasyon Parallel Batch — Araştırma, Review ve Kalan İşler Raporu

**Tarih:** 15 Ekim 2026  
**Kapsam:** `parallel_batch` output-limit düzeltmesinin canary geçmişi, `result_ready` durum davranışı, plan/review geçmişi ve uygulama öncesi açık kararlar.  
**Genel durum:** Output-limit kod düzeltmesi daha önce tamamlanıp push edildi. Yeni lifecycle planı hazır; kod uygulaması başlamadı. Kullanıcı tarafından iletilen son plan-only review Faz 0 karar çalışmasına GO, Faz 1–4 kodlamasına NO-GO verdi.

## 1. Yönetici özeti

Bu oturum iki ilişkili fakat farklı konuyu ele aldı:

1. Önceden uygulanan process-output/empty-output düzeltmesi `orkestrasyon` Bridge koduna aittir. İlgili kod ve canary geçmişi planlarda tutuluyor; kod commit'leri `bed3949` ve `300a0a5` olarak önceki oturumda `origin/master`'a push edildi.
2. Yeni bulgu, üç salt-okunur `artistik-efektler` batch'inin `result_ready` durumunda kalmasıyla ortaya çıktı. Yerel kaynak incelemesi bunun worker'ların takılması olmadığını gösteriyor: `runBatch` sonuçları yazıp kontrol kayıtlarını temizliyor; watcher da `result_ready`'de izlemeyi bırakıyor. Sorun adayı, `result_ready`'nin watcher açısından execution-settled, registry açısından lifecycle-nonterminal olmasıdır. Bunun gerçek bir ürün kusuru olup olmadığı mevcut MCP consumer sözleşmesiyle Faz 0'da doğrulanmalıdır.

Bu farkı ele alan plan oluşturuldu ve birden fazla plan-only review sonrasında kapsamı netleştirildi. Mevcut plan, bir kodlama onayı değildir. Özellikle cancellation/unknown önceliği, karma read/edit entegrasyon kuralı, eski manifest/schema uyumluluğu ve test oracle matrisi karara bağlanmadan kod değişikliğine geçilmemelidir.

## 2. Süreç ve yapılanlar

### 2.1 Önceki output-limit düzeltmesi

- `parallel_batch` read-only Codex/OpenCode çağrılarındaki process JSONL çıktısının sınırı, adapter JSON parsing'inden önce uygulanıyordu. İlk düzeltme streaming JSONL reducer, ham byte sayaçları ve ayrı process/record/final-result sınırlarını ekledi.
- OpenCode no-text sonucu `empty_output` olarak ayrılıyor; read-only runtime mevcut attempt/cost bütçesi içinde en çok bir retry yapıyor. Edit çağrısı retry edilmiyor ve reasoning final yanıt diye kullanılmıyor.
- Önceki plan kayıtlarında `npm test`, `npm run verify`, `npm run verify:ci`, `npm run smoke`, `npm run drill` ve ilgili fixture doğrulamaları başarılı olarak raporlandı. Ayrıntılı çıktılar geçmiş plan/durum kayıtlarında bulunuyor; bu rapor bunları yeniden çalıştırılmış testler olarak sunmuyor.
- Bu kod çalışmasıyla ilişkili commit'ler `bed3949` ve `300a0a5` olarak önceki oturumda push edildi. Bu rapor kapsamında yeni kod değişikliği yapılmadı.

### 2.2 `artistik-efektler` salt-okunur batch'i

- `requirements`, `architecture` ve `validation` adlı üç salt-okunur görev için plan hazırlandı; tahmini rezerv `$0.60`, batch üst sınırı `$1.00` idi. Bu tutarlar sağlayıcı faturası değildir.
- Batch özetine göre `architecture` ve `validation` tamamlandı; `requirements` OpenCode / `deepseek/deepseek-flash` çağrısı `empty_output` / `no usable output` ile başarısız oldu. Task detail özetinde `exitCode: 0`, kabul edilen stdout `118126` byte, kullanılabilir stdout `0`, stderr `7054` byte ve cost metric `$0.008298906` bildirildi. Otomatik retry yapılmadı.
- `architecture` ve `validation` Codex / `gpt-6-luna` salt-okunur analizleri olarak raporlandı. Hiçbir test, build, kurulum veya ağ komutu çalıştırmadılar. Batch özetinde dosya değişikliği bildirilmedi.
- Durum sorguları `2 completed`, `1 failed`, `unknownCount: 0`, batch `result_ready` olarak tekrarlandı. Aynı session'ın raporunda bu durum terminal olarak sunulmadı. Bu raporda da batch'in terminale ulaştığı iddia edilmiyor.
- Task detayları ve sayaçlar bu rapor yazarının aynı Bridge session'ında açılmadı; değerler batch'i yürüten session'dan kullanıcı tarafından iletilen yapılandırılmış özetlere dayanıyor. Bu sınırlama, `artistik-efektler/context/parallel-batch-plan-incelemesi-2026-10-15.md` içinde de kayıtlı.

### 2.3 Proje kaynaklarından bağımsız kontrol

Ana plan, istemci tarafında React + TypeScript + Vite, worker tabanlı render ve video için Mediabunny mimarisini seçiyor (`artistik-efektler/Spiral_Metin_Portre_Yazilim_Plani_2026-10-12-1.md:7-35`). Faz 0, önce çalışan uygulama iskeleti ve anlamlı test tabanı kurulmasını istiyor (`artistik-efektler/context/faz0-uygulama-plani-orkestrator-sentezi.md:54-76`).

Yerel dosya kontrolü şunları doğruladı:

- `artistik-efektler/index.html:9-12`, `/src/main.tsx` girişini çağırıyor; `src` dosya taramasında `main.tsx` bulunmadı.
- `artistik-efektler/package.json:7-11`, `npm run dev`, `npm run build` ve `npm test` komutlarını tanımlıyor. Bu oturumda bu komutlar çalıştırılmadı.
- `src/domain/config.ts`, `src/render/{image,font,geometry,scene}.ts` ile bazı test dosyaları yalnızca `export {};` içeriyor. Bu, söz konusu kaynaklarda o an uygulama/test mantığı olmadığına dair doğrudan içerik kontrolüdür; gerçek build/test sonucu değildir.
- `git rev-parse --show-toplevel`, `artistik-efektler` dizininde “not a git repository” ile sonuçlandı. O workspace için Git diff/working-tree kanıtı yoktur; read-only analiz bundan dolayı geçersiz olmaz.

## 3. `result_ready` hakkında yerel Bridge kanıtı

### 3.1 Task execution ve watcher davranışı

- `subagent-bridge/src/services/parallel-batch.js:1463-1517`, wave task'larını bekler; son güncellemede cancellation, `unknown`, all-failed veya diğer durumlara göre batch status seçer, `endedAt` yazar ve `parallel_batch_finish` metriği üretir.
- `subagent-bridge/src/services/parallel-batch.js:1518-1600`, edit entegrasyon hazırlığını yalnız edit task'ları varsa ve hepsi tamamlandıysa başlatır. Salt-okunur batch'te `result_ready` sonrasında bu edit geçişi yoktur; kontrol/plan kayıtları yine de temizlenir.
- `scripts/watch-parallel-batch.js:7-8,74-79,108-122`, `result_ready` durumunu watcher'ın sonlandırdığı “workers stopped” durumlarından biri sayar.
- Buna karşılık `subagent-bridge/src/services/parallel-batch-registry.js:8-26`, `result_ready`'yi lifecycle-terminal kümesine dahil etmez ve başka geçişlere izin verir.

Bu nedenle **worker'ın çalışmaya devam ettiği veya task'ların takıldığı sonucu çıkarılamaz**. Doğrulanmış fark, execution-settlement ile workflow lifecycle terminal anlamlarının status tüketicilerinde ayrışmasıdır. Bu farkın gerçek kullanıcı/consumer kusuru olup olmadığı, ilgili consumer beklentisiyle ölçülmelidir.

### 3.2 Yeni plan için teyit edilen tasarım noktaları

- Public status schema v1'dir ve batch enum'unda `completed`/`partial` yoktur (`parallel-batch-schema.js:3-20`). Metrics allowlist'inde `completed` bulunması, batch API'nin bu status'u gerçekten ürettiğini kanıtlamaz (`metrics.js:1628-1652`).
- Task-level contract schema'sında `optional`/`advisory` alanı yoktur (`parallel-batch-schema.js:45-87`).
- `runBatch` status sıralamasında cancellation intent `unknown` kontrolünden önce gelir (`parallel-batch.js:1485-1495`). Task `unknown` sayacı ve unknown budget metriği ayrıca taşınır (`parallel-batch.js:1500-1515`); buna rağmen top-level `cancelled` status'u yalnız status alanını okuyan consumer'a belirsizliği göstermeyebilir.
- Edit entegrasyonu kontrolü yalnız edit task'larının tamamlanmasına bakar (`parallel-batch.js:1518-1527`). Public summary task statülerini ve `failedCount` değerini gösterir (`parallel-batch.js:650-716`); yani onay aşamasına ulaşmak otomatik kaynak workspace değişikliği değildir. Ancak başarısız read-only task'ın `ready_for_approval` hazırlığını engelleyip engellememesi açık policy kararıdır.
- Kullanıcı tarafından sağlanan dış chatbot review'ları plan-only idi; yerel kodu doğrulamadılar. Son review `CONDITIONAL — Faz 0 GO / Faz 1–4 NO-GO` kararını verdi ve beş uygulama engelinin tamamının kapanmadığını belirtti.

## 4. İstenen independent-review çağrıları

- DeepSeek Pro reviewer çağrısı `review_scope_secret_detected` ile source delivery başlamadan durdu; yapılandırılmış reviewer sonucu oluşmadı. Güvenlik filtresi aşılmadı ve çağrı tekrarlanmadı.
- Gemini Flash 3.8 web araştırması `rate_limited` ile sonuç vermedi; Gemini kaynak listesi oluşmadı.
- GPT-6.1 Sol normal salt-okunur, araçsız erişim çağrısı başarılı oldu; bu yalnız Sol çağrısının çalıştığını gösterir, plan denetimi değildir.
- GPT-6.1 Sol required source-review, çok dosyalı ve plan-only kapsamda `review source scope rejected / high_entropy` ile model çağrısından önce reddedildi. Plan metni üzerinde redakte yerel tarama, beş yüksek-entropi eşleşmesinin normal dosya yolu/kaynak referansları satırlarında olduğunu gösterdi (planın o sürümünde satır 40, 44, 152–154). Sinyal `high_entropy` idi; bu gerçek secret bulunduğunu kanıtlamaz. Ancak filtreyi atlatmak için kaynakları tekrar biçimlendirme veya review'ı başka Sol aracına taşıma yapılmadı.
- AWS Step Functions ve Temporal birincil dokümanları ana orkestratör tarafından doğrudan açıldı. Bunlar yalnız genel state-machine karşılaştırmasıdır; Gemini/DeepSeek subagent doğrulaması veya local code evidence değildir.

## 5. Review ve plan durumu

Güncel plan dosyası: `docs/plans/PARALLEL_BATCH_SONLANMA_DURUMU_SOZLESMESI_PLANI_2026-10-15.md`.

Planın mevcut tavsiyesi:

- **Faz 0 için GO önerisi:** consumer sözleşmesini, tam outcome matrisini, mixed read/edit kuralını, manifest/schema uyumluluğunu ve test oracle'larını kod yazmadan kesinleştirmek.
- **Faz 1–4 için NO-GO:** bu kararlar kapanmadan state enum, registry, `runBatch`, metrics veya rollout değişikliği başlatmamak.
- `completed`/`partial` isimleri taslak öneridir; henüz kesin API kararı değildir.
- `result_ready`'nin farklı anlamları için iki seçenek açık: mevcut status'u execution-settled olarak açıklayıp projection eklemek veya read-only batch'ler için terminal outcome eklemek. Seçim mevcut consumer contract'ı doğrulandıktan sonra yapılmalıdır.

## 6. Kalan işler

Faz 0 karar/kanıt çıktısı:

1. `get_parallel_batch`, watcher ve gerçek istemci beklentilerini doğrulayıp `result_ready` için execution-settled/lifecycle-terminal sözleşmesini seçmek.
2. Tam outcome önceliğini belirlemek: cancel + unknown, task-level cancelled, blocked-only, failed + blocked, mixed outcomes ve cancellation/finalization yarışı.
3. Mixed read/edit batch'lerinde hangi task'ların zorunlu olduğunu tanımlamak. Mevcut schema optional/advisory flag içermediğinden güvenli varsayılan bütün task'ların gerekli sayılmasıdır; başka seçim yapılırsa strict schema değişikliği gerekir.
4. Eski schema v1 manifestleri, yeni public status enum'u, `get_parallel_batch` projection'ı, metrics, cancellation, restart/recovery ve no-double-settlement için versioned uyumluluk kararı almak.
5. Her outcome için başlangıç durumları ve beklenen manifest/API/budget/metrics alanlarını belirten deterministik test oracle matrisi yazmak. Process/descendant temizliği ayrıca test edilmeli.
6. Sol source-review false positive'i için filtre kodunu değiştirmeden önce ayrı bir araç kusuru planı ve güvenli regresyon yaklaşımı belirlemek. Lifecycle planı içinde secret filtresini gevşetmemek.

Faz 0 çıktısı sonrası uygulama planı güncellenmeli ve ayrı onay kapısı korunmalı. Bu rapor hiçbir kodlama, test/build, provider batch çağrısı veya rollout onayı vermez.

## 7. Review, onay ve session yaşam döngüsü kronolojisi

### 7.1 Önceki output-limit planının review/uygulama durumu

- Önceki `PARALLEL_TASK_PROCESS_OUTPUT_LIMIT_DUZELTME_PLANI_2026-10-15.md` için ilk GPT-6.1 Sol plan-only denetimi `CONDITIONAL` verdi. Planın uygulanmış Faz 0–3 işi ile üç eski task'ı yeniden çalıştırma adımının karıştığını ve geçmiş risklerin güncel risk gibi sunulduğunu belirtti.
- Ana orkestratör plan durumunu ve risk sınıflarını revize etti; ikinci GPT-6.1 Sol plan-only denetimi `APPROVE`, bulgu yok sonucu verdi. Bu karar yalnız planın açıklığı/kalan batch planının hazırlanması içindi; provider çağrısı veya tüm kodun bağımsız doğrulaması değildi.
- Kullanıcı salt-okunur canary için `$1.00` üst sınırı verdi. Bu limit yalnız o canary içindi; başka implementasyon batch'lerine otomatik aktarılmadı.

### 7.2 Artistik proje batch'inin hazırlanması ve başlatılması

- İlk hazırlanan batch planı `artistik-efektler` kaynağındaki gereksinim, mimari ve doğrulama görevlerinden oluşuyordu. Plan, kendi Bridge session'ında başlatılmak zorundaydı.
- Başlatma farklı bir Bridge session'ından denenince `plan_context_unavailable` döndü. Batch başlamadı. Sonraki hazırlama ve başlatma aynı session'da yapıldı; bu sefer task'lar gerçekten çalıştı.
- Yeni batch salt-okunur, aynı dalgada üç bağımsız task ve yaklaşık `$0.60` tahmini rezerv / `$1.00` tavanla çalıştı. Read-only analiz için Git repo gerekmiyordu; `artistik-efektler` dizininin Git deposu olmadığı yalnızca diff/commit kanıtını engelledi.
- Bir ara yanlış biçimde `orkestrasyon/config/policy.json` içindeki `parallelBatch.enabled: false` etkin runtime ayarı gibi yorumlandı. Yerel `config.js` kodu etkin yapılandırmanın `ORCHESTRATOR_CONFIG` veya kişisel Bridge config yolundan yüklenebildiğini gösteriyor (`subagent-bridge/src/config.js:231-240`). MCP batch araçlarının kaydı da etkin `configuration.parallelBatch.enabled` değerine bağlı (`subagent-bridge/src/frontends/mcp/server.js:418`). Başarılı plan hazırlama, o hazırlama runtime'ında kapının açık olduğuna işaret ediyordu; statik dosya tek başına etkin runtime kanıtı değildi.
- Batch summary'de iki task tamamlandı ve biri başarısızdı; task detail/sayaçları batch'i başlatan session'dan raporlandı. Bu raporun yazarı bu detail artifact'larını aynı Bridge session'ında açmadı; bu nedenle run-specific ölçümler kullanıcı tarafından iletilen yapılandırılmış özetler olarak etiketlendi.

### 7.3 Batch statüsünün ayrıştırılması

- `result_ready` tekrarlandığında eski değerlendirme onu doğrudan “terminal” veya “terminal değil” diye tek anlamda sınıflandırdı. Yerel kaynaklar bunun doğru olmadığını gösteriyor: watcher `result_ready`'de worker izlemeyi bitiriyor, registry'nin lifecycle-terminal kümesi ise bu statüyü terminal saymıyor.
- Dolayısıyla mevcut kanıt “worker hâlâ çalışıyor” demiyor. Asıl soru, kullanıcı ve MCP istemcilerinin execution'ın bittiğini hangi public alandan anlayacağı ve read-only workflow'un ayrı final status gerektirip gerektirmediğidir.
- Plan bu ayrımı, task summary/task detail kaybı olmadan ve explicit edit approval kapısını koruyarak çözmeyi hedefliyor.

## 8. Bağımsız review durumu ve sınırlamalar

- Kullanıcı tarafından sağlanan farklı plan-only chatbot review'ları aynı genel sonuca yaklaştı: son review `CONDITIONAL — Faz 0 GO / Faz 1–4 NO-GO`; beş karar kapısının üçü kısmen kapalı, ikisi açık sayıldı. Review yapan chatbot dosya metnini okuyabildiğini, yerel code/test kaynaklarına erişemediğini belirtti.
- Ana orkestratör daha sonra review'ın iki kritik kaynak iddiasını yerelde doğruladı: `runBatch` cancellation intent'ini `unknown` durumundan önce değerlendiriyor; integration gate yalnız edit task statülerini kontrol ediyor. Public summary task statülerini/failed count'u taşıyor, fakat bu tek başına integration gate yerine geçip geçmediği kararını çözmüyor.
- GPT-6.1 Sol normal salt-okunur/tool-free çağrısı başarılı oldu; bu yalnız model/route erişimini gösterdi. Required source-review çağrısı ise model dispatch'ten önce `review source scope rejected / high_entropy` ile engellendi. Yerel classifier'ın 32+ karakterlik yüksek-entropili dizeleri taraması ve plan içindeki beş uzun path/reference eşleşmesi tespit edildi; bunlar secret olduğuna kanıt değil, olası false positive. Kaynak paketi Sol'a teslim edilmedi.
- DeepSeek Pro reviewer `review_scope_secret_detected` ile source delivery başlamadan engellendi; Gemini Flash 3.8 `rate_limited` oldu. Bu sağlayıcılardan geçerli independent review/web-citation sonucu yok. Başka provider sonucu onların yerine yazılmadı.
- AWS Step Functions ve Temporal resmi sayfaları ana orkestratör tarafından doğrudan açıldı. Bu iki public kaynak genel terminal-state karşılaştırması sağlar; Bridge davranışının doğruluğunu kanıtlamaz.

## 9. Faz 0 karar listesi ve Faz 1–4 kapısı

Faz 0'da aşağıdaki beş karar ve ölçülebilir kanıt paketi kapanmadan kod değişikliği başlamamalı:

1. `result_ready` için gerçek MCP/watch consumer sözleşmesi: execution-settled yeterli mi, yoksa read-only workflow terminal status'u mu gerekiyor?
2. Cancellation/unknown/blocked/task-level-cancelled dahil tüm task sonuçlarının batch outcome öncelik matrisi; bilinmeyen harcama ve task durumu hiçbir outcome'da kaybolmamalı.
3. Mixed read/edit batch'inde hangi task'ların zorunlu olduğu ve başarısız zorunlu read-only task'ın `ready_for_approval` hazırlığını engelleyip engellemeyeceği. Schema'da optional/advisory flag yoksa varsayılan davranış kararı açıkça alınmalı.
4. Schema v1 manifestleri, strict MCP istemcileri, recovery, finalization retry ve no-double-settlement uyumluluğu.
5. Her outcome için exact manifest/API/status-count/budget/metric fixture oracle'ı; process-tree temizliği için adapter/test kanıtı.

Bu raporun son durumunda Faz 0 karar/kanıt çalışması önerilebilir; Faz 1–4 kod uygulaması için onay yoktur. Faz 0'ın tamamlanması da kodlama onayı yerine geçmez; seçilen tasarım ve uygulanacak diff için ayrı review/approval gerekir.

## 10. Çalışma ağacı ve doğrulama durumu

Bu rapor hazırlanırken `orkestrasyon` Git durumunda şu yollar görüldü:

- `docs/plans/PARALLEL_TASK_PROCESS_OUTPUT_LIMIT_DUZELTME_PLANI_2026-10-15.md` — önceki oturumdan mevcut yerel düzenleme.
- `docs/plans/PARALLEL_BATCH_SONLANMA_DURUMU_SOZLESMESI_PLANI_2026-10-15.md` — bu lifecycle planı, henüz commit edilmedi.
- `docs/reports/codex_subagent_model_mimarisi_ve_yapilandirma_raporu.md` — önceden mevcut ve bu işte değiştirilmedi.
- `docs/reports/ORKESTRASYON_PARALLEL_BATCH_LIFECYCLE_DURUM_RAPORU_2026-10-15.md` — bu rapor; yeni oluşturuldu, henüz commit edilmedi.

Bu rapor ve plan için test/build çalıştırılmadı; kod değiştirilmedi. `git diff --check` tracked diff için hata vermedi; yeni untracked plan/rapor dosyaları standart Git diff kontrolüne dahil olmadığından ayrıca okundu. Mevcut output-limit plan dosyası için Git, LF/CRLF dönüşüm uyarısı verdi. `artistik-efektler` proje dizini Git deposu olmadığından o dizin için commit/diff doğrulaması yapılamadı.

## 11. Kaynaklar

- Local lifecycle implementation: `subagent-bridge/src/services/parallel-batch.js:1463-1600,1485-1515,1518-1527,650-716`.
- Status registry: `subagent-bridge/src/services/parallel-batch-registry.js:8-26`.
- Strict task/batch schema: `subagent-bridge/src/schemas/parallel-batch-schema.js:3-31,45-95`.
- Watcher termination set: `scripts/watch-parallel-batch.js:7-8,74-79,108-122`.
- Metrics allowlist: `subagent-bridge/src/metrics.js:1628-1652`.
- MCP batch tools: `subagent-bridge/src/frontends/mcp/server.js:418-455`.
- Relevant regression tests: `tests/parallel-batch.test.js:139-189,216-257`; review scope scanner tests: `tests/review-source-manifest.test.js:525-561`.
- Batch report from the `artistik-efektler` read-only analysis: `../../artistik-efektler/context/parallel-batch-plan-incelemesi-2026-10-15.md`.
- Existing output-limit work and prior canary status: `docs/plans/PARALLEL_TASK_PROCESS_OUTPUT_LIMIT_DUZELTME_PLANI_2026-10-15.md`.
- User-provided review results are recorded as review input, not independently verified source evidence.

## 12. Batch önizlemesi ve task çıktılarının tam özeti

Bu bölümdeki batch arayüzü ölçümleri ve model çıktıları batch'i yürüten session'dan kullanıcı tarafından aktarıldı; bu raporun yazarı aynı opaque detail artefaktlarını açmadı. Yerel proje dosyalarına ilişkin bağımsız doğrulamalar bölüm 2.3 ve bölüm 3'te ayrıca işaretlenmiştir.

- `requirements` — `analyst`, OpenCode / `deepseek/deepseek-flash`. Kaynak snapshot'ları hedef proje planı, `kurallar.md`, `context/faz0-uygulama-plani-orkestrator-sentezi.md` ve `context/teknik-arastirma.md` idi. Görev en fazla sekiz kısa kaynaklı Faz 0 bulgusu istenerek salt-okunur planlandı. Sonuç `empty_output` / `no usable output`; `exitCode: 0`, `acceptedStdoutBytes: 118126`, `stdoutBytes: 0`, `acceptedStderrBytes: 7054`, `rejectedChunkBytes: 0`, `result: null`. Geçerli gereksinim analizi üretilmedi; otomatik retry yapılmadı.
- `architecture` — `planner`, Codex / `gpt-6-luna`. Kaynak snapshot'ları plan, kurallar, Faz 0 sentezi, teknik araştırma, `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html` ve mevcut domain/render/test dosyalarıydı. Raporlanan sonuç: teknoloji seçimi bootstrap'la kısmen uyumlu; giriş, çekirdek render/config modülleri ve testler tamamlanmamış. Önerilen uygulama sırası: çalışan app/test tabanı → saf render çekirdeği → worker/browser → video → cihaz ölçümleri. Test/build/kurulum/ağ çalıştırılmadı.
- `validation` — `reviewer`, Codex / `gpt-6-luna`. Kaynak kapsamı plan, kurallar, Faz 0 sentezi, package/config/HTML ve mevcut domain/render/test dosyalarıydı. Raporlanan sonuç: Faz 0 için testler, worker/video doğrulaması ve gerçek Windows/Android cihaz kapıları gerekli; mevcut dosyalarda bunların uygulanmış/doğrulanmış kanıtı bulunmadı. `npm test`, `npm run build`, `npm run dev` script tanımları belirtildi; hiçbir komut çalıştırılmadı.
- Üç task aynı dalgada planlandı, salt-okunurdu; task dependency/file-write sahipliği yoktu. Kaynak task özetinde `filesChanged: []`, `unknownCount: 0`, iki completed ve bir failed bildirildi.
- Task budget özeti: başlangıç tahmini `$0.60`, cap `$1.00`. Son özet yaklaşık `reservedUsd: $0.408298906`, `settledKnownUsd: $0.008298906`, `unknownReservedUsd: $0.40`, `refundedUsd: $0.191701094`, `remainingUsd: $0.591701094` gösterdi. `requirements` detail'indeki `$0.008298906` bu settled-known tutarıyla eşleşti. Bunlar provider invoice değildir; diğer iki provider task'ının gerçek maliyeti raporlanmadı.
- Kaynak scope/limit önizlemesinde task başına process output cap 8 MiB idi; JSONL record ve final-result cap'leri host yapılandırmasıydı. OpenCode output-token capability `unavailable` raporlandığından 2048 token cap eklenmedi; rota/fallback değiştirilmedi.
- Aynı session'daki tekrar `get_parallel_batch` sorguları `result_ready`, 2 completed, 1 failed ve 0 unknown olarak kaldı. Registry kaynağında `result_ready` lifecycle terminal değil; watcher ise worker-stop aşaması sayıyor. Hiçbir rapor bu gözlemi “worker çalışmaya devam ediyor” şeklinde yorumlamamalı.

## 13. Review ve araç çağrılarının kronolojisi

- Önceki output-limit planı için Sol'un ilk plan-only review'ı `CONDITIONAL` oldu; rapora göre Faz 0–3 uygulama durumu ile üç eski task'ın yeni canary adımı ayrışmamıştı. Plan metni revize edildi ve ikinci Sol plan-only review'ı `APPROVE` verdi. Bu, planın hazırlık açıklığı içindi; kodun bağımsız denetimi veya provider batch start onayı değildi.
- Batch hazırlama ve başlatma farklı Bridge session'larında denendiğinde `plan_context_unavailable` döndü; o girişimde worker başlamadı. Aynı originating session'da yeni read-only plan hazırlanıp başlatılınca üç task çalıştı.
- Bir başka session static `orkestrasyon/config/policy.json` değerini etkin runtime kapısı sandı. Yerel kod, `loadConfiguration`'ın `ORCHESTRATOR_CONFIG` override'ını veya kişisel Bridge config yolunu kullanabildiğini gösterir (`subagent-bridge/src/config.js:231-240`). MCP batch araçları etkin `configuration.parallelBatch.enabled` koşulunda kaydedilir (`server.js:418`); başarılı prepare sonucu etkin runtime'ın o çağrıda açık olduğuna işaret etmişti. Static dosyaya dayanarak kapı kapalı hükmü yanlış/kanıtsızdı.
- DeepSeek Pro reviewer çağrısı `review_scope_secret_detected` ile preflight'ta engellendi; source delivery ve structured result olmadı. Gemini Flash 3.8 araştırması `rate_limited` ile sonuçsuz kaldı. Retry/fallback yapılmadı.
- Sol'un normal, araçsız/read-only kısa erişim çağrısı başarılı oldu ve `requestedModel`/`resolvedModel` `gpt-6.1-sol` eşleşti. Bu yalnız normal çağrı yolunun erişilebilirliğini gösterir; plan review sonucu değildir.
- GPT-6.1 Sol required review önce çok dosyalı, sonra plan-only kapsamda `review source scope rejected / high_entropy` ile model dispatch'ten önce reddedildi. Güvenlik filtresinin `memory.js:140-170` kuralı 32+ karakterlik ve Shannon entropy ≥4.2 dizileri aday sayar; `review-source-manifest.js:137-143` eşleşmeyi source delivery öncesi reddeder. Plan içeriğinde aynı kuralla redakte yapılan sayım beş adayın path/reference satırlarında olduğunu gösterdi (plan satır 40,44,152–154); bu, olası false positive'dir, secret bulunduğunun kanıtı değildir. Filtreyi aşmak için plan içeriği sakatlanmadı veya Sol başka wrapper'a taşınmadı.
- Kullanıcının başka chatbot'a verdiği plan-only review `CONDITIONAL — Faz 0 GO / Faz 1–4 NO-GO` sonucu verdi. Reviewer güncel/önceki plan dosyalarını okuyabildiğini, yerel code/test kaynaklarını doğrulayamadığını bildirdi. Önceki beş engelden sıfırını tamamen kapalı, üçünü kısmen kapalı, ikisini açık saydı. Sonraki plan revizyonlarında cancellation/unknown, mixed read/edit, schema/recovery ve exact test oracle kapıları daha açık yazıldı; bu dış review Sol veya local-code review olarak kaydedilmedi.

## 14. Son review'a göre ayrıntılı kalan kararlar

Son plan-only review'ın Faz 0/Faz 1–4 sınırı şu açık teslimata dönüşür:

1. **Lifecycle consumer kanıtı:** Hangi consumer `result_ready` için ne yapıyor; kullanıcı gerçekten sonsuz bekliyor mu, yoksa `workers stopped` mesajı yeterli mi? Yeni `completed`/`partial` status mu, yoksa `executionSettled`/`lifecycleStage` projection'ı mı gerektiğine ölçülebilir consumer örneğiyle karar ver.
2. **Outcome matrisi:** `cancel + unknown`, task-level cancellation, `blocked`-only, `completed + failed`, `completed + blocked`, boş/invalid batch ve cancellation/finalization yarışı için tekil precedence belirle. Unknown task ve budget reserve asla başarıya indirgenmesin.
3. **Integration predicate:** `allEditTasksCompleted` yanında required read-only task'ların başarı koşulu gerekip gerekmediğini belirle. Mevcut schema'da optional/advisory yok; başlangıç varsayımı bütün task'ların required olması, değişiklik ancak açık schema semantics ile.
4. **Version/recovery:** Schema v1 eski manifestleri okumaya devam etsin; gerekiyorsa yeni version'da final status/projection mapping, crash recovery, retry idempotency, cancellation sonrası unknown, çift settlement ve metric event cardinality kesinleşsin.
5. **Test oracle matrisi:** Her satır için input manifest, API status, task counts, budget values, `endedAt`/`finalizedAt` semantics, metrics, detail availability ve watcher completion tam expected değerlerle yazılsın.
6. **Process cleanup:** Adapter/process tree cleanup kaynakları ve child/descendant kill testleri incelensin. `Promise.allSettled`, `endedAt` veya watcher return tek başına process-tree reaping kanıtı değildir.

Faz 0 bu kararları ve yerel kanıt paketini üretir. Faz 1 status/schema/registry/metrics kodu, Faz 2 runBatch/finalization/recovery, Faz 3 regresyonlar ve Faz 4 rollout; Faz 0 review ve ayrı uygulama onayı gelmeden başlamaz.
