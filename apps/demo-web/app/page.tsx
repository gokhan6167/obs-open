'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { currentRoles, login, roleHome } from '../lib/api';
import { useI18n, LangSwitch } from '../lib/i18n';
import { Icon, IconName } from './ui';

const DEMO_PASSWORD = 'Parola123!';

const DEMO: { role: string; email: string }[] = [
  { role: 'Öğrenci', email: 'ogrenci@example.edu' },
  { role: 'Öğretim Elemanı', email: 'hoca@example.edu' },
  { role: 'Danışman', email: 'danisman@example.edu' },
  { role: 'Bölüm Başkanı', email: 'baskan@example.edu' },
  { role: 'Koordinatör', email: 'koordinator@example.edu' },
  { role: 'Dekanlık', email: 'dekan@example.edu' },
  { role: 'Fakülte Sekreteri', email: 'sekreter@example.edu' },
  { role: 'Öğrenci İşleri', email: 'yonetim@example.edu' },
  { role: 'Mali İşler', email: 'mali@example.edu' },
  { role: 'Rektörlük', email: 'rektor@example.edu' },
  { role: 'Sistem Yöneticisi', email: 'sistem@example.edu' },
];

const FEATS: { ico: IconName; text: string }[] = [
  { ico: 'shield', text: 'PostgreSQL RLS ile kiracı-bazlı tam veri izolasyonu' },
  { ico: 'award', text: 'Mevzuata uyumlu GNO / mezuniyet / kurul motoru' },
  { ico: 'fileText', text: 'QR + doğrulama kodlu resmî e-belge üretimi' },
];

export default function LoginPage(): React.ReactElement {
  const router = useRouter();
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const roles = currentRoles();
    if (roles.length) router.replace(roleHome(roles));
  }, [router]);

  /** Ortak giriş: form gönderimi de demo tek-tık girişi de buradan geçer. */
  async function doLogin(mail: string, pass: string): Promise<void> {
    setErr('');
    setBusy(true);
    try {
      const roles = await login(mail.trim(), pass);
      router.replace(roleHome(roles));
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('Giriş başarısız'));
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    await doLogin(email, password);
  }

  /**
   * Demo hesabı: alanları doldur VE doğrudan giriş yap. Sadece state doldurmak
   * yetmiyordu — tarayıcının kayıtlı parola otomatik doldurması araya girip
   * değerleri eziyordu (401). Tek tık ile doğru kimlikle giriş yapılır.
   */
  async function demoLogin(mail: string): Promise<void> {
    setEmail(mail);
    setPassword(DEMO_PASSWORD);
    await doLogin(mail, DEMO_PASSWORD);
  }

  return (
    <div className="login-wrap">
      <LangSwitch className="btn" style={{ position: 'fixed', top: 16, right: 16, zIndex: 10, height: 34 }} />
      <aside className="login-hero">
        <div className="lh-logo">
          <span className="logo">O</span> OBS · Demo
        </div>
        <div>
          <h2>{t('Üniversite Öğrenci Bilgi Sistemi')}</h2>
          <p className="lead">
            {t('Çok kiracılı, mevzuata uyumlu, uçtan uca güvenli. Öğrenciden rektörlüğe 11 rolün tek platformda buluştuğu modern OBS.')}
          </p>
          <div className="lh-feats">
            {FEATS.map((f, i) => (
              <div className="lh-feat" key={i}>
                <span className="lf-ico"><Icon name={f.ico} size={16} /></span>
                {t(f.text)}
              </div>
            ))}
          </div>
        </div>
        <div className="lh-foot">{t('Canlı demo · sentetik veri · gerçek API')}</div>
      </aside>

      <div className="login-panel">
        <form className="login-card" onSubmit={submit}>
          <h1>{t('Tekrar hoş geldiniz')}</h1>
          <p className="sub">{t('Kurumsal hesabınızla güvenli giriş yapın.')}</p>
          {err && <div className="alert err"><Icon name="alert" size={17} className="a-ico" /><div>{err}</div></div>}
          <div className="field">
            <label htmlFor="e">{t('E-posta')}</label>
            {/* autoComplete kapalı: tarayıcının kayıtlı kimlik doldurması demo
                hesap seçimini eziyor ve yanlış kimlikle 401'e yol açıyordu. */}
            <input id="e" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ad@example.edu" required autoComplete="off" />
          </div>
          <div className="field">
            <label htmlFor="p">{t('Parola')}</label>
            <input id="p" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required autoComplete="off" />
          </div>
          <button className="btn primary block" type="submit" disabled={busy}>
            {busy ? t('Giriş yapılıyor…') : <>{t('Giriş yap')} <Icon name="arrowRight" size={16} /></>}
          </button>

          <div className="demo-accounts">
            <b>{t('Demo hesapları')}</b> — {t('parola')}: <b>{DEMO_PASSWORD}</b> · {t('tıklayınca')} <b>{t('doğrudan giriş')}</b>
            <div className="demo-grid">
              {DEMO.map((d) => (
                <button type="button" key={d.email} disabled={busy} onClick={() => void demoLogin(d.email)}>
                  <span className="dg-role">{t(d.role)}</span>
                  <span className="dg-mail">{d.email}</span>
                </button>
              ))}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
