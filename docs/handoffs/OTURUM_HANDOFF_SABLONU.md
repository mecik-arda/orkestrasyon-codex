# Oturum Handoff Şablonu

Bu not, birden fazla oturum gerektiren işlerde durumu insan veya ana orkestratör tarafından seçilerek okunabilir tutar. Otomatik prompt enjeksiyonu, otomatik Vault yazımı veya subagent'a doğrudan aktarım için kullanılmaz.

Dosya adı ASCII, küçük harf ve tire kullanır: `konu-handoff-YYYY-MM-DD.md`.

```markdown
# İş Başlığı Handoff

Tarih:
Durum: aktif | beklemede | bloklu | tamamlandi
Sahip:

## Hedef

## Tamamlananlar

## Aktif İş

## Doğrulama

- Çalıştırılan komutlar:
- Sonuç:
- Çalıştırılmayan doğrulamalar:

## Bloklayıcılar Ve Riskler

## Sonraki Adım

## İlgili Dosyalar Ve Raporlar
```

Handoff notu prompt, secret, erişim anahtarı, workspace yolu, görev kimliği veya ham provider çıktısı içermez. Gelecekte yararlı kararlar kalıcı hafızaya alınacaksa mevcut draft, analiz, SHA-256 ve promote akışı ayrı olarak uygulanır.
