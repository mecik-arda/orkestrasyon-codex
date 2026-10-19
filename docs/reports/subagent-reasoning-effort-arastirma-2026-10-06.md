# Subagent Çalıştırmalarında Reasoning Effort Ayarı Araştırması

Tarih: 2026-10-06 (UTC)
Durum: incelendi
Amaç: Subagent çağrılarında modelin düşünme yoğunluğunu sağlayıcıya uygun ve görev başına ayarlayabilecek düzenek için kaynak ve mevcut-kod analizi yapmak.
Kapsam: Orkestrasyon Bridge'in Codex, Claude Code, OpenCode/DeepSeek ve Antigravity çağrı yolları; resmi sağlayıcı belgelerindeki effort/thinking kontrolleri.
Kapsam dışı: Kod uygulaması, canlı performans kıyaslaması, model erişim/auth değişiklikleri ve GLM sağlayıcısının etkinleştirilmesi.
Hazırlayan: Ana orkestratör
Doğrulayan: Ana orkestratör; resmi kaynaklar ve yerel kaynak kodu karşılaştırıldı.

## Yönetici Özeti

**Evet, subagent başlatılırken düşünme yoğunluğu ayarlanabilir; fakat ortak bir alan şu an Bridge'de bulunmuyor ve sağlayıcıların değerleri bire bir aynı değil.** En uygulanabilir çözüm, her isteğe veya task profile'a isteğe bağlı bir `reasoningEffort` değeri eklemek ve adapter içinde bunu sağlayıcının belgelenmiş, invocation-scoped ayarına çevirmektir. Ayar verilmediğinde bugünkü sağlayıcı varsayılanları korunmalıdır.

Kaynaklarla doğrulanan başlıca yollar:

- Codex CLI: `model_reasoning_effort` için `-c/--config` invocation override'ı vardır; ayrıca Codex'in **kendi oluşturduğu alt ajanlara** varsayılan vermek için `[agents].default_subagent_reasoning_effort` bulunur. İkisi farklı kapsamları yönetir.
- Claude Code: `--effort` veya child-process'e özel `CLAUDE_CODE_EFFORT_LEVEL` ile çağrı başına ayarlanabilir. Mevcut Bridge adapter'ı zaten konfigürasyondan/ortamdan `high` alıp child process'e veriyor; MCP isteğine özel bir değer henüz taşımıyor.
- OpenCode: `opencode run --variant <ad>` çağrı düzeyinde varyant seçebilir; model/provider tanımında reasoning ayarı veya özel variant tanımlanabilir. Bridge şu an `--variant` göndermiyor.
- DeepSeek API: resmi API belgesi thinking aç/kapatma ile `reasoning_effort` değerlerini tanımlar. Ancak Bridge'in kullandığı OpenCode + DeepSeek adapter zincirinin bu alanları gerçekten ilettiği ayrıca capability/probe ile doğrulanmalıdır.
- Gemini API: Google'ın Gemini API dokümanı Gemini 3+ için `thinking_level` (`MINIMAL`, `LOW`, `MEDIUM`, `HIGH`) sunar. Bu, Bridge'in kullandığı Antigravity CLI'nin aynı parametreyi dışarı açtığını kanıtlamaz; Antigravity'de çağrı başına ayar resmi erişilebilir kaynaklarda doğrulanamadı.

Öneri, kullanıcının istediği genel seviye ile sağlayıcıya özgü parametreyi ayırmaktır. Sistem bir seviyeyi sessizce yok saymamalı veya yanlış sağlayıcı eşlemesine çevirmemeli; model/provider için destek yoksa bunu açıkça bildirmelidir.

## Kanıt Ve Bulgular

### VERIFIED: Bridge'in bugünkü çağrı sözleşmesinde görev başına effort alanı yok

Kanıt:

- `subagent-bridge/src/frontends/mcp/tools.js:55-129` içindeki public run tool şemalarında model, rol, mod, prompt ve timeout alanları var; reasoning/effort alanı yok. Şemalar strict.
- `subagent-bridge/src/runtime/bridge-runtime.js:49-70` runtime isteği model ve profile alıyor; effort alanı almıyor.
- `subagent-bridge/src/config.js:151-163` task profile'ları target, model, mode, priority, cacheable ve fallback rotalarını tutuyor; effort ayarı tanımlı değil.
- `subagent-bridge/src/adapters/codex-adapter.js:75-100` model ve sandbox parametrelerini oluşturuyor, ancak `model_reasoning_effort` config override'ı eklemiyor.
- `subagent-bridge/src/adapters/claude-code-adapter.js:24-28` child process ortamında `configuration.claude_code.effortLevel`, sonra process env, sonra `high` kullanıyor. Bu bridge çağrısına bağlı dinamik değer değil.
- `subagent-bridge/src/adapters/opencode-adapter.js:139-175` `opencode run` argümanlarına model ve agent ekliyor, `--variant` eklemiyor. Parallel agent `steps` sınırı reasoning seviyesi değildir.
- `subagent-bridge/src/adapters/antigravity-adapter.js` mevcut model seçimini ve CLI çağrısını sağlar; public MCP schema'da seviye alanı bulunmuyor.

Etkisi: Kullanıcı bugün Bridge'deki her tekil subagent çağrısı için standart bir thinking-level parametresi veremez. Claude Code'un sabit/configured `high` değeri, Codex'in kendi model/CLI varsayılanları ve OpenCode provider/model varsayılanları birbirinden bağımsız işler.

### VERIFIED: Codex CLI iki ayrı effort kapsamı destekliyor

Kanıt:

- Codex CLI config referansı `model_reasoning_effort` değerini seçili modelin desteklediği reasoning effort olarak tanımlar; örneklenen değerler `low`, `medium`, `high`, `xhigh`, `max`, `ultra` olup kullanılabilirlik model ve client'a bağlıdır.
- Codex CLI ileri yapılandırma belgesi `codex exec --profile ...` örneği ve `-c/--config` ile tek çalıştırmalık key override'ı gösterir. Bu, Bridge tarafından başlatılan ana Codex process'in effort'unu değiştirebilir.
- Codex Subagents belgesi `[agents]` altında `default_subagent_reasoning_effort` tanımlar. Bu ayar, çalışan Codex agent'ının **kendi spawn ettiği çocuklara** varsayılan verir; dış Bridge'in Codex CLI task'ının effort değerinin eş anlamlısı değildir. Açık spawn effort'u bu varsayılanı geçersiz kılar.

Etkisi: Bu repo için en doğrudan Codex düzenlemesi, isteğe bağlı seviyeyi `codex exec` çağrısına `-c model_reasoning_effort=<değer>` olarak aktarmaktır. İç içe Codex subagent'larına da varsayılan vermek istenirse `-c agents.default_subagent_reasoning_effort=<değer>` ayrıca değerlendirilebilir. Desteklenmeyen model/effort kombinasyonu capability bilgisi olmadan kabul edilmemelidir.

### VERIFIED: Claude Code çağrı başına effort sunuyor; env precedence dikkate alınmalı

Kanıt:

- Claude Code model yapılandırması `--effort` için `low`, `medium`, `high`, `xhigh`, `max` seviyelerini ve model-bağımlı davranışı belgeliyor. `CLAUDE_CODE_EFFORT_LEVEL` ortam değişkeni ayrıca `auto` kabul ediyor.
- Aynı belgede `CLAUDE_CODE_EFFORT_LEVEL` değişkeninin `--effort` ve session içi `/effort` seçiminden öncelikli olduğu açıklanıyor.
- Bridge adapter'ı child environment'ına varsayılan `high` değerini zaten koyuyor. Sadece `--effort` CLI flag'i eklemek, env aynı anda `high` ise daha düşük istenen değeri etkisiz bırakabilir.

Etkisi: Çağrı başına kontrol, Bridge'in yalnız ilgili child process için ürettiği `CLAUDE_CODE_EFFORT_LEVEL` değerine istek önceliği verilerek uygulanabilir. Süreç genelindeki `process.env` değiştirilmemeli; paralel çağrılar birbirinin seviyesini etkilememelidir. Claude Code'un kendi oluşturduğu child agent'lara effort kalıtımı ayrıca test edilmelidir.

### VERIFIED: OpenCode variant mekanizması invocation-scoped ama variant provider/model'e bağlı

Kanıt:

- OpenCode CLI belgesi `opencode run --variant` seçeneğini “provider-specific reasoning effort” olarak tarif ediyor. `--thinking` ise düşünme bloklarını **göstermeye** yarar; reasoning derinliğini ayarlamaz.
- OpenCode model belgesi model option'ları (`reasoningEffort`, Anthropic için `thinking`/`budgetTokens`) ve model başına özel `variants` tanımlamayı açıklıyor. Built-in variant isimleri ve anlamları provider'lar arasında değişiyor.
- `opencode-adapter.js:139-175` şu an `--variant` vermiyor. Parallel çağrılarda geçici OpenCode config'i oluşturuluyor (`:297-305`); effort/variant taşınacaksa bu izole konfigürasyon yolu da kapsanmalı.

Etkisi: Bir generic effort değerini doğrudan OpenCode `--variant` olarak geçirmek güvenli değildir; bu seçenek serbest bir evrensel seviye değil, seçilen provider/model konfigürasyonunda tanımlı variant adıdır. Bridge'in model ve provider bazlı, doğrulanmış bir mapping/capability kaydı gerekir.

### VERIFIED: DeepSeek API reasoning effort sağlıyor; OpenCode üzerinden iletim kanıtı ayrı

Kanıt:

- DeepSeek'in resmi Thinking Mode belgesi OpenAI biçiminde `reasoning_effort` için `low`, `high`, `max` değerlerini ve `thinking: {type: enabled|disabled}` anahtarını belgeliyor. Belgedeki eşleme `minimal → low`, `medium → high`, `xhigh → high`, `ultra → max` biçiminde; bu yüzden OpenAI/Codex enum'larının DeepSeek'e olduğu gibi verilmesi semantik olarak doğru değildir.
- Aynı doküman Responses API ve Anthropic formatlarında farklı request alanları gösteriyor. Bu nedenle hangi wire format kullanılıyorsa adapter'ın doğru key setini göndermesi gerekir.
- Bu Bridge DeepSeek'i OpenCode CLI üzerinden çağırır. Resmi DeepSeek API dokümanı OpenCode sürümünün, DeepSeek provider adapter'ının ve seçilmiş model alias'ının her request'te alanları taşıdığını kanıtlamaz.

Etkisi: DeepSeek için effort desteği API seviyesinde mevcut. Bridge'de etkinleştirmeden önce OpenCode variant/custom model option'ın actual provider request'ine gittiği, gizli reasoning içeriğinin Bridge sonucuna/mekaniğine sızmadığı ve maliyet/token kullanımının doğru ölçüldüğü düşük maliyetli bir capability testiyle doğrulanmalıdır.

### VERIFIED: Gemini API seviyesi ile Antigravity CLI seviyesi farklıdır

Kanıt:

- Google Gemini Enterprise Agent Platform düşünme dokümanı Gemini 3 ve sonrası için `thinking_level` alanını ve `MINIMAL`, `LOW`, `MEDIUM`, `HIGH` düzeylerini belgeliyor.
- Bridge Gemini çağrılarını Google'ın doğrudan GenAI API'siyle değil Antigravity adapter/CLI yolu üzerinden yönlendiriyor. Antigravity'nin public CLI dokümanlarında aynı alanın run-call override'ı olduğuna erişilebilir resmi kaynaklardan kanıt bulunamadı.

Etkisi: Google GenAI API parametresi Antigravity CLI'ye kendiliğinden uygulanamaz. Antigravity'nin kendi `--help`/capability yüzeyinde veya resmi belgelerinde doğrulanana kadar bu provider için effort `unsupported/unknown` sayılmalıdır; prompt'a “daha derin düşün” eklemek transport parametresi yerine geçmez.

### HYPOTHESIS: Kullanılabilir kullanıcı sözleşmesi profile varsayılanı + tekil çağrı override'ı olmalı

Mevcut kanıt: `run_task_profile` zaten görev tipini target/model/mode ile seçiyor; doğrudan provider araçları ise model seçiyor. Her ikisinin runtime request'i aynı adapter katmanına ulaşıyor.

Önerilen sözleşme:

- `reasoningEffort` isteğe bağlı, kapalı enum olsun; ilk taşınabilir sözleşme `low`, `medium`, `high`, `max` gibi normalize edilmiş seviyeler kullanabilir. Provider'a özgü doğrudan native değerler public MCP argümanı yapılmamalı.
- Her task profile isteğe bağlı `reasoningEffort` varsayılanı taşısın; tekil tool argümanı verilirse profile değerini geçersiz kılsın. Alan yoksa mevcut provider/model varsayılanları aynen sürsün.
- Runtime, seçili model ve provider için normalize seviye → native parametre eşlemesini açık capability metadata'sından çözsün. Eşleme bulunmayan isteği sessizce düşürmek yerine `unsupported_reasoning_effort` şeklinde reddetsin veya çağırana destek durumunu açık raporlasın.
- Fallback sağlayıcıya geçişte aynı normalize talep, fallback model için yeniden çözümlensin. Eşdeğer seviye yoksa sessiz downgrade yapılmasın; raporlanan `effectiveReasoningEffort` açıkça farklı/unsupported olsun.
- Claude child env'i ve Codex `-c` parametresi process/task scoped kurulmalı. OpenCode'un `--variant`/inline config yolu task bazında izole edilmeli. Antigravity desteği doğrulanmadan knob eklenmemeli.
- Redacted metrikler yalnız normalize istenen/etkin seviyeyi ve `supported|unsupported|unknown` durumunu taşıyabilir; prompt, iç reasoning metni veya sağlayıcının düşünce çıktısı loglanmamalı.
- Effort kaliteyi, token kullanımını ve gecikmeyi etkileyebileceğinden read-only cache anahtarı normalize effort'u içermeli; maliyet bütçesi ve fallback muhasebesi aynı parametreyle tutarlı olmalı.

Doğrulama yöntemi: Codex ve Claude Code için çağrı argümanı/env birim testleri; OpenCode için fake executable testleri ve OpenCode DeepSeek modelinde opt-in capability probe; profile/tekil override/fallback/cache-key/metric testleri. Antigravity için önce CLI'nin desteklenen parametresini dokümante eden veya capability probe ile kanıtlayan bir adım gerekir. Canlı testte sadece kabul/usage metadata'sı incelenmeli, chain-of-thought toplanmamalı.

## Çelişkiler Ve Belirsizlikler

- Sağlayıcı effort enum'ları ortak değildir. Örneğin DeepSeek `medium` isteğini `high` olarak, `ultra` isteğini `max` olarak eşlerken Codex bu değerleri kendi model/client desteğine göre yorumlar. Aynı etiket aynı compute/tokens/kalite anlamına gelmez.
- OpenCode'un `--variant` argümanı mevcut CLI belgesinde var; ancak seçili DeepSeek modelinin bu bridge sürümünde hangi variantları bildirdiği ve provider request'ine doğru parametre olarak çevirdiği statik dokümanla tek başına kanıtlanmış değildir.
- Google API'deki `thinking_level` özelliği Antigravity CLI entegrasyonunun dışarı açtığı bir çağrı parametresi değildir; Antigravity kontrol yüzeyi ayrıca doğrulanmalıdır.
- Task profile'a eklenecek effort alanının cache, metrik, provider fallback ve maliyet admission akışlarında nasıl etkili olacağı yeni kod/test gerektirir. Bu rapor mevcut davranışı değiştirmez.

## Riskler Ve Güvenlik Sınırları

- Daha yüksek effort latency ve token maliyetini artırabilir; provider limitleri, model desteği ve batch admission maliyet rezerviyle uyumlu olmalıdır.
- İsteği desteklemeyen modelde otomatik `high`/varsayılan seviyeye düşmek kullanıcı tercihini sessizce bozar. Unsupported durum açık olmalıdır.
- Ortam değişkenini ana Node process üzerinde değiştirmek eşzamanlı subagent'ların effort ayarını karıştırabilir. Yalnız child process environment'ı kullanılmalıdır.
- “Thinking display” veya reasoning content alanını açmak, düşünme düzeyi ayarıyla aynı şey değildir. İç düşünce içeriğini loglamak ya da kullanıcıya expose etmek bu araştırmanın önerisi değildir.
- Provider API seviyesindeki bir parametrenin CLI wrapper tarafından desteklenmesi varsayılmamalıdır. Request-transport capability probe'u olmadan `available` ilan edilmemelidir.

## Öneriler Ve Açık Sorular

1. Önce Codex ve Claude Code için profile varsayılanı ile tek çağrı override'ını destekleyen dar bir ilk sürüm tasarlanabilir; bu iki yol için resmi invocation-scoped ayarlar ve mevcut adapter kodu var.
2. OpenCode için variant mapping'i model bazında capability metadata'sından çözmek ve DeepSeek modelinde opt-in probe ile doğrulamak gerekir. DeepSeek API değerlerini OpenCode variant adı sanmamak gerekir.
3. Antigravity effort ayarı, resmi CLI/adapter yüzeyinde doğrulanana kadar desteklenmeyen kontrol olarak bırakılmalıdır.
4. Uygulamaya geçilirse etki alanı `MCP schema → runtime request → profile resolution → adapter args/env → cache/metrics → tests` zinciridir. `config/agents.json` içinde küresel bir default değiştirmek görev başına kullanım ihtiyacını karşılamaz ve kullanıcı tercihini sağlayıcılar arasında tutarlı yapmaz.
5. Kabul kararı: task-level kullanıcı alanı `reasoningEffort` mı olsun, yoksa kullanıcı dostu `reasoningProfile` (fast/balanced/deep) olup gerçek seviyeler provider/model capability mapping'inden mi çözülsün? Öneri, teknik olarak düzey seçimini açıkça vermek için `reasoningEffort`; hazır görev preset'i ihtiyacı olursa ayrıca profile default'udur.

Bu belge araştırma/öneridir; effort ayarı eklenmiş veya herhangi bir provider için live-verified olduğu iddia edilmemektedir.

## Kaynaklar

- OpenAI, “Configuration Reference” — https://developers.openai.com/codex/config-file/config-reference — erişim: 2026-10-06.
- OpenAI, “Subagents” — https://developers.openai.com/codex/agent-configuration/subagents — erişim: 2026-10-06.
- OpenAI, “Advanced Configuration” — https://developers.openai.com/codex/config-file/config-advanced — erişim: 2026-10-06.
- Anthropic, “Model configuration” — https://code.claude.com/docs/en/model-config — erişim: 2026-10-06.
- Anthropic, “Environment variables” — https://code.claude.com/docs/en/env-vars — erişim: 2026-10-06.
- OpenCode, “CLI” — https://opencode.ai/docs/cli/ — erişim: 2026-10-06.
- OpenCode, “Models” — https://opencode.ai/docs/models/ — erişim: 2026-10-06.
- DeepSeek, “Thinking Mode” — https://api-docs.deepseek.com/guides/thinking_mode — erişim: 2026-10-06.
- Google Cloud, “Thinking” — https://cloud.google.com/vertex-ai/generative-ai/docs/thinking — erişim: 2026-10-06.
- Google Antigravity, “CLI documentation” — https://antigravity.google/docs/cli — erişim: 2026-10-06. Erişilen web görünümü JS/sign-in sınırında kaldığından CLI effort desteği doğrulanamadı.
- Yerel kod: `subagent-bridge/src/frontends/mcp/tools.js:55-129`; `subagent-bridge/src/runtime/bridge-runtime.js:49-70`; `subagent-bridge/src/config.js:151-163`; `subagent-bridge/src/adapters/codex-adapter.js:75-100`; `subagent-bridge/src/adapters/claude-code-adapter.js:24-28`; `subagent-bridge/src/adapters/opencode-adapter.js:139-175,297-305`.
