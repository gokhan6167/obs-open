'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import {
  PageHeader, Card, StatGrid, Badge, Button, Alert, Drawer,
  EmptyState, Skeleton, SkeletonStats, Segmented, toast, fmtDate,
} from '@/app/ui';

interface Survey {
  id: string;
  title: string;
  description: string | null;
  kind: string;
  active: boolean;
  createdAt: string;
  responded: boolean;
}

const KIND_TR: Record<string, string> = {
  anket: 'Anket',
  degerlendirme: 'Değerlendirme',
};

// Anketin soru tanımı API'de tutulmuyor; her ankete standart bir
// değerlendirme (derece) + yorum (metin) alanı ile cevap veriliyor.
const RATING_OPTIONS: { value: string; label: string }[] = [
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4' },
  { value: '5', label: '5' },
];

export default function Anketler(): React.ReactElement {
  const [items, setItems] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const [sel, setSel] = useState<Survey | null>(null);
  const [rating, setRating] = useState('5');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState('');

  const load = useCallback(async () => {
    const res = await api<{ items: Survey[] }>('/surveys');
    setItems(res.items ?? []);
  }, []);

  useEffect(() => {
    load()
      .catch((e) => setErr(e instanceof Error ? e.message : 'Anketler yüklenemedi'))
      .finally(() => setLoading(false));
  }, [load]);

  function open(s: Survey): void {
    setSel(s);
    setRating('5');
    setComment('');
    setFormErr('');
  }

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!sel) return;
    setBusy(true);
    setFormErr('');
    try {
      await api(`/surveys/${sel.id}/respond`, {
        method: 'POST',
        body: {
          answers: {
            derece: Number(rating),
            yorum: comment.trim() || null,
          },
        },
      });
      toast('Cevabınız alındı', { tone: 'ok', body: `"${sel.title}" anketi tamamlandı.` });
      setSel(null);
      await load();
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Cevap gönderilemedi';
      setFormErr(m);
      toast('Cevap gönderilemedi', { tone: 'err', body: m });
    } finally {
      setBusy(false);
    }
  }

  const pending = useMemo(() => items.filter((s) => !s.responded).length, [items]);
  const done = useMemo(() => items.filter((s) => s.responded).length, [items]);

  return (
    <>
      <PageHeader
        title="Anketler"
        sub="Aktif anket ve değerlendirmeleri görüntüle, cevaplandırmadıklarını doldur."
      />

      {loading ? (
        <>
          <SkeletonStats n={2} />
          <Skeleton lines={4} />
        </>
      ) : err ? (
        <Alert tone="err">{err}</Alert>
      ) : items.length === 0 ? (
        <EmptyState
          icon="inbox"
          title="Aktif anket yok"
          sub="Şu anda cevaplayabileceğiniz bir anket veya değerlendirme bulunmuyor."
        />
      ) : (
        <>
          <StatGrid
            stats={[
              { label: 'Bekleyen', value: pending, icon: 'clock', tone: pending > 0 ? 'warn' : undefined },
              { label: 'Cevaplanan', value: done, icon: 'checkCircle', tone: 'ok' },
            ]}
          />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {items.map((s) => (
              <Card
                key={s.id}
                icon={s.kind === 'degerlendirme' ? 'award' : 'fileText'}
                title={s.title}
                className="reveal"
                actions={
                  s.responded ? (
                    <Badge tone="ok">Cevaplandı</Badge>
                  ) : (
                    <Badge tone="warn">Bekliyor</Badge>
                  )
                }
              >
                <div className="muted" style={{ marginBottom: 10 }}>
                  {s.description || KIND_TR[s.kind] || s.kind}
                </div>
                <div className="row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
                  <span className="muted" style={{ fontSize: 13 }}>{fmtDate(s.createdAt)}</span>
                  {s.responded ? (
                    <Button variant="subtle" sm icon="check" disabled>
                      Tamamlandı
                    </Button>
                  ) : (
                    <Button sm icon="arrowRight" onClick={() => open(s)}>
                      Cevapla
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      <Drawer open={sel != null} onClose={() => setSel(null)} title={sel?.title ?? ''}>
        {sel && (
          <form onSubmit={submit}>
            {sel.description && (
              <p className="muted" style={{ marginTop: 0, marginBottom: 16 }}>{sel.description}</p>
            )}
            {formErr && <Alert tone="err">{formErr}</Alert>}

            <div className="field" style={{ marginBottom: 16 }}>
              <label>Genel değerlendirmeniz (1 en düşük, 5 en yüksek)</label>
              <Segmented value={rating} onChange={setRating} options={RATING_OPTIONS} />
            </div>

            <div className="field" style={{ marginBottom: 20 }}>
              <label>Görüş ve önerileriniz (isteğe bağlı)</label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={4}
                placeholder="Anket hakkında görüşünüzü yazabilirsiniz"
              />
            </div>

            <Button type="submit" icon="arrowRight" block disabled={busy}>
              {busy ? 'Gönderiliyor…' : 'Cevabı Gönder'}
            </Button>
          </form>
        )}
      </Drawer>
    </>
  );
}
