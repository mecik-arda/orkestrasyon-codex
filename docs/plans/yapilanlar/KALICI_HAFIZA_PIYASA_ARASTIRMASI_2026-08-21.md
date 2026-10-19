# Kalıcı Hafıza Piyasa Araştırması ve Karşılaştırma Planı

> Durum notu (2026-09-27): Piyasa araştırması ve karşılaştırma teslimatı tamamlandı. Raporda tanımlanan O1-O4 uygulama paketi ve O6 sona erme standardizasyonu sonradan teslim edildi; O5 ve O7-O10 ayrı yaşam döngüsü/ölçüm kapılarındadır ve bu araştırma raporunun açık teslimatları değildir.

- Tarih: 2026-08-21
- Kapsam: Piyasadaki ajan harness'larının ve bellek platformlarının kalıcı hafıza (persistent memory) uygulamaları; bizim Obsidian Vault tabanlı sistemle karşılaştırma
- Yöntem: 5 paralel subagent araştırması (DeepSeek Pro: harness'lar; DeepSeek Flash: platformlar, akademik+benchmark, çapraz doğrulama, kritik öneriler); tamamı kaynaklı
- Maliyet: toplam ~0.028 USD (Pro ~0.006, Flash ~0.022)

## Yürütme Özeti

- Piyasa, markdown kural dosyaları (CLAUDE.md / AGENTS.md / GEMINI.md) standardına yakınsamış durumda; kalıcı bellek genelde iki katmanlı (global kullanıcı + proje) dosya deposu deseninde.
- Vektör/RAG çoğunlukla kod indekslemede kullanılıyor; ajan bellekleri büyük ölçüde markdown dosya tabanlı.
- 2026'nın ayrıştırıcı trendi: ajan-otonom bellek yazımı (Claude Code Auto Memory, Codex Memories, Qwen Auto-Memory) ve arka plan konsolidasyonu (dreaming).
- Bizim sistemin güvenlik ve yönetişim özellikleri (SHA-256 promote, zaman tabanlı sona erme, optimistic concurrency, redacted audit, yazma öncesi çelişki analizi, otomatik silme/birleştirme yasağı) incelenen hiçbir piyasa ürününde belgelenmemiş: net farklılaşma.
- Bizde olmayan ve piyasada yaygınlaşan özellikler: otomatik secret redaksiyonu, konsolidasyon modeli, bi-temporal gerçek geçersizleştirme, hibrit retrieval, arka plan sentezi.

## Bölüm A: Harness Kalıcı Hafıza Uygulamaları (DeepSeek Pro, researcher)

Kaynak erişim tarihi: 2026-08-21. 10+ harness incelendi.

### A.1 Harness Bazında Bulgular

- Claude Code: En olgun ajan-yazımlı bellek. İki katman: kullanıcı yazımı CLAUDE.md hiyerarşisi ve Auto Memory (ajanın yazdığı notlar, kullanıcı dizini altında proje başına klasörlerde). MEMORY.md ilk 200 satır/25KB her oturuma yüklenir; konu dosyaları talep üzerine okunur; transcript temizliğinden muaf. Bize işlevsel olarak en yakın rakip.
- OpenCode: AGENTS.md kural standardının öncüsü; global + proje + CLAUDE.md fallback; ajan tarafından otomatik yazılan bellek katmanı dokümante edilmemiş. Bizim sistem bu boşluğu dolduruyor.
- Codex CLI: AGENTS.md keşfi (root'tan cwd'ye yürüyerek birleştirme), 32KiB proje doküman sınırı, oturum başına temiz bağlam felsefesi. Kalıcı ajan bellek katmanı yok.
- Codex Memories: Yerel bellek deposu; varsayılan kapalı; özetler + kalıcı girdiler + kanıt dosyaları; otomatik secret redaksiyonu; ayrı çıkarma ve global konsolidasyon modelleri; /memories komutuyla chat bazlı kontrol.
- Cline Memory Bank: Talimatla sürdürülen 6 dosyalı markdown hiyerarşisi (projectbrief, productContext, activeContext, systemPatterns, techContext, progress); her görev başında tam okuma; semantik retrieval ve eskitme yönetimi yok.
- OpenHands: Bizim sisteme en yakın tasarım: opt-in iki katmanlı MEMORY.md (user + project), günlük dosyalar, ~6000 karakter bütçe (aşımda en eski satırlar düşer), secret yazma yasağı, UNTRUSTED_CONTENT sarmalı ile prompt injection uyarısı. Ayrıca Context Condenser (oturum içi sıkıştırma; kalıcı bellek değil).
- Gemini CLI: GEMINI.md hiyerarşisi + /memory show/refresh/add; ajan-otonom bellek yok.
- Qwen Code: Auto-Memory + Auto-Skills iddiası (Claude Code paritesi); iç mekaniği kaynakta ayrıntılı değil.
- Windsurf / Devin Desktop: Cascade otomatik anı üretir, makine-yerel saklar, workspace'ler arası paylaşmaz, repoya commit etmez; Rules için aktivasyon modları (always_on / glob / model_decision / manual); boyut bütçeleri (6000/12000 karakter).
- Devin (bulut): Knowledge tabanı + AGENTS.md + repo indeksleme (DeepWiki); lokaldeki gibi dosya-vault modeli değil.
- Aider: Repo map (graph ranking, ~1K token bütçe) + git; gerçek kalıcı bellek yok.
- Goose: 53K yıldızlı açık kaynak ajan; memory/recipe detayları bu turda doğrulanamadı.
- Cursor: Rules/Skills/Subagents + kod tabanı indeksleme; ayrı otomatik memories özelliği resmi dokümanda net doğrulanamadı.

### A.2 Ortak Desenler (2026)

- Tek markdown kural standardına yakınsama (CLAUDE.md/AGENTS.md/GEMINI.md).
- İki katmanlı tasarım: global kullanıcı + proje.
- Boyut bütçeleri yaygın: Claude Code 200 satır/25KB, OpenHands ~6000 karakter, Windsurf 6000/12000 karakter, Codex 32KiB.
- Güvenlik farkındalığı artıyor: OpenHands UNTRUSTED_CONTENT, Codex secret redaksiyonu, Claude Code harici import onayı.
- Ajan-otonom yazım yeni ayrıştırıcı trend.

## Bölüm B: Ajan Bellek Platformları (DeepSeek Flash, researcher)

Kaynak erişim tarihi: 2026-08-21. 10+ platform incelendi.

### B.1 Platform Bazında Bulgular

- Mem0: Üç katmanlı mimari (SQL gerçekler + vektör + entity store); add() sırasında LLM ile ADD/UPDATE/DELETE kararı; search() dört sinyal birleştirir (semantik + keyword + entity + temporal); expiration_date TTL (silmez, aramadan gizler); Memory Decay ve Dream (Platform). Not: semantic/episodic memory türleri enum'da tanımlı ama yalnız procedural_memory gerçekten çalışıyor.
- Letta / MemGPT: MemFS — git ile sürümlenen markdown bellek dosya sistemi; system/ klasörü her turda prompta yüklenir, diğerleri lazy load; ajan dosya araçlarıyla belleği okur/düzenler; Dreaming arka plan subagent'ları ile konsolidasyon; /remember, /init, /doctor komutları.
- Zep / Graphiti: Zamansal bilgi grafiği (Context Graph); her fact edge'inde 4 zaman damgası (created_at, valid_at, invalid_at, expired_at); bi-temporal fact invalidation (silme yok, geçersiz kılma var, point-in-time sorgu mümkün); Context Block ile token verimli akıllı bağlam; RBAC/ABAC, audit log, SOC 2, HIPAA.
- LangMem (LangChain/LangGraph): Depolamadan bağımsız çekirdek API + BaseStore entegrasyonu; semantic/episodic/procedural türleri; conscious (hot path) ve subconscious (arka plan) iki oluşum yolu; bellek güncelleme/silme LLM kararı; TTL/eskitme doğrulanamadı.
- OpenAI Agents SDK: Oturum tabanlı bellek; SQLite/Redis/SQLAlchemy/MongoDB/Dapr backend'leri; EncryptedSession (şifreleme + TTL); compaction ve pop_item; kalıcı semantik arama yok. Ayrı "AgentKit" deposu doğrulanamadı (404).
- CrewAI: Unified Memory; varsayılan LanceDB; composite scoring (semantik + üstel recency decay + önem); kayıt sırasında konsolidasyon (keep/update/delete/insert_new, eşik 0.85); private bayrağı ve source provenance; read-only slice'lar.
- Microsoft Agent Framework (AutoGen + Semantic Kernel'in halefi): AgentSession durumu; context provider'lar (before_run/after_run); FileMemoryProvider (model dosya araçlarıyla yazar, scope ile kalıcılık); Semantic Kernel bakım moduna alınmış.
- LangChain: Eski ConversationBufferMemory vb. terk edildi; güncel model kısa vadeli (checkpointer) + uzun vadeli (BaseStore, namespace + semantik arama).
- basic-memory: Yerel markdown + SQLite indeks; insan ve ajan aynı dosyaları iki yönlü yazar; Obsidian uyumlu; hybrid arama + isteğe bağlı reranker; MCP araçları readOnly/destructive/idempotent etiketleriyle; air-gapped çalışma. Bizim Vault yaklaşımının en yakın piyasa karşılığı.
- Cognee: Knowledge graph + vektör + oturum önbelleği; remember/recall/forget/improve API; AUTO_FEEDBACK ile kendi kendini iyileştirme; tenant izolasyonu; BEAM benchmark iddiası 0.79 skor.

### B.2 Ortak Desenler (2026)

- LLM destekli otomatik yazma her yerde standart (ADD/UPDATE/DELETE, memory manager, consolidation).
- İki zamanlı oluşum: hot path (anında) + background/dreaming (gecikmeli).
- Zamansallık standartlaşıyor: bi-temporal invalidation, TTL, decay/recency.
- Hibrit erişim: vektör + keyword + graf/belge gezintisi.
- MCP entegrasyonu varsayılan arayüz haline geldi.
- Dağıtım üçlüsü: yönetilen bulut + self-host OSS + local-first markdown.

## Bölüm C: Akademik Literatür ve Benchmark (DeepSeek Flash, researcher)

Kaynak erişim tarihi: 2026-08-21.

### C.1 Akademik Anketler ve Taksonomiler

- "A Survey on the Memory Mechanism of LLM based Agents" (arXiv:2404.13501): Bellek formları + işlemleri (yazma, okuma, yansıtma); kısa/uzun vadeli ayrımı temel taksonomi.
- MemGPT (arXiv:2310.08560): İşletim sistemi esinli sanal bağlam yönetimi; hızlı/yavaş bellek katmanları arası taşıma; kendini düzenleyen bellek.
- HippoRAG (arXiv:2405.14831, NeurIPS 2024): Hipokampal indeksleme; LLM + bilgi grafiği + Personalized PageRank; çok adımlı QA'da %20'ye varan iyileşme.
- A-MEM (arXiv:2502.12110, NeurIPS 2025): Zettelkasten yöntemi; dinamik dizinleme; yapılandırılmış nitelikli notlar; bellek evrimi.
- "A Survey of Agent Memory in the Second Half" (arXiv:2602.06052, TMLR 2026): Üç boyutlu taksonomi — altyapı (iç parametrik / dış erişimli depo), bilişsel mekanizma (duyusal, çalışan, epizodik, semantik, prosedürel), özne (kullanıcı / ajan merkezli).
- "From Storage to Experience" (arXiv:2605.06716, ACL 2026 Findings): Storage -> Reflection -> Experience aşamaları.
- Eywa (arXiv:2605.30771): Provenance-grounded bellek; "önce kanıt, sonra inanç"; erişimde sıfır LLM çağrılı deterministik okuma.
- "The Missing Knowledge Layer" (arXiv:2604.11364): Knowledge / Memory / Wisdom / Intelligence dört katmanı; BEAM'de çelişki çözme skorları neredeyse sıfır.

### C.2 Benchmark Sonuçları

- LoCoMo (arXiv:2402.17753): ~300 turluk çok oturumlu diyalog; 2026 lideri Synthius-Mem %94.37 (MemMachine %91.69).
- LongMemEval (arXiv:2410.10813, ICLR 2025): 500 soru, 5 yetenek; ticari asistanlar sürekli etkileşimde %30 doğruluk düşüşü yaşıyor.
- LongMemEval-V2 (arXiv:2605.12493): Web ajanları için; en iyi %72.5 (AgentRunbook-C), RAG tabanlı en güçlü yöntem %48.5.
- MemoryBank (arXiv:2305.10250): Ebbinghaus unutma eğrisi esinli güncelleme.
- MemBench (arXiv:2506.21605, ACL 2025 Findings): Olgusal + yansıtıcı bellek seviyeleri.
- EvoMemBench (arXiv:2605.18421): Uzun bağlam taban çizgileri hâlâ rekabetçi; hiçbir bellek formu her ayarda kazanmıyor.
- MemoryArena (arXiv:2602.16313): LoCoMo'da doygunluğa yaklaşan ajanlar ajanlık ortamlarında çöküyor.
- RECON (arXiv:2607.16716): Oracle-olmayan en güçlü sistem %22.4 doğruluk.
- BEAM: Orijinal yayın arXiv'de doğrulanamadı; skorlar ikincil kaynaklardan (Eywa: %81.45 ortalama nugget).

### C.3 Bellek Güvenliği Araştırmaları

- AgentPoison (arXiv:2407.12784): RAG ajan belleğini zehirleyen ilk backdoor saldırısı; %80+ başarı, %0.1 altı zehir oranı.
- InjecAgent (arXiv:2403.02691): Dolaylı prompt injection; GPT-4 %24 açık.
- Long-Term Memory Security Survey (arXiv:2604.16548): 6 fazlı yaşam döngüsü x 4 güvenlik hedefi; sonuç: güvenlik geriye eklenemez, depolama-zamanlı provenance/versiyonlama şart.
- Sleeper Memory Poisoning (arXiv:2605.15338): Zehirli anı yazımında GPT-5.5 %99.8; geri çağırmada %60-89 ajanlık eylem başarısı.
- MemMorph (arXiv:2605.26154): Araç seçimini yönlendiren bellek zehirlemesi; 3 kayıtla %85.9.
- Salami Attack (arXiv:2608.01637): Collusive poisoning; OpenClaw'da %75 saldırı başarısı.
- MemSecBench (arXiv:2607.27080): Zehirli bellek %84.2 vakada kalıcı; seçici onarım %56.1.

### C.4 Bizim Sistemin Akademik Karşılığı

- Vault -> 2602.06052'nin "dış erişimli bellek deposu" kategorisi; türler -> "bilişsel mekanizma" boyutu + A-MEM'in yapılandırılmış not yaklaşımı.
- 00_Inbox draft -> SHA-256 promote: 2605.06716'nın aşamaları ve Eywa'nın kanıt-doğrulama ilkesiyle uyumlu.
- reviewAfter/validUntil: MemoryBank'ın Ebbinghaus çürümesiyle örtüşüyor; soft-expiry yönetişim ilkesine uygun.
- Yazma öncesi çelişki analizi: Akademik açık problem (BEAM çelişki çözme ~0); sistem bunu mimari olarak adresliyor.
- Eksikler: (a) hiçbir benchmark'ta ölçülmemiş; (b) embedding aramasında zehirli içerik taraması yok; (c) çoklu ajan paylaşım senaryosu yok; (d) fiziksel veri yaşam döngüsü (arşiv/silme) tanımsız.

## Bölüm D: Çapraz Doğrulama ve Topluluk Eleştirileri (DeepSeek Flash, researcher)

Kaynak erişim tarihi: 2026-08-21.

### D.1 Çapraz Doğrulama Tablosu (6 iddia)

- (a) Claude Code Auto Memory varsayılan açık + kullanıcı dizinine yazma + 200 satır/25KB bütçe: DOĞRULANDI (code.claude.com/docs/en/memory + mem0 bağımsız kaynak kodu analizi).
- (b) Codex Memories otomatik secret redaksiyonu + ayrı konsolidasyon modeli: DOĞRULANDI (learn.chatgpt.com/docs/customization/memories + codex.danielvaughan.com derin incelemesi).
- (c) Letta MemFS git sürümlü markdown + system/ her turda yükleme: DOĞRULANDI (docs.letta.com/concepts/memfs).
- (d) Zep bi-temporal fact invalidation: DOĞRULANDI (help.getzep.com/facts).
- (e) basic-memory Obsidian iki yönlü markdown paylaşımı: DOĞRULANDI (github.com/basicmachines-co/basic-memory).
- (f) Dreaming trendi: DOĞRULANDI — Letta/Mem0/LangMem/Cognee resmi kaynakları; Claude Code Auto Dream bileşeni yalnız üçüncü taraf analize dayanıyor (resmi değil).

Sonuç: Önceki piyasa araştırmasındaki 6 ana iddianın hiçbiri çürütülmedi; 5'i birinci taraf resmi dokümanla teyit edildi.

### D.2 Topluluk Eleştirileri ve Riskler

- Güvenilirlik: Claude Code MEMORY.md 201. satırda sessiz budama yapıyor ("It's not hallucinating... It just forgot."); Mem0 Dream: "recall gets noisier, contradictions accumulate"; LangMem: aşırı çıkarım precision düşürür, az çıkarım recall düşürür.
- Bellek zehirlenmesi: MINJA (arXiv:2503.03704) belleğe erişmeden sorgu+etkileşimle enjeksiyon; ER-MIA (arXiv:2602.15344) benzerlik tabanlı geri çağırmanın sistemik açığı; mem0 için 7+ GHSA (kimlik doğrulamasız bellek yönetim API'leri) ve CVE-2026-7597 (pickle deserialization).
- Secret/PII sızıntısı: CVE-2026-59706 (CVSS 9.2) mem0 config API'sinden LLM anahtarları düz metin sızdı; OpenAI bile "redaksiyona rağmen bellek dosyalarını paylaşmadan önce inceleyin" diyor.
- Markdown vs vektör tartışması: HN'de canlı ("We built a persistent agent memory layer on Elasticsearch" thread); basic-memory tarafı "just files + local SQLite index" savunuyor; bizim tasarım iki kutbun ortasında (dosya şeffaflığı + sınırlı semantik alım).

### D.3 Bizim Sistem İçin Çıkarımlar

- Bilinçli yaşam döngüsü (reviewAfter/validUntil + onaylı promote) sessiz budamaya karşı üstün.
- Secret yasağı + redakte audit + yazma öncesi analiz; zehirlenme ve sızıntıya karşı tasarım düzeyinde savunma. Mevcut yazma taraması arama/okuma çıktılarında da uygulanmadıkça bu savunma eksik kalır.
- Otomatik birleştirme/silme yok kuralı, Zep'in "silmeden geçersiz kıl" ve Mem0'ın ADD-only prensibiyle uyumlu.
- Ana açıklar: arka plan konsolidasyon yok (bilinçli fark olarak belgele), Vault'a erişen arayüz katmanında kimlik doğrulama değerlendirilmeli.

## Bölüm E: Kritik Öneriler (DeepSeek Flash, researcher)

Kaynak erişim tarihi: 2026-08-21. O1-O4 ilk paketi ve O6 sona erme standardizasyonu mevcut Vault mimarisi üzerinde uygulandı; O5 ve O7-O10 ayrı ölçüm ve onay kapılarında bekliyor.

### E.1 Yüksek Öncelik

- O1 - Çift yönlü secret tarama + scrub: Yazma/analiz girişlerinde ve dış modele gidebilecek her arama/okuma alıntısında yerel deterministik tarama uygulandı (sk-, ghp_, AKIA, -----BEGIN, xoxb-, JWT, Bearer, bağlantı dizeleri ve yüksek entropili token). Secret saptanınca not/ham alıntı iletilmiyor ve redacted audit'e SECRET_REDACTION yazılıyor. Harici modelle anlamsal tarama eklenmedi; scrub otomatik mutasyon yapmama ilkesi nedeniyle yalnız audit + bilinçli düzeltme adımı olarak bırakıldı. Piyasa karşılığı: Codex Memories, Anthropic memory versions.
- O2 - Güvenilmeyen bellek sınırı + okuma/yazma ayrıcalık ayırımı: Arama/okuma sonuçları XML-escaped UNTRUSTED_CONTENT sarmalı, contentTrust metadata'sı ve açık güvenlik bildirimiyle dönüyor. Güvenlik sınırı sarmal değil, orkestratör politikasıdır: bellek içeriği talimat değildir. MCP okuma/yazma araçları ve annotations ayrı kalıyor. Oturumlar arası taint takibi bu pakete eklenmedi. Piyasa karşılığı: OpenHands UNTRUSTED_CONTENT, Anthropic read_only mount.
- O3 - Injection karantinası: Yerel/deterministik kurallar instruction override, hassas veri sızdırma, araç zorlama ve rol yeniden tanımlama desenlerini işaretliyor. Şüpheli arama sonuçları içeriksiz quarantinedMatches metadata'sına ayrılıyor; read varsayılan olarak fail-closed davranıyor. Ana orkestratör açık onay verdiğinde yalnız maxExcerptCharacters ile sınırlı ve XML-escaped alıntı dönüyor. Harici/hafif model çağrısı eklenmedi. Piyasa karşılığı: Anthropic tool output screening.
- O4 - Redakte edilmiş değişim geçmişi: Audit olay ve alan allowlist'i uygulandı. ADD, UPDATE, PROMOTE, PROMOTE_RACE_CONDITION, SECRET_REDACTION ve QUARANTINE bugün üretiliyor; INVALIDATE, EXPIRE ve SCRUB sonraki yaşam döngüsü paketleri için şemada ayrılmış durumda. Yalnız timestamp, not/content hash'leri ve sınıflandırma metadata'sı tutuluyor; request_id, taskId, actor kimliği, içerik, not yolu ve kaynak URL loglanmıyor. Piyasa karşılığı: Mem0 Memory History, Anthropic memory versions.

### E.2 Orta Öncelik

- O5 - invalidatedAt bi-temporal alanı: validUntil'e ek olarak invalidatedAt, kontrollü invalidationReason ve yeni geçerli notun SHA-256 bağlantısı eklenir. Varsayılan aramada gizli, tarihsel incelemede açık kalır; otomatik silme yoktur. Piyasa karşılığı: Zep fact invalidation.
- O6 - Sona erme standardizasyonu: UTC, inclusive, fail-open (bozuk tarih expired sayılmaz), yalnız liste okumaları filtreler, top_k öncesi eleme, includeExpired ile geri alınabilir. Bozuk metadata review raporunda görünür olur; sessizce kabul edilmez. Piyasa karşılığı: Mem0 expiration kuralları.
- O7 - Basitleştirilmiş scope izolasyonu: Klasör bazlı scope + private flag + önce report_only sonra enforce. Piyasa karşılığı: Zep ABAC, Cognee EBAC, CrewAI private/scope.
- O8 - Ölçüm kapılı retrieval iyileştirmesi: Önce mevcut evaluation setiyle NDCG, MRR, recall, abstention ve gecikme taban çizgisi sabitlenir. Yalnız ölçümde ihtiyaç doğrulanırsa 15 adaylık hibrit havuz (FTS+vektör) -> kompozit skor -> yerel cross-encoder ile 5 nota iniş küçük pilotta denenir; reranker yoksa mevcut sıralamaya fallback. Piyasa karşılığı: CrewAI composite scoring, basic-memory hybrid, Mem0 reranker.
- O9 - Minimal audit zenginleştirme: Yalnız action ve resource sınıfı gibi ilişkilendirilemez sınıflandırma metadata'sı değerlendirilir; actor, request_id ve görev kimliği eklenmez. Mevcut hash tabanlı redaksiyon ilkesi korunur.

### E.3 Düşük Öncelik

- O10 - Nihai durum yönetimi: Arşiv tek yönlü read-only + normal aramadan çıkar; periyodik doctor benzeri bütünlük denetimi (dosya-hash uyumu); tutarsızlık yalnız raporlanır, otomatik düzeltme yok. Piyasa karşılığı: Anthropic archive, basic-memory doctor.

### E.4 İlk 3 Öneri Gerekçesi

- O1: Yazma taraması mevcut olsa da okuma/arama yolu korumasızdır; dış modele giden her Vault alıntısı için yerel secret filtresi gerekir.
- O2: Bellek alıntıları doğrudan modele gittiği için her not potansiyel injection taşıyıcısıdır; sarmal yalnız işaretleme, ayrıcalık ayırımı asıl kontroldür.
- O3: O2'nin tamamlayıcısıdır; şüpheli içerikte fail-open yerine karantina ve ana orkestratör onayı kullanılır.
- O4: Sonraki yaşam döngüsü kararlarının kanıt zinciri için hash+sınıflandırma tabanlı olay geçmişi gerekir.
- İlk paket O1-O4'tür; yüksek etkiyle mevcut MCP yapı ve redacted audit ilkesiyle uyumludur.

## Sentez: Fırsatlar ve Farklılaşma

### Piyasada Var, Bizde Yok (fırsat listesi)

- Ajan-otonom yazım (Claude Code Auto Memory, Codex Memories, Qwen Auto-Memory): bizde yazım ana orkestratör onaylı; opsiyonel otomatik taslak üretimi düşünülebilir.
- Global konsolidasyon modeli (Codex consolidation_model): ayrı bir modelin tekrar/çelişki birleştirmesi.
- Otomatik secret redaksiyonu (Codex Memories): yazmadan önce içerikten secret ayıklama.
- Bi-temporal fact invalidation (Zep/Graphiti): invalidatedAt metadata'sı + geçmiş koruma + point-in-time sorgu.
- Rule activation modes (Windsurf): always_on / glob / model_decision / manual tetikleyiciler.
- Org/enterprise managed-policy katmanı (Claude Code sistem katmanı, Windsurf /etc/devin/rules).
- İndeks + konu dosyası lazy-load ayrımı (Claude Code MEMORY.md, OpenHands günlükleri).
- Çok sinyalli retrieval (CrewAI composite scoring, Mem0 decay): semantik + recency + önem ağırlığı.
- Hibrit arama (Zep, basic-memory, Cognee): keyword + semantik + isteğe bağlı reranker.
- Graf tabanlı ilişkisel bağlam (Graphiti, basic-memory wikilink).
- Bellek sürüm geçmişi ve geri alma (Letta git, Mem0 Memory History, basic-memory snapshot).
- Arka plan sentezi/dreaming (Letta, Mem0, LangMem, Cognee): yalnızca onaylı propose-apply modunda değerlendir.
- Şifreleme ve rol tabanlı erişim (OpenAI EncryptedSession, Zep RBAC/ABAC).

### Bizde Var, Piyasada Az Görülüyor (farklılaşma listesi)

- 00_Inbox draft -> SHA-256 doğrulamalı çift kilitli promote yaşam döngüsü (Letta git staging en yakın örnek; içerik hash doğrulaması ve çift kilit yok).
- Otomatik birleştirme/silme yasağı + ana orkestratör kararı şartı (piyasa otomatik konsolidasyona giderken bizim model bilinçli onayı zorunlu kılıyor).
- Tamamı redacted audit kaydı (yalnız hash + sınıflandırma metadata'sı; içerik/yol/task ID loglanmaz).
- Yazmadan önce zorunlu tekrar/çelişki analizi + bilinçli conflict acknowledgement.
- İkili sona erme modeli: reviewAfter (inceleme, otomatik gizleme değil) + validUntil (geçerlilik sonu); süresi dolan not normal aramada gizlenir ama asla otomatik silinmez.
- SHA-256 tabanlı optimistic concurrency (piyasada işlem/kilit düzeyinde OCC; içerik hash eşleşmesi yaygın değil).
- Sıkı bağlam bütçesi: en fazla 5 not alıntısı, Vault hiçbir görevde otomatik taranmaz.
- Gerçekten çalışan tür sınıflandırması: semantic/episodic/procedural/preference/decision (Mem0'da türler tanımlı ama yalnız procedural çalışıyor).
- İnsan denetimine açık markdown yaşam döngüsü: draft/published ayrımı, confidence/verificationStatus metadata'sı.

## Kaynaklar (konsolide, erişim tarihi 2026-08-21)

- https://code.claude.com/docs/en/memory
- https://opencode.ai/docs/rules/
- https://developers.openai.com/codex/agent-configuration/agents-md
- https://developers.openai.com/codex/customization/memories
- https://docs.cline.bot/features/memory-bank
- https://docs.openhands.dev/sdk/guides/persistent-memory.md
- https://docs.openhands.dev/sdk/guides/context-condenser.md
- https://google-gemini.github.io/gemini-cli/docs/cli/gemini-md.html
- https://github.com/QwenLM/qwen-code
- https://docs.windsurf.com/windsurf/cascade/memories
- https://docs.devin.ai/llms.txt
- https://github.com/aaif-goose/goose
- https://aider.chat/docs/repomap.html
- https://aider.chat/docs/git.html
- https://docs.cursor.com/
- https://docs.mem0.ai/core-concepts/how-it-works
- https://docs.mem0.ai/core-concepts/memory-types
- https://docs.mem0.ai/platform/features/memory-expiration
- https://docs.mem0.ai/llms.txt
- https://docs.letta.com/concepts/memfs
- https://docs.letta.com/configuration/memory
- https://docs.letta.com/concepts/stateful-agents
- https://help.getzep.com/understanding-the-graph
- https://help.getzep.com/facts
- https://help.getzep.com/retrieving-context
- https://help.getzep.com/governance
- https://github.com/getzep/graphiti
- https://arxiv.org/abs/2501.13956
- https://langchain-ai.github.io/langmem/
- https://langchain-ai.github.io/langmem/concepts/conceptual_guide/
- https://openai.github.io/openai-agents-python/sessions/
- https://openai.github.io/openai-agents-python/ref/memory/
- https://docs.crewai.com/concepts/memory
- https://learn.microsoft.com/en-us/agent-framework/overview/
- https://learn.microsoft.com/en-us/agent-framework/concepts/agents/conversations/context-providers
- https://github.com/microsoft/semantic-kernel
- https://docs.langchain.com/oss/python/langgraph/add-memory.md
- https://github.com/basicmachines-co/basic-memory
- https://github.com/topoteretes/cognee

### Bölüm C/D/E ek kaynakları (erişim tarihi 2026-08-21)

- https://arxiv.org/abs/2404.13501 (ajan belleği anketi)
- https://arxiv.org/abs/2310.08560 (MemGPT)
- https://arxiv.org/abs/2405.14831 (HippoRAG)
- https://arxiv.org/abs/2502.12110 (A-MEM)
- https://arxiv.org/abs/2602.06052 (Agent Memory in the Second Half)
- https://arxiv.org/abs/2605.06716 (From Storage to Experience)
- https://arxiv.org/abs/2605.30771 (Eywa)
- https://arxiv.org/abs/2604.11364 (Missing Knowledge Layer)
- https://arxiv.org/abs/2402.17753 (LoCoMo)
- https://arxiv.org/abs/2410.10813 (LongMemEval)
- https://arxiv.org/abs/2605.12493 (LongMemEval-V2)
- https://arxiv.org/abs/2305.10250 (MemoryBank)
- https://arxiv.org/abs/2506.21605 (MemBench)
- https://arxiv.org/abs/2605.18421 (EvoMemBench)
- https://arxiv.org/abs/2602.16313 (MemoryArena)
- https://arxiv.org/abs/2607.16716 (RECON)
- https://arxiv.org/abs/2604.11563 (Synthius-Mem)
- https://arxiv.org/abs/2407.12784 (AgentPoison)
- https://arxiv.org/abs/2403.02691 (InjecAgent)
- https://arxiv.org/abs/2604.16548 (LTM Security Survey)
- https://arxiv.org/abs/2605.15338 (Sleeper)
- https://arxiv.org/abs/2605.26154 (MemMorph)
- https://arxiv.org/abs/2608.01637 (Salami)
- https://arxiv.org/abs/2601.05504 (Memory Poisoning Attack and Defense)
- https://arxiv.org/abs/2607.27080 (MemSecBench)
- https://arxiv.org/abs/2603.20357 (secure multi-agent memory)
- https://arxiv.org/abs/2503.03704 (MINJA)
- https://arxiv.org/abs/2602.15344 (ER-MIA)
- https://learn.chatgpt.com/docs/customization/memories
- https://codex.danielvaughan.com/2026/04/18/codex-built-in-memory-system-deep-dive/
- https://mem0.ai/blog/how-memory-works-in-claude-code
- https://mem0.ai/blog/dream-background-memory-consolidation-for-ai-agents
- https://mem0.ai/blog/ai-agent-memory-governance-meaning-best-practices-for-secure-memory
- https://platform.claude.com/docs/en/managed-agents/memory
- https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/mitigate-jailbreaks
- https://docs.openhands.dev/sdk/arch/security
- https://help.getzep.com/policy-based-access-control
- https://help.getzep.com/audit-logging
- https://docs.mem0.ai/api-reference/memory/history-memory
- https://docs.mem0.ai/open-source/features/reranker-search
- https://docs.crewai.com/v1.15.17/en/concepts/memory
- https://docs.cognee.ai/core-concepts/multi-user-mode/permissions-system/overview.md
- https://pypi.org/project/basic-memory/
- https://news.ycombinator.com/item?id=48583703
- https://news.ycombinator.com/item?id=46004834
- https://github.com/advisories/GHSA-225m-p565-9h68 (CVE-2026-59706, mem0 secret sızıntısı)

Doğrulanamayanlar: OpenAI AgentKit ayrı deposu (404), Zep Memobase (404), Semantic Kernel eski memory doküman sayfası (404), Goose memory/recipe iç detayları, Cursor otomatik memories, Devin Knowledge eskitme modeli, BEAM benchmark'ının orijinal yayını (yalnız ikincil kaynaklar), OpenAI EncryptedSession resmi dokümanı, Claude Code Auto Dream resmi teyidi (yalnız üçüncü taraf analiz).

## Sonraki Adımlar

- İlk uygulama paketi tamamlandı: O1 (yazma/analiz/arama/okuma yolunda yerel secret taraması), O2 (güvenilmeyen bellek sınırı + ayrı araç metadata'sı), O3 (deterministik injection karantinası) ve O4 (allowlist'li hash+sınıflandırma tabanlı olay geçmişi).
- O6 sona erme standardizasyonu tamamlandı. O5 bi-temporal invalidation ayrı yaşam döngüsü paketi olarak; O8 ise yalnız mevcut evaluation setinde ihtiyaç ölçülürse ayrı pilot olarak ele alınacak.
- Farklılaşma özelliklerini dokümantasyonda öne çıkar: "denetlenebilir, sona ermeli, insan-onaylı bellek" konumlaması.
- Kalıcı hafıza özeti tekrar ve çelişki analizi, draft incelemesi ve SHA-256 kontrollü promote akışıyla published olarak yayımlandı.
- Kanallar notu: AGY (Gemini/Sonnet) web araştırmasında permission/auth sorunları verdi; GLM 5.3 process_exit; Claude Code CLI auth yok. Araştırma görevleri için stabil kanal: DeepSeek (Pro/Flash). AGY antigravity timeoutMs 300000 -> 900000 yapıldı (config/agents.json).
