# Subagent Failure Root-Cause And Architecture Review

Tarih: 2026-10-08 UTC
Durum: incelendi
Amaç: Subagent hatalarının prompt/girdi, Orkestrasyon Bridge'i, sağlayıcı veya Windows sandbox kaynaklı olup olmadığını eldeki kanıtla ayırmak ve tekrarını azaltacak mimari öncelikleri belirlemek.
Kapsam: Kullanıcının sağladığı OpenCode session'ına ait redakte araç metadata'sı, Orkestrasyon Bridge kaynak kodu, kurulu CLI yardım çıktıları ve Windows/Node/libuv process belgeleri.
Kapsam dışı: NORN uygulamasının kodu, ham prompt/transcript incelemesi, canlı sağlayıcı çağrısı, sandbox bypass'ı ve kod değişikliği.
Hazırlayan: Ana orkestratör
Doğrulayan: Ana orkestratör; Microsoft, Node.js ve libuv kaynakları

## Uygulama takibi (2026-10-10)

İlgili uygulama planı `docs/plans/yapilanlar/SUBAGENT_PROCESS_TRANSPORT_VE_GOREV_GUVENILIRLIGI_PLANI_2026-10-09.md` altındadır. Faz 0-3 uygulandı; Antigravity explicit source review transport'u desteklemediğinden bu model için host kaynak manifestli inceleme çağrısı provider başlamadan reddedilir. Genel trusted-workspace read probe'u açık opt-in ile çalıştırıldı ve aşağıdaki canlı sonuçta kayıtlıdır.

2026-10-10 doğrulama kaydı: Windows tam `npm test` 907 testte 903 geçti, 4 POSIX'e özgü test atlandı ve 0 başarısızlık verdi. Sonrasında `npm run verify`, `npm run verify:ci`, `npm run smoke`, `npm run drill` (9/9) ve `git diff --check` geçti. Kullanıcı onaylı DeepSeek Pro synthetic MCP pilotu tek adapter attempt'te tamamlandı; Bridge-reported tutar `$0.010738552` olup sağlayıcı faturası değildir. Bu pilot ve provider-free fixture'lar modelin kaynakları semantik olarak doğru incelediğini kanıtlamaz.

## Yönetici Özeti

Gözlenen hatalar tek bir nedene bağlı değildir. Bir Codex Sol 6 çağrısındaki `ENAMETOOLONG` için 39.001 karakterlik prompt ve Bridge'in promptu process argv'sine koyması Windows komut satırı sınırını güçlü biçimde işaret eder. Bu, büyük bağlamın tetiklediği bir Bridge taşıma kusurudur; NORN kod kusuruna kanıt değildir. Tam argv ölçülmediğinden doğrudan hata nedeni kesinleştirilmemiştir.

Sol workspace okuyamama mesajları Windows sandbox helper yenileme ve Node kernel reset durumlarıdır; bunlar kod denetimi verdict'i değildir. DeepSeek `process_exit` çağrılarında exit code vardır, fakat stderr/providerCode/failure stage yoktur; kök neden belirlenememiştir. Gemini `web_evidence_invalid` ise Bridge'in `result_parse` aşamasında web kanıtı taşıyıcısını reddettiğini doğrular; hatalı şekli kimin ürettiği ham yanıt olmadan bilinmez.

Öncelikli mimari değişiklik, provider promptlarını argv'den çıkarmak, Windows komut satırı bütçesini provider dispatch öncesinde denetlemek ve “process çalıştı” durumunu “istenen inceleme tamamlandı” durumundan ayırmaktır. Bu rapor öneri kaydıdır; kod değişikliği veya canlı sağlayıcı erişim onayı değildir.

## Kanıt Ve Bulgular

### HYPOTHESIS: Codex Sol 6 ENAMETOOLONG hatasını uzun prompt/argv sınırı tetikledi

Kanıt:

- Session metadata'sında başarısız Codex Sol 6 çağrısının prompt uzunluğu 39.001 karakter, hata sınıfı `ENAMETOOLONG`/`uv_spawn` olarak kayıtlıdır. Ham prompt rapora alınmamıştır.
- `subagent-bridge/src/adapters/codex-adapter.js:75-100` `prependExecutionMetadata(request.prompt, ...)` değerini Codex komutunun son argv öğesi yapar; `:183-194` bu argv dizisini `runProcess`'e verir.
- `subagent-bridge/src/services/execution-service.js:30-44` process'i `spawn(executable, args, { shell: false })` ile başlatır.
- Microsoft `CreateProcessW` belgesi `lpCommandLine` için sonlandırıcı null dahil 32.767 karakter sınırını belirtir. libuv belgesi Windows'ta argv dizisinin CreateProcess'e aktarılırken command-line string'e birleştirildiğini açıklar.

Doğrulanan olgular:

- Promptun 39.001 karakter olması Windows `CreateProcessW` limitini tek başına aşar; metadata prefix'i de argv'ye eklenir. Bridge'in promptu argüman olarak taşıdığı ve bu giriş için uzunluk preflight'ı olmadığı kaynakta doğrulanmıştır.
- Aynı çağrı NORN kodunun çalıştırıldığına veya NORN davranışının hataya sebep olduğuna kanıt değildir.

Kalan belirsizlik ve doğrulama:

- Hata, tam oluşturulmuş argv uzunluğunu veya OS çağrısında reddedilen alanı kaydetmediği için `ENAMETOOLONG`'un prompt argümanından geldiği kesin kanıtlanmış değildir. Ölçülen prompt boyutu ile çalışma alanı yolunun tool input'unda olmaması bu hipotezi güçlü kılar.
- Doğrulama: provider çağrısı yapmadan Windows'ta sentetik 39k promptla mevcut argv yolunu ve Codex stdin yolunu karşılaştır; ayrıca komut satırı uzunluğu ile `spawn` hata kodunu redakte metadata'da ölç.

### VERIFIED: Sol'un workspace erişim başarısızlığı raporları kaynak denetimi verdict'i değildir

Kanıt:

- GPT-6.1 Sol sonuçlarında Windows sandbox helper yenileme hatası ve Node kernel reset mesajları vardır. Bazı Bridge çağrıları `ok: true` olsa da dönen model metni dosyaların okunamadığını açıkça belirtmiştir.
- Aynı Sol mesajlarının prompt ölçümleri yaklaşık 1,173–2,162 karakter aralığındadır; 39,001 karakterlik argv vakasıyla karıştırılmamalıdır.

Etkisi:

- Bridge çağrısının teknik olarak yanıt döndürmesi workspace içeriğinin okunduğunu göstermez. Bu yanıtlar `review_unavailable` veya eşdeğer “inceleme yapılmadı” durumu olarak raporlanmalı; `APPROVE` ya da kod bulgusu sayılmamalıdır.
- Dönen model metni Windows sandbox helper yenileme veya Node kernel reset hatası bildiriyor; kaynak dosyaların okunmadığını da belirtiyor. Bu, denetimin yapılamadığını doğrular. Model metninden OS/helper root cause'u bağımsız olarak doğrulanmış sayılmaz; elde bulunan metadata NORN kodunu veya içerik promptunu neden olarak göstermemektedir.

### VERIFIED: DeepSeek process exit ve Gemini web evidence retleri farklı hata sınıflarıdır

- DeepSeek Pro için iki çağrıda `process_exit`, exit code 1 kaydedilmiştir. Promptlar 1,575 ve 1,061 karakterdir. stderr, providerCode veya failureStage bulunmadığından prompt, Bridge süreci ve sağlayıcı arasında kök neden seçilemez.
- `subagent-bridge/src/deepseek.js:139-146` runtime failure'ı da `structured output validation failed: <class>` metnine dönüştürür. `process_exit` durumunda bu metin bir şema/JSON hatası kanıtı değildir; operasyonel hata mesajı ile parse/validation mesajı ayrıştırılmalıdır.
- Gemini Pro'da 5 çağrının 1'i, Gemini Flash 3.8'de 5 çağrının 2'si `web_evidence_invalid`/`result_parse` ile reddedilmiştir. `subagent-bridge/src/runtime/bridge-runtime.js:713-739` provider dönüşündeki web evidence carrier'ını doğrulayamadığında bu sınıfı üretir. Ham carrier kaydı olmadığından eksik alanın prompt, model biçimi veya adapter davranışından hangisiyle üretildiği bilinmemektedir.

### VERIFIED: Diğer sağlayıcı hataları

- DeepSeek Flash için 2026-09-29 tarihli tek çağrı `auth_invalid`/exit code 1 ile bitmiştir. Bu, auth hatası sınıfıdır; prompt veya NORN kodu kaynaklı olduğuna kanıt yoktur. Güncel `check_deepseek_subagent` Pro ve Flash'ı available bildirmiştir; bu yalnızca bugünkü health bilgisidir, tarihsel auth kök nedenini açıklamaz.
- Sol 6 için bir başka çağrı exit code 1 ile sonuçlanmıştır; kayıt daha ayrıntılı provider/process tanısı içermemektedir.
- Sol 6.1'de bir çağrının ilk attempt'i `rate_limited`, retry'si `process_exit` olmuştur. Retry ilk geçici hataya uygundur; ikinci süreç hatasının nedeni ölçümlenmemiştir.
- Gemini health kontrolü CLI'ın kurulu olduğunu gösterir; `authValid`, modelAccess ve workspaceRead probeleri yapılmadığından mevcut Gemini erişimi hakkında kesin hüküm vermez.

## Çelişkiler Ve Belirsizlikler

- `ENAMETOOLONG` kaydı prompt uzunluğunu gösterir ama tam argv uzunluğu, executable path uzunluğu ve OS error object'in ayrıntıları bulunmamaktadır. Prompt sınırı kök neden için güçlü hipotezdir, kesin teşhis değildir.
- `process_exit`/exit 1 kaydında stderr/providerCode/failureStage yoksa prompt kusuru, sağlayıcı reddi, executable kapanması ve adapter hatası ayırt edilemez.
- `web_evidence_invalid` host doğrulamasının başarısız olduğunu kanıtlar; reddedilen ham alanı saklamadığından model/prompt/adapter kökenini belirlemez.
- Session'daki model yanıtlarının “workspace okunamadı” demesi içerik evidence'ıdır; process ve sandbox logları olmadan helper/kernel root cause'u tamamen doğrulanmış olmaz.

## Riskler Ve Güvenlik Sınırları

- Komut satırı limiti aşılırken promptu kesip sessizce devam etmek yanlış veya eksik denetim sonucu üretebilir. Limit aşımı çağrı öncesi görünür biçimde reddedilmelidir.
- Sandbox/permission hatasını gidermek için `--dangerously-bypass-approvals-and-sandbox` veya benzeri bypass kullanılmamalıdır.
- Ham prompt, stdout/stderr, transcript, session ID ve workspace yolu kalıcı hata metriğine eklenmemelidir. Hata ayrımı için allowlist'li error code, exit code, signal, failure stage, byte bucket ve prompt uzunluk kovası yeterli olmalıdır.
- `REVISIONS REQUIRED` benzeri model metni, dosya erişim kanıtı başarısızsa teknik verdict sayılmamalıdır.

## Öneriler Ve Açık Sorular

### P0: Provider'a özgü prompt taşıma stratejisi

1. Process çağrısı için `argv`, `stdin`, `file_attachment` veya `http_api` taşıma stratejisi tanımla; her adapter desteklediği kanalı açıkça bildirsin.
2. Codex CLI'nin yerel `codex exec --help` çıktısı `[PROMPT]` yerine `-` kullanıldığında promptun stdin'den okunabildiğini doğruluyor. Codex adapter'da promptu stdin'e taşı; argv'de yalnız sabit kontrol argümanlarını tut. `runProcess` stdin yazımını zaten destekliyor (`subagent-bridge/src/services/execution-service.js:135-138`).
3. Yerel OpenCode `run --help` positional `message` ve `--file` seçeneği sunuyor, doğrudan stdin prompt seçeneği göstermiyor. OpenCode için dosya eki veya server API yaklaşımını sağlayıcı semantiğini doğrulayan ayrı prototip/test olmadan seçme.
4. Fallback olarak platforma göre hesaplanan command-line bütçesi ekle. Limit aşımında provider'ı hiç başlatmadan `prompt_transport_limit` benzeri sınıf döndür; promptu sessizce kesme.

Kabul kriterleri:

- Windows testinde 39k karakterli sentetik Codex promptu stdin ile aktarılır ve process argv bütçesini aşmaz.
- OpenCode uzun prompt taşıması test edilir; temp/attachment dosyaları başarı, hata, timeout ve cancel yollarında temizlenir.
- Sınır aşımı, process spawn hatası ile model yanıtı hatasını ayrı sınıflandırır; prompt içeriği loglanmaz.

### P1: Capability preflight ve görev sonucu durumu

- Uzun veya yüksek değerli denetimden önce model erişimi, araçsız yanıt ve workspaceRead capability'lerini ayrı ölç. `not_probed` veya sandbox setup hatasını `available` kabul etme.
- Windows workspaceRead ön kontrolünü kısa prompt ve sabit, zararsız sentinel dosyayla çalıştır. Probe başarısızsa kaynak içeriğine dayalı review başlatma; kullanıcıya erişim kısıtını bildir.
- Subagent dönüşünde `invocationStatus`, `workspaceReadStatus`, `taskStatus` ve `evidenceStatus` gibi ayrılmış durumlar kullan. Provider process'in sıfır kodla çıkması, review'un dosya okuyup tamamlandığını tek başına göstermesin.
- Stale sandbox/helper durumu için otomatik bypass değil, kısa ve sınırlı yeniden başlatma/probe yolu tanımla; izin veya auth hatasını kör retry etme.

### P1: Hata taksonomisi ve güvenli tanılama

- Hataları en az `process_spawn`, `sandbox_setup`, `workspace_read`, `provider_auth`, `provider_rate_limit`, `provider_process_exit`, `result_parse`, `schema_invalid` ve `evidence_invalid` olarak ayır.
- Her attempt için güvenli metadata: `failureStage`, OS `error.code` allowlist'i, exit code, signal, providerCode, retry kararı, prompt byte/UTF-16 uzunluk kovası, stdout/stderr byte kovası ve model ID. Ham içerik saklama.
- `deepseek.js` runtime/process hatası için şema invalidmiş gibi genel mesaj oluşturmamalı; process exit ve başarılı process'ten gelen schema-invalid response ayrı gösterilmeli.
- `web_evidence_invalid` için `carrier_missing`, `carrier_shape_invalid`, `excerpt_invalid` gibi güvenli alt sınıfları attempt metadata'sına taşı. Tek sınırlı repair sonrası dur; geçersiz evidence'ı sessizce kabul etme.

### P2: Prompt bütçesi ve test disiplini

- Prompt birleştirme aşamalarında karakter ve token bütçesi ölç; büyük raporları parçalara ayır, seçilmiş dosyalardan sınırlı alıntı üret. Ham session transcript'i tekrar taşımak yerine dosya özeti ve line-range evidence kullan.
- Root cause testlerini provider çağrısı olmadan sentetik prompt/process stub'larıyla yap. Gerçek provider tekrarını ancak tanı hipotezi test edilecek biçimde ayrılmışsa çalıştır.
- `rate_limited` retry'si bounded kalmalı; retry sonrası `process_exit` ayrı attempt olarak görünmeli. `process_exit` için otomatik retry eklemek, sebep bilinmeden yalnız maliyeti artırabilir.

## Ek araştırma (2026-10-09): Transport ve read-evidence sınırları

Bu ek, 2026-10-08 tarihli olay bulgularını değiştirmez; ilk mimari önerilerin uygulama sınırlarını netleştirir. Public web araştırmaları GPT-6.1-Sol'un salt-okunur mimari tavsiyesi yerine geçmez ve uygulama/pilot onayı oluşturmaz.

### OpenCode v1.18.35 `--file` prompt metni taşımasıyla aynı değildir

Tag'e sabitlenmiş `packages/opencode/src/cli/cmd/run.ts` kaynağında local kullanım, her `--file` değerini `type: "file"` FilePart ve file URL olarak hazırlar; text prompt ayrı part olarak kalır. `packages/opencode/src/session/prompt.ts` bu `file:` URL'yi iç read executor'ına `bypassCwdCheck: true` ve `ask: () => Effect.void` ile verir, read çıktısını synthetic user-message text part'ı olarak kaydeder. Böylece içerik prompt history'ye girer, fakat normal model-initiated read permission event'i oluşmaz ve bu iş workspace-read evidence sayılamaz. `--attach` remote kullanımında dosya byte'ları okunup data URI'ye dönüştürülür ve 10 MiB üst sınırı uygulanır. Sonuç: bu remediation'da FilePart/attach transport'u kullanılmıyor; OpenCode positional promptu kullanılıyor, limit aşımında fail-fast davranılıyor.

`run --format json` kaynağı event subscription sırasında `message.part.updated` parçalarında `part.sessionID !== sessionID` olan child-session kayıtlarını atlar. Aynı CLI sürümünün session API'si child session listeleme, session messages/parts alma ve aktif session abort etme uçları tanımlar. Normal `run` local yolu TCP server değil in-process `app.fetch` kullanır; HTTP API için ayrı `serve` prosesi gerekir. `serve` password yoksa unsecured olarak başlatılır. V1 message part API unredacted `ToolPart.state.output` verir; read tool'un kendi çıktısı 2.000 line/50 KiB'de truncate olabilir ve metadata bu durumu belirtir. Session `remove` child'ları recursive silmeyi dener ama cleanup hatalarını yutup loglar. Bu API implementation scope'undan çıkarıldı; future reconsideration için authentication, raw-content handling, cleanup verification ve API stability ayrı privacy/security tasarımı gerektirir.

### Result envelope okuma kanıtı değil, model beyanıdır

Codex non-interactive resmi belgesi `--output-schema` seçeneğini final agent response'unu JSON Schema biçiminde üretmek için tanımlar. Codex upstream `main` exec JSONL item şeması da structured output'un `AgentMessage` içine konan JSON string olduğunu gösterir; bu şemada file-read adlı bir item bulunmaz. Upstream JSONL projection kaynakları belirli item türlerini ve alanlarını dışa aktarır. Bu kaynaklar `main` başı olup kurulu Codex CLI 0.159.2 için sürümlü kanıt değildir; ayrıca upstream kaynak kodundaki alt-agent event görünürlüğü gelecekte değişebilir.

OpenCode tarafında v1.18.35 `run --format json` alt-session tool part'larını filtreler; sürümlü Server API ise child session ve message part'larını sorgulayabilir. Bu nedenle `filesRead`, `reviewedPaths` gibi model-authored zarf alanları host gözlemine bağlanmadıkça yalnızca iddiadır. Host tarafından okunma kanıtı sağlanamayan CLI/model kombinasyonunda review verdict'i doğrulanmış sayılmamalıdır.

Takip doğrulamasında Codex'in kurulu `0.159.2` sürümüne ait resmi `rust-v0.159.2` tag'i (`ff6aec96948b70d94983af2641a6b67c94faeff5`) incelendi. App-server `ThreadItem::CommandExecution` `command_actions` içinde parser'ın `Read` action'ını taşıyabilir; ancak aynı release'in `codex exec --json` projection'ı command, aggregated output, exit code ve status alanlarına indirger ve `command_actions` alanını JSONL'e çıkarmaz. JSONL `ThreadItemDetails` union'ında ayrıca `file_read` türü yoktur. `should_process_notification` filtresi item lifecycle event'lerini yalnız ana thread ve turn ID eşleştiğinde JSONL processor'a verir. Dolayısıyla kurulu sürümün JSONL yüzeyi structured file-read evidence veya alt ajan read event'leri vermez. Ayrı app-server history/action toplama yolunun child read coverage ve agent-visible provenance sağlayıp sağlayamadığı hâlâ protokol spike'ı gerektirir.

### Mevcut Antigravity `workspaceRead` probe'unun hedefi geçici dizindir

Mevcut Antigravity adapter `os.tmpdir()` altında geçici bir çalışma alanı oluşturup sentinel dosyayı oradan okutuyor (`subagent-bridge/src/adapters/antigravity-adapter.js:722, 746-751`). Başarılı sonuç bu geçici dizine read erişimini gösterir; seçilen trusted workspace ACL/read erişimini göstermez. Generic bridge capability probe ise `workspaceRead` alanını `not_probed` bırakır. Plan, iki davranışı ayrı tutmalı ve trusted workspace read durumunu ayrı ölçmelidir.

### API ve command-line güvenlik sınırları

OpenCode v1.18.35 network kaynağında varsayılan hostname `127.0.0.1`, port `0` olarak tanımlıdır; server başlatma kodu port `0` için önce `4096`, sonra boş port fallback'ini dener. Server auth kaynağı, boş olmayan `OPENCODE_SERVER_PASSWORD` ayarlanmadığında Basic Auth'ı zorunlu kılmaz. Dolayısıyla API adayı kendiliğinden authenticated sayılmaz; açık password, loopback bind ve session başına cleanup kapıları gerekir. API session `0.0.1` deneysel şemasındadır.

Windows process bütçesi için yerel Orkestrasyon Node runtime'ı `v24.17.0`, bundled libuv `1.52.1` olarak ölçüldü; package'ın minimum Node `v20.9.0`, ayrıca Node `v22.0.0` ve v24.17.0 tag'leri incelendi. Bu libuv kaynaklarında argv UTF-16'ya çevrilir ve `quote_cmd_arg`/`make_program_args` ile tek command-line string'e çevrilir. CreateProcess sınırı serialized command-line string içindir; Node `spawn` API'si bu nihai string uzunluğunu doğrudan sunmaz. Plan supported libuv allocator bound'ından muhafazakâr `2 * sum(UTF-16 argument code units) + 4 * argc` upper-bound kullanır; bound aşımı fail-closed olur ve gerçek serialized komut sığabilecek olsa da ret kabul edilir. 39.001 gözlemi exact OS argv ölçümü veya limit olarak sunulmaz.

### Doğrulanmış kaynaklar ve sınırlar

- OpenCode v1.18.35 `run` kaynak kodu: https://raw.githubusercontent.com/anomalyco/opencode/v1.18.35/packages/opencode/src/cli/cmd/run.ts — 2026-10-09 UTC.
- OpenCode v1.18.35 session API kaynak kodu: https://raw.githubusercontent.com/anomalyco/opencode/v1.18.35/packages/opencode/src/server/routes/instance/httpapi/groups/session.ts — 2026-10-09 UTC.
- OpenCode Server dokümantasyonu: https://opencode.ai/docs/server/ — 2026-10-09 UTC.
- Codex non-interactive mode: https://developers.openai.com/codex/non-interactive-mode/ — 2026-10-09 UTC.
- Codex exec JSONL event schema, upstream `main`: https://raw.githubusercontent.com/openai/codex/main/codex-rs/exec/src/exec_events.rs — 2026-10-09 UTC; released 0.159.2 ile eşleşmesi doğrulanmadı.
- Codex JSONL projection, upstream `main`: https://raw.githubusercontent.com/openai/codex/main/codex-rs/exec/src/event_processor_with_jsonl_output.rs — 2026-10-09 UTC; released 0.159.2 ile eşleşmesi doğrulanmadı.
- Codex v0.159.2 release: https://github.com/openai/codex/releases/tag/rust-v0.159.2 — tag commit `ff6aec96948b70d94983af2641a6b67c94faeff5`; doğrulama: 2026-10-09 UTC.
- Codex v0.159.2 CLI args: https://raw.githubusercontent.com/openai/codex/rust-v0.159.2/codex-rs/exec/src/cli.rs — 2026-10-09 UTC.
- Codex v0.159.2 JSONL event schema: https://raw.githubusercontent.com/openai/codex/rust-v0.159.2/codex-rs/exec/src/exec_events.rs — 2026-10-09 UTC.
- Codex v0.159.2 JSONL projection: https://raw.githubusercontent.com/openai/codex/rust-v0.159.2/codex-rs/exec/src/event_processor_with_jsonl_output.rs — 2026-10-09 UTC.
- Codex v0.159.2 notification filtresi: https://raw.githubusercontent.com/openai/codex/rust-v0.159.2/codex-rs/exec/src/lib.rs — 2026-10-09 UTC.
- Codex v0.159.2 app-server item schema: https://raw.githubusercontent.com/openai/codex/rust-v0.159.2/codex-rs/app-server-protocol/src/protocol/v2/item.rs — 2026-10-09 UTC.
- Codex v0.159.2 app-server thread protocol: https://raw.githubusercontent.com/openai/codex/rust-v0.159.2/codex-rs/app-server-protocol/src/protocol/v2/thread.rs — `thread/read`, experimental parent/ancestor filters — 2026-10-09 UTC.
- Codex App Server official docs: https://developers.openai.com/codex/app-server/ — access 2026-10-09 UTC; docs note app-server command and WebSocket transport are experimental/unsupported for production workloads.
- OpenCode v1.18.35 session prompt resolver: https://raw.githubusercontent.com/anomalyco/opencode/v1.18.35/packages/opencode/src/session/prompt.ts — FilePart handling and permission callback — 2026-10-09 UTC.
- OpenCode v1.18.35 read tool: https://raw.githubusercontent.com/anomalyco/opencode/v1.18.35/packages/opencode/src/tool/read.ts — external directory/read permission checks and truncation metadata — 2026-10-09 UTC.
- OpenCode v1.18.35 session storage/removal: https://raw.githubusercontent.com/anomalyco/opencode/v1.18.35/packages/opencode/src/session/session.ts — recursive child cleanup and swallowed cleanup errors — 2026-10-09 UTC.
- OpenCode v1.18.35 `serve` startup: https://raw.githubusercontent.com/anomalyco/opencode/v1.18.35/packages/opencode/src/cli/cmd/serve.ts — unsecured warning when password is unset — 2026-10-09 UTC.
- Node.js v24.17.0 bundled libuv Windows process source: https://raw.githubusercontent.com/nodejs/node/v24.17.0/deps/uv/src/win/process.c — local runtime reported Node v24.17.0/libuv 1.52.1; 2026-10-09 UTC.
- Node.js v20.9.0 minimum-engine libuv Windows process source: https://raw.githubusercontent.com/nodejs/node/v20.9.0/deps/uv/src/win/process.c — 2026-10-09 UTC.
- Node.js v22.0.0 libuv Windows process source: https://raw.githubusercontent.com/nodejs/node/v22.0.0/deps/uv/src/win/process.c — 2026-10-09 UTC.
- OpenCode v1.18.35 network defaults: https://raw.githubusercontent.com/anomalyco/opencode/v1.18.35/packages/opencode/src/cli/network.ts — 2026-10-09 UTC.
- OpenCode v1.18.35 Server Auth: https://raw.githubusercontent.com/anomalyco/opencode/v1.18.35/packages/opencode/src/server/auth.ts — 2026-10-09 UTC.
- OpenCode v1.18.35 API authorization middleware: https://raw.githubusercontent.com/anomalyco/opencode/v1.18.35/packages/opencode/src/server/routes/instance/httpapi/middleware/authorization.ts — 2026-10-09 UTC.
- Microsoft CreateProcessW: https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-createprocessw — 2026-10-09 UTC.
- Node.js v24 child_process: https://nodejs.org/docs/latest-v24.x/api/child_process.html — 2026-10-09 UTC.
- libuv process API: https://docs.libuv.org/en/v1.x/process.html — 2026-10-09 UTC.

Araştırma rolleri: Gemini Flash 3.7 (iki ayrı public-web görevi), Space Bunny Free (public-web read-evidence görevi), DeepSeek Pro (yerel salt-okunur kod/plan denetimi). Gemini 3.8 Flash için iki ayrı read-only görev zaman aşımına uğradı; bu sonuçlar kanıt olarak kullanılmadı. DeepSeek'in tespit ettiği Antigravity probe kapsamı, retry taxonomy ve mevcut web-evidence sınıflandırması yerel kaynakta ayrıca doğrulandı.

Takip turunda iki ek Gemini Flash 3.7 web araştırması (exact Codex 0.159.2 ve OpenCode v1.18.35) tamamlandı; üçüncü Windows derinleştirme çağrısı geçersiz web-evidence ile sonuçlandığı için kullanılmadı. DeepSeek Pro yerel incelemesi rate-limit oldu; DeepSeek Flash salt-okunur yerel reviewer fallback'iyle şema/transport/retry kararları incelendi. Bulgular yukarıdaki official release/tag kaynakları ve local runtime gözlemiyle tekrar kontrol edildi. Bu eklerde provider çağrısı veya kod değişikliği yapılmadı.

### Takip araştırması (2026-10-09): kesin implementasyon sınırları

Codex `rust-v0.159.2` app-server protocol source'u `thread/read` için `include_turns`, `thread/list` için `parentThreadId` ve `ancestorThreadId` filtrelerini tanımlar; child-thread geçmişine erişim teknik olarak mümkündür. Parent/ancestor filtreleri `ExperimentalApi` ile gated'dir; `thread/items/list` ve paginated turn/item geçmişi de experimental API opt-in ister. `CommandAction::Read` yine best-effort command-string parse'ıdır, kernel/file-handle attestation değildir. Bu yüzden app-server history host'a daha iyi command/output/action kaydı sunsa bile actual OS read veya model-consumption proof sağlamaz. Plan, custom Codex app-server driver'ını bu remediation scope'undan çıkarır.

OpenCode v1.18.35 `SessionPrompt.createUserMessage` kaynağında yerel `file:` FilePart, iç `read` executor'ı ile işlenir; çağrı `extra.bypassCwdCheck: true` ve `ask: () => Effect.void` sağlar. Text output synthetic user-message text'e eklenir. Bu, açıkça seçilmiş attachment bağlamıdır; normal model-initiated `read` tool permission event'i veya trusted-workspace host evidence'i değildir. `--attach` remote yolu dosya byte'larını data URI ile gönderir. `opencode run` local transport'u in-process `app.fetch` iken public HTTP API için ayrı `serve` gerekir; server password yoksa Basic Auth kapalıdır. Server API `0.0.1` deneysel; session deletion child'ları recursive silmeyi dener ama cleanup hatalarını yutup loglar, bu nedenle API success cleanup completion kanıtı değildir. Son karar: current plan OpenCode positional prompt + fail-fast budget dışına çıkmaz.

### Bu session'daki subagent/araç hata kaydı

- Antigravity/Gemini Flash 3.8: önceki takipte iki salt-okunur web görevi timeout oldu; sonuç üretilmedi ve kullanılmadı.
- Antigravity/Gemini Flash 3.7: Windows argv derin araştırma çağrısı invalid web evidence (`result_contains_restricted_content`) ile reddedildi; bulguları kullanılmadı. Windows iddiaları Microsoft, Node/libuv ve Codex birincil kaynaklarıyla ayrıca doğrulandı.
- DeepSeek Pro: local reviewer çağrısı iki adapter attempt'inde `rate_limited` oldu; bu çağrıdan bulgu alınmadı.
- DeepSeek Flash: Pro yerine salt-okunur local reviewer fallback'inin ilk attempt'i `rate_limited`, retry attempt'i başarılı oldu; sonucu Bridge şemaları, adapter ve test kaynaklarında kontrol edildi.
- Antigravity capability-health probe: bir çağrı `health check unavailable` döndürdü; yeni opt-in capability probe başarılı olduğundan model erişimi ve webRead ayrı doğrulandı. Bu subagent task failure değil provider teşhis olayıdır.
- Gemini Flash 3.7 Codex exact-tag görevi ve Space Bunny Free OpenCode exact-tag görevi tamamlandı. Prompt, task/session ID, workspace yolu veya ham hata payload'ı rapora alınmadı.

## Kaynaklar

- Microsoft, **CreateProcessW function** — Windows command-line üst sınırı 32.767 karakter, Unicode terminating null dahil. https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-createprocessw — erişim: 2026-10-08 UTC.
- Node.js, **Child process — `spawn(command, args, options)`** — executable, argv ve stdin pipe semantiği. https://nodejs.org/api/child_process.html#child_processspawncommand-args-options — erişim: 2026-10-08 UTC.
- libuv, **`uv_process_t`** — Windows'ta args listesinin CreateProcess command-line string'ine birleştirildiği açıklaması. https://docs.libuv.org/en/v1.x/process.html — erişim: 2026-10-08 UTC.
- Yerel Codex CLI `codex exec --help` — prompt yerine `-` kullanıldığında stdin'den okuma davranışı; Orkestrasyon doğrulama oturumu, 2026-10-08.
- Yerel OpenCode CLI `opencode run --help` — positional message ve `--file` seçeneği; stdin prompt seçeneği listelenmiyor; Orkestrasyon doğrulama oturumu, 2026-10-08.
- Orkestrasyon kaynakları: `subagent-bridge/src/adapters/codex-adapter.js:75-100, 176-194`; `subagent-bridge/src/adapters/opencode-adapter.js:139-175, 305-330`; `subagent-bridge/src/services/execution-service.js:30-44, 59-68, 103-139`; `subagent-bridge/src/runtime/bridge-runtime.js:51-58, 713-739, 780-808`; `subagent-bridge/src/deepseek.js:139-179`.

## Uygulama Güncellemesi (2026-10-09)

Kullanıcı host-scope garantisini seçtikten sonra `review-source-manifest.js`, result contract şeması, MCP alanları, Codex stdin prompt/source bundle, OpenCode positional+stdin source context, Claude Code stdin, redacted metrics/recent-runs projection ve argv preflight uygulandı. Restart sonrası MCP üzerinden Space Bunny Free canlı source-delivery testi tek attempt ile geçti. İlk DeepSeek `npm run pilot` çağrısı provider'a ulaşmadan MCP public schema'nın `ZodEffects.shape` özelliği yokluğu nedeniyle başarısız oldu; schema shape yayımlama düzeltmesi ve stdio MCP regresyon testinden sonra pilot başarılı oldu. Son tam `npm test`: 897 toplam, 893 geçti, 4 platforma özgü test atlandı. `npm run verify`, `npm run verify:ci`, MCP `npm run smoke`, `npm run drill`, `npm run pilot`, hedefli testler ve `git diff --check` geçti. Provider/modelin bundle'ı semantik olarak işlemesi veya verdict doğruluğu doğrulanmadı.

### Canlı source-delivery denemesi (2026-10-09)

- Space Bunny Free güncel katalog kontrolünde etkin, tool-call destekli ve input/output/cache fiyatları sıfır olarak raporlandı.
- Restart öncesi MCP aracı bir reviewer çağrısı tamamladı, fakat `reviewContract` döndürmedi ve timeout sonrası retry yaptı. Aynı workspace parmak izine rağmen sonuç yeni teslimat sözleşmesini kanıtlamadığından bu ilk yanıt dışlandı.
- Güncel checkout'taki `createBridgeRuntime` ve OpenCode adapter üzerinden `maxAttempts=1` ile ayrı tek denemelik canlı çağrı yapıldı. Sonuçta `sourceScopeStatus=complete`, `sourceDeliveryStatus=complete_to_cli`, bir kaynak dosya, 7.921 kaynak byte'ı ve bir adapter attempt döndü; raporlanan maliyet `$0`, `reviewEligibility=eligible_for_orchestrator_evaluation` oldu.
- Kullanıcı restart'ından sonra aynı tek dosyalık reviewer çağrısı MCP üzerinden tekrarlandı. MCP sonucu da `reviewContract` döndürdü: `complete` / `complete_to_cli`, 1 dosya, 7.921 source byte, stdin pipe'e 8.803 byte, 1 attempt, retry yok ve raporlanan maliyet `$0`.
- Bu gözlem Bridge'in seçilen host bytes'ı CLI stdin'ine yazdığını doğrular. Provider'ın bunları semantik olarak işlediğini, dosyanın eksiksiz incelendiğini veya model bulgularının doğru olduğunu doğrulamaz; hata taksonomisi/readiness fazları ve bulguların bağımsız doğrulanması ayrı kalır.

### Güvenlik ve MCP düzeltmeleri

- Canlı reviewer'ın aday bulgularından eksik dosya hatasının `try` bloğunun dışında kalması, `.env`/credential dizinlerinin izinli kalması, Windows ADS yol bileşenlerinin reddedilmemesi ve `localeCompare` sıralamasının çalışma ortamına bağlı olması kaynakta doğrulanıp düzeltildi. Windows cihaz adları ve trailing dot/space bileşenleri de kapsam dışında bırakıldı; case-insensitive dosya sistemlerinde path-case eşlemeleri kabul edilirken yinelenen fiziksel kaynak reddedilir.
- `run_deepseek_subagent` ilk kontrollü pilotta Zod `ZodEffects.shape` kullanımı nedeniyle doğru MCP input schema'yı yayımlamıyordu. Public schema input-shape çıkarımı eklendi; stdio MCP regresyon testi gerçek tool listesi ve sahte runtime dispatch'ini doğrular.
- Path bileşenleri açılış öncesi ve descriptor açıldıktan sonra yeniden denetlenir; descriptor kimliği host `lstat` sonucu ile kıyaslanır. Platform API'sinin atomik reparse-point-safe open sağlamadığı pencerede dış süreç kaynaklı eşzamanlı Windows junction değişimi mutlak olarak dışlanmış sayılmaz.
- Tek onaylı DeepSeek Pro synthetic MCP pilotu bir adapter attempt ile tamamlandı; Bridge `totalCostUsd=0.010621072` raporladı. Bu gözlenen Bridge maliyetidir, sağlayıcı faturası değildir. Prompt/result içeriği ve görev kimliği bu rapora kaydedilmedi.

## Faz 2-3 Uygulama Durumu (2026-10-10)

- Runtime failure stages artık spawn, sandbox startup, workspace read, auth, rate-limit, provider process exit, result parse, evidence rejection ve cancellation'ı ayırır. OS error code yalnız sabit allowlist'ten `osErrorCode` olarak taşınır; raw stderr/error metni metrics'e yazılmaz.
- `webEvidenceFailureCode` mevcut `classifyWebEvidenceValidationFailure` allowlist'inden ayrı alan olarak attempt metrics ve `recent-runs` round-trip'e eklendi. `schema_invalid`, `output_parse_invalid`, `empty_output` operasyonel retry policy'sinden çıkarıldı; schema repair ve web carrier repair kendi sayaç/stop reason'larıyla çalışır ve ortak global attempt/cost ceiling'e tabidir. DeepSeek operasyonel `ok:false` sonucu schema-validation hatası gibi sunulmaz.
- Opt-in Antigravity capability probes `sandboxStartup` durumunu model/toolfree yanıtından ayrı işaretler. Workspace-read hedefi `temp_workspace` veya host-bound `trusted_workspace` olarak kaydedilir; trusted hedefte Bridge sentinel için kısa ömürlü özel alt dizin oluşturup cleanup yapar.
- Resmi Google Antigravity dokümanlarına göre terminal sandbox shell command'lerini sınırlar; Windows'ta eski/ayrı sandbox davranışı sürer ve CLI `--sandbox` bayrağı vardır. Headless modda izinsiz shell komutu etkileşimli onay alamayıp soft-deny edilebilir. Bu nedenle `agy --sandbox` ile araçsız `READY` yanıtı sandbox helper/terminal execution readiness kanıtı değildir; runtime bu başarıyı `sandboxStartup=available` saymayacak, açık sandbox setup hatasını `unavailable` sayacak ve tool execution gözlemi yoksa `not_probed` tutacaktır.
- Genel `check_provider_capability` için `probeWorkspaceRead` varsayılan kapalıdır. Açıldığında ilk capability çağrısına ek bir provider çağrısı yapıp yalnız host sentinel alt dizinini okuma testine verir; kullanıcıya model, provider çağrı sayısı ve olası maliyet önceden gösterilmelidir. Trusted-workspace live read çağrısı tamamlandı ve yalnız sentinel okumasını doğruladı; fixture testleri cleanup/path sözleşmesini doğrular. Terminal sandbox command çalıştırılmadığından `sandboxStartup` için canlı başarı kanıtı yoktur.
- Windows Node API'si path reparse point'ini descriptor açılışıyla atomik bağlamadığından dış süreç kaynaklı eşzamanlı junction swap penceresi tamamen elimine edilemez. Path çözümü ve `lstat` descriptor açılmadan önce/sonra yinelenir, descriptor kimliği karşılaştırılır; residual risk planın açık sınırı olarak korunur.
- Kaynaklar: Google Antigravity Terminal sandbox (https://antigravity.google/docs/sandbox) ve CLI Headless mode (https://antigravity.google/docs/cli/headless), erişim 2026-10-10 UTC. MCP tool şeması yeniden yüklendikten sonra trusted `workspaceReadTarget` probe'u çalıştırıldı; ayrıntı aşağıdaki redakte live observation kaydındadır.
- Kullanıcı Gemini 3.8 Flash ile trusted-workspace probe için en fazla iki provider çağrısına onay verdi; restart sonrası yeni MCP şemasıyla probe çalıştırıldı. USD cost Bridge tarafından ölçülemediğinden quota kullanımı olabilir; sonuç aşağıda kayıtlıdır.

## Trusted-workspace canlı ölçümü (2026-10-09T16:17:27Z)

- Antigravity CLI sürümü `1.3.2`; model aliası `gemini_flash_3_8` olarak istendi ve `gemini-3.8-flash-high` olarak çözüldü.
- Redakte live observation: `modelAccess=available`, `workspaceRead=available`, `workspaceReadTarget=trusted_workspace`, `sandboxStartup=not_probed`, `failureClass=null`.
- Host, trusted workspace altında kısa ömürlü sentinel dizin oluşturup yalnız sentinel'i okuma görevini çalıştırdı; probe hedefi provider sonucunda yol veya sentinel içeriği göstermez. Bu tek sentinel erişimini kanıtlar, workspace genelini veya kaynak incelemesini değil.
- Shell/terminal tool invocation yapılmadı. Bu nedenle `sandboxStartup` doğru biçimde `not_probed` kaldı; `--sandbox` flag'inin terminal command helper'ını başlattığına dair live kanıt yoktur. Bypass veya permission genişletmesi denenmedi.
- Kullanıcı onayı en fazla iki provider çağrısıyla sınırlıydı; maliyet USD olarak ölçülemedi ve sağlayıcı faturası iddiası yapılmaz.

## Takip eki: required review ve Codex JSONL (2026-10-13)

Bu ek, 2026-10-08 tarihli olay kayıtlarını geriye dönük değiştirmez. Sonraki uygulama ve doğrulama sonuçlarını ayırır.

### Required source-review eligibility

- `subagent-bridge/src/runtime/bridge-runtime.js:350-438` strict required-review JSON sonuçlarını doğrular; her finding'in manifest-relative path ve 1-based inclusive line aralığını host manifestinden elde edilen dosya/satır sayılarıyla karşılaştırır. `:1150-1167` validation başarısızlığını `schema_invalid` yapar; başarılı host doğrulamasında `reviewResultValidated=true` olur.
- Aynı runtime dosyasında `:350-383`, eligibility için complete source scope/delivery/output, completed host task, validated review result ve başarılı task şartlarını birlikte ister. `subagent-bridge/src/schemas/core-schemas.js:130-163` doğrulama kanıtı olmayan legacy v1/v2 eligible sonuçları `unverified` olarak normalize eder.
- Bu, kaynak yol ve aralığının seçilmiş snapshot içinde var olduğunu doğrular. Modelin kaynağı semantik olarak okuyup bulguyu doğru çıkardığını kanıtlamaz.

### Codex JSONL taşıması ve rate-limit retry

- Yerel Codex CLI `0.162.1` için `codex exec --help`, `--json` seçeneğini ve stdout'un JSONL event akışı olduğunu doğruladı. Resmî non-interactive dokümanı event ailelerini ve `item.completed` içindeki `agent_message` metnini açıklar; rate-limit için belirli `error.code` değerlerini tanımlamaz.
- `subagent-bridge/src/adapters/codex-adapter.js:10-42, 87-118` kapalı hata kodu allowlist'ini yalnız JSONL stdout içindeki terminal `turn.failed`/`error` event'ine uygular. `:124-139` yalnız terminal `turn.completed` sonrası son `agent_message` metnini döndürür; reasoning ve tool-event metni sonuç olarak dışarı çıkmaz. Düz prose, stderr örneği ve agent mesajı içine gömülü JSON rate-limit sinyali sayılmaz.
- Regresyon fixture'ı bu structured event'in adapter'dan runtime read-only retry kararına taşındığını; prose/embedded JSON'un retry başlatmadığını doğrular. Windows tam test `npm test`: 943 toplam, 939 pass, 4 platform skip, 0 fail; `npm run verify` geçti.
- Yerel Codex CLI 0.162.1 ve `gpt-6.1-sol` ile salt-okunur canlı çağrı 9.7 saniyede `CODEX_JSONL_LIVE_OK`, exit code 0 üretti; adapter'ın başarılı JSONL parse yolu gerçek provider yanıtıyla doğrulandı. Bu çağrı rate-limit yanıtı üretmedi. Bu nedenle provider'ın gerçek rate-limit event code'u canlı gözlemle doğrulanmış değildir; yalnız test fixture'ındaki izinli kodlar doğrulanmıştır.
- Private Orkestrasyon kod commit'i `4b24aba`, sanitized public eşleşmesi `ca298e4` olarak yayımlandı. Bu rapor eki private kalır ve public export'a dahil edilmez.

## Takip eki: Antigravity model rotalarının kapatılması (2026-10-14)

- Sıralı modelAccess probe'ları Gemini 3.1 Pro (`gemini_pro`) ve Gemini 3.7 Flash (`gemini_flash_3_7`) için `unavailable` / `authentication_failure`, Gemini 3.8 Flash (`gemini_flash_3_8`) için `available` verdi. Yerel `agy models` kataloğu da yalnız 3.8 Flash seçeneklerini gösterdi. Probe sırasında CLI 1.3.4 kurulu ve `cli=available` idi; genel `authValid` bilgisi halen `null`.
- Google'ın [güncel Antigravity model matrisi](https://antigravity.google/docs/models/) 3.1 Pro ve 3.7 Flash'ı yalnız Enterprise, 3.8 Flash'ı tüm listelenen planlarda sunuyor. Hesap planı incelenmedi; sınıflandırıcı `auth` metnini de `authentication_failure` sayabildiğinden ham sağlayıcı hata nedeni kesin bilinmiyor. Bulgular hesap/plan bazlı model yetkisi açıklamasını destekliyor, modelin global kaldırıldığını değil.
- Runtime router, Antigravity run tool şeması, adapter dispatch, task-profile route/fallback ve üretilen global OpenCode araçları 3.1 Pro ile 3.7 Flash'ı fail-closed devre dışı bırakacak şekilde güncellendi. `check_antigravity_subagent` bunları yalnız açık, seri modelAccess tanı probe'u için kabul eder; bu, normal run yetkisi değildir.
- Web research ve file audit profilleri erişilebilir 3.8 Flash'a taşındı; edit fallback listelerinden 3.1 Pro çıkarıldı. User-level profile override'ları değiştirilmedi; runtime engeli bu override'lara da uygulanır.

## Takip eki: model route disable ve plan matrisinin hizalanması (2026-10-14)

- `modelAccess` probe'larında 3.1 Pro ile 3.7 Flash unavailable, 3.8 Flash available oldu; `agy models` yerel hesap kataloğunda da yalnızca 3.8 Flash seçenekleri bulundu.
- Normal yürütme rotası fail-closed güncellendi: `subagent-bridge/src/runtime/router.js`, `subagent-bridge/src/frontends/mcp/tools.js` ve Antigravity adapter'ı iki alias'ı model erişim engeliyle reddeder. `check_antigravity_subagent` bunları yalnız açık model-access diagnostic probe'u için kabul eder.
- `config/policy.json`'daki `web_research`/`file_audit` erişilebilir `gemini_flash` rotasına taşındı; edit fallback listelerinden Pro kaldırıldı. OpenCode global wrapper şablonundaki `geminiPro`/`geminiFlash37` araçları çıkarıldı ve kurulu global kopya yeniden render edilip `npm run opencode-tools:check` ile eşitlendi.
- Bu, önceki model katalog araştırmasını günceller: resmi model matrisinde iki eski model halen Enterprise kataloğunda yer aldığından global kaldırılma kanıtı yoktur; yerel CLI/Probe sonuçları bu kurulumda hesap/plan bazlı erişim olmadığını gösterir. Hesap planı incelenmedi; ham sağlayıcı yanıtı tutulmadı.

## Takip eki: Antigravity model erişimi (2026-10-14)

- Model başına sıralı canlı `modelAccess` probe'ları `gemini_pro` → `gemini-3.1-pro-high` ve `gemini_flash_3_7` → `gemini-3.7-flash-high` için `unavailable` / `authentication_failure` verdi; kontrol modeli `gemini_flash_3_8` → `gemini-3.8-flash-high` `available` oldu. CLI health `1.3.4` kurulu olduğunu gösterdi, genel `authValid` alanı `null` kaldı; bu probe auth-valid boolean üretmez.
- Aynı gün yerel `agy models` çıktısında 3.8 Flash seçenekleri vardı; 3.1 Pro ve 3.7 Flash yoktu. Bu sorgu model üretim çağrısı değildi.
- Google'ın [güncel model matrisi](https://antigravity.google/docs/models/) 3.1 Pro ve 3.7 Flash'ı Enterprise'a, 3.8 Flash'ı tüm listelenen planlara sunuyor. Bu, iki modelin servisten tamamen kaldırılmadığını ve yerel sonuçların hesap/plan erişim kısıtına uyduğunu güçlü biçimde destekler; hesabın gerçek planı incelenmedi.
- Bridge `authentication_failure` sınıflandırması Antigravity CLI metnindeki geniş `auth` eşleşmesine dayanabilir (`subagent-bridge/src/adapters/antigravity-adapter.js:444-450`); ham sağlayıcı hata gövdesi tutulmadığından `unauthenticated` etiketi model-entitlement reddini genel oturum kimlik doğrulama hatasından tek başına ayırmaz.
- İki alias normal run rotalarından, MCP run şemasından, OpenCode global araç şablonundan ve varsayılan task profile/fallback'lerinden çıkarıldı. Açık `check_antigravity_subagent` model-access probu tanı amacıyla korunuyor; probe edilebilirlik yürütme izni değildir. Gemini 3.8 Flash normal çalışma ve web-research fallback'i olarak açık kaldı.
