'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import {
  PageHeader,
  Card,
  StatGrid,
  Badge,
  Button,
  Alert,
  Skeleton,
  SkeletonStats,
  EmptyState,
  Meter,
  toast,
} from '@/app/ui';

interface Term {
  id: string;
  year: number;
  term: string;
  name: string;
  startsOn: string;
  endsOn: string;
}
interface CalendarWindow {
  type: string;
  startsAt: string;
  endsAt: string;
}
interface ExportResult {
  exported: number;
  accepted: number;
}

const TERM_TR: Record<string, string> = {
  guz: 'Güz',
  bahar: 'Bahar',
  yaz: 'Yaz',
};
const WINDOW_TR: Record<string, string> = {
  enrollment: 'Ders Kaydı',
  add_drop: 'Ekle/Sil',
  withdrawal: 'Dersten Çekilme',
  grade_entry: 'Not Girişi',
  grade_correction: 'Not Düzeltme',
  makeup: 'Mazeret/Bütünleme',
};

function windowState(w: CalendarWindow, now: number): { label: string; tone: 'ok' | 'muted' } {
  const s = new Date(w.startsAt).getTime();
  const e = new Date(w.endsAt).getTime();
  if (now < s) return { label: 'Yaklaşan', tone: 'muted' };
  if (now > e) return { label: 'Kapandı', tone: 'muted' };
  return { label: 'Açık', tone: 'ok' };
}

export default function Yoksis(): React.ReactElement {
  const [term, setTerm] = useState<Term | null>(null);
  const [windows, setWindows] = useState<CalendarWindow[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [lastRun, setLastRun] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const now = useMemo(() => Date.now(), [result, loading]);

  const loadTerm = useCallback(async () => {
    const t = await api<Term | null>('/calendar/active-term');
    setTerm(t);
    if (t) {
      const w = await api<CalendarWindow[]>(`/calendar/terms/${t.id}/windows`).catch(() => []);
      setWindows(w);
    }
  }, []);

  useEffect(() => {
    loadTerm()
      .catch((e) => setErr(e instanceof Error ? e.message : 'Hata'))
      .finally(() => setLoading(false));
  }, [loadTerm]);

  async function runExport(): Promise<void> {
    if (
      !window.confirm(
        'Aktif dönem ders kayıtları YÖKSİS formatında dışa aktarılıp adaptöre bildirilecek. Devam edilsin mi?',
      )
    )
      return;
    setBusy(true);
    setErr('');
    try {
      const res = await api<ExportResult>('/reports/yoksis/export-enrollments', { method: 'POST' });
      setResult(res);
      setLastRun(new Date().toLocaleString('tr-TR'));
      const rejected = res.exported - res.accepted;
      toast(
        rejected > 0 ? 'Bildirim tamamlandı' : 'Bildirim başarılı',
        {
          tone: rejected > 0 ? 'err' : 'ok',
          body:
            rejected > 0
              ? `${res.accepted}/${res.exported} kabul, ${rejected} reddedildi.`
              : `${res.accepted} kayıt YÖKSİS'e iletildi.`,
        },
      );
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Bildirim başarısız';
      setErr(m);
      toast('Bildirim başarısız', { tone: 'err', body: m });
    } finally {
      setBusy(false);
    }
  }

  const rejected = result ? result.exported - result.accepted : 0;
  const acceptRate =
    result && result.exported > 0 ? Math.round((result.accepted / result.exported) * 100) : null;

  return (
    <>
      <PageHeader
        title="YÖKSİS Bildirim"
        sub="Aktif dönem ders kayıtlarını YÖKSİS formatında dışa aktar ve adaptöre bildir."
        actions={
          <Button
            variant="primary"
            icon="upload"
            disabled={busy || !term}
            onClick={runExport}
          >
            {busy ? 'Bildiriliyor…' : 'YÖKSİS bildirimini çalıştır'}
          </Button>
        }
      />

      <Card title="Aktif Dönem" icon="calendar">
        {err && <Alert tone="err">{err}</Alert>}
        {loading ? (
          <SkeletonStats n={3} />
        ) : !term ? (
          <EmptyState
            icon="calendar"
            title="Aktif dönem bulunamadı"
            sub="YÖKSİS bildirimi için önce takvimde bir dönem açık olmalıdır."
          />
        ) : (
          <StatGrid
            stats={[
              { label: 'Dönem', value: term.name, icon: 'calendar' },
              { label: TERM_TR[term.term] ?? term.term, value: term.year, icon: 'flag' },
              { label: 'Takvim aralığı', value: `${term.startsOn} → ${term.endsOn}`, icon: 'clock' },
            ]}
          />
        )}
      </Card>

      {term && (
        <Card
          title="Takvim Pencereleri"
          icon="clock"
          hint="YÖKSİS bildirimi, ders kayıt/ekle-sil pencereleri kapandıktan sonra yapılmalıdır."
        >
          {windows.length === 0 ? (
            <EmptyState icon="calendar" title="Bu dönem için tanımlı takvim penceresi yok" />
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Pencere</th>
                  <th>Başlangıç</th>
                  <th>Bitiş</th>
                  <th>Durum</th>
                </tr>
              </thead>
              <tbody>
                {windows.map((w, i) => {
                  const st = windowState(w, now);
                  return (
                    <tr key={`${w.type}-${i}`}>
                      <td>
                        <b>{WINDOW_TR[w.type] ?? w.type}</b>
                      </td>
                      <td>{new Date(w.startsAt).toLocaleString('tr-TR')}</td>
                      <td>{new Date(w.endsAt).toLocaleString('tr-TR')}</td>
                      <td>
                        <Badge tone={st.tone}>{st.label}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      )}

      <Card
        title="Kayıt Bildirimi"
        icon="upload"
        hint="Aktif dönemdeki tüm ders kayıtları toplanır, YÖKSİS adaptörüne gönderilir ve sonuç denetim kaydına yazılır."
      >
        <Button variant="primary" icon="upload" disabled={busy || !term} onClick={runExport}>
          {busy ? 'Bildiriliyor…' : 'YÖKSİS bildirimini çalıştır'}
        </Button>

        {result && (
          <>
            <div style={{ marginTop: 16 }}>
              <StatGrid
                stats={[
                  { label: 'Dışa aktarılan kayıt', value: result.exported, icon: 'fileText' },
                  { label: 'YÖKSİS kabul', value: result.accepted, icon: 'checkCircle', tone: 'ok' },
                  {
                    label: 'Reddedilen',
                    value: rejected,
                    icon: 'alert',
                    tone: rejected > 0 ? 'danger' : undefined,
                  },
                  {
                    label: 'Kabul oranı',
                    value: acceptRate != null ? `%${acceptRate}` : '—',
                    icon: 'pie',
                    tone: acceptRate != null && acceptRate < 100 ? 'warn' : undefined,
                  },
                ]}
              />
            </div>
            {acceptRate != null && (
              <div style={{ marginTop: 12 }}>
                <Meter value={acceptRate} label={`%${acceptRate} kabul`} />
              </div>
            )}
            <div style={{ marginTop: 12 }}>
              <Alert tone={rejected > 0 ? 'err' : 'ok'}>
                {rejected > 0 ? (
                  <>
                    {rejected} kayıt reddedildi. İlgili öğrencilerin durum/program bilgisini{' '}
                    <b>Öğrenci Arama &amp; 360</b> ekranından kontrol edip yeniden bildirim alın.
                  </>
                ) : (
                  <>Tüm kayıtlar YÖKSİS tarafından kabul edildi.</>
                )}
                <div className="muted" style={{ marginTop: 4 }}>
                  Son çalıştırma: {lastRun}
                </div>
              </Alert>
            </div>
          </>
        )}
      </Card>

      <Alert tone="info">
        YÖKSİS entegrasyonu adaptör üzerinden çalışır. Bildirim işlemi denetim kaydına yazılır;
        reddedilen kayıtlar için öğrenci durumlarını düzeltip yeniden çalıştırabilirsiniz.
      </Alert>
    </>
  );
}
