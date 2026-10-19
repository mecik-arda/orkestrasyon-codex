# Hades Orchestrator Geliştirme Planı V2

> Durum notu (2026-09-18): Bu belge tarihsel plandır; uygulama denetimi `docs/reports/PLAN_UYGULAMA_DENETIMI_2026-09-18.md` içindedir. Plandaki test ve araç sayıları oluşturulma tarihine aittir; güncel doğrulama için `npm test`. Denetim sonucu: kısmen; rol politikası ve Faz 4 enstrümantasyonu uygulandı, Faz 4 karar kapısı veri yetersizliği nedeniyle geçici NO-GO olarak kayda geçirildi ve Faz 5-7 kapalıdır.

> İkinci durum notu (2026-09-18, akşam): Faz 4 için append-only uygunluk katmanı eklendi (`npm run edit:classify`; `eligible_real_user`, `ineligible_instrumentation`, `ineligible_synthetic`, `ineligible_duplicate`, `indeterminate_legacy`). Mevcut bekleyen kayıtlar toplu olarak sonuç etiketlenmedi; kohort ve eşik ayrımı `docs/reports/V2_FAZ4_ETIKET_KOHORTU_2026-09-18.md` içinde kayıtlıdır. Karar kapısı hâlâ geçici NO-GO'dur.

## Amaç

Hades Orchestrator, genel amaçlı bir agent framework'u değil; yerel geliştirici makinesinde çalışan heterojen CLI tabanlı subagent backend'leri için güvenli delegasyon katmanıdır.

V2'nin hedefi model akıl yürütmesini veya modelin kod üretim kalitesini değiştirmek değildir. Hedef, subagent tarafından üretilen editlerin güvenli teslimi, geri alınabilirliği ve kullanıcı tarafından denetlenebilirliğidir.

Yeni yetenekler, mevcut doğrulanmış doğrudan edit yolunu sessizce değiştirmez. Her genişletme ölçülen bir soruna ve önceden tanımlanmış kabul eşiğine dayanır.

## Mevcut Temel

- Local stdio MCP frontend ve global OpenCode custom tool yüzeyi.
- Codex, Antigravity Gemini Pro/Flash, Antigravity Claude Sonnet, native Claude Code, OpenCode ve DeepSeek backend adapter'ları.
- Trusted workspace injection, allowed/denied root kontrolü ve canonical workspace doğrulaması.
- Read-only ve workspace-write ayrımı, process-tree cancellation ve timeout kontrolü.
- Cross-process workspace reader/writer lock, heartbeat lease ve stale lock recovery.
- Retry, provider circuit breaker, profile-only fallback ve atomik maliyet reservation journal'ı.
- Redacted metrics/audit kayıtları ve Obsidian uyumlu kontrollü kalıcı hafıza.

## Korunacak Sözleşmeler

- Named provider çağrılarında sessiz fallback yapılmaz.
- Execution workspace kullanıcı girdisinden türetilmez.
- Prompt, tool output, workspace path ve secret loglanmaz.
- Subagent Vault erişimi zorunlu olarak engellenir.
- Maliyet limitleri execution öncesi atomik reservation ile korunur.
- Mevcut `run_codex_subagent` edit davranışı değiştirilmez.

## V2 Önceliklendirmesi

1. Direct edit baseline ölçümü.
2. Yalnız ölçüm eşiği aşılırsa minimal onaylı izole Codex edit run'ı.
3. İzole edit kullanım verisi sorun gösterirse minimal redacted lifecycle görünürlüğü.
4. Paralel review için kontrollü A/B deneyi.
5. Harici MCP tool client ve geniş checkpoint/resume süresiz ertelenir.

## Provider Rol Politikası

Provider rol politikası kullanıcı deneyimine dayalı ilk hipotez olarak uygulanmıştır:

- Kritik mimari, güvenlik, zor review ve yüksek riskli edit: Codex Sol.
- Genel kodlama, review ve doğrulama: Codex Terra.
- Hızlı ve düşük maliyetli kısa okuma: Codex Luna.
- Düşük maliyetli read-only analiz: DeepSeek V4 Flash.
- Derin read-only analiz ve araştırma: DeepSeek V4 Pro.
- Web araştırması ve dosya denetimi: Antigravity Gemini Pro/Flash.
- Görüntü gerektiren görevler: mevcut task profile yüzeyinde desteklenmez; DeepSeek'e atanmaz.

Hiçbir profile sessiz fallback tanımlanmamıştır. Edit profillerindeki açık fallback hedefleri yalnız kontrollü edit akışında, temiz disposable workspace, tek provider denemesi, secret fail-closed kontrolü ve doğrulanmış promotion ile kullanılabilir. Bu istisna DeepSeek Pro ve Antigravity Gemini Pro'yu kapsar; doğrudan veya örtük edit yetkisi vermez. Görüntü işleme DeepSeek'e atanmaz. Terra ve Luna model kimlikleri gerçek salt-okunur Codex çağrılarıyla doğrulanmıştır.

Routing kalitesi `routing:feedback` komutuyla `useful`, `partial` ve `not_useful` olarak redacted biçimde etiketlenir. `npm run metrics`, profile bazında kalite, süre ve bildirilen maliyeti raporlar. Her profile için en az 15 gerçek etiketli görev olmadan kalıcı kalite kararı verilmez.

## Faz 4: Direct Edit Baseline Ölçümü

### Uygulama Durumu

Baseline kayıt ve raporlama altyapısı uygulanmıştır. Mevcut edit execution kayıtları değiştirilmeden opaque execution hash üzerinden kullanıcı feedback'i alınır.

```text
npm run edit:feedback -- list
npm run edit:feedback -- accepted <feedback-id>
npm run edit:feedback -- minor_fix <feedback-id>
npm run edit:feedback -- reverted <feedback-id>
npm run edit:feedback -- security_concern <feedback-id>
npm run metrics
```

Karar kapısı henüz karşılanmamıştır. En az 30, tercihen 30-50 gerçek etiketli edit sonucu toplanmadan Faz 5 başlatılmaz.

### Hedef

İzole edit altyapısının gerçek bir kullanıcı sorununu çözüp çözmeyeceğini ölçmek.

### Kapsam

Sonraki 30-50 gerçek doğrudan edit görevi için yalnız aggregate ve redacted metrik tutulur:

- Edit görevi sayısı.
- İstenmeyen değişiklik sayısı.
- Geri alma sayısı.
- Kullanıcı tarafından yapılan manuel düzeltme sayısı.
- Edit sonrası test başarısızlığı sayısı.
- Run süresi ve provider maliyeti.
- Kullanıcının edit sonucunu kabul, ret veya geri alma kararı.

Prompt, model cevabı, diff gövdesi, dosya yolu, task ID ve secret tutulmaz.

### Kabul Kriterleri

- Yeni ölçüm, mevcut redacted metrics sözleşmesini bozmaz.
- Aggregate kayıtlar kullanıcı veya workspace kimliği içermez.
- Ölçüm, provider davranışını, timeout'u, retry'ı veya edit akışını değiştirmez.

### Karar Kapısı

- İstenmeyen veya geri alınan edit oranı `%10` altındaysa Faz 5 uygulanmaz ve V2 izole edit yatırımı ertelenir.
- Oran `%10` veya üzerindeyse, kullanıcı güveni veya geri alma maliyeti açıkça sorun olarak doğrulanırsa Faz 5 prototiplenir.
- Ölçüm dönemi sonunda veri yetersizse yeni altyapı eklenmez; ölçüm dönemi uzatılır.

## Faz 5: Minimal Onaylı İzole Codex Edit Run'ı

### Hedef

Ana worktree'yi kullanıcı onayına kadar değiştirmeyen, mevcut doğrudan edit yolundan ayrı ve opt-in bir Codex edit akışı sağlamak.

### Kesin Kapsam

- Yalnız Git repository.
- Başlangıçta temiz index ve temiz çalışma ağacı.
- Yalnız mevcut doğrulanmış `CodexAdapter`.
- Exact named Codex route ve sıfır fallback.
- Yeni `run_isolated_edit_subagent` MCP aracı.
- Detached, bridge-owned geçici Git worktree.
- Her run için bridge-owned `TEMP` ve `TMP` dizini.
- Yalnız tracked normal metin dosyalarında içerik değişikliği.
- Yeni dosya, silme, rename, binary, symlink, junction, submodule ve file-mode değişikliği reddedilir.
- Otomatik veya kullanıcı tanımlı test komutu çalıştırılmaz.

### Minimal Kalıcı State

State makinesi ayrı bir faz değildir; bu dikey dilimle birlikte yalnız gerekli dört durumu taşır:

- `pending`: izole edit tamamlandı, kullanıcı kararı bekliyor.
- `applied`: change set başarıyla hedefe uygulandı.
- `rejected`: kullanıcı change set'i reddetti.
- `failed`: run, doğrulama veya cleanup kesin olarak başarısız oldu.

Manifest atomik yazılır ve yalnız opaque run kimliği, başlangıç commit hash'i, exact provider/model route, artifact hash'i, sona erme zamanı, state ve idempotency key içerir.

`apply_state_unknown`, expiry lifecycle'ı ve geniş checkpoint/resume yalnız gerçek crash veya cleanup verisi gerektirirse sonraki karar kapısında değerlendirilir.

### Akış

1. Bridge, hedef workspace için writer lock alır ve temiz index/çalışma ağacı durumunu doğrular.
2. Bridge, başlangıç commit'inden detached worktree oluşturur.
3. Codex yalnız bu worktree'de `workspace-write` ile çalışır.
4. Bridge izinli değişiklik türlerini doğrular ve change set artifact hash'ini üretir.
5. Manifest `pending` durumunda atomik olarak saklanır; ana worktree değişmeden kalır.
6. Kullanıcı ayrı yerel approval kanalıyla onaylar veya reddeder.
7. Onay sırasında bridge writer lock alır; hedefin başlangıç commit, index, çalışma ağacı ve çakışabilecek untracked dosya durumunu tekrar doğrular.
8. Bridge patch preflight yapar, change set'i uygular ve sonuç hash'ini doğrular.
9. Başarılı apply sonrası manifest `applied` olur; geçici worktree cleanup yapılır.

### İnsan Onayı

Approval MCP, subagent ve provider yüzeyinde değildir. İlk sürümde ayrı yerel kullanıcı kanalı kullanılır:

```text
hades approve <run-id>
hades reject <run-id>
```

- Approval token tek kullanımlık, süreli, run'a ve başlangıç revision'ına bağlıdır.
- Token yalnız hash biçiminde manifestte tutulur.
- Subagent veya provider süreçleri approval token üretemez ya da approval komutunu çağıramaz.
- Test sonucu olmadığı için test-failure override kavramı ilk sürümde yoktur.

### İzolasyon Sınırları

Git worktree güvenlik sandbox'ı değildir. İlk dikey dilim aşağıdaki sınırları zorunlu kılar:

- Provider environment allowlist ile başlatılır; credential, proxy ve kullanıcıya ait gereksiz environment değişkenleri aktarılmaz.
- `TEMP` ve `TMP` yalnız bridge-owned per-run dizinine yönlendirilir.
- Git hook, global Git config ve credential helper erişimi adversarial kabul testleriyle değerlendirilir; güvenli biçimde engellenemeyen davranışta run fail-closed reddedilir.
- Worktree dışına yazma, kullanıcı dizini okuma ve Vault/runtime state erişimi adversarial testlerle kontrol edilir.
- Dirty worktree için otomatik stash/restore yapılmaz. Bu ek mutasyon ve crash-recovery riski taşır.

### Kabul Kriterleri

- Başarılı veya başarısız izole run ana worktree'yi değiştirmez.
- Onay olmadan change set hedefe uygulanmaz.
- Apply öncesi `HEAD`, index, çalışma ağacı ve çakışabilecek untracked yollar doğrulanır.
- Apply ve preflight aynı writer lock altında yapılır.
- Timeout, cancel ve provider crash sonrası geçici worktree temizliği idempotenttir.
- Mevcut direct-edit yolu değişmeden kalır.
- Windows ve Linux CI ortamında Git worktree lifecycle ve adversarial filesystem testleri geçer.

### Başarı Metrikleri

- Başarısız veya iptal edilen run sonrası ana worktree'de onaylanmamış mutasyon oranı: `%0`.
- Orphan process oranı: `%0`.
- Temizlenmemiş geçici worktree oranı: `%0`.
- Worktree oluşturma, lock ve preflight ek yükü p95: `< 1 saniye` hedefi.
- İzole edit kullanan görevlerde kullanıcı geri alma oranı, Faz 4 baseline'ına göre düşmelidir.

### Durdurma Kriterleri

- Worktree oluşturma veya preflight p95 gecikmesi sürekli `2 saniye` üzerindeyse.
- Windows filesystem, güvenlik yazılımı veya Git davranışı nedeniyle cleanup güvenilir değilse.
- Günlük kullanımda apply conflict oranı yüksekse ve kullanıcı akışı kabul edilemez sürtünme yaratıyorsa.
- İzole edit, direct-edit baseline'ına göre geri alma veya manuel düzeltme oranını anlamlı düşürmüyorsa.

Bu durumlardan biri gerçekleşirse kapsam genişletilmez; özellik kaldırılır veya deneysel kalır.

## Faz 6: Minimal Lifecycle Görünürlüğü

### Karar Kapısı

Bu faz yalnız Faz 5 gerçek kullanımda crash, cleanup veya approval teşhis problemi gösterirse uygulanır. Tek kullanıcılı sistem için önceden event-sourcing veya geniş timeline platformu kurulmaz.

### İlk Kapsam

Sadece şu typed redacted event'ler tutulur:

- `run_started`
- `change_set_pending`
- `approval_received`
- `change_set_applied`
- `change_set_rejected`
- `run_failed`

Her event yalnız enum, sayı, ISO-8601 zaman damgası ve biçimi doğrulanmış opaque hash taşır. Serbest metin hata alanı, prompt, output, diff, path ve secret yazılmaz.

## Faz 7: Paralel Review A/B Deneyi

### Varsayım

Birden fazla provider sonucu, model akıl yürütmesini doğrudan iyileştirmez. Nihai karar kalitesine fayda sağladığı ölçülmeden ürün özelliğine dönüştürülmez.

### Deney

Yirmi benzer read-only görevde iki kol karşılaştırılır:

- Kontrol: mevcut tek provider veya task profile.
- Deney: Gemini Pro, Codex ve DeepSeek Pro bağımsız sonuçları; sentez host/orchestrator tarafından yapılır.

Kör değerlendirmede şu metrikler ölçülür:

- Görev doğruluğu.
- Yakalanan gerçek hata sayısı.
- Yanlış pozitif sayısı.
- Kullanıcı düzeltme sayısı.
- Toplam süre.
- Toplam provider maliyeti.

### Karar Kapısı

- Karar kalitesinde anlamlı iyileşme yoksa Faz 7 uygulanmaz.
- Maliyet yaklaşık provider sayısıyla doğrusal artar; üç provider kullanımı tipik olarak yaklaşık `3x` provider maliyeti oluşturur.
- Gecikme en yavaş provider'ın tamamlanmasına bağlıdır.
- Fayda maliyet ve gecikmeyi haklı çıkarmıyorsa paralel review deneysel kalır veya kaldırılır.

## Süresiz Ertelenen Konular

- Harici MCP tool client katmanı.
- Network MCP, SSE ve Streamable HTTP transport.
- Geniş checkpoint/resume ve model konuşması state'i saklama.
- Otomatik veya kullanıcı tanımlı test komutu çalıştırma.
- Native Claude Code edit acceptance ve henüz desteklenmeyen ek provider edit backend'leri.
- Silme, rename, binary, symlink, junction, submodule ve file-mode değişikliği (kontrollü DeepSeek edit mevcut güvenli üst dizin altında açıkça seçilen yeni dosyaları destekler).
- Dirty target worktree desteği, otomatik stash/restore, rebase, merge ve conflict çözümü.
- Semantic veya hybrid Vault retrieval.
- Temporal entegrasyonu, A2A ve MicroVM/eBPF izolasyonu.

Harici MCP tool client, aynı kullanıcı hesabında çalışan bir MCP server'ın Vault veya runtime state erişimini engelleyen gerçek OS-seviyesi process sandbox kanıtlanmadan yeniden değerlendirilmez.

## Referanslar

- LangGraph JavaScript overview: https://docs.langchain.com/oss/javascript/langgraph/overview
- OpenAI Agents SDK JavaScript MCP: https://openai.github.io/openai-agents-js/guides/mcp/
- CrewAI Flows: https://docs.crewai.com/en/concepts/flows
- Semantic Kernel overview: https://learn.microsoft.com/en-us/semantic-kernel/overview/
- Temporal TypeScript SDK: https://docs.temporal.io/develop/typescript
