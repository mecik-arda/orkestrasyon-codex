# Codex geçişi ve OpenCode rota durumu

Tarih: 2026-10-18

## 2026-11-07 güncel Codex Desktop/CLI entegrasyon durumu

`scripts/start-codex.ps1` Codex CLI'yi `PATH` üzerinden çözümler, repository kökünü launcher konumundan bulur ve desteklenen argümanlarla CLI exit code'unu korur. Windows PowerShell 5.1 üzerinden `.cmd`/`.bat` shim çalıştırılırken boş argüman, argüman içindeki çift tırnak ve `%VAR%` biçimi güvenle round-trip edilemediğinden launcher bu biçimleri shim başlamadan reddeder; boşluk, Unicode, `&`, `--` sonrası argümanlar ve sondaki ters eğik çizgi fixture ile sınanır. Doğrudan executable seçilmişse bu shim guard'ı uygulanmaz. Launcher Claude/DeepSeek credential'ı istemez ve Codex kullanıcı auth dosyalarına dokunmaz.

Launcher testindeki Windows PowerShell capability probe yalnız PowerShell'in yokluğu veya yapılandırılmış security-exception, `UnauthorizedAccess` ve açık execution-policy mesajı birlikte gözlenirse davranış testlerini skip eder. Spawn hatası, timeout, genel `AuthorizationManager` reddi, beklenmeyen exit veya marker eksikliği başarısızlık olarak kalır. Probe ve launcher fixture ortamları yalnız gereken Windows sistem değişkenlerini taşır; probe PATH'i Windows System32, launcher PATH'i yalnız sentetik executable dizinidir. Gerçek execution policy değiştirilmez. Bu testler gerçek Codex CLI'yi başlatmaz.

`npm run codex:check` salt okunur TOML/config kontrolüdür. `npm run codex:configure`, yalnız yönetilen Hades MCP alanlarını günceller; geçerli desteklenen TOML içeriğini ayrıştırır, ilgisiz ve bilinmeyen alanları korur, bozuk/çelişkili girdide fail-closed kalır, önceden mevcut dosya için doğrulanmış yerel yedek, lock ve geçici dosyayla güvenli yayın kullanır. `npm run codex:diagnose`, yalnız proje config'i, Hades entrypoint'i ve executable varlığını değerlendirir; user-global Codex config, canlı Desktop/Hades durumu, provider, capability veya Vault'u okumaz. Güncel `.codex/config.toml` zaten eşleştiği için bu entegrasyon çalışmasında config yazılmadı.

`npm run verify:local`, `verify:ci`, zorunlu seri `npm test`/benchmark, sentetik stdio smoke ve geçici sentetik config/Vault verify aşamalarını seri yürütür. Sentetik smoke'un varsayılan child ortamında provider credential'ı aktarılmaz; DeepSeek `/models` sağlık yolu anahtar olmadığında istek yapmadan döner, Antigravity sağlık kontrolü capability probe yerine yerel CLI sürüm kontrolüdür. Bu doğrulama gerçek Vault, harici inference, kişisel config veya zaten çalışan Desktop Hades'in etkin durumu hakkında kanıt oluşturmaz. Codex CLI görünür olsa da proje güveni, MCP başlangıcı ve canlı config kullanımı yalnız Codex Desktop'ta operasyonel olarak kontrol edilebilir; workspace identity ve katalog, çalışan kaynak commit'inin veya etkin ayarların bağımsız attestation'ı değildir.

## Karar

Hades Orchestrator'ın ana istemcisi Codex Desktop'tır. Codex, proje yerelindeki MCP kaydı üzerinden `subagent-bridge` sunucusuna bağlanır. Köprünün mevcut Codex, Antigravity ve Claude Code adaptörleri kendi sağlayıcılarıyla çalışmaya devam eder. OpenCode üzerinden çalışan modeller, doğrudan sağlayıcı rotaları hazırlanıp doğrulanana kadar devre dışıdır.

## Yapılan değişiklikler

- 2026-10-18 ilk geçişinde `npm run codex:configure` Hades MCP sunucu kaydını kuruyor ve o zamanki legacy `deepseek-subagent` girdisini kaldırıyordu. 2026-11-07 itibarıyla güvenli updater yalnız yönetilen Hades alanlarını değiştirir; diğer MCP kayıtlarını ve bilinmeyen Hades ayarlarını korur. Executable ve çalışma alanı yolları checkout'a özgüdür.
- Dağıtım şablonu `config/agents.json` ve kişisel `~/.config/subagent-bridge/agents.json` içindeki `opencode.enabled` değeri `false` yapıldı.
- Adaptör kaynakları ve `.codex/config.toml` Git'te takip edilir. Kişisel `~/.config/subagent-bridge/agents.json` repo dışında tutulur; bu geçişte ayrıca yedek kopya oluşturulmadı.
- Çalışma zamanı, kapalı OpenCode backend'ine çözümlenen `opencode`, `glm`, `kimi` ve `qwen` hedeflerini CLI başlatmadan `provider_disabled` nedeniyle reddeder. DeepSeek ve Space Bunny araçları da aynı OpenCode rotasına gittiğinden kapalıdır.
- OpenCode hedefleri Codex modeli adına dönüştürülmedi. Kod ve model kimlikleri repoda bırakıldı; etkin rota olmadan çağrılmaz.
- Paralel batch dağıtım şablonundaki OpenCode hedefi kaldırıldı. Kişisel yapılandırmada eski hedef bulunsa bile çalışma zamanı kapalı backend'i batch hedef listesinden çıkarır. Kapalı OpenCode rotalarına giden profil fallback'leri kullanılmaz.

## Şimdilik kapalı rotalar

- DeepSeek V4 Pro, V4 Flash, Flash ve Chat.
- GLM 5.2, 5.2 HighSpeed, 5.3 ve 5.3 Flash.
- Kimi K2.5 Instruct ve K2 Thinking.
- Qwen3 Coder 480B, Plus ve 30B.
- Space Bunny Free ve diğer OpenCode katalog kimlikleri.

Eski `low_cost_analysis`, `deep_analysis`, `glm_analysis`, `low_cost_glm_highspeed`, `kimi_analysis`, `qwen_analysis` ve GLM uygulama profillerinin tanımları politika dosyasında geçmiş rota bilgisi olarak durur. Çalıştırılmaları `provider_disabled` ile sonuçlanır. Codex profilleri kullanılabilir; edit profillerindeki kapalı sağlayıcı fallback'leri atlanır.

## Sonraki model entegrasyonu

Her sağlayıcı için resmi veya açıkça izin verilmiş erişim yolunu, kimlik doğrulama yöntemini ve model kimliğini ayrı belirlemek gerekir. Ardından doğrudan adaptör, erişim modu, model allowlist'i, maliyet ve retry sınırı, health/capability doğrulaması, MCP araç sözleşmesi ve canlı pilot tamamlanmalıdır. Bu tamamlanana kadar kapalı rotalar etkinleştirilmemelidir.

## Uygulama notu

Codex Desktop'ta depo kökünü `C:\Users\user\Desktop\Yazılım_Siber\orkestrasyon` ayrı ve güvenilen yerel proje olarak açmak gerekir. Mevcut `Yazılım_Siber` üst klasör projesindeki sohbet, alt deponun `.codex/config.toml` dosyasını otomatik olarak yüklemeyebilir. Proje açıldıktan sonra MCP sunucusu yeni Codex oturumunda yüklenir.
