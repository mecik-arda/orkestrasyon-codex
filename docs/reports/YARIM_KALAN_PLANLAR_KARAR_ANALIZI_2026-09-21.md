# Yarım Kalan Planlar Karar Analizi (2026-09-21)

## 1. Karar Sorusu ve Kapsam

Karar sorusu: Mevcut yarım kalan planların açık maddeleri tamamlanmalı mı, yoksa video kaynaklı yeni plan önerileri mi uygulanmalı?

Kapsam:

- `docs/plans/yarim-kalanlar` altındaki dört plan (V2, V3, Context, MCP attestation v2).
- Video kaynaklı uygunluk analizindeki koşullu öneriler (`docs/reports/VIDEO_KAYNAKLI_PLANLAR_UYGUNLUK_ANALIZI_2026-09-21.md`, Sol APPROVED).
- `yapilmayanlar` kategorisi boştur; uygulanmayan işler yarım kalan planların geleceğe bırakılmış adımlarıdır.

Özet karar: Zorlamalı tamamlama da toplu yeni yatırım da önerilmez. Açık maddeler ölçüm-önce sıralamayla korunur; tek aktif yatırım M2 hook pilotudur (ayrı ücretli sağlayıcı çağrısı gerektirmez); Context Aşama 2-3 bir sonraki gerçek işte ek altyapı gerektirmeden doğrulanır; kalan tüm kapılar kapalı kalır.

## 2. Yöntem ve Kanıt

- Envanter: `docs/plans/DURUM_INDEKSI.md` (2026-09-21 işletim durumu) ve dört planın açık madde bölümleri.
- Yerel doğrulama (2026-09-21 18:05 UTC civarı, DURUM_INDEKSI'deki 5 adaylık snapshot sonrasında alınan yeni snapshot): `npm run edit:feedback -- list` 23 bekleyen aday; `npm run edit:classify -- list` eligible_real_user 0, ineligible_instrumentation 1, indeterminate_legacy 114, toplam 115 disposition. İki belge arasındaki sayı farkı, indeksin bu sorgudan önce alınmış olmasındandır; aynı günün farklı anlarına ait snapshot'lardır.
- Bütçe rejimi: aylık 100 USD bilgilendirme referansıdır ve `costBudgetEnforced` kapalıdır; ücretli her yeni iş açık kullanıcı onayı ve onay defteri kaydı gerektirir.
- Açık maddelerin üç bağımlılık sınıfı vardır: gerçek kullanıcı verisi, ölçüm/olay eşiği, dış veya host kararı. Bu sınıfların hiçbiri kod yazarak zorla kapatılamaz.
- Video koşullu önerilerinin ayrıntılı fayda-zarar dökümü onaylı video analizi raporundadır; bu rapor onları tekrar açmaz.

## 3. Açık Madde Envanteri ve Bağımlılık Sınıfı

V2 (`ORKESTRASYON_GELISTIRME_PLANI_V2.md`):

- Faz 4 karar kapısı: 30-50 gerçek etiketli edit sonucu; mevcut durum 4 etiketli kayıt (2 accepted, 2 minor_fix) ve 0 eligible_real_user aday. Not: 0 eligible açık disposition sayısıdır, 4 kayıt ise etiketlenmiş sonuç kohortudur; ikisi aynı ölçü değildir. Sınıf: gerçek kullanıcı verisi.
- Faz 5: izole edit dikey dilimi (`run_isolated_edit_subagent`, geçici worktree, atomik manifest, yerel onay kanalı). Sınıf: ölçüm kapısı (Faz 4).
- Faz 6: altı typed redacted lifecycle event. Sınıf: Faz 5 teşhis olayı kapısı.
- Faz 7: 20 benzer read-only görevle paralel review A/B. Sınıf: ücretli deney + kullanıcı onayı.

V3 (`PLAN_IKINCI_BEYIN_V3_DESEN_UYARLAMASI_2026-09-18.md`):

- M2 canlı pilot: 15 etiketli oturum veya 2 hafta; ortalama hook süresi 1500 ms altı; hata oturumu düşürmemeli; sonunda Sol denetimi. Sınıf: gerçek kullanıcı oturumu (ayrı ücretli sağlayıcı çağrısı gerektirmez).
- Antigravity hook yüzeyi: doğrulanmış yüzey yok. Sınıf: dış-bağımlı.
- O5 ve O7-O10 bellek optimizasyonları: kendi ölçüm/olay kapılarında. Sınıf: ölçüm kapısı.

Context (`CONTEXT_ORKESTRASYONU_VE_GUVENLI_SECOND_BRAIN_PLANI_2026-08-21.md`):

- Aşama 2: handoff durum notu formatı ve kayıpsız devir kabul kriteri; gerçek çok oturumlu iş doğduğunda. Sınıf: gerçek iş (ek altyapı gerektirmez).
- Aşama 3: mini-spec'in orta karmaşıklıkta bir değişiklikte diff ve testle birebir doğrulanması. Sınıf: gerçek iş (ek altyapı gerektirmez).
- Aşama 4-5: fiilen uygulanıyor; resmi kapanış gerçek iş üzerinde yapılacak. Sınıf: gerçek iş.
- Kapsam kapısı: kullanıcının Aşama 1-3 mü yoksa yalnız Aşama 2 mi istediği hâlâ açık bir kullanıcı kararıdır.

MCP attestation v2 (`MCP_KURAL_ATTESTATION_GELECEK_FAZLARI_PLANI_2026-09-20.md`):

- Faz 0-3: host loader kanıtı, trust anchor sahibi, key custody, imzalı snapshot, kademeli rollout. Sınıf: dış/host kararı + kullanıcı güvenlik kararı.

## 4. Fayda-Zarar Değerlendirmesi

### 4.1 V2 Faz 4 veri toplama

- Fayda: Faz 5 için tek meşru kanıt kaynağı; gerçek edit kalitesini ölçer; maliyeti yok.
- Zarar/risk: Etiket disiplini düşerse veri kirli kalır. Disposition kaydı olmayan bekleyen aday, metrik katmanında varsayılan olarak uygun kuyrukta sayılır (`report-metrics.js` uygunluk kaydı yoksa kaydı eligible kabul eder; kohort kuralı da uygunluk kaydı olmayan etiketsiz kaydı paydaya katar). Bu yüzden gerçek kullanıcı edit'i olmayan adaylar `npm run edit:classify dispose` ile uygun dışı bırakılmadan 30'luk payda kirlenir.
- Maliyet: Sıfır (yerel komut).
- Öneri: Pasif toplama devam; enstrümantasyon adayları `ineligible_instrumentation` sınıfında kalır; kohort genişletilmez.

### 4.2 V2 Faz 5 izole edit

- Fayda: Ana worktree'yi onaya kadar değiştirmeyen güvenlik ağı; geri alma oranını düşürme potansiyeli.
- Zarar/risk: Worktree lifecycle, Windows adversarial dosya testleri ve approval kanalı büyük mühendislik yüzeyi; ölçülen sorun yokken davranış değişikliği riski.
- Maliyet: Yüksek geliştirme + test bakımı.
- Kapı: Faz 4 oranı %10 ve üzeri + doğrulanmış kullanıcı güven sorunu.
- Öneri: Kapalı kalır; kapı verisi gelmeden açılmaz.

### 4.3 V2 Faz 6 lifecycle olayları

- Fayda: Crash/cleanup/approval teşhisi.
- Zarar/risk: Faz 5 kullanılmadan kurulursa kullanılmayan altyapı ve log yüzeyi.
- Öneri: Faz 5'e bağlı kalır; bağımsız başlatılmaz.

### 4.4 V2 Faz 7 paralel review A/B

- Fayda: Çok modelli sentezin karar kalitesine etkisini ölçer.
- Zarar/risk: Yaklaşık 3x sağlayıcı maliyeti, gecikme, 20 görevlik ücretli deney; kalite artışı ölçülmezse kalıcı özellik olmaz.
- Kapı: Ücretli çalışma için açık kullanıcı onayı ve ölçüm tasarımı.
- Öneri: Kapalı; kullanıcı onayı olmadan başlatılmaz. Bu oturum pratiği zaten tek-modelli sıralı denetimle çalışıyor.

### 4.5 V3 M2 hook pilotu

- Fayda: Oturumlar arası sürekliliğin tek somut ve ek sağlayıcı maliyeti gerektirmeyen ölçümü; reddi (otomatik yazma) zaten korunuyor; geri çekme koşulları tanımlı.
- Zarar/risk: Etiketler kullanıcının gerçek oturumlarına bağlı; yanlış etiketleme veriyi bozar; hook süresi bütçesi aşılırsa pilot düşer. Ayrıca hassas, eski veya ilgisiz Vault içeriğinin sağlayıcı bağlamına taşınması riski vardır; mevcut azaltımlar opt-in, salt okunur, en fazla beş sonuç, düşük bağlam bütçesi, secret/injection filtresi ve soft-expired/taslak/karantina dışlamasıdır.
- Maliyet: Ayrı ücretli sağlayıcı çağrısı gerektirmez; hook'un enjekte ettiği bağlam mevcut model çağrılarının token tüketimini bir miktar artırabilir.
- Öneri: Tek aktif yatırım budur; gerçek iş oturumlarında etiket toplanır; teknik doğrulama oturumları paydaya girmez.

### 4.6 Antigravity hook yüzeyi

- Fayda: Üçüncü istemcide aynı süreklilik.
- Zarar/risk: Doğrulanmış yüzey yok; host desteği gelmeden yapılacak her iş varsayım üzerine kurulur.
- Öneri: Dış-bağımlı kalır; host desteği kanıtlanınca yeniden değerlendirilir.

### 4.7 V3 O5 ve O7-O10 bellek optimizasyonları

- Fayda: Retrieval gecikmesi, bağlam bütçesi ve konsolidasyon kalitesi.
- Zarar/risk: Ölçülen performans sorunu yokken karmaşıklık ve güvenlik yüzeyi büyür.
- Öneri: Kapalı; tetikleyici ölçüm eşiği tanımlanmadan açılmaz. Video koşullu önerileriyle (bağlam budama, dedup) aynı anda iki paralel hat açılmaz.

### 4.8 Context Aşama 2 handoff

- Fayda: Çok oturumlu işte bağlam kaybını önler; bu projede zaten fiilen kullanılıyor (oturum özeti, tarihli durum notları).
- Zarar/risk: Ağır format zorunluluğu küçük işleri yavaşlatır; plan bunu kendi risk listesinde kabul ediyor.
- Maliyet: Sıfır; mevcut rapor/not düzeni yeterli.
- Öneri: Bir sonraki gerçek çok oturumlu işte hafif biçimle resmi kabul; ayrı bir altyapı kurulmaz.

### 4.9 Context Aşama 3 mini-spec

- Fayda: Implementer kapsam kaymasını önler; kabul kriterleri diff ile birebir doğrulanır.
- Zarar/risk: Küçük değişikliklerde gereksiz bürokrasi; şablon zaten var (`MINI_SPEC_SABLONU.md`).
- Öneri: Bir sonraki orta karmaşıklıkta gerçek değişiklikte ücretsiz doğrulama; politika olarak zaten uygulanıyor.

### 4.10 Context Aşama 4-5 resmi kapanış

- Fayda: Süreç faydasının kayıtlı kanıtı.
- Zarar/risk: Erken kapanış sentetik kanıt üretir; yasak.
- Öneri: Gerçek iş üzerinde kapanış; ek yatırım yok.

### 4.11 MCP attestation v2

- Fayda: İmzalı manifest, startup context kanıtı, anahtar tabanlı güven.
- Zarar/risk: Yeni secret/anahtar saklama yükü (key custody), trust anchor sahibi belirsiz, tüketici talep yok; yanlış kurgu sahte güven üretir.
- Maliyet: Yüksek güvenlik tasarımı + test matrisi.
- Kapı: Host loader kanıtı ve kullanıcı güvenlik kararı.
- Öneri: Tasarım olarak kalır; uygulama başlatılmaz. v1 mevcut ihtiyacı karşılıyor.

### 4.12 Video kaynaklı koşullu öneriler

- Fayda/zarar dökümü onaylı raporda; ortak özellik, ölçüm veya ücretli onay kapısına bağlı olmalarıdır.
- Öneri: Hiçbiri bu kararla açılmaz; tetikleyiciler aynen korunur. Reddedilenler (otomatik hafıza yazımı, bulut katman, doğrulama yetkisinin devri, refleks sınıflandırma, AI ön onay) geri açılmaz.

## 5. Karar ve Gerekçe

Karar:

- Hiçbir açık madde zorla tamamlanmaz; hiçbir yeni plan yatırımı açılmaz.
- Tek aktif yatırım: M2 hook pilotu (ayrı ücretli sağlayıcı çağrısı gerektirmez; gerçek kullanıcı oturumları).
- Ek altyapı gerektirmeyen eşzamanlı doğrulama: Context Aşama 2-3, bir sonraki gerçek çok oturumlu veya orta karmaşıklıkta işte.
- Pasif birikim: V2 Faz 4 gerçek edit etiketleri.
- Kapalı kalanlar: V2 Faz 5-7, V3 Antigravity ve O5/O7-O10, MCP v2, video koşullu önerileri.

Gerekçe:

- Projenin tasarım ilkesi ölçülen sorun ve önceden tanımlı kabul eşiğidir; şu an hiçbir açık madde için doğrulanmış sorun yok.
- Kapıları kapalı tutmanın maliyeti sıfıra yakındır; zorla tamamlama ise mühendislik, ücret ve güvenlik yüzeyi maliyeti getirir.
- Veri ve ölçüm kapıları mevcut mekanizmalarla izlenebilir ve açılabilir; eksik olan temel şey gerçek kullanım verisidir ve bu yalnız gerçek işle üretilebilir. Dış/host kapıları (Antigravity hook yüzeyi, MCP v2 host loader ve trust anchor) ayrıca entegrasyon ve güvenlik sahipliği kararı gerektirir; bunlar veri birikmesiyle kendiliğinden açılmaz.
- Aynı anda birden çok büyük yatırım açmak, ölçüm ayrımını ve geri alma netliğini bozar.

## 6. Kararı Değiştirecek Tetikleyiciler

- V2 Faz 4: istenmeyen/geri alınan edit oranı %10 ve üzeri + doğrulanmış kullanıcı güven sorunu ise Faz 5 prototipi; 30 örneğe makul sürede ulaşılamıyorsa zaman kutulu (90 gün) manuel risk incelemesi yapılır, çünkü düşük frekanslı fakat yüksek etkili edit güvenlik sorunları yalnız oranla yakalanamayabilir.
- V3 M2: 15 etiketli oturum veya 2 hafta sonunda Sol denetimi ve kalıcılık kararı; pilot kriterlerindeki zorunlu durdurma kapıları aynen geçerlidir (yazma/yayınlama/silme/taşıma gözlemi, secret veya karantina içeriğinin bağlama sızması, bağlam bütçesi veya sonuç tavanı aşımı, hook kaynaklı oturum kesintisi/donma/tekrarlayan hata, etiketli oturumların yarısından fazlasında `not_useful`, p95 hook süresinin 1500 ms üstüne çıkması). Bu kapılardan biri gerçekleşirse pilot derhal durur.
- Bellek: ölçülen retrieval gecikmesi veya bağlam bütçesi eşiği aşılırsa O5/O7-O10.
- MCP v2: host loader hook kanıtı ve trust anchor/key custody kullanıcı kararı verilirse Faz 0.
- Ücretli deneyler: kullanıcı açık onayı ve ölçüm tasarımı verilirse Faz 7 ve video koşullu önerileri.

## 7. Zarar Analizi ve Önlemler

Önerilen yolun zararları:

- Faz 4 eşiği yavaş dolar (30-50 kayıt; 0 açıkça sınıflandırılmış eligible disposition, bekleyen adaylar varsayılan olarak uygun kuyrukta); önlem: etiket akışını gerçek iş sonrası tek komuta indirmek, gerçek kullanıcı edit'i olmayan adayları `edit:classify dispose` ile uygun dışı bırakmak. Eşik hiç dolmazsa düşük frekanslı fakat yüksek etkili edit güvenlik sorunları süresiz ertelenebilir; önlem: 90 günlük zaman kutulu manuel risk incelemesi tetikleyicisi (§6).
- M2 pilotu kullanıcı katılımı olmadan ilerlemez; önlem: pilot etiketini oturum sonu tek karar olarak tutmak, teknik oturumları payda dışında bırakmak.
- Gated tasarımlar zamanla bayatlar; önlem: her DURUM_INDEKSI güncellemesinde kapı ve tarih gözden geçirmesi.

Toplu uygulama seçeneğinin zararları:

- Ölçülmemiş özellikler için bakım ve test yükü; güvenlik yüzeyi büyümesi (özellikle MCP v2 anahtar yönetimi).
- Ölçüm ayrımının kaybı: hangi maddenin gerçekten fayda sağladığı bilinemez.
- Ücretli deneylerin bütçe ve onay rejimi olmadan başlatılması kural ihlali olur.

## 8. Sonuç

Karar: Mevcut yarım kalan planlar tamamlanmış sayılmaz ve yenileri uygulanmaz; ölçüm-önce sıralama korunur. Sıradaki somut adımlar:

1. M2 canlı pilot etiket akışını gerçek oturumlarda işletmek (kullanıcı katılımı; ayrı ücretli sağlayıcı çağrısı gerektirmez).
2. Bir sonraki gerçek orta/çok oturumlu işte Context Aşama 2-3'ü hafif biçimle doğrulamak.
3. Gerçek edit sonuçlarını Faz 4 kohortunda biriktirmeye devam etmek.
4. Kapı tetikleyicilerini işletim durumu güncellemelerinde izlemek; hiçbir kapıyı veri gelmeden açmamak.

Bu karar, ücretli yeni çalışma gerektirmez; herhangi bir ücretli ölçüm veya deney ancak açık kullanıcı onayı ve onay defteri kaydıyla başlatılır.

## 9. Sol Denetimi

- Birinci tur (2026-09-21, Codex `gpt-5.6-sol`, salt-okunur): APPROVED_WITH_RISKS (5 orta bulgu). Kapatılanlar: 23 adaylık snapshot'ın DURUM_INDEKSI sonrası alındığının açıklanması; "adayların çoğu enstrümantasyon" iddiasının kaldırılması; "sıfır sağlayıcı maliyeti" ifadesinin "ayrı ücretli sağlayıcı çağrısı gerektirmez" olarak daraltılması; kapı genellemesinin dış/host kapıları ayrılarak düzeltilmesi; M2 bağlam sızıntısı riski ve fırsat maliyeti için 90 günlük inceleme tetikleyicisinin eklenmesi.
- İkinci tur: APPROVED_WITH_RISKS (2 orta). Kapatılanlar: disposition'sız adayın metrik katmanında varsayılan olarak uygun sayıldığı gerçeğine göre §4.1 ve §7 düzeltmesi; M2 durdurma kapılarının pilot kriterlerindeki tam listeyle genişletilmesi.
- Üçüncü tur: APPROVED_WITH_RISKS (1 düşük). Kapatma: §7'deki "0 eligible" ifadesinin "0 açıkça sınıflandırılmış eligible disposition" olarak daraltılması.
- Dördüncü tur: APPROVED (kritik/yüksek/orta/düşük açık bulgu yok).
