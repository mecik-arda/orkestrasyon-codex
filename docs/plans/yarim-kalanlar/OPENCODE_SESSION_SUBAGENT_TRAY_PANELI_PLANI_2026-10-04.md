# OpenCode Session ve Subagent Tray Paneli Planı

Durum notu (2026-10-04): Kullanıcı Windows görev çubuğunun bildirim alanında sürekli duran, oturum açıldığında isteğe bağlı başlayan ve tıklanınca OpenCode session/subagent/multi-agent özetini gösteren küçük bir uygulama istedi. Yerel repo incelemesi ve Microsoft, OpenCode, Electron ve Tauri birincil belgeleriyle uygulanabilirlik araştırması yapıldı. Kullanıcının istediği dört sağlayıcılı batch, OpenCode route capability kapısı nedeniyle çalıştırılamadı. Kullanıcı onayıyla Gemini Pro → Gemini Flash sıralı batch'i başlatıldı; Gemini Pro `web_evidence_invalid` ile başarısız oldu ve DAG bağımlılığı nedeniyle Gemini Flash başlamadı. Bu worker çıktılarından hiçbir iddia kullanılmadı; aşağıdaki dış iddialar ana orkestratörce birincil kaynaklardan doğrulandı. Kod veya kullanıcı başlangıç ayarı değiştirilmedi. Bu belge tasarım ve uygulama planıdır.

Güncel durum notu (2026-10-04): İlk paralel Gemini araştırma batch'i carrier hatasıyla bloklandı. Sonraki normal salt-okunur Gemini Pro ve Gemini 3.8 Flash çağrıları resmi web sayfalarını okudu; `read_url_content` kullanımı ve web kanıt zarfı doğrulandı. Araç/izin adı ayrımı, timeout akışı ve canlı doğrulama `docs/reports/ANTIGRAVITY_WEB_RESEARCH_DOGRULAMA_2026-10-04.md` içinde kayıtlıdır. Bu sonuç tray tasarımını veya OpenCode batch route kapısını değiştirmez; tray uygulamasının kodlaması başlamamıştır.

Durum: Taslak; uygulama başlamadı; Electron MVP önerisi ölçüm spike'ında doğrulanmalı.
Tarih: 2026-10-04
Kapsam: Windows tray uygulaması, OpenCode session/subagent olay yakalama, Orkestrasyon V2 batch özeti, başlangıçta çalışma, yerel IPC ve gizlilik sınırları.

## 1. Hedef ve kullanıcı deneyimi

Windows bildirim alanında Spotify simgesi benzeri tek bir uygulama simgesi bulunur. Simge tıklanınca görev çubuğuna yakın küçük bir açılır panel açılır ve şu bilgileri gösterir:

- Plugin'i bağlı olan OpenCode instance/session grupları; oturum başlığı, proje için tercihen yalnız kısa ad ve son görülme/çalışma durumu.
- Session içinde son başlatılan tekil subagent çağrısı: sağlayıcı/model, çağrı türü ve queued/running/completed/failed durumu.
- Session'dan başlatılan multi-agent batch: kısa batch kimliği, kullanıcı tanımlı task adları, görev durumları, kısa sonuç özeti ve çözümlenen task yüzdesi.
- Ayarlar, başlangıçta çalışma tercihi ve uygulamadan çıkış.

Panelin batch yüzdesi yalnız `completed`, `failed`, `blocked` ve `cancelled` task'ların çözümlenmiş sayısını kullanır. `unknown`, `running` ve `queued` tamamlanmış sayılmaz. Token ilerlemesi veya çalışan task içi yüzde üretilmez. Tekil subagent çağrıları için araç sonucu gelene kadar elapsed time ve running durumu gösterilir; model token ilerlemesi tahmin edilmez.

Windows, bildirim alanı simgesini görünür alanda veya taşma alanında gösterebilir; uygulama simgenin görev çubuğundaki yerini zorlamaz. Kullanıcı görünürlük kararını Windows ayarlarından verir.

## 2. Yerel mevcut durum ve sınırlar

- OpenCode projesinde `.opencode/plugins/parallel-batch-progress.js` vardır. Plugin `tool.execute.before`, `tool.execute.after` ve `message.part.updated` olaylarını kullanır; batch aracının tamamlanan çıktısından `sessionID`, batch kimliği, task durumları ve progress değerlerini ilişkilendirir. Tekrarlanan toast'ı session ve batch anahtarına göre eler; bilgiyi kalıcı session geçmişi olarak saklamaz.
- `scripts/watch-parallel-batch.js` kişisel Bridge state alanındaki batch manifestini salt-okunur okur. Çözümlenmiş task yüzdesini, durumları ve batch admission tahminini verir. Mevcut pencereli watcher batch session'ına kalıcı tray UI veya tüm OpenCode session listesi sağlamaz.
- `subagent-bridge/src/services/parallel-batch.js` task route/model, task durumları, özetler ve batch metadata'sını üretir. Batch manifesti uygulama için kullanılabilir; mevcut `readBatchManifest` doğrulama/regular-file/path sınırları yeniden kullanılmalı, app kendi parser'ıyla daha gevşek bir dosya taraması yapmamalıdır.
- OpenCode SDK session listesi/child session ve server-sent event yüzeyleri sunar. OpenCode'un belgelenen TUI çalışma biçimi her TUI için rastgele server portu kullanabilir; ayrı uygulamanın bütün oturumları port tarayarak keşfetmesi belgelenmiş ve güvenilir bir çözüm değildir.
- Mevcut global olmayan proje plugin'i yalnız bu çalışma alanında yüklenir. Bütün projeler için gözlem isteniyorsa ayrı, kullanıcı tarafından açıkça kurulan global plugin gerekir. Kurulum bu plan kapsamında yapılmamıştır.
- `config/policy.json` paralel batch dağıtım varsayılanında kapalıdır. Mevcut OpenCode batch route'u `opencodeOutputCapability: unavailable` nedeniyle fail-closed; bu yüzden batch araştırma DAG'ına DeepSeek veya Space Bunny eklenmesi reddedildi. Tray uygulamasının olayları izlemesi bu capability kapısını değiştirmez.
- `docs/plans/yarim-kalanlar/ORKESTRASYON_V2_PARALEL_COK_AJANLI_KODLAMA_MIMARISI_2026-09-29.md` ve `README.md` mevcut batch yüzeyinin read-only task manifesti ve async start/poll/cancel davranışını tanımlar.

## 3. Kaynak doğrulaması

Kaynaklara 2026-10-04 tarihinde doğrudan erişildi. OpenCode'un güncel belgeleri `v2` duyurusu içerdiğinden, uygulama zamanı API sözleşmesi repository'de kullanılan OpenCode CLI `1.18.34` ve plugin paketi `@opencode-ai/plugin 1.18.15` üzerinde ayrıca doğrulanmalıdır.

- OpenCode, “Plugins”, https://opencode.ai/docs/plugins/ — yerel proje ve global plugin yükleme yerlerini, plugin event hook modelini ve `session.created`, `session.updated`, `session.idle`, `message.part.updated`, `tool.execute.before/after` olaylarını listeler. Belgede son güncelleme 2026-10-03 görünüyordu. Bu, kurulu sürümün aynı event payload'larını verdiğini tek başına kanıtlamaz.
- OpenCode, “SDK”, https://opencode.ai/docs/sdk/ — `session.list`, `session.children`, `session.messages` ve `event.subscribe` SSE yüzeylerini belgeler. Tray uygulamasının tüm TUI instance'larına otomatik bağlanabildiği anlamına gelmez.
- OpenCode, “Server”, https://opencode.ai/docs/server/ — `opencode serve`, rastgele port kullanımı ve `/event` SSE yüzeyini belgeler. Port tarama veya kimlik doğrulamasız uzak dinleyici bu plana alınmamıştır.
- Microsoft Learn, “Notifications and the Notification Area”, https://learn.microsoft.com/en-us/windows/win32/shell/notification-area — tray simgesi, callback, tooltip, tıklamayla popup, yüksek DPI simgeleri ve kullanıcı denetimli görünürlük ilkelerini açıklar.
- Microsoft Learn, “Run and RunOnce Registry Keys”, https://learn.microsoft.com/en-us/windows/win32/setupapi/run-and-runonce-registry-keys — `HKCU`/`HKLM` logon davranışını ve Windows'un başlangıç çalıştırmasını geciktirebileceğini belgeler. MVP yalnız current-user kurulumunu ve açık kullanıcı tercihini hedefler.
- Electron, “Tray”, https://www.electronjs.org/docs/latest/api/tray — bildirim alanı simgesi, tıklama, bağlam menüsü ve Windows için ICO önerisini belgeler.
- Electron, “app.setLoginItemSettings”, https://www.electronjs.org/docs/latest/api/app#appsetloginitemsettingssettings-macos-windows — Windows'ta logon başlangıcını etkinleştirme/devre dışı bırakma ve başlangıç kayıt durumunu okuma seçeneklerini belgeler. Kurulum ve auto-updater yolu gerçek paketleme spike'ında doğrulanmalıdır.
- Electron, “Context Isolation”, https://www.electronjs.org/docs/latest/tutorial/context-isolation — renderer ile preload/main sınırını, dar `contextBridge` metodlarını ve ham `ipcRenderer` API'sini açmama gereğini açıklar.
- Tauri, “System Tray”, https://v2.tauri.app/learn/system-tray/ ve “Autostart”, https://v2.tauri.app/plugin/autostart/ — tray click/menu event'leri ve başlangıç enable/disable/isEnabled alternatiflerini belgeler. Tauri'nin Rust host'u mevcut Node runtime ile ek IPC/yan süreç sınırı oluşturur; MVP için Electron'a göre daha düşük entegrasyon riski olduğu henüz gösterilmemiştir.

## 4. Önerilen mimari

### Masaüstü host

MVP için **Electron + TypeScript** önerilir. Mevcut proje Node.js/JavaScript tabanlıdır; tray, popup pencere ve logon-start API'leri doğrudan kullanılabilir. Renderer Node erişimi olmadan çalışır; `contextIsolation` ve sandbox açık kalır, preload yalnız tipli ve allowlist edilmiş sorgu/metotları açar. Tauri 2 güçlü bir alternatif olarak tutulur; karar öncesi küçük bir tray/IPC spike'ında kurulum karmaşıklığı, başlangıç gecikmesi ve boşta kaynak kullanımı karşılaştırılır. Ölçülmemiş paket boyutu veya performans avantajı varsayılmaz.

### Olay toplama ve ilişkilendirme

- OpenCode global plugin'i instance başlangıcında rastgele bir instance anahtarı üretir ve tray host'a kullanıcı kapsamlı, yerel Windows Named Pipe üzerinden `instance_started`/`heartbeat` gönderir.
- Plugin yalnız allowlist edilmiş event alanlarını iletir: instance/session ID, oturum başlığı için sınırlı ve sanitize edilmiş metin veya varsayılan gizli başlık, araç/provider/model kimliği, tool status, task ID, batch ID, durum zamanı ve güvenli kısa sonuç özeti.
- Kullanıcı prompt'u, tool argümanları, tam tool/provider çıktısı, transcript, secret, vault içeriği, tam workspace yolu veya API kimlik bilgisi event zarfına girmez. `objective` ve summary serbest metinleri otomatik olarak güvenli varsayılmaz; özet gösterimi sınırlı/sanitize edilmiş, yerel ve kullanıcı tarafından kapatılabilir olur.
- Plugin açılışta SDK'nın session/status yüzeyi üzerinden başlangıç snapshot'ı gönderebilir; bu davranış yalnız kurulu OpenCode sürümünde test edildikten sonra etkinleşir. Eski/stale instance heartbeat'i zaman aşımından sonra `disconnected` olur; session idle durumu pencerenin foreground veya kullanıcının aktif oturumu olduğu şeklinde sunulmaz.
- Tekil subagent çağrısı `tool.execute.before/after` ile session'a bağlanır; sadece provider/model/tool türü ve started/completed/failed state tutulur. Batch başlatma/poll çıktısındaki `batchId` aynı session ID'ye bağlanır; task state/özet/progress Bridge'in schema-validated read-only batch snapshot'ından alınır.
- Named Pipe yalnız mevcut kullanıcıya ACL'lenir; tek yönlü telemetry için sabit mesaj şeması, maksimum frame boyutu, rate/queue sınırı ve tek instance/instance ID doğrulaması uygulanır. Pipe erişilemediğinde plugin gecikmeden devam eder ve OpenCode davranışı etkilenmez.
- MVP geçmişi yalnız yerel ve bounded TTL'li tutulur. Başlangıç tercihi ayrı bir kullanıcı ayarıdır; uygulamanın Windows login başlangıcı varsayılan açık kabul edilmez. Ayarlar toggle'ı OS kaydını okuyup güncel durumu gösterir; uninstall/disable kaydı temizler.

### Panel düzeni

- Üst başlık: toplam bağlı instance ve çalışan çağrı/batch sayısı.
- Session kartları: proje kısa adı (varsayılan olarak tam yol yok), session başlığı, çalışan/idle/disconnected gözlemi ve en son aktivite.
- Subagent satırları: provider/model, çağrı/task adı, süre ve terminal durum; tam prompt veya transcript yok.
- Batch bölümü: batch özeti, task listesi/durumları, resolved/total yüzdesi, failed/blocked/unknown sayıları ve detay açma.
- Simge sol tıklama: popup'ı aç/kapat; sağ tıklama: ayarlar, başlangıç tercihi, log klasörünü açma (yalnız kullanıcı seçerse), çıkış. Sistem bildirimleri opt-in ve yalnız anlamlı batch terminal olaylarında.

## 5. Uygulama fazları

1. **API/GUI spike:** Kurulu OpenCode 1.18.34 ve mevcut plugin SDK ile global plugin'in iki ayrı TUI instance'ında session ID, tool event ve startup snapshot ürettiğini doğrula. Electron tray icon/popup, named-pipe lifecycle ve current-user login toggle prototipini ölç. Başlangıç gecikmesi, boşta kaynak kullanımı, Windows oturum sonlandırma, paket/update yolu kaydedilir. Spike başarısızsa Tauri veya host içi panel alternatifine dön; uygulama öncesi mimari kapısı.
2. **Telemetry contract ve pipe:** Sürümlemeli strict `SessionMonitorEvent` şeması, Windows Named Pipe ACL, allowlist, size/rate limit, disconnect/reconnect ve listener yokken no-op davranışını ekle. Prompt/output alanı şemada kabul edilmez.
3. **Session/subagent collector:** Plugin olaylarını instance + session + çağrı kimliğiyle state store'a aktar. Tekil çağrılar için start/end/failure durumu; session snapshot, stale timeout ve yeniden başlama uzlaştırması. Gizlilik/saklama ayarları ve düşük riskli diagnostics.
4. **Batch görünümü:** Read-only manifest/provider katmanını ve schema validation'ı entegre et; batch kimliği session plugin olayıyla ilişkilendirilir. Task çözülme yüzdesi, bilinmeyen task'ların açık gösterimi ve güvenli kısa summary sağlanır. UI hiçbir zaman batch başlatmaz, task iptal etmez veya runtime komutu çalıştırmaz.
5. **Tray UX ve login lifecycle:** Tek tray icon, DPI uyumlu ikon, click-to-toggle popup, session gruplaması, ayarlar ve quit. Başlangıç default-off; toggle açıkça etkinleştirir. Get-login-state, disabled state, install/update ve uninstall cleanup sınanır.
6. **Windows doğrulama ve rollout:** Temiz kullanıcı profili, iki OpenCode instance'ı, farklı project/session, subagent success/failure ve multi-wave batch ile uçtan uca test; install/upgrade/uninstall ve Windows başlangıç testleri; opt-in pilot. Çalışan provider çağrılarına veya OpenCode izinlerine dokunulmaz.

## 6. Kabul kriterleri

- Tray uygulaması Windows 10/11'de, ana pencereyi sürekli açık tutmadan başlar; simge tıklaması küçük paneli açıp kapatır; kullanıcı görünür alana taşıma kararını Windows'tan verebilir.
- Kullanıcı login başlangıcını açıkça etkinleştirip kapatabilir; görünen ayar OS durumuyla tutarlıdır; normal current-user kullanımı admin yetkisi istemez; uninstall kendi startup kaydını temizler.
- İki paralel OpenCode instance'ının session ve çağrı olayları karışmaz; her event doğru session'a bağlanır; stale instance disconnected olarak işaretlenir.
- Tekil subagent çağrısı başlangıçtan terminal duruma izlenir; batch task'ları batch manifestiyle eşleşir; `resolvedCount/totalCount` formülü Bridge sonucu ile aynıdır; unknown tamamlanmış sayılmaz.
- Uygulama/provider çağrısı başlatmaz, OpenCode'a prompt göndermez ve batch manifestini değiştirmez. App veya Named Pipe kapalıyken OpenCode ve batch normal çalışmaya devam eder.
- IPC allowlist dışı alanları, fazla büyük frame'i ve yetkisiz kullanıcı erişimini reddeder. Test sentinel'leriyle prompt, tool output, secret ve tam workspace yolunun state/log/UI'ya sızmadığı doğrulanır.
- UI tüm serbest metni karantinada/untrusted kabul eder, metin sınırları uygular ve yerel saklama süresini sınırlar. Uygulamanın internet bağlantısı olmadan session/batch state'ini göstermesi varsayılan davranıştır.
- Windows UI testinde panel erişilebilir, klavye ile gezilebilir, ekran ölçeklemesinde okunabilir; notification-area overflow durumu uygulama hatası sayılmaz.
- Repository plugin/Bridge değişiklikleri `npm test`, `npm run verify`, MCP sözleşmesi değişirse `npm run smoke` ile doğrulanır. Desktop packaging, startup registration ve named-pipe ACL için Windows entegrasyon testleri ayrıca çalışır.

## 7. Riskler ve açık kararlar

- OpenCode latest docs v2'ye güncellenmiştir; mevcut CLI/plugin sürümünün event/API uyumu spike ile kanıtlanmadan sürümlenmiş API veya storage formatı varsayılmayacaktır.
- TUI başına server portu rastgele olabilir; port tarayıp instance keşfetmek yerine global plugin'in kontrollü IPC kaydı tercih edilir. Global plugin etkinleştirme kullanıcı kontrolünde olmalıdır.
- Bir OpenCode plugin'i arbitrary event/output taşıyabilir. Allowlist sözleşmesi, lokal current-user ACL, event boyut limiti, yerel-only storage ve hiçbir prompt/transcript toplamama güvenlik kapısıdır.
- Session başlığı, proje adı, task ID ve sonuç özeti kullanıcıya ait hassas bağlam içerebilir; paylaşım/ağ servisi yoktur, UI'da açıklayıcı tercih ve retention ayarı bulunur.
- Tray simgesinin taşma alanında görünmesi OS/user kontrolündedir; uygulama simgeyi zorla görünür kılamaz.
- Login startup kullanıcı seçimi olmalıdır; Microsoft, Run key çalıştırma zamanının garanti edilmediğini belirtir. Uygulama boot-critical servis değildir.
- DeepSeek ve Space Bunny bu araştırma batch'ine alınamadı: mevcut V2 OpenCode output capability fail-closed durumdadır. Tray tasarımı onları izlemek için özel adapter gerektirmez; plugin yalnız sınırlı subagent tool metadata'sı alır. Gelecekteki provider-specific ayrıntılar kurulu çağrı araçlarının event şemasıyla doğrulanmalıdır.
- Electron/Tauri kararı spike sonrası ölçüme bağlanır. Paketleme, code signing, update dağıtımı ve kurumsal policy desteği uygulama başlamadan önce kullanıcıyla kesinleştirilecektir.

## 8. Kaynak kod temas noktaları

- `.opencode/plugins/parallel-batch-progress.js` — OpenCode tool/session olaylarından batch ilişkisi ve task progress çıkarma için mevcut örnek.
- `subagent-bridge/src/services/parallel-batch.js` — batch task state, provider/model ve session-independent batch lifecycle.
- `subagent-bridge/src/frontends/mcp/tools.js` ve `subagent-bridge/src/frontends/mcp/server.js` — kullanıcıya açık batch sözleşmesi ve MCP kayıt kapıları.
- `scripts/watch-parallel-batch.js` — read-only manifest parser ve yüzde semantiği.
- `subagent-bridge/src/services/parallel-dashboard-launcher.js` — güncel ayrı Windows Terminal watcher yaklaşımı; tray app bunun yerine yeni UI sunar, mevcut batch worker lifecycle'ını değiştirmez.
- `config/policy.json` — dağıtım varsayılanı kapalı V2 feature gate'leri; bu plan hiçbir gate'i değiştirmez.

## 9. Kaynaklar

- OpenCode, Plugins: https://opencode.ai/docs/plugins/
- OpenCode, SDK: https://opencode.ai/docs/sdk/
- OpenCode, Server: https://opencode.ai/docs/server/
- Microsoft Learn, Notifications and the Notification Area: https://learn.microsoft.com/en-us/windows/win32/shell/notification-area
- Microsoft Learn, Shell_NotifyIconA: https://learn.microsoft.com/en-us/windows/win32/api/shellapi/nf-shellapi-shell_notifyicona
- Microsoft Learn, Run and RunOnce Registry Keys: https://learn.microsoft.com/en-us/windows/win32/setupapi/run-and-runonce-registry-keys
- Electron, Tray: https://www.electronjs.org/docs/latest/api/tray
- Electron, app login item settings: https://www.electronjs.org/docs/latest/api/app#appsetloginitemsettingssettings-macos-windows
- Electron, Context Isolation: https://www.electronjs.org/docs/latest/tutorial/context-isolation
- Tauri, System Tray: https://v2.tauri.app/learn/system-tray/
- Tauri, Autostart: https://v2.tauri.app/plugin/autostart/
