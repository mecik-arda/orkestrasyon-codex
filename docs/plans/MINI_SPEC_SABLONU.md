# Mini-Spec Şablonu

Bu şablon orta karmaşıklıktaki veya güvenlik etkisi olan değişikliklerden önce kullanılır. Küçük, tek dosyalı ve doğrudan doğrulanabilir değişikliklerde zorunlu değildir.

```markdown
# Değişiklik Başlığı

Durum: taslak | onaylandi | uygulandi | reddedildi
Amaç:

## Mevcut Davranış

## Hedef Davranış

## Değişecek Dosyalar

-

## Kapsam Dışı

-

## Güvenlik Ve Uyumluluk Sınırları

-

## Kabul Kriterleri

-

## Doğrulama

- Test komutları:
- Manuel kontroller:

## Bağımlılıklar Ve Açık Sorular
```

Mini-spec, implementer'a yalnız onaylanmış hedef dosyalar, gerekli kısa bağlam ve kabul kriterleriyle birlikte verilir. Subagent sonucu kanıt sayılmaz; ana orkestratör diff'i inceler ve testleri çalıştırır.

Spec, mevcut trusted workspace, allowed root, read-only/edit mode, disposable workspace, secret tarama, redacted audit ve provider routing sözleşmelerini gevşetemez.
