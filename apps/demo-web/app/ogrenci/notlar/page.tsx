'use client';
import { useEffect, useState } from 'react';
import { api, getToken } from '@/lib/api';
import { API_BASE } from '@/lib/config';
import {
  PageHeader,
  Card,
  StatGrid,
  DataTable,
  Badge,
  Button,
  Alert,
  EmptyState,
  Skeleton,
  SkeletonStats,
  ProgressBar,
  toast,
} from '@/app/ui';

interface Grade {
  courseCode: string;
  courseName: string;
  letter: string | null;
  rawScore: number | null;
  status: string;
  termName: string;
  year: number;
}
interface Me {
  student?: {
    id: string;
    studentNo: string;
    gpa: number;
    program: { name: string };
    grades: Grade[];
  };
}
interface GradStatus {
  completion: {
    missingMandatory: string[];
    missingMandatoryEcts: number;
    meetsGpa: boolean;
    meetsEcts: boolean;
    isComplete: boolean;
  };
  gpa: number;
  earnedEcts: number;
  honor: string;
}

const STATUS_TR: Record<string, string> = {
  announced: 'İlan edildi',
  finalized: 'Kesinleşti',
  draft: 'Taslak',
};
const FAIL = new Set(['FF', 'NA', 'DZ', 'FD']);

export default function NotlarTranskript(): React.ReactElement {
  const [me, setMe] = useState<Me | null>(null);
  const [grad, setGrad] = useState<GradStatus | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const m = await api<Me>('/portal/me');
      setMe(m);
      if (m.student?.id) {
        try {
          setGrad(await api<GradStatus>(`/graduation/students/${m.student.id}/status`));
        } catch {
          /* mezuniyet motoru veri yoksa sessiz geç */
        }
      }
    })().catch((e) => setErr(e instanceof Error ? e.message : 'Hata'));
  }, []);

  async function downloadTranscript(): Promise<void> {
    if (!me?.student?.id) return;
    setBusy(true);
    setErr('');
    try {
      const res = await fetch(
        `${API_BASE}/documents/students/${me.student.id}/transcript`,
        {
          method: 'POST',
          headers: { authorization: `Bearer ${getToken() ?? ''}` },
        },
      );
      if (!res.ok) throw new Error(`Transkript üretilemedi (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `transkript-${me.student.studentNo}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast('Transkript indirildi', {
        tone: 'ok',
        body: 'Belge üzerindeki QR kodu doğrulama sayfasına götürür.',
      });
    } catch (e) {
      const m = e instanceof Error ? e.message : 'İndirme başarısız';
      setErr(m);
      toast('İndirme başarısız', { tone: 'err', body: m });
    } finally {
      setBusy(false);
    }
  }

  if (err && !me)
    return (
      <>
        <PageHeader title="Notlarım & Transkript" />
        <Alert tone="err">{err}</Alert>
      </>
    );
  if (!me?.student)
    return (
      <>
        <PageHeader title="Notlarım & Transkript" sub="Notlarınız yükleniyor…" />
        <SkeletonStats n={4} />
        <Skeleton lines={5} />
      </>
    );
  const s = me.student;

  // Dönem dönem grupla.
  const byTerm = new Map<string, Grade[]>();
  for (const g of s.grades) {
    const key = g.termName;
    (byTerm.get(key) ?? byTerm.set(key, []).get(key)!).push(g);
  }
  const terms = Array.from(byTerm.entries());
  const riskCourses = s.grades.filter((g) => g.letter && FAIL.has(g.letter));

  return (
    <>
      <PageHeader
        title="Notlarım & Transkript"
        sub={`${s.studentNo} · ${s.program.name}`}
        actions={
          <Button variant="ok" icon="download" onClick={downloadTranscript} disabled={busy}>
            {busy ? 'Üretiliyor…' : 'Transkript PDF'}
          </Button>
        }
      />

      {err && <Alert tone="err">{err}</Alert>}

      <StatGrid
        stats={[
          { label: 'GNO', value: s.gpa.toFixed(2), icon: 'award' },
          {
            label: 'Kazanılan AKTS',
            value: grad ? grad.earnedEcts : '—',
            icon: 'layers',
          },
          {
            label: 'Kalan zorunlu AKTS',
            value: grad ? grad.completion.missingMandatoryEcts : '—',
            icon: 'target',
            tone:
              grad && grad.completion.missingMandatoryEcts > 0 ? 'danger' : 'ok',
          },
          {
            label: 'Onur durumu',
            value: grad ? grad.honor : '—',
            icon: 'shield',
          },
        ]}
      />

      {grad && (
        <Alert tone={grad.completion.isComplete ? 'ok' : 'info'}>
          {grad.completion.isComplete
            ? 'Mezuniyet koşulları sağlanıyor. ÖİDB onayı bekleniyor.'
            : `Mezuniyet için eksikler — Zorunlu ders: ${
                grad.completion.missingMandatory.length
              } (${grad.completion.missingMandatoryEcts} AKTS), GNO ${
                grad.completion.meetsGpa ? 'yeterli' : 'yetersiz'
              }, toplam AKTS ${grad.completion.meetsEcts ? 'yeterli' : 'yetersiz'}.`}
          {grad.completion.missingMandatory.length > 0 && (
            <div className="meta" style={{ marginTop: 6 }}>
              Eksik zorunlu dersler: {grad.completion.missingMandatory.join(', ')}
            </div>
          )}
        </Alert>
      )}

      <Card
        title="Belge"
        icon="fileText"
        hint={
          <>
            Resmî transkriptiniz doğrulama kodu ve QR ile üretilir. Üçüncü taraflar
            belgedeki kodu <code>/public/verify/&lt;kod&gt;</code> ile doğrular.
          </>
        }
      >
        <Button variant="ok" icon="download" onClick={downloadTranscript} disabled={busy}>
          {busy ? 'Üretiliyor…' : 'Transkript PDF indir'}
        </Button>
      </Card>

      {riskCourses.length > 0 && (
        <Card
          title="Risk Dersleri"
          icon="alert"
          hint="Kalır not aldığınız, tekrar gereken dersler."
        >
          <DataTable
            rows={riskCourses}
            search={false}
            columns={[
              {
                key: 'course',
                header: 'Ders',
                value: (g) => `${g.courseCode} ${g.courseName}`,
                render: (g) => (
                  <>
                    <b>{g.courseCode}</b> · {g.courseName}
                  </>
                ),
              },
              { key: 'term', header: 'Dönem', value: (g) => g.termName },
              {
                key: 'letter',
                header: 'Harf',
                value: (g) => g.letter ?? '',
                render: (g) => <Badge tone="danger">{g.letter}</Badge>,
              },
            ]}
          />
        </Card>
      )}

      {terms.length === 0 ? (
        <Card>
          <EmptyState
            icon="grade"
            title="Henüz not girişi yok"
            sub="Öğretim elemanları not girdikçe dönem dönem burada listelenir."
          />
        </Card>
      ) : (
        terms.map(([termName, rows]) => {
          const graded = rows.filter((g) => g.letter);
          const passed = graded.filter((g) => !FAIL.has(g.letter!)).length;
          const passPct = graded.length ? (passed / graded.length) * 100 : 0;
          return (
            <Card
              key={termName}
              title={termName}
              icon="calendar"
              hint={`${rows.length} ders · ${passed}/${graded.length} geçildi`}
            >
              {graded.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <ProgressBar value={passPct} />
                </div>
              )}
              <DataTable
                rows={rows}
                search={false}
                columns={[
                  {
                    key: 'course',
                    header: 'Ders',
                    value: (g) => `${g.courseCode} ${g.courseName}`,
                    render: (g) => (
                      <>
                        <b>{g.courseCode}</b> · {g.courseName}
                      </>
                    ),
                  },
                  {
                    key: 'score',
                    header: 'Puan',
                    num: true,
                    value: (g) => g.rawScore ?? -1,
                    render: (g) => (g.rawScore ?? '—'),
                  },
                  {
                    key: 'letter',
                    header: 'Harf',
                    value: (g) => g.letter ?? '',
                    render: (g) => (
                      <Badge tone={g.letter && FAIL.has(g.letter) ? 'danger' : 'ok'}>
                        {g.letter ?? '—'}
                      </Badge>
                    ),
                  },
                  {
                    key: 'status',
                    header: 'Durum',
                    value: (g) => STATUS_TR[g.status] ?? g.status,
                    render: (g) => (
                      <Badge tone={g.status === 'announced' ? 'ok' : 'muted'}>
                        {STATUS_TR[g.status] ?? g.status}
                      </Badge>
                    ),
                  },
                ]}
              />
            </Card>
          );
        })
      )}
    </>
  );
}
