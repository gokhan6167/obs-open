'use client';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import {
  PageHeader,
  Card,
  StatGrid,
  DataTable,
  Badge,
  Button,
  Alert,
  SkeletonStats,
  Skeleton,
  EmptyState,
  Drawer,
  ProgressBar,
  Meter,
  Icon,
  money,
} from '@/app/ui';

interface ProgRow {
  program: string;
  count: number;
}
interface ByProgramFin {
  program: string;
  accrued: number;
  collected: number;
  openDebt: number;
}
interface FinanceSummary {
  byProgram: ByProgramFin[];
}

interface MergedRow {
  program: string;
  count: number;
  accrued: number;
  collected: number;
  openDebt: number;
  hasFin: boolean;
}

const num = (n: number): string => n.toLocaleString('tr-TR');

export default function ProgramDagilim(): React.ReactElement {
  const [rows, setRows] = useState<ProgRow[] | null>(null);
  const [fin, setFin] = useState<ByProgramFin[]>([]);
  const [detail, setDetail] = useState<MergedRow | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [progs, summary] = await Promise.all([
          api<ProgRow[]>('/reports/students-by-program'),
          api<FinanceSummary>('/reports/finance-summary').catch(() => ({ byProgram: [] as ByProgramFin[] })),
        ]);
        if (!alive) return;
        setRows(progs);
        setFin(summary.byProgram ?? []);
      } catch (e) {
        if (alive) setErr(e instanceof Error ? e.message : 'Hata');
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const finByName = useMemo(() => {
    const m = new Map<string, ByProgramFin>();
    for (const f of fin) m.set(f.program, f);
    return m;
  }, [fin]);

  const merged = useMemo<MergedRow[]>(() => {
    if (!rows) return [];
    return rows.map((r) => {
      const f = finByName.get(r.program);
      return {
        program: r.program,
        count: r.count,
        accrued: f?.accrued ?? 0,
        collected: f?.collected ?? 0,
        openDebt: f?.openDebt ?? 0,
        hasFin: !!f,
      };
    });
  }, [rows, finByName]);

  const totalStudents = useMemo(() => merged.reduce((s, r) => s + r.count, 0), [merged]);
  const totalDebt = useMemo(() => merged.reduce((s, r) => s + r.openDebt, 0), [merged]);
  const maxCount = useMemo(() => Math.max(1, ...merged.map((r) => r.count)), [merged]);

  const sub = (
    <>
      Program bazlı öğrenci sayıları + açık alacak · {merged.length} program · toplam{' '}
      {num(totalStudents)} öğrenci
    </>
  );

  if (err) {
    return (
      <>
        <PageHeader title="Program Dağılımı" sub={sub} />
        <Alert tone="err">{err}</Alert>
      </>
    );
  }
  if (!rows) {
    return (
      <>
        <PageHeader title="Program Dağılımı" />
        <SkeletonStats n={4} />
        <Skeleton lines={6} />
      </>
    );
  }

  const detailRate = detail && detail.accrued > 0 ? (detail.collected / detail.accrued) * 100 : null;

  return (
    <>
      <PageHeader
        title="Program Dağılımı"
        sub={sub}
        actions={
          <Button variant="ghost" icon="download" sm onClick={() => window.print()}>
            PDF / Yazdır
          </Button>
        }
      />

      <StatGrid
        stats={[
          { label: 'Program', value: num(merged.length), icon: 'layers' },
          { label: 'Toplam Öğrenci', value: num(totalStudents), icon: 'users' },
          { label: 'Program Başına Ort.', value: merged.length > 0 ? Math.round(totalStudents / merged.length) : 0, icon: 'chart' },
          { label: 'Toplam Açık Alacak', value: money(totalDebt), icon: 'wallet', tone: totalDebt > 0 ? 'danger' : 'ok' },
        ]}
      />

      <Card title="Karşılaştırmalı Dağılım" icon="pie" hint="Satıra tıklayarak program mali 360 detayını açın">
        <DataTable
          rows={merged}
          csv
          csvName="program-dagilim"
          pageSize={30}
          empty={
            <EmptyState
              icon="layers"
              title="Program kaydı yok"
              sub="Bu tenant için programa bağlı öğrenci kaydı bulunmuyor."
            />
          }
          columns={[
            { key: 'program', header: 'Program', sortable: true, value: (r) => r.program, render: (r) => <b>{r.program}</b> },
            {
              key: 'dagilim',
              header: 'Dağılım',
              render: (r) => <ProgressBar value={(r.count / maxCount) * 100} />,
            },
            { key: 'count', header: 'Öğrenci', num: true, sortable: true, value: (r) => r.count, render: (r) => num(r.count) },
            {
              key: 'pay',
              header: 'Pay',
              num: true,
              sortable: true,
              value: (r) => (totalStudents > 0 ? (r.count / totalStudents) * 100 : 0),
              render: (r) => (totalStudents > 0 ? ((r.count / totalStudents) * 100).toFixed(1) : '0.0') + '%',
            },
            {
              key: 'openDebt',
              header: 'Açık Alacak',
              num: true,
              sortable: true,
              value: (r) => r.openDebt,
              render: (r) =>
                r.hasFin ? (
                  <Badge tone={r.openDebt > 0 ? 'danger' : 'ok'}>{money(r.openDebt)}</Badge>
                ) : (
                  <span className="muted">—</span>
                ),
            },
            {
              key: 'detay',
              header: '',
              render: (r) => (
                <Button variant="ghost" sm icon="eye" onClick={() => setDetail(r)}>
                  Detay
                </Button>
              ),
            },
          ]}
        />
      </Card>

      <Drawer open={!!detail} onClose={() => setDetail(null)} title={detail?.program}>
        {detail && (
          <>
            <StatGrid
              stats={[
                { label: 'Öğrenci', value: num(detail.count), icon: 'users' },
                { label: 'Payı', value: (totalStudents > 0 ? (detail.count / totalStudents) * 100 : 0).toFixed(1) + '%', icon: 'pie' },
              ]}
            />
            {!detail.hasFin ? (
              <EmptyState icon="wallet" title="Fatura kaydı yok" sub="Bu program için fatura kaydı bulunmuyor." />
            ) : (
              <>
                <StatGrid
                  stats={[
                    { label: 'Tahakkuk', value: money(detail.accrued), icon: 'file' },
                    { label: 'Tahsilat', value: money(detail.collected), icon: 'wallet', tone: 'ok' },
                    { label: 'Açık Alacak', value: money(detail.openDebt), icon: 'alert', tone: detail.openDebt > 0 ? 'danger' : 'ok' },
                    { label: 'Tahsilat Oranı', value: detailRate != null ? detailRate.toFixed(1) + '%' : '—', icon: 'activity' },
                  ]}
                />
                {detailRate != null && (
                  <div style={{ marginTop: 12 }}>
                    <div className="hint" style={{ marginBottom: 4 }}>Tahsilat oranı</div>
                    <Meter value={detailRate} />
                  </div>
                )}
              </>
            )}
          </>
        )}
      </Drawer>

      <Alert tone="info">
        Çubuklar en büyük programa göre orantılıdır. Açık alacak = tahakkuk − tahsilat (fatura
        kaydı olan programlarda). PDF için tarayıcının yazdır penceresinden &quot;PDF olarak
        kaydet&quot; seçilebilir. Salt-okunur rapor.
      </Alert>
    </>
  );
}
