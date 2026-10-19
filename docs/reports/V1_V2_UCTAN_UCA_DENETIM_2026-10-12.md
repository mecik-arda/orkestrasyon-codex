# V1/V2 Yerinde Uçtan Uca Doğrulama ve Ana Orkestratör Denetimi

Tarih: 2026-10-12
Denetleyen ve düzelten: Ana orkestratör, GPT-6.1 Sol
Karar: İncelenen yerel kaynak ve doğrulama kapsamı gönderilebilir; aşağıdaki dört bulgu kapatıldı.

Pilot klasörü yaşam döngüsü eki (2026-10-12): Bu denetim anında pilot snapshot çalışma kopyası yerindeydi. Daha sonra kullanıcı isteğiyle, private backup repo `main` ref'i pilot HEAD `efbacd0b44f5ba2d8d5ad1b7bc68b6f5bc0e2ccb` ile eşleştiği ve Git tracked/untracked status temiz olduğu doğrulandıktan sonra linked worktree kaldırıldı. Sadece ignored `.opencode` dependency cache/metadata'sı yerel klasörle birlikte silindi. Ana repo HEAD/branch, private backup ve public staging değişmedi.

## Kapsam ve yöntem

Kullanıcı tamamlanan yerinde planın ardından projeyi uçtan uca test etmeyi, ana orkestratörün kendi denetimini ve commit/push'u istedi. Subagent kullanılmadı. Mevcut diff/plan/raporlar, verify/smoke/pilot ve localhost CLI doğrulama scriptleri, OpenCode/Codex adapter yolları, source manifest okuma sınırı, batch cancel/registry ve ilgili regression fixture'ları incelendi. Tam proje test suite'i çalıştırıldı. Bu, bütün kaynak satırlarının bağımsız üçüncü taraf denetimi veya kapsamlı OWASP taraması değildir.

## Hatalar ve kapatılan bulgular

### Orta — Settled batch iptali terminal durumu kalıcılaştırmıyordu

- Konum: `subagent-bridge/src/services/parallel-batch.js:1656-1704`, özellikle cancel mutator'ın `ready_for_approval` dalı.
- Sorun: `result_ready` ve `blocked` batch'lerinde cancel request başarılı bildirilirken status aynı kalıyordu; poll/watcher terminal `cancelled` sonucunu göremiyordu.
- Kanıt: Gerçek service/registry fixture'ıyla iki regression testi önce beklenen `cancelled` yerine sırasıyla `result_ready` ve `blocked` döndürerek başarısız oldu.
- Düzeltme: Bu iki settled durum, ready approval ile aynı terminal cancel dalına alındı. Entegrasyon sürerken iptal reddi ve workspace binding korunur; task sonuçları/maliyet tekrar settled edilmez.
- Kabul: `tests/parallel-batch.test.js` iki yeni vaka kalıcı registry state, görev/bütçe korunumu ve tekrar iptalin `already_terminal` no-op sonucunu doğruluyor. Mevcut stale-cancel/integration ve cancellation fixture'ları da tam suite'te geçti.

### Orta — Güncel CLI'da source-bundle transport sürüm kapısı güncel kanıta sahip değildi

- Konum: `subagent-bridge/src/adapters/opencode-adapter.js:23,329-341`; `scripts/verify-opencode-memory-db.js:8,191-193`.
- Sorun: Adapter ve CLI doğrulaması yalnız eski `1.18.35` sürümünü kabul ediyordu. Kurulu CLI `1.19.0` olduğundan bundle review preflight'i reddediliyor ve localhost doğrulaması başlamıyordu. Fail-closed sürüm kısıtı doğru prensiptir; sorun güncel sürüm davranışının doğrulanıp allowlist'e işlenmemiş olmasıydı.
- Kanıt: İlk gerçek `npm run opencode:memory-db:verify` exit 1, `Expected OpenCode 1.18.35; observed 1.19.0`, sıfır localhost request ve başarılı temp cleanup döndürdü.
- Düzeltme sırası: Önce probe `1.19.0` sürümüne pinlendi ve gerçek CLI ile localhost mock turu başarıyla çalıştırıldı; sonra adapter yalnız doğrulanmış exact `1.18.35`/`1.19.0` kümesini kabul edecek şekilde güncellendi. Genel semver aralığı veya izin bypass'ı açılmadı.
- Kabul: Gerçek CLI `1.19.0`, iki localhost request, tam synthetic bundle, tool event yok, persistent DB dosyası yok ve temp cleanup başarılı. Adapter fixture'ları her iki doğrulanmış sürümü ve doğrulanmamış `1.18.36` için pre-dispatch reddini kontrol ediyor. Sabit mock yanıtı semantik review doğruluğu veya upstream Terms kabulü değildir.

### Düşük — Verify çıktısı ölçmediği Codex modelini kesin gösteriyordu

- Konum: `scripts/verify-project.js` eski `report.codex` alanı; güncel `buildCodexVerificationReport` fonksiyonu satır 19-27.
- Sorun: Yalnız CLI `--version` çalışmasına rağmen sabit `gpt-5.6-sol` ve `role=lead` raporlanıyordu; bu gerçek resolved model veya model erişim kanıtı değildi.
- Düzeltme: Verify CLI availability/version sonucunu korur; `model=null`, `modelAccess=not_probed`, `role=subagent` döndürür. Host model/trust config'i değiştirilmedi.
- Kabul: Başarılı CLI sürüm kontrolünde ve Codex config yokluğunda model/access iddiası üretilmemesini kontrol eden iki regression testi eklendi; gerçek `npm run verify` yeni çıktıyla geçti.

### Düşük — README mevcut olmayan hosted workflow'u çalışıyormuş gibi anlatıyordu

- Konum: `README.md` İngilizce/Türkçe CI kapanış bölümleri ve son doğrulama özeti.
- Kanıt: Bu checkout'ta `.github/workflows/*` bulunmadı; README `.github/workflows/validate.yml` çalıştığını söylüyordu.
- Düzeltme: Yerel/açıkça kurulmuş CI komutları ile mevcut hosted workflow sonucu ayrıldı; doğrulama tarihi güncellendi. Yeni workflow oluşturulmadı. Source transport ve cancel/verify açıklamaları da gerçek yeni davranışla hizalandı.
- Düzeltme eki (2026-10-12): Bu bulgunun ilk tespiti hatalıydı. `.github/workflows/validate.yml` her iki repoda da takipli; workflow public repoda `npm ci`, `npm test` ve `verify:ci` ile yeşil koşuyor. İlk denetimde gizli `.github` klasörü glob aracıyla görülemedi; doğru kontrol `git ls-files .github` çıktısıdır. README'nin ilk hali doğruydu; hatalı "workflow yok" değişikliği geri alındı. Bkz. "CI durumu eki".

## Performans ve belirgin güvenlik değerlendirmesi

- İncelenen kaynaklarda bu görev için yeni ölçülebilir performans kusuru saptanmadı; spekülatif optimizasyon yapılmadı.
- Yeni kritik/yüksek belirgin güvenlik bulgusu saptanmadı. Source manifest containment/encoding/secret sınırı, unknown-version fail-closed davranışı, integration sırasındaki cancellation reddi ve workspace binding ilgili kaynak/fixture kontrolleriyle korunuyor.
- Token/bill sınırı, tam yerel-process confinement veya genel production sertifikası iddia edilmez; ilgili readiness kayıtlarının kapsam sınırları korunur.

## Son gerçek doğrulamalar

- Hedefli `node --test tests/verify-project.test.js tests/faz-3-opencode.test.js tests/parallel-batch.test.js`: 88/88 geçti.
- `npm test`: 922 toplam; 918 geçti, 4 POSIX-only atlandı, 0 fail/cancelled/TODO.
- `npm run verify`, `npm run verify:ci`, `npm run opencode-tools:check`: başarılı.
- `npm run smoke`: gerçek stdio MCP tool/resource ve mevcut Vault erişimi başarılı; attestation verified/match. Yeni MCP şeması veya rule resource davranışı değiştirilmedi.
- `npm run drill`: 9/9 geçti.
- `npm run opencode:memory-db:verify`: gerçek OpenCode `1.19.0` + localhost-only mock başarılı; sıfır kalıcı session DB, sıfır tool event, temp cleanup başarılı.
- Kontrollü `npm run pilot`: gerçek MCP→DeepSeek wrapper→OpenCode adapter→Node CLI fixture→strict structured result akışı geçti. Test politikası/agents source template'lerinden geçici olarak üretildi; `ORCHESTRATOR_CONFIG`/`SUBAGENT_BRIDGE_AGENTS_CONFIG` ve ayrı `LOCALAPPDATA` ile kişisel state/config yalıtıldı. Gerçek DeepSeek model/provider çağrısı yapılmadı, fixture model metadata'sı canlı model erişimi kanıtı değildir. Geçici fixture/config/state dizini kaldırıldı.
- `git diff --check`: başarılı; commit öncesinde staged diff ayrıca kontrol edilir.

## Kanıt sınırları ve gönderim kararı

- `dış-bağımlı`: Önceki DeepSeek rate limit ve Luna sandbox setup hatalarının çözüldüğü iddia edilmez. Bu turda yeni canlı edit/model görevi yapılmadı.
- `dış-bağımlı`: Remote-write denial, upstream auth/Terms ve genel V2 edit release kabulü ayrı kayıtlardadır.
- `opt-in`: Batch/edit feature-gate etkinleştirme ve public yeniden yayın bu gönderimin kapsamı değildir; kullanıcı private repo commit/push istedi.
- Dört POSIX-only skip bu Windows turunda geçildi sayılmaz. Localhost mock ve sentetik pilot canlı model davranışı yerine sunulmaz.
- Mevcut canonical root, pilot ve public staging korunur. Runtime source modülleri değiştiğinden çalışan MCP/Bridge süreçleri eski import'ları tutabilir; güncel davranışı açık oturuma almak için OpenCode aynı root'ta yeniden başlatılmalıdır. Test/smoke turları yeni kaynaklarla yeni süreçte çalışmıştır.
- Kritik bulgu: 0; yüksek: 0; kapatılmış orta: 2; kapatılmış düşük: 2. Genel sağlık skoru: 8/10, incelenen yerel kapsama ilişkin uzman kanaatidir; otomatik/istatistiksel kalite metriği değildir. Açık yerel gönderim engeli yok; private repo'ya gönderilebilir. Kendi incelemem bağımsız alt ajan denetimi olarak sunulmaz.

## CI durumu eki (2026-10-12)

- Kullanıcı, private repo GitHub Actions koşularının hata verdiğini bildirdi. İnceleme: üç job da (ubuntu 22.x, windows 22.x/24.x) adım çalıştırmadan 2 saniyede düşüyor; annotation: "The job was not started because recent account payments have failed or your spending limit needs to be increased."
- Kök neden GitHub Actions faturalama/kredi limitidir; kaynak kodu, workflow dosyası veya test regresyonu değildir. Public repo koşuları aynı workflow ile yeşil (public repos use free minutes). Private koşular 2026-10-06 akşamından beri bu sınıfta başarısız; öncesinde başarılıydı.
- Kullanıcı kararı (2026-10-12): repo değişikliği yapılmaz, durum yalnız bu rapora kaydedilir. Faturalama kullanıcı tarafından yönetilir; düzelene dek private koşular kırmızı kalır, public ve yerel doğrulamalar geçerlidir.
- README'deki hatalı "workflow yok" ifadesi geri alındı; `validate.yml` (checkout → setup-node cache'li `npm ci` → `npm test` → `verify:ci`, Windows+Linux, Node 22/24) doğru biçimde tanımlıdır.

## İlgili kayıtlar

- `V1_V2_YERINDE_UYGULAMA_KABUL_2026-10-12.md`: daha önce tamamlanan Y0-Y4 yerinde kabul snapshot'ı.
- `V1_V2_GECIS_SUBAGENT_EDIT_HATALARI_2026-10-12.md`: önceki üç edit başarısızlığı.
- `../plans/yapilanlar/ORKESTRASYON_V1_V2_TEKKLASOR_BIRLESTIRME_PLANI_2026-10-10.md`: güncel kullanıcı hedefi ve tarihsel migration tasarımı.
