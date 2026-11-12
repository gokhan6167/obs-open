'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import {
  PageHeader, Card, StatGrid, Badge, Button, Alert,
  EmptyState, Skeleton, SkeletonStats, Segmented, toast,
} from '@/app/ui';

interface Club {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
}

type Tab = 'all' | 'mine';

const TABS: { value: Tab; label: string }[] = [
  { value: 'all', label: 'Tüm Kulüpler' },
  { value: 'mine', label: 'Üyeliklerim' },
];

export default function Kulupler(): React.ReactElement {
  const [tab, setTab] = useState<Tab>('all');

  const [all, setAll] = useState<Club[]>([]);
  const [mine, setMine] = useState<Club[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [allRes, myRes] = await Promise.all([
      api<{ items: Club[] }>('/clubs'),
      api<{ items: Club[] }>('/clubs/my'),
    ]);
    setAll(allRes.items ?? []);
    setMine(myRes.items ?? []);
  }, []);

  useEffect(() => {
    load()
      .catch((e) => setErr(e instanceof Error ? e.message : 'Kulüpler yüklenemedi'))
      .finally(() => setLoading(false));
  }, [load]);

  const myIds = useMemo(() => new Set(mine.map((c) => c.id)), [mine]);

  async function join(c: Club): Promise<void> {
    setBusyId(c.id);
    try {
      await api(`/clubs/${c.id}/join`, { method: 'POST' });
      toast('Kulübe katıldınız', { tone: 'ok', body: `"${c.name}" kulübüne üye oldunuz.` });
      await load();
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Kulübe katılınamadı';
      toast('Kulübe katılınamadı', { tone: 'err', body: m });
    } finally {
      setBusyId(null);
    }
  }

  async function leave(c: Club): Promise<void> {
    setBusyId(c.id);
    try {
      await api(`/clubs/${c.id}/leave`, { method: 'DELETE' });
      toast('Kulüpten ayrıldınız', { tone: 'ok', body: `"${c.name}" kulübünden ayrıldınız.` });
      await load();
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Kulüpten ayrılınamadı';
      toast('Kulüpten ayrılınamadı', { tone: 'err', body: m });
    } finally {
      setBusyId(null);
    }
  }

  const list = tab === 'all' ? all : mine;

  return (
    <>
      <PageHeader
        title="Kulüpler"
        sub="Öğrenci kulüplerini keşfet, katıl veya mevcut üyeliklerini yönet."
      />

      {loading ? (
        <>
          <SkeletonStats n={2} />
          <Skeleton lines={4} />
        </>
      ) : err ? (
        <Alert tone="err">{err}</Alert>
      ) : (
        <>
          <StatGrid
            stats={[
              { label: 'Toplam Kulüp', value: all.length, icon: 'users' },
              { label: 'Üyeliklerim', value: mine.length, icon: 'checkCircle', tone: 'ok' },
            ]}
          />

          <div style={{ margin: '4px 0 16px' }}>
            <Segmented value={tab} onChange={(v) => setTab(v as Tab)} options={TABS} />
          </div>

          {list.length === 0 ? (
            <EmptyState
              icon="users"
              title={tab === 'all' ? 'Kulüp bulunmuyor' : 'Henüz üyeliğiniz yok'}
              sub={
                tab === 'all'
                  ? 'Şu anda katılabileceğiniz bir kulüp bulunmuyor.'
                  : 'Tüm Kulüpler sekmesinden bir kulübe katılabilirsiniz.'
              }
            />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {list.map((c) => {
                const isMember = myIds.has(c.id);
                const busy = busyId === c.id;
                return (
                  <Card
                    key={c.id}
                    icon="users"
                    title={c.name}
                    className="reveal"
                    actions={isMember ? <Badge tone="ok">Üye</Badge> : undefined}
                  >
                    <div className="muted" style={{ marginBottom: 10 }}>
                      {c.description || 'Açıklama bulunmuyor.'}
                    </div>
                    <div className="row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
                      <span className="muted" style={{ fontSize: 13 }}>
                        {c.memberCount} üye
                      </span>
                      {isMember ? (
                        <Button variant="subtle" sm icon="logout" onClick={() => leave(c)} disabled={busy}>
                          {busy ? 'İşleniyor…' : 'Ayrıl'}
                        </Button>
                      ) : (
                        <Button sm icon="user" onClick={() => join(c)} disabled={busy}>
                          {busy ? 'İşleniyor…' : 'Katıl'}
                        </Button>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </>
  );
}
