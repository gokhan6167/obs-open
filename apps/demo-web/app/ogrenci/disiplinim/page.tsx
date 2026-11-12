'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  PageHeader,
  Card,
  DataTable,
  Badge,
  Alert,
  EmptyState,
  Skeleton,
  fmtDate,
} from '@/app/ui';

interface DisciplineRecord {
  category: string;
  penalty: string;
  decisionNo: string;
  decisionDate: string;
  status: string;
}

const STATUS_TR: Record<string, string> = {
  basvuruldu: 'Başvuruldu',
  incelemede: 'İncelemede',
  onaylandi: 'Onaylandı',
  kabul: 'Kabul',
  reddedildi: 'Reddedildi',
  iptal: 'İptal',
};

const BADGE: Record<string, 'ok' | 'warn' | 'danger' | 'info' | 'muted'> = {
  basvuruldu: 'warn',
  incelemede: 'info',
  onaylandi: 'ok',
  kabul: 'ok',
  reddedildi: 'danger',
  iptal: 'danger',
};

export default function Disiplinim(): React.ReactElement {
  const [rows, setRows] = useState<DisciplineRecord[] | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api<DisciplineRecord[]>('/student-requests/my-discipline')
      .then(setRows)
      .catch((e) => setErr(e instanceof Error ? e.message : 'Hata'));
  }, []);

  if (err)
    return (
      <>
        <PageHeader title="Disiplin Durumum" />
        <Alert tone="err">{err}</Alert>
      </>
    );

  if (!rows)
    return (
      <>
        <PageHeader title="Disiplin Durumum" sub="Disiplin kayıtlarınız yükleniyor…" />
        <Skeleton lines={5} />
      </>
    );

  return (
    <>
      <PageHeader
        title="Disiplin Durumum"
        sub="Hakkınızdaki disiplin kayıtları ve verilen kararlar."
      />

      <Card icon="shield" title="Disiplin Kayıtları" className="reveal">
        {rows.length === 0 ? (
          <EmptyState
            icon="checkCircle"
            title="Disiplin kaydınız bulunmuyor"
            sub="Sicilinizde herhangi bir disiplin işlemi yer almıyor. Tebrikler, kaydınız temiz."
          />
        ) : (
          <DataTable
            rows={rows}
            csv
            csvName="disiplin-kayitlarim"
            empty="Kayıt bulunamadı."
            columns={[
              { key: 'category', header: 'Kategori', value: (r) => r.category },
              { key: 'penalty', header: 'Ceza', value: (r) => r.penalty },
              {
                key: 'decisionNo',
                header: 'Karar No',
                value: (r) => r.decisionNo,
                render: (r) => <span className="muted">{r.decisionNo}</span>,
              },
              {
                key: 'decisionDate',
                header: 'Karar Tarihi',
                value: (r) => r.decisionDate,
                render: (r) => fmtDate(r.decisionDate),
              },
              {
                key: 'status',
                header: 'Durum',
                value: (r) => STATUS_TR[r.status] ?? r.status,
                render: (r) => (
                  <Badge tone={BADGE[r.status] ?? 'muted'}>
                    {STATUS_TR[r.status] ?? r.status}
                  </Badge>
                ),
              },
            ]}
          />
        )}
      </Card>
    </>
  );
}
