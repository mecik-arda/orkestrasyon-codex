# Sol Kapanış Denetimi ve Canlı E2E Notu (2026-09-19)

- Kapsam: Codex kotası yenilendikten sonra bekleyen canlı uçtan uca koşular, p0 temizlik dayanıklılığı ve ertelenen Sol kapanış denetiminin kapatılması.
- Yöntem: Canlı e2e koşuları, Sol (Codex `gpt-5.6-sol`) salt-okunur denetim turları, yerel test ve doğrulama kapıları.

## 1. Canlı E2E Sonuçları

- `npm run p0:e2e`: yeşil. Antigravity Gemini 3.1 Pro ve Codex sonuçları dolu; marker'lar gözlendi; paket, repo-A ve repo-B mutasyonları sıfır.
- İlk koşuda Windows'ta geçici dizin temizliği EPERM ile çöktü (işlevsel sonuç yeşilken). `scripts/p0-portability-e2e.js` içine sınırlı denemeli `removeDirectoryBestEffort` eklendi; sonraki koşu exit 0.
- `npm run p2a:e2e`: yeşil. OpenCode v1 rotası Gemini 3.1 Pro ile çalıştı; hedef araç gözlendi, yasak araç yok; `webEvidenceRepair` onarımı bir kez kullanıldı.
- `npm run p2b:e2e`: yeşil. Kişisel/global düzen ön koşulları, kontrollü edit araçları ve global state yolları doğrulandı; bridge mutasyonu yok.
- Kota öncesi kırılan üç koşunun tamamı artık geçmektedir; engel kod değil sağlayıcı kotasıydı.

## 2. Sol Kapanış Denetimi (5 tur)

- Tur 1 (NEEDS_CHANGES): 2 yüksek, 2 orta bulgu.
  - Yüksek: WAL yazılamadığında mutasyon fail-open devam ediyor; audit de yazılamazsa kurtarılabilir kayıt kalmıyor.
  - Yüksek: Kurtarma sınıflandırma ve journal silme işlemleri not mutasyon kilidi altında değil; eşzamanlı store/repair ile yarış mümkün.
  - Orta: `pruneMetricFiles` ile direct-edit disposition ilişkisi; eski çalışmalar bekleyen kuyruğa geri dönebilir.
  - Orta: Vault onarımı kesilmiş tarama veya boyut aşımı durumunda başarılı raporlanabiliyor.
- Tur 2 (NEEDS_CHANGES): ABA/jenerasyon yarışı; kurtarma kilidi içinde journal yeniden okunmuyordu; onarım sonuç sözleşmesi audit nedenini taşımıyordu.
- Tur 3 (NEEDS_CHANGES): Rollback başarısız olduğunda journal koşulsuz siliniyordu (yeni regresyon); cleanup durumu sonuçta görünmüyordu.
- Tur 4 (NEEDS_CHANGES): `cleanupPending` hesaplanıyor ancak dış sonuca aktarılmıyordu.
- Tur 5 (APPROVED, 95/100): Tüm bulgular kapandı; kritik bulgu 0.

## 3. Uygulanan Düzeltmeler

- WAL zorunlu: `requireMutationIntent`; store, promote ve repair mutasyondan önce niyet yazmayı zorunlu kılar; `journal_exists` durumunda mutasyon reddedilir ve recovery istenir.
- Kurtarma kilidi: Her niyet için not veya kaynak+hedef kilidi alınır; journal kilit içinde yeniden okunur; sınıflandırma ve işlem taze içerikle yapılır; `journalId`/`kind` uyuşmazlığı `journal_regenerated` olarak fail-closed raporlanır.
- Onarım fail-closed: `scanTruncated` (limit+1 sentinel) ve `tooLargeCount` tam kasa uygulamasını reddeder; açık `--path` seçimi kapsamı daraltır.
- Onarım sonuç sözleşmesi: audit yazılamazsa `appliedItems` içinde `audit.reason: audit_pending_recovery` taşınır; journal korunur.
- Rollback güvencesi: Journal yalnız eski içerik başarıyla geri yazıldıktan sonra silinir; rollback hatasında korunur.
- Cleanup görünürlüğü: `removeIntent` enjeksiyonu ve `cleanupPending` sayacı dış sonuca taşınır.
- Metrik retention: `listPendingDirectEditFeedback` retention dışı eski çalışmaları kuyruğa almaz.

## 4. Test ve Doğrulama

- Yeni ve güncellenen testler: REC-08 (fail-closed sözleşme), REC-11 (journal yazılamazsa red), REC-12 (audit hatasında niyet korunur), REC-13 (onarım günlüğü yoksa red), REC-14 (üç eşzamanlı kurtarma sürecinde tek audit), REC-15 (bozuk journal tarama hatası), REPAIR-09 (scan_truncated), REPAIR-10 (too_large_files), REPAIR-11 (tam sınır), REPAIR-12 (audit_pending_recovery çıktısı), REPAIR-13 (rollback journal korunur), REPAIR-14 (cleanupPending görünür), DISP-06 (retention filtresi).
- `npm test`: 644/644 (son commit `5fac538`).
- `npm run verify`, `npm run verify:ci`, `git diff --check`: temiz.
- Private Action: `5fac538` için success.
- Sol denetimi testleri kendi ortamında çalıştıramadı (node PATH'te yok); karar statik inceleme ve bildirilen doğrulama sonuçlarına dayanır.

## 5. Kalan Riskler

- Savunmacı `journal_invalid`, `journal_read_failed` ve `journal_regenerated` dalları doğrudan regresyon testine sahip değil; Sol bunu kabul edilebilir düşük risk olarak değerlendirdi.
- `cleanupPending` yalnız sayı taşır; journal kimlikleri taşımaz. Kurtarma dizini yeniden taradığı için engelleyici değildir.
- AntiGravity video danışması: Sol hibrit mimari önerdi; pilot uygulaması kullanıcı onayı bekliyor (`GEMINI_ANTIGRAVITY_HATA_ANALIZI_VE_IYILESTIRME_RAPORU_2026-09-18.md` Bölüm 10).
