/**
 * Alan bazlı yetki setleri — "kim neyi yapar" tek kaynaktan.
 *
 * Neden: her serviste geniş bir `STAFF` listesi kullanmak, personel içinde ayrım
 * bırakmıyordu (mali işler disiplin cezası verebiliyor, hoca sınav takvimi
 * değiştirebiliyordu). Aşağıdaki setler Türkiye yükseköğretim iş bölümünü
 * yansıtır ve YAZMA uçlarında kullanılır. Okuma uçları daha geniş olabilir.
 */

/** Her şeye yetkili çekirdek yönetim. */
export const CORE_ADMIN = ['oidb', 'sistem_yoneticisi'] as const;

/** Ders kataloğu, müfredat/öğretim planı, ders açma, seçmeli havuz, hafta/takvim. */
export const ACADEMIC_ADMIN = [
  'oidb',
  'sistem_yoneticisi',
  'bolum_baskani',
  'dekanlik',
  'koordinator',
] as const;

/** Sınav takvimi, mazeret sınavı, yoklama. Dersin hocası da planlayabilir. */
export const EXAM_ADMIN = [
  'oidb',
  'sistem_yoneticisi',
  'bolum_baskani',
  'dekanlik',
  'ogretim_elemani',
] as const;

/** Disiplin cezası ve soruşturma — dar tutulur (mali/hoca giremez). */
export const DISCIPLINE_ADMIN = ['oidb', 'sistem_yoneticisi', 'dekanlik', 'rektorluk'] as const;

/** Burs, harç, ödeme planı/taksit, iade, borç tipi. */
export const FINANCE_ADMIN = ['mali_isler', 'oidb', 'sistem_yoneticisi'] as const;

/** Bina/derslik tanımı, toplu derslik atama. */
export const FACILITIES_ADMIN = ['oidb', 'sistem_yoneticisi', 'fakulte_sekreteri'] as const;

/**
 * Öğrenci dosyası, danışman atama, dönem atlatma, kayıt işlemleri.
 * Danışman ataması pratikte bölüm başkanının işidir; dekanlık da yürütür.
 */
export const STUDENT_ADMIN = [
  'oidb',
  'sistem_yoneticisi',
  'fakulte_sekreteri',
  'bolum_baskani',
  'dekanlik',
] as const;

/** Başvuru/aday/ÖSYM/uluslararası/dil yeterlilik. */
export const ADMISSIONS_ADMIN = ['oidb', 'sistem_yoneticisi'] as const;

/** Tez süreci (TİK/jüri/savunma), doktora yeterlilik. */
export const GRADUATE_ADMIN = [
  'oidb',
  'sistem_yoneticisi',
  'dekanlik',
  'bolum_baskani',
  'danisman',
] as const;

/** Staj onayı / sigorta / defter / not. Danışman da yürütür. */
export const INTERNSHIP_ADMIN = [
  'oidb',
  'sistem_yoneticisi',
  'bolum_baskani',
  'dekanlik',
  'ogretim_elemani',
  'danisman',
] as const;

/** Yönetim kurulu kararları (YKK). */
export const GOVERNANCE_ADMIN = [
  'oidb',
  'sistem_yoneticisi',
  'dekanlik',
  'fakulte_sekreteri',
  'rektorluk',
] as const;

/** Program izleme, akreditasyon dosyası, düzeltici eylem. */
export const QUALITY_ADMIN = ['oidb', 'sistem_yoneticisi', 'koordinator', 'dekanlik'] as const;

/** PDR / sağlık / engelli destek — hassas kişisel veri, en dar set. */
export const WELLBEING_ADMIN = ['oidb', 'sistem_yoneticisi'] as const;

/** Geniş personel okuma seti (listeleme/görüntüleme uçları için). */
export const STAFF_READ = [
  'oidb',
  'sistem_yoneticisi',
  'dekanlik',
  'bolum_baskani',
  'koordinator',
  'fakulte_sekreteri',
  'mali_isler',
  'rektorluk',
  'danisman',
  'ogretim_elemani',
] as const;

export const hasRole = (roles: readonly string[] | undefined, allowed: readonly string[]): boolean =>
  (roles ?? []).some((r) => allowed.includes(r));
