# P2/P3 yerel kabul incelemesi

Tarih: 2026-10-27 Türkiye

## Güncel durum

Repository `main` dalında `94ed8b960aaa69ca68f53f845797f79254561e71` commit'indeydi; çalışma ağacı temizdi ve `origin/main` karşısında 19 commit ilerideydi. Bu incelemede kaynak kodu değiştirilmedi, sağlayıcı çağrısı yapılmadı ve batch hazırlanmadı veya başlatılmadı.

Birincil sonraki kabul akışı P2 canlı hazırlanmış edit onay çevrimidir. P2'nin yerel onay/red/stale/recovery davranışlarını kapsayan testler mevcut kaynakta doğrulandı. P3'ün yerel hazırlama ve entegrasyon yolları da testlidir; ancak tracked `config/policy.json` içinde `parallelBatch.enabled`, `editEnabled` ve `atomicIntegrationEnabled` kapalıdır. Bu dosya etkin kişisel runtime ayarı olarak değerlendirilmedi. Ayrıca P3'ün açık canlı engeli önceki kaynak ref drift'i ve ayrı entegrasyon kararıdır; yeni bir batch planı bunu çözmez. Bu nedenle canlı `prepare_parallel_batch` çağrısı yapılmadı.

## Kaynak incelemesi

MCP `run_task_profile` handler'ı seçili task profile'ı runtime'a aktarır. Edit profile için `runtime.runProfileEdit` çalışır ve profile, prompt, dosya listesi, bağlam, timeout ve risk alanları strict şemadan geçer. Risk sınıfı açık onay gerektiriyorsa runtime değişikliği disposable alanda tutar, kaynak workspace ve dosya başlangıç durumunu bağlar, diff'i değişmez olarak kaydeder ve `approval_required` ile döner. Ayrı `approve_prepared_edit` exact `approvalRequestId` değerini tüketir; kaynak/workspace durumu veya recovery kontrolü uyuşmazsa uygulamaz. `reject_prepared_edit` aynı workspace bağını doğrular ve bekleyen kaydı geçersizleştirir. Başarılı uygulama tek kullanımlı kaydı kapatır; tekrar kullanım reddedilir.

Bu davranışın yerel kapsamı `tests/profile-edit-pilot.test.js` ve `tests/orchestrator-approval-channel.test.js` içindeki sahte adapter, gerçek MCP taşıması, red, stale kaynak, recovery ve tek-seferlik uygulama kontrolleridir. Bunlar canlı sağlayıcı veya Hades onay kabulü değildir.

P3 için `prepare_parallel_batch` kaynak zincirinde worker başlatmadan immutable plan üretir; fakat prepare bu kaynak policy'sinde `parallelBatch.enabled !== true` olduğunda fail-closed sonuç verir. `editEnabled` de kapalıdır. Yerel batch ve Git/worktree testleri fake Codex süreci ve disposable kaynak kullanır. Geçmiş canlı salt-okunur DAG, iptal, restart-unknown ve izole edit kanıtları değişmedi; canlı kaynak entegrasyonu kabul edilmedi.

## Hedefli doğrulama ve ortam ayrımı

P2/P3 approval, batch, MCP, Git/worktree, coordinator ve promotion-recovery test dosyaları fake adapter/süreç ve yerel MCP zinciriyle çalıştırıldı. İlk sandbox koşusunda 92 testten 89'u geçti, bir MCP edit-batch E2E testi `clone` aşamasında başarısız oldu ve iki Windows symlink testi ortam nedeniyle atlandı. Güvenli task detail kaydı `workspace_setup`, `processExitCode=128`, `hostOperation=clone` ve `gitFailureCode=process_start` gösterdi. Sentetik temp deposunda aynı Git for Windows işlemi, iç `sh` sürecinin sandbox adlandırılmış nesne erişiminde `NtCreateDirectoryObject` reddiyle sonuçlandı. Standart kullanıcı TEMP'sini yalnız Node sürecine vermek bu sandbox erişim reddini çözmedi.

Aynı test önce standart kullanıcı TEMP'siyle izin yükseltme yolunda tek başına, sonra ilgili yedi P2/P3 suite'inin parçası olarak çalıştırıldı. Son suite 92 testten 92 geçti, 0 başarısız ve 0 atlanan verdi. Yükseltilmiş izin yalnız yerel test sürecinin Git child-process erişimi içindi; provider çağrısı yoktu. Bu, Windows sandbox sınırı altında clone zincirinin engellendiğini; testin izinli Windows ortamında geçtiğini doğrular. POSIX doğrulaması değildir.

Tam `npm test` bu görevde tekrarlanmadı. Son kaynak değişikliği bulunmadığı ve commit `94ed8b9` üzerinde tam paket başarıyla doğrulandığı için yeni bir tam test koşusu gerekmedi. Benchmark'ın geçmiş başarısızlık nedeni açıklanmış sayılmaz. Sandbox TEMP migration rename `EPERM` ayrı ortam engeli olarak kalır; bu hedefli clone hatasıyla aynı olay değildir. Bağımsız Sol denetimi de tamamlanmış sayılmaz.

## Sonraki P2 canlı adımı

P2'yi kapatmak için Hades üzerinde bir seçili dosyalı edit görevi hazırlanmalı, etkin runtime'da geçerli edit profile/model ve efektif attempt/timeout sınırları önceden gösterilmeli, ardından kullanıcıya tam dosya/diff/payload ve kaynak bağları sunulmalıdır. `run_task_profile` çağrısı sağlayıcı çalıştırdığı için bu incelemede yapılmadı. Mevcut tracked profile değerleri etkin Hades config kanıtı değildir; profile ve model adı canlı hazırlık öncesi doğrulanmalıdır.

Hazırlanan diff için kullanıcı onayı ayrı bir karardır. Aynı değişmez `approvalRequestId` ile approval veya rejection denenebilir; approval kaynak dosyalarına yazar, bu yüzden yalnız açıkça gösterilip onaylanan exact diff için kullanılabilir. Ret, stale, recovery ve tekrar kullanım sonuçları ayrı ayrı kaydedilir. Başarılı yerel MCP testi tek başına P2 canlı kapısını kapatmaz.

Bu çalışma P1b, P2, P3 veya P6 canlı kapılarını kapatmadı. Review permit, Option B, ref kapsamı ve üretim onay politikası değiştirilmedi.
