# Codex batch P2/P3 kabul yolu

Yerel P2 approval/recovery ilerlemesi — 2026-10-21: `tests/profile-edit-pilot.test.js` geçici kaynak ve sahte adapter üzerinde açık onay öncesi değişmezliği/onay sonrası seçili dosya uygulamasını, stale kaynak durumunda onayın reddini ve recovery artefaktında fail-closed bekleyip toparlanmayı doğrular. Hedefli test 10/10; tam `npm test` 865/861/4 platform skip/0 fail; `npm run verify:ci` geçti. Bunlar yerel fixture kanıtıdır, canlı provider veya gerçek kaynak entegrasyonu değildir. P2 canlı kalan adımlar canlı disposable kabul ve ayrı diff/onaylı entegrasyondur; P3 canlı dayanıklılık batch'i ve edit batch entegrasyonu da açık kalır.

Güncel canlı durum — 2026-10-21: Kullanıcının tekil onayıyla sabit `gpt-6.1-sol` Codex disposable edit pilotu bir kez çalıştı. Raporlanan sonuç tamamlandı, sabit fixture hedefi ve başarılı cleanup idi; `applied=false` kaynak repoya promotion yapılmadığını gösterir. Bu, P2'nin temel provider/disposable edit gözlemidir; onay/red, stale hash ve recovery alt kapılarını karşılamaz. Kullanıcı Hades'i yeniden başlattıktan sonra iki workspace identity özeti beklenen değerle eşleşti ve Codex/Claude özel pilot araçları envanterden kalktı. P1b Claude Sonnet görev kabulinin son sonucu `permission_denied/process_spawn/EPERM`; tam alt süreç nedeni ve gerçek inference/faturalama bilinmiyor. Önceki başarılı read-only DAG korunur ve tekrarlanmaz. Güncel test/doğrulama ve açık kararların ayrıntısı [uygulama raporundadır](../reports/CODEX_DESKTOP_GECIS_UYGULAMA_DURUMU_2026-10-18.md).

P2 disposable Codex edit pilotu — 2026-10-21: Yerel MCP koduna varsayılanı kapalı `run_codex_profile_edit_pilot` aracı eklendi. Boş strict girdi, host-sabit gpt-6.1-sol ve tek fixture hedefi kullanılır; `promote:false`, tek adapter denemesi, sıfır runtime retry/schema repair/fallback, 60 saniye ve 65536 stdout+stderr byte sınırı host tarafından uygulanır. Codex CLI ek yapılandırma argümanları bu yolda dışlanır ve sandbox ağı kapatılır. Sahte adapter testleri canlı P2 kabulü değildir. Canlı çalıştırma için etkin kişisel runtime config'te ayrı opt-in, kaynak-clean kapısı, Hades restart ve güncel tekil çalıştırma onayı gerekir. Kaynak dosyaya entegrasyon kapsam dışıdır ve ayrıca diff onayı ister.

P1b tanı eki — 2026-10-20: Önceki Claude Sonnet pilotunda canonical kayıtta `permission_denied/process_spawn/EPERM` vardı; bu alanlar provider-purpose `agy --print` sürecinin başladığını kanıtlamaz. Özel pilot boş geçici cwd'yi provider komutundan önce oluşturuyordu; `mkdtemp` `EPERM` verebilir ve eski exception akışı bunu runtime process-spawn gibi gösterebilirdi. Geçmiş denemenin burada durduğunu kanıtlayan kayıt yoktur. Yeni yerel düzeltme bunu `workspace_setup` olarak fail-closed kaydeder ve provider-purpose başlatma sayısını sıfır tutar; gerçek Hades için restart gerekir. Bu yerel kanıt canlı Claude görev kabulü değildir.

Güncelleme: 2026-10-20. Bu belge bir işletim ve kabul prosedürüdür; canlı kabulün geçtiğini bildirmez.

## Doğrulanmış sorun ve kalıcı düzeltme

Son iki görevli batch'teki 4096 değeri task sözleşmesinde açıkça seçilmiş süreç çıktı sınırıydı. Plan, runtime, adapter ve collector aktarımı doğrudur. Süreç collector'ı stdout ve stderr Buffer byte toplamını sayar; sınırı aşan chunk'ın tamamını reddeder ve süreci durdurur. 6353/66785 gözlemleri tamamlanmış çıktı boyutu değildir; 65536 byte rejected chunk içeriği kanıtlamaz.

MCP alan açıklaması ve prepare önizlemesi artık süreç sınırının JSONL/araç olaylarını kapsadığını açıklar; önizleme her task'ın etkin byte sınırını ve task/host varsayılan kaynağını gösterir. Public task özetinin karakter ve batch özetinin UTF-8 byte sınırları ayrıca gösterilir. `output_limit` özet mesajı ayrıntıdaki scope/stream/byte tanılarını incelemeye ve yeni plan için ayrı onaya yönlendirir. Varsayılanlar, genel retry politikası, izinler ve host üst sınırları değişmedi.

Süreç, JSONL record, reducer final-result ve public summary sınırları ayrıdır. Public `summary_truncated` halinde gizlenen özet ayrıntıdan incelenmeden kabul kanıtı sayılmaz. Süreç/record/final-result taşması hata olarak kalır. Kısa cevap talimatı süreç sınırını güvenilir biçimde denetlemez.

## Yerel kapı

Gerçek batch servisi → runtime → Codex adapter → sahte Node süreci regresyonu, 70000 byte araç olayı ve kısa nihai JSON ile 4096 byte cap'in reddini ve 262144 byte cap içindeki tam sonucu sınar. Preview ile uygulanan sınır karşılaştırılır; overflow sonrasında runtime tek adapter denemesiyle, retry olmadan durur. Mevcut UTF-8, büyük chunk, JSONL record/final-result ve public özet testleri diğer sınırları kapsar. Tüm test kayıtları geçici dizinlerdedir.

Gerekli kapılar: hedefli batch/runtime/adapter/P2 testleri, `npm test`, `npm run verify`, `npm run smoke`, `npm run verify:ci`, `git diff --check`. Verify/smoke inference başlatmaz; CLI sürümü ve DeepSeek `/models` sağlık isteği kullanabilir. Smoke Vault health/review/hedefli arama ve bir seçilmiş not okuması yapar; içerik yazmaz veya çıktıya dökmez. Yerel stdio testi etkin Desktop bağlantısı kanıtı değildir.

## İlk canlı adım: küçük, gerçek read-only DAG

Geniş kaynak incelemesini tekrarlamak yerine yalnız `tests/fixtures/parallel-batch-acceptance.json` snapshot'ını kullanan üç görev hazırlanır. Dosya küçük ve secretsizdir. Kod veya doküman inceleme raporu istenmez.

- `fixture-product`: `left × right` hesaplayıp beklenen değerle karşılaştırır.
- `fixture-contract`: schemaVersion ve label alanlarını bağımsız doğrular.
- `dependency-check`: önceki iki task'a bağımlıdır; host tarafından eklenen iki dependency özetini ve aynı fixture'ı karşılaştırır. Özetler yoksa veya çelişiyorsa blocked döner.

Route `codex`, requested model `gpt-6.1-sol`, mod `read_only`; yalnız belirtilen fixture okunur. Görevler worker'ın mevcut strict `status/summary/action_required` sözleşmesini kullanır; özet hedefi en çok 200 karakterdir. Bu hedef prompt talimatıdır; host public sınırının yerine geçmez. Her task için süreç stdout+stderr toplam sınırı 1048576 byte, snapshot sınırı 4096 byte, istenen timeout adapter denemesi başına 90 saniyedir. Süreç limiti son ölçümlerin yeterli olduğunu kanıtlamaz; bu küçük fixture için host'un 8388608 byte tavanının altında sonlu başlangıç seçimidir. Taşarsa aynı plan tekrar başlatılmaz.

Mevcut disk politikasında en fazla iki runtime adapter denemesi öngörülür; 90 saniye tüm task/DAG için toplam duvar saati garantisi değildir. Kuyruk, retry ve toplam süre host politikasına tabidir. CLI içindeki inference/faturalama sayısı host deneme sayısından çıkarılmaz.

Üç görev için önerilen yeni batch-local admission tavanı 0,75 USD'dir. Disk politikasındaki 0,10 USD bilinmeyen-deneme tahmini ve iki attempt ile beklenen allocation 0,60 USD'dir; gerçek değer canlı prepare yanıtından alınır. Bu tavan gerçek ücret garantisi veya provider faturası değildir. Önceki batch'in 0,40 USD unknown rezervi korunur; eski 0,10 USD kalan tutar bu planın veya global bütçenin kaynağı değildir.

Prepare worker başlatmaz. Canlı identity/kural snapshot eşleşmesi ve açık batch kapısı doğrulandıktan sonra prepare çıktısındaki planId/hash, expiry ve allocation kullanıcıya gösterilir. Ayrı açık onay olmadan start çağrılmaz. Restart veya expiry plan context'ini geçersiz kılarsa yeniden prepare edilir ve yeni hash gösterilir; eski onay taşınmaz. Yeni preview mesajı/alan açıklaması için Hades restart gerekir; önceden çalışan aynı byte enforcement yoluyla hazırlanmış plan bu yeni mesajın canlı yüklendiğini kanıtlamaz.

Başlatma onayı sonrasında terminal duruma kadar izlenir. Üç task completed/full, doğru model, iki dependency'nin hostça eklenmesi, değişmeyen kaynak hash/status ve ayrıntıdaki tutarlı sonuçlar ölçülür. Bu adım yalnız read-only DAG ve izleme kanıtıdır. Yerel testlerin geçmesi veya bir danışmanlık raporu bunun yerine geçmez.

## Açık kalan gerçek kabul adımları

1. P2: ayrıca onaylanmış disposable kaynakta seçili dosyalı Codex edit pilotu; kaynak öncesi/sonrası hash, seçilmemiş dosya koruması, path/secret reddi ve otomatik terfi olmaması. Ayrı onay/red, eski kaynak hash'i ve yarım promotion recovery senaryoları ölçülür. Mevcut kirli checkout edit batch kaynağı yapılamaz; commit olmadan temiz ilan edilemez. Temiz disposable kaynakta çalışmak mevcut `source_workspace_dirty` kapısını değiştirme yetkisi değildir.
2. P3 dayanıklılık: ayrıca onaylanmış disposable read-only batch ile iptal, timeout, worker unknown, restart ve expired plan kabulü. Restart testi sırasında unknown sonuç yeniden dispatch edilmez; unknown maliyetler korunur. Başarılı DAG bu senaryoları kapatmaz.
3. P3 edit: P2 sonrası temiz ve kapsamı onaylı kaynak, ayrı edit opt-in, task başına dosya sahipliği, izole worktree, host verification, birleşik diff/hash incelemesi ve ayrı entegrasyon onayı. Kaynak HEAD/hash değişimi onayı geçersiz kılmalı; recovery çatışması fail-closed kalmalıdır.
4. P6: tüm canlı kanıtlar ayrı ayrı kapandıktan sonra plan/rapor uzlaştırılır. Kabul bittikten sonra batch opt-in kapanışı ve restart sonrası canlı envanter doğrulaması ayrı son adımdır. Bu görev hesap, Vault veya opt-in ayarı değiştirmez.

## Başarısızlıkta karar

`get_parallel_batch` → ilgili opak `detailRef` ile sınırlı `get_parallel_task_detail` okunur. Yalnız reason, scope/stream, accepted/observed/rejected byte, exit/timeout, süre ve gözlenebilir maliyet metadata'sı raporlanır. Ham model çıktısı, stderr veya prompt belgeye/loga eklenmez. Scope process ise dosya kapsamı ve süreç cap'i; scope jsonl_record/final_result ise ilgili reducer sınırı ayrı değerlendirilir. Scope yoksa nedeni bilinmiyor bırakılır. Config ve salt disk değeri çalışan sürecin yükünü kanıtlamaz. Yeni provider maliyeti veya plan değişikliği için kapsam ve bütçe belirsizliği tekrar görünür kılınır; eski çağrı/start onayı yeni denemeye taşınmaz.
