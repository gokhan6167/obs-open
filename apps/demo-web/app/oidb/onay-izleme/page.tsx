'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import {
  PageHeader,
  Card,
  StatGrid,
  SkeletonStats,
  DataTable,
  Badge,
  Button,
  Alert,
  Skeleton,
  EmptyState,
  Segmented,
  Drawer,
  Donut,
  Icon,
  toast,
  fmtDate,
} from '@/app/ui';

interface Instance {
  id: string;
  flowId: string;
  flowKey: string;
  flowName: string;
  subjectType: string;
  subjectId: string;
  studentId: string | null;
  studentNo: string | null;
  studentEmail: string | null;
  currentStep: number;
  currentStepName: string | null;
  currentStepUnit: string | null;
  status: string;
  createdAt: string;
  closedAt: string | null;
}

interface DetailInstance {
  id: string;
  flowId: string;
  subjectType: string;
  subjectId: string;
  studentId: string | null;
  studentNo: string | null;
  studentEmail: string | null;
  currentStep: number;
  status: string;
  startedByUserId: string | null;
  createdAt: string;
  closedAt: string | null;
}
interface DetailFlow {
  id: string;
  key: string;
  name: string;
  description: string | null;
  active: boolean;
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
  instance: DetailInstance;
  flow: DetailFlow | null;
  steps: DetailStep[];
  actions: DetailAction[];
}

type Scope = 'hepsi' | 'devam' | 'onaylandi' | 'reddedildi';

const SCOPES: { value: Scope; label: string }[] = [
  { value: 'hepsi', label: 'Hepsi' },
  { value: 'devam', label: 'Devam eden' },
  { value: 'onaylandi', label: 'Onaylanan' },
  { value: 'reddedildi', label: 'Reddedilen' },
];

const STATUS_TR: Record<string, string> = {
  devam: 'Devam ediyor',
  onaylandi: 'Onaylandı',
  reddedildi: 'Reddedildi',
  iptal: 'İptal',
};
const STATUS_TONE: Record<string, 'ok' | 'warn' | 'danger' | 'info' | 'muted'> = {
  devam: 'info',
  onaylandi: 'ok',
  reddedildi: 'danger',
  iptal: 'muted',
};

const ACTION_TR: Record<string, string> = {
  onay: 'Onay',
  red: 'Red',
  iade: 'İade',
  not: 'Not',
};
const ACTION_TONE: Record<string, 'ok' | 'warn' | 'danger' | 'info' | 'muted'> = {
  onay: 'ok',
  red: 'danger',
  iade: 'warn',
  not: 'muted',
};

const SUBJECT_TR: Record<string, string> = {
  ders_kayit: 'Ders kaydı',
  ders_ekle_birak: 'Ders ekle-bırak',
  mazeret: 'Mazeret',
  mazeret_sinavi: 'Mazeret sınavı',
  not_itiraz: 'Not itirazı',
  kayit_dondurma: 'Kayıt dondurma',
  izin: 'İzin',
  intibak: 'İntibak',
  yatay_gecis: 'Yatay geçiş',
  cap: 'ÇAP',
  yandal: 'Yandal',
  tez: 'Tez / proje',
  belge: 'Belge talebi',
  mezuniyet: 'Mezuniyet',
  staj: 'Staj',
  degisim: 'Değişim programı',
  burs: 'Burs',
  disiplin: 'Disiplin',
};
const subjectLabel = (t: string): string => SUBJECT_TR[t] ?? t.replace(/_/g, ' ');

export default function OnayIzlemePage(): React.ReactElement {
  const [all, setAll] = useState<Instance[]>([]);
  const [rows, setRows] = useState<Instance[]>([]);
  const [scope, setScope] = useState<Scope>('hepsi');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const [activeId, setActiveId] = useState('');
  const [detail, setDetail] = useState<InstanceDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailErr, setDetailErr] = useState('');

  const load = useCallback(async (s: Scope) => {
    // Durum filtresi sunucuda (?status); istatistikler her zaman tüm kayıtlardan.
    const total = await api<{ items: Instance[] }>('/approval/instances');
    setAll(total.items);
    if (s === 'hepsi') {
      setRows(total.items);
      return;
    }
    const page = await api<{ items: Instance[] }>(
      `/approval/instances?status=${encodeURIComponent(s)}`,
    );
    setRows(page.items);
  }, []);

  useEffect(() => {
    setLoading(true);
    setErr('');
    load(scope)
      .catch((e) => setErr(e instanceof Error ? e.message : 'Onay kayıtları alınamadı'))
      .finally(() => setLoading(false));
  }, [load, scope]);

  async function refresh(): Promise<void> {
    setLoading(true);
    setErr('');
    try {
      await load(scope);
      toast('Onay kayıtları yenilendi', { tone: 'ok' });
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Yenileme başarısız';
      setErr(m);
      toast('Yenileme başarısız', { tone: 'err', body: m });
    } finally {
      setLoading(false);
    }
  }

  function openDetail(r: Instance): void {
    setActiveId(r.id);
    setDetail(null);
    setDetailErr('');
    setDetailLoading(true);
    api<InstanceDetail>(`/approval/instances/${r.id}`)
      .then(setDetail)
      .catch((e) => setDetailErr(e instanceof Error ? e.message : 'Detay alınamadı'))
      .finally(() => setDetailLoading(false));
  }

  const counts = useMemo(
    () => ({
      devam: all.filter((r) => r.status === 'devam').length,
      onaylandi: all.filter((r) => r.status === 'onaylandi').length,
      reddedildi: all.filter((r) => r.status === 'reddedildi').length,
    }),
    [all],
  );
  const closed = counts.onaylandi + counts.reddedildi;
  const pct = (n: number): number => (all.length === 0 ? 0 : (n / all.length) * 100);

  const lastActionByStep = useMemo(() => {
    const m = new Map<number, DetailAction>();
    for (const a of detail?.actions ?? []) m.set(a.stepNo, a);
    return m;
  }, [detail]);

  return (
    <>
      <PageHeader
        title="Onay Akışı İzleme"
        sub="Tüm birimlerdeki onay kayıtlarını, bulundukları adımı ve aksiyon geçmişini izleyin."
        actions={
          <Button variant="ghost" icon="refresh" onClick={refresh} disabled={loading}>
            Yenile
          </Button>
        }
      />

      {loading ? (
        <SkeletonStats n={3} />
      ) : (
        <StatGrid
          stats={[
            {
              label: 'Devam eden',
              value: counts.devam,
              icon: 'clock',
              tone: counts.devam > 0 ? 'warn' : undefined,
            },
            { label: 'Onaylanan', value: counts.onaylandi, icon: 'checkCircle', tone: 'ok' },
            { label: 'Reddedilen', value: counts.reddedildi, icon: 'flag', tone: 'danger' },
          ]}
        />
      )}

      <Card
        title="Durum dağılımı"
        icon="pie"
        hint={`Toplam ${all.length} onay kaydı · ${closed} tanesi sonuçlanmış.`}
      >
        {loading ? (
          <Skeleton lines={3} />
        ) : all.length === 0 ? (
          <EmptyState
            icon="pie"
            title="Dağılım için kayıt yok"
            sub="Henüz başlatılmış bir onay akışı bulunmuyor."
          />
        ) : (
          <div className="row" style={{ gap: 28, flexWrap: 'wrap' }}>
            {(
              [
                { key: 'devam', label: 'Devam ediyor', n: counts.devam, color: 'var(--info)' },
                { key: 'onaylandi', label: 'Onaylandı', n: counts.onaylandi, color: 'var(--ok)' },
                {
                  key: 'reddedildi',
                  label: 'Reddedildi',
                  n: counts.reddedildi,
                  color: 'var(--danger)',
                },
              ] as const
            ).map((d) => (
              <div key={d.key} className="row" style={{ gap: 12, alignItems: 'center' }}>
                <Donut value={pct(d.n)} color={d.color} />
                <div>
                  <div style={{ fontWeight: 600 }}>{d.label}</div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {d.n} kayıt / {all.length}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Onay kayıtları" icon="layers">
        {err && <Alert tone="err">{err}</Alert>}
        <div className="field">
          <label>Durum</label>
          <Segmented value={scope} onChange={setScope} options={SCOPES} />
        </div>
        {loading ? (
          <Skeleton lines={8} />
        ) : (
          <DataTable<Instance>
            rows={rows}
            search
            csv
            csvName="oidb-onay-izleme"
            empty={
              <EmptyState
                icon="inbox"
                title="Onay kaydı bulunamadı"
                sub="Seçili durum için kayıt yok. Filtreyi 'Hepsi' yaparak tümünü görebilirsiniz."
              />
            }
            columns={[
              {
                key: 'flowName',
                header: 'Akış',
                sortable: true,
                value: (r) => r.flowName,
                render: (r) => (
                  <div>
                    <b>{r.flowName}</b>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {r.flowKey}
                    </div>
                  </div>
                ),
              },
              {
                key: 'subjectType',
                header: 'Konu tipi',
                sortable: true,
                value: (r) => subjectLabel(r.subjectType),
              },
              {
                key: 'student',
                header: 'Öğrenci',
                sortable: true,
                value: (r) => r.studentNo ?? '—',
                render: (r) =>
                  r.studentNo ? (
                    <div>
                      <b>{r.studentNo}</b>
                      {r.studentEmail && (
                        <div className="muted" style={{ fontSize: 12 }}>
                          {r.studentEmail}
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="muted">—</span>
                  ),
              },
              {
                key: 'currentStep',
                header: 'Adım',
                sortable: true,
                num: true,
                value: (r) => r.currentStep,
                render: (r) => (
                  <div>
                    <b>{r.currentStep}. adım</b>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {r.currentStepName ?? '—'}
                      {r.currentStepUnit ? ` · ${r.currentStepUnit}` : ''}
                    </div>
                  </div>
                ),
              },
              {
                key: 'status',
                header: 'Durum',
                sortable: true,
                value: (r) => STATUS_TR[r.status] ?? r.status,
                render: (r) => (
                  <Badge tone={STATUS_TONE[r.status] ?? 'muted'}>
                    {STATUS_TR[r.status] ?? r.status}
                  </Badge>
                ),
              },
              {
                key: 'createdAt',
                header: 'Tarih',
                sortable: true,
                value: (r) => r.createdAt,
                render: (r) => (
                  <div>
                    {fmtDate(r.createdAt)}
                    {r.closedAt && (
                      <div className="muted" style={{ fontSize: 12 }}>
                        Kapanış: {fmtDate(r.closedAt)}
                      </div>
                    )}
                  </div>
                ),
              },
              {
                key: 'action',
                header: 'İşlem',
                render: (r) => (
                  <Button variant="subtle" sm icon="eye" onClick={() => openDetail(r)}>
                    Detay
                  </Button>
                ),
              },
            ]}
          />
        )}
      </Card>

      <Drawer
        open={activeId !== ''}
        onClose={() => setActiveId('')}
        title={detail?.flow?.name ?? 'Onay kaydı'}
      >
        {detailErr && <Alert tone="err">{detailErr}</Alert>}
        {detailLoading && <Skeleton lines={6} />}
        {!detailLoading && detail && (
          <>
            <div className="field">
              <label>Durum</label>
              <div className="row" style={{ gap: 8 }}>
                <Badge tone={STATUS_TONE[detail.instance.status] ?? 'muted'}>
                  {STATUS_TR[detail.instance.status] ?? detail.instance.status}
                </Badge>
                <span className="chip">{detail.instance.currentStep}. adımda</span>
              </div>
            </div>
            <div className="field">
              <label>Konu tipi</label>
              <div>{subjectLabel(detail.instance.subjectType)}</div>
            </div>
            <div className="field">
              <label>Öğrenci</label>
              <div>
                {detail.instance.studentNo ? (
                  <>
                    <b>{detail.instance.studentNo}</b>
                    {detail.instance.studentEmail ? ` · ${detail.instance.studentEmail}` : ''}
                  </>
                ) : (
                  <span className="muted">Öğrenciye bağlı değil</span>
                )}
              </div>
            </div>
            <div className="field">
              <label>Başlangıç / kapanış</label>
              <div>
                {fmtDate(detail.instance.createdAt)}
                {detail.instance.closedAt ? ` → ${fmtDate(detail.instance.closedAt)}` : ' → devam'}
              </div>
            </div>
            {detail.flow?.description && (
              <div className="field">
                <label>Akış açıklaması</label>
                <div style={{ whiteSpace: 'pre-wrap' }}>{detail.flow.description}</div>
              </div>
            )}

            <div className="field">
              <label>Onay zinciri</label>
              {detail.steps.length === 0 ? (
                <EmptyState icon="layers" title="Adım tanımlı değil" />
              ) : (
                <div>
                  {detail.steps.map((s) => {
                    const done =
                      detail.instance.status === 'onaylandi' ||
                      s.stepNo < detail.instance.currentStep;
                    const current =
                      detail.instance.status === 'devam' && s.stepNo === detail.instance.currentStep;
                    const last = lastActionByStep.get(s.stepNo);
                    return (
                      <div key={s.id} className="list-item">
                        <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
                          <div
                            className="li-ico"
                            style={{
                              color: done
                                ? 'var(--ok)'
                                : current
                                  ? 'var(--info)'
                                  : 'var(--muted)',
                            }}
                          >
                            <Icon name={done ? 'check' : current ? 'clock' : 'chevronRight'} />
                          </div>
                          <div className="li-main">
                            <b>
                              {s.stepNo}. {s.name}
                            </b>
                            <div className="meta">
                              {s.unit}
                              {s.roleKey ? ` · ${s.roleKey}` : ''}
                              {s.slaDays !== null ? ` · SLA ${s.slaDays} gün` : ''}
                            </div>
                            {last && (
                              <div className="meta">
                                Son aksiyon: {ACTION_TR[last.action] ?? last.action} ·{' '}
                                {fmtDate(last.createdAt)}
                              </div>
                            )}
                          </div>
                        </div>
                        {current ? (
                          <Badge tone="info">Bekliyor</Badge>
                        ) : done ? (
                          <Badge tone="ok">Tamam</Badge>
                        ) : (
                          <Badge tone="muted">Sırada</Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="field" style={{ marginBottom: 0 }}>
              <label>Aksiyon geçmişi</label>
              {detail.actions.length === 0 ? (
                <EmptyState
                  icon="activity"
                  title="Henüz aksiyon yok"
                  sub="Bu onay kaydında hiçbir birim işlem yapmamış."
                />
              ) : (
                <div>
                  {detail.actions.map((a) => (
                    <div key={a.id} className="list-item">
                      <div className="li-main">
                        <div className="row" style={{ gap: 8 }}>
                          <Badge tone={ACTION_TONE[a.action] ?? 'muted'}>
                            {ACTION_TR[a.action] ?? a.action}
                          </Badge>
                          <b>
                            {a.stepNo}. adım
                            {a.unit ? ` · ${a.unit}` : ''}
                          </b>
                        </div>
                        {a.note && (
                          <div className="meta" style={{ whiteSpace: 'pre-wrap' }}>
                            {a.note}
                          </div>
                        )}
                        <div className="meta">{a.actedByEmail ?? 'Bilinmiyor'}</div>
                      </div>
                      <div className="muted" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>
                        {fmtDate(a.createdAt)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </Drawer>
    </>
  );
}
