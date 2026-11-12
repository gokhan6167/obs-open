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
  Alert,
  Skeleton,
  Drawer,
  EmptyState,
  Segmented,
  Icon,
  toast,
  fmtDate,
} from '@/app/ui';

interface Investigation {
  id: string;
  studentId: string;
  studentNo: string;
  studentEmail: string;
  complaint: string;
  stage: string;
  investigatorUserId: string | null;
  investigatorEmail: string | null;
  evidence: string | null;
  decision: string | null;
  decisionNo: string | null;
  decisionDate: string | null;
  actionId: string | null;
  createdAt: string;
}

interface Action {
  id: string;
  category: string;
  penalty: string;
  reason: string | null;
  decisionNo: string | null;
  decisionDate: string | null;
  startsOn: string | null;
  endsOn: string | null;
}

interface Detail {
  investigation: Investigation;
  action: Action | null;
}

interface StudentHit {
  id: string;
  studentNo: string;
  fullName: string;
  programName: string;
}

interface Advisor {
  userId: string;
  email: string;
  fullName: string;
}

/** Soruşturma aşamaları (backend enum ile birebir). */
const STAGES = [
  { value: 'ihbar', label: 'İhbar' },
  { value: 'on_inceleme', label: 'Ön inceleme' },
  { value: 'sorusturma', label: 'Soruşturma' },
  { value: 'karar', label: 'Karar' },
  { value: 'itiraz', label: 'İtiraz' },
  { value: 'kapali', label: 'Kapalı' },
] as const;

/** Görsel zincir; itiraz ana hattın dışında bir sapma olduğu için burada yok. */
const CHAIN = ['ihbar', 'on_inceleme', 'sorusturma', 'karar', 'kapali'];

/** PATCH ile atanabilen aşamalar (ihbar yalnızca açılışta oluşur). */
const PATCH_STAGES = STAGES.filter((s) => s.value !== 'ihbar');

type Filter = 'hepsi' | (typeof STAGES)[number]['value'];

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'hepsi', label: 'Hepsi' },
  ...STAGES.map((s) => ({ value: s.value as Filter, label: s.label })),
];

type Category = 'uyari' | 'kinama' | 'uzaklastirma' | 'cikarma';

const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'uyari', label: 'Uyarı' },
  { value: 'kinama', label: 'Kınama' },
  { value: 'uzaklastirma', label: 'Uzaklaştırma' },
  { value: 'cikarma', label: 'Yükseköğretimden çıkarma' },
];

const stageLabel = (s: string): string => STAGES.find((x) => x.value === s)?.label ?? s;
const catLabel = (c: string): string => CATEGORIES.find((x) => x.value === c)?.label ?? c;

function stageTone(s: string): 'ok' | 'warn' | 'danger' | 'info' | 'muted' {
  if (s === 'kapali') return 'ok';
  if (s === 'itiraz') return 'danger';
  if (s === 'karar' || s === 'sorusturma') return 'warn';
  if (s === 'ihbar') return 'muted';
  return 'info';
}

/** Zincirdeki bir sonraki adım (itiraz -> kapalı, kapalı -> yok). */
function nextStage(current: string): string {
  if (current === 'itiraz') return 'kapali';
  const i = CHAIN.indexOf(current);
  return i >= 0 && i < CHAIN.length - 1 ? CHAIN[i + 1]! : '';
}

const short = (s: string, n = 72): string => (s.length > n ? s.slice(0, n) + '…' : s);
const blank = (v: string | null | undefined): boolean => !v || v.trim().length === 0;

/** İhbar → ön inceleme → soruşturma → karar → kapalı görsel zinciri. */
function StageChain({ stage }: { stage: string }): React.ReactElement {
  const idx = CHAIN.indexOf(stage);
  return (
    <div className="row" style={{ gap: 2, margin: '2px 0 16px' }}>
      {CHAIN.map((s, i) => {
        const done = idx >= 0 && i < idx;
        const cur = s === stage;
        return (
          <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 9px',
                borderRadius: 999,
                fontSize: 11.5,
                fontWeight: 650,
                whiteSpace: 'nowrap',
                border: `1px solid ${cur ? 'var(--accent)' : done ? 'var(--ok-line)' : 'var(--line)'}`,
                background: cur
                  ? 'color-mix(in srgb, var(--accent) 12%, transparent)'
                  : done
                    ? 'var(--okbg)'
                    : 'var(--card-2)',
                color: cur ? 'var(--accent)' : done ? 'var(--ok)' : 'var(--muted)',
              }}
            >
              {done && <Icon name="check" size={12} />}
              {stageLabel(s)}
            </span>
            {i < CHAIN.length - 1 && (
              <Icon name="chevronRight" size={13} style={{ color: 'var(--faint)' }} />
            )}
          </span>
        );
      })}
      {stage === 'itiraz' && <Badge tone="danger">İtiraz sürecinde</Badge>}
    </div>
  );
}

export default function SorusturmaPage(): React.ReactElement {
  const [rows, setRows] = useState<Investigation[]>([]);
  const [filter, setFilter] = useState<Filter>('hepsi');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [advisors, setAdvisors] = useState<Advisor[]>([]);

  // Yeni soruşturma sürgüsü.
  const [newOpen, setNewOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<StudentHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<StudentHit | null>(null);
  const [complaint, setComplaint] = useState('');
  const [investigator, setInvestigator] = useState('');
  const [newErr, setNewErr] = useState('');
  const [creating, setCreating] = useState(false);

  // Detay sürgüsü.
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailErr, setDetailErr] = useState('');
  const [stage, setStage] = useState('');
  const [evidence, setEvidence] = useState('');
  const [decision, setDecision] = useState('');
  const [decisionNo, setDecisionNo] = useState('');
  const [decisionDate, setDecisionDate] = useState('');
  const [saving, setSaving] = useState(false);

  // Ceza uygulama formu.
  const [category, setCategory] = useState<Category>('uyari');
  const [penalty, setPenalty] = useState('');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [penaltyErr, setPenaltyErr] = useState('');
  const [applying, setApplying] = useState(false);

  const load = useCallback(async (f: Filter) => {
    const path = f === 'hepsi' ? '/investigations' : `/investigations?stage=${f}`;
    const res = await api<{ items: Investigation[] }>(path);
    setRows(res.items ?? []);
  }, []);

  useEffect(() => {
    setLoading(true);
    setErr('');
    load(filter)
      .catch((e) => setErr(e instanceof Error ? e.message : 'Kayıtlar alınamadı'))
      .finally(() => setLoading(false));
  }, [filter, load]);

  useEffect(() => {
    api<{ items: Advisor[] }>('/students/advisors')
      .then((r) => setAdvisors(r.items ?? []))
      .catch(() => setAdvisors([]));
  }, []);

  const stats = useMemo(() => {
    const open = rows.filter((r) => r.stage !== 'kapali').length;
    const atDecision = rows.filter((r) => r.stage === 'karar' || r.stage === 'itiraz').length;
    const penalized = rows.filter((r) => r.actionId).length;
    return { total: rows.length, open, atDecision, penalized };
  }, [rows]);

  /* ------------------------------ detay ------------------------------ */

  const openDetail = useCallback(async (id: string) => {
    setDetailId(id);
    setDetail(null);
    setDetailErr('');
    setPenaltyErr('');
    setDetailLoading(true);
    try {
      const res = await api<Detail>(`/investigations/${id}`);
      setDetail(res);
      const inv = res.investigation;
      setStage(nextStage(inv.stage));
      setEvidence(inv.evidence ?? '');
      setDecision(inv.decision ?? '');
      setDecisionNo(inv.decisionNo ?? '');
      setDecisionDate(inv.decisionDate ?? '');
      setCategory('uyari');
      setPenalty('');
      setStartsOn('');
      setEndsOn('');
    } catch (e) {
      setDetailErr(e instanceof Error ? e.message : 'Detay alınamadı');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  function closeDetail(): void {
    setDetailId(null);
    setDetail(null);
    setDetailErr('');
    setPenaltyErr('');
  }

  const inv = detail?.investigation ?? null;

  // 409 koşulları: karar metni olmadan "karar", karar no olmadan "kapali".
  const needsDecision = stage === 'karar' && blank(decision) && blank(inv?.decision);
  const needsDecisionNo = stage === 'kapali' && blank(decisionNo) && blank(inv?.decisionNo);

  async function saveStage(): Promise<void> {
    if (!inv) return;
    setSaving(true);
    setDetailErr('');
    try {
      const body: Record<string, string> = {};
      if (stage && stage !== inv.stage) body.stage = stage;
      if (evidence.trim() !== (inv.evidence ?? '')) body.evidence = evidence.trim();
      if (decision.trim() !== (inv.decision ?? '')) body.decision = decision.trim();
      if (decisionNo.trim() !== (inv.decisionNo ?? '')) body.decisionNo = decisionNo.trim();
      if (decisionDate !== (inv.decisionDate ?? '')) body.decisionDate = decisionDate;
      if (Object.keys(body).length === 0) {
        setDetailErr('Değişen bir alan yok.');
        return;
      }
      await api(`/investigations/${inv.id}`, { method: 'PATCH', body });
      toast('Soruşturma güncellendi', {
        tone: 'ok',
        body: body.stage ? `Aşama: ${stageLabel(body.stage)}` : inv.studentNo,
      });
      await openDetail(inv.id);
      await load(filter);
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Güncelleme başarısız';
      setDetailErr(m);
      toast('Güncelleme başarısız', { tone: 'err', body: m });
    } finally {
      setSaving(false);
    }
  }

  async function applyPenalty(): Promise<void> {
    if (!inv) return;
    if (!penalty.trim()) {
      setPenaltyErr('Ceza özeti zorunludur.');
      return;
    }
    setApplying(true);
    setPenaltyErr('');
    try {
      await api(`/investigations/${inv.id}/apply-penalty`, {
        method: 'POST',
        body: {
          category,
          penalty: penalty.trim(),
          ...(startsOn ? { startsOn } : {}),
          ...(endsOn ? { endsOn } : {}),
        },
      });
      toast('Ceza uygulandı', { tone: 'ok', body: `${inv.studentNo} · ${catLabel(category)}` });
      await openDetail(inv.id);
      await load(filter);
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Ceza uygulanamadı';
      setPenaltyErr(m);
      toast('Ceza uygulanamadı', { tone: 'err', body: m });
    } finally {
      setApplying(false);
    }
  }

  /* ---------------------------- yeni kayıt ---------------------------- */

  async function search(): Promise<void> {
    const term = q.trim();
    if (!term) return;
    setSearching(true);
    setNewErr('');
    try {
      const res = await api<{ items: StudentHit[] }>(
        `/portal/students?q=${encodeURIComponent(term)}`,
      );
      setHits(res.items ?? []);
    } catch (e) {
      setNewErr(e instanceof Error ? e.message : 'Arama başarısız');
    } finally {
      setSearching(false);
    }
  }

  function closeNew(): void {
    setNewOpen(false);
    setQ('');
    setHits([]);
    setPicked(null);
    setComplaint('');
    setInvestigator('');
    setNewErr('');
  }

  async function create(): Promise<void> {
    if (!picked) {
      setNewErr('Önce öğrenci seçin.');
      return;
    }
    if (!complaint.trim()) {
      setNewErr('Şikâyet / ihbar özeti zorunludur.');
      return;
    }
    setCreating(true);
    setNewErr('');
    try {
      await api('/investigations', {
        method: 'POST',
        body: {
          studentId: picked.id,
          complaint: complaint.trim(),
          ...(investigator ? { investigatorUserId: investigator } : {}),
        },
      });
      toast('Soruşturma açıldı', { tone: 'ok', body: `${picked.studentNo} · İhbar aşaması` });
      closeNew();
      await load(filter);
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Kayıt başarısız';
      setNewErr(m);
      toast('Kayıt başarısız', { tone: 'err', body: m });
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Disiplin soruşturması"
        sub="İhbardan karara kadar soruşturma dosyalarının takibi; karar sonrası ceza üretimi."
        actions={
          <Button icon="shield" onClick={() => setNewOpen(true)}>
            Yeni soruşturma
          </Button>
        }
      />

      {loading ? (
        <Skeleton lines={3} />
      ) : (
        <StatGrid
          stats={[
            { label: 'Listelenen dosya', value: stats.total, icon: 'shield' },
            { label: 'Açık dosya', value: stats.open, icon: 'clock', tone: 'warn' },
            { label: 'Karar/itiraz', value: stats.atDecision, icon: 'flag', tone: 'warn' },
            { label: 'Cezaya bağlanan', value: stats.penalized, icon: 'alert', tone: 'danger' },
          ]}
        />
      )}

      <Card
        title="Soruşturma dosyaları"
        icon="shield"
        actions={<Segmented value={filter} onChange={setFilter} options={FILTERS} />}
      >
        {err && <Alert tone="err">{err}</Alert>}
        {loading ? (
          <Skeleton lines={8} />
        ) : (
          <DataTable<Investigation>
            rows={rows}
            search
            csv
            csvName="oidb-sorusturma"
            empty={
              <EmptyState
                icon="shield"
                title="Bu filtrede soruşturma yok"
                sub="Filtreyi değiştirin ya da sağ üstten yeni soruşturma açın."
              />
            }
            columns={[
              {
                key: 'studentNo',
                header: 'Öğrenci',
                value: (r) => `${r.studentNo} ${r.studentEmail}`,
                render: (r) => (
                  <div className="stack">
                    <b>{r.studentNo}</b>
                    <span className="muted" style={{ fontSize: 12 }}>
                      {r.studentEmail}
                    </span>
                  </div>
                ),
              },
              {
                key: 'complaint',
                header: 'Şikâyet özeti',
                value: (r) => r.complaint,
                render: (r) => <span title={r.complaint}>{short(r.complaint)}</span>,
              },
              {
                key: 'stage',
                header: 'Aşama',
                value: (r) => stageLabel(r.stage),
                render: (r) => <Badge tone={stageTone(r.stage)}>{stageLabel(r.stage)}</Badge>,
              },
              {
                key: 'investigatorEmail',
                header: 'Soruşturmacı',
                value: (r) => r.investigatorEmail ?? '',
                render: (r) => r.investigatorEmail ?? <span className="muted">Atanmadı</span>,
              },
              {
                key: 'createdAt',
                header: 'Tarih',
                value: (r) => r.createdAt,
                render: (r) => fmtDate(r.createdAt),
              },
              {
                key: 'aksiyon',
                header: '',
                sortable: false,
                render: (r) => (
                  <Button variant="ghost" sm icon="eye" onClick={() => void openDetail(r.id)}>
                    Detay
                  </Button>
                ),
              },
            ]}
          />
        )}
      </Card>

      {/* ----------------------------- Detay ----------------------------- */}
      <Drawer
        open={detailId !== null}
        onClose={closeDetail}
        title={inv ? `Soruşturma · ${inv.studentNo}` : 'Soruşturma detayı'}
      >
        {detailLoading && <Skeleton lines={6} />}
        {detailErr && <Alert tone="err">{detailErr}</Alert>}

        {inv && (
          <>
            <StageChain stage={inv.stage} />

            <div className="info-box">
              <div className="stack">
                <span>
                  <b>{inv.studentNo}</b> · {inv.studentEmail}
                </span>
                <span className="muted" style={{ fontSize: 12.5 }}>
                  Soruşturmacı: {inv.investigatorEmail ?? 'atanmadı'} · Açılış:{' '}
                  {fmtDate(inv.createdAt)}
                </span>
              </div>
            </div>

            <h2>Şikâyet / ihbar</h2>
            <p style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.6, margin: 0 }}>
              {inv.complaint}
            </p>

            <h2>Aşama ilerlet</h2>
            {needsDecision && (
              <Alert tone="warn">
                <b>Karar aşaması için karar metni zorunlu.</b> Karar metni boş bırakılırsa sunucu
                409 döner. Aşağıdaki &laquo;Karar metni&raquo; alanını doldurup kaydedin.
              </Alert>
            )}
            {needsDecisionNo && (
              <Alert tone="warn">
                <b>Kapatma için karar numarası zorunlu.</b> YKK karar numarası girilmeden dosya
                kapatılamaz (409). Önce &laquo;Karar no&raquo; alanını doldurun.
              </Alert>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void saveStage();
              }}
            >
              <div className="field">
                <label>Yeni aşama</label>
                <select value={stage} onChange={(e) => setStage(e.target.value)}>
                  <option value="">Aşamayı değiştirme</option>
                  {PATCH_STAGES.map((s) => (
                    <option key={s.value} value={s.value} disabled={s.value === inv.stage}>
                      {s.label}
                      {s.value === inv.stage ? ' (mevcut)' : ''}
                    </option>
                  ))}
                </select>
                <span className="hint-sm">
                  Zincir: İhbar → Ön inceleme → Soruşturma → Karar → Kapalı (itiraz ara aşama).
                </span>
              </div>

              <div className="field">
                <label>Delil / tutanak özeti</label>
                <textarea
                  rows={3}
                  value={evidence}
                  onChange={(e) => setEvidence(e.target.value)}
                  placeholder="Toplanan delil ve ifadelerin özeti"
                />
              </div>

              <div className="field">
                <label>Karar metni</label>
                <textarea
                  rows={3}
                  value={decision}
                  onChange={(e) => setDecision(e.target.value)}
                  placeholder="Kurul kararının gerekçesi ve sonucu"
                />
              </div>

              <div className="row" style={{ alignItems: 'flex-end' }}>
                <div className="field" style={{ flex: '1 1 160px', marginBottom: 0 }}>
                  <label>Karar no</label>
                  <input
                    value={decisionNo}
                    onChange={(e) => setDecisionNo(e.target.value)}
                    placeholder="YK-2025/42"
                  />
                </div>
                <div className="field" style={{ flex: '1 1 160px', marginBottom: 0 }}>
                  <label>Karar tarihi</label>
                  <input
                    type="date"
                    value={decisionDate}
                    onChange={(e) => setDecisionDate(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ marginTop: 16 }}>
                <Button
                  type="submit"
                  icon="check"
                  block
                  disabled={saving || needsDecision || needsDecisionNo}
                >
                  {saving ? 'Kaydediliyor…' : 'Kaydet'}
                </Button>
              </div>
            </form>

            <hr className="divider" />

            <h2 style={{ marginTop: 0 }}>Ceza</h2>
            {detail?.action ? (
              <div className="info-box">
                <div className="stack">
                  <span>
                    <Badge tone="danger">{catLabel(detail.action.category)}</Badge>{' '}
                    {detail.action.penalty}
                  </span>
                  <span className="muted" style={{ fontSize: 12.5 }}>
                    {detail.action.decisionNo ?? 'Karar no yok'} ·{' '}
                    {fmtDate(detail.action.startsOn)} – {fmtDate(detail.action.endsOn)}
                  </span>
                </div>
              </div>
            ) : inv.stage === 'karar' || inv.stage === 'kapali' ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void applyPenalty();
                }}
              >
                {penaltyErr && <Alert tone="err">{penaltyErr}</Alert>}
                <div className="field">
                  <label>Kategori</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as Category)}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Ceza özeti</label>
                  <input
                    value={penalty}
                    onChange={(e) => setPenalty(e.target.value)}
                    placeholder="Örn. 1 hafta uzaklaştırma"
                    required
                  />
                </div>
                <div className="row" style={{ alignItems: 'flex-end' }}>
                  <div className="field" style={{ flex: '1 1 160px', marginBottom: 0 }}>
                    <label>Başlangıç</label>
                    <input
                      type="date"
                      value={startsOn}
                      onChange={(e) => setStartsOn(e.target.value)}
                    />
                  </div>
                  <div className="field" style={{ flex: '1 1 160px', marginBottom: 0 }}>
                    <label>Bitiş</label>
                    <input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
                  </div>
                </div>
                <div style={{ marginTop: 16 }}>
                  <Button type="submit" variant="danger" icon="alert" block disabled={applying}>
                    {applying ? 'Uygulanıyor…' : 'Ceza uygula'}
                  </Button>
                </div>
              </form>
            ) : (
              <Alert tone="info">
                Ceza yalnızca <b>karar</b> veya <b>kapalı</b> aşamasında uygulanabilir. Önce
                dosyayı karar aşamasına taşıyın.
              </Alert>
            )}
          </>
        )}
      </Drawer>

      {/* --------------------------- Yeni kayıt --------------------------- */}
      <Drawer open={newOpen} onClose={closeNew} title="Yeni soruşturma">
        {newErr && <Alert tone="err">{newErr}</Alert>}

        <h2 style={{ marginTop: 0 }}>1 · Öğrenci</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void search();
          }}
        >
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <div className="field" style={{ flex: '1 1 200px', marginBottom: 0 }}>
              <label>Öğrenci no / ad ile ara</label>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="20210001 veya ad"
              />
            </div>
            <Button variant="ghost" type="submit" icon="search" disabled={searching}>
              {searching ? 'Aranıyor…' : 'Ara'}
            </Button>
          </div>
        </form>

        {picked ? (
          <div className="info-box" style={{ marginTop: 12 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span>
                <b>{picked.studentNo}</b> · {picked.fullName}
              </span>
              <Button variant="ghost" sm icon="refresh" onClick={() => setPicked(null)}>
                Değiştir
              </Button>
            </div>
          </div>
        ) : hits.length > 0 ? (
          <table style={{ marginTop: 12 }}>
            <tbody>
              {hits.map((h) => (
                <tr key={h.id}>
                  <td>
                    <b>{h.studentNo}</b>
                  </td>
                  <td>{h.fullName}</td>
                  <td className="muted">{h.programName}</td>
                  <td style={{ textAlign: 'right' }}>
                    <Button variant="ghost" sm icon="check" onClick={() => setPicked(h)}>
                      Seç
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}

        <h2>2 · İhbar bilgisi</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <div className="field">
            <label>Şikâyet / ihbar özeti</label>
            <textarea
              rows={4}
              value={complaint}
              onChange={(e) => setComplaint(e.target.value)}
              placeholder="Olayın tarihi, yeri ve iddia edilen fiil"
              required
            />
          </div>

          <div className="field">
            <label>Soruşturmacı</label>
            <select value={investigator} onChange={(e) => setInvestigator(e.target.value)}>
              <option value="">Sonra atanacak</option>
              {advisors.map((a) => (
                <option key={a.userId} value={a.userId}>
                  {a.fullName || a.email}
                </option>
              ))}
            </select>
            <span className="hint-sm">Dosya ihbar aşamasında açılır.</span>
          </div>

          <div style={{ marginTop: 16 }}>
            <Button type="submit" icon="shield" block disabled={creating || !picked}>
              {creating ? 'Açılıyor…' : 'Soruşturmayı aç'}
            </Button>
          </div>
        </form>
      </Drawer>
    </>
  );
}
