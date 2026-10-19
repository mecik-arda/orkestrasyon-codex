# Ücretli Çalışma Onay Kaydı

Tarih: 2026-09-21
Durum: Kayıt düzeni etkin; kayıtlı onaylar aşağıdadır.

## Amaç

Aylık maliyet eşiği bilgilendirme referansıdır; admission-time bütçe zorlaması varsayılan olarak kapalıdır. Bu nedenle her yeni ücretli ölçüm, pilot veya paralel review grubu açık kullanıcı onayıyla başlar ve bu dosyada kayıt altına alınır. Yerel ve ücretsiz doğrulamalar onay gerektirmez.

## Kayıt Alanları

- Tarih: onay tarihi (UTC ISO-8601).
- Kapsam: ölçümün amacı, görev sınıfı ve kabul kriteri.
- Sağlayıcı/Model: kullanılacak backend ve model kimliği.
- Azami çağrı sayısı: üst sınır.
- Tahmini üst maliyet: USD üst sınırı; bilinmiyorsa "ölçülemedi" yazılır.
- Onay durumu: onaylandı, reddedildi veya ertelendi.
- Sonuç: tamamlandığında bulgu özeti ve karar.
- Maliyet gözlemi: `npm run budget` çıktısından gözlenen ve tahmini maliyet ile kapsama oranı.

## Kayıtlar

- 2026-10-06 — Orkestrasyon V2 kalan gate canary'leri:
  - Kapsam: Kullanıcının açık talebiyle OpenCode output-cap/steps, Codex network-off, task-ref isolation ve disposable local file-remote write denial kanıtını ölçmek; yalnız geçici depolar kullanmak.
  - Sağlayıcı/Model: OpenCode / DeepSeek Flash; Codex / GPT-5.6 Luna.
  - Azami çağrı sayısı: `canary:parallel` içinde 3 OpenCode ve 1 Codex çağrısı; ayrıca 1 task-ref Codex canary ve 1 local-file-remote Codex canary.
  - Tahmini üst maliyet: Güvenilir üst sınır belirlenmedi; maliyet ölçümleri provider faturasını temsil etmez.
  - Onay durumu: Kullanıcının “açık kalanları kapatma” talimatıyla onaylandı; canary hedefleri geçici alanlarla sınırlandı.
  - Sonuç: OpenCode cap/steps/Bash deny kabul edildi; Codex network-off ve source ref isolation kabul edildi. Local file-remote push denemesi tam ref'e yönlendi, exit 1 ile sonlandı, hedef ref oluşmadı, source HEAD değişmedi; host kontrolü aynı hedefe yazabildi. Output error class `other`, karşılaştırmalı karar `sandbox_boundary`; gerçek dış remote'a yazma denenmedi.
  - Maliyet gözlemi: Her canary sonucu `totalCostUsd` ölçmedi; maliyet unknown/not observable, provider invoice değildir.
  - Sınıflandırma düzeltmesi (2026-10-08): `other` hata sınıfı denial'ı kanıtlamadığından önceki `sandbox_boundary` kabulü geri çekildi; güncel sonuç `unproven` olarak kalır.

- 2026-10-06 — GPT-6.1-Sol OpenCode global route incelemesi ve doğrulaması:
  - Kapsam: Kullanıcının açık talebiyle Gemini ve DeepSeek salt-okunur araştırması, ardından global Codex route düzeltmesi ve kişisel-global E2E kontrolü.
  - Sağlayıcı/Model: DeepSeek V4 Pro (kaynak analizi), Gemini 3.8 Flash (hipotez üretimi), P2B testinde Codex GPT-6.1-Sol ve Antigravity Gemini Pro/Flash.
  - Azami çağrı sayısı: 1 DeepSeek araştırma çağrısı, 1 Gemini araştırma çağrısı ve P2B uçtan uca turunda 4 provider çağrısı.
  - Tahmini üst maliyet: Güvenilir toplam üst sınır belirlenmedi.
  - Onay durumu: Kullanıcının açık araştırma/düzeltme ve test talimatıyla onaylandı.
  - Sonuç: Kök neden global OpenCode tool wrapper'ında sabit `gpt-6-sol` seçimi olarak doğrulandı. Varsayılan `codex` GPT-6.1-Sol'a geçirildi, `codexSol61` eklendi, `codexSol6` korundu. P2B E2E tüm fixture'larda geçti ve Codex `requestedModel`/`resolvedModel` GPT-6.1-Sol oldu. Hiçbir GLM provider çağrısı yapılmadı.
  - Maliyet gözlemi: DeepSeek bridge metriği `0.011713504 USD` bildirdi; Gemini ve P2B provider maliyetleri bilinmiyor. Bu ölçümler provider faturası değildir.

- 2026-10-06 — Orkestrasyon V2 DeepSeek sentetik MCP uçtan uca pilotu:
  - Kapsam: Kullanıcının açık tam doğrulama isteği kapsamında gerçek MCP stdio client üzerinden DeepSeek read-only/structured-output bağlantı yolunu doğrulamak; dosya içeriği ve web erişimi gerektirmeyen sentetik sonuç.
  - Sağlayıcı/Model: OpenCode / DeepSeek-V4 Pro.
  - Azami çağrı sayısı: 1 sentetik read-only çağrı.
  - Tahmini üst maliyet: Önceden güvenilir üst sınır belirlenmedi; pilot sırasında Bridge metriği 0.017589 USD gösterdi.
  - Onay durumu: Kullanıcının “projeyi uçtan uca test et” talimatıyla onaylandı.
  - Sonuç: `npm run pilot` başarılı; çıkış kodu 0, geçerli yapılandırılmış `completed` sonucu, retry yok. Yerel dosya okunmadı ve değiştirilmedi.
  - Maliyet gözlemi: 0.017589 USD Bridge sağlayıcı metriğidir; provider invoice değildir.

- 2026-10-06 — Orkestrasyon V2 kök-neden incelemesi:
  - Kapsam: Kullanıcının açık isteğiyle önceki Codex `auth_invalid` olayını ve Sol'un V2 üretim-hazırlığı bulgularının kaynak nedenlerini bağımsız alt-agent analizleriyle karşılaştırmak; yalnız read-only inceleme, dosya değişikliği/provider edit yok.
  - Sağlayıcı/Model: Antigravity Gemini 3.8 Flash (hipotez üretimi), OpenCode Space Bunny Free (daraltılmış kaynak incelemesi), OpenCode DeepSeek-V4 Pro (kaynak analizi).
  - Azami çağrı sayısı: Gemini 1 opt-in workspace-read capability probe'u ve 1 read-only görev/2 adapter attempt (ilk timeout sonrası retry); Space Bunny 2 read-only görev/3 adapter attempt (geniş görev iki timeout, daraltılmış görev başarılı); DeepSeek 1 read-only görev/1 attempt.
  - Tahmini üst maliyet: Toplam güvenilir upper bound ölçülemedi; provider faturası değildir.
  - Onay durumu: Kullanıcının bu oturumdaki açık sağlayıcı/model talebiyle onaylandı.
  - Sonuç: Gemini aday hipotezleri üretti; Space Bunny daraltılmış kontrolde `heldDiffs` temizliği ve terminal registry geçişi için ek hata adayı bildirdi; DeepSeek auth sınıflandırması, prompt stop koşulu ve V2 kod yolları için kaynak nedenlerini ayırdı. Ana orkestratör bulguları kaynakta bağımsız doğruladı ve raporladı. Tarihsel auth_invalid raw stderr bulunmadığı için unknown kaldı. Hiçbir subagent dosya değiştirmedi.
  - Maliyet gözlemi: DeepSeek bridge metriği `0.032515428 USD` bildirdi; invoice değildir. Gemini cost `null`; Space Bunny katalog fiyatı sıfır ve bu görev metriği invoice/cost iddiası taşımaz. Toplam fatura maliyeti ölçülemedi.

- 2026-10-05 — Orkestrasyon V2 ilk salt-okunur batch pilotu:
  - Kapsam: üç bağımsız read-only `quick_read` göreviyle planın açık fazlarını, pilot telemetrisini ve provider/Windows gate'lerini değerlendirmek; hiçbir dosyayı değiştirmemek.
  - Sağlayıcı/Model: Codex / GPT-5.6 Luna.
  - Azami çağrı sayısı: 3 worker görevi.
  - Tahmini üst maliyet: 0,60 USD batch-local admission estimate; gerçek sağlayıcı harcamasını sınırlamaz.
  - Onay durumu: onaylandı (2026-10-05, immutable plan preview sonrası ayrı kullanıcı onayı).
  - Sonuç: 1 görev completed, 1 görev `auth_invalid`, 1 görev stop condition nedeniyle blocked. Otomatik retry yapılmadı. Hiçbir dosya değişmedi. Batch tahsisinin 0,60 USD'si unknown olarak kaldı; gerçek maliyet ölçülemedi.
  - Maliyet gözlemi: task-level provider cost `null`; admission tahmini fatura değildir. Codex genel adapter health daha sonra auth valid raporladı; bu, ilgili model/task çağrısının erişimini doğrulamaz.

- 2026-10-05 — Orkestrasyon V2 ikinci read-only inceleme batch'i:
  - Kapsam: plan açık fazları, telemetry ölçüm semantiği ve provider/Windows gate'leri için üç farklı salt-okunur görev.
  - Sağlayıcı/Model: Codex / GPT-5.6 Luna.
  - Azami çağrı sayısı: 3 worker görevi.
  - Tahmini üst maliyet: 0,60 USD batch-local admission estimate; gerçek sağlayıcı harcamasını sınırlamaz.
  - Onay durumu: onaylandı (2026-10-05, immutable plan preview sonrası ayrı kullanıcı onayı).
  - Sonuç: 3/3 görev completed; dosya değişikliği veya dış ağ erişimi olmadı. Summary 7.554 byte, task artifact toplamı 6.884 byte; bu örnek context kazancı göstermedi. Edit/release gate'leri açılmadı.
  - Maliyet gözlemi: task-level provider cost `null`; batch'in 0,60 USD tahmini unknown olarak kaldı ve fatura değildir.

- 2026-10-05 — Orkestrasyon V2 tek-worker baseline:
  - Kapsam: aynı 13 read-only dosya/kapsamı tek `quick_read` Codex göreviyle karşılaştırmak; dönen summary boyutu ve host task süresini ölçmek.
  - Sağlayıcı/Model: Codex / GPT-5.6 Luna.
  - Azami çağrı sayısı: 1 worker görevi.
  - Tahmini üst maliyet: 0,20 USD batch-local admission estimate; gerçek sağlayıcı harcamasını sınırlamaz.
  - Onay durumu: onaylandı (2026-10-05, immutable plan preview sonrası ayrı kullanıcı onayı).
  - Sonuç: completed; public summary 3.118 byte, host task süresi 145.465 ms. Bu inceleme kapsamı için tek-worker summary, 3-worker summary'den küçüktü; parallel fan-out faydası gösterilmedi.
  - Maliyet gözlemi: task-level provider cost `null`; 0,20 USD tahmini unknown olarak kaldı ve provider faturası değildir.

- 2026-10-05 — Orkestrasyon V2 Codex task-ref isolation canary:
  - Kapsam: GPT-5.6-Luna `workspace-write` sandbox'ında yalnız OS-temp altındaki detached task worktree'de bir local branch oluşturma denemesi; source refs/HEAD hash değişmezliğini ve V2 host kontrolünü gözlemek. Dış ağ komutu yoktur.
  - Sağlayıcı/Model: Codex / `gpt-5.6-luna`.
  - Azami çağrı sayısı: 1 provider çağrısı.
  - Tahmini üst maliyet: güvenilir biçimde ölçülemedi; gerçek provider faturası tavanı yoktur.
  - Onay durumu: onaylandı (2026-10-05, ayrı kullanıcı onayı).
  - Sonuç: accepted; branch private task repository içinde oluştu, source refs/HEAD değişmedi, geçici repo temizlendi. Bu remote-push denial veya edit batch kabulü değildir.
  - Maliyet gözlemi: provider cost `null`; ölçülemedi.

- 2026-10-05 — Orkestrasyon V2 disposable local remote-write canary:
  - Kapsam: GPT-5.6-Luna `workspace-write` + network-off altında üç kullanıcı-onaylı denemeyle yalnız temp bare file remote'a `git push` sınırını ölçmek; dış ağ, credential helper ve ana checkout kullanılmadı.
  - Sağlayıcı/Model: Codex / `gpt-5.6-luna`.
  - Azami çağrı sayısı: ilk deneme + iki ayrı onaylı, farklı instrumentasyon teşhis denemesi; daha fazla retry yapılmadı.
  - Tahmini üst maliyet: güvenilir biçimde ölçülemedi; gerçek provider invoice tavanı yoktur.
  - Onay durumu: her iki deneme için ayrı kullanıcı onayı (2026-10-05).
  - Sonuç: `unproven`. Son denemede JSONL `git push` event'i gözlendi; exit code 1, redacted çıktı sınıfı `other`, temp remote ref yok ve source HEAD değişmedi. Temp state temizlendi. Kullanıcı onaylı retry sayısı tükendi; bu gate fail-closed kalır.
  - Maliyet gözlemi: provider cost `null`; ölçülemedi.

- 2026-10-05 — Codex GPT-5.6-Luna capability tanılama probu:
  - Kapsam: V2 pilot task'ındaki `auth_invalid` sonucunu model erişiminden ayırmak için tek opt-in salt-okunur capability probe'u.
  - Sağlayıcı/Model: Codex / `gpt-5.6-luna`.
  - Azami çağrı sayısı: 1 capability probe.
  - Tahmini üst maliyet: güvenilir biçimde ölçülemedi; bu probe provider fatura tavanı değildir.
  - Onay durumu: onaylandı (2026-10-05, ayrı kullanıcı onayı).
  - Sonuç: `modelAccess=available`, `toolFreeResponse=available`, `workspaceRead=not_probed`. İlk batch task'ının auth hatası açıklanmadı; aynı task otomatik tekrarlanmadı.
  - Maliyet gözlemi: sağlayıcı maliyeti probe sonucunda verilmedi.

- 2026-10-05 — Orkestrasyon V2 Codex hata inceleme grubu:
  - Kapsam: bu V2 fazındaki Codex auth_invalid, task prompt stop-condition blocked ve remote-write canary unproven sonuçlarını Gemini/DeepSeek danışmanlığıyla sınıflandırmak, ardından GPT-6.1 Sol'dan birleşik remediation kararı almak.
  - Sağlayıcı/Model: Antigravity Gemini 3.8 Flash (aday hipotezleri), OpenCode DeepSeek-V4.1-Flash (yerel salt-okunur kaynak analizi), Codex GPT-6.1 Sol (nihai danışma).
  - Azami çağrı sayısı: Gemini 1; DeepSeek en fazla 2 adapter denemesi (rate_limited retry dahil); Sol 1.
  - Tahmini üst maliyet: güvenilir toplam üst sınır ölçülemedi; provider invoice değildir.
  - Onay durumu: onaylandı (2026-10-05, kullanıcı isteği).
  - Sonuç: Sol auth regex'inin daraltılması ve read-only prompt/stop-condition ayrımının netleştirilmesini önerdi; remote-write canary `unproven` bırakıldı, retry/bypass önerilmedi. Daraltma ve prompt düzeltmesi uygulandı; remote-write/edit gate kapalı.
  - Maliyet gözlemi: DeepSeek başarılı denemesinde raporlanan `totalCostUsd=0.004169712`; rate_limited ilk attempt, Gemini ve Sol maliyeti ölçülemedi. Hiçbir değer provider invoice değildir.

- 2026-10-05 — Orkestrasyon V2 tek-worker read-only baseline:
  - Kapsam: 3-worker inceleme batch'iyle aynı 13 read-only dosya/kapsamı tek `quick_read` Codex göreviyle karşılaştırmak; provider faturası değil dönen summary byte'ı ve host task süresini ölçmek.
  - Sağlayıcı/Model: Codex / GPT-5.6 Luna.
  - Azami çağrı sayısı: 1 worker görevi.
  - Tahmini üst maliyet: 0,20 USD batch-local admission estimate; gerçek sağlayıcı harcamasını sınırlamaz.
  - Onay durumu: onaylandı (2026-10-05, immutable plan preview sonrası ayrı kullanıcı onayı).
  - Sonuç: completed; public summary 3.118 byte, host task süresi 145.465 ms. Bu inceleme kapsamı için tek-worker summary, 3-worker summary'den küçüktü; parallel fan-out faydası gösterilmedi.
  - Maliyet gözlemi: task-level provider cost `null`; 0,20 USD tahmini unknown olarak kaldı ve provider faturası değildir.

- 2026-09-24 — M2 proje cohort mimarisi araştırması ve plan denetimi:
  - Kapsam: Norn ve DersMerkezi M2 memory-hook etiketlerini proje bazında ayırmak için gizlilik, düşük kardinalite, hook bağlamı ve küçük örneklem davranışı araştırması; kabul kriteri: mevcut global M2 toplamı/karar eşiği korunurken proje kırılımı ham workspace yolu veya prompt taşımadan tasarlanmalı.
  - Sağlayıcı/Model: Antigravity Gemini 3.8 Flash (kamuya açık kaynak araştırması), Codex GPT-6 Sol (salt-okunur plan review).
  - Azami çağrı sayısı: 5 (Gemini 3.8 Flash en fazla 4 araştırma çağrısı; GPT-6 Sol 1 plan review).
  - Tahmini üst maliyet: ölçülemedi.
  - Onay durumu: onaylandı (kullanıcı isteği).
  - Sonuç: Gemini araştırma çağrılarından 1'i tamamlandı, 3'ü sırasıyla abort/timeout/abort ile tamamlanmadı; erişim probe'unda modelAccess kullanılabilir, webRead doğrulanmadı ve toolFreeResponse sunucu hatası verdi. Prometheus, OpenTelemetry, Codex, Claude Code ve OpenCode birincil dokümanları ana orkestratörce doğrudan doğrulandı. GPT-6 Sol planı `revise` kararıyla denetledi; 8 bulgunun uygulanabilir olanları plana işlendi. Plan kullanıcı kararı bekliyor.
  - Maliyet gözlemi: çağrı metriklerinde `totalCostUsd` null; ölçülemedi.

- 2026-09-26 — M2 cohort plan açıklıkları, onayı ve uygulaması:
  - Kapsam: Sol `revise` bulgularını kullanıcı onaylı kurallarla kapatmak, plan readiness onayı almak ve M2 cohort davranışını uygulamak; kabul kriteri: global M2 semantiği korunurken registry doğrulaması, immutable cohort atfı, conflict raporu ve güvenli istemci kurulumlarının testlerle doğrulanması.
  - Sağlayıcı/Model: Codex GPT-6 Sol (8 salt-okunur readiness/uygulama inceleme çağrısı), Codex GPT-6 Luna (3 seçili-plan-dosyası edit çağrısı).
  - Azami çağrı sayısı: Bu takip kapsamı için ayrıca sayısal üst sınır verilmedi; fiilen 11 çağrı kullanıldı.
  - Tahmini üst maliyet: ölçülemedi.
  - Onay durumu: onaylandı (kullanıcı planı uygulamayı istedi, Sol onay kapısını ve gerekli skill akışını talep etti; uygulama kararlarını ayrıca kabul etti).
  - Sonuç: plan ve global/proje omission açıklaması GPT-6 Sol tarafından `approve` edildi. Uygulama incelemesindeki Codex installer eşzamanlı merge yarışı kilit ve regresyon testiyle kapatıldı; Sol takip incelemesi kapandığını doğruladı. Gerçek Norn/DersMerkezi kökleri ve istemci trust/reload/context injection yerel dağıtım adımları olarak bekliyor. `npm test`, `npm run verify`, `npm run verify:ci` ve `git diff --check` başarılı.
  - Maliyet gözlemi: tüm sağlayıcı çağrılarında `totalCostUsd` null; maliyet ölçülemedi.

- 2026-09-26 — M2 legacy historical attribution extension:
  - Kapsam: canonical M2 toplamlarını değiştirmeden, kullanıcı tarafından DersMerkezi olduğu doğrulanan tek OpenCode `not_useful` legacy session'ı için append-only supplementary history attribution; kabul kriteri: exact session authorization binding, eligible outcome checks, no raw-ID/path storage, other legacy labels remain unattributed.
  - Sağlayıcı/Model: Codex GPT-6 Sol (2 salt-okunur plan reviews); Codex GPT-6 Luna (2 selected-plan-file edits).
  - Azami çağrı sayısı: Bu extension için ayrı sayısal üst sınır verilmedi; fiilen 4 çağrı kullanıldı.
  - Tahmini üst maliyet: ölçülemedi.
  - Onay durumu: onaylandı (kullanıcı supplementary görünümü ve tek DersMerkezi atfını açıkça onayladı; GPT-6 Sol exact-session binding revizyonunu approve etti).
  - Sonuç: append-only DersMerkezi `historicalAttribution` eklendi; exact authorized invocation idempotent çıktı çünkü aynı attribution event'i zaten bulunuyordu, duplicate yazılmadı. Bu aşamada diğer iki etiket legacy/unattributed kaldı; sonraki Norn metadata incelemesi ve genişletmesi aşağıda ayrıca kayıtlıdır. Canonical global totals ve legacy satırları değişmedi. Son doğrulama: `npm test`, `npm run verify`, `npm run verify:ci` ve `git diff --check` başarılı.
  - Maliyet gözlemi: sağlayıcı metriklerinde `totalCostUsd` null; maliyet ölçülemedi.

- 2026-09-26 — Norn historical attribution metadata doğrulaması ve eklemesi:
  - Kapsam: kullanıcı Norn tahmininin yeniden kontrolünü istedi ve iki eski OpenCode session'ı supplementary Norn görünümüne eklemeyi onayladı; kabul kriteri: exact metric-session-hash ile OpenCode session ID eşleşmesi ve session `directory`/worktree/project-directory metadata'sının Norn root ile exact canonical eşleşmesi; hiçbir ham path/session ID kaydetmemek; canonical/global M2 toplamlarını korumak.
  - Sağlayıcı/Model: Codex GPT-6 Sol (1 salt-okunur plan review); Codex GPT-6 Luna (1 seçili-plan-dosyası edit).
  - Azami çağrı sayısı: Bu follow-up için ayrı sayısal üst sınır verilmedi; fiilen 2 çağrı kullanıldı.
  - Tahmini üst maliyet: ölçülemedi.
  - Onay durumu: onaylandı (kullanıcı recheck ve Norn historical ekini istedi; GPT-6 Sol expanded planı `approve` etti).
  - Sonuç: iki session'ın metadata'sı Norn root ile exact eşleşti; Norn için bir `partial` ve bir `not_useful` `session_metadata_verified` basis'iyle append-only historical attribution olarak eklendi. Canonical cohort kayıtları legacy kaldı; global M2 toplamı/outcome'ları değişmedi. `npm test`, `npm run verify`, `npm run verify:ci` ve `git diff --check` son haliyle başarılı. Gerçek Norn root/worktree registry ve istemci smoke doğrulaması bekliyor.
  - Maliyet gözlemi: çağrı metriklerinde `totalCostUsd` null; maliyet ölçülemedi.

- 2026-09-26 — `docs/plans` durum envanteri araştırması:
  - Kapsam: Gemini 3.8 Flash ile `docs/plans` dosyalarına salt-okunur aday durum sınıfları üretmek; kabul kriteri: hiçbir dosya ajan tarafından değiştirilmeden, ana orkestratör explicit durum notları ve uygulama kanıtlarıyla klasör kararlarını doğrular.
  - Sağlayıcı/Model: Antigravity Gemini 3.8 Flash (tek salt-okunur envanter çağrısı; diğer Gemini rotaları paralel başlatılmayacak).
  - Azami çağrı sayısı: 1 görev çağrısı; maliyet üst sınırı ölçülemedi.
  - Bütçe öncesi gözlem (`npm run budget`): aylık tahmini 176,80 USD, gözlenen 0,3691 USD, kapsama 0,0792; bilgilendirme limiti 100 USD üzerinde, enforcement kapalıdır. Kullanıcı Gemini araştırmasını açıkça istedi.
  - Onay durumu: onaylandı (kullanıcı isteği).
  - Sonuç: Antigravity capability probe'u `health check unavailable`, tek Gemini araştırma çağrısı `read_only_enforcement_unavailable` ile başlamadı. Read-only enforcement başarısız olduğundan retry/bypass yapılmadı ve Gemini bulgusu kullanılmadı. DeepSeek yerel analiz rotası önceki açık kullanıcı talimatı nedeniyle kullanılmadı; nihai dosya sınıflandırması ana orkestratör tarafından yerel durum notları ve raporlarla doğrulandı.
  - Maliyet gözlemi: probe ve görev metriklerinde `totalCostUsd` null; maliyet ölçülemedi.

- 2026-09-27 — Antigravity read-only enforcement düzeltmesi ve plan sınıflandırması:
  - Kapsam: `read_only_enforcement_unavailable` kök nedenini düzeltmek; Gemini 3.8 Flash salt-okunur capability ve enforcement doğrulaması yapmak; yalnız sağlanan özetlerle plan sınıflandırma adayı taraması almak; kararları repository kanıtlarıyla doğrulamak.
  - Sağlayıcı/Model: Antigravity Gemini 3.8 Flash.
  - Çağrı sınırı: başlangıçta bir capability-probe tool çağrısı ve bir Gemini görevi; sonraki açık kullanıcı talebiyle planlar dört ayrı, doküman güncelliği iki ayrı Gemini görevinde incelendi. Tüm Antigravity çağrıları seri çalıştırıldı; toplamda iki capability-probe işlemi ve on task attempt (restart öncesi iki enforcement reddi, restart sonrası sekiz başarılı görev) oluştu.
  - Bütçe öncesi gözlem (`npm run budget`): aylık tahmini 177,00 USD, gözlenen 0,3691 USD, kapsama 0,0791; 100 USD bilgilendirme limitinin 77,3691 USD üzerinde, enforcement kapalıdır.
  - Onay durumu: onaylandı (kullanıcı Gemini subagent sorununu çözmeyi ve planların ayrıntılı araştırmayla yeniden sınıflandırılmasını istedi).
  - Sonuç: modelAccess, toolFreeResponse ve workspaceRead capability probeları `available`. Resmî Antigravity izin dokümanı Deny > Ask > Allow önceliğini doğruladı; adapter guard'ı buna göre düzeltildi ve hedefli test 42/42 geçti. İlk iki canlı Gemini denemesi restart öncesi `read_only_enforcement_unavailable` ile provider öncesinde durdu. Kullanıcı OpenCode'u yeniden başlattıktan sonra resmî izin dokümanı görevi, dört parça plan adayı taraması ve iki parça doküman-güncellik taraması başarıyla tamamlandı; hepsi seri yürütüldü. Gemini'ye workspace içeriği verilmedi; tüm adaylar yerel dosya/kabul kriteri kanıtlarıyla bağımsız doğrulandı. Üç sınıflandırma düzeltmesi ve iki audit-rapor taşıması yapıldı; video görev yönergeleri temizlendi; araştırma sürüm zinciri ve cross-link/durum notları güncellendi. Bypass kullanılmadı.
  - Maliyet gözlemi: son `npm run budget` aylık `measurementStatus: not_observable`, tahmini 177,20 USD, gözlenen 0,3691 USD, kapsama 0,0790; raporlanan toplam 177,5691 USD, 100 USD bilgilendirme eşiğinin 77,5691 USD üzerindedir ve `enforced: false`. Capability/live görev metriklerinde `totalCostUsd` null olduğundan bu çağrıların kesin maliyeti ayrıca ölçülemedi.

- 2026-09-22 — GPT-6 Luna/Sol doğrulama ve entegrasyon:
  - Kapsam: `gpt-6-luna` ve `gpt-6-sol` canonical Codex kimliklerinin doğrulanması, profillerin ve global araçların eklenmesi; kabul kriteri: canlı model erişimi ve salt-okunur pilot başarısı, uydurma kimliğin reddi.
  - Sağlayıcı/Model: codex (`gpt-6-luna`, `gpt-6-sol`; negatif kontrol `gpt-6-nope`).
  - Azami çağrı sayısı: 12 (capability probları, salt-okunur pilotlar, edit pilotları ve doğrulama çağrıları dahil; aşım yok).
  - Tahmini üst maliyet: ölçülemedi.
  - Onay durumu: onaylandı (kullanıcı isteği).
  - Sonuç: tamamlandı (edit pilotları dahil, 2026-09-22, MCP yeniden başlatma sonrası). `codexLuna6Edit` değişikliksiz denetimde `no_changes` döndü ve model metni korundu; uygulamalı pilotta README.md sonuna tek satır eklenerek `applied:true` doğrulandı ve değişiklik `git restore` ile geri alındı. `codexSol6Edit` değişikliksiz denetimde `no_changes`, uygulamalı pilotta README.md sonuna tek satır eklenerek `applied:true` doğrulandı ve değişiklik geri alındı. Her iki profilde `resolvedModel` birebir eşleşti; pilotlar öncesi ve sonrası ana çalışma alanı `git status` ile karşılaştırıldı ve README değişiklikleri geri alındı (bu kayıt dosyasının güncellenmesi pilot mutasyonu sayılmaz).
  - Not: `sol6_implementation` fallback'i GLM içermez (Codex Sol 5.6 → DeepSeek Pro); mevcut legacy profillerdeki (ör. `astra_implementation`) GLM fallback'leri bu kaydın kapsamı dışındadır ve ayrı temizlik kararı gerektirir.
  - Maliyet gözlemi (2026-09-22, `npm run budget`): aylık pencerede `measurementStatus: not_observable`, gözlenen 0,364321 USD, tahmini 154,70 USD, kapsama 0,0851 (80 bilinen / 860 bilinmeyen çalışma). Bu görevdeki çağrı metriklerinde `totalCostUsd` null döndüğü için GPT-6 pilotlarının maliyeti ayrıca gözlenemedi.
