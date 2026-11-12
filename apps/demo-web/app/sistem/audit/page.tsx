'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import {
  PageHeader,
  Card,
  StatGrid,
  DataTable,
  Badge,
  Button,
  Drawer,
  Alert,
  Skeleton,
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
interface AuditResp {
  items: AuditRow[];
  total: number;
}

function fmt(d: string): string {
  const t = Date.parse(d);
  return Number.isNaN(t) ? d : new Date(t).toLocaleString('tr-TR');
}

export default function AuditLog(): React.ReactElement {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [entity, setEntity] = useState('');
  const [action, setAction] = useState('');
  const [detail, setDetail] = useState<AuditRow | null>(null);
  const [err, setErr] = useState('');
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const r = await api<AuditResp>('/portal/audit');
    setRows(r.items);
    setLoaded(true);
  }, []);

  useEffect(() => {
    load().catch((e) => setErr(e instanceof Error ? e.message : 'Hata'));
  }, [load]);

  const entities = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) if (r.entity) s.add(r.entity);
    return [...s].sort();
  }, [rows]);

  const actions = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) if (r.action) s.add(r.action);
    return [...s].sort();
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (entity && r.entity !== entity) return false;
      if (action && r.action !== action) return false;
      return true;
    });
  }, [rows, entity, action]);

  const actorCount = useMemo(
    () => new Set(rows.map((r) => r.actorId).filter(Boolean)).size,
    [rows],
  );
  const anyFilter = entity !== '' || action !== '';

  return (
    <>
      <PageHeader
        title="Audit Log"
        sub="Son işlemlerin kaydı — aktör, işlem türü ve önce/sonra değer farkı. Satıra tıklayarak tam farkı yan panelde görün."
      />

      {err && <Alert tone="err">{err}</Alert>}

      <StatGrid
        stats={[
          { label: 'Kayıt (son 50)', value: rows.length, icon: 'fileText' },
          { label: 'Farklı Aktör', value: actorCount, icon: 'users' },
          { label: 'Varlık Türü', value: entities.length, icon: 'layers' },
          { label: 'İşlem Türü', value: actions.length, icon: 'activity' },
        ]}
      />

      <Card
        title="İşlem Kayıtları"
        icon="shield"
        hint="Denetim izinden en güncel kayıtlar. Değişim içeren satırlarda tam JSON farkını görebilirsiniz."
        actions={
          <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={entity} onChange={(e) => setEntity(e.target.value)} aria-label="Varlık türü">
              <option value="">Tüm varlıklar</option>
              {entities.map((en) => (
                <option key={en} value={en}>
                  {en}
                </option>
              ))}
            </select>
            <select value={action} onChange={(e) => setAction(e.target.value)} aria-label="İşlem türü">
              <option value="">Tüm işlemler</option>
              {actions.map((ac) => (
                <option key={ac} value={ac}>
                  {ac}
                </option>
              ))}
            </select>
            {anyFilter && (
              <Button
                variant="ghost"
                sm
                icon="x"
                onClick={() => {
                  setEntity('');
                  setAction('');
                }}
              >
                Temizle
              </Button>
            )}
          </div>
        }
      >
        {!loaded ? (
          <Skeleton lines={6} />
        ) : (
          <DataTable
            rows={filtered}
            csv
            csvName="audit-log"
            columns={[
              {
                key: 'at',
                header: 'Zaman',
                value: (r) => Date.parse(r.at) || 0,
                render: (r) => <span style={{ whiteSpace: 'nowrap' }}>{fmt(r.at)}</span>,
              },
              {
                key: 'actor',
                header: 'Aktör',
                value: (r) => r.actorName ?? r.actorId ?? 'sistem',
                render: (r) => r.actorName ?? r.actorId ?? <span className="muted">sistem</span>,
              },
              {
                key: 'action',
                header: 'İşlem',
                value: (r) => r.action,
                render: (r) => <Badge tone="info">{r.action}</Badge>,
              },
              {
                key: 'entity',
                header: 'Varlık',
                value: (r) => r.entity ?? '',
                render: (r) =>
                  r.entity ? (
                    <>
                      <b>{r.entity}</b>
                      {r.entityId && <div className="meta">{r.entityId}</div>}
                    </>
                  ) : (
                    <span className="muted">—</span>
                  ),
              },
              {
                key: 'diff',
                header: 'Değişim',
                sortable: false,
                render: (r) => {
                  const hasDiff = r.before != null || r.after != null;
                  return hasDiff ? (
                    <Button variant="subtle" sm icon="eye" onClick={() => setDetail(r)}>
                      Farkı gör
                    </Button>
                  ) : (
                    <span className="muted">—</span>
                  );
                },
              },
            ]}
            empty="Filtreye uyan kayıt yok."
          />
        )}
      </Card>

      <Drawer open={detail != null} onClose={() => setDetail(null)} title="İşlem Farkı">
        {detail && (
          <>
            <Card title="İşlem" icon="activity">
              <table>
                <tbody>
                  <tr>
                    <th style={{ width: 110 }}>Zaman</th>
                    <td>{fmt(detail.at)}</td>
                  </tr>
                  <tr>
                    <th>İşlem</th>
                    <td>
                      <Badge tone="info">{detail.action}</Badge>
                    </td>
                  </tr>
                  <tr>
                    <th>Varlık</th>
                    <td>
                      {detail.entity ?? '—'}
                      {detail.entityId && <div className="meta">{detail.entityId}</div>}
                    </td>
                  </tr>
                  <tr>
                    <th>Aktör</th>
                    <td>{detail.actorName ?? detail.actorId ?? 'sistem'}</td>
                  </tr>
                </tbody>
              </table>
            </Card>
            <Card title="Önceki Değer" icon="fileText">
              <pre
                style={{
                  margin: 0,
                  fontSize: 12,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}
              >
                {detail.before == null ? '—' : JSON.stringify(detail.before, null, 2)}
              </pre>
            </Card>
            <Card title="Sonraki Değer" icon="fileText">
              <pre
                style={{
                  margin: 0,
                  fontSize: 12,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}
              >
                {detail.after == null ? '—' : JSON.stringify(detail.after, null, 2)}
              </pre>
            </Card>
          </>
        )}
      </Drawer>
    </>
  );
}
