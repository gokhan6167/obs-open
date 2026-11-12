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
  Drawer,
  Alert,
  Skeleton,
  Icon,
} from '@/app/ui';

interface UserRow {
  userId: string;
  email: string;
  fullName: string;
  roles: string[];
  active: boolean;
  lastLoginAt: string | null;
}
interface UsersResp {
  items: UserRow[];
  total: number;
}

// Sistemdeki atanabilir rol anahtarları (RBAC matrisiyle hizalı).
const ALL_ROLES: { key: string; label: string }[] = [
  { key: 'ogrenci', label: 'Öğrenci' },
  { key: 'ogretim_elemani', label: 'Öğretim Elemanı' },
  { key: 'danisman', label: 'Danışman' },
  { key: 'bolum_baskani', label: 'Bölüm Başkanı' },
  { key: 'koordinator', label: 'Koordinatör' },
  { key: 'dekanlik', label: 'Dekanlık' },
  { key: 'fakulte_sekreteri', label: 'Fakülte Sekreteri' },
  { key: 'oidb', label: 'Öğrenci İşleri' },
  { key: 'mali_isler', label: 'Mali İşler' },
  { key: 'rektorluk', label: 'Rektörlük' },
  { key: 'sistem_yoneticisi', label: 'Sistem Yöneticisi' },
];
const roleLabel = (k: string): string => ALL_ROLES.find((r) => r.key === k)?.label ?? k;
// Personel (öğrenci/öğretim-elemanı dışı) sayılan roller — hesap segmentasyonu için.
const STAFF_ROLES = new Set([
  'danisman',
  'bolum_baskani',
  'koordinator',
  'dekanlik',
  'fakulte_sekreteri',
  'oidb',
  'mali_isler',
  'rektorluk',
  'sistem_yoneticisi',
]);

function fmtDt(d: string | null): string {
  if (!d) return '—';
  const t = Date.parse(d);
  return Number.isNaN(t) ? d : new Date(t).toLocaleString('tr-TR');
}

type StatusFilter = 'all' | 'active' | 'passive' | 'norole';

export default function KullaniciYonetimi(): React.ReactElement {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [roleFilter, setRoleFilter] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [detail, setDetail] = useState<UserRow | null>(null);
  const [err, setErr] = useState('');
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const r = await api<UsersResp>('/portal/users');
    setRows(r.items);
    setLoaded(true);
  }, []);

  useEffect(() => {
    load().catch((e) => setErr(e instanceof Error ? e.message : 'Hata'));
  }, [load]);

  const filtered = useMemo(() => {
    return rows.filter((u) => {
      if (status === 'active' && !u.active) return false;
      if (status === 'passive' && u.active) return false;
      if (status === 'norole' && u.roles.length > 0) return false;
      if (roleFilter && !u.roles.includes(roleFilter)) return false;
      return true;
    });
  }, [rows, roleFilter, status]);

  const activeCount = rows.filter((u) => u.active).length;
  const noRole = rows.filter((u) => u.roles.length === 0).length;
  const staffCount = rows.filter((u) => u.roles.some((r) => STAFF_ROLES.has(r))).length;
  const roleDist = useMemo(() => {
    const m = new Map<string, number>();
    for (const u of rows) for (const r of u.roles) m.set(r, (m.get(r) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const clearFilters = (): void => {
    setRoleFilter('');
    setStatus('all');
  };
  const anyFilter = roleFilter !== '' || status !== 'all';

  return (
    <>
      <PageHeader
        title="Kullanıcı & Rol"
        sub="Kiracıdaki tüm hesaplar, atanmış rolleri ve durumları. Rol dağılımına tıklayarak filtreleyin, satır ayrıntısını yan panelde görün."
      />

      {err && <Alert tone="err">{err}</Alert>}

      <StatGrid
        stats={[
          { label: 'Toplam Kullanıcı', value: rows.length, icon: 'users' },
          { label: 'Aktif Hesap', value: activeCount, icon: 'checkCircle', tone: 'ok' },
          { label: 'Personel Hesabı', value: staffCount, icon: 'shield' },
          {
            label: 'Rolsüz Kullanıcı',
            value: noRole,
            icon: 'flag',
            tone: noRole ? 'danger' : undefined,
          },
        ]}
      />

      <Card
        title="Rol Dağılımı"
        icon="pie"
        hint="Her rolün kaç kullanıcıya atandığı. Bir role tıklayarak listeyi o role göre süzün."
      >
        {roleDist.length === 0 ? (
          <p className="muted">Henüz rol atanmamış.</p>
        ) : (
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            {roleDist.map(([k, n]) => {
              const on = roleFilter === k;
              return (
                <button
                  key={k}
                  type="button"
                  className={`badge ${on ? 'ok' : 'muted'}`}
                  style={{ cursor: 'pointer', border: 'none' }}
                  onClick={() => setRoleFilter(on ? '' : k)}
                >
                  {roleLabel(k)}: <b>{n}</b>
                </button>
              );
            })}
          </div>
        )}
      </Card>

      <Card
        title="Kullanıcılar"
        icon="users"
        actions={
          <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusFilter)}
              aria-label="Durum filtresi"
            >
              <option value="all">Tüm durumlar</option>
              <option value="active">Aktif</option>
              <option value="passive">Pasif</option>
              <option value="norole">Rolsüz</option>
            </select>
            {anyFilter && (
              <Button variant="ghost" sm icon="x" onClick={clearFilters}>
                Filtreleri temizle
              </Button>
            )}
          </div>
        }
      >
        {!loaded ? (
          <Skeleton lines={5} />
        ) : (
          <DataTable
            rows={filtered}
            csv
            csvName="kullanicilar"
            columns={[
              {
                key: 'email',
                header: 'Kullanıcı',
                value: (u) => u.fullName || u.email,
                render: (u) => (
                  <div>
                    <b>{u.fullName || u.email}</b>
                    {u.fullName && <div className="meta">{u.email}</div>}
                  </div>
                ),
              },
              {
                key: 'roles',
                header: 'Roller',
                value: (u) => u.roles.map(roleLabel).join(', '),
                render: (u) =>
                  u.roles.length === 0 ? (
                    <Badge tone="danger">rol yok</Badge>
                  ) : (
                    <div className="row" style={{ flexWrap: 'wrap', gap: 4 }}>
                      {u.roles.map((r) => (
                        <Badge key={r} tone="muted">
                          {roleLabel(r)}
                        </Badge>
                      ))}
                    </div>
                  ),
              },
              {
                key: 'lastLoginAt',
                header: 'Son Giriş',
                value: (u) => (u.lastLoginAt ? Date.parse(u.lastLoginAt) || 0 : 0),
                render: (u) => (
                  <span style={{ whiteSpace: 'nowrap' }} className={u.lastLoginAt ? '' : 'muted'}>
                    {fmtDt(u.lastLoginAt)}
                  </span>
                ),
              },
              {
                key: 'active',
                header: 'Durum',
                value: (u) => (u.active ? 'aktif' : 'pasif'),
                render: (u) => (
                  <Badge tone={u.active ? 'ok' : 'muted'}>{u.active ? 'aktif' : 'pasif'}</Badge>
                ),
              },
              {
                key: 'detail',
                header: '',
                sortable: false,
                render: (u) => (
                  <Button variant="subtle" sm icon="eye" onClick={() => setDetail(u)}>
                    Ayrıntı
                  </Button>
                ),
              },
            ]}
            empty="Eşleşen kullanıcı yok."
          />
        )}
      </Card>

      <Drawer open={detail != null} onClose={() => setDetail(null)} title="Hesap Ayrıntısı">
        {detail && (
          <>
            <StatGrid
              stats={[
                { label: 'Atanmış Rol', value: detail.roles.length, icon: 'shield' },
                {
                  label: 'Hesap Durumu',
                  value: detail.active ? 'Aktif' : 'Pasif',
                  icon: detail.active ? 'checkCircle' : 'clock',
                  tone: detail.active ? 'ok' : undefined,
                },
              ]}
            />
            <Card title="Kimlik" icon="user">
              <table>
                <tbody>
                  <tr>
                    <th style={{ width: 130 }}>Ad Soyad</th>
                    <td>{detail.fullName || <span className="muted">—</span>}</td>
                  </tr>
                  <tr>
                    <th>E-posta</th>
                    <td>{detail.email}</td>
                  </tr>
                  <tr>
                    <th>Kullanıcı ID</th>
                    <td>
                      <code>{detail.userId}</code>
                    </td>
                  </tr>
                  <tr>
                    <th>Son Giriş</th>
                    <td>{fmtDt(detail.lastLoginAt)}</td>
                  </tr>
                </tbody>
              </table>
            </Card>
            <Card title="Atanmış Roller" icon="layers">
              {detail.roles.length === 0 ? (
                <Badge tone="danger">Bu hesaba hiç rol atanmamış</Badge>
              ) : (
                <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                  {detail.roles.map((r) => (
                    <span key={r} className="badge muted">
                      {roleLabel(r)} · <code>{r}</code>
                    </span>
                  ))}
                </div>
              )}
            </Card>
          </>
        )}
      </Drawer>

      <div className="info-box">
        Rol atama/kaldırma işlemleri güvenlik gereği kimlik sağlayıcı üzerinden yürütülür ve her
        değişiklik Audit Log&apos;a düşer. Bu konsol, kiracıdaki hesap-rol eşleşmesinin canlı
        görünümünü <code>GET /portal/users</code> üzerinden sunar; rolsüz veya beklenmedik yetkili
        hesapları tespit etmek için kullanılır.
      </div>
    </>
  );
}
