'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  PageHeader,
  Card,
  StatGrid,
  DataTable,
  Button,
  Drawer,
  Alert,
  EmptyState,
  Skeleton,
  SkeletonStats,
} from '@/app/ui';

interface Sched {
  sectionId: string;
  courseCode: string;
  courseName: string;
  ects: number;
  sectionCode: string;
  termName: string;
  status: string;
}
interface Content {
  courseCode: string;
  courseName: string;
  ects: number;
  learningOutcomes: string[];
  assessment: Record<string, number>;
  workload: { activity: string; hours: number }[];
}

export default function DersIcerikleri(): React.ReactElement {
  const [rows, setRows] = useState<Sched[] | null>(null);
  const [open, setOpen] = useState<Sched | null>(null);
  const [content, setContent] = useState<Record<string, Content>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [rowErr, setRowErr] = useState<Record<string, string>>({});
  const [err, setErr] = useState('');

  useEffect(() => {
    api<Sched[]>('/portal/schedule')
      .then(setRows)
      .catch((e) => setErr(e instanceof Error ? e.message : 'Hata'));
  }, []);

  async function openDetail(r: Sched): Promise<void> {
    setOpen(r);
    const sectionId = r.sectionId;
    if (content[sectionId] || loadingId === sectionId) return;
    setLoadingId(sectionId);
    setRowErr((e) => ({ ...e, [sectionId]: '' }));
    try {
      const c = await api<Content>(`/portal/course-content/${sectionId}`);
      setContent((prev) => ({ ...prev, [sectionId]: c }));
    } catch (e) {
      setRowErr((prev) => ({
        ...prev,
        [sectionId]: e instanceof Error ? e.message : 'İçerik yüklenemedi',
      }));
    } finally {
      setLoadingId(null);
    }
  }

  if (err)
    return (
      <>
        <PageHeader title="Ders İçerikleri" />
        <Alert tone="err">{err}</Alert>
      </>
    );
  if (!rows)
    return (
      <>
        <PageHeader title="Ders İçerikleri" sub="Ders bilgi paketleriniz yükleniyor…" />
        <SkeletonStats n={3} />
        <Skeleton lines={5} />
      </>
    );

  const totalEcts = rows.reduce((a, r) => a + (r.ects ?? 0), 0);
  const terms = new Set(rows.map((r) => r.termName)).size;

  // Dönem dönem grupla.
  const byTerm = new Map<string, Sched[]>();
  for (const r of rows)
    (byTerm.get(r.termName) ?? byTerm.set(r.termName, []).get(r.termName)!).push(r);

  const activeContent = open ? content[open.sectionId] : undefined;
  const activeErr = open ? rowErr[open.sectionId] : undefined;
  const activeLoading = open ? loadingId === open.sectionId : false;

  return (
    <>
      <PageHeader
        title="Ders İçerikleri"
        sub="Aldığınız derslerin Bologna bilgi paketi: öğrenme çıktıları, değerlendirme yöntemleri ve AKTS iş yükü dökümü. Satıra tıklayın."
      />

      <StatGrid
        stats={[
          { label: 'Kayıtlı ders', value: rows.length, icon: 'book' },
          { label: 'Toplam AKTS', value: totalEcts, icon: 'layers' },
          { label: 'Dönem', value: terms, icon: 'calendar' },
        ]}
      />

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon="book"
            title="Kayıtlı ders yok"
            sub="Ders içerikleri kayıtlı derslerinize göre listelenir."
          />
        </Card>
      ) : (
        Array.from(byTerm.entries()).map(([termName, list]) => (
          <Card key={termName} title={termName} icon="calendar">
            <DataTable
              rows={list}
              search
              columns={[
                {
                  key: 'course',
                  header: 'Ders',
                  value: (r) => `${r.courseCode} ${r.courseName}`,
                  render: (r) => (
                    <a
                      role="button"
                      tabIndex={0}
                      onClick={() => openDetail(r)}
                      onKeyDown={(e) => e.key === 'Enter' && openDetail(r)}
                      style={{ cursor: 'pointer', color: 'var(--accent)' }}
                    >
                      <b>{r.courseCode}</b> · {r.courseName}
                    </a>
                  ),
                },
                { key: 'section', header: 'Şube', value: (r) => r.sectionCode },
                { key: 'ects', header: 'AKTS', num: true, value: (r) => r.ects },
                {
                  key: 'view',
                  header: '',
                  sortable: false,
                  render: (r) => (
                    <Button variant="subtle" sm icon="eye" onClick={() => openDetail(r)}>
                      İçerik
                    </Button>
                  ),
                },
              ]}
            />
          </Card>
        ))
      )}

      <Drawer
        open={open !== null}
        onClose={() => setOpen(null)}
        title={open ? `${open.courseCode} · ${open.courseName}` : ''}
      >
        {activeLoading ? (
          <Skeleton lines={5} />
        ) : activeErr ? (
          <Alert tone="err">{activeErr}</Alert>
        ) : activeContent ? (
          <div>
            <div className="meta" style={{ marginBottom: 6 }}>
              Öğrenme çıktıları
            </div>
            {activeContent.learningOutcomes.length === 0 ? (
              <p className="muted" style={{ fontSize: 13 }}>
                Bu ders için Bologna öğrenme çıktısı henüz tanımlanmamış.
              </p>
            ) : (
              <ul style={{ margin: '0 0 16px 18px', fontSize: 13 }}>
                {activeContent.learningOutcomes.map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ul>
            )}

            <div className="meta" style={{ marginBottom: 6 }}>
              Değerlendirme (ağırlık)
            </div>
            {Object.keys(activeContent.assessment).length === 0 ? (
              <p className="muted" style={{ fontSize: 13 }}>
                Değerlendirme bileşeni tanımlanmamış.
              </p>
            ) : (
              <table style={{ marginBottom: 16 }}>
                <tbody>
                  {Object.entries(activeContent.assessment).map(([name, w]) => (
                    <tr key={name}>
                      <td>{name}</td>
                      <td style={{ textAlign: 'right' }}>%{w}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div className="meta" style={{ marginBottom: 6 }}>
              AKTS iş yükü ({activeContent.ects} AKTS)
            </div>
            <table>
              <tbody>
                {activeContent.workload.map((w) => (
                  <tr key={w.activity}>
                    <td>{w.activity}</td>
                    <td style={{ textAlign: 'right' }}>{w.hours} sa</td>
                  </tr>
                ))}
                <tr>
                  <td>
                    <b>Toplam</b>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <b>{activeContent.workload.reduce((a, w) => a + w.hours, 0)} sa</b>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : null}
      </Drawer>
    </>
  );
}
