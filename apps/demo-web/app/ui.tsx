'use client';
/* ============================================================================
   OBS · Paylaşılan UI Kütüphanesi
   Premium Kurumsal design system'in React bileşenleri + ikon seti.
   Sayfalarda: import { PageHeader, Card, StatGrid, DataTable, Icon, ... } from '@/app/ui'
   ============================================================================ */
import React, { useEffect, useMemo, useState } from 'react';

/* ----------------------------- İKON SETİ ----------------------------- */
const P: Record<string, string> = {
  home: 'M3 10.5 12 3l9 7.5M5 9.5V21h5v-6h4v6h5V9.5',
  grade: 'M4 19V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v14M8 8h8M8 12h8M8 16h5',
  book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5ZM19 3v18',
  calendar: 'M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6ZM4 9h16M8 3v4M16 3v4',
  money: 'M12 3v18M8 7h5a2.5 2.5 0 0 1 0 5H9a2.5 2.5 0 0 0 0 5h6',
  wallet: 'M3 7a2 2 0 0 1 2-2h12v3M3 7v10a2 2 0 0 0 2 2h14v-4M3 7h16v4h-4a2 2 0 0 0 0 4h4',
  inbox: 'M4 13h4l1.5 3h5L20 13h0M4 13V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7M4 13v5a2 2 0 0 1 2 2h12a2 2 0 0 1 2-2v-5',
  users: 'M17 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM22 20v-2a4 4 0 0 0-3-3.87M16 3.5a3.5 3.5 0 0 1 0 7',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  check: 'M20 6 9 17l-5-5',
  checkCircle: 'M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 6v6l4 2',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.3-4.3',
  chart: 'M3 3v18h18M7 15l3-3 3 3 5-6',
  pie: 'M21.2 15.9A10 10 0 1 1 8.1 2.8M22 12A10 10 0 0 0 12 2v10z',
  layers: 'm12 2 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 17l9 5 9-5',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z',
  award: 'M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12ZM8.2 13.9 7 22l5-3 5 3-1.2-8.1',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6ZM14 2v6h6',
  fileText: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6ZM14 2v6h6M9 13h6M9 17h6M9 9h1',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-2.82 1.17V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15H4.5a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 6 9.4l-.33-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 12 4.6V4.5a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 2.82 1.17l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 12',
  flag: 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1ZM4 22v-7',
  activity: 'M22 12h-4l-3 9L9 3l-3 9H2',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z',
  menu: 'M3 12h18M3 6h18M3 18h18',
  x: 'M18 6 6 18M6 6l12 12',
  chevronRight: 'm9 18 6-6-6-6',
  chevronDown: 'm6 9 6 6 6-6',
  arrowRight: 'M5 12h14M12 5l7 7-7 7',
  arrowUp: 'M12 19V5M5 12l7-7 7 7',
  arrowDown: 'M12 5v14M19 12l-7 7-7-7',
  alert: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 16v-4M12 8h.01',
  building: 'M3 21h18M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M9 7h.01M9 11h.01M9 15h.01M13 7h.01M13 11h.01M13 15h.01M17 21V9h2a2 2 0 0 1 2 2v10',
  filter: 'M22 3H2l8 9.5V19l4 2v-8.5L22 3Z',
  refresh: 'M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  link: 'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1',
  target: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12ZM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  mail: 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2ZM22 6l-10 7L2 6',
  edit: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z',
  briefcase: 'M4 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2ZM9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M2 12h20',
};

export type IconName = keyof typeof P;
export function Icon({ name, size = 18, className, style }: { name: IconName | string; size?: number; className?: string; style?: React.CSSProperties }): React.ReactElement {
  const d = P[name] ?? P.info;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden="true">
      {d.split('M').filter(Boolean).map((seg, i) => <path key={i} d={'M' + seg} />)}
    </svg>
  );
}

/* ----------------------------- YARDIMCILAR ----------------------------- */
export const money = (kurus: number | null | undefined): string =>
  kurus == null ? '—' : (kurus / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺';
export const fmtDate = (s: string | null | undefined): string => {
  if (!s) return '—';
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
};
export const cx = (...parts: (string | false | null | undefined)[]): string => parts.filter(Boolean).join(' ');

/* ----------------------------- SAYFA BAŞLIK ----------------------------- */
export function PageHeader({ title, sub, actions }: { title: string; sub?: React.ReactNode; actions?: React.ReactNode }): React.ReactElement {
  return (
    <div className="page-head reveal">
      <div>
        <h1 className="page-title">{title}</h1>
        {sub && <p className="page-sub">{sub}</p>}
      </div>
      {actions && <div className="ph-actions">{actions}</div>}
    </div>
  );
}

/* ----------------------------- CARD ----------------------------- */
export function Card({ title, icon, hint, actions, children, className }: { title?: string; icon?: IconName | string; hint?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string }): React.ReactElement {
  return (
    <div className={cx('card', className)}>
      {(title || actions) && (
        <div className="card-head">
          {title && <h2>{icon && <Icon name={icon} className="h-ico" />}{title}</h2>}
          {actions && <div className="row">{actions}</div>}
        </div>
      )}
      {hint && <p className="hint">{hint}</p>}
      {children}
    </div>
  );
}

/* ----------------------------- STAT / KPI ----------------------------- */
export interface Stat { label: string; value: React.ReactNode; icon?: IconName | string; tone?: 'ok' | 'warn' | 'danger'; delta?: { dir: 'up' | 'down'; text: string } }
export function StatGrid({ stats }: { stats: Stat[] }): React.ReactElement {
  return (
    <div className="grid reveal">
      {stats.map((s, i) => (
        <div className={cx('stat', s.tone)} key={i}>
          {s.icon && <div className="t"><Icon name={s.icon} size={16} /></div>}
          <div className="n">{s.value}</div>
          <div className="l">{s.label}</div>
          {s.delta && <div className={cx('delta', s.delta.dir)}><Icon name={s.delta.dir === 'up' ? 'arrowUp' : 'arrowDown'} size={12} />{s.delta.text}</div>}
        </div>
      ))}
    </div>
  );
}

/* ----------------------------- BADGE ----------------------------- */
export function Badge({ tone = 'muted', children, noDot }: { tone?: 'ok' | 'warn' | 'danger' | 'info' | 'muted'; children: React.ReactNode; noDot?: boolean }): React.ReactElement {
  return <span className={cx('badge', tone, noDot && 'no-dot')}>{children}</span>;
}

/* ----------------------------- BUTTON ----------------------------- */
export function Button({ variant = 'primary', icon, children, sm, block, ...rest }: { variant?: 'primary' | 'ghost' | 'ok' | 'danger' | 'subtle'; icon?: IconName | string; sm?: boolean; block?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>): React.ReactElement {
  return (
    <button className={cx('btn', variant, sm && 'sm', block && 'block')} {...rest}>
      {icon && <Icon name={icon} size={sm ? 15 : 16} />}{children}
    </button>
  );
}

/* ----------------------------- PROGRESS / METER ----------------------------- */
export function ProgressBar({ value, tone }: { value: number; tone?: 'warn' | 'danger' }): React.ReactElement {
  const pct = Math.max(0, Math.min(100, value));
  const t = tone ?? (pct >= 100 ? 'danger' : pct >= 85 ? 'warn' : undefined);
  return <div className={cx('progress', t)}><span style={{ width: pct + '%' }} /></div>;
}
export function Meter({ value, label }: { value: number; label?: string }): React.ReactElement {
  return <div className="meter-row"><ProgressBar value={value} /><span className="m-val">{label ?? Math.round(value) + '%'}</span></div>;
}

/* ----------------------------- MINI BAR CHART ----------------------------- */
export function BarChart({ data }: { data: { label: string; value: number }[] }): React.ReactElement {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="barchart">
      {data.map((d, i) => (
        <div className="bar" key={i} style={{ height: (d.value / max) * 100 + '%' }} title={`${d.label}: ${d.value}`}>
          <span className="bl">{d.label}</span>
        </div>
      ))}
    </div>
  );
}
export function Donut({ value, color = 'var(--accent)' }: { value: number; color?: string }): React.ReactElement {
  const pct = Math.max(0, Math.min(100, value));
  return <div className="donut" style={{ background: `conic-gradient(${color} ${pct * 3.6}deg, var(--line) 0)` }}><span className="d-val">{Math.round(pct)}%</span></div>;
}

/* ----------------------------- SKELETON ----------------------------- */
export function Skeleton({ lines = 3 }: { lines?: number }): React.ReactElement {
  return <div className="card">{Array.from({ length: lines }).map((_, i) => <div key={i} className={cx('skel skel-line', i === 0 && 'w40', i === lines - 1 && 'w60')} />)}</div>;
}
export function SkeletonStats({ n = 4 }: { n?: number }): React.ReactElement {
  return <div className="grid">{Array.from({ length: n }).map((_, i) => <div key={i} className="skel skel-card" />)}</div>;
}

/* ----------------------------- EMPTY STATE ----------------------------- */
export function EmptyState({ icon = 'inbox', title, sub, action }: { icon?: IconName | string; title: string; sub?: React.ReactNode; action?: React.ReactNode }): React.ReactElement {
  return (
    <div className="empty">
      <div className="e-ico"><Icon name={icon} size={26} /></div>
      <div className="e-title">{title}</div>
      {sub && <div className="e-sub">{sub}</div>}
      {action}
    </div>
  );
}

/* ----------------------------- ALERT ----------------------------- */
export function Alert({ tone = 'info', children }: { tone?: 'ok' | 'err' | 'warn' | 'info'; children: React.ReactNode }): React.ReactElement {
  const ico = tone === 'ok' ? 'checkCircle' : tone === 'err' ? 'alert' : tone === 'warn' ? 'alert' : 'info';
  return <div className={cx('alert', tone)}><Icon name={ico} size={17} className="a-ico" /><div>{children}</div></div>;
}

/* ----------------------------- SEGMENTED ----------------------------- */
export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }): React.ReactElement {
  return (
    <div className="segmented">
      {options.map((o) => <button key={o.value} className={cx(o.value === value && 'on')} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
  );
}

/* ----------------------------- DRAWER (yan detay paneli) ----------------------------- */
export function Drawer({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: React.ReactNode; children: React.ReactNode }): React.ReactElement | null {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <aside className="side-drawer" role="dialog" aria-modal="true">
        <div className="sd-head">
          <div style={{ fontWeight: 700, fontSize: 15 }}>{title}</div>
          <button className="topbar icon-btn" style={{ width: 34, height: 34, borderRadius: 9 }} onClick={onClose} aria-label="Kapat"><Icon name="x" /></button>
        </div>
        <div className="sd-body">{children}</div>
      </aside>
    </>
  );
}

/* ----------------------------- TOAST ----------------------------- */
type ToastMsg = { id: number; tone: 'ok' | 'err' | 'info'; title: string; body?: string };
let toastSeq = 1;
const toastSubs = new Set<(m: ToastMsg) => void>();
export function toast(title: string, opts?: { tone?: 'ok' | 'err' | 'info'; body?: string }): void {
  const m: ToastMsg = { id: toastSeq++, tone: opts?.tone ?? 'info', title, body: opts?.body };
  toastSubs.forEach((f) => f(m));
}
export function Toaster(): React.ReactElement {
  const [items, setItems] = useState<ToastMsg[]>([]);
  useEffect(() => {
    const sub = (m: ToastMsg) => {
      setItems((x) => [...x, m]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== m.id)), 4200);
    };
    toastSubs.add(sub);
    return () => { toastSubs.delete(sub); };
  }, []);
  return (
    <div className="toast-wrap">
      {items.map((m) => (
        <div className={cx('toast', m.tone)} key={m.id}>
          <Icon name={m.tone === 'ok' ? 'checkCircle' : m.tone === 'err' ? 'alert' : 'info'} size={18} style={{ color: m.tone === 'ok' ? 'var(--ok)' : m.tone === 'err' ? 'var(--danger)' : 'var(--accent)', flexShrink: 0, marginTop: 1 }} />
          <div><div className="t-title">{m.title}</div>{m.body && <div className="t-body">{m.body}</div>}</div>
        </div>
      ))}
    </div>
  );
}

/* ----------------------------- DATA TABLE ----------------------------- */
export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  value?: (row: T) => string | number;   // sıralama + arama + CSV için ham değer
  num?: boolean;
  sortable?: boolean;
}
export function DataTable<T>({ rows, columns, search = true, csv, csvName = 'export', pageSize = 20, empty }: {
  rows: T[];
  columns: Column<T>[];
  search?: boolean;
  csv?: boolean;
  csvName?: string;
  pageSize?: number;
  empty?: React.ReactNode;
}): React.ReactElement {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [limit, setLimit] = useState(pageSize);

  const val = (row: T, c: Column<T>): string | number => c.value ? c.value(row) : (typeof c.render === 'function' ? '' : String((row as Record<string, unknown>)[c.key] ?? ''));

  const filtered = useMemo(() => {
    let r = rows;
    if (q.trim()) {
      const s = q.toLowerCase();
      r = r.filter((row) => columns.some((c) => String(val(row, c)).toLowerCase().includes(s)));
    }
    if (sort) {
      const c = columns.find((x) => x.key === sort.key);
      if (c) r = [...r].sort((a, b) => {
        const av = val(a, c), bv = val(b, c);
        if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * sort.dir;
        return String(av).localeCompare(String(bv), 'tr') * sort.dir;
      });
    }
    return r;
  }, [rows, q, sort, columns]);

  const shown = filtered.slice(0, limit);

  function exportCsv(): void {
    const head = columns.map((c) => `"${c.header}"`).join(',');
    const lines = filtered.map((row) => columns.map((c) => `"${String(val(row, c)).replace(/"/g, '""')}"`).join(','));
    const blob = new Blob(['﻿' + [head, ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${csvName}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      {(search || csv) && (
        <div className="toolbar">
          {search && (
            <div className="search">
              <Icon name="search" size={16} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tabloda ara…" aria-label="Ara" />
            </div>
          )}
          {csv && <Button variant="subtle" sm icon="download" onClick={exportCsv}>CSV</Button>}
        </div>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={cx(c.num && 'num', c.sortable !== false && 'sortable')}
                  onClick={() => c.sortable !== false && setSort((s) => s?.key === c.key ? { key: c.key, dir: (s.dir === 1 ? -1 : 1) as 1 | -1 } : { key: c.key, dir: 1 })}>
                  {c.header}
                  {c.sortable !== false && <span className="sort-ar">{sort?.key === c.key ? (sort.dir === 1 ? '↑' : '↓') : '↕'}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr className="t-empty"><td colSpan={columns.length}>{empty ?? 'Kayıt bulunamadı.'}</td></tr>
            ) : shown.map((row, i) => (
              <tr key={i}>
                {columns.map((c) => <td key={c.key} className={cx(c.num && 'num')}>{c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? '')}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length > limit && (
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <Button variant="subtle" sm onClick={() => setLimit((l) => l + pageSize)}>Daha fazla göster ({filtered.length - limit})</Button>
        </div>
      )}
    </div>
  );
}
