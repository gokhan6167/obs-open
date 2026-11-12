'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import {
  PageHeader, Card, StatGrid, DataTable, Badge, Button, Alert, EmptyState,
  Skeleton, SkeletonStats, Segmented,
} from '@/app/ui';

interface Sched {
  sectionId: string;
  courseCode: string;
  courseName: string;
  ects: number;
  localCredit: number;
  theoryHours: number;
  practiceHours: number;
  labHours: number;
  sectionCode: string;
  termName: string;
  status: string;
}
const TR: Record<string, string> = {
  approved: 'Onaylı', submitted: 'Beklemede', draft: 'Taslak',
  withdrawn: 'Çekildi', rejected: 'Reddedildi',
};
const BADGE: Record<string, 'ok' | 'warn' | 'danger' | 'info' | 'muted'> = {
  approved: 'ok', submitted: 'warn', draft: 'muted', withdrawn: 'muted', rejected: 'danger',
};

const DAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum'];
const HOURS = ['08:30', '09:30', '10:30', '11:30', '13:30', '14:30', '15:30', '16:30'];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

interface Block { s: Sched; day: number; hour: number; len: number; color: number }

/** Gerçek kredi/saatten deterministik, çakışmasız haftalık yerleşim (demo amaçlı görsel). */
function layout(rows: Sched[]): Block[] {
  const occ: boolean[][] = HOURS.map(() => DAYS.map(() => false));
  const sorted = [...rows].sort((a, b) => a.courseCode.localeCompare(b.courseCode, 'tr'));
  const out: Block[] = [];
  for (const s of sorted) {
    const h = hash(s.sectionId);
    const len = Math.min(3, Math.max(1, s.theoryHours + s.labHours || s.localCredit || Math.round(s.ects / 2) || 1));
    const startDay = h % DAYS.length;
    const startHour = (h >>> 3) % HOURS.length;
    let placed = false;
    for (let d = 0; d < DAYS.length && !placed; d++) {
      const day = (startDay + d) % DAYS.length;
      for (let hr = 0; hr <= HOURS.length - len && !placed; hr++) {
        const hour = (startHour + hr) % (HOURS.length - len + 1);
        let free = true;
        for (let k = 0; k < len; k++) if (occ[hour + k][day]) { free = false; break; }
        if (free) {
          for (let k = 0; k < len; k++) occ[hour + k][day] = true;
          out.push({ s, day, hour, len, color: h % 6 });
          placed = true;
        }
      }
    }
  }
  return out;
}

function Timetable({ blocks }: { blocks: Block[] }): React.ReactElement {
  // start[hour][day] = block | undefined ; skip[hour][day] = süregelen hücre
  const start: (Block | undefined)[][] = HOURS.map(() => DAYS.map(() => undefined));
  const skip: boolean[][] = HOURS.map(() => DAYS.map(() => false));
  for (const b of blocks) {
    start[b.hour][b.day] = b;
    for (let k = 1; k < b.len; k++) skip[b.hour + k][b.day] = true;
  }
  return (
    <div className="table-wrap" style={{ overflowX: 'auto' }}>
      <table className="timetable">
        <thead>
          <tr>
            <th style={{ width: 62 }}>Saat</th>
            {DAYS.map((d) => <th key={d}>{d}</th>)}
          </tr>
        </thead>
        <tbody>
          {HOURS.map((hLabel, hi) => (
            <tr key={hLabel}>
              <td className="tt-hour">{hLabel}</td>
              {DAYS.map((d, di) => {
                if (skip[hi][di]) return null;
                const b = start[hi][di];
                if (!b) return <td key={d} className="tt-empty-cell" />;
                return (
                  <td key={d} rowSpan={b.len} className={`tt-cell tt-c${b.color}`}>
                    <div className="tt-code">{b.s.courseCode}</div>
                    <div className="tt-name">{b.s.courseName}</div>
                    <div className="tt-meta">Şube {b.s.sectionCode} · {b.s.localCredit} kredi · {b.s.ects} AKTS</div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function DersProgrami(): React.ReactElement {
  const [rows, setRows] = useState<Sched[] | null>(null);
  const [err, setErr] = useState('');
  const [view, setView] = useState<'cizelge' | 'liste'>('cizelge');

  useEffect(() => {
    api<Sched[]>('/portal/schedule')
      .then(setRows)
      .catch((e) => setErr(e instanceof Error ? e.message : 'Hata'));
  }, []);

  const activeTermName = rows?.[0]?.termName ?? null;
  const active = useMemo(
    () => (rows ?? []).filter((r) => r.termName === activeTermName && r.status !== 'withdrawn'),
    [rows, activeTermName],
  );
  const blocks = useMemo(() => layout(active), [active]);

  if (err) return (<><PageHeader title="Ders Programı" /><Alert tone="err">{err}</Alert></>);
  if (!rows) return (
    <><PageHeader title="Ders Programı" sub="Program yükleniyor…" /><SkeletonStats n={3} /><Skeleton lines={5} /></>
  );

  const totalEcts = active.reduce((a, r) => a + (r.ects ?? 0), 0);
  const totalCredit = active.reduce((a, r) => a + (r.localCredit ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Ders Programı"
        sub={activeTermName ? `${activeTermName} · ${active.length} ders` : 'Haftalık ders çizelgeniz'}
        actions={
          <Segmented
            value={view}
            onChange={setView}
            options={[{ value: 'cizelge', label: 'Çizelge' }, { value: 'liste', label: 'Liste' }]}
          />
        }
      />

      <StatGrid
        stats={[
          { label: 'Ders', value: active.length, icon: 'book' },
          { label: 'Toplam kredi', value: totalCredit, icon: 'grade' },
          { label: 'Toplam AKTS', value: totalEcts, icon: 'layers' },
        ]}
      />

      {active.length === 0 ? (
        <Card>
          <EmptyState
            icon="calendar"
            title="Bu dönem kayıtlı ders yok"
            sub="Ders seçme penceresi açıkken şube seçip danışman onayına gönderin."
            action={<Link href="/ogrenci/ders-secme"><Button variant="primary" sm icon="arrowRight">Ders Seçme</Button></Link>}
          />
        </Card>
      ) : view === 'cizelge' ? (
        <>
          <Timetable blocks={blocks} />
          <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
            Çizelge; ders kredisine göre yerleştirilmiş haftalık görünümdür. Kesin gün/saat, ders açma aşamasında şubeye atanır.
          </p>
        </>
      ) : (
        <Card>
          <DataTable
            rows={rows}
            search
            csv
            csvName="ders-programi"
            columns={[
              { key: 'course', header: 'Ders', value: (r) => `${r.courseCode} ${r.courseName}`,
                render: (r) => (<><b>{r.courseCode}</b> · {r.courseName}</>) },
              { key: 'section', header: 'Şube', value: (r) => r.sectionCode },
              { key: 'term', header: 'Dönem', value: (r) => r.termName },
              { key: 'credit', header: 'Kredi', num: true, value: (r) => r.localCredit },
              { key: 'ects', header: 'AKTS', num: true, value: (r) => r.ects },
              { key: 'status', header: 'Durum', value: (r) => TR[r.status] ?? r.status,
                render: (r) => <Badge tone={BADGE[r.status] ?? 'muted'}>{TR[r.status] ?? r.status}</Badge> },
            ]}
          />
        </Card>
      )}
    </>
  );
}
