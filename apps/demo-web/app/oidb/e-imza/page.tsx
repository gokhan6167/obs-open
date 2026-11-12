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
  Segmented,
  Skeleton,
  EmptyState,
  Icon,
  toast,
  fmtDate,
} from '@/app/ui';

type Tab = 'bekleyen' | 'tum';
type StatusKey = 'hepsi' | 'bekliyor' | 'imzalandi' | 'reddedildi';
type SubjectKey = 'diploma' | 'belge_talebi' | 'yazi';
type Decision = 'sign' | 'reject';

interface Signature {
  id: string;
  subjectType: string;
  subjectId: string | null;
  title: string;
  signerUserId: string | null;
  signerName: string | null;
  signerEmail: string | null;
  seq: number;
  status: string;
  signedAt: string | null;
  ebysRef: string | null;
  note: string | null;
  createdAt: string;
}

interface Chain {
  subjectType: string;
  subjectId: string;
  title: string;
  status: string;
  pendingSeq: number | null;
  items: Signature[];
}

interface Advisor {
  userId: string;
  email: string;
}

const STATUS_TR: Record<string, { label: string; tone: 'ok' | 'warn' | 'danger' | 'info' | 'muted' }> = {
  bekliyor: { label: 'Bekliyor', tone: 'warn' },
  imzalandi: { label: 'İmzalandı', tone: 'ok' },
  reddedildi: { label: 'Reddedildi', tone: 'danger' },
  devam: { label: 'Devam ediyor', tone: 'info' },
  tamamlandi: { label: 'Tamamlandı', tone: 'ok' },
};

const SUBJECT_TR: Record<string, string> = {
  diploma: 'Diploma',
  belge_talebi: 'Belge talebi',
  yazi: 'Yazı',
};

const SUBJECT_OPTIONS: SubjectKey[] = ['diploma', 'belge_talebi', 'yazi'];

const STATUS_OPTIONS: { value: StatusKey; label: string }[] = [
  { value: 'hepsi', label: 'Tüm durumlar' },
  { value: 'bekliyor', label: 'Bekliyor' },
  { value: 'imzalandi', label: 'İmzalandı' },
  { value: 'reddedildi', label: 'Reddedildi' },
];

const subjectLabel = (t: string): string => SUBJECT_TR[t] ?? t;
const statusInfo = (s: string): { label: string; tone: 'ok' | 'warn' | 'danger' | 'info' | 'muted' } =>
  STATUS_TR[s] ?? { label: s, tone: 'muted' };
const signerLabel = (r: Signature): string => r.signerEmail ?? r.signerName ?? '—';
const msg = (e: unknown, fallback: string): string => (e instanceof Error ? e.message : fallback);

export default function EImzaPage(): React.ReactElement {
  const [tab, setTab] = useState<Tab>('bekleyen');

  const [pending, setPending] = useState<Signature[]>([]);
  const [rows, setRows] = useState<Signature[]>([]);
  const [counts, setCounts] = useState({ bekliyor: 0, imzalandi: 0, reddedildi: 0 });
  const [status, setStatus] = useState<StatusKey>('hepsi');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  /* Karar (imzala / reddet) çekmecesi */
  const [decideOn, setDecideOn] = useState<Signature | null>(null);
  const [decision, setDecision] = useState<Decision>('sign');
  const [note, setNote] = useState('');
  const [decideErr, setDecideErr] = useState('');
  const [busy, setBusy] = useState(false);

  /* Yeni imza akışı çekmecesi */
  const [newOpen, setNewOpen] = useState(false);
  const [subjectType, setSubjectType] = useState<SubjectKey>('diploma');
  const [title, setTitle] = useState('');
  const [signers, setSigners] = useState<string[]>([]);
  const [advisors, setAdvisors] = useState<Advisor[]>([]);
  const [newErr, setNewErr] = useState('');

  /* İmza zinciri çekmecesi */
  const [chainOpen, setChainOpen] = useState(false);
  const [chain, setChain] = useState<Chain | null>(null);
  const [chainErr, setChainErr] = useState('');

  const loadPending = useCallback(async () => {
    const res = await api<{ items: Signature[] }>('/signatures/pending');
    setPending(res.items ?? []);
  }, []);

  const loadDocs = useCallback(async (s: StatusKey) => {
    const all = await api<{ items: Signature[] }>('/signatures');
    const items = all.items ?? [];
    setCounts({
      bekliyor: items.filter((i) => i.status === 'bekliyor').length,
      imzalandi: items.filter((i) => i.status === 'imzalandi').length,
      reddedildi: items.filter((i) => i.status === 'reddedildi').length,
    });
    if (s === 'hepsi') {
      setRows(items);
      return;
    }
    const filtered = await api<{ items: Signature[] }>(`/signatures?status=${s}`);
    setRows(filtered.items ?? []);
  }, []);

  const reload = useCallback(
    async (s: StatusKey) => {
      await Promise.all([loadPending(), loadDocs(s)]);
    },
    [loadPending, loadDocs],
  );

  useEffect(() => {
    setErr('');
    setLoading(true);
    reload(status)
      .catch((e) => setErr(msg(e, 'İmza kayıtları yüklenemedi')))
      .finally(() => setLoading(false));
  }, [reload, status]);

  const stats = useMemo(
    () => [
      {
        label: 'Bekleyen imza',
        value: counts.bekliyor,
        icon: 'clock',
        tone: counts.bekliyor > 0 ? ('warn' as const) : undefined,
      },
      { label: 'İmzalanan', value: counts.imzalandi, icon: 'checkCircle' },
      {
        label: 'Reddedilen',
        value: counts.reddedildi,
        icon: 'flag',
        tone: counts.reddedildi > 0 ? ('danger' as const) : undefined,
      },
    ],
    [counts],
  );

  function openDecide(row: Signature, kind: Decision): void {
    setDecideOn(row);
    setDecision(kind);
    setNote('');
    setDecideErr('');
  }

  function closeDecide(): void {
    setDecideOn(null);
    setNote('');
    setDecideErr('');
  }

  async function submitDecision(): Promise<void> {
    if (!decideOn) return;
    const trimmed = note.trim();
    if (decision === 'reject' && !trimmed) {
      setDecideErr('Red için gerekçe zorunludur.');
      return;
    }
    setBusy(true);
    setDecideErr('');
    try {
      await api(`/signatures/${decideOn.id}/${decision === 'sign' ? 'sign' : 'reject'}`, {
        method: 'POST',
        body: decision === 'sign' ? { note: trimmed || undefined } : { note: trimmed },
      });
      toast(decision === 'sign' ? 'Belge imzalandı' : 'İmza reddedildi', {
        tone: decision === 'sign' ? 'ok' : 'err',
        body: decideOn.title,
      });
      closeDecide();
      await reload(status);
    } catch (e) {
      const m = msg(e, 'İşlem başarısız');
      setDecideErr(m);
      toast('İşlem başarısız', { tone: 'err', body: m });
    } finally {
      setBusy(false);
    }
  }

  function openNew(): void {
    setNewOpen(true);
    setNewErr('');
    setSubjectType('diploma');
    setTitle('');
    setSigners([]);
    if (advisors.length === 0) {
      api<{ items: Advisor[] }>('/students/advisors')
        .then((r) => setAdvisors(r.items ?? []))
        .catch((e) => setNewErr(msg(e, 'Personel listesi alınamadı')));
    }
  }

  function toggleSigner(userId: string): void {
    setSigners((prev) => (prev.includes(userId) ? prev.filter((s) => s !== userId) : [...prev, userId]));
  }

  async function createChain(): Promise<void> {
    if (!title.trim()) {
      setNewErr('Belge başlığı zorunludur.');
      return;
    }
    if (signers.length === 0) {
      setNewErr('En az bir imzacı seçin.');
      return;
    }
    setBusy(true);
    setNewErr('');
    try {
      await api('/signatures', {
        method: 'POST',
        body: {
          subjectType,
          title: title.trim(),
          signers: signers.map((signerUserId) => ({ signerUserId })),
        },
      });
      toast('İmza akışı başlatıldı', { tone: 'ok', body: `${signers.length} imzacı sıraya alındı.` });
      setNewOpen(false);
      await reload(status);
    } catch (e) {
      const m = msg(e, 'İmza akışı oluşturulamadı');
      setNewErr(m);
      toast('İmza akışı oluşturulamadı', { tone: 'err', body: m });
    } finally {
      setBusy(false);
    }
  }

  function openChain(row: Signature): void {
    if (!row.subjectId) {
      toast('Zincir görüntülenemiyor', { tone: 'err', body: 'Bu kaydın konu kimliği yok.' });
      return;
    }
    setChainOpen(true);
    setChain(null);
    setChainErr('');
    api<Chain>(`/signatures/subject/${row.subjectType}/${row.subjectId}`)
      .then(setChain)
      .catch((e) => setChainErr(msg(e, 'İmza zinciri alınamadı')));
  }

  return (
    <>
      <PageHeader
        title="E-İmza / EBYS"
        sub="Sıralı elektronik imza akışları: imza kuyruğunuz, belge geçmişi ve yeni akış başlatma."
        actions={
          <div className="row" style={{ gap: 8 }}>
            <Button
              variant="subtle"
              icon="refresh"
              onClick={() => {
                setErr('');
                void reload(status).catch((e) => setErr(msg(e, 'Yenilenemedi')));
              }}
            >
              Yenile
            </Button>
            <Button icon="edit" onClick={openNew}>
              Yeni İmza Akışı
            </Button>
          </div>
        }
      />

      {loading ? <Skeleton lines={3} /> : <StatGrid stats={stats} />}

      <div style={{ margin: '16px 0' }}>
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'bekleyen', label: `Bekleyen İmzalarım${pending.length ? ` (${pending.length})` : ''}` },
            { value: 'tum', label: 'Tüm Belgeler' },
          ]}
        />
      </div>

      {err && <Alert tone="err">{err}</Alert>}

      {tab === 'bekleyen' ? (
        <Card title="İmzanızı bekleyen belgeler" icon="inbox" hint="Sıra sizdeyken imzalayabilirsiniz.">
          {loading ? (
            <Skeleton lines={6} />
          ) : pending.length === 0 ? (
            <EmptyState
              icon="checkCircle"
              title="Bekleyen imza yok"
              sub="Size düşen tüm belgeler karara bağlanmış durumda."
            />
          ) : (
            pending.map((p) => (
              <div
                key={p.id}
                style={{
                  padding: '12px 14px',
                  marginBottom: 8,
                  borderRadius: 'var(--r)',
                  border: '1px solid var(--line)',
                  background: 'var(--card-2)',
                }}
              >
                <div className="row" style={{ gap: 10 }}>
                  <Icon name="fileText" size={16} style={{ color: 'var(--accent)' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>{p.title}</div>
                    <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>
                      {subjectLabel(p.subjectType)} · {p.seq}. sıra · oluşturma {fmtDate(p.createdAt)}
                    </div>
                  </div>
                  <Badge tone="warn">Sıra sizde</Badge>
                </div>
                <div className="row" style={{ gap: 8, marginTop: 10 }}>
                  <Button variant="ok" sm icon="check" onClick={() => openDecide(p, 'sign')}>
                    İmzala
                  </Button>
                  <Button variant="danger" sm icon="x" onClick={() => openDecide(p, 'reject')}>
                    Reddet
                  </Button>
                  {p.subjectId && (
                    <Button variant="subtle" sm icon="layers" onClick={() => openChain(p)}>
                      Zincir
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </Card>
      ) : (
        <Card
          title="Tüm imza kayıtları"
          icon="layers"
          actions={
            <select
              className="input"
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusKey)}
              style={{ width: 170 }}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          }
        >
          {loading ? (
            <Skeleton lines={8} />
          ) : (
            <DataTable<Signature>
              rows={rows}
              search
              csv
              csvName="e-imza-kayitlari"
              empty={
                <EmptyState
                  icon="fileText"
                  title="İmza kaydı yok"
                  sub="Seçili duruma uyan belge bulunamadı."
                />
              }
              columns={[
                {
                  key: 'title',
                  header: 'Başlık',
                  sortable: true,
                  value: (r) => r.title,
                  render: (r) =>
                    r.subjectId ? (
                      <button
                        type="button"
                        onClick={() => openChain(r)}
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
                        {r.title}
                      </button>
                    ) : (
                      <span style={{ fontWeight: 600 }}>{r.title}</span>
                    ),
                },
                {
                  key: 'subjectType',
                  header: 'Konu',
                  sortable: true,
                  value: (r) => subjectLabel(r.subjectType),
                  render: (r) => subjectLabel(r.subjectType),
                },
                {
                  key: 'signer',
                  header: 'İmzacı',
                  sortable: true,
                  value: (r) => signerLabel(r),
                  render: (r) => <span>{signerLabel(r)}</span>,
                },
                {
                  key: 'seq',
                  header: 'Sıra',
                  sortable: true,
                  num: true,
                  value: (r) => r.seq,
                  render: (r) => r.seq,
                },
                {
                  key: 'status',
                  header: 'Durum',
                  sortable: true,
                  value: (r) => statusInfo(r.status).label,
                  render: (r) => <Badge tone={statusInfo(r.status).tone}>{statusInfo(r.status).label}</Badge>,
                },
                {
                  key: 'signedAt',
                  header: 'İmza tarihi',
                  sortable: true,
                  value: (r) => r.signedAt ?? '',
                  render: (r) => (r.signedAt ? fmtDate(r.signedAt) : <span className="muted">—</span>),
                },
                {
                  key: 'ebysRef',
                  header: 'EBYS ref',
                  sortable: true,
                  value: (r) => r.ebysRef ?? '',
                  render: (r) => (r.ebysRef ? <code>{r.ebysRef}</code> : <span className="muted">—</span>),
                },
              ]}
            />
          )}
        </Card>
      )}

      <Drawer
        open={!!decideOn}
        onClose={closeDecide}
        title={decision === 'sign' ? 'Belgeyi İmzala' : 'İmzayı Reddet'}
      >
        {decideOn && (
          <>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{decideOn.title}</div>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 5 }}>
                {subjectLabel(decideOn.subjectType)} · {decideOn.seq}. imzacı
              </div>
            </div>

            {decideErr && <Alert tone="err">{decideErr}</Alert>}

            <div className="field">
              <label>{decision === 'sign' ? 'Not (isteğe bağlı)' : 'Red gerekçesi (zorunlu)'}</label>
              <textarea
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={decision === 'sign' ? 'İmza şerhi veya açıklama…' : 'Reddetme gerekçesi…'}
              />
            </div>

            <div className="row" style={{ gap: 8 }}>
              <Button
                variant={decision === 'sign' ? 'ok' : 'danger'}
                icon={decision === 'sign' ? 'check' : 'x'}
                disabled={busy}
                onClick={() => void submitDecision()}
              >
                {decision === 'sign' ? 'İmzala' : 'Reddet'}
              </Button>
              <Button variant="subtle" disabled={busy} onClick={closeDecide}>
                Vazgeç
              </Button>
            </div>
          </>
        )}
      </Drawer>

      <Drawer open={newOpen} onClose={() => setNewOpen(false)} title="Yeni İmza Akışı">
        {newErr && <Alert tone="err">{newErr}</Alert>}

        <div className="field">
          <label>Konu tipi</label>
          <select value={subjectType} onChange={(e) => setSubjectType(e.target.value as SubjectKey)}>
            {SUBJECT_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {subjectLabel(s)}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>Belge başlığı</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Örn. 2025-2026 Güz dönemi diploma listesi"
          />
        </div>

        <div className="field">
          <label>İmzacılar (seçim sırası imza sırasıdır)</label>
          {advisors.length === 0 ? (
            <div className="muted" style={{ fontSize: 12.5 }}>
              Personel listesi yükleniyor…
            </div>
          ) : (
            <div
              style={{
                maxHeight: 260,
                overflowY: 'auto',
                border: '1px solid var(--line)',
                borderRadius: 'var(--r)',
                padding: 6,
              }}
            >
              {advisors.map((a) => {
                const idx = signers.indexOf(a.userId);
                return (
                  <label
                    key={a.userId}
                    className="row"
                    style={{
                      gap: 8,
                      padding: '7px 9px',
                      borderRadius: 'var(--r)',
                      cursor: 'pointer',
                      background: idx >= 0 ? 'var(--infobg)' : 'transparent',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={idx >= 0}
                      onChange={() => toggleSigner(a.userId)}
                      style={{ width: 'auto' }}
                    />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12.5 }}>{a.email}</span>
                    {idx >= 0 && <Badge tone="info">{idx + 1}. sıra</Badge>}
                  </label>
                );
              })}
            </div>
          )}
          <div className="hint-sm">Seçili imzacı: {signers.length}</div>
        </div>

        <div className="row" style={{ gap: 8 }}>
          <Button icon="check" disabled={busy} onClick={() => void createChain()}>
            Akışı Başlat
          </Button>
          <Button variant="subtle" disabled={busy} onClick={() => setNewOpen(false)}>
            Vazgeç
          </Button>
        </div>
      </Drawer>

      <Drawer open={chainOpen} onClose={() => setChainOpen(false)} title="İmza Zinciri">
        {chainErr && <Alert tone="err">{chainErr}</Alert>}
        {!chain ? (
          chainErr ? null : (
            <Skeleton lines={8} />
          )
        ) : (
          <>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{chain.title}</div>
              <div className="row" style={{ gap: 8, marginTop: 8 }}>
                <Badge tone={statusInfo(chain.status).tone}>{statusInfo(chain.status).label}</Badge>
                <span className="muted" style={{ fontSize: 12.5 }}>
                  {subjectLabel(chain.subjectType)}
                  {chain.pendingSeq !== null ? ` · sıradaki adım ${chain.pendingSeq}` : ''}
                </span>
              </div>
            </div>

            {chain.items.map((s, i) => (
              <div key={s.id}>
                <div
                  className="row"
                  style={{
                    gap: 10,
                    padding: '10px 12px',
                    borderRadius: 'var(--r)',
                    border: `1px solid ${s.seq === chain.pendingSeq ? 'var(--info-line)' : 'var(--line)'}`,
                    background: s.seq === chain.pendingSeq ? 'var(--infobg)' : 'transparent',
                  }}
                >
                  <span
                    style={{
                      width: 26,
                      height: 26,
                      display: 'grid',
                      placeItems: 'center',
                      borderRadius: '50%',
                      fontSize: 12,
                      fontWeight: 700,
                      border: '1px solid var(--line)',
                      color: 'var(--text-2)',
                    }}
                  >
                    {s.seq}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{signerLabel(s)}</div>
                    <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>
                      {s.signedAt ? `İmza: ${fmtDate(s.signedAt)}` : 'İmza bekleniyor'}
                      {s.ebysRef ? ` · ${s.ebysRef}` : ''}
                    </div>
                    {s.note && <div style={{ fontSize: 12.5, marginTop: 5 }}>{s.note}</div>}
                  </div>
                  <Badge tone={statusInfo(s.status).tone}>{statusInfo(s.status).label}</Badge>
                </div>
                {i < chain.items.length - 1 && (
                  <div style={{ display: 'grid', placeItems: 'center', padding: '2px 0' }}>
                    <Icon name="arrowDown" size={14} style={{ color: 'var(--faint)' }} />
                  </div>
                )}
              </div>
            ))}
          </>
        )}
      </Drawer>
    </>
  );
}
