'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import {
  PageHeader,
  Card,
  DataTable,
  Badge,
  Button,
  Alert,
  EmptyState,
  Skeleton,
  Meter,
  fmtDate,
} from '@/app/ui';

interface Thesis {
  id: string;
  title: string;
  status: string;
  decisionNote: string | null;
  createdAt: string;
}
interface Committee {
  id: string;
  memberUserId: string | null;
  memberName: string | null;
  memberEmail: string | null;
  role: string;
  createdAt: string;
}
interface Progress {
  id: string;
  period: string | null;
  meetingDate: string | null;
  result: string;
  note: string | null;
  createdAt: string;
}
interface Plagiarism {
  id: string;
  similarityPct: string | null;
  thresholdPct: string | null;
  passed: boolean | null;
  reportUrl: string | null;
  createdAt: string;
}
interface Defense {
  id: string;
  defenseDate: string | null;
  location: string | null;
  jury: unknown;
  result: string;
  decisionNo: string | null;
  note: string | null;
  createdAt: string;
}
interface ProcessDetail {
  committee: Committee[];
  progress: Progress[];
  plagiarism: Plagiarism[];
  defense: Defense[];
}

/** Onaylı tez durumları (eski İngilizce anahtar da tolere edilir). */
const APPROVED = ['onaylandi', 'approved'];

const ROLE_TR: Record<string, string> = {
  danisman: 'Danışman',
  uye: 'Üye',
  baskan: 'Başkan',
};

const RESULT_TR: Record<string, string> = {
  basarili: 'Başarılı',
  basarisiz: 'Başarısız',
  beklemede: 'Beklemede',
  duzeltme: 'Düzeltme',
  red: 'Red',
};

const RESULT_BADGE: Record<string, 'ok' | 'warn' | 'danger' | 'info' | 'muted'> = {
  basarili: 'ok',
  basarisiz: 'danger',
  beklemede: 'warn',
  duzeltme: 'warn',
  red: 'danger',
};

/** numeric alanlar API'den string gelir. */
const pct = (s: string | null | undefined): number | null => {
  if (s == null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const fmtPct = (n: number): string => n.toLocaleString('tr-TR', { maximumFractionDigits: 2 }) + '%';

/** jsonb jüri alanını okunur isim listesine çevir. */
const juryNames = (jury: unknown): string[] => {
  if (!Array.isArray(jury)) return [];
  return jury
    .map((j) => {
      if (typeof j === 'string') return j;
      if (j && typeof j === 'object') {
        const o = j as Record<string, unknown>;
        const n = o.name ?? o.memberName ?? o.email;
        if (typeof n === 'string') return n;
      }
      return '';
    })
    .filter(Boolean);
};

export default function TezSurecim(): React.ReactElement {
  const [thesis, setThesis] = useState<Thesis | null>(null);
  const [data, setData] = useState<ProcessDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    api<Thesis[]>('/thesis/my')
      .then(async (list) => {
        const approved = list.find((t) => APPROVED.includes(t.status));
        if (!approved) return;
        setThesis(approved);
        setData(await api<ProcessDetail>(`/thesis-process/${approved.id}`));
      })
      .catch((e) => setErr(e instanceof Error ? e.message : 'Hata'))
      .finally(() => setLoading(false));
  }, []);

  if (loading)
    return (
      <>
        <PageHeader title="Tez Sürecim" sub="Tez süreciniz yükleniyor…" />
        <Skeleton lines={6} />
      </>
    );

  if (err)
    return (
      <>
        <PageHeader title="Tez Sürecim" />
        <Alert tone="err">{err}</Alert>
      </>
    );

  if (!thesis || !data)
    return (
      <>
        <PageHeader
          title="Tez Sürecim"
          sub="TİK üyeleri, izleme raporları, intihal raporu ve savunma bilgileri."
        />
        <Card>
          <EmptyState
            icon="fileText"
            title="Onaylı tez konunuz bulunmuyor"
            sub="Tez süreci ancak tez/proje konusu başvurunuz onaylandıktan sonra başlar. Önce Tez / Proje Konusu sayfasından başvurunuzu oluşturun."
            action={
              <Link href="/ogrenci/tez-proje">
                <Button variant="primary" sm icon="arrowRight">
                  Tez / Proje Başvurusu
                </Button>
              </Link>
            }
          />
        </Card>
      </>
    );

  const report = data.plagiarism[0];
  const defense = data.defense[0];
  const similarity = pct(report?.similarityPct);
  const threshold = pct(report?.thresholdPct);
  const jury = juryNames(defense?.jury);

  return (
    <>
      <PageHeader
        title="Tez Sürecim"
        sub={`«${thesis.title}» tezinizin TİK, izleme, intihal ve savunma süreci. Bu sayfa salt görünümdür.`}
      />

      <Card icon="users" title="Tez İzleme Komitesi (TİK)" className="reveal">
        {data.committee.length === 0 ? (
          <EmptyState
            icon="users"
            title="TİK üyesi atanmamış"
            sub="Komite üyeleri anabilim dalı tarafından atandığında burada listelenir."
          />
        ) : (
          <DataTable
            rows={data.committee}
            search={false}
            empty="Kayıt bulunamadı."
            columns={[
              {
                key: 'member',
                header: 'Üye',
                value: (c) => c.memberName ?? c.memberEmail ?? '',
                render: (c) => <b>{c.memberName ?? c.memberEmail ?? '—'}</b>,
              },
              {
                key: 'email',
                header: 'E-posta',
                value: (c) => c.memberEmail ?? '',
                render: (c) => <span className="muted">{c.memberEmail ?? '—'}</span>,
              },
              {
                key: 'role',
                header: 'Görev',
                value: (c) => ROLE_TR[c.role] ?? c.role,
                render: (c) => (
                  <Badge tone={c.role === 'baskan' ? 'info' : c.role === 'danisman' ? 'ok' : 'muted'}>
                    {ROLE_TR[c.role] ?? c.role}
                  </Badge>
                ),
              },
              {
                key: 'createdAt',
                header: 'Atama Tarihi',
                value: (c) => c.createdAt,
                render: (c) => fmtDate(c.createdAt),
              },
            ]}
          />
        )}
      </Card>

      <Card icon="calendar" title="İzleme Raporları" className="reveal">
        {data.progress.length === 0 ? (
          <EmptyState
            icon="calendar"
            title="İzleme raporu yok"
            sub="Dönemlik TİK toplantı sonuçlarınız girildiğinde burada görünür."
          />
        ) : (
          <DataTable
            rows={data.progress}
            search={false}
            csv
            csvName="tez-izleme-raporlari"
            empty="Kayıt bulunamadı."
            columns={[
              {
                key: 'period',
                header: 'Dönem',
                value: (p) => p.period ?? '',
                render: (p) => <b>{p.period ?? '—'}</b>,
              },
              {
                key: 'meetingDate',
                header: 'Toplantı Tarihi',
                value: (p) => p.meetingDate ?? '',
                render: (p) => fmtDate(p.meetingDate),
              },
              {
                key: 'result',
                header: 'Sonuç',
                value: (p) => RESULT_TR[p.result] ?? p.result,
                render: (p) => (
                  <Badge tone={RESULT_BADGE[p.result] ?? 'muted'}>
                    {RESULT_TR[p.result] ?? p.result}
                  </Badge>
                ),
              },
              {
                key: 'note',
                header: 'Not',
                value: (p) => p.note ?? '',
                render: (p) => <span className="muted">{p.note ?? '—'}</span>,
              },
            ]}
          />
        )}
      </Card>

      <Card icon="shield" title="İntihal Raporu" hint="En güncel benzerlik raporu gösterilir." className="reveal">
        {!report ? (
          <EmptyState
            icon="shield"
            title="İntihal raporu yok"
            sub="Savunma planlanabilmesi için benzerlik raporunuzun eşiğin altında olması gerekir."
          />
        ) : (
          <>
            {similarity != null && (
              <div style={{ marginBottom: 14 }}>
                <Meter value={similarity} label={fmtPct(similarity)} />
              </div>
            )}
            <div className="list-item">
              <span className="muted">Benzerlik oranı</span>
              <b>{similarity != null ? fmtPct(similarity) : '—'}</b>
            </div>
            <div className="list-item">
              <span className="muted">Üst sınır (eşik)</span>
              <b>{threshold != null ? fmtPct(threshold) : '—'}</b>
            </div>
            <div className="list-item">
              <span className="muted">Sonuç</span>
              {report.passed == null ? (
                <Badge tone="warn">Beklemede</Badge>
              ) : (
                <Badge tone={report.passed ? 'ok' : 'danger'}>
                  {report.passed ? 'Geçti' : 'Eşik aşıldı'}
                </Badge>
              )}
            </div>
            <div className="list-item">
              <span className="muted">Rapor tarihi</span>
              <b>{fmtDate(report.createdAt)}</b>
            </div>
            {report.reportUrl && /^https?:\/\//i.test(report.reportUrl) && (
              <div className="list-item">
                <span className="muted">Rapor bağlantısı</span>
                <a href={report.reportUrl} target="_blank" rel="noreferrer">
                  Raporu aç
                </a>
              </div>
            )}
          </>
        )}
      </Card>

      <Card icon="award" title="Tez Savunması" className="reveal">
        {!defense ? (
          <EmptyState
            icon="award"
            title="Savunma planlanmamış"
            sub="Savunma tarihi, yeri ve jüri bilgileri planlandığında burada yer alır."
          />
        ) : (
          <>
            <div className="list-item">
              <span className="muted">Savunma tarihi</span>
              <b>{fmtDate(defense.defenseDate)}</b>
            </div>
            <div className="list-item">
              <span className="muted">Yer</span>
              <b>{defense.location ?? '—'}</b>
            </div>
            <div className="list-item" style={{ display: 'block' }}>
              <div className="muted" style={{ marginBottom: 8 }}>
                Jüri
              </div>
              {jury.length === 0 ? (
                <b>—</b>
              ) : (
                <div className="row">
                  {jury.map((n, i) => (
                    <span className="chip" key={i}>
                      {n}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="list-item">
              <span className="muted">Sonuç</span>
              <Badge tone={RESULT_BADGE[defense.result] ?? 'muted'}>
                {RESULT_TR[defense.result] ?? defense.result}
              </Badge>
            </div>
            {defense.decisionNo && (
              <div className="list-item">
                <span className="muted">Karar no</span>
                <b>{defense.decisionNo}</b>
              </div>
            )}
            {defense.note && (
              <div className="list-item" style={{ display: 'block' }}>
                <div className="muted" style={{ marginBottom: 4 }}>
                  Not
                </div>
                {defense.note}
              </div>
            )}
          </>
        )}
      </Card>
    </>
  );
}
