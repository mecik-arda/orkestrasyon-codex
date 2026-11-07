# Codex–Hades entegrasyonu: yeniden değerlendirme

## 2026-11-08: Sonraki eval teslimi

Karar değişmedi: AST sınıflandırıcı üretim varsayılanı kapalı kalır; bağımsız Sol follow-up incelemesi kullanıcı kararıyla ertelenmiştir ve tamamlanmış sayılmaz. Sabit sentetik corpus ölçümünde benign etiketli sekiz örneğin legacy bulgusu AST'de bulgusuz kaldı; dört risk etiketli örnek de statik bulgusuz sonuç verdi. Bu ölçüm genel etkinleştirme veya kaynak teslimi için yeterli değildir; hedefli eval testleri 16/16 geçti.

Eval düzeltme paketi `0d13fd015fbcab545d5c1021f9c5d28a47e1472c` commit'iyle yerel `main` dalına alındı ve `origin/main` dalına push edildi. Commit sekiz görev dosyası içerir. Bu teslim, Sol incelemesini veya P6 koşulsuz kapanışını tamamlamaz. Bu kayıt önceki bölümlerdeki commit edilmemiş paket/Git durumu açıklamalarını güncel teslim açısından geçersiz kılar; tarihsel araştırma bulgularını değiştirmez.

## 2026-11-08: Güncel teslim ve politika kararı

Bu not aşağıdaki tarihsel açık kararların güncel durumunu belirtir. Kullanıcı, bağımsız Sol incelemesini daha sonraya bırakmış ve politika seçimini ana orkestratöre devretmiştir. Karar, AST sınıflandırıcısının varsayılan kapalı tutulması ve offline eval paketinin yalnız deneysel değerlendirme aracı olarak korunmasıdır. Üretim policy'sinde ilgili alan false olarak doğrulandı; bu işlemde üretim kodu, kişisel config veya canlı Hades ayarı değiştirilmedi.

Ana checkout günlük kullanım hedefidir; ba10 yeniden bağlanmayacaktır. Önceki opt-in kapatma ve restart sonrası katalog gözlemi bölüm 9'da kayıtlıdır. P2/P3/P4 işlevsel kabulleri korunur; Claude P1b ertelenmiş durumdadır. Bunlar genel bağımsız denetimin tamamlandığı anlamına gelmez.

Eval paketinin mevcut kaynakları için hedefli testler bu kapanış kontrolünde 16/16 geçti. Önceki tam verify:local kaydı 1.256 başarılı, 5 Windows koşullu atlama, sıfır başarısızlık ve 18.950 ms benchmark bildirir; bu turda tam paket yeniden çalıştırılmadı. Bu turdaki değişiklik yalnız iki rapordaki karar ve teslim kaydıdır. Ayrıntılar ve seçili kaynak hash'leri [preflight raporunun güncel kapanış bölümündedir](REVIEW_PREFLIGHT_RET_KATMANI_VE_KARAR_2026-10-27.md).

Ana checkout HEAD'i c9793ebc262699f6dbe90421423b260284ff399f; index boş, eval ve belge dosyaları commit edilmemiştir. Son kontrol sekiz değişmiş veya untracked dosya gösterdi. Kullanıcının stage/commit/push yapmama sınırı korunur. Bağımsız inceleme açık ve ertelenmiştir; kaynak teslimi, model veya provider çağrısı yapılmadı. Gelecekteki Sol bulguları yerel kaynak ve uygun regresyonlarla doğrulanmadan otomatik kabul veya uygulama yetkisi sayılmaz.


Rapor zamanı: 2026-11-07T20:52:36Z / 7 Kasım 2026 23:52:36 Türkiye saati.

İncelenen ana repository: C:\Users\user\Desktop\Yazılım_Siber\orkestrasyon-codex.

Bu sohbetin çalışma alanı: C:\Users\user\.codex\worktrees\ba10\orkestrasyon.

Son doğrulanan HEAD: c9793ebc262699f6dbe90421423b260284ff399f.

## Karar

Ana checkout için Codex Desktop/CLI ile Hades MCP bağlantısı çalışmaktadır. Bu sonuç, bütün worktree'lerin doğru hedefe bağlı olduğu veya genel geçişin bütün güvence kapılarıyla kapandığı anlamına gelmez.

Günlük kullanımın hedefi ana checkout ise temel yerel entegrasyon hazırdır. Kullanım hedefi bu sohbetin ba10 worktree'si ise mevcut Hades kaydı ayrıca değerlendirilmelidir: salt okunur kontrol bu worktree için needs_update döndürmüştür.

Bağımsız kaynak incelemesi, kabul sonrası opt-in tercihinin netleştirilmesi ve commit dışında kalan eval çalışmasının teslim durumu ayrı açık maddelerdir. Çalışan commit/config için bağımsız attestation bulunmaması, tek başına yeni bir entegrasyon özelliği geliştirme zorunluluğu değildir.

## Araştırma yöntemi ve sınırları

Bu değerlendirme aynı oturumda yapılan kaynak incelemesi, yerel salt okunur komutlar, canlı MCP resource gözlemleri ve yeni bir izole stdio bağlantı kontrolüne dayanır.

- Proje veya kişisel config değiştirilmedi.
- Provider/model görevi, capability probe, canlı batch, approval veya revalidation çağrılmadı.
- Gerçek Vault notu veya runtime metrics/bütçe defteri okunmadı.
- Tam test paketi bu araştırmada yeniden çalıştırılmadı.
- Mevcut Hades süreci yeniden başlatılmadı veya sonlandırılmadı.
- Yeni stdio kontrolü için yalnız mevcut sentetik ortam yardımcısının oluşturduğu geçici config/state alanı kullanıldı; kontrol sonunda temizlendi.
- Mevcut eval değişiklikleri korunmuştur.

Bu raporun kaydedilmesi, araştırmadan sonraki tek repository yazımı olarak ayrıca yetkilendirilmiştir. Stage, commit veya push kapsamda değildir.

## 1. Ana checkout kaydı

Doğrudan şu iki salt okunur giriş çalıştırıldı:

- node scripts/configure-codex-project.js --check
- node scripts/codex-diagnostics.js

İlk sonuç ok=true, status=ready, projectMcpReady=true verdi. Command, args, cwd, env_vars, timeout, required ve iki yönetilen env alanının tamamı match durumundaydı. Yayın yapılmadı; yedek ve koordinasyon kilidi oluşturulmadı.

İkinci sonuç status=ready verdi. Node, Git, Codex CLI ve Hades giriş dosyası gereksinimleri mevcut olarak raporlandı. Bu tanı user-global Codex config'ini okumadı; kendi başına canlı Desktop runtime veya sentetik E2E çalıştırmış gibi davranmadı.

Yapılandırılmış zincir:

- Node: C:\nvm4w\nodejs\node.exe
- Server: ana repository içindeki subagent-bridge\src\server.js
- cwd: ana repository kökü
- SUBAGENT_BRIDGE_TRUSTED_WORKSPACE: ana repository kökü

Kaynaklar: [proje kaydı](../../.codex/config.toml), [config giriş komutu](../../scripts/configure-codex-project.js), [yerel tanı](../../scripts/codex-diagnostics.js).

## 2. Canlı Hades gözlemi

Mevcut Hades bağlantısından iki resource listelendi ve okundu:

- hades://workspace/identity/v1
- hades://rules/attestation/v1

Workspace resource'u status=verified verdi. Hem processCwdSha256 hem trustedWorkspaceSha256 şu değerle eşleşti:

dc3d26eb65bfc4ef48a71103bfb33d44b73e7a1873139d2c6d7917b97248e68b

Bu değer, ana checkout'un yerel canonical yolundan hesaplanan hash ile de eşleşti.

Rule resource'u status=verified ve comparison=match verdi. Manifest SHA-256:

12fc701c8de57f7640e0f907da889381db4b66ff3aa218e328f1382c848caa1a

AGENTS.md, CLAUDE.md ve config/agent-rules.md için dönen boyut/hash değerleri, aynı dosyaların yerel ham baytlarıyla ayrıca karşılaştırılıp eşleşti.

Sınırlar:

- Resource startup_context=unavailable bırakmaktadır.
- Hash eşleşmesi, başlangıç kurallarının gerçekten modele yüklendiğini kanıtlamaz.
- Çalışan kaynak commit'i veya aktif config için bağımsız, kriptografik host attestation'ı yoktur.
- Mevcut araç envanteri erişilebilirliği gösterir; her sağlayıcının bugün yeni bir görevi başarıyla tamamlayacağını göstermez.

Kaynaklar: [workspace seçimi](../../subagent-bridge/src/frontends/mcp/workspace-context.js), [MCP server](../../subagent-bridge/src/frontends/mcp/server.js).

## 3. Yeni sentetik stdio kontrolü

Güncel ana checkout kodundan, gerçek MCP SDK Client ve StdioClientTransport ile ayrı bir Node server süreci başlatıldı. Mevcut createSmokeExecutionContext yardımcısının provider credential'ları dışlayan sentetik ortamı kullanıldı.

Kontrol; initialize/connect, tools/list, resources/list ve iki resource read işleminden oluştu. Genel smoke betiğinin health veya memory tool adımları çağrılmadı.

Gözlenen sonuçlar:

| Kontrol | Sonuç |
| --- | --- |
| Gerçek stdio bağlantısı | Başarılı |
| Araç sayısı | 18 |
| run_codex_subagent, run_task_profile, run_deepseek_subagent, run_antigravity_subagent | Mevcut |
| Emekli OpenCode/GLM/Kimi/Qwen/Space Bunny araçları | Yok |
| Dağıtım varsayılanında parallel batch aracı | Sunulmuyor |
| Sentetik child için approve_prepared_edit | Sunulmuyor |
| Workspace hash'leri | Beklenen ana checkout ile eşleşiyor |
| Rule manifesti | verified / match |
| Startup context | unavailable |
| Provider/model görev çağrısı | 0 |
| Health çağrısı | 0 |
| Hafıza aracı çağrısı | 0 |

Client kapatıldı ve bu kontrole ait geçici sentetik alan temizlendi. Bu başarı mevcut Desktop Hades sürecinin revizyonu, kişisel Vault sağlığı veya canlı provider erişimi için kanıt değildir.

Kaynak: [sentetik ortam yardımcısı](../../scripts/smoke-mcp-support.js).

## 4. Ana checkout ile ba10 worktree aynı hedef değil

Aynı güncel salt okunur config denetleyicisi iki canonical kök için çalıştırıldı.

| Hedef | Kök hash'i | Kayıt sonucu |
| --- | --- | --- |
| Ana checkout | dc3d26eb65bfc4ef48a71103bfb33d44b73e7a1873139d2c6d7917b97248e68b | ready |
| ba10 worktree | cfd9eb523277c24d99909ff6fcf90b34b1601506b510af5ed1105643cf85002c | needs_update |

Worktree için güncellenmesi gerektiği bildirilen alanlar:

- args
- cwd
- env.SUBAGENT_BRIDGE_TRUSTED_WORKSPACE

Canlı Hades ana checkout'u doğrulamaktadır. Bu sohbet ba10 worktree'sinde bulunduğu için Hades araçlarının otomatik olarak sohbetin worktree'sini hedeflediği varsayılmamalıdır. Mevcut resolver açık trusted-workspace env değerini cwd'nin önünde kullanır.

Bu rapor otomatik bir worktree yeniden bağlamasını yetkilendirmez. Önce kullanıcının hedefinin ana checkout mu yoksa ba10 worktree'si mi olduğu kesinleştirilmelidir. Config yazımı ve gereken restart ayrı operasyonel işlemlerdir.

## 5. Kabul sonrası opt-in durumu

Yerel loadRuntimeConfiguration çağrısı yalnız seçilmiş güvenli alanları raporlayacak biçimde kullanıldı. Config ve agents kaynakları okundu; credential değerleri, Vault notları ve runtime defteri okunmadı veya çıktılanmadı.

Yerel loader sonucu:

- Şema geçerli.
- Kaynak config v2; loader'ın bellekteki etkin şeması v3.
- parallelBatch.enabled=true.
- parallelBatch.editEnabled=true.
- reviewSourceSyntaxAwareClassifierEnabled=false.

Bu sonuç bu inceleme sürecinin diskteki config'i çözümlemesidir; çalışan Hades config'inin bağımsız attestation'ı değildir. Canlı katalogda parallel batch araçlarının sunulması ayrıca gözlenmiştir.

Geçiş planının kabul sonrası kararı, batch ve edit opt-in'lerinin kapalı tutulması ve gerektiğinde ayrı açılmasıdır. Mevcut açık değerler daha sonraki bilinçli kullanım tercihi olabilir; kayıtlar bu tercihi netleştirmeden bunu yetki atlama veya otomatik hata olarak nitelemek doğru değildir.

Kapanış için açık kalan soru: bu iki opt-in, güncel kullanım için bilinçli olarak mı açık tutuluyor? Bu araştırmada hiçbir değer değiştirilmemiştir.

Kaynak: [geçiş planı](../plans/CODEX_DESKTOP_UCTAN_UCA_GECIS_PLANI_2026-10-18.md), özellikle kullanıcı kararları ve P3 bölümü.

## 6. İşlevsel kabul ve bağımsız inceleme

Mevcut plan/durum kayıtları P2, P3 ve P4'ün özgün işlevsel kabullerinin tamamlandığını bildirir. Bu araştırma geçmiş provider/pilot/entegrasyon görevlerini tekrar çalıştırmamıştır.

- P2: hazırlık, ayrı onaylı uygulama, red, stale ve Windows disposable recovery kanıtları.
- P3: DAG/izleme, iptal/restart ve ayrı onaylı normal kaynak entegrasyonu kanıtları.
- P4: canonical DeepSeek read-only ve kaynak checkout'unu değiştirmeyen disposable edit kanıtı.
- Claude P1b: başarısız geçmişiyle kullanıcı kararı sonucu ertelenmiş; desteklenmiş sayılmaz.
- Son bağımsız kaynak incelemesi: bütün güncel kaynak kapsamı için tamamlanmamış.

Yerel preflight açıklamaları ve sentetik policy eval, bağımsız model incelemesi veya kaynak teslim onayı değildir. Bağımsız inceleme açığı çalışır MCP bağlantısından ayrı bir güvence kapısıdır.

Kaynaklar: [uygulama durumu](CODEX_DESKTOP_GECIS_UYGULAMA_DURUMU_2026-10-18.md), [bağımsız inceleme paketi](GECIS_BAGIMSIZ_INSAN_INCELEME_PAKETI_2026-11-02.md).

## 7. Son kayıtlı test ve Git kanıtının sınırı

Mevcut README ve eval raporundaki son kayıtlı tam verify:local sonucu:

- 1.254 başarılı test.
- 5 Windows koşullu atlama.
- 0 başarısızlık.
- Zorunlu seri benchmark 13,060 saniye.
- Sentetik stdio smoke ve sentetik config/Vault verify başarılı.
- Koşu kaynak snapshot SHA-256: ad286d2230bc899698f9e3e0a1d0d385debc02fec2e28421c0e698d58c71306c.

Bunlar önceki son-kaynak koşusunun kayıtlarıdır; bu araştırmada yeni bir tam test sonucu üretilmemiştir. Önceki aralıklı launcher hatasının kesin tetikleyicisi bilinmiyor olarak kalır.

HEAD c9793ebc262699f6dbe90421423b260284ff399f doğrulandı. Yerel origin/main ile rev-list karşılaştırması 0/35 verdi; fetch yapılmadığından uzak sunucunun güncelliği iddia edilmiyor.

Dört eval kaynak/test dosyasının dosya sisteminde bulunduğu ve HEAD ağacına dahil olmadığı doğrulandı. Bunların tam staged/unstaged durumu bu araştırmada bağımsız olarak yeniden doğrulanamadı: git status/diff komutları bu sandbox bağlamında worktree/erişim hatası verdi. Önceki kullanıcı raporu stage alanının boş olduğunu bildiriyor; bu rapor yeni bir “çalışma ağacı temiz” iddiası kurmaz.

Kaynaklar: [README](../../README.md), [eval ve politika raporu](REVIEW_PREFLIGHT_RET_KATMANI_VE_KARAR_2026-10-27.md).

## 8. Öncelikli sonraki kararlar

1. Günlük kullanımın hedefi ana checkout mu, ba10 worktree'si mi? Bağ doğru hedefe göre korunmalı veya ayrı yetkili işlemle güncellenmelidir.
2. Parallel batch/edit opt-in'leri bilinçli kullanım için açık mı kalacak, kabul sonrası kapalı duruma mı dönecek?
3. Eval değişiklikleri, kullanıcının mevcut commit/push yapmama tercihi korunarak hangi teslim durumunda tutulacak?
4. Bağımsız kaynak incelemesi için mevcut güvenlik kapılarına uygun yol nasıl sağlanacak? Yerel ölçüm bu kapıyı kendiliğinden kapatmaz.

Bu maddeler netleşmeden bütün worktree'ler, bütün sağlayıcılar ve bütün denetim kapıları için koşulsuz tamamlanma iddiası kullanılmamalıdır. Ana checkout'un yerel MCP entegrasyonu ise bu araştırmada doğrudan doğrulanmıştır.

## Resmî Codex kaynakları

Erişim tarihi: 7 Kasım 2026.

- [Model Context Protocol](https://learn.chatgpt.com/docs/extend/mcp): command/args/env/env_vars/cwd sözleşmesi ve proje config'i.
- [Config basics](https://learn.chatgpt.com/docs/config-file/config-basic): proje güveni ve config katmanı öncelikleri.

Proje config'inin varlığı tek başına etkin config yüklemesini kanıtlamaz. Bu nedenle dosya denetimi, canlı resource gözlemi, sentetik stdio kontrolü ve geçmiş kabul kanıtları bu raporda ayrı tutulmuştur.



## 9. 2026-11-08 operatör restart sonrası kapanış kaydı

Kullanıcı Hades MCP'yi yeniden başlattığını bildirdi. Salt okunur kontrolde yapılandırılmış başlangıç zinciri doğrulandı; canlı workspace identity'nin repository köküyle eşleştiği ve kural kaynağı karşılaştırmasının tutarlı olduğu gözlendi. Identity kaydı çalışan commit'i, etkin kişisel config'i veya startup sırasında yüklenen kuralları kriptografik olarak doğrulamaz; kaynak context attestation'ı mevcut değildi.

Canlı katalog 21 araç gösterdi; paralel batch ve entegrasyon araçları sunulmuyordu. run_codex_subagent ve run_task_profile görünür durumdaydı. Bu salt okunur katalog gözlemi, gizli/başka oturum durumuna veya çalıştırma yoluna dair ek kanıt sayılmaz.

Bu operasyonel gözlem, önceki opt-in kapatma işleminin ardından pilot yüzeyinin yeniden başlatma sonrasında katalogdan kalktığını destekler. P2/P3/P4 plan kapsamındaki işlevsel kabuller kayıtlı tamamlanmış durumdadır; Claude P1b başarısız geçmişi korunarak ertelenmiştir. Bağımsız kaynak incelemesinin kapsam açığı kapanmamıştır. Bu not kaynak kodu, kişisel config'i veya katalog durumunu değiştirmez ve bağımsız denetim ya da genel geçişin koşulsuz kapanışı anlamına gelmez.
