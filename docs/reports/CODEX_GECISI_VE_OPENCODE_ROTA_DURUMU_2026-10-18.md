# Codex geçişi ve OpenCode rota durumu

Tarih: 2026-10-18

## Karar

Hades Orchestrator'ın ana istemcisi Codex Desktop'tır. Codex, proje yerelindeki MCP kaydı üzerinden `subagent-bridge` sunucusuna bağlanır. Köprünün mevcut Codex, Antigravity ve Claude Code adaptörleri kendi sağlayıcılarıyla çalışmaya devam eder. OpenCode üzerinden çalışan modeller, doğrudan sağlayıcı rotaları hazırlanıp doğrulanana kadar devre dışıdır.

## Yapılan değişiklikler

- `npm run codex:configure`, Git'te takip edilen proje `.codex/config.toml` dosyasındaki Hades MCP sunucu kaydını kurar veya yeniler. Var olan proje model ayarlarını korur ve eski `deepseek-subagent` kaydını kaldırır. Dosyadaki executable ve çalışma alanı yolları makineye özgüdür; başka checkout'ta komut yeniden çalıştırılır.
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
