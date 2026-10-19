# M2 Proje Cohort Uygulama Ve Yerel Etkinleştirme Raporu

Durum notu (2026-09-26): Sol onaylı cohort mimarisi uygulandı; tarihsel atıf uzantısı ayrıca Sol onayıyla tamamlandı. Otomatik test ve repository doğrulamaları başarılıdır. Gerçek proje köklerinin yerel registry'ye girilmesi ve istemci trust/reload/context-injection smoke kontrolleri beklemektedir.

## Sonuç

- Norn ve DersMerkezi etiketlerini project root/worktree bağlamından ayıran canonical cohort akışı eklendi.
- Legacy session, disposition ve feedback satırları değiştirilmeden kaldı. Global M2 outcome, oran, pilot başlangıcı ve `decisionReady` hesabı aynı semantiği korur.
- Kullanıcı tarafından DersMerkezi olarak doğrulanmış bir eski OpenCode `not_useful` session'ı için ayrı append-only `historicalAttribution` görünümü eklendi. Bu atıf canonical `byProjectCohort` sayımına veya global M2 kararına eklenmez. İki diğer eski outcome etiketi atıfsız kalır.
- Tarihsel atıf komutu exact session-ID confirmation çifti, orchestrator tarafından sağlanan tek-seferlik beklenen session hash'i, mevcut `eligible_real_user` disposition'ı ve `not_useful` outcome'u doğrular. Ham session ID, hash, path veya serbest metin olay payload'ına/loglara yazılmaz.

## Atıf Ve Raporlama Kuralları

- Yerel registry varsayılanı `~/.config/subagent-bridge/memory-hook-cohorts.json`; mutlak `SUBAGENT_MEMORY_HOOK_COHORT_REGISTRY` override'ı desteklenir. Registry sürüm 1 JSON'dur ve named değerler yalnız `norn` ile `dersmerkezi`'dir.
- Kökler `realpath` üzerinden tam eşleşir. Her worktree alias ayrıca kaydedilmelidir; üst/alt dizin tahmini yapılmaz. OpenCode `directory`/`worktree`, Codex/Claude event `cwd` bağlamı kullanılır.
- Proje kurulumunda cohort belirtilmezse o hook `unassigned` kalır. Global hook cohort'u sabitlemez ve registry ile dinamik eşleşir. Named/unassigned uyuşmazlığı ilk atfı değiştirmeden conflict olarak raporlanır.
- Legacy cohort'suz oturumlar canonical raporda `legacy_unattributed` kalır. Tarihsel user-confirmed görünüm ayrı rapordur; canonical cohort ve global karar sayılarıyla karıştırılmaz.

## Yerel Etkinleştirme

1. Gerçek Norn ve DersMerkezi canonical root'larını ve kullanılan worktree'leri yalnız yerel registry'ye ekleyin. Bu yolları repository'ye veya raporlara koymayın. Windows'ta `~` kullanıcı profil dizinine karşılık gelir.
2. OpenCode için global dinamik plugin `npm run hook:install -- --client=opencode --global --apply` ile kurulabilir. `SUBAGENT_SECOND_BRAIN_HOOK=1` etkin olmalı ve OpenCode yeniden başlatılmalıdır. Farklı içerikli mevcut bir proje plugin'i `--force` ile ezilmez; önce güvenli biçimde yedeklenip elle geçiş yapılmalıdır.
3. Codex global hook'u `npm run hook:install -- --client=codex --apply` ile kurulabilir; Codex `/hooks` üzerinden hook güven incelemesi gerektirir. Proje hook'u için `--project-root` ve açık `--cohort` kullanılır; Codex config'i mevcut handler'ları koruyarak süreçler arası kilitle birleştirilir.
4. Claude için `npm run hook:install -- --client=claude --global` global settings snippet'i üretir. Proje snippet'i `--project-root` ve `--cohort` ile üretilip `<root>/.claude/settings.local.json` içine elle birleştirilir.
5. Gerçek session context injection sonrasında `npm run metrics` raporunda `memoryHookPilot.byProjectCohort` ile `memoryHookPilot.historicalAttribution` alanlarını ayrı inceleyin. Cohort isimleri proje metadata'sıdır ve dışarı paylaşılırken anonim kabul edilmemelidir.

Üretilen project-local OpenCode/Codex hook ayarları interpreter ve orchestrator kurulum yollarını içerebilir. Bunları makineye özel kabul edin; tüm tüketicilerde yol standartlaştırılmadıkça local/ignored tutun ve commit öncesi inceleyin.

## Eski Norn Etiketleri İncelemesi

- Kullanıcının ilettiği iki Norn incelemesi ilk aşamada 2026-09-23 07:20:56 UTC'deki `partial` session ile 2026-09-24 12:21:54 UTC'deki `not_useful` session'ı belirleyemedi; 23 Eylül'deki genel Norn çalışma kaydı oturuma özel kanıt sayılmadı.
- Ardından yapılan salt-okunur yerel OpenCode DB kontrolünde her iki M2 session hash'i bir OpenCode session ID'siyle eşleşti. Bu session kayıtlarının `directory`, worktree ve project-directory canonical değerleri Norn proje köküyle tam eşleşti. Ham session ID veya path rapora alınmadı.
- GPT-6 Sol, `session_metadata_verified` basis'ini ve canonical rapordan ayrılığı onayladı. İki atıf append-only `historicalAttribution` görünümüne eklendi: Norn altında bir `partial` ve bir `not_useful`.
- Bu iki session canonical raporda `legacy_unattributed` kalır; global M2 toplamları hâlâ 3 etikettir (1 `partial`, 2 `not_useful`) ve karar hesabı değişmez. DersMerkezi user-confirmed historical atfı da ayrı görünümde durur. Ham session ID veya path rapora alınmadı.

## Doğrulama

- Sol plan readiness kararı: `approve`.
- Sol global/proje omission ve coexistence açıklaması kararı: `approve`.
- Sol Codex eşzamanlı installer merge yarışı bulgusu kilit ve regresyon testiyle kapandı; Sol takip değerlendirmesi `closed`.
- Sol tarihsel attribution exact-session hash binding düzeltmesini `approve` etti.
- Sol Norn metadata-verified tarihsel atıf genişletmesini `approve` etti.
- `npm test`, `npm run verify`, `npm run verify:ci` ve `git diff --check` başarılı.

## Bekleyen Yerel Kontroller

- Gerçek Norn root/worktree bilgisi local cohort registry'ye eklenmemiştir; yeni oturumlarda canlı named cohort ataması için registry kurulumu hâlâ gerekir.
- Codex trust, Claude snippet birleştirme ve güven/reload, OpenCode plugin reload ve gerçek session injection kontrolleri henüz çalıştırılmadı. Geçici test kökleri gerçek proje köklerinin veya tarihsel oturumların kanıtı değildir.
