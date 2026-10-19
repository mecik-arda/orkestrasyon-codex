# Uctan Uca Denetim Raporu (2026-09-13)

- Kapsam: hades-orchestrator subagent bridge; runtime, disposable workspace, approval/prepared-edit, metrics/SLO/replay, model-fit, MCP yuzeyi ve adaptorler.
- Yontem: cok saglayicili denetim. Gemini 3.8 Flash genis aday uretimi yapti; DeepSeek Pro aday dogrulama kosusu tamamlanamadi; Sol kritik inceleme turu yapti; her aday ana orkestrator tarafindan kaynakta satir bazinda bagimsiz dogrulandi.
- Sonuc ozeti: 10 adaydan 9 gecerli bulgu duzeltildi (1 yuksek, 4 orta, 4 dusuk), 1 aday tasarim geregi reddedildi. Nihai Sol karari: APPROVED.
- Mevcut dogrulama tabani: 533/533 test, verify, smoke, drill, replay, gercek DeepSeek pilotu, p0/p2a/p2b ve 7 gruplu canli model-fit matrisi yesil.

## Katilimci Rolleri

- Gemini 3.8 Flash (Antigravity, salt-okunur): genis hata adayi listesi (8 hipotez). Hipotezler karar gerekcesi degildir.
- DeepSeek Pro (OpenCode, salt-okunur analyst): aday dogrulama gorevi. Ilk deneme `rate_limited` (477 sn), ikinci deneme 781 sn sonunda `output_parse_invalid` ile tamamlandi; yapilandirilmis cikti alinamadi, bu nedenle ek bulgu katkisi yok.
- Sol (Codex, kritik denetim): adaylari bagimsiz dogruladi, ek bulgular ekledi ve son kapanis turunda APPROVED verdi (0 kritik, 0 yuksek).
- Ana orkestrator: tum adaylari kaynakta dogruladi, onem derecelendirdi ve bu raporu uretti.

## Nihai Kapanis (Sol)

- Karar: APPROVED.
- Yeni kritik veya yuksek bulgu: Yok.
- Saglik skoru: 96/100.
- F1-F4 ve F6-F10: CLOSED.
- F5: Tasarim geregi reddedilmis aday; davranis korunuyor.
- Son Sol turu salt-okunur kaynak incelemesiydi; Sol kendi ortaminda `npm` bulamadigi icin testleri yeniden calistirmadi. Ana orkestratorun son `npm test` sonucu 533/533 basariliydi.

## Bulgular

### F1 - Dogrudan promotion yolunda kaynak degisikligi yanlis siniflaniyor

- Onem: Dusuk
- Durum: Dogrulandi
- Kanit: subagent-bridge/src/runtime/bridge-runtime.js:1129 satirinda hata sinifi `error.failureClass || "pilot_failed"` olarak atanir; subagent-bridge/src/services/disposable-workspace.js icindeki `sourceStateChangedError` yalnizca `sourceStateChanged = true` isaretler, `failureClass` tasimaz.
- Etki: Dogrudan promote yolunda eszamanli kaynak degisikligi veya promotion sirasinda durum degisimi `pilot_failed` olarak raporlanir. Onay akisindaki `approval_invalid` eslemesi yalnizca `approvePreparedEdit` catch blogunda gecerlidir.
- Oneri: Kaynak degisimi hatasina ayri bir `failureClass` (ornegin `source_state_changed`) atayin veya edit yolundaki catch blogunda `error.sourceStateChanged` eslemesini kullanin.
- Dogrulama: Eszamanli kaynak degisikligi senaryosunda sonuc `failureClass` degerini kontrol edin.

### F2 - Secret temizleme degisiklikleri diff taramasinda bloke ediliyor

- Onem: Orta
- Durum: Dogrulandi
- Kanit: subagent-bridge/src/runtime/bridge-runtime.js:1062 `containsSecretLikeValue(changes.diff)` tum diff'i tarar; `createUnifiedDiff` silinen satirlari `-` isaretiyle diff'e yazar.
- Etki: Sizmis bir anahtari veya parolayi silen mesru duzenleme `secret_detected` ile fail-closed reddedilir; guvenlik sikilastirmasi yan etki uretir.
- Oneri: Secret taramasini yalnizca eklenen satirlarda (`+`) yapin; silinen satirlar icin tarama yapmayin veya ayri bilgilendirici sinif kullanin.
- Dogrulama: Secret iceren satiri silen edit kabul edilmeli; secret ekleyen edit reddedilmeli (mevcut PILOT-EDIT-03 ile uyumlu).

### F3 - schema_invalid saglayici circuit breaker'ini acabiliyor

- Onem: Orta
- Durum: Dogrulandi
- Kanit: subagent-bridge/src/runtime/bridge-runtime.js:341-344; subagent-bridge/src/retry.js:29 `schema_invalid` ve `output_parse_invalid` tekrar denenebilir listesindedir. Bu siniflar `circuitBreaker.recordFailure` yoluna gider.
- Etki: Icerik veya sema uyumsuzlugu altyapi arizasi gibi sayilip saglayici devresini acabilir; sonraki cagrilar `provider_circuit_open` ile kesilir.
- Oneri: Sema ve parse hatalarini circuit breaker failure sayimindan haric tutun (recordSuccess veya notr davranis).
- Dogrulama: Ardisik sema hatasi sonrasinda circuit durumu `closed` kalmali.

### F4 - contextFiles varsayilani yok

- Onem: Dusuk
- Durum: Dogrulandi
- Kanit: subagent-bridge/src/runtime/bridge-runtime.js:1003 ve 1052 dogrudan `input.contextFiles` kullanir; varsayilan dizi atamasi yoktur.
- Etki: Public MCP yollari zod `default([])` ile korunur; yalnizca dogrudan runtime cagrilari (script veya yeni entegrasyon) `TypeError` ile kesilebilir.
- Oneri: `(input.contextFiles || [])` ve `(input.files || [])` varsayilanlarini kullanin.
- Dogrulama: `contextFiles` alani olmadan `runProfileEdit` cagrisi.

### F5 - runProfileEditPilot codex disi profilde hata atiyor

- Onem: Yok (tasarim geregi)
- Durum: Reddedildi
- Gerekce: Pilot yuzeyi yalnizca codex edit profilleri icin tasarlandi; MCP'ye acilmadi ve `PILOT-PROFILE-02` bu reddi test eder. Bulgu degildir.

### F6 - Istisna yolunda maliyet 0 olarak raporlaniyor

- Onem: Orta
- Durum: Dogrulandi
- Kanit: subagent-bridge/src/runtime/bridge-runtime.js:1046 `costObserved = true`; 1052 satirindaki `provisionDisposableWorkspace` istisnasi 1129 catch bloguna duser, `costObserved` false yapilmaz; 1152 satirinda `metrics.totalCostUsd: 0` yazilir.
- Etki: Baslamayan veya kesintiye ugrayan denemeler "maliyet olculdu: 0" gibi gorunur; canli model-fit `costObservation: observed` uretip maliyet esigini yanlis gecebilir.
- Oneri: Istisna yollarinda maliyet gozlemini `not_observable` yapin; yalnizca en az bir sonlu deneme maliyeti varsa sayi tasiyin.
- Dogrulama: Provision hatasi zorlanan edit kosusunda sonuc `metrics.totalCostUsd` icermemeli veya `null` olmali.

### F7 - Recovery artifakt onek kontrolu yanlis pozitif uretebilir

- Onem: Dusuk
- Durum: Dogrulandi
- Kanit: subagent-bridge/src/services/disposable-workspace.js:49 `.${basename}.` onekini ve `.tmp` son ekini arar; ornegin `script.js` icin `.script.js.map.<...>.tmp` artifakti da eslesir.
- Etki: Ayni kok ada sahip farkli uzantili dosyalar icin ilgisiz `recovery_required` blokaji olusabilir.
- Oneri: Kati artifakt deseni kullanin: `.${basename}.${pid}.${timestamp}.${random}.tmp` ve `.tmp.backup` (sayisal segment zorunlulugu).
- Dogrulama: `script.js.map` artifakti `script.js` taramasini bloke etmemeli.

### F8 - Kaynak secret reddi failureClass tasimiyor

- Onem: Dusuk
- Durum: Dogrulandi
- Kanit: subagent-bridge/src/services/disposable-workspace.js:273 duz `Error` firlatir; subagent-bridge/src/runtime/bridge-runtime.js:1129 catch blogu `pilot_failed` uretir.
- Etki: Hazirlik asamasindaki secret reddi guvenlik sinifi yerine `pilot_failed` olarak gorunur; siniflandirma kalitesi duser.
- Oneri: Hataya `failureClass = "secret_detected"` atayin (mevcut `promotionSecretError` ile ayni).
- Dogrulama: Secret iceren kaynak dosyayla edit kosusunda sonuc `failureClass` degeri `secret_detected` olmali.

## Sol Kritik Denetim Turu (2026-09-13)

### F9 - Genel provider araclari kontrollu edit ve approval sinirini atliyor

- Onem: Yuksek
- Durum: Dogrulandi (ana orkestrator kaynak dogrulamasi)
- Kanit: `runAntigravity`, `runOpenCode` ve `runCodex` semalari `mode: "edit"` kabul eder (subagent-bridge/src/frontends/mcp/tools.js:18-42); handler'lar dogrudan `runtime.run` cagirir (tools.js:175-190). Codex `workspace-write` sandbox ile dogrudan kaynak workspace'e yazar (subagent-bridge/src/adapters/codex-adapter.js:87); OpenCode genel edit cagrisinda `build` ajanini secer (opencode-adapter.js:102-120); Antigravity accept-edits moduna gecebilir (antigravity-adapter.js:277-297). Kisisel yapilandirmada bu backend'lerde `allowedModes` read_only ve edit'tir.
- Etki: Secili dosya kisiti, disposable workspace, secret taramasi, degisiklik siniflandirmasi, rollback ve prepared-edit approval zinciri tamamen atlanarak dogrudan workspace'e yazilabilir.
- Oneri: Genel `run_*` araclarinda edit modunu kaldir veya tum edit isteklerini zorunlu olarak `executeControlledEdit` hattina yonlendir; yalniz kontrollu dahili caller kimlikleri edit kullanabilsin. Negatif MCP entegrasyon testi ekle.
- Dogrulama: `mode: "edit"` ile genel arac cagrisinin reddedildigini ve yalniz kontrollu hattin yazdigini test et.

### F10 - OpenCode circuit breaker'i tum modeller icin ortak

- Onem: Orta
- Durum: Dogrulandi
- Kanit: subagent-bridge/src/runtime/bridge-runtime.js:91-95 `circuitKey` yalniz Antigravity icin model bazlidir; diger backend'lerde anahtar yalniz backend adidir.
- Etki: Tek bir OpenCode modelindeki rate-limit veya sema sorunu DeepSeek, GLM, Kimi ve Qwen yollarini birlikte kapatabilir; baska bir modelin basarisi ortak gecmisi temizleyebilir.
- Oneri: OpenCode icin breaker anahtarini `backend:resolvedModel` veya `backend:provider-family` yapin.
- Dogrulama: Bir modelde hata uretip diger modelin circuit durumunun etkilenmedigini test edin.

### Sol'un Mevcut Bulgulara Iliskin Degerlendirmesi

- F1: CONFIRMED/Dusuk; ayrı `failureClass` cozumu dogru.
- F2: PARTIAL; yalniz eklenen diff satirlarini taramak tek basina yeterli degil, cunku ayni secret kaynak kopyalama asamasinda reddediliyor (subagent-bridge/src/services/disposable-workspace.js:268-273). Secret temizleme icin secret'i saglayiciya tasimayan ayri yerel akis gerekir.
- F3: CONFIRMED/Orta; duzeltmede `recordSuccess` kullanilmamali (gercek ariza gecmisini sifirlar); notr kayit veya ayri icerik-kalitesi sayaci kullanilmali.
- F4: CONFIRMED/Dusuk; runtime sinirinda tek Zod semasi daha guclu bir secenektir.
- F5: REJECTED; pilot codex kisiti tasarim geregidir.
- F6: PARTIAL/Orta; outer catch'e ek olarak runInternal adapter istisna yolunda (bridge-runtime.js:747) sayisal `totalCostUsd` tasiniyor; runtime exception aggregate maliyeti `null`/`partial` uretmelidir.
- F7: CONFIRMED/Dusuk; kati artifakt deseni onerisi dogru.
- F8: CONFIRMED/Dusuk; `secret_detected` onerisi dogru.

## DeepSeek Dogrulama Kosusu

- Gorev: e2e-audit-deepseek-verify (salt-okunur analyst).
- Sonuc: Ilk deneme `rate_limited` (477 sn); ikinci deneme 781 sn surdu ve `output_parse_invalid` ile tamamlandi. Yapilandirilmis cikti alinamadi; maliyet yaklasik 0.0034 USD.
- Etki: Bagimsiz dogrulama adimi bu turda tamamlanamadi. Bu rapordaki dogrulamalar ana orkestratorun kaynak incelemesine dayanir.
- Not: Saglayici rate limiti gecici; ayni gorev daha sonra tekrar denenebilir.

## Uygulanan Duzeltmeler

1. Genel provider MCP araclari salt-okunura kapatildi; runtime edit yalniz kontrollu caller listesiyle kabul edilir.
2. Kaynak secret'lari disposable alanda redakte edilir; yalniz eklenen diff satirlari taranir ve yeni secret promotion'da reddedilir.
3. Sema/parse hatalari circuit breaker'i degistirmez; OpenCode circuit anahtari model bazlidir.
4. Kaynak durumu, secret ve maliyet siniflandirmalari duzeltildi; istisna maliyeti bilinmeyen kalir.
5. Recovery artifakt eslesmesi kati desene baglandi; eksik context dosya listesi bos diziye iner.

## Sinirlar

- Bulgular sonrasinda kod ve test degisiklikleri uygulandi.
- Denetim Gemini adaylari, DeepSeek dogrulama denemesi ve Sol kritik turu ile yurutulmustur; nihai karar Sol'dedir (APPROVED).
- Gemini adaylari yalnizca ana orkestrator kaynak dogrulamasindan sonra bulgu olarak kabul edilmistir.
