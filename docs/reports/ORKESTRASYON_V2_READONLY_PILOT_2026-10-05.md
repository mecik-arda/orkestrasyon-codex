# Orkestrasyon V2 — Salt-okunur Pilot Denemesi

## Kapsam ve onay

2026-10-05 tarihinde kullanıcının açık onayıyla üç `quick_read` Codex/GPT-5.6-Luna salt-okunur görevini içeren V2 batch başlatıldı. Onaylanan batch-local admission tahmini 0,60 USD idi; bu sağlayıcı faturası veya gerçek harcama üst sınırı değildir. `parallelBatch.enabled` pilot için geçici açıldı; edit kapalı kaldı. Pilot tamamlandıktan sonra policy dosyasındaki gate tekrar kapatıldı.

Görevler yalnız izinli dosyaları okudu; hiçbir görev dosya değişikliği üretmedi. Bu kayıt, pilot değerlendirme sonucudur; kod veya release onayı değildir.

## Sonuç

- `pilot-metrics-readiness`: tamamlandı; mevcut telemetry alanlarını ve eksikleri kaynak satırlarıyla raporladı.
- `plan-open-criteria`: `auth_invalid` ile başarısız oldu. Otomatik tekrar yapılmadı.
- `provider-windows-gates`: worker shell erişimi gerektiğini belirtti; prompttaki stop condition gereği `blocked` döndü. Bu görev provider canary'si çalıştırmadı.
- Batch terminale ulaştı; yalnız 1/3 task tamamlandı. Bu nedenle faz 4/5 pilot kabul kriterleri karşılanmış sayılmaz.
- Her task maliyeti sağlayıcı tarafından gözlenemedi; batch ledger 0,60 USD tahsisi unknown olarak tuttu. Gerçek fatura tutarı bilinmiyor.
- Batch başlatma için plan preview → ayrı kullanıcı onayı → exact plan hash ile start sırası bu konuşmada uygulandı. Ayrı bir aktif OpenCode host oturumunda tool discovery/yeniden başlatma kanıtı olarak genellenemez.
- `auth_invalid` sonrasında kullanıcının ayrı onayıyla tek model capability probe'u çalıştırıldı. `codex / gpt-5.6-luna` için `modelAccess` ve `toolFreeResponse` `available`, `workspaceRead` ise `not_probed` döndü. Bu sonuç ilk task hatasının nedenini açıklamaz ve batch içi sonraki çağrıyı doğrulamaz; aynı task otomatik tekrarlanmadı.

## İkinci read-only batch

İlk denemeden sonra ayrı kullanıcı onayı ve yeni immutable planla üç farklı inceleme görevi başlatıldı. Codex GPT-5.6-Luna üzerinden **3/3 görev completed** oldu; dosya yazımı veya dış ağ erişimi olmadı. Geçici olarak açılan `parallelBatch.enabled` batch sonrası tekrar `false` yapıldı; `editEnabled` her iki batch'te de kapalı kaldı.

- `BatchSummary.contentBytes`: 7.554 UTF-8 byte.
- Üç task artifact'ının toplam `totalBytes` değeri: 6.884 byte.
- Task host süreleri: 129.539 ms, 128.044 ms ve 182.683 ms.
- Bilinen provider maliyeti yok; ikinci batch'in 0,60 USD admission tahmini unknown kaldı. İlk batch'in ayrı 0,60 USD tahmini de unknown kalmıştı.

Bu kod/doküman inceleme örneğinde parent'a dönen summary byte'ı task artifact toplamından küçük değildir; context/token tasarrufu kanıtlanmış sayılmaz. Artifact byte'ları transcript/token tüketimi değildir. Worker sayısı veya gerçek coding işi faydası için kalibrasyon yapılmadı.

## Tek-worker baseline karşılaştırması

Aynı 13 read-only dosya ve açık faz kapsamı tek `quick_read` Codex worker ile ayrıca çalıştırıldı. Tek-worker batch'in public `BatchSummary.contentBytes` değeri 3.118 byte, task host süresi 145.465 ms, admission tahmini 0,20 USD idi. Üç-worker batch'in public summary'si 7.554 byte; dolayısıyla bu aynı inceleme kapsamındaki tek-worker sonucu dönen JSON byte'ında yaklaşık %58,7 daha küçüktü. Üçlü batch task süreleri 129.539 ms, 128.044 ms ve 182.683 ms; batch'in uçtan uca duvar saati ayrı ölçülmedi. Üç-worker ve tek-worker admission tahminleri sırasıyla 0,60 ve 0,20 USD; tümü unknown ve sağlayıcı faturası değil.

Bu karşılaştırma yalnız bu doküman/kod inceleme iş yükünü ölçer; 3-worker fan-out için context/fayda kazanımı göstermedi. Snapshot/summary/artifact byte ölçüleri model token kullanımı ya da tam provider context'i değildir. Karar: bu iş sınıfında fan-out **NO-GO**; edit fazını salt bu pilot temelinde açma.

Kullanıcı kararı (2026-10-05): bu inceleme iş yükü için **NO-GO** kabul edildi. Bu karar yalnız ölçülen plan/kod inceleme görevi sınıfına aittir; başka bir gerçek coding workload'u için genel V2 NO-GO kararı değildir. Bu iş sınıfında yeni provider çağrısı veya edit pilotu başlatılmaz; dağıtım batch/edit gate'leri kapalı kalır.

## Ölçüm boşluğu ve yerel düzeltme

Tamamlanan görev, read-only snapshot byte'larının ve public batch summary JSON byte'larının çalışma anında hesaplandığı, ancak metric kaydına yazılmadığı boşluğunu belirledi. Düzeltme sonrası `parallel_batch_task` kaydı `snapshotBytes`, `parallel_batch_finish` kaydı nihai public `summaryBytes` taşır. Snapshot boyutu gerçek provider input-token veya parent-context tasarrufu değildir; yalnız host'a verilen bounded dosya snapshot'ının byte boyutudur. `artifactBytes`, task süresi ve measured/estimated/unknown maliyet alanları ayrı tutulur.

Regresyon testi `tests/parallel-batch.test.js` içinde bir task metriğindeki snapshot byte değerini ve finish metriğindeki public summary byte değerini doğrular.

## Codex task-ref canary

Kullanıcının ayrı onayıyla `npm run canary:parallel:codex-ref` gerçek Codex GPT-5.6-Luna `workspace-write` sandbox'ında çalıştırıldı. Canary yalnız OS temp altındaki sentetik Git repository ve detached task worktree'sinde benzersiz bir local branch oluşturmayı istedi; dış ağ kullanmadı. Branch private task repository'de oluştu, source repository `HEAD` ve refs hash'i değişmedi. Sonuç `accepted`, geçici repository temizlendi, provider maliyeti `unknown` kaldı. Bu remote-push denial, Windows tam edit sandbox'ı veya production `editEnabled` yetkisi kanıtı değildir.

## Disposable local remote-write canary

İlk iki deneme permission-denial kanıtı üretmedi; ikinci instrumentasyonlu denemede `git push` command event'i exit 0 raporladı ancak remote ref oluşmadı. Kullanıcı yeni izin verdikten sonra üçüncü farklı JSONL teşhis denemesinde `git push` command event'i exit 1 verdi; çıktı sınıfı yalnız `other` olarak belirlendi, permission-denial eşleşmesi yoktu. Her üç denemede de temp remote ref oluşmadı ve source HEAD değişmedi. Dış internet veya credential helper kullanılmadı; tüm temp state silindi. Sonuç **unproven**; doğrudan remote-write denial gate'i kapanmadı ve başka retry yapılmadı.

## Doğrulama ve kalan iş

Telemetry, task-ref isolation, Codex auth classification, prompt remediation ve task Git metadata bütünlüğü kontrolünden sonra ana orkestratör `npm test` 841/841, `npm run verify`, `npm run verify:ci`, `npm run smoke`, `npm run drill` 8/8 ve `git diff --check` çalıştırdı; hepsi başarılıdır. Metadata kontrolü task worktree `.git` marker'ı ile task repository `.git/config` özetini yürütme öncesi ve verification/diff toplama öncesi karşılaştırır; değişiklik task'ı fail-closed sonlandırır.

İkinci inceleme batch'i, read-only V2 çalışma yolunun üç görevde başarılı biçimde çalıştığını gösterir; ilk task'ın `auth_invalid` nedeni açıklanmış değildir ve körlemesine tekrarlanmamıştır. Tek-worker baseline bu inceleme sınıfında daha küçük public summary ve daha düşük internal admission tahmini verdiği için 3-worker fan-out için fayda göstermedi. Codex task-ref canary'si private task repository davranışını doğruladı; disposable local-file remote-write canary'si üç izinli denemeden sonra unproven, Windows tam sandbox/bootstrap pilotu ve iki task'lı edit pilotu açık. `editEnabled`, OpenCode capability ve release gate'leri kapalı kalır.
