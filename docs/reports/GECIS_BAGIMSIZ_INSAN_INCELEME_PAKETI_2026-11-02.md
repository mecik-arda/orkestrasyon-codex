# Codex/Hades gecisi bagimsiz yerel insan inceleme paketi

Tarih: 2026-11-02
Durum: reviewer atamasi, inceleme ve bulgu karari bekliyor

## Amac ve sinir

Bu paket, repository icinde yetkili bir insanin guncel diff'i yerel olarak incelemesi icindir. Kaynak kopyasi veya disariya gonderilecek bundle degildir. Bu gorevde insan incelemesi yapilmadi; reviewer, tarih, bulgu, onay veya karar uydurulmadi. Platform guvenlik preflight'i tarafindan reddedilmis icerigin baska kanala tasinmasi ya da kapsam bolerek yeniden sunulmasi istenmiyor.

## Kaynak ve karsilastirma baglari

- Inceleme checkout'u: 68e03e02a51d2e4835e046f3220a47cac655282c.
- Son uretim kaynak degisikligi: b5975cee42c093c75ebeef621f4f1dc541af3262. b5975ce ile 68e03e0 arasinda subagent-bridge/src, tests, package.json ve config/policy.json icin Git diff'i yok; sonraki commit'ler belge durum notlaridir.
- Karsilastirma tabani: 192df375bc2b18154a3b221e762cfe3c5b4b1739, OpenCode rotalarinin kaldirildigi gecis commit'i. Bu yalniz diff'i sinirlayan Git noktasi; denetlenmis baseline, remote guncelligi veya onceki reviewer siniri degildir.
- Tam kaynak farki su yerel komutla tekrar uretilebilir: git diff 192df375bc2b18154a3b221e762cfe3c5b4b1739 68e03e02a51d2e4835e046f3220a47cac655282c -- subagent-bridge/src tests package.json config/policy.json. Fark 66 yol icerir. Reviewer gercek git diff --name-only ciktisini ve inceledigi alt kume manifestini sonuc kaydina eklemelidir.
- Uretim kaynak kodu bu snapshot'ta b5975ce ile sabitlenmistir. Kisisel runtime config bu repository diff'inin parcasi degildir; Claude kabul opt-in'i ayrica kapatilmis ve runtime semasi dogrulanmistir.

Commit aileleri kapsam sinirlarini aciklar; tek baslarina inceleme kaniti degildir:

- P1b: e51e8f6f343da2d3583da5229510a985002cfbfd, 09d6ef1494b2b1e2eaf178f5ab68c57c98ba6ab8, 94ed8b960aaa69ca68f53f845797f79254561e71.
- P2 prepared-edit/onay: 7320a3df4267333f23aae91946a817314c96de39, 69b822592f93f886114c1c8743fbea86727a77ff; journal/recovery: b5975cee42c093c75ebeef621f4f1dc541af3262.
- P3 ref/worktree/coordinator: 07a4deeddd0d0a35112b26fe1277cdfcff01d1fb, a7107f54beba4164acc5704da7eeb87b418e2a46, d683318d5ea73d185acb410dd5eec4d15cae7cd3, c02deaa1546547a9bc7d4ed5b19de92bcf030c1a, dc21e08c8f03b648956077fb9c703057103b690e, 23475da1f08d63ee169f4aaf00a57a7c08adfe4a.
- Varsayilani kapali Option B ve yerel review prototipleri: fc3b6d0314d7c30eb93919524b84f3d494c6a43f, 0883da2, 9e2046b. Bunlar platform vetosunu asan uretim yetkisi degildir.

## Onceki bagimsiz inceleme kaniti

- P2 journal/recovery icin gercek gpt-6.1-sol metadata'si ve takip incelemesi kaydedilmistir. Ilk dort bulgu giderilmis, takipte yeni bulgu bildirilmemistir. Inceleme yedi dosya olarak tanimlanir fakat exact liste ve baslangic/bitis commit bagi saklanmamistir; mevcut 66 yollu farkla ortusen kisim belirlenemez.
- Daha onceki Sol incelemesi yalniz subagent-bridge/src/services/parallel-batch.js ve subagent-bridge/src/services/git-worktree-batch.js dosyalarinin belirli ref snapshot/revalidation davranisini kapsar. Commit siniri korunmadigindan guncel dosyalarin tamami denetlendi denemez.
- P1b icin istenen Sol yaniti kesilmis; gercek model metadata'si ve bulgular dogrulanmamistir. Bu bir inceleme degildir.
- tests/memory.test.js istegi adapterAttempts=0 ve kaynak teslimi not_attempted iken preflight'ta reddedilmistir. Option B exact-diff istegi de secret preflight'tan gecmemis; daha dar kapsamla tekrar girisimi platform auto-review tarafindan engellenmistir. Bunlar inceleme degildir ve yeniden denenmeyecektir.
- P3 batch'indeki gpt-6.1-sol worker metadata'si implementer gorevine aittir, reviewer kaniti degildir.

## Oncelikli kapsam ve cagri zincirleri

1. Yetki ve prepared payload:
   - Giris: subagent-bridge/src/frontends/mcp/server.js -> tools.js -> runtime/bridge-runtime.js.
   - Kritik servisler: prepared-edit-registry.js, approval-boundary.js, orchestrator-approval.js, p2-prepared-edit-policy.js.
   - Regresyonlar: tests/prepared-edit-registry.test.js, tests/approval-boundary.test.js, tests/orchestrator-approval-channel.test.js, tests/p2-prepared-edit.test.js.
   - Kosul: caller/workspace/payload/source bagi ve ayri kullanici onayi; stale kaynakta ret; approval reference kendi basina yetki uretmemeli.

2. Promotion, journal ve recovery:
   - Giris: bridge-runtime.js ve disposable-workspace.js.
   - Kritik zincir: p2-promotion-journal.js -> workspace-coordinator.js / kernel-file-lock.js -> kaynak, yedek, staged dosyalar ve terminal cleanup.
   - Regresyonlar: tests/p2-prepared-edit.test.js, tests/p2-promotion-conflict.test.js, tests/workspace-coordinator-kernel-lock.test.js ve P2 crash child fixture'lari.
   - Kosul: ilk yikici islemden once surumlu journal; kimlik/icerik bagi; farkli identity'li hedef korunmali; crash/eszamanli recovery/replay; recovery yeni approval olusturmamali; belirsizlikte artefakt silinmeden bloke olmali.

3. P3 worktree/ref:
   - Giris ve servisler: parallel-batch.js, parallel-batch-registry.js, git-worktree-batch.js, git-ref-snapshot.js, workspace-coordinator.js.
   - Regresyonlar: parallel-batch, state, schema, worktree, integration ve MCP batch testleri; workspace coordinator kernel lock testi.
   - Kosul: tum-ref korumasi, exact source/diff/onay bagi, host dogrulamasi, stale ref'te fail-closed; Option B kapali.

4. P1b Claude:
   - Giris: antigravity-adapter.js, claude-sonnet-acceptance.js, bridge-runtime.js ve MCP handler'lari.
   - Regresyonlar: tests/claude-sonnet-acceptance.test.js, tests/claude-sonnet-pilot.test.js, tests/faz-1-antigravity.test.js, tests/process-tree.test.js.
   - Kosul: CLI carrier, gorev JSON'u ve strict kabul asamalari ayrilmali; yalniz result anahtari ve sayisal 42; ham cevap/secret sizintisi olmamali. Canli pilot basarisizdir ve bu inceleme kabul sonucunu degistiremez.

5. Varsayilani kapali ve review gate:
   - Girisler: config.js, MCP server/tools, review-source-manifest.js, review-source-permit-registry.js.
   - Regresyonlar: config, MCP negative, review manifest/permit ve syntax-aware prototip testleri.
   - Kosul: default-off ozellikler onaysiz acilmamali; review permit genel bypass'a donusmemeli; dis preflight karari repository koduyla devre disi birakilmamali.

6. Benchmark ve test runner:
   - Girisler: package.json, tests/performance/memory-search.test.js, tests/memory.test.js, tests/process-tree.test.js ve alt surec fixture'lari.
   - Kosul: 5.000-not benchmark npm test'te zorunlu; 30 saniye assertion ve failure propagation korunmali. Seri fazdaki tek basarili kosu eski benchmark sorununun kok nedenini kanitlamaz.

## Mevcut kabul ve test kaniti

- P2 raporu canli hazirlik/ayri onayli uygulama, red/stale ret ve uretim recovery fonksiyonlariyla ayri surecli Windows disposable testlerini ayirir.
- P3 handoff canli DAG/iptal/restart-unknown ile 7d8dfbef17f84222ca9ba06354f590f5 normal entegrasyonunu kaydeder; pilot fixture acik yetkiyle baslangic haline temizlenmistir.
- P1b raporu yerel adapter/runtime testlerini son canli metadata'dan ayirir. Son Claude sonucu task_json_parse_invalid ile basarisizdir; ham yanit, butunluk/tamamlanma ayrintisi, inference sayisi ve maliyet bilinmiyor.
- P2 raporu zorunlu tam dogrulama ve onceki benchmark/Windows TEMP sinirlarini kaydeder. Bu gorevde provider veya benchmark cagrisi yapilmadi.

## Tehdit modeli ve platform sinirlari

- Kilitler yalniz protokole uyan surecleri kapsar; kilide uymayan dis writer'a karsi genel atomiklik garantisi yoktur.
- Recovery kaniti Windows disposable surec testidir; POSIX veya guc kaybi/fsync garantisi degildir.
- Review preflight/auto-review repository disi veto siniridir. Bu yerel paket reddedilen icerigi yeniden teslim etmez ve istisna etkinlestirmez.
- P2/P3 islevsel kabul bagimsiz diff incelemesinin yerine gecmez; risk karari review sonucu sayilamaz.

## Reviewer sorulari

1. Approval exact caller, workspace, islem, payload ve source baglarini koruyor mu; kaynak degisince eski approval reddediliyor mu?
2. Gercek MCP/runtime yollari strict schema ve source guard'larini ayni sekilde kullaniyor mu?
3. Journal kaynak mutasyonundan once kalici mi; kismi kayit/crash pencereleri fail-closed mi?
4. Farkli identity'li, ayni icerikli dis hedef rollback/recovery sirasinda korunuyor mu?
5. Hard-link ara durumu, cleanup, descriptor/lease ve ikinci crash sonrasi replay tutarli mi?
6. Recovery tuketilmis approval'i yeni uygulama yetkisine donusturmuyor mu?
7. Coordinator/kernel lock sirasi P2/P3 eszamanliligini ve kaynak izolasyonunu koruyor mu?
8. P3 integration tum Git ref'lerini, source state, approval/hash ve host verification'i son ana kadar dogruluyor mu?
9. Ref degisimi source_ref_changed fail-closed retini koruyor mu; basarili tek deneme eski retlerin nedeni hakkinda iddia uretmiyor mu?
10. Varsayilani kapali ozellikler config, handler ve MCP registration zincirinde onaysiz etkinlesebiliyor mu?
11. Antigravity hata siniflari/model metadata'si korundu mu; ham prompt/cevap/secret result veya telemetriye siziyor mu?
12. Benchmark her npm test kosusunda zorunlu mu, 30 saniye siniri ve failure propagation korunmus mu?
13. Testler gercek handler/runtime/recovery ve gercek dosya sonuclarini mi siniyor?

## Inceleme kaydi

- Reviewer: bekliyor.
- Incelenen commit, diff tabani ve tam path manifesti: bekliyor.
- Bulgular, onem dereceleri ve duzeltme dogrulamasi: bekliyor.
- Kalan risk ve inceleme karari: bekliyor.
- Bu paket hazirlanirken bagimsiz insan incelemesi yapilmadi.
