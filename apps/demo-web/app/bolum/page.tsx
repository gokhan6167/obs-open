'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import {
  PageHeader,
  Card,
  StatGrid,
  Badge,
  Alert,
  Skeleton,
  SkeletonStats,
  BarChart,
  Donut,
  EmptyState,
  Meter,
} from '@/app/ui';

interface StudentRow {
  id: string;
  studentNo: string;
  fullName: string;
  programName: string;
  status: string;
  gpa: number | null;
}
interface SectionRow {
  sectionId: string;
  courseCode: string;
  courseName: string;
  fillRate: number;
  quota: number;
  enrolled: number;
  isOpen: boolean;
}
interface Term {
  id: string;
  name: string;
}
interface TermStats {
  sectionCount: number;
  totalQuota: number;
  totalFilled: number;
  fillRate: number;
  enrollmentsByStatus: Record<string, number>;
}

const STATUS_TR: Record<string, string> = {
  aktif: 'Aktif',
  submitted: 'Onay bekliyor',
  advisor_approved: 'Danışman onayladı',
  enrolled: 'Kesin kayıt',
  draft: 'Sepette',
  withdrawn: 'Çekildi',
};

export default function BolumPano(): React.ReactElement {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [term, setTerm] = useState<Term | null>(null);
  const [stats, setStats] = useState<TermStats | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [st, sec, t] = await Promise.all([
          api<{ items: StudentRow[] }>('/portal/students'),
          api<{ items: SectionRow[] }>('/portal/sections'),
          api<Term | null>('/calendar/active-term'),
        ]);
        setStudents(st.items);
        setSections(sec.items);
        setTerm(t);
        if (t?.id) {
          const s = await api<TermStats>(`/enrollment/stats/${t.id}`).catch(() => null);
          setStats(s);
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Yükleme hatası');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (err) return <Alert tone="err">{err}</Alert>;

  if (loading) {
    return (
      <>
        <PageHeader title="Bölüm Panosu" sub="Karar bekleyen işler, dönem kayıt ve doluluk özeti" />
        <SkeletonStats n={4} />
        <Card>
          <Skeleton lines={6} />
        </Card>
      </>
    );
  }

  const pendingEnroll = stats?.enrollmentsByStatus['submitted'] ?? 0;
  const activeStudents = students.filter((s) => s.status === 'aktif').length;
  const gpas = students.map((s) => s.gpa).filter((g): g is number => g != null);
  const avgGpa = gpas.length ? gpas.reduce((a, b) => a + b, 0) / gpas.length : null;
  const riskyCount = gpas.filter((g) => g < 2.0).length;
  const fullSections = sections.filter((s) => !s.isOpen).length;
  const avgFill = sections.length
    ? Math.round(sections.reduce((a, s) => a + s.fillRate, 0) / sections.length)
    : 0;

  // Doluluğu en yüksek şubeler (kontenjan baskısı)
  const hotSections = [...sections].sort((a, b) => b.fillRate - a.fillRate).slice(0, 6);

  const statusData = Object.entries(stats?.enrollmentsByStatus ?? {}).map(([k, v]) => ({
    label: STATUS_TR[k] ?? k,
    value: v,
  }));

  return (
    <>
      <PageHeader
        title="Bölüm Panosu"
        sub={`${term ? `${term.name} · ` : ''}Karar bekleyen işler, dönem kayıt ve doluluk özeti`}
      />

      <StatGrid
        stats={[
          {
            label: 'Onay bekleyen kayıt',
            value: pendingEnroll,
            icon: 'inbox',
            tone: pendingEnroll > 0 ? 'warn' : undefined,
          },
          { label: 'Aktif öğrenci', value: activeStudents, icon: 'users' },
          {
            label: 'Ortalama GNO',
            value: avgGpa != null ? avgGpa.toFixed(2) : '—',
            icon: 'grade',
          },
          {
            label: 'GNO < 2.00 öğrenci',
            value: riskyCount,
            icon: 'alert',
            tone: riskyCount > 0 ? 'danger' : undefined,
          },
        ]}
      />

      <div className="home-grid">
        <Card
          title="Dönem Kayıt İstatistiği"
          icon="chart"
          hint={`${term ? term.name : 'Aktif dönem'} — canlı kontenjan ve kayıt durumu.`}
        >
          {stats ? (
            <>
              <StatGrid
                stats={[
                  { label: 'Şube', value: stats.sectionCount, icon: 'layers' },
                  {
                    label: 'Dolu / Kontenjan',
                    value: `${stats.totalFilled}/${stats.totalQuota}`,
                    icon: 'users',
                  },
                  {
                    label: 'Doluluk',
                    value: `${Math.round(stats.fillRate * 100)}%`,
                    icon: 'pie',
                    tone: stats.fillRate >= 0.85 ? 'warn' : undefined,
                  },
                ]}
              />
              {statusData.length === 0 ? (
                <div style={{ marginTop: 12 }}>
                  <EmptyState
                    icon="inbox"
                    title="Bu dönem henüz kayıt yok"
                    sub="Kayıt döneminde durum dağılımı burada görünecek."
                  />
                </div>
              ) : (
                <div style={{ marginTop: 12 }}>
                  <BarChart data={statusData} />
                </div>
              )}
            </>
          ) : (
            <EmptyState
              icon="chart"
              title="Aktif dönem istatistiği bulunamadı"
              sub="Aktif bir dönem tanımlandığında kayıt istatistiği burada görünür."
            />
          )}
        </Card>

        <Card
          title="Kontenjan Baskısı"
          icon="target"
          hint={`Doluluğu en yüksek şubeler. ${fullSections} şube dolu · ortalama doluluk %${avgFill}.`}
          actions={
            <Link className="btn ghost sm" href="/bolum/subeler">
              Tüm şubeler →
            </Link>
          }
        >
          <div className="row" style={{ alignItems: 'center', gap: 16, marginBottom: 12 }}>
            <Donut value={avgFill} color={avgFill >= 85 ? 'var(--danger)' : 'var(--accent)'} />
            <div>
              <div style={{ fontWeight: 600 }}>Ortalama doluluk %{avgFill}</div>
              <div className="muted" style={{ fontSize: 13 }}>
                {fullSections} şube dolu / {sections.length} şube
              </div>
            </div>
          </div>
          {hotSections.length === 0 ? (
            <EmptyState icon="layers" title="Aktif dönemde şube kaydı yok" />
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {hotSections.map((s) => (
                <li key={s.sectionId} className="list-item">
                  <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ minWidth: 0 }}>
                      <b>{s.courseCode}</b> · {s.courseName}
                    </div>
                    <Badge tone={s.fillRate >= 100 ? 'danger' : s.fillRate >= 80 ? 'warn' : 'ok'}>
                      {s.enrolled}/{s.quota} · %{s.fillRate}
                    </Badge>
                  </div>
                  <Meter value={Math.min(s.fillRate, 100)} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Bekleyen İşler" icon="flag">
        <div className="info-box">
          Onay bekleyen {pendingEnroll} ders kaydı bölüm başkanı incelemesine düşer. Bekleyen
          kayıtları ve bölüm başarı dağılımını{' '}
          <Link href="/bolum/not-onay">Onay Kuyruğu</Link>&apos;ndan izleyebilir, öğrenci
          detaylarını <Link href="/bolum/ogrenciler">Bölüm Öğrencileri</Link>{' '}
          üzerinden inceleyebilirsiniz.
        </div>
        <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <Link className="btn primary sm" href="/bolum/not-onay">
            Onay Kuyruğu
          </Link>
          <Link className="btn ghost sm" href="/bolum/ogrenciler">
            Bölüm Öğrencileri
          </Link>
        </div>
      </Card>
    </>
  );
}
