'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { currentRoles, decodeToken, getToken, logout } from '../lib/api';
import { useI18n, LangSwitch } from '../lib/i18n';

const ROLE_TR: Record<string, string> = {
  ogrenci: 'Öğrenci',
  ogretim_elemani: 'Öğretim Elemanı',
  danisman: 'Danışman',
  oidb: 'Öğrenci İşleri',
  sistem_yoneticisi: 'Sistem Yöneticisi',
  dekanlik: 'Dekanlık',
};
export const roleLabel = (r: string): string => ROLE_TR[r] ?? r;

function TopBar(): React.ReactElement {
  const router = useRouter();
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [roles, setRoles] = useState<string[]>([]);
  useEffect(() => {
    const t = getToken();
    const p = t ? decodeToken(t) : null;
    setRoles(p?.roles ?? []);
    // email JWT'de yok; portal/me'den gelmese de rol etiketini gösteririz.
    setEmail('');
  }, []);
  return (
    <div className="topbar">
      <span className="brand">OBS · Demo</span>
      <div className="who">
        <LangSwitch />
        <span>{roles.map((r) => t(roleLabel(r))).join(', ')}</span>
        <button
          onClick={() => {
            logout();
            router.push('/');
          }}
        >
          {t('Çıkış')}
        </button>
      </div>
    </div>
  );
}

/**
 * Rol korumalı kabuk: token yoksa /'a atar; izinli roller verilmişse ve aktörde
 * yoksa ilgili panele yönlendirir. Yüklenene kadar boş döner (flash önlenir).
 */
export function Shell({
  allow,
  children,
}: {
  allow: string[];
  children: React.ReactNode;
}): React.ReactElement | null {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const roles = currentRoles();
    if (roles.length === 0) {
      router.replace('/');
      return;
    }
    if (allow.length && !roles.some((r) => allow.includes(r))) {
      router.replace('/');
      return;
    }
    setReady(true);
  }, [allow, router]);
  if (!ready) return null;
  return (
    <>
      <TopBar />
      <main className="container">{children}</main>
    </>
  );
}
