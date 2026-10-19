# Paralel Görev Süreç Çıktısı Limiti Düzeltme Planı

Durum notu (2026-10-15, uygulama, araştırma ve canary): Kod değişikliği, yerel fixture/doğrulamalar ve 2048 host cap'li iki dosyalı ayrıntılı canlı canary tamamlandı. Read-only `parallel_batch` Codex/OpenCode çağrıları streaming JSONL reducer kullanıyor; ham byte muhasebesi, record/final-result scope tanıları, strict schema/runtime projeksiyonu, fixture'lar ve README güncellendi. OpenCode no-text result `empty_output` olarak ayrılır; read-only runtime mevcut attempt/cost budget'ları içinde en fazla bir retry yapar; reasoning hiçbir zaman final metne çevrilmez. `npm test` (964 toplam/960 geçti/4 platform skip), verify, verify:ci, smoke, drill, kontrollü DeepSeek Flash pilotu ve 128 MiB RSS kapılı üç-worker fixture'ı geçti. İnternet kaynakları OpenCode Go/DeepSeek reasoning-only semptomunu ve reasoning-token output cap tüketimini bildiriyor; başarısız eski turn'e ait raw SSE olmadığı için exact kök neden kanıtlanmadı. Önceki detaylı live task'lar 512/1024 output-token cap ile no-text oldu. İki dosyalı ayrıntılı canary 56.674 stdout byte kabul etti, reddedilen chunk ve dosya değişikliği olmadı; cost metric `$0.001895676` gösterdi (sağlayıcı faturası değildir). Bu, yeni davranışla ayrıntılı canlı çağrının başarılı olabildiğini gösterir; önceki başarısız task'ı geriye dönük değiştirmez.

Bağımsız GPT-6.1 Sol plan denetimi (2026-10-15): `CONDITIONAL`. Faz 0–3 uygulaması ile açık kalan üç eski görevin yeni batch canary'si farklı işlerdir. İki dosyalı canary, üç görevli canary'nin tamamlandığı anlamına gelmez. Sonraki iş üç eski görevin güncel kaynaklarla yeni batch planını hazırlamaktır; herhangi bir provider/batch çağrısı için ayrıca maliyet üst sınırı ve açık kullanıcı onayı gerekir. Sol denetimi yalnız plan dosyası kapsamındadır; kod, test ve çağrı kayıtlarını bağımsız doğrulamamıştır.

Revizyon sonrası GPT-6.1 Sol plan denetimi (2026-10-15): `APPROVE`, bulgu yok. Onay planın açıklığı ve kalan batch planının hazırlanması içindir; üç görevli canary'nin tamamlandığını veya ücretli provider çağrısına izin verildiğini göstermez. Provider/batch çağrısından önce exact route/model, etkin admission limitleri, çıktı sınırları, kapsam ve maliyet üst sınırı belirlenip kullanıcıdan ayrıca açık onay alınmalıdır.

Kullanıcı, kalan üç görevli salt-okunur canary için `$1.00` batch maliyet üst sınırını ve Sol onayı sonrası devam etmeyi onayladı (2026-10-15). Bu üst sınır yalnız bu canary kapsamındadır; yeni batch planı hazırlanıp exact görev/route/admission bilgileri doğrulanmadan provider çağrısı başlatılmış sayılmaz.

- Tarih: 2026-10-15 UTC
- Durum: Kod ve yerel doğrulamalar tamamlandı; iki dosyalı ayrıntılı OpenCode canary başarılı; üç eski görevin güncel kaynaklı batch canary'si bekliyor ve ayrı maliyet/onay kapısına bağlı
- Hazırlayan: Ana orkestratör

## Amaç

Paralel read-only görevlerde görülen `result_parse/output_limit` hatasının ham CLI çıktısı, collector byte muhasebesi ve nihai worker cevabı arasındaki sınırlarını netleştirmek; sınırlı process belleği ve fail-closed sonuç bütünlüğünü koruyarak tekrar denemeye hazır bir düzeltme tasarlamak.

## Karar özeti

- `maxOutputBytes`, modelin nihai cevabının değil child process stdout ve stderr birleşik akışının byte tavanıdır. Yanıtın sekiz kısa bulguyla sınırlandırılması JSONL/protokol/tool-event çıktısını aynı boyuta indirmez.
- Son batch'te task başına 65.536 byte tavanı kullanıldı. Üç görev de ham process çıktısı bu tavanı geçtiği için geçerli yanıtı ayrıştırmadan başarısız oldu.
- Mevcut varsayılan host process tavanı task başına 8 MiB'tır. 8 MiB kullanmak yeni bounded canary için geçici operasyonel seçimdir; tek başına kalıcı düzeltme değildir ve başarı garantisi vermez.
- Collector diagnostics'i daha doğru tanımlamalı: gözlenen toplam ilk limit-aşan chunk'ı içerir; saklanan stdout/stderr ölçümleri string'e UTF-8 dönüşümünden yeniden hesaplanır ve ham byte sayacının yerine geçmez.
- Kalıcı çözüm, batch read-only Codex/OpenCode JSONL akışını adapter'a özgü state machine ile satır satır indirgemek; final worker yanıtı ve gerekli terminal/error metadata dışında event payload'larını saklamamaktır. Ham process byte cap'i kalır; JSONL record ve final-result sınırları ayrı olur.
- Herhangi bir yeni provider/batch çağrısı yeni plan, maliyet üst sınırı ve ayrı kullanıcı onayı gerektirir. Bu plan kendiliğinden batch başlatmaz.

## Kanıt ve mevcut davranış

- Son batch `outputLimitBytes: 65536` ile üç `output_limit` sonucu verdi. `requirements`: gözlenen 70.276, saklanan stdout 251 ve stderr 4.489 byte. `architecture`: gözlenen 87.301, saklanan stdout 64.128 ve stderr 0 byte. `validation`: gözlenen 66.565, saklanan stdout 1.029 ve stderr 0 byte. Olay ve task kimlikleri `context/uygulama-oturumu-hata-raporu.md` içindedir.
- `runProcess.collect`, ham chunk'ın `length` değerini birleşik sayaçta artırır; sayaç limitten büyükse `outputBytesObserved` kaydedilir, chunk saklanmadan child process sonlandırılır ve promise reddedilir. Bu nedenle gözlenen sayı limitten bir chunk kadar büyük olabilir. Kaynak: `subagent-bridge/src/services/execution-service.js:125-135,158-180`.
- Adaptörler sadece saklanmış stdout/stderr buffer'larını hata string'lerine çevirir ve `Buffer.byteLength` ile ölçer. UTF-8 decode/re-encode, geçersiz veya chunk sonunda bölünmüş çok-byte'lı dizileri byte-exact koruma garantisi vermez. Kaynaklar: `subagent-bridge/src/adapters/opencode-adapter.js:148-158`, `subagent-bridge/src/adapters/codex-adapter.js:180-193`.
- Batch task limiti runtime'a ve adaptörlere aktarılır. Task limiti verilmediğinde host config varsayılanı 8 MiB'tır; config üst sınırı da 8 MiB'tır. Kaynaklar: `subagent-bridge/src/services/parallel-batch.js:505-507,1258`, `subagent-bridge/src/config.js:211,298-311`.
- OpenCode `--print-logs --format json`, Codex `exec --json` ile çalışır; process byte collector JSONL ayrıştırmasından önce uygulanır. Kaynaklar: `subagent-bridge/src/adapters/opencode-adapter.js:275-289,485-504,567-597`, `subagent-bridge/src/adapters/codex-adapter.js:195-217,299-400`.
- Matematiksel olarak gözlenen eksi saklanan sayaç toplamları sırasıyla 65.536, 23.173 ve 65.536 byte'tır. Bu değerler saklanan sayaçların ham byte'ları koruduğu durumda ilk reddedilen chunk boyutuyla eşleşir; UTF-8 dönüşüm caveat'i nedeniyle bunlar kesin ham chunk ölçümü değildir.
- İki read-only uzman incelemesi, kaynak akışının bu yorumu destekledi. Ham CLI içeriği kaydedilmediğinden hangi event'in veya provider içeriğinin çıktıyı büyüttüğü belirlenmiş değildir.
- OpenAI Codex `--json` belgesi stdout'u bütün JSONL olaylarının akışı olarak tanımlar; olay türleri command execution ve MCP tool call item'larını içerir. Sürüme sabitlenmiş Codex `exec_events.rs`, `CommandExecutionItem.aggregated_output` ve MCP content/structured content alanlarını tanımlar; JSONL emitter her olayı JSON olarak stdout'a yazar. Kaynaklar: `https://developers.openai.com/codex/non-interactive-mode/`; `https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/exec/src/exec_events.rs`; `https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/exec/src/event_processor_with_jsonl_output.rs`.
- OpenCode v1.19.0 `run --format json` source'u `tool_use` event'inde bütün `part` nesnesini, text ve step event'lerini JSON olarak stdout'a yazar. Bu, tool payload'larının final yanıt dışındaki process output'a girebildiğini gösterir. Kaynak: `https://github.com/anomalyco/opencode/blob/v1.19.0/packages/opencode/src/cli/cmd/run.ts`.
- Provider kaynakları son batch stdout hacminin tool/event payload'larından gelebileceği hipotezini güçlendirir; eski output içeriği saklanmadığından belirli bir event'i başarısız task'ların kesin nedeni diye atamak mümkün değildir.
- **OpenCode/DeepSeek boş yanıt araştırması (2026-10-15):** OpenCode upstream [#54324](https://github.com/anomalyco/opencode/issues/54324) tam aynı OpenCode Go/DeepSeek V4.1 Flash belirtisini (answer in `reasoning_content`, empty `content`) rapor ediyor; [#49673](https://github.com/anomalyco/opencode/issues/49673) benzer vakada başarılı SSE örneği yakaladı, ancak failure ile eşleşen raw SSE yoktu. İkisi de V1→V2 geçişinde kapatılmış/duplicate; çözüm olarak kapatılmadı. [#49282](https://github.com/anomalyco/opencode/issues/49282) output-token budget'ın reasoning ile tüketilerek subagent'a boş sonuç dönebildiğini rapor ediyor. [#51741](https://github.com/anomalyco/opencode/pull/51741) `finish_reason: length` + tamamen boş completion için görünür hata öneriyor, fakat PR açık/merge edilmemiş ve reasoning-only turn'ü kapsamadığını not ediyor. [#40531](https://github.com/anomalyco/opencode/pull/40531) / [#49061](https://github.com/anomalyco/opencode/pull/49061) bounded retry tasarımları da V2 geçişinde merge edilmedi. DeepSeek'in [API belgesi](https://api-docs.deepseek.com/api/create-chat-completion) thinking'in varsayılan açık/yüksek olabildiğini, `reasoning_effort: none` ile kapatılabildiğini, `max_tokens` üretim tavanı olduğunu ve `finish_reason: length`'ın kesilmeyi gösterdiğini belirtiyor. Public issue'lar tanıklık/aday açıklama niteliğinde; bizim eski turn'ün SSE kanıtı değiller.
- **Yerel çözüm kararı:** reasoning içeriği gizli düşünce zinciri olabileceğinden asla `text` diye geri döndürülmez. OpenCode geçerli JSONL tamamlayıp kullanılabilir `text` üretmezse `empty_output` failure olur; salt-okunur runtime mevcut bütçe içinde en fazla bir kez retry eder. İkinci deneme de boşsa görünür başarısızlık kalır. `edit` çağrıları `mutation_state_unknown` nedeniyle retry edilmez. Detailed canary task'larının max output cap'leri 512/1024, başarılı kısa canary'nin host tavanı 2048 idi; bu fark bir tetikleyici olabilir, fakat failed stream cap exhaustion mı yoksa gateway'in reasoning-only completion'ı mı transcript olmadan ayırt edilemez.
- Node.js v24.17 `StringDecoder` dokümanı çok-byte UTF-8 dizilerinin Buffer chunk'ları arasında bölünebileceğini ve decoder'ın bunları sonraki chunk'a kadar tuttuğunu belirtir. `stream` dokümanı `highWaterMark` değerini okumayı duraklatan eşik olarak tanımlar; kesin byte limiti değildir. Kaynaklar: `https://nodejs.org/download/release/v24.17.0/docs/api/string_decoder.html`; `https://nodejs.org/download/release/v24.17.0/docs/api/stream.html`.

## Hedef davranış

- Süreç çıktısı host tarafından sınırlı kalır; limit aşımında task `output_limit`, sonuç bütünlüğü `truncated`, görev tamamlanması `partial` olarak kalır. Kısmi JSON veya stdout başarılı yanıt sayılmaz.
- Limit teşhisi ham içerik veya provider transcript'i saklamadan ilk reddedilen chunk'ı ve o ana kadarki kabul edilen stdout/stderr byte'larını tam olarak açıklar.
- Process byte tavanı, model yanıtı/token tavanı ve batch summary sınırı ayrı sözleşmeler olarak raporlanır; biri diğerinin kanıtı sayılmaz.
- İlk deneme host'un 8 MiB task tavanını aşarsa fail-closed davranış değişmez ve yeni diagnostics hangi stream/chunk sınırının aşıldığını içerir.

## Önerilen uygulama fazları

### Faz 0 — Ham byte sözleşmesi

- `outputBytesObserved` alanını geriye dönük uyumlu biçimde “ilk limit-aşan chunk eklendikten sonraki birleşik sayaç snapshot'ı” olarak tanımla; bunu tam process output toplamı olarak belgeleme.
- Collector'da raw-byte `acceptedStdoutBytes`, `acceptedStderrBytes` ve `rejectedChunkBytes` sayaçlarını tut. `outputLimitScope: process` durumunda ilk aşımda `outputBytesObserved = acceptedStdoutBytes + acceptedStderrBytes + rejectedChunkBytes` invariant'ını koru; record/result sınırları kendi scope sayaçlarını kullansın.
- `outputLimitStream` ilk reddedilen chunk'ın stream'ini belirtmeye devam etsin. Ham çıktı içeriği diagnostics, metrics, task detail veya loglara eklenmesin.
- Collector callback'inde `settled` kontrolünü byte sayaçlarını değiştirmeden önce uygula; reject/kill başladıktan sonra gelen process data, ilk aşım snapshot'ını değiştirmesin.
- Yeni sayısal alanları strict schema ve runtime/adapter/batch detail allowlist'lerinden geçir. Mevcut `stdoutBytes`/`stderrBytes` alanlarının anlamını sessizce değiştirme; yeni ham sayaçları ayrı adlandır.

### Faz 1 — Provider'a özgü JSONL reducer

- `runProcess` için opt-in streaming consumer ekle; ilk kullanım yalnız read-only `caller: parallel_batch` yolunda olsun. Diğer adapter çağrıları ve edit akışı mevcut collector davranışını korusun.
- Streaming yolunda ham stdout/stderr chunk'ları süreç limit sayacından geçir, sonra ilgili provider reducer'ına ilet; tüm chunk'ları veya event nesnelerini dizi halinde biriktirme. Raw combined `maxProcessOutputBytes` tavanı her zaman etkin olsun.
- JSONL framing Buffer chunk sınırından bağımsız çalışsın; CRLF, satır bölünmesi, tek chunk'ta birden çok event, EOF'ta son satır ve UTF-8 karakter bölünmeleri test edilsin. `StringDecoder` veya eşdeğer byte-safe framing kullan.
- Her JSONL record için host-bounded `maxJsonlRecordBytes` belirle; bu sınır raw process cap'ini aşamaz. Record büyüklüğü aşıldığında içerik saklama ve kısmi event'i parse etmeye çalışma; redakte, ölçülebilir limit hatası ver.
- **Codex reducer:** mevcut davranışı koruyarak JSONL şekil doğruluğunu, son terminal event'i, terminal başarı/başarısızlığı, son boş olmayan `item.completed/agent_message` yanıtını ve allowlist'li rate-limit kodunu tut. `command_execution.aggregated_output`, reasoning, MCP/tool payload ve diğer item içeriklerini nihai yanıta taşımadan at.
- **OpenCode reducer:** mevcut davranışı koruyarak `text.part.text` parçalarını aynı sırada birleştir, son geçerli `step_finish` kullanım verisini ve terminal hata sınıfını tut. `tool_use` içindeki tam `part`, reasoning ve kullanılmayan event payload'larını at.
- Codex/OpenCode stdout terminal event'leri, non-zero exit, signal, structured rate limit, FreeTier/model erişim reddi, parse-invalid ve cancellation önceliklerini streaming sırasında state machine ile uygula. Ham stderr regex kontrolü gerekiyorsa bounded state kullan; eşleşme kanıtlanamazsa fail-closed generic process class'a düş, false-positive retry üretme.
- Reducer callback hatası process termination/settlement akışına tam bir kez bağlansın. Timeout, abort, stdin teslim hatası, process-tree kill ve cleanup semantiği değişmesin.
- Codex'in JSON dışı stdout'u final-message-only modu ve OpenCode'un default renderer'ı alternatif olabilir; ancak machine-readable terminal/rate-limit/usage/error sözleşmesine eşdeğerlik kanıtı yok. Ana çözümde JSONL korunsun; default-mode değişimi ayrı canary kararı olsun.

### Faz 2 — Üç ayrı çıktı sınırı

- `maxProcessOutputBytes`: stdout+stderr'in ham toplam byte tavanı. Sonraki batch için host'un mevcut 8 MiB bounded varsayılanı kullan; task başına 65.536 byte override'ı verme. Bu sınır token veya provider faturası değildir.
- `maxJsonlRecordBytes`: tek bir newline-delimited event'in parse buffer tavanı. İlk read-only rollout için host raw process tavanıyla aynı 8 MiB üst sınırı kullan; böylece yeni, daha düşük bir görev başarısızlık eşiği koymadan bir event'in bellekte tutulması bounded kalır. Record ve process cap'leri farklı ölçülür ve diagnostics'te hangi scope'un aşıldığı belirtilir.
- `maxFinalResultBytes`: reducer'ın sakladığı agent_message/final text tavanı. Parallel worker summary schema'sındaki 16.384 JavaScript-code-unit sınırının JSON serialized en kötü control-character temsilinde 98.304 byte üst sınırı vardır; status/action alanları ve envelope için payla başlangıç önerisi 128 KiB'tır. `Buffer.byteLength` ile gerçek final text sayılır; schema ve UTF-8/JSON escaping sınır fixture'ları bu değeri doğrulamalı. Aşım task'ı başarısız bırakılmalı ve diagnostics hangi limit scope'unun aşıldığını ayırmalı.
- Mevcut `maxSummaryCharacters` ve `maxBatchSummaryBytes` sınırları işlem sonrası summary/public batch projection içindir; bunlar raw process veya final provider message cap'inin yerine geçmez. İsimleri character/byte semantiğini korusun.
- OpenCode output-token capability'si host tarafından proven ise `maxOutputTokens` ayrıca kullan. Bu, JSONL içindeki tool result payload'larını sınırlamaz. Codex için belgelenmemiş/kanıtlanmamış token cap'i varsayma.
- İlk read-only canary için batch request `maxWorkers: 3` olsun ve effective provider-admission limitleri plan ön kontrolünde doğrulansın; mevcut policy örneğinde iki Codex slotu ve bir `opencode:deepseek` slotu vardır. Her worker'ın retained record/result byte bütçesi en çok 8 MiB + 128 KiB; üç worker toplamda en çok 24.375 MiB bounded line/result verisi tutabilir. `JSON.parse` nesne allocation'ı bu aritmetiğe dahil değildir.
- Windows target Node runtime'ında `maxWorkers: 3` ile üç concurrent reducer'ın record-buffer-only stress fixture'ı 8 MiB record boyutunu sınasın; ayrı concurrent process fixture'ında her task'ın büyük JSONL event'i ve 128 KiB final result'ı birlikte 8 MiB raw process sınırının altında kalsın. Parent process peak RSS delta 128 MiB'ı aşarsa rollout durmalı; process/record sınırı veya concurrent reducer sayısı azaltılıp ölçüm tekrarlanmalıdır. Bu değer ilk Windows host canary bütçesidir, her makine için bellek garantisi değildir. Beş worker'a genişletme ayrı ölçüm gerektirir.
- `highWaterMark` değerini hard memory cap gibi kabul etme; raw byte sayacı, record/final limitleri, concurrency admission ve peak RSS stresi birlikte host kapısıdır.

### Faz 3 — Sentetik doğrulama ve kontrollü batch

- Fixture'larda Codex `command_execution.aggregated_output` ve OpenCode büyük `tool_use.part` event payload'ları üret; process JSONL toplamı 65.536 byte'ı geçerken final mesaj küçük ve terminal event başarılıysa, raw event text'i saklamadan başarılı sonuç alınmalı.
- Reducer testleri event sırası/terminal seçimini mevcut toplu parser ile differential fixture üzerinden karşılaştırmalı; `turn.completed`/`turn.failed`, OpenCode birden çok text parçası ve son usage semantiği değişmemeli.
- Record cap, final-result cap ve process cap ayrı ayrı sınırda/aşım fixture'larıyla doğrulansın. Cap aşımında partial output hiçbir zaman başarı sayılmasın.
- Structured rate-limit, FreeTier/model access denial, non-zero exit, parse-invalid, stdout/stderr chunk-boundary matcher, UTF-8 bölünmesi, post-terminal event, abort/timeout ve descendant termination regresyonları kapsansın.
- Artifact/detail, metrics ve log katmanlarına yalnız terminal sınıf, final bounded result ve byte sayaçları taşınsın; tool event raw content'i, prompt veya source file contents taşınmasın.
- Kod ve fixture kapıları geçtikten sonra üç eski task'ın güncel, doğru kaynak listeli sürümü için `maxWorkers: 3` olan yeni batch planı hazırla. Önceki planı/batch'i yeniden kullanma. Her görev exact route/model, yalnız atanmış readable snapshot'ları, host 8 MiB process tavanı ve final-result limiti kullansın. Yalnız read-only `empty_output` için runtime en fazla bir bütçeli retry yapabilir; diğer hata sınıfları no-retry kalır. OpenCode capability gate kapalıysa rota/model değiştirme veya fallback yapma; yeni planı başlatma. Bu üç task'lı canary, başarıyla tamamlanan iki dosyalı ayrıntılı canary'den ayrıdır.
- Yeni provider çağrısı için çağrı kapsamı ve maliyet üst sınırı ayrı gösterilmeli; kullanıcının yeni ve açık başlatma onayı olmadan batch başlamamalı.
- Sonuçta task detail, model/route, limit scope, process/event/result byte sayaçları, `outputIntegrity`, `taskCompletion`, exit code ve batch terminal durumunu karşılaştır. Başarısız task'ı başarılı sayma veya rapor metninden eksik agent analizi üretme.

## Kabul ölçütleri

- Sentetik overflow fixture'ında eşitlik doğru: kabul edilen stdout + kabul edilen stderr + reddedilen chunk = ilk aşım anındaki `outputBytesObserved`.
- Limit ile tam eşit ham process çıktısı kabul edilir; sonraki byte/chunk process limit aşımıdır. JSONL record ve final result cap'leri bağımsız sınanır; hiçbir kısmi yanıt başarı olarak dönmez.
- UTF-8 decode/re-encode ham byte sayaçlarını etkilemez; post-settlement data önceki diagnostics snapshot'ını değiştirmez.
- Büyük Codex/OpenCode tool-event payload'ları stream reducer'dan geçerken task sonuç/artifact/metrics/loglarına sızmaz; kısa final message ve doğru terminal/usage/error metadata korunur.
- Üç concurrent Windows fixture'ında `maxJsonlRecordBytes` ve `maxProcessOutputBytes` 8 MiB, `maxFinalResultBytes` 128 KiB sınırları korunur; process, reducer-only record ve concurrent record-plus-final fixtures ayrı ölçülür, parent RSS artışı 128 MiB'ı aşmaz. Aşım rollout'u kapatır.
- Ham içerik hiçbir diagnostics/schema/metric/task detail alanına girmez; byte sayaçları strict schema ve allowlist'ten geçer.
- Task override verilmediğinde host process cap'i task'a aktarılır; task daha yüksek cap vererek host tavanını aşamaz.
- Codex ve OpenCode streaming reducer testleri, runtime/batch detail round-trip testleri, `npm test`, `npm run verify`, `npm run verify:ci`, `npm run drill` ve MCP şema/çıktı sözleşmesi değişmişse `npm run smoke` geçer. Ortak process collector/DeepSeek davranışı değiştiyse kontrollü `npm run pilot` ayrıca çalıştırılır; ücretli çağrı için o turda ayrı açık kullanıcı onayı gerekir.
- Provider batch sonucu ancak ayrı onaylı canary tamamlandığında raporlanır. Planın veya sentetik testlerin geçmesi canlı model çağrısının başarılı olduğunu kanıtlamaz.

## Kapsam dışı

- Model, sağlayıcı, görev rotası veya workspace erişim izinlerini değiştirmek.
- JSONL/tool output içeriğini loglamak veya tam transcript saklamak.
- Çıktıyı sessizce kırpmak, reasoning'i final yanıt gibi kullanmak, eksik JSON'u onarmadan kabul etmek veya `output_limit` hatasını gizlemek.
- Yeni plan onayı olmadan provider çağrısı, paralel batch, pilot, kod terfisi, commit veya push.
- Ölçülmemiş token/maliyet/performans kazancı iddiası.

## Riskler ve açık kararlar

- Tarihsel kanıt sınırı: İlk output-limit olayında ilk reddedilen chunk'tan sonra süreçte başka çıktılar üretilecek miydi bilinmiyor; o kayıttaki `outputBytesObserved` tam process toplamı değildir. Güncel collector ayrıca ham kabul/red byte sayaçlarını tutar.
- Tarihsel kanıt sınırı: Provider kaynakları tool/event payload'larının JSONL stdout'a girebildiğini kanıtlıyor; ancak eski batch'in hangi tool event'ini çalıştırdığı ve her event'in byte hacmi saklanmadı. Bu nedenle belirli event payload'ı tarihsel task'ların kesin nedeni değildir.
- Bekleyen canary riski: Host'un 8 MiB process cap'i üç eski görevin tamamlanacağını garanti etmez. Üç task'lı güncel kaynak canary'si henüz yapılmadı; bu adım ayrıca plan ve maliyet/onay kapısı gerektirir.
- Ölçüm kapsamı riski: `maxJsonlRecordBytes` ve `maxProcessOutputBytes` için 8 MiB üst sınırı ve 128 MiB RSS stres kapısı hedef Windows/Node fixture'larında doğrulandı; tek event'in JSON.parse working set'i daha büyük olabilir. Bu ölçüm diğer makineler için genel bellek garantisi değildir.
- Sınır kanıtı: 128 KiB final-result sınırı `.max(16384)` worker summary char schema'sı ve envelope payından türetildi; ilgili sınır fixture'ları uygulama doğrulamasında geçti. Bu, farklı runtime veya tüm host'lar için genel bellek garantisi vermez.
- Ölçüm kapsamı riski: 24.375 MiB retained record/final buffer hesabı üç eşzamanlı worker içindir ve JSON.parse nesne tahsisini içermez; 128 MiB RSS stres kapısı hedef Windows fixture'ında geçti, düşük bellekli host'lara genellenemez.
- Kapanan uygulama riski: Streaming reducer tamamlanmış stdout/stderr metnine dayalı önceki classifier akışını state machine'e taşıdı; ilgili rate-limit/model-access, process error ve terminal event fixture'ları geçti. Bilinmeyen yeni provider event türleri yine generic fail-closed hata verebilir.
- Tasarım kararı: Codex plain-text `exec` modu veya OpenCode default renderer seçilmedi; JSONL terminal/usage/tool-event sözleşmesini koruyor. Diğer formatlar JSON event sözleşmesine eşdeğer kabul edilmiyor.
- Bilinen sınır: OpenAI `--output-schema` veya OpenCode output-token cap'i final model cevabını kısıtlayabilir; tool event payload hacmini sınırlamaz ve raw process cap'in yerine geçmez.

## İlgili kaynaklar

- Olay ve yeni batch ölçümleri: `../../artistik-efektler/context/uygulama-oturumu-hata-raporu.md`.
- `subagent-bridge/src/services/execution-service.js`: birleşik byte sayacı, ilk aşım, buffer ve process termination akışı.
- `subagent-bridge/src/adapters/opencode-adapter.js`, `subagent-bridge/src/adapters/codex-adapter.js`: process invocation, JSONL parsing ve diagnostics.
- `subagent-bridge/src/runtime/bridge-runtime.js`: output integrity/task completion projeksiyonu.
- `subagent-bridge/src/services/parallel-batch.js`, `subagent-bridge/src/config.js`: task/host output byte cap aktarımı ve sınırları.
- `config/policy.json:430-438,454-462`: varsayılan provider admission ve batch concurrency değerleri; canlı/kişisel config'te etkin limit yeni plan ön kontrolünde ayrıca doğrulanır.
- İlgili testler: `tests/faz-3-codex.test.js`, `tests/faz-3-opencode.test.js`, `tests/faz-p0-runtime.test.js`, `tests/parallel-batch.test.js`.
- OpenAI, “Non-interactive mode”: `https://developers.openai.com/codex/non-interactive-mode/`. `codex exec --json` stdout'unda JSONL event'leri ve item türleri; `--output-schema`/final output seçenekleri. Sayfada yayın tarihi görünmüyordu; erişim 2026-10-15 UTC.
- OpenAI Codex CLI v0.162.1, `exec_events.rs`: `https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/exec/src/exec_events.rs`. `CommandExecutionItem.aggregated_output`, MCP tool result content ve agent message item şeması; erişim 2026-10-15 UTC.
- OpenAI Codex CLI v0.162.1, `event_processor_with_jsonl_output.rs`: `https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/exec/src/event_processor_with_jsonl_output.rs`. Her JSONL event'in stdout'a serialize edilmesi; erişim 2026-10-15 UTC.
- OpenCode CLI v1.19.0, `run.ts`: `https://github.com/anomalyco/opencode/blob/v1.19.0/packages/opencode/src/cli/cmd/run.ts`. JSON mode'da event type ve `part` payload'ının stdout'a yazılması; erişim 2026-10-15 UTC.
- OpenCode CLI v1.19.0, `run/tool.ts`: `https://github.com/anomalyco/opencode/blob/v1.19.0/packages/opencode/src/cli/cmd/run/tool.ts`. Default text renderer'ın read/glob/grep/list tool output'larını gösterimden dışlama kuralları; bu alternatif machine-readable JSON sözleşmesine eşdeğer değildir; erişim 2026-10-15 UTC.
- Node.js v24.17.0 `StringDecoder`: `https://nodejs.org/download/release/v24.17.0/docs/api/string_decoder.html`. Çok-byte karakterlerin Buffer chunk sınırlarında korunması; erişim 2026-10-15 UTC.
- Node.js v24.17.0 `stream`: `https://nodejs.org/download/release/v24.17.0/docs/api/stream.html`. `highWaterMark` bir duraklatma eşiğidir, kesin memory/byte cap değildir; erişim 2026-10-15 UTC.
