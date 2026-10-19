# Subagent Process Transport ve Görev Güvenilirliği Planı

Güncel uygulama notu (2026-10-10, GPT-6.1-Sol incelemesi sonrası): Antigravity `reviewScope`/required review isteği public MCP şemasında provider öncesi açıklayıcı biçimde reddedilir; runtime preflight nedeni `mcp_preflight` olarak sınıflandırılır. Capability workspace-read probu marker içeren açıklamalı yanıtı kabul eder; marker gözlenmeyen başarılı yanıt `inconclusive`, geçici sentinel temizliği ayrı redakte `workspaceReadCleanupStatus` alanıdır. Review-scope secret reddi içerik/path vermeden sıralı dosya indeksini, detector sınıfını ve entropi aday sayısını döndürür; fail-closed kararı korunur. OpenCode source-bundle review yalnız doğrulanmış CLI `1.18.35` sürümünde çalışır ve yalnız host bundle'ını gören, tüm workspace/tool izinleri kapalı özel reviewer agent'ı kullanır. Gemini için yeni stdin transport'u eklenmedi; diğer sürümler required source review için fail-closed reddedilir. Doğrulama sonuçları bu notun devamındaki 2026-10-10 kapanış güncellemesinde kaydedilecektir.

Doğrulama notu (2026-10-10): Hedefli runtime/adapter testleri 91/91 geçti. Windows tam `npm test`: 914 testte 910 geçti, 4 POSIX'e özgü test atlandı, 0 başarısızlık. `npm run verify`, `npm run verify:ci`, MCP stdio `npm run smoke`, `npm run drill` (9/9) ve `git diff --check` geçti. Kullanıcı onayıyla `npm run pilot` bir DeepSeek Pro sentetik MCP çağrısını tek attempt'te tamamladı; Bridge-reported maliyet `$0.010691032` olup sağlayıcı faturası değildir ve source-bundle semantik teslim kanıtı sayılmaz. Canlı OpenCode CLI sürümü `1.18.35`; sürümle aynı sürüm için provider-free stdin/config fixture'ı geçti.

Kapanış notu (2026-10-09): Faz 0-3 uygulama, sentetik doğrulama ve onaylı canlı trusted-workspace probe'u tamamlandı. Canlı Antigravity/Gemini 3.8 Flash gözleminde `modelAccess=available`, `workspaceRead=available`, `workspaceReadTarget=trusted_workspace`; `sandboxStartup=not_probed` döndü. Sentinel, host'un trusted workspace altındaki kısa ömürlü özel dizininde oluşturulup temizlendi; sonuç yalnız bu sentinel'i okuma erişimini kanıtlar. Shell/terminal komutu çalıştırılmadığından Windows terminal sandbox başlangıcı doğrulanmış değildir ve runtime bu alanı bilerek `not_probed` tutar. USD maliyeti ölçülemedi; kullanıcı en fazla iki provider çağrısına onay vermişti. Güncel Windows testleri: 907 testte 903 geçti, 4 POSIX'e özgü test atlandı, 0 başarısızlık; `npm run verify`, `npm run verify:ci`, `npm run smoke`, `npm run drill` (9/9) ve `git diff --check` geçti. Antigravity explicit source review transport'u desteklenmediğinden ilgili explicit review istekleri fail-closed kalır; bu tasarım sınırı kapsam dışı kabul edilmiştir.

Tarih: 2026-10-09 UTC
Durum: Tamamlandı; canlı trusted-workspace sentinel okuması doğrulandı, terminal sandbox başlangıcı bu read-only probe ile ölçülemedi ve `not_probed` tutuldu
Amaç: Uzun subagent promptlarının Windows process sınırında spawn hatasına yol açmasını önlemek; sandbox/workspace erişim başarısızlığını görev başarısından ayırmak; process, provider ve response-contract hatalarını teşhis edilebilir fakat içerik sızdırmayan biçimde kaydetmek.
Kapsam: `subagent-bridge` process invocation, host-owned review source manifest ve byte delivery, Codex/OpenCode/Claude prompt taşıması, result contract, web-evidence error sınıfları, retry/telemetry ve ilgili testler.
Kapsam dışı: NORN-Engine kodu; model veya sağlayıcı değiştirme; permission/sandbox bypass; paralel edit veya release gate açma; kullanıcı onayı olmadan ücretli provider canary'si.
Hazırlayan: Ana orkestratör
Doğrulayan: GPT-6.1-Sol (salt-okunur mimari danışmanlığı) ve ana orkestratör kaynak karşılaştırması

## Yönetici Özeti

Hedef mimari yeni bir agent framework'ü değildir. Mevcut `BridgeRuntime` ve provider adapter'ları korunur. Required review'da Bridge açık `reviewScope` manifestini host'ta okur, SHA-256 ile bağlar ve bounded source bundle'ı worker CLI'ına teslim eder. Codex'te tam prompt stdin'den; OpenCode'ta kısa positional instruction + piped stdin context olarak taşınır. Verification, host'un seçilen source bytes'ı CLI input'una eksiksiz teslim ettiğini kanıtlar, modelin anlamasını/verdict doğruluğunu değil. Windows argv upper-bound tüm provider'ları fail-fast korur.

İkinci katman, process çağrısının başarılı olmasını kaynak incelemesinin başarılı olduğu anlamına getirmemektir. Source scope kapsamı, host bytes teslimi, görev tamamlanması ve review eligibility ayrı host durumları olur. Bridge son review verdict'ini üretmez; ana orkestratör model bulgularını değerlendirir. Host modelin içsel kavrayışını garanti etmez.

## Kanıt ve mevcut durum

- `subagent-bridge/src/adapters/codex-adapter.js:75-100` metadata eklenmiş promptu Codex argv'sinin son argümanı yapar. `subagent-bridge/src/adapters/opencode-adapter.js:159-175` OpenCode promptunu da positional argüman yapar.
- `subagent-bridge/src/services/execution-service.js:30-44` `spawn(executable, args, { shell: false })` çağırır; aynı dosyanın `:135-138` satırları stdin aktarımını destekler.
- `subagent-bridge/src/runtime/bridge-runtime.js:51-58` genel prompt şemasında 60.000 karaktere kadar izin verir. Bu sınır Windows process command-line bütçesine göre ayrıştırılmamıştır.
- Microsoft `CreateProcessW` command line üst sınırını sonlandırıcı Unicode null dâhil 32.767 karakter olarak belgeler. libuv, Windows'ta argv öğelerini CreateProcess'e verilecek command-line string'e birleştirir.
- Codex v0.159.2 `codex exec -` stdin'den tam prompt alır. OpenCode v1.18.35 `run` positional message mevcutken non-TTY stdin'i `message + "\n" + piped` olarak ekler; bu nedenle host source bundle'ı FilePart kullanmadan aktarabilir.
- `subagent-bridge/src/adapters/codex-adapter.js:68-73, 211-223` boş olmayan stdout'u başarı sayabilir; böylece subagent “dosyaları okuyamadım” diyen metni teknik çağrı başarısı olarak dönebilir.
- `subagent-bridge/src/runtime/bridge-runtime.js:713-739` bozuk/eksik web-evidence taşıyıcısını `web_evidence_invalid`/`result_parse` olarak reddeder; ham payload kalıcı loglanmaz.
- `subagent-bridge/src/deepseek.js:139-146` process failure'ını `structured output validation failed` mesajı ile birleştirir. `process_exit` ile gerçek schema/parse hatasının kullanıcıya sunulan açıklaması ayrışmıyor.
- `subagent-bridge/src/schemas/core-schemas.js:28-35` retry stop reason enum'u `web_evidence_repair_exhausted` ve `web_evidence_repair_budget_exhausted` değerlerini içermiyor; runtime bu değerleri üretebilir (`bridge-runtime.js:817-828`), fakat metrics normalizasyonu allowlist dışı değerleri düşürür (`metrics.js:61-64, 229-246`). Bu küçük kapsamlı fakat doğrudan doğrulanmış telemetry işi plana dâhildir.
- `bridge-runtime.js:1584-1606` genel capability probe'u model erişimi/araçsız yanıtı sınar; `workspaceRead` değerini `not_probed` bırakır. Bu durum bütün adapter'lar için genellenemez: Antigravity `probeCapabilities` geçici `os.tmpdir()` workspace'ine sentinel yazar ve geri okutmayı dener (`antigravity-adapter.js:722, 746-751`); bu, seçili trusted workspace erişimini kanıtlamaz. `capability-service.js:3-28` ise yalnız adapter'ın beyan edilen `canRead/canWrite` özelliklerini kontrol eder.
- OpenCode v1.18.35 `run --file` yerel çağrıda file URL'li `FilePart` oluşturur; `SessionPrompt.createUserMessage` bunu `read` executor'ından geçirip sonucu synthetic user-message text olarak prompt history'ye ekler. Bu yolda `ask` callback no-op, cwd guard bypass durumundadır; normal permission event'i değildir ve workspace read kanıtı sayılmaz. Remote `--attach` modunda file bytes 10 MiB'a kadar data URI olarak karşı sunucuya gönderilir.
- Host-observable review kanıtı provider/arayüz bazlıdır. OpenCode v1.18.35 `run --format json` event döngüsü root session dışındaki `message.part.updated` parçalarını filtreler; bu yoldan child-session read kanıtı elde edilemez. Server API'de child session ve session message/part sorguları bulunur. Codex v0.159.2 JSONL projection sınırı aşağıdaki exact release/tag kanıtına göre değerlendirilmiştir. Modelin ürettiği result envelope veya dosya-listesi iddiası tek başına host gözlemi değildir.
- Codex'in kurulu sürümü 0.159.2, resmi `rust-v0.159.2` tag'i `ff6aec96948b70d94983af2641a6b67c94faeff5` commit'ine işaret eder. Bu tag'de app-server `ThreadItem` içinde `CommandExecution.command_actions` ve `CommandAction::Read` bulunur; fakat aynı tag'in `codex exec --json` projection'ı yalnız `command`, `aggregated_output`, `exit_code` ve `status` alanlarını yazar. `exec_events::ThreadItemDetails` içinde `file_read` varyantı yoktur; dolayısıyla JSONL `command_execution` satırı çalıştırılan komut ve toplam çıktıyı gösterebilir ama yapılandırılmış read-path/action listesini veya modelin çıktıyı tükettiğini kanıtlamaz. Ayrıca `should_process_notification` item olaylarını yalnız ana `thread_id` ve `turn_id` ile eşleştirir; JSONL alt ajan child-thread item akışını da kapsamaz.
- OpenCode v1.18.35 Server API session/message/abort/delete yolları sağlar ve kaynakta deneysel `HttpApi` olarak tanımlıdır. Varsayılan host `127.0.0.1`, port `0` ise önce `4096` denenip ardından rastgele boş porta dönülür. Basic Auth ancak boş olmayan `OPENCODE_SERVER_PASSWORD` tanımlanınca zorunludur; parola yoksa middleware kimlik doğrulamasını atlar. `opencode run` local yolu in-process `app.fetch` kullanıp TCP dinleyicisi açmaz; public HTTP API için ayrı `serve` prosesi gerekir ve parola yokken başlarsa unsecured uyarısı verir. Server API bu plan için reddedilmiştir.

## Sol başlangıç mimari kararı

GPT-6.1-Sol'un başlangıç önerisi: adapter/runtime mimarisi korunsun; provider-specific prompt taşıması, gerçekten sınanmış workspace-read capability gate'i ve host-kontrollü result contract eklensin. Generic argv preflight bütün process çağrılarını koruyan güvenlik ağı olsun; uzun promptlar için ana taşıma yöntemi olmasın. OpenCode server API daha sonraki seçenek olarak kalsın. Sonraki exact-version araştırması bu öneriyi daralttı; bu planın nihai seçimi aşağıda sabitlenmiştir.

Bu plan aşağıdaki uygulama sırasını önerir. İlk iki faz kodlama başlamadan mini-spec olarak onaylanmalıdır.

## Araştırma sonrası karar sınırları

- **Codex transport:** `codex exec -` stdin kullanımı 0.159.2 CLI şeması ve resmi non-interactive docs tarafından destekleniyor; `--json`, sandbox ve cwd seçenekleri aynı `exec` CLI kapsamındadır. Prompt taşımasını stdin'e alma ve UTF-16 command-line preflight'ını sentetik/stub testlerle doğrulama offline uygulanabilir. Bu transport kararı, tek başına workspace read kanıtı sağlamaz.
- **Codex transport/evidence:** `codex exec -` stdin uzun-prompt taşımasının seçili yoludur; required review source bundle da aynı user prompt stdin'ine eklenir. v0.159.2 `codex exec --json` structured read event'i ve child-thread event'lerini dışarı vermez. App-server `thread/read`/`thread/list` geçmiş sorgulaması sağlayabilir; `CommandAction::Read` best-effort parse olduğu, app-server protokolü production-supported olmadığı için input coverage contract'ının kaynağı yapılmaz.
- **OpenCode transport:** v1.18.35 `run` positional instruction yanında non-TTY stdin'i user message'a ekler. OpenCode adapter kısa instruction'u argv'de, host source bundle'ını piped stdin'de gönderir. `--file` kullanılmaz; local FilePart resolver'ı normal `read` permission ask/cwd guard'ını atlar. Remote `--attach` ve Server API kullanılmaz.
- **OpenCode host evidence/API:** `run --format json` child-session tool part'larını filtreler. Server API child session ve message part'larını sorgulayabilir, fakat API `0.0.1` deneysel, parola yoksa Basic Auth kapalıdır; v1 message parts unredacted `ToolPart.state.output` döndürür. `read` tool output'u 2.000 line/50 KiB sınırında truncate edebilir ve bunun metadata'sını verir. Session removal child'ları recursive silmeyi denese de hataları yakalayıp loglar; başarılı HTTP dönüşü cleanup tamamlığını garanti etmez. Bu nedenle API bu plan için reddedilmiştir; raw session/tool output retention ve cleanup riski implementation scope'u dışındadır.
- **Windows command-line bütçesi:** `CreateProcessW.lpCommandLine` en çok 32.767 UTF-16 code unit alır ve sonlandırıcı NUL bu sayıya dahildir; command-line içeriği bu nedenle en çok 32.766 code unit olabilir. Bridge'in yerel Node runtime'ı `v24.17.0`, `process.versions.uv` ise `1.52.1` olarak gözlendi; proje minimum Node `20.9.0` için aynı libuv formülü ayrıca kaynakta karşılaştırıldı. Güvenli cross-version üst sınır `2 * sum(UTF-16 code units of argv) + 4 * argc` olarak sabitlendi; argüman sonlandırıcıları, quote/escape payı, ayırıcılar ve son NUL için konservatif slack içerir. Üst sınır 32.767'yi aşarsa fail-fast et; gerçek serialized argv sınırı aşmayacak olsa bile false-positive ret kabul edilir. `lpApplicationName` yolu ayrı parametredir, ancak command-line içindeki `argv[0]` hesaba katılır. `String.length` UTF-16 code unit sayar; UTF-8 byte veya Unicode code point sayısı ölçü değildir. Sabit 39k eşiği kullanma: 39.001 karakterlik önceki hata güçlü hipotezdir, ölçülmüş nihai argv kanıtı değildir.
- **Sonuç zarfı/MCP uyumluluğu:** Review task result'ında optional `reviewContract` v1; `sourceScopeStatus`, `sourceDeliveryStatus`, `sourceManifestSha256`, `sourceFileCount`, `sourceBytes`, `reviewEligibility` taşır. Bu host-read + CLI-input-delivery kanıtıdır, model comprehension/verdict kanıtı değildir. Strict Zod, metrics sanitizer ve recent-runs reader yalnız manifest digest/count/bytes/status alanlarını allowlist eder; path ve content'i saklamaz. Public MCP input değiştiğinden backward-compatibility fixture ve `npm run smoke` zorunludur.
- **Retry:** `rate_limited/server/network/timeout` process/provider retries ile `schema_invalid/output_parse_invalid/empty_output` veya web-evidence bounded repair aynı politika değildir. Stop reason enum/metrics/recent-runs round-trip açığı doğrulanmıştır; mevcut schema ve evidence repair davranışını kaldırma niyeti yoktur. Tamir döngüsü ve transport retry sayaçları/limitleri ayrı adlandırılmalıdır.

## Uygulama fazları

### Faz 0 — Process invocation ve transport sözleşmesi

Amaç: Adapter'ın prompt, sabit argüman, stdin/attachment, cwd ve environment seçimlerini tek, sınırları ölçülebilir bir invocation sözleşmesine ayırmak.

İşler:

1. Her provider için `promptTransport` yeteneğini açık tanımla. Bu uygulamanın desteklediği seçim Codex=`stdin_prompt`, OpenCode=`argv_instruction+stdin_context`, Claude Code=`stdin_prompt`; Antigravity source bundle transport'u desteklenmediği için explicit review scope'u provider başlamadan reddedilir. OpenCode `file_attachment`/`http_api` bu planın izinli transport'u değildir.
2. `execution-service` öncesinde executable, fixed args, escaping/quoting overhead ve prompt transport kanalını içeren son invocation planını üret. Command-line estimate için `argv = [resolved executable/argv0, ...spawnArgs]`; cwd/environment command-line sayımına dahil edilmez.
3. Windows preflight'ında supported Node/libuv sürümleri için konservatif üst sınırı kullan: `upperBound = 2 * sum(UTF-16 code units of argv) + 4 * argvCount`. `upperBound <= 32767` ise kabul et, değilse provider başlamadan `prompt_transport_limit` dön. Bu bilerek muhafazakâr admission bound'dur; üst sınırı aşan ama gerçek serialized command line'a sığan argümanlar da reddedilebilir. NUL/quote/escape/delimiter payı bound içindedir; `argv[0]` eklenir, `lpApplicationName` ayrı path parametresidir. 39k olay ölçümünü eşik olarak kullanma; promptu kesme.
4. Required review için `reviewScope` (yalnız trusted workspace içindeki göreli, tam dosya yolları) al. Host reader her file'ı symlink/hardlink/TOCTOU kontrolleriyle açar, UTF-8 kayıpsız decode eder, secret-like içerik ve denied roots (`memory`, `.git`, `node_modules`, `.env`, private-key adları) varsa tüm review'u başlatmadan reddeder. Dosya adedi 50'yi, toplam raw source 256 KiB'ı veya serialized source bundle 256 KiB'ı aşarsa truncation yapmadan `review_scope_too_large`/`review_scope_denied` dön.
5. Her kaynak için relative path, raw-byte SHA-256, byte count ve tam text içeriğinden deterministik bundle kur; manifest hash'i hesapla. Host promptu `reviewScope` scope'unun tam ve güvenilir olmayan kaynak verisi olduğunu belirtir. Prompt/bundle byte'larını log veya metric'e koyma.
6. Codex'te instruction + execution metadata + source bundle'ı stdin prompt'una taşı; argv'de model, sandbox ve `-` sentinel kalsın. Claude Code'un mevcut stdin taşıması source bundle ile kullanılır. Antigravity için review scope verilirse transport desteklenmediği gerekçesiyle provider çağrısı başlatmadan fail-closed dön.
7. OpenCode positional argv'de yalnız kısa instruction/metadata kalsın; host source bundle'ı `execution-service.stdin` üzerinden gönderilsin. v1.18.35 `run` non-TTY stdin'i positional message'a ekler. `--file`, `--attach` ve Server API çağrılmaz. OpenCode CLI version compatibility fixture'ı bu append semantics'i test eder; desteklenmeyen sürüm required review için fail-closed olur.
8. Uzunluk preflight'ını tüm adapter'lara uygula; desteklenmeyen transport veya aşım `prompt_transport_limit` gibi ayrı ve actionable failure döndürsün.

Kabul kriterleri:

- Provider çağrısı yapmayan Windows fixture'ı 39.001 karakterli sentetik promptu Codex stdin'e eksiksiz aktarır; argv limiti aşılmaz.
- Provider çağrısı yapmayan fixture'da host manifestinin file set/byte hash'i ile Codex stdin ve OpenCode piped context payload'ları birebir eşleşir; test modelin içsel kavrayışını iddia etmez.
- Required review boş scope, traversal/symlink/hardlink, denied/secret-like path/content, invalid UTF-8 ve 256 KiB üstü scope'ta provider başlamadan reddedilir; hata çıktısında path/content/secret yoktur.
- Manifest duplicate path'leri deterministik şekilde reddeder; host file mutation during read tespit edilirse provider çağrısı başlamaz.
- Argüman overhead'i dâhil libuv upper-bound hesabı, quote/escape ve BMP/non-BMP Unicode sınırlarında test edilir; admission false-positive ret'leri kabul kriteridir, false-negative kabul edilmez.
- Preflight helper Node.js v20.9 minimum engine, v22 ve v24 runtime testlerinde aynı conservative bound sözleşmesini uygular; `process.versions.uv` değerleri doğrulama logunda kaynak koduyla eşleştirilir.
- Aşırı uzun payload provider başlatılmadan reddedilir; raporlanan hata transport kaynaklıdır ve prompt içeriği içermez.
- OpenCode kısa instruction argv'de, source payload stdin'de taşınır; prompt/metadata üst-bound'ı aşarsa hiçbir `--file`, `--attach` veya Server API fallback'i çağrılmaz.
- `execution-service` source stdin'in parent pipe'e flush durumunu ve byte count'unu döndürür; process error/early pipe close `sourceDeliveryStatus=failed` olur. Bu host-to-CLI delivery evidence'idir, model attention proof değildir.
- `shell: false` ve no-bypass invariant'ları tüm yeni yollarda korunur.

Araştırma notu: v1.18.35 `run` `Bun.stdin.text()` ile piped stdin'i okur ve `resolveRunInput` positional instruction arkasına ekler. Bu nedenle source manifesti explicit user-message context olarak aktarılır; FilePart'ın internal read callback no-op permission/CWD check davranışına gerek kalmaz. `--auto`, `--yolo`, permission bypass veya HTTP API kullanılmaz.

### Faz 1 — Host source manifest ve input-delivery contract

Amaç: Host'un belirlenmiş source scope'unu okuyup CLI input'una eksiksiz teslim ettiğini kanıtlamak; modelin dikkatini, anlamasını veya verdict doğruluğunu iddia etmemek.

İşler:

1. Direct single-provider MCP araçlarına optional `reviewScope` göreli dosya yolu listesi ekle. Role-based `reviewer` araçları için scope mevcut `files/contextFiles` alanlarından oluşturulur; prompt metninden scope çıkarımı yapılmaz.
2. Yeni `review-source-manifest` servisi dosyaları trusted workspace root içinde oku. Yalnız regular UTF-8 files kabul et; containment, symlink/reparse/hardlink, file identity/race, denied roots, sensitive filename, NUL, secret-like content ve source size sınırlarını uygula. Scope'u kesme veya redakte etme; sorun varsa provider çağrısından önce fail-closed dön.
3. Sıralı manifest entry'lerinde normalized relative path, raw-byte SHA-256 ve byte count tut; canonical manifest digest üret. Tam UTF-8 text içeriğini JSON-encoded source bundle olarak instruction'dan ayır; içeriği güvenilmeyen source data diye işaretle.
4. Codex/Claude stdin prompt'una, OpenCode positional instruction + piped stdin context'ine source bundle'ı taşır. Antigravity explicit review scope'unu provider çağrısı öncesi reddeder. `reviewScope` olmayan task legacy/best-effort çalışır ve full source eligibility iddia etmez.
5. Optional result contract'i `version: 1`, `sourceScopeStatus`, `sourceDeliveryStatus`, `sourceManifestSha256`, `sourceFileCount`, `sourceBytes`, `reviewEligibility` alanlarıyla üret. Bridge host-scope ve CLI input delivery'yi doğrular; semantic verdict ana orkestratöre aittir. Legacy result alanları bozulmadan kalır.
6. Metrics'e yalnız contract version, status enum'ları, digest/count/byte alanlarını yaz; path, content, source bundle veya raw prompt yazma. Recent-runs reader da aynı optional status contract'i strict şekilde okumalı.

Kabul kriterleri:

- `reviewContract.sourceScopeStatus`: `not_requested`, `complete`, `blocked`; `complete` listedeki bütün files host'ta okundu ve manifestlendi demektir.
- `reviewContract.sourceDeliveryStatus`: `not_attempted`, `complete_to_cli`, `failed`; `complete_to_cli` source bundle CLI input pipe/argv'sine eksiksiz yazıldı anlamına gelir, modelin içsel olarak her byte'ı anladığı anlamına gelmez.
- `reviewContract.reviewEligibility`: `eligible_for_orchestrator_evaluation`, `unverified`, `unavailable`; eligibility yalnız `sourceScopeStatus=complete`, `sourceDeliveryStatus=complete_to_cli` ve başarılı structured task sonucu olduğunda verilir. Bu `APPROVE`/verdict değildir.
- `reviewContract` sadece explicit non-empty `reviewScope` veya role-based `reviewer` scope'unda eklenir; v1 required. Legacy result'ta yoksa eski strict parsing geçer; scope istenen çağrıda adapter contract üretmezse host `unverified` işaretler.
- Doğrudan MCP `reviewScope` verildiğinde path listesi non-empty olmalıdır; role-based `reviewer` scope'u `files/contextFiles` üzerinden alınır ve boşsa provider çağrısı öncesi blocked olur. Prompt text'ten scope/path çıkarma yapılmaz.
- Source scope path check, UTF-8/secret/size/identity hatasında provider başlamaz; contract `sourceScopeStatus=blocked`, `sourceDeliveryStatus=not_attempted`, `reviewEligibility=unavailable` döner. Kaynak content ve path hata/metrics/loglara yazılmaz.
- Metrics projection `reviewContract` içinde yalnız digest/status/count/byte alanlarını taşır; `metrics` ve `recent-runs` round-trip testi geçti. MCP structuredContent değişikliği smoke ile doğrulandı.
- Source bundle hiçbir model-declared `filesRead`/verdict iddiasını kanıt saymaz; ana orkestratör semantic bulguları ayrı değerlendirir.

### Faz 2 — Hata taksonomisi, retry ve redakte telemetry

Durum notu (2026-10-10): Ana işlem stage/provider sınıfları, allowlist'li OS error code ve web-evidence failure subtype attempt telemetrisine eklendi; DeepSeek operational failure mesajı schema failure'dan ayrıldı. `schema_invalid`/`output_parse_invalid`/`empty_output` artık operasyonel retry/fallback sınıfı değildir; bounded schema repair kendi counter/stop reason'ı ve shared global attempt/cost cap'i kullanır. Web carrier repair ayrı stop reason ile korunur. Writer ve recent-runs round-trip testleri kapsar.

Amaç: spawn, sandbox, provider ve sonuç doğrulama hatalarını aynı “exit 1” veya “schema invalid” açıklamasına indirmemek.

İşler:

1. Hata sınıflarını `process_spawn`, `sandbox_setup`, `workspace_read`, `provider_auth`, `provider_rate_limit`, `provider_process_exit`, `result_parse`, `schema_invalid`, `evidence_invalid` ve `cancelled` şeklinde ayır; dış API eski sınıflara sürümlü uyumlulukla map edilir.
2. `error.code` için allowlist uygula (ör. `ENAMETOOLONG`, `E2BIG`, `ENOENT`, `EACCES`); exit code, signal, providerCode ve failureStage alanlarını her attempt'te doldur. Stderr yalnız boyut kovası ve onaylı sınıf olarak ölçülür; raw stderr loglanmaz.
3. `deepseek.js` checkpoint'inde runtime `ok:false` ise operational failure result üret; “structured output validation failed” yalnız process başarılı olup result validator reddettiğinde kullanılsın.
4. `bridge-runtime.js:268-278` içindeki mevcut `classifyWebEvidenceValidationFailure` alt sınıflarını (`provider_result_missing`, `source_url_rejected`, `excerpt_rejected`, `carrier_missing_or_malformed`, `carrier_fields_invalid` ve diğer mevcut değerler) kaynak kabul et. Yeni adlandırma taksonomisi üretmek yerine sınıflandırmayı mesajdan ayrı, allowlist'li yapılandırılmış attempt diagnostic alanına taşı; raw carrier loglama.
5. `retryStopReasonValues` ve reader schema'larını runtime'ın ürettiği web evidence stop reason'larıyla eşleştir. Metrikte düşürülmeden kalıp kalmadığını round-trip testiyle doğrula.
6. Provider/process retry'larını `rate_limited/server/network/timeout` gibi geçici operasyonel sınıflarla sınırla; `process_exit`, auth, permission, transport size ve sandbox setup için kör retry ekleme. Bundan ayrı olan `schema_invalid`, `output_parse_invalid`, `empty_output` ve `web_evidence_invalid` response-repair davranışını mevcut `retry.js:28-30` ve `maxSchemaRepairAttempts` politikasına göre açıkça tanımla; bunları aynı retry sınıfı/bütçesi gibi sunma ve mevcut davranışı değiştirmeyi ayrı karar kapısına bağla.

Kabul kriterleri:

- Stublanmış `spawn` hataları ve provider non-zero exit farklı `failureClass/failureStage` üretir.
- `rate_limited` ardından `process_exit` iki ayrı attempt olarak kalır; ikinci hata sonrası stop edilir.
- DeepSeek process exit, schema invalid gibi sunulmaz.
- Web evidence stop reason'ları metrics writer ve recent-runs okuyucudan kayıpsız geçer; prompt/yanıt içeriği loglanmaz.
- Web evidence tanı metriği mevcut `classifyWebEvidenceValidationFailure` allowlist değerlerinden birini korur; bilinmeyen/ham provider metni telemetry alanına geçmez.

### Faz 3 — Windows sandbox başlangıç/erişim readiness ve kontrollü pilot

Durum notu (2026-10-09): Antigravity live probe'u model erişimini ve yalnız host sentinel'i okuyan trusted workspace erişimini `available` doğruladı. `sandboxStartup=not_probed` kaldı; bu read-only probe terminal tool'u çalıştırmadı. Probe USD tutarı ölçülemedi; provider çağrı kapsamı kullanıcı tarafından en fazla iki çağrı olarak onaylandı. Güvenli ölçüm sınırı ve ilgili resmi Windows/headless belgeleri üst durum notunda kayıtlıdır.

Amaç: Windows ortamı review görevini çalıştıramıyorsa bunu büyük, çok kaynaklı görev gönderilmeden önce tespit etmek.

İşler:

1. CLI kurulu/versiyon/auth, model erişimi, araçsız cevap, Windows sandbox startup ve workspace read'i ayrı readiness alanları yap. “Adapter supportsSandbox” statik beyanını canlı sandbox capability'si olarak gösterme.
2. Sandbox hata çıktısını sınıflandır; kullanıcıya yalnız gerekli Windows sürümü, seçili sandbox implementation ve log konumu gibi redakte edilebilir teşhis ver. `sandbox.log` veya OS event log içeriğini kendiliğinden OpenCode session'a yükleme.
3. Readiness başarısızsa yalnız aynı izinlerle kısa ve sınırlı retry/probe yap; `--dangerously-bypass-approvals-and-sandbox`, unrestricted mode veya genel workspace ACL genişletmesi kullanma.
4. Provider pilotu ancak sentetik testler geçtikten, bütçe/çağrı kapsamı ayrıca kullanıcı tarafından onaylandıktan ve disposable repo içinde çalıştıktan sonra planlansın. Pilot çıktısı model erişimi/tek sentinel read kanıtıdır; tam review veya billing doğrulaması değildir.

Kabul kriterleri:

- Windows sentinel testinde helper refresh/kernel failure `sandbox_setup` ya da `workspace_read` olarak ayrılır; content review başlamaz.
- Model auth veya CLI health başarısızlığında workspace permission bypass denenmez.
- Pilotun edit, shell ve network erişimi açıkça sınırlandırılır; sonuç testten ayrı redakte live observation olur.

## Sıralama, bağımlılıklar ve karar kapıları

1. Faz 0 transport mini-spec'i ve 39,001 code-unit sentetik Codex prompt testi; bu test limit belirlemez, yalnız stdin'in promptu argv'den çıkardığını doğrular.
2. Faz 2'nin process taxonomy kısmı, Faz 0 ile paralel yapılabilir; DeepSeek output wording ve retryStopReason schema işleri bu fazdadır.
3. Faz 1 host review contract'ı Faz 0/2 failure türlerini kullanır, bu nedenle önce sözleşme mini-spec'i onaylanır.
4. Faz 3 readiness probe'u result contract ile bütünleşir; canlı provider pilotu son aşamadır.
5. Codex stdin bu planın varsayılan uzun-prompt transport'udur; OpenCode positional argv yalnız upper-bound preflight içinden geçerse kullanılır. OpenCode attachment/API bu planın dışında kalır. `parallelBatch.enabled`, `editEnabled` ve sandbox policy gate'leri bu planla kendiliğinden açılmaz.

## Araştırmayla belirlenen doğrulama boşlukları

- Faz 0 için repository'de Windows command-line UTF-16 upper-bound, Codex stdin transport ve OpenCode over-limit fail-fast davranışını kapsayan hedefli regresyon testleri bulunmadı. Yeni testler provider network çağrısı olmadan fixture/stub ile çalışmalı. OpenCode `--file`/API provider parity testleri mevcut plan scope'u değildir.
- Antigravity capability testleri temp workspace sentinel'ini doğrular; trusted workspace path/ACL gate'ini doğrulayan eşdeğer test bulunmadı. Yeni test bu iki probe target'ını ayrı sonuç olarak doğrulamalı.
- Web-evidence runtime testleri stop reason üretimini kapsar; metrics writer'dan recent-runs reader'a kalıcı round-trip doğrulaması eksik. `retryStopReasonValues` enum uyumsuzluğu var olan davranışta telemetry kaybı oluşturur.
- `classifyWebEvidenceValidationFailure` zaten birden fazla alt sınıf üretiyor; planın önceki üçlü adlandırması mevcut sınıflarla hizalı değildi. Yapılacak iş taxonomy'yi çoğaltmak değil, mevcut allowlist'i ayrı yapılandırılmış ve redakte bir diagnostic alanından uçtan uca taşımaktır.
- `retry.js:isRetryableFailure` geçici process/provider retry'larına ek olarak `output_parse_invalid`, `empty_output`, `schema_invalid` değerlerini kapsıyor. Transport retry ve bounded response/schema repair farklı döngüler olarak tasarlanmalı ve test edilmelidir.
- Antigravity sandbox helper/kernel hatalarının `sandbox_setup` ile `workspace_read` ayrımını ve Phase 3 readiness sonucunu doğrulayan hedefli regresyon testi bulunmadı.
- Yeni host result envelope alanlarının tanım ve enum semantiği Faz 1 kabul kriterlerinde sabitlenmiştir; implementasyon mevcut strict `subagentResultSchema` ve metrics sanitizer'a optional alan olarak eşlenmeli, eski istemci uyumluluğu korunmalıdır. `structuredContent` değişikliği backward-compatibility fixture ve `npm run smoke` ile doğrulanmalıdır.

Beklenen test hedefleri: Windows command-line upper bound ve Codex stdin için mevcut `tests/faz-3-codex.test.js` çevresinde provider-free fixture; OpenCode positional over-limit fail-fast için `tests/faz-3-opencode.test.js`; capability status/scope ayrımı için `tests/antigravity-capability-probes.test.js` ve `tests/provider-capability-probes.test.js`; web-evidence kalıcı round-trip için `tests/web-evidence-runtime.test.js`, `tests/metrics-telemetry.test.js` ve `tests/recent-runs.test.js`; DeepSeek operational-vs-schema error için yeni adapter-level fixture coverage; readiness sınıflandırması için Antigravity diagnostic/runtime testleri. OpenCode `--file`/Server API testleri bu plan için test hedefi değildir.

## Riskler ve açık kararlar

- 39.001 karakter ölçümü session metadata'sıdır; tam argv serialization ve OS'un reddettiği alan saklı değildir. Geçmiş ENAMETOOLONG vakasının exact root cause'u iddia edilmez; yeni preflight gerçek argv input'una muhafazakâr üst sınır uygular.
- OpenCode CLI v1.18.35 `--file` yolu açık kullanıcı attachment'ını modele bağlam olarak hazırlarken `read` tool permission sorusunu ve cwd guard'ını atlar; API yolu deneysel, local `run` ile aynı transport değildir ve session API raw tool output döndürür. İkisi bu plan kapsamında reddedilmiştir; ileride ihtiyaç doğarsa ayrı threat/privacy tasarımı gerekir.
- Process/response state envelope'ı public MCP şemalarına dokunursa strict schema ve smoke geriye uyumluluğu değerlendirilmelidir.
- Geçmiş Gemini web-evidence hatasının ham shape'i saklanmamıştır; bu plan eski ham payload'u yeniden üretmeyi hedeflemez, yalnız mevcut host validator taxonomy'sini synthetic fixture'larla test eder.
- Codex Windows sandbox docs'taki daha yeni uygulama özellikleri kurulu Codex CLI 0.159.2'ye otomatik uygulanabilir kabul edilmez; sürüm uyumu ayrı doğrulanmalıdır.
- OpenCode `run --file` local path'i synthetic user message'a read output eklerken `ask`/cwd kontrollerini atlar; `run --attach` dosya içeriğini data URI ile karşı server'a taşır. `run --format json` child tool events'i filtreler. Bu üç behavior v1.18.35 source'ta doğrulanmış ve bu planın implementation scope'u dışında bırakılmıştır.
- Codex `exec --json` için read event ve child-thread item yokluğu official 0.159.2 release tag'indeki item şeması, JSONL projection ve `should_process_notification` filtresiyle doğrulanmıştır. Ayrı app-server `thread/read` saklı turn item'larını ve `thread/list` alt/ancestor filtrelerini sağlayabilir; parent/ancestor filtreleri experimental API opt-in gerektirir. `CommandAction::Read` best-effort parser'dır; thread history host'a command/output/action kaydı verir ama authoritative OS read attestation veya model-consumption proof sağlamaz. Bu nedenle app-server custom driver bu planın dışında kalır; mevcut `reviewEligibility` fail-closed unverified davranır.
- Antigravity'nin `workspaceRead=available` probu temp dizin için geçerlidir. Trusted workspace ACL/read gate'inin mevcut olduğu anlamına gelmez; yeni sonuç alanı probe hedefini (`temp_workspace`/`trusted_workspace`) ayırt etmelidir.
- Tool-free headless yanıtı, `--sandbox` verilmiş olsa bile terminal command'ın OS sandbox içinde çalıştığını göstermez. `sandboxStartup=available` yalnız açık `run_command` tool event'i ve başarılı sandboxed command sonucu host tarafından doğrulanabildiğinde verilmelidir; bu kanıt yoksa `not_probed` korunur. Windows permission/headless davranışında soft-denied command `unavailable` değil `not_probed` veya uygun izin sınıfı olarak ayrılır.
- OpenCode attachment veya API gelecekte tekrar değerlendirilecek olursa host permission, raw session retention ve child cleanup için ayrı privacy/threat planı ve açık onay gerekir; bu plan o yolları çalıştırmaz.
- Bu planı uygulamak DeepSeek checkpoint/output davranışını değiştirirse `npm run pilot` controlled pilot kapısı, MCP sözleşmesi değişirse `npm run smoke` gerekir; genel kod/orkestrasyon değişikliklerinde `npm test`, `npm run verify` ve `npm run verify:ci` çalıştırılır. Test sayısı sabit hedef değildir.

## Kaynaklar

- Olay ve ölçüm özeti: `docs/reports/subagent-failure-architecture-review-2026-10-08.md`.
- GPT-6.1-Sol yerel mimari tavsiyesi, 2026-10-08: mevcut adapter architecture korunmalı; provider-specific transport, capability preflight ve host result contract eklenmeli. Sol danışmanlığı uygulama onayı değildir.
- Microsoft, `CreateProcessW`: https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-createprocessw — 2026-10-09 UTC.
- Node.js v24 `child_process`: https://nodejs.org/docs/latest-v24.x/api/child_process.html — 2026-10-09 UTC.
- libuv `uv_process_t`: https://docs.libuv.org/en/v1.x/process.html — 2026-10-09 UTC.
- Codex non-interactive mode: https://developers.openai.com/codex/non-interactive-mode/ — 2026-10-09 UTC.
- Codex Windows sandbox: https://developers.openai.com/codex/windows/windows-sandbox/ — 2026-10-09 UTC.
- OpenCode CLI: https://opencode.ai/docs/cli/ — 2026-10-09 UTC.
- OpenCode server API: https://opencode.ai/docs/server/ — 2026-10-09 UTC.
- OpenCode permissions: https://opencode.ai/docs/permissions/ — 2026-10-09 UTC.
- OpenAI Structured Outputs: https://platform.openai.com/docs/guides/structured-outputs — 2026-10-09 UTC.
- OpenCode v1.18.35 `run` kaynak kodu (`--file`, prompt parts, model/agent seçimi, izin akışı ve JSON event filtreleri): https://raw.githubusercontent.com/anomalyco/opencode/v1.18.35/packages/opencode/src/cli/cmd/run.ts — 2026-10-09 UTC.
- OpenCode v1.18.35 session API kaynak kodu (child session, messages, abort): https://raw.githubusercontent.com/anomalyco/opencode/v1.18.35/packages/opencode/src/server/routes/instance/httpapi/groups/session.ts — 2026-10-09 UTC.
- OpenCode v1.18.35 FilePart prompt resolver (permission callback and synthetic message conversion): https://raw.githubusercontent.com/anomalyco/opencode/v1.18.35/packages/opencode/src/session/prompt.ts — 2026-10-09 UTC.
- OpenCode v1.18.35 read-tool permission checks and truncation metadata: https://raw.githubusercontent.com/anomalyco/opencode/v1.18.35/packages/opencode/src/tool/read.ts — 2026-10-09 UTC.
- OpenCode v1.18.35 child-session removal behavior: https://raw.githubusercontent.com/anomalyco/opencode/v1.18.35/packages/opencode/src/session/session.ts — 2026-10-09 UTC.
- OpenCode v1.18.35 `serve` warning and startup: https://raw.githubusercontent.com/anomalyco/opencode/v1.18.35/packages/opencode/src/cli/cmd/serve.ts — 2026-10-09 UTC.
- OpenCode Server dokümantasyonu (loopback default, Basic Auth seçenekleri, session/message/abort API): https://opencode.ai/docs/server/ — 2026-10-09 UTC.
- Codex non-interactive mode (`codex exec -`, `--json`, output-schema): https://developers.openai.com/codex/non-interactive-mode/ — 2026-10-09 UTC.
- Codex exec JSONL item schema, upstream `main` (sürüm sabitlemesi değildir; item türleri ve structured output'un agent-authored olması): https://raw.githubusercontent.com/openai/codex/main/codex-rs/exec/src/exec_events.rs — 2026-10-09 UTC.
- Codex JSONL projection, upstream `main` (sürüm sabitlemesi değildir; hangi item alanlarının dışarı aktarıldığı): https://raw.githubusercontent.com/openai/codex/main/codex-rs/exec/src/event_processor_with_jsonl_output.rs — 2026-10-09 UTC.
- Codex v0.159.2 release: https://github.com/openai/codex/releases/tag/rust-v0.159.2 — tag dereference SHA `ff6aec96948b70d94983af2641a6b67c94faeff5`, kontrol: 2026-10-09 UTC.
- Codex v0.159.2 CLI argümanları (`-` stdin, `--json`, `--ephemeral`): https://raw.githubusercontent.com/openai/codex/rust-v0.159.2/codex-rs/exec/src/cli.rs — erişim: 2026-10-09 UTC.
- Codex v0.159.2 exec JSONL item şeması: https://raw.githubusercontent.com/openai/codex/rust-v0.159.2/codex-rs/exec/src/exec_events.rs — erişim: 2026-10-09 UTC.
- Codex v0.159.2 app-server item schema (`CommandAction::Read`, `command_actions`): https://raw.githubusercontent.com/openai/codex/rust-v0.159.2/codex-rs/app-server-protocol/src/protocol/v2/item.rs — erişim: 2026-10-09 UTC.
- Codex v0.159.2 JSONL projection: https://raw.githubusercontent.com/openai/codex/rust-v0.159.2/codex-rs/exec/src/event_processor_with_jsonl_output.rs — erişim: 2026-10-09 UTC.
- Codex v0.159.2 exec thread/turn notification filtresi: https://raw.githubusercontent.com/openai/codex/rust-v0.159.2/codex-rs/exec/src/lib.rs — erişim: 2026-10-09 UTC.
- Codex v0.159.2 app-server thread/list and thread/read protocol schema: https://raw.githubusercontent.com/openai/codex/rust-v0.159.2/codex-rs/app-server-protocol/src/protocol/v2/thread.rs — erişim: 2026-10-09 UTC.
- Codex App Server protocol and production-support guidance: https://developers.openai.com/codex/app-server/ — erişim: 2026-10-09 UTC.
- Node.js v24.17.0 Windows libuv process serialization (`quote_cmd_arg`, `make_program_args`): https://raw.githubusercontent.com/nodejs/node/v24.17.0/deps/uv/src/win/process.c — yerel runtime `process.versions.uv=1.52.1`, erişim: 2026-10-09 UTC.
- Node.js v20.9.0 minimum-engine Windows libuv argv upper-bound implementation: https://raw.githubusercontent.com/nodejs/node/v20.9.0/deps/uv/src/win/process.c — erişim: 2026-10-09 UTC.
- Node.js v22.0.0 Windows libuv argv upper-bound implementation: https://raw.githubusercontent.com/nodejs/node/v22.0.0/deps/uv/src/win/process.c — erişim: 2026-10-09 UTC.
- OpenCode v1.18.35 network defaults: https://raw.githubusercontent.com/anomalyco/opencode/v1.18.35/packages/opencode/src/cli/network.ts — erişim: 2026-10-09 UTC.
- OpenCode v1.18.35 Server Auth: https://raw.githubusercontent.com/anomalyco/opencode/v1.18.35/packages/opencode/src/server/auth.ts — erişim: 2026-10-09 UTC.
- OpenCode v1.18.35 API authorization middleware: https://raw.githubusercontent.com/anomalyco/opencode/v1.18.35/packages/opencode/src/server/routes/instance/httpapi/middleware/authorization.ts — erişim: 2026-10-09 UTC.
- Gemini Flash 3.7 web araştırması, OpenCode v1.18.35 transport/API incelemesi — 2026-10-09 UTC; bulgular yukarıdaki tag kaynaklarıyla ana orkestratör tarafından karşılaştırıldı.
- Gemini Flash 3.7 web araştırması, CreateProcessW/Node/libuv/Codex stdin incelemesi — 2026-10-09 UTC; Microsoft, Node.js, libuv ve Codex resmi kaynaklarıyla ana orkestratör tarafından karşılaştırıldı.
- Space Bunny Free web araştırması, host-observable read evidence incelemesi — 2026-10-09 UTC; OpenCode v1.18.35 ve Codex upstream kaynaklarıyla ana orkestratör tarafından karşılaştırıldı. Upstream `main` bulguları sürüm bağımsız garanti değildir.
- DeepSeek Pro salt-okunur yerel plan/kod denetimi — 2026-10-09 UTC; ana orkestratör kaynak satırlarını yeniden doğruladı.
- Gemini Flash 3.7 Codex v0.159.2, exact tag/source ve Windows workspace-read soruları araştırması — 2026-10-09 UTC; tag ve JSONL source bulguları ana orkestratörce resmi release/tag kaynaklarında doğrulandı. App-server/JSONL read visibility ile agent-authored claims ayrımı korunmuştur.
- Gemini Flash 3.7 OpenCode v1.18.35 FilePart, permission, session/API lifecycle araştırması — 2026-10-09 UTC; yerel `run.ts`, session route, network/auth source ile karşılaştırıldı. Özellikle API parolası ayarlanmamış durumda middleware'in auth uygulamadığı kaynakta görüldü.
- Gemini Flash 3.7 Codex app-server child-thread/read evidence araştırması ve Space Bunny Free OpenCode FilePart/permission/API lifecycle araştırması — 2026-10-09 UTC; exact tag source'ları ana orkestratörce tekrar doğrulandı.
- Google Antigravity Terminal sandbox: https://antigravity.google/docs/sandbox — erişim: 2026-10-10 UTC; Windows terminal sandbox davranışı ve `--sandbox` CLI bayrağı.
- Google Antigravity CLI Headless mode: https://antigravity.google/docs/cli/headless — erişim: 2026-10-10 UTC; JSON/stream-json tool event'leri ve headless permission soft-denial davranışı.
- Gemini 3.8 Flash web araştırması — 2026-10-10 UTC; Antigravity tool-free yanıtının terminal command sandbox'ını kanıtlamadığı hipotezi resmi Terminal sandbox ve CLI Headless belgeleriyle yerel olarak doğrulandı.
- Gemini Flash 3.7 Windows argv bütçesi derinleştirme çağrısı geçerli web-evidence ile dönmedi; bu çağrının iddiaları kullanılmadı. Microsoft/Node/libuv resmi kaynakları ve bu çalışma ortamındaki Node/libuv sürümü ana orkestratörce doğrulandı.
- DeepSeek Pro detaylı local audit çağrısı rate-limit oldu; DeepSeek Flash reviewer salt-okunur fallback incelemesi tamamlandı ve bulguları strict local schemas, adapters, retry/metrics kodundan ana orkestratörce yeniden kontrol edildi.
