# Paralel Batch Sonlanma Durumu Sözleşmesi Planı

Durum notu (2026-10-15, kullanıcı review'ları sonrası): Yerel Bridge durum makinesi, watcher, MCP sözleşmesi, metrik projeksiyonu ve ilgili testler incelendi. Doğrulanan olgu farklı tüketicilerin `result_ready` değerini farklı kapsamda sınıflandırmasıdır; bunun kasıtlı bir execution/lifecycle ayrımı mı yoksa kusur mu olduğu, mevcut API beklentisi doğrulanmadan kesinleştirilemez. `runBatch` task execution'ı bitirir ve watcher `result_ready` durumunda durur; registry lifecycle-terminal kümesi ise bunu terminal saymaz. Kod veya test değiştirilmedi. Kullanıcı tarafından sağlanan plan-only review'lar `CONDITIONAL` verdi: Faz 0 karar/kanıt çalışması ilerleyebilir; Faz 1–4 kodlaması outcome, mixed edit/read, schema/recovery ve test oracle kararları kesinleşene kadar NO-GO.

Bağımsız kaynak kontrolü isteği: DeepSeek Pro reviewer çağrısı `review_scope_secret_detected` ile engellendi; dosyalar CLI'ye aktarılmadı ve yapılandırılmış inceleme sonucu oluşmadı. Antigravity Gemini Flash 3.8 araştırma çağrısı `rate_limited` ile sonuçsuz kaldı. GPT-6.1 Sol required review, ilk çok dosyalı ve ardından plan-only kapsamda `review source scope rejected` / `high_entropy` ile model çağrısından önce engellendi. Plan metninin redakte yerel sınıflandırması aynı beş adayı dosya yolu/kaynak referanslarında buldu; aday değerleri rapora yazılmadı. Bu, path-aware false positive olasılığını gösterir, fakat güvenlik filtresinin doğrulamasını geçersiz kılmaz. Hiçbir subagent bu planı denetlemiş/validate etmiş değildir; ana orkestratör birincil kaynakları ve yerel kodu ayrıca inceledi.

- Tarih: 2026-10-15 UTC
- Durum: Faz 0 karar/kanıt aşaması için öneri; Faz 1–4 kod uygulaması karar kapıları kapanana kadar beklemede
- Hedef: Read-only batch sonucu, edit entegrasyonu ve lifecycle terminal durumları için tek, test edilebilir sözleşme
- Anti-scope: `artistik-efektler` uygulamasını değiştirmek, batch/provider çağrısı başlatmak, `parallelBatch` policy kapılarını değiştirmek, geçmiş batch manifestlerini otomatik dönüştürmek

## Amaç ve karar ihtiyacı

Asenkron batch tamamlandığında kullanıcı ve istemciler şu sorulara farklı cevaplar almamalıdır:

- Worker süreçleri hâlâ çalışıyor mu?
- Bütün task'lar çözüldü mü; çözüldüyse sonuçlar ne durumda?
- Batch sonuçları okunmaya hazır mı?
- Edit entegrasyonu kullanıcı onayı mı bekliyor?
- Workflow gerçekten terminal mi, yoksa hâlâ geçerli bir geçiş bekliyor mu?

Mevcut `result_ready` değeri read-only sonuçları ve edit entegrasyonuna geçecek sonuçları aynı batch state'te temsil ediyor. Ayrı registry ve watcher kümeleri ise bu değeri sırasıyla lifecycle-nonterminal ve worker-watch-stop olarak sınıflandırıyor. Bu durum tek başına worker hatası kanıtlamaz; fakat istemcilerin `result_ready`'yi nasıl yorumlaması gerektiği sözleşmede açık değildir. İki durumun kasıtlı ayrımı mevcut API ve tüketici beklentileriyle doğrulanmalıdır.

## Kanıtla doğrulanan mevcut davranış

### Batch worker akışı

- `runBatch` task wave'lerini `Promise.allSettled` ile tamamlar; son manifest güncellemesinde iptal isteği varsa `cancelled`, herhangi bir task `unknown` ise `unknown`, tüm task'lar yalnız `failed`/`cancelled` olup en az bir başarısızlık varsa `failed`, diğer bütün bileşimlerde `result_ready` yazar. Aynı güncellemede `endedAt` kaydedilir ve `parallel_batch_finish` metriği oluşturulur. Kaynak: `subagent-bridge/src/services/parallel-batch.js:1463-1517`.
- `result_ready` sonrasında entegrasyon hazırlığı yalnız en az bir edit task'ı varsa, tüm edit task'ları tamamlandıysa ve worktree manager mevcutsa çalışır; başarılı diff `ready_for_approval` durumuna taşınır. Salt-okunur batch'te bu koşul oluşmaz; durum `result_ready` kalır. Batch kontrol ve plan kayıtları `runBatch` sonunda temizlenir. Kaynak: `subagent-bridge/src/services/parallel-batch.js:1518-1600`.
- `getBatch` mevcut manifest özetini döndürür; salt-okunur `result_ready` için normal bir finalizer/acknowledgement geçişi yapmaz. Kaynak: `subagent-bridge/src/services/parallel-batch.js:1602-1646`.

### Durumların farklı tüketicilerdeki anlamı

- Registry `parallelBatchTerminalStatuses` kümesi yalnız `integrated`, `failed`, `cancelled` ve `unknown` içerir; `result_ready`, `ready_for_approval` ve `blocked` bu kümede değildir. Registry geçiş tablosu `result_ready` için entegrasyon, onay, başarısızlık, iptal ve blocked geçişlerine izin verir. Kaynak: `subagent-bridge/src/services/parallel-batch-registry.js:8-26`.
- Terminali farklı yorumlayan watcher kümesi `result_ready`, `ready_for_approval`, `integrated`, `blocked`, `failed`, `cancelled` ve `unknown` değerlerini içerir. Watcher bu değerlerde `Workers stopped` veya onay bekliyor mesajı gösterip izlemeyi bitirir. Kaynak: `scripts/watch-parallel-batch.js:7-8,74-79,108-122`.
- Public status enum'u `result_ready` ve diğer workflow aşamalarını içerir, fakat `completed` veya `partial` batch statülerini içermez. Kaynak: `subagent-bridge/src/schemas/parallel-batch-schema.js:5-31`.
- Metrics status allowlist'i ayrıca `completed` kabul eder; bunun batch status olarak üretilip üretilmediği, allowlist'te bulunmasından tek başına çıkarılamaz. Schema ile metrics sözleşmesi arasındaki bu olası drift açıkça karara bağlanmalıdır. Kaynak: `subagent-bridge/src/metrics.js:1628-1652`.
- MCP public yüzeyinde hazırlama, başlatma, durum, task detail ve iptal araçları vardır; edit entegrasyon onayı yalnız `ready_for_approval` içindir. Read-only sonuç için ayrı bir finalize/acknowledge aracı yoktur. Kaynak: `subagent-bridge/src/frontends/mcp/server.js:418-455`.
- Mevcut service testleri başarılı read-only task'ları `result_ready` durumunda bekliyor; ayrıca settled `result_ready`/`blocked` durumlarını explicit cancel ile `cancelled` yapma davranışını test ediyor. Bu testler worker'ın durduğunu doğrular, read-only batch'in lifecycle-terminal olup olmadığını tek başına tanımlamaz. Kaynak: `tests/parallel-batch.test.js:139-189,216-257`.
- 2026-10-12 uçtan uca denetimi, `result_ready`/`blocked` iptalinin terminal `cancelled` manifestine yazılmamasını ayrı bir kusur olarak düzeltmişti. Bu geçmiş düzeltme iptal yolunun kalıcılığını kanıtlar; `cancel` işleminin normal sonuç kapatma mekanizması olması gerektiğini kanıtlamaz. Kaynak: `docs/reports/V1_V2_UCTAN_UCA_DENETIM_2026-10-12.md:15-21`.

### Kullanıcı etkisi ve önem

15 Ekim read-only batch raporunda task sayacı iki tamamlandı, bir başarısız ve sıfır `unknown` olarak kaldı; `requirements` kullanılabilir sonuç üretmedi. Aynı session sorguları `result_ready` döndürdü. Olay dökümü: `../../artistik-efektler/context/parallel-batch-plan-incelemesi-2026-10-15.md`.

Mevcut kaynaklar, worker'ların `result_ready` durumunda çalışmaya devam ettiğini göstermiyor: task wave'leri sonuçlanıyor, `endedAt` ve finish metriği yazılıyor, watcher worker'ları durmuş sayıyor. Process-tree reaping ayrıca kaynak/test üzerinden doğrulanmalıdır; task promise'lerinin settle olması bunun tek başına kanıtı değildir. Bulguyu şimdilik **durum sözleşmesi tutarsızlığı adayı** olarak sınıflandır: consumer'lar execution-settled ve lifecycle-terminal kavramlarını karıştırabilir; bu kullanıcı/poller etkisi gerçek kabul kriterleriyle doğrulanmalıdır. Önem seviyesi önerisi orta, ancak gerçek arıza/yanlış bekleme kanıtı olmadan doğrulanmış runtime failure diye etiketlenmemelidir. `cancel_parallel_batch` çağrısını sonuç kapatmak için kullanmak iptal ile başarı/karma sonuç ayrımını bozar.

## Birincil dış kaynak araştırması

Bu kaynaklar genel state-machine tasarım karşılaştırmasıdır; yerel Bridge'in doğru statü adlarını veya kusurun önemini tek başına belirlemez.

- AWS Step Functions, “State machine structure in Amazon States Language for Step Functions workflows”: https://docs.aws.amazon.com/step-functions/latest/dg/statemachine-structure.html — erişim 2026-10-15 UTC. Belge execution'ın `Succeed`, `Fail` veya `End: true` terminal state'inde durduğunu açıkça tanımlar. Yerel tasarım için terminal workflow kapanışının açık ve belirlenebilir olmasını destekler; `result_ready` değerinin bizde hangi anlamı taşıması gerektiğini belirlemez. Erişilen sayfada yayın tarihi görünmüyordu.
- Temporal, “Workflow Execution overview”: https://docs.temporal.io/workflow-execution — erişim 2026-10-15 UTC. Belge workflow durumunu Open/Closed diye ayırır; Closed nedenleri arasında Completed, Cancelled ve Failed bulunur. Bir workflow'un Closed olması daha fazla ilerleyememesi anlamındadır. Yerel tasarım için çalışma aşaması ile kapanış durumunu ayıran açık sözleşme örneğidir; Bridge'in edit-onay modeline doğrudan eşdeğer değildir. Erişilen sayfada yayın tarihi görünmüyordu.
- Gemini 3.8 Flash'tan istenen kamu kaynak taraması `rate_limited` hatası verdi; kaynak listesi veya alıntı üretmedi. Yukarıdaki iki birincil sayfa ana orkestratör tarafından doğrudan açılıp kontrol edilmiştir; bu kontrol Gemini incelemesi diye sunulmamaktadır.
- DeepSeek Pro yerel reviewer çağrısı `review_scope_secret_detected` ile source delivery başlamadan durdu; bağımsız kod incelemesi sonucu yoktur. Güvenlik filtresi aşılmaya çalışılmadı ve çağrı tekrarlanmadı.
- GPT-6.1 Sol required review, bu plan ve kod/test kaynaklarını içeren kapsamı `review source scope rejected` / `high_entropy` ile reddetti; plan-only kapsam da aynı nedenle model çağrısından önce durdu. Ana orkestratör, Bridge classifier'ındaki `[A-Za-z0-9+/_=-]{32,}` aday taraması ve `entropy >= 4.2` eşiğini uygulayıp redakte sayımla beş adayın plan içindeki kaynak/dosya referansları satırlarında (40, 44, 152–154) olduğunu doğruladı (`subagent-bridge/src/memory.js:140-170`; retin uygulandığı yer `subagent-bridge/src/services/review-source-manifest.js:133-143`). Teşhis, ham adayları veya credential değerlerini raporlamaz; `high_entropy` eşleşmesi tek başına secret kanıtı değildir. Scanner testleri high-entropy fixture'ının provider dispatch öncesi reddini doğrular (`tests/review-source-manifest.test.js:525-561`). Bu olası false positive için kapsam tarayıcısını aşma veya review'ı yeniden deneme bu planın parçası değildir.

## Önerilen tasarım kararı

İki ayrı predicate ve lifecycle'ı açıkça modelleyen durumlar kullanılsın; belirsiz tek bir `isTerminal` listesi bütün tüketicilere uygulanmasın:

1. **Execution settlement:** Worker/task yürütmesinin bitip bitmediğini ifade eder. `queued`/`running` task varken settled değildir. `unknown`, bilinen başarı sayılmaz ve güvenli sonuç olarak kapanmış kabul edilmez. `result_ready` bu aşamada mevcut execution'ın bittiğini ifade edebilir.
2. **Workflow lifecycle outcome:** Sonuçların yayımlanması, edit onayı/entegrasyonu, açık iptal, başarısızlık ve belirsizlik dahil batch'in hangi kullanıcı/orkestrasyon aşamasında olduğunu ifade eder.

Tercih edilen seçenek, mevcut consumer kontratı public lifecycle-terminal sonuç gerektiriyorsa, salt-okunur ve entegrasyona girmeyen batch'ler için açık terminal outcome üretmektir. Önerilen adlandırma taslak olarak `completed` (bütün task'lar başarılı) ve `partial` (bütün task'lar çözümlenmiş, en az biri başarılı ve en az biri başarısız/blocked) biçimindedir. Bu adlar öneridir; Faz 0 sonuç matrisi ve API uyumluluk incelemesi tamamlanmadan kodlanmamalıdır.

### Taslak outcome önceliği

Bu matris karar taslağıdır; özellikle task-level cancellation, blocked ve mixed edit/read sonuçları Faz 0'da doğrulanıp kesinleştirilmelidir:

1. Açık batch cancellation intent varsa batch outcome `cancelled` olur; sırf task'lardan birinin iptali batch cancellation varsayılmaz.
2. Herhangi bir task `unknown` ise batch outcome `unknown` kalır; başarı/partial olarak kapatılmaz, unknown maliyet rezervi korunur.
3. Tüm task'lar `completed` ise read-only final outcome `completed` olur.
4. Tüm task'lar terminal ve biliniyor, en az bir task `completed`, diğerlerinden biri `failed`/`blocked` ise read-only final outcome `partial` olur.
5. Hiç task başarılı değil ve en az bir task `failed` ise `failed` adayıdır.
6. Hiçbir task `completed`/`failed` değil ve task'lar `blocked` ise `blocked` outcome'unun terminal mi yoksa yeni kullanıcı işlemi mi gerektirdiği API'nin resume/unblock kabiliyetine göre seçilir.
7. Batch-level cancel intent olmadan tekil task `cancelled` sonuçlarının `partial`, `failed` veya başka bir duruma etkisi açık kuralla belirlenir; `cancelled` task'ı otomatik olarak bütün batch iptali sayılmaz.

Bu matris `result_ready`'nin edit batch'indeki ara kullanımını ve edit/read-only task'ların bir batch'te birlikte bulunduğu durumu ayrıca ele almalıdır.

- Salt-okunur all-success batch, sonuçlar yayımlandığında `completed` terminaline geçer.
- Salt-okunur mixed-outcome batch, bütün task durumları biliniyorsa `partial` terminaline geçer; task bazlı başarı/başarısızlık ve detail'ler korunur.
- Hiç task başarılı değilse `failed` veya `blocked` ayrımı, fail reason/stop condition kurallarıyla belirlenir.
- Task/batch `unknown` varsa hiçbir başarı/partial statüsüne indirgenmez; bilinmeyen harcama ve task durumu korunur.
- Açık user cancellation `cancelled` olarak kalır. Sonuçları normal kapatma amacıyla cancel çağrısına ihtiyaç duyulmamalıdır.
- Edit batch'inde tüm edit task'ları başarılıysa mevcut `result_ready` → `ready_for_approval` → `integrated` akışı korunur. Kullanıcı onayı gerektiren aşama worker çalışıyor gibi gösterilmez. Mixed/fail edit sonucu entegrasyon diff'ine alınmamalı; task diff temizliği ve bütçe uzlaştırması korunmalıdır.
- Karma read-only/edit batch'inde read-only task başarısız veya blocked iken bütün edit task'larının başarılı olması halinde `ready_for_approval` üretmek için gereken koşul tanımlanmalıdır. Task contract'ında optional/advisory işareti yoksa güvenli varsayılan, bütün task'ları gerekli kabul etmek ve başarısız read-only task'ın integration approval'a etkisini açıkça karara bağlamaktır.
- `blocked` durumunun terminal sonuç mu, yoksa gerçekten çözülme/onay bekleyen lifecycle aşaması mı olduğu API'siz otomatik resume davranışı dikkate alınarak tasarım kapısında karara bağlanmalıdır.

`endedAt` mevcut akışta task execution sonuçlandığında yazılır; edit entegrasyonu bunun ardından sürebilir. Bu nedenle `endedAt`'ı workflow finalization zamanı gibi yorumlama. Yeni final status eklenirse `endedAt`'ın execution-end semantiği korunmalı; ayrı `finalizedAt` ekleme ihtiyacı tüm tüketiciler ve manifest versioning incelendikten sonra kararlaştırılmalıdır. Benzer şekilde `parallel_batch_finish` metriğinin execution-finish mi lifecycle-final mi olduğu tanımlanmalı; gerekiyorsa iki olay ayrıştırılmalıdır.

Alternatif düşük değişiklikli çözüm, yeni durum eklemeden `result_ready` değerini yalnız “execution settled / results available” diye resmileştirip public summary'ye açık `executionSettled`/`lifecycleStage` alanları eklemektir. Bu, watcher davranışıyla uyumludur; ancak genel batch kontratının istediği terminal workflow outcome'unu sağlamayabilir. Planlama sahibi, iki seçenek arasında uygulamadan önce şu gereksinimi doğrulamalıdır: salt-okunur sonuç batch'i public MCP yaşam döngüsünde ayrıca sonlandırılmalı mı, yoksa `result_ready` yeterli execution-terminali midir?

## Uygulama aşamaları

### Faz 0 — Semantik ve sonuç matrisi

- Her batch/task statüsü için `execution settled`, `poller stop`, `workflow terminal`, `human approval pending` ve `success` anlamlarını ayrı tanımla.
- Bütün task sonuç bileşimlerini (all-success, mixed, all-failed, blocked dependencies, partial cancellation, explicit cancellation, unknown) kapsayan karar matrisi oluştur.
- `completed` kelimesinin batch execution bitti anlamında mı yoksa her task başarılı anlamında mı kullanılacağını açıkça seç; `partial`/task count'larla örtüşmeyi çöz.
- `result_ready`'nin read-only ve edit batch'lerindeki mevcut çift rolünü açıkça ayır.

### Faz 1 — Tek status sözleşmesi ve uyumlu sınıflandırıcılar

- `parallel-batch-registry.js`, `parallel-batch.js`, `watch-parallel-batch.js`, MCP summary/schema ve metrics için aynı semantik tanımlarını merkezi bir modülde kullan.
- Lifecycle terminal, execution-settled, watcher-stop ve approval-pending kümelerini ayrı isimlendir; tüketicilerden belirsiz `terminal` listesini kaldır.
- Seçilen final read-only status(lar)ını strict schema enum'una, registry geçişlerine, `parallelBatchTerminalStatuses`/uygun helper'a, metrics allowlist'ine, public summary'ye ve watcher'a tutarlı ekle.
- `get_parallel_batch` summary'sinde resolved task sayaçlarını koru; mixed sonucu all-success göstermesin. Gerekliyse `executionState`/`outcome` projeksiyonu ekle ve izinli schema alanları dışına çıkma.
- MCP tool açıklamaları, watcher footer'ı ve dokümantasyon; `result_ready`, `ready_for_approval`, final outcome ve `unknown` farkını açıkça anlatmalı.

### Faz 2 — RunBatch finalization, edit/cancel ve recovery

- `runBatch` outcome mapping'i Faz 0 karar matrisine göre yap; task başarı/başarısızlık durumlarını değiştirmeden batch-level terminal sonucu türet.
- `endedAt` worker execution bitişini, yeni final status workflow outcome'unu temsil etsin; bu iki anlam birbirinin yerine geçmesin.
- Edit entegrasyonunda mevcut approval/diff hash, source HEAD, lock, atomic promotion ve ayrı approval kapıları korunmalı.
- `cancel_parallel_batch` yalnız açık cancellation intent'ini ifade etsin; finalized read-only outcome'u kullanıcı iptali gibi yeniden yazmaması için sözleşme ve test kararı ekle.
- Restart/recovery: eski `result_ready` v1 manifestleri salt-okunur okunabilir kalmalı. Eski kayıtları yalnız `endedAt` veya metrik var diye otomatik success/partial statüsüne çevirmeyin. Yeni sürüm gerekiyorsa migration explicitly versioned, idempotent ve workspace-bound olmalı.
- Bütçe reservation, known settlement, unknown reservation ve refunds mevcut tek settlement kurallarını korumalı; finalization maliyeti ikinci kez settle etmemeli.
- `Promise.allSettled`, task `endedAt` veya watcher çıkışı tek başına alt process tree'nin tamamen reaped olduğunu kanıtlamaz. İlgili adapter/process cleanup sözleşmeleri ve hata enjeksiyonlu process termination testleri doğrulanmadan “bütün child process'ler kapandı” kabulü yapılmamalıdır.

### Faz 3 — Regression ve consumer doğrulaması

- `parallel-batch.test.js`: bütün sonuç matrisini, all-read-only ve edit batch'lerini, mixed task sonuçlarını, task `unknown`, blocked dependency ve cancellation yarışlarını doğrula.
- `parallel-batch-registry` testleri: yalnız geçerli state transitions; terminal durumdan yasaklı transition yok; eski `result_ready` kaydı bozulmadan okunuyor.
- `mcp-parallel-batch.test.js`: public status schema ve strict summary alanlarını doğrula; task counts ve outcome projection eşleşsin.
- `watch-parallel-batch.test.js` veya ilgili watcher testleri: worker poller her execution-settled durumda çıkar; `ready_for_approval` kullanıcı onayını ayrı bildirir; `unknown` başarı gibi gösterilmez.
- Metrics tests: bütün üretilen batch status değerleri allowlist/schema ile tutarlı; bilinmeyen değerler sessiz başarıya dönüşmez.
- Her outcome matrisi fixture'ı başlangıç task statülerini, cancellation intent'ini, beklenen manifest/API status'unu, task sayaçlarını, bütçe alanlarını ve finish/finalization metric sayısını tam assertion'larla belirtmelidir.
- Sonuç retrieve, task detail TTL/authorization, duplicate start, cancel, edit approval/integration, recovery ve no-double-settlement regressions kapsansın.
- Mixed read/edit fixture'ı zorunlu read-only reviewer/analyst task'ı başarısızken edit diff'inin `ready_for_approval` durumuna geçip geçemeyeceğini seçilen policy'ye göre sınamalıdır; optional task semantiği seçilirse strict schema'da açıkça temsil edilmelidir.
- Process cleanup fixture'ları child exit, timeout, cancel ve descendant kill tamamlanmasını ayrı ayrı doğrulamalıdır; `Promise.allSettled` veya UI watcher return değeri tek başına process-tree assertion yerine kullanılmamalıdır.
- Gerekirse durum özeti/UI progress yüzdesi güncellensin; task-resolution yüzdesi ile batch lifecycle sonucu aynı alan olarak kullanılmasın.

### Faz 4 — Rollout ve kapanış

- Kod değişikliği sonrası `npm test`, `npm run verify`, `npm run verify:ci`, `npm run smoke`, `npm run drill` ve `git diff --check` çalıştırılsın; MCP sözleşmesi veya status schema değişiyorsa smoke zorunludur.
- Hata enjeksiyonlu read-only fixture: task'lar tamamlandığında `get_parallel_batch`/watcher state'i, task sonucu, `endedAt`, final status ve metric aynı matrise göre uyuşsun; provider çağrısı gerekmesin.
- Edit fixture: `ready_for_approval` kapısının erken kapanmaması, diff/approval hash ve `approve_parallel_integration` onayı olmadan kaynak workspace'e değişiklik uygulanmaması doğrulansın.
- Geçmiş `result_ready` manifestleri için migration/read compatibility fixture'ı geçmeden rollout kabul edilmesin.
- Canlı provider canary bu sözleşmenin birincil doğrulama yöntemi değildir; gerekirse ayrı task, cost cap ve kullanıcı onayı gerekir.

## Kabul ölçütleri

- Her batch status'un execution, outcome ve lifecycle anlamı dokümante edilmiş ve tek merkezden uygulanmıştır.
- Salt-okunur batch, task'ları sonuçlandığında kullanıcıya açıkça sonlanmış outcome verir veya public summary `executionSettled` olduğunu açıkça bildirir; hiçbir istemci bitmiş worker'ı indefinitely running diye yorumlamaz.
- Watcher, `get_parallel_batch`, MCP schema, registry transitions ve metrics aynı durum sözleşmesine uygundur.
- Task `unknown` hiçbir zaman başarılı/normal completed olarak sınıflandırılmaz; automatic retry veya integration yapılmaz.
- Mixed task batch'inde başarılı task'lar, başarısız task'lar ve detail erişimi ayrı kalır; genel status kayıpsız sonucu ifade eder.
- Read-only batch'i kapatmak için `cancel_parallel_batch` çağırmak gerekmez.
- Edit batch'i `ready_for_approval` ve açık integration approval gereksinimini korur; final status veya worker-stop kararı bu onayı atlatmaz.
- Eski v1 kayıtları fail-closed ve değişmeden okunur; yeni status'lar migration olmadan eski kayıtlara uydurulmaz.
- Final status yazımı task/batch bütçesini ikinci kez settle etmez; pending unknown reservation korunur.
- İlgili test, verify, smoke ve drill kapıları geçer; kod doğrulanmadan plan tamamlandı diye raporlanmaz.
- Status değişikliğinin gerçekten gerekli olduğu, review kapısında mevcut MCP/watch consumer kontratıyla gösterilmelidir; yalnız registry/watch status set'lerinin farklı olmasına dayanarak “worker hang” veya veri kaybı iddiası yapılmamalıdır.

## Riskler ve açık kararlar

- `result_ready`'nin watcher açısından worker-stop, registry açısından lifecycle-nonterminal olması kaynakla doğrulanmış farktır; bunun kusur olup olmadığı mevcut API beklentisine bağlıdır. Kullanıcıya yanlış bekleme/terminal sonucu verdiği ölçülebilir consumer örneği Faz 0'da ortaya konmalıdır.
- `completed` metrics allowlist'inde bulunması, bu statünün current batch API tarafından yazıldığına kanıt değildir; `partial` veya farklı bir status seçimi schema/metrics/ui uyumu gerektirir.
- Read-only sonuçları final yapmak, edit sonucu için kullanılan `result_ready`/`ready_for_approval` ayrımını bozabilir; runBatch branch'leri açıkça ayrılmalıdır.
- `blocked` ve partial cancellation için yeni final semantics, mevcut cancel behavior ve UI beklentileriyle karşılaştırılmalıdır.
- Status schema dışa açık sözleşmedir. Yeni enum değeri downstream MCP client'ları ve log/metrics tüketicilerinin strict parsing'ini etkileyebilir.
- DeepSeek reviewer başarısız olduğundan ikinci bir independent local code review mevcut değildir; Gemini rate-limit olduğundan Gemini web review sonucu yoktur. Kullanıcı özellikle bu iki sağlayıcıyı istedi; fallback review yapılmış gibi sunulmamıştır.
- GPT-6.1 Sol review da yüksek-entropi source-scope filtresinde durdu. Filtrenin uzun dosya yolu/kaynak referanslarını yakalaması ayrı bir araç doğruluğu/false-positive konusudur; bu batch lifecycle planının kapsamına alınmamış ve güvenlik filtresi gevşetilmemiştir.
- Kullanıcının sağladığı dış chatbot review'ı `CONDITIONAL` verdict verdi; yalnız plan belgesine eriştiğini ve yerel kod satırlarını bağımsız doğrulamadığını belirtti. Sonuç matrisi, mixed read/edit gate'i, `endedAt` semantiği, process-tree kanıtı ve deterministik test oracle'ı eleştirileri bu revizyona işlendi. AWS/Temporal kaynak kontrolü ana orkestratörün doğrudan web kontrolüdür; Gemini veya reviewer doğrulaması değildir.
- Yeni terminal enum'ları eklenmeden önce mevcut `result_ready` execution-settled semantiğinin yeterli olup olmadığı, `get_parallel_batch`/watcher kullanıcı sözleşmesiyle doğrulanmalıdır. Gerçek consumer hatası gösterilmezse daha düşük değişiklikli açık `executionSettled`/`lifecycleStage` projeksiyonu tercih edilebilir.
- AWS/Temporal belgeleri genel state-machine karşılaştırmasıdır; yerel severity/implementation kararını kanıtlamaz.

## Kullanıcı tarafından sağlanan CONDITIONAL review sonrası karar kapıları

Bu dış chatbot review'ı yalnız plan metnine eriştiğini, yerel kaynak ve testleri görmediğini açıkça belirtti. Verdict'i plan kalitesi önerisi olarak değerlendir; yerel kod kanıtı yerine kullanma. Review'ın önerdiği GO/NO-GO ayrımı plana şu şekilde işlenmiştir:

- **Faz 0 için GO önerisi:** durum consumer beklentisini, outcome matrisini, mixed edit/read politikasını, manifest/schema uyumluluğunu ve test oracle'larını kod yazmadan kesinleştir.
- **Faz 1–4 için NO-GO:** aşağıdaki kararlar ve yerel source/test doğrulaması tamamlanmadan state enum, registry transition, `runBatch` veya metrics değişikliği başlatma.

### Faz 0'da kapatılacak beş karar

1. **Public lifecycle sözleşmesi:** Mevcut MCP client, watcher ve `get_parallel_batch` tüketicilerinden hangisi `result_ready`'yi execution-settled, hangisi workflow-terminal sayıyor? Yanlış bekleme/yanlış terminal davranışına dair somut consumer örneği var mı? Yoksa yeni terminal status eklemek yerine ayrı `executionSettled`/`lifecycleStage` projeksiyonu yeterli mi?
2. **Cancellation ve unknown önceliği:** Kaynakta batch cancellation intent'i `unknown` task kontrolünden önce değerlendiriliyor (`parallel-batch.js:1485-1495`). Bu nedenle cancel ve unknown birlikteyse top-level status `cancelled` olurken task-level unknown ve unknown budget korunabilir. Karar; cancellation intent'ini, process liveness belirsizliğini ve nihai outcome'u ayrı gösterecek biçimde verilmelidir. Unknown durumunu kullanıcı iptal etti diye başarılı/normal sonuç sayma.
3. **Mixed read/edit integration gate:** `allEditTasksCompleted` yalnız edit task'larının `completed` olmasını kontrol ediyor (`parallel-batch.js:1518-1527`). Task contract schema'sında `optional`/`advisory` alanı bulunmuyor (`parallel-batch-schema.js:45-87`). Public summary bütün task statülerini ve `failedCount` değerini gösteriyor (`parallel-batch.js:650-716`); dolayısıyla edit diff'i otomatik uygulanmış olmaz, fakat başarısız read-only task `ready_for_approval` hazırlığını tek başına engellemiyor gibi görünüyor. Bu davranışın kabul edilebilirliği kullanıcı onay modeline bağlıdır. Güvenli varsayılan bütün task'ları gerekli kabul etmektir: zorunlu read-only task başarısız/blocked/cancelled/unknown ise edit diff'i `ready_for_approval` aşamasına ilerlememelidir. Optional task istenirse yeni strict schema alanı, semantiği ve testleri ayrıca kararlaştırılmalıdır.
4. **Manifest/MCP uyumluluğu:** Batch schema sürümü `1` ve current status enum'unda `completed`/`partial` yok (`parallel-batch-schema.js:3-20`). Yeni status eklemeden önce eski manifest okuma davranışı, strict client etkisi, version bump/migration gereği ve `get_parallel_batch` projeksiyonu belirlenmelidir. Eski `result_ready` kayıtları `endedAt` var diye otomatik başarıya dönüştürülmemelidir.
5. **Deterministik test oracle'ları:** Her task-status bileşimi için başlangıç manifesti, cancel intent'i, beklenen batch outcome, task counts, unknown reserve, `endedAt`/olası finalization timestamp'i ve finish/final metric sayısı net yazılmalıdır. `completed + failed`, `completed + blocked`, `cancel + unknown`, yalnız blocked, boş/invalid batch, finalization crash ve duplicate finalization en az bir kez kapsanmalıdır.

### Review kapsamı ve kanıt sınırı

- Reviewer `completed`/`partial` adlandırmasını ve tüm task-status kombinasyonlarını kesin onaylamadı; bunlar yalnız taslak seçeneklerdir. `partial`'ın task-level task summaries ile nasıl eşleşeceği ve tüm-failed/blocked sonuçlarının ayrımı Faz 0 kararında kapanmalıdır.
- Process-tree sonlanması `Promise.allSettled` veya watcher stop ile kanıtlanamaz. Alt process/descendant cleanup yalnız ilgili adapter lifecycle ve hata enjeksiyonlu testler incelendiğinde doğrulanabilir.
- AWS Step Functions ve Temporal kaynakları doğru genel state-machine karşılaştırmalarıdır; yerel kodun doğruluğuna kanıt değildir.
- Bu CONDITIONAL review ana Sol/Gemini/DeepSeek sonucu değildir. DeepSeek/Gemini/required Sol çağrılarının başarısızlıkları yukarıdaki bağımsız-review bölümünde kayıtlıdır.

### Üçüncü plan-only review ve ana orkestratör çapraz kontrolü

Kullanıcı tarafından sağlanan üçüncü dış chatbot review'ı `CONDITIONAL — Faz 0 GO / Faz 1–4 NO-GO` kararı verdi. Reviewer yalnız güncel plan dosyasını okuyabildiğini, yerel kod/test kaynaklarını doğrulayamadığını belirtti. Bu verdict planın tasarım kapılarına ilişkin danışmanlıktır; Sol review'ı veya bağımsız kod doğrulaması değildir.

Ana orkestratör, review'da öne çıkan iki iddiayı yerel kaynakta ayrıca kontrol etti:

- Cancellation/unknown önceliği iddiası doğru: `runBatch` status eşlemesinde `cancelRequestedAt`/`cancelRequested` önce `cancelled`, sonra `anyUnknown` `unknown` yapıyor (`parallel-batch.js:1485-1495`). Task-level unknown count ve `unknownReservedUsd` finish metriğinde tutuluyor (`:1500-1515`); buna rağmen top-level `cancelled` status'u yalnız status okuyucusuna unknown belirsizliğini göstermeyebilir. Faz 0 kararı, iki sinyali birlikte görünür tutmalı.
- Mixed read/edit iddiasının dar biçimi doğru: entegrasyon hazırlığına geçiş kontrolü `allEditTasksCompleted` ile yalnız edit task'larının durumuna bakıyor (`parallel-batch.js:1518-1527`). Strict task contract schema'sında `optional`/`advisory` niteliği yok (`parallel-batch-schema.js:45-87`). Bu yol ancak status `result_ready` ise ve edit task'ları tamamlandıysa `prepareIntegration` çağırır; read-only task hatasının etkisi explicit approval/summary aşamalarında görünür olabilir, fakat bu onun entegrasyon hazırlığını kesin olarak engellediğini göstermez. Fail-closed predicate'in gerekip gerekmediği Faz 0'da onay politikasıyla birlikte karara bağlanmalı.
- Reviewer'ın eski manifest, strict schema, recovery ve deterministik oracle bulguları hâlâ açık Faz 0/1 kararlarıdır; plan bunları uygulanmış çözüm olarak sunmaz.

Sonuç değişmedi: Faz 0 karar/kanıt çalışması için GO önerisi; status, mixed edit/read ve uyumluluk kararları ile gerçek test oracle'ları kapanmadan Faz 1–4 kodlamasına NO-GO.

### Son plan-only review kaydı (2026-10-15)

Kullanıcı tarafından sağlanan güncel bağımsız chatbot review'ı `CONDITIONAL — Faz 0 GO / Faz 1–4 NO-GO` verdict'i verdi. Review yalnız güncel plan ve önceki plan sürümlerini gördü; yerel kaynaklar ve testler erişilebilir olmadığından kod iddiaları bağımsız doğrulanmış değildir. Önceki beş engelin hiçbiri tamamen kapanmadı: üçü kısmen kapalı, manifest/schema/recovery ve kesin test oracle'ları açık. Faz 0 kapsamındaki karar/kanıt çalışmasının başlaması önerilir; bu karar kod uygulama izni değildir. Ana orkestratörün yerel kod çapraz kontrolleri bu dış review'dan ayrı kanıt olarak tutulur.

## Kaynaklar

- `subagent-bridge/src/services/parallel-batch.js:1463-1600,1602-1646,1662-1737`
- `subagent-bridge/src/services/parallel-batch.js:650-716` — task statüleri, failed count ve approval summary projection'ı.
- `subagent-bridge/src/services/parallel-batch-registry.js:8-26,39-40,102-109`
- `subagent-bridge/src/schemas/parallel-batch-schema.js:5-31`
- `subagent-bridge/src/metrics.js:1628-1652`
- `subagent-bridge/src/frontends/mcp/server.js:418-455`
- `scripts/watch-parallel-batch.js:7-8,35-80,97-129`
- `tests/parallel-batch.test.js:139-189,216-257`
- `docs/reports/V1_V2_UCTAN_UCA_DENETIM_2026-10-12.md:15-21` — settled status cancellation regression/fix history.
- `docs/reports/ORKESTRASYON_V2_KOK_NEDEN_ANALIZI_2026-10-06.md:29-31` — previous task Promise/registry terminal update reconciliation; distinct from this status-contract issue.
- Incident/task detail synthesis: `../../artistik-efektler/context/parallel-batch-plan-incelemesi-2026-10-15.md:58-107`.
- AWS Step Functions, “State machine structure in Amazon States Language for Step Functions workflows”: `https://docs.aws.amazon.com/step-functions/latest/dg/statemachine-structure.html` — accessed 2026-10-15 UTC; terminal state and execution stop definitions.
- Temporal, “Workflow Execution overview”: `https://docs.temporal.io/workflow-execution` — accessed 2026-10-15 UTC; Open/Closed execution and Closed outcomes. Publication date was not visible on the accessed page.
