# P1b Claude Sonnet result_parse incelemesi

Tarih: 2026-10-27 Türkiye

## Kapsam ve canlı kanıt

Bu inceleme yeni provider, model veya pilot çağrısı yapmadı. Başlangıç checkout'u `main` dalında `f0d9b3cf93630cdf5fb9cdb092ced26922c3e979` idi; başlangıç çalışma ağacı temiz, `origin/main` karşısında 16 commit ilerideydi.

Önceki, kullanıcı tarafından onaylanmış tek canlı pilotun güvenli sonucu `requestedModel=claude_sonnet`, `resolvedModel=null`, `taskCompletion=unavailable`, `outputIntegrity=unknown`, `result=null`, `adapterAttempts=1`, `retries=0`, `failureStage=result_parse`, `reason=schema_invalid`, `providerCode=null`, `exitCode=null`, `timedOut=false`, `telemetryWriteStatus=written` ve `totalCostUsd/reservedCostUsd=null` idi. Hata metni `adapter returned an invalid structured result` idi. Bu metadata model erişimi, gerçek inference sayısı, faturalama veya ham yanıtı göstermez.

`readRecentRuns` canonical okuyucusu yalnız geçerli redakte kayıtları kullanır. Bu shell'in varsayılan kaynak dizininde `sourceStatus=missing` ve `runCount=0` verdi; bu sonuç Hades sürecinin kendi kaydının olmadığını kanıtlamaz. Canlı kayda kesin eşleme yapılamadı; aggregate sayaçlar kullanılmadı. Geçmiş ham CLI çıktısı mevcut değil ve tahmin edilmedi.

## Kaynak sözleşme zinciri

1. MCP handler sabit görev, `claude_sonnet`, `read_only`, 60 saniye timeout, 65.536 bayt çıktı sınırı ve `validateClaudeSonnetAcceptanceOutput` doğrulayıcısını runtime'a geçirir.
2. Runtime pilot için bir adapter denemesi ayırır, fallback ve schema/web carrier repair davranışını devre dışı tutar, `noWorkspaceContext` taşır ve web-evidence modu `off` olur.
3. Antigravity adapter model alias'ını `claude-sonnet-4-6` olarak çözer; read-only CLI çağrısına JSON taşıyıcı şemasını ve `plan` modunu verir. `structured_output` dış yanıtı `{"result":"...","webEvidence":null}` biçimindeki taşıyıcı metnine normalize edilir. CLI'nin `response` alanı da dış yanıt biçimi olarak desteklenir.
4. Runtime, `webEvidenceMode=off` olduğunda bu taşıyıcı metnini önceden açmıyordu. Ardından genel `SubagentResult` şeması geçtikten sonra task validator, doğrudan `result` alanını `JSON.parse` ederek tek alanlı sayısal `result=42` kuralını sınar.
5. Task validator retlerinde runtime `schema_invalid`, `failureStage=result_parse` ve `adapter returned an invalid structured result` üretir. Bu tam güvenli mesajın kaynakta bu üretim noktası vardır. Bu nedenle canlı sonucun reddedildiği katman task validator'dır; ancak önceki dış çıktının hangi biçimde olduğu veya inner JSON'un bozuk mu, yanlış tipte mi, farklı değer/ek alan mı taşıdığı ham içerik olmadan belirlenemez.
6. `createRuntimeFailure` hata oluştururken `resolvedModel`'ı açıkça null'a sabitliyor, `exitCode`'u varsayılan olarak null bırakıyordu. Böylece önceden başarıyla çözümlenmiş model kimliği ve adapter başarı kodu task doğrulaması reddinde kaybolabiliyordu. Bu, `resolvedModel=null`, `outputIntegrity=unknown`, `taskCompletion=unavailable` metadata'sını açıklayabilen yerel bir tanılama kusurudur; geçmiş kaydın birebir nedeni olduğu kanıtlanamaz.

## Yerel yeniden üretim ve düzeltme

Gerçek MCP handler, runtime ve Antigravity adapter'ı kullanan test fixture'ına sahte CLI süreç çıktıları eklendi. Fixture ham çıktı veya görev yanıtı yazdırmaz; yalnız kapalı hata sınıflarını ve redakte metadata'yı döndürür.

- Geçerli `structured_output` taşıyıcısı içinde geçerli görev JSON'u, eski kaynakta inner görev JSON'u yerine dış taşıyıcıyı task validator'a verdiği için reddedildi. Bu başarısız hedefli test, geçmiş çağrıya değil yerel sözleşme uyuşmazlığına kanıttır.
- Pilotta artık `webEvidenceMode=off` iken de strict taşıyıcı açma uygulanıyor; plain/malformed cevap otomatik onarılmıyor ve schema repair eklenmiyor.
- Eksik veya yanlış tipli `structured_output`, boş çıktıdan ayrı `output_parse_invalid/result_parse` olarak sınıflandırılıyor. Kesilmiş ve birden fazla JSON kaydı içeren dış çıktı pilotta strict carrier parse katmanında reddediliyor.
- Geçerli taşıyıcı fakat bozuk görev JSON'u ve string tipli yanlış `result`, `schema_invalid/result_parse` olarak reddediliyor. Sayısal 42 dışındaki yanıtlar veya ek alanlar için mevcut task kabul koşulu değişmedi.
- Task/carrier doğrulama hatasında bilinen adapter `resolvedModel` ve `exitCode` korunuyor. Tam alınmış süreç çıktısı `outputIntegrity=complete` olabilirken kabul edilmeyen görev `taskCompletion=partial` kalır; süreç/çıktı bütünlüğü ile görev kabulü ayrı alanlardır.
- Boş çıktı `empty_output`, başarısız CLI süreci `process_exit` olarak kalır. Pilot için tek adapter denemesi, sıfır runtime retry/repair/fallback, timeout ve çıktı sınırı değişmedi.

Sentetik testler geçmiş Claude yanıtının taşıyıcı biçimini kanıtlamaz. En olası kaynak kusuru olan carrier unwrap eksikliği gerçek kaynak fonksiyonlarıyla yerel olarak yeniden üretildi; geçmiş canlı olayla kesin bağ kurulamadı.

## Doğrulama ve durum

Hedefli testler `tests/claude-sonnet-pilot.test.js`, `tests/claude-sonnet-acceptance.test.js` ve `tests/faz-1-antigravity.test.js` için 60/60 geçti. Son kaynakta `npm test` 1024 testten 1020 geçti, 4 Windows koşuluna bağlı test atlandı, 0 başarısız oldu. `npm run verify` ve `npm run verify:ci` başarılı; verify içindeki DeepSeek health isteği erişilemez döndü (`apiAvailable=false`), Codex erişimi `not_probed` kaldı. Provider inference veya capability probe yapılmadı. `git diff --check` geçti. MCP şeması değişmediğinden smoke çalıştırılmadı.

P1b canlı görev kabulü açık kalır. Önce bu kaynak revizyonunun Hades runtime'ında yüklendiği doğrulanmalı; workspace identity ve tool kataloğu kod revizyonu kanıtı değildir. Sonra yeni bir tek pilot için ayrı onay gerekir. Geçmiş `resolvedModel`, `outputIntegrity` ve `taskCompletion` alanları geriye dönük düzeltilemez. Maliyet ve CLI iç inference sayısı bilinmiyor. P2, P3 ve P6 durumları bu yerel çalışma nedeniyle değişmez.
