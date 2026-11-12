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
  Drawer,
  toast,
  fmtDate,
} from '@/app/ui';

interface Qualification {
  id: string;
  studentId: string;
  studentNo: string;
  studentEmail: string;
  examDate: string | null;
  writtenScore: string | null;
  oralScore: string | null;
  result: string;
  attemptNo: number;
  note: string | null;
  createdAt: string;
}

interface StudentHit {
  id: string;
  studentNo: string;
  fullName: string;
  programName: string;
  status: string;
}

const RESULT_TR: Record<string, string> = {
  basarili: 'Başarılı',
  basarisiz: 'Başarısız',
  beklemede: 'Beklemede',
};
const RESULT_TONE: Record<string, 'ok' | 'danger' | 'warn' | 'muted'> = {
  basarili: 'ok',
  basarisiz: 'danger',
  beklemede: 'warn',
};

const score = (s: string | null): string => (s === null ? '—' : String(Number(s)));

export default function YeterlilikPage(): React.ReactElement {
  const [rows, setRows] = useState<Qualification[]>([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  // Yeni sınav sürgüsü.
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<StudentHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<StudentHit | null>(null);
  const [examDate, setExamDate] = useState('');
  const [writtenScore, setWrittenScore] = useState('');
  const [oralScore, setOralScore] = useState('');
  const [jury, setJury] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState('');

  const load = useCallback(async () => {
    const res = await api<{ items: Qualification[] }>('/thesis-process/qualification');
    setRows(res.items ?? []);
  }, []);

  useEffect(() => {
    load()
      .catch((e) => setErr(e instanceof Error ? e.message : 'Hata'))
      .finally(() => setLoading(false));
  }, [load]);

  const stats = useMemo(
    () => ({
      total: rows.length,
      ok: rows.filter((r) => r.result === 'basarili').length,
      fail: rows.filter((r) => r.result === 'basarisiz').length,
    }),
    [rows],
  );

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

  function closeDrawer(): void {
    setOpen(false);
    setQ('');
    setHits([]);
    setPicked(null);
    setExamDate('');
    setWrittenScore('');
    setOralScore('');
    setJury('');
    setNote('');
    setFormErr('');
  }

  async function submit(): Promise<void> {
    if (!picked) {
      setFormErr('Önce öğrenci seçin.');
      return;
    }
    const written = writtenScore.trim() === '' ? undefined : Number(writtenScore);
    const oral = oralScore.trim() === '' ? undefined : Number(oralScore);
    for (const v of [written, oral]) {
      if (v !== undefined && (Number.isNaN(v) || v < 0 || v > 100)) {
        setFormErr('Puanlar 0-100 aralığında olmalıdır.');
        return;
      }
    }
    const juryList = jury
      .split(',')
      .map((j) => j.trim())
      .filter(Boolean);

    setSaving(true);
    setFormErr('');
    try {
      await api('/thesis-process/qualification', {
        method: 'POST',
        body: {
          studentId: picked.id,
          ...(examDate ? { examDate } : {}),
          ...(written !== undefined ? { writtenScore: written } : {}),
          ...(oral !== undefined ? { oralScore: oral } : {}),
          ...(juryList.length > 0 ? { jury: juryList } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      });
      toast('Yeterlilik sınavı kaydedildi', {
        tone: 'ok',
        body: `${picked.studentNo} · ${picked.fullName}`,
      });
      closeDrawer();
      await load();
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Kayıt başarısız';
      setFormErr(m);
      toast('Kayıt başarısız', { tone: 'err', body: m });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Doktora Yeterlilik"
        sub="Doktora yeterlilik sınavı kayıtları; yazılı ve sözlü puanlar ile deneme takibi."
        actions={
          <Button icon="award" onClick={() => setOpen(true)}>
            Yeni sınav
          </Button>
        }
      />

      {loading ? (
        <SkeletonStats n={3} />
      ) : (
        <StatGrid
          stats={[
            { label: 'Toplam sınav', value: stats.total, icon: 'award' },
            { label: 'Başarılı', value: stats.ok, icon: 'checkCircle', tone: 'ok' },
            {
              label: 'Başarısız',
              value: stats.fail,
              icon: 'flag',
              tone: stats.fail > 0 ? 'danger' : undefined,
            },
          ]}
        />
      )}

      <Card
        title="Yeterlilik sınavları"
        icon="award"
        hint="Yazılı ve sözlü puanların ikisi de 70 ve üzeriyse sonuç başarılıdır; deneme numarası her yeni kayıtta otomatik artar."
      >
        {err && <Alert tone="err">{err}</Alert>}
        {loading ? (
          <Skeleton lines={8} />
        ) : (
          <DataTable<Qualification>
            rows={rows}
            search
            csv
            csvName="oidb-doktora-yeterlilik"
            empty={
              <EmptyState
                icon="award"
                title="Henüz yeterlilik sınavı kaydı yok"
                sub="Sağ üstten yeni sınav kaydı ekleyebilirsiniz."
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
              {
                key: 'examDate',
                header: 'Sınav tarihi',
                sortable: true,
                value: (r) => r.examDate ?? '',
                render: (r) =>
                  r.examDate ? fmtDate(r.examDate) : <span className="muted">—</span>,
              },
              {
                key: 'writtenScore',
                header: 'Yazılı',
                sortable: true,
                num: true,
                value: (r) => (r.writtenScore === null ? '' : Number(r.writtenScore)),
                render: (r) => score(r.writtenScore),
              },
              {
                key: 'oralScore',
                header: 'Sözlü',
                sortable: true,
                num: true,
                value: (r) => (r.oralScore === null ? '' : Number(r.oralScore)),
                render: (r) => score(r.oralScore),
              },
              {
                key: 'attemptNo',
                header: 'Deneme',
                sortable: true,
                num: true,
                value: (r) => r.attemptNo,
                render: (r) => `${r.attemptNo}. deneme`,
              },
              {
                key: 'result',
                header: 'Sonuç',
                sortable: true,
                value: (r) => RESULT_TR[r.result] ?? r.result,
                render: (r) => (
                  <Badge tone={RESULT_TONE[r.result] ?? 'muted'}>
                    {RESULT_TR[r.result] ?? r.result}
                  </Badge>
                ),
              },
            ]}
          />
        )}
      </Card>

      <Drawer open={open} onClose={closeDrawer} title="Yeni yeterlilik sınavı">
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

        <h2>2 · Sınav bilgisi</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="field">
            <label>Sınav tarihi</label>
            <input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
          </div>

          <div className="row" style={{ alignItems: 'flex-end' }}>
            <div className="field" style={{ flex: '1 1 120px', marginBottom: 0 }}>
              <label>Yazılı puan</label>
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={writtenScore}
                onChange={(e) => setWrittenScore(e.target.value)}
                placeholder="0-100"
              />
            </div>
            <div className="field" style={{ flex: '1 1 120px', marginBottom: 0 }}>
              <label>Sözlü puan</label>
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={oralScore}
                onChange={(e) => setOralScore(e.target.value)}
                placeholder="0-100"
              />
            </div>
          </div>

          <div className="field" style={{ marginTop: 12 }}>
            <label>Jüri (virgülle ayırın)</label>
            <input
              value={jury}
              onChange={(e) => setJury(e.target.value)}
              placeholder="Prof. Dr. A. Yılmaz, Doç. Dr. B. Kaya"
            />
          </div>

          <div className="field">
            <label>Not</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Sınavla ilgili açıklama (opsiyonel)"
            />
          </div>

          <Alert tone="info">
            İki puan da 70 ve üzeriyse sonuç <b>başarılı</b>, ikisi de girilip biri altındaysa{' '}
            <b>başarısız</b> olur. Puan girilmezse kayıt <b>beklemede</b> kalır. Deneme numarası
            öğrencinin önceki kayıtlarına göre otomatik belirlenir.
          </Alert>

          <div style={{ marginTop: 16 }}>
            <Button type="submit" icon="award" disabled={saving || !picked} block>
              {saving ? 'Kaydediliyor…' : 'Sınavı kaydet'}
            </Button>
          </div>
        </form>
      </Drawer>
    </>
  );
}
