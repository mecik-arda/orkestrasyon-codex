# Plan Denetimi Teknik Takip Paketi

- Tarih: 2026-08-21
- Durum: Is Paketleri 1-6 uygulandi ve dogrulandi; Is Paketi 7 provider aboneligi nedeniyle bloklu
- Durum notu (2026-09-27): İş Paketi 7 planın açık teslimatıdır ve GLM HighSpeed abonelik yetkisi olmadığı için hâlâ blokludur. Bu nedenle kısmi plan olarak `yarim-kalanlar` altında sınıflandırılır; İş Paketi 1-6'nın tamamlanmış olması tüm planı tamamlanmış yapmaz.
- Kapsam: Plan denetiminde bulunan kismi uygulamalar, politika metni ile config uyumsuzluklari, test sozlesmesi aciklari ve dis provider bagimliliklari
- Kaynak denetimler: `ORKESTRASYON_GELISTIRME_PLANI_V2.md`, `MODEL_KIMLIGI_VE_ERISIM_MODU_PLANI.md`, `DEEPSEEK_EDIT_PILOT_VE_MIRROR_KARARLILIK_PLANI.md`, `HAFTA_1_HIZLI_KAZANIM_PLANI.md`

## Yurutme Ozeti

- Provider edit fallback politikasinda metin ile runtime config uyumsuzdur; bu once duzeltilmelidir.
- DeepSeek edit sonucu icin checkpoint, strict sema ve bazi adversarial regresyon testleri eksiktir.
- Read-only OpenCode agent'inda acik external-directory reddi yoktur; dusuk maliyetli savunma katmani olarak eklenmelidir.
- Kimi/Qwen islevsel olarak kapsanmistir; eksik olan ayri dosyalar degil, planin test kabul kriteri ile mevcut test stratejisinin uyumudur.
- GLM HighSpeed uygulama eksigi degil, abonelik ve canli dogrulama bagimliligidir.
- Butce reddi dogrudur fakat operatorun kalan kotayi ayni hata yanitinda gormesi iyilestirilmelidir.

## Uygulama Sonucu

- Is Paketi 1: Kontrollu DeepSeek Pro ve Antigravity Gemini Pro edit fallback istisnasi politika ve README metninde aciklandi; config testi exact hedef matrisini dogrular.
- Is Paketi 2: `deepseek-readonly` icin `external_directory: deny` eklendi ve config testiyle sabitlendi.
- Is Paketi 3: Controlled-edit sonucu strict Zod semasina baglandi. DeepSeek read-only ve edit checkpoint'leri gercek access mode degerini tasir; edit checkpoint'i prompt, diff, dosya yolu, workspace veya gorev kimligi saklamaz. Checkpoint yazma fail-soft kalir.
- Is Paketi 4: Yeni dosya promotion'i, junction/symlink kacisi, allowlist disi environment secret, prompt injection izin dayanimi, caller workspace reddi ve strict sema testleri eklendi.
- Is Paketi 5: Gunluk ve aylik butce reddi ilgili donem, limit, harcama ve kalan kotayi redacted `metrics.costBudget` alaninda dondurur.
- Is Paketi 6: Kimi/Qwen testleri ortak `tests/catalog-provider.test.js` altinda yedi deterministik vakaya tamamlandi; kaynak plan gercek test stratejisiyle uzlastirildi.
- Is Paketi 7: `check_glm_subagent` HighSpeed modelini katalogda available raporladi; gercek `run_glm_edit_pilot` cagrisi `model_access_denied` dondu. Diff bos, ana workspace degismedi ve cleanup tamamlandi. Durum `BLOCKED / SUBSCRIPTION ENTITLEMENT REQUIRED` olarak kalir.
- Bagimsiz DeepSeek Flash incelemesi sonrasi katalog `model_unavailable` erken donusu edit ve read-only strict sonuc semalariyla uyumlu hale getirildi. Promotion sonrasi cleanup hatasi, kaynakta gerceklesen degisikligi gizlememek icin `applied`, `filesChanged` ve `diff` alanlarini korur.
- DeepSeek public `workspace` alani bilincli olarak yonlendirme girdisi degildir; server tarafindan guvenilen canonical workspace her zaman kazanir. `P0-DEEPSEEK` testi bu guvenlik sozlesmesini ve checkpoint redaksiyonunu korur.
- Son denetimde cache hit, kuyrukta iptal veya ret edilen calismalarin rezervasyonu sifir maliyetle uzlastirilir. Kimi/Qwen promptu tek kez sarilir; controlled edit attempt timeout'u provider ayarini korur; generic controlled edit tek adapter denemesiyle sinirlanir; profile edit promptu secili dosyalari listeler; DeepSeek MCP basarisiz sonucu `isError` ile isaretler.
- Dogrulama: `node --test --test-concurrency=1 tests/*.test.js` 302/302 PASS; `npm run verify`, `npm run verify:ci`, `npm run smoke`, `npm run memory:review`, `npm run memory:evaluate`, `npm run pilot`, `npm run p0:e2e`, `npm run p2a:e2e` ve `npm run p2b:e2e` basarili.

## Kapsam Disi

- Yeni provider veya model eklemek.
- Varsayilan olarak edit modunu acmak veya fallback sayisini arttirmak.
- Basarisiz editten sonra otomatik tekrar denemek.
- GLM HighSpeed aboneligini uygulama kodu ile asmaya calismak.
- Mevcut Vault draft/promote, secret tarama, karantina veya redacted audit ilkelerini zayiflatmak.

## Oncelik Sirasi

1. Provider rol politikasi ile fallback config uyumunu sagla.
2. Read-only ajan dis dizin reddini aciklastir.
3. DeepSeek edit checkpoint, sonuc semasi ve adversarial test kapsamini tamamla.
4. Butce reddi operator bilgisini iyilestir.
5. Kimi/Qwen test stratejisi kabul kriterini teslimatla uzlastir.
6. GLM HighSpeed abonelik sonrasi canli pilotu calistir.

## Is Paketi 1: Provider Edit Fallback Politikasi

- Sorun: `ORKESTRASYON_GELISTIRME_PLANI_V2.md` Gemini ve DeepSeek icin edit kullanimini sinirliyor; `config/policy.json` edit profillerinde bu provider'lari fallback olarak tanimliyor.
- Karar: Tek kaynakli politika olustur. Kontrollu edit fallback bilincli olarak korunacaksa plan ve politika metninde provider, tetikleme kosulu, disposable workspace, promotion ve insan onayi istisnasini acikca belirt. Korunmayacaksa bu hedefleri edit `fallbackTargets` listelerinden kaldir.
- Guvenlik siniri: Sessiz fallback ekleme. Her fallback, mevcut controlled-edit akisi, tek deneme ve secret fail-closed davranisiyla kalir.
- Kabul kriteri: Politika metni ve `config/policy.json` ayni provider/mode matrisiyle uyumludur.
- Kabul kriteri: Edit fallback testi, izinli hedefe yonlendirmeyi ve izinli olmayan hedefte fail-closed davranisi dogrular.

## Is Paketi 2: Read-Only Dis Dizin Reddi

- Sorun: `opencode.jsonc` icindeki `deepseek-readonly` agent'i `edit`, `bash`, `task` ve `question` araclarini reddediyor, ancak `external_directory` icin acik bir red tanimlamiyor.
- Degisiklik: `deepseek-readonly.permission` altina `external_directory: deny` ekle; edit ajanlariyla izin sozlesmesini tutarli hale getir.
- Guvenlik siniri: Bridge canonical workspace ve denied-root kontrolleri korunur; bu degisiklik onlarin yerine gecmez.
- Kabul kriteri: Config testi, read-only ajaninin dis dizin erisimini acikca reddettigini dogrular.
- Kabul kriteri: `npm test` ve `npm run verify` basarilidir.

## Is Paketi 3: DeepSeek Edit Denetlenebilirligi ve Sema Sozlesmesi

- Sorun: Read-only checkpoint alanlari `read_only` degerini sabitliyor; edit calismalari checkpoint yazmiyor; edit payload'i ayri strict Zod semasindan gecmiyor.
- Degisiklik: Checkpoint olusturucularina dogrulanmis access mode aktar. Controlled edit calismasinin sonucunu, secret redaksiyonu uygulandiktan sonra strict bir Zod semasiyla dogrula ve redacted checkpoint kaydi olustur.
- Sema alani: status, backend, requestedModel, resolvedModel, accessMode, summary, failureClass, filesChanged, diff, applied, fallbacks ve cleanupCompleted. Raw prompt, icerik, workspace yolu, task kimligi veya secret semaya ve checkpoint'e eklenmez.
- Guvenlik siniri: Edit modu tek deneme olarak kalir; mutation_state_unknown durumunda retry yapilmaz; checkpoint yazma hatasi basarili uygulama sonucunu geri alma veya gizleme nedeni olmaz.
- Kabul kriteri: Read-only ve edit checkpoint'leri gercek access mode ile kaydedilir.
- Kabul kriteri: Sema disi edit sonucu fail-closed reddedilir.
- Kabul kriteri: Checkpoint ve MCP sonucunda raw diff disinda secret, workspace yolu, prompt veya gorev kimligi bulunmaz.

## Is Paketi 4: DeepSeek Edit Adversarial Regresyon Testleri

- Sorun: Disposable workspace savunmalarinin bir bolumu kodda mevcut olsa da yeni dosya, symlink/junction kacisi, environment secret aktarimi ve prompt injection senaryolari icin acik regresyon testi eksik.
- Degisiklik: `tests/deepseek-edit-pilot.test.js` veya uygun dar test dosyalarinda asagidaki vakalari ekle.
- Vaka: Secili yeni dosya olusturma basarili olur ve promotion yalniz izinli dosyayi etkiler.
- Vaka: Symlink veya junction ile workspace disina cikis fail-closed reddedilir.
- Vaka: Provider surecine allowlist disi environment secret aktarilmaz.
- Vaka: Prompt icindeki shell, ag erisimi veya talimat gecersiz kilma istegi izin politikasini degistirmez.
- Vaka: Disposable olmayan allowed-root dizini edit pilotu olarak kullanilamaz.
- Kabul kriteri: Her vaka deterministik testle korunur; ana workspace, Vault ve host secretlari degismez.

## Is Paketi 5: Butce Reddi Operator Bilgisi

- Sorun: Harcama limiti asildiginda hata yaniti nedeni bildiriyor, ancak kalan kota ve limit bilgisi ayni yanitta yok.
- Degisiklik: Redacted runtime failure ayrintisina ilgili donem limiti, harcanan tutar ve kalan kota ekle. Hassas model, prompt, workspace, task veya provider cevabi ekleme.
- Kabul kriteri: Aylik limit reddi testi, reason ile limit/spent/remaining alanlarini dogrular.
- Kabul kriteri: `check_subagent_bridge` ve `npm run budget` ile ayni hesaplama kullanilir.

## Is Paketi 6: Kimi/Qwen Test Stratejisi Uzlasmasi

- Sorun: Kimi/Qwen adapter islevi `tests/catalog-provider.test.js` altinda kapsanmis, ancak kaynak plan ayri test dosyalari ve en az yedi vaka bekliyor.
- Karar: Ayri test dosyasi yalniz anlamli izolasyon sagliyorsa eklenir. Aksi halde mevcut birlesik test dosyasi korunur ve kaynak plan, gercek test dosyasi ile vaka sayisini yansitacak bicimde guncellenir.
- Kabul kriteri: Alias cozumu, allowlist, router secimi, agent secimi, MCP sema reddi ve model_unavailable fail-closed davranisi testlidir.
- Kabul kriteri: Test stratejisi dokumani ile dosya yapisi arasinda celiski kalmaz.

## Is Paketi 7: GLM HighSpeed Canli Pilot

- Durum: Kod, config, MCP semasi ve unit testleri mevcut; provider aboneligi olmadigi icin canli model erisimi bloklu.
- On kosul: GLM HighSpeed abonelik yetkisi saglanmis olmali. Yetki saglanmadan kod degisikligi veya fail-open fallback yapma.
- Pilot: `check_glm_subagent` ile model erisimi dogrulanir; ardindan dar dosya listeli, disposable workspace kullanan `run_glm_edit_pilot` calistirilir.
- Kabul kriteri: Health sonucu HighSpeed modeli available olarak raporlar.
- Kabul kriteri: Pilotun diff'i secili dosyalarla sinirli, secret taramasindan gecmis ve cleanup tamamlanmis olur.
- Kabul kriteri: Basarisizlikta ana workspace degismez; hata abonelik veya provider durumu olarak redacted raporlanir.

## Dogrulama Sirasi

1. Ilgili unit testlerini calistir.
2. `npm test` calistir.
3. `npm run verify` calistir.
4. MCP semasi veya araci degisirse `npm run smoke` calistir.
5. GLM HighSpeed yalniz abonelik on kosulu karsilandiginda kontrollu pilotla dogrulanir.

## Tamamlanma Karari

- Is Paketleri 1-6, kod, test ve dokumantasyon kabul kriterleri saglanmadan tamamlanmis sayilmaz.
- Is Paketi 7, dis abonelik bagimliligi nedeniyle bloklu kalabilir; bu durum uygulama eksigi olarak siniflandirilmaz.
- Her degisiklikten sonra mevcut bellek guvenligi, controlled edit, redacted audit ve varsayilan read-only politikasi korunmalidir.
