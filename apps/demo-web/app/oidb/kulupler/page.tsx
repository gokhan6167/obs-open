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
  Drawer,
  toast,
} from '@/app/ui';

interface Club {
  id: string;
  name: string;
  description?: string | null;
  memberCount: number;
  status: string;
  advisorUserId?: string | null;
  advisorName?: string | null;
}
interface Advisor {
  id: string;
  fullName: string;
}
interface Member {
  id: string;
  studentNo?: string | null;
  fullName: string;
  email?: string | null;
  role?: string | null;
}

const STATUS_TR: Record<string, string> = {
  aktif: 'Aktif',
  pasif: 'Pasif',
  askida: 'Askıda',
  kapali: 'Kapalı',
};
const STATUS_TONE: Record<string, 'ok' | 'warn' | 'danger' | 'muted'> = {
  aktif: 'ok',
  askida: 'warn',
  pasif: 'muted',
  kapali: 'danger',
};
function statusTone(s: string): 'ok' | 'warn' | 'danger' | 'muted' {
  return STATUS_TONE[s] ?? 'muted';
}

export default function Kulupler(): React.ReactElement {
  const [rows, setRows] = useState<Club[]>([]);
  const [advisors, setAdvisors] = useState<Advisor[]>([]);
  const [loading, setLoading] = useState(true);
  const [listErr, setListErr] = useState('');

  // yeni kulüp formu
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [advisorUserId, setAdvisorUserId] = useState('');
  const [creating, setCreating] = useState(false);

  // üyeler drawer'ı
  const [selected, setSelected] = useState<Club | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersErr, setMembersErr] = useState('');

  const load = useCallback(async () => {
    const [cl, adv] = await Promise.all([
      api<{ items: Club[] } | Club[]>('/clubs'),
      api<{ items: Advisor[] } | Advisor[]>('/students/advisors'),
    ]);
    setRows(Array.isArray(cl) ? cl : cl.items);
    setAdvisors(Array.isArray(adv) ? adv : adv.items);
  }, []);

  useEffect(() => {
    load()
      .catch((e) => setListErr(e instanceof Error ? e.message : 'Hata'))
      .finally(() => setLoading(false));
  }, [load]);

  const totalMembers = useMemo(
    () => rows.reduce((sum, r) => sum + (r.memberCount ?? 0), 0),
    [rows],
  );
  const activeCount = useMemo(
    () => rows.filter((r) => r.status === 'aktif').length,
    [rows],
  );

  async function create(): Promise<void> {
    if (!name.trim()) return;
    setCreating(true);
    try {
      await api('/clubs', {
        method: 'POST',
        body: {
          name: name.trim(),
          description: description.trim() || undefined,
          advisorUserId: advisorUserId || undefined,
        },
      });
      toast('Kulüp oluşturuldu', { tone: 'ok', body: name.trim() });
      setName('');
      setDescription('');
      setAdvisorUserId('');
      await load();
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Kulüp oluşturulamadı';
      toast('Kulüp oluşturulamadı', { tone: 'err', body: m });
    } finally {
      setCreating(false);
    }
  }

  async function openMembers(club: Club): Promise<void> {
    setSelected(club);
    setMembers([]);
    setMembersErr('');
    setMembersLoading(true);
    try {
      const res = await api<{ items: Member[] } | Member[]>(`/clubs/${club.id}/members`);
      setMembers(Array.isArray(res) ? res : res.items);
    } catch (e) {
      setMembersErr(e instanceof Error ? e.message : 'Üyeler alınamadı');
    } finally {
      setMembersLoading(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Kulüp Yönetimi"
        sub="Öğrenci kulüplerini oluşturun, danışman personel atayın ve üye listelerini görüntüleyin."
      />

      {loading ? (
        <SkeletonStats n={3} />
      ) : (
        <StatGrid
          stats={[
            { label: 'Kulüp', value: rows.length, icon: 'users' },
            { label: 'Aktif', value: activeCount, icon: 'check', tone: 'ok' },
            { label: 'Toplam Üye', value: totalMembers, icon: 'user' },
          ]}
        />
      )}

      <Card title="Yeni Kulüp" icon="plus">
        <div className="field">
          <label>Kulüp Adı</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Örn. Bilişim Kulübü"
            disabled={loading || creating}
          />
        </div>
        <div className="field">
          <label>Açıklama</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Kulübün amacı ve faaliyet alanı"
            rows={3}
            disabled={loading || creating}
          />
        </div>
        <div className="field">
          <label>Danışman</label>
          <select
            value={advisorUserId}
            onChange={(e) => setAdvisorUserId(e.target.value)}
            disabled={loading || creating}
          >
            <option value="">Danışman seçin…</option>
            {advisors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.fullName}
              </option>
            ))}
          </select>
        </div>
        <Button onClick={create} disabled={creating || !name.trim()} block icon="plus">
          {creating ? 'Oluşturuluyor…' : 'Kulüp Oluştur'}
        </Button>
      </Card>

      <Card title="Kulüpler" icon="users">
        {listErr && <Alert tone="err">{listErr}</Alert>}
        {loading ? (
          <Skeleton lines={8} />
        ) : (
          <DataTable<Club>
            rows={rows}
            search
            empty={
              <EmptyState
                icon="users"
                title="Kulüp yok"
                sub="Yukarıdaki formdan ilk kulübü oluşturun."
              />
            }
            columns={[
              {
                key: 'name',
                header: 'Ad',
                sortable: true,
                value: (r) => r.name,
                render: (r) => (
                  <button
                    type="button"
                    onClick={() => void openMembers(r)}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      fontWeight: 600,
                      textAlign: 'left',
                      color: 'var(--accent)',
                    }}
                  >
                    {r.name}
                  </button>
                ),
              },
              {
                key: 'description',
                header: 'Açıklama',
                sortable: false,
                value: (r) => r.description ?? '',
                render: (r) =>
                  r.description ? r.description : <span className="muted">—</span>,
              },
              {
                key: 'memberCount',
                header: 'Üye',
                sortable: true,
                num: true,
                value: (r) => r.memberCount ?? 0,
              },
              {
                key: 'status',
                header: 'Durum',
                sortable: true,
                value: (r) => STATUS_TR[r.status] ?? r.status,
                render: (r) => (
                  <Badge tone={statusTone(r.status)}>
                    {STATUS_TR[r.status] ?? r.status}
                  </Badge>
                ),
              },
              {
                key: '_act',
                header: '',
                sortable: false,
                render: (r) => (
                  <Button variant="subtle" sm icon="users" onClick={() => void openMembers(r)}>
                    Üyeler
                  </Button>
                ),
              },
            ]}
          />
        )}
      </Card>

      <Drawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected ? `${selected.name} — Üyeler` : 'Üyeler'}
      >
        {membersErr && <Alert tone="err">{membersErr}</Alert>}
        {membersLoading ? (
          <Skeleton lines={6} />
        ) : members.length === 0 ? (
          <EmptyState icon="user" title="Üye yok" sub="Bu kulübe kayıtlı öğrenci bulunmuyor." />
        ) : (
          <DataTable<Member>
            rows={members}
            search={members.length > 8}
            empty={<EmptyState icon="user" title="Üye yok" sub="Kayıt bulunamadı." />}
            columns={[
              {
                key: 'studentNo',
                header: 'No',
                sortable: true,
                value: (m) => m.studentNo ?? '',
                render: (m) =>
                  m.studentNo ? <b>{m.studentNo}</b> : <span className="muted">—</span>,
              },
              { key: 'fullName', header: 'Ad Soyad', sortable: true, value: (m) => m.fullName },
              {
                key: 'role',
                header: 'Rol',
                sortable: true,
                value: (m) => m.role ?? '',
                render: (m) =>
                  m.role ? <Badge tone="info">{m.role}</Badge> : <span className="muted">—</span>,
              },
              {
                key: 'email',
                header: 'E-posta',
                sortable: false,
                value: (m) => m.email ?? '',
                render: (m) => m.email ?? <span className="muted">—</span>,
              },
            ]}
          />
        )}
      </Drawer>
    </>
  );
}
