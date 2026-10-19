# Hades Orchestrator Geliştirme Planı

> Durum notu (2026-09-18): Bu belge tarihsel plandır; uygulama denetimi `docs/reports/PLAN_UYGULAMA_DENETIMI_2026-09-18.md` içindedir. Plandaki test ve araç sayıları oluşturulma tarihine aittir; güncel doğrulama için `npm test`. Denetim sonucu: adı geçen P0 maddeleri ile Faz 1B/1C/1D/2B/3B uygulandı ve doğrudan testle kapatıldı; Faz 1A/2A/2C/3A test açığı kayıtlıdır, tam kabul kriteri eşlemesi denetim raporundadır; reddedilen maddeler uygulanmadı, ölçüm/karar kapısı bekleyen yol haritası açık.

2026-09-27 bağlantı notu: Devam eden ölçüm/karar kapılarının güncel kapsamı ayrı `docs/plans/yarim-kalanlar/ORKESTRASYON_GELISTIRME_PLANI_V2.md` içindedir.

## Mevcut Durum

### Proje Tanımı
Provider-neutral subagent bridge: OpenCode host ile Gemini Pro/Flash (Antigravity), Claude Sonnet (Antigravity), Native Claude Code, Codex ve DeepSeek Pro/Flash backend'leri arasında yerel stdio MCP üzerinden güvenli read-only ve edit delegasyonu sağlayan orkestrasyon katmanı.

### Canonical Mimari
```
OpenCode Host
  |
  +- @orchestrator (Codex GPT-5.6 Sol, lead)
       |
    local stdio MCP
       |
  subagent-bridge
       |
  +- MCP Frontend (trusted workspace injection)
  +- Bridge Runtime (router, capability, lock, retry, cancellation)
  +- AntigravityAdapter -> AGY -> Gemini Pro/Flash, Claude Sonnet
  +- ClaudeCodeAdapter -> Native Claude Code
  +- OpenCodeAdapter -> DeepSeek Pro/Flash + bağımsız OpenCode provider'ları
  +- CodexAdapter -> Official Codex CLI
```

### Doğrulanmış Provider Matrisi
- Antigravity / Gemini Pro: VERIFIED
- Antigravity / Gemini Flash: VERIFIED
- Codex: VERIFIED
- DeepSeek Pro / Flash: VERIFIED (salt-okunur subagent, kontrollü implementer edit)
- GLM 5.2: VERIFIED (salt-okunur subagent, kontrollü implementer edit)
- Native Claude Code: IMPLEMENTED (auth-dependent)
- OpenCode bağımsız backend: IMPLEMENTED (configured backend'e bağlı)

### Test Baseline
- `npm test`: 264/264 PASS
- `npm run verify`: PASS
- `npm run smoke`: PASS
- `npm run memory:review`: PASS
- `npm run memory:evaluate`: PASS (25 vaka; precision@1: 1.0, recall@5: 1.0, NDCG@5: 1.0, MRR: 1.0, abstention: 1.0)

### Uygulama Durumu
- P0 paketleri ile Faz 1, Faz 2 ve Faz 3 tamamlandı ve çalışma zamanı davranışına alındı.
- Karar kapısı arkasındaki MCP Tasks, A2A, semantik cache, multi-agent consensus ve diğer araştırma backlog'u maddeleri uygulanmadı.
- Ertelenen veya reddedilen maddeler bu planın uygulanmış kapsamına dahil değildir.

---

## Mevcut Özellikler

### Orkestrasyon - Çift Arayüz Mimarisi

Subagent bridge iki ayrı giriş kapısı sunar. İkisi de aynı `BridgeRuntime`'ı kullanır; aynı routing, lock, retry, cost, metrik ve güvenlik katmanlarından geçer.

#### MCP Araçları (Tam Kontrollü)
- **Konum**: `subagent-bridge/src/frontends/mcp/server.js`
- **Protokol**: local stdio MCP sunucusu
- **Araç listesi**: `run_antigravity_subagent`, `run_codex_subagent`, `run_deepseek_subagent`, `run_claude_code_subagent`, `run_opencode_subagent`, `run_task_profile`, `check_deepseek_subagent`, `check_antigravity_subagent`, `check_subagent_bridge`
- **Ne zaman**: Edit delegasyonu, dosya/contextFiles/skills seçimi, rol ataması, acceptanceCriteria tanımı, timeout kontrolü gerektiğinde.
- **Avantaj**: Tam parametre kontrolü, edit modu, structured output, Zod doğrulama.

#### Global OpenCode Custom Tools (Hızlı ve Basit)
- **Konum**: `~/.config/opencode/tools/subagent-bridge.js`
- **Protokol**: OpenCode plugin sistemi (`@opencode-ai/plugin`)
- **Araç listesi**: `subagent-bridge_geminiPro`, `subagent-bridge_geminiFlash`, `subagent-bridge_claudeSonnet`, `subagent-bridge_codex`, `subagent-bridge_claudeCode`, `subagent-bridge_deepseekPro`, `subagent-bridge_deepseekFlash`, `subagent-bridge_health`, `subagent-bridge_workspaceContext`
- **Ne zaman**: Hızlı read-only danışmanlık, basit kod incelemesi, workspace diagnostik, sağlık kontrolü. Sadece `prompt` yazmak yeterli.
- **Avantaj**: Tek satır çağrı, workspace otomatik algılanır, tüm OpenCode session'larında her zaman yüklü.

#### Pratik Kullanım Kuralı
```
Hızlı soru/inteleme  →  subagent-bridge_codex("şu dosyayı incele")
Kontrollü delegasyon →  run_deepseek_subagent({ role: "reviewer", files: [...], skills: [...] })
Edit işi            →  run_codex_subagent({ mode: "edit", ... })  (MCP zorunlu)
Web araştırması     →  run_antigravity_subagent({ model: "gemini_pro", ... })
```
- Antigravity read-only harici workspace desteği (allowed roots, denied roots)
- DeepSeek Git repository zorunluluğu kaldırıldı
- Vault kökü zorunlu DeepSeek workspace reddi (policy'den bağımsız runtime engeli)

### Güvenlik
- Provider rolleri: `analyst`/`reviewer`/`planner` yalnız yerel araçlar, `researcher` yalnız web araçları
- Antigravity read-only sandbox: `write_file(*)` deny, narrow command allowlist, harici MCP sunucusu ve kalıtsal geniş izinler için fail-closed preflight
- Codex: `--sandbox read-only` / `--sandbox workspace-write`
- Delegation depth: MAX_DEPTH = 1
- DeepSeek: Zod runtime doğrulama + şema onarım promptu
- Secret, API anahtarı, token, parola kaynak koda/log'a/prompt'a yazılmaz
- Path traversal, symlink, hard-link guard'ları tüm hafıza işlemlerinde

### Güvenilirlik
- Retry: yalnız geçici hatalarda (network, timeout, rate_limit, schema_invalid), jitter + exponential backoff
- Fail-fast: izin, path traversal, secret, araç politikası ihlallerinde
- Retry bütçeleri: maxAttempts, maxRetryCostUsd, maxTotalDurationMs
- Günlük ve aylık maliyet limitleri: atomik reservation ve dönemsel hard cap
- Redacted metrik log'ları: prompt, tool çıktısı, Vault içeriği, workspace yolu, görev kimliği, secret yok
- Cross-process workspace lock: SHA-256 anahtar, heartbeat lease, stale lock temizliği
- Process tree termination: `taskkill /T` Windows

### Kalıcı Hafıza (Obsidian Vault)
- 7 MCP hafıza aracı: `check_persistent_memory`, `search_persistent_memory`, `read_persistent_memory`, `review_persistent_memory`, `analyze_memory_write`, `store_persistent_memory`, `check_subagent_bridge`
- On-demand retrieval, tam Vault prompt'a yüklenmez
- SHA-256 optimistic concurrency: güncelleme öncesi hash doğrulaması
- Soft-expiry: `valid_until` geçen notlar aramada gizlenir, `includeExpired` ile açılır
- `review_after`: yalnız bakım uyarısı, aramadan gizlemez
- Write-before-analyze: `analyze_memory_write` ile tekrar/çelişki aday tespiti
- `acknowledgeMemoryConflicts`: Codex bilinçli onayı
- Redacted audit journal: yalnız hash + sınıflandırma metadata'sı
- Hafıza türleri: `semantic`, `episodic`, `procedural`, `preference`, `decision`
- Güven/doğrulama metadata'sı: `confidence` (low/medium/high), `verificationStatus` (user-provided/verified/provisional)
- Secret taraması: API key, token, JWT, private key, bağlantı dizesi, yüksek entropi
- İzinli yazma klasörleri: 00_Inbox, 01_Projects, 02_Areas, 03_Resources, 04_Archive, 06_Metadata
- Yaşam döngüsü denetimi: `npm run memory:review` (overdue/expired/stale/trust/missingType/duplicate)
- Retrieval değerlendirme: `npm run memory:evaluate` (precision@k, recall@k, abstention, latency, token bütçesi)

### Sıralama Sinyalleri (Arama)
- Path ve içerik anahtar kelime eşleşmesi (temel skor)
- Yüksek güven (+2)
- Doğrulanmış içerik (+2)
- Güncellik: son 30 gün (+2), son 365 gün (+1)
- Geçmiş inceleme tarihi (-1)
- Anahtar kelime ilgisi baskın; metadata yalnız eşit adaylarda sıralamayı iyileştirir

---

## Sektör Kıyaslaması

### Araştırma Kapsamı
Gemini 3.1 Pro ile iki bağımsız araştırma: (a) yerel dosya-tabanlı hafıza sistemleri, (b) sandbox/kilit/maliyet/doğrulama/retrieval modelleri.

### İncelenen Projeler
- **Letta (MemGPT) + MemFS**: git-backed Markdown hafıza, git worktree eşzamanlılık, sleep-time reflection, git commit audit
- **LangMem (LangChain)**: Memory Manager, semantic/episodic/procedural ayrımı, namespace izolasyonu, vektör destekli arama
- **Mem0**: ChromaDB/Qdrant yerel konfigürasyon, ADD-only extraction, multi-signal retrieval (semantic+BM25+entity+temporal), memory decay, entity-scoped memory
- **Git-Backed Obsidian Yaklaşımları (Agent Fleet, DiffMem, GCC)**: Git branch ile taslak/main ayrımı, `git diff`/`git blame` denetim, Inbox -> review -> merge akışı
- **LiteLLM / Helicone**: API gateway proxy, gerçek zamanlı maliyet, 402 Payment Required devre kesici
- **ArmoSec / TrueFoundry / Aembit**: MicroVM sandbox, eBPF, per-agent workload identity
- **Instructor / Pydantic-AI**: Yapılandırılmış çıktı doğrulama, feedback-driven retry
- **RAGAS / DeepEval**: LLM-as-a-judge retrieval değerlendirme framework'leri

### Bizim Avantajlarımız (Sektörün Üstünde)
1. Subagent Vault workspace reddi: sektördeki namespace/klasör izni modellerinden katı
2. Redacted audit journal: git commit'lerin aksine secret sızdırmaz
3. Write-before-analyze + bilinçli onay: sektör otomatik yazıp arkadan düzeltir
4. Soft-expiry metadata'sı: sektör LLM ile özetleme yaparak maliyet oluşturur
5. Dış bağımlılıksız yerel çalışma: Redis, PostgreSQL, Qdrant gerektirmez

### Bizim Eksiklerimiz (Sektörün Altında)
1. Git branching ile ajan hafıza deney alanı yok (Letta MemFS, Agent Fleet)
2. Arka plan hafıza konsolidasyonu yok (Letta sleep-time reflection, LangMem consolidation)
3. Retrieval değerlendirme seti küçük; çok oturumlu/zamansal senaryo yok (LoCoMo, STATE-Bench)
4. MicroVM/eBPF sandbox yalıtımı yok
5. API gateway proxy ile merkezi maliyet denetimi yok

---

## Uygulanan P0 Düzeltmeleri

### `leaseHeartbeatMs` Değerini Koordinatöre Aktar ve Lock Eşiğini Ölç
- **Dosya**: `subagent-bridge/src/runtime/bridge-runtime.js:113`, `config/policy.json:83-85`
- **Sorun**: Yapılandırılan heartbeat değeri koordinatöre geçmiyor. `staleLockMs=1500000` (25dk) çöken süreç sonrası toparlanmayı geciktiriyor; ancak ölçmeden 5 dakikaya indirmek uzun çağrılarda hatalı lock devralmaya yol açabilir.
- **İşlem**: `configuration.orchestration.scheduler.leaseHeartbeatMs` değerini koordinatöre aktar. Heartbeat yenilemesini atomik yazma ve owner token doğrulamasıyla güvenceye al. `staleLockMs`, gözlenen heartbeat gecikmesinin en az üç katı ve process termination grace süresinden büyük olacak şekilde benchmark sonucuyla seçilsin.
- **Test**: Fake timer ile heartbeat devam ederken lock'un stale olmadığını, heartbeat kesilince eşik sonunda devralınabildiğini ve eski owner'ın yeni lock'u silemediğini doğrula. Gerçek süreli çok dakikalı test kullanılmasın.

### Hafıza Mutation Kilidi Ekle
- **Dosya**: `subagent-bridge/src/memory.js:510`
- **Sorun**: `storePersistentMemory` hash kontrolü ile `renameSync` arasında süreçler arası kilit yok. Aynı SHA ile başlayan iki yazar son yazan kazanacak şekilde yarışabilir.
- **İşlem**: Hash tabanlı süreçler arası dosya kilidi ekle. İki yol kilitlenecekse hash'ler sıralanarak deadlock engellensin.

### Audit Başarısızlığı Semantiği
- **Dosya**: `subagent-bridge/src/memory.js:460`
- **Sorun**: Dosya başarıyla değiştikten sonra audit yazımı başarısız olursa sonuç belirsiz.
- **İşlem**: Sonuç `mutationCompleted: true, auditWritten: false` biçiminde açık olsun; otomatik retry yapılmasın.

### Hafıza Türü Metadata Migrasyonu
- **Hedef**: Mevcut 3 eski Vault notuna `memory_type` ata.
- **İşlem**: `01_Projects/Orkestrasyon/Hafıza İndeksi.md` -> `procedural`, `06_Metadata/Orkestrasyon/Hafıza Politikası.md` -> `decision`, `00_Inbox/README.md` -> `procedural`. Güncel SHA-256 ile oku, kontrollü update yap.

### Geçersiz Metadata Raporu
- **Dosya**: `subagent-bridge/src/memory.js`
- **İşlem**: `review_persistent_memory` raporuna `invalidMetadata` kategorisi ekle. Geçersiz `created`, `updated`, `review_after`, `valid_until`, `stage`, `memory_type` değerleri sessizce yok sayılmasın.
- **Test**: Bozuk tarih, geçersiz memory_type, eksik zorunlu alan senaryoları.

### `validUntil` Geçmiş Tarih Koruması
- **Dosya**: `subagent-bridge/src/memory.js:510-570` (storePersistentMemory)
- **Sorun**: Geçmiş `validUntil` ile oluşturulan notlar sessizce ghost note haline gelir; kullanıcı notu görür ama aramada bulamaz.
- **İşlem**: `storePersistentMemory` geçmiş veya oluşturma anına eşit `validUntil` değerinde açık uyarı/ret üretsin. Tarihsel import ve bilinçli immediate-expiry için ayrı `acknowledgeExpiredMemory` onayı sağlansın; keyfi bir saat alt sınırı uygulanmasın.
- **Test**: Gelecek tarih normal kabul, geçmiş tarih onaysız ret, geçmiş tarih açık onayla soft-expired kayıt.

### MCP Graceful Shutdown
- **Dosya**: `subagent-bridge/src/services/execution-service.js:48-53`
- **Sorun**: Timeout'ta doğrudan `taskkill /F /T` kullanılıyor. MCP spec iki aşamalı kapatma önerir: önce stdin kapat, bekle, sonra force kill.
- **İşlem**: Adaptör capability'si graceful stdin shutdown destekliyor ve stdin açıksa `child.stdin.end()` çağır, yapılandırılmış grace süresini bekle, süreç hala hayattaysa `killProcessTree` kullan. stdin desteklemeyen CLI'larda doğrudan mevcut process-tree termination uygulanır.

### Maliyet Bütçe Çift Harcama Koruması
- **Dosya**: `subagent-bridge/src/metrics.js:159-191` (reserveCostBudget)
- **Sorun**: Rezervasyon lock kapsamında ama execution metrikleri lock dışında yazılıyor. Aynı anda iki çalıştırma birbirinin henüz yazılmamış maliyetini göremez -> çift harcama.
- **İşlem**: Aynı bütçe lock'u altında append-only reservation journal'a `reserved` kaydını yazıp flush etmeden çalıştırmaya izin verme. Kayıt yalnız rastgele reservation hash'i, dönem, tutar ve timestamp taşısın. Tamamlanan çağrı `settled` kaydıyla gerçek maliyeti uzlaştırsın; çöken süreçlerin rezervleri expiry kaydıyla serbest bırakılsın. In-memory sayaç yalnız cache olabilir, doğruluk kaynağı olamaz.
- **Test**: Ayrı Node süreçlerinden eşzamanlı 10 reservation, süreç çökmesi, stale reservation recovery ve limit sınırında tek kazanan senaryoları.

### Arama Ölçeklenebilirlik Sınırı
- **Dosya**: `subagent-bridge/src/memory.js:385-421` (searchPersistentMemory)
- **Sorun**: maxIndexedFiles=5000 * maxSearchFileBytes=128KB = teorik 625MB senkron disk okuması. Her arama tüm Vault'u bloke ederek okur. Node.js event loop bloke olur.
- **Uygulanan Karar**: 5.000 notluk konsolidasyon ve tarama benchmark'ı 30 saniye kabul sınırının altında geçtiği için `maxIndexedFiles=5000` korundu; ölçüm olmadan kapasite düşürülmedi.
- **Uzun Vadeli**: SQLite FTS5 veya minimal inverted index yalnız p95 arama gecikmesi karar kapısını aşarsa değerlendirilecek.

### Provider Health Circuit Breaker ve Açık Profile Fallback
- **Dosya**: `subagent-bridge/src/runtime/router.js`, `subagent-bridge/src/runtime/bridge-runtime.js`
- **Sorun**: Provider sürekli hata verince yeni çağrılar aynı başarısız backend'e gönderiliyor. Circuit breaker (closed/open/half-open) deseni eksik. Buna karşılık belirli provider seçen çağrıda sessiz fallback kullanıcı niyetini ve canonical routing sözleşmesini bozar.
- **İşlem**:
  - Her adaptör için circuit breaker: hata eşiği (5 hata/60sn) -> open, 30sn sonra half-open, başarılı olursa closed.
  - Circuit state süreçler arası lock altında redacted yerel state dosyasında tutulmalı; prompt, workspace, görev veya hata mesajı yazılmamalı.
  - Named-provider araçları circuit open veya retry exhaustion durumunda açık hata döndürsün; başka provider'a geçmesin.
  - Yalnız `run_task_profile` için policy'de açıkça tanımlanmış, sıralı ve bütçe sınırları olan `fallbackTargets` kullanılabilsin.
  - Half-open durumda provider başına tek probe çalışsın; diğer çağrılar fail-fast olsun.
- **Etkileşim**: Circuit state çağrı öncesi kontrol edilir; yalnız geçici hatalar retry'lar tükendikten sonra failure counter'a yazılır. İzin, policy, path ve secret ihlalleri provider health hatası sayılmaz.
- **Test**: Named-provider çağrısının fallback yapmadığı, profile çağrısının yalnız tanımlı hedefe geçtiği, half-open tek-probe ve eşzamanlı süreçlerde state tutarlılığı.

### Retry Full Jitter ve Schema Repair Escalation
- **Dosya**: `subagent-bridge/src/retry.js:32-35`, `subagent-bridge/src/deepseek.js:41-48`
- **Sorun**: Half-jitter [0.5, 1.5] thundering herd'e karşı yetersiz. Schema repair prompt'u her denemede aynı.
- **İşlem**:
  - Full jitter: `delay = random(0, min(maxDelay, baseDelay * 2^attempt))`
  - Rate_limited sınıfı için daha agresif: `baseDelay * 4^attempt`
  - Schema repair prompt'una Zod validation issues detayları ekle. Artan denemelerde "Bu senin X. başarısız denemen" escalation'ı.

### Retrieval Precision Formülü Düzeltmesi
- **Dosya**: `subagent-bridge/src/memory-evaluation.js:30`
- **Sorun**: Mevcut formül paydada `k` yerine dönen sonuç sayısını kullanıyor. Standart `precision@k` değil.
- **İşlem**: Standart `precision@k = relevant / k` formülüne geç veya metrik adını `precisionAmongReturned` olarak değiştir.

### `verify-project.js` Codex Null Guard
- **Dosya**: `scripts/verify-project.js:56`
- **Sorun**: `configuration.codex.executable` erişimi null guard'sız. `agents.json`'da codex tanımı yoksa veya yeniden adlandırılırsa TypeError ile çöker, düzgün hata mesajı vermez.
- **İşlem**: `configuration.codex ? spawnSync(configuration.codex.executable, ...) : { status: 1 }` — codex yoksa unavailable rapor et, çökme.

### `smoke-mcp.js` Eksik Araç Kapsamı
- **Dosya**: `scripts/smoke-mcp.js:47-55`
- **Sorun**: `check_subagent_bridge` aracı (birleşik sağlık panosu) smoke test kapsamında değil. 12 MCP aracı kayıtlı, smoke sadece 8'ini doğruluyor. En kritik eksik: `check_subagent_bridge` hiçbir otomatik test tarafından çağrılmıyor.
- **İşlem**: `expectedToolNames` dizisine `check_subagent_bridge` ekle. En azından aracın kayıtlı olduğunu ve geçerli yapılandırılmış yanıt döndüğünü doğrula. Provider execution araçları canlı binary gerektirdiği için hariç kalabilir.

---

## Uygulanan Geliştirme Yol Haritası

### Faz 1: Retrieval Değerlendirme Altyapısı ve Operasyonel Görünürlük (TAMAMLANDI)

#### 1A. Retrieval Değerlendirme Genişletmesi
- **Hedef**: Mevcut 5-case baseline'ı 20-30 case'e genişlet; zorlu senaryolar ve standart metrikler ekle.
- **Teknik Not**: Mevcut evaluator yalnız `expectedPaths` kümesini karşılaştırıyor. Gerçek multi-hop yapamaz, çelişen notlar arasında semantik ayrım yapamaz.
- **Yapılacaklar**:
  - `config/memory-evaluation.json`: 20-30 case. `temporal-ordering`, `knowledge-update`, `contradiction`, `partial-match`, negatif sorgu senaryoları.
  - Standart metrikler: `precision@k` (düzeltilmiş), `recall@k`, `MRR`, `NDCG`.
  - Dereceli relevance için `qrels` (query relevance judgments) yapısı.
  - Multi-hop iddiası ya gerçek çok adımlı evaluator ile desteklensin ya da "related-note retrieval" olarak yeniden adlandırılsın.
  - Dataset Zod şema doğrulaması.
  - Değerlendirme zamanını sabitle (`Date.now()` güncellik sıralaması testleri zamanla değiştirmesin).
  - Test dokümanı üreticisi `created`, `updated`, `confidence`, `verification`, `reviewAfter`, `stage` alanlarını yazabilsin.

#### 1B. Çapraz Strateji Değerlendirme Altyapısı
- **Hedef**: Aynı retrieval sorgularının farklı arama stratejileriyle karşılaştırılabilir olmasını sağla.
- **Yapılacaklar**:
  - `evaluateMemoryRetrieval` fonksiyonuna `retriever` dependency injection veya strategy registry ekle.
  - Rapor `strategy` alanı taşısın.
  - Semantik/hibrit ancak genişletilmiş baseline'da ölçülmüş üstünlük gösterirse değerlendirilsin; şimdilik yalnız altyapı hazırlansın.

#### 1C. Cross-Process Workspace Lock Görünürlüğü
- **Ön Koşul**: `leaseHeartbeatMs` koordinatöre geçirilmeli (P0).
- **Hedef**: Aktif workspace kilitlerini salt-okunur sorgulanabilir yap.
- **Yapılacaklar**:
  - `coordinator.snapshot()` metodu: yerel aktif işler, yerel bekleyenler, diskte görülen harici lock'lar, lease yaşı.
  - Yeni MCP aracı: yerel kuyruk ile harici disk lock'larını ayrı raporlasın.
  - Gerçek global cross-process kuyruk iddiası şimdilik yapılmasın; tüm intent'ler kalıcılaştırılana kadar ertelensin.
  - Owner token hash'i döndürülmesin; rastgele snapshot-local kimlik yeterli.

#### 1D. Bütçe ve Circuit Breaker Görünürlüğü
- **Not**: Circuit breaker altyapısı P0'a yükseltildi. Bu faz yalnızca salt-okunur görünürlük sağlar.
- **Hedef**: Günlük/aylık maliyet limitlerinin ve provider circuit breaker durumunun sorgulanabilir olması.
- **Yapılacaklar**:
  - `check_subagent_bridge` aracına bütçe/limit durumu ekle.
  - Günlük harcama, aylık harcama, kalan rezerv, aktif reservation sayısı.
  - Her provider için circuit breaker durumu: closed/open/half-open, hata sayısı, son geçiş zamanı.

---

### Faz 2: Taslak Yaşam Döngüsü ve Hafıza Konsolidasyonu (TAMAMLANDI)

#### 2A. Inbox-to-Archive Taslak Yaşam Döngüsü
- **Ön Koşul**: Hafıza mutation kilidi (P0), retrieval değerlendirme altyapısı (Faz 1) stage-aware hale gelmeli.
- **Stage Sözleşmesi**:
  - Eski, stage'siz not: varsayılan `published`.
  - Yeni not: varsayılan ve normal yol yalnız `stage: draft`, `00_Inbox` altında.
  - Doğrudan `published` yazma yalnız eski API uyumluluğu veya açık yetki için.
  - Eski not güncelleniyorsa mevcut stage korunsun.
  - Draft: normal aramada gizli, `includeDrafts` ile açılabilir.
  - Draft: `review_persistent_memory` içinde görünür.
  - Draft: doğrudan `read_persistent_memory` ile okunabilir.
- **Yapılacaklar**:
  - `store_persistent_memory` input'una `stage` alanı (default: `draft`).
  - `search_persistent_memory` input'una `includeDrafts` (default: `false`).
  - `review_persistent_memory` raporuna `drafts` kategorisi.
  - Frontmatter: `stage: draft` / `stage: published`.
  - MCP şeması, smoke, README, AGENTS güncellemesi.

#### 2B. `promote_memory` Aracı
- **Ön Koşul**: Hafıza mutation kilidi (P0).
- **Hedef**: Draft notu SHA-256 kontrollü hedef klasöre taşı, `stage: published` yap.
- **Atomiklik Gereksinimleri**:
  - Girdi: `sourceRelativePath`, `targetRelativePath`, `expectedSourceSha256`.
  - Kaynak `00_Inbox` altında ve `stage: draft` olmalı.
  - Kaynak ve hedef için symlink, hard-link, path traversal kontrolleri ayrı uygulanmalı.
  - Hedef üzerine sessiz overwrite yasak.
  - Kaynak ve hedef aynı anda kilitlenmeli (hash sıralı çift kilit).
  - Audit olayı yalnız işlem tamamlandıktan sonra yazılmalı.
  - Yarım kalan promotion için idempotent kurtarma kaydı.
  - Promoted draft tekrar promotion'da idempotent sonuç veya açık ret.

#### 2C. Salt-Okunur Konsolidasyon Aday Raporu
- **Ön Koşul**: Stage semantiği (2A).
- **Hedef**: Birden çok eski/ilgili notun tekil güncel nota dönüştürülmesi için aday grupları raporla.
- **Performans Stratejisi** (edit distance/LCS yerine):
  1. Mevcut normalize gövde SHA-256 ile tam tekrarları bul.
  2. Adayları normalize başlık, ortak etiket veya token kümeleriyle blokla.
  3. Yalnız blok içindeki adaylarda kelime-shingle Jaccard benzerliği hesapla.
  4. Minimum gövde uzunluğu, eşik, maksimum aday ve maksimum grup sınırı uygula.
- **Yapılacaklar**:
  - `extractMemoryReviewRecord` içine `created`, `updated`, `stage` alanları ekle.
  - `review_persistent_memory` raporuna `consolidationCandidates` alanı.
  - Rapor: grup başına relativePaths, ortak başlık, benzerlik oranı, en eski/yeni tarih.
  - Draft, süresi dolmuş ve arşivlenmiş notların konsolidasyon politikası net tanımlansın.
  - 100, 1.000 ve 5.000 notluk sentetik benchmark ile performans kabul kriteri.
  - Otomatik birleştirme, silme veya güncelleme yok; karar Codex'te.

---

### Faz 3: Operasyonel İyileştirmeler (TAMAMLANDI)

#### 3A. Provider Health Geçmişi
- **Hedef**: Provider sağlık durumunun zaman içindeki değişimini izlenebilir yap.
- **Doğru Entegrasyon Noktası**: Runtime health cache miss sonrası; `checkAllAdaptersHealth()` değil.
- **Yapılacaklar**:
  - `recordType: "health_snapshot"` ile execution kayıtlarından ayrı yaz.
  - Durum değişikliğinde veya TTL başına bir kez yaz; her çağrıda yazma.
  - `npm run metrics` health kayıtlarını normal run sayısına katma.
  - "Gözlenen kullanılabilirlik oranı" metriği (son N gözlem).

#### 3B. Audit Journal ve Metrik Log Rotasyonu
- **Hedef**: Sürekli büyüyen JSONL dosyalarının kontrolsüz disk kullanımını engelle.
- **Yapılacaklar**:
  - Aylık sıkıştırma veya eski log arşivi için operasyonel script.
  - `npm run metrics:prune` mevcut; audit için benzer `npm run memory:prune-audit` komutu.

---

## Tasarım Sözleşmeleri (Implementation-Ready Contracts)

Bu bölüm her fazın tam uygulanabilmesi için gereken veri şekillerini, fonksiyon imzalarını, Zod şemalarını, test senaryolarını ve hata mesajlarını tanımlar.

### P0 Sözleşmeleri

#### P0-1: `leaseHeartbeatMs` Wiring
```
Dosya: subagent-bridge/src/runtime/bridge-runtime.js:113
Değişiklik: createBridgeRuntime içinde coordinator yapılandırmasına
  leaseHeartbeatMs: configuration.orchestration.scheduler.leaseHeartbeatMs
  ekle.
Test: tests/optimization.test.js "OPT-01aa" testinde coordinator'ın
  leaseHeartbeatMs değerini configuration'dan aldığını doğrula.
```

#### P0-2: Hafıza Mutation Kilidi
```
Dosya: subagent-bridge/src/memory.js (storePersistentMemory içinde)
Fonksiyon: acquireMemoryMutationLock(noteIdHash, timeoutMs)
  - noteIdHash: SHA-256 of normalized relative path
  - Disk lock: <statePaths>/locks/memory-<noteIdHash>.lock
  - w/ wx flag, 5sn deadline, 30sn stale cleanup
  - İki yol kilitlenecekse hash sıralı al (deadlock önleme)
Entegrasyon: storePersistentMemory hash kontrolünden ÖNCE lock al,
  renameSync'ten SONRA lock bırak (finally).
Testler:
  - Aynı hash ile eşzamanlı iki update -> ikincisi lock timeout
  - Aynı draft için eşzamanlı iki promotion -> ikincisi lock timeout
  - Süreç çökmesi sonrası stale lock temizliği
```

#### P0-3: Audit Başarısızlığı Semantiği
```
Dosya: subagent-bridge/src/memory.js:460
Dönüş şekli genişlet:
  {
    relativePath, created, updated, bytes, sha256, storedAt,
    writeAnalysis, audit: { written: boolean },
    mutationCompleted: true   // YENİ
  }
Hata durumunda (audit yazılamazsa):
  - mutationCompleted: true, audit.written: false
  - Hata FIRLATMA, normal dönüş yap
  - Otomatik retry YOK
Test: audit dizinine yazma izni yok -> hata fırlatılmaz, audit.written: false
```

#### P0-4: Metadata Migrasyonu
```
İşlem adımları (Codex tarafından manuel):
1. read_persistent_memory("01_Projects/Orkestrasyon/Hafıza İndeksi.md") -> sha256 al
2. store_persistent_memory({ ..., memoryType: "procedural", expectedSha256 })
3. Aynı işlem 00_Inbox/README.md için (memoryType: "procedural")
4. 06_Metadata/Orkestrasyon/Hafıza Politikası.md için (memoryType: "decision")
5. npm run memory:review -> missingMemoryType: 0 doğrula
```

#### P0-5: Geçersiz Metadata Raporu
```
Dosya: subagent-bridge/src/memory.js (reviewPersistentMemory içinde)
Yeni alan: invalidMetadata: Array<{ relativePath, field, value, reason }>
Kontroller:
  - created: ISO-8601 mi, parse edilebiliyor mu
  - updated: ISO-8601 mi, created'dan önce değil mi
  - review_after: ISO-8601 mi
  - valid_until: ISO-8601 mi
  - stage: "draft" | "published" | yok (geriye dönük uyumlu)
  - memory_type: izinli enum içinde mi, yoksa null (geriye dönük uyumlu)
  - confidence: "low" | "medium" | "high" mi
  - verification: "user-provided" | "verified" | "provisional" mi
Hata değil uyarı: geçersiz alanlar sessizce yok sayılmaz, raporlanır.
Test: bozuk created tarihi olan not -> invalidMetadata listesinde görünür
```

#### P0-6: Precision Formülü Düzeltmesi
```
Dosya: subagent-bridge/src/memory-evaluation.js:30
Değişiklik: precision = relevant / cutoff (k değerine böl)
Mevcut:    precision = selected.length > 0 ? relevant / selected.length : 0
Yeni:      precision = selected.length > 0 ? relevant / cutoff : 0
Alternatif: precisionAmongReturned olarak yeniden adlandır ve ikisini de döndür.
Test: 1 sonuç dönen ama 5 beklenen case'de precision@5 = 0.2 olmalı
```

### Faz 1 Sözleşmeleri

#### Faz 1A: Retrieval Evaluation Schema
```zod
// config/memory-evaluation.json schema
const evaluationCaseSchema = z.object({
  id: z.string().min(1).max(100),
  category: z.enum([
    "single-hop", "temporal-ordering", "knowledge-update",
    "contradiction", "partial-match", "negative-query", "related-note"
  ]),
  query: z.string().min(2).max(500),
  qrels: z.record(z.string(), z.number().min(0).max(3)),
  // qrels: { "note-relative-path.md": relevanceScore }
  // 0: irrelevant, 1: partially relevant, 2: relevant, 3: highly relevant
  fixedTime: z.string().datetime().optional()
  // Değerlendirme zamanını sabitlemek için
}).strict();

const evaluationDocumentSchema = z.object({
  relativePath: z.string(),
  content: z.string().min(1),
  created: z.string().datetime().optional(),
  updated: z.string().datetime().optional(),
  confidence: z.enum(["low","medium","high"]).optional(),
  verification: z.enum(["user-provided","verified","provisional"]).optional(),
  reviewAfter: z.string().datetime().optional(),
  validUntil: z.string().datetime().optional(),
  stage: z.enum(["draft","published"]).optional(),
  memoryType: z.enum(["semantic","episodic","procedural","preference","decision"]).optional(),
  tags: z.array(z.string()).optional()
}).strict();
```

#### Faz 1A: Yeni Case Kategorileri
```
Minimal 25-case set:
- single-hop (5 case):       tek not eşleşmesi
- temporal-ordering (4):     A notu B'den yeni mi, doğru sıralama
- knowledge-update (4):      eski not yeni notla güncellenmiş, yenisi bulunmalı
- contradiction (3):         iki çelişen nottan güvenli/doğrulanmış olan
- partial-match (3):         sorgu yalnızca notun bir bölümüyle eşleşiyor
- negative-query (3):        eşleşme olmaması gereken sorgular
- related-note (3):          A notuna ek olarak ilgili B notu da bulunmalı
```

#### Faz 1A: Metrik Formatı
```
Yeni rapor alanları:
{
  cutoffs: { "1": { precision, recall, ndcg }, "3": {...}, "5": {...} },
  mrr: number,
  aggregateNdcg: number,
  failures: [{ id, query, expectedQrels, actualRanking, reason }]
}
Binary relevance eşiği: qrels skoru >= 2 (relevant ve highly relevant) pozitif sınıf.
  Bu sayede kısmen ilgili (score=1) sonuçlar gürültü olarak değerlendirilir.
Başarı eşiği: precision@1 >= 0.85, recall@5 >= 0.90, NDCG@5 >= 0.80
Başarısızlık durumu: eşik tutmazsa sıralama algoritması değişikliği değil,
  önce ground-truth qrels kalitesi gözden geçirilir.
```

#### Faz 1B: Strategy Injection
```
Dosya: subagent-bridge/src/memory-evaluation.js
İmza değişikliği:
  evaluateMemoryRetrieval(configuration, cases, options)
  options: {
    cutoffs, fixedTime,
    retriever: (config, query, limit) => SearchResult  // YENİ
  }
Varsayılan retriever: (c, q, l) => searchPersistentMemory(c, { query: q, limit: l })
Rapor: { ..., strategy: "keyword", ... }
```

#### Faz 1C: Lock Snapshot API
```
Dosya: subagent-bridge/src/services/workspace-coordinator.js
Yeni metod: snapshot()
Dönüş:
{
  localActive: number,          // bu süreçteki aktif işler
  localQueued: number,          // bu süreçteki kuyrukta bekleyenler
  oldestQueueEntryMs: number|null,
  externalDiskLocks: string[],  // diskteki lock dosyaları (hash'lenmiş yol)
  lockCount: number,
  leaseHeartbeatMs: number
}
MCP aracı: check_workspace_lock (readOnlyAnnotations)
  -> coordinator.snapshot() çağrısı
  -> owner token HASH'İ döndürülmez
```

#### Faz 1D: Bütçe Durumu
```
MCP aracı: check_subagent_bridge genişlet
Yeni alanlar:
{
  ...mevcut,
  costBudget: {
    dailyLimitUsd: number|null,
    dailySpentUsd: number,
    dailyRemainingUsd: number,
    monthlyLimitUsd: number|null,
    monthlySpentUsd: number,
    monthlyRemainingUsd: number,
    activeReservations: number,
    circuitBreakerOpen: boolean
  }
}
```

### Faz 2 Sözleşmeleri

#### Faz 2A: Stage Veri Sözleşmesi
```
Frontmatter yeni alan: stage: "draft" | "published"
  Eski notlarda stage yoksa -> published kabul et

store_persistent_memory Zod genişletmesi:
  stage: z.enum(["draft"]).default("draft").optional()
  // Yeni not: default draft, eski not güncelleme: mevcut stage korunur
  // Doğrudan published yazma: stage: "published" açıkça verilmeli
  // relativePath draft ise: 00_Inbox altında olmalı (resolveMemoryPath kontrol)

search_persistent_memory Zod genişletmesi:
  includeDrafts: z.boolean().default(false)

review_persistent_memory rapor genişletmesi:
  drafts: Array<{ relativePath, title, createdAt }>
```

#### Faz 2A: Stage Geçiş Kuralları
```
Yeni Not (CREATE):
  - Varsayılan: stage=draft, 00_Inbox/<path>
  - Açık published: stage=published, hedef klasör
  - İzin kontrolü: draft sadece 00_Inbox altında olabilir

Güncelleme (UPDATE - expectedSha256 ile):
  - Mevcut stage korunur (değişmez)
  - Draft güncellenirken stage değişmez
  - Published güncellenirken stage değişmez
  - Sadece promote_memory stage değiştirebilir

Arama:
  - Normal: draft'lar gizli (includeDrafts: false)
  - Bakım: includeDrafts: true
  - expired: validUntil kontrolü ayrı (includeExpired)

Okuma:
  - read_persistent_memory: draft okunabilir (kısıt yok)
  - review_persistent_memory: draft'lar ayrı kategoride raporlanır
```

#### Faz 2B: `promote_memory` Tam Sözleşme
```
MCP aracı: promote_memory
Zod schema:
{
  sourceRelativePath: z.string().min(3).max(500),
  targetRelativePath: z.string().min(3).max(500),
  expectedSourceSha256: z.string().regex(/^[a-f0-9]{64}$/)
}

İş Akışı:
1. sourceRelativePath normalize et, vault içinde olduğunu doğrula
2. Kaynak dosyayı oku, stage: "draft" olduğunu doğrula
3. Kaynak 00_Inbox altında olduğunu doğrula
4. expectedSourceSha256 eşleşmesini doğrula
5. targetRelativePath normalize et, vault içinde olduğunu doğrula
6. Hedef izinli yazma klasöründe olmalı (allowedWriteFolders)
7. Hedef mevcut değilse veya varsa empty/overwrite politikası
   -> VARSAYILAN: hedef MEVCUT OLMAMALI (çakışma hatası)
   -> overwrite: false (default, güvenli)
8. Kaynak ve hedef için symlink/hard-link/path traversal kontrolü
9. Çift kilit: hash(sourcePath) < hash(targetPath) sırasıyla
10. Kaynak içeriği oku, frontmatter'da stage: "published" yap
11. Hedefe atomik yaz (tmp + rename)
12. Kaynağı sil
13. Audit olayı yaz (event: "PROMOTE")
14. Kilitleri bırak

Hata Durumları:
- Kaynak draft değil: "Kaynak not taslak aşamasında değil"
- Kaynak 00_Inbox altında değil: "Kaynak gelen kutusunda değil"
- SHA-256 uyuşmazlığı: "Kaynak not eşzamanlı değişmiş"
- Hedef mevcut: "Hedef yol zaten dolu; silme veya üzerine yazma için açıkça izin ver"
- Kilitleme başarısız: "Hafıza kilidi alınamadı; daha sonra tekrar dene"

İdempotent Kurtarma:
- Kaynak yok, hedef var = önceden başarılı promote -> idempotent başarı
- Kaynak var, hedef yok = önceden başarısız -> tekrar dene
- İkisi de yok = veri kaybı -> hata
- İkisi de var = yarış durumu -> OTOMATİK SİLME YAPILMAZ. Her iki dosya korunur, durum `PROMOTE_RACE_CONDITION` olayı ile audit log'una yazılır, Codex manuel karar versin diye `review_persistent_memory` raporuna eklenir. (Satır 842 "otomatik silme yapılmaz" ilkesiyle uyumlu.)

Testler:
- Başarılı promote: draft -> published, stage değişir, kaynak silinir
- SHA-256 uyuşmazlığında ret
- Hedef mevcut olduğunda ret
- Kaynak 00_Inbox dışında olduğunda ret
- Çift promote idempotent (ikinci çağrı başarılı sayılır)
- Süreç çökmesi sonrası kurtarma (kaynak+hedef ikisi de var)
- Audit olayı PROMOTE tipinde yazılır
```

#### Faz 2C: Konsolidasyon Algoritması
```
Dosya: subagent-bridge/src/memory.js
Fonksiyon: suggestConsolidationCandidates(configuration, options)

Algoritma:
1. Tüm notları extractMemoryReviewRecord ile tara
   (created, updated, stage alanları eklenmiş)
2. Aday havuzu filtrele:
   - Draft'lar: konsolidasyon DIŞI (henüz onaylanmamış)
   - expired notlar: konsolidasyon DIŞI (otomatik gizli)
   - published notlar: konsolidasyon ADAYI
3. Gruplama (sırasıyla):
   a. Exact SHA-256 eşleşmesi (tam tekrar) -> en yüksek öncelik
   b. Aynı normalize başlık -> yüksek öncelik
   c. Ortak etiket kümesi (Jaccard >= 0.5 olanlar)
   d. Kelime-shingle Jaccard (3-gram, >= 0.7 eşik)
4. Her grup için:
   - relativePaths: string[]
   - commonTitle: string | null
   - similarity: number (0-1)
   - oldestNote: string (createdAt)
   - newestNote: string (updatedAt)
   - totalNotes: number
5. Grupları öncelik sıralı döndür (tam tekrar > başlık > etiket > shingle)
6. Maksimum grup sayısı: maxDuplicateGroups (policy.json)

Performans Sınırları:
- maxIndexedFiles: 5000
- En kötü durum: 5000 * 5000 / 2 = 12.5M çift
- Optimizasyon: bloklama ile ~500K çifte düşür
- Hedef süre: < 30sn (5000 not)
- Maksimum byte okuma: maxReadBytesPerFile * maxIndexedFiles

Testler:
- Tam tekrar (aynı gövde, farklı başlık) -> tespit edilir
- Aynı başlık, farklı içerik -> tespit edilir
- Ortak etiketli benzer notlar -> tespit edilir
- Draft notlar konsolidasyon dışı -> tespit edilmez
- expired notlar konsolidasyon dışı -> tespit edilmez
- 5000 notluk sentetik benchmark: süre < 30sn
```

### Faz 3 Sözleşmeleri

#### Faz 3A: Health Snapshot
```
Dosya: subagent-bridge/src/runtime/bridge-runtime.js
Metrik kaydı şekli:
{
  recordType: "health_snapshot",
  recordedAt: ISO8601,
  backend: "bridge",
  adapters: {
    [adapterId]: {
      installed: boolean,
      version: string|null,
      authValid: boolean|null,
      error: string|null
    }
  }
}
Yazma zamanı: runtime.health() cache miss olduğunda, TTL başına 1 kez
metrics.js: summarizeMetrics health kayıtlarını normal run sayısına KATMA
report-metrics.js: "son N gözlemde kullanılabilirlik" metriği ekle
```

#### Faz 3B: Log Rotasyonu
```
Yeni komut: npm run memory:prune-audit
Script: scripts/prune-memory-audit.js
İşlev: configuration.memory.auditMaxBytes aşan döndürülmüş audit dosyalarını
  configuration.observability.maxMetricRetentionDays süresini aşanları temizle
Mevcut metrics:prune ile aynı pattern
```

---

## Uygulama Bağımlılıkları

```
P0 (Mevcut Açıklar)
  |
  +-> Faz 1A (Retrieval Değerlendirme)
  +-> Faz 1B (Strateji Altyapısı)
  +-> Faz 1C (Lock Görünürlüğü) --leaseHeartbeatMs wiring-->
  +-> Faz 1D (Bütçe Görünürlüğü)
       |
       +-> Faz 2A (Taslak Yaşam Döngüsü) --mutation lock + evaluation-->
            |
            +-> Faz 2B (promote_memory) --mutation lock + stage semantiği-->
            +-> Faz 2C (Konsolidasyon) --stage semantiği-->
                 |
                 +-> Faz 3A (Health Geçmişi)
                 +-> Faz 3B (Log Rotasyonu)
```

---

## Uzun Vadeli Vizyon

### Yeni Provider Adapter'ları (Kimi, Qwen, Hermes)
- **Kaynak**: Önceki provider genişletme araştırması
- **Karmaşıklık**: Yalnız arayüz implementasyonu değil; config schema, routing/model alias, health/auth, capability, timeout/cancellation, secret redaction, acceptance testleri ve dokümantasyon güncellemesi gerektirir.
- **Ön Koşul**: Gerçek provider CLI/API erişimi ve acceptance ortamı.

### Jenerik `run_subagent` Aracı
- **Kaynak**: Önceki provider genişletme araştırması
- **Durum**: `run_task_profile` zaten kontrollü ortak giriş sağlıyor. Serbest `backend` alanı saldırı yüzeyini büyütür.
- **Ön Koşul**: Task profile yaklaşımının yetersizliği kanıtlanırsa değerlendirilsin.

### Trusted Mode
- **Kaynak**: Önceki provider genişletme araştırması
- **Durum**: Mevcut `workspace-write` kontrollü edit ihtiyacını karşılıyor. "Sandbox'ı gevşetme" somut capability, tehdit modeli ve approval sözleşmesi olmadan yol haritasında yer almamalı.
- **Ön Koşul**: Ayrı ADR (Architecture Decision Record) ve ürün onayı.

---

## Uygulanabilirlik Kararları ve Karar Kapıları

Bu sınıflandırma resmi protokol/framework belgeleri, yerel Windows çalışma modeli ve mevcut güvenlik sözleşmeleri birlikte değerlendirilerek yapılmıştır. Bir karar kapısı karşılanmadan ilgili özellik uygulama backlog'una alınmaz.

### Şimdi Uygulanabilir
- Hafıza mutation lock, audit sonucu semantiği ve atomik bütçe reservation journal'ı.
- Provider health circuit breaker; named-provider çağrılarında fallback olmadan.
- Full jitter, yapılandırılmış çıktı repair geri bildirimi ve retrieval değerlendirme düzeltmeleri.
- Graceful process shutdown; adaptör capability'si yoksa mevcut process-tree termination fallback'i korunur.
- Agent Skills biçim doğrulaması; mevcut skill dosyaları `agentskills.io` sözleşmesine karşı doğrulanır, çalışma zamanı bağımlılığı eklenmez.

### Ölçüm Sonrası Uygulanabilir
- SQLite FTS5 veya inverted index: p95 arama gecikmesi kabul eşiğini aştığında ya da Vault düzenli olarak 1.000 notu geçtiğinde.
- Semantik cache: tekrarlanan salt-okunur çağrı oranı ve tahmini tasarruf ölçüldükten sonra; workspace ve caller izolasyonu zorunlu.
- Multi-agent consensus: yalnız yüksek riskli read-only karar profilleri için ve ek maliyet bütçesiyle.
- Otomatik etiket önerisi: Vault 100 notu geçip düşük etiket kapsamı ölçüldüğünde.

### İstemci veya Ürün İhtiyacı Sonrası
- MCP Tasks: OpenCode host'un Tasks uzantısını desteklediği entegrasyon testiyle doğrulanınca uzun çağrılar için değerlendirilsin. Core MCP çağrı sözleşmesi şimdilik değiştirilmesin.
- Human-in-the-loop: geri alınamaz edit/promotion adımları için ürün düzeyinde resume token, timeout ve iptal sözleşmesi tanımlanınca.
- A2A: yalnız bridge dışındaki bağımsız agent servisleriyle ağ üzerinden keşif ve birlikte çalışma ihtiyacı oluşursa.

### Ertelendi veya Reddedildi
- LiteLLM doğrudan bağımlılığı reddedildi: Node tabanlı yerel bridge'e ayrı Python proxy çalışma zamanı ve isteğe bağlı dağıtık altyapı operasyonu ekler. Routing ve cooldown desenleri yalnız referans alınır.
- Shadow CI ve ilişki grafı ertelendi; otomatik skill sentezi reddedildi. Mevcut ölçek, veri güvenliği ve gözlemlenebilirlik bu maliyeti haklı çıkarmıyor.
- Debug amacıyla prompt gövdesi, prefix'i veya model düşünce süreci saklama reddedildi.

### Resmi Kaynaklar
- Anthropic, Building Effective Agents: `https://www.anthropic.com/research/building-effective-agents`
- Model Context Protocol Tasks: `https://modelcontextprotocol.io/extensions/tasks/overview`
- A2A Protocol Specification: `https://a2a-protocol.org/latest/specification/`
- Agent Skills Specification: `https://agentskills.io/specification`
- LiteLLM Routing: `https://docs.litellm.ai/docs/routing`
- OpenAI Agents Human-in-the-Loop: `https://openai.github.io/openai-agents-python/human_in_the_loop/`

---

## Yeni Nesil Özellikler (Araştırma Backlog'u)

Bu bölüm, plan mevcut halindeyken iki bağımsız modelin (DeepSeek Pro ve Gemini 3.1 Pro) beyin fırtınası sonucunda önerdiği, planda henüz yer almayan yenilikçi özellikleri içerir. Her iki modelin önerileri birleştirilmiş, çakışanlar konsolide edilmiş, özgün olanlar ayrıca işaretlenmiştir.

### Faz A: Gözlemlenebilirlik Araştırmaları

#### A1. İnteraktif Debug ve Zaman Yolculuğu Modu
- **Kaynak**: DeepSeek #1 + Gemini #7 (birleşik)
- **Konsept**: `SUBAGENT_BRIDGE_DEBUG=1` ortam değişkeniyle etkinleşen, her lifecycle event'i (lock, retry, schema validation, cost) timestamp'li ve redacted JSON satırı olarak stderr'e yazan debug modu. Model düşüncesi, prompt gövdesi ve ham araç çıktısı gözlemlenmez veya saklanmaz.
- **Değer**: Lock, retry, doğrulama ve maliyet geçişlerini aynı execution correlation hash'i üzerinden teşhis edilebilir yapar.
- **Uygulama**: `bridge-runtime.js` run() içinde debug event emitter; `execution-service.js` callback'lerine onLockAcquire/onLockRelease hook'ları; ayrı `scripts/replay-subagent.js` CLI aracı.
- **Güvenlik Kısıtı**: Debug açıkken yalnız prompt SHA-256, prompt uzunluğu, provider/model sınıfı, redacted event türü ve süre tutulur. Prompt prefix'i dahil hiçbir içerik saklanmaz. Debug kayıtları ayrı izinli dizinde (`%LOCALAPPDATA%\subagent-bridge\debug\`) 7 gün TTL ile tutulur. Debug açıkken stderr'e uyarı yazılır; üretimde varsayılan kapalıdır.

#### A2. Ajan Anormallik Tespiti (Thrash Detector) [ERTELENDİ]
- **Kaynak**: Gemini #3 (özgün)
- **Konsept**: Subagent aynı aracı aynı hata ile üst üste 5+ kez çağırıyorsa (kısır döngü), bütçe limitini beklemeden `CANCEL` sinyaliyle durdur.
- **Değer**: Token maliyetinden ve geliştirici zamanından tasarruf. "Rabbit hole" senaryolarını erken keser.
- **Karar Kapısı**: Bridge şu anda provider içindeki araç çağrı event'lerini güvenilir ve provider-neutral biçimde gözlemlemiyor. Provider adaptörleri redacted structured tool-event akışı sağlamadan çıktı entropisinden thrash kararı verilmesin.
- **Uygulama Sınırı**: Yalnız bridge'in doğrudan gözlediği tekrar/retry olayları kullanılabilir; provider içi davranış hakkında tahminde bulunulmaz.

#### A3. Birleşik Sağlık Panosu
- **Kaynak**: DeepSeek #10
- **Konsept**: `check_subagent_bridge` tek çağrıda tüm sistemi raporlasın: adapter health, lock durumu, bütçe, Vault, önbellek.
- **Değer**: Harici izleme entegrasyonunu kolaylaştırır. Tek endpoint tüm panoyu verir.
- **Uygulama**: Mevcut ayrık check araçlarını tek bir dashboard altında birleştir. Eski araçlar geriye dönük uyumluluk için kalsın.

#### A4. Webhook Tabanlı Uyarı Sistemi
- **Kaynak**: DeepSeek #2
- **Konsept**: Circuit breaker açıldığında, günlük bütçe %80 aşıldığında, provider health DEGRADED olduğunda HTTP POST webhook.
- **Değer**: Operatör müdahalesi olmadan anında bildirim.
- **Uygulama**: `policy.json` -> `observability.webhooks: [{ urlEnv, events, hmacSecretEnv }]`. URL ortam değişkeninden okunur, policy'de düz metin bulunmaz.
- **SSRF Koruması**: DNS çözümleme sonrası IP allowlist (özel IP blokları reddedilir), yalnızca HTTPS, redirect takibi yasak. Webhook payload şeması Zod ile tanımlanır, yalnız aggregate metrikler içerir (ham hata mesajı olmaz). Retry: exponential backoff, maksimum 3 deneme. Rate limit: aynı webhook'a dakikada en fazla 1 çağrı.

---

### Faz B: Yapısal Genişletmeler

#### B1. Çapraz Doğrulama Paneli (Multi-Agent Consensus)
- **Kaynak**: Gemini #2 (özgün) + DeepSeek #7 (paralel alt ajan)
- **Konsept**: Kritik kararlarda görevi eşzamanlı olarak birden fazla modele (örn. DeepSeek Pro + Gemini Pro) gönder, sonuçları diff/consensus matrisiyle Orkestratör'e sun.
- **Değer**: Bağımsız ikinci görüş sağlayarak tek model riskini azaltır; doğruluk garantisi vermez ve modellerin ortak yanılgılarını ortadan kaldırmaz.
- **Uygulama**: Yeni MCP aracı `run_parallel_subagents`. Zod: `tasks[]` (her biri target/model/prompt), `strategy` (fail_fast | all_complete | majority), `maxConcurrency`. Bridge Runtime Promise.allSettled ile paralel çalıştırma. Yalnız read_only; edit paralel çalıştırılamaz.
- **Aynı anda**: Birden çok dosyanın bağımsız analizi için de kullanılabilir (toplam süreyi N kat azaltır).

#### B2. Semantik Önbellekleme Katmanı
- **Kaynak**: Gemini #4 + DeepSeek #6 (birleşik)
- **Konsept**: Salt-okunur danışmanlıkta, workspace hash + sorgu hash'i + caller context'i aynıysa provider'a gitmeden önbellekten yanıt dön.
- **Değer**: Sürekli aynı dosyanın analizinde API maliyetini sıfırlar.
- **Uygulama**: `read-only-cache.js` genişletmesi: composite key = hash(workspace) + hash(query) + hash(caller). Bu sayede farklı subagent'lar aynı sorguda birbirinin önbelleğini göremez (tenant izolasyonu). `stats()` metodu, `check_subagent_bridge` içinde cacheStats.

#### B3. Hafıza Otomatik Etiketleme Motoru [ERTELENDİ]
- **Kaynak**: DeepSeek #5
- **Konsept**: TF-IDF tabanlı anahtar kelime çıkarımı ile otomatik etiket önerisi. Codex onayıyla uygulanır.
- **Değer**: Arama kalitesini artırır.
- **Durum**: Vault < 100 notta manuel etiketleme yeterlidir. Vault'ta 100+ not ve ortalama etiket sayısı < 2 gözlemlendiğinde şema ve implementasyon birlikte eklensin; kullanılmayan boş alan şimdiden eklenmesin.

#### B4. Sağlayıcı Gecikme Yüzdelik Takibi
- **Kaynak**: DeepSeek #4
- **Konsept**: Provider bazında p50/p95/p99 gecikme, kuyruk bekleme süresi dağılımı. `npm run metrics` raporuna latency_summary bölümü.
- **Değer**: Provider performans regresyonlarını erken tespit eder. Kapasite planlaması için veri sağlar.
- **Uygulama**: `metrics.js` -> `computeLatencyPercentiles(records, provider, windowMs)`. Zaten redacted olan durationMs verisi kullanılır, yeni secret riski yok.

#### B5. Git Pre-commit ve Gölge CI [ERTELENDİ]
- **Kaynak**: DeepSeek #3 + Gemini #5 (birleşik)
- **Konsept**: Commit öncesi `npm run verify` + `npm test` otomatik çalışsın (pre-commit hook). Ayrıca `post-commit` hook'u ile değişen diff'leri DeepSeek Flash reviewer ile analiz et, sonucu normal `store_persistent_memory` akışıyla Inbox'a draft olarak yaz.
- **Değer**: Shift-left kalite güvencesi. Sürekli otonom kod denetimi.
- **Bağımlılık**: Faz 2A (draft/promote yaşam döngüsü) — Shadow CI Inbox'a draft yazma için bu altyapıya ihtiyaç duyar.
- **Güvenlik**: Diff subagent'a gönderilmeden ÖNCE secret tarama regex'lerinden geçirilir (mevcut memory.js secret tarama mekanizması). Secret tespit edilirse diff gönderilmez, yalnızca "diff secret içeriyor, analiz atlandı" loglanır.
- **Karar Kapısı**: CI süresi, false-positive oranı ve subagent maliyeti ölçülmeden otomatik post-commit çağrısı yapılmasın. Gerekirse önce yalnız opt-in, repository'de sürümlenen hook installer ile `npm run verify` çalıştırılsın; `.git/hooks` doğrudan planın parçası sayılmasın.

#### B6. Hafıza İlişki Grafı [ERTELENDİ]
- **Kaynak**: DeepSeek #8 + Gemini #6 (birleşik)
- **Konsept**: Notlar arası ortak etiket, başlık benzerliği ve `[[wikilink]]` referanslarından Mermaid formatında ilişki grafı üret.
- **Durum**: Mermaid çıktısını render edecek arayüz olmadığı sürece ham string işe yaramaz. Görsel arayüz entegrasyonu planlandığında tekrar değerlendirilsin. Şimdilik search_persistent_memory sonuçlarına `relatedNotes` (ortak etiketli diğer notlar) alanı eklemek yeterli.

---

### Faz C: Derin Entegrasyonlar ve Vizyon

#### C1. Otomatik Yetenek Sentezi (Auto-Skill Generation) [REDDEDİLDİ]
- **Kaynak**: Gemini #1 (özgün)
- **Konsept**: Codex'in sık tekrarladığı başarılı çözüm kalıplarını analiz edip yeni `SKILL.md` taslağı üret, Inbox'a at.
- **Gerekçe**: Güvenli debug sözleşmesi prompt veya ham çıktıyı saklamaz; redacted event metadata'sı anlamlı skill üretmeye yetmez. Telemetri uğruna içerik saklama güvenlik modelini zayıflatır.
- **Alternatif**: Kullanıcı açıkça istediğinde, seçilmiş ve secret içermeyen görev bağlamından normal skill oluşturma akışı kullanılır.

#### C2. Bağlam Duyarlı Otomatik Yönlendirme
- **Kaynak**: DeepSeek #11
- **Konsept**: Codex'in görev tipine göre en uygun provider'ı seçmesi için prompt içeriğini analiz edip profil önerisi sun. Otomatik uygulama yok; Codex'e öneri.
- **Değer**: Yanlış provider seçiminden kaynaklanan maliyet ve gecikme kaybını azaltır.
- **Uygulama**: `router.js` -> `suggestRoute(prompt)`: anahtar kelime + prompt uzunluğu + dosya referansı puanlaması. Regex tabanlı, LLM bağımlılığı yok. Yeni MCP aracı: `suggest_task_profile`.
- **Not**: AGENTS.md "LLM-as-a-judge kullanılmaz" ilkesiyle uyumlu (non-LLM implementasyon).

#### C3. Ekstraktif Son Kullanma Özetleme [BASİTLEŞTİRİLDİ]
- **Kaynak**: DeepSeek #12
- **Konsept**: `valid_until` geçmiş notların bilgi kaybını önlemek için ilk 3 cümle + en uzun 3 cümle ekstraktif seçici.
- **Karar Kapısı**: Soft-expiry zaten aramada gizliyor ve `includeExpired` ile kontrollü erişim sağlıyor. Review raporuna otomatik içerik preview'su eklemek gereksiz veri açığa çıkarır. Ölçülmüş bakım ihtiyacı oluşana kadar uygulanmasın.

#### C4. Alt Ajan Çağrı Tekrarı (Replay)
- **Kaynak**: DeepSeek #9
- **Konsept**: Başarısız alt ajan çağrısının redacted yürütme parametrelerini yeniden kullan; prompt'u saklama.
- **Değer**: Kullanıcı aynı prompt'u yeniden sağladığında retry ve lifecycle akışını karşılaştırılabilir biçimde tekrarlar. Provider çıktısının deterministik olduğu iddia edilmez.
- **Uygulama**: Replay kaydı prompt SHA-256, içeriksiz parametreler ve policy snapshot hash'i taşır. `replay_subagent_call` çağrısı prompt'u yeniden zorunlu alır ve hash eşleşmesini doğrular.

---

## Yeni Nesil Özellikler Bağımlılıkları

```
Faz A (Araştırma) --karar kapıları karşılanmadan uygulanmaz-->
  A1 (Debug Modu)
  A2 (Thrash Detector)  --ERTELENDİ, structured tool-event gerekli-->
  A3 (Sağlık Panosu)    --Faz 1C + 1D tamamlanınca zenginleşir-->
  A4 (Webhook Uyarı)

Faz B (Yapısal) --ana plan Faz 1 tamamlanınca-->
  B1 (Çapraz Doğrulama)
  B2 (Semantik Cache)   --read-only-cache.js genişletmesi-->
  B3 (Otomatik Etiket)  --ERTELENDİ, Vault > 100 not olunca-->
  B4 (Gecikme Yüzdelik)
  B5 (Pre-commit/Gölge CI) --ERTELENDİ, maliyet ve false-positive ölçümü gerekli-->
  B6 (İlişki Grafı)     --ERTELENDİ, görsel arayüz olunca-->

Faz C (Vizyon) --ana plan Faz 2 tamamlanınca-->
  C1 (Yetenek Sentezi)  --REDDEDİLDİ-->
  C2 (Otomatik Yönlendirme)
  C3 (Ekstraktif Özet)
  C4 (Replay)           --A1 Debug modu bağımlı-->
```

---

## Sektör Referans Mimarileri (Web Araştırması, Ağustos 2026)

Mevcut mimarimizin sektördeki konumunu ve uygulanabilir pattern'leri belirlemek için yapılan araştırma.

### Orkestrasyon Desenleri

| Desen | Kaynak | Bizim Durum |
|---|---|---|
| Orchestrator-Workers | Anthropic "Building Effective Agents" (2024) | Codex=orchestrator, DeepSeek/Diğer=worker — birebir uyuyor |
| Evaluator-Optimizer | Anthropic (2024) | Zod doğrulama mevcut; kalite puanlama adımı eklenebilir |
| Routing | Anthropic (2024) | Rol tabanlı (analyst/researcher/reviewer/planner) — uygulanmış |
| Parallelization | Anthropic (2024) | Faz B1 (paralel subagent) ile planlanmış |
| Stateful/Durable Execution | LangGraph (2024-2026) | Zod + retry mevcut; tam checkpointing yok |

### Ajan İletişim Protokolleri

| Protokol | Durum | Bizim İçin |
|---|---|---|
| MCP (2026-07-28) | Aktif standart | Zaten kullanıyoruz. Tasks uzantısı yalnız OpenCode host desteği doğrulanınca değerlendirilebilir |
| A2A v1.0 (Google/Linux Foundation) | Yeni standart (25.3k ⭐) | Dış sistem entegrasyonu gerekirse. AgentCard keşif mekanizması referans alınabilir |
| SLIM (IETF draft) | Erken aşama (200 ⭐) | Henüz üretime hazır değil, takip edilsin |

### Human-in-the-Loop

- **LangGraph interrupt()**: Dinamik duraklatma, Command(resume) ile devam. Kritik işlemler öncesi onay.
- **Bizim için**: Kod yazma, dosya değiştirme gibi geri alınamaz işlemler öncesinde interrupt benzeri onay mekanizması değerlendirilebilir. Mevcut `acknowledgeMemoryConflicts` bu pattern'in hafıza katmanındaki örneğidir.

### Kurumsal Agent Framework'ler

- **Microsoft Agent Framework (MAF)**: AutoGen'in kurumsal halefi (12.7k ⭐). Graph tabanlı workflow, durable execution, OpenTelemetry, A2A/MCP cross-runtime.
- **LangGraph**: Stateful graph, checkpointing, streaming, human-in-the-loop (39.4k ⭐).
- **Bizim konum**: Hafif, bağımlılıksız, yerel-öncelikli. Bu framework'lerin aksine sunucu/infra gerektirmez. Pattern'ler referans alınır, bağımlılık eklenmez.

### Bellek Sistemleri (2025-2026)

- **LangGraph Store API**: Namespace/key hiyerarşisi, embedding arama, semantic/episodic/procedural tipler.
- **Trustcall**: Strict decoding ile bellek güncellemelerinde şema bütünlüğü.
- **Bizim Vault**: LangGraph'ın üç bellek tipini (semantic/episodic/procedural) zaten destekliyor + ek olarak preference ve decision. Embedding tabanlı arama yok; mevcut keyword arama + metadata sinyalleriyle çalışıyor.

---

## Uygulanmayacak Kararlar (Gerekçeli)

| Öneri | Gerekçe |
|---|---|
| MicroVM/eBPF sandbox yalıtımı | Mevcut tehdit modelinde rol-tabanlı tool sınırlaması yeterli; Hyper-V/WSL2 seçenekleri mevcut olsa da operasyon maliyeti yüksek |
| Redis/etcd dağıtık lock | Aynı makinede ortak dosya sistemi lock'u mevcut ölçek için yeterli; dış bağımlılık eklemez |
| Git branching hafıza alanı | Git geçmişine secret sızma riski; mevcut redacted audit journal daha güvenli |
| LLM-as-a-judge otomatik değerlendirme | Ek maliyet ve model bağımlılığı; sentetik ground-truth seti daha deterministik |
| API gateway proxy (LiteLLM) | Mevcut atomik bütçe hard cap ve provider health circuit breaker hedefi yeterli; ayrı proxy çalışma zamanı ek servis yönetim yükü getirir |
| Semantik/vektör arama | Genişletilmiş baseline'da ölçülmüş fayda gösterilene kadar ertelendi; altyapı Faz 1B'de hazırlanacak |
| Subagent'a not düzeyinde Vault okuma izni | Mevcut tümden ret + seçilmiş bağlam modeli daha güvenli |
| Otomatik not silme veya birleştirme | Codex kararı olmadan geri döndürülemez işlem yapılmaz |

---

## Doğrulama Komutları

| Komut | Kapsam |
|---|---|
| `npm test` | Tam regresyon (253 test) |
| `npm run verify` | Dosya bütünlüğü, skill hash eşitliği, provider sağlığı |
| `npm run smoke` | MCP araç kaydı, DeepSeek/AGY sağlığı, hafıza probe |
| `npm run memory:review` | Gerçek Vault yaşam döngüsü denetimi |
| `npm run memory:evaluate` | Sentetik retrieval baseline (precision, recall, abstention, token bütçesi) |
| `npm run metrics` | Redacted metrik özeti |
| `npm run pilot` | Sentetik DeepSeek çağrısı (yerel dosya içeriği göndermez) |

---

## Versiyon

- Plan tarihi: 2026-08-11
- Test baseline: 264/264 PASS
- Node: v24.17.0
- Codex: codex-cli 0.147.0 (GPT-5.6 Sol)
- DeepSeek: v4-pro (OpenCode 1.18.16)
- GLM: 5.2 (OpenCode 1.18.16)
- Antigravity: 1.1.12 (Gemini 3.1 Pro High, Gemini 3.8 Flash High)
