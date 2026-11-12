'use client';
import { RoleShell } from '../_shell';

const MENU = [
  {
    grup: 'Genel',
    items: [{ href: '/oidb', label: 'Dashboard' }],
  },
  {
    grup: 'Öğrenci',
    items: [
      { href: '/oidb/ogrenciler', label: 'Öğrenci Arama & 360' },
      { href: '/oidb/ogrenci-dosya', label: 'Öğrenci Dosyası (İzin/Askerlik/Belge)' },
      { href: '/oidb/danisman-atama', label: 'Danışman Atama' },
      { href: '/oidb/donem-atlatma', label: 'Dönem Atlatma' },
      { href: '/oidb/disiplin', label: 'Disiplin İşlemleri' },
      { href: '/oidb/sorusturma', label: 'Disiplin Soruşturma' },
      { href: '/oidb/detayli-arama', label: 'Detaylı Öğrenci Arama' },
    ],
  },
  {
    grup: 'Başvuru & Kayıt',
    items: [
      { href: '/oidb/basvuru', label: 'Başvuru Yönetimi' },
      { href: '/oidb/aday-degerlendirme', label: 'Aday Değerlendirme & Sıralama' },
      { href: '/oidb/dil-hazirlik', label: 'Dil Yeterlilik / Hazırlık' },
      { href: '/oidb/uluslararasi', label: 'Uluslararası Kabul' },
      { href: '/oidb/dis-servisler', label: 'Dış Servisler (MERNİS/ÖSYM)' },
      { href: '/oidb/osym-kayit', label: 'ÖSYM Kesin Kayıt' },
      { href: '/oidb/mezuniyet-diploma', label: 'Mezuniyet & Diploma' },
      { href: '/oidb/diploma-basim', label: 'Diploma Basımı & Defteri' },
    ],
  },
  {
    grup: 'Tanımlar',
    items: [
      { href: '/oidb/derslik', label: 'Derslik Tanımlama' },
      { href: '/oidb/akademik-takvim', label: 'Akademik Takvim' },
      { href: '/oidb/hafta-tanimlama', label: 'Hafta Tanımlama' },
      { href: '/oidb/not-sistemi', label: 'Not Sistemi & Harf Notu' },
      { href: '/oidb/not-sistemi-tanim', label: 'Not Sistemi Tanımlama' },
      { href: '/oidb/foto-onay', label: 'Fotoğraf Onayı' },
    ],
  },
  {
    grup: 'Ders & Müfredat',
    items: [
      { href: '/oidb/ders-acma', label: 'Ders Açma / Şube' },
      { href: '/oidb/ders-acma-detay', label: 'Ders Açma Detay (Program/Hoca)' },
      { href: '/oidb/mufredat-ders', label: 'Müfredata Ders & Ön Koşul' },
      { href: '/oidb/ders-katalogu', label: 'Ders Kataloğu' },
      { href: '/oidb/secmeli-havuz', label: 'Seçmeli Ders Havuzu' },
      { href: '/oidb/ogretim-plani', label: 'Öğretim Planı' },
      { href: '/oidb/ogrenci-ders', label: 'Öğrenci-Ders Yönetimi' },
      { href: '/oidb/intibak', label: 'İntibak / Muaf / Transfer' },
      { href: '/oidb/not-giris-takip', label: 'Not Giriş Süreç Takibi' },
      { href: '/oidb/toplu-derslik', label: 'Toplu Derslik Atama' },
      { href: '/oidb/kayit-istatistik', label: 'Kayıtlanma İstatistikleri' },
    ],
  },
  {
    grup: 'Sınav & Kurul',
    items: [
      { href: '/oidb/sinav-takvimi', label: 'Sınav Takvimi & Mazeret' },
      { href: '/oidb/ykk', label: 'Yönetim Kurulu Kararları' },
    ],
  },
  {
    grup: 'İletişim',
    items: [
      { href: '/oidb/mesajlar', label: 'Mesajlar' },
      { href: '/oidb/anketler', label: 'Anketler' },
      { href: '/oidb/degerlendirme', label: 'Değerlendirme Formları' },
    ],
  },
  {
    grup: 'Mali',
    items: [
      { href: '/oidb/burs', label: 'Burs İşlemleri' },
      { href: '/oidb/harc', label: 'Harç İşlemleri' },
      { href: '/oidb/harc-yonetim', label: 'Harç Yönetimi (Tutar/Borç)' },
      { href: '/oidb/odeme-plani', label: 'Ödeme Planı / Taksit' },
      { href: '/oidb/iade-talepleri', label: 'Ücret İade Talepleri' },
    ],
  },
  {
    grup: 'Rapor & Toplu',
    items: [
      { href: '/oidb/raporlar', label: 'Raporlar & İstatistikler' },
      { href: '/oidb/rapor-merkezi', label: 'Rapor Merkezi (İstatistik)' },
      { href: '/oidb/program-izleme', label: 'Program İzleme & Akreditasyon' },
      { href: '/oidb/liste-raporlari', label: 'Liste Raporları' },
      { href: '/oidb/yuzde-on', label: '%10\'a Giren Tespiti' },
      { href: '/oidb/toplu-islemler', label: 'Toplu İşlemler' },
    ],
  },
  {
    grup: 'İş Kuyruğu',
    items: [
      { href: '/oidb/talepler', label: 'Talep Kuyruğu' },
      { href: '/oidb/ogrenci-talepleri', label: 'Öğrenci Talepleri (Çekilme/Dondurma/İade)' },
      { href: '/oidb/onay-kuyrugum', label: 'Onay Kuyruğum (Akış)' },
      { href: '/oidb/onay-akislari', label: 'Onay Akışı Tanımlama' },
      { href: '/oidb/cozum-merkezi', label: 'Çözüm Merkezi Kuyruğu' },
      { href: '/oidb/tez-onay', label: 'Tez / Proje Onay' },
      { href: '/oidb/tez-sureci', label: 'Tez Süreci (TİK/Jüri/Savunma)' },
      { href: '/oidb/yeterlilik', label: 'Doktora Yeterlilik' },
      { href: '/oidb/staj', label: 'Staj Yönetimi' },
      { href: '/oidb/coop', label: 'CO-OP / Kariyer' },
      { href: '/oidb/belge-onay', label: 'Belge Talep Onay' },
      { href: '/oidb/cap', label: 'ÇAP / Yandal Kuyruğu' },
      { href: '/oidb/mezuniyet', label: 'Mezuniyet & Belge' },
    ],
  },
  {
    grup: 'Öğrenci Yaşamı',
    items: [
      { href: '/oidb/kulupler', label: 'Kulüp Yönetimi' },
      { href: '/oidb/kismi-zamanli', label: 'Kısmi Zamanlı Çalışma' },
      { href: '/oidb/pdr', label: 'PDR (Psikolojik Danışmanlık)' },
      { href: '/oidb/engelli-destek', label: 'Engelli Öğrenci Desteği' },
      { href: '/oidb/oryantasyon', label: 'Oryantasyon' },
      { href: '/oidb/saglik', label: 'Sağlık (Mediko)' },
      { href: '/oidb/kutuphane', label: 'Kütüphane Ödünç/Borç' },
      { href: '/oidb/degisim', label: 'Değişim Hareketliliği' },
      { href: '/oidb/mezunlar', label: 'Mezun (Alumni)' },
    ],
  },
  {
    grup: 'Entegrasyon',
    items: [
      { href: '/oidb/yoksis', label: 'YÖKSİS Bildirim' },
      { href: '/oidb/yoksis-aktarim', label: 'YÖKSİS Veri Aktarım' },
      { href: '/oidb/yoksis-asal', label: 'YÖKSİS / ASAL Aktarım' },
      { href: '/oidb/e-imza', label: 'E-İmza / EBYS Akışı' },
      { href: '/oidb/entegrasyonlar', label: 'Entegrasyon Konsolu' },
      { href: '/oidb/bildirim-loglari', label: 'Bildirim Logları (SMS/E-posta)' },
    ],
  },
];

export default function OidbLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement | null {
  return (
    <RoleShell
      title="OBS · Demo — Öğrenci İşleri (ÖİDB)"
      allow={['oidb', 'sistem_yoneticisi']}
      menu={MENU}
    >
      {children}
    </RoleShell>
  );
}
