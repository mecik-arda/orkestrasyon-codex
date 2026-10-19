# İkinci Beyin V3 M0 State Sınıflandırması (2026-09-18)

Tarih: 2026-09-18
Durum: incelendi
Amaç: İkinci Beyin V3 M0 kapsamında repo içi `state/` verisinin ve üretim çalışma zamanı state konumunun sınıflandırılması; kör bir state taşıma veya birleştirme yapılmaması.
Kapsam: `state/`, `cache/`, `logs/`, `memory/` ve üretim çalışma zamanı state yolları.
Kapsam dışı: M1 migrasyonu, otomatik hook yazımı, Vault içeriği.
Hazırlayan: Ana orkestratör.
Doğrulayan: GPT-5.6 Sol (salt-okunur bağımsız denetim), 2026-09-18: APPROVED. Temel iddialar güncel kodla uyumlu; kapanışı engelleyen bulgu yok.

## Yönetici Özeti

Üretim varsayılanı çalışma zamanı state'ini repo dışında, kişisel dizinde tutar. Repo içindeki `state/` yalnız yerel ve git-dışı bir geliştirme/çalıştırma artefaktıdır; ürün verisi değildir ve M1 kapsamında kör bir taşıma gerektirmez.

## Kanıt Ve Bulgular

### VERIFIED: Üretim state konumu repo dışındadır

Kanıt: `subagent-bridge/src/personal-layout.js` çalışma zamanı kökünü `localAppData/subagent-bridge` altında tanımlar (`logs`, `state`, `cache`). `subagent-bridge/src/config.js` `createDefaultStatePaths()` kök verilmediğinde bu kişisel düzeni kullanır; yalnız açıkça `root` verildiğinde `<root>/state` üretir.

Etkisi: Üretimde state repo dışındadır; M1'de varsayılan davranışı değiştiren bir taşıma gerekmez.

### VERIFIED: Repo içi `state/` git-dışı ve yerel bir artefakttır

Kanıt: `.gitignore` `state/checkpoints/*.json` ve `state/current.json` girdilerini içerir. `state/checkpoints` altında 45 JSON dosyası vardır; `state/current.json` yoktur. Çalışma ağacı temizdir, yani bu dosyalar sürüm kontrolünde değildir.

Etkisi: Bu içerik commitlenmiş ürün verisi değil, yerel geliştirme/çalıştırma artefaktıdır. Otomatik taşıma veya birleştirme veri kaybı riski taşır; yapılmamalıdır.

### VERIFIED: Üretim çalışma zamanı dizini kişisel konumda mevcuttur

Kanıt: `%LOCALAPPDATA%/subagent-bridge` altında `cache`, `logs`, `state` dizinleri vardır.

Etkisi: Aktif çalışma zamanı verisi zaten doğru konumdadır.

### VERIFIED: Veri sınıfları ve hedef dizin stratejisi

- Ürün verisi (kalıcı hafıza Vault'u): `memory/` altında, kullanıcı yönetiminde ve git-dışı (`.gitignore` `memory/`).
- Çalışma zamanı state'i (kilitler, checkpoint, maliyet journal'ı, provider circuit durumu): OS yerel veri dizini `%LOCALAPPDATA%/subagent-bridge/state`.
- Cache: `%LOCALAPPDATA%/subagent-bridge/cache`; repo `cache/` git-dışı yerel artefakt.
- Loglar ve metrikler: `%LOCALAPPDATA%/subagent-bridge/logs`; repo `logs/metrics/*.jsonl` git-dışı.
- Audit kaydı: `statePaths.logs/audit/memory-events.jsonl` (kişisel çalışma zamanı log dizininde).
- Kullanıcı tercihleri: `~/.config/subagent-bridge/config.json` ve `agents.json`; dağıtım şablonları `config/policy.json` ve `config/agents.json`.
- Secret: hiçbir sınıfta dosyaya yazılmaz; kimlik bilgileri OpenCode kullanıcı yapılandırmasında tutulur.
- Legacy: repo `state/` altındaki 45 git-dışı checkpoint dosyası eski/yerel çalıştırma artefaktıdır ve hedef dizin stratejisi dışındadır.

Hedef dizin stratejisi: ürün verisi Vault'ta kalır; çalışma zamanı state, cache ve loglar OS yerel veri dizininde kalır; repo içi legacy `state/` otomatik taşınmaz veya birleştirilmez. M1, yeni bir taşıma yerine sürümleme, legacy tespiti ve uyumluluk temizliği olarak kapsamlanmalıdır.

## Çelişkiler Ve Belirsizlikler

- Repo `state/checkpoints` içeriğinin hangi geçmiş çalıştırmalardan kaldığı bilinmemektedir; ürün davranışını etkilemediği için kimliklendirme zorunlu değildir.
- Kişisel çalışma zamanı state'inin içeriği bu rapor kapsamında listelenmemiştir (secret ve kişisel veri sınırı).

## Riskler Ve Güvenlik Sınırları

- Repo içi checkpoint dosyaları serbest metin içerebilir; birleştirme veya commit edilmemelidir.
- M1 kapsamında otomatik state taşıma yapılmaz; karar ana orkestratöre aittir.
- Bu rapor secret, workspace yolu veya prompt içeriği taşımaz.

## Öneriler Ve Açık Sorular

- M1, genel bir taşıma yerine sürümleme, legacy-state tespiti ve uyumluluk temizliği olarak yeniden kapsamlandırılmalıdır.
- Repo `state/checkpoints` temizliği isteğe bağlı ve manueldir; otomatik silme yapılmaz.
- Açık soru: M1'de legacy-state tespiti için bir `memory:doctor` benzeri salt-okunur sınıflandırma adımı yeterli mi?

## Kaynaklar

- `subagent-bridge/src/personal-layout.js`
- `subagent-bridge/src/config.js` (`createDefaultStatePaths`)
- `.gitignore`
- `scripts/doctor-memory.js`, `memory:doctor` komutu
