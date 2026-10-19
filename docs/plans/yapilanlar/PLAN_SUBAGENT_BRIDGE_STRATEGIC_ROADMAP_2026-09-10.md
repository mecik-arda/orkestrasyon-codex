# Subagent Bridge Strategic Roadmap

- Tarih: 2026-09-10
- Durum: WP1 (Antigravity + diger provider probe'lari), WP2 (envelope + kontrollu carrier onarimi ve kati web profilleri), WP3 (fixture + canli olcum), WP4 (manifest + replay), WP5/WP5-B (approval sinirlari ve orkestrator onay kanali) ve WP6 (failure drill + SLO/error-budget) uygulandi; 515/515 test, verify, smoke, drill, replay, gercek DeepSeek pilotu ve p0/p2a/p2b gecti; 7 gruplu canli matris tum aday gruplari ve esikleriyle gecti (coverageComplete, modelsBound ve decisionReady true; promotionEligible true yalniz sinyaldir, otomatik rota veya dosya promotion'u yapilmaz); Sol kapanis denetimi APPROVED (0 kritik, 0 yuksek, 0 orta); kalan risk: URL'siz web icerigi icin carrier onarim siniri `webEvidenceRepair` bayragiyla denetlenir
- Kapsam: Guvenlik-oncelikli yerel MCP subagent bridge'inin provider yetenekleri, denetlenebilirligi ve karar kalitesini ilerletmek

## Yurutme Ozeti

- Piyasa arastirmasi, merkezi orkestratorun dar sozlesmeli worker'lara gorev vermesi ve worker sonucunu semayla sinirlamasi yaklasimini destekliyor.
- Projede strict sonuc semalari, controlled edit, workspace lock, retry, circuit breaker, cache ve redacted metrikler zaten bulunuyor. Bu plan bunlari yeniden yazmayacak.
- Oncelik, gercek provider davranisini health sonucundan ayirmak, web kaynakli guvenilmeyen baglami sinirlamak, karar kalitesini olcmek ve yuksek etkili eylemler icin operator sinirlarini netlestirmektir.
- Gemini Flash web bulgulari adaydir. Kaynak, satir, onem derecesi ve uygulanabilirlik ana orkestrator tarafindan kaynakta veya hedefli testte dogrulanmadan kesin kabul edilmez.

## Arastirma Girdileri

- Anthropic, Building Effective Agents: https://www.anthropic.com/research/building-effective-agents
- LangGraph, Multi-agent concepts: https://langchain-ai.github.io/langgraph/concepts/multi_agent/
- AWS Architecture Blog, Build resilient generative AI agents: https://aws.amazon.com/blogs/architecture/build-resilient-generative-ai-agents/
- Anthropic Cookbook agent patterns: https://github.com/anthropics/anthropic-cookbook/tree/main/patterns/agents
- AI Engineer talk, How We Build Effective Agents: https://ai.engineer/talks/D7_ipDqhtwk-effective-ai-agents

## Ilkeler

- Subagent sonucu karar degil, kaynaklandirilmis adaydir.
- Provider sagligi, model erisimi ve arac yetkisi ayri olculur; bir hata sinifi digerini kanitlamaz.
- Webden gelen metin guvenilmeyen girdidir. Prompt injection, yanlis kaynak ve eski bilgi icin karantina siniri korunur.
- Yuksek etkili eylemler, dar dosya listesi, strict sema, disposable workspace ve gereken yerde operator onayi olmadan ilerlemez.
- Yeni provider, varsayilan yazma yetkisi, `command(*)`, `--dangerously-skip-permissions` veya GLM fallback bu planin kapsami disindadir.
- Gemini Flash bulgulari yalniz aday/hipotezdir; kaynak, satir, onem ve uygulanabilirlik Sol, Terra veya hedefli yerel test ile dogrulanmadan karar gerekcesi olamaz.

## Is Paketi 1: Canli Provider Capability Probes

- Sorun: Surum kontrolu, model erisimi, web okuma ve yerel read-only arac erisimi ayni health alaninda temsil edilemez.
- Degisiklik: Her provider icin redacted capability probe sonucu tanimla. Ornekler: executable, temel model yaniti, public web read, workspace read, controlled edit uygunlugu.
- Guvenlik siniri: Probe secret, prompt, URL icerigi, workspace yolu veya kullanici verisi loglamaz. Mutasyon probe'u ana workspace disinda disposable alanda calisir veya tamamen devre disi kalir.
- Kabul kriteri: Antigravity health sonucu kurulum, model erisimi ve web-read yeteneklerini ayri durumlarda raporlar.
- Kabul kriteri: `permission_denied`, `authentication_failure`, `rate_limited` ve timeout durumlari birbirine donusturulmez.
- Durum: Antigravity icin uygulandi ve mevcut WP1 kapsami Sol tarafindan onaylandi; ayrica codex, claude_code ve opencode icin opt-in `check_provider_capability` probu (modelAccess, toolFreeResponse), capability failure sinif eslemesi, noktali model adi destegi ve redacted `live_observation` metriği eklendi; probe'lar gercek saglayici cagrisi yapar ve varsayilan olarak kapalidir.

## Is Paketi 2: Untrusted Web Evidence Envelope

- Sorun: Web arastirmasi yararli baglam saglar, ancak kaynak metni orchestrator veya edit akisi icin guvenilir talimat degildir.
- Degisiklik: Web kullanan subagent sonucunu strict ve surumlu bir semayla; canonical HTTP(S) URL hash'i, erisim zamani, sinirli alinti, guven seviyesi, verification status ve sabit `untrusted` isareti tasiyan bir envelope ile sar.
- Guvenlik siniri: Web sonucu tool cagrisini, model secimini, izin politikasini, dosya yazimini veya fallback'i dogrudan degistiremez.
- Guvenlik siniri: Raw HTML/DOM, tam sayfa govdesi, script, tool output, prompt, model ic muhakemesi, HTTP header, cookie, authorization verisi, indirme govdesi ve yonlendirme zinciri envelope, metric, manifest, cache anahtari veya eval kaydina giremez. Yalniz boyut ve adet sinirli, acikca guvenilmeyen `excerpt` alintilari tutulabilir; bilinmeyen alanlar reddedilir.
- Kabul kriteri: Prompt injection benzeri web metni karantinaya alinir ve ana orkestrator acik dogrulama yapmadan karar gerekcesi olmaz.
- Kabul kriteri: Redacted metrikler URL, prompt, workspace yolu veya tam web icerigi saklamaz.
- Kabul kriteri: Envelope icindeki hicbir alan tool, model, izin, fallback veya edit parametresine kontrol verisi olarak akamaz; bu akis adversarial testlerle gosterilir.
- Durum: Strict envelope semasi, canonical URL hash'i, credential/hassas excerpt reddi, PEM ve parcalanmis PEM kontrolleri, benign query adlari, adversarial URL/Unicode ve excerpt sinirlari ile pasif `subagentResult.webEvidence` alani uygulandi; Antigravity read-only web rotasinda strict JSON tasiyici, web kullanilmadiginda `webEvidence: null` varyanti ile zorunlu; provider'in dogrudan evidence adayi ve tasiyici runtime'da fail-closed envelope'a normalize ediliyor; URL'siz secret/web icerigi, cache'e yazilmadan once reddediliyor; tool/model/permission/fallback/edit kararlarina etkisizlik runtime testleriyle kanitlandi. Mixed ve malformed percent encoding, wrapper disi sonuc ve runtime/MCP health projection kontrolleri de eklendi. Sol WP2 kapanisini onayladi. Antigravity varsayilan read-only rotasinda kontrollu duz metin onarimi eklendi: URL/secret/markup icermeyen tasiyicisiz yanit `webEvidence: null` ve `metrics.webEvidenceRepair: true` ile kabul edilir; acik `webEvidenceRequired: true` katı carrier ister. Web arastirma profilleri (`web_research_fast`, `web_research`) yapilandirmadaki `webEvidenceRequired: true` ile katı carrier moduna baglandi; istege bagli `orchestration.webIntentHeuristics` acildiginda web niyeti tasiyan prompt veya kaynakca/atif kalibi iceren duz metin onarilmaz. Kalan risk: URL'siz web icerigi sezgiler kapaliyken ayirt edilemez; onarim bayragi sonuc, metrik, manifest ve replay gorunurlugu ile denetlenir.

## Is Paketi 3: Task-to-Model Fit Evaluation

- Sorun: Model secimi kurallari var, fakat gercek kalite, maliyet ve sure etkisi periyodik olarak olculmuyor.
- Degisiklik: Temsilci gorev setiyle aday uretme, kaynakli analiz, strict sema uyumu, hata siniflandirma ve controlled edit hazirligi degerlendirmesi ekle.
- Guvenlik siniri: Eval fixture'lari secret, gercek hedef, kullanici verisi veya yazma yetkisi icermez.
- Kabul kriteri: Gemini Flash aday uretimi; DeepSeek Pro yerel analiz; Luna/Terra implementasyon; Sol kritik denetim rolleri icin olculebilir kalite ve maliyet kaydi uretilir. Gemini grader, onay kapisi veya nihai onceliklendirici olamaz.
- Kabul kriteri: Her gorev sinifi icin surumlu fixture setinde en az uc tekrar; schema-pass, kaynak dogrulugu, hata siniflandirma dogrulugu, sure ve maliyet esikleri onceden tanimli olur.
- Kabul kriteri: Model terfisi veya varsayilan rota degisikligi tek bir anekdot yerine tekrar edilebilir esiklere dayanir.
- Kabul kriteri: Rota degisikligi gercek promotion, kullanici verisi veya secret icermeyen fixture'larla yapilir ve bagimsiz Sol/Terra incelemesinden gecer.
- Durum: Surumlu, secret/gercek hedef/kullanici verisi icermeyen fixture evaluator; aday-gorev politikasi; grup basina en az uc tekrar; schema-pass, kaynak dogrulugu, hata siniflandirma, sure, maliyet ve controlled edit readiness esikleri; redacted model-fit metriği ve CLI uygulandi. Provider calistirmayan synthetic baseline `promotionEligible: false` karariyla rota veya promotion degistirmez. Canli mod eklendi: `runLiveModelFitEvaluation` gercek saglayici kosularini `live_observation` olarak olcer, `coverageComplete` tum gorev sinifi ve aday gruplari kapsanmadan `promotionEligible` true olamaz; aday-hedef ve aday-calisma modeli bagi (`gemini_flash`/`gemini_flash`, `deepseek_pro`/`opencode`/`deepseek/deepseek-v4-pro`, `sol`/`codex`/`gpt-5.6-sol`) tam eslesmeye zorlanir; strict sema icin `jsonKeys`, her anahtar icin `jsonShape`, `jsonExact` ve ek alan politikasi, kaynakli analiz icin `sourceMarker`, controlled edit readiness icin `edit` sozlesmesi zorunludur; metrik kaydi `coverageComplete` tasir ve ozetleyici son kaydin durumunu esas alir; `npm run model-fit:live` gercek kosu yapar. Olculemeyen maliyet `costUsd: null` ve `costObservation: not_observable|partial` ile temsil edilir; maliyet esigi yalniz tam gozlemde uygulanir ve eksik gozlem diger esikleri engellemez. Saglayici CLI'lari imzali model kimligi bildirmedigi icin raporlanan `boundModel` yapilandirilmis baglama degeridir ve `identityAssurance: configured|unresolved` ile etiketlenir; saglayici tarafinda model degisimi tespit edilemez ve promotion kapisi bu sinirla belgelenmistir. Canli edit readiness deepseek_pro icin `runDeepSeekEditPilot`, luna/terra icin runtime-içi `runProfileEditPilot` (promote sabit false, fallback yok, disposable alan) ile olculur; codex pilotunda sure gercek olculur, edit pilotu maliyeti bridge sonucunda raporlanmadigi icin maliyet boyutu 0 kabul edilir ve maliyet esigi bilgilendiricidir.

## Is Paketi 4: Redacted Run Manifest ve Replay Siniri

- Sorun: Metrikler maliyet ve sonuc ozetini tasir, ancak operatorun bir karar zincirini secret veya prompt saklamadan anlamasi icin tutarli manifest siniri gerekir.
- Degisiklik: Her tamamlanan run icin backend, requested/resolved model, access mode, failure class, capability sonucu, retry sayisi, cache durumu ve artifact hashleri iceren redacted manifesti mevcut `execution_metric_v2` writer'inin explicit allowlist ve surumlu projection'i olarak tanimla; eksik alanlari ayni writer'in surumlu v2 extension'iyle ekle, ayri ve paralel telemetry writer olusturma.
- Guvenlik siniri: Manifest raw prompt, tool output, web icerigi, workspace yolu, gorev kimligi veya secret tasimaz. Replay yeni bir provider cagrisi baslatmaz; yalniz kayitli karari goruntuler.
- Guvenlik siniri: Model ve provider bilgileri mevcut hash/allowlist sinirlari disinda yeni raw alan olarak yazilmaz; hashler gereksiz iliskilendirilebilirlik olusturmayacak sekilde mevcut policy ile uyumlu tutulur.
- Kabul kriteri: Basarili, rate-limited, permission-denied, cancel ve schema-failure akislari ayni manifest semasini uretir.
- Kabul kriteri: Manifest okuma, mevcut recent-runs ve metrics gizlilik sinirlariyla uyumludur.
- Kabul kriteri: Replay sirasinda provider veya adapter cagrisi sayisi sifirdir; forbidden-key sentinel testleri prompt, output, URL, workspace, task/execution kimligi ve secret yoklugunu dogrular.
- Durum: Uygulandi. `execution_metric_v2` manifestVersion 2, requested/resolved model hash'leri, accessMode, capability, artifactHashes ve webEvidenceRepair alanlariyla genisletildi; recent-runs strict semasi guncellendi; `subagent-bridge/src/replay.js` ve `npm run replay` kaydi strict manifest dogrulamasindan gecirip sifir provider cagrisiyla goruntuler; ayni-sema ve forbidden-key sentinel testleri eklendi.

## Is Paketi 5: High-Blast-Radius Approval Boundaries

- Sorun: Controlled edit teknik olarak sinirli olsa da operator onayi gerektiren yuksek etkili promotion kosullari acik bir politika halinde toplanmalidir.
- Degisiklik: Yeni dosya olusturma, coklu dosya promotion, policy/config degisikligi, dis servis etkisi ve geri alinmasi zor eylemler icin approval siniflari tanimla.
- Guvenlik siniri: Onay, prompttaki veya subagent sonucundaki istege gore otomatik verilmez. Onay gerekcesi redacted ve kullanici gorunur olur.
- Guvenlik siniri: Approval host tarafindan uretilen, tek kullanimlik, sureli ve `executionIdHash`, `changeSetHash` ve `approvalClass` degerlerine bagli bir belirtecle dogrulanir. Degisiklikler toplandiktan sonra ve promotion'dan hemen once yeniden siniflandirilir.
- Guncelleme (WP5-B): Belirtec akisi kaldirildi; onay sunucu-ornek registry'sinde tutulan `approvalRequestId` ve binding (executionIdHash, changeSetHash, approvalClass, workspaceHash, sourceStateHash) uzerinden yurutulur.
- Kabul kriteri: Yeni dosya, coklu dosya, `config/` veya policy degisikligi, dis servis etkisi ve geri alinmasi zor eylemler onaysiz promotion yapmaz; dusuk etkili tek mevcut dosya editi gereksiz ek onaya takilmaz.
- Kabul kriteri: Onaysiz promotion, replay veya subagent sonucundan turetilmis sahte onay ve TOCTOU degisikligi testlerle reddedilir.
- Durum: `approval-boundary` siniflandiricisi; degisim kumesi hash'i; host uretilmis sureli, tek kullanimlik, execution, canonical workspace ve kaynak durumu hash'ine bagli approval token'i; host-side approval API; yeni dosya promotion'inda approval gate ve replay/mismatch testleri uygulandi. Dusuk etkili tek mevcut dosya promotion'i korunurken yuksek etkili promotion onaysiz fail-closed olur. Son denetim turunda birincil failure sinifinin cleanup hatasinda korunmasi, cleanup durumunun bagimsiz tasinmasi, preview/approval-pending/cleanup kombinasyonlarinin sema ayrimi, edit kilidinin kaynak fingerprint oncesine alinmasi ve tuketim oncesi rehash, promotion'un islem butunluklu hale getirilmesi (hazirlik, rename, dogrulama ve rollback yollarinda gecici dosya temizligi, bagimsiz rollback, kurtarma artifaktlarinin bilincli korunmasi), tuketim oncesi rehash istisnasinin yapilandirilmis `approval_invalid` sonucuna cevrilmesi, saglayici hatasinda `approvalRequired` sizintisinin kaldirilmesi ve fixtureVersion metrik deseninin degerlendirme semasiyla hizalanmasi uygulandi; 454/454 test, `npm run verify`, `npm run smoke` ve gercek DeepSeek MCP pilotu gecti. Kalan kisitlar: Antigravity read-only carrier uyumsuzlugunda `web_evidence_invalid` fail-fast ve onay akisinin MCP yuzeyinden erisilemezligi WP5-B karariyla ele alinir.

## Is Paketi 5B: Orkestrator Onay Kanali ve Saklanan Prepared Edit

- Sorun: Self-approval bulgusu uzerine public onay araci kaldirildi; MCP istemcisi olan ana orkestrator yuksek etkili edit'leri hic onaylayamiyor. Ayrica onayli tur saglayiciyi yeniden kosturdugundan `changeSetHash` eslesmesi LLM nondeterminism'i ile kirilgan.
- Karar: Onay kanali ana orkestrator oturumuna baglanir; kullanici bu yonu onayladi ve tasarim Sol ile kararlastirildi.
- Degisiklik: Onay araclari yalniz orkestratora ozel bridge orneginde ve tam degerli baslangic bayragiyla kaydedilir; subagent ortamina bayrak veya OpenCode config override degiskenleri aktarilmaz.
- Degisiklik: Onay registry'si modul-global degil sunucu ornegi kapsamindadir. Yalniz ayni oturumda gozlenen `approval_required` sonuclarindaki execution, changeSet, canonical workspace ve kaynak durumu hash'lerine tahmin edilemez `approvalRequestId` ile token verilir; serbest hash ile token uretilemez.
- Degisiklik: Onay sonrasi saglayici yeniden calistirilmaz. Ilk turda secret taramasindan gecmis kesin degisiklik bellek icinde sinirli TTL ve boyutla saklanir; onayda workspace kilidi altinda kaynak, link ve path kontrolleri tekrarlanir, kesin baytlar mevcut atomik promotion/rollback mekanizmasiyla uygulanir ve bayt bazinda dogrulanir. Kaynak degisirse kayit invalidated edilir ve yeniden preview istenir.
- Degisiklik: Sinif politikasi uygulanir. `low_impact` onaysiz uygulanir; `new_file` ve `multiple_files` orkestrator tarafindan onaylanabilir; `policy_config`, `external_service` ve `irreversible` orkestrator tarafindan onaylanamaz, insan onayi mekanizmasi dogrulanana kadar fail-closed kalir. Siniflandirici manifest, CI, ajan, MCP ve policy dosyalarini kapsayacak sekilde genisletilir.
- Guvenlik siniri: Disposable OpenCode yapilandirmasinda subagent-bridge MCP girdisi kapatilir ve approval araclari deny edilir; provider ortami approval bayragi ve config override degiskenlerini tasimaz; pending icerik, token ve approval kimligi diske, checkpoint'e, loga ve metriğe yazilmaz; restart pending kayitlari gecersiz kilar; race korumasi icin iki eszamanli onaydan yalniz biri `pending` durumundan cikar.
- Guvenlik siniri: MCP elicitation tek basina zorunlu guvenlik kapisi yapilmaz; OpenCode `ask` izni yalnizca destekleyici katman olarak degerlendirilir ve auto-approve durumu sunucu tarafindan dogrulanamazsa hassas siniflar icin ayri arac kaydedilmez.
- Kabul kriteri: Bayrak yokken veya ayri subagent bridge orneginde approval araci tool listesinde bulunmaz; bilinmeyen, baska workspace'e veya baska sunucu ornegine ait, suresi dolmus veya tuketilmis kayit reddedilir.
- Kabul kriteri: Ikinci calistirmada farkli cikti ureten saglayici olsa bile onaylanan ilk baytlar uygulanir; provider yalniz bir kez cagrilir.
- Kabul kriteri: Provider hatasi, secret bulgusu, degisiklik olmamasi, path/link ihlali veya dogrulanamayan kaynak durumu onaylanabilir kayit uretmez.
- Kabul kriteri: Hassas siniflar orkestrator tarafindan onaylanamaz; pending icerik ve kayit kimligi checkpoint, metric veya loga yazilmaz; `approvalRequestId` yalniz onay icin MCP sonucunda doner.
- Durum: Uygulandi. `approve_prepared_edit` MCP araci yalniz `SUBAGENT_BRIDGE_ORCHESTRATOR_APPROVAL=1` tam degerli baslangic bayragiyla kaydedilir; registry sunucu ornegi kapsaminda bellek icinde TTL, adet ve toplam boyut siniriyla tutulur; onayda saglayici yeniden calistirilmaz, preview'da secret taramasindan gecmis kesin baytlar workspace kilidi altinda kaynak, link, path ve secret kontrolleri tekrarlanarak atomik promotion/rollback cekirdegiyle uygulanir; kaynak degisirse kayit invalidated edilir ve yeniden preview gerekir; yalniz `new_file` ve `multiple_files` orkestrator onayina aciktir, `policy_config`, `external_service` ve `irreversible` fail-closed kalir; siniflandirici manifest, CI, ajan, MCP ve policy dosyalarini kapsar; saglayici ortami approval bayragi ve config override degiskenlerini tasimaz, disposable OpenCode yapilandirmasi bridge MCP girdisini kapatir. 474/474 test, verify, smoke ve gercek DeepSeek MCP pilotu gecti; kapanis denetimi devam ediyor.
- Sol denetim turu duzeltmeleri (2026-09-13): kaynak dogrulama istisnasinda da kayit invalidated edilir; CI ve bagimlilik manifestleri (.gitlab-ci.yml, Jenkinsfile, azure-pipelines.yml, .circleci, package.json ve kilit dosyalari, Cargo.toml, pyproject.toml, manifest.webmanifest vb.) policy_config sinifina alindi; uygulama sonrasi backup cleanup hatasi `applied: true` ve `cleanup_failed` olarak yapilandirilmis doner; `changeSetHash` icerik SHA-256 ozetini kapsar ve saklanan icerigin ozeti store/consume sinirinda dogrulanir, Buffer'lar kopyalanir; `approvalRequestId` ve `approvalExpiresAt` birlikte zorunludur. Ikinci tur: onay ve dogrudan promotion yollari tek `capturePreparedChanges()` goruntusunden hash/sinif uretir ve ilk goruntuyle eslesmezse uygulamadan fail-closed doner; yabanci workspace erken binding kontroluyle meşru kaydi invalidate etmez; kesintiye ugramis promotion artifaktlari `detectRecoveryArtifacts` ile algilanir (tarama hatasi dahil) ve pending kayit korunarak `recovery_required` ile bloke edilir; UTF-8 kayipsiz tur donusumu dogrulanir ve gecersiz kodlama `pilot source/output encoding rejected` ile reddedilir. Ucuncu tur: uygulama oncesi ikinci recovery taramasi basarisiz olursa kayit `release` ile beklemeye doner ve kurtarma sonrasi ayni onay yeniden denenebilir. Sol kapanis denetimi APPROVED (kritik 0, genel saglik 10/10).
- Kisit: Cok dosyali uygulama islem-butunluklu handled-error rollback garantisi verir; surec cokmesi veya guc kesintisi kismi degisiklik ve kurtarma artifakti birakabilir. Kesintiye ugramis `.tmp` / `.tmp.backup` artifaktlari algilanirsa uygulama ve onay `recovery_required` ile fail-closed kalir; manuel kurtarma adimlari README'de tanimlidir ve kurtarma tamamlanana kadar yeni uygulama yapilmaz.

## Is Paketi 6: Provider Failure Drill ve SLO Takibi

- Sorun: Provider hata siniflari dogru olsa bile yeni CLI surumleri ve hesap durumlari gercek davranisi degistirebilir.
- Degisiklik: Sahte adapter testleriyle auth, quota, izin, bozuk sonuc, timeout, stale lock ve cancel senaryolarini periyodik failure drill olarak calistir. Canli probe yalniz kullanici onayli, dusuk maliyetli ve read-only olur.
- Guvenlik siniri: Failure drill retry ve maliyet butcesini asmaz; canli provider sonucunu test kaniti ile karistirmaz.
- Kabul kriteri: Her hata sinifi retryability, circuit davranisi, operator sonucu ve redacted metric ile testlidir.
- Kabul kriteri: Standart failure drill gercek ag veya provider cagrisi yapmaz; canli probe sonucu ayri `live_observation` sinifinda tutulur ve test kaniti sayilmaz.
- Durum: `tests/provider-failure-drill.test.js` auth, quota, izin, bozuk sonuc, timeout, stale lock ve cancel senaryolarini sahte adapterlerle; retryability, circuit, operator sonucu ve redacted metric boyutlariyla dogruluyor; `live_observation` kayit sinifi ve `liveObservations` metrik ozeti eklendi; `npm run drill` scripti tanimlandi. Kod yerel dogrulamadan gecti ve Sol WP6 kapanisini onayladi. Ayrica `subagent-bridge/src/services/slo-service.js` ile zaman pencereli availability, p95 gecikme ve error-budget (healthy/warning/exhausted/insufficient_data) hesaplanir; `npm run metrics` ciktisina ve regresyon testlerine baglandi.

## Uygulama Sirasi

1. Tamamlanan Is Paketi 1 capability sonucunu health sonucundan ayri tut.
2. Is Paketi 2 ile web arastirmasini strict, guvenilmeyen kanit envelope sinirina al.
3. Is Paketi 6 ile provider hata siniflari, retry/circuit davranisi ve capability gecisleri icin regresyon tabani kur.
4. Is Paketi 3 ile model secimini tekrarlanabilir fixture ve esiklerle olculebilir hale getir.
5. Is Paketi 5 ile promotion'dan hemen once high-blast-radius approval kapisini ekle.
6. Is Paketi 4'u mevcut `execution_metric_v2`, recent-runs ve controlled-edit akislariyla cakismaz, projection tabanli manifest olarak uygula.
7. Is Paketi 5B ile onay kanalini ana orkestrator oturumuna bagla; sunucu-ornek registry'sini, saklanan prepared edit akisini ve sinif tabanli yetkiyi uygula.

## Dogrulama Stratejisi

- Her is paketi once ilgili unit testleri, sonra `npm test` ile dogrulanir.
- Orkestrasyon veya config degisikligi sonrasi `npm run verify` calistirilir.
- MCP semasi degisirse `npm run smoke` calistirilir.
- Canli Gemini web probe'u kamuya acik, aracsiz veya salt-okunur tekil hedefle yapilir; rate limit ve auth sonucu basarisiz uygulama kaniti sayilmaz.
- Uygulama oncesi her aday Sol veya Terra ile kaynak ve mevcut davranis acisindan denetlenir.
- WP2 adversarial injection, WP5 onaysiz promotion ve WP4 sifir-provider-cagrili replay testleri rota degisikligi veya manifest yayini oncesinde gecmelidir.
- Uctan uca test durumu (2026-09-12): `npm test` 454/454, `npm run verify`, `npm run smoke` ve gercek DeepSeek MCP pilotu gecti; `p0:e2e`, `p2a:e2e` ve `p2b:e2e` dis OpenAI/Codex kota limiti nedeniyle kosulamadi ve limit sifirlaninca yeniden calistirilir.
- Gemini denetim turu (2026-09-12): Gemini 3.8 Flash 12 aday, Gemini Pro 6 curutme senaryosu uretti; adaylar kaynakta dogrulandi ve dogrulanan dort mekanik bulgu duzeltildi (fixtureVersion metrik kaybi, saglayici hatasinda `schema_invalid` maskesi, tuketim oncesi rehash istisnasi, chmod sonrasi gecici dosya sizintisi); tasarim karari gerektiren bulgular WP5-B kapsaminda ele alinir.
- WP5-B uctan uca durumu (2026-09-13): orkestrator onay kanali, saklanan prepared edit uygulamasi, sinif politikasi, registry yalitimi, tek kullanim/yaris korumasi ve saglayici ortami sertlestirmesi yeni testlerle dogrulandi; Sol denetim turu bulgulari duzeltildi (tek-snapshot tutarlilik, yabanci workspace invalidation, recovery taramasi ve release, UTF-8 kayipsizligi); toplam 481/481 test, `npm run verify`, `npm run smoke`, `git diff --check` ve gercek DeepSeek MCP pilotu son haliyle gecti; Sol kapanis denetimi APPROVED.

## Plan Tamamlama Durumu (2026-09-13 Kapanis: Uygulama ve Uctan Uca Dogrulama)

- Karar: TAM UYGULANDI. WP1 probe kapsami genisledi (codex/claude_code/opencode opt-in probe), WP2 envelope + kontrollu carrier onarimi, WP3 canli olcum modu, WP4 manifest + sifir-provider replay, WP5/WP5-B onay sinirlari, WP6 failure drill + zaman pencereli SLO/error-budget uygulandi.
- Uctan uca fonksiyon dogrulamasi (2026-09-13): `npm test` 511/511, `npm run verify`, `npm run smoke`, `npm run drill`, `npm run model-fit:evaluate`, `npm run memory:evaluate`, `npm run memory:review`, `npm run metrics`, `npm run runs:recent`, `npm run budget` ve `npm run replay` gecti.
- Gercek saglayici dogrulamasi: `npm run pilot` (DeepSeek read-only), `npm run pilot:edit:deepseek` (disposable edit), `npm run accept:edit:deepseek` (MCP production edit, accepted true) gecti. 7 gruplu canli matris (2026-09-13, fixture v2): `coverageComplete: true`, `modelsBound: true`, `decisionReady: true`, `promotionEligible: true`; yedi aday grubunun tamami esikleri gecti ve `identityAssurance: configured` ile dogrulandi; olculemeyen saglayici maliyetleri `not_observable`/`partial` olarak temsil edildi ve maliyet esigi yalniz tam gozlemde uygulandi. Bu sinyal otomatik rota veya dosya promotion'u baslatmaz. Orkestrator onay kanali gercek uctan uca dogrulandi: yeni dosya edit'i `approval_required` + `approvalRequestId` dondu, `approve_prepared_edit` ile uygulandi, ayni kimlikle tekrar deneme `approval_invalid` reddedildi ve kaynak workspace'te artifakt kalmadi.
- P0/P2A/P2B: `p0:e2e` exit 0 (gemini ve codex); `p2a:e2e` exit 0 (repo-A, repo-B, non-git); `p2b:e2e` 5/5 gecti; tum kosularda mutasyon yok. Antigravity carrier uyumsuzlugu kontrollu onarimla kapandi.
- Kalan riskler: URL'siz web icerigi carrier onariminda `webIntentHeuristics` acikken bile kimlik/provenance kaniti sayilmaz; `webEvidenceRepair` bayragiyla sonuc, metrik, manifest ve replay uzerinde denetlenebilir; web arastirma profilleri katı carrier modundadir. Saglayici CLI'lari imzali model kimligi bildirmedigi icin canli model-fit `boundModel` degeri yapilandirilmis baglamadir ve `identityAssurance: configured` ile etiketlenir; saglayici tarafi model ikamesi tespit edilemez. Canli SLO sonuclari veri biriktikce anlam kazanir; aday bazli edit readiness icin genel SLO yerine model-fit tekrarlari esas alinir; olculemeyen maliyet `costUsd: null` ile temsil edilir ve maliyet esigi yalniz tam gozlemde uygulanir. DeepSeek saglayici rate limiti gecici olarak 7 gruplu matrisin deepseek bacagini kapatabilir; bu durumda kosu kod hatasi olarak yorumlanmaz.
- Dokuman senkronu: README regresyon tabani 511/511'ye guncellendi.
