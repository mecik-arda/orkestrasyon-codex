# GPT-6.1-Sol OpenCode Global Tool Yönlendirme Düzeltmesi

Tarih: 2026-10-06
Durum: doğrulandı
Amaç: OpenCode özel Codex araçlarının GPT-6.1-Sol'u seçememesi sorununu kanıtlamak, gidermek ve E2E sonucu kaydetmek.
Kapsam: Kullanıcı-genelindeki OpenCode bridge tool wrapper'ı, Bridge Codex dispatch sözleşmesi ve kişisel-global E2E testi.
Kapsam dışı: Drive yedekleme kaynak ağacı, kullanıcı-genelindeki MCP yapılandırması, sağlayıcı auth/erişim değişikliği ve GLM çağrıları.
Hazırlayan: Ana orkestratör
Doğrulayan: Ana orkestratör; DeepSeek kaynak incelemesi ve E2E tool metadata'sı.

## Yönetici Özeti

Hata Orkestrasyon Bridge Codex adapter'ında değildi. Kullanıcı-genelindeki `~/.config/opencode/tools/subagent-bridge.js` içinde `codex` ve `codexSol6` araçları kapalı model sabitiyle `gpt-6-sol` çağırıyordu. Araç şeması yalnız `prompt` ve `workspace` kabul ettiğinden, prompt metninde GPT-6.1-Sol yazılması model seçimini değiştiremiyordu.

Global model-belirtilmeyen `codex` aracı artık `gpt-6.1-sol` kullanıyor. Açık seçim için `codexSol61` aracı eklendi; eski `codexSol6` GPT-6-Sol olarak korundu. `npm run p2b:e2e`, `codex` aracının gerçek Bridge sonucu `requestedModel` ve `resolvedModel` metadata'sında GPT-6.1-Sol döndürdüğünü doğruladı.

## Kanıt Ve Bulgular

### VERIFIED: Kök neden global tool wrapper'ında sabit modeldi

Kanıt:

- `~/.config/opencode/tools/subagent-bridge.js` içindeki `createCodexModelReadOnlyTool(model, label)` yalnız `prompt` ve `workspace` argümanlarını tanımlar; `runtime.run` çağrısına kapalı `model` değerini aktarır.
- Aynı dosyanın `codex` dışa aktarımı önce `gpt-6-sol` ile sabitlenmişti; `codexSol6` da aynı modeli seçiyordu ve GPT-6.1-Sol aracı yoktu.
- Verilen OpenCode session'ında genel Codex tool sonuçlarında `requestedModel` ve `resolvedModel` GPT-6-Sol'du. Prompt'taki model adı gerçek tool argümanı değildi.
- Bridge tarafında `run_codex_subagent` modeli GPT-6.1-Sol varsayılanıyla kabul eder (`subagent-bridge/src/frontends/mcp/tools.js:101-106`); MCP handler model alanını runtime'a geçirir (`tools.js:294-296`), router explicit modeli korur (`subagent-bridge/src/runtime/router.js:17-37`) ve Codex adapter `--model` argümanına aktarır (`subagent-bridge/src/adapters/codex-adapter.js:11-25,75-101`). `sol61_review` profili de `config/policy.json` içinde GPT-6.1-Sol'a yönlenir.

Etkisi: Health/configuration'da model listelenmesi, sabit model kullanan OpenCode özel aracından onu seçebileceğini kanıtlamaz. Sorun tool binding layer'ında meydana gelmiştir.

### VERIFIED: Global route düzeltildi ve kişisel-global E2E'de doğrulandı

Uygulama:

- `codex` varsayılanı GPT-6-Sol'dan GPT-6.1-Sol'a alındı; böylece `AGENTS.md` ile belirtilen model-belirtilmeyen global Codex varsayılanı hizalandı.
- `codexSol61` açık GPT-6.1-Sol salt-okunur aracı eklendi.
- `codexSol6` GPT-6-Sol olarak bırakıldı; kullanıcı açıkça eski modeli seçebilir.
- `scripts/p2b-personal-global-e2e.js`, global tool varsayılanının GPT-6.1-Sol olduğunu, GPT-6 ve GPT-6.1 adlı araçların ikisinin de mevcut olduğunu ve Codex fixture sonucunda `requestedModel === resolvedModel === "gpt-6.1-sol"` olduğunu kontrol eder.

Doğrulama:

- `node --check ~/.config/opencode/tools/subagent-bridge.js` başarılı.
- `node --check scripts/p2b-personal-global-e2e.js` başarılı.
- `npm test` 859/859 başarılı.
- `npm run verify` ve `npm run verify:ci` başarılı.
- `npm run p2b:e2e` başarılı: global `codex` aracı GPT-6.1-Sol ile doğru marker'ı okudu; `requestedModel` ve `resolvedModel` ikisi de `gpt-6.1-sol`; bütün fixture workspace'leri değişmeden kaldı.
- `git diff --check` temiz.

## Riskler Ve Güvenlik Sınırları

- Global OpenCode tool kurulumu kullanıcı-genelidir. Canonical wrapper artık `templates/opencode/subagent-bridge.js` içinde sürümlenir; `npm run opencode-tools:install` kurar, `npm run opencode-tools:check` kurulu kopyayla byte-for-byte eşleşmeyi doğrular. Başka makinelerde komut ayrıca çalıştırılmalıdır.
- Global tool tanımları OpenCode başlangıcında yüklenir. Açık oturum yeni `codex` varsayılanını ve `codexSol61` aracını ancak OpenCode tamamen kapatılıp yeniden başlatılınca görür.
- E2E, mevcut Codex CLI ile GPT-6.1-Sol'a canlı read-only çağrı yaptı; bu test metadata ve görev sonucunu kanıtlar, sağlayıcı fiyatını değil.

## Açık Sorular

- 2026-10-08 follow-up: tracked template ve installer eklendi; aktif kullanıcı-genelindeki wrapper bu kaynaktan yeniden üretildi ve `npm run opencode-tools:check` başarılı oldu. P2B Codex/Gemini Pro/Gemini Flash/workspace-context fixture'ları ayrı ayrı geçti. Gemini Flash 3.8 fixture'ı `headless mode cannot prompt` / `permission_denied` ile sonuçlandı; bu çağrı route değişikliğinin regresyonu olarak sınıflandırılamaz ve kör retry edilmedi.
- İki hata raporu Drive/yedekleme çalışma ağacında bulunur. Bu remediation onları değiştirmedi; raporlar geçmiş gözlemin kaydı olarak kalır.
