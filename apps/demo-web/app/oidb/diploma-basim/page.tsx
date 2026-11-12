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
  EmptyState,
  toast,
  fmtDate,
} from '@/app/ui';

type Degree = 'onlisans' | 'lisans' | 'yl' | 'doktora';
type DiplomaStatus = 'hazirlaniyor' | 'hazir' | 'teslim';

interface DiplomaRow {
  id: string;
  studentNo: string;
  fullName: string;
  diplomaNo: string | null;
  serialNo?: string | null;
  rankNo?: number | string | null;
  graduationDate: string | null;
  degree: Degree;
  status: DiplomaStatus;
}

const DEGREE_TR: Record<Degree, string> = {
  onlisans: 'Ön Lisans',
  lisans: 'Lisans',
  yl: 'Yüksek Lisans',
  doktora: 'Doktora',
};
const STATUS_TR: Record<DiplomaStatus, string> = {
  hazirlaniyor: 'Hazırlanıyor',
  hazir: 'Hazır',
  teslim: 'Teslim',
};
const STATUS_TONE: Record<DiplomaStatus, 'ok' | 'warn' | 'muted'> = {
  hazirlaniyor: 'warn',
  hazir: 'ok',
  teslim: 'muted',
};

/** rankNo'yu number'a çevirir (null/boş ise büyük değer -> sona sıralanır). */
const rankNum = (r: DiplomaRow): number => {
  const n = typeof r.rankNo === 'number' ? r.rankNo : parseInt(String(r.rankNo ?? ''), 10);
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
};

export default function DiplomaBasim(): React.ReactElement {
  const [rows, setRows] = useState<DiplomaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [listErr, setListErr] = useState('');
  const [rankBusy, setRankBusy] = useState(false);
  const [ebysBusy, setEbysBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await api<{ items: DiplomaRow[] } | DiplomaRow[]>('/diploma');
    setRows(Array.isArray(res) ? res : res.items);
  }, []);

  useEffect(() => {
    load()
      .catch((e) => setListErr(e instanceof Error ? e.message : 'Diploma defteri alınamadı'))
      .finally(() => setLoading(false));
  }, [load]);

  const dist = useMemo(() => {
    const teslim = rows.filter((r) => r.status === 'teslim').length;
    const hazir = rows.filter((r) => r.status === 'hazir').length;
    const hazirlaniyor = rows.filter((r) => r.status === 'hazirlaniyor').length;
    const ranked = rows.filter((r) => rankNum(r) !== Number.MAX_SAFE_INTEGER).length;
    return { total: rows.length, teslim, hazir, hazirlaniyor, ranked };
  }, [rows]);

  /** Mezuniyet tarihine göre client-side rankNo hesapla ve değişenleri PATCH'le. */
  const createRanking = useCallback(async () => {
    if (rows.length === 0) return;
    setRankBusy(true);
    try {
      // Mezuniyet tarihine (asc) göre sırala; tarihi olmayanlar sona, eşitlikte öğrenci no ile.
      const ordered = [...rows].sort((a, b) => {
        const at = a.graduationDate ? new Date(a.graduationDate).getTime() : Infinity;
        const bt = b.graduationDate ? new Date(b.graduationDate).getTime() : Infinity;
        if (at !== bt) return at - bt;
        return a.studentNo.localeCompare(b.studentNo, 'tr');
      });

      // Yeni rankNo ata, sadece değişenleri topla.
      const changed: { id: string; rankNo: number }[] = [];
      const next = ordered.map((r, i) => {
        const rankNo = i + 1;
        if (rankNum(r) !== rankNo) changed.push({ id: r.id, rankNo });
        return { ...r, rankNo };
      });

      if (changed.length === 0) {
        toast('Sıralama zaten güncel', { tone: 'info' });
        setRows(next);
        return;
      }

      // Her diploma için PATCH /diploma/{id} {rankNo}
      await Promise.all(
        changed.map((c) =>
          api(`/diploma/${c.id}`, { method: 'PATCH', body: { rankNo: c.rankNo } }),
        ),
      );

      setRows(next);
      toast('Sıralama oluşturuldu', {
        tone: 'ok',
        body: `${changed.length} diplomanın sıra numarası güncellendi.`,
      });
    } catch (e) {
      toast('Sıralama oluşturulamadı', {
        tone: 'err',
        body: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setRankBusy(false);
    }
  }, [rows]);

  /** Basım durumu geçişi: PATCH /diploma/{id} {status}. */
  const setStatus = useCallback(async (row: DiplomaRow, status: DiplomaStatus) => {
    setBusyId(row.id);
    try {
      await api(`/diploma/${row.id}`, { method: 'PATCH', body: { status } });
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status } : r)));
      toast(`${row.fullName}`, { tone: 'ok', body: `Basım durumu: ${STATUS_TR[status]}` });
    } catch (e) {
      toast('Durum güncellenemedi', {
        tone: 'err',
        body: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setBusyId(null);
    }
  }, []);

  /** EBYS entegrasyonu henüz bağlı değil — mock akış. */
  const sendToEbys = useCallback(() => {
    setEbysBusy(true);
    const hazir = rows.filter((r) => r.status === 'hazir').length;
    setTimeout(() => {
      setEbysBusy(false);
      toast('EBYS aktarımı (deneme)', {
        tone: 'info',
        body:
          hazir > 0
            ? `${hazir} adet "Hazır" diploma EBYS kuyruğuna eklendi. (Bu akış şu an mock — gerçek EBYS ucu bağlı değil.)`
            : 'Aktarılacak "Hazır" durumda diploma bulunmuyor.',
      });
    }, 700);
  }, [rows]);

  if (loading) {
    return (
      <>
        <PageHeader
          title="Diploma Basımı & Defteri"
          sub="Diploma sıralaması oluşturun, basım durumunu yönetin ve diploma defterini görüntüleyin."
        />
        <SkeletonStats n={4} />
        <div style={{ height: 16 }} />
        <Skeleton lines={8} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Diploma Basımı & Defteri"
        sub="Diploma sıralaması oluşturun, basım durumunu yönetin ve diploma defterini görüntüleyin."
        actions={
          <>
            <Button
              variant="primary"
              icon="award"
              onClick={createRanking}
              disabled={rankBusy || rows.length === 0}
            >
              {rankBusy ? 'Sıralanıyor…' : 'Sıralama Oluştur'}
            </Button>
            <Button
              variant="subtle"
              icon="upload"
              onClick={sendToEbys}
              disabled={ebysBusy}
            >
              {ebysBusy ? 'Gönderiliyor…' : 'EBYS’ye Gönder'}
            </Button>
          </>
        }
      />

      {listErr ? (
        <Alert tone="err">{listErr}</Alert>
      ) : (
        <>
          <StatGrid
            stats={[
              { label: 'Toplam Diploma', value: dist.total, icon: 'award' },
              { label: 'Hazırlanıyor', value: dist.hazirlaniyor, icon: 'clock', tone: 'warn' },
              { label: 'Hazır', value: dist.hazir, icon: 'checkCircle', tone: 'ok' },
              { label: 'Teslim Edildi', value: dist.teslim, icon: 'check' },
            ]}
          />

          <div style={{ height: 16 }} />

          <Alert tone="info">
            <strong>EBYS’ye Gönder</strong> düğmesi henüz gerçek EBYS entegrasyonuna bağlı
            değildir (deneme akışı). Diploma sıralaması, mezuniyet tarihine göre tarayıcıda
            hesaplanır ve her diploma için sıra numarası kaydedilir.
          </Alert>

          <div style={{ height: 16 }} />

          <Card
            title="Diploma Defteri"
            icon="book"
            hint={`${dist.total} kayıt · ${dist.ranked} tanesi sıralanmış`}
          >
            <DataTable<DiplomaRow>
              rows={rows}
              csv
              csvName="oidb-diploma-defteri"
              pageSize={25}
              empty={
                <EmptyState
                  icon="award"
                  title="Diploma kaydı yok"
                  sub="Mezun edilen öğrenciler diploma defterinde listelenir."
                />
              }
              columns={[
                {
                  key: 'rankNo',
                  header: 'Sıra',
                  num: true,
                  value: (r) => rankNum(r),
                  render: (r) =>
                    rankNum(r) === Number.MAX_SAFE_INTEGER ? (
                      <span className="muted">—</span>
                    ) : (
                      String(r.rankNo)
                    ),
                },
                {
                  key: 'fullName',
                  header: 'Öğrenci',
                  value: (r) => `${r.fullName} ${r.studentNo}`,
                  render: (r) => (
                    <div>
                      <div style={{ fontWeight: 600 }}>{r.fullName}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{r.studentNo}</div>
                    </div>
                  ),
                },
                {
                  key: 'diplomaNo',
                  header: 'Diploma No',
                  value: (r) => r.diplomaNo ?? '',
                  render: (r) => r.diplomaNo ?? <span className="muted">—</span>,
                },
                {
                  key: 'graduationDate',
                  header: 'Mezuniyet',
                  value: (r) => (r.graduationDate ? new Date(r.graduationDate).getTime() : 0),
                  render: (r) => fmtDate(r.graduationDate),
                },
                {
                  key: 'degree',
                  header: 'Derece',
                  value: (r) => DEGREE_TR[r.degree] ?? r.degree,
                  render: (r) => DEGREE_TR[r.degree] ?? r.degree,
                },
                {
                  key: 'status',
                  header: 'Basım Durumu',
                  value: (r) => STATUS_TR[r.status] ?? r.status,
                  render: (r) => (
                    <Badge tone={STATUS_TONE[r.status] ?? 'muted'}>
                      {r.status === 'hazirlaniyor'
                        ? 'Diploma Hazırlanıyor'
                        : STATUS_TR[r.status] ?? r.status}
                    </Badge>
                  ),
                },
                {
                  key: 'actions',
                  header: 'İşlem',
                  sortable: false,
                  render: (r) => (
                    <div className="row" style={{ gap: 6 }}>
                      {r.status !== 'hazir' && (
                        <Button
                          variant="ok"
                          sm
                          icon="checkCircle"
                          disabled={busyId === r.id}
                          onClick={() => setStatus(r, 'hazir')}
                        >
                          Hazır
                        </Button>
                      )}
                      {r.status !== 'teslim' && (
                        <Button
                          variant="subtle"
                          sm
                          icon="check"
                          disabled={busyId === r.id}
                          onClick={() => setStatus(r, 'teslim')}
                        >
                          Teslim
                        </Button>
                      )}
                    </div>
                  ),
                },
              ]}
            />
          </Card>
        </>
      )}
    </>
  );
}
