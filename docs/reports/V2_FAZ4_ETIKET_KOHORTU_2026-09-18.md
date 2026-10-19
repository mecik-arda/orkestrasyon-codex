# V2 Faz 4 Edit Etiket Kohortu ve Uygunluk Sınıflandırması

Tarih: 2026-09-18
Durum: Append-only kayıt; karar kapısı geçici NO-GO olarak korunur.
Kapsam: `ORKESTRASYON_GELISTIRME_PLANI_V2.md` Faz 4 direct-edit baseline ölçümü.

## 1. Anlık Görüntüler

- Önceki snapshot (`docs/reports/PLAN_UYGULAMA_DENETIMI_2026-09-18.md`): 110 bekleyen, 0 etiketli.
- Yeni snapshot: 114 bekleyen, 0 etiketli.
- Kayıtlar kimlik açısından redakte olduğu için (feedbackId, backend, recordedAt, outcomeStatus, durationMs, totalCostUsd) içerik eşlemesi yapılamıyor; kayıtların çoğu iç test/ölçüm koşularından geliyor.

## 2. Karar

- Toplu `accepted` etiketlemesi reddedildi: `outcomeStatus: completed` yalnız yürütmenin tamamlandığını gösterir, kullanıcı kabulünü göstermez; baseline yapay biçimde şişirilemez.
- Hiçbir kayıt silinmedi veya prune edilmedi; ham execution kayıtları korunur.
- Sonuç enum'u (`accepted`, `minor_fix`, `reverted`, `security_concern`) değiştirilmedi. Uygunluk ayrı ve append-only bir katmandır:
  - `eligible_real_user`
  - `ineligible_instrumentation`
  - `ineligible_synthetic`
  - `ineligible_duplicate`
  - `indeterminate_legacy`
- Bu kohortta kanıt bulunmadığı için 114 kayıt `indeterminate_legacy` olarak sınıflandırıldı; gerekçe `provenance_unverifiable_legacy`. Hiçbirine kullanıcı sonucu atanmadı.
- `npm run edit:classify` ile yönetilir: `list`, `dispose <disposition> <feedbackId> --reason=...`, `classify-legacy --before=<ISO> [--disposition=...] [--reason=...]`.
- Uygun olmayan kayda sonuç etiketi verilemez; `eligible_real_user` uygunluk kaydı etiketlemeyi engellemez.

## 3. Kapı Paydası ve Eşikler

- Genel direct-edit karar kapısı: en az 30 uygun ve etiketli gerçek kullanıcı sonucu (mevcut `decisionReady` davranışı).
- Backend ve profil kırılımı da aynı 30 eşiğini kullanır; bu eşik düşürülmemiştir.
- Routing kalite kararı ayrıdır: profil başına en az 15 etiketli gerçek görev.
- `pendingFeedback` yalnız uygun (uygunluk kaydı yok veya `eligible_real_user`) ve etiketsiz kayıtları sayar; uygun olmayan kayıtlar paydadan düşülür ve `dispositionCounts` içinde ayrı raporlanır.
- Uygun olmayan kayda sonradan eklenen sonuç etiketi karar paydasına katılmaz; `conflictingLabeledRuns` olarak ayrıca görünür ve karar kapısını etkilemez.
- Toplu sınıflandırma `eligible_real_user` veremez; uygunluk yalnız tek kayıt için ve gerekçeyle tanımlanır.
- Kapı koşulu korunur: yalnız uygun + etiketli + gerçek kullanıcı kararı olan kayıtlar sayılır.

## 4. Yeni Kohort

- Kesim zamanı: sınıflandırma komutunun `--before` değeri (2026-09-18). Bu andan sonraki kayıtlar uygunluk verilmedikçe normal kuyrukta görünür.
- Yeni kayıtlar gerçek kullanıcı edit'i ise `npm run edit:feedback` ile etiketlenir; iç test/ölçüm ise `npm run edit:classify dispose` ile uygun dışı bırakılır.

## 5. Tarihsel Kayıt

- `docs/reports/PLAN_UYGULAMA_DENETIMI_2026-09-18.md` sayıları geriye dönük değiştirilmedi; dosyanın sonuna tarihli ek not eklendi.
- `docs/plans/yarim-kalanlar/ORKESTRASYON_GELISTIRME_PLANI_V2.md` ikinci durum notu bu rapora işaret eder; plan maddeleri geriye dönük değiştirilmedi.

## 6. Sonuç

Veri yetersizliği nedeniyle karar kapısı geçici NO-GO olarak kalır. Baseline kararı, yeni kohortta en az 30 uygun ve etiketli gerçek kullanıcı sonucu biriktiğinde yeniden değerlendirilir.
