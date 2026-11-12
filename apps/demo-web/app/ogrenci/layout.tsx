'use client';
import { RoleShell } from '../_shell';

const MENU = [
  {
    grup: 'Genel',
    items: [
      { href: '/ogrenci', label: 'Bugün' },
      { href: '/ogrenci/ozluk', label: 'Özlük Bilgilerim' },
    ],
  },
  {
    grup: 'Akademik',
    items: [
      { href: '/ogrenci/program', label: 'Ders Programım' },
      { href: '/ogrenci/alinan-dersler', label: 'Alınan Dersler' },
      { href: '/ogrenci/mufredat', label: 'Program Dersleri (Müfredat)' },
      { href: '/ogrenci/notlar', label: 'Notlarım & Transkript' },
      { href: '/ogrenci/ortalamalar', label: 'Dönem Ortalamaları' },
      { href: '/ogrenci/senaryo', label: 'Transkript Senaryosu' },
      { href: '/ogrenci/devamsizlik', label: 'Devamsızlık' },
    ],
  },
  {
    grup: 'İşlemlerim',
    items: [
      { href: '/ogrenci/ders-secme', label: 'Ders Kayıt' },
      { href: '/ogrenci/talepler', label: 'Taleplerim' },
      { href: '/ogrenci/belge-talep', label: 'Belge Talebi' },
      { href: '/ogrenci/cap-yandal', label: 'ÇAP / Yandal' },
      { href: '/ogrenci/mali', label: 'Mali Durum (Harç)' },
      { href: '/ogrenci/odeme-planim', label: 'Ödeme Planım / Taksitler' },
    ],
  },
  {
    grup: 'Başvuru & Talep',
    items: [
      { href: '/ogrenci/dersten-cekilme', label: 'Dersten Çekilme (W)' },
      { href: '/ogrenci/kayit-dondurma', label: 'Kayıt Dondurma Talebi' },
      { href: '/ogrenci/ilisik-kesme', label: 'İlişik Kesme Talebi' },
      { href: '/ogrenci/ucret-iadesi', label: 'Ücret İadesi Talebi' },
      { href: '/ogrenci/tez-proje', label: 'Tez / Proje Konusu' },
      { href: '/ogrenci/tez-surecim', label: 'Tez Sürecim (TİK/Savunma)' },
      { href: '/ogrenci/stajim', label: 'Stajım' },
      { href: '/ogrenci/coop', label: 'CO-OP Başvurum' },
      { href: '/ogrenci/gno-simulasyon', label: 'GNO Simülasyonu' },
      { href: '/ogrenci/slotlar', label: 'Mezuniyet İlerlemesi' },
      { href: '/ogrenci/butunleme', label: 'Bütünleme Sınavları' },
      { href: '/ogrenci/disiplinim', label: 'Disiplin Durumum' },
    ],
  },
  {
    grup: 'Öğrenci Yaşamı',
    items: [
      { href: '/ogrenci/kulupler', label: 'Kulüpler' },
      { href: '/ogrenci/kismi-zamanli', label: 'Kısmi Zamanlı İş' },
      { href: '/ogrenci/pdr-randevu', label: 'PDR Randevu' },
      { href: '/ogrenci/kutuphanem', label: 'Kütüphane Durumum' },
      { href: '/ogrenci/degisim', label: 'Değişim (Erasmus)' },
    ],
  },
  {
    grup: 'İletişim',
    items: [
      { href: '/ogrenci/mesajlar', label: 'Mesajlar' },
      { href: '/ogrenci/anketler', label: 'Anketler' },
      { href: '/ogrenci/cozum-merkezi', label: 'Çözüm Merkezi' },
    ],
  },
];

export default function OgrenciLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement | null {
  return (
    <RoleShell title="OBS · Demo — Öğrenci" allow={['ogrenci']} menu={MENU}>
      {children}
    </RoleShell>
  );
}
