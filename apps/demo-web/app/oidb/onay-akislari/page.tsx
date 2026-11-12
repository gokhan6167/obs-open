'use client';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import {
  PageHeader,
  Card,
  StatGrid,
  DataTable,
  Badge,
  Button,
  Alert,
  Skeleton,
  SkeletonStats,
  Drawer,
  EmptyState,
  toast,
  fmtDate,
} from '@/app/ui';

/* ---------------------------- Tipler ---------------------------- */
interface Flow {
  id: string;
  key: string;
  name: string;
  description: string | null;
  active: boolean;
  createdAt: string;
  stepCount: number;
}
interface Step {
  id: string;
  stepNo: number;
  unit: string;
  roleKey: string | null;
  name: string;
  slaDays: number | null;
  createdAt: string;
}

const UNITS: { value: string; label: string }[] = [
  { value: 'cozum_merkezi', label: 'Çözüm Merkezi' },
  { value: 'cari', label: 'Cari / Muhasebe' },
  { value: 'akademik_birim', label: 'Akademik Birim' },
  { value: 'oidb', label: 'Öğrenci İşleri (ÖİDB)' },
  { value: 'dekanlik', label: 'Dekanlık' },
  { value: 'mali_isler', label: 'Mali İşler' },
];
const ROLES: { value: string; label: string }[] = [
  { value: '', label: 'Herkes (rol kısıtı yok)' },
  { value: 'oidb', label: 'ÖİDB' },
  { value: 'mali_isler', label: 'Mali İşler' },
  { value: 'dekanlik', label: 'Dekanlık' },
  { value: 'bolum_baskani', label: 'Bölüm Başkanı' },
  { value: 'fakulte_sekreteri', label: 'Fakülte Sekreteri' },
  { value: 'koordinator', label: 'Koordinatör' },
  { value: 'rektorluk', label: 'Rektörlük' },
  { value: 'sistem_yoneticisi', label: 'Sistem Yöneticisi' },
];

const unitLabel = (u: string): string => UNITS.find((x) => x.value === u)?.label ?? u;
const roleLabel = (r: string | null): string =>
  !r ? 'Herkes' : (ROLES.find((x) => x.value === r)?.label ?? r);

// Öğrenci talebi otomatik başlatma kuralı: akış key'i "sr_<talep_turu>" olmalı.
const AUTO_RE = /^sr_[a-z0-9_]+$/;
const isAuto = (key: string): boolean => AUTO_RE.test(key);

/** Adımları 1 → 2 → 3 biçiminde görsel zincir olarak gösterir. */
function StepChain({ steps }: { steps: Step[] }): React.ReactElement {
  if (steps.length === 0) {
    return <p className="muted">Henüz adım tanımlanmamış.</p>;
  }
  return (
    <div className="row" style={{ gap: 8, alignItems: 'stretch', marginBottom: 0 }}>
      {steps.map((s, i) => (
        <Fragment key={s.id}>
          <div
            style={{
              minWidth: 150,
              padding: '10px 12px',
              borderRadius: 'var(--r)',
              border: '1px solid var(--line)',
              background: 'var(--card-2)',
            }}
          >
            <div className="row" style={{ gap: 6, marginBottom: 6 }}>
              <Badge tone="info" noDot>
                {s.stepNo}
              </Badge>
              <b style={{ fontSize: 13 }}>{s.name}</b>
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              {unitLabel(s.unit)} · {roleLabel(s.roleKey)}
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              SLA: {s.slaDays === null ? '—' : `${s.slaDays} gün`}
            </div>
          </div>
          {i < steps.length - 1 && (
            <span className="muted" style={{ alignSelf: 'center', fontSize: 18 }}>
              →
            </span>
          )}
        </Fragment>
      ))}
    </div>
  );
}

export default function OnayAkislariPage(): React.ReactElement {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const [selected, setSelected] = useState<Flow | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [stepsLoading, setStepsLoading] = useState(false);
  const [stepsErr, setStepsErr] = useState('');

  const [flowOpen, setFlowOpen] = useState(false);
  const [stepOpen, setStepOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [fKey, setFKey] = useState('sr_');
  const [fName, setFName] = useState('');
  const [fDesc, setFDesc] = useState('');

  const [sNo, setSNo] = useState('1');
  const [sUnit, setSUnit] = useState('oidb');
  const [sRole, setSRole] = useState('');
  const [sName, setSName] = useState('');
  const [sSla, setSSla] = useState('3');

  const loadFlows = useCallback(async (): Promise<Flow[]> => {
    const res = await api<{ items: Flow[] }>('/approval/flows');
    const items = res.items ?? [];
    setFlows(items);
    return items;
  }, []);

  useEffect(() => {
    loadFlows()
      .catch((e) => setErr(e instanceof Error ? e.message : 'Akışlar yüklenemedi'))
      .finally(() => setLoading(false));
  }, [loadFlows]);

  const loadSteps = useCallback(async (flowId: string): Promise<Step[]> => {
    const res = await api<{ items: Step[] }>(`/approval/flows/${flowId}/steps`);
    const items = res.items ?? [];
    setSteps(items);
    return items;
  }, []);

  function selectFlow(f: Flow): void {
    setSelected(f);
    setSteps([]);
    setStepsErr('');
    setStepsLoading(true);
    loadSteps(f.id)
      .catch((e) => setStepsErr(e instanceof Error ? e.message : 'Adımlar yüklenemedi'))
      .finally(() => setStepsLoading(false));
  }

  async function createFlow(): Promise<void> {
    if (!fKey.trim() || !fName.trim()) return;
    setBusy(true);
    setErr('');
    try {
      const created = await api<Flow>('/approval/flows', {
        method: 'POST',
        body: {
          key: fKey.trim(),
          name: fName.trim(),
          ...(fDesc.trim() ? { description: fDesc.trim() } : {}),
        },
      });
      toast('Onay akışı tanımlandı', { tone: 'ok', body: `${created.key} · ${created.name}` });
      setFlowOpen(false);
      setFKey('sr_');
      setFName('');
      setFDesc('');
      const items = await loadFlows();
      const fresh = items.find((x) => x.id === created.id);
      if (fresh) selectFlow(fresh);
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Akış oluşturulamadı';
      setErr(m);
      toast('Akış oluşturulamadı', { tone: 'err', body: m });
    } finally {
      setBusy(false);
    }
  }

  async function createStep(): Promise<void> {
    if (!selected || !sName.trim()) return;
    const stepNo = Number(sNo);
    const slaDays = sSla.trim() === '' ? undefined : Number(sSla);
    if (!Number.isInteger(stepNo) || stepNo < 1) {
      setStepsErr('Adım no 1 veya daha büyük bir tam sayı olmalı');
      return;
    }
    setBusy(true);
    setStepsErr('');
    try {
      await api(`/approval/flows/${selected.id}/steps`, {
        method: 'POST',
        body: {
          stepNo,
          unit: sUnit,
          ...(sRole ? { roleKey: sRole } : {}),
          name: sName.trim(),
          ...(slaDays === undefined ? {} : { slaDays }),
        },
      });
      toast('Adım eklendi', {
        tone: 'ok',
        body: `${stepNo}. adım · ${unitLabel(sUnit)} · ${sName.trim()}`,
      });
      setStepOpen(false);
      setSName('');
      setSRole('');
      const items = await loadSteps(selected.id);
      setSNo(String((items.at(-1)?.stepNo ?? 0) + 1));
      await loadFlows();
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Adım eklenemedi';
      setStepsErr(m);
      toast('Adım eklenemedi', { tone: 'err', body: m });
    } finally {
      setBusy(false);
    }
  }

  function openStepDrawer(): void {
    setSNo(String((steps.at(-1)?.stepNo ?? 0) + 1));
    setStepOpen(true);
  }

  const stats = useMemo(
    () => ({
      total: flows.length,
      active: flows.filter((f) => f.active).length,
      auto: flows.filter((f) => isAuto(f.key)).length,
      empty: flows.filter((f) => f.stepCount === 0).length,
    }),
    [flows],
  );

  return (
    <>
      <PageHeader
        title="Onay Akışları"
        sub="Çok birimli onay süreçlerini tanımlayın; her akış sıralı adımlardan oluşur."
        actions={
          <Button icon="edit" onClick={() => setFlowOpen(true)}>
            Yeni akış
          </Button>
        }
      />

      {loading ? (
        <SkeletonStats n={4} />
      ) : (
        <StatGrid
          stats={[
            { label: 'Tanımlı akış', value: stats.total, icon: 'layers' },
            { label: 'Aktif', value: stats.active, icon: 'checkCircle', tone: 'ok' },
            { label: 'Otomatik başlayan', value: stats.auto, icon: 'activity' },
            {
              label: 'Adımsız akış',
              value: stats.empty,
              icon: 'alert',
              tone: stats.empty > 0 ? 'warn' : undefined,
            },
          ]}
        />
      )}

      <Card title="Otomatik başlatma kuralı" icon="info">
        <p className="hint" style={{ marginTop: 0 }}>
          Akış anahtarı <b>sr_&lt;talep_turu&gt;</b> biçimindeyse (örn.{' '}
          <b>sr_kayit_dondurma</b>), öğrenci o türde bir talep oluşturduğunda onay süreci
          otomatik başlar ve 1. adımdaki birimin kuyruğuna düşer. Diğer anahtarlar yalnızca
          elle başlatılır.
        </p>
        <div className="row" style={{ marginBottom: 0 }}>
          <span className="chip">sr_kayit_dondurma</span>
          <span className="chip">sr_mazeret_sinavi</span>
          <span className="chip">sr_belge</span>
        </div>
      </Card>

      <Card title="Tanımlı akışlar" icon="layers">
        {err && <Alert tone="err">{err}</Alert>}
        {loading ? (
          <Skeleton lines={6} />
        ) : (
          <DataTable<Flow>
            rows={flows}
            search
            csv
            csvName="onay-akislari"
            empty={
              <EmptyState
                icon="layers"
                title="Henüz onay akışı yok"
                sub="İlk akışı tanımlayın, ardından sıralı adımlarını ekleyin."
                action={
                  <Button icon="edit" onClick={() => setFlowOpen(true)}>
                    Yeni akış
                  </Button>
                }
              />
            }
            columns={[
              {
                key: 'key',
                header: 'Anahtar',
                sortable: true,
                value: (f) => f.key,
                render: (f) => (
                  <div className="row" style={{ gap: 6, marginBottom: 0 }}>
                    <b>{f.key}</b>
                    {isAuto(f.key) && (
                      <Badge tone="info" noDot>
                        Otomatik
                      </Badge>
                    )}
                  </div>
                ),
              },
              { key: 'name', header: 'Ad', sortable: true, value: (f) => f.name },
              {
                key: 'stepCount',
                header: 'Adım sayısı',
                sortable: true,
                num: true,
                value: (f) => f.stepCount,
                render: (f) =>
                  f.stepCount === 0 ? (
                    <Badge tone="warn">0</Badge>
                  ) : (
                    <span>{f.stepCount}</span>
                  ),
              },
              {
                key: 'active',
                header: 'Durum',
                sortable: true,
                value: (f) => (f.active ? 'Aktif' : 'Pasif'),
                render: (f) => (
                  <Badge tone={f.active ? 'ok' : 'muted'}>{f.active ? 'Aktif' : 'Pasif'}</Badge>
                ),
              },
              {
                key: 'createdAt',
                header: 'Tanım tarihi',
                sortable: true,
                value: (f) => f.createdAt,
                render: (f) => fmtDate(f.createdAt),
              },
              {
                key: 'action',
                header: 'İşlem',
                render: (f) => (
                  <Button
                    variant={selected?.id === f.id ? 'primary' : 'ghost'}
                    sm
                    icon="eye"
                    onClick={() => selectFlow(f)}
                  >
                    Adımlar
                  </Button>
                ),
              },
            ]}
          />
        )}
      </Card>

      {selected && (
        <Card
          title={`Adımlar · ${selected.name}`}
          icon="activity"
          hint={
            <span>
              {selected.key}
              {selected.description ? ` — ${selected.description}` : ''}
            </span>
          }
          actions={
            <Button icon="edit" sm onClick={openStepDrawer}>
              Yeni adım
            </Button>
          }
        >
          {stepsErr && <Alert tone="err">{stepsErr}</Alert>}
          {isAuto(selected.key) && (
            <Alert tone="info">
              Bu akış <b>{selected.key}</b> anahtarıyla öğrenci talebi oluştuğunda otomatik
              başlar.
            </Alert>
          )}
          {stepsLoading ? (
            <Skeleton lines={6} />
          ) : steps.length === 0 ? (
            <EmptyState
              icon="activity"
              title="Bu akışta adım yok"
              sub="Akışın işleyebilmesi için en az bir adım tanımlanmalı."
              action={
                <Button icon="edit" onClick={openStepDrawer}>
                  Yeni adım
                </Button>
              }
            />
          ) : (
            <>
              <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
                <StepChain steps={steps} />
              </div>
              <DataTable<Step>
                rows={steps}
                search={false}
                pageSize={50}
                columns={[
                  {
                    key: 'stepNo',
                    header: 'Adım',
                    num: true,
                    value: (s) => s.stepNo,
                    render: (s) => <b>{s.stepNo}</b>,
                  },
                  { key: 'unit', header: 'Birim', value: (s) => unitLabel(s.unit) },
                  {
                    key: 'roleKey',
                    header: 'Rol',
                    value: (s) => roleLabel(s.roleKey),
                    render: (s) => (
                      <Badge tone={s.roleKey ? 'info' : 'muted'} noDot>
                        {roleLabel(s.roleKey)}
                      </Badge>
                    ),
                  },
                  { key: 'name', header: 'Adım adı', value: (s) => s.name },
                  {
                    key: 'slaDays',
                    header: 'SLA (gün)',
                    num: true,
                    value: (s) => s.slaDays ?? 0,
                    render: (s) =>
                      s.slaDays === null ? (
                        <span className="muted">—</span>
                      ) : (
                        <span>{s.slaDays} gün</span>
                      ),
                  },
                ]}
              />
            </>
          )}
        </Card>
      )}

      <Drawer open={flowOpen} onClose={() => setFlowOpen(false)} title="Yeni onay akışı">
        <div className="field">
          <label>Anahtar (key)</label>
          <input
            value={fKey}
            onChange={(e) => setFKey(e.target.value)}
            placeholder="sr_kayit_dondurma"
          />
          <div className="hint-sm">
            {isAuto(fKey)
              ? 'Öğrenci talebi oluşunca bu akış otomatik başlar.'
              : 'sr_<talep_turu> biçiminde değil; akış yalnızca elle başlatılır.'}
          </div>
        </div>
        <div className="field">
          <label>Akış adı</label>
          <input
            value={fName}
            onChange={(e) => setFName(e.target.value)}
            placeholder="Kayıt Dondurma Onay Süreci"
          />
        </div>
        <div className="field">
          <label>Açıklama (opsiyonel)</label>
          <textarea
            rows={3}
            value={fDesc}
            onChange={(e) => setFDesc(e.target.value)}
            placeholder="Sürecin kapsamı ve hangi birimlerden geçtiği"
          />
        </div>
        <div className="row" style={{ marginBottom: 0 }}>
          <Button disabled={busy || !fKey.trim() || !fName.trim()} onClick={createFlow}>
            {busy ? 'Kaydediliyor…' : 'Akışı oluştur'}
          </Button>
          <Button variant="ghost" onClick={() => setFlowOpen(false)}>
            Vazgeç
          </Button>
        </div>
      </Drawer>

      <Drawer
        open={stepOpen}
        onClose={() => setStepOpen(false)}
        title={selected ? `Yeni adım · ${selected.name}` : undefined}
      >
        <div className="field">
          <label>Adım no</label>
          <input
            type="number"
            min={1}
            value={sNo}
            onChange={(e) => setSNo(e.target.value)}
          />
          <div className="hint-sm">Aynı akışta tekrar eden adım no kabul edilmez.</div>
        </div>
        <div className="field">
          <label>Birim</label>
          <select value={sUnit} onChange={(e) => setSUnit(e.target.value)}>
            {UNITS.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Rol</label>
          <select value={sRole} onChange={(e) => setSRole(e.target.value)}>
            {ROLES.map((r) => (
              <option key={r.value || 'all'} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <div className="hint-sm">Boş bırakılırsa adımı birimdeki herkes karara bağlayabilir.</div>
        </div>
        <div className="field">
          <label>Adım adı</label>
          <input
            value={sName}
            onChange={(e) => setSName(e.target.value)}
            placeholder="Danışman görüşü"
          />
        </div>
        <div className="field">
          <label>SLA (gün, opsiyonel)</label>
          <input type="number" min={0} value={sSla} onChange={(e) => setSSla(e.target.value)} />
          <div className="hint-sm">Süre aşılırsa onay kuyruğunda gecikme olarak işaretlenir.</div>
        </div>
        <div className="row" style={{ marginBottom: 0 }}>
          <Button disabled={busy || !sName.trim()} onClick={createStep}>
            {busy ? 'Kaydediliyor…' : 'Adımı ekle'}
          </Button>
          <Button variant="ghost" onClick={() => setStepOpen(false)}>
            Vazgeç
          </Button>
        </div>
      </Drawer>
    </>
  );
}
