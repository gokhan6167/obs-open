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
  EmptyState,
  Skeleton,
  SkeletonStats,
  toast,
} from '@/app/ui';
import {
  type ActiveScale,
  type RosterRow,
  type Section,
  loadScale,
  toBand,
} from '../_grades';

interface Term {
  id: string;
}
interface DraftResp {
  id: string;
  status: string;
}

interface Line {
  studentId: string;
  studentNo: string;
  fullName: string;
  raw: string;
  savedGradeId: string | null;
  status: string | null; // roster'dan gelen / işlem sonrası güncellenen durum
}

export default function NotGirisi(): React.ReactElement {
  const [secs, setSecs] = useState<Section[] | null>(null);
  const [sel, setSel] = useState('');
  const [termId, setTermId] = useState('');
  const [scale, setScale] = useState<ActiveScale | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadingRoster, setLoadingRoster] = useState(false);

  useEffect(() => {
    (async () => {
      const [teaching, term, sc] = await Promise.all([
        api<Section[]>('/portal/teaching'),
        api<Term | null>('/calendar/active-term'),
        loadScale(),
      ]);
      setSecs(teaching);
      setTermId(term?.id ?? '');
      setScale(sc);
      if (teaching.length > 0) setSel(teaching[0].id);
    })().catch((e) => setErr(e instanceof Error ? e.message : 'Yükleme hatası'));
  }, []);

  const loadRoster = useCallback(async (sectionId: string) => {
    setLoadingRoster(true);
    setMsg('');
    setErr('');
    setLines([]);
    try {
      const r = await api<{ items: RosterRow[] }>(`/grades/sections/${sectionId}/roster`);
      setLines(
        r.items.map((row) => ({
          studentId: row.studentId,
          studentNo: row.studentNo,
          fullName: row.fullName,
          raw: row.rawScore !== null ? String(row.rawScore) : '',
          savedGradeId: row.gradeId,
          status: row.status,
        })),
      );
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
  const bands = scale?.bands ?? [];

  const eksik = lines.filter((l) => l.raw.trim() === '').length;
  const gecersiz = lines.filter((l) => {
    const n = Number(l.raw);
    return l.raw.trim() !== '' && (Number.isNaN(n) || n < 0 || n > 100);
  }).length;
  const kilitli = lines.filter((l) => isRowLocked(l)).length;

  const filtered = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('tr');
    if (!needle) return lines.map((l, i) => ({ l, i }));
    return lines
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => `${l.studentNo} ${l.fullName}`.toLocaleLowerCase('tr').includes(needle));
  }, [lines, q]);

  function isRowLocked(l: Line): boolean {
    return l.status === 'announced' || l.status === 'finalized';
  }

  function setRaw(idx: number, v: string): void {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, raw: v } : l)));
  }

  async function saveDrafts(): Promise<{ line: number; res: DraftResp }[]> {
    if (!current || !termId) throw new Error('Şube veya dönem bilgisi eksik');
    const results: { line: number; res: DraftResp }[] = [];
    const updated = [...lines];
    for (let i = 0; i < updated.length; i++) {
      const l = updated[i]!;
      if (isRowLocked(l)) continue;
      if (l.raw.trim() === '') continue;
      const n = Number(l.raw);
      if (Number.isNaN(n) || n < 0 || n > 100) continue;
      const band = toBand(bands, n);
      const res = await api<DraftResp>('/grades/draft', {
        method: 'POST',
        body: {
          studentId: l.studentId,
          sectionId: current.id,
          termId,
          rawScore: n,
          letter: band.letter,
          coefficient: band.coef,
        },
      });
      updated[i] = { ...l, savedGradeId: res.id, status: res.status };
      results.push({ line: i, res });
    }
    setLines(updated);
    return results;
  }

  async function onKaydet(): Promise<void> {
    setBusy(true);
    setMsg('');
    setErr('');
    try {
      const r = await saveDrafts();
      const m =
        r.length === 0
          ? 'Kaydedilecek yeni/değişik puan bulunamadı.'
          : `${r.length} öğrenci için taslak not kaydedildi. Onaya göndermeye hazır.`;
      setMsg(m);
      toast(r.length === 0 ? 'Kayıt yok' : 'Taslak kaydedildi', {
        tone: r.length === 0 ? 'info' : 'ok',
        body: m,
      });
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Taslak kaydı başarısız';
      setErr(m);
      toast('Taslak kaydı başarısız', { tone: 'err', body: m });
    } finally {
      setBusy(false);
    }
  }

  async function onOnaylat(): Promise<void> {
    setBusy(true);
    setMsg('');
    setErr('');
    try {
      const saved = await saveDrafts();
      // Taslakta olan tüm kayıtları ilan et (yalnız yeni kaydedilenleri değil).
      const toAnnounce = new Map<string, number>();
      lines.forEach((l, i) => {
        if (l.savedGradeId && !isRowLocked(l)) toAnnounce.set(l.savedGradeId, i);
      });
      saved.forEach((s) => toAnnounce.set(s.res.id, s.line));
      let ilan = 0;
      const announcedIds = new Set<string>();
      for (const [gradeId] of toAnnounce) {
        await api(`/grades/${gradeId}/transition`, { method: 'POST', body: { to: 'announced' } });
        announcedIds.add(gradeId);
        ilan++;
      }
      const m =
        ilan === 0
          ? 'İlan edilecek taslak not bulunamadı.'
          : `${ilan} not ilan edildi. İlan sonrası değişiklik yalnızca Not Düzeltme akışıyla yapılır.`;
      setMsg(m);
      toast(ilan === 0 ? 'İlan edilecek kayıt yok' : 'Notlar ilan edildi', {
        tone: ilan === 0 ? 'info' : 'ok',
        body: m,
      });
      setLines((prev) =>
        prev.map((l) =>
          l.savedGradeId && announcedIds.has(l.savedGradeId) ? { ...l, status: 'announced' } : l,
        ),
      );
    } catch (e) {
      const m = e instanceof Error ? e.message : 'İlan başarısız';
      setErr(m);
      toast('İlan başarısız', { tone: 'err', body: m });
    } finally {
      setBusy(false);
    }
  }

  if (err && !secs) {
    return (
      <>
        <PageHeader title="Not Girişi" />
        <Alert tone="err">{err}</Alert>
      </>
    );
  }

  if (!secs) {
    return (
      <>
        <PageHeader title="Not Girişi" />
        <SkeletonStats n={4} />
        <Card>
          <Skeleton lines={6} />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Not Girişi"
        sub={
          <>
            Şube seçin; ham puan girin. Harf ve katsayı <b>{scale ? scale.name : 'aktif ölçek'}</b>{' '}
            tablosuna göre otomatik önizlenir. Taslak kaydedin veya doğrudan onaya (ilan) gönderin.
          </>
        }
      />

      {msg && <Alert tone="ok">{msg}</Alert>}
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
                    {s.courseCode} · {s.courseName} — Şube {s.code}
                  </option>
                ))}
              </select>
            </div>
          </Card>

          <StatGrid
            stats={[
              { label: 'Kayıtlı Öğrenci', value: lines.length, icon: 'users' },
              { label: 'Puan Girildi', value: lines.length - eksik, icon: 'grade', tone: 'ok' },
              {
                label: 'Eksik Puan',
                value: eksik,
                icon: 'clock',
                tone: eksik > 0 ? 'warn' : 'ok',
              },
              {
                label: 'Geçersiz',
                value: gecersiz,
                icon: 'alert',
                tone: gecersiz > 0 ? 'danger' : 'ok',
              },
            ]}
          />

          {gecersiz > 0 && (
            <Alert tone="err">
              {gecersiz} satırda geçersiz puan (0-100 dışı) var. Geçersiz satırlar kaydedilmez.
            </Alert>
          )}
          {eksik > 0 && gecersiz === 0 && (
            <Alert tone="warn">
              {eksik} öğrencinin puanı eksik. Onaya göndermeden önce tüm puanları girmeniz önerilir;
              eksik satırlar atlanır.
            </Alert>
          )}
          {kilitli > 0 && (
            <Alert tone="info">
              {kilitli} not zaten ilan edildi ve kilitli. Değişiklik yalnızca Not Düzeltme akışıyla
              yapılabilir.
            </Alert>
          )}

          <Card
            title={
              current
                ? `${current.courseCode} · ${current.courseName} — Şube ${current.code}`
                : 'Şube'
            }
            icon="edit"
            actions={
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Öğrenci ara…"
                style={{
                  padding: 8,
                  border: '1px solid var(--line)',
                  borderRadius: 8,
                  fontFamily: 'inherit',
                  fontSize: 14,
                  minWidth: 200,
                }}
              />
            }
          >
            {loadingRoster ? (
              <Skeleton lines={6} />
            ) : lines.length === 0 ? (
              <EmptyState
                icon="users"
                title="Kayıtlı öğrenci yok"
                sub="Bu şubeye kayıtlı öğrenci bulunmuyor. Öğrenci ders kaydı onaylandıkça liste dolar."
              />
            ) : (
              <>
                <table style={{ marginTop: 4 }}>
                  <thead>
                    <tr>
                      <th>Öğrenci No</th>
                      <th>Ad Soyad</th>
                      <th>Ham Puan (0-100)</th>
                      <th>Harf</th>
                      <th>Katsayı</th>
                      <th>Durum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(({ l, i }) => {
                      const n = Number(l.raw);
                      const valid = l.raw.trim() !== '' && !Number.isNaN(n) && n >= 0 && n <= 100;
                      const band = valid ? toBand(bands, n) : null;
                      const kilit = isRowLocked(l);
                      const invalid = l.raw.trim() !== '' && !valid;
                      return (
                        <tr key={l.studentId}>
                          <td>{l.studentNo}</td>
                          <td>{l.fullName}</td>
                          <td>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={l.raw}
                              disabled={kilit}
                              onChange={(e) => setRaw(i, e.target.value)}
                              style={{
                                width: 90,
                                padding: 6,
                                border: `1px solid ${invalid ? 'var(--danger)' : 'var(--line)'}`,
                                borderRadius: 8,
                                fontFamily: 'inherit',
                                background: kilit ? 'var(--bg)' : undefined,
                              }}
                            />
                          </td>
                          <td>{band ? <Badge tone="muted">{band.letter}</Badge> : '—'}</td>
                          <td>{band ? band.coef.toFixed(1) : '—'}</td>
                          <td>
                            {kilit ? (
                              <Badge tone="ok">İlan edildi</Badge>
                            ) : l.savedGradeId ? (
                              <Badge tone="warn">Taslak kaydedildi</Badge>
                            ) : (
                              <Badge tone="muted">Girilmedi</Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                <div className="row" style={{ gap: 8, marginTop: 12 }}>
                  <Button variant="ghost" icon="file" onClick={onKaydet} disabled={busy}>
                    {busy ? 'İşleniyor…' : 'Taslak olarak kaydet'}
                  </Button>
                  <Button variant="ok" icon="checkCircle" onClick={onOnaylat} disabled={busy}>
                    {busy ? 'İşleniyor…' : 'Kaydet ve onaya gönder (ilan et)'}
                  </Button>
                </div>
              </>
            )}
          </Card>
        </>
      )}
    </>
  );
}
