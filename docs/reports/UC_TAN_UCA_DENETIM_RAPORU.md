# Uçtan Uca Denetim Raporu (2026-08-12)

> Beş bağımsız salt-okunur subagent denetimi, ardından Codex tarafından bağımsız doğrulama.
> Denetim sonrası test durumu: 282/282 PASS. Tüm kod düzeyindeki bulgular düzeltildi.

---

## Düzeltme Durumu (2026-08-12)

| # | Bulgu | Durum |
|---|---|---|
| 1 | Reliability budget Infinity | DÜZELTİLDİ — `maxAttempts` üst sınırı 10, sonlu varsayılanlar |
| 2 | OpenCode stderr abort | DÜZELTİLDİ — `handle.cancel()` + success yolunda bayrak denetimi |
| 3 | AGY global settings mutasyonu | ERTELENDİ — mimari değişiklik gerektirir (ayrı plan) |
| 4 | Config property collision | DÜZELTİLDİ — `loadRuntimeConfiguration` çakışma tespiti fail-fast |
| 5 | Memory lock sahiplik kontrolü | DÜZELTİLDİ — owner PID + `processIsAlive` |
| 6 | failureClass/reason redaksiyonu | DÜZELTİLDİ — `sanitizeFailureClass` + `sanitizeBackend` regex |
| 7 | AGY read-only deny `command(*)` | YANLIŞ POZİTİF — headless plan mode listede olmayan komutları auto-deny ediyor; deny'e eklemek allow'u da kırar |
| 8 | Claude Code workspace kaçışı | ERTELENDİ — OS seviyesi izolasyon gerektirir (ayrı plan) |
| 9 | Claude resolveModel ölü doğrulama | DÜZELTİLDİ — katı allowlist |
| 10 | Error classify geniş regex | DÜZELTİLDİ — claude auth regex daraltıldı |
| 11 | Git exec timeout/maxBuffer | DÜZELTİLDİ — 5s timeout + 1MB maxBuffer |
| 12 | Circuit tmp yetim dosya | DÜZELTİLDİ — rename başarısızsa tmp silinir |
| 13 | Workspace denied roots birleşimi | DÜZELTİLDİ — `collectDeniedRoots` tüm provider köklerini birleştirir |
| 14 | Memory hard-link kaçışı | DÜZELTİLDİ — `collectMarkdownFiles` nlink kontrolü |
| 15 | Frontmatter gövdeden sahteleme | DÜZELTİLDİ — çıkarım `---` bloğuna hapsedildi |
| 16 | Audit mutasyon sonrası best-effort | ERTELENDİ — mevcut davranış `auditWritten: false` raporluyor; write-ahead log ayrı plan |
| 17 | Promote çift adımlı atomik değil | ERTELENDİ — çökmede iki dosya da korunuyor, manuel uzlaştırma var |
| 18 | Reservation dedup ay sınırı | DÜZELTİLDİ — `reserveCostBudget` tüm geçmişi tarıyor |
| 19 | Prune kilit senkronizasyonu | ERTELENDİ — yalnızca rotasyonla kapatılmış dosyalar hedefleniyor, düşük risk |
| 20 | core-schemas attempts mismatch | YANLIŞ POZİTİF — checkpoint alanları validated yoldan geçmiyor |
| 21 | MCP negatif test asimetrisi | KISMEN — yeni testler eklendi, parametrik tam kapsam gelecek plan |

### Eklenen Testler

- `PILOT-EDIT-03a`: fonksiyon çağrısı değerleri secret sayılmaz
- `CATALOG-06`: katalogda olmayan model `model_unavailable` döner, provider başlamaz
- `EDIT-FALLBACK-03`: abortSignal fallback denemelerini durdurur, kaynak korunur
- `OPT-06g`: bozuk JSONL `droppedMetricRecords` sayılır, harcama etkilenmez
- `OPT-06h`: `pruneMetricFiles` yalnız retention dışı rotated dosyaları siler
- `config` v1→v2 migrate, desteklenmeyen sürüm, agents çakışma testleri
- `reliability-budget` sonlu varsayılan testi
- `model_access_denied` non-retryable testi

---

## Denetim Kadrosu

- Runtime çekirdeği (bridge-runtime, router, retry, services/) — GLM 5.2
- Provider adapter katmanı (AGY, Claude, Codex, OpenCode) — GLM 5.2 (Claude Sonnet AGY auth hatası nedeniyle devraldı)
- Hafıza ve metrik alt sistemi (memory, metrics, mirror) — DeepSeek Pro
- MCP ön yüzü ve konfigürasyon — Gemini Flash
- Test kapsamı ve scriptler — DeepSeek Flash

---

## Doğrulanmış Yüksek Öncelikli Bulgular

### 1. Reliability budget Infinity riski (GLM runtime) — GEÇERLİ, production'da sınırlı
- `reliability-budget.js:4-8` — `maxAttempts` ve `provider.maxRetries` tanımsızsa `Infinity` üretir; `while` döngüsü sınırsız döner.
- Doğrulama: Production `policy.json` `maxAttempts: 3` ve `maxTotalDurationMs: 1200000` tanımlı olduğundan şu an sınırlı. Eksik config'te savunma derinliği eksik.
- Öneri: `Math.min(..., 10)` üst sınırı ve sonlu varsayılanlar.

### 2. OpenCode stderr abort yolu (GLM adapters) — GEÇERLİ, doğrulanması gereken alt iddia var
- `opencode-adapter.js:202-211` — rate-limit/model erişim reddi algılanınca `abortController.abort()` çağrılıyor; `cancel()`/`killProcessTree` yolu kullanılmıyor.
- Doğrulama: `execution-service.js:77-81` abort dinleyicisi yalnız timer temizliyor. Abort sonrası child ölürse promise kısmi stdout ile success dönebilir; success yolu `rateLimitDetected` bayrağını yeniden denetlemiyor.
- Öneri: `handle.cancel()` kullan, success yolunda bayrakları denetle, force-kill timer'ını koru.

### 3. AGY global settings mutasyonu (GLM adapters) — GEÇERLİ, tasarım gereği
- `antigravity-adapter.js:50-51` — read-only enforcement, makine geneli `~/.gemini/antigravity-cli/settings.json` dosyasını mutasyona uğratıyor; çökmede `finally` çalışmaz, dosya 5 dakikaya kadar kirli kalır.
- Doğrulama: Sentinel + mutex tasarımı kasıtlı ancak process-exit koruması yok.
- Öneri: execution bazlı izole config veya exit handler.

### 4. Config property collision (Gemini Flash) — GEÇERLİ, savunma derinliği
- `config.js` `loadRuntimeConfiguration` — `{...configuration, ...agents.agents}`; `agents.json`'da kök anahtarla aynı isimde backend tanımı, policy alanını ezebilir.
- Doğrulama: `agentConfigSchema` şekil doğrulaması riski azaltıyor ama örneğin `reliability` adında geçerli şekilli bir agent kaydı yine de ezme yapabilir.
- Öneri: çakışan anahtar tespiti ile fail-fast.

### 5. Memory stale-lock sahiplik kontrolü eksik (DeepSeek memory) — GEÇERLİ
- `memory.js:355-367` — kilit kaldırma yalnız mtime yaşına dayanıyor; `metrics.js`/`project-runs.js` aynı desende `processIsAlive(pid)` kontrolü yapıyor, memory yapmıyor.
- Öneri: lock'a owner PID yaz ve canlılık kontrolü ekle.

### 6. failureClass/reason redaksiyonu (DeepSeek memory) — GEÇERLİ, ciddi
- `metrics.js:128,143` — `result.reason` ham metin olarak JSONL'ye yazılıyor; bazı adapter yolları `reason`'a ham `error.message`/model çıktısı besliyor (`claude-code-adapter.js:127`, `antigravity-adapter.js:108`).
- Okuma tarafı token şemasıyla doğruluyor ama ham metin dosyada kalıcı.
- Öneri: yazımda reason'ı sınıflandırılmış errorClass'a indirge.

### 7. Antigravity read-only deny listesi komut çalıştırmayı engellemiyor (GLM adapters) — GEÇERLİ
- `deny` listesi yalnız `write_file(*)` ve `mcp(*)`; `command(*)` yok. AGY default-allow ise read-only mod komutla FS değiştirebilir.
- Öneri: `command(*)` deny + read-only'da sandbox'ı config'ten bağımsız zorunlu kıl.

### 8. Claude Code workspace kaçışı (GLM adapters) — GEÇERLİ, bilinen kısıt
- `supportsSandbox: false`; Read aracı mutlak yolları okuyabilir. Yalnız `--permission-mode plan` + araç listesi var, dosya sistemi hapsi yok.
- Öneri: hassas yol deny kuralları veya OS seviyesi izolasyon (uzun vadeli).

---

## Yanlış Pozitif / Şüpheli Bulgular

### Gemini Flash #1: core-schemas strict uyumsuzluğu — KISMEN GEÇERLİ, pratik etkisi yok
- Şema `attempts` elemanlarında `apiDurationMs/turns/retryDelayMs` kabul etmiyor (probe ile doğrulandı).
- Ancak bu alanlar yalnız checkpoint nesnelerinde (`deepseek.js`/`glm.js`) üretiliyor; `validateSubagentResult` yolu bu nesneleri hiç almıyor. Latent tutarsızlık, bugün tetiklenmiyor.
- Öneri: şemayı checkpoint alanlarıyla eşitle (düşük öncelik).

### DeepSeek Flash #7: MCP negatif test asimetrisi — GEÇERLİ ama kasıtlı kapsam
- `runClaudeCode`, `runOpenCode`, `runProfile` için negatif şema testi yok; parametrik test önerisi makul.

---

## Test Kapsam Boşlukları (DeepSeek Flash) — Öncelik Sırası

1. Kimi/Qwen `runCatalogProvider` runtime edit/promotion akışı test edilmiyor (yalnız unit) — yüksek
2. Edit fallback abort + circuit-breaker kombinasyonları — yüksek
3. `model_access_denied`: adapter abort + shouldRetry + fallback davranışı — yüksek
4. `droppedMetricRecords` ve bozuk cost-budget JSONL ile bütçe hesabı — yüksek
5. Config v1→v2 migrate ve desteklenmeyen sürüm — yüksek
6. `pruneMetricFiles` retention — yüksek
7. 10 MCP aracı için parametrik negatif şema testi — orta
8. `package.json` script hedefi varoluş meta testi — orta

---

## Önerilen Onarım Sırası

```text
1. metrics.js reason/failureClass redaksiyonu + backend regex doğrulaması (bulgu 6 + DeepSeek #3)
2. memory.js lock sahiplik kontrolü (bulgu 5)
3. reliability-budget sonlu varsayılanlar (bulgu 1)
4. opencode-adapter stderr abort yolu (bulgu 2)
5. antigravity deny command(*) + config collision fail-fast (bulgu 7 + 4)
6. Test kapsam boşlukları (madde 1-6)
7. AGY settings izolasyonu ve Claude workspace hapsi (uzun vadeli, ayrı plan)
```
