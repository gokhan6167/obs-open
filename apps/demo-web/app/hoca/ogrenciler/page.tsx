'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, getToken } from '@/lib/api';
import { API_BASE } from '@/lib/config';
import {
  PageHeader,
  Card,
  StatGrid,
  DataTable,
  Badge,
  Button,
  Alert,
  EmptyState,
  Skeleton,
  SkeletonStats,
  Drawer,
  Segmented,
  toast,
} from '@/app/ui';
import {
  type GradeComponent,
  type RosterRow,
  type Section,
  GRADE_ST_TR,
  sectionLabel,
} from '../_grades';

type StatusFilter = 'all' | 'graded' | 'pending' | 'announced';

function stTone(status: string | null): 'ok' | 'warn' | 'danger' | 'info' | 'muted' {
  switch (status) {
    case 'announced':
    case 'finalized':
      return 'ok';
    case 'submitted':
      return 'warn';
    case 'draft':
      return 'info';
    default:
      return 'muted';
  }
}

export default function OgrenciListesi(): React.ReactElement {
  const [secs, setSecs] = useState<Section[] | null>(null);
  const [sel, setSel] = useState('');
  const [roster, setRoster] = useState<RosterRow[] | null>(null);
  const [comps, setComps] = useState<GradeComponent[]>([]);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [detail, setDetail] = useState<RosterRow | null>(null);
  const [err, setErr] = useState('');
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [tplBusy, setTplBusy] = useState(false);

  useEffect(() => {
    api<Section[]>('/portal/teaching')
      .then((s) => {
        setSecs(s);
        if (s.length > 0) setSel(s[0].id);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : 'Yükleme hatası'));
  }, []);

  const loadRoster = useCallback(async (sectionId: string) => {
    setLoadingRoster(true);
    setErr('');
    setRoster(null);
    setDetail(null);
    try {
      const [r, c] = await Promise.all([
        api<{ items: RosterRow[] }>(`/grades/sections/${sectionId}/roster`),
        api<{ items: GradeComponent[] }>(`/grades/sections/${sectionId}/components`),
      ]);
      setRoster(r.items);
      setComps(c.items);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Şube listesi yüklenemedi');
    } finally {
      setLoadingRoster(false);
    }
  }, []);

  useEffect(() => {
    if (sel) void loadRoster(sel);
  }, [sel, loadRoster]);

  const current = useMemo(() => secs?.find((s) => s.id === sel) ?? null, [secs, sel]);
  const compName = useMemo(() => new Map(comps.map((c) => [c.id, c.name])), [comps]);

  const filtered = useMemo(() => {
    if (!roster) return [];
    return roster.filter((r) => {
      if (filter === 'graded') return r.rawScore !== null;
      if (filter === 'pending') return r.rawScore === null;
      if (filter === 'announced') return r.status === 'announced' || r.status === 'finalized';
      return true;
    });
  }, [roster, filter]);

  async function indirSablon(): Promise<void> {
    if (!current) return;
    setTplBusy(true);
    setErr('');
    try {
      const res = await fetch(`${API_BASE}/grades/sections/${current.id}/template`, {
        headers: { authorization: `Bearer ${getToken() ?? ''}` },
      });
      if (!res.ok) throw new Error(`Şablon indirilemedi (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${current.courseCode}-${current.code}-not-sablonu.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast('Şablon indirildi', { tone: 'ok', body: `${current.courseCode} Şube ${current.code}` });
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Şablon indirilemedi';
      setErr(m);
      toast('Şablon indirilemedi', { tone: 'err', body: m });
    } finally {
      setTplBusy(false);
    }
  }

  if (err && !secs) {
    return (
      <>
        <PageHeader title="Öğrenci Listesi" />
        <Alert tone="err">{err}</Alert>
      </>
    );
  }

  if (!secs) {
    return (
      <>
        <PageHeader title="Öğrenci Listesi" />
        <SkeletonStats n={4} />
        <Card>
          <Skeleton lines={6} />
        </Card>
      </>
    );
  }

  const graded = roster?.filter((r) => r.rawScore !== null).length ?? 0;
  const announced =
    roster?.filter((r) => r.status === 'announced' || r.status === 'finalized').length ?? 0;
  const total = roster?.length ?? 0;

  return (
    <>
      <PageHeader
        title="Öğrenci Listesi"
        sub="Şube seçin; şubeye gerçekten kayıtlı öğrencileri, bileşen puanlarını ve not durumlarını görün. Bir satıra tıklayarak öğrenci detayını açın."
        actions={
          current && (
            <Button variant="ghost" icon="download" onClick={indirSablon} disabled={tplBusy}>
              {tplBusy ? 'İndiriliyor…' : 'Excel not şablonu'}
            </Button>
          )
        }
      />

      {err && secs && <Alert tone="err">{err}</Alert>}

      {secs.length === 0 ? (
        <EmptyState
          icon="layers"
          title="Atanmış şube görünmüyor"
          sub="Bu dönem size atanmış şube bulunmuyor."
        />
      ) : (
        <>
          <Card title="Şube" icon="layers">
            <div className="field">
              <label>Şube</label>
              <select value={sel} onChange={(e) => setSel(e.target.value)}>
                {secs.map((s) => (
                  <option key={s.id} value={s.id}>
                    {sectionLabel(s)} ({s.termName})
                  </option>
                ))}
              </select>
            </div>
          </Card>

          <StatGrid
            stats={[
              { label: 'Kayıtlı Öğrenci', value: total, icon: 'users' },
              { label: 'Notu Girilmiş', value: graded, icon: 'grade', tone: 'ok' },
              {
                label: 'Not Bekleyen',
                value: total - graded,
                icon: 'clock',
                tone: total - graded > 0 ? 'warn' : 'ok',
              },
              { label: 'İlan Edilmiş', value: announced, icon: 'checkCircle', tone: 'ok' },
            ]}
          />

          <Card
            title={
              current
                ? `${current.courseCode} · ${current.courseName} — Şube ${current.code}`
                : 'Şube'
            }
            icon="grade"
            hint={
              comps.length > 0
                ? `Not bileşenleri: ${comps.map((c) => `${c.name} (%${c.weight})`).join(' · ')}`
                : undefined
            }
            actions={
              <Segmented
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'all', label: 'Tümü' },
                  { value: 'graded', label: 'Notu var' },
                  { value: 'pending', label: 'Bekleyen' },
                  { value: 'announced', label: 'İlan' },
                ]}
              />
            }
          >
            {loadingRoster ? (
              <Skeleton lines={6} />
            ) : total === 0 ? (
              <EmptyState
                icon="users"
                title="Kayıtlı öğrenci yok"
                sub="Bu şubeye kayıtlı öğrenci bulunmuyor."
              />
            ) : (
              <DataTable
                rows={filtered}
                csv
                csvName={current ? `${current.courseCode}-${current.code}-ogrenciler` : 'ogrenciler'}
                empty="Filtreye uyan öğrenci yok."
                columns={[
                  { key: 'studentNo', header: 'Öğrenci No', value: (r) => r.studentNo, sortable: true },
                  { key: 'fullName', header: 'Ad Soyad', value: (r) => r.fullName, sortable: true },
                  {
                    key: 'rawScore',
                    header: 'Ham Puan',
                    num: true,
                    sortable: true,
                    value: (r) => r.rawScore ?? -1,
                    render: (r) => r.rawScore ?? '—',
                  },
                  {
                    key: 'letter',
                    header: 'Harf',
                    value: (r) => r.letter ?? '',
                    render: (r) => (r.letter ? <Badge tone="muted">{r.letter}</Badge> : '—'),
                  },
                  {
                    key: 'status',
                    header: 'Durum',
                    value: (r) => (r.status ? GRADE_ST_TR[r.status] ?? r.status : 'Not yok'),
                    render: (r) =>
                      r.status ? (
                        <Badge tone={stTone(r.status)}>{GRADE_ST_TR[r.status] ?? r.status}</Badge>
                      ) : (
                        <Badge tone="muted">Not yok</Badge>
                      ),
                  },
                  {
                    key: 'detail',
                    header: '',
                    render: (r) => (
                      <Button variant="ghost" sm icon="eye" onClick={() => setDetail(r)}>
                        Detay
                      </Button>
                    ),
                  },
                ]}
              />
            )}
          </Card>
        </>
      )}

      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail ? `${detail.fullName} · ${detail.studentNo}` : ''}
      >
        {detail && (
          <>
            <StatGrid
              stats={[
                { label: 'Ham Puan', value: detail.rawScore ?? '—', icon: 'grade' },
                { label: 'Harf', value: detail.letter ?? '—', icon: 'award' },
                {
                  label: 'Katsayı',
                  value: detail.coefficient !== null ? detail.coefficient.toFixed(1) : '—',
                  icon: 'target',
                },
              ]}
            />

            <p className="hint" style={{ margin: '12px 0 8px' }}>
              Ders-sonu notu durumu:{' '}
              {detail.status ? (
                <Badge tone={stTone(detail.status)}>
                  {GRADE_ST_TR[detail.status] ?? detail.status}
                </Badge>
              ) : (
                <Badge tone="muted">Henüz not yok</Badge>
              )}
            </p>

            <Card title="Bileşen puanları" icon="layers">
              {detail.componentScores.length === 0 ? (
                <EmptyState
                  icon="grade"
                  title="Bileşen puanı yok"
                  sub="Bu öğrenci için henüz bileşen puanı girilmemiş."
                />
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Bileşen</th>
                      <th>Puan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.componentScores.map((cs) => (
                      <tr key={cs.componentId}>
                        <td>{compName.get(cs.componentId) ?? cs.componentId.slice(0, 8)}</td>
                        <td>{cs.score}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </>
        )}
      </Drawer>
    </>
  );
}
