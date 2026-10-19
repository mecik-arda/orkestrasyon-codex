# Antigravity Web Araştırması Düzeltmesi ve Canlı Doğrulama

Tarih: 2026-10-04
Durum: Uygulandı ve canlı canary ile doğrulandı.

## Kapsam

Antigravity headless web araştırmasında araç çağrısı, web kanıt zarfı ve zaman aşımı tanılaması incelendi. Düzeltme paralel batch araştırma profillerini ve normal salt-okunur Antigravity web-intent çağrılarını kapsar.

## Bulgular

- Antigravity izin eylemi `read_url`, resmi belgelerde iç web aracı `read_url_content` olarak geçer. Bridge istemleri ve capability probe eski istemlerde izin eylemini araç adı gibi kullanıyordu.
- Web-intent çağrılarında araç adımını gözlemek için `stream-json` gerekir. `runProcess` zaman aşımında reddedilen hata nesnesine kısmi stdout/stderr taşımıyordu; böylece timeout öncesi gerçekleşmiş bir web aracı adımı gözlenemeyebilirdi.
- Web araştırma profili, sağlayıcıdan JSON-encoded worker summary içeren dış carrier bekler. İstem bu iç içe biçimi örneklemediği için canlı çağrılarda carrier hatası görüldü.
- Yan etkisiz `webRead` capability probe'u kullanıcı ayarlarını değiştirmez. Bu nedenle sonuçtaki `permission_denied` mevcut kullanıcı izinlerinin durumunu gösterir; bridge'in salt-okunur yürütme sırasında geçici eklediği `read_url(*)` kuralının test sonucu değildir.

## Düzeltmeler

- `subagent-bridge/src/adapters/antigravity-adapter.js`: web araştırma ve probe istemleri gerçek araç adı `read_url_content` ile güncellendi; izin eyleminin `read_url(domain)` olduğu ayrıştırıldı. Web-intent çağrıları `stream-json` kullanır; başarılı araç adımının yanı sıra soft-deny bildirimleri de redakte web-read durumuna çevrilir.
- `subagent-bridge/src/services/parallel-batch.js`: researcher istemine dış carrier ve iç JSON summary için geçerli bir örnek eklendi; taşıyıcı onarım istemi aynı şekli zorunlu kılar.
- `subagent-bridge/src/services/execution-service.js`: timeout hataları kısmi stdout/stderr'i yalnız bellekte ve serileştirilmeyen alanlarda taşır. Çağıran adaptör bu veriden izin verilen sınırlı durumu çıkarabilir; ham çıktı metriklere veya kullanıcı sonucuna eklenmez.
- `subagent-bridge/src/adapters/antigravity-adapter.js` ve `subagent-bridge/src/runtime/bridge-runtime.js`: timeout sonrası kısmi akıştan web-read durumu çıkarılır ve retry sırasında önceki `used` gözlemi korunur.
- `tests/faz-1-antigravity.test.js`, `tests/faz-0-core.test.js`, `tests/parallel-batch.test.js`, `tests/web-evidence-runtime.test.js` ve provider fixture'ları araç adı, dış carrier, retry durumu ve timeout çıktısını kapsar.

## Canlı doğrulama

- Normal salt-okunur Gemini Pro çağrısı resmi Antigravity belgelerini okudu; `webReadStatus: used` ve geçerli untrusted web-evidence zarfı döndürdü.
- Normal salt-okunur Gemini 3.8 Flash çağrısı da resmi belgeyi web aracıyla okudu ve kanıt taşıyıcısı döndürdü. İlk deneme timeout oldu; retry başarılı tamamlandı.
- Son paralel batch canary'si `completed`, `webReadStatus: used`, `webEvidenceStatus: present_untrusted` ile sonuçlandı.
- Bu canlı doğrulamalar model sonuçlarının doğruluğunu bağımsız olarak onaylamaz; web alımının ve bridge kanıt sözleşmesinin çalıştığını doğrular. Alınan içerik güvenilmeyen/karantinada kalır.

## Doğrulama

- `npm test`: 811/811 geçti.
- `npm run verify`: geçti.
- `npm run verify:ci`: geçti.
- `npm run drill`: 8/8 geçti.
- `git diff --check`: geçti.

## Birincil kaynaklar

- Google Antigravity, [Permissions](https://antigravity.google/docs/permissions/), erişim tarihi 2026-10-04.
- Google Antigravity CLI, [Headless mode](https://antigravity.google/docs/cli/headless/), erişim tarihi 2026-10-04.
