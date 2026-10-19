# Antigravity Gemini Dayaniklilik Plani

- Tarih: 2026-09-10
- Durum: Is Paketleri 1-5 tamamlandi; WP4 ve WP3 Sol denetiminden APPROVED aldi; canli tool-free canary seri calistirildi
- Kapsam: AntigravityAdapter uzerinden calisan Gemini modellerinin hata siniflandirma, retry, capability ve gozlemlenebilirlik davranisi

## Kanit Ozeti

- 79 Antigravity run'i, 18 basari ve 61 basarisizlik 2026-09-10 tarihli operator gozlemidir; repository tarafindan yeniden uretilebilir guncel health garantisi degildir.
- Basarisizliklarin 60'i `process_exit` olarak siniflandi. Bu sinif, provider hatasi, arac izni, model auth veya gecici ag hatasi ayrimini yeterince tasimaz.
- Gemini 3.8 Flash, aracsiz, workspace-read ve public web-read probelarinda basarili oldu.
- Buyuk web arastirma isteklerinde `rate_limited` goruldu.
- Gemini 3.7 Flash `authentication_failure` dondu.
- `headless mode cannot prompt` ve `permission_denied` read-only izin sozlesmesi altinda beklenen fail-closed sonuclardir; provider erisimi veya model aboneligi hatasi sayilmaz.

## Hedefler

- Her provider sonucunu kararlı ve makinece okunabilir hata sinifina esle.
- Retry yalniz gecici ve guvenli read-only hatalarda calissin.
- Model erisimi, arac izni ve provider erisimi ayri capability durumlari olarak gorunsun.
- Operatör tanisi icin yeterli, prompt veya secret sizdirmayan redacted telemetry uretilsin.
- Mevcut fail-closed sandbox ve izin sinirlari korunarak guvenli degradation saglansin.

## Uygulama Durumu

- Is Paketi 1 tamamlandi: Antigravity hata siniflari runtime'a korunarak aktarilir; gercek exit code ve signal uygun oldugunda sonuc metadatasinda korunur. Antigravity nonzero ve signal sonuclari `process_exit` olarak kanoniklestirildi; diger adapter sozlesmeleri kapsam disindadir.
- Is Paketi 2 tamamlandi: Read-only gecici hatalar policy butcesiyle retry edilir; edit modu `schema_invalid` ve `output_parse_invalid` dahil tum belirsiz siniflarda `mutation_state_unknown` ile fail-closed kalir; circuit anahtari Antigravity icin provider/model bazlidir ve diger backend sozlesmeleri korunur.
- Is Paketi 3 tamamlandi ve Sol denetiminden APPROVED aldi: Health sonucu CLI kurulumu ile model anahtarli capability durumlarini ayirir. `authValid: null` degeri probe yapilmadigini ifade eder; `--version` basarisi auth basarisi sayilmaz. MCP `check_antigravity_subagent` araciligiyla opt-in `probeModels` ve `probeCapabilities` alinir; `modelAccess`, `toolFreeResponse`, `workspaceRead` ve `webRead` seri, yan etkisiz ve dusuk maliyetli calisir; probe yolu kullanici ayarlarina veya workspace'ine yazmaz ve healthCheck recovery davranisi probe sirasinda kapalidir; her capability bagimsiz raporlanir ve sonuclar health snapshot'a redakte edilerek yazilir. 20 test vakasi `antigravity-capability-probes` dosyasinda toplanmistir. Izin reddi veya policy reddi ile sonuclanan problar `not_probed` olarak raporlanir ve provider `unavailable` durumuna donusturulmez. Probe varsayilan zaman asimi 300 sn'dir ve `antigravity.probeTimeoutMs` alani ile ayarlanabilir. Canli tool-free canary kosusunda Gemini 3.8 Flash ve Gemini 3.7 Flash icin `modelAccess` ve `toolFreeResponse` available dondu; workspace-read canli probu available dondu; 3.7 auth hatasi bu kosuda tekrarlanmadi.
- Is Paketi 4 uygulandi ve Sol denetiminden APPROVED aldi: Execution metric kaydi explicit allowlist ile `execution_metric_v2` olarak yeniden kurulur; writer serbest obje spread etmez, sanitized kaydi project mirror'a verir. Attempt tanilari `failureStage`, `providerCode`, gercek `exitCode`, `signal`, `retryDecision`, `retryStopReason`, `settingsLockWaitMs`, `providerExecutionMs` ve stdout/stderr boyut kovalarini tasir. `recent-runs` strict v1/v2 okuyucusu son-attempt tanisini gosterir; tum attempt dizisi yalniz machine metric'te kalir. Bes ayri test dosyasinda 50 adversarial, sozlesme ve regresyon vakasi eklendi (`metrics-redaction-adversarial`, `metrics-v2-contract`, `recent-runs-v2`, `antigravity-diagnostics`, `runtime-telemetry-diagnosis`). `recordedAt` yalniz ISO-8601 degerleri kabul eder ve writer yonlendirmesi `Object.hasOwn` kullanir.
- Is Paketi 5 tamamlandi: Hata siniflandirma, exit/signal, edit retry guvenligi ve lock timeout regresyon testleri eklendi.

## Kapsam Disi

- `--dangerously-skip-permissions`, `command(*)` veya baska izin bypass'i eklemek.
- Sandbox, read-only veya secret redaction sinirlarini gevsetmek.
- GLM provider veya fallback davranisini degistirmek.
- Buyuk arastirma isteklerini health probe olarak kullanmak.
- Auth veya permission hatalarinda otomatik retry ya da fallback uygulamak.

## Is Paketi 1: Kanonik Hata Siniflandirma

- Hedef dosyalar: `subagent-bridge/src/adapters/antigravity-adapter.js`, `subagent-bridge/src/retry.js`, `subagent-bridge/src/runtime/bridge-runtime.js`
- Degisiklik: Antigravity hata eslemesini ortak retry siniflandirma sozlugu ile uzlastir.
- Siniflar: `rate_limited`, `authentication_failure`, `permission_denied`, `timeout`, `server`, `network`, `process_exit`, `process_error`, `output_limit`.
- Degisiklik: `429`, `rate_limited`, `RESOURCE_EXHAUSTED` benzeri sinyalleri `rate_limited`; `5xx`, `UNAVAILABLE`, `service unavailable` sinyallerini `server`; baglanti ve DNS hatalarini `network` sinifina esle.
- Guvenlik siniri: Auth, permission, policy ve bilinmeyen nonzero cikislar fail-fast kalir.
- Kabul kriteri: Runtime, adapter'in sinifini `process_exit`e indirgemez.
- Kabul kriteri: Gercek exit code ve signal redacted sonuc metadatasinda korunur.

## Is Paketi 2: Retry ve Circuit Davranisi

- Hedef dosyalar: `subagent-bridge/src/retry.js`, ilgili runtime ve policy testleri.
- Degisiklik: Yalniz `rate_limited`, `server`, `network` ve read-only timeout durumlarinda politika butcesi dahilinde capped exponential backoff ve jitter uygula.
- Degisiklik: Provider/model bazinda circuit breaker anahtarini auth ve permission sonucundan ayir.
- Guvenlik siniri: Edit modu otomatik retry edilmez; mutation-state-unknown davranisi korunur.
- Kabul kriteri: Auth ve permission hatalari tek denemede sonlanir.
- Kabul kriteri: Rate limit, server ve network fixture'lari politika siniri kadar retry edilir.
- Kabul kriteri: Tek bir modeldeki auth hatasi diger modelin capability durumunu bozmaz.

## Is Paketi 3: Capability Probe Sozlesmesi

- Hedef dosyalar: `subagent-bridge/src/adapters/antigravity-adapter.js`, server health semasi ve ilgili testler.
- Degisiklik: Genel `authValid` yerine veya yaninda ayri capability durumlari sun: CLI kurulumu, model erisimi, aracsiz yanit, workspace read ve public web read.
- Degisiklik: Her probe side-effect-free, seri, dusuk maliyetli ve opt-in olur.
- Guvenlik siniri: Permission reddi provider unavailable sonucuna donusturulmez. Probe, dosya yazmaz ve secret veya workspace yolu loglamaz.
- Kabul kriteri: `--version` basarisi auth basarisi olarak raporlanmaz.
- Kabul kriteri: Gemini 3.7 auth hatasi ve Gemini 3.8 Flash basarisi ayri capability kayitlarinda gorunur.
- Kabul kriteri: Standart `npm test` canli provider cagrisi baslatmaz.

## Is Paketi 4: Redacted Telemetri ve Operator Tanisi

- Hedef dosyalar: `subagent-bridge/src/metrics.js`, `subagent-bridge/src/recent-runs.js`, `subagent-bridge/src/runtime/bridge-runtime.js`, `subagent-bridge/src/adapters/antigravity-adapter.js`, `subagent-bridge/src/schemas/core-schemas.js` ve ilgili testler.
- Degisiklik: Execution metric kaydi serialization oncesi explicit allowlist ile yeniden kurulur; caller-provided obje veya `result.metrics` spread edilmez. Ayni sanitized kayit project mirror'a verilir.
- Degisiklik: Allowlist alanlari `failureStage`, kanonik `failureClass`, `providerCode`, gercek `exitCode`, `signal`, `retryDecision`, `retryStopReason`, `settingsLockWaitMs`, `providerExecutionMs`, stdout/stderr varligi ve boyut kovasidir.
- Asamalar: `mcp_preflight`, `settings_lock`, `settings_enforcement`, `provider_execution`, `result_parse`.
- Kapali degerler: Retry karari `retry`, `stop`, `not_applicable`; boyut kovasi `empty`, `lte_1_kib`, `lte_64_kib`, `lte_1_mib`, `gt_1_mib`; provider code yalniz tanimli normalize kodlar veya `unclassified` olabilir.
- Degisiklik: Runtime, adapter tanisini her attempt icin korur. Top-level failure tanisi son attempt'ten turetilir; `mutation_state_unknown` yalniz `retryStopReason` olur ve temel provider failure sinifini ezmez.
- Degisiklik: `recent-runs` strict execution schema ve normalizasyonu ayni release'te guncellenir. Operator gorunumu yalniz son-attempt tanisini dondurur; tum attempt dizisi yalniz machine metric'te kalir.
- Guvenlik siniri: Prompt, tool output, stderr/stdout metni, URL, workspace yolu, execution ID ve secret kaydedilmez.
- Guvenlik siniri: Ham execution ID, task ID ve workspace yasaktir; mevcut hash degerleri execution metric allowlist'inde kalabilir.
- Guvenlik siniri: Provider cikisindan serbest metin, key veya arbitrary JSON alani `providerCode`, `signal`, failure stage ya da metric alani olarak kopyalanmaz.
- Kabul kriteri: Metrik testleri tum allowlist alanlarini, writer-level forbidden key reddini ve prompt, output, URL, workspace, execution ID, task ID, secret sentinel yoklugunu dogrular.
- Kabul kriteri: `process_exit` ve siniflandirilamayan provider cikisi ayri raporlanir.
- Kabul kriteri: Yeni execution metric kayitlari recent-runs tarafindan gorunur; legacy kayitlar okunabilir kalir.

## Is Paketi 5: Regresyon Testleri

- Hedef dosya: `tests/faz-1-antigravity.test.js` ve uygun runtime/metrics testleri.
- Degisiklik: `AG-VERIFY-04` icindeki bos `assert.ok(true)` kontrolunu gercek `provider_temporary_error` siniflandirma ve retry assertion'lariyla degistir.
- Degisiklik: Tablo gudumlu hata fixture'lari ekle.
- Vaka: `RESOURCE_EXHAUSTED`, `429`, `rate_limited` -> `rate_limited`.
- Vaka: `500`, `503`, `UNAVAILABLE` -> `server`.
- Vaka: `ECONNRESET`, `EAI_AGAIN`, `fetch failed` -> `network`.
- Vaka: `UNAUTHENTICATED`, `authentication_failure`, `401` -> `authentication_failure`.
- Vaka: Headless tool redleri -> `permission_denied`.
- Vaka: Bilinmeyen nonzero exit -> `process_exit` ve fail-fast.
- Kabul kriteri: Her sinifin retry veya fail-fast karari deterministik testle korunur.
- Kabul kriteri: `npm test` ve `npm run verify` basarilidir.

## Uygulama Sirasi

1. Is Paketi 1 ve 5'i ayni degisiklikte tamamla.
2. Is Paketi 2 ile yeni siniflarin retry ve circuit davranisini bagla.
3. WP4 icin v1 execution metric okuyucusunu korurken kapali enumlu `execution_metric_v2` semasini ekle; writer, recent-runs, mirror ve adversarial redaction testlerini ayni release'te atomik uygula.
4. Is Paketi 3'u ayri opt-in probe girdisi ve model anahtarli sonuc semasiyla ilerlet: once tool-free model erisimi, sonra workspace-read, en son public-web-read. Her capability digerinden bagimsiz raporlanir.
5. Degisiklikleri Terra ile kod denetimine, kritik hata davranisini Sol incelemesine ver.

## Dogrulama Sirasi

1. Ilgili adapter, retry ve metrics testlerini calistir.
2. `npm test` calistir.
3. `npm run verify` calistir.
4. MCP semasi degisirse `npm run smoke` calistir.
5. Kullanici onaylarsa seri calisan, aracsiz Gemini 3.8 Flash capability canary'si calistir.

## Kaynaklar

- IETF RFC 9457: https://www.rfc-editor.org/rfc/rfc9457
- Google AIP-193: https://google.aip.dev/193
- Google AIP-194: https://google.aip.dev/194
- AWS Exponential Backoff and Jitter: https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
- Azure Circuit Breaker Pattern: https://learn.microsoft.com/azure/architecture/patterns/circuit-breaker
- OWASP Logging Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
