# OpenCode Eklenti Modülünün Kanonik Kaynağı ve Taşınma İncelemesi

**Tarih:** 17 Ekim 2026  
**Kapsam:** Hades Orchestrator içindeki OpenCode'a bağlı eklentilerin kaynağı, etkinleştirme biçimi, ortak kodla sınırı ve OpenCode kaldırıldığında korunacak dosyalar.  
**İnceleme türü:** Yerel kaynak ve Git durumu incelemesi; dosya taşıma veya çalışma zamanı değişikliği yapılmadı.

## Yönetici özeti

İstenen modülün yeni bir yere taşınmasına gerek yok. Batch ilerleme eklentisinin kanonik kaynağı zaten `templates/opencode/parallel-batch-progress.js` altında tutuluyor. `.opencode/plugins/parallel-batch-progress.js` ise yalnızca bu kaynağı dışa aktaran, OpenCode'un yüklediği küçük bir bağlayıcı. Bu ayrım, OpenCode API'sine bağlı arayüz kodunu ortak orkestrasyon çalışma zamanından ayrı tutuyor.

Aynı depoda ikinci bir OpenCode eklentisi daha bulunuyor: Second Brain hafıza hook'u. Bunun ortak mantığı `subagent-bridge/src/services/memory-hook-plugin.js` içinde, OpenCode'a özgü kurulum dosyası ise `scripts/install-memory-hook.js` içinde üretiliyor. `.opencode/plugins/second-brain-memory.js` kopyası makineye özel mutlak yollar taşıdığı için `.gitignore` kapsamındadır ve yayımlanacak kanonik kaynak değildir.

Öneri: batch eklentisinin kaynağını `templates/opencode/` altında bırak; `.opencode/plugins/` dosyasını yalnız yerel etkinleştirme yüzeyi olarak koru. Second Brain dosyasını da mevcut üretici akışından kur. Ek bir kod taşıması yapmak, mevcut kaynak ayrımını bozup tek bir OpenCode kurulumuna bağımlılığı artırır.

## Kullanıcı hedefi ve karar

Amaç, OpenCode içine bağlanmış Hades Orchestrator modülünün OpenCode kurulumu kaldırıldığında kaybolmamasını sağlamak ve uygun kaynak konumunu belgelemekti.

Yerel repository'de bu kod zaten uygulama/host entegrasyonu ile ortak runtime olarak ayrılmış durumda. Bu nedenle bu çalışma bir kod taşıması değil, mevcut yerleşimin doğrulanması ve ayrıntılı raporlanması olarak tamamlandı. OpenCode eklentisinin kendisi OpenCode olmadan çalışmaz; korunması gereken şey eklentinin kanonik kaynak kodudur. O kaynak repository içinde duruyor.

## İncelenen iki eklenti

### 1. Parallel Batch Progress

Bu, OpenCode TUI'de batch işlemlerinin ilerlemesi için geçici bildirim gösteren eklentidir.

- Kanonik uygulama: `templates/opencode/parallel-batch-progress.js`
- OpenCode proje yükleyicisi: `.opencode/plugins/parallel-batch-progress.js`
- Test kaynağı: `tests/parallel-batch-progress-plugin.test.js`
- Kullanıcı dokümantasyonu: `README.md` içindeki OpenCode batch-progress bölümü
- Tarihsel köken: Git geçmişinde `84f4002` commit'iyle eklenmiş, sonraki commit'lerde parser ve teşhis davranışı geliştirilmiş.

Yükleyici dosya 93 baytlık bir dışa aktarım bağlayıcısıdır. Eklentinin asıl kodu değildir; asıl uygulamayı `templates/opencode/` yolundan içe aktarır. Hem bağlayıcı hem şablon şu an Git tarafından izleniyor. `.gitignore` genel olarak `.opencode/plugins/` yolunu yok sayıyor olsa da önceden izlenen bağlayıcı depoda kalıyor.

Şablonun davranışı:

- `tool.execute.before`, `tool.execute.after` ve `message.part.updated` olaylarını işler.
- Batch başlatma, sorgulama, iptal ve entegrasyon onayı araçlarının tamamlanan çıktılarından batch özeti çıkarmayı dener.
- Bildirim tekrarını oturum ve batch kimliğiyle birlikte özet imzasına göre azaltır.
- Sonuç ayrıştırılamadığında veya OpenCode bildirimi gösteremediğinde sınırlı tanı bilgisi yazar ve uygun durumda genel uyarı göstermeyi dener.
- Bildirimde batch kimliğinin kısaltılmış biçimi, durum ve görev ilerleme sayaçları kullanılır.

Bu, kalıcı panel değildir. Orkestratörün polling yapması veya batch işleminin bir sonuç üretmesi gerekir; eklenti kendi başına sürekli ilerleme kaynağı oluşturmaz. Ürettiği yüzey OpenCode TUI API'sine bağlı olduğu için modülün doğru yeri ortak Bridge runtime değil, OpenCode adapter/template katmanıdır.

### 2. Second Brain Memory Hook

Bu, istemci oturumuna seçilmiş Vault alıntıları ekleyen ayrı bir OpenCode eklentisidir.

- Ortak hook davranışı: `subagent-bridge/src/services/memory-hook-plugin.js`
- OpenCode eklenti dosyası üreticisi: `scripts/install-memory-hook.js`
- Kurulum kapsamı ve davranış regresyonları: `tests/memory-hook.test.js`
- Yerel üretilmiş dosya: `.opencode/plugins/second-brain-memory.js`

OpenCode eklenti dosyası mutlak `file:///C:/Users/...` yolları içerir. Bu nedenle kişisel kurulum çıktısıdır, `.gitignore` tarafından yok sayılır ve başka makineye taşınmamalıdır. `hook:install` üreticisi gereken Bridge modüllerinin URL'lerini kurulum anında oluşturur; seçilen istemciye göre OpenCode, Codex veya Claude entegrasyonunu kurar. OpenCode entegrasyonu `SUBAGENT_SECOND_BRAIN_HOOK=1` ile etkinleştirilir.

Bu dosyayı `templates/opencode/` altına ham biçimde taşımak doğru olmaz; içindeki mutlak yollar başka kurulumlarda çalışmayabilir ve üretici akışını atlatmış olur. Ortak iş mantığı zaten Bridge service katmanındadır. OpenCode API'sine özel ince adapter ise installer tarafından üretilmelidir.

## Taşıma kararı

### Neden batch modülünü ortak runtime'a taşımıyoruz

Batch bildirimleri OpenCode'a ait plugin olaylarına ve `client.tui.showToast` arayüzüne dayanıyor. Bu arayüz OpenCode dışındaki istemcilerde bulunmuyor. Eklentiyi `subagent-bridge` içine almak Bridge'i host UI ayrıntısına bağlar ve Codex/Claude entegrasyonlarını yanlış katmana taşır.

### Önerilen yerleşim

- Ortak batch orkestrasyonu ve durum hesabı Bridge içinde kalır.
- OpenCode TUI bildirim adapter'ı `templates/opencode/` içinde kalır.
- `.opencode/plugins/` yalnız OpenCode'un yükleyeceği ince bağlayıcı veya yerel üretilmiş kurulum çıktısı için kullanılır.
- Makineye özel plugin çıktıları kaynak şablon yerine commit edilmez.

### OpenCode kaldırıldığında

- Repository'deki `templates/opencode/parallel-batch-progress.js`, test ve dokümantasyon silinmez.
- `.opencode/plugins/parallel-batch-progress.js` depoda zaten izlenen dosyadır; OpenCode host kaldırılırsa artık çalışmaz, ancak repository kopyası durur.
- `.opencode/plugins/second-brain-memory.js` yerel ve yok sayılan çıktıdır. OpenCode kaldırılınca bu host adapter çalışmaz; ortak hafıza hook'u ve diğer istemci kurulumları Bridge içinde kalır.
- OpenCode'u kaldırma işlemi bu rapor kapsamında yapılmadı. Kullanıcının kişisel config, oturum veritabanı veya kimlik bilgisi yollarına dokunulmadı.

## Envanter raporuyla karşılaştırma

15 Ekim tarihli `OPENCODE_SILME_ONCESI_ORKESTRASYON_INVENTARI_2026-10-15.md` iki önemli bulguyu doğru kaydediyor: `templates/opencode/parallel-batch-progress.js` kanonik kaynaktır ve `second-brain-memory.js` makineye özel, ignore edilen çıktıdır.

Bu inceleme güncel Git indeksinde `.opencode/plugins/parallel-batch-progress.js` dosyasının da izlenen bir dosya olduğunu ayrıca doğruladı. Bu durum genel `.gitignore` girdisiyle çelişmez; Git'te daha önce izlenen bir dosya, sonradan ignore kuralı eklense de izlenmeye devam eder. Dolayısıyla o dosyayı yalnız `.gitignore` kuralına bakarak silinmiş/taşınmış varsaymamak gerekir.

## Değişiklik ve doğrulama kaydı

Bu incelemede yalnızca bu rapor oluşturuldu. Plugin kaynakları, üretici, `.opencode` dosyaları, README ve testler değiştirilmedi. Kod testi çalıştırılmadı; çalışma zamanı davranışı değişikliği yapılmadı.

İnceleme sırasında çalışma ağacında önceden var olan değişiklikler bulundu:

- Değiştirilmiş plan: `docs/plans/PARALLEL_TASK_PROCESS_OUTPUT_LIMIT_DUZELTME_PLANI_2026-10-15.md`
- Önceden var olan yeni plan ve raporlar: `docs/plans/PARALLEL_BATCH_SONLANMA_DURUMU_SOZLESMESI_PLANI_2026-10-15.md`, `docs/reports/ORKESTRASYON_PARALLEL_BATCH_LIFECYCLE_DURUM_RAPORU_2026-10-15.md` ve `docs/reports/codex_subagent_model_mimarisi_ve_yapilandirma_raporu.md`

Bunlar bu görevden önce vardı ve değiştirilmedi. Kullanıcı tarafından belirtilen public repository URL'si Hades Orchestrator repository sayfası olarak doğrulandı. Web görüntüleyicisi ilgili dosyanın ham GitHub sayfasını açamadığı için public `main` dalındaki dosya byte eşitliği bağımsız olarak doğrulanmadı; yerel Git working tree ve indeks bulguları doğrudan doğrulandı.

## Kaynaklar

### Yerel kaynaklar

- `AGENTS.md`: kod, test ve dokümantasyon kuralları.
- `templates/opencode/parallel-batch-progress.js`: batch bildirim eklentisinin kanonik uygulaması.
- `.opencode/plugins/parallel-batch-progress.js`: OpenCode proje plugin bağlayıcısı.
- `subagent-bridge/src/services/memory-hook-plugin.js`: hafıza hook'unun ortak plugin davranışı.
- `scripts/install-memory-hook.js`: istemciye özel hook dosyası üreticisi.
- `tests/parallel-batch-progress-plugin.test.js` ve `tests/memory-hook.test.js`: ilgili regresyon test kaynakları.
- `README.md`: kurulum, etkinleştirme ve plugin sınırlarını açıklayan bölümler.
- `OPENCODE_SILME_ONCESI_ORKESTRASYON_INVENTARI_2026-10-15.md`: kullanıcının sağladığı önceki envanter ve etki analizi.

### Dış kaynak

- [Hades Orchestrator GitHub repository](https://github.com/mecik-arda/hades-orchestrator), erişim tarihi 2026-10-17. Repository sayfası kamuya açık Hades Orchestrator projesini ve `templates/opencode` klasörünü gösteriyor. Raw dosya sayfası bu incelemede web görüntüleyicisinde açılamadı; belirli commit'teki içerik için yerel kaynak esas alındı.

## Yeniden üretilebilirlik kanıtı

### Amaç ve doğrulama kapsamı

17 Ekim 2026 tarihinde iki OpenCode plugin yolunu da yeni ve benzersiz bir geçici çalışma alanında yeniden oluşturdum. Amaç, kaynak kodun yeniden üretilebilir ve import edilebilir olduğunu göstermekti. Deneme gerçek proje içindeki `.opencode/plugins` dosyalarını, OpenCode kullanıcı ayarlarını, OpenCode session veritabanını veya kimlik bilgilerini kullanmadı. Geçici workspace deneme tamamlandıktan sonra kaldırıldı.

Bu işlem canlı OpenCode uygulamasını başlatmadı. Dolayısıyla plugin callback'lerinin OpenCode event'leriyle tetiklendiğini veya TUI toast'ının gerçekten görüntülendiğini kanıtlamaz. Kanıtlanan kapsam dosya üretimi, kaynak eşitliği, kaynak importları ve exported plugin fonksiyonlarının Node.js tarafından yüklenmesidir.

### Deneme ortamı ve kaynak sabitleme

- İşletim sistemi/kabuk: Windows, PowerShell.
- Repository HEAD: `300a0a50b4e00dba250999ca265f4d292438d534`.
- Batch dosyası ESM olarak doğrudan Node.js tarafından yüklendi.
- Second Brain kurulumu package script'i üzerinden `npm.cmd` ile çalıştırıldı. PowerShell'deki `npm.ps1` execution policy kontrolü tarafından engellendiği için Windows `.cmd` shim'i kullanıldı; bu aynı npm script'ini `cmd.exe` üzerinden çağırır.
- Kanıt koşusundan sonra `.opencode/plugins`, `templates/opencode`, `scripts/install-memory-hook.js` ve ilgili Bridge service dosyalarında Git değişikliği bulunmadı.

Kullanılan kanonik dosyaların SHA-256 özeti:

- `templates/opencode/parallel-batch-progress.js`: `310FE81001BECBF5507EB39644E44CC5F6FE623EDA7777059DEE7202A11BE7E5`
- `scripts/install-memory-hook.js`: `28ECBBD269F97C99109E386008E2295B8875211733E4706C6BE660A6120CA1A1`
- `subagent-bridge/src/services/memory-hook-plugin.js`: `468CE60B8245C48AB4E5DF78E6022FE95228AC881FB6AF6EDB750458D34FDEAE`
- `subagent-bridge/src/services/memory-hook.js`: `A0146CDDDF8D768B5B9FA8EA7B28D6A9B0D0810AB07A6F770BF6FBB8A0AF4640`
- `subagent-bridge/src/services/memory-hook-cohort.js`: `63BEA006AC4FD6D0BAFF33E2847F97C78FF713BA88934FD3667F7EF65CB379C2`
- `subagent-bridge/src/config.js`: `F068669829014EB1E46331F8401EF2CC632596CE79D0120E8F9424987CA056D9`
- `subagent-bridge/src/metrics.js`: `D643E283D5E7E6221AE15B0B69CE7F68F72CD0BEFEAD675F156435B60E17177D`

### Parallel Batch Progress: adım adım yeniden üretim

Bu plugin için depoda ayrı derleme veya generator gerekmez. README'de belirtilen işlem, kanonik şablonu bir OpenCode proje plugin yoluna kopyalamaktır.

Deneme akışı:

1. `$env:TEMP` altında GUID içeren yeni bir dizin oluşturuldu.
2. Altında `batch-project/.opencode/plugins/parallel-batch-progress.js` hedefi oluşturuldu.
3. `templates/opencode/parallel-batch-progress.js` bu hedefe kopyalandı.
4. Kaynak ve kopya için SHA-256 hesaplandı ve karşılaştırıldı.
5. Kopya Node.js ESM loader'ına verildi; `ParallelBatchProgress` export'unun fonksiyon olduğu koşulla doğrulandı.
6. Akış tamamlanınca geçici dizin kaldırıldı.

Tekrar çalıştırılabilecek komut dizisi:

```powershell
$probeRoot = Join-Path $env:TEMP ('hades-plugin-repro-' + [guid]::NewGuid().ToString('N'))
$batchProject = Join-Path $probeRoot 'batch-project'
$batchTarget = Join-Path $batchProject '.opencode\plugins\parallel-batch-progress.js'
New-Item -ItemType Directory -Path (Split-Path -Parent $batchTarget) -Force | Out-Null
Copy-Item -LiteralPath 'templates\opencode\parallel-batch-progress.js' -Destination $batchTarget
Get-FileHash -LiteralPath 'templates\opencode\parallel-batch-progress.js' -Algorithm SHA256
Get-FileHash -LiteralPath $batchTarget -Algorithm SHA256
node --input-type=module -e "import { pathToFileURL } from 'node:url'; const plugin = await import(pathToFileURL(process.argv[1]).href); if (typeof plugin.ParallelBatchProgress !== 'function') process.exit(2); console.log('ParallelBatchProgress export edildi');" $batchTarget
```

Gerçek çalıştırma sonuçları:

- Kopya ve kaynak SHA-256 değerleri aynıydı: `310FE81001BECBF5507EB39644E44CC5F6FE623EDA7777059DEE7202A11BE7E5`.
- Node.js çıktısı: `ParallelBatchProgress export edildi`.
- Hedef dosya yalnız geçici workspace içindeydi; repository'deki tracked ince bağlayıcı değiştirilmedi.

Bu eklentinin yeniden kurulumu için OpenCode'u yeniden yüklemek veya Bridge runtime'ı değiştirmek gerekmez. Repository kaynak dosyası ve README'deki kopyalama talimatı yeterlidir.

### Second Brain Memory Hook: kurulum aracıyla üretim

Bu plugin sabit şablondan kopyalanmaz. `scripts/install-memory-hook.js`, repository'deki ortak Bridge service dosyalarını içe aktaran OpenCode adapter'ını hedef proje köküne göre üretir. Denemede hedef, geçici `memory-project` idi.

Çalıştırılan gerçek komut:

```powershell
npm.cmd run hook:install -- --apply --client=opencode --project-root=<geçici-proje-kökü>
```

Üretici sonucunun doğrulanmış alanları:

```json
{
  "mode": "apply",
  "client": "opencode",
  "targetPath": "<geçici-proje-kökü>/.opencode/plugins/second-brain-memory.js",
  "projectScope": true,
  "requestedProjectCohort": null,
  "runtimeCohort": "unassigned",
  "enabledByDefault": false,
  "optInEnvironmentVariable": "SUBAGENT_SECOND_BRAIN_HOOK",
  "readOnlySearchOnly": true,
  "failClosedOnExistingTarget": true,
  "payloadRewritten": true,
  "written": true,
  "reason": "written"
}
```

Üreticinin gerçek `targetPath` alanı, `$env:TEMP\hades-plugin-repro-<GUID>\memory-project\.opencode\plugins\second-brain-memory.js` konumunu gösterdi. Böylece yazımın kullanıcı profiline veya gerçek repository plugin klasörüne değil, yalnız geçici workspace'e yapıldığı doğrulandı.

Ardından aşağıdaki kontroller yapıldı:

- Üretilmiş dosyanın varlığı doğrulandı.
- Dosya içindeki beş Bridge import'u beklenen isimlerle kontrol edildi: `memory-hook-plugin.js`, `memory-hook.js`, `config.js`, `metrics.js`, `memory-hook-cohort.js`.
- Node.js ESM loader'ı üretilen dosyayı ve import ettiği Bridge modüllerini yükledi.
- `SecondBrainMemoryPlugin` export'unun fonksiyon olduğu doğrulandı.
- Node.js çıktısı: `SecondBrainMemoryPlugin export edildi`.
- Geçici dizin tamamlandıktan sonra silindi.

Bu üretim yolunun önemli güvenlik davranışları da sonuç nesnesinde doğrulandı: `enabledByDefault` false kaldı, hook opt-in çevre değişkenini bildirdi, salt-okunur arama sınırı true kaldı ve mevcut hedefi üzerine yazmama kapısı etkin raporlandı.


Üretimden sonra çalıştırılan dosya ve import kontrolü:

```powershell
$memoryTarget = Join-Path $memoryProject '.opencode\plugins\second-brain-memory.js'
Test-Path -LiteralPath $memoryTarget -PathType Leaf
$generated = [IO.File]::ReadAllText($memoryTarget, [Text.Encoding]::UTF8)
$requiredImports = @('memory-hook-plugin.js', 'memory-hook.js', 'config.js', 'metrics.js', 'memory-hook-cohort.js')
$missingImports = @($requiredImports | Where-Object { $generated -notmatch [regex]::Escape($_) })
if ($missingImports.Count -gt 0) { throw 'Üretilmiş plugin eksik import içeriyor.' }
node --input-type=module -e "import { pathToFileURL } from 'node:url'; const plugin = await import(pathToFileURL(process.argv[1]).href); if (typeof plugin.SecondBrainMemoryPlugin !== 'function') process.exit(2); console.log('SecondBrainMemoryPlugin export edildi');" $memoryTarget
```

Node.js modül yüklemesi yalnız export adını kontrol etmedi; üretilen dosyanın statik import zincirindeki tüm Bridge dosyalarını da çözümledi. Komutun çıktısı `SecondBrainMemoryPlugin export edildi` oldu.

### Geçici alanın temizlenmesi

Geçici kök dizin `$env:TEMP\hades-plugin-repro-<GUID>` biçimindeydi. Temizleme sırasında hedefin canonical tam yolu TEMP köküyle başladığı önce doğrulandı; ardından yalnız benzersiz geçici kök kaldırıldı:

```powershell
$resolvedProbeRoot = [IO.Path]::GetFullPath($probeRoot)
$resolvedTempRoot = [IO.Path]::GetFullPath($env:TEMP)
if (-not $resolvedProbeRoot.StartsWith($resolvedTempRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Geçici dizin TEMP dışında.' }
Remove-Item -LiteralPath $resolvedProbeRoot -Recurse -Force
```

İki deneme kökü de aynı geçici kökün altındaydı: `batch-project` ve `memory-project`. Temizleme bloğu deneme betiğinin `finally` bölümündeydi; üretim veya import doğrulaması hata verse bile geçici kökü temizlemeyi denerdi. Repository kaynak dizinine veya gerçek `.opencode` dizinine karşı silme komutu çalıştırılmadı.
### Kanıtın gösterdiği ve göstermediği

Kanıtlananlar:

- Batch Progress, kanonik şablondan yeni bir proje plugin dosyasına byte-byte kopyalanabilir.
- Second Brain OpenCode adapter'ı repository installer'ıyla yeni proje köküne üretilebilir.
- İki modül de Node.js tarafından import edilebilir ve beklenen export'u sunar.
- Üretim için OpenCode uygulamasının kurulu olması gerekmez; üretim Node.js ve Hades Orchestrator repository kaynaklarını kullanır.
- OpenCode sonradan kaldırılırsa bu repository kaynakları kalır; aynı yöntemle plugin dosyaları yeniden oluşturulabilir.

Bu denemede kanıtlanmayanlar:

- OpenCode'un yeniden oluşturulan dosyayı plugin olarak yüklemesi.
- `message.part.updated` veya diğer OpenCode event'lerinin belirli kurulu sürümde beklenen payload'la gelmesi.
- `client.tui.showToast` çağrısının gerçek TUI'de bildirim göstermesi.
- Second Brain hook'un gerçek oturumda Vault sonucu enjekte etmesi veya metrik yazması.
- Tam `npm test`, `npm run verify` veya canlı OpenCode entegrasyon testi sonucu.

Bu sınırlar raporun kapsamıyla tutarlıdır: mevcut kodun yeniden üretim yolunu kanıtlar, uygulamayı canlı OpenCode host'unda yeniden çalıştırdığını ileri sürmez.