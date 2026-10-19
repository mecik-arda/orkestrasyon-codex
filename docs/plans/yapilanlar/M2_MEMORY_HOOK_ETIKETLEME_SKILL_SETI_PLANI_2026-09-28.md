# M2 Memory Hook Etiketleme Skill Seti Planı

Durum notu (2026-09-28): Kullanıcı onayıyla beş skill, proje bridge allowlist'i, aktif yerel bridge allowlist'i ve README envanteri uygulandı; `.claude` ve dört global skill kopyası eşitlendi. `npm test` (722 test), `npm run verify`, `npm run verify:ci`, `npm run skills:check-global -- --strict` ve beş skill için doğrudan bridge yükleme kontrolü geçti. GPT-6 Sol uygulama denetiminde kritik/yüksek/orta bulgu çıkmadı; düşük önem düzeyindeki plan durum notu güncellendi.

Ek netleştirme (2026-09-28): Gerçek session ID host bağlamında görünmüyorsa ama kullanıcı tarafından açıkça verilmişse, ana orkestratörün aktif metrik kaynağında normalize edilmiş ID hash'i ve istemciyle salt-okunur eşleşme yapılabilir. Toplu `decisionReady` ve cohort registry durumu, bu session-specific kanıtla karıştırılmamalıdır. Ham session ID/hash yanıta veya loga yazılmaz.

Takip uygulaması (2026-09-28): Host ID görünmeme durumunda kullanıcı tarafından sağlanan gerçek ID ile salt-okunur eşleşme, altyapı ile tek-session kanıtının ayrımı, toplu `decisionReady` değerinin tek etiket için engel olmadığı ve cohort/registry eksikliğinin ayrı metadata olduğu dört ilgili M2 skill'de netleştirildi. `.claude` ve dört global skill kökü yeniden eşitlendi; `npm run verify`, `npm run verify:ci`, `npm run skills:check-global -- --strict` ve doğrudan bridge skill yükleme kontrolü geçti.

Oturum-ID isteme döngüsü düzeltmesi (2026-09-28): Eligibility, feedback, metrics review ve historical-attribution skill'leri bir ID başka konuşmada verilmiş olsa bile mevcut session'ın onu göremeyeceğini açıkça belirtir. Gerekliyse tam ID en fazla bir kez istenir; sağlanmazsa oturum-özel sonuç `doğrulanamadı` kalır, başka kontroller sürer ve ID tekrar tekrar istenmez.

## Hedef ve kapsam

M2 memory-hook oturum uygunluğu, kullanıcı outcome geri bildirimi, yeni oturum cohort çözümlemesi, istisnai tarihsel atıf ve salt okunur metrik incelemesi için beş dar kapsamlı, bağımsız tetiklenebilir skill önermek. Skill açıklamaları başka oturumlarda da tek başına anlaşılmalı; tetikleyiciyi, gerekli girdileri, işi ve dışlamaları belirtmelidir.

M2 oturum etiketlemesi Vault notu yazımından ve YOLO/COCO görüntü veri seti etiketlemesinden ayrıdır. Bu skill seti memory-hook ölçüm kayıtlarına odaklanır; Vault'a not yazmaz ve görüntü/veri seti sınıflandırması yapmaz.

Önerilen ilk uygulama dosyaları ve köprü kullanılabilirliği:

- `.agents/skills/m2-hook-oturum-uygunlugu/SKILL.md`
- `.agents/skills/m2-hook-sonuc-geri-bildirimi/SKILL.md`
- `.agents/skills/m2-hook-proje-kohortu/SKILL.md`
- `.agents/skills/m2-hook-tarihsel-atif/SKILL.md`
- `.agents/skills/m2-hook-metrik-incelemesi/SKILL.md`
- `config/policy.json` içindeki `skills.allowed` allowlist'ine beş skill adının eklenmesi; aksi halde Subagent Bridge bu skill'leri çağırmayı reddeder.

Skill uygulaması, Sol incelemesi ve gerekli plan revizyonları tamamlanıp kullanıcı ayrıca onay verdikten sonra başlayabilir.

## Hedef dışı

- Bu plan aşamasında skill veya kod uygulamak.
- MCP şemasını, araç sözleşmesini, metrik biçimini veya runtime davranışını değiştirmek.
- Var olan kayıtları yeniden yazmak ya da toplu migration yapmak.
- Kullanıcının açıkça belirtmediği outcome'u çıkarsamak veya eski oturuma geriye dönük cohort atamak.
- `hafiza-vault-bakimi` skill'ine M2 giriş kapısı eklemek.
- M2 etiketlerini Vault hafıza notları ya da YOLO/COCO veri seti etiketleriyle birleştirmek.

## Mevcut davranış ve sahiplik

- `hook:classify`, session disposition'ını kaydeder. Disposition ile feedback aynı `client + session-id` oturumuna bağlanır; feedback için önce `eligible_real_user` disposition'ı gerekir.
- `hook:feedback`, `useful`, `partial` veya `not_useful` outcome'larından birini açık session/client girdisiyle kaydeder. Outcome kullanıcının açık beyanına dayanmalıdır.
- Canonical global M2 özeti mevcut uygun feedback kayıtlarını tek toplamda tutar. Mevcut `decisionReady` semantiği, 15 etiket eşiği veya pilot penceresinin dolması kuralı korunur. Cohort ya da tarihsel görünüm bu global sayıları veya readiness kararını değiştirmez.
- `byProjectCohort`, betimleyici cohort sayım ve outcome görünümüdür; cohort başına readiness eşiği tanımlamaz. Canonical cohort bilgisi olmayan eski oturumlar `legacy_unattributed` kalır.
- Yeni oturum cohort değerleri `norn`, `dersmerkezi` veya `unassigned` olabilir. Registry eşleştirmesi yalnız tam canonical `realpath` eşleşmesine dayanır. Cohort raporlama metadatasıdır; feedback etiketi veya yetkilendirme değildir.
- `historicalAttribution`, canonical cohort alanından ayrı, append-only tarihsel görünümdür. Mevcut planda belgelenen basis değerleri `user_confirmed` ve `session_metadata_verified`; izinli üçlüler `(dersmerkezi, user_confirmed, not_useful)`, `(norn, session_metadata_verified, partial)` ve `(norn, session_metadata_verified, not_useful)` olarak sınırlandırılmıştır. Ek kayıtlar canonical satırları veya global M2 hesabını değiştirmez.
- İlgili mevcut sahiplik noktaları `scripts/classify-memory-hook.js`, `scripts/record-memory-hook-feedback.js`, `scripts/attribute-memory-hook-history.js` ve `subagent-bridge/src/services/memory-hook-cohort.js` dosyalarıdır. Bu plan bunların davranışını değiştirmez.

## Skill sınırları ve tetikleme sinyalleri

### `m2-hook-oturum-uygunlugu`

Tetikleme: Kullanıcı gerçek bir memory-hook oturumunun ölçüme uygunluğunu/disposition'ını sınıflandırmayı veya `hook:classify` işlemini açıkça istediğinde.

Sorumluluk: Gerçek kullanıcı oturumu kanıtını ve instrumentation bağlamını incelemek, kanıtın desteklediği disposition'ı seçmek ve `hook:classify` ile tam `client` ve `session-id` bağı üzerinden kaydetmek. İzinli disposition'lar `eligible_real_user`, `ineligible_instrumentation`, `ineligible_synthetic`, `ineligible_duplicate` ve `indeterminate_legacy` değerleridir. Kanıt yetersizse `indeterminate_legacy` kullanılır.

Sınır: Kullanıcı outcome'u atamaz, tahmin etmez veya kaydetmez. `indeterminate_legacy` uygun oturum sayılmaz. Feedback ayrı skill'in sorumluluğudur.

### `m2-hook-sonuc-geri-bildirimi`

Tetikleme: Kullanıcı belirli bir eligible oturum için `useful`, `partial` veya `not_useful` sonucunu açıkça seçip kaydetmek istediğinde.

Sorumluluk: Önce eligibility sonucunu doğrulamak, sonra aynı tam `client` ve `session-id` bağı için `hook:feedback` kullanmak. Outcome yalnız kullanıcının açık ifadesinden alınır.

Sınır: Sessizlikten onay, iş sonucundan memnuniyet veya başka oturumdan outcome çıkarımı yasaktır. Açık seçim yoksa kayıt yapılmaz. Eligibility ya da oturum/client bağı belirsizse durulur.

### `m2-hook-proje-kohortu`

Tetikleme: Yeni bir memory-hook oturumu oluşturulurken cohort çözümlemesi, kurulum veya registry kullanımı istendiğinde.

Sorumluluk: Yeni oturum ve kurulum kapsamına göre `norn`, `dersmerkezi` veya `unassigned` değerini çözümlemek. Proje kapsamlı `--project-root` kurulumunda `--cohort` atlanırsa cohort sabit `unassigned` olur; named cohort açıkça belirtilmeli ve registry doğrulamasından geçmelidir. Global kurulumda `--cohort` atlanırsa çalışma zamanı bağlamı registry ile dinamik çözülür; açık `--cohort=unassigned` dinamik çözümlemeyi kapatır. Global kurulumda sabit named cohort kabul edilmez. Eşleşme yalnız tam canonical `realpath` ile yapılır; OpenCode için aday köklerden herhangi biri eşleşmezse veya adaylar farklı cohort'lara çözülürse `unassigned` korunur.

Sınır: Cohort yalnız metadatadır; feedback etiketi ya da yetki değildir. Eski oturuma geriye dönük cohort atamaz. Yol öneki, parent/child ilişkisi, benzer ad veya serbest metin benzerliğiyle eşleştirme yapmaz. Outcome kaydetmez.

### `m2-hook-tarihsel-atif`

Tetikleme: Kullanıcı tek bir belirli legacy oturum için istisnai tarihsel attribution istediğinde ve doğrulanabilir kanıt ile açık yetkilendirme bulunduğunda.

Sorumluluk: `hook:attribute-history` akışında `client=opencode` olan tek oturum için işlem yürütmek. Mevcut ilk rollout yetkisi yalnız daha önce açıkça kullanıcı tarafından teyit edilmiş bir DersMerkezi OpenCode `not_useful` oturumu ve kaynak M2 planında zaman/süreyle tanımlanmış iki Norn OpenCode metadata-verified oturumunu kapsar. Kaynak plandaki hedef zamanı/süresi, açık kullanıcı teyidi ve mevcut historical kayıtlar arasında birebir bağ kurulmadan CLI çağrısı yapılmaz. CLI'nin genel cohort/basis/outcome/hash doğrulaması belirli üç hedef için allowlist oluşturmadığından, skill bu ek kapsam kontrolünü zorunlu kılar. Bu üç hedef dışında yeni, ilgisiz veya gelecekteki oturumlara yazma yetkisi vermez; yeni hedef ayrı plan değişikliği ve açık kullanıcı kararı gerektirir. Tam session ID tekrar onayı ve orchestrator tarafından güvenilir bağlamdan sağlanan beklenen hash zorunludur. Norn oturumlarında beklenen hash ancak OpenCode session ID hash'inin `client=opencode` metric `sessionIdHash` değeriyle birebir eşitliği doğrulandıktan ve `directory`, `worktree` ile kayıtlı `project_directory` metadata alanlarının her biri Norn canonical root ile ayrı ayrı tam `realpath` eşleşmesinden sonra türetilebilir. DersMerkezi `user_confirmed` hedefi için kanıt daha önceki açık kullanıcı teyididir; Norn path kanıtı şartı uygulanmaz. Her hedef için oturumun varlığı, eligibility, feedback outcome'u, canonical project cohort alanı taşımaması ve mevcut attribution durumu doğrulanır. İzinli üçlüler yalnız `(dersmerkezi, user_confirmed, not_useful)`, `(norn, session_metadata_verified, partial)` ve `(norn, session_metadata_verified, not_useful)` değerleridir.

Sınır: Bu akış istisnaidir; normal etiketleme veya cohort atama yolu değildir. Toplu migration, hash/session ID uydurma, teyidi varsayma, canonical kayıtları yeniden yazma veya izinli üçlü kümesini genişletme yasaktır. Yalnız append-only supplementary görünüm kullanılabilir. Hash uyuşmazlığı, eksik kanıt, izin dışı üçlü, canonical cohort kaydı veya çelişen attribution varsa yazmadan durulur.

### `m2-hook-metrik-incelemesi`

Tetikleme: M2 metrikleri, cohort görünümü, conflict kayıtları veya tarihsel attribution özetinin okunması/yorumlanması istendiğinde.

Sorumluluk: Canonical global özeti, `byProjectCohort`, conflict ve `historicalAttribution` görünümlerini salt okunur biçimde ayrı yorumlamak. Global alanların ve `decisionReady` eşiğinin anlamını açıklamak; legacy ve supplementary kayıtların kapsamlarını ayırt etmek.

Sınır: Kayıt yazmaz, sınıflandırmaz veya etiketlemez; kullanıcı niyeti/outcome'u çıkarmaz. Cohort ya da tarihsel görünümü canonical global toplamların yerine koymaz ve cohort bazlı readiness tanımlamaz.

## Bağımlılıklar ve sıra

1. Yeni oturum oluşturulurken `m2-hook-proje-kohortu` cohort metadatasını çözümler; ilk session metriğine yazılan cohort değişmez.
2. `m2-hook-oturum-uygunlugu` gerçek oturum kanıtını disposition'a dönüştürür.
3. Yalnız `eligible_real_user` sonrasında ve kullanıcı açıkça outcome seçmişse, aynı tam session/client için `m2-hook-sonuc-geri-bildirimi` çalışır.
4. `m2-hook-tarihsel-atif` normal sıranın parçası değildir; yalnız tekil ve kanıtlı legacy istisnasıdır.
5. `m2-hook-metrik-incelemesi` sonradan gelir ve her zaman salt okunur kalır.

## Paylaşılan değişmezler

- Canonical global M2 alanları, sayım/oran anlamları, `pilotStartAt` ve `decisionReady` semantiği korunur. Mevcut eşik 15 uygun etiket veya pilot penceresinin dolmasıdır; cohort başına eşik eklenmez.
- Var olan canonical cohort, feedback, disposition ve geçmiş oturum kayıtları yeniden yazılmaz. Cohort taşımayan geçmiş kayıtlar `legacy_unattributed` kalır.
- Historical attribution supplementary ve append-only'dir; canonical cohort raporuna veya global M2 karar hesabına dahil edilmez.
- Feedback yalnız kullanıcının açık outcome seçimine dayanır. Session işlemleri tam `client + session-id` bağıyla yürütülür. History akışında ayrıca tam ID onayı ve orchestrator-trusted beklenen hash zorunludur.
- Registry kökleri yalnız tam canonical `realpath` eşleşmesiyle karşılaştırılır. Ham yol, session ID, prompt, transcript, kullanıcı kimliği, secret veya serbest kanıt metni log/rapor/kalıcı kayda eklenmez.
- Conflict ve legacy tanılama sayıları global labeled count'a eklenmez. Aynı hash'in farklı client kayıtları ayrı oturum kapsamıdır.
- Her skill kendi güvenlik, durma ve gizlilik sınırlarını tek başına açıklar.

## Skill frontmatter ve açıklama koşulları

Her `SKILL.md`, dosya adıyla aynı sabit kebab-case `name` taşımalı. `description`, başka bir session'a taşındığında da anlaşılmalı; açık tetikleme sinyalini, temel işi, gerekli oturum/client veya kullanıcı girdisini ve temel dışlamayı belirtmelidir. Yalnız bu planı okumuş olmayı varsaymamalıdır.

Gövde sorumluluk, önkoşul/sıra, komut kullanımı, kanıt standardı, yazma ya da salt-okunur yetki sınırı, hata halinde durma ve gizlilik kurallarını içermelidir. Skill'ler birbirine yönlendirebilir ancak tetiklenen skill kendi güvenlik sınırlarını tekrar açıklar. Tanımlar mevcut sözleşmelerle sınırlı kalır ve uygulanmamış özellik vaat etmez. Kod yorumu, docstring, yer tutucu mantık ve Markdown tablosu eklenmez.

Uygulamadan sonra `.claude` ve global skill köklerine dağıtım mevcut sync mekanizmalarıyla yapılır. Yeni sync sistemi veya `hafiza-vault-bakimi` giriş kapısı oluşturulmaz.

## İş paketleri

1. Sol incelemesi: Tetikleme ayrımını, eligibility/outcome sınırını, global metrik/readiness değişmezlerini, history izin matrisini, gizlilik ve senkronizasyon kapsamını denetle.
2. Revizyon ve karar kapısı: Kritik/orta bulguları planda çöz; Sol incelemesi ve daha sonraki açık kullanıcı onayı olmadan uygulamaya başlama.
3. İlk uygulama: Onay sonrasında beş skill dizininde birer `SKILL.md` oluştur ve beş adı `config/policy.json` `skills.allowed` allowlist'ine ekle. Başka araç, MCP şeması veya kayıt davranışını değiştirme.
4. Senkronizasyon: `npm run skills:sync` ile kanonik `.agents/skills` içeriğini `.claude/skills` kopyalarına eşitle. Dört global kök elle dağıtılır; her kopyayı `npm run skills:check-global -- --strict` ile doğrula. Kökleri ve dağıtım yönünü önceden doğrula.
5. Ana orkestratör doğrulaması: Allowlist'teki skill'lerin bridge tarafından kabul edildiğini, `verify` ve `verify:ci` kontrollerine dahil edildiğini, kabul ölçütlerini ve değişiklik kapsamını doğrula; kapsam dışı değişikliği reddet.

## Riskler

- Geniş skill açıklaması yanlışlıkla outcome veya historical write tetikleyebilir. Açık kullanıcı isteği ve tam oturum/client girdileri şart olmalıdır.
- Eligibility ile feedback'i tek işlem gibi sunmak açık kullanıcı seçimi ilkesini zayıflatabilir; görevler ayrı kalmalıdır.
- Cohort'un outcome veya yetki sanılması yanlış raporlama doğurabilir; metadata sınırı ilgili skill'lerde yinelenmelidir.
- Historical attribution'ın migration gibi algılanması canonical geçmişi bozabilir; tek oturum, tam ID/hash doğrulaması, kapalı izin matrisi ve append-only görünüm korunmalıdır.
- CLI'nin üç tarihsel üçlüyü genel olarak kabul etmesi, tek başına ilk rollout'taki üç hedefi allowlist etmez. Skill hedef oturumun kaynak plandaki zaman/süre veya açık DersMerkezi teyidi ile kayıtlı attribution arasında birebir bağını ayrıca doğrulamalı; bağ kurulamıyorsa yazmaya geçmemelidir.
- Cohort veya historical görünümün readiness kararına karışması global M2 serisini değiştirebilir; canonical ve supplementary görünümler ayrı kalmalıdır.
- Skill kopyalarının farklı sürümlerde kalması session'lar arasında politika tutarsızlığı yaratabilir; mevcut sync sonucu doğrulanmalıdır.

## Kabul ölçütleri ve doğrulama

- Beş önerilen `SKILL.md` oluşturulur ve beş ad `config/policy.json` içindeki `skills.allowed` allowlist'ine eklenir. Başka mevcut kod, araç veya MCP sözleşmesi değişmez.
- Her skill bağımsız tetiklenebilir ve tek başına anlaşılır; görev, girdi, dışlama, bağımlılık ve durma koşulunu belirtir.
- Disposition enum'u `eligible_real_user`, `ineligible_instrumentation`, `ineligible_synthetic`, `ineligible_duplicate`, `indeterminate_legacy` ile sınırlıdır; eligibility skill'i outcome atamaz.
- Feedback yalnız eligible sınıflandırmasından sonra, tam session/client bağıyla ve kullanıcının açıkça seçtiği `useful`, `partial` veya `not_useful` için kaydedilir.
- Cohort değerleri `norn`, `dersmerkezi`, `unassigned` ile sınırlıdır. Proje install omission'ı sabit `unassigned`, global omission exact-registry dinamik çözümleme, global açık `unassigned` ise dinamik çözümlemeyi kapatma davranışıdır. Global statik named cohort reddedilir; belirsiz/eşleşmeyen OpenCode adayları `unassigned` olur. Geriye dönük atama yapılmaz.
- Historical attribution yalnız ilk rollout'taki üç belirli, daha önce onaylanmış OpenCode oturumuyla sınırlıdır; script istemcisi `opencode` olarak sabittir. Norn için expected hash, metric hash/oturum ID eşleşmesi ve `directory`, `worktree`, kayıtlı `project_directory` alanlarının her biri için exact Norn root realpath doğrulamasından sonra türetilir. DersMerkezi hedefi önceden var olan açık kullanıcı teyidine dayanır. Skill, hedefi kaynak plandaki Norn zaman/süre ve mevcut attribution kaydıyla veya DersMerkezi açık teyidiyle birebir eşleştirmeden CLI'yi çağıramaz; unrelated ama genel CLI kurallarına uyan legacy oturum için write-free ret kabul senaryosudur. İki onay kapılı işlem ve append-only supplementary görünüm korunur; yeni hedef ayrı kararı, bulk migration/canonical rewrite yapılmaz.
- Metrik incelemesi salt okunurdur. Değişiklik öncesi ve sonrası canonical global sayım alanları eşit kalır; mevcut 15 etiket/pilot penceresi `decisionReady` semantiği ve global eşik korunur. Cohort, conflict ve historical sayımları bu karara eklenmez.
- Sol incelemesi sonuçlandırılır, gerekli revizyonlar tamamlanır ve kullanıcı skill uygulamasını ayrıca onaylar. Bu kapılardan önce skill dosyaları oluşturulmaz.
- Uygulama onayı sonrasında `npm run skills:sync`, `npm test`, `npm run verify`, `npm run verify:ci`, `npm run skills:check-global -- --strict` ve `git diff --check` çalıştırılır. Allowlist'e eklenen adların her biri Subagent Bridge tarafından kabul edilmeli ve proje/CI skill doğrulamasına dahil olmalıdır. Bu plan aşamasında doğrulama komutları çalıştırılmaz. MCP şeması değişikliği planlanmadığından MCP schema smoke kapsam dışıdır.
- Değişiklik kapsamı beş skill dosyası, `config/policy.json` skill allowlist'i ve mevcut sync mekanizmalarının ürettiği kopyalarla sınırlıdır; senkronize dosyalar uygulama onayı sonrasında ayrıca gözden geçirilir.

## Çözümlenmemiş kararlar

- Komut/istemci biçimi kaynaklarla doğrulanmıştır: classify ve feedback `opencode|codex|claude|generic`, install `opencode|codex|claude`, historical attribution ise CLI'da sabit `opencode` istemcisini kullanır.
- Historical attribution izinli üçlülerinin genişletilip genişletilmeyeceği bu planla karara bağlanmaz; yeni kombinasyon ayrı kanıt, Sol incelemesi ve açık kullanıcı kararı gerektirir.
- `.claude` kopyaları `npm run skills:sync` ile üretilir; dört global kök elle dağıtılır ve `npm run skills:check-global -- --strict` ile denetlenir. Kökler uygulama öncesi doğrulanmalıdır; yeni sync davranışı varsayılmaz.
- Skill açıklamalarının hangi istemci/host metadata'sıyla tetikleneceği uygulama incelemesinde netleştirilmelidir; var olmayan tetikleme mekanizması vaat edilmemelidir.

## Kaynaklar ve kanıt

- `AGENTS.md`: M2 Hook Geri Bildirimi kuralları; açık kullanıcı seçimi olmadan outcome varsaymama ve `--session-id` zorunluluğu.
- `config/agent-rules.md`: orkestrasyon, alt model kanıt sınırları ve doğrulama kuralları.
- `.agents/skills/hafiza-vault-bakimi/SKILL.md`: Vault arama/yazımının ayrı, açık niyet gerektiren akış olduğu.
- `.agents/skills/veri-seti-analizcisi/SKILL.md`: YOLO/COCO veri seti etiketlemesinin ayrı görev alanı olduğu.
- `docs/plans/yarim-kalanlar/M2_PROJE_COHORT_ETIKETLEME_PLANI_2026-09-24.md`: readiness eşiği, canonical/global invariance, exact realpath registry, `legacy_unattributed`, conflict ve historical attribution kuralları.
- `scripts/classify-memory-hook.js`: izinli disposition değerleri ve `hook:classify` kayıt yolu.
- `scripts/record-memory-hook-feedback.js`: desteklenen outcome'lar, client/session girdileri ve feedback kayıt yolu.
- `scripts/attribute-memory-hook-history.js`: tam session ID onayı, trusted expected hash ve tarihsel kayıt yolu.
- `subagent-bridge/src/services/memory-hook-cohort.js`: cohort allowlist'i, canonical path çözümü ve exact root matching.
- `config/policy.json` ve `subagent-bridge/src/config.js`: `skills.allowed` köprü allowlist'i; allowlist dışındaki skill adları bridge çağrısında reddedilir.
- `README.md`, `scripts/sync-skills.js`, `scripts/check-global-skills.js`: skill senkronizasyonu ve global kopya doğrulaması. Global kökler normal `verify` kapsamına dahil değildir.
- Araştırma sınırlaması: Gemini 3.8 Flash yalnızca sağlanan özetleri inceledi ve aday sınırlar üretti; planın nihai içeriği yerel kaynaklara dayanır. DeepSeek Flash analizi ilk denemede rate-limited, tekrar denemede `auth_invalid` nedeniyle kullanılamadı; DeepSeek bulgusu ileri sürülmemektedir.

## GPT-6 Sol incelemesi

**Tamamlandı; ikinci incelemede kritik/orta bulgu kalmadı.** İlk incelemedeki beş bulgu plan revizyonuna işlendi:

- Bridge skill dispatch için `config/policy.json` `skills.allowed` allowlist'inin genişletilmesi ve allowlist doğrulamasının kabul ölçütlerine eklenmesi.
- Historical write yetkisinin yalnız ilk rollout'taki üç önceden onaylanmış OpenCode oturumuyla sınırlandırılması; istemci sabitliği ve yeni attribution için ayrı karar kapısı.
- Norn metadata kanıt zincirinin metric/session hash eşleşmesi ile `directory`, `worktree` ve kayıtlı `project_directory` alanlarının her biri için exact canonical root doğrulaması şeklinde tanımlanması.
- Project/global cohort kurulum farkları, omission ve açık `unassigned` davranışlarının, global named cohort reddinin ve OpenCode aday belirsizliğinin plana eklenmesi.
- `.claude` senkronizasyonu ile elle yapılan dört global kopya dağıtımının ayrılması ve `npm run skills:check-global -- --strict` kontrolünün eklenmesi.

İkinci inceleme bu beş bulgunun giderildiğini doğruladı. Ayrıca CLI'nin izinli tarihsel üçlüleri genel kabul etmesine karşın ilk rollout hedeflerini kendiliğinden allowlist etmediğini düşük önemle belirtti. Bu nedenle kabul ölçütüne hedefi kaynak plandaki Norn zaman/süre ve mevcut attribution kaydıyla veya DersMerkezi kullanıcı teyidiyle birebir eşleştirme ve unrelated legacy oturumda write-free ret senaryosu eklendi. Önceki kullanıcı teyidi ile Norn'un özel session metadata/gerçek yolları repository içinden bağımsız doğrulanamıyor; bu plan uygulama öncesi güvenilir bağlam doğrulaması şartını korur.

İlk GPT-6 Sol plan incelemesi tek başına uygulama yetkisi oluşturmaz; kullanıcı 2026-09-28'de ayrıca uygulama onayı verdi.

Uygulama sonrası GPT-6 Sol denetimi tamamlandı: kritik, yüksek veya orta bulgu yok. Sol'un düşük önem düzeyindeki plan durumu notu bu tarihli durum notuyla kapatıldı. Sol, kişisel runtime config'i ve dört global kökü bağımsız incelemedi; bu dış kopyaların eşitliği `npm run skills:check-global -- --strict` ve aktif runtime config doğrulamasıyla ana orkestratör tarafından kontrol edildi.
