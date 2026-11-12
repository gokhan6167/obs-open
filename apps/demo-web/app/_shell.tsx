'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { currentRoles, logout, rolePanels } from '../lib/api';
import { useI18n, LangSwitch } from '../lib/i18n';
import { Icon, IconName, Toaster } from './ui';

export interface ShellMenuItem {
  href: string;
  label: string;
}
export interface ShellMenuGroup {
  grup: string;
  items: ShellMenuItem[];
}
export interface RoleShellProps {
  /** Topbar'da görünen başlık, örn. "OBS · Demo — Bölüm Başkanı". */
  title: string;
  /** .grp ile gruplanmış sol menü. */
  menu: ShellMenuGroup[];
  /** İzinli rol anahtarları; kullanıcının rolleri ile kesişmezse ana sayfaya at. */
  allow: string[];
  children: React.ReactNode;
}

/**
 * Menü etiketine göre ikon seç. Eşleme href ÖNCELİKLİ (en ayırt edici),
 * sonra etiket; anahtarlar UZUNDAN KISAYA denenir ki "ders" gibi genel bir
 * kelime "ders-katalogu"/"ders-acma" gibi özel maddeleri gölgelemesin.
 */
const ICON_MAP: [string, IconName][] = [
  // --- yol (href) bazlı özel eşlemeler ---
  ['ders-katalogu', 'book'], ['ders-acma-detay', 'calendar'], ['ders-acma', 'layers'],
  ['ogretim-plani', 'fileText'], ['mufredat-ders', 'layers'], ['secmeli-havuz', 'grid'],
  ['akademik-yapi', 'building'], ['akademik-takvim', 'calendar'], ['hafta-tanimlama', 'calendar'],
  ['sinav-takvimi', 'clock'], ['not-giris-takip', 'activity'], ['toplu-derslik', 'grid'],
  ['derslik', 'building'], ['odeme-plani', 'wallet'], ['iade-talepleri', 'refresh'],
  ['harc-yonetim', 'money'], ['harc', 'money'], ['burs', 'award'],
  ['danisman-atama', 'users'], ['donem-atlatma', 'arrowUp'], ['ogrenci-dosya', 'file'],
  ['detayli-arama', 'search'], ['ogrenci-talepleri', 'inbox'], ['cozum-merkezi', 'info'],
  ['onay-kuyrugum', 'checkCircle'], ['onay-akislari', 'layers'], ['onay-izleme', 'activity'],
  ['tez-sureci', 'award'], ['tez-onay', 'checkCircle'], ['yeterlilik', 'target'],
  ['staj', 'briefcase'], ['coop', 'briefcase'], ['kismi-zamanli', 'clock'],
  ['pdr', 'user'], ['engelli-destek', 'shield'], ['saglik', 'activity'],
  ['oryantasyon', 'flag'], ['kutuphane', 'book'], ['kulupler', 'users'],
  ['degisim', 'refresh'], ['mezunlar', 'award'], ['mezuniyet-diploma', 'award'],
  ['diploma-basim', 'fileText'], ['sorusturma', 'shield'], ['disiplin', 'alert'],
  ['program-izleme', 'chart'], ['rapor-merkezi', 'chart'], ['liste-raporlari', 'fileText'],
  ['yuzde-on', 'target'], ['basvuru', 'inbox'], ['aday-degerlendirme', 'users'],
  ['osym-kayit', 'checkCircle'], ['dil-hazirlik', 'book'], ['uluslararasi', 'target'],
  ['dis-servisler', 'link'], ['e-imza', 'edit'], ['entegrasyonlar', 'settings'],
  ['bildirim-loglari', 'bell'], ['yoksis', 'refresh'], ['ykk', 'building'],
  ['anketler', 'fileText'], ['degerlendirme', 'target'], ['mesajlar', 'mail'],
  ['gno-simulasyon', 'activity'], ['slotlar', 'layers'], ['senaryo', 'activity'],
  ['ortalamalar', 'chart'], ['alinan-dersler', 'book'], ['ders-secme', 'check'],
  ['dersten-cekilme', 'x'], ['kayit-dondurma', 'clock'], ['ilisik-kesme', 'logout'],
  ['ucret-iadesi', 'wallet'], ['belge-talep', 'file'], ['belge-onay', 'checkCircle'],
  ['ozluk', 'user'], ['parola', 'shield'], ['butunleme', 'grade'], ['disiplinim', 'alert'],
  ['not-sistemi', 'settings'], ['intibak', 'refresh'], ['ogrenci-ders', 'book'],
  ['kayit-istatistik', 'chart'], ['toplu-islemler', 'layers'], ['foto-onay', 'eye'],
  // --- genel (etiket) eşlemeleri ---
  ['bilgi paket', 'book'], ['genel bak', 'grid'], ['içe aktar', 'upload'],
  ['transkript', 'fileText'], ['mezuniyet', 'award'], ['devamsız', 'clock'],
  ['parametre', 'settings'], ['kontenjan', 'grid'], ['mutabakat', 'refresh'],
  ['dashboard', 'grid'], ['kullanıc', 'users'], ['akredit', 'shield'],
  ['müfredat', 'layers'], ['öğrenci', 'users'], ['dağılım', 'chart'],
  ['gündem', 'calendar'], ['takvim', 'calendar'], ['denetim', 'shield'],
  ['fatura', 'fileText'], ['yandal', 'link'], ['tahsil', 'money'],
  ['matris', 'grid'], ['rapor', 'fileText'], ['bugün', 'home'],
  ['kuyruk', 'inbox'], ['danış', 'user'], ['audit', 'shield'],
  ['excel', 'upload'], ['düzelt', 'edit'], ['içerik', 'book'],
  ['talep', 'inbox'], ['kurul', 'building'], ['borç', 'wallet'],
  ['çıkt', 'target'], ['özet', 'chart'], ['onay', 'checkCircle'],
  ['pano', 'grid'], ['şube', 'grid'], ['mali', 'money'], ['izle', 'activity'],
  ['not', 'grade'], ['çap', 'link'], ['kpi', 'activity'], ['ara', 'search'],
  ['ders', 'book'], ['program', 'calendar'],
];

function iconFor(item: ShellMenuItem): IconName {
  const href = item.href.toLowerCase();
  const label = item.label.toLowerCase();
  for (const [k, ic] of ICON_MAP) if (href.includes(k)) return ic;
  for (const [k, ic] of ICON_MAP) if (label.includes(k)) return ic;
  return 'chevronRight';
}

function useTheme(): [string, () => void] {
  const [theme, setTheme] = useState('light');
  useEffect(() => {
    const t = document.documentElement.dataset.theme || localStorage.getItem('obs_theme') || 'light';
    setTheme(t);
  }, []);
  const toggle = (): void => {
    setTheme((cur) => {
      const next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem('obs_theme', next); } catch { /* noop */ }
      return next;
    });
  };
  return [theme, toggle];
}

// Metinler Türkçe kaynak; ekranda t() ile çevrilir (lib/en.ts).
const DEMO_NOTIFS = [
  { ico: 'checkCircle' as IconName, title: 'Ders kayıt onayınız tamamlandı', meta: 'Danışman · 2 saat önce' },
  { ico: 'money' as IconName, title: 'Dönem taksidi son ödeme yaklaşıyor', meta: 'Mali İşler · dün' },
  { ico: 'bell' as IconName, title: 'Akademik takvim güncellendi', meta: 'ÖİDB · 2 gün önce' },
];

export function RoleShell({ title, menu, allow, children }: RoleShellProps): React.ReactElement | null {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useI18n();
  const [ready, setReady] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [openMenu, setOpenMenu] = useState<'notif' | 'user' | null>(null);
  const [q, setQ] = useState('');
  const [theme, toggleTheme] = useTheme();
  // Kullanıcının yetkili olduğu tüm paneller (çok rollü kullanıcı desteği).
  const [panels, setPanels] = useState<{ role: string; href: string; label: string }[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const roles = currentRoles();
    if (!roles.some((r) => allow.includes(r))) {
      router.replace('/');
      return;
    }
    setPanels(rolePanels(roles));
    setReady(true);
  }, [router, allow]);

  useEffect(() => { setDrawer(false); setOpenMenu(null); setQ(''); }, [pathname]);

  useEffect(() => {
    const h = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === 'Escape') setOpenMenu(null);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const [brand, roleName] = useMemo(() => {
    const parts = title.split('—');
    return [parts[0]?.trim() ?? 'OBS · Demo', parts[1]?.trim() ?? ''];
  }, [title]);

  const allItems = useMemo(() => menu.flatMap((g) => g.items), [menu]);
  const results = useMemo(() => {
    if (!q.trim()) return [];
    const s = q.toLowerCase();
    return allItems
      .filter((it) => it.label.toLowerCase().includes(s) || t(it.label).toLowerCase().includes(s))
      .slice(0, 6);
  }, [q, allItems, t]);

  const crumb = useMemo(() => {
    for (const g of menu) for (const it of g.items) if (it.href === pathname) return { grup: g.grup, label: it.label };
    return null;
  }, [menu, pathname]);
  const homeHref = menu[0]?.items[0]?.href ?? '/';

  if (!ready) return null;

  return (
    <>
      <header className="topbar">
        {/* Mobilde drawer açar/kapatır, masaüstünde sidebar'ı daraltır. */}
        <button
          className="icon-btn menu-toggle"
          onClick={() => {
            if (window.matchMedia('(max-width: 860px)').matches) setDrawer((d) => !d);
            else setCollapsed((c) => !c);
          }}
          aria-label={t('Menüyü aç/kapat')}
        >
          <Icon name="menu" />
        </button>
        <span className="brand">
          <span className="logo">O</span>
          <span>OBS<span className="sub-brand"> · Demo</span></span>
        </span>

        <div className="topsearch">
          <Icon name="search" size={16} />
          <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Menüde ara…')} aria-label={t('Ara')} />
          <kbd>⌘K</kbd>
          {results.length > 0 && (
            <div className="dropdown">
              {results.map((it) => (
                <Link key={it.href} href={it.href} className="dd-item" onClick={() => setQ('')}>
                  <Icon name={iconFor(it)} size={16} className="d-ico" />
                  <div className="d-title">{t(it.label)}</div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="spacer" />

        <div className="who" style={{ position: 'relative' }}>
          <LangSwitch className="icon-btn" />
          <span className="tag-live" title={t('Canlı API')}>{t('canlı')}</span>
          <button className="icon-btn" onClick={toggleTheme} aria-label={t('Tema')}><Icon name={theme === 'dark' ? 'sun' : 'moon'} /></button>
          <button className="icon-btn" onClick={() => setOpenMenu((m) => m === 'notif' ? null : 'notif')} aria-label={t('Bildirimler')}>
            <Icon name="bell" /><span className="dot" />
          </button>
          {openMenu === 'notif' && (
            <div className="dropdown" style={{ right: 90 }}>
              <div className="dd-head">{t('Bildirimler')} <span className="badge info no-dot">{DEMO_NOTIFS.length}</span></div>
              {DEMO_NOTIFS.map((n, i) => (
                <div className="dd-item" key={i}>
                  <Icon name={n.ico} size={17} className="d-ico" />
                  <div><div className="d-title">{t(n.title)}</div><div className="d-meta">{t(n.meta)}</div></div>
                </div>
              ))}
            </div>
          )}
          <button className="userchip" onClick={() => setOpenMenu((m) => m === 'user' ? null : 'user')}>
            <span className="avatar">{(t(roleName) || 'K')[0]}</span>
            <span className="stack"><span className="u-name">{roleName ? t(roleName) : t('Kullanıcı')}</span><span className="u-role">Demo</span></span>
            <Icon name="chevronDown" size={15} style={{ color: 'var(--muted)' }} />
          </button>
          {openMenu === 'user' && (
            <div className="dropdown" style={{ right: 0, width: 260 }}>
              <div className="dd-head">{roleName ? t(roleName) : t('Kullanıcı')}</div>
              {/* Çok rollü kullanıcı (ör. öğretim elemanı + bölüm başkanı):
                  yetkisi olan tüm panellere buradan geçer. */}
              {panels.length > 1 && (
                <>
                  <div className="dd-head" style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>
                    {t('Panel değiştir')} ({panels.length} {t('yetki')})
                  </div>
                  {panels.map((p) => {
                    const active = pathname === p.href || pathname.startsWith(p.href + '/');
                    return (
                      <Link key={p.href} href={p.href} className="dd-item" onClick={() => setOpenMenu(null)}>
                        <Icon name={active ? 'checkCircle' : 'grid'} size={16} className="d-ico" />
                        <div>
                          <div className="d-title" style={active ? { color: 'var(--accent)' } : undefined}>
                            {t(p.label)}
                          </div>
                          {active && <div className="d-meta">{t('şu an buradasınız')}</div>}
                        </div>
                      </Link>
                    );
                  })}
                </>
              )}
              <div className="dd-item" onClick={toggleTheme}><Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} className="d-ico" /><div className="d-title">{theme === 'dark' ? t('Açık tema') : t('Koyu tema')}</div></div>
              <div className="dd-item" onClick={() => { logout(); router.push('/'); }}><Icon name="logout" size={16} className="d-ico" /><div className="d-title">{t('Çıkış yap')}</div></div>
            </div>
          )}
        </div>
      </header>

      <div className={`drawer-scrim ${drawer ? 'show' : ''}`} onClick={() => setDrawer(false)} />
      <div className="shell">
        <nav className={`sidebar ${drawer ? 'open' : ''} ${collapsed ? 'collapsed' : ''}`} aria-label={t('Menü')}>
          {menu.map((g) => (
            <div key={g.grup}>
              <div className="grp">{t(g.grup)}</div>
              {g.items.map((it) => (
                <Link key={it.href} href={it.href} className={pathname === it.href ? 'active' : ''}>
                  <Icon name={iconFor(it)} size={18} className="nav-ico" />
                  {t(it.label)}
                </Link>
              ))}
            </div>
          ))}
          <div className="side-foot">
            <b>{roleName ? t(roleName) : t('Portal')}</b><br />
            {t('Canlı demo · sentetik veri.')}<br />{t("Tüm işlemler gerçek OBS API'sine bağlıdır.")}
          </div>
        </nav>

        <main className="content">
          <div className="content-inner">
            <div className="crumbs">
              <Link href={homeHref}>{t(brand.replace('OBS · Demo', 'Ana Sayfa'))}</Link>
              {roleName && <><span className="sep">/</span><Link href={homeHref}>{t(roleName)}</Link></>}
              {crumb && pathname !== homeHref && <><span className="sep">/</span><span className="cur">{t(crumb.label)}</span></>}
            </div>
            {children}
          </div>
        </main>
      </div>
      <Toaster />
    </>
  );
}
