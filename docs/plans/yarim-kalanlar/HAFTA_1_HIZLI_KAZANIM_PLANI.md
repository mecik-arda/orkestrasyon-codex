# Hafta 1 Hızlı Kazanım Planı

> Yüksek etkili, düşük eforlu iyileştirmeler — 7 gün içinde tamamlanabilir.

## Uygulama Durumu

Durum notu (2026-09-27): Madde 3 GLM HighSpeed Production Doğrulaması planın kendi kapsamı ve kabul kriterleri içinde açık teslimattır. Gerçek read-only/edit pilotları abonelik yetkisi yokluğu nedeniyle bloklu kaldığından plan `yarim-kalanlar` altında sınıflandırılır.

2026-08-12 tarihinde planın kod ve yapılandırma kapsamı uygulanmıştır:

- Kimi ve Qwen için OpenCode katalog routing'i, exact model whitelist'i, health araçları, read-only ve kontrollü edit MCP yüzeyi eklendi. Yerel `opencode models` kataloğunda ilgili provider kayıtları bulunmadığı için health sonucu `available: false` döner ve çağrılar provider başlamadan fail-closed reddedilir.
- Edit task profilleri için fallback zinciri kontrollü disposable workspace katmanına eklendi. Her fallback yeni workspace ile başlar; secret ve kalıcı policy hataları zinciri durdurur.
- `low_cost_glm_highspeed` profili eklendi. GLM 5.2 HighSpeed katalogda görünür ancak canlı acceptance sonucu mevcut Z.ai aboneliğinin HighSpeed erişimi içermediğini gösterdi. Durum `BLOCKED / SUBSCRIPTION ENTITLEMENT REQUIRED` olarak kalır.
- Aylık `$50` hard cap ve `%80` uyarı eşiği aktif edildi. `npm run budget` anlık snapshot döndürür. Günlük `$5` cap, 2026-08-14'te kullanıcı kararıyla kaldırıldı (sık denetim seansları günlük bütçeyi bloke ediyordu); aylık cap korunuyor.
- 2026-08-15 gece çalışması: GLM 5.3 (`glm_5_3` → `zai-coding-plan/glm-5.3`) ve Gemini 3.7 Flash (`gemini_flash_3_7` → `gemini-3.7-flash-high`) sisteme opt-in alias olarak eklendi. 2026-09-04'te doğrulanan Gemini 3.8 Flash (`gemini_flash` ve `gemini_flash_3_8` → `gemini-3.8-flash-high`) varsayılan Flash oldu; `glm_5_2` varsayılanı korundu. `check_glm_subagent` artık `glm53Model`/`glm53ModelAvailable` döndürür. 2026-09-05'te GLM 5.3 Flash (`glm_5_3_flash` → `zai-coding-plan/glm-5.3-flash`) düşük maliyetli hızlı yardımcı olarak opt-in eklendi; `check_glm_subagent` `glm53FlashModel`/`glm53FlashModelAvailable` döndürür. rate_limited ilk retry gecikmesi 4x tabanla başlayacak şekilde düzeltildi (gece NORN oturumunda gözlenen 429 zincirleme başarısızlıklarının kök nedeni).
- `npm test`: `302/302 PASS` (2026-08-21 teknik takip ve denetim paketi sonrasi).
- `npm run verify`: PASS.
- `npm run smoke`: PASS; 25 MCP aracı kayıtlıdır.

HighSpeed canlı kök neden kanıtı: `Your current subscription plan does not yet include access to GLM-5.2-Highspeed`.

---

## Mevcut Durum

| Metrik | Değer |
|---|---|
| Test | 302/302 PASS |
| Production adapter | 4 (Antigravity, Codex, OpenCode, ClaudeCode) |
| Katalog bekleyen provider | Kimi, Qwen |
| MCP aracı | 25 |
| Runtime servisi | 12 |
| Doğrulanmış model | Gemini Pro/Flash, Claude Sonnet, DeepSeek Pro/Flash, GLM 5.2, GPT-5.6 |
| Edit fallback | Disposable workspace ile aktif |
| GLM HighSpeed | BLOCKED / SUBSCRIPTION ENTITLEMENT REQUIRED |
| Maliyet kotası | Aylık $50 hard cap (günlük cap 2026-08-14'te kaldırıldı) |

---

## Madde 1: Kimi ve Qwen Provider Adapter'ları

### Amaç
Çin menşeli iki büyük model sağlayıcısını subagent bridge'e bağlamak. Kimi (Moonshot AI) ve Qwen (Alibaba) modelleri OpenCode üzerinden zaten destekleniyor; bridge tarafında dedicated adapter'ları yok.

### Kapsam
- `subagent-bridge/src/catalog-provider.js` — Kimi ve Qwen model mapping, katalog health ve prompt sözleşmelerini ortak modülde tut
- `config/agents.json` — Kimi ve Qwen model tanımlarını ekle
- `subagent-bridge/src/frontends/mcp/tools.js` — `check_kimi_subagent`, `run_kimi_subagent`, `check_qwen_subagent`, `run_qwen_subagent` araçlarını kaydet
- `subagent-bridge/src/frontends/mcp/server.js` — MCP tool handler'larını bağla
- `subagent-bridge/src/runtime/bridge-runtime.js` — Route tablosuna Kimi/Qwen ekle
- `tests/catalog-provider.test.js` — Kimi/Qwen alias, whitelist, route, agent seçimi, MCP şeması ve fail-closed katalog testleri
- `opencode.jsonc` — `kimi-readonly`, `kimi-edit`, `qwen-readonly`, `qwen-edit` agent tanımları
- `config/policy.json` — Kimi/Qwen için task profilleri ve maliyet limitleri

### Model Referansı
Firma | Model | Bağlam | Maliyet (girdi/çıktı, 1M token) | Yetenek
---|---|---|---|---
Kimi (Moonshot) | kimi-k2.5-instruct | 128K | $0.29 / $0.58 | Reasoning, kod üretimi, araç kullanımı
Kimi (Moonshot) | kimi-k2-thinking | 128K | $0.29 / $0.87 | Derin akıl yürütme
Alibaba (Qwen) | qwen3-coder-480b-a35b | 128K | $0.55 / $1.10 | Kod üretimi (MoE)
Alibaba (Qwen) | qwen3-coder-plus | 128K | $1.97 / $5.74 | En güçlü varyant (30/70 MoE)
Alibaba (Qwen) | qwen3-coder-30b-a3b | 128K | $0.08 / $0.18 | En ucuz varyant (10/90 MoE)

Not: Bu modeller ortak catalog-provider katmanı üzerinden OpenCodeAdapter'a yönlendirilir; tam provider/model kimliği allowlist ile doğrulanır.

### Kabul Kriterleri
- `check_kimi_subagent` ve `check_qwen_subagent` health raporu döndürür
- Her iki adapter'da read_only ve edit modları çalışır
- Model mapping doğru provider/model eşlemesini yapar
- Error classification (rate_limit, auth, timeout) adapter bazında çalışır
- Testler 7+ test vakası içerir, `npm test` geçer
- `npm run verify` ve `npm run smoke` geçer

---

## Madde 2: Edit Pilot'lara Fallback Zinciri

### Amaç
Şu an sadece `read_only` task profillerinde `fallbackTargets` desteği var. Edit (mutasyon) işlemleri tek bir modele bağımlı — model kota/429/health hatası alırsa iş tamamen başarısız oluyor. Edit profillerine de read_only'dekiyle aynı fallback zincirini eklemek.

### Kapsam
- `config/policy.json` — `implementation`, `glm_implementation`, `critical_implementation` profillerine `fallbackTargets` ekle
- `subagent-bridge/src/runtime/bridge-runtime.js` — Edit modunda fallback routing mantığını etkinleştir
- `subagent-bridge/src/services/retry-service.js` — Edit mutasyonları için özel retry politikası (aynı işi farklı modelle dene, aynı modelle retry yapma)
- `subagent-bridge/src/services/provider-circuit-breaker.js` — Circuit breaker'ın edit fallback'i tetiklemesini sağla
- `tests/faz-p0-runtime.test.js` veya yeni `tests/edit-fallback.test.js` — Edit fallback zinciri testleri

### Fallback Zinciri Tasarımı
```
implementation profili:
  Primary: GLM 5.2 (edit)
  Fallback 1: DeepSeek Pro (edit)
  Fallback 2: Codex GPT-5.6 (edit)
  Fallback 3: Gemini Pro (edit)

critical_implementation profili:
  Primary: GLM 5.2 (edit)
  Fallback 1: Codex GPT-5.6 (edit)
  Fallback 2: DeepSeek Pro (edit)
```

### Önemli Kısıt
Edit fallback'te **idempotency sorunu** var: İlk model kısmi değişiklik yapıp başarısız olursa, ikinci model tutarsız workspace görür. Çözüm: Her edit fallback denemesinde **disposable workspace'i sıfırdan kopyala** (mevcut `disposable-workspace.js` altyapısı kullanılarak).

### Kabul Kriterleri
- `implementation` profili primary model başarısız olduğunda fallback'e geçer
- Her fallback denemesi temiz disposable workspace ile başlar
- Fallback zinciri tükendiğinde anlamlı hata döner
- Circuit breaker edit fallback'i tetikleyebilir
- Testler geçer, `npm test` bozulmaz

---

## Madde 3: GLM HighSpeed Production Doğrulaması

### Amaç
GLM 5.2 HighSpeed (`glm_5_2_highspeed`) modeli şu an `CONFIGURED/AUTH-DEPENDENT` durumda — kodda var ama gerçek bir çalıştırma ile doğrulanmadı. Production'da kullanılabilir olduğunu testlerle kanıtlamak.

### Kapsam
- `subagent-bridge/src/glm.js` — HighSpeed model çözümlemesini kontrol et, eksik mapping varsa ekle
- GLM HighSpeed ile gerçek pilot çalıştırması yap
- `tests/glm-subagent.test.js` — HighSpeed model çözümleme ve mod politikası testlerini ekle
- `config/policy.json` — HighSpeed için `low_cost_analysis` profili ve maliyet limiti
- Pilot sonucunu `glm_5_2_highspeed` backend etiketiyle metrics'e kaydet

### Doğrulama Adımları
1. `check_glm_subagent` ile HighSpeed modelinin health durumunu kontrol et
2. `run_glm_edit_pilot` ile disposable workspace'te `sum.js` fixture'ını düzenlet
3. `run_glm_subagent` ile read_only analiz yaptır
4. Sonuçları structured output şemasından geçir
5. Metrics kaydını kontrol et

### Kabul Kriterleri
- HighSpeed modeli health check'ten başarıyla geçer
- Read-only analiz doğru structured output döndürür
- Edit pilot çalışır ve disposable workspace'te değişiklik yapar
- GLM Pro ve HighSpeed arasında model çözümlemesi doğru çalışır
- Provider durumu `CONFIGURED/AUTH-DEPENDENT` → `VERIFIED` olarak güncellenir
- `npm test` ve `npm run verify` geçer

---

## Madde 4: Gerçek Maliyet Kotası (Hard Cap)

### Amaç
Şu an `config/policy.json` içindeki `dailyCostLimitUsd` ve `monthlyCostLimitUsd` opsiyonel alanlar — tanımlı değilse bypass ediliyor. `reliability-budget.js` rezervasyon yapıyor ama bütçe tanımlı değilse her zaman onaylıyor. Bu alanları zorunlu hale getirip gerçek bir hard cap mekanizması kurmak.

### Kapsam
- `config/policy.json` — Varsayılan günlük/aylık limit değerleri ekle (örn. günlük $5, aylık $50)
- `subagent-bridge/src/services/reliability-budget.js` — Bütçe yoksa `ACCEPT` yerine `REJECT` dönecek şekilde güncelle
- `subagent-bridge/src/runtime/bridge-runtime.js` — Bütçe reddi durumunda anlamlı hata mesajı ve kalan kota bilgisi döndür
- `subagent-bridge/src/metrics.js` — Günlük/aylık harcama özetini hesaplayan fonksiyon ekle
- `scripts/report-metrics.js` — `npm run metrics` çıktısına günlük/aylık bütçe kullanım yüzdesi ekle
- Yeni `npm run budget` script'i — anlık bütçe durumunu göster
- `tests/reliability.test.js` — Bütçe aşımı reddi testleri ekle

### Politika Tasarımı
```json
{
  "cost": {
    "dailyCostLimitUsd": 5.0,
    "monthlyCostLimitUsd": 50.0,
    "enforceHardCap": true,
    "warningThresholdPercent": 80
  }
}
```

- `warningThresholdPercent`: %80'i aşınca uyarı log'la ama işlemi durdurma
- %100 aşılınca tüm yeni işlemleri reddet (mevcut işlemler tamamlansın)
- Günlük sıfırlama: UTC 00:00
- Aylık sıfırlama: Ayın ilk günü UTC 00:00

### Kabul Kriterleri
- `dailyCostLimitUsd` tanımlı ve aşıldığında yeni işlemler reddedilir
- `monthlyCostLimitUsd` tanımlı ve aşıldığında yeni işlemler reddedilir
- Red durumunda kalan kota bilgisi hata mesajında yer alır
- `npm run metrics` bütçe kullanım yüzdesini gösterir
- `npm run budget` anlık durumu gösterir
- %80 eşiğinde uyarı log'lanır
- Testler geçer, mevcut testler bozulmaz

---

## İş Sırası ve Tahmini Efor

| # | Madde | Tahmini Süre | Bağımlılık |
|---|---|---|---|
| 1 | Kimi Adapter | 2-3 saat | Yok |
| 2 | Qwen Adapter | 2-3 saat | Yok |
| 3 | Edit Fallback Zinciri | 3-4 saat | Yok |
| 4 | GLM HighSpeed Doğrulama | 1-2 saat | Yok |
| 5 | Maliyet Hard Cap | 2-3 saat | Yok |

Toplam tahmini efor: **10-15 saat** (1-2 gün)

Tüm maddeler bağımsız, paralel çalışılabilir.

---

## Riskler

- Kimi/Qwen API endpoint'leri veya auth mekanizmaları OpenCode provider routing'de beklenmedik davranabilir
- Edit fallback'te disposable workspace sıfırlama maliyeti büyük repolarda yavaş olabilir
- GLM HighSpeed kota/rate-limit politikası Pro'dan farklı olabilir
- Maliyet hesaplaması model başına token fiyatlandırmasında hata payı içerebilir (tam token sayımı her adapter'da mümkün değil)

---

## Doğrulama Kapısı

Tüm maddeler tamamlandığında:

```bash
npm test        # Tüm testler geçmeli
npm run verify  # Proje doğrulaması geçmeli
npm run smoke   # MCP smoke testi geçmeli
```

Yeni test dosyaları: `tests/catalog-provider.test.js` ve `tests/edit-fallback.test.js`.

---

## GLM 5.2 Teknik İnceleme (2026-08-12)

> 7 kaynak dosya üzerinden yapılan derinlemesine analiz. Her madde için mevcut kodla çapraz doğrulandı.

### Madde 1: Kimi/Qwen Adapter — Kritik Bulgular

**Plan hatası:** Plan dedicated `kimi-adapter.js`/`qwen-adapter.js` dosyaları yaratmayı öneriyor. Bu gereksiz — `parseOpenCodeOutput`, `classifyOpenCodeError` zaten aynı. GLM pattern'inde hafif modül (`kimi.js`/`qwen.js`) yeterli.

**Asıl eksiklikler (6 nokta):**
1. `router.js` — `target:'kimi'`/`target:'qwen'` route'u yok
2. `agents.json` — `allowedModels`'de 5 model ID eksik → `resolveModel` reject eder
3. `opencode-adapter.js` — `OPENCODE_MODEL_MAP`'te alias yok
4. `bridge-runtime.js` — `controlledEditExecution`/`controlledEditPilot` listesinde kimi/qwen caller'ı yok
5. `opencode-adapter.js` — `buildOpenCodeArgs`'ta caller dalı yok → yanlış agent seçilir
6. `tools.js`/`server.js` — MCP araç şema ve handler'ı yok

**Diff önerisi:**
```
--- a/subagent-bridge/src/runtime/router.js
+ if (target === "kimi") return { backend:"opencode", model: model || "kimi_k2_5_instruct", kimi: true };
+ if (target === "qwen") return { backend:"opencode", model: model || "qwen3_coder_480b", qwen: true };

--- a/subagent-bridge/src/adapters/opencode-adapter.js
+ kimi_k2_5_instruct: "moonshot/kimi-k2.5-instruct",
+ kimi_k2_thinking: "moonshot/kimi-k2-thinking",
+ qwen3_coder_480b: "alibaba/qwen3-coder-480b-a35b",
+ qwen3_coder_plus: "alibaba/qwen3-coder-plus",
+ qwen3_coder_30b: "alibaba/qwen3-coder-30b-a3b"

--- a/config/agents.json (opencode.allowedModels)
+ "moonshot/kimi-k2.5-instruct", "moonshot/kimi-k2-thinking",
+ "alibaba/qwen3-coder-480b-a35b", "alibaba/qwen3-coder-plus", "alibaba/qwen3-coder-30b-a3b"
```

**Test stratejisi:** `tests/catalog-provider.test.js` — Kimi ve Qwen alias çözümü, allowedModels whitelist, router route, caller agent seçimi, public MCP şema kısıtları ve katalogda bulunmayan modelin provider başlamadan fail-closed reddi. En az yedi deterministik vaka korunur.

**Güvenlik:**
- `allowedModels` WHITELIST zorunlu — asla `*` kabul etme
- `buildKimiPrompt` shell/subagent/secret kullanma kısıtı içersin
- MCP tool description'larında secret/auth değeri gösterme

---

### Madde 2: Edit Fallback Zinciri — Kritik Bulgular

**Plan hatası:** Plan fallback'i `run():212` satırına eklemeyi öneriyor. Ama edit pilot'lar `executeControlledOpenCodeEdit` içinden `run()` çağırır ve burada fallback yok. Ayrıca `shouldRetry` edit modunda `mutation_state_unknown` döndürdüğü için `run()` içinde retry zaten kapalı.

**Doğru yaklaşım:** `executeControlledOpenCodeEdit` içine ayrı bir fallback döngüsü ekle. Her denemede yeni `provisionDisposableWorkspace` + `disposable.cleanup()`. Circuit breaker'ı her fallback öncesi sorgula.

**Diff önerisi:**
```
--- a/subagent-bridge/src/runtime/bridge-runtime.js
async function executeControlledOpenCodeEdit(input, workspace, signal, options) {
  const fallbacks = options.fallbackProviders || [];
  const attempts = [{resolvedModel, caller, editAgentName, providerLabel}];
  for (const fb of fallbacks) attempts.push({...fb});
  for (let i = 0; i < attempts.length; i++) {
    disposable = provisionDisposableWorkspace(config, sourceWorkspace, files, targetFiles, attempt.editAgentName);
    const result = await run({target, model:attempt.resolvedModel, caller:attempt.caller, ...});
    if (result.ok) { payload = buildPayload(...); break; }
    if (i === attempts.length-1) { payload = buildFailurePayload(result); }
    try { disposable.cleanup(); } catch {}
  }
}
```

**Test stratejisi:** `tests/edit-fallback.test.js` — primary rate_limited → fallback'e geçiş, disposable workspace yeniden yaratma, tüm fallback başarısız → anlamlı hata, abortSignal iptali, promote yalnız son başarılı denemede.

**Güvenlik:**
- Her fallback denemesinde `secretPatterns` kontrolü yeniden çalışır
- `promoteChanges` baseline kontrolü fallback sonrası da geçerli
- `secret_detected` → sonraki modele geçme, hard fail

---

### Madde 3: GLM HighSpeed Doğrulama — Kritik Bulgular

**Plan gereksiz yere "eksik mapping varsa ekle" diyor.** Mapping ZATEN TAM:
- `GLM_MODEL_MAP` → `glm_5_2_highspeed: "zai-coding-plan/glm-5.2-highspeed"`
- `resolveGlmModel` → `configuration.glm?.openCodeHighSpeedModel` override
- `agents.json` → `allowedModels`'de model ID var
- `checkGlm` → `highSpeedModelAvailable` döndürür
- `tools.js` → `runGlm` model enum'unda `glm_5_2_highspeed` var

**Asıl eksiklikler:**
1. `policy.json`'da highspeed kullanan task profili yok
2. `checkGlm` yalnız provider kaydını gösterir, gerçek auth doğrulamaz
3. `AUTH-DEPENDENT → VERIFIED` geçişi elle pilot gerektirir (kodla değil)

**Diff önerisi:**
```
--- a/config/policy.json
+ "low_cost_glm_highspeed": { "target":"glm", "model":"glm_5_2_highspeed", "mode":"read_only", "priority":22, "cacheable":true }
```

**Elle pilot adımları:**
1. `check_glm_subagent` → `highSpeedModelAvailable: true`
2. `run_glm_edit_pilot` fixture `sum.js` ile
3. `run_glm_subagent` read-only JSON çıktı şema doğrulaması
4. Metrics `glm-runs.jsonl`'de highspeed backend etiketi kontrolü

---

### Madde 4: Maliyet Hard Cap — Kritik Bulgular

**Planın `enforceHardCap` boolean önerisi GEREKSİZ.** Limit tanımlıysa cap zaten hard (`reserveCostBudget:385-390`). Asıl eksik: `warningThresholdPercent` — hiçbir yerde uyarı loglanmıyor.

**Diff önerisi:**
```
--- a/config/policy.json
  "reliability": {
+   "dailyCostLimitUsd": 5.0,
+   "monthlyCostLimitUsd": 50.0,
+   "warningThresholdPercent": 80,

--- a/subagent-bridge/src/metrics.js (getCostBudgetSnapshot)
+ dailyWarning: dailyLimit && (dailySpentUsd/dailyLimit) >= (warningThreshold/100),
+ monthlyWarning: monthlyLimit && (monthlySpentUsd/monthlyLimit) >= (warningThreshold/100),
+ dailyUsagePercent: dailyLimit ? Math.round(dailySpentUsd/dailyLimit*100) : null,
+ monthlyUsagePercent: monthlyLimit ? Math.round(monthlySpentUsd/monthlyLimit*100) : null,
```

**Test stratejisi:** `tests/reliability.test.js` — limit aşımı reddi, duplicate reservation, settlement, warningThreshold %80'de dailyWarning:true, UTC sınır testi, null limit backward compat.

**Dikkat:** Maliyet hesabı adapter'lardan gelen `totalCostUsd` bazen `null` → `maxUnknownAttemptCostUsd` rezervasyonu tahmini. Gerçek aşım yakalanmayabilir. Bir hafta gerçek metrics toplamadan değerleri sabitleme.

---

### Genel Riskler

| Risk | Açıklama |
|---|---|
| Kimi/Qwen auth | OpenCode provider routing ayrı API key gerektirebilir; `createProviderEnvironment` doğrulanmalı |
| Disposable size | Edit fallback her denemede yeniden kopyalar; `maximumTotalBytes 5MB` sınırı var |
| GLM HighSpeed auth | Otomatik testle kanıtlanamaz; `checkGlm` yalnız provider kayıt varlığını gösterir |
| Maliyet alt-tahmin | `totalCostUsd` bazen null; gerçek aşım yakalanmayabilir |
| ConfigVersion | `warningThresholdPercent`, `fallbackProviders` yeni alanlar; config loader strict mode kontrol edilmeli |
| Cost journal | `cost-budget-runs.jsonl` rotation regex'i farklı prefix; disk şişmesi riski |
| Model ID mismatch | Kimi/Qwen model ID yazımı OpenCode provider kaydıyla birebir eşleşmeli; sessiz reject |

### Açık Sorular

1. Kimi/Qwen için OpenCode'da ayrı API credential gerekiyor mu?
2. Edit fallback zinciri `policy.json`'da mı yoksa hardcode runtime sabiti olarak mı?
3. GLM HighSpeed'in gerçek token fiyatlandırması nedir? Plan tablosunda belirtilmemiş.
4. $5 günlük / $50 aylık geçici başlangıç mı, production kalıcı değer mi?
5. Dedicated adapter (plan) vs hafif modül (GLM önerisi) — hangisi tercih edilsin?
6. `warningThresholdPercent` aşımı yalnız log mu, MCP health raporunda da gösterilsin mi?
