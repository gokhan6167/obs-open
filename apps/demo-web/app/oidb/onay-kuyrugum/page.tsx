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
  SkeletonStats,
  EmptyState,
  Icon,
  toast,
  fmtDate,
} from '@/app/ui';

type ActionKey = 'onay' | 'red' | 'iade';

interface QueueItem {
  id: string;
  flowKey: string;
  flowName: string;
  subjectType: string;
  subjectId: string;
  studentId: string | null;
  studentNo: string | null;
  studentEmail: string | null;
  currentStep: number;
  stepName: string;
  unit: string;
  roleKey: string | null;
  slaDays: number | null;
  elapsedDays: number;
  createdAt: string;
  slaBreached: boolean;
}

interface DetailStep {
  id: string;
  stepNo: number;
  unit: string;
  roleKey: string | null;
  name: string;
  slaDays: number | null;
}

interface DetailAction {
  id: string;
  stepNo: number;
  unit: string | null;
  action: string;
  note: string | null;
  actedByUserId: string | null;
  actedByEmail: string | null;
  createdAt: string;
}

interface InstanceDetail {
  instance: {
    id: string;
    subjectType: string;
    subjectId: string;
    studentNo: string | null;
    studentEmail: string | null;
    currentStep: number;
    status: string;
    createdAt: string;
    closedAt: string | null;
  };
  flow: { id: string; key: string; name: string; description: string | null } | null;
  steps: DetailStep[];
  actions: DetailAction[];
}

const STATUS: Record<string, { label: string; tone: 'ok' | 'danger' | 'info' | 'muted' }> = {
  devam: { label: 'Devam ediyor', tone: 'info' },
  onaylandi: { label: 'Onaylandı', tone: 'ok' },
  reddedildi: { label: 'Reddedildi', tone: 'danger' },
  iptal: { label: 'İptal', tone: 'muted' },
};

const ACTION_LABEL: Record<string, string> = {
  onay: 'Onay',
  red: 'Red',
  iade: 'İade',
  not: 'Not',
};

const ACTION_TONE: Record<string, 'ok' | 'danger' | 'warn' | 'muted'> = {
  onay: 'ok',
  red: 'danger',
  iade: 'warn',
  not: 'muted',
};

export default function OnayKuyrugumPage(): React.ReactElement {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const [openId, setOpenId] = useState('');
  const [detail, setDetail] = useState<InstanceDetail | null>(null);
  const [detailErr, setDetailErr] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await api<{ items: QueueItem[] }>('/approval/my-queue');
    setItems(res.items ?? []);
  }, []);

  useEffect(() => {
    load()
      .catch((e) => setErr(e instanceof Error ? e.message : 'Onay kuyruğu yüklenemedi'))
      .finally(() => setLoading(false));
  }, [load]);

  const breached = useMemo(() => items.filter((i) => i.slaBreached).length, [items]);

  const loadDetail = useCallback(async (id: string) => {
    setDetail(null);
    setDetailErr('');
    try {
      setDetail(await api<InstanceDetail>(`/approval/instances/${id}`));
    } catch (e) {
      setDetailErr(e instanceof Error ? e.message : 'Detay yüklenemedi');
    }
  }, []);

  function openDetail(id: string): void {
    setOpenId(id);
    setNote('');
    void loadDetail(id);
  }

  function closeDetail(): void {
    setOpenId('');
    setDetail(null);
    setDetailErr('');
    setNote('');
  }

  async function act(action: ActionKey): Promise<void> {
    if (!openId) return;
    setBusy(true);
    setDetailErr('');
    try {
      await api(`/approval/instances/${openId}/action`, {
        method: 'POST',
        body: { action, note: note.trim() || undefined },
      });
      toast('Aksiyon kaydedildi', {
        tone: action === 'red' ? 'err' : 'ok',
        body: `${ACTION_LABEL[action]} işlemi işlendi.`,
      });
      await load();
      await loadDetail(openId);
      setNote('');
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Aksiyon başarısız';
      setDetailErr(m);
      toast('Aksiyon başarısız', { tone: 'err', body: m });
    } finally {
      setBusy(false);
    }
  }

  const active = detail?.instance.status === 'devam';

  return (
    <>
      <PageHeader
        title="Onay Kuyruğum"
        sub="Rolünüze düşen bekleyen onay adımları. Satıra tıklayarak akış detayını açın."
        actions={
          <Button
            variant="subtle"
            icon="refresh"
            onClick={() => {
              setErr('');
              void load().catch((e) => setErr(e instanceof Error ? e.message : 'Yenilenemedi'));
            }}
          >
            Yenile
          </Button>
        }
      />

      {loading ? (
        <SkeletonStats n={2} />
      ) : (
        <StatGrid
          stats={[
            {
              label: 'Bekleyen onay',
              value: items.length,
              icon: 'inbox',
              tone: items.length > 0 ? 'warn' : undefined,
            },
            {
              label: 'SLA aşan',
              value: breached,
              icon: 'clock',
              tone: breached > 0 ? 'danger' : undefined,
            },
          ]}
        />
      )}

      <Card title="Bekleyen onaylar" icon="checkCircle">
        {err && <Alert tone="err">{err}</Alert>}
        {loading ? (
          <Skeleton lines={8} />
        ) : (
          <DataTable<QueueItem>
            rows={items}
            search
            csv
            csvName="onay-kuyrugum"
            empty={
              <EmptyState
                icon="checkCircle"
                title="Bekleyen onay yok"
                sub="Rolünüze düşen tüm onay adımları tamamlandı."
              />
            }
            columns={[
              {
                key: 'flowName',
                header: 'Akış',
                sortable: true,
                value: (r) => r.flowName,
                render: (r) => (
                  <button
                    type="button"
                    onClick={() => openDetail(r.id)}
                    style={{
                      background: 'none',
                      border: 0,
                      padding: 0,
                      cursor: 'pointer',
                      color: 'var(--accent)',
                      fontWeight: 700,
                      textAlign: 'left',
                    }}
                  >
                    {r.flowName}
                  </button>
                ),
              },
              {
                key: 'step',
                header: 'Adım',
                sortable: true,
                value: (r) => r.currentStep,
                render: (r) => (
                  <span>
                    {r.currentStep}. {r.stepName}
                    <span className="muted"> · {r.unit}</span>
                  </span>
                ),
              },
              {
                key: 'student',
                header: 'Öğrenci',
                sortable: true,
                value: (r) => r.studentNo ?? r.studentEmail ?? '—',
                render: (r) => (
                  <span>{r.studentNo ?? r.studentEmail ?? <span className="muted">—</span>}</span>
                ),
              },
              {
                key: 'createdAt',
                header: 'Başlangıç',
                sortable: true,
                value: (r) => r.createdAt,
                render: (r) => fmtDate(r.createdAt),
              },
              {
                key: 'elapsedDays',
                header: 'Geçen gün',
                sortable: true,
                num: true,
                value: (r) => r.elapsedDays,
                render: (r) => (
                  <span>
                    {r.elapsedDays}
                    {r.slaDays !== null && <span className="muted"> / {r.slaDays}</span>}
                  </span>
                ),
              },
              {
                key: 'sla',
                header: 'SLA',
                sortable: true,
                value: (r) => (r.slaBreached ? 'Aşıldı' : 'Uygun'),
                render: (r) =>
                  r.slaBreached ? (
                    <Badge tone="danger">SLA aşıldı</Badge>
                  ) : (
                    <span className="muted">—</span>
                  ),
              },
              {
                key: 'detay',
                header: 'İşlem',
                render: (r) => (
                  <Button variant="subtle" sm icon="eye" onClick={() => openDetail(r.id)}>
                    Detay
                  </Button>
                ),
              },
            ]}
          />
        )}
      </Card>

      <Drawer open={!!openId} onClose={closeDetail} title="Onay Detayı">
        {detailErr && <Alert tone="err">{detailErr}</Alert>}
        {!detail ? (
          detailErr ? null : (
            <Skeleton lines={10} />
          )
        ) : (
          <>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{detail.flow?.name ?? 'Akış'}</div>
              <div className="row" style={{ gap: 8, marginTop: 8 }}>
                <Badge tone={STATUS[detail.instance.status]?.tone ?? 'muted'}>
                  {STATUS[detail.instance.status]?.label ?? detail.instance.status}
                </Badge>
                <span className="muted" style={{ fontSize: 12.5 }}>
                  {detail.instance.subjectType} · başlangıç {fmtDate(detail.instance.createdAt)}
                </span>
              </div>
              {(detail.instance.studentNo ?? detail.instance.studentEmail) && (
                <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
                  Öğrenci: {detail.instance.studentNo ?? detail.instance.studentEmail}
                </div>
              )}
            </div>

            <div style={{ marginBottom: 18 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Akış adımları</div>
              {detail.steps.length === 0 ? (
                <div className="muted" style={{ fontSize: 12.5 }}>
                  Adım tanımı yok.
                </div>
              ) : (
                detail.steps.map((s) => {
                  const done = s.stepNo < detail.instance.currentStep;
                  const current = s.stepNo === detail.instance.currentStep;
                  return (
                    <div
                      key={s.id}
                      className="row"
                      style={{
                        gap: 10,
                        padding: '9px 11px',
                        marginBottom: 6,
                        borderRadius: 'var(--r)',
                        border: `1px solid ${current ? 'var(--info-line)' : 'var(--line)'}`,
                        background: current ? 'var(--infobg)' : 'transparent',
                      }}
                    >
                      <Icon
                        name={done ? 'checkCircle' : current ? 'clock' : 'chevronRight'}
                        size={16}
                        style={{
                          color: done
                            ? 'var(--ok)'
                            : current
                              ? 'var(--info)'
                              : 'var(--faint)',
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>
                          {s.stepNo}. {s.name}
                        </div>
                        <div className="muted" style={{ fontSize: 12 }}>
                          {s.unit}
                          {s.roleKey ? ` · ${s.roleKey}` : ''}
                          {s.slaDays !== null ? ` · SLA ${s.slaDays} gün` : ''}
                        </div>
                      </div>
                      {current && <Badge tone="info">Bu adımda</Badge>}
                    </div>
                  );
                })
              )}
            </div>

            <div style={{ marginBottom: 18 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Geçmiş</div>
              {detail.actions.length === 0 ? (
                <div className="muted" style={{ fontSize: 12.5 }}>
                  Henüz aksiyon alınmadı.
                </div>
              ) : (
                detail.actions.map((a) => (
                  <div
                    key={a.id}
                    style={{
                      padding: '9px 11px',
                      marginBottom: 6,
                      borderRadius: 'var(--r)',
                      border: '1px solid var(--line)',
                    }}
                  >
                    <div className="row" style={{ gap: 8 }}>
                      <Badge tone={ACTION_TONE[a.action] ?? 'muted'}>
                        {ACTION_LABEL[a.action] ?? a.action}
                      </Badge>
                      <span style={{ fontSize: 12.5, fontWeight: 600 }}>
                        {a.stepNo}. adım{a.unit ? ` · ${a.unit}` : ''}
                      </span>
                      <span className="muted" style={{ fontSize: 12, marginLeft: 'auto' }}>
                        {fmtDate(a.createdAt)}
                      </span>
                    </div>
                    {a.note && (
                      <div style={{ fontSize: 12.5, marginTop: 6 }}>{a.note}</div>
                    )}
                    {a.actedByEmail && (
                      <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                        {a.actedByEmail}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {active ? (
              <>
                <div className="field">
                  <label>Not (isteğe bağlı)</label>
                  <textarea
                    rows={3}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Karar gerekçesi veya açıklama…"
                  />
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <Button variant="ok" icon="check" disabled={busy} onClick={() => void act('onay')}>
                    Onayla
                  </Button>
                  <Button
                    variant="danger"
                    icon="flag"
                    disabled={busy}
                    onClick={() => void act('red')}
                  >
                    Reddet
                  </Button>
                  <Button
                    variant="subtle"
                    icon="refresh"
                    disabled={busy}
                    onClick={() => void act('iade')}
                  >
                    İade Et
                  </Button>
                </div>
              </>
            ) : (
              <Alert tone="info">Akış kapanmış, yeni aksiyon alınamaz.</Alert>
            )}
          </>
        )}
      </Drawer>
    </>
  );
}
