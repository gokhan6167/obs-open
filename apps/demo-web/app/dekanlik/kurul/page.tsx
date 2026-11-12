'use client';
import { useEffect, useMemo, useState } from 'react';
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
  EmptyState,
  fmtDate,
} from '@/app/ui';

interface Req {
  id: string;
  type: string;
  status: string;
  createdAt: string;
  studentNo: string;
}
interface DmApp {
  id: string;
  type: string;
  status: string;
  gpaSnapshot: number | string | null;
  createdAt: string;
  studentNo: string;
  targetProgram: string;
}

const REQ_TYPE_TR: Record<string, string> = {
  kayit_dondurma: 'Kayıt Dondurma',
  mazeret_sinavi: 'Mazeret Sınavı',
  belge: 'Belge Talebi',
  diger: 'Diğer',
};
const STATUS_TR: Record<string, string> = {
  submitted: 'Beklemede',
  in_review: 'İncelemede',
};

const isPending = (s: string): boolean => s === 'submitted' || s === 'in_review';
const gpaNum = (v: DmApp['gpaSnapshot']): number | null => {
  const n = typeof v === 'string' ? Number(v) : v;
  return n == null || Number.isNaN(n) ? null : n;
};
const gpaText = (v: DmApp['gpaSnapshot']): string => {
  const n = gpaNum(v);
  return n == null ? '—' : n.toFixed(2);
};

export default function Kurul(): React.ReactElement {
  const [reqs, setReqs] = useState<Req[]>([]);
  const [apps, setApps] = useState<DmApp[]>([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api<Req[]>('/portal/requests'), api<DmApp[]>('/portal/double-major')])
      .then(([r, a]) => {
        setReqs(r);
        setApps(a);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : 'Yükleme hatası'))
      .finally(() => setLoading(false));
  }, []);

  const pendingReqs = useMemo(() => reqs.filter((r) => isPending(r.status)), [reqs]);
  const pendingApps = useMemo(() => apps.filter((a) => isPending(a.status)), [apps]);

  // Gündem taslağı: bekleyen kararlar tür bazında gruplu.
  const byReqType = useMemo(
    () =>
      pendingReqs.reduce<Record<string, Req[]>>((acc, r) => {
        (acc[r.type] ??= []).push(r);
        return acc;
      }, {}),
    [pendingReqs],
  );

  // Numaralı gündem maddeleri.
  const agenda = useMemo(() => {
    const items: { no: number; title: string; detail: string; rows: React.ReactNode }[] = [];
    let no = 0;
    for (const [type, rows] of Object.entries(byReqType)) {
      no += 1;
      items.push({
        no,
        title: `${REQ_TYPE_TR[type] ?? type} Talepleri`,
        detail: `${rows.length} öğrenci talebinin görüşülmesi ve karara bağlanması.`,
        rows: rows.map((r) => (
          <li key={r.id} className="list-item">
            <b>{r.studentNo}</b> <span className="meta">· {fmtDate(r.createdAt)}</span>
          </li>
        )),
      });
    }
    if (pendingApps.length > 0) {
      no += 1;
      items.push({
        no,
        title: 'Çift Anadal / Yandal Başvuruları',
        detail: `${pendingApps.length} başvurunun uygunluk değerlendirmesi ve kabul/ret kararı.`,
        rows: pendingApps.map((a) => (
          <li key={a.id} className="list-item">
            <b>{a.studentNo}</b>{' '}
            <span className="meta">
              · {a.type === 'cap' ? 'ÇAP' : 'Yandal'} → {a.targetProgram} · GNO{' '}
              {gpaText(a.gpaSnapshot)}
            </span>
          </li>
        )),
      });
    }
    return items;
  }, [byReqType, pendingApps]);

  if (err) return <Alert tone="err">{err}</Alert>;

  const today = new Date().toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  return (
    <>
      <PageHeader
        title="Kurul Kararları Özeti"
        sub={
          <>
            Fakülte Yönetim Kurulu gündem taslağı. Karara bağlanmayı bekleyen öğrenci talepleri ve
            ÇAP/yandal başvurularından otomatik derlenmiştir. Karara bağlama işlemleri gerekçeli
            olarak <b>Talep Onay</b> ve <b>ÇAP / Yandal</b> kuyruklarından yürütülür.
          </>
        }
        actions={
          <Button variant="ghost" icon="file" onClick={() => window.print()}>
            Yazdır
          </Button>
        }
      />

      {loading ? (
        <SkeletonStats n={4} />
      ) : (
        <StatGrid
          stats={[
            { label: 'Gündem Maddesi', value: agenda.length, icon: 'fileText' },
            { label: 'Bekleyen Talep', value: pendingReqs.length, icon: 'inbox' },
            { label: 'Bekleyen ÇAP/Yandal', value: pendingApps.length, icon: 'layers' },
            {
              label: 'Toplam Görüşülecek',
              value: pendingReqs.length + pendingApps.length,
              icon: 'users',
            },
          ]}
        />
      )}

      <Card
        title="Gündem Taslağı"
        icon="fileText"
        hint={
          loading
            ? undefined
            : `Toplantı tarihi: ${today} · ${agenda.length} madde. Kurul oturumunda görüşülmek üzere önerilen maddeler.`
        }
      >
        {loading ? (
          <Skeleton lines={6} />
        ) : agenda.length === 0 ? (
          <EmptyState
            icon="checkCircle"
            title="Gündeme alınacak bekleyen karar yok"
            sub="Tüm talepler ve başvurular sonuçlandırılmış görünüyor."
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {agenda.map((item) => (
              <div key={item.no} className="info-box">
                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                  Madde {item.no}. {item.title}
                </div>
                <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
                  {item.detail}
                </div>
                <ul className="list" style={{ margin: 0, paddingLeft: 0 }}>
                  {item.rows}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Görüşülecek Talepler" icon="inbox">
        {loading ? (
          <Skeleton lines={4} />
        ) : (
          <DataTable<Req>
            rows={pendingReqs}
            search
            csv
            csvName="kurul-talepler"
            empty={<EmptyState icon="checkCircle" title="Karar bekleyen talep yok" />}
            columns={[
              {
                key: 'studentNo',
                header: 'Öğrenci No',
                sortable: true,
                value: (r) => r.studentNo,
                render: (r) => <b>{r.studentNo}</b>,
              },
              {
                key: 'type',
                header: 'Konu',
                sortable: true,
                value: (r) => REQ_TYPE_TR[r.type] ?? r.type,
              },
              {
                key: 'createdAt',
                header: 'Başvuru Tarihi',
                sortable: true,
                value: (r) => r.createdAt,
                render: (r) => fmtDate(r.createdAt),
              },
              {
                key: 'status',
                header: 'Durum',
                value: (r) => STATUS_TR[r.status] ?? r.status,
                render: (r) => <Badge tone="warn">{STATUS_TR[r.status] ?? r.status}</Badge>,
              },
            ]}
          />
        )}
      </Card>

      <Card title="Görüşülecek ÇAP / Yandal Başvuruları" icon="layers">
        {loading ? (
          <Skeleton lines={4} />
        ) : (
          <DataTable<DmApp>
            rows={pendingApps}
            search
            csv
            csvName="kurul-cap-yandal"
            empty={<EmptyState icon="checkCircle" title="Karar bekleyen başvuru yok" />}
            columns={[
              {
                key: 'studentNo',
                header: 'Öğrenci No',
                sortable: true,
                value: (a) => a.studentNo,
                render: (a) => <b>{a.studentNo}</b>,
              },
              {
                key: 'type',
                header: 'Tür',
                sortable: true,
                value: (a) => (a.type === 'cap' ? 'ÇAP' : 'Yandal'),
              },
              {
                key: 'targetProgram',
                header: 'Hedef Program',
                sortable: true,
                value: (a) => a.targetProgram,
              },
              {
                key: 'gpa',
                header: 'GNO',
                sortable: true,
                num: true,
                value: (a) => gpaNum(a.gpaSnapshot) ?? -1,
                render: (a) => gpaText(a.gpaSnapshot),
              },
              {
                key: 'createdAt',
                header: 'Başvuru Tarihi',
                sortable: true,
                value: (a) => a.createdAt,
                render: (a) => fmtDate(a.createdAt),
              },
            ]}
          />
        )}
      </Card>
    </>
  );
}
