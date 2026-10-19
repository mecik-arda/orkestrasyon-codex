# İkinci Beyin M2 Pilot Başarı Ölçütleri ve Geri Çekme Koşulları

Tarih: 2026-09-18
Durum: Uygulama kaydı; M0/M1 ve M2 ilk dilimi tamamlandı.
Kapsam: Salt-okunur hafıza hook'u pilotu (OpenCode, Codex, Claude Code) ve tüketim profilleri.

Bu belge ölçüt ve geri çekme koşullarını tanımlar; hook davranış sözleşmesini değiştirmez. Sayısal test envanteri vermez; güncel doğrulama `npm test` ve `npm run verify:ci` ile izlenir.

> Durum notu (2026-09-21): OpenCode kurulumunda kayıt açığı bulundu; kurulu dosya düzeltildi, etkinlik yeniden başlatılmış OpenCode oturumunda doğrulanacak. Kurulu `.opencode/plugins/second-brain-memory.js` dosyası, şablon güncellenmiş olmasına rağmen eski üretimdi; `SUBAGENT_SECOND_BRAIN_HOOK=1` etkinken bağlam enjekte ediliyor ancak `recordMemoryHookSession` çağrısı bağlı olmadığı için OpenCode oturum kaydı hiç üretilmiyordu (0 OpenCode kaydı; Codex kayıtları mevcut). Düzeltme: `npm run hook:install -- --client=opencode --apply --force` ile dosya yeniden üretildi; üretilen plugin artık `onContextInjected` üzerinden `recordMemoryHookSession` çağırıyor. Şablon regresyonuna karşı `tests/memory-hook.test.js` HOOK-05 testi üretilen kaynağın callback bağlantısını doğrular; HOOK-08 testi plugin geri çağrısının geçici metrik alanında `opencode` oturum kaydını bir kez ürettiğini uçtan uca doğrular. Kapanış kanıtı: OpenCode yeniden başlatıldıktan sonra ilk gerçek oturumda `client: opencode` kaydının görülmesi ve aynı oturum için yinelenen kayıt üretilmemesi. Kurulum dosyaları git dışındadır; şablon değiştiğinde kurulu kopyalar yeniden üretilmelidir ve plugin yapılandırması oturum içinde sıcak yüklenmediği için OpenCode yeniden başlatılmalıdır.
> Durum notu (2026-09-21, Codex kayıtları): Metrik alanında 112 Codex `memory_hook_session` kaydı vardır ve zaman damgaları bridge/enstrümantasyon çalışmalarıyla örtüşmektedir. Etiketlemeden önce her kaydın gerçek kullanıcı oturumu olduğu doğrulanmalı; teknik/araç çalışmalarına ait kayıtlar `npm run hook:classify -- ineligible_instrumentation --client=codex --session-id=<session-id>` ile payda dışı bırakılmalıdır. Aksi halde pilot paydası kirlenir.
> Ölçüm notu (2026-09-21, süre semantiği): Canary oturumunda durationMs 6930 ms kaydedildi; neden, OpenCode plugin ölçümünün mesaj gönderimi ile system transform arasındaki pencereyi kapsamasıydı. Bu, 1500 ms süre kapısını hatalı tetikleyebilirdi. Plugin artık yalnızca `runHook` çalışmasını ölçer; Codex istemcisi de aynı sınıra getirildi (stdin okuma, ayrıştırma ve çıktı yazma artık süreye dahil değil), böylece iki istemci aynı semantiği kullanır. Ölçüm `now` parametresiyle enjekte edilebilir; her iki istemcide varsayılan monotonik `performance.now()`'dur ve negatif süre sıfıra kırpılır. HOOK-06, HOOK-08, CLIENT-03 ve CLIENT-07 testleri sahte saatle tam süre değerini ve saat gerilemesi davranışını doğrular (pencere boşluğu dahil edilseydi testler düşerdi). Canary oturumu (2026-09-21T18:40:23Z, sessionIdHash 8e41c87b ile başlar) teknik doğrulama oturumudur; ham session ID yerel log üzerinden hash eşleşmesiyle bulundu ve `ineligible_instrumentation` olarak sınıflandırıldı (gerekçe: technical_verification_canary). Kayıt geriye dönük değiştirilmez. Yeniden başlatma sonrası doğrulama (2026-09-22): taze OpenCode oturumu (2026-09-22T11:15:00Z, sessionIdHash f39bebf5 ile başlar) tek kayıt üretti ve durationMs 28 ms ölçüldü; pencere ölçümü ortadan kalktı ve 1500 ms süre kapısının çok altında kaldı. Bu oturum da teknik doğrulama olduğu için `ineligible_instrumentation` olarak sınıflandırıldı. Aynı oturumun yeniden başlatma sonrası kaldığı yerden devam etmesi durumunda yeni kayıt üretilmedi (oturum başına tekil kayıt davranışı doğrulandı). Düzeltme plugin modülünde olduğundan etkinlik için OpenCode yeniden başlatılmalıdır.
> Sınıflandırma olayı (2026-09-23): Norn'daki ilk OpenCode kaydı (2026-09-22T17:21:56Z, sessionIdHash 0ff11a59 ile başlar, başlık "NORN: Yerel AI ile otonom pentest aracı") 2026-09-22T17:23Z'de başka oturumun "teknik doğrulama" bildirimi üzerine `ineligible_instrumentation` olarak işaretlenmişti. Geriye dönük inceleme bu oturumun gerçek iş oturumu olma ihtimalini gösteriyor; disposition'lar eklemeli olduğu için kayıt değiştirilemez ve bu veri noktası pilot paydasına alınamaz. Yeni kural: bir oturum yalnızca kullanıcının oturum sonu kararıyla `eligible_real_user` sınıflandırılır ve etiketlenir; `ineligible_instrumentation` yalnızca birinci elden teknik olduğu doğrulanan oturumlara (ör. bizim başlattığımız doğrulama) verilir; başka ajanın çıkarımı tek başına sınıflandırma gerekçesi değildir. Aynı gün Norn ana oturumunun üç `@explore` alt-ajan oturumu (sessionIdHash 872eeffa…, 708a1896…, 46a44424…; 2026-09-23) `ineligible_instrumentation` / `subagent_task_session` olarak kapatıldı; bunlar kullanıcı oturumu değildir. Sol danışması (2026-09-23, gpt-6-sol): tek oturum için düzeltme istisnası açılmaması, kaybın kabul edilip pilotun yeni gerçek oturumlarla sürdürülmesi önerildi; eklemeli düzeltme mekanizması ancak ihtiyaç tekrarlarsa genel ve önceden yayımlanmış politika olarak tasarlanmalıdır (yalnız kanıtlanmış `ineligible_instrumentation → eligible_real_user` operatör hatası; uygunluk kararı sonuçtan bağımsız; aynı hata sınıfındaki tüm kayıtlar için yayımlanmış seçim listesi; özetleyici etkin disposition'ı türetir, ilk kaydı değiştirmez).

## 1. Pilot Kapsamı

- OpenCode plugin: `npm run hook:install -- --client=opencode --apply`; `SUBAGENT_SECOND_BRAIN_HOOK=1` iken etkin. `chat.message` + `experimental.chat.system.transform` ile oturum başına en fazla beş alıntı ve 1200 karakter bağlam.
- Codex: `npm run hook:install -- --client=codex --apply` (`~/.codex/hooks.json`); Codex `/hooks` güven incelemesi tamamlanmadan çalışmaz.
- Claude Code: `npm run hook:install -- --client=claude` yalnız `settings.json` snippet'i üretir; kullanıcı elle birleştirir.
- Antigravity: Bu CLI sürümünde doğrulanmış hook yüzeyi yok; pilot kapsamı dışındadır ve hook desteği iddia edilmez.
- Tüm istemcilerde hook yalnız `searchPersistentMemory` yolunu kullanır; yazma, yayınlama, taşıma veya onarım yeteneği taşımaz.

## 2. Başarı Ölçütleri

Güvenlik (zorunlu, tavizsiz):
- Pilot boyunca hook kaynaklı 0 yazma, 0 yayınlama, 0 silme ve 0 taşıma olayı.
- Secret, karantina, taslak veya süresi dolmuş not hiçbir bağlama sızmaz; bunu hedefleyen testler yeşil kalır.
- Hook kapalıyken 0 yan etki; hafıza erişilemezken oturum kesintisiz devam eder.
- Bağlam her zaman 1200 karakter ve 5 sonuç tavanında kalır; profil tavanı aşamaz.

Ölçülebilir fayda:
- En az 15 gerçek hook oturumu etiketlenir; `useful`/`partial` oranı pilot fayda göstergesi, `not_useful` oranı geri çekme göstergesidir.
- Yanlış sorguda abstention korunur; `npm run memory:evaluate` sonucu pilot öncesine göre düşmez.
- Oturum başına ortalama hook süresi 1500 ms altındadır; hook hatası oturum hatası üretmez.

Geri bildirim toplama:
- Kullanıcı, gerçek hook bağlamı enjekte edilmiş oturum sonunda bağlamı `useful`, `partial` veya `not_useful` olarak işaretler; sonuç redacted biçimde mevcut kullanıcı etiketleme akışıyla kaydedilir.
- Etiketleme komutu: `npm run hook:feedback -- useful --client=codex --session-id=<session-id>`; özet `npm run hook:feedback -- list` veya `npm run metrics` ile görülür. Oturum ve hook süresi hook tarafından doğrulanır; yalnız istemci, sonuç, süre ve opaque hash saklanır.
- Etiketleme öncesi oturum sınıflandırma komutu: `npm run hook:classify -- eligible_real_user --client=codex --session-id=<session-id>`. Uygunluk kaydı olmadan veya `eligible_real_user` dışında sınıflandırılan oturumlar pilot paydasına ve geri bildirime alınmaz.
- Başka bir gerçek session, aynı metrik alanında session kaydı bulunduğu sürece mevcut terminalden etiketlenebilir; proje planının veya genel görev sonucunun topluca `useful` olarak etiketlenmesi geçersizdir.
- Session ID, hook süresi veya uygunluk kaydı bulunmuyorsa gözlem yalnız nitel not olarak bırakılır; retroaktif metadata ve sentetik session oluşturulmaz.
- Pilot boyunca prompt, alıntı içeriği, workspace yolu veya oturum kimliği loglanmaz.

Pilot süresi:
- 15 etiketli oturum veya iki hafta, hangisi önce dolarsa. Süre sonunda Sol denetimi ve kullanıcı kararı ile devam/genişletme/geri çekme kararı verilir.

## 3. Geri Çekme Tetikleyicileri

Aşağıdakilerden herhangi biri gerçekleşirse pilot derhal durdurulur:
- Herhangi bir yazma, yayınlama, silme veya taşıma gözlemi.
- Secret veya karantina içeriğinin bağlama sızması.
- Bağlam bütçesi veya sonuç tavanının aşılması.
- Hook kaynaklı oturum kesintisi, donma veya tekrarlayan hata.
- Etiketli oturumların yarısından fazlasında `not_useful`.
- p95 hook süresinin 1500 ms üzerine çıkması.

## 4. Geri Çekme Prosedürü

- OpenCode: `SUBAGENT_SECOND_BRAIN_HOOK` değişkenini kaldır veya üretilen plugin dosyasını sil.
- Codex: `~/.codex/hooks.json` içindeki ilgili `UserPromptSubmit` kaydını kaldır veya `/hooks` üzerinden devre dışı bırak.
- Claude Code: `settings.json` içindeki snippet'i kaldır.
- Profil: `memory.activeProfile` değerini `manual` yap veya `SUBAGENT_MEMORY_PROFILE=manual` ver.
- Veri kaybı riski yoktur; hook salt-okunur olduğundan geri çekme migrasyon veya uzlaştırma gerektirmez. Audit ve metrik kayıtları redacted biçimde korunur.

## 5. Kapsam Dışı

- Hook üzerinden otomatik not yazma veya yayınlama.
- İstemci sohbetlerinin tamamını state, audit veya Vault'a aktarma.
- Antigravity hook entegrasyonu (doğrulanmış yüzey yok).
- Otomatik profil değiştirme; profil seçimi kullanıcı veya politika kararıdır.

## 6. Durum

- M0: tamamlandı (doktor, geri okuma testi, state sınıflandırması).
- M1: tamamlandı (sürüm sözleşmesi, explicit state migrasyonu, checkpoint redaksiyonu migrasyon katmanında).
- M2: OpenCode, Codex ve Claude Code istemcileri ile tüketim profilleri uygulandı; pilot ölçütleri ve geri çekme koşulları bu belgede kayıtlıdır. Pilot, kullanıcı hook'u etkinleştirdiğinde başlar; bu belge ölçüm için tek referanstır.

## 7. MCP Kural Attestation Sınırı

- `hades://rules/attestation/v1` resource'u M2 hafıza hook'undan bağımsızdır ve M2 pilot session'ı oluşturmaz.
- Resource okunması, `startup_context` kanıtı veya `useful`, `partial`, `not_useful` etiketi için yeterli değildir; M2 etiketi yalnız gerçek hook bağlamı enjekte edilmiş session için kullanıcı tarafından seçilebilir.
- Mevcut resource sonucunda `startup_context: unavailable` kalır; host loader hook'u eklenmeden startup context kanıtı varsayılmaz.
- Resource sözleşmesi ve güven sınırı `docs/plans/yapilanlar/MCP_KURAL_DOGRULAMA_PLANI_2026-09-20.md` içinde tutulur; resource değişiklikleri `npm run smoke`, `npm test` ve güncel CI doğrulamasıyla izlenir.
