# Codex MCP çalışma dizini ve account/read onarımı

Tarih: 17 Kasım 2026

## Problem ve sonuç davranışı

Codex CLI 0.169.0 üzerinde proje MCP kaydındaki göreli çalışma dizini, shared-daemon bağlamında repository kökü anlamına gelmez. `cwd=".."` ile göreli Node girişinin birlikte kullanılması, sunucunun daemon dizini altında aranmasına ve initialize öncesi kapanmasına yol açabilir. Public dağıtım dosyası kişisel yol içermeyen bir kurulum şablonudur; hazır bir yerel binding sayılmaz.

Updater artık `command="node"`, göreli `subagent-bridge/src/server.js`, checkout’a ait mutlak `cwd` ve trusted workspace `.` üretir. `codex:check` eksik veya göreli cwd için `needs_update` döndürür. Doğru eski mutlak Node/server/workspace yolları korunabilir; başka checkout’a giden yollar eşleşme sayılmaz. Model, env allowlist, approval, required ve timeout sözleşmesi bu aktarımda değiştirilmez. Stale plan, kilit, backup ve yayın bütünlüğü kontrolleri korunur.

## İkinci hata: eksik CLI MCP override

Yalnız `mcp_servers.hades-orchestrator.cwd` CLI geçersiz kılması, `account/read` sırasında eksik MCP tanımı oluşturabilir. Kurulu Codex kaynak yolunda `load_latest_config(None)` proje bağlamını dışarıda bırakarak sistem/kullanıcı/CLI katmanlarını yeniden yükler. Hades yalnız proje config’inde tanımlıysa, tek alanlı CLI override’ın command/transport bilgisi kalmaz. Bu hata `InvalidData` olarak, account/read tarafında genel ve redakte `failed to load workspace requirements: invalid data` metniyle dönebilir. Bu olayda yeniden OAuth girişi çözüm olmadı.

Yerel karşılaştırmada yalnız cwd override’ı başarısız; override olmadan ve tam MCP tanımıyla `account/read` başarılıydı. Proje config’inde mutlak cwd onarımı sonrası normal CLI resume açıldı. Bu, gözlenen ortamın kanıtıdır; aynı genel hata metninin bütün ortamlarda tek nedeni olduğu iddia edilmez. Kullanıcı config’ine global MCP kaydı eklemek, required kapatmak veya gereksinim politikasını atlamak kullanılmadı.

## Kurulum

Repository kökünde `npm ci`, ardından `npm run codex:configure` ve `npm run codex:check` çalıştırılır. Sonra Codex o checkout köküyle açılır veya sürdürülür. Her yeni clone/worktree kendi Node bağımlılıkları ve yerel MCP çalışma diziniyle yapılandırılır. Kişisel runtime allowedRoots gereksinimi ayrıca geçerlidir; bu değişiklik onu genişletmez. Mutlak yerel config değeri public commit’e taşınmaz. Yalnız tek cwd alanını CLI override ile yamamak önerilen kurulum yolu değildir.

## Public aktarım sınırı

Dal, güncel public `main` tabanı `11e82e58f327601884cb3b14b9ef3c69aa243c9d` üzerinde oluşturuldu. Eski, ortak merge-base vermeyen yerel geçmiş cherry-pick/merge edilmedi. Ana checkout’taki önceki kullanıcı değişiklikleri ve çalışan Hades kaydı korunur. Burada yalnız ilgili updater mantığı, düzeltilmiş regresyonlar ve güncel belgeler aktarılır. Test/örnek kodda kişisel mutlak yol veya credential bulunmaz.

## Doğrulama

Hedefli config, diagnostics ve gerçek stdio başlangıç testleri 23/23 geçti. Yeni başlangıç regresyonu, iki farklı Unicode/boşluk içeren fixture checkout için üretilen kaydı ilgisiz bir launcher çalışma dizininden kullanır. Gerçek Hades sunucusuyla initialize, resources/list ve yalnız workspace identity okuması yapılır; process cwd ve trusted workspace hash’leri doğru fixture köküne bağlanır. Kişisel config yerine sentetik policy/Vault ve provider credential taşımayan ortam kullanılır. Model veya görev aracı çağrılmaz.

İlk tam `verify:local` koşusunda `verify:ci` geçti; suite 1.261 başarılı, 5 atlanan ve 1 başarısız test bildirdi. Başarısızlık `tests/start-codex-launcher.test.js:219` konumundaki assertion idi; alt mesaj veya ham test çıktısı saklanmadı. Benchmark/smoke/verify bu koşuda başlamadı. Aynı sentetik ortamda yalnız launcher dosyasının tanısı 11/11 geçti; timeout, spawn veya sınıflandırma hatası gözlenmedi. İlk tam koşudaki aralıklı assertion’ın kesin nedeni belirlenmedi; çözülmüş sayılmaz. Sonraki tam `npm run verify:local` koşusu beş aşamanın tamamında başarılı oldu: `verify:ci`; 96 dosyalı ana test aşamasında 1.262 başarılı, 5 Windows koşullu atlama ve 0 başarısız; zorunlu benchmark aşamasında 1/1 başarılı (aşama süresi 17.682 saniye); sentetik stdio smoke; sentetik config/Vault verify. Toplam runner süresi 544.640 ms idi. Kaynak snapshot SHA-256 `d0b7d56ece4adb86dbc56e6ae5381ce89149fb21d6663bb46665816713a6ac7d` koşu boyunca değişmedi; geçici alan temizlendi. Ardından yalnız bu sonuç notu güncellendi; üretim/test kaynağı değişmedi. İlk koşunun aralıklı launcher hatası bu başarılı sonuçla açıklanmış sayılmaz.

Public delta için Gitleaks taraması sıfır bulgu verdi; eklenen satırlarda kişisel Windows profil yolu bulunmadı. Değişen belgelerin yerel bağlantı kontrolü ve `git diff --check` başarılıdır. Bu tarama repository’nin bütün geçmişi için yeni bir secret audit iddiası değildir.

## Kabul sınırları

P2/P3/P4 işlevsel kabulü ve Claude P1b ertelemesi korunur. Bu çalışma bağımsız Sol follow-up incelemesi değildir; kullanıcı kararıyla ertelenen bağımsız inceleme açık kalır. Identity/rules gözlemleri çalışan commit veya etkin config için kriptografik attestation değildir. POSIX ve güç kaybı dayanıklılığı bu Windows doğrulamasından çıkarılmaz.

## Resmi kaynak kodu

- [Account/read hata yolu ve redaksiyon](https://github.com/openai/codex/blob/rust-v0.169.0/codex-rs/app-server/src/request_processors/account_processor/workspace_routing.rs)
- [Proje dışı config yeniden yüklemesi](https://github.com/openai/codex/blob/rust-v0.169.0/codex-rs/app-server/src/config_manager.rs)
- [App-server resume ve MCP resource sözleşmesi](https://learn.chatgpt.com/docs/app-server)
