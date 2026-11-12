'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import {
  PageHeader,
  Card,
  StatGrid,
  Badge,
  Button,
  Alert,
  EmptyState,
  SkeletonStats,
  Skeleton,
  ProgressBar,
  DataTable,
} from '@/app/ui';
import {
  type RosterRow,
  type Section,
  GRADE_ST_TR,
} from './_grades';

interface Term {
  id: string;
  name: string;
}
interface CalWindow {
  type: string;
  startsAt: string;
  endsAt: string;
}

/** Şube + gerçek roster (enrollments join'li) — grade-türevli sayımlar yerine. */
interface SectionWithRoster extends Section {
  roster: RosterRow[];
}

function isOpenNow(w: CalWindow): boolean {
  const now = Date.now();
  return new Date(w.startsAt).getTime() <= now && now <= new Date(w.endsAt).getTime();
}

function stTone(status: string | null): 'ok' | 'warn' | 'danger' | 'info' | 'muted' {
  switch (status) {
    case 'announced':
    case 'finalized':
      return 'ok';
    case 'submitted':
      return 'warn';
    case 'draft':
      return 'info';
    default:
      return 'muted';
  }
}

export default function Panom(): React.ReactElement {
  const [secs, setSecs] = useState<SectionWithRoster[] | null>(null);
  const [term, setTerm] = useState<Term | null>(null);
  const [gradeWindowOpen, setGradeWindowOpen] = useState<boolean | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      const [teaching, activeTerm] = await Promise.all([
        api<Section[]>('/portal/teaching'),
        api<Term | null>('/calendar/active-term'),
      ]);
      // Her şube için GERÇEK roster'ı çek: kayıtlı sayısı, notu girilmiş, ilan edilmiş
      // artık grade-türevli 'enrolled' yerine enrollments tablosundan gelir.
      const withRoster = await Promise.all(
        teaching.map(async (s) => {
          const r = await api<{ items: RosterRow[] }>(`/grades/sections/${s.id}/roster`).catch(
            () => ({ items: [] as RosterRow[] }),
          );
          return { ...s, roster: r.items };
        }),
      );
      setSecs(withRoster);
      setTerm(activeTerm);
      if (activeTerm?.id) {
        const windows = await api<CalWindow[]>(`/calendar/terms/${activeTerm.id}/windows`);
        const gw = windows.find((w) => /not/i.test(w.type));
        setGradeWindowOpen(gw ? isOpenNow(gw) : false);
      }
    })().catch((e) => setErr(e instanceof Error ? e.message : 'Yükleme hatası'));
  }, []);

  if (err) {
    return (
      <>
        <PageHeader title="Şubelerim" sub="Verdiğiniz ders ve şubeler." />
        <Alert tone="err">{err}</Alert>
      </>
    );
  }

  if (!secs) {
    return (
      <>
        <PageHeader title="Şubelerim" sub="Verdiğiniz ders ve şubeler." />
        <SkeletonStats n={4} />
        <Card>
          <Skeleton lines={6} />
        </Card>
      </>
    );
  }

  const toplamOgrenci = secs.reduce((a, s) => a + s.roster.length, 0);
  const notGirilen = secs.reduce(
    (a, s) => a + s.roster.filter((r) => r.rawScore !== null).length,
    0,
  );
  const ilanEdilen = secs.reduce(
    (a, s) =>
      a + s.roster.filter((r) => r.status === 'announced' || r.status === 'finalized').length,
    0,
  );
  const notPct = toplamOgrenci > 0 ? Math.round((notGirilen / toplamOgrenci) * 100) : 0;

  return (
    <>
      <PageHeader
        title="Şubelerim"
        sub={`${term ? `${term.name} — ` : ''}verdiğiniz ders ve şubeler, gerçek kayıtlı öğrenci sayıları ve not giriş durumu.`}
        actions={
          <Link href="/hoca/not-girisi">
            <Button icon="edit">Not girişi</Button>
          </Link>
        }
      />

      <StatGrid
        stats={[
          { label: 'Aktif Şube', value: secs.length, icon: 'layers' },
          { label: 'Kayıtlı Öğrenci', value: toplamOgrenci, icon: 'users' },
          {
            label: 'Notu Girilmiş',
            value: `${notGirilen}/${toplamOgrenci}`,
            icon: 'grade',
            tone: toplamOgrenci > 0 && notGirilen < toplamOgrenci ? 'warn' : 'ok',
          },
          { label: 'İlan Edilmiş', value: ilanEdilen, icon: 'checkCircle', tone: 'ok' },
        ]}
      />

      {gradeWindowOpen !== null && (
        <Alert tone={gradeWindowOpen ? 'ok' : 'warn'}>
          {gradeWindowOpen
            ? 'Not giriş penceresi şu anda açık — taslak notlarınızı girip onaya gönderebilirsiniz.'
            : 'Not giriş penceresi kapalı. Girişler yalnızca akademik takvimdeki pencere içinde onaya gönderilebilir.'}
        </Alert>
      )}

      {toplamOgrenci > 0 && (
        <Card title="Genel not giriş ilerlemesi" icon="chart">
          <ProgressBar value={notPct} tone={notPct < 100 ? 'warn' : undefined} />
          <p className="hint" style={{ marginTop: 8 }}>
            {notGirilen}/{toplamOgrenci} öğrencinin puanı girildi · %{notPct}
          </p>
        </Card>
      )}

      {secs.length === 0 && (
        <EmptyState
          icon="layers"
          title="Atanmış şube görünmüyor"
          sub="Bu dönem size atanmış şube bulunmuyor. Şube atamaları bölüm/OİDB tarafından yapılır."
        />
      )}

      {secs.map((s) => {
        const kayitli = s.roster.length;
        const girilen = s.roster.filter((r) => r.rawScore !== null).length;
        const durumTone =
          kayitli === 0 || girilen === 0 ? 'muted' : girilen < kayitli ? 'warn' : 'ok';
        const durumText =
          kayitli === 0
            ? 'Kayıtlı öğrenci yok'
            : girilen === 0
              ? 'Not girişi başlamadı'
              : girilen < kayitli
                ? 'Kısmen girildi'
                : 'Tamamlandı';
        return (
          <Card
            key={s.id}
            title={`${s.courseCode} · ${s.courseName}`}
            icon="book"
            hint={`Şube ${s.code} · ${s.termName} · Kayıtlı ${kayitli}/${s.quota} · Notu girilmiş ${girilen}/${kayitli}`}
            actions={<Badge tone={durumTone}>{durumText}</Badge>}
          >
            <div className="row" style={{ gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <Link href="/hoca/ogrenciler">
                <Button variant="ghost" sm icon="users">
                  Öğrenci listesi
                </Button>
              </Link>
              <Link href="/hoca/not-girisi">
                <Button sm icon="edit">
                  Not girişi
                </Button>
              </Link>
            </div>
            {kayitli === 0 ? (
              <EmptyState
                icon="users"
                title="Henüz öğrenci kaydı yok"
                sub="Bu şubeye ders kaydı onaylandıkça liste dolar."
              />
            ) : (
              <DataTable
                rows={s.roster}
                pageSize={8}
                csv
                csvName={`${s.courseCode}-${s.code}-liste`}
                columns={[
                  { key: 'studentNo', header: 'Öğrenci No', value: (r) => r.studentNo, sortable: true },
                  { key: 'fullName', header: 'Ad Soyad', value: (r) => r.fullName, sortable: true },
                  {
                    key: 'rawScore',
                    header: 'Puan',
                    num: true,
                    sortable: true,
                    value: (r) => r.rawScore ?? -1,
                    render: (r) => r.rawScore ?? '—',
                  },
                  { key: 'letter', header: 'Harf', value: (r) => r.letter ?? '', render: (r) => r.letter ?? '—' },
                  {
                    key: 'status',
                    header: 'Durum',
                    value: (r) => (r.status ? GRADE_ST_TR[r.status] ?? r.status : 'Not yok'),
                    render: (r) =>
                      r.status ? (
                        <Badge tone={stTone(r.status)}>{GRADE_ST_TR[r.status] ?? r.status}</Badge>
                      ) : (
                        <Badge tone="muted">Not yok</Badge>
                      ),
                  },
                ]}
              />
            )}
          </Card>
        );
      })}
    </>
  );
}
