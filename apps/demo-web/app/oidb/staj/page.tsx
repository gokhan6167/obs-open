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
  toast,
  fmtDate,
} from '@/app/ui';

interface Internship {
  id: string;
  studentId: string;
  studentNo: string;
  studentEmail: string;
  company: string;
  position: string | null;
  startsOn: string | null;
  endsOn: string | null;
  days: number | null;
  insuranceDone: boolean;
  logbookSubmitted: boolean;
  companyRating: number | null;
  grade: string | null;
  status: string;
  createdAt: string;
}

type StatusFilter = 'hepsi' | 'basvuruldu' | 'onaylandi' | 'devam' | 'tamamlandi';
type NextStatus = 'onaylandi' | 'devam' | 'tamamlandi' | 'reddedildi';

const STATUS_TR: Record<string, string> = {
  basvuruldu: 'Başvuruldu',
  onaylandi: 'Onaylandı',
  devam: 'Devam ediyor',
  tamamlandi: 'Tamamlandı',
  reddedildi: 'Reddedildi',
};
const TONE: Record<string, 'ok' | 'warn' | 'danger' | 'info' | 'muted'> = {
  basvuruldu: 'warn',
  onaylandi: 'info',
  devam: 'info',
  tamamlandi: 'ok',
  reddedildi: 'danger',
};
const GRADE_TR: Record<string, string> = {
  basarili: 'Başarılı',
  basarisiz: 'Başarısız',
  devamsiz: 'Devamsız',
};

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'hepsi', label: 'Hepsi' },
  { value: 'basvuruldu', label: 'Başvuruldu' },
  { value: 'onaylandi', label: 'Onaylandı' },
  { value: 'devam', label: 'Devam' },
  { value: 'tamamlandi', label: 'Tamamlandı' },
];
const STATUS_OPTS: NextStatus[] = ['onaylandi', 'devam', 'tamamlandi', 'reddedildi'];
const GRADE_OPTS = ['basarili', 'basarisiz', 'devamsiz'];

/** Sunucudan dönen 409 kural ihlallerini kullanıcıya çözüm cümlesiyle açıklar. */
function ruleHint(msg: string): string {
  if (msg.includes('Sigorta')) {
    return 'Kayıt "Devam" durumuna alınmadan önce sigorta girişinin yapılmış olması gerekir. Önce "Sigorta girişi yapıldı" işaretini uygulayın.';
  }
  if (msg.includes('defter')) {
    return 'Staj defteri teslim alınmadan "Başarılı" notu verilemez. Önce "Defter teslim alındı" işaretini uygulayın.';
  }
  return '';
}

const dateRange = (r: Internship): string =>
  r.startsOn || r.endsOn ? `${fmtDate(r.startsOn)} – ${fmtDate(r.endsOn)}` : '—';

export default function StajPage(): React.ReactElement {
  const [all, setAll] = useState<Internship[]>([]);
  const [rows, setRows] = useState<Internship[]>([]);
  const [status, setStatus] = useState<StatusFilter>('hepsi');
  const [activeId, setActiveId] = useState('');
  const [form, setForm] = useState({ status: '', rating: '', grade: '' });
  const [err, setErr] = useState('');
  const [drawerErr, setDrawerErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (s: StatusFilter) => {
    const full = await api<{ items: Internship[] }>('/internships');
    setAll(full.items);
    if (s === 'hepsi') {
      setRows(full.items);
      return;
    }
    const res = await api<{ items: Internship[] }>(`/internships?status=${s}`);
    setRows(res.items);
  }, []);

  useEffect(() => {
    setLoading(true);
    setErr('');
    load(status)
      .catch((e) => setErr(e instanceof Error ? e.message : 'Staj kayıtları alınamadı'))
      .finally(() => setLoading(false));
  }, [load, status]);

  const active = useMemo(() => all.find((r) => r.id === activeId) ?? null, [all, activeId]);

  const counts = useMemo(
    () => ({
      basvuru: all.filter((r) => r.status === 'basvuruldu').length,
      devam: all.filter((r) => r.status === 'devam').length,
      tamamlandi: all.filter((r) => r.status === 'tamamlandi').length,
    }),
    [all],
  );

  function openRow(r: Internship): void {
    setActiveId(r.id);
    setDrawerErr('');
    setForm({
      status: r.status,
      rating: r.companyRating == null ? '' : String(r.companyRating),
      grade: r.grade ?? '',
    });
  }

  async function patch(
    r: Internship,
    body: Record<string, unknown>,
    okTitle: string,
    okBody: string,
  ): Promise<void> {
    setBusy(true);
    setDrawerErr('');
    try {
      await api(`/internships/${r.id}`, { method: 'PATCH', body });
      toast(okTitle, { tone: 'ok', body: okBody });
      await load(status);
    } catch (e) {
      const m = e instanceof Error ? e.message : 'İşlem başarısız';
      const hint = ruleHint(m);
      setDrawerErr(hint ? `${m}. ${hint}` : m);
      toast('İşlem başarısız', { tone: 'err', body: m });
    } finally {
      setBusy(false);
    }
  }

  async function saveStatus(r: Internship): Promise<void> {
    if (!form.status || form.status === r.status) return;
    await patch(
      r,
      { status: form.status },
      'Staj durumu güncellendi',
      `${r.studentNo} · ${r.company} → ${STATUS_TR[form.status] ?? form.status}`,
    );
  }

  async function saveReview(r: Internship): Promise<void> {
    const body: Record<string, unknown> = {};
    if (form.rating) body.companyRating = Number(form.rating);
    if (form.grade) body.grade = form.grade;
    if (Object.keys(body).length === 0) {
      setDrawerErr('Değerlendirme için firma puanı veya not seçin.');
      return;
    }
    await patch(r, body, 'Değerlendirme kaydedildi', `${r.studentNo} · ${r.company}`);
  }

  return (
    <>
      <PageHeader
        title="Staj Yönetimi"
        sub="Staj başvurularını onaylayın; sigorta girişi ve defter teslimini işaretleyip staj sonucunu değerlendirin."
      />

      {loading ? (
        <SkeletonStats n={3} />
      ) : (
        <StatGrid
          stats={[
            {
              label: 'Bekleyen başvuru',
              value: counts.basvuru,
              icon: 'inbox',
              tone: counts.basvuru > 0 ? 'warn' : undefined,
            },
            { label: 'Devam eden staj', value: counts.devam, icon: 'activity' },
            { label: 'Tamamlanan staj', value: counts.tamamlandi, icon: 'checkCircle', tone: 'ok' },
          ]}
        />
      )}

      <Card title="Staj kayıtları" icon="building">
        {err && <Alert tone="err">{err}</Alert>}
        <div className="row" style={{ gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Durum</label>
            <Segmented value={status} onChange={setStatus} options={FILTERS} />
          </div>
        </div>
        {loading ? (
          <Skeleton lines={8} />
        ) : (
          <DataTable<Internship>
            rows={rows}
            search
            csv
            csvName="oidb-staj"
            empty={
              <EmptyState
                icon="building"
                title="Staj kaydı bulunamadı"
                sub="Seçili durumda kayıt yok. Filtreyi 'Hepsi' yaparak tüm staj kayıtlarını görebilirsiniz."
              />
            }
            columns={[
              {
                key: 'studentNo',
                header: 'Öğrenci',
                sortable: true,
                value: (r) => r.studentNo,
                render: (r) => (
                  <div>
                    <b>{r.studentNo}</b>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {r.studentEmail}
                    </div>
                  </div>
                ),
              },
              { key: 'company', header: 'Firma', sortable: true, value: (r) => r.company },
              {
                key: 'position',
                header: 'Pozisyon',
                sortable: true,
                value: (r) => r.position ?? '—',
                render: (r) => r.position ?? <span className="muted">—</span>,
              },
              {
                key: 'dates',
                header: 'Tarih',
                sortable: true,
                value: (r) => r.startsOn ?? '',
                render: (r) => dateRange(r),
              },
              {
                key: 'insuranceDone',
                header: 'Sigorta',
                sortable: true,
                value: (r) => (r.insuranceDone ? 'Yapıldı' : 'Eksik'),
                render: (r) => (
                  <Badge tone={r.insuranceDone ? 'ok' : 'danger'}>
                    {r.insuranceDone ? 'Yapıldı' : 'Eksik'}
                  </Badge>
                ),
              },
              {
                key: 'logbookSubmitted',
                header: 'Defter',
                sortable: true,
                value: (r) => (r.logbookSubmitted ? 'Teslim' : 'Bekliyor'),
                render: (r) => (
                  <Badge tone={r.logbookSubmitted ? 'ok' : 'warn'}>
                    {r.logbookSubmitted ? 'Teslim' : 'Bekliyor'}
                  </Badge>
                ),
              },
              {
                key: 'grade',
                header: 'Not',
                sortable: true,
                value: (r) => (r.grade ? (GRADE_TR[r.grade] ?? r.grade) : '—'),
                render: (r) =>
                  r.grade ? (
                    <Badge tone={r.grade === 'basarili' ? 'ok' : 'danger'}>
                      {GRADE_TR[r.grade] ?? r.grade}
                    </Badge>
                  ) : (
                    <span className="muted">—</span>
                  ),
              },
              {
                key: 'status',
                header: 'Durum',
                sortable: true,
                value: (r) => STATUS_TR[r.status] ?? r.status,
                render: (r) => (
                  <Badge tone={TONE[r.status] ?? 'muted'}>{STATUS_TR[r.status] ?? r.status}</Badge>
                ),
              },
              {
                key: 'action',
                header: 'İşlem',
                sortable: false,
                value: () => '',
                render: (r) => (
                  <Button variant="subtle" sm icon="eye" onClick={() => openRow(r)}>
                    Detay
                  </Button>
                ),
              },
            ]}
          />
        )}
      </Card>

      <Drawer
        open={active !== null}
        onClose={() => setActiveId('')}
        title={active ? `${active.company} · ${active.studentNo}` : 'Staj kaydı'}
      >
        {active && (
          <>
            {drawerErr && <Alert tone="err">{drawerErr}</Alert>}
            {!active.insuranceDone && (
              <Alert tone="warn">
                Sigorta girişi yapılmadan staj <b>&quot;Devam&quot;</b> durumuna alınamaz; sunucu
                işlemi reddeder.
              </Alert>
            )}
            {!active.logbookSubmitted && (
              <Alert tone="warn">
                Staj defteri teslim alınmadan <b>&quot;Başarılı&quot;</b> notu verilemez; sunucu
                işlemi reddeder.
              </Alert>
            )}

            <div className="field">
              <label>Öğrenci</label>
              <div>
                <b>{active.studentNo}</b> · {active.studentEmail}
              </div>
            </div>
            <div className="field">
              <label>Firma / pozisyon</label>
              <div>
                <b>{active.company}</b>
                {active.position ? ` · ${active.position}` : ''}
              </div>
            </div>
            <div className="field">
              <label>Staj tarihleri</label>
              <div>
                {dateRange(active)}
                {active.days ? ` · ${active.days} gün` : ''}
              </div>
            </div>
            <div className="field">
              <label>Durum</label>
              <div className="row" style={{ gap: 8 }}>
                <Badge tone={TONE[active.status] ?? 'muted'}>
                  {STATUS_TR[active.status] ?? active.status}
                </Badge>
                <Badge tone={active.insuranceDone ? 'ok' : 'danger'}>
                  Sigorta: {active.insuranceDone ? 'Yapıldı' : 'Eksik'}
                </Badge>
                <Badge tone={active.logbookSubmitted ? 'ok' : 'warn'}>
                  Defter: {active.logbookSubmitted ? 'Teslim' : 'Bekliyor'}
                </Badge>
              </div>
            </div>
            <div className="field">
              <label>Başvuru tarihi</label>
              <div>{fmtDate(active.createdAt)}</div>
            </div>

            <div className="field">
              <label>Belge işlemleri</label>
              <div className="row" style={{ gap: 8 }}>
                <Button
                  variant="ok"
                  sm
                  icon="shield"
                  disabled={busy || active.insuranceDone}
                  onClick={() =>
                    patch(
                      active,
                      { insuranceDone: true },
                      'Sigorta girişi işlendi',
                      `${active.studentNo} · ${active.company}`,
                    )
                  }
                >
                  {active.insuranceDone ? 'Sigorta girişi yapıldı' : 'Sigorta girişini işaretle'}
                </Button>
                <Button
                  variant="ok"
                  sm
                  icon="book"
                  disabled={busy || active.logbookSubmitted}
                  onClick={() =>
                    patch(
                      active,
                      { logbookSubmitted: true },
                      'Staj defteri teslim alındı',
                      `${active.studentNo} · ${active.company}`,
                    )
                  }
                >
                  {active.logbookSubmitted ? 'Defter teslim alındı' : 'Defter teslimini işaretle'}
                </Button>
              </div>
            </div>

            <div className="field">
              <label>Durum güncelle</label>
              <select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              >
                <option value={active.status} disabled>
                  {STATUS_TR[active.status] ?? active.status} (mevcut)
                </option>
                {STATUS_OPTS.filter((s) => s !== active.status).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_TR[s]}
                  </option>
                ))}
              </select>
              <div className="hint-sm">
                &quot;Devam&quot; için sigorta girişi zorunludur.
              </div>
              <div style={{ marginTop: 8 }}>
                <Button
                  icon="check"
                  sm
                  disabled={busy || !form.status || form.status === active.status}
                  onClick={() => saveStatus(active)}
                >
                  Durumu kaydet
                </Button>
              </div>
            </div>

            <div className="field" style={{ marginBottom: 0 }}>
              <label>Değerlendirme</label>
              <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
                <select
                  value={form.rating}
                  onChange={(e) => setForm((f) => ({ ...f, rating: e.target.value }))}
                  aria-label="Firma puanı"
                  style={{ flex: 1 }}
                >
                  <option value="">Firma puanı seçin…</option>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n} / 5
                    </option>
                  ))}
                </select>
                <select
                  value={form.grade}
                  onChange={(e) => setForm((f) => ({ ...f, grade: e.target.value }))}
                  aria-label="Staj notu"
                  style={{ flex: 1 }}
                >
                  <option value="">Not seçin…</option>
                  {GRADE_OPTS.map((g) => (
                    <option key={g} value={g}>
                      {GRADE_TR[g]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="hint-sm">
                &quot;Başarılı&quot; notu için staj defterinin teslim edilmiş olması zorunludur.
              </div>
              <div style={{ marginTop: 8 }}>
                <Button icon="award" sm disabled={busy} onClick={() => saveReview(active)}>
                  Değerlendirmeyi kaydet
                </Button>
              </div>
            </div>
          </>
        )}
      </Drawer>
    </>
  );
}
