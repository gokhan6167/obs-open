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
  SkeletonStats,
  Drawer,
  EmptyState,
  toast,
  fmtDate,
} from '@/app/ui';

interface HealthVisit {
  id: string;
  studentId: string;
  studentNo: string;
  studentEmail: string;
  visitDate: string | null;
  complaint: string | null;
  treatment: string | null;
  referredTo: string | null;
  createdAt: string;
}

interface StudentHit {
  id: string;
  studentNo: string;
  fullName: string;
  programName: string;
  status: string;
}

/** Backend ForbiddenException mesajı ("... yetkiniz yok") veya ham 403. */
const isForbidden = (e: unknown): boolean =>
  e instanceof Error && /yetkiniz yok|yetki|403/i.test(e.message);

/** Bugün, <input type="date"> için YYYY-MM-DD. */
function today(): string {
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function SaglikPage(): React.ReactElement {
  const [rows, setRows] = useState<HealthVisit[]>([]);
  const [err, setErr] = useState('');
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(true);

  // Yeni ziyaret sürgüsü.
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<StudentHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<StudentHit | null>(null);
  const [visitDate, setVisitDate] = useState(today());
  const [complaint, setComplaint] = useState('');
  const [treatment, setTreatment] = useState('');
  const [referredTo, setReferredTo] = useState('');
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState('');

  const load = useCallback(async () => {
    const res = await api<{ items: HealthVisit[] }>('/wellbeing/health');
    setRows(res.items ?? []);
  }, []);

  useEffect(() => {
    load()
      .catch((e) => {
        if (isForbidden(e)) {
          setDenied(true);
          return;
        }
        setErr(e instanceof Error ? e.message : 'Hata');
      })
      .finally(() => setLoading(false));
  }, [load]);

  const stats = useMemo(() => {
    const students = new Set(rows.map((r) => r.studentId));
    const limit = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recent = rows.filter((r) => {
      const t = new Date(r.visitDate ?? r.createdAt).getTime();
      return !isNaN(t) && t >= limit;
    });
    return {
      total: rows.length,
      students: students.size,
      referred: rows.filter((r) => (r.referredTo ?? '').trim() !== '').length,
      recent: recent.length,
    };
  }, [rows]);

  async function search(): Promise<void> {
    const term = q.trim();
    if (!term) return;
    setSearching(true);
    setFormErr('');
    try {
      const res = await api<{ items: StudentHit[] }>(
        `/portal/students?q=${encodeURIComponent(term)}`,
      );
      setHits(res.items ?? []);
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : 'Arama başarısız');
    } finally {
      setSearching(false);
    }
  }

  async function submit(): Promise<void> {
    if (!picked) {
      setFormErr('Önce öğrenci seçin.');
      return;
    }
    if (!complaint.trim()) {
      setFormErr('Şikâyet alanı zorunludur.');
      return;
    }
    setSaving(true);
    setFormErr('');
    try {
      await api('/wellbeing/health', {
        method: 'POST',
        body: {
          studentId: picked.id,
          ...(visitDate ? { visitDate } : {}),
          complaint: complaint.trim(),
          ...(treatment.trim() ? { treatment: treatment.trim() } : {}),
          ...(referredTo.trim() ? { referredTo: referredTo.trim() } : {}),
        },
      });
      toast('Sağlık kaydı oluşturuldu', {
        tone: 'ok',
        body: `${picked.studentNo} · ${fmtDate(visitDate)}`,
      });
      closeDrawer();
      await load();
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Kayıt başarısız';
      setFormErr(
        isForbidden(e)
          ? 'Sağlık kaydı oluşturma yetkiniz yok. Bu işlem yalnızca mediko/sağlık merkezi personeline açıktır.'
          : m,
      );
      toast(isForbidden(e) ? 'Yetkiniz yok' : 'Kayıt başarısız', { tone: 'err', body: m });
    } finally {
      setSaving(false);
    }
  }

  function closeDrawer(): void {
    setOpen(false);
    setQ('');
    setHits([]);
    setPicked(null);
    setVisitDate(today());
    setComplaint('');
    setTreatment('');
    setReferredTo('');
    setFormErr('');
  }

  return (
    <>
      <PageHeader
        title="Sağlık Merkezi (Mediko)"
        sub="Öğrenci sağlık merkezi ziyaret kayıtları — şikâyet, uygulanan tedavi ve yönlendirme."
        actions={
          !denied && (
            <Button icon="activity" onClick={() => setOpen(true)}>
              Yeni ziyaret kaydı
            </Button>
          )
        }
      />

      <Alert tone="warn">
        <b>Gizlilik uyarısı — özel nitelikli kişisel veri.</b> Bu ekrandaki sağlık verileri KVKK
        kapsamında özel nitelikli kişisel veridir. Yalnızca görevi gereği erişmesi gereken mediko
        personeli tarafından, tedavi ve yönlendirme amacıyla görüntülenebilir. Ekran görüntüsü
        alınması, dışa aktarılması ve üçüncü kişilerle paylaşılması yasaktır; tüm erişimler denetim
        kaydına işlenir.
      </Alert>

      {denied ? (
        <Card title="Erişim kısıtlı" icon="shield">
          <Alert tone="err">
            Sağlık kayıtlarına erişim yetkiniz yok. Bu modül yalnızca mediko/sağlık merkezi
            personeline açıktır.
          </Alert>
          <EmptyState
            icon="shield"
            title="Kayıtlar görüntülenemiyor"
            sub="Görev tanımınız gereği erişim gerekiyorsa sistem yöneticisinden rol tanımı talep edin."
          />
        </Card>
      ) : (
        <>
          {loading ? (
            <SkeletonStats n={4} />
          ) : (
            <StatGrid
              stats={[
                { label: 'Toplam ziyaret', value: stats.total, icon: 'activity' },
                { label: 'Öğrenci', value: stats.students, icon: 'users' },
                { label: 'Son 30 gün', value: stats.recent, icon: 'calendar' },
                { label: 'Yönlendirme', value: stats.referred, icon: 'link', tone: 'warn' },
              ]}
            />
          )}

          <Card title="Ziyaret kayıtları" icon="activity">
            {err && <Alert tone="err">{err}</Alert>}
            {loading ? (
              <Skeleton lines={8} />
            ) : (
              <DataTable<HealthVisit>
                rows={rows}
                search
                empty={
                  <EmptyState
                    icon="activity"
                    title="Henüz sağlık kaydı yok"
                    sub="Sağ üstten yeni ziyaret kaydı ekleyebilirsiniz."
                  />
                }
                columns={[
                  {
                    key: 'studentNo',
                    header: 'Öğrenci',
                    sortable: true,
                    value: (r) => `${r.studentNo} ${r.studentEmail}`,
                    render: (r) => (
                      <>
                        <b>{r.studentNo}</b>
                        <div className="muted">{r.studentEmail}</div>
                      </>
                    ),
                  },
                  {
                    key: 'visitDate',
                    header: 'Tarih',
                    sortable: true,
                    value: (r) => r.visitDate ?? r.createdAt,
                    render: (r) => fmtDate(r.visitDate ?? r.createdAt),
                  },
                  {
                    key: 'complaint',
                    header: 'Şikâyet',
                    sortable: true,
                    value: (r) => r.complaint ?? '',
                    render: (r) => r.complaint ?? <span className="muted">—</span>,
                  },
                  {
                    key: 'treatment',
                    header: 'Tedavi',
                    sortable: true,
                    value: (r) => r.treatment ?? '',
                    render: (r) => r.treatment ?? <span className="muted">—</span>,
                  },
                  {
                    key: 'referredTo',
                    header: 'Yönlendirme',
                    sortable: true,
                    value: (r) => r.referredTo ?? '',
                    render: (r) =>
                      r.referredTo ? (
                        <Badge tone="warn">{r.referredTo}</Badge>
                      ) : (
                        <span className="muted">—</span>
                      ),
                  },
                ]}
              />
            )}
          </Card>
        </>
      )}

      <Drawer open={open} onClose={closeDrawer} title="Yeni sağlık ziyareti kaydı">
        {formErr && <Alert tone="err">{formErr}</Alert>}

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
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 0 }}>
              <span>
                <b>{picked.studentNo}</b> · {picked.fullName}
              </span>
              <Button variant="ghost" sm icon="refresh" onClick={() => setPicked(null)}>
                Değiştir
              </Button>
            </div>
          </div>
        ) : (
          hits.length > 0 && (
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
          )
        )}

        <h2>2 · Muayene bilgisi</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="field">
            <label>Ziyaret tarihi</label>
            <input type="date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} />
          </div>

          <div className="field">
            <label>Şikâyet</label>
            <textarea
              value={complaint}
              onChange={(e) => setComplaint(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Öğrencinin başvuru sebebi"
              required
            />
          </div>

          <div className="field">
            <label>Uygulanan tedavi</label>
            <textarea
              value={treatment}
              onChange={(e) => setTreatment(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Yapılan müdahale, verilen ilaç vb."
            />
          </div>

          <div className="field">
            <label>Yönlendirme</label>
            <input
              value={referredTo}
              onChange={(e) => setReferredTo(e.target.value)}
              maxLength={200}
              placeholder="Örn. Devlet Hastanesi Acil"
            />
            <div className="hint-sm">
              Sevk edilmediyse boş bırakın. Kayıt, sağlık gizliliği kapsamında denetim günlüğüne
              işlenir.
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <Button type="submit" icon="activity" disabled={saving || !picked} block>
              {saving ? 'Kaydediliyor…' : 'Kaydı oluştur'}
            </Button>
          </div>
        </form>
      </Drawer>
    </>
  );
}
