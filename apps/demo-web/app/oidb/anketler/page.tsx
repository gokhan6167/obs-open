'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, apiList } from '@/lib/api';
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
  SkeletonStats,
  EmptyState,
  toast,
  fmtDate,
} from '@/app/ui';

type SurveyKind = 'anket' | 'degerlendirme';

interface Survey {
  id: string;
  title: string;
  description: string | null;
  kind: SurveyKind;
  isActive: boolean;
  responseCount: number;
  targetCount: number | null;
  createdAt: string;
}

interface ResponseSummary {
  total: number;
  target: number | null;
  completionRate: number | null;
  items?: { label: string; value: number }[];
}

const KIND_TR: Record<string, string> = {
  anket: 'Anket',
  degerlendirme: 'Değerlendirme',
};

export default function Anketler(): React.ReactElement {
  const [rows, setRows] = useState<Survey[]>([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  // Yeni anket paneli
  const [openNew, setOpenNew] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<SurveyKind>('anket');
  const [saving, setSaving] = useState(false);

  // Cevap özeti paneli
  const [detail, setDetail] = useState<Survey | null>(null);
  const [summary, setSummary] = useState<ResponseSummary | null>(null);
  const [summaryErr, setSummaryErr] = useState('');

  const load = useCallback(async () => {
    setRows(await apiList<Survey>('/surveys'));
  }, []);

  useEffect(() => {
    load()
      .catch((e) => setErr(e instanceof Error ? e.message : 'Hata'))
      .finally(() => setLoading(false));
  }, [load]);

  const openNewPanel = useCallback(() => {
    setTitle('');
    setDescription('');
    setKind('anket');
    setOpenNew(true);
  }, []);

  const createSurvey = useCallback(async () => {
    if (!title.trim()) {
      toast('Eksik bilgi', { tone: 'err', body: 'Başlık zorunludur.' });
      return;
    }
    setSaving(true);
    try {
      await api('/surveys', {
        method: 'POST',
        body: { title: title.trim(), description: description.trim() || undefined, kind },
      });
      toast('Anket oluşturuldu', { tone: 'ok', body: `${title.trim()} · ${KIND_TR[kind] ?? kind}` });
      setOpenNew(false);
      await load();
    } catch (e) {
      toast('Oluşturulamadı', { tone: 'err', body: e instanceof Error ? e.message : 'Hata' });
    } finally {
      setSaving(false);
    }
  }, [title, description, kind, load]);

  const openDetail = useCallback(async (s: Survey) => {
    setDetail(s);
    setSummary(null);
    setSummaryErr('');
    try {
      setSummary(await api<ResponseSummary>(`/surveys/${s.id}/responses`));
    } catch (e) {
      setSummaryErr(e instanceof Error ? e.message : 'Cevap özeti alınamadı');
    }
  }, []);

  const stats = useMemo(() => {
    const active = rows.filter((s) => s.isActive).length;
    const totalResponses = rows.reduce((n, s) => n + (s.responseCount ?? 0), 0);
    const evals = rows.filter((s) => s.kind === 'degerlendirme').length;
    return { total: rows.length, active, totalResponses, evals };
  }, [rows]);

  if (err) return <Alert tone="err">{err}</Alert>;

  return (
    <>
      <PageHeader
        title="Anket Yönetimi"
        sub="Anketler ve ders değerlendirmeleri; cevap durumu ve özetleri."
        actions={
          <Button icon="grade" onClick={openNewPanel}>
            Yeni Anket
          </Button>
        }
      />

      {loading ? (
        <SkeletonStats n={4} />
      ) : (
        <StatGrid
          stats={[
            { label: 'Toplam anket', value: stats.total, icon: 'inbox' },
            { label: 'Aktif', value: stats.active, icon: 'checkCircle', tone: stats.active > 0 ? 'ok' : undefined },
            { label: 'Değerlendirme', value: stats.evals, icon: 'grade' },
            { label: 'Toplam cevap', value: stats.totalResponses, icon: 'users' },
          ]}
        />
      )}

      <Card title="Anketler" icon="inbox" hint="Cevap özetini görmek için satırdaki düğmeyi kullanın.">
        {loading ? (
          <Skeleton lines={8} />
        ) : (
          <DataTable<Survey>
            rows={rows}
            search
            csv
            csvName="oidb-anketler"
            empty={
              <EmptyState
                icon="inbox"
                title="Henüz anket yok"
                sub="Sağ üstteki düğmeyle yeni bir anket veya değerlendirme oluşturabilirsiniz."
              />
            }
            columns={[
              {
                key: 'title',
                header: 'Başlık',
                sortable: true,
                value: (s) => s.title,
                render: (s) => (
                  <div>
                    <b>{s.title}</b>
                    {s.description && <div className="meta">{s.description}</div>}
                  </div>
                ),
              },
              {
                key: 'kind',
                header: 'Tür',
                sortable: true,
                value: (s) => KIND_TR[s.kind] ?? s.kind,
                render: (s) => <Badge tone="muted">{KIND_TR[s.kind] ?? s.kind}</Badge>,
              },
              {
                key: 'isActive',
                header: 'Durum',
                sortable: true,
                value: (s) => (s.isActive ? 'aktif' : 'pasif'),
                render: (s) => (
                  <Badge tone={s.isActive ? 'ok' : 'muted'}>{s.isActive ? 'aktif' : 'pasif'}</Badge>
                ),
              },
              {
                key: 'responseCount',
                header: 'Cevap',
                sortable: true,
                num: true,
                value: (s) => s.responseCount ?? 0,
                render: (s) => (
                  <span>
                    {s.responseCount ?? 0}
                    {s.targetCount != null && <span className="muted"> / {s.targetCount}</span>}
                  </span>
                ),
              },
              {
                key: 'createdAt',
                header: 'Oluşturma',
                sortable: true,
                value: (s) => s.createdAt,
                render: (s) => fmtDate(s.createdAt),
              },
              {
                key: 'action',
                header: '',
                sortable: false,
                render: (s) => (
                  <Button variant="subtle" sm icon="eye" onClick={() => openDetail(s)}>
                    Cevap Özeti
                  </Button>
                ),
              },
            ]}
          />
        )}
      </Card>

      {/* Yeni anket */}
      <Drawer open={openNew} onClose={() => setOpenNew(false)} title="Yeni Anket">
        <div className="field">
          <label>Başlık</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="örn. Bahar Dönemi Memnuniyet Anketi"
            maxLength={200}
          />
        </div>
        <div className="field">
          <label>Açıklama</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Anketin amacı ve kapsamı (isteğe bağlı)"
            rows={3}
            maxLength={1000}
          />
        </div>
        <div className="field">
          <label>Tür</label>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as SurveyKind)}
            aria-label="Tür"
          >
            <option value="anket">Anket</option>
            <option value="degerlendirme">Değerlendirme</option>
          </select>
        </div>
        <Button block icon="check" onClick={createSurvey} disabled={saving}>
          {saving ? 'Oluşturuluyor…' : 'Anketi Oluştur'}
        </Button>
      </Drawer>

      {/* Cevap özeti */}
      <Drawer
        open={detail != null}
        onClose={() => setDetail(null)}
        title={detail ? `Cevap Özeti · ${detail.title}` : undefined}
      >
        {detail && (
          <>
            <p className="hint">
              {KIND_TR[detail.kind] ?? detail.kind} · {fmtDate(detail.createdAt)} ·{' '}
              {detail.isActive ? 'aktif' : 'pasif'}
            </p>

            {summaryErr ? (
              <Alert tone="err">{summaryErr}</Alert>
            ) : !summary ? (
              <Skeleton lines={4} />
            ) : (
              <>
                <StatGrid
                  stats={[
                    { label: 'Toplam cevap', value: summary.total, icon: 'users' },
                    ...(summary.target != null
                      ? [{ label: 'Hedef', value: summary.target, icon: 'inbox' } as const]
                      : []),
                    ...(summary.completionRate != null
                      ? [
                          {
                            label: 'Tamamlanma',
                            value: `%${summary.completionRate}`,
                            icon: 'checkCircle',
                          } as const,
                        ]
                      : []),
                  ]}
                />

                {summary.items && summary.items.length > 0 ? (
                  <Card title="Dağılım" icon="grade">
                    <div className="col" style={{ gap: 10 }}>
                      {summary.items.map((it) => (
                        <div key={it.label}>
                          <div
                            className="row"
                            style={{ justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}
                          >
                            <span>{it.label}</span>
                            <span className="muted">{it.value}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                ) : (
                  summary.total === 0 && (
                    <EmptyState
                      icon="inbox"
                      title="Henüz cevap yok"
                      sub="Bu ankete gelen cevap bulunmuyor."
                    />
                  )
                )}
              </>
            )}
          </>
        )}
      </Drawer>
    </>
  );
}
