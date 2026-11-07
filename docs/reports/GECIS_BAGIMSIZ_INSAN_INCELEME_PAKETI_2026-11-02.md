# Codex/Hades gecisi bagimsiz model inceleme paketi

## 2026-11-04 smoke Vault erisimi duzeltmesi

2026-11-03 kaydindaki yetkisiz gercek Vault notu okuma olayi tarihsel olarak korunur; icerik, not yolu ve kimlik bilgisi bu kayda eklenmez. Varsayilan `npm run smoke` artik gecici sentetik config/Vault kullanir, sentetik child process environment'ina yalniz gerekli isletim sistemi degiskenlerini aktarir ve kullanici config/profilini veya provider credential'larini miras almaz. Smoke regression'i trap Vault arama sonucunun bos oldugunu, sentetik notun gercek MCP stdio yolunda bulunup okunabildigini ve fixture hash'inin eslestigini dogrular. Basarili sentetik smoke yalniz bu stdio fixture'ini dogrular; kisisel Vault sagligi veya calisan Desktop Hades surecinin durumu icin kanit degildir. `npm run smoke:vault` ayri acik opt-in'dir; yalniz MCP catalog/memory health, arama ve secilen tek notun okunmasini yapar. Provider health ve tum Vault'u tarayan `review_persistent_memory` cagrisi sentetik modla sinirlidir. Smoke kodu ve testlerinde bu ayrim uygulandi; bu degisiklik bagimsiz incelenmis degildir. Eski real-Vault okuma sonucu yetkili dogrulama sayilmaz.

## 2026-11-03 son yerel kapsam uzlaştırması

Bu not yerel kaynak denetimi ve doğrulama kaydıdır; bağımsız model incelemesi değildir. Başlangıç HEAD `e6688347dc7c04607757c5d82ee6e57e778b0376`, dal `main`, temiz çalışma ağacı ve `origin/main` yerel referansına göre 5 commit ilerilik doğrulandı. Uzak ref güncelliği fetch yapılmadığından bilinmiyor.

Önceki doğrulanmış GPT-6.1-Sol incelemesi requested/resolved `gpt-6.1-sol`, 10 dosya/152.283 bayt, manifest SHA-256 `dbd7ca846d7d7e9df23a2908f9364732c328f320d96ae3b68908a29201df45f8`, `complete_to_cli`, strict sonuç completed/complete, exit 0, 1 adapter attempt ve 0 retry metadata'sını taşır. Tam kaynak commit bağı review kaydında korunmadığından manifest özeti commit attestation'ı değildir. Önceki istekte listelenen 10 dosyanın snapshot'ı dışındaki güncel dosya sürümleri veya dosyalar bu başarıya dahil edilemez.

Sonraki doğrulanmış üretim değişiklikleri arasında `4d21a7e`/`2dfa762` ile `subagent-bridge/src/frontends/mcp/tools.js` runProfile host-modu sınırı ve gerçek handler/runtime testi; `71481a8` ile aynı handler'ın DeepSeek MCP hata eşlemesi ve client taşıyıcı regresyonları; `501c193` ile `subagent-bridge/src/services/disposable-workspace.js` diff satır sonu sadakati ve sentetik regresyonları vardır. `bridge-runtime.js` önceki 10 dosyalık Sol kapsamının dışındaydı. P2 için önceki yedi dosyalık review/follow-up kaydının exact manifesti ve commit sınırı korunmadı; P3'teki daha dar Sol kapsamının da güncel snapshot sınırı bilinmiyor. Bu nedenle bu kayıtlar bütün ilgili dosyaların bugünkü içeriğine genişletilemez.

Bu turda `tools.js` → `bridge-runtime.js` → DeepSeek adapter ve `runDeepSeekEditPilot` disposable yolunun status/error/cleanup bağları, source snapshot ve diff render akışı, P4 host-result regressions ve runProfile review dispatch sınırı yerel olarak incelendi. Yeni doğrulanmış kusur bulunmadı; kod değişmedi. Tam `npm test` Node v24.17.0 ile standart kullanıcı TEMP/TMP'sinde 1.073 testte 1.069 başarı, 4 Windows koşullu atlama ve 0 başarısız verdi; zorunlu benchmark 12,17 saniyede geçti. `verify` ve `verify:ci` başarılıdır. İlk hedefli testte sandbox TEMP nedeniyle üç circuit testinin beklenen fail-fast state'i alamaması ve Git init'in EPERM ile başarısız olması görüldü; `tests/faz-p0-runtime.test.js` standart kullanıcı TEMP/TMP'sinde 42/42 geçti.

`smoke` exit 0 ile tamamlandı; sonradan script kaynak incelemesinde bu komutun memory search/read akışından bir seçili Vault notunu okuduğu belirlendi. Bu erişim bu görevde izinli değildi. Not içeriği çıktılanmadı, yazım veya Vault mutasyonu yapılmadı; smoke sonucu bu görev için yetkili geçiş kanıtı sayılmıyor. Bu husus saklama/işleme devam etmeme sınırıdır; nota ilişkin içerik veya kimlik bu pakete eklenmemiştir.

Yeni Sol çağrısı yapılmadı: daha geniş repository kaynak teslimi için kayıtlı repository `review_scope_secret_detected` ve platform Auto-review retleri çözülmemiştir. Bu nedenle doğal alt kapsamı yeniden göndermek veya önceki kapsamı parçalamak güvenli mevcut yol değildir. Yerel inceleme, önceki model incelemesinin yerine geçmez. P2/P3/P4 işlevsel kabulleri tamam; Claude P1b başarısız geçmişiyle ertelenmiş; AST ayarı kapalı/unset; P6 koşulsuz kapanışı bağımsız inceleme kararına bağlıdır.

Tarih: 2026-11-02
Durum: GPT-6.1-Sol ve Gemini Flash incelemesi kaynak teslim engeli nedeniyle yapilmadi

## Amac ve sinir

Bu paket, yerel repository icin bagimsiz model inceleme kapsam haritasidir; kaynak kopyasi veya disariya gonderilecek bundle degildir. Kullanici GPT-6.1-Sol ana reviewer ve Gemini Flash karsi gorusu istemistir. Onceki kaynak teslimi ve auto-review retleri devam ettiginden Sol istegi tekrarlanmadi. Gemini Antigravity araci source-bundle reviewScope tasimaz; ayni reddedilmis kaynagi workspace yoluyla vermek yasaktir. Bu nedenle iki model de cagrilmadi; bulgu, karar veya basarili inceleme uydurulmadi.

## Kaynak ve karsilastirma baglari

- Inceleme checkout'u: 68e03e02a51d2e4835e046f3220a47cac655282c.
- Son uretim kaynak degisikligi: b5975cee42c093c75ebeef621f4f1dc541af3262. b5975ce ile 68e03e0 arasinda subagent-bridge/src, tests, package.json ve config/policy.json icin Git diff'i yok; sonraki commit'ler belge durum notlaridir.
- Karsilastirma tabani: 192df375bc2b18154a3b221e762cfe3c5b4b1739, OpenCode rotalarinin kaldirildigi gecis commit'i. Bu yalniz diff'i sinirlayan Git noktasi; denetlenmis baseline, remote guncelligi veya onceki reviewer siniri degildir.
- Tam kaynak farki su yerel komutla tekrar uretilebilir: git diff 192df375bc2b18154a3b221e762cfe3c5b4b1739 68e03e02a51d2e4835e046f3220a47cac655282c -- subagent-bridge/src tests package.json config/policy.json. Fark 66 yol icerir. Reviewer gercek git diff --name-only ciktisini ve inceledigi alt kume manifestini sonuc kaydina eklemelidir.
- Uretim kaynak kodu bu snapshot'ta b5975ce ile sabitlenmistir. Kisisel runtime config bu repository diff'inin parcasi degildir; Claude kabul opt-in'i ayrica kapatilmis, runtime semasi dogrulanmis ve Hades restart'i sonrasi katalogda run_claude_sonnet_acceptance_pilot sunulmamistir.

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

## Ret kararlarinin sahibi ve mevcut destek yolu

Ayrim:

- Repository secret preflight'i `review_scope_secret_detected` kararini manifest/source bundle olusmadan verir; `adapterAttempts=0` ve `sourceDeliveryStatus=not_attempted` bu katmanin kanitidir. Mevcut production kodunda false-positive override yoktur. Bu siniflandirmanin degisip degismeyecegi repository kod sahiplerinin ayri politika karari olur; OpenAI Support bu yerel kod kararini veremez.
- Platform auto-review reddi repository preflight'indan ayri veto katmanidir. Option B exact review istegi source/secret preflight'ta kalmis, kapsam daraltma girisimi platform auto-review tarafindan engellenmistir. Modelin calistigi veya kaynagi aldigi kanitlanmamistir.
- Hades/adapter/model calismasi bu retlerde baslamamistir; yeniden model cagrisi yapilmadi.

OpenAI Help Center, acikca benign veya yetkili siber guvenlik istegi tekrar tekrar engellenirse Support'a basvurulabilecegini ve tam guvenlik mesajini, urun/modeli, tarih-saat/zaman dilimini, varsa request ID'yi, redakte gorev ozetini ve uygulanabiliyorsa workspace/organization bilgisini eklemeyi soyluyor. Hassas veya proprietary icerik gonderilmemeli. Iletisim yolu Help Center sag-alt chat bubble'dir. Kaynaklar: [Additional safety checks for cybersecurity requests](https://help.openai.com/en/articles/20001326-additional-safety-checks-for-biological-and-cybersecurity-requests-in-chatgpt-codex-and-the-api) ve [How can I contact support?](https://help.openai.com/en/articles/6614161-how-can-i-contact-support). Erisim tarihi: 2026-11-02.

Bu kanal platform auto-review kararinin degerlendirilmesini istemek icin mevcut yetkili yoldur; repository preflight istisnasi veya kaynak teslim onayi degildir. Support olumlu yanit verse bile iki katman ayri kalir. Resmi guvenlik rehberinde Daybreak programina basvuru da yetkili siber guvenlik calismasi icin belirtilir; ancak bu, mevcut review reddine itiraz mekanizmasi veya safeguard kaldirma garantisi olarak sunulmaz ve bu gorevde basvuru yapilmamistir.

### Codex TUI exact-denial retry yolu

Resmi [Codex Auto-review kilavuzu](https://learn.chatgpt.com/docs/sandboxing/auto-review), mevcut open-source TUI'de `/approve` komutunun Auto-review Denials picker'ini actigini ve ayni task'taki son retlerden yalniz bir exact eylem icin bir yeniden deneme izni verdigini acikliyor. Ret kaydi task basina en fazla 10 oge tutar. Yeniden deneme ayni context'te yapilir ve yine Auto-review'dan gecer; reviewer, kullanici override'inin izin verilemeyecegi bir ret sinifinda tekrar reddedebilir. Bu bir genel izin, repo `review_scope_secret_detected` override'i veya onay garantisi degildir. Erisim tarihi: 2026-11-02.

Bu calisma ortami interaktif Codex TUI slash-command kontrolu sunmadigindan `/approve` calistirilmadi ve picker'daki retler incelenmedi. Kullanici ayni TUI'de komutu acarsa yalniz tam bagimsiz kaynak incelemesi eylemini secmeli; o kayit listede yoksa ret uretmek veya baska islemi secmek yerine durmalidir. Bu yol kullanilsa bile yerel Hades preflight'i ayri kalir.

### Gonderilmeyen Support taslagi

Kanal: help.openai.com sag-alt destek chat bubble.

Baslik: Codex'te yetkili salt-okunur kaynak incelemesi icin tekrarlayan auto-review reddi.

Mesaj:

> Kurum/hesap kapsaminda yetkili, salt-okunur bir yerel kod guvenlik incelemesi icin GPT-6.1-Sol reviewer ve ayri Gemini Flash karsi gorusu planlandi. Model cagrisi baslatilmadi; onceki Codex inceleme isteklerinde kaynak teslimi/review kapisi reddedildi. Kaynak, prompt, secret veya bundle eklemiyorum. Bu bir auto-review reddini dolanma istegi degil. Platform kararinin bu yetkili inceleme turu icin degerlendirilmesini ve uygunsa, mevcut korumalari koruyarak hangi resmi inceleme/itiraz yolunun izlenebileceginin bildirilmesini rica ediyorum. Repository'nin kendi secret preflight'ini degistirme veya otomatik asma talebim yok.
>
> Urun/istemci: Codex Desktop / Hades MCP `run_codex_subagent` yolu. Istenen ana reviewer modeli: gpt-6.1-sol. Model gercekten calismadi, kaynak teslim edilmedi.
>
> Tam guvenlik mesaji: [onceki reddin kullanici arayuzunde gorunen tam metnini ekle; mevcut raporda sakli degil]. Tarih-saat/zaman dilimi: [orijinal kayittan ekle]. Request/completion ID: [varsa orijinal kayittan ekle]. Workspace/organization: [yalniz gerekiyorsa ve kullanici guvenle eklemek isterse].
>
> Redakte gorev ozeti: lokal bir repository'deki P2 prepared-edit/recovery, P3 ref-integrity ve ilgili approval/test zincirinin bagimsiz, salt-okunur guvenlik incelemesi. Inceleme paketi dosya/commit haritasi hazir, ancak kaynak gonderilmedi. Yerel classifier'in eski sinyalleri `high_entropy`, `known_signature` ve `mixed` olarak kaydedilmistir; tam tarihsel reviewScope/path eslemesi mevcut degil ve false positive sonucu cikarilmiyor.

Taslak gonderilmemistir. Orijinal tam mesaj, timestamp veya request ID raporlarda bulunmadigindan tahminle doldurulmamalidir. Support'tan cevap gelmesi repository preflight'i veya auto-review vetosunu kendiliginden kaldirmaz. Yeni kaynak teslimi ancak repository politika karari ve platformun acik, yetkili yonlendirmesi ayri ayri netlesirse degerlendirilebilir; mevcut gorevde teslim baslatilmaz.

## Inceleme kaydi

- Ana reviewer GPT-6.1-Sol: kaynak teslimi onceki preflight/auto-review engeli nedeniyle cagrilmadi.
- Gemini Flash karsi gorusu: source-bundle reviewScope destegi olmadigi ve reddedilen kaynagi alternatif yoldan tasima yasagi nedeniyle cagrilmadi.
- Model metadata, teslim edilen kapsam, bulgular ve karar: inceleme yapilmadigi icin yok.
- Onceki P2 yedi dosya incelemesi ve takip sonucu yalniz paket kapsaminda anlatildigi sinirlarla gecerli kalir; tam manifest ve commit bagi bilinmiyor.


## 2026-11-03 yerel takip: runProfile inceleme modu siniri

Onceki GPT-6.1-Sol incelemesi basariyla tamamlanmisti: requested/resolved model gpt-6.1-sol, sourceDeliveryStatus complete_to_cli, 10 dosya ve 152283 kaynak bayti, manifest SHA-256 dbd7ca846d7d7e9df23a2908f9364732c328f320d96ae3b68908a29201df45f8, strict review sonucu dogrulanmis, task completed, cikti complete, exit 0, bir adapter denemesi ve sifir retry. Maliyet ve CLI ici inference sayisi bilinmiyor. Bu inceleme bridge-runtime.js, memory.js, tests/review-source-manifest.test.js ve config/policy.json dosyalarini kapsamadi.

Incelemenin runProfile bulgusu yerel olarak dogrulandi. Public runProfile semasi mode alani icermedigi halde ortak refine bu alana bakiyordu. Handler host yapilandirmasindaki profil modunu cozup edit profillerini runProfileEdit'e gonderiyordu; executeControlledEdit icindeki provider istegi reviewScope/reviewEvidenceRequirement tasimiyordu. Bu yuzden required inceleme istegi edit yolunda sessizce karsilanmamamis olabiliyordu. Kaynakta runtime'in ayrica secret-preflight atlatmasi oldugu gosterilmedi; bulgu bunu iddia etmez.

Düzeltme `4d21a7e` kaynak durumunda handler'a eklendi: host profili edit ise `reviewScope` veya required evidence runtime dispatch'inden önce reddedilir. Şemada olmayan `value.mode` kontrolü ortak refine'dan kaldırıldı. Read-only review alanları runtime'a taşınır; review'suz normal edit yolu korunur. İlk test handler sınırını fake runtime ile kapsıyordu; `4d21a7e` sonrasında eklenen RUN-PROFILE-REVIEW-05 gerçek MCP handler ve gerçek runtime'ı güvenli sahte adapter ile birleştirir: read-only required review manifest/payload üretir, edit profili adapter çalışmadan reddedilir ve fixture değişmeden kalır. Hedefli dosya 5/5 geçti.

Son sabit kaynak durumunda `npm.cmd test` 1066 testte 1062 geçti, 4 Windows koşullu atlandı, 0 başarısız; zorunlu 5000-not benchmark'ı 9.7 saniyede geçti. Node v24.17.0 ve npm 11.13.0 kullanıldı; `TEMP`/`TMP` yalnız test sürecinde standart kullanıcı TEMP'sine yöneltildi. Sandbox içi ilk tam koşuda Git for Windows `sh.exe` `NtCreateDirectoryObject` için 0xC0000022 aldı ve worktree hazırlıkları zincirleme başarısız oldu; tekil worktree regresyonu sandbox dışında 1/1, ardından tam suite sandbox dışında geçti. `npm run verify` ve `npm run verify:ci` geçti. Verify mevcut codex sürüm kontrolü, DeepSeek health isteği ve persistent-memory köküne yalnız `fs.access` denetimi yaptı; DeepSeek health kullanılamadı, provider inference, capability probe veya Vault not okuma/yazma yapılmadı. MCP şeması değişmediğinden smoke tekrarlanmadı.

Önceki bağımsız Sol incelemesi yalnız 10 dosyalı, 152283 baytlık ve manifest SHA-256 `dbd7ca846d7d7e9df23a2908f9364732c328f320d96ae3b68908a29201df45f8` olan snapshot için tamamlanmıştır. `4d21a7e` içindeki handler düzeltmesi aynı `tools.js` dosyasının daha sonraki içeriğidir; `tests/run-profile-review-mode.test.js` ve gerçek runtime davranışını kapsayan son regresyon da o teslimde yoktu. `bridge-runtime.js`, `memory.js`, `tests/review-source-manifest.test.js` ve `config/policy.json` önceki 10 dosyalı teslimin dışındadır. Son doğal kaynak kapsamı için yerel preflight `review_scope_secret_detected/high_entropy` verdi; yeni kaynak teslimi yapılmadı ve ret aşılmadı. AST bilinmeyen identifier biçimli credential riski değişmedi. Disk AST ayarı unset, yerel loader false; kullanıcı Hades restart'ını bildirdi. Restart ve workspace identity operasyonel kanıttır, bağımsız revision/config attestation değildir.

## 2026-11-05 GPT-6.1-Sol incelemesi ve yerel takip

Yeni bir salt-okunur GPT-6.1-Sol incelemesi tamamlandı. requested/resolved model `gpt-6.1-sol`; kaynak teslimi `complete_to_cli`; 10 dosya ve 168911 kaynak baytı; manifest SHA-256 `0b4ce093218c412d10f9419d810166eb52055f0d42cdaab511b2d16b402dd902`; strict review doğrulandı; task tamamlandı, çıktı bütünlüğü complete, exit code 0, bir adapter denemesi ve sıfır retry. Kullanım ve maliyet alanları doğrulanmadığından bilinmiyor. İnceleme kapsamı `subagent-bridge/src/config.js`, `subagent-bridge/src/frontends/mcp/server.js`, `subagent-bridge/src/frontends/mcp/tools.js`, `subagent-bridge/src/services/review-source-manifest.js`, `subagent-bridge/src/services/review-source-permit-registry.js`, `subagent-bridge/src/services/review-source-syntax-classifier.js`, `tests/config.test.js`, `tests/mcp-tool-negative.test.js`, `tests/review-source-permit.test.js` ve `tests/syntax-aware-secret-classifier.test.js` idi. Bu manifest mevcut 10 dosyalık snapshot'ın kapsam kanıtıdır; kaynak commit'i için bağımsız revision attestation değildir. `bridge-runtime.js`, `memory.js`, `tests/review-source-manifest.test.js`, `config/policy.json`, P4 adaptörü ve `disposable-workspace.js` bu incelemede teslim edilmedi.

İnceleme üç kusur bildirdi: interpolasyonlu template sonrasındaki yorumların bağlamdan bağımsız taramada kaçabilmesi; hassas shorthand object property'nin dinamik hassas değer olarak sınıflandırılmaması; MCP-NEG-01'in unknown-key katılığını kanıtlamaması. Yerel inceleme ve sentetik regresyonlar ilk iki bulguyu üretim AST sınıflandırıcısında, üçüncüyü MCP araç kaydında doğruladı. Yorum taraması AST trivia aralıklarına bağlandı, hassas object-literal shorthand için mevcut `sensitive_dynamic_value` reddi uygulandı, MCP'ye strict Zod object şeması taşındı. Unknown-key testinde geçerli bir taban girdi kullanılıyor ve gerçek in-memory MCP istemcisi reddedilen istek için runtime çağrısının başlamadığını doğruluyor.

Değişiklik sonrası hedefli classifier/manifest/MCP testleri 39/39 geçti. Son tam `npm test`: 1083 toplam, 1079 başarılı, 4 Windows koşullu atlama, 0 başarısız; zorunlu benchmark 11.4 saniye. Standart kullanıcı TEMP/TMP'si yalnız test sürecine verildi. `npm run smoke` sentetik Vault ile; `verify` sentetik config/Vault ile; `npm run verify:ci` ve `git diff --check` başarılıdır. Bu görevde yeni kaynak teslimi veya model/provider çağrısı yapılmadı. Üç yerel düzeltme 2026-11-05 tarihli Sol snapshot'ından sonra olduğundan ayrıca bağımsız incelenmiş sayılmaz.

MCP public tool girişindeki unknown-key testi değişen girdiyi gerçek SDK istemcisinden geçirir; handler/runtime ve AST bulguları sentetik yerel kanıtla doğrulanmıştır. Bu sonuçlar kaynak teslimi, P4 adaptör yolu, bütün runtime akışı veya tüm proje için bağımsız denetim değildir. Bilinmeyen credential biçimli identifier riski ve önceki kapsam dışı dosyalar açık kalır.

## 2026-11-05 Güncel sekiz dosyalı kaynak preflight kaydı

Bu kayıt yerel preflight teşhisidir; bağımsız inceleme, kaynak teslimi veya platform değerlendirmesi değildir. HEAD 470351eed99bc1baaaf48c9dd4f0d9f7693a5ddd için seçili snapshot SHA-256 70fccce0161de9cd295a4aa7bb21f070be9b5d7226ea05d5d1433f67af608d02, ham kaynak toplamı 237.998 bayttır. Dosyalar ve boyut/hash bağları: subagent-bridge/src/frontends/mcp/server.js (27.774, 4c9dfd13434e5f95ea2719425f954a59ec17be57c3a378bdb76311b0d41b54ef); subagent-bridge/src/frontends/mcp/tools.js (24.956, b826614eb710b248bfc97f10135570170aaf28b942fe4c40b118bfb20c1edda0); subagent-bridge/src/services/review-source-manifest.js (29.102, 683a7a2fd83a5a33fac852da4a9be693b90fb1874ff3605cd815c600e22f2969); subagent-bridge/src/services/review-source-syntax-classifier.js (15.017, 7b64a8b12aa3c741900694b6216a99ff32636723a86a5621930fb967463320d9); subagent-bridge/src/memory.js (86.058, cd041302b69e3ed68cc6246e9b2d24b7065473d875a025c570da5dd671393646); tests/mcp-tool-negative.test.js (9.008, 090ed3c1f6f8d787657dd41ea3774dcf7908f70412851355853fd458ae8f1626); tests/review-source-manifest.test.js (33.820, 4b172d5ca1d02ad7ad37b2ab04c0de79fdd1c4980ecbf04bf24f13fbd3aaad64); tests/syntax-aware-secret-classifier.test.js (12.263, 336fa102b140c9a8a48fba86f409702668a0c9d627fd8b468c42553dbb7ec235).

Varsayılan sınıflandırıcı ilk olarak tools.js içindeki iki high_entropy identifier eşleşmesinde blocked verdi. Yerel AST karşılaştırması bu identifier engelini kaldırdı; bu, identifier biçimli bilinmeyen credential riskini genel olarak dışlamaz. memory.js ve iki gerekli test dosyası AST karşılaştırmasında da engelli kaldı. memory.js sonucu sensitive_dynamic_value sınıfındadır; test dosyalarında bilinen imza eşleşmeleri amaçlı sentetik test verisiyle tutarlıdır. Bu sınıflar gerçek kullanıcı credential’ı bulunduğunu kanıtlamaz; test dosyası bağlamı da teslim muafiyeti oluşturmaz. Dosya başı kontrollerin tamamlanması aggregate bundle kontrolünün geçtiğini göstermez. Serileştirilmiş payload ölçülmedi ve bundle sınırı ilk ret nedeniyle çalıştırılmadı. Kaynak payload oluşturulmadı, adapter attempt sayısı sıfırdı, platform Auto-review değerlendirilmedi, AST ayarı unset/kapalı kaldı. Bu kayıtta kapsam bölme veya preflight istisnası önerilmez.

## 2026-11-07 yerel kaynak kapsamı yeniden doğrulaması

Bu not mevcut bağımsız inceleme kaydını günceller; kaynak teslimi veya model incelemesi değildir. Repository `main` dalında `527ca7e4ea6a550057259f6660bbd4b85ce99da6`, çalışma ağacı temiz ve yerel `origin/main` referansına göre 31 commit ileridedir. Fetch yapılmamıştır. Varsayılan AST politika değeri takip edilen `config/policy.json` içinde kapalı kalmıştır; bu değer canlı runtime attestation'ı değildir.

Önceki üretim review-source diagnose kaydındaki üç doğal kapsam, mevcut dosya boyutu/hash girdileriyle aynı sıralı manifest algoritmasında tekrar bağlanmıştır. Launcher kapsamında 3 dosya ve 21.573 kaynak baytı `81b227f38e86b3ad691593239448fc4844c523b6343892d9f5da17a48682e4ad`; Codex proje config güncelleyicisi kapsamında 8 dosya ve 82.454 bayt `27e6a0fa8e64598150bc7ab15e974999503872f72596a635bcc7708ff79f0217`; yerel doğrulayıcı kapsamında 5 dosya ve 129.912 bayt `e8fc60607e450e39d177f5cd6c2bd4213bf7043711eac437e152b106c1407ae3` snapshot özetleriyle eşleşmiştir. Bunlar dosya içeriklerinden türetilen yerel snapshot bağlarıdır; gizlilik veya çalışan runtime attestation'ı değildir.

Önceki preflight kararları değişmemiştir: launcher scripti ve testi temiz, destek helper'ı `high_entropy` nedeniyle engelli; config updater grubu `mixed`, updater testi ve child-process fixture'ı engelli; verifier grubunun üretim scriptleri temiz, test kaynağı `high_entropy` nedeniyle engellidir. Her grupta preflight ilk engelde durduğundan serileştirilmiş bundle boyutu kontrol edilmemiştir. Bu turda diagnose tekrar çalıştırılmadı; kaynak teslimi ve payload oluşturma denenmedi, adapter denemesi sıfır, provider başlatılmadı, platform Auto-review değerlendirilmedi. GPT-6.1-Sol için requested/resolved model yoktur; inceleme çağrısı yapılmamıştır.

Kaynak incelemesi dışında genel bir kamuya açık yöntem danışması da yapılmamıştır: mevcut `run_codex_subagent` sözleşmesinde araçları devre dışı bırakan veya trusted workspace'i erişilemez kılan bir seçenek yoktur; Codex CLI yalnız-okunur sandbox ile başlasa da repository kaynaklarını okuyabilir. Bu nedenle kaynaksız danışma isteğinin workspace'e erişmeyeceği teknik olarak garanti edilemez. Tarihsel aralıklı doğrulama hatasının nedeni için yeni kanıt veya hipotez oluşmamıştır; test tekrar çalıştırılmamış ve hata çözülmüş sayılmamıştır.

## 2026-11-07 redakte eşleşme izi ve kaynak kökeni

Bu ek, beş dosyalık engelli kapsam için aynı güvenli bounded-reader ve mevcut production matcher'ları kullanan yerel tanısal izdir. Her dosyanın SHA-256/byte boyutu tek okunan kaynak snapshot'ına bağlıdır. Rapor aday değeri, kaynak alıntısı, symbol adı veya credential parçası taşımaz. Hash ve fingerprint'ler gizlilik garantisi değildir.

Snapshot: HEAD `ff213b1efe2c78e99a7f9fb5352dfb3a7f5b59e8`; seçili dosyaların ham kaynak toplamı 133904 bayt; sıralı production manifest core özeti `2cdf11e9159527354a562d90b6b8fd76e50547ed11d10baf07dae962ed395dad`. Diagnose sonucu `decision=blocked`, `completeness=complete`, 5/5 dosya okundu, `sourceBytesComplete=true`, `snapshotBinding=complete_selected_scope_content_hash`; seçili dosyalar HEAD'deki içerikle aynı. İlk production ret aşamasında total/bundle-byte kontrolleri çalıştırılmadı. Dolayısıyla 133904 bayt ham kaynak toplamıdır; serialize payload boyutu ölçülmedi ve bundle limitinin geçildiği iddia edilmiyor. Diagnose yalnız takip edilen repository politika kaynağını kullandı, etkin Hades config'ini yüklemedi. Canlı runtime attestation'ı, kaynak teslimi veya platform incelemesi değildir.

Politika varsayılanı AST seçeneği kapalıydı. Her dosyadaki `productionAggregateEquivalent=true` mevcut classifier sonucu ile iz aggregate'inin eşit olduğunu gösterdi. 17 eşleşmenin 16'sı `high_entropy_token/high_entropy`, biri `credential_assignment/known_signature` sınıfındaydı. Adlar ve değerler bilinçli olarak rapordan çıkarıldı.

### Dosya ve iz bağları

- `tests/support/start-codex-launcher.js`: 5114 bayt, SHA-256 `9a4898e39ca8de9d2da5136f56e2936b5a8239a55364d49d9d2d872234259c8a`. İki eşleşme aynı 43 karakterlik Identifier symbolunun declaration/reference çiftidir; entropy 4.2664, grup `repeat-1`. İz fingerprint'leri: `e0bbc8a5f30925dca1e249d671b4d9467cb071a7485dd713998c20ba8ce1586c`; `3b323e1f07b87c80f9c87e7625d56a0702b0496b176c50f2e8c69e3f301c7958`. Konumlar: L14:C9 chars 466-509 / bytes 466-509; L17:C10 chars 869-912 / bytes 869-912. Yerel AST karşılaştırması bu dosyayı temiz saydı. Bu, kaynak-sembolü kaynaklı legacy high-entropy yanlış pozitifine davranışsal kanıttır; identifier biçimli bilinmeyen credential riskini genel olarak dışlamaz.
- `scripts/codex-project-config.js`: 42187 bayt, SHA-256 `07d94fbd0664b0d2faf8a249bbfdc081deb5f90de52f90137d95f0fd45f19227`. L294:C11 chars 11162-11187 / bytes 11162-11187, 25 karakter, `credential_assignment/known_signature`, `VariableDeclaration/other_syntax`, fingerprint `bd2ad01254a028497f2e19181eb45ef9129f5b160185e4d15778e5e70deab7ed`. AST düğüm kesitinde string/regex/template literal değil; ThisKeyword, Identifier ve property/call ifade düğümlerini kapsıyor. L907:C23 chars 38835-38867 / bytes 38835-38867 ve L987:C10 chars 41979-42011 / bytes 41979-42011, iki 32 karakterlik high-entropy Identifier symbolu, entropy 4.2264, grup `repeat-1`; fingerprint'ler `a92ef40201d3ab1957689b3cb933ea1cacc1865a029ddfc794870747ddf3c22b` ve `d6b8d013de3c044cda5559b862970250476424921e17d7f965cc4da7daa7a614`. Yerel AST sonucu blocked, iki finding. İlk sinyal kaynak ifade bağlamıyla açıklanabilir, ancak güvenle temiz olarak sınıflandırılmadı.
- `tests/codex-project-config.test.js`: 21391 bayt, SHA-256 `6122b4c944d16eb3f3f4492af378ad65e39ee9c126b2569e02a30c533b3d2567`. Aynı 32 karakterlik imported Identifier symbolu import yerinde ve beş kullanımında görülüyor; hepsi entropy 4.2264 ve `repeat-1` grubunda. L13:C3 chars/bytes 449-481 fingerprint `dfa71dd22928af073f59192abb23d863556d4d98044d837cc3defa1caab0b1dc`; L160:C24 chars 6858-6890, bytes 6859-6891 fingerprint `6ee2077bf93c5f7d0cd1305308e38f8ad186c2152b945785644ebae3b9627712`; L231:C24 chars 10471-10503, bytes 10472-10504 fingerprint `c0b14a9006eeb40864e42cc5580e18cfb608ea06a073d4d5c4909860324b5dbd`; L245:C24 chars 11280-11312, bytes 11281-11313 fingerprint `ef3c5201e1c9bdb7e8f43fdb3f8088c6fd26f8de89844745e8fdaa8539348a60`; L258:C24 chars 12016-12048, bytes 12017-12049 fingerprint `d1cec787f612317534d9f358987358eb98deb1d2ab9283595895181fa6289071`; L268:C24 chars 12619-12651, bytes 12620-12652 fingerprint `931dd694a7c8f719abf4a48d462ac829db5e5374238e6e750df327052836adc2`. Bu aynı kaynak symbolunun tekrarı olarak açıklanır; dosyanın kendisi AST karşılaştırmasında bir finding nedeniyle blocked kaldı.
- `tests/fixtures/codex-project-config-process.js`: 6962 bayt, SHA-256 `26fb6574c81975b6230fe48fe261f38e493f7c6d853173735e4495e9bc91679d`. L5:C44 chars/bytes 230-262 ve L180:C26 chars/bytes 6022-6054 aynı 32 karakterlik import/use Identifier symboludur; entropy 4.2264, `repeat-1`. Fingerprint'ler `6fe131f10a18d28c8e8771fad1cde4f0421a738c5000d0cc513086593c2d6a1b` ve `b68b43b64030180025fd1ba9457497750ddc48a131abfc5a2b3eebd32ca9c286`. Yerel AST karşılaştırması temiz sonuç verdi; bu sadece bu dosya ve bu host-dışı yerel karşılaştırma için geçerli.
- `tests/verify-local.test.js`: 58250 bayt, SHA-256 `4f638425bec0eedc92dc727cc15bb624e66f7dfeb615ea6fd9f8300f0d2be9ef`. L299:C6 chars 12230-12271 / bytes 12273-12314, uzunluk 41, entropy 4.2994, fingerprint `982d421edb8ecab4f989b84609de4a85f4b03ad330466fa69092885db75d04e2`; L300:C6 chars 12279-12319 / bytes 12322-12362, uzunluk 40, entropy 4.3653, fingerprint `11d5a363d1093bdd72a7b6369f42e5faeae4`;L301:C6 chars 12327-12366 / bytes 12370-12409, uzunluk 39, entropy 4.3875, fingerprint `c5aabb22ce835e6035fb8eee30ad6ee1442ae83801f2006efeefe76c1c5780c9`; L483:C28 chars 22442-22497 / bytes 22540-22595, uzunluk 55, entropy 4.4245, fingerprint `17369e6dc9c930c19a20d37fc523a8f037da032e81b5bdba420aa11fd3ece6e4`. Dördü de test callback'leri içindeki string literal girdileridir; ilk üçü tek testte bir fixture dizisinin elemanları olarak döngüde tüketilir, dördüncü yerel test girdisidir. Güvenli kaynak yapısı bunları sentetik test verisi olarak destekler. Yerel AST yine de dört literal için de review required/blocked döndürdü; muafiyet uygulanmadı.

### Eşleşme kökeni ve belirsizlik sayımı

Bu sayım occurrence kökeninin kaynak yapısından açıklanıp açıklanmadığını, bunun tek başına güvenli temizlik kararı üretmediğini ve gerçek credential ihtimalinin hangi sınıflarda açık kaldığını birbirinden ayırır. “Köken unresolved” yalnız eşleşmenin sözdizimsel veya fixture kaynağının belirlenemediği durumu sayar. “Güvenlik disposition unresolved” ise eşleşmenin bu kanıtla güvenle temiz sayılamadığını belirtir; dosya düzeyinde preflight engelini kaldırmaz.

- `tests/support/start-codex-launcher.js`: 2/2 eşleşme high-entropy Identifier olarak `ordinary_source_symbol` kökenine bağlandı; kökeni unresolved 0. Güvenlik disposition unresolved 2, çünkü identifier biçimli bilinmeyen credential olasılığı genel olarak dışlanmıyor.
- `scripts/codex-project-config.js`: 2 high-entropy Identifier ve 1 known-signature eşleşmesi. İki identifier kaynak sembolü olarak açıklandı; üçüncü eşleşme statik literal değil, dinamik property/call sözdizimi bağlamında. Kökeni unresolved 0; güvenlik disposition unresolved 3. Bu, eşleşmenin gerçek credential olduğunu göstermez ve güvenli temizlik kanıtı da değildir.
- `tests/codex-project-config.test.js`: aynı import/use Identifier için 6/6 high-entropy occurrence yapısal olarak açıklandı; kökeni unresolved 0. Güvenlik disposition unresolved 6, çünkü identifier biçimindeki credential ihtimali bu analizle genel olarak elenemez.
- `tests/fixtures/codex-project-config-process.js`: import/use Identifier için 2/2 high-entropy occurrence yapısal olarak açıklandı; kökeni unresolved 0. Güvenlik disposition unresolved 2; AST karşılaştırmasının dosyayı temiz bulması yalnız yerel karşılaştırma sonucudur.
- `tests/verify-local.test.js`: 4/4 high-entropy string occurrence sentetik test girdisi üretim/kullanım zinciriyle açıklandı; kökeni unresolved 0, güvenlik disposition unresolved 0. Eşleşmeler bilerek credential-benzeri test girdileridir ve üretim preflight'ında engelli kalır.

Dolayısıyla 17 eşleşmenin sözdizimsel/köken açıklaması tamamdır; bu sayı 17 eşleşmenin de güvenle temiz olduğu anlamına gelmez. On üç identifier/dinamik occurrence için güvenlik temizliği kanıtlanmamıştır. Dört test literal'i sentetik olarak kanıtlanmıştır, fakat muafiyet uygulanmamıştır. Gerçek credential ihtimali dosyaların kalan içeriği veya eşleşmeyen identifier biçimleri bakımından genel olarak dışlanamaz.

### Sınıflandırma ve sınırlar

- Davranışsal olarak doğrulanan kusur sınıfı: legacy matcher yüksek entropili Identifier symbollarını credential literal'i gibi blokluyor. Yerel AST karşılaştırması iki kaynağı temiz, bir import symbolu içeren testi bloklu, farklı bir import/use fixture dosyasını temiz verdi. Bu, aktif politika değişikliği veya kaynak gönderme kararı değildir.
- Sentetik test içeriği olduğu kaynak yapısıyla doğrulanan sınıf: verify-local testindeki dört high-entropy literal. Sentetik olmaları mevcut ret politikasını değiştirmez.
- Kaynak bağlamıyla açıklanan fakat temiz sayılmayan sınıf: config güncelleyicideki known-signature eşleşmesi; eşleşme dinamik property/call ifadesini kapsar, literal değer kanıtı değildir. Geriye kalan symbol eşleşmeleri de yapısal olarak açıklanır fakat identifier-biçimli credential olasılığı kabul edilmiş risk olarak kalır.
- Gerçek credential: bu beş dosyada izlenen span'larda gerçek credential değeri olduğuna dair kanıt yoktur. Aynı zamanda tüm dosyalarda, eşleşme dışında veya bilinmeyen identifier biçiminde gerçek credential olmadığı sonucu çıkarılamaz. Bu nedenle gerçek credential ihtimali genel olarak dışlanmamıştır.

### Politika ve doğrulama kanıtı

- Varsayılan legacy preflight beş dosyanın hepsini blocked sınıflandırdı; ilgili kontrollerde AST varsayılanı false idi. Trace aggregate'i her dosyada production aggregate ile eşleşti; yeni iz üretim ret kararını değiştirmedi.
- Aynı byte snapshot üzerinde, yalnız yerel API seçeneğiyle yapılan AST karşılaştırmasında `tests/support/start-codex-launcher.js` ve `tests/fixtures/codex-project-config-process.js` temiz; `scripts/codex-project-config.js` iki finding, `tests/codex-project-config.test.js` bir finding, `tests/verify-local.test.js` dört finding nedeniyle blocked kaldı. Bu Hades canlı preflight'i veya AST ayarının etkinleştirilmesi değildir.
- Trace snapshot'ında matcher sinyallerinin tamamlığı ve başlangıç politikasıyla karar eşdeğerliği hedefli testlerle kontrol edildi. Yeni repeat-group regresyonu tekil eşleşmeleri gruba koymuyor, yalnız tam eşleşen span'ları aynı grupta topluyor. Kaynak sınıflandırıcı kararları, eşikler, imzalar ve default-off politika değişmedi.
- RMT-08 BOM önekli sentetik kaynakta karakter aralığı, UTF-8 byte aralığı, AST sınıfı ve redaksiyonun tutarlılığını doğruladı; hedefli iz testi grubu 46/46 geçti. Bu regresyon yeni trace davranışını doğrular, tarihsel dosya eşleşmelerini yeniden ölçmez.
- İlgili hedefli test grubu 45/45 geçti. İlk sandbox koşusunda Windows workspace-rebinding testi geçici dizin EPERM verdi; aynı test standart kullanıcı TEMP'iyle normal izin yükseltmesinde geçti ve son hedefli koşu aynı koşulda 45/45 başarılı oldu.
- Son kaynak durumunda `npm run verify:local` başarılı: verify-ci geçti; seri tam test 1240 başarılı, 5 Windows koşullu atlama, 0 başarısız; zorunlu 5000-not benchmark 16.429 saniye; sentetik MCP smoke ve sentetik config/Vault verify geçti. Provider credential'ları alt süreçlere aktarılmadı, sentetik geçici kök kaldırıldı, source snapshot koşu boyunca değişmedi. Gerçek Vault, provider, model, Hades veya kişiye ait config kullanılmadı.

Bu sonuç yerel preflight'in neden identifier ve hassas kaynak bağlamlarını engellediğini daha kesin gösterir. Kaynak teslimi veya bağımsız model incelemesi yapılmamıştır; AST ve default policy kararı değiştirilmemiştir. Tarihsel launcher aralıklı test hatasının nedeni bu görevde araştırılmadı ve çözülmüş sayılmadı. İlgili beş dosya için serialize edilmiş bundle sınırı hâlâ kontrol edilmemiştir, çünkü production preflight ilk retlerde durmuştur.

İz kapsamındaki AST türleri ayrıca şu şekilde doğrulandı: `tests/support/start-codex-launcher.js` içindeki iki eşleşme `Identifier/identifier`; `scripts/codex-project-config.js` içindeki iki eşleşme `Identifier/identifier`, kaynak-imza eşleşmesi `VariableDeclaration/other_syntax`; config testi ve child-process fixture'ındaki import eşleşmeleri `ImportSpecifier/other_syntax`, kullanımları `Identifier/identifier`; verify-local testindeki dört eşleşme `StringLiteral/string` bağlamındadır. Eski matcher sınıfı ve AST bağlamı ayrı kaydedildi.

Tanı yürütme kaydı providerStarted=false, mcpReviewStarted=false, sourcePayloadCreated=false, sourceDelivery=not_attempted, personalConfigurationLoaded=false, vaultAccessed=false, securityOverrideAvailable=false, sourceDeliveryAuthorized=false ve platformAutoReviewEvaluated=false gösterdi. Bundle kontrolü ilk kaynak retleri nedeniyle çalışmadı; bu iz yalnız yerel kaynağı açıklama amacı taşır.
