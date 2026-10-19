# Sol Kararı Uygulama Durumu (2026-09-19)

- Kapsam: V3 M2 hafıza hook pilotu, read-only routing kalite ölçümü ve Context Aşama 2.
- Karar kaynağı: Codex Sol (`gpt-5.6-sol`), salt-okunur stratejik değerlendirme.
- Uygulama ilkesi: Yeni büyük altyapı ve kota doldurmak için yapay görev üretimi yapılmaz.

## 1. V3 M2 Hafıza Hook Pilotu

- Durum: `GO`.
- Hook kurulumu ve opt-in akışı mevcut; gerçek OpenCode enjeksiyonu doğrulandı.
- Pilot yalnız gerçek kullanıcı oturumlarıyla yürütülür.
- Oturum sonunda yalnız kullanıcının açık `useful`, `partial` veya `not_useful` değerlendirmesi kaydedilir.
- Teknik hook doğrulama oturumları pilot fayda etiketi olarak sayılmaz.
- Pilot kapanış kapısı 15 etiketli oturum veya iki haftadır.
- Kayıt komutu: `npm run hook:feedback -- <outcome> --client=opencode --session-id=<session-id>`; session ID hook enjeksiyonundan gelmelidir.

## 2. Read-only Routing Kalite Ölçümü

- Durum: `CONDITIONAL GO`.
- V2 Faz 4'ün 30 edit etiketi bu ölçümün ön koşulu değildir.
- Yalnız zaten gerçekleşmiş gerçek read-only görevlerin sonuçları `routing:feedback` ile etiketlenir.
- Önce `npm run routing:classify -- list` ile aday görev görülür; yalnız kullanıcı tarafından `eligible_real_user` sınıflandırılan görevler etiketlenebilir.
- Ölçüm kotasını doldurmak için yeni sağlayıcı görevi, sentetik görev veya yinelenen görev başlatılmaz.
- Profil başına 15 gerçek etiket olmadan kalıcı routing kalite kararı verilmez.
- Yeni routing ölçüm çağrıları, aylık bütçe yenilenene veya ayrı deney bütçesi tanımlanana kadar açılmaz.
- Mevcut bütçe sınırı aşılmış olduğundan ücretli ölçüm genişletmesi başlatılmaz; runtime enforcement durumu ayrıca düzeltilmelidir.

## 3. Context Aşama 2

- Durum: `NO-GO`.
- Yapay çok oturumlu senaryo veya yalnız belge üretimi başlatılmaz.
- Aşama 2 şu olay birlikte gerçekleştiğinde yeniden değerlendirilir:
  - Gerçek bir iş en az üç ayrı oturuma zorunlu olarak yayılır.
  - Oturumlar arasında en az iki kez manuel bağlam yeniden kurma, önceki kararı yeniden arama veya bağlam kaybından kaynaklanan yanlış yönlendirme yaşanır.
  - Olay kısa bir ihtiyaç kaydıyla belgelenir.

## 4. İşletim Sırası

1. M2 pilotu gerçek oturumlarda yürütülür ve kullanıcı etiketleri toplanır.
2. Aynı dönemde oluşan gerçek read-only görevler, ek çağrı üretmeden routing geri bildirimiyle etiketlenir.
3. Bütçe yenilenmeden veya ayrı deney bütçesi tanımlanmadan routing kampanyası genişletilmez.
4. Context Aşama 2 yalnız belirlenen gerçek ihtiyaç eşiği oluşursa açılır.

## 5. Doğrulama Sınırı

- Bu kayıt plan kapılarını değiştirmez; mevcut pilot ve faz kriterlerini işletim kararıyla bağlar.
- M2 fayda sonucu kullanıcı etiketleri ve `npm run metrics` ile değerlendirilir.
- Routing kalite kararı profil başına gerçek etiket eşiği dolmadan kesinleştirilmez.

## 6. Uygulama ve Doğrulama Durumu (2026-09-20)

- Memory hook oturumları ham session ID yerine normalize edilmiş SHA-256 hash ile kaydedilir.
- Hook geri bildirimi, açık `eligible_real_user` sınıflandırması olmadan kabul edilmez; teknik, sentetik, yinelenen ve belirsiz oturumlar paydadan çıkarılır.
- Oturum metrik yazımı bağlam tesliminden sonraki event-loop turuna ertelenir; metrik hatası kullanıcı oturumunu başarısız saydırmaz.
- Legacy routing geri bildirimleri yeni aday kuyruğundan çıkarılır ve `legacyLabeledRuns` olarak ayrı raporlanır.
- Yeni çalışma zamanı dosyaları yerel ve CI doğrulama manifestlerine eklendi.
- `npm test`: 670/670 başarılı.
- `npm run verify`: başarılı.
- `npm run verify:ci`: başarılı.
- `git diff --check`: başarılı.
