'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, apiList } from '@/lib/api';
import {
  PageHeader,
  Card,
  StatGrid,
  SkeletonStats,
  Skeleton,
  Badge,
  Button,
  Alert,
  EmptyState,
  toast,
  fmtDate,
} from '@/app/ui';

interface PhotoReq {
  id: string;
  studentNo?: string;
  userName?: string;
  userEmail?: string;
  photoUrl?: string | null;
  createdAt?: string;
}

export default function FotoOnayPage(): React.ReactElement {
  const [reqs, setReqs] = useState<PhotoReq[]>([]);
  const [err, setErr] = useState('');
  const [busyId, setBusyId] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const list = await apiList<PhotoReq>('/photo/pending');
    setReqs(Array.isArray(list) ? list : []);
  }, []);

  useEffect(() => {
    load()
      .catch((e) => setErr(e instanceof Error ? e.message : 'Hata'))
      .finally(() => setLoading(false));
  }, [load]);

  const kisi = (r: PhotoReq): string =>
    r.userName || r.studentNo || r.userEmail || r.id;

  async function decide(r: PhotoReq, status: 'onayli' | 'reddedildi'): Promise<void> {
    setBusyId(r.id);
    setErr('');
    try {
      await api(`/photo/${r.id}`, { method: 'PATCH', body: { status } });
      toast('Fotoğraf isteği güncellendi', {
        tone: status === 'reddedildi' ? 'err' : 'ok',
        body: `${kisi(r)} → ${status === 'onayli' ? 'Onaylandı' : 'Reddedildi'}`,
      });
      await load();
    } catch (e) {
      const m = e instanceof Error ? e.message : 'İşlem başarısız';
      setErr(m);
      toast('İşlem başarısız', { tone: 'err', body: m });
    } finally {
      setBusyId('');
    }
  }

  return (
    <>
      <PageHeader
        title="Fotoğraf Onayı"
        sub="Öğrenci fotoğraf yükleme isteklerini inceleyip onaylayın veya reddedin."
        actions={
          <Button
            variant="subtle"
            sm
            icon="refresh"
            disabled={loading}
            onClick={() => {
              setLoading(true);
              load()
                .catch((e) => setErr(e instanceof Error ? e.message : 'Hata'))
                .finally(() => setLoading(false));
            }}
          >
            Yenile
          </Button>
        }
      />

      {loading ? (
        <SkeletonStats n={1} />
      ) : (
        <StatGrid
          stats={[
            {
              label: 'Bekleyen istek',
              value: reqs.length,
              icon: 'clock',
              tone: reqs.length > 0 ? 'warn' : undefined,
            },
          ]}
        />
      )}

      <Card title="Bekleyen fotoğraf istekleri" icon="user">
        {err && <Alert tone="err">{err}</Alert>}

        {loading ? (
          <Skeleton lines={6} />
        ) : reqs.length === 0 ? (
          <EmptyState
            icon="checkCircle"
            title="Bekleyen fotoğraf isteği yok"
            sub="Tüm istekler sonuçlandırıldı."
          />
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: 16,
            }}
          >
            {reqs.map((r) => (
              <div
                key={r.id}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  padding: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <div
                  style={{
                    aspectRatio: '3 / 4',
                    borderRadius: 8,
                    overflow: 'hidden',
                    background: 'var(--surface-2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {/* Yalnızca http(s) önizlenir (javascript:/data: koruması). */}
                  {r.photoUrl && /^https?:\/\//i.test(r.photoUrl) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={r.photoUrl}
                      alt={`${kisi(r)} fotoğraf önizleme`}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <span className="muted" style={{ fontSize: 13 }}>
                      Önizleme yok
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <b style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{kisi(r)}</b>
                  {r.studentNo && r.userName && (
                    <span className="muted" style={{ fontSize: 12 }}>
                      {r.studentNo}
                    </span>
                  )}
                  {r.createdAt && (
                    <Badge tone="muted" noDot>
                      {fmtDate(r.createdAt)}
                    </Badge>
                  )}
                </div>

                <div className="row" style={{ gap: 6, marginBottom: 0, flexWrap: 'wrap' }}>
                  <Button
                    variant="ok"
                    sm
                    icon="check"
                    disabled={busyId === r.id}
                    onClick={() => decide(r, 'onayli')}
                  >
                    Onayla
                  </Button>
                  <Button
                    variant="danger"
                    sm
                    icon="flag"
                    disabled={busyId === r.id}
                    onClick={() => decide(r, 'reddedildi')}
                  >
                    Reddet
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
