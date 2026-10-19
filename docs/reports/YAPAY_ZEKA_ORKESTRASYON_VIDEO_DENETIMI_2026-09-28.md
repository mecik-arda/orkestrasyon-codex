# Yapay Zeka Orkestrasyon Videosu Denetim Raporu

Tarih : 2026-09-28
Denetlenen belge : `docs/plans/videolar/yapay_zeka_orkestrasyon_videosu_2026-09-28.md`
Denetleyen : GPT-6 Sol, salt okunur denetim
Bağımsız doğrulayan : ana orkestratör, kaynak kod ve yapılandırma üzerinden
Durum : tamamlandı, bir yüksek ve dört orta düzeltme önerildi ve uygulandı

## 1. Yönetici Özeti

Video analiz belgesinin mimari önerileri, bu projede zaten karşılanan ilkeleri "yeni öneri" gibi
sunuyordu. Denetim, sekiz önerinin altısının mevcut kurallarla örtüştüğünü, ikisinin ise gerçek bir
fark yaratmadığını gösterdi.

Buna karşılık belgenin kendisi beş noktada hatalı veya fazla kesin ifadeler içeriyor. En önemlisi
maliyet kapılarıdır: belge "günlük/aylık maliyet kapıları zaten var" demekte, oysa yapılandırmada
aylık limit tanımlı olsa da enforcement bayrağı kapalıdır ve günlük limit hiç tanımlı değildir.
Bu, projede gerçekten açık bir boşluktur.

Önerilerin hiçbiri kod değişikliği gerektirmiyor. Açık kalan üç madde karar kapısıdır ve
ayrı plan gerektirir.

## 2. Denetim Kapsamı ve Yöntem

- Denetim salt okunur gerçekleştirildi; çalışma alanında hiçbir dosya değiştirilmedi.
- Kaynak altyazı dosyası geçici dizinde olduğu için denetleyen model transcript'e erişemedi.
  Bu nedenle videodaki sayısal beyanların doğruluğu denetim kapsamı dışında kaldı.
- Denetimde esas olarak iki soru soruldu: belgenin bu proje hakkındaki "mevcut" ve "bizim açığımız"
  türü iddiaları kodla örtüşüyor mu, ve videodan çıkarılan öneriler gerçekten uygulanabilir mi.
- Ana orkestratör, denetleyenin beş bulgusunun tamamını kaynak dosya ve satır üzerinden bağımsız
  olarak yeniden doğruladı. Beşi de doğru çıktı.

## 3. Doğrulanmış Bulgular

### 3.1. Yüksek: Maliyet kapıları etkin değil

Belge, `config/policy.json` içinde bütçelerin, günlük ve aylık maliyet kapılarının ve
`npm run budget` görünümünün zaten bulunduğunu, bu konuda yeni bir şey gerekmediğini yazıyor.

Gerçek durum:

- `config/policy.json:143` aylık limiti tanımlıyor: `monthlyCostLimitUsd: 100`.
- `config/policy.json:144` enforcement bayrağını kapatıyor: `costBudgetEnforced: false`.
- Yapılandırmada `dailyCostLimitUsd` anahtarı hiç bulunmuyor. Günlük limit tanımlı değil.
- Dönemsel engelleme yalnızca bayrak açıkken çalışıyor; kaynak: `subagent-bridge/src/metrics.js:1418`
  ve `subagent-bridge/src/metrics.js:1436`.
- `npm run budget` yalnızca bir görünüm sunar; etkin bir harcama kapısı anlamına gelmez.

Sonuç: maliyet izleme ve raporlama mevcuttur, maliyet durdurma değil. Belgedeki "yeni bir şey
gerekmiyor" ifadesi bu projedeki en somut eksikliği gizlemektedir.

Düzeltme: `costBudgetEnforced: false` ve günlük limitin tanımlı olmadığı açıkça yazılmalı.

### 3.2. Orta: Dosya sahipliği açığı olduğundan büyük gösterilmiş

Belge, paralel salt okunur ajanların aynı dosyayı inceleyebilmesini "bizim en somut açığımız" olarak
sunuyor.

Gerçek durum:

- Workspace kilidi aynı workspace içinde birden fazla eşzamanlı okumaya izin verir; yalnızca yazma
  kilidi veya yazma niyeti varsa okumayı dışlar. Edit ise yazma veya okuma kilidi varsa engellenir.
  Kaynak: `subagent-bridge/src/services/workspace-coordinator.js:143` ve aynı dosya `:152`.
- Paralel okumanın bilinçli olarak desteklendiği testle doğrulanıyor:
  `tests/optimization.test.js:23`.
- Aynı dosyanın bağımsız ajanlarca incelenmesi kalite denetimi için faydalıdır; kısıtlamak
  bağımsız doğrulamayı zayıflatır.

Sonuç: korunan bir davranış, eksiklik değil. Gerçek eksik olan, tekrarlı okumanın ölçülmemesi ve
önlenmemesidir; dosya sahipliğini okumaya dayatmak yerine edit kapsamının görev bazında yazılması
doğru yöndür.

Düzeltme: "en somut açık" ifadesi çıkarılmalı. Belgenin sonuç bölümünde aynı ifadenin ikinci
tekrarı da düzeltilmeli.

### 3.3. Orta: Tek disposable workspace ifadesi hatalı

Belge, editlemelerin "tek bir disposable workspace" içinde kilitle serileştirildiğini yazıyor.

Gerçek durum:

- Her edit denemesi için ayrı geçici dizin oluşturuluyor: `fs.mkdtempSync` çağrısı
  `subagent-bridge/src/services/disposable-workspace.js:302`.
- Kaynak workspace'e promotion, kilit alındıktan sonra yapılıyor:
  `subagent-bridge/src/runtime/bridge-runtime.js:1096` ve `:1102`.

Sonuç: doğru ifade "deneme başına disposable workspace, kaynakta kilitli promotion" olmalı.
Geçici alan sayısı tek değildir; serileştirme geçici alanda değil, kaynak promotion adımındadır.

### 3.4. Orta: Kayıp kontrolü olduğundan güçlü anlatılmış

Belge, hazırlanmış edit onayı ve disposable workspace'in "kayıp kontrolü sağladığını" yazıyor.

Gerçek durum:

- Hazırlanmış değişiklik ve kaynak durum bağı mevcut:
  `subagent-bridge/src/runtime/bridge-runtime.js:1137`.
- Ancak geçici alan, deneme sonunda `finally` bloğunda temizleniyor:
  `subagent-bridge/src/runtime/bridge-runtime.js:1201` ve
  `subagent-bridge/src/services/disposable-workspace.js:404`.

Sonuç: bu mekanizma uzun işlerde kalıcı ilerleme kaydı değildir ve kesinti sonrası otomatik devam
garantisi vermez. Belgedeki "kayıp kontrolü sağlıyor" ifadesi fazla kesindir.

### 3.5. Orta: Tekilleştirme dayanağı yanlış dosyaya bağlandı

Belge, farklı dosya sahiplikleriyle tekrarı önleme pratiğini "yakınsama testlerimizdeki
tekilleştirme pratiğiyle aynı fikir" diye eşliyor.

Gerçek durum:

- Taranan testlerde bulunan tek açık tekilleştirme örneği, M2 hook cohort kaydında aynı oturuma
  farklı cohort atanmasının çakışma olarak işaretlenmesidir:
  `tests/memory-hook-feedback.test.js:51`.
- Bu test ajan görevlerinin veya dosya sahipliğinin tekilleştirildiğini göstermez.

Sonuç: dayanak ilgisiz. Ya çıkarılmalı ya da gerçekten ilgili bir test gösterilmeli.

## 4. Raporda Düzeltilmesi Gereken İfadeler

Aşağıdaki maddelerin tamamı denetlenen belgede uygulanmıştır; kaynak kodla değişiklik yapılmamıştır.
Düzeltmeler `docs/plans/videolar/yapay_zeka_orkestrasyon_videosu_2026-09-28.md` dosyasına işlendi ve
denetlenen belgenin başına denetim durum notu eklendi.

1. Satır 144, "günlük/aylık maliyet kapıları ve `npm run budget` görünümü zaten var, yeni bir şey
   gerekmiyor": `costBudgetEnforced: false` ve günlük limitin tanımlı olmaması eklenmeli.
2. Satır 141, "git kapımız mevcut" ve "kayıp kontrolü sağlıyor": `requireGitRepository: false`
   olduğu için git kapısı zorunlu bir güvence değildir; kayıp kontrolü iddiası zayıflatılmalı.
3. Satır 134, "tek bir disposable workspace": "deneme başına disposable workspace, kaynakta kilitli
   promotion" olarak düzeltilmeli.
4. Satır 132 ve satır 160, "en somut açık" ve "en kolay kapatabileceğimiz boşluk": paralel okuma
   korunan bir davranış olduğu için bu ifadeler çıkarılmalı.
5. Satır 154, yakınsama testlerine atıf: ilgisiz test olduğu için dayanak kaldırılmalı.
6. Satır 70, "eşzamanlı tavan 20" ve "228 ajanın aynı anda çalıştırıldığı" ifadeleri birbiriyle
   çelişiyor. İkinci ifadenin bir akışın toplam ajan sayısı olduğu varsayımı ayrıca belirtilmeli.
7. Satır 15 ve satır 117, ekran paylaşımı gözlemleri: "konuşmacı ekran paylaşımından söz ediyor"
   düzeyine çekilmeli, gözlenmiş gibi yazılmamalı.

Satır 125 ve 126 için not: denetleyen, ana orkestratörün doğrudan yazmasına ilişkin ifadenin
yumuşatılmasını önerdi. Belgenin bu maddesi zaten "yeni politika değil" demekte ve sayısallaştırmayı
ölçüm gerektiren bir hipotez olarak sunmaktadır. Bu bulgu için düzeltme gerekmiyor.

## 5. Doğrulanmış Öneriler

Her öneri için mevcut karşılığı, kanıtı, riski ve önceliği aşağıda verilmiştir.

### 5.1. Maliyet kapısını etkinleştirme

- Öneri : Aylık limit zaten tanımlı; günlük limit eklenmeli ve `costBudgetEnforced` bayrağı
  karar verilerek açılmalı.
- Kanıt : `config/policy.json:143`, `config/policy.json:144`,
  `subagent-bridge/src/metrics.js:1418`, `subagent-bridge/src/metrics.js:1436`.
- Mevcut karşılık : kısmi. Raporlama ve çağrı başına retry bütçesi var
  (`config/policy.json:140`), dönemsel harcama kapısı etkin değil.
- Risk : limit değerleri eksik maliyet telemetrisiyle kalibre edilmelidir. Ölçülen durum
  ciddidir: `npm run budget` görünümüne göre 84 koşunun maliyeti biliniyor, 1024 koşunun maliyeti
  bilinmiyor; yani gerçek maliyet kapsamı yüzde 7,58'dir. Günlük pencerede 32 koşunun hiçbirinde
  maliyet bilinmiyor ve kapsam sıfırdır. Kalibrasyon bu kapsam yükseltilmeden güvenilir olmaz.
- Öncelik : yüksek.
- Etiket : karar kapısı.

### 5.2. Paralel okumada tekrarlı işin ölçülmesi

- Öneri : Salt okunur paralel incelemede aynı dosyanın farklı ajanlarca tekrar okunması ölçülmeli;
  ölçüm anlamlı tekrar gösterirse edit kapsamının görev bazında yazılması zorunlu kılınmalı.
- Kanıt : `subagent-bridge/src/services/workspace-coordinator.js:152`,
  `tests/optimization.test.js:23`.
- Mevcut karşılık : kısmi. Edit zaten seçili dosyayla sınırlandırılıyor
  (`subagent-bridge/src/services/disposable-workspace.js:294` ve `:378`), okuma görevleri için
  sahiplik tekilleştirmesi yok.
- Risk : katı okuma sahipliği bağımsız denetimi engeller.
- Öncelik : orta.
- Etiket : karar kapısı.

### 5.3. Uzun işlerde kalıcı ilerleme kaydı

- Öneri : Uzun süreli görevlerde kesinti sonrası devam edebilmek için kalıcı ilerleme kaydı
  değerlendirilmeli. Bu kayıt alt ajana commit yetkisi verilerek değil, orkestratör onaylı
  yedekleme veya harici durum günlüğü yoluyla sağlanmalı.
- Kanıt : `subagent-bridge/src/runtime/bridge-runtime.js:1201`,
  `subagent-bridge/src/services/disposable-workspace.js:404`,
  `.agents/skills/commit-at/SKILL.md:14`, `AGENTS.md:28`.
- Mevcut karşılık : kısmi. `commit-at` mevcut ve kontrollü edit onaylanabiliyor; ancak bunlar
  otomatik kurtarma kaydı değildir.
- Risk : alt ajan commit'i açık yetki sınırına aykırıdır.
- Öncelik : orta.
- Etiket : karar kapısı.

### 5.4. Uzun insansız çalışma için kesinti tasarımı

- Öneri : Otomatik devam vaadi verilmeden önce kesinti sonrası durum, kalan maliyet ve insan
  karar kapısını tanımlayan ayrı bir tasarım yapılmalı.
- Kanıt : `subagent-bridge/src/runtime/bridge-runtime.js:1201` geçici alanın iş sonunda
  temizlendiğini gösteriyor. Videonun gece boyunca çalışma anlatısı bu ihtiyacı doğuruyor.
- Mevcut karşılık : kısmi.
- Risk : yarım kalmış değişikliklerin kaybolması.
- Öncelik : orta.
- Etiket : karar kapısı.

### 5.5. Worktree filosu

- Öneri : Yalnızca ölçülmüş bir edit kuyruğu sorunu varsa tasarlanmalı.
- Kanıt : kaynak promotion zaten kilitli ve geçici alanlar deneme bazında açılıyor
  (`subagent-bridge/src/runtime/bridge-runtime.js:1102`,
  `subagent-bridge/src/services/disposable-workspace.js:302`).
- Mevcut karşılık : yok.
- Risk : birleştirme, onay bağları ve maliyet sınırları yeniden tasarlanır.
- Öncelik : düşük.
- Etiket : dış-bağımlı. Ölçülmüş kuyruk sorunu olmadan uygulanmaz.

### 5.6. Brief kısaltma pratiği

- Öneri : Brief kısa tutulurken hedef, seçili dosyalar ve kabul kriterleri korunmalı.
- Kanıt : `AGENTS.md:25`, `subagent-bridge/src/runtime/bridge-runtime.js:1065`.
- Mevcut karşılık : var.
- Risk : "gevşek brief" seçili dosya sınırını ve doğrulanabilir kabul kriterlerini gevşetmemeli.
- Öncelik : düşük.
- Etiket : mevcut pratik, değişiklik gerekmiyor.

### 5.7. Kritik değişiklikte bağımsız inceleme

- Öneri : Kritik değişikliklerde bağımsız inceleme ve hedefli test kullanılmaya devam edilmeli.
- Kanıt : `AGENTS.md:20` ve `AGENTS.md:21`.
- Mevcut karşılık : var.
- Risk : aynı görevi rutin olarak iki modele vermek mevcut tekrar yasağıyla çatışır
  (`AGENTS.md:26`).
- Öncelik : düşük.
- Etiket : mevcut pratik, değişiklik gerekmiyor.

## 6. Korunan Sınırlar

Aşağıdaki videodan gelen öneriler reddedilmiştir; mevcut güvenlik ve yetki sınırları korunmalıdır.

- Alt ajanların kendi aralarında koordinasyon kurması : reddedildi. Delegation derinliği 1 ile
  sınırlı ve alt ajanların alt ajan çağırması reddediliyor
  (`subagent-bridge/src/services/delegation-guard.js:1`, `tests/faz-0-core.test.js:196`).
  Bu sınır bütçe denetimini ve yetki izini dar tuttuğu için korunmalıdır.
- Alt ajanlara commit yetkisi : reddedildi. `AGENTS.md:28` bunu açıkça yasaklıyor.
- Ana orkestratörün doğrudan yazmasını yasaklamak : reddedildi. Bu ayrım bir politika farkı
  değildir; ana orkestratörün doğrudan edit yapması zaten yetkilidir ve küçük işi gereksiz
  devretmemesi isteniyor (`AGENTS.md:19`, `AGENTS.md:24`). Zorunlu delegasyon maliyet ve gecikme
  artırır.

## 7. Videodan Doğrulanamayan İddialar

Aşağıdakilerin hiçbiri bu denetimde doğrulanamadı ve kaynak logu yoktur. Konuşmacı beyanıdır:

- 61.000 ve 311.000 token tüketimi ile yüzde 8 ve yüzde 32 bağlam oranları.
- Yüzde 2,7 hata oranı ve 4.330 araç çağrısı.
- Yirmi eşzamanlı alt ajan tavanı.
- Tek akışta 228 ajan.
- Bir iş akışında 16 ajan ve 500 bin token üzeri tüketim.
- Gece boyunca 48 ajan, 13 farklı çekme isteği ve ana dala alınma.
- Bir gece 87 dakika bağlantı kesintisi ve hiçbir işin kaybolmaması.
- İki günde haftalık limitin yüzde 90'ına ulaşılması.

Ayrıca yalnızca transkript metnine dayanıldığı için ekranda terminal çıktılarının veya gerçek
ajan çalışmasının gösterildiği doğrulanamaz. Commit ile iş kaybının sıfırlanması, worktree ile
kesintiden sorunsuz devam ve kısa prompt'ların güvenilir sınır koruması deneysel güvence değildir.

## 8. Önerilen Sıra

1. Belgedeki beş hatalı ifade düzeltilsin. Bu, yalnızca metin değişikliğidir ve davranış etkilemez.
2. Maliyet kapısı kararı verilsin. Bu, projedeki tek yüksek öncelikli açıktır. Karar öncesinde önce
   maliyet kapsamının yükseltilmesi gerekir: bugün koşuların yalnızca yüzde 7,58'inin maliyeti
   biliniyor, günlük pencerede kapsam sıfır.
3. Paralel okumada tekrarlı iş ölçümü için gözlem eklensin; kısıt ancak ölçüm anlamlı sonuç
   verirse uygulansın.
4. Kalıcı ilerleme kaydı ve insansız çalışma tasarımı ayrı bir plan konusu olarak açılsın.
5. Worktree filosu, ölçülmüş kuyruk sorunu oluşmadan gündeme gelmesin.
