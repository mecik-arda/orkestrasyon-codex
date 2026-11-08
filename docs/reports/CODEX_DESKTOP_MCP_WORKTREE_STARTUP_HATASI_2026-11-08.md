# Codex Desktop Hades MCP Worktree Başlangıç Hatası

Tarih: 8 Kasım 2026

## Özet

Codex Desktop bir Hades MCP thread'ini sürdürürken aşağıdaki genel bağlantı hatasını gösterdi:

```text
required MCP servers failed to initialize: hades-orchestrator
handshaking with MCP server failed: connection closed: initialize response
```

Sorun internet bağlantısı değildi. Hata, Codex tarafından oluşturulmuş temiz Git worktree'sinde eksik Node.js bağımlılıkları ve Hades çalışma alanı allowlist'inde bulunmayan worktree kökünden kaynaklandı.

## Kök neden

Worktree'de Hades MCP kaynak dosyası ve `package-lock.json` vardı; ancak `node_modules` yoktu. `package.json`, MCP başlatma zincirinin kullandığı `@modelcontextprotocol/sdk` bağımlılığını tanımlıyordu. MCP süreci bu modülü yükleyemediği için Node.js başlangıç sırasında kapandı. Codex'in `required = true` kaydı başarısız bağlantıyı thread başlangıç hatasına dönüştürdü.

Bağımlılıklar kilit dosyasından kurulduktan sonra başlatma, ikinci bir yapılandırma sorununa ulaştı: bu worktree'nin canonical kökü kişisel Hades policy'sindeki `allowedRoots` listesinde yoktu. Codex'te proje güvenilir olması Hades'in kendi yol allowlist'ine ekleme yapmıyor.

## Kanıt ve düzeltme

- Worktree'de `node_modules` olmadığı, `package-lock.json` olduğu ve gerekli MCP SDK'sının üretim bağımlılığı olarak tanımlandığı doğrulandı.
- İlk stdio `initialize` denemesi `ERR_MODULE_NOT_FOUND` ile `@modelcontextprotocol/sdk` yüklenemediği için sonlandı.
- Worktree kökünde `npm ci` çalıştırıldı; kaydedilmiş kilit dosyası kullanıldı ve kaynak dosyalar değiştirilmedi.
- İkinci `initialize` denemesi worktree'nin `allowedRoots` içinde olmadığını açıkça gösterdi. Yalnızca bu worktree'nin canonical kökü kişisel allowlist'e eklendi ve mevcut policy'nin yedeği alındı.
- Son stdio `initialize` çağrısı Hades Orchestrator 2.2.0 sunucu bilgisi ve MCP protokol yanıtıyla tamamlandı.
- Aynı Codex Desktop thread'i tekrar başlatıldı. `resources/list` çağrısı başarıyla tamamlandı ve iki resource döndürdü; initialize hatası tekrarlanmadı.

## Tekrarlanmaması için

Her yeni Codex Git worktree'si bağımsız checkout olarak ele alınmalıdır:

1. Hades MCP'yi o worktree'den çalıştırmadan önce worktree kökünde `npm ci` çalıştır.
2. Hades'in etkin kişisel policy'sindeki `allowedRoots` listesine yalnızca gerekli canonical worktree kökünü ekle.
3. MCP kaydını yeniden başlat veya Codex Desktop thread'ini yeniden dene.
4. Tekrar eden genel `connection closed` mesajında MCP süreç stderr çıktısını incele. Eksik paket hatası ile workspace allowlist reddi farklı başlangıç aşamalarıdır.

## Doğrulama kapsamı

Bu olay için doğrudan stdio MCP el sıkışması ve aynı Codex Desktop thread'inde resource listeleme kullanıldı. Proje test paketi çalıştırılmadı; uygulama kaynak kodu değiştirilmedi.

`npm ci` bu kurulum sırasında altı bağımlılık güvenlik uyarısı bildirdi: dördü orta, ikisi yüksek önem düzeyindeydi. Bu görevde bağımlılık güncellemesi veya `npm audit fix` uygulanmadı.
