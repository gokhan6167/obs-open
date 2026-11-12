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
  EmptyState,
  SkeletonStats,
  Skeleton,
  BarChart,
  Alert,
  fmtDate,
  money,
} from '@/app/ui';

interface Me {
  student?: {
    id: string;
    studentNo: string;
    status: string;
    program: { name: string; code: string };
    gpa: number;
  };
}
interface Sched {
  courseCode: string;
  courseName: string;
  ects: number;
  sectionCode: string;
  termName: string;
  status: string;
}
interface Term {
  id: string;
  year: number;
  term: string;
  name: string;
  startsOn: string;
  endsOn: string;
}
interface Debt {
  studentId: string;
  outstanding: number;
}
interface Req {
  id: string;
  type: string;
  status: string;
  createdAt: string;
}
interface Ann {
  title: string;
  body: string;
  createdAt: string;
}

const STATUS_TR: Record<string, string> = {
  active: 'Aktif',
  frozen: 'Dondurulmuş',
  graduated: 'Mezun',
  dismissed: 'İlişik kesildi',
};
const OPEN_REQ = new Set(['submitted', 'in_review']);

export default function Bugun(): React.ReactElement {
  const [me, setMe] = useState<Me | null>(null);
  const [sched, setSched] = useState<Sched[]>([]);
  const [term, setTerm] = useState<Term | null>(null);
  const [debt, setDebt] = useState<number | null>(null);
  const [reqs, setReqs] = useState<Req[]>([]);
  const [ann, setAnn] = useState<Ann[]>([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      const [m, s, t, a, r] = await Promise.all([
        api<Me>('/portal/me'),
        api<Sched[]>('/portal/schedule'),
        api<Term | null>('/calendar/active-term'),
        api<Ann[]>('/portal/announcements'),
        api<Req[]>('/portal/requests'),
      ]);
      setMe(m);
      setSched(s);
      setTerm(t);
      setAnn(a);
      setReqs(r);
      if (m.student?.id) {
        const d = await api<Debt>(`/finance/students/${m.student.id}/debt`);
        setDebt(d.outstanding);
      }
    })().catch((e) => setErr(e instanceof Error ? e.message : 'Yükleme hatası'));
  }, []);

  if (err)
    return (
      <>
        <PageHeader title="Bugün" />
        <Alert tone="err">{err}</Alert>
      </>
    );

  const s = me?.student;
  if (!s)
    return (
      <>
        <PageHeader title="Bugün" sub="Akademik özetiniz hazırlanıyor…" />
        <SkeletonStats n={4} />
        <Skeleton lines={4} />
      </>
    );

  const openReqs = reqs.filter((r) => OPEN_REQ.has(r.status));
  const nextAnn = ann[0];
  const hasDebt = (debt ?? 0) > 0;

  // Onaylı/bekleyen ders dağılımı (AKTS bazında görselleştirme).
  const ectsByStatus = new Map<string, number>();
  for (const c of sched)
    ectsByStatus.set(c.status, (ectsByStatus.get(c.status) ?? 0) + (c.ects ?? 0));
  const STATUS_LABEL: Record<string, string> = {
    approved: 'Onaylı',
    submitted: 'Beklemede',
    draft: 'Taslak',
    withdrawn: 'Çekildi',
    rejected: 'Reddedildi',
  };
  const distData = Array.from(ectsByStatus.entries()).map(([st, v]) => ({
    label: STATUS_LABEL[st] ?? st,
    value: v,
  }));

  return (
    <>
      <PageHeader
        title="Bugün"
        sub={
          <>
            {s.studentNo} · {s.program.name} ·{' '}
            <Badge tone={s.status === 'active' ? 'ok' : 'warn'}>
              {STATUS_TR[s.status] ?? s.status}
            </Badge>
          </>
        }
        actions={
          <Link href="/ogrenci/notlar">
            <Button variant="ghost" icon="grade" sm>
              Notlarım
            </Button>
          </Link>
        }
      />

      <StatGrid
        stats={[
          { label: 'GNO', value: s.gpa.toFixed(2), icon: 'award' },
          { label: 'Kayıtlı ders', value: sched.length, icon: 'book' },
          {
            label: 'Açık talep',
            value: openReqs.length,
            icon: 'inbox',
            tone: openReqs.length > 0 ? 'warn' : undefined,
          },
          {
            label: 'Güncel borç',
            value: debt === null ? '—' : money(debt),
            icon: 'wallet',
            tone: hasDebt ? 'danger' : 'ok',
          },
        ]}
      />

      {hasDebt && (
        <Alert tone="err">
          Ödenmemiş {money(debt!)} borcunuz var. Ders/belge işlemleri borç
          nedeniyle kısıtlanabilir.{' '}
          <Link href="/ogrenci/mali" style={{ fontWeight: 600 }}>
            Mali Durum →
          </Link>
        </Alert>
      )}

      <div className="home-grid">
        <Card title="Aktif Dönem" icon="calendar" hint="Yürürlükteki akademik takvim.">
          {term ? (
            <div className="stat" style={{ padding: 0 }}>
              <div className="n" style={{ fontSize: 20 }}>
                {term.name}
              </div>
              <div className="l">
                {fmtDate(term.startsOn)} — {fmtDate(term.endsOn)}
              </div>
            </div>
          ) : (
            <EmptyState
              icon="calendar"
              title="Aktif dönem tanımlı değil"
              sub="Akademik takvim açıldığında burada görünür."
            />
          )}
          {distData.length > 0 && (
            <>
              <p className="hint" style={{ marginTop: 14 }}>
                Ders yükü dağılımı (AKTS)
              </p>
              <BarChart data={distData} />
            </>
          )}
        </Card>

        <Card
          title="Bu Dönem Derslerim"
          icon="book"
          hint="Kayıtlı olduğunuz dersler."
          actions={
            <Link href="/ogrenci/ders-programi">
              <Button variant="subtle" sm>
                Tümü
              </Button>
            </Link>
          }
        >
          {sched.length === 0 ? (
            <EmptyState
              icon="book"
              title="Kayıtlı ders yok"
              sub="Ders seçme penceresi açıkken şube seçebilirsiniz."
              action={
                <Link href="/ogrenci/ders-secme">
                  <Button variant="primary" sm icon="arrowRight">
                    Ders seç
                  </Button>
                </Link>
              }
            />
          ) : (
            sched.slice(0, 5).map((c, i) => (
              <div className="list-item" key={i}>
                <b>{c.courseCode}</b> · {c.courseName}
                <div className="meta">
                  {c.sectionCode} · {c.ects} AKTS
                </div>
              </div>
            ))
          )}
        </Card>
      </div>

      <div className="home-grid">
        <Card
          title="Açık Taleplerim"
          icon="inbox"
          hint="Hangi masada beklediğini takip edin."
        >
          {openReqs.length === 0 ? (
            <EmptyState
              icon="checkCircle"
              title="Bekleyen talep yok"
              sub="Belge veya işlem talebi oluşturabilirsiniz."
              action={
                <Link href="/ogrenci/talepler">
                  <Button variant="ghost" sm icon="arrowRight">
                    Talep oluştur
                  </Button>
                </Link>
              }
            />
          ) : (
            openReqs.map((r) => (
              <div className="list-item" key={r.id}>
                <b>{r.type}</b>
                <div className="meta">
                  <Badge tone="warn">
                    {r.status === 'in_review' ? 'İncelemede' : 'Başvuruldu'}
                  </Badge>{' '}
                  {fmtDate(r.createdAt)}
                </div>
              </div>
            ))
          )}
        </Card>

        <Card title="Son Duyuru" icon="bell" hint="Üniversite geneli.">
          {nextAnn ? (
            <div className="list-item">
              <b>{nextAnn.title}</b>
              <div className="meta">{nextAnn.body}</div>
              <div className="meta">{fmtDate(nextAnn.createdAt)}</div>
            </div>
          ) : (
            <EmptyState icon="bell" title="Duyuru yok" sub="Yeni duyurular burada listelenir." />
          )}
        </Card>
      </div>
    </>
  );
}
