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
  Drawer,
  Segmented,
  ProgressBar,
  Icon,
  toast,
} from '@/app/ui';

type GradeStatus = 'draft' | 'announced' | 'finalized';

interface Section {
  sectionId: string;
  courseCode: string;
  courseName: string;
  sectionCode: string;
  instructorName: string | null;
  quota: number;
  enrolled: number;
}

interface RosterRow {
  studentId: string;
  studentNo: string;
  fullName: string;
  gradeId: string | null;
  rawScore: number | null;
  letter: string | null;
  coefficient: number | null;
  status: GradeStatus | null;
}

// Bir şubenin ilan durumu: kayıtlı öğrencilerin not durumlarının özeti.
type Announce = 'none' | 'partial' | 'announced' | 'finalized';

interface SectionRow extends Section {
  loaded: boolean;
  total: number; // roster öğrenci sayısı (yüklendiyse) yoksa enrolled
  entered: number; // notu girilmiş (gradeId var) öğrenci sayısı
  announce: Announce;
}

const STATUS_META: Record<
  Announce,
  { label: string; tone: 'ok' | 'warn' | 'danger' | 'info' | 'muted' }
> = {
  none: { label: 'Giriş yok', tone: 'muted' },
  partial: { label: 'Girişte', tone: 'warn' },
  announced: { label: 'İlan edildi', tone: 'info' },
  finalized: { label: 'Kesinleşti', tone: 'ok' },
};

const GRADE_STATUS_LABEL: Record<GradeStatus, string> = {
  draft: 'Taslak',
  announced: 'İlan edildi',
  finalized: 'Kesinleşti',
};
const GRADE_STATUS_TONE: Record<GradeStatus, 'ok' | 'warn' | 'info' | 'muted'> = {
  draft: 'warn',
  announced: 'info',
  finalized: 'ok',
};

// Öğrenci not durumlarından şube ilan durumunu türet.
function deriveAnnounce(items: RosterRow[]): Announce {
  if (items.length === 0) return 'none';
  const withGrade = items.filter((r) => r.gradeId);
  if (withGrade.length === 0) return 'none';
  if (withGrade.every((r) => r.status === 'finalized')) return 'finalized';
  if (withGrade.every((r) => r.status === 'announced' || r.status === 'finalized'))
    return 'announced';
  return 'partial';
}

type FilterKey = 'all' | Announce;

export default function NotGirisTakipPage(): React.ReactElement {
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>('all');

  // Drawer: seçili şube + rosteri.
  const [active, setActive] = useState<SectionRow | null>(null);
  const [roster, setRoster] = useState<RosterRow[] | null>(null);
  const [rosterErr, setRosterErr] = useState('');
  const [rosterLoading, setRosterLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    api<{ items: Section[] }>('/portal/sections')
      .then((res) => {
        if (!alive) return;
        const base: SectionRow[] = (res.items ?? []).map((s) => ({
          ...s,
          loaded: false,
          total: s.enrolled,
          entered: 0,
          announce: 'none',
        }));
        setSections(base);
        setLoading(false);
        // Şube ilan durumlarını arka planda tek tek doldur (best-effort).
        void hydrate(base, () => alive);
      })
      .catch((e) => {
        if (!alive) return;
        setErr(e instanceof Error ? e.message : 'Şubeler yüklenemedi');
        setLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Her şube için roster çekip durum özetini güncelle. Hata olan şube 'giriş yok' kalır.
  async function hydrate(base: SectionRow[], alive: () => boolean): Promise<void> {
    for (const s of base) {
      if (!alive()) return;
      try {
        const res = await api<{ items: RosterRow[] }>(
          `/grades/sections/${s.sectionId}/roster`,
        );
        const items = res.items ?? [];
        if (!alive()) return;
        setSections((prev) =>
          prev.map((row) =>
            row.sectionId === s.sectionId
              ? {
                  ...row,
                  loaded: true,
                  total: items.length,
                  entered: items.filter((r) => r.gradeId).length,
                  announce: deriveAnnounce(items),
                }
              : row,
          ),
        );
      } catch {
        if (!alive()) return;
        setSections((prev) =>
          prev.map((row) =>
            row.sectionId === s.sectionId ? { ...row, loaded: true } : row,
          ),
        );
      }
    }
  }

  function openSection(s: SectionRow): void {
    setActive(s);
    setRoster(null);
    setRosterErr('');
    setRosterLoading(true);
    api<{ items: RosterRow[] }>(`/grades/sections/${s.sectionId}/roster`)
      .then((res) => setRoster(res.items ?? []))
      .catch((e) => {
        setRosterErr(e instanceof Error ? e.message : 'Öğrenci listesi yüklenemedi');
        toast('Öğrenci listesi yüklenemedi', { tone: 'err' });
      })
      .finally(() => setRosterLoading(false));
  }

  const stats = useMemo(() => {
    const counts: Record<Announce, number> = {
      none: 0,
      partial: 0,
      announced: 0,
      finalized: 0,
    };
    for (const s of sections) counts[s.announce]++;
    return counts;
  }, [sections]);

  const filtered = useMemo(
    () => (filter === 'all' ? sections : sections.filter((s) => s.announce === filter)),
    [sections, filter],
  );

  return (
    <>
      <PageHeader
        title="Not Giriş Süreç Takibi"
        sub="Aktif dönem şubelerinin not giriş ve ilan durumu (salt görünüm)."
      />

      {err && <Alert tone="err">{err}</Alert>}

      {loading ? (
        <SkeletonStats n={4} />
      ) : (
        <StatGrid
          stats={[
            { label: 'Toplam şube', value: sections.length, icon: 'layers' },
            {
              label: 'Giriş bekleyen',
              value: stats.none + stats.partial,
              icon: 'clock',
              tone: 'warn',
            },
            { label: 'İlan edildi', value: stats.announced, icon: 'bell' },
            { label: 'Kesinleşti', value: stats.finalized, icon: 'checkCircle', tone: 'ok' },
          ]}
        />
      )}

      <Card
        title="Şubeler"
        icon="grid"
        hint="Bir satıra tıklayarak öğrenci ve not durumu detayını açın."
        actions={
          <Segmented<FilterKey>
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'Tümü' },
              { value: 'none', label: 'Giriş yok' },
              { value: 'partial', label: 'Girişte' },
              { value: 'announced', label: 'İlan' },
              { value: 'finalized', label: 'Kesin' },
            ]}
          />
        }
      >
        {loading ? (
          <Skeleton lines={8} />
        ) : sections.length === 0 ? (
          <EmptyState
            icon="grid"
            title="Aktif dönemde şube yok"
            sub="Aktif dönem için tanımlı bir şube bulunamadı."
          />
        ) : (
          <DataTable<SectionRow>
            rows={filtered}
            csv
            csvName="oidb-not-giris-takip"
            empty={<EmptyState icon="filter" title="Bu filtreye uygun şube yok" />}
            columns={[
              {
                key: 'courseCode',
                header: 'Ders',
                value: (r) => `${r.courseCode} ${r.courseName}`,
                render: (r) => (
                  <button
                    type="button"
                    className="link-cell"
                    onClick={() => openSection(r)}
                    style={{
                      background: 'none',
                      border: 0,
                      padding: 0,
                      cursor: 'pointer',
                      textAlign: 'left',
                      color: 'var(--accent)',
                      font: 'inherit',
                    }}
                  >
                    <b>{r.courseCode}</b>
                    <span style={{ color: 'var(--muted)', marginLeft: 6 }}>{r.courseName}</span>
                  </button>
                ),
              },
              {
                key: 'sectionCode',
                header: 'Şube',
                value: (r) => r.sectionCode,
                render: (r) => <Badge tone="muted" noDot>{r.sectionCode}</Badge>,
              },
              {
                key: 'instructorName',
                header: 'Öğretim elemanı',
                value: (r) => r.instructorName ?? '',
                render: (r) => r.instructorName ?? <span className="muted">—</span>,
              },
              {
                key: 'entered',
                header: 'Not girişi',
                num: true,
                value: (r) => (r.total > 0 ? r.entered / r.total : 0),
                render: (r) =>
                  !r.loaded ? (
                    <span className="muted">…</span>
                  ) : (
                    <div style={{ minWidth: 130 }}>
                      <ProgressBar value={r.total > 0 ? (r.entered / r.total) * 100 : 0} />
                      <span className="muted" style={{ fontSize: 12 }}>
                        {r.entered} / {r.total}
                      </span>
                    </div>
                  ),
              },
              {
                key: 'announce',
                header: 'İlan durumu',
                value: (r) => STATUS_META[r.announce].label,
                render: (r) =>
                  !r.loaded ? (
                    <Badge tone="muted">Yükleniyor…</Badge>
                  ) : (
                    <Badge tone={STATUS_META[r.announce].tone}>
                      {STATUS_META[r.announce].label}
                    </Badge>
                  ),
              },
              {
                key: 'detail',
                header: '',
                sortable: false,
                render: (r) => (
                  <Button variant="subtle" sm icon="eye" onClick={() => openSection(r)}>
                    Detay
                  </Button>
                ),
              },
            ]}
          />
        )}
      </Card>

      <Drawer
        open={!!active}
        onClose={() => setActive(null)}
        title={
          active ? (
            <span>
              {active.courseCode} · {active.sectionCode}
            </span>
          ) : (
            ''
          )
        }
      >
        {active && (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              {active.courseName}
              {active.instructorName ? ` · ${active.instructorName}` : ''}
            </p>

            {rosterLoading ? (
              <Skeleton lines={6} />
            ) : rosterErr ? (
              <Alert tone="err">{rosterErr}</Alert>
            ) : !roster || roster.length === 0 ? (
              <EmptyState
                icon="users"
                title="Kayıtlı öğrenci yok"
                sub="Bu şubeye kayıtlı öğrenci bulunamadı."
              />
            ) : (
              <>
                <div className="row" style={{ gap: 8, marginBottom: 12 }}>
                  <Badge tone="info" noDot>
                    <Icon name="users" size={13} /> {roster.length} öğrenci
                  </Badge>
                  <Badge tone="ok" noDot>
                    {roster.filter((r) => r.gradeId).length} notlu
                  </Badge>
                </div>
                <DataTable<RosterRow>
                  rows={roster}
                  pageSize={50}
                  search
                  empty={<EmptyState icon="users" title="Öğrenci yok" />}
                  columns={[
                    {
                      key: 'studentNo',
                      header: 'No',
                      value: (r) => r.studentNo,
                      render: (r) => <b>{r.studentNo}</b>,
                    },
                    {
                      key: 'fullName',
                      header: 'Öğrenci',
                      value: (r) => r.fullName,
                    },
                    {
                      key: 'rawScore',
                      header: 'Puan',
                      num: true,
                      value: (r) => r.rawScore ?? -1,
                      render: (r) =>
                        r.rawScore == null ? (
                          <span className="muted">—</span>
                        ) : (
                          r.rawScore
                        ),
                    },
                    {
                      key: 'letter',
                      header: 'Harf',
                      value: (r) => r.letter ?? '',
                      render: (r) =>
                        r.letter ? <b>{r.letter}</b> : <span className="muted">—</span>,
                    },
                    {
                      key: 'status',
                      header: 'Durum',
                      value: (r) => (r.status ? GRADE_STATUS_LABEL[r.status] : ''),
                      render: (r) =>
                        r.status ? (
                          <Badge tone={GRADE_STATUS_TONE[r.status]}>
                            {GRADE_STATUS_LABEL[r.status]}
                          </Badge>
                        ) : (
                          <Badge tone="muted">Girilmedi</Badge>
                        ),
                    },
                  ]}
                />
              </>
            )}
          </>
        )}
      </Drawer>
    </>
  );
}
