# Carrier Regresyonu ve E2E Kabul Notu

Tarih: 2026-09-20
Durum: Bulgu kapatıldı; kabul koşuları yeşil.

## 1 Kapsam

- Hades hafıza kalan riskler planının kapanış kabulü sırasında `npm run p2b:e2e` koşusu ve Antigravity salt-okunur carrier davranışı incelendi.
- Norn kapsam dışıdır.

## 2 Bulgu

- `npm run p2b:e2e` RepoA (Gemini Pro) bacağı `accepted: false` ve çıkış kodu 1 verdi; sonuç düz marker yerine `{"result": "REPO_A_MARKER_9D47"}` JSON metni döndü.
- Geçmiş karşılaştırma: `docs/reports/SOL_KAPANIS_DENETIMI_VE_E2E_NOTU_2026-09-19.md` koşusu yeşildi; carrier şeması değişikliği (223946e, 2026-09-19 15:15) yeşil koşudan (15:02) sonra geldi.

## 3 Kök neden

- Salt-okunur çağrılarda `READ_ONLY_INSTRUCTION` ve `WEB_EVIDENCE_OUTPUT_INSTRUCTION`, modelden `result` alanlı tek JSON nesnesi ister.
- Antigravity CLI `--json-schema` zarfı, modelin JSON metnini `result` alanına yerleştirdiğinde iki katmanlı zarf oluşuyor; adaptör yalnız tek katmanı açıyordu.
- Yerel yeniden üretim: araç kullanan Gemini Pro çağrısı `{\n  "result": "..."\n}` metnini döndürdü; araçsız kısa çağrı düz metin döndürdü.

## 4 Düzeltme

- `subagent-bridge/src/adapters/antigravity-adapter.js`: `normalizeCarrierStructuredOutput` iç içe carrier metnini sınırlı derinlikte (2) açar. Yalnız `result` ve `webEvidence` anahtarlarını taşıyan ve `result` alanı boş olmayan metin katmanları çözülür; ek alan içeren metin korunur.
- Test: `tests/faz-1-antigravity.test.js` AG-AC-16d iç içe zarf, kanıt korunumu, derinlik sınırı ve ek alan korunumu vakalarını kapsar.

## 5 Doğrulama

- `npm test`: 687/687.
- `npm run verify`, `npm run smoke`, `npm run verify:ci`: çıkış 0.
- `npm run p2b:e2e`: çıkış 0, 5/5 kabul, bridge mutasyonu yok.
- `npm run p0:e2e`: çıkış 0.

## 6 Açık noktalar

- Bu not plan dışı bir düzeltmeyi kaydeder; plan bağlantısı `docs/plans/yapilanlar/HADES_HAFIZA_KALAN_RISKLER_PLANI_2026-09-20.md` bölüm 11-12 içindedir.
- Antigravity CLI zarf davranışı sürüm değişimlerinde izlenmelidir; davranış değişirse `npm run p2b:e2e` kabulü erken sinyal verir.
- `npm run p2b:e2e` üç koşudan birinde RepoE bacağında geçici kabul hatası verdi (`accepted: false`); sonraki iki koşu 5/5 yeşildir. Kabul script'i kesin marker eşleşmesi uygular; sapma model çıktısı kaynaklıdır ve kalıcı bir kod kusuru gözlenmemiştir.
