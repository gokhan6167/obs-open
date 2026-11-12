'use client';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import {
  PageHeader,
  Card,
  StatGrid,
  DataTable,
  Badge,
  Alert,
  EmptyState,
  Skeleton,
  SkeletonStats,
  money,
  fmtDate,
} from '@/app/ui';

interface Loan {
  id: string;
  itemTitle: string;
  loanedOn: string | null;
  dueOn: string | null;
  returnedOn: string | null;
  fineAmount: number;
  status: string;
}

const STATUS_LABEL: Record<string, string> = {
  odunc: 'Ödünçte',
  iade: 'İade edildi',
  gecikmis: 'Gecikmiş',
  kayip: 'Kayıp',
};

const statusLabel = (s: string): string => STATUS_LABEL[s] ?? s;

function statusTone(s: string): 'ok' | 'warn' | 'danger' | 'info' | 'muted' {
  if (s === 'iade') return 'ok';
  if (s === 'gecikmis') return 'danger';
  if (s === 'kayip') return 'warn';
  if (s === 'odunc') return 'info';
  return 'muted';
}

/** ISO gün (YYYY-MM-DD) — backend date alanlarıyla aynı biçim. */
const isoDay = (d: Date): string => d.toISOString().slice(0, 10);

/** İade edilmemiş ve son tarihi geçmiş kayıt. */
function isOverdue(r: Loan): boolean {
  if (r.returnedOn) return false;
  if (r.status === 'gecikmis') return true;
  return !!r.dueOn && r.dueOn < isoDay(new Date());
}

export default function KutuphanemPage(): React.ReactElement {
  const [rows, setRows] = useState<Loan[] | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api<Loan[]>('/campus/library/my')
      .then((res) => setRows(Array.isArray(res) ? res : []))
      .catch((e) => setErr(e instanceof Error ? e.message : 'Hata'));
  }, []);

  const stats = useMemo(() => {
    const list = rows ?? [];
    return {
      total: list.length,
      open: list.filter((r) => !r.returnedOn).length,
      overdue: list.filter(isOverdue).length,
      fine: list.filter((r) => r.status !== 'iade').reduce((a, r) => a + (r.fineAmount ?? 0), 0),
    };
  }, [rows]);

  if (err)
    return (
      <>
        <PageHeader title="Kütüphane Durumum" />
        <Alert tone="err">{err}</Alert>
      </>
    );

  if (!rows)
    return (
      <>
        <PageHeader title="Kütüphane Durumum" sub="Ödünç kayıtlarınız yükleniyor…" />
        <SkeletonStats n={4} />
        <Skeleton lines={8} />
      </>
    );

  return (
    <>
      <PageHeader
        title="Kütüphane Durumum"
        sub="Ödünç aldığınız materyaller, son iade tarihleri ve gecikme cezalarınız."
      />

      <StatGrid
        stats={[
          { label: 'Toplam kayıt', value: stats.total, icon: 'book' },
          {
            label: 'İade bekleyen',
            value: stats.open,
            icon: 'clock',
            ...(stats.open > 0 ? { tone: 'warn' as const } : {}),
          },
          {
            label: 'Gecikmiş',
            value: stats.overdue,
            icon: 'alert',
            ...(stats.overdue > 0 ? { tone: 'danger' as const } : {}),
          },
          {
            label: 'Ödenmemiş ceza',
            value: money(stats.fine),
            icon: 'money',
            ...(stats.fine > 0 ? { tone: 'danger' as const } : {}),
          },
        ]}
      />

      {stats.overdue > 0 && (
        <Alert tone="warn">
          Gecikmiş {stats.overdue} materyaliniz bulunuyor. Kütüphane borcu kapatılmadan mezuniyet ve
          ilişik kesme işlemleriniz tamamlanamaz; materyalleri en kısa sürede iade ediniz.
        </Alert>
      )}

      <Card
        title="Ödünç kayıtlarım"
        icon="book"
        hint="Kayıtlar kütüphane birimi tarafından güncellenir; bu ekran salt görünümdür."
      >
        <DataTable<Loan>
          rows={rows}
          search
          csv
          csvName="kutuphane-kayitlarim"
          empty={
            <EmptyState
              icon="book"
              title="Ödünç kaydınız bulunmuyor"
              sub="Kütüphaneden ödünç aldığınız bir materyal görünmüyor."
            />
          }
          columns={[
            {
              key: 'itemTitle',
              header: 'Materyal',
              sortable: true,
              value: (r) => r.itemTitle,
              render: (r) => <b>{r.itemTitle}</b>,
            },
            {
              key: 'loanedOn',
              header: 'Ödünç Tarihi',
              sortable: true,
              value: (r) => r.loanedOn ?? '',
              render: (r) => fmtDate(r.loanedOn),
            },
            {
              key: 'dueOn',
              header: 'Son Tarih',
              sortable: true,
              value: (r) => r.dueOn ?? '',
              render: (r) =>
                isOverdue(r) ? (
                  <span style={{ color: 'var(--danger)', fontWeight: 600 }}>
                    {fmtDate(r.dueOn)}
                  </span>
                ) : (
                  fmtDate(r.dueOn)
                ),
            },
            {
              key: 'returnedOn',
              header: 'İade',
              sortable: true,
              value: (r) => r.returnedOn ?? '',
              render: (r) =>
                r.returnedOn ? fmtDate(r.returnedOn) : <span className="muted">—</span>,
            },
            {
              key: 'fineAmount',
              header: 'Ceza',
              sortable: true,
              num: true,
              value: (r) => r.fineAmount ?? 0,
              render: (r) => money(r.fineAmount),
            },
            {
              key: 'status',
              header: 'Durum',
              sortable: true,
              value: (r) => statusLabel(r.status),
              render: (r) => <Badge tone={statusTone(r.status)}>{statusLabel(r.status)}</Badge>,
            },
          ]}
        />
      </Card>
    </>
  );
}
