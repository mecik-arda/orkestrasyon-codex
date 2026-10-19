# Sol Danışması ve Kalan Plan Maddeleri Kararı (2026-09-19)

- Kapsam: `docs/reports/PLAN_DURUM_VE_TAMAMLANMA_RAPORU_2026-09-18.md` içindeki açık/kısmi/bloklu maddelerin şimdi uygulanıp uygulanmayacağı.
- Kaynak danışma: Codex Sol (`gpt-5.6-sol`), salt-okunur, tek deneme, 177 saniye, retry 0; kaynak satırlı öneri.
- Ana orkestratör doğrulaması: `edit:feedback`, `edit:classify`, `metrics`, `memory:evaluate`, `memory:repair`, `memory:doctor`, `hook:install` komutlarının varlığı yerelde doğrulandı; hook kurulum durumu denetlendi.
- Kullanıcı kararı: Sol'un önerdiği sırayla ilerlenmesi onaylandı (2026-09-19).

## 1. Karar Özeti

- Yeni büyük altyapı geliştirmesi başlatılmaz.
- Şimdi yürütülecek tek yatırım, mevcut mekanizmalar üzerinden iki gerçek veri akışıdır:
  - Faz 4 gerçek kullanıcı edit etiketlemesi.
  - M2 salt-okunur hafıza hook pilotu (kullanıcı opt-in).

## 2. Şimdi Yürütülecek İşler

### 2.1 Faz 4 edit etiketleme

- Amaç: en az 30 uygun ve etiketli gerçek kullanıcı edit sonucu toplamak.
- Kayıt: gerçek edit sonrasında `npm run edit:feedback`; iç test/ölçüm kayıtları için `npm run edit:classify dispose`; periyodik `npm run metrics`.
- Kural: toplu veya geriye dönük varsayımsal kabul yapılmaz; sentetik, test ve yinelenen koşular paydadan çıkar.
- Kapı: 30 etiket sonrası istenmeyen/geri alınan oran yüzde 10 ve üzerindeyse ve kullanıcı sorunu doğrularsa Faz 5 yeniden değerlendirilir.

### 2.2 M2 hafıza hook pilotu

- Pilot ölçütleri ve geri çekme koşulları: `docs/reports/IKINCI_BEYIN_M2_PILOT_KRITERLERI_2026-09-18.md`.
- Kurulum durumu (2026-09-19):
  - OpenCode: proje kapsamında `.opencode/plugins/second-brain-memory.js` kurulu; `SUBAGENT_SECOND_BRAIN_HOOK=1` iken etkin; dosya git dışında.
  - Codex: `~/.codex/hooks.json` UserPromptSubmit kaydı kurulu; Codex `/hooks` güven incelemesi tamamlanmadan çalışmaz.
  - Claude Code: snippet üretimi mevcut, elle birleştirme kullanıcı kararına bağlı; pilot dışı bırakılabilir.
  - Antigravity: doğrulanmış hook yüzeyi yok; pilot dışı.
- Kullanıcı adımları: OpenCode oturumları için `SUBAGENT_SECOND_BRAIN_HOOK=1` (2026-09-19 tarihinde kullanıcı ortam değişkeni olarak ayarlandı; bir sonraki OpenCode başlatmasında etkin); Codex için `/hooks` incelemesi.
- Codex istemci uçtan uca doğrulandı: örnek UserPromptSubmit girdisiyle geçerli JSON ve 628 karakter `additionalContext` üretildi; çıktı 1200 karakter sınırı içinde. Güven incelemesi atlanmadı; `--dangerously-bypass-hook-trust` kullanılmadı.
- 2026-09-19 tespit ve düzeltme (kök neden): Codex, Windows'ta hook komutunu oturum kabuğuna (PowerShell) `-Command` olarak veriyor; komut içindeki çift tırnaklar PowerShell'de parse hatası üretip `hook exited with code 1` ile sonuçlanıyor. Aynı hata biçimi yerelde birebir çoğaltıldı (Node `spawn` ile standart Windows argument kaçışı kullanılarak; tırnaklı komut PowerShell'de exit 1, tırnaksız komut hem PowerShell hem cmd'de exit 0 ve geçerli bağlam). Kurulum aracı artık Windows'ta yalnız kabuk-güvenli (boşluk, tırnak ve yüzde içermeyen) yolları tırnaksız komut olarak üretir; güvensiz yollarda kurulum fail-closed durur (`unsafe_command_path`). `~/.codex/hooks.json` yeniden kuruldu; hook hash'i değiştiği için Codex'te bir kez daha güven incelemesi gerekir. Regresyon: HOOK-07.
- Hook istemcisi süreç düzeyinde fail-soft yapıldı: modül yükleme hataları dahil tüm hatalar yakalanır, mutasyon yapılmaz; hata mesajı yalnız yollar maskelenerek sınırlı `%TEMP%` tanılama günlüğüne yazılır ve süreç her durumda sıfır kodla biter.
- Codex hook davranışı: hook'lar hem etkileşimli TUI hem `codex exec` akışında çalıştırılır; düzeltme öncesi her ikisinde de `hook exited with code 1` ile başarısızdı, düzeltme sonrası etkileşimli oturumda enjeksiyon doğrulandı.
- Pilot başlangıç kaydı (2026-09-19, 17:42): Etkileşimli Codex oturumunda hook hatasız çalıştı; oturum kaydında `hooks.additional_context` türünde geliştirici mesajı ve `## İkinci Beyin Hafıza Bağlamı` başlığı doğrulandı (bir Vault alıntısı, `UNTRUSTED_CONTENT` etiketiyle). Tanılama günlüğü temiz; `Hook failed` gözlenmedi. M2 pilotu Codex kolunda başladı; OpenCode kolu bir sonraki OpenCode oturumunda etkinleşir.
- Faz 4 kohort başlangıcı (2026-09-19): İlk gerçek kullanıcı edit sonucu kaydedildi. İş: otomatik altyazı dalı için VIDEO-09 testi (`tests/video-transcript.test.js`, 43 satır ekleme, üretim kodu değişmedi). Yürütücü: DeepSeek Flash (kontrollü edit, disposable workspace + doğrulanmış promotion; DeepSeek Pro denemesi rate limit nedeniyle başarısız oldu ve kayda geçmedi). Kullanıcı kararı: `accepted`; kayıt kimliği `80a5e43b4954`. Tüm test paketi yeşil.
- Faz 4 ikinci iş kaydı (2026-09-19, akşam): Savunmacı hafıza kurtarma dalları için kontrollü edit döngüsü. Run1 (`e019ffa9ec22`, DeepSeek Flash): REC-16..19 testleri; Gemini denetimi 5 bulgu verdi (3 test kalitesi, 2 üretim tutarlılığı) ve kullanıcı kararı `minor_fix` oldu. Run2 (`7f402609253c`, DeepSeek Flash, çok dosyalı onay kapısından geçti): `memory.js` içine ad-içerik uyuşmazlığı için fail-closed guard ve tarama hatası sonucuna `unresolvedCount: 0`; testlerde sayaç asserti, `appliedCount`/`appliedItems`/dosya içeriği assertleri ve REC-20 silinme yarışı. İkinci Gemini denetimi doğruluk veya flakiness bulgusu vermedi; 4 düşük önemli iyileştirme önerdi ve kullanıcı ince ayar istedi; karar `minor_fix`. Run3 (`16141ae65f86`, DeepSeek Flash): karma dizin fail-closed testi REC-21 ve eksik assert'ler; tüm test paketi ve `verify` yeşil; kullanıcı kararı `accepted`. `planMemoryMutationRecovery` tarama hatasında teşhis amaçlı öğe listeleme davranışı bilinçli olarak korundu; uygulama kapısı `applyMemoryMutationRecovery` fail-closed. Onay sürecinde çalışan iç Sol doğrulama koşusu `ineligible_instrumentation` (`internal_approval_validation`) olarak kohort dışına alındı. Kohort özeti: 2 accepted, 2 minor_fix, 0 geri alınan; eşik 30 kayıt.
- Pilot bitişi: 15 etiketli oturum veya iki hafta; sonunda Sol denetimi ve kullanıcı kararı ile devam/genişletme/geri çekme.
- İzleme: `npm run memory:evaluate` pilot öncesi/sonrası karşılaştırma; oturum başına ortalama hook süresi 1500 ms altı.

## 3. Kapıya Bağlı Maddeler ve Açılış Tetikleyicileri

- Faz 5 (izole onaylı Codex edit run'ı): 30 uygun etiket + yüzde 10 ve üzeri istenmeyen/geri alınan oran + kullanıcı doğrulaması.
- Faz 6 (lifecycle olayları): Faz 5 akışında tekrarlayan crash, temizlenmemiş worktree, belirsiz onay durumu veya kayıtlarla açıklanamayan apply olayı.
- Faz 7 (paralel review A/B): aylık bütçe yenilendikten sonra 20 karşılaştırılabilir read-only görev ve ayrılmış deney bütçesi.
- O5: gerçek supersede vakasıyla birlikte ölçülmüş retrieval hatası.
- O7: paylaşılan veya çok kullanıcılı Vault gereksinimi.
- O8: mevcut değerlendirme setinde NDCG, MRR, recall, abstention veya gecikme eşiğinin bozulması.
- O9: mevcut redakte olay setiyle çözülemeyen somut teşhis vakası.
- O10: arşiv semantiği ve doğrulanabilir bütünlük baseline'ı tanımlandıktan sonra gerçek arşiv ihtiyacı.
- Context Aşama 2: bir işin gerçekten birden fazla oturuma bölünmesi ve mevcut aktarımın kayıp veya belirsizlik üretmesi.
- Context Aşama 3: bir sonraki orta karmaşıklıktaki değişiklikte mini-spec, diff ve test sonucunun bire bir doğrulanması.
- Antigravity global ayar izolasyonu (Bulgu 3): execution bazlı config yüzeyi, gerçek ayar kirlenmesi olayı veya eşzamanlı Antigravity çalıştırma gereksinimi.

## 4. Gereksiz ve Ertelenen

- V3 P2 kullanıcı yönlendirmeli onarım komutları gereksiz bulundu: `memory:repair` (dry-run, `--apply`, `--force`, WAL, promote uzlaştırma) uygulanmış ve canlı Vault onarılmış durumda.
- Context Aşama 4-5 için yalnız resmi kapanış kaydı yazmak şu an bürokrasi sayıldı; gerçek iş üzerinde kapanacak.
- Faz 7 ve Antigravity global ayar izolasyonu bütçe ve kapsam gereği ertelendi; kalan aylık bütçe yaklaşık 7,4 USD.

## 5. Faz 5'in Ölçümsüz Başlatılmasının Riski

- Kanıtlanmamış kullanıcı sorunu için yazma yetkili yeni MCP aracı, geçici worktree, onay tokenı, kalıcı manifest, writer lock ve Git güvenlik yüzeyi eklenir.
- Faz 4 verisi olmadan "geri alma oranı baseline'a göre düştü mü" ve "yatırım gerçek sorunu çözdü mü" kriterleri değerlendirilemez.
- Onaysız ana worktree mutasyonunun sıfır olması, orphan process/worktree bulunmaması, idempotent cleanup ve Windows/Linux adversarial testleri baseline'dan bağımsız güvenlik kriterleri olarak geçerliliğini korur; ancak bunlar tek başına Faz 5 yatırımını gerekçelendirmez.

## 6. Doğrulama Kaydı

- Danışma çıktısındaki tüm öneriler kaynak satırı içerir; ana orkestratör komut envanterini ve hook kurulumunu bağımsız doğruladı.
- Bu belge karar kaydıdır; planları geriye dönük değiştirmez. Pilot sonuçları ve etiket kohortu ayrı raporlarda izlenir.
