# Orkestrasyon V2 — Codex Hata Analizi ve Remediation Kararı

## Kapsam

İnceleme yalnız 2026-10-05 tarihli V2 pilotları/canary'leri sırasında görülen Codex sonuçlarını kapsar. Ham stdout/stderr saklanmadı; secret veya credential aktarılmadı. Gemini Flash hipotez üreticisi; DeepSeek Flash yerel kaynak analisti; GPT-6.1 Sol birleştirici ve nihai remediation danışmanı olarak kullanıldı. Alt-agent çıktıları kodda ve testlerde ana orkestratör tarafından doğrulandı.

## Codex olaylarının ayrımı

1. **`plan-open-criteria` → `auth_invalid`: kök neden unknown; sınıflandırıcı yanlış pozitif riski var.** Bir V2 task 24,329 ms sonra `auth_invalid`, `reason=auth_invalid`, genel `authentication failure` etiketi döndürdü; ham provider çıktısı saklanmadığı için altta yatan hata bilinmiyor. Daha sonra gpt-5.6-luna capability probe'unda modelAccess/toolfree available oldu ve aynı model/profile ile ayrı batch 3/3 tamamlandı. Bu gözlemler ilk çağrının nedenini çözmüyor.
2. **`provider-windows-gates` → `blocked`: prompt stop-condition sonucu, provider failure değil.** İlk görev shell/CLI gerekirse durmayı açıkça şart koşmuştu. Worker bu kurala uydu. Sonraki batch'te shell yalnız read-only snapshot dosyalarını okumak için açıkça serbest bırakılınca ilgili analiz tamamlandı; yazma ve dış ağ her durumda yasak kaldı.
3. **Task-ref canary → accepted.** Gerçek Codex `workspace-write` canary'si private task repository'de branch oluşturdu; source refs/HEAD değişmedi. Task başına clone/remote kaldırma düzeltmesi ve integration fixture aynı izolasyonu doğruluyor.
4. **Disposable `git push` canary → unproven.** Üç kullanıcı onaylı denemede temp bare remote ref'i oluşmadı. Son JSONL denemesinde push command event'i gözlendi; command exit 1 ve redacted output class `other` idi. Bu sandbox permission denial'ı kanıtlamaz. Kullanıcının retry sınırı doldu; yeni push canary yapılmadı.

## Gemini, DeepSeek ve Sol sentezi

- Gemini 3.8 Flash olası preflight/token yarışını ve shell-stop sözleşme çelişkisini hipotez olarak belirtti; ham hata kanıtı olmadan auth kök nedenini kesinleştirmedi.
- DeepSeek Flash kaynakta `codex-adapter.js` içindeki `/auth|login|credential|unauthorized|api.key/` deseninin `author`, `authorization` ve `oauth` gibi ilgisiz alt dizeleri eşleştirebildiğini doğruladı. Shell-stop sonucunu görev sözleşmesine bağladı. Remote-write canary'si `unproven` bırakılmalı dedi.
- GPT-6.1 Sol ham olayın kök nedeninin bilinmediğini, fakat geniş auth regex'inin kesin sınıflandırma kusuru oluşturduğunu değerlendirdi. Regex'i belirgin auth ifadelerine daraltmayı ve `author/authorization/oauth` negatif testleri eklemeyi; read-only promptta snapshot dosyalarının salt-okunur okunabileceğini açıkça belirtmeyi, task-specific stop condition'ları öncelikli kılmayı önerdi. Remote-write için davranış değişikliği önermedi; `unproven` gate korunmalı.

## Uygulanan karar

- Codex auth sınıflandırması artık çıplak `auth`, `login`, `credential`, `unauthorized` veya `api.key` alt dizesiyle auth hatası üretmez. Belirgin auth hata kalıpları kullanılır; eşleşmeyen non-zero sonuç `non_zero_exit` olarak kalır. Auth hataları retry dışıdır.
- Read-only worker promptu, izinli snapshot'ın mevcut read-only araçlarla ve gerekirse shell/CLI ile okunabileceğini; dosya yazımı, dış ağ ve listedışı okumanın yasak olduğunu açıkça ayırır. Task-specific stop condition'lar genel read allowance'dan üstündür. Web researcher promptunun shell yasağı korunur.
- Remote-write canary `unproven` kalır; bypass, gate açma veya yeniden deneme uygulanmadı.

## Doğrulama ve açık kapılar

Son remediation ve task Git metadata bütünlüğü kontrolü sonrası `npm test` 841/841, `npm run verify`, `npm run verify:ci`, `npm run smoke`, `npm run drill` 8/8 ve `git diff --check` başarılıdır. Task worktree `.git` marker'ı ve task repository `.git/config` SHA-256 değerleri worker yürütmesinden sonra verification/diff toplama öncesi doğrulanır; uyuşmazlıkta task fail-closed olur.

Raporun hazırlandığı anda `parallelBatch.enabled=false`, `editEnabled=false`, `verificationCommands=[]`; OpenCode `steps` capability unavailable idi. O sırada checkout dirty olduğu için iki-task edit pilotu yapılmadı. Remote-write denial unproven, gerçek Windows edit/bootstrap ve OpenCode capability gate'leri açık kaldı. Bu rapor provider remote-write veya release onayı değildir.

## Güncel durum (2026-10-06)

Remediation commit'i `007e659` `origin/master`'a push edildi ve çalışma ağacı temiz. Güncel bridge health'te provider circuit'leri kapalı; Codex ve OpenCode auth geçerli. GPT-6.1 Sol için salt-okunur capability probe `modelAccess=available`, `toolFreeResponse=available` döndürdü; workspace okuma probu çalıştırılmadı. İlk GPT-5.6 Luna `auth_invalid` olayının ham nedeni hâlâ bilinmiyor; daraltılmış sınıflandırıcı ve negatif testler yanlış pozitif riskini giderir, fakat geçmiş provider hatasını açıklamaz. Prompt kaynaklı `blocked` sonucu görev sözleşmesi düzeyinde giderildi.

2026-10-06 canlı regresyon kontrolünde önceki olay modeli GPT-5.6 Luna ile iki salt-okunur görev denendi. İlk test brief'i komut kullanımını da yasakladığı için worker dosya okuyamadı; bu prompt kaynaklı blok olarak ayrıştırıldı. Yalnızca belirtilen iki dosyayı salt-okunur araçlarla/komutlarla okumasına izin veren düzeltilmiş görev başarıyla tamamlandı ve auth sınıflandırıcısı ile `author`, `authorization`, `oauth` negatif testlerini doğruladı. Hiçbir dosya değişmedi; provider maliyeti ölçülmedi (`null`).

V2 policy kapıları hâlâ fail-closed: `parallelBatch.enabled=false`, `editEnabled=false`, `verificationCommands=[]`, OpenCode `steps` `unavailable`. Disposable remote-write sonucu `unproven`; iki-task edit pilotu ve tam Windows provider sandbox/bootstrap doğrulaması yapılmadı. Bu kanıt eksikleri kod testleriyle kapatılamaz ve gate'ler açılmadı. Bridge health ayrıca Claude Code için `authValid=false`, Kimi/Qwen için model erişimi olmadığını raporladı; bunlar Codex remediation'ından ayrı provider erişim durumlarıdır.
