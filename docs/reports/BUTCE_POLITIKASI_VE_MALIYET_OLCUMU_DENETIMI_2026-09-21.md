# Bütçe Politikası ve Maliyet Ölçümü Denetim Notu

Tarih: 2026-09-21
Durum: Uygulandı; Sol kapanış denetimi APPROVED.

## 1 Karar

- Aylık eşik bilgilendirme referansıdır: `monthlyCostLimitUsd: 100`, `costBudgetEnforced: false` (proje `config/policy.json` ve kişisel config).
- Limit silinmedi; rezervasyon ve settlement günlüğü korunur, admission reddi yalnız enforcement açıkken uygulanır.
- Her yeni ücretli ölçüm, pilot veya paralel review grubu açık kullanıcı onayına tabidir; onay ve sonuçlar `docs/reports/UCRETLI_CALISMA_ONAY_KAYDI.md` içine işlenir.
- Plan kapıları aylık bütçeye değil kendi teknik kabul koşullarına bağlıdır; run başına korumalar değişmez.

## 2 Uygulama

- `subagent-bridge/src/metrics.js`: `executionCostKnown` ve `settlementCostKnown`; `periodCostBreakdown` (observed, estimated, executed/known/unknown run, coverage, measurementStatus); snapshot `costMeasurement` ve `dailyCostMeasurement` blokları; toplamlar eski önceliği korur.
- `scripts/report-metrics.js`: bilinmeyen maliyet artık sıfır sayılmaz; özet ve routing bloklarında kapsama ve `no_data` semantiği.
- `README.md` (EN/TR): limit bilgilendirme, enforcement varsayılan kapalı, kapsama ve `not_observable` anlatımı.
- `docs/plans/DURUM_INDEKSI.md`: bütçeye bağlı toplu kapatmalar kaldırıldı; onay rejimi ve teknik kapılar kaydedildi.
- `tests/optimization.test.js`: OPT-06t gözlenen/tahmini ayrımı ve günlük blok assertion'ları; routing beklentisi güncellendi.

## 3 Sol Denetimi

- Birinci tur (2026-09-21, `gpt-5.6-sol`, salt-okunur): APPROVED_WITH_RISKS (0 kritik, 1 orta, 2 düşük).
  - Orta: fallback akışında settled tutarın `executionCostKnown` ile gözlenen sayılabilmesi.
  - Düşük: boş metrik kümesinde `observed` görünümü; yeni test kimliğinin mevcut OPT-06q ile çakışması ve günlük assertion eksikliği.
- Kapatma: settled dalı yalnız `settlementCostKnown === true` ile gözlenen sayılır; boş küme `no_data` döndürür; test OPT-06t olarak tekil kimlikle yeniden adlandırıldı ve günlük assertion'lar eklendi.
- Kapanış turu: APPROVED (0 kritik, 0 yüksek, 0 orta, 0 düşük; sağlık 10/10).

## 4 Doğrulama

- `npm test`: 690/690.
- `npm run smoke`, `npm run verify`, `npm run verify:ci`: çıkış 0.
- `npm run budget`: `monthlyLimitUsd` 100, `enforced` false, aşımda çıkış 0; `costMeasurement` gözlenen/tahmini/kapsama ayrımını taşır.
- `npm run metrics`: çıkış 0; özet ve routing bloklarında `costMeasurement` mevcut.
- Uçtan uca: `p0:e2e` ve `p2a:e2e` çıkış 0; `p2b:e2e` son koşu 5/5 çıkış 0 (RepoE bacağında ara sıra görülen geçici `accepted:false` `docs/reports/CARRIER_REGRESYON_VE_E2E_KABUL_NOTU_2026-09-20.md` içinde kayıtlıdır).

## 5 Açık Noktalar

- Aylık harcama rakamı sağlayıcı faturasıyla uzlaştırılmadıkça kapı dayanağı değildir; kapsama oranı raporla birlikte okunur.
- Ücretli çalışma kontrolü yönetseldir (açık kullanıcı onayı); mekanik enforcement kapalıdır.
