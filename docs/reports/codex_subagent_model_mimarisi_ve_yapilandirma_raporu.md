# OpenAI Codex CLI Coklu Ajan Mimarisi ve Alt Ajan Model Yapilandirmasi Inceleme Raporu

**Rapor Tarihi:** 14 Ekim 2026  
**Kapsam:** OpenAI Codex CLI, Multi-Agent Orkesrasyonu, Model Miras Alma (Inheritance) Mekanizmasi ve Bagimsiz Model Yapilandirmalari  
**Hedef Kitle:** Sistem Mimarlari, Guvenlik Arastirmacilari ve LLM Orkestrasyon Gelistiricileri  

---

## 1. Yonetici Ozeti

OpenAI Codex CLI ve ozerk kodlama araclarinda, ana gorevi parcalayarak paralel yuruten coklu ajan (multi-agent) yapilari genis olcekli projelerin yonetiminde kritik rol oynamaktadir. Bu raporda; Codex CLI icerisinde baslatilan alt ajanlarin (subagents) varsayilan davranis bicimleri, baska GPT modelleriyle calisip calisamayacagi, model miras alma zincirinin teknik dinamikleri ve ozel ajan profillerinin nasil kurgulandigi ayrintili olarak incelenmistir.

Analiz bulgulari su temel sonucu ortaya koymaktadir:
* **Varsayilan Davranis:** Codex CLI icerisinde acik bir model tanimi yapilmadigi surece, baslatilan tum alt ajanlar ana orkestrator oturumun (parent session) kullandigi GPT modelini, akil yurutme derinligini (reasoning effort) ve izin sinirlarini dogrudan devralir (inheritance). Varsayilan duzenekte sistem ozerk olarak baska bir GPT modeline gecis yapmaz.
* **Yapilandirilabilirlik:** Sistem, alt ajanlarin farkli GPT modelleri ve parametre setleriyle calistirilmasini tam olarak destekler. Bu davranis, global veya proje yerelindeki TOML yapilandirma dosyalari (`config.toml` ve `.codex/agents/*.toml`) uzerinden yonetilir.

---

## 2. Model Miras Alma (Inheritance) Mekanizmasi

Codex CLI multi-agent modunda calisirken ana ajan gorevleri alt gorevlere boler ve arka planda bagimsiz is parcaciklari (threads) olarak calisan alt ajanlar uretir.

### 2.1. Varsayilan Miras Hiyerarsisi
Alt ajan manifestosunda model bilgisi bos birakildiginda veya hazir bilesenler (worker, explorer, reviewer) dogrudan cagrildiginda asagidaki parametreler ana oturumdan devralinir:
* **Model Kimligi:** Ana oturumda aktif olan model ailesi ve surumu.
* **Akil Yurutme Butcesi (Reasoning Effort):** Ana oturumun akil yurutme seviyesi (high, medium, low).
* **Guvenlik ve Onay Politikasi:** Ana oturumun kullanici onayi gereksinimleri ve calisma alani erisim yetkileri.

### 2.2. Varsayilan Mirasin Riskleri
* **Token Tuketimi ve Maliyet Asimi:** Ana oturum amiral gemisi yuksek maliyetli bir akil yurutme modeliyle calisirken, alt gorevlerin (ornek: regex ile dosya arama, linting, birim test kosumu) de ayni agir model tarafindan yurutulmesi token kotasinin hizla tukenmesine yol acar.
* **Gecikme (Latency):** Yuksek akil yurutme suresine sahip agir modeller, basit dosya okuma ve arama islemlerinde gereksiz islem gecikmesi olusturur.

---

## 3. Alt Ajanlara Farkli GPT Modellerinin Atanmasi

Codex CLI mimarisinde alt ajanlarin farkli GPT modelleriyle calismasini saglamak icin iki seviyeli bir yapilandirma duzeni bulunur.

### 3.1. Ajan Manifestolari (.codex/agents/)
Her alt ajan tipi icin bagimsiz bir `.toml` dosyasi tanimlanabilir. Bu dosyalar kullanici ev dizininde (`~/.codex/agents/`) veya repo kok dizininde (`.codex/agents/`) tutulur.

Manifesto ornegi (`.codex/agents/arastirmaci_ajan.toml`):

```toml
name = "arastirmaci_ajan"
description = "Kod tabaninda semantik arama, dosya okuma ve dokumantasyon tarama gorevlerini yuruten hafif alt ajan."
model = "gpt-5.6-luna"
model_reasoning_effort = "low"
sandbox_mode = "read-only"
developer_instructions = """
Sen yalnizca kod tabanini inceleyen ve bilgi toplayan yardimci bir ajansin.
Kod degisikligi yapma yetkin yoktur.
Bulgularini kisa, net ve teknik referanslarla ana ajana ilet.
"""
```

Manifesto ornegi (`.codex/agents/guvenlik_denetleyicisi.toml`):

```toml
name = "guvenlik_denetleyicisi"
description = "Derin guvenlik zafiyeti ve mantik hatasi analizi yapan uzman denetim ajani."
model = "gpt-5.6-terra"
model_reasoning_effort = "high"
sandbox_mode = "workspace-write"
developer_instructions = """
Gorevin kaynak kodda OWASP Top 10, yetkilendirme zaafiyetleri ve mantik hatalarini tespit etmektir.
Tespit edilen riskleri dogrulama kanitlariyla birlikte raporla.
"""
```

### 3.2. Global ve Proje Ayarlari (config.toml)
Sistem genelindeki multi-agent limitleri ve ajan dosya baglantilari `config.toml` dosyasinda belirlenir.

Yapilandirma ornegi (`~/.codex/config.toml` veya `.codex/config.toml`):

```toml
[features]
multi_agent = true

[agents]
max_threads = 6
max_depth = 1
max_concurrent_threads_per_session = 8

[agents.researcher]
config_file = "agents/arastirmaci_ajan.toml"
description = "Kod tabani kesiflerinde otomatik devreye giren hafif arastirma ajani."

[agents.security]
config_file = "agents/guvenlik_denetleyicisi.toml"
description = "Kod degisikliklerinin statik analizini yapan guvenlik ajani."
```

---

## 4. Yapilandirma Oncelik ve Cozumleme Sirasi (Precedence Order)

Codex calisma zamani yapilandirmayi asagidaki hiyerarsik sirayla cozumler:
1. **Global Varsayilanlar:** `~/.codex/config.toml` icerisindeki temel tanimlar.
2. **Profil Gecersiz Kilmalari:** CLI calistirilirken secilen `--profile <profil_adi>` dosyalari (`~/.codex/<profil_adi>.config.toml`).
3. **Proje Duzeyi Tanimlar:** Calisilan reponun kok dizinindeki `.codex/config.toml` ayarlari.
4. **Role Ozel Ajan Dosyalari:** `.codex/agents/*.toml` icerisindeki ozel ajan bildirimleri (burada belirtilen `model` degeri ana oturum mirasını ezer).
5. **Kural Yonergeleri:** `AGENTS.md` ve repoya ozgu prompt talimatlari.

---

## 5. Model Secim Stratejisi ve Maliyet Optimizasyonu

Orkestrasyon sureclerinde rollerin dogru modellerle eslestirilmesi verimliligi dogrudan belirler:

* **Ana Orkestrator (Root Coordinator):**
  * Rol: Gorev bolumlendirme, stratejik planlama, subagent yonetimi ve cozum sentezi.
  * Onerilen Model Sinifi: Amiral gemisi akil yurutme modelleri (ornegin Sol serisi).
  * Akil Yurutme Seviyesi: High.

* **Kesif ve Dokumantasyon Ajani (Explorer / Researcher):**
  * Rol: Dosya agaci tarama, grep/regex aramalari, bagimlilik analizi, semantik dokuman okuma.
  * Onerilen Model Sinifi: Hizli, dusuk maliyetli ve buyuk baglam pencereli modeller (ornegin Luna veya Mini sinifi).
  * Akil Yurutme Seviyesi: Low.
  * Tasarruf Orani: Token basina yuzde 70 ile 85 araliginda maliyet avantaji.

* **Uygulama ve Kodlama Ajani (Worker / Implementer):**
  * Rol: Belirlenen sinirlar dahilinde fonksiyon yazimi, refactoring ve birim test hazirligi.
  * Onerilen Model Sinifi: Orta segment dengeli modeller (ornegin Terra serisi).
  * Akil Yurutme Seviyesi: Medium.

* **Guvenlik ve Kod Inceleme Ajani (Reviewer / Auditor):**
  * Rol: Degisiklik kumelerinin statik analizi, yan etki kontrolu ve girdi dogrulama denetimleri.
  * Onerilen Model Sinifi: Analitik derinligi yuksek modeller (ornegin Terra veya Sol).
  * Akil Yurutme Seviyesi: High.

---

## 6. Etkilesimli CLI Komutlari ve Yonetim

Codex terminal oturumu sirasinda alt ajanlarin durumunu takip etmek ve yapilandirmayi dogrulamak icin kullanilan temel komutlar:
* `/subagents`: Arka planda aktif calisan is parcaciklarini, durumlarini ve atanan rolleri listeler.
* `/status`: Aktif oturumun bagli oldugu orkestrator modeli ve kaynak kullanimini goruntuler.
* `/debug-config`: Cozumlenen tum `config.toml` hiyerarsisini ve ajan manifestolarini ekrana basar.
* `/experimental`: Multi-agent ve sandbox ozelliklerinin calisma zamani durumunu degistirir.

---

## 7. Sonuclar ve Uygulama Yol Haritasi

1. **Varsayilan Durum:** Codex icinde baslatilan alt ajanlar varsayilan haliyle bagimsiz model secimi yapmaz; ana oturumun modelini kullanir.
2. **Yapilandirma Gereksinimi:** Alt ajanlarin daha ucuz veya amaca yonelik baska GPT modelleriyle calismasi icin `.codex/agents/*.toml` manifestolari olusturulmali ve `config.toml` uzerinden baglanmalidir.
3. **Maliyet ve Hiz Kazanci:** Kod arama ve basit dosya manipulasyonlari gibi alt gorevlerin hafif modellere (Luna vb.) delege edilmesi, token butcesini korurken orkestrasyon sureclerinin paralel hizini belirgin olcude artirir.
