# Orkestrasyon V2 — Sol İkinci Denetim ve Kapanış Durumu

## Kapsam ve yöntem

İki salt-okunur statik denetim 2026-10-05 tarihinde, çalışma ağacından okuma yapılamadığı için ana orkestratörün doğrudan sağladığı güncel kaynak kesitleri ve test kapsamı özetiyle yürütüldü. İlk çağrı GPT-6 Sol'a çözümlendi; ardından açık model kimliğiyle istenen GPT-6.1 Sol ayrıca çağrıldı. İki Sol da test çalıştırmadı; canlı provider davranışı veya tam plan kabul kriterleri hakkında doğrulama iddiasında bulunmadı. Ana orkestratör kaynak ağacındaki bulguları ayrıca kontrol etti.

## Önceki bulgular

1. **Onay öncesi kaynak drift denetimi — kapandı.** Integration hazırlığı kaynak ref/HEAD ve hedef dosyaların absent/present durumunu ve SHA-256 özetlerini kaydeder. Onay sırasında kaynak ref, HEAD ve dosya durumları tekrar karşılaştırılır. Regresyon testleri ref, HEAD ve dosya değişikliğini doğrular.
2. **Promotion rollback davranışı — denetim bulgusu kapandı.** Dosyalar ayrı ayrı geçici dosyaya yazılıp rename edilir; hata sonrası yedekten geri alma denenir. Rollback başarısızlığı `promotion_rollback_failed` döndürür ve batch `blocked` olur. Çok dosyalı OS-seviyesi atomiklik veya süreç çökmesinden sonra tam geri dönüş garantisi verilmez; manuel kurtarma gerekir. Bu sınırlama tasarım sınırı olarak belgelenmiştir ve GPT-6.1 Sol kapanış onayında bu kapsamla kabul edilmiştir.
3. **Edit doğrulaması, kaynak kilitleri ve dosya/diff limitleri — kapandı.** Verification komutları host allowlist'ine bağlıdır; edit task'ı en az bir allowlisted komut ister. Resource claim'leri normalize edilip sıralanır ve workspace coordinator üzerinden kilitlenir. Dosya sayısı, dosya boyutu, toplam diff, snapshot input ve process output byte limitleri host tavanlarını aşamaz.
4. **Admission ve restart recovery — tanımlanan rezerv sözleşmesi için kapandı.** Primary/fallback route rezervasyonları, bilinen maliyet settlement'ı ve unknown allocation tutulması batch-local muhasebede işlenir. Restart recovery çalışan task'ı `unknown`, başlamamış task'ı `blocked` yapar; unknown allocation tutulur, başlamamış allocation iade edilir. Bu provider faturası veya harcama hard cap'i değildir.
5. **Public summary byte tavanı — kodda fail-closed, sınır testi eklendi.** UTF-8 byte sayısı nihai JSON serileştirmesi üzerinden ölçülür. İçerik budanır; approval alanı sığmıyorsa withheld/block edilir. Minimum public summary yapılandırma şeması alt sınırı olan 4096 byte ile beş maksimum uzunluklu task ID ve büyük task detail alanlarını kapsayan regresyon testiyle doğrulanır. Tavan yine aşılıyorsa servis büyük cevap vermek yerine açık hata üretir.
6. **Integration diff ve detailRef — kapandı.** Birleşik diff private artifact'ta tutulur; `taskId: "integration"` ve tam detailRef ile yetkili, sayfalı okuma sağlanır. Onay özeti gerekli alanları byte tavanında gösteremiyorsa apply çağrısı yapılmaz.
7. **Token/output sınırlarının capability ile eşleştirilmesi — fail-closed; canlı gate kapalı.** Input-token tavanı desteklenmediği için reddedilir. Output-token tavanı yalnız doğrulanmış OpenCode capability'sinde kabul edilir. Process output-byte limiti token/fatura limiti diye sunulmaz. OpenCode `steps` doğrulanmadığı için capability `unavailable` ve bu rota batch'lerde reddedilir.

## Sol'un ikinci inceleme sonucu

İlk GPT-6.1 Sol statik incelemesi yeni P0/P1/P2 bulgu çıkarmadı; rollback'in OS-level atomicity sınırını kısmi olarak not etti. Ana orkestratör kullanıcının açık isteği üzerine, tamamlanan test sonuçlarını, eklenen minimum-summary regresyonunu ve rollback sınırının belgelenmiş tasarım kısıtı olduğunu içeren kapanış kanıt paketini GPT-6.1 Sol'a yeniden sundu. GPT-6.1 Sol, yedi önceki bulgunun remediasyonunu ve kapanışını açıkça onayladı; rollback sınırlamasını belgelenmiş tasarım sınırı olarak kabul etti ve kapanış için ek iş şartı koymadı. İlk GPT-6 Sol çağrısı recovery kapsamı ve summary testi konusunda daha ihtiyatlı kalmıştı; genişletilmiş test ve açık GPT-6.1 Sol kapanış kararı sonrası rapor güncellendi.

İkinci inceleme öncesi ana orkestratör doğrulaması: `npm test` 826/826 geçti; `npm run verify`, `npm run verify:ci`, `npm run smoke`, `npm run drill` (8/8) ve `git diff --check` başarılı. Sol bu komutları kendisi çalıştırmadı.

İlk inceleme planında atıf yapılan bu raporun mevcut olmadığına dair P2 dokümantasyon bulgusu, bu raporun eklenmesi ve plan/index bağlantılarının güncellenmesiyle giderildi. Önceki kişisel opt-in notları tarihli tarihsel durumdur; güncel dağıtım policy'si batch/edit'i kapalı tutar.

## Release durumu

GPT-6.1 Sol'un açık onayı önceki yedi bulgunun düzeltme/kapanış kapsamındadır; release-ready veya genel etkinleştirme onayı değildir. `config/policy.json` içinde `parallelBatch.enabled` ve `editEnabled` kapalıdır; `opencodeOutputCapability` `unavailable` durumundadır. Bu kapılar, ilgili capability kanıtı ve kullanıcı opt-in'i olmadan açılmaz. Batch-local admission tutarı sağlayıcı faturası garantisi değildir. Sol kaynak dosyalarını doğrudan okumadı ve testleri kendisi çalıştırmadı; onay, sunulan kod kanıt paketi ve ana orkestratörün doğrulama sonuçları temelindedir. Çok dosyalı süreç çökmesinde atomiklik eksikliği belgelenmiş tasarım sınırıdır.
