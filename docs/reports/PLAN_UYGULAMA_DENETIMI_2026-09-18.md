# Plan Uygulama Denetimi (2026-09-18)

Tarih: 2026-09-18
Durum: incelendi
Amaç: İlk beş planın projeye ne ölçüde uygulandığını kanıta dayalı olarak denetlemek, açık maddeleri sınıflandırmak ve kapatma koşullarını kayıt altına almak.
Kapsam: `docs/plans/yapilanlar/RECENT_RUNS_GOZLEMLENEBILIRLIK_PLANI.md`, `docs/plans/yapilanlar/ORKESTRASYON_GELISTIRME_PLANI.md`, `docs/plans/yarim-kalanlar/ORKESTRASYON_GELISTIRME_PLANI_V2.md`, `docs/plans/yapilanlar/MODEL_KIMLIGI_VE_ERISIM_MODU_PLANI.md`, `docs/plans/yapilanlar/DEEPSEEK_EDIT_PILOT_VE_MIRROR_KARARLILIK_PLANI.md`.
Kapsam dışı: `docs/plans/yarim-kalanlar/PLAN_IKINCI_BEYIN_V3_DESEN_UYARLAMASI_2026-09-18.md` (güncel plan), arşivlenmiş veya açıkça reddedilmiş maddelerin yeniden açılması.
Hazırlayan: Ana orkestratör.
Doğrulayan: GPT-5.6 Sol (salt-okunur bağımsız denetim). Sonuç: APPROVED; düzeltme ve yeniden doğrulama turları tamamlandı. Sonraki ek notlar append-only olarak dosya sonuna eklenmiştir.

## Yönetici Özeti

Denetlenen beş planın ikisi tamamlanmıştır; birinin P0 ve Faz 1-3 maddeleri tamamlanmıştır, reddedilen maddeleri uygulanmamıştır, ölçüm/karar kapısı bekleyen yol haritası açıktır; birinin karar kapısı veri yetersizliği nedeniyle geçici NO-GO olarak kayda geçirilmiştir; biri dış bağımlılık nedeniyle beklemededir. Kabul kriteri izlenebilirliği aşağıdaki eşleme bölümündedir.

- Plan 1 (Recent Runs): tamamlandı.
- Plan 2 (Orkestrasyon Geliştirme): adı geçen P0 ve Faz 1-3 alt maddeleri uygulandı; P0 maddelerinin tamamı ile Faz 1A/1B/1C/1D/2A/2B/2C/3A/3B kod ve doğrudan testle kapanmıştır; reddedilen maddeler uygulanmadı, ölçüm/karar kapısı bekleyen yol haritası açıktır.
- Plan 3 (V2): rol politikası ve Faz 4 enstrümantasyonu uygulandı; karar kapısı veri yetersizliği nedeniyle geçici NO-GO olarak kayda geçirildi ve Faz 5-7 kapalıdır.
- Plan 4 (Model Kimliği): Faz 1-3 uygulandı; Faz 4 native Claude edit kabulü kimlik doğrulaması nedeniyle dış-bağımlı.
- Plan 5 (DeepSeek Edit Pilotu): kod ve testler uygulandı; operasyonel kabul kanıtı bu denetimde canlı pilot ile alındı.

Plan 3 Faz 4 karar kapısı veri yetersizliği nedeniyle NO-GO olarak kayda geçirilmiştir; 110 edit geri bildirimi etiketsiz beklemektedir ve etiketleme kullanıcı sorumluluğundadır. Dokümanlardaki test ve araç sayaçları oluşturulma tarihine ait olup güncel değildir; bu raporda tarihsel bağlamda ele alınmıştır.

Yerel doğrulama kanıtı: `npm test` 538/538 PASS, `npm run verify:ci` PASS, `npm run smoke` PASS, `git diff --check` temiz.

## Kanıt Ve Bulgular

### VERIFIED: Plan 1 (Recent Runs) tamamen uygulanmıştır

Kanıt:

- `package.json` içinde `runs:recent` (`scripts/report-recent-runs.js`) ve `runs:mirror` (`scripts/manage-project-logs.js`) tanımlıdır.
- `tests/recent-runs.test.js:186-210` mirror `{ written, reason }` sözleşmesini ve `disabled`/`unsafe_path` ret nedenlerini doğrular; `tests/recent-runs.test.js:261` modül yolunu `import.meta.url` ile çözer; `tests/recent-runs.test.js:281` sekiz eşzamanlı child yazımını doğrular.
- Mirror bu repoda kapalıdır; plan bunu opt-in olarak tasarlamıştır.

Etkisi: Proje-local mirror eksikliği bir boşluk değildir; varsayılan politika gereğidir.

### VERIFIED: Plan 2'nin adı geçen P0 ve Faz 1-3 maddeleri uygulanmış ve doğrudan testle kapanmıştır

Kanıt:

- P0 hafıza mutation kilidi: `subagent-bridge/src/memory.js:472` (`withExclusiveFileLock`), mutation çift kilidi `subagent-bridge/src/memory.js:511-517` (`withMemoryMutationLocks`/`withMemoryMutationLock`), audit kilidi `subagent-bridge/src/memory.js:521` (`withMemoryAuditLock`), sahip okuma `subagent-bridge/src/memory.js:119` (`readLockOwner`), süre dolumu onayı `subagent-bridge/src/memory.js:326-327` (`acknowledgeExpiredMemory`).
- Graceful shutdown: `subagent-bridge/src/services/execution-service.js:71-74` (`gracefulShutdownMs` ve `stdin.end`), süreç ağacı öldürme `subagent-bridge/src/services/execution-service.js:138`.
- Circuit breaker: `subagent-bridge/src/services/provider-circuit-breaker.js:64-131` içinde `closed/open/half_open` durumları ve `probeUntil` tek prob davranışı.
- Full jitter ve rate-limit geri çekilmesi: `subagent-bridge/src/retry.js:32-37` (`rate_limited` için çarpan 4 ve 0.5-1.0 jitter, diğerleri için tam jitter).
- Retrieval değerlendirme: `config/memory-evaluation.json` içinde 25 vaka; `subagent-bridge/src/memory-evaluation.js:56-108` içinde `precision` (`relevant/cutoff`) düzeltmesi ve `options.retriever` ile strateji injection.
- Bütçe ve circuit görünürlüğü: `check_subagent_bridge` aracı bütçe rezervasyonu ve provider devre durumunu döndürür (`subagent-bridge/src/frontends/mcp/server.js:351`).
- Faz 2 taslak yaşam döngüsü ve promotion: `stage draft/published`, `includeDrafts`, `drafts` kategorisi, `promote_memory` çift kilit ve idempotency testleri.
- Faz 3: `health_snapshot` kayıtları ve metrik ayrımı, `memory:prune-audit` komutu.
- Doğrulama koruması: `scripts/verify-project.js:79-80` codex null guard; `scripts/smoke-mcp.js:63` beklenen araç listesinde `check_subagent_bridge`.

Kapsam sınırı: Bu bulgu yalnız yukarıda adı geçen alt maddeleri doğrular; planın tüm kabul kriterlerinin eşlemesi aşağıdaki "İzlenebilirlik Eşlemesi" bölümündedir.

Etkisi: Plan 2'nin adı geçen P0 ve Faz 1-3 maddeleri üretimde çalışır ve doğrudan testle kapanmıştır; P0-5, P0-9 ve P0-12 açıkları kapatılmıştır.

### VERIFIED: Plan 2 yol haritası ve reddedilen maddeler bilinçli olarak uygulanmamıştır

Kanıt:

- FTS5, A2A, MCP Tasks, semantik cache ve çoklu-agent consensus için `subagent-bridge` altında kod eşleşmesi bulunmamıştır.
- Negatif arama kapsamı: `subagent-bridge` dizininde `fts5|FTS5|a2a|A2A|tasks/get|semantic_cache|semanticCache|consensus|multi-agent|multi_agent|multiAgent` kalıbı arandı; köprü kaynağında eşleşme yoktur, ifadeler yalnız plan ve araştırma belgelerinde geçmektedir.
- Bu maddeler plan içinde backlog veya reddedilen başlıklar altındadır.

Etkisi: Bunlar teslim açığı değil, ölçülmüş ihtiyaç doğana kadar kapatılan kapsam dışı maddelerdir. Etiket: reddedildi / tasarım gereği beklemede.

### VERIFIED: Plan 3 rol politikası ve Faz 4 enstrümantasyonu uygulanmıştır

Kanıt:

- `package.json` içinde `edit:feedback` ve `routing:feedback` komutları tanımlıdır.
- Edit geri bildirimi ve yönlendirme geri bildirimi toplama katmanı `subagent-bridge/src/metrics.js:477` ve devamında uygulanmıştır.

Etkisi: Faz 4 karar kapısının veri toplama altyapısı hazırdır.

### VERIFIED: Plan 3 Faz 5 izole worktree edit aracı uygulanmamıştır

Kanıt:

- `run_isolated_edit_subagent` ve Git worktree akışı yalnızca `docs/plans/yarim-kalanlar/ORKESTRASYON_GELISTIRME_PLANI_V2.md` metninde geçmektedir; kaynak kodda karşılığı yoktur.
- Negatif arama kapsamı: tüm depoda `run_isolated_edit_subagent|worktree|isolated_edit` kalıbı arandı; eşleşmeler plan ve araştırma belgeleri ile `context.worktree` doğrulamasına aittir, izole edit aracına ait kod yoktur.
- Mevcut kontrollü edit yolu farklı bir mekanizmadır (`run_deepseek_edit_pilot`, disposable workspace ve doğrulanmış promotion).

Etkisi: Faz 5 bir teslim açığıdır ancak bilinçli olarak Faz 4 karar kapısının arkasındadır. Etiket: karar kapısı.

### VERIFIED: Plan 4 Faz 1-3 uygulanmış, Faz 4 dış-bağımlıdır

Kanıt:

- Sonuç sözleşmesi `requestedModel`, `resolvedModel` ve `accessMode` taşır; `defaultMode`/`allowedModes` fail-closed uygulanır.
- OpenCode read-only ve edit agent ayrımı, Codex/Antigravity explicit mod kullanımı ve Claude prompt sözleşmesi testlerle kapsanmıştır.
- Native Claude edit acceptance provider kimlik doğrulaması beklemektedir; health çıktısında Claude auth geçerli değildir.

Etkisi: Faz 4 kod açığından çok dış kimlik doğrulama engelidir. Etiket: dış-bağımlı.

### VERIFIED: Plan 5 kod ve testlerle uygulanmış, operasyonel kabul 2026-09-18'de alınmıştır

Kanıt:

- `run_deepseek_edit_pilot`, `deepseek-edit` agent, disposable workspace servisi (boyut, traversal, link, hard-link, binary, hassas dosya ve secret kontrolleri, sibling escape, container temizliği) ve RUNS-10 düzeltmeleri mevcuttur.
- Metric lock iki aşamalı sahiplik ve token doğrulaması kullanır (`subagent-bridge/src/metrics.js`).
- Canlı pilot `npm run pilot:edit:deepseek`: `status=completed`, `accessMode=edit`, `cleanupCompleted=true`, `applied=false` (önizleme, ana çalışma alanı değişmedi), `executionIdHash=29ec1699587e6df8`, `changeSetHash=c74c061525f81d7a`.
- Canlı kabul `npm run accept:edit:deepseek`: `status=completed`, `applied=true`, `cleanupCompleted=true`, `accepted=true`, `executionIdHash=f01612a97d271038`, `changeSetHash=94ab4ec8f9213ff0`. Kabul betiği eklenen `subtract` fonksiyonunu ve korunan `sum` fonksiyonunu kaynakta doğrular.
- Geçici kabul çalışma alanı kalıntısı yoktur; `pilot-workspace` yalnız `src`, `tests`, `package.json` içerir.

Etkisi: Sol'un işaret ettiği operasyonel kabul boşluğu kapanmıştır. Etiket: tamamlandı.

### VERIFIED: Doküman sayaçları tarihseldir ve güncel değildir

Kanıt:

- `docs/plans/yapilanlar/MODEL_KIMLIGI_VE_ERISIM_MODU_PLANI.md:15` güncel regresyon olarak 264/264 bildirir.
- `docs/plans/yapilanlar/ORKESTRASYON_GELISTIRME_PLANI.md` doğrulama bölümü ve test tabanı 253 ve 264 civarıdır; MCP araç listesi güncel araç sayısından küçüktür.
- `docs/plans/yapilanlar/RECENT_RUNS_GOZLEMLENEBILIRLIK_PLANI.md` 234/234 tabanını anar.
- Güncel doğrulama `npm test` ile 538/538'dir.

Etkisi: Bu sayılar plandaki tarihsel bağlamdır; her planın başına güncel duruma yönlendiren durum notu eklenmiştir. Etiket: bilgi amaçlı.

### VERIFIED: Plan Bazında İzlenebilirlik Eşlemesi

- Plan 1: `runs:recent`, `runs:mirror`, `tests/recent-runs.test.js` → tamamlandı.
- Plan 2: adı geçen P0 ve Faz 1-3 testleri (`tests/memory.test.js`, `tests/optimization.test.js`, `tests/provider-failure-drill.test.js`, `tests/recent-runs.test.js`) → doğrulandı; tam kabul kriteri eşlemesi aşağıdaki "İzlenebilirlik Eşlemesi" bölümündedir; yol haritası açık.
- Plan 3: `edit:feedback`, `routing:feedback`; Faz 5 aracı yok → karar kapısı.
- Plan 4: mod ve erişim matrisi testleri; native Claude edit kabulü yok → dış-bağımlı.
- Plan 5: `pilot:edit:deepseek` ve `accept:edit:deepseek` canlı kanıtı → tamamlandı.

### VERIFIED: V2 Faz 4 karar kapısı henüz karşılanmamıştır

Kanıt:

- `npm run edit:feedback` çıktısı `pendingCount: 110` bildirir; etiketlenmiş örnek yoktur.
- Kabul ölçütü 30-50 etiketli edit örneğidir.

Etkisi: Karar kapısı insan etiketlemesi bekler. Etiket: karar kapısı.

### VERIFIED: Plan 2 ve Plan 3 kabul kriteri izlenebilirlik eşlemesi tamamlanmıştır

Kanıt: Aşağıdaki "İzlenebilirlik Eşlemesi" bölümü, Plan 2'nin 14 P0 maddesi ile Faz 1-3 alt fazlarını ve Plan 3'ün rol politikası ile Faz 4 maddelerini kabul kriteri, kod aralığı ve test referansıyla eşler.

Kapsam notu: Eşleme tamamlanmıştır ve listelenen tüm maddeler kod ve doğrudan testle karşılanır; açık `kismi` madde kalmamıştır. V2 Faz 4 veri kapısı ayrıdır ve geçici NO-GO olarak kayıtlıdır. Eşleme, kod davranışını ve test kapsamını birlikte kaydeder.

## İzlenebilirlik Eşlemesi

Format: kabul kriteri; kod aralığı; test referansı; durum (`tam` kabul kriteri kod ve doğrudan testle karşılanır; `kismi` kodda veya doğrudan testte açık vardır).

Plan 2 (ORKESTRASYON_GELISTIRME_PLANI) P0 maddeleri:

- P0-1 leaseHeartbeatMs: heartbeat koordinatöre geçer, stale eşiği ölçülür; `subagent-bridge/src/runtime/bridge-runtime.js:300-301` (wiring), `config/policy.json:343-344`; `tests/optimization.test.js` OPT-01aa (89), `tests/faz-p0-runtime.test.js` P0-LOCK-SNAPSHOT (runtime configuration wiring); tam.
- P0-2 hafıza mutation kilidi: eşzamanlı yazarlar deadlock'suz sıralanır; `subagent-bridge/src/memory.js:472` ve `:511-517`; `tests/memory.test.js:410` (promote çift kilit ve idempotency), `tests/memory.test.js` eşzamanlı aynı-hash yazımı (tek kazanan); tam.
- P0-3 audit başarısızlığı semantiği: mutation tamam, audit yazılmadı açık raporlanır, retry yok; `subagent-bridge/src/memory.js:999-1000` ve `:1075-1076`; `tests/memory.test.js:376`; tam.
- P0-4 memory_type migrasyonu: üç eski nota memory_type atanır; `memory/00_Inbox/README.md:8` ve diğer iki not; `tests/memory.test.js:188` ve `npm run memory:review`; tam (operasyonel).
- P0-5 geçersiz metadata raporu: eksik ve geçersiz alanlar ile `updated < created` sırası raporlanır; `subagent-bridge/src/memory.js:454-470` (`collectInvalidMetadata`) ve `:870`; `tests/memory.test.js:337` ve `updated<created` sıralama testi; tam.
- P0-6 precision formülü: precision = relevant/cutoff; `subagent-bridge/src/memory-evaluation.js:83,108`; `tests/memory-evaluation.test.js:8`; tam.
- P0-7 validUntil geçmiş koruması: geçmiş tarih onaysız ret, onayla soft-expired; `subagent-bridge/src/memory.js:326-327`; `tests/memory.test.js:174,226`; tam.
- P0-8 MCP graceful shutdown: önce stdin.end, grace, sonra force kill; `subagent-bridge/src/services/execution-service.js:71-74,138`; `tests/process-tree.test.js:78`; tam.
- P0-9 bütçe çift harcama koruması: lock altında reservation journal, settlement, kalıcı expiry recovery ve tek state fold (reservation/expiry/settlement/execution aynı `now` ile değerlendirilir; execution metriği rezervasyonu terminal sayar); limit admission-time budget limit olarak uygulanır ve geç settlement kaynaklı aşım `dailyOverageUsd`/`monthlyOverageUsd` ile açıkça raporlanır; `subagent-bridge/src/metrics.js` (`foldCostBudgetState`, `recoverExpiredReservations`, `periodCost`); `tests/optimization.test.js` OPT-06b/d/e/f/g, OPT-06k/l/m/n/o/p/q/r/s; tam.
- P0-10 arama ölçeklenebilirlik: 5000 not aramasında sınır korunur; `subagent-bridge/src/memory.js:743`; `tests/memory.test.js` 5000 not arama benchmark'ı; tam.
- P0-11 circuit breaker ve açık fallback: named provider fail-fast, profile yalnız tanımlı hedef, half-open tek probe ve süreçler arası state tutarlılığı; `subagent-bridge/src/services/provider-circuit-breaker.js:64-131`; `tests/optimization.test.js` OPT-03b (448), OPT-03c (süreçler arası tutarlılık), `tests/provider-failure-drill.test.js` DRILL-02 (126), `tests/faz-p0-runtime.test.js:743`; tam.
- P0-12 retry full jitter ve schema repair escalation: genel ve `rate_limited` sınıflarında tam full jitter (0-1), `rate_limited` için 4^n çarpanı, repair'a validation issues ve deneme numarası; `subagent-bridge/src/retry.js:32-37`, `subagent-bridge/src/services/retry-service.js:26`, `subagent-bridge/src/runtime/bridge-runtime.js:594-599`; `tests/reliability.test.js` full jitter testi, `tests/prompt.test.js:35`, `tests/faz-2-claude.test.js:360` (CC-VERIFY-08); tam.
- P0-13 verify-project codex null guard: codex yoksa çökme yok, unavailable rapor; `scripts/verify-project.js` (`buildCodexCheck`); `tests/verify-project.test.js` VERIFY-CODEX-GUARD; tam.
- P0-14 smoke eksik araç kapsamı: check_subagent_bridge smoke'ta doğrulanır; `scripts/smoke-mcp.js:63`; `npm run smoke`; tam.

Plan 2 (ORKESTRASYON_GELISTIRME_PLANI) Faz 1-3 alt fazları:

- Faz 1A retrieval evaluation: 25 vaka, kategori seti, qrels, metrik formatı ve eşikler; `subagent-bridge/src/memory-evaluation.js:52,56`, `config/memory-evaluation.json`; `tests/memory-evaluation.test.js:8` ve dataset/şema/kategori/eşik testi; tam.
- Faz 1B strategy injection: `options.retriever` ile strateji, raporda `strategy`; `subagent-bridge/src/memory-evaluation.js:60`; `tests/memory-evaluation.test.js:37`; tam.
- Faz 1C lock snapshot: `snapshot()` ve owner token hash'siz `check_workspace_lock`; `subagent-bridge/src/services/workspace-coordinator.js:286`; `tests/optimization.test.js` OPT-01c (188); tam.
- Faz 1D bütçe ve circuit görünürlüğü: `check_subagent_bridge` bütçe ve devre durumu; `subagent-bridge/src/frontends/mcp/server.js:351`, `subagent-bridge/src/metrics.js:759`; `tests/optimization.test.js` OPT-06f (759), `tests/faz-p0-runtime.test.js` P0-COST-VISIBILITY (açık/kapalı devre); tam.
- Faz 2A stage yaşam döngüsü: varsayılan draft, published geriye dönük, `includeDrafts`, `drafts` raporu; `subagent-bridge/src/memory.js` (`storePersistentMemory`, `searchPersistentMemory`, `reviewPersistentMemory`); `tests/memory.test.js:389,226` ve stage geçiş kuralı testi; tam.
- Faz 2B promote_memory: SHA-256 kontrollü, 00_Inbox kaynak, çift kilit, idempotent, race koruması, sınır zorlaması ve `PROMOTE` audit; `subagent-bridge/src/memory.js:1007`; `tests/memory.test.js:410,437`, `tests/memory.test.js:129` (hard link) ve promote sınır/PROMOTE audit testi; tam.
- Faz 2C konsolidasyon: exact/title/tag/shingle gruplama, draft ve expired dışı, 5000 performans; `subagent-bridge/src/memory.js:623,875`; `tests/memory.test.js:452,474` ve aynı başlık/ortak etiket/shingle testi; tam (etiket ayrıştırma regex'i `065c692` ile düzeltildi).
- Faz 3A health snapshot: `health_snapshot` kaydı ve metrikte normal run sayılmaması; `subagent-bridge/src/runtime/bridge-runtime.js:867`; `tests/metrics-telemetry.test.js:390` (WP4-HEALTH-10) ve `tests/faz-0-audit-fix.test.js` HEALTH-TTL testi; tam.
- Faz 3B log rotasyonu: `memory:prune-audit` süresi geçmiş döndürülmüş audit dosyalarını temizler; `scripts/prune-memory-audit.js`; `tests/memory.test.js:507`; tam.

Plan 3 (ORKESTRASYON_GELISTIRME_PLANI_V2) maddeleri:

- Provider rol politikası: profile bazlı rol, sessiz fallback yok, kalıcı kalite kararı için profilde en az 15 etiketli görev; `config/policy.json` profilleri ve router; `tests/config.test.js:81` (rol profilleri exact model ve edit fallback policy), `tests/optimization.test.js` OPT-03 (427), OPT-03a (433), OPT-05b (558) ve V2-DECISION-02 (routing profili 15 etiket sınırı); tam.
- Faz 4 baseline altyapısı: opaque execution hash üzerinden feedback ve beş komut; `scripts/record-edit-feedback.js`, `scripts/record-routing-feedback.js`, `subagent-bridge/src/metrics.js:549,566`; `tests/optimization.test.js` OPT-05a (504); tam.
- Faz 4 kabul kriterleri: redacted metrics sözleşmesi bozulmaz ve aggregate kayıt kimlik içermez; `subagent-bridge/src/metrics.js` feedback kayıtları; `tests/metrics-redaction-adversarial.test.js`, `tests/optimization.test.js:504` ve V2-DECISION-03 (feedback kaydı provider execution kaydını değiştirmez); tam.
- Faz 4 karar kapısı: 30-50 etiketli edit; ölçüm `npm run edit:feedback` pendingCount 110, etiketli 0; karar kaydı aşağıdadır.

## V2 Faz 4 Karar Kaydı

- Ölçülen durum (2026-09-18): 110 bekleyen edit geri bildirimi, 0 etiketli sonuç.
- Plan kuralı: "Ölçüm dönemi sonunda veri yetersizse yeni altyapı eklenmez; ölçüm dönemi uzatılır."
- Karar: geçici geçiş NO-GO'su (kalıcı performans NO-GO değil). Veri yetersiz olduğu için Faz 5 (izole worktree edit) başlatılmaz; Faz 6-7 kapalı kalır ve ölçüm dönemi uzatılır.
- Gerekçe: 30 etiketli sonucun altında istenmeyen veya geri alınan edit oranı hesaplanamaz; kapı veri olmadan karara bağlanamaz.
- Yeniden değerlendirme koşulu: en az 30 (tercihen 30-50) etiketli sonuç toplandığında oran hesaplanır; oran `%10` altında ise NO-GO korunur, `%10` ve üzerinde ve güven veya geri alma maliyeti doğrulanırsa Faz 5 prototiplenir.
- Sorumluluk: etiketleme kullanıcı kararıdır; komut `npm run edit:feedback -- accepted|minor_fix|reverted|security_concern <id>`.

## Düzeltme Ve Yeniden Doğrulama (2026-09-18)

Sorunları kapatmak için ayrı commitler:

- `0a17919` docs: plan uygulama denetimi izlenebilirlik eşlemesi ve durum notları.
- `defc703` fix: hafıza denetiminde `updated < created` sırası raporlanır (P0-5).
- `335038e` fix: maliyet rezervasyonları için kalıcı expiry kaydı ve recovery (P0-9).
- `469d458` fix: `rate_limited` için tam full jitter (P0-12).
- `eeefcb7` test: P0 ve Faz maddeleri için doğrudan izlenebilirlik testleri (P0-1, P0-2, P0-10, P0-11, P0-13, Faz 1D, Faz 2B).
- `2b98aa8` fix: maliyet bütçesi tek state fold ve tutarlı `now` ile hesaplanır; geç settlement kaynaklı aşım overage olarak raporlanır (P0-9 sağlamlaştırma).

Kapanan uygulama açıkları: P0-5 (`updated < created` kontrolü), P0-9 (kalıcı expiry kaydı, idempotent recovery ve tek fold ile tutarlı maliyet durumu), P0-12 (`rate_limited` full jitter sapması).

Kapanan test açıkları: P0-1 runtime wiring, P0-2 eşzamanlı mutation kilidi, P0-10 5000 not arama, P0-11 süreçler arası circuit tutarlılığı, P0-13 codex null guard, Faz 1D `circuitBreakerOpen`, Faz 2B promote sınır ve audit.

Bu iş sonrası doğrulama: `npm test` 556/556 PASS, `npm run verify` PASS, `npm run verify:ci` PASS, `npm run budget` PASS, `git diff --check` temiz. Bütçe garantisi, rezervasyon kabul anında geçerli admission-time budget limit olarak korunur; expiry sonrası geç gelen settlement bu sınırı aşarsa aşım sessizce yutulmaz, `dailyOverageUsd`/`monthlyOverageUsd` olarak raporlanır. Execution metriği yazılan bir çalıştırma rezervasyonu terminal sayar; settlement yazılamasa bile `activeReservations` takılı kalmaz.

İkinci tur (V2 karar hazırlığı ve V3 M0) commitleri:

- `065c692` fix: hafıza frontmatter etiket listesi ayrıştırması düzeltildi (etiket tabanlı konsolidasyon artık çalışır).
- `99467ad` test: V2 karar hazırlık testleri (direct-edit 30, routing 15) ve feedback kaydının provider execution kaydını değiştirmediği testi.
- `3924207` feat: salt-okunur `memory:doctor` akışı ve testi.
- `69e9e75` test: V3 M0 süreçler arası yayınlanmış not geri okuma testi, Faz 1A dataset/eşik, Faz 2A stage geçişi, Faz 2C başlık/etiket/shingle ve health cache TTL testleri.
- `a77c636` docs: İkinci Beyin V3 M0 state sınıflandırma raporu.

Bu tur sonrası doğrulama: `npm test` 565/565 PASS, `npm run verify` PASS, `npm run verify:ci` PASS, `npm run memory:doctor` PASS, `git diff --check` temiz.

Üçüncü tur (Sol denetimi sonrası M0 sağlamlaştırma):

- `d750d0d` feat: `memory:doctor` karantina, soft-expiry, hash bütünlüğü ve sürüm uyumu tanıları ile güvenli `disabled`/`unreadable`/`error` yolları; `findQuarantinedMemoryNotes`; plan fixture'ları test edildi.
- `db38fdd` test: gerçek stdio MCP istemci/sunucu geri okuma testi (`tests/mcp-memory-readback.test.js`); Faz 2A geçiş kurallarının tamamı (stage verilmeden korunma, draft→published ve published→draft doğrudan değişim reddi, published güncelleme).
- `5edc65a` docs: M0 state raporu veri sınıfları ve hedef dizin stratejisiyle tamamlandı.

Bu tur sonrası doğrulama: `npm test` 567/567 PASS, `npm run verify` PASS, `npm run verify:ci` PASS, `npm run memory:doctor` PASS, `git diff --check` temiz.

Dördüncü tur (doktor sağlamlaştırma):

- `7bc7b7d` fix: `memory:doctor` hash bütünlüğüne audit tabanlı `PROMOTE_RACE_CONDITION` olayları eklendi (farklı içerikli gerçek yarış), sürüm uyumluluğu `compatible` sonucu üretir, karantina taraması sınırlı byte okuması yapar ve enabled-ama-erişilemez Vault `unreadable` olarak sınıflanır.
- `386ca06` docs: M0 state raporunda audit yolu düzeltildi.

Bu tur sonrası doğrulama: `npm test` 568/568 PASS, `npm run verify` PASS, `npm run verify:ci` PASS, `npm run memory:doctor` PASS, `git diff --check` temiz.

Beşinci tur (doktor kapanış denetimi):

- `adf2e4f` fix: `memory:doctor` aktif ve döndürülmüş audit dosyalarını (`memory-events*.jsonl`) tarar; okuma/parse hataları `auditReadError`, karantina tarama hataları `quarantineScanErrorCount` ile görünür ve `attention` tetikler; kırıcı çıktı değişikliği için `schemaVersion=2`.
- Sol denetimi: APPROVED (96/100); açık kritik/yüksek/orta bulgu yok. Düşük operasyonel not: audit dosya sayısı sınırsız olduğundan `memory:prune-audit` düzenli çalıştırılmalıdır.

Bu tur sonrası doğrulama: `npm test` 569/569 PASS, `npm run verify` PASS, `npm run verify:ci` PASS, `npm run memory:doctor` PASS, `git diff --check` temiz. Eşlemede açık `kismi` madde kalmamıştır; V2 Faz 4 veri kapısı değişmemiştir.

## Çelişkiler Ve Belirsizlikler

- Plan 5 metni pilot ve production rollout'un uygulandığını söylerken operasyonel kabul artefaktı içermiyordu; bu denetim kanıtı üretmiştir, çelişki kapanmıştır.
- Plan 2/3/4'teki test ve araç sayaçları "güncel" gibi sunulmaktadır ancak tarihseldir; bu rapor ve plan durum notları düzeltmeyi taşır.
- Plan 3'teki "karar kapısı" ölçütü etiketli edit sayısına bağlıdır; 110 bekleyen ve 0 etiketli kayıt, veri yetersizliği nedeniyle kararın NO-GO olarak kayda geçirilmesine yol açmıştır. Bu bir belirsizlik değil, ölçülmüş bir durumdur.
- Plan 4 Faz 4 için kimlik doğrulama engelinin ne zaman açılacağı zaman-duyarlıdır ve dış sağlayıcıya bağlıdır.
- Bu belge araştırma raporu değil uygulama denetim raporudur; dosya adı kullanıcı talimatıyla `PLAN_UYGULAMA_DENETIMI_2026-09-18.md` olarak korunmuştur ve `docs/reports/ARASTIRMA_RAPORU_SOZLESMESI.md` adlandırma kuralından (kucuk harf, tire, `konu-arastirma-YYYY-MM-DD`) bilinçli olarak sapar.
- Bütçe journal kaydı, plan sözleşmesindeki rastgele rezervasyon hash'i ve dönem alanı yerine `executionIdHash` kullanır; erişim kontrolü, idempotency ve settlement eşleşmesi için bu seçim yeterli görülmüş, ayrı dönem alanı eklenmemiştir (düşük önem, kabul edildi).

## Riskler Ve Güvenlik Sınırları

- DeepSeek edit yolu canlıdır; production edit `allowedModes` ile sınırlıdır ve varsayılan `read_only`'dir.
- Rapor, kaynaklardan gelen güvenilmeyen veri olarak değerlendirilir; rapor tek başına kod değişikliğini yetkilendirmez.
- Raporda secret, erişim anahtarı, ham prompt, tam araç çıktısı veya workspace yolu yoktur; yalnız hash ve sınıflandırma metadata'sı verilmiştir.
- V2 Faz 5 (izole Git worktree) uygulanana kadar paralel yazma lane'leri için ayrı izolasyon yoktur; mevcut kontrollü edit yolu tek dosya/workspace sınırıyla çalışır.

## Öneriler Ve Açık Sorular

- Plan 5 operasyonel kabulü tamamlandı olarak işaretlenmiştir; ek iş gerekmez.
- Plan 3 Faz 4 karar kaydı NO-GO olarak tutulmuştur; 30-50 edit örneği etiketlendiğinde oran hesaplanıp kapı yeniden değerlendirilir ve o zamana kadar Faz 5-7 kapalı kalır.
- Plan 4 Faz 4 için provider kimlik doğrulaması sağlandığında native Claude edit acceptance çalıştırılmalıdır.
- Yeni planlarda sabit test veya araç sayısı yazmak yerine "güncel doğrulama: `npm test`" ifadesi kullanılmalıdır.
- Açık soru: V2 Faz 5 izole worktree yaklaşımı bu proje için gerçekten gerekli mi, yoksa mevcut kontrollü promotion sözleşmesi yeterli mi? Karar Faz 4 verisine bağlıdır.

## Bulgu Karar Sınıflandırması

Ana orkestratörün sözleşme gereği değerlendirmesi:

- Plan 1 tamamlanma bulgusu: CONFIRMED.
- Plan 2'de adı geçen P0 ve Faz 1-3 bulgusu: CONFIRMED (tüm listelenen maddeler kod ve doğrudan testle tam).
- Plan 2 P0 açıkları ve öncelikli test boşlukları: CONFIRMED (kapatıldı; commitlerle ve doğrulama çıktılarıyla kanıtlandı).
- Plan 2 yol haritası ve reddedilen maddeler bulgusu: CONFIRMED (kapsam dışı).
- Plan 3 Faz 5 uygulanmadı bulgusu: CONFIRMED.
- Plan 4 Faz 4 dış-bağımlı bulgusu: CONFIRMED.
- Plan 5 operasyonel kabul bulgusu: CONFIRMED.
- Doküman sayaçları tarihsel bulgusu: CONFIRMED.
- Plan 2 ve Plan 3 kabul kriteri izlenebilirlik eşlemesi: CONFIRMED (bazı maddelerde test kapsamı açığı `kismi` etiketiyle kayıtlı).
- V2 Faz 4 karar kapısının henüz karşılanmadığı bulgusu: CONFIRMED.
- V2 Faz 4 go/no-go kararı: CONFIRMED (veri yetersiz → geçici geçiş NO-GO'su; Faz 5-7 kapalı, ölçüm uzatılır).

## Kaynaklar

Yerel kod kanıtı (relative yol ve satır aralığı):

- `subagent-bridge/src/memory.js:119,326-327,472,511-517,521,623,875,999-1000,1075-1076`
- `subagent-bridge/src/services/execution-service.js:71-74,138`
- `subagent-bridge/src/services/provider-circuit-breaker.js:64-131` (`closed/open/half_open`, `probeUntil`)
- `subagent-bridge/src/services/retry-service.js:26`, `subagent-bridge/src/runtime/bridge-runtime.js:113,594-599,867`
- `subagent-bridge/src/services/workspace-coordinator.js:286`
- `subagent-bridge/src/retry.js:32-37`
- `subagent-bridge/src/memory-evaluation.js:56-108` (`precision`, `options.retriever`)
- `subagent-bridge/src/frontends/mcp/server.js:351`
- `subagent-bridge/src/metrics.js:24,101,477,549,566,741,794`
- `scripts/verify-project.js:79-84`
- `scripts/prune-memory-audit.js`
- `scripts/smoke-mcp.js:63`
- `tests/recent-runs.test.js:186-210,261,281`
- `config/memory-evaluation.json` (25 vaka)
- `package.json:9-12,22-30` (`pilot:edit:deepseek`, `accept:edit:deepseek`, `runs:recent`, `runs:mirror`, `edit:feedback`, `routing:feedback`, `memory:prune-audit`)

Çalıştırılan doğrulama komutları:

- `npm test` → 538/538 PASS
- `npm run verify:ci` → PASS
- `npm run memory:evaluate` → PASS (25 vaka)
- `npm run pilot:edit:deepseek` → completed, cleanupCompleted true, applied false
- `npm run accept:edit:deepseek` → completed, applied true, cleanupCompleted true, accepted true
- `npm run edit:feedback` → pendingCount 110

## Ek not (2026-09-18, append-only)

Bu rapordaki 110 bekleyen / 0 etiketli anlık görüntüsü değiştirilmemiştir. Aynı gün alınan yeni anlık görüntü 114 bekleyen / 0 etiketli olarak kaydedilmiştir; toplu sonuç etiketlemesi reddedilmiş, kayıtlar silinmemiş ve append-only uygunluk sınıflandırması (`npm run edit:classify`) eklenmiştir. Güncel kohort, eşikler ve karar için `docs/reports/V2_FAZ4_ETIKET_KOHORTU_2026-09-18.md` dosyasına bakın. Karar kapısı veri yetersizliği nedeniyle hâlâ geçici NO-GO'dur.

## Ek not 2 (2026-09-18, append-only)

Rapordaki Plan 4 Faz 4 kaydı `dış-bağımlı` idi; kullanıcının Claude Code aboneliği olmadığı kesinleştiği için bu madde `reddedildi` olarak kapatılmıştır. Native Claude edit acceptance çalıştırılmayacak ve native Claude edit yetkisi açılmayacaktır. Faz 1-3 ve `claude_code` read-only adapter desteği, aboneliği olan ortamlar için kod olarak korunur; bu kurulumda çağrı yapılmaz. Güncel durum notu `docs/plans/yapilanlar/MODEL_KIMLIGI_VE_ERISIM_MODU_PLANI.md` içindedir.
