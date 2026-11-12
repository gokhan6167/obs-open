'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import {
  PageHeader,
  Card,
  StatGrid,
  DataTable,
  Badge,
  Button,
  EmptyState,
  SkeletonStats,
  Meter,
  Alert,
  Icon,
  money,
} from '@/app/ui';

/* ── API şekilleri (canlı uçlardan doğrulandı) ────────────────────────────── */
interface Dashboard {
  studentCount: number;
  activeStudents: number;
  graduatedStudents: number;
  totalEnrollments: number;
  collectedAmount: number;
}
interface FinanceSummary {
  collected: number;
  accrued: number;
  outstanding: number;
  debtorCount: number;
  invoiceCount: number;
}
interface Term {
  id: string;
  year: number;
  term: string;
  name: string;
  startsOn: string;
  endsOn: string;
}
interface Win {
  type: string;
  startsAt: string;
  endsAt: string;
}
interface UserRow {
  userId: string;
  roles: string[];
  active: boolean;
}
interface UsersResp {
  items: UserRow[];
  total: number;
}
interface AuditRow {
  id: string;
  at: string;
  actorId: string | null;
  actorName: string | null;
  action: string;
  entity: string | null;
  entityId: string | null;
}
interface AuditResp {
  items: AuditRow[];
  total: number;
}

const WIN_TR: Record<string, string> = {
  enrollment: 'Ders Kayıt',
  kayit: 'Ders Kayıt',
  grade_entry: 'Not Girişi',
  ekle_sil: 'Ekle / Bırak',
  add_drop: 'Ekle / Bırak',
  withdrawal: 'Ders Bırakma',
};

function fmtDt(d: string): string {
  const t = Date.parse(d);
  return Number.isNaN(t) ? d : new Date(t).toLocaleString('tr-TR');
}
function winOpen(w: Win, now: number): boolean {
  return now >= Date.parse(w.startsAt) && now <= Date.parse(w.endsAt);
}

/** Bir uç yoksa/yetki yoksa tüm sayfayı düşürmemek için tekil hata yalıtımı. */
async function soft<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}

export default function GenelBakis(): React.ReactElement {
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [fin, setFin] = useState<FinanceSummary | null>(null);
  const [term, setTerm] = useState<Term | null>(null);
  const [windows, setWindows] = useState<Win[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [err, setErr] = useState('');
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setLoaded(false);
    const [d, f, t, u, a] = await Promise.all([
      soft(api<Dashboard>('/reports/dashboard')),
      soft(api<FinanceSummary>('/finance/summary')),
      soft(api<Term | null>('/calendar/active-term')),
      soft(api<UsersResp>('/portal/users')),
      soft(api<AuditResp>('/portal/audit')),
    ]);
    setDash(d);
    setFin(f);
    setTerm(t ?? null);
    setUsers(u?.items ?? []);
    setAudit(a?.items ?? []);
    if (t?.id) {
      const w = await soft(api<Win[]>(`/calendar/terms/${t.id}/windows`));
      setWindows(
        (w ?? []).slice().sort((x, y) => Date.parse(x.startsAt) - Date.parse(y.startsAt)),
      );
    } else {
      setWindows([]);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    load().catch((e) => setErr(e instanceof Error ? e.message : 'Hata'));
  }, [load]);

  const now = Date.now();
  const openWins = useMemo(() => windows.filter((w) => winOpen(w, now)), [windows, now]);
  const activeUsers = users.filter((u) => u.active).length;
  const noRoleUsers = users.filter((u) => u.roles.length === 0).length;
  const collectionRate =
    fin && fin.accrued > 0 ? Math.round((fin.collected / fin.accrued) * 100) : null;

  return (
    <>
      <PageHeader
        title="Genel Bakış"
        sub="Kiracının anlık sağlık panosu — öğrenci/kayıt hacmi, tahsilat, aktif dönem işlem pencereleri ve son sistem hareketleri tek ekranda."
        actions={
          <Button variant="ghost" sm icon="refresh" onClick={() => load()}>
            Yenile
          </Button>
        }
      />

      {err && <Alert tone="err">{err}</Alert>}

      {!loaded ? (
        <>
          <SkeletonStats n={4} />
          <SkeletonStats n={4} />
        </>
      ) : (
        <>
          <StatGrid
            stats={[
              {
                label: 'Toplam Öğrenci',
                value: dash ? dash.studentCount.toLocaleString('tr-TR') : '—',
                icon: 'users',
              },
              {
                label: 'Aktif Öğrenci',
                value: dash ? dash.activeStudents.toLocaleString('tr-TR') : '—',
                icon: 'user',
                tone: 'ok',
              },
              {
                label: 'Mezun',
                value: dash ? dash.graduatedStudents.toLocaleString('tr-TR') : '—',
                icon: 'award',
              },
              {
                label: 'Toplam Ders Kaydı',
                value: dash ? dash.totalEnrollments.toLocaleString('tr-TR') : '—',
                icon: 'book',
              },
            ]}
          />

          <StatGrid
            stats={[
              {
                label: 'Tahsil Edilen',
                value: fin ? money(fin.collected) : '—',
                icon: 'wallet',
                tone: 'ok',
              },
              {
                label: 'Açık Alacak',
                value: fin ? money(fin.outstanding) : '—',
                icon: 'money',
                tone: fin && fin.outstanding > 0 ? 'danger' : undefined,
              },
              {
                label: 'Tahsilat Oranı',
                value: collectionRate != null ? `%${collectionRate}` : '—',
                icon: 'chart',
                tone: collectionRate != null && collectionRate < 60 ? 'warn' : undefined,
              },
              {
                label: 'Şu An Açık Pencere',
                value: openWins.length,
                icon: 'clock',
                tone: openWins.length ? 'ok' : undefined,
              },
            ]}
          />

          <StatGrid
            stats={[
              { label: 'Kullanıcı', value: users.length, icon: 'users' },
              { label: 'Aktif Hesap', value: activeUsers, icon: 'checkCircle', tone: 'ok' },
              {
                label: 'Rolsüz Kullanıcı',
                value: noRoleUsers,
                icon: 'shield',
                tone: noRoleUsers ? 'danger' : undefined,
              },
              {
                label: 'Borçlu Öğrenci',
                value: fin ? fin.debtorCount.toLocaleString('tr-TR') : '—',
                icon: 'flag',
                tone: fin && fin.debtorCount > 0 ? 'warn' : undefined,
              },
            ]}
          />

          {collectionRate != null && (
            <Card title="Tahsilat Performansı" icon="chart" hint="Tahakkuk üzerinden tahsil edilen oran.">
              <Meter value={collectionRate} label={`%${collectionRate} tahsil edildi`} />
            </Card>
          )}

          <Card
            title="Aktif Dönem İşlem Pencereleri"
            icon="calendar"
            hint={
              term
                ? `${term.name} · ${fmtDt(term.startsOn)} – ${fmtDt(term.endsOn)}`
                : 'Aktif dönem tanımlı değil'
            }
            actions={
              <Link className="btn ghost sm" href="/sistem/calendar">
                Takvim &amp; Dönem <Icon name="arrowRight" size={15} />
              </Link>
            }
          >
            {!term ? (
              <EmptyState
                icon="calendar"
                title="Aktif dönem bulunamadı"
                sub="Takvim & Dönem ekranından aktif dönemi ve pencereleri tanımlayın."
                action={
                  <Link className="btn primary sm" href="/sistem/calendar">
                    Takvime git
                  </Link>
                }
              />
            ) : windows.length === 0 ? (
              <EmptyState icon="clock" title="Tanımlı işlem penceresi yok" sub="Bu dönem için henüz kayıt/not girişi penceresi tanımlanmamış." />
            ) : (
              <DataTable
                rows={windows}
                search={false}
                columns={[
                  {
                    key: 'type',
                    header: 'Pencere',
                    value: (w) => WIN_TR[w.type] ?? w.type,
                    render: (w) => <b>{WIN_TR[w.type] ?? w.type}</b>,
                  },
                  {
                    key: 'startsAt',
                    header: 'Başlangıç',
                    value: (w) => Date.parse(w.startsAt) || 0,
                    render: (w) => <span style={{ whiteSpace: 'nowrap' }}>{fmtDt(w.startsAt)}</span>,
                  },
                  {
                    key: 'endsAt',
                    header: 'Bitiş',
                    value: (w) => Date.parse(w.endsAt) || 0,
                    render: (w) => <span style={{ whiteSpace: 'nowrap' }}>{fmtDt(w.endsAt)}</span>,
                  },
                  {
                    key: 'status',
                    header: 'Durum',
                    sortable: false,
                    render: (w) => {
                      const open = winOpen(w, now);
                      const upcoming = now < Date.parse(w.startsAt);
                      return (
                        <Badge tone={open ? 'ok' : upcoming ? 'warn' : 'muted'}>
                          {open ? 'AÇIK' : upcoming ? 'yaklaşan' : 'kapandı'}
                        </Badge>
                      );
                    },
                  },
                ]}
              />
            )}
          </Card>

          <Card
            title="Son Sistem Hareketleri"
            icon="activity"
            hint="Denetim kaydından en güncel 8 işlem."
            actions={
              <Link className="btn ghost sm" href="/sistem/audit">
                Tüm Audit Log <Icon name="arrowRight" size={15} />
              </Link>
            }
          >
            {audit.length === 0 ? (
              <EmptyState icon="shield" title="Denetim kaydı yok" sub="Henüz kayıtlı sistem hareketi yok ya da erişilemedi." />
            ) : (
              <DataTable
                rows={audit.slice(0, 8)}
                search={false}
                columns={[
                  {
                    key: 'at',
                    header: 'Zaman',
                    value: (r) => Date.parse(r.at) || 0,
                    render: (r) => <span style={{ whiteSpace: 'nowrap' }}>{fmtDt(r.at)}</span>,
                  },
                  {
                    key: 'action',
                    header: 'İşlem',
                    value: (r) => r.action,
                    render: (r) => <Badge tone="info">{r.action}</Badge>,
                  },
                  {
                    key: 'entity',
                    header: 'Varlık',
                    value: (r) => r.entity ?? '',
                    render: (r) =>
                      r.entity ? (
                        <>
                          <b>{r.entity}</b>
                          {r.entityId && <div className="meta">{r.entityId}</div>}
                        </>
                      ) : (
                        <span className="muted">—</span>
                      ),
                  },
                  {
                    key: 'actor',
                    header: 'Aktör',
                    value: (r) => r.actorName ?? r.actorId ?? 'sistem',
                    render: (r) => r.actorName ?? r.actorId ?? <span className="muted">sistem</span>,
                  },
                ]}
              />
            )}
          </Card>

          <Card title="Hızlı Erişim" icon="grid">
            <div className="home-grid">
              <Link className="card" href="/sistem/kullanicilar" style={{ textDecoration: 'none' }}>
                <b>Kullanıcı &amp; Rol</b>
                <div className="meta">Hesaplar, rol dağılımı ve durum denetimi</div>
              </Link>
              <Link className="card" href="/sistem/mali-ozet" style={{ textDecoration: 'none' }}>
                <b>Mali Özet &amp; Mutabakat</b>
                <div className="meta">Tahakkuk/tahsilat + banka istisna çözümü</div>
              </Link>
              <Link className="card" href="/sistem/parametreler" style={{ textDecoration: 'none' }}>
                <b>Parametreler</b>
                <div className="meta">Harf ölçeği, GNO politikası, kural setleri</div>
              </Link>
              <Link className="card" href="/sistem/feature-flags" style={{ textDecoration: 'none' }}>
                <b>Feature Flag</b>
                <div className="meta">Operasyonel yetenek durumu</div>
              </Link>
            </div>
          </Card>
        </>
      )}
    </>
  );
}
