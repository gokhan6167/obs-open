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
  EmptyState,
  Skeleton,
  SkeletonStats,
  Alert,
  fmtDate,
  toast,
} from '@/app/ui';

interface DmApp {
  id: string;
  type: string;
  status: string;
  gpaSnapshot: number | string | null;
  decisionReason: string | null;
  createdAt: string;
  studentNo: string;
  targetProgram: string;
}
interface AgendaItem {
  id: string;
  title: string;
  status?: string;
}

const STATUS_TR: Record<string, string> = {
  submitted: 'Beklemede',
  in_review: 'İncelemede',
  approved: 'Onaylandı',
  rejected: 'Reddedildi',
  cancelled: 'İptal',
};
const STATUS_BADGE: Record<string, 'ok' | 'warn' | 'danger' | 'muted'> = {
  submitted: 'warn',
  in_review: 'warn',
  approved: 'ok',
  rejected: 'danger',
  cancelled: 'muted',
};

const gpaText = (v: DmApp['gpaSnapshot']): string => {
  const n = typeof v === 'string' ? Number(v) : v;
  return n == null || Number.isNaN(n) ? '—' : n.toFixed(2);
};
const gpaNum = (v: DmApp['gpaSnapshot']): number => {
  const n = typeof v === 'string' ? Number(v) : v;
  return n == null || Number.isNaN(n) ? 0 : n;
};

export default function KurulGundemi(): React.ReactElement {
  const [apps, setApps] = useState<DmApp[]>([]);
  const [agenda, setAgenda] = useState<AgendaItem[] | null>(null);
  const [agendaSupported, setAgendaSupported] = useState(true);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    // Governance ucu bu ortamda tanımlı olmayabilir; varsa çek, yoksa ÇAP kuyruğundan türet.
    const agendaP = api<{ items: AgendaItem[] }>('/governance/agenda')
      .then((d) => {
        setAgendaSupported(true);
        return d.items;
      })
      .catch(() => {
        setAgendaSupported(false);
        return null;
      });
    const [dms, ag] = await Promise.all([api<DmApp[]>('/portal/double-major'), agendaP]);
    setApps(dms);
    setAgenda(ag);
  }, []);

  useEffect(() => {
    load()
      .catch((e) => setErr(e instanceof Error ? e.message : 'Yükleme hatası'))
      .finally(() => setLoading(false));
  }, [load]);

  async function refresh(): Promise<void> {
    setRefreshing(true);
    setErr('');
    try {
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Yükleme hatası');
    } finally {
      setRefreshing(false);
    }
  }

  // Gündeme alınacak maddeler: kurulda görüşülmek üzere incelemedeki başvurular.
  const gundem = useMemo(() => apps.filter((a) => a.status === 'in_review'), [apps]);
  // Ön inceleme bekleyenler: henüz gündeme girmemiş, gelen başvurular.
  const onInceleme = useMemo(() => apps.filter((a) => a.status === 'submitted'), [apps]);
  // Karara bağlananlar: kurul sonrası sonuçlanmış başvurular.
  const kararli = useMemo(
    () => apps.filter((a) => a.status === 'approved' || a.status === 'rejected'),
    [apps],
  );

  const typeCol = {
    key: 'type',
    header: 'Tür',
    value: (a: DmApp) => (a.type === 'cap' ? 'ÇAP' : 'Yandal'),
    sortable: true,
    render: (a: DmApp) => (
      <Badge tone={a.type === 'cap' ? 'info' : 'muted'}>{a.type === 'cap' ? 'ÇAP' : 'Yandal'}</Badge>
    ),
  };
  const noCol = {
    key: 'studentNo',
    header: 'Öğrenci No',
    value: (a: DmApp) => a.studentNo,
    sortable: true,
    render: (a: DmApp) => <b>{a.studentNo}</b>,
  };
  const programCol = {
    key: 'targetProgram',
    header: 'Hedef Program',
    value: (a: DmApp) => a.targetProgram,
    sortable: true,
  };
  const gpaCol = {
    key: 'gpa',
    header: 'GNO',
    num: true,
    value: (a: DmApp) => gpaNum(a.gpaSnapshot),
    sortable: true,
    render: (a: DmApp) => gpaText(a.gpaSnapshot),
  };

  function printAgenda(): void {
    toast('Gündem yazdırılıyor', {
      tone: 'info',
      body: `${gundem.length} madde yazdırma diyaloğuna gönderildi.`,
    });
    window.print();
  }

  return (
    <>
      <PageHeader
        title="Kurul Gündemi"
        sub="Fakülte Yönetim Kurulu gündem hazırlığı. Maddeler, incelemeye alınmış (görüşülmeye hazır) ÇAP/Yandal başvurularından otomatik derlenir. Bu ekran gündemi hazırlar ve sonuçları izler; kurul kararı ilgili karar mercii (Dekanlık / Öğrenci İşleri) tarafından kayda geçirilir."
        actions={
          <Button variant="ghost" icon="refresh" sm onClick={() => void refresh()} disabled={refreshing}>
            {refreshing ? 'Yenileniyor…' : 'Yenile'}
          </Button>
        }
      />

      {err && <Alert tone="err">{err}</Alert>}

      <Alert tone="info">
        Fakülte sekreterliği gündem maddelerini derler ve karar sürecini takip eder; onay/ret
        kararını işleme yetkisi kurulun karar merciindedir. Aşağıdaki liste, kurul toplantısına hazır
        dosyaları ve sonuçlanan kararları gösterir.
        {!agendaSupported && (
          <>
            {' '}
            Merkezi gündem servisi (/governance/agenda) bu ortamda etkin olmadığından gündem, canlı
            ÇAP/Yandal başvuru kuyruğundan (/portal/double-major) türetilmektedir.
          </>
        )}
      </Alert>

      {agendaSupported && agenda && agenda.length > 0 && (
        <Card title="Kayıtlı Gündem Maddeleri" icon="fileText">
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {agenda.map((a) => (
              <li key={a.id} className="list-item">
                {a.title}
                {a.status && <span className="meta"> · {a.status}</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {loading ? (
        <SkeletonStats n={4} />
      ) : (
        <StatGrid
          stats={[
            {
              label: 'Gündem Maddesi (görüşülecek)',
              value: gundem.length,
              icon: 'fileText',
              tone: gundem.length > 0 ? 'warn' : undefined,
            },
            { label: 'Ön İnceleme Bekleyen', value: onInceleme.length, icon: 'inbox' },
            {
              label: 'Karar: Onaylandı',
              value: apps.filter((a) => a.status === 'approved').length,
              icon: 'checkCircle',
              tone: 'ok',
            },
            {
              label: 'Karar: Reddedildi',
              value: apps.filter((a) => a.status === 'rejected').length,
              icon: 'flag',
              tone: apps.filter((a) => a.status === 'rejected').length > 0 ? 'danger' : undefined,
            },
          ]}
        />
      )}

      <Card
        title="Görüşülecek Maddeler"
        icon="fileText"
        hint="İncelemeye alınmış ÇAP/Yandal başvuruları kurul toplantısında ele alınmak üzere gündeme derlenir. GNO ve hedef program dosyada hazırdır."
        actions={
          <Button variant="ghost" icon="download" sm onClick={printAgenda} disabled={gundem.length === 0}>
            Gündemi Yazdır
          </Button>
        }
      >
        {loading ? (
          <Skeleton lines={5} />
        ) : (
          <DataTable
            rows={gundem}
            search
            csv
            csvName="kurul-gundemi"
            pageSize={25}
            empty={
              <EmptyState
                icon="calendar"
                title="Görüşülecek gündem maddesi yok"
                sub="Yeni maddeler, başvurular incelemeye alındıkça otomatik gelir."
              />
            }
            columns={[
              {
                key: 'no',
                header: '#',
                render: (a) => <span className="muted">{gundem.indexOf(a) + 1}</span>,
              },
              noCol,
              typeCol,
              programCol,
              gpaCol,
              {
                key: 'createdAt',
                header: 'Başvuru Tarihi',
                value: (a) => a.createdAt,
                sortable: true,
                render: (a) => <span className="muted">{fmtDate(a.createdAt)}</span>,
              },
            ]}
          />
        )}
      </Card>

      <Card
        title="Ön İnceleme Bekleyen Başvurular"
        icon="inbox"
        hint="Yeni gelen, henüz incelemeye alınmamış başvurular. İncelemeye alındıklarında yukarıdaki gündeme taşınır."
      >
        {loading ? (
          <Skeleton lines={4} />
        ) : (
          <DataTable
            rows={onInceleme}
            search
            csv
            csvName="on-inceleme"
            pageSize={20}
            empty={<EmptyState icon="checkCircle" title="Bekleyen başvuru yok" sub="Ön inceleme kuyruğu temiz." />}
            columns={[
              noCol,
              typeCol,
              programCol,
              gpaCol,
              {
                key: 'createdAt',
                header: 'Başvuru Tarihi',
                value: (a) => a.createdAt,
                sortable: true,
                render: (a) => <span className="muted">{fmtDate(a.createdAt)}</span>,
              },
            ]}
          />
        )}
      </Card>

      <Card title="Karara Bağlanan Maddeler" icon="award">
        {loading ? (
          <Skeleton lines={4} />
        ) : (
          <DataTable
            rows={kararli}
            search
            csv
            csvName="karara-baglanan"
            pageSize={20}
            empty={<EmptyState icon="award" title="Karara bağlanmış madde yok" sub="Sonuçlanan başvurular burada listelenir." />}
            columns={[
              noCol,
              typeCol,
              programCol,
              {
                key: 'status',
                header: 'Karar',
                value: (a) => STATUS_TR[a.status] ?? a.status,
                sortable: true,
                render: (a) => (
                  <Badge tone={STATUS_BADGE[a.status] ?? 'muted'}>
                    {STATUS_TR[a.status] ?? a.status}
                  </Badge>
                ),
              },
              {
                key: 'reason',
                header: 'Gerekçe',
                value: (a) => a.decisionReason ?? '',
                render: (a) => <span className="muted">{a.decisionReason ?? '—'}</span>,
              },
            ]}
          />
        )}
      </Card>
    </>
  );
}
