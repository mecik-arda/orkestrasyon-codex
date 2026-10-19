# İkinci Beyin V3 Desen Uyarlaması Planı

Tarih: 2026-09-18
Durum: Taslak plan; uygulama onayı bekliyor.

> Durum notu (2026-09-18): Bu belge tarihsel plandır; güncel doğrulama için `npm test` ve `npm run verify:ci`. M0 tamamlandı (salt-okunur doktor, oturumlar arası geri okuma testi, state sınıflandırma raporu). M1 tamamlandı (Vault/state/config sürüm sözleşmesi, explicit ileri migrasyon ve checkpoint redaksiyonu; varsayılan state OS yerel veri dizinindedir). M2 uygulandı: OpenCode, Codex ve Claude Code için opt-in salt-okunur hook, tüketim profilleri ve güvenlik invariantları; pilot başarı ölçütleri ve geri çekme koşulları `docs/reports/IKINCI_BEYIN_M2_PILOT_KRITERLERI_2026-09-18.md` içindedir. Açık kalanlar: canlı pilot ölçümü kullanıcı hook'u etkinleştirdiğinde başlar; Antigravity hook yüzeyi bu sürümde doğrulanmadı; kullanıcı yönlendirmeli onarım komutları (P2) ve V2 Faz 4 etiketleme ayrı karar kapılarıdır.
> İkinci durum notu (2026-09-19): Kalan plan maddeleri Sol danışması ve kullanıcı kararı ile sıralandı; M2 canlı pilotu kullanıcı opt-in adımlarıyla başlatılıyor. Kurulum: OpenCode plugin proje kapsamında kurulu (`SUBAGENT_SECOND_BRAIN_HOOK=1`), Codex `~/.codex/hooks.json` kurulu (`/hooks` güven incelemesi bekliyor). P2 onarım komutları gereksiz kabul edildi (`memory:repair` mevcut); O5/O7-O10 kendi olay kapılarında bekliyor. Karar kaydı: `docs/reports/SOL_DANISMA_VE_KALAN_PLAN_KARARI_2026-09-19.md`.
> Üçüncü durum notu (2026-09-21): Video kaynaklı planların uygunluk ve fayda-zarar analizi `docs/reports/VIDEO_KAYNAKLI_PLANLAR_UYGUNLUK_ANALIZI_2026-09-21.md` ile yapıldı ve Sol denetiminden APPROVED aldı. Bu planın statüsü değişmedi: M0-M2 uygulandı, M2 canlı pilotu ve koşullu maddeler açık; otomatik hafıza yazımı ve bulut semantik katman reddi teyit edildi.
Kapsam: Orkestrasyon köprüsünün kalıcı hafızası ("ikinci beyin") için, Avenox İkinci Beyin V3 yaklaşımından uyarlanabilir desenler.

Bu belge bir karar ve iş kırılımı planıdır; repository davranışını değiştirmez. Araştırma `proje-kesif-planlama` akışına göre yürütülmüştür: Gemini 3.8 Flash ile dış kaynak analizi, DeepSeek Flash ile yerel yapı tespiti, Sol ile uygulanabilirlik tartışması.

## 1. Hedef ve Kapsam

- Orkestrasyon köprüsünün mevcut `memory/` Vault yapısını, video ve resmi kurulum rehberinde tanımlanan İkinci Beyin V3 desenleriyle karşılaştırmak.
- Bizde eksik olan ve mimariye uyarlanabilir desenleri, güvenlik sınırlarını bozmadan önceliklendirmek.
- Uygulanabilir bir kilometre taşı, kabul kriteri ve doğrulama planı üretmek.

## 2. Hedef Dışı Bırakılanlar

- Vault'u üçüncü taraf bir ürüne taşımak veya harici bir CLI'ye bağımlı kılmak.
- Hook üzerinden otomatik not yazma veya yayınlama.
- Mevcut güvenlik kontrollerini (secret taraması, SHA-256 kilidi, karantina, path/symlink koruması) gevşeten her türlü "ekonomik" değişiklik.
- Yayınlanmış notların içeriğini otomatik geri alan ters migrasyon.
- İstemci sohbetlerinin tamamını state, audit veya Vault'a aktarmak.
- İki farklı state kopyasını sessizce birleştirmek.

## 3. Kaynak ve Karşılaştırma Özeti

Mevcut yapımız:
- `memory/` altında Obsidian uyumlu Markdown Vault (Git dışı); klasörler `00_Inbox`, `01_Projects`, `02_Areas`, `03_Resources`, `04_Archive`, `06_Metadata`.
- Frontmatter: title, created, updated, confidence, verification, memory_type, tags, sources, review_after, valid_until, task_id.
- MCP araçları: search, read, analyze_memory_write, store (draft), promote (SHA-256 çift kilit), review.
- Güvenlik: secret/injection taraması ve karantina; DeepSeek için Vault kökü yasak; redakte audit.
- Doğrulama: retrieval değerlendirmesi (precision/recall/abstention).

Video (İkinci Beyin V3) yapısı:
- Kök: `beyin.py` (doctor, preferences, context, sync), `.beyin-version`, `.beyin-runtime.json`.
- Skill'ler: `.agents/skills/beyin`, `beyin-doktor`, `beyin-guncelle`.
- State vault dışında OS yerel uygulama veri dizininde.
- Hook entegrasyonu (Codex `/hooks`; Claude Code ve Antigravity workspace güveni).
- Tüketim profilleri: Normal, ekonomik mod, kontrol aralığı, otomatik kontrolleri kapatma.

## 4. Desen Kararları

Sol değerlendirmesi ve orkestratör kararı:

1. Kullanıcıya dönük sağlık/teşhis ("doktor") akışı — Kabul.
   - Varsayılan salt okunur; onarım ayrı ve açıkça yetkilendirilmiş işlem.
   - Bozuk frontmatter, süresi dolmuş kayıt, çakışma, karantina, erişim ve sürüm uyumu raporlanır.
   - Hiçbir notu otomatik silmez, taşımaz, birleştirmez veya yayınlamaz; secret veya not içeriği tanı çıktısına taşınmaz.

2. Sürümlü yükseltme ve kurtarma — Kabul (P1).
   - Ayrı sürüm eksenleri: Vault veri şeması, uygulama/bridge, state şeması, config şeması.
   - Geri alma, veri kaybettiren otomatik ters migrasyon değil; doğrulanmış yedek/manifest ve ileriye uyumlu kurtarma.

3. State'i Vault ve repo dışına taşıma — Kabul, aşamalı geçiş (P1).
   - Repo dışına: kilitler, geçici çalışma bilgisi, istemci oturum durumu, yerel cache, makineye özgü yollar, türetilmiş indeksler.
   - Repo içinde kalır: şema tanımları, varsayılan/örnek yapılandırmalar, deterministik test fixture'ları, migrasyon tanımları.

4. Hook ile otomatik bağlam yakalama — Sınırlı kabul (P1 pilot); otomatik yazma reddedildi.
   - Yalnız salt okunur retrieval; açık MCP modelinin yerine geçmez.
   - Varsayılan kapalı/opt-in; en fazla beş sonuç ve düşük bağlam bütçesi.
   - Secret/injection filtresi retrieval öncesi ve sonrasında çalışır; soft-expired, taslak ve karantina notları alınmaz.
   - Hook hatası ana oturumu durdurmaz; "memory unavailable" davranışı uygulanır.

5. Tüketim profilleri — Kabul (P2).
   - Profil yalnızca otomatik retrieval açık/kapalı, kontrol aralığı, sonuç ve bağlam bütçesi, sağlık kontrolü sıklığı gibi otomasyon parametrelerini etkiler.
   - Secret taraması, path/symlink koruması, SHA-256 kilidi, şema doğrulaması, karantina ve yazma/yayınlama yetkileri değişmez.

6. Oturumlar arası geri okuma kabul testi — Kabul (P0).
   - Determinist retrieval iddiaları; sentetik ve secretsiz veri; izole geçici Vault ve state.
   - Taslak oluşturma, SHA-256 ile yayınlama, yeni istemci sürecinde geri okuma ve yanlış sorguda abstention kapsanır.

## 5. Öncelik ve Bağımlılıklar

P0:
- Oturumlar arası geri okuma kabul testi.
- Salt okunur doktor/sağlık raporu.
- `state/` içeriğinin runtime, cache, kilit, kullanıcı tercihi ve ürün verisi olarak sınıflandırılması ve hedef dizin stratejisi.

P1:
- Vault, state ve config sürüm modelinin ayrıştırılması.
- İleri migrasyon, dry-run ve kurtarma manifesti.
- State'in repo dışına çift-okuma/tek-yazma geçişi.
- Tek istemcide opt-in, salt okunur hook pilotu.

P2:
- Kullanıcı tüketim profilleri.
- Hook desteğinin diğer istemcilere genişletilmesi.
- Kullanıcı yönlendirmeli onarım komutları.

Bağımlılık zinciri:
- Geri okuma testi, state taşıma ve migrasyonlardan önce güvenlik ağı olur.
- Doktor, sürüm uyumsuzluğunu ve eski state konumunu teşhis edebilir.
- Sürüm modeli, state migrasyonundan önce tanımlanır.
- State taşıma tamamlanmadan hook zamanlayıcı ve kontrol zamanları kalıcılaştırılmaz.
- Profiller, hook davranış sözleşmesi sabitlendikten sonra eklenir.

## 6. İş Kırılımı ve Kilometre Taşları

M0 — Güvenlik ağı ve teşhis:
- Oturumlar arası geri okuma kabul testi (izole geçici Vault/state, MCP istemci harness'i).
- Salt okunur doktor akışı ve redaksiyon testleri.
- `state/` sınıflandırma raporu ve hedef dizin tasarımı.

M1 — Sürümleme ve state ayrıştırma:
- Vault/state/config sürüm sözleşmesi.
- İleri migrasyon, dry-run, kurtarma manifesti ve idempotency testleri.
- State'in OS yerel veri dizinine aşamalı taşınması (eski konum okunur, yeni konuma yazılır).

M2 — Sınırlı hook ve profiller:
- Tek istemcide opt-in, salt okunur hook pilotu ve güvenlik sözleşmesi.
- Tüketim profilleri ve değişmez güvenlik invariant testleri.
- Pilot başarı ölçütleri ve geri çekme koşulları.

## 7. Kabul Kriterleri ve Doğrulama Yöntemi

- Doktor: salt okunurluk snapshot testi; redaksiyon testi; bozuk frontmatter, hash uyuşmazlığı, soft-expiry, karantina ve sürüm uyumsuzluğu fixture'ları; MCP şeması değişirse `npm run smoke`.
- Geri okuma testi: taslak normal aramada görünmez; SHA-256 ile yayınlanır; yeni istemci sürecinde geri okunur; yanlış sorguda abstention; test sonunda yalnız geçici ortam temizlenir.
- Sürümleme: her migrasyon için önce/sonra fixture; kesinti simülasyonu; idempotency; eski/yeni istemci uyumluluk matrisi; hash ve yedek bütünlüğü.
- State taşıma: geçici dizinle hermetik CI; iki istemcili eşzamanlı erişim testi; tek seferlik migrasyon ve tekrar çalıştırma testi; eski konum salt-okunur uyumluluk; bozuk/erişilemez OS state dizininde güvenli hata.
- Hook: hook kimliğinin yazma araçlarına kapalı olduğunun yetki testi; sonuç ve süre bütçesi; injection/secret fixture'ları; hook kapalıyken sıfır yan etki; hafıza erişilemezken ana oturumun devamı.
- Profiller: profil snapshot testleri; güvenlik invariant testleri; öncelik sırası (zorunlu politika, kullanıcı tercihi, istemci varsayılanı); geçersiz profil için fail-closed config doğrulaması.
- Her kilometre taşı sonunda `npm test`, `npm run verify`, `npm run verify:ci`; MCP şeması değişirse `npm run smoke`.

## 8. Riskler ve Azaltma

- Sağlık denetiminin farkında olmadan onarıma dönüşmesi: doktor salt okunur; onarım ayrı yetkilendirilmiş işlem.
- Hassas içeriğin tanı çıktısına sızması: redaksiyon testleri ve secret filtresi.
- Yarım migrasyon ve geri alma veri kaybı: yedek/manifest, dry-run, idempotency, kesinti simülasyonu.
- Çok istemcili kilit yarışı: dosya kilidi, atomik replace, state şema sürümü.
- CI'ın geliştirici makinesindeki state'e bağımlı hale gelmesi: hermetik geçici state dizini.
- Hook ile gizli bağlamın istem dışı modele taşınması: opt-in, salt okunur, sınırlı sonuç ve bağlam bütçesi.
- Ekonomik modun güvenlik doğrulamalarını gevşetmesi: profil yalnız otomasyon parametrelerini değiştirir.

## 9. Değişmez Güvenlik Sınırları

- Hook üzerinden otomatik not yazma veya yayınlama yok.
- Doktor kullanıcı onayı olmadan silme, taşıma, birleştirme veya onarım yapmaz.
- Ekonomik mod güvenlik doğrulamalarını kapatmaz.
- Yeni veriyi kaybettiren otomatik ters migrasyon yok.
- İstemci sohbetlerinin tamamı state, audit veya Vault'a aktarılmaz.
- İki state kopyası sessizce birleştirilmez.
- Vault kökü DeepSeek workspace'i olarak verilmez; secret hiçbir çıktıya yazılmaz.

## 10. Doğrulanamayan veya Açık Noktalar

- `state/` içeriğinin hangi öğelerinin ürün verisi, hangilerinin türetilmiş runtime verisi olduğu bu plan aşamasında sınıflandırılmadı; M0 çıktısıdır.
- Videonun sözlü içeriği (transkript) doğrudan okunamadı; yapı, resmi kurulum rehberi ve video künyesi üzerinden çıkarıldı.
- İstemci hook davranışının Codex, Claude Code ve Antigravity'de ortak mı yoksa farklı mı olduğu M2 pilotunda doğrulanacak.
- Sol değerlendirmesi, read-only Codex oturumunda dosya araçları olmadığından sağlanan bağlama dayandı; satır düzeyi doğrulama yapılmadı.

## 11. Sınırlamalar ve Atlanan Adımlar

- Gemini 3.8 Flash, video sayfasını ve URL yoğun sayfaları "invalid web evidence" nedeniyle okuyamadı; bu kaynaklar reader proxy ve resmi kurulum rehberi üzerinden alındı, yapı çıkarımı Gemini 3.8 Flash ile yapıldı.
- GPT Luna bu oturumda kullanılmadı; keşif Gemini 3.8 Flash ve DeepSeek Flash ile yürütüldü.
- Bu plan yalnız private repoda tutulur; `export-public.ps1` `docs/plans` kapsamını public dağıtıma aktarmaz.

## 12. Kaynaklar

- Video: Avenox, "This AI Doesn't Start Every Conversation From Scratch", 2026-09-17 (kanal künyesi reader proxy ile doğrulandı).
- Kurulum rehberi: `https://avenox.lol/beyin.md` (Gemini 3.8 Flash ile okundu).
- Kurulum sayfası: `https://avenox.lol/ikincibeyin`.
- Yerel kanıt: `memory/` Vault yapısı, `subagent-bridge/src/memory.js`, `config/policy.json` memory bloğu.
- Sol denetimi: `gpt-5.6-sol`, salt okunur, 2026-09-18.

## 13. Sol Denetim Özeti

- Altı desenin tamamı prensipte uygulanabilir; hook ile otomatik yazma reddedildi; state taşıma uyumluluk katmanı ve aşamalı geçiş gerektirir.
- İlk yatırım sağlık denetimi ve oturumlar arası kabul testine, ardından sürümlendirme ve state ayrıştırmasına yapılmalı.
- Kritik bulgu yok; başlıca uyarı, güvenlik kontrollerinin profil veya hook adına gevşetilmemesi ve state geçişinin bölünmüş durum yaratmamasıdır.
