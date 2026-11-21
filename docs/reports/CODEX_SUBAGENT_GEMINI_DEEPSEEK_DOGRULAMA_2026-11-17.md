# Codex için Gemini ve DeepSeek alt ajan doğrulaması

Tarih 17–19 Kasım 2026. Windows x64 ve Node 24.17.0. İlk Antigravity ölçümleri CLI 1.5.10, restart sonrası Low ölçümü CLI 1.5.12 ile alındı.

## DeepSeek Flash

- Codex oturumundaki Hades `low_cost_analysis` profilini resmi API'de `deepseek-flash` olarak çalıştırdı. Yapılandırılmış sonuçta `summary="377"`, tek adapter denemesi, sıfır retry ve 1.152 ms kaydedildi. Host maliyet tahmini 0,0000768 USD.
- `npm run pilot`, başlangıçtaki Node yürütücüsünü kullanarak stdio MCP sürecini başlatır. Önceki pilot bu süreçte canlı `run_deepseek_subagent` çağrısını strict JSON doğrulamasıyla tamamladı. 1.490 ms ve tek deneme gözlendi.
- İlk canlı edit önizlemesi var olan CRLF satır sonlarını LF'ye çevirdi. Edit istemi artık özgün içeriği JSON string snapshot olarak gösteriyor ve mevcut satır sonlarıyla dosya sonunu korumasını açıkça istiyor. `npm run pilot:edit:deepseek` son canlı çağrıda tam CRLF diff'ini ve kaynak baytlarını doğruladı. Uygulama yapılmadı ve geçici alan temizlendi.
- `npm run accept:edit:deepseek` emekli model ve genel edit aracı yerine `run_deepseek_edit_pilot` üzerinden etkin `deepseek-flash` modelini çağırıyor. Yeni stdio MCP sürecinde gerçek çağrı `accepted=true`, `applied=false`, `cleanupCompleted=true`, `sourceUnchanged=true` ve `exactPreview=true` döndürdü. Geçici test dosyası LF biçimindeydi.
- Canlı salt-okunur kaynak incelemesi tek sentetik dosyanın dönüş satırını doğru gösterdi, ancak önceki sürüm HTTP yolunda CLI stdin kanıtı aradığı için teslimi `failed` yazıyordu. Güncel stdio MCP sürecindeki yeni canlı çağrı `complete_to_api`, `outputIntegrity=complete`, `taskCompletion=completed` ve `reviewResultValidated=true` döndürdü. Kaynak referansı 2. satırla, kaynak baytları başlangıçla eşleşti. Sentetik test, başarılı HTTP tesliminden sonra geçersiz satır referansının yine reddedildiğini de sınadı.

Host tarafından usage üzerinden hesaplanan tutarlar tahmindir. Bu edit rotası yalnız disposable önizleme sağlar.

## Gemini 3.8 Flash

- 20 Kasım'da Medium, web kullanmama talimatının yanlış sınıflandırılması düzeltildikten sonra canlı Hades yolunda tek denemede `42` döndürdü. High'ın web görevinde tamamlanmış araç çağrısı gözlenmedi. Ayrıntılı canlı sonuçlar [geçiş kapanış kontrolünde](CODEX_HADES_ENTEGRASYON_YENIDEN_DEGERLENDIRME_2026-11-07.md#2026-11-20--geçiş-planı-kapanış-kontrolü) kayıtlıdır.
- 21 Kasım'da stream izleyici düzeltmesi `ACTIVE` web-tool olayını tamamlanmış okuma veya `not_invoked` olarak değil `not_observed` olarak sınıflandırır. Canlı High kabulü açık; son tanı çağrısı platform auto-review kullanım sınırında çalıştırılmadı. Yerel test ve tam doğrulama ayrıntıları [21 Kasım kaydındadır](CODEX_HADES_ENTEGRASYON_YENIDEN_DEGERLENDIRME_2026-11-07.md#2026-11-21--antigravity-web-izi-ve-tam-yerel-do%C4%9Frulama).
- 21 Kasım P1b eki: özgün planın model kabulü web aracı kullanımı değil, erişilebilirlik/canonical alias ve başarılı read-only pilottur. Gemini 3.8 Flash High/Medium/Low için kayıtlı canlı read-only başarılar bu ölçütü karşılar. `gpt_oss_120b` probu `modelAccess=available` döndürdü; tek salt-okunur görev `requestedModel=gpt_oss_120b`, `resolvedModel=gpt-oss-120b-medium`, `result="42"`, exit 0, completed, bir adapter denemesi ve sıfır retry ile bitti. Probe'nin `failureClass=process_error` alanı adapter'daki geçici dizin temizliğinin başarısız olduğunu gösterir; bu temizlik başarıyla tamamlandı veya dizin yok iddiası yapılmaz. Gemini High `web_research` kanıt kabulü ayrı ve açık kalır. Resmi katalog erişim 2026-11-21 tarihinde Claude 4.6 ve GPT-OSS 120B için kaldırılma tarihini 2026-11-30 olarak gösteriyordu; [model kataloğu](https://antigravity.google/docs/models).
- 19 Kasım'da Hades yeniden yüklendikten sonra `gemini_flash_3_8_low` canlı katalogda göründü. Tek salt-okunur görev `gemini-3.8-flash-low` modeline çözümlendi ve beklenen yapılandırılmış `42` sonucunu döndürdü. Çıkış kodu 0, adapter denemesi 1, retry 0, süre 8.595 ms ve maliyet alanı `null` idi. Medium için son `rate_limited` kaydı ve High için açık canlı web kanıtı kabulü değişmedi.
- `web_research` canlı Hades çağrısı `gemini-3.8-flash-high` modeline çözümlendi. İlk deneme yaklaşık 201 saniyede zaman aşımına uğradı. İkinci deneme yaklaşık 140 saniyede bir başlık ve alıntı döndürdü, ancak `webReadStatus=not_invoked` izlendi. Kamuya açık IANA sayfasıyla ayrı CLI tanısında da araç başlangıç kataloğunda göründü ve tamamlanmış bir web aracı çağrısı gözlenmedi. Başlık üretimi canlı sayfa okuma kanıtı olarak kabul edilmedi.
- Yeni stdio MCP sürecinde rastgele değer veren kamu URL'si için `web_research_fast` çağrısı `permission_denied` döndürdü. Ayrı CLI izinde web aracı katalogda görünmesine rağmen tamamlanan adım yoktu. Bu nedenle canlı web okuma kabulü açık.
- Geçici sentetik dosya ayrı bir CLI denemesinde gerçek `read_file` adımıyla okundu. Araç hedef dosyayı açtı, çıktı üretti ve model istemde yer almayan rastgele değeri aynen döndürdü.
- Hedef çalışma ağacında `file_audit` profilinin ilk iki denemesi `permission_denied` döndürdü. Aynı çalışma ağacında göreli fixture adıyla yapılan CLI tanısı `read_file` tamamlanmasını ve doğru dönüş satırını gördü. Bu sonuç, önceki MCP retlerinin kök nedenini açıklamıyor.
- Tanıda başarılı olan göreli istem, yeni stdio MCP sürecinin `file_audit` profilinde de geçti. `gemini-3.8-flash-high` tek denemede tam dönüş satırını döndürdü. Çalıştırma yaklaşık 100 saniye sürdü ve yerel dosya görevinde web kanıtı oluşmadı.
- Güncel capability probunda model bazındaki `webRead=unavailable` ve `failureClass=unclassified` gözlendi. Yerel mutlak yolu model istemine taşıyabilecek bir tanıyı platform Auto-review kaynak aktarımı gerekçesiyle reddetti. Başarılı dosya tanısı yalnız göreli kamu fixture adıyla yapıldı.
- Son IANA HTML denemesi güncel MCP `web_research` profilinde iki adapter denemesi sonunda `rate_limited` ve `resource_exhausted` döndürdü. `webReadStatus=failed` nedeniyle başarılı araç izi ve doğrulanabilir alıntı elde edilmedi. Canlı web okuması açık kabul koşuludur.
- 18 Kasım'da Antigravity'nin `/usage` çıktısı Gemini haftalık kotasının kalan kısmını %0 olarak bildirdi. Kota gözleminden sonra yeni model çağrısı başlatılmadı. Canlı kabul için kota açıldığında aynı denemede tamamlanmış web okuma olayı ve onun URL'siyle eşleşen kanıt zarfı gerekiyor.
- Hades, kanıt zorunlu salt-okunur Antigravity görevlerinde aynı adapter denemesinde hem geçerli kanıt zarfı hem de dolu çıktıyla tamamlanmış web aracı olayı arıyor. Eksik zarf ve gözlenmemiş okuma ayrı nedenlerle `web_evidence_invalid` veriyor. Önceki retry'da görülen bir olay, sonraki denemenin kanıtını geçerli kılmıyor. `webRead` capability probe'u da yalnız bilinen başlık metnine dayanarak başarılı sayılmıyor.
- Kaynak adresi de araç olayıyla bağlandı. Hades, Google'ın belgelediği `tool_info.parameters.Url` ile modelin kanıt zarfındaki URL'yi aynı normalizasyonla karşılaştırıyor. Başka bir sayfa okunursa veya olayda URL yoksa yanıt `web_evidence_invalid / web_source_not_observed` ile reddediliyor. `webRead` probu kendi beklenen adresine tamamlanmış çağrı arıyor. Bu kabul ve ret yolları sentetik CLI izleriyle sınandı.
- Gözlenen araç kullanımı model alıntısının doğruluğunu tek başına kanıtlamaz. Kanıt zarfı düşük güvenle ve karantinada tutulur.

## Yerel doğrulama

`npm run verify:local` sabit kaynak snapshot'ında başarılı oldu. Ana suite 1.264 başarılı, 5 atlanan, 0 başarısız test kaydetti. Seri benchmark 13,729 saniyede geçti. `verify:ci`, sentetik stdio MCP smoke ve sentetik config/Vault `verify` da geçti. Kaynak URL eşleşmesiyle ilgili hedefli koşu 164/164 geçti. Bu koşular sağlayıcı kimlik bilgilerini aktarmadı. Canlı sonuçlar yukarıdaki ayrı sağlayıcı denemelerinde gözlendi.

## Kaynaklar

- [DeepSeek model kataloğu](https://api-docs.deepseek.com/api/list-models/)
- [Google Antigravity headless ve NDJSON araç olayları](https://antigravity.google/docs/cli/headless/)
- [Google Antigravity araç parametreleri](https://antigravity.google/docs/hooks?authuser=3)
- [Google Antigravity model kotası](https://antigravity.google/docs/cli/commands/usage?authuser=3)
- [IANA Reserved Domains](https://www.iana.org/domains/reserved)
