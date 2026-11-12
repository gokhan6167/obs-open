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
  BarChart,
} from '@/app/ui';

interface AuditRow {
  id: string;
  at: string;
  actorId: string | null;
  actorName: string | null;
  action: string;
  entity: string | null;
  entityId: string | null;
  before: unknown;
  after: unknown;
}

const fmt = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
};

// Fiil türüne göre rozet rengi: silme/ret kırmızı, oluşturma yeşil, güncelleme sarı.
function actionTone(action: string): 'ok' | 'warn' | 'danger' | 'muted' {
  const a = action.toLowerCase();
  if (a.includes('delete') || a.includes('reject') || a.includes('cancel') || a.includes('kesme')) return 'danger';
  if (a.includes('create') || a.includes('approve') || a.includes('insert') || a.includes('enroll')) return 'ok';
  if (a.includes('update') || a.includes('transition') || a.includes('change') || a.includes('pay')) return 'warn';
  return 'muted';
}

function DiffBlock({ label, value }: { label: string; value: unknown }): React.ReactElement {
  return (
    <div style={{ flex: '1 1 240px' }}>
      <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>{label}</div>
      <pre
        style={{
          margin: 0,
          padding: 10,
          background: 'var(--surface, #fff)',
          border: '1px solid var(--line, #e3e8ef)',
          borderRadius: 8,
          fontSize: 12,
          overflow: 'auto',
          maxHeight: 320,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {value == null ? '—' : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

export default function Denetim(): React.ReactElement {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [entityFilter, setEntityFilter] = useState('');
  const [detail, setDetail] = useState<AuditRow | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    api<{ items: AuditRow[] }>('/portal/audit')
      .then((res) => {
        if (alive) setRows(res.items);
      })
      .catch((e) => {
        if (alive) setErr(e instanceof Error ? e.message : 'Hata');
      });
    return () => {
      alive = false;
    };
  }, []);

  const entities = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows ?? []) if (r.entity) set.add(r.entity);
    return [...set].sort((a, b) => a.localeCompare(b, 'tr'));
  }, [rows]);

  const actionCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) m.set(r.action, (m.get(r.action) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [rows]);

  const filtered = useMemo(() => {
    return (rows ?? []).filter((r) => (entityFilter ? r.entity === entityFilter : true));
  }, [rows, entityFilter]);

  if (err) {
    return (
      <>
        <PageHeader title="Denetim İzleri" sub="Kurum genelinde son idari işlemler" />
        <Alert tone="err">{err}</Alert>
      </>
    );
  }
  if (!rows) {
    return (
      <>
        <PageHeader title="Denetim İzleri" />
        <SkeletonStats n={4} />
        <Skeleton lines={8} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Denetim İzleri"
        sub="Kurum genelinde son 50 idari işlem · değiştirilemez denetim kaydı · yönetişim gözetimi"
      />

      <StatGrid
        stats={[
          { label: 'Kayıt (son 50)', value: rows.length, icon: 'fileText' },
          { label: 'Etkilenen Varlık Türü', value: entities.length, icon: 'layers' },
          { label: 'Farklı Aktör', value: new Set(rows.map((r) => r.actorId)).size, icon: 'users' },
          { label: 'Süzülen', value: filtered.length, icon: 'filter' },
        ]}
      />

      {actionCounts.length > 0 && (
        <Card title="İşlem Türü Dağılımı" icon="activity" hint="Son kayıtlarda en sık görülen fiiller">
          <BarChart data={actionCounts.map(([action, n]) => ({ label: action, value: n }))} />
        </Card>
      )}

      <Card
        title="Denetim Kayıtları"
        icon="shield"
        hint="Satıra tıklayarak değişim (before / after) detayını açın"
        actions={
          <div className="field" style={{ marginBottom: 0, minWidth: 180 }}>
            <select value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)}>
              <option value="">Tüm varlık türleri</option>
              {entities.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </div>
        }
      >
        <DataTable
          rows={filtered}
          csv
          csvName="denetim-izleri"
          pageSize={25}
          empty={<EmptyState icon="shield" title="Denetim kaydı yok" sub="Süzgece uyan denetim kaydı bulunamadı." />}
          columns={[
            { key: 'at', header: 'Zaman', sortable: true, value: (r) => r.at, render: (r) => <span className="muted" style={{ fontSize: 12 }}>{fmt(r.at)}</span> },
            {
              key: 'action',
              header: 'İşlem',
              sortable: true,
              value: (r) => r.action,
              render: (r) => <Badge tone={actionTone(r.action)}>{r.action}</Badge>,
            },
            {
              key: 'entity',
              header: 'Varlık',
              sortable: true,
              value: (r) => `${r.entity ?? ''} ${r.entityId ?? ''}`,
              render: (r) =>
                r.entity ? (
                  <>
                    <b>{r.entity}</b>
                    {r.entityId && <div className="muted" style={{ fontSize: 11 }}>{r.entityId}</div>}
                  </>
                ) : (
                  <span className="muted">—</span>
                ),
            },
            {
              key: 'actor',
              header: 'Aktör',
              sortable: true,
              value: (r) => r.actorName ?? r.actorId ?? 'sistem',
              render: (r) => <span className="muted" style={{ fontSize: 12 }}>{r.actorName ?? r.actorId ?? 'sistem'}</span>,
            },
            {
              key: 'detay',
              header: '',
              render: (r) => {
                const hasDiff = r.before != null || r.after != null;
                return (
                  <Button variant="ghost" sm icon="eye" disabled={!hasDiff} onClick={() => setDetail(r)}>
                    {hasDiff ? 'Değişim' : '—'}
                  </Button>
                );
              },
            },
          ]}
        />
      </Card>

      <Drawer open={!!detail} onClose={() => setDetail(null)} title={detail ? `${detail.action}` : undefined}>
        {detail && (
          <>
            <table>
              <tbody>
                <tr>
                  <td>Zaman</td>
                  <td style={{ textAlign: 'right' }}>{fmt(detail.at)}</td>
                </tr>
                <tr>
                  <td>Varlık</td>
                  <td style={{ textAlign: 'right' }}>
                    {detail.entity ? <b>{detail.entity}</b> : <span className="muted">—</span>}
                    {detail.entityId && <div className="muted" style={{ fontSize: 11 }}>{detail.entityId}</div>}
                  </td>
                </tr>
                <tr>
                  <td>Aktör</td>
                  <td style={{ textAlign: 'right' }}>{detail.actorName ?? detail.actorId ?? 'sistem'}</td>
                </tr>
              </tbody>
            </table>
            <div className="row" style={{ gap: 12, alignItems: 'stretch', marginTop: 14, flexWrap: 'wrap' }}>
              <DiffBlock label="Önce (before)" value={detail.before} />
              <DiffBlock label="Sonra (after)" value={detail.after} />
            </div>
          </>
        )}
      </Drawer>

      <Alert tone="info">
        Denetim kayıtları değiştirilemez (append-only) ve tenant kapsamında tutulur. Bu ekran üst
        yönetim gözetimi için salt-okunurdur; kayıt üzerinde işlem yapılamaz. En güncel 50 kayıt
        listelenir.
      </Alert>
    </>
  );
}
