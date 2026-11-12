'use client';
import { useCallback, useEffect, useState } from 'react';
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
  toast,
} from '@/app/ui';
import { type GradeComponent, type Section, sectionLabel } from '../_grades';

interface RowError {
  index: number;
  studentNo: string;
  reason: string;
}
interface ImportResp {
  imported: number;
  errors: RowError[];
}

export default function IceAktar(): React.ReactElement {
  const [secs, setSecs] = useState<Section[] | null>(null);
  const [sel, setSel] = useState('');
  const [comps, setComps] = useState<GradeComponent[]>([]);
  const [totalWeight, setTotalWeight] = useState(0);
  const [compId, setCompId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResp | null>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [tplBusy, setTplBusy] = useState(false);
  const [loadingComps, setLoadingComps] = useState(false);

  useEffect(() => {
    api<Section[]>('/portal/teaching')
      .then((s) => {
        setSecs(s);
        if (s.length > 0) setSel(s[0].id);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : 'Yükleme hatası'));
  }, []);

  const loadComps = useCallback(async (sectionId: string) => {
    setLoadingComps(true);
    setComps([]);
    setCompId('');
    setResult(null);
    setErr('');
    try {
      const c = await api<{ items: GradeComponent[]; totalWeight: number }>(
        `/grades/sections/${sectionId}/components`,
      );
      setComps(c.items);
      setTotalWeight(c.totalWeight);
      const firstOpen = c.items.find((x) => !x.locked) ?? c.items[0];
      if (firstOpen) setCompId(firstOpen.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Not bileşenleri yüklenemedi');
    } finally {
      setLoadingComps(false);
    }
  }, []);

  useEffect(() => {
    if (sel) void loadComps(sel);
  }, [sel, loadComps]);

  const selectedComp = comps.find((c) => c.id === compId) ?? null;

  async function indirSablon(): Promise<void> {
    if (!sel) return;
    setTplBusy(true);
    setErr('');
    try {
      const res = await fetch(`${API_BASE}/grades/sections/${sel}/template`, {
        headers: { authorization: `Bearer ${getToken() ?? ''}` },
      });
      if (!res.ok) throw new Error(`Şablon indirilemedi (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'not-sablonu.xlsx';
      a.click();
      URL.revokeObjectURL(url);
      toast('Şablon indirildi', { tone: 'ok' });
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Şablon indirilemedi';
      setErr(m);
      toast('Şablon indirilemedi', { tone: 'err', body: m });
    } finally {
      setTplBusy(false);
    }
  }

  async function yukle(): Promise<void> {
    setMsg('');
    setErr('');
    setResult(null);
    if (!compId) {
      setErr('Önce bir not bileşeni seçin.');
      return;
    }
    if (selectedComp?.locked) {
      setErr('Seçili bileşen kilitli; puan aktarımı yapılamaz.');
      return;
    }
    if (!file) {
      setErr('Yüklenecek dosya seçin.');
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${API_BASE}/grades/components/${compId}/import`, {
        method: 'POST',
        headers: { authorization: `Bearer ${getToken() ?? ''}` },
        body: fd,
      });
      const data = (await res.json().catch(() => ({}))) as ImportResp & { message?: string };
      if (!res.ok) throw new Error(data.message ?? `İçe aktarım başarısız (${res.status})`);
      setResult(data);
      const m = `${data.imported} satır işlendi${
        data.errors.length ? `, ${data.errors.length} satır hatalı` : ''
      }.`;
      setMsg(m);
      toast(data.errors.length ? 'İçe aktarım kısmen tamam' : 'İçe aktarım tamam', {
        tone: data.errors.length ? 'info' : 'ok',
        body: m,
      });
    } catch (e) {
      const m = e instanceof Error ? e.message : 'İçe aktarım başarısız';
      setErr(m);
      toast('İçe aktarım başarısız', { tone: 'err', body: m });
    } finally {
      setBusy(false);
    }
  }

  if (err && !secs) {
    return (
      <>
        <PageHeader title="Excel'den İçe Aktar" />
        <Alert tone="err">{err}</Alert>
      </>
    );
  }

  if (!secs) {
    return (
      <>
        <PageHeader title="Excel'den İçe Aktar" />
        <Card>
          <Skeleton lines={6} />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Excel'den İçe Aktar"
        sub="Bir ders bileşeninin (vize, ödev, final vb.) puanlarını Excel dosyasından toplu yükleyin. İşlenen ve hatalı satırlar aşağıda raporlanır."
      />

      {msg && <Alert tone="ok">{msg}</Alert>}
      {err && secs && <Alert tone="err">{err}</Alert>}

      <Alert tone="info">
        Şablon iki sütun bekler: <b>Öğrenci No</b> ve <b>Puan</b> (0-100). Geçersiz/bilinmeyen
        öğrenci satırları içe aktarılmaz, hata raporunda listelenir.
      </Alert>

      {secs.length === 0 ? (
        <EmptyState
          icon="layers"
          title="Atanmış şube görünmüyor"
          sub="Bu dönem size atanmış şube bulunmuyor."
        />
      ) : (
        <>
          <Card
            title="1. Şube ve bileşen seçin"
            icon="layers"
            actions={
              <Button variant="ghost" sm icon="download" onClick={indirSablon} disabled={tplBusy}>
                {tplBusy ? 'İndiriliyor…' : 'Boş şablon'}
              </Button>
            }
          >
            <div className="field">
              <label>Şube</label>
              <select value={sel} onChange={(e) => setSel(e.target.value)}>
                {secs.map((s) => (
                  <option key={s.id} value={s.id}>
                    {sectionLabel(s)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Not bileşeni</label>
              {loadingComps ? (
                <Skeleton lines={1} />
              ) : comps.length === 0 ? (
                <p className="muted">
                  Bu şubede tanımlı not bileşeni yok. Bileşenler bölüm/OİDB tarafından tanımlanır.
                </p>
              ) : (
                <select value={compId} onChange={(e) => setCompId(e.target.value)}>
                  {comps.map((c) => (
                    <option key={c.id} value={c.id} disabled={c.locked}>
                      {c.name} (%{c.weight}){c.locked ? ' — kilitli' : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {comps.length > 0 && (
              <p className="hint">
                Toplam ağırlık: %{totalWeight}
                {totalWeight !== 100 && (
                  <Badge tone="warn">Ağırlık toplamı 100 değil</Badge>
                )}
              </p>
            )}
          </Card>

          <Card title="2. Puanları yükle" icon="upload">
            {selectedComp && (
              <p className="hint">
                Hedef bileşen: <b>{selectedComp.name}</b> (%{selectedComp.weight}){' '}
                {selectedComp.locked && <Badge tone="danger">Kilitli</Badge>}
              </p>
            )}
            <div className="field">
              <label>Excel dosyası (.xlsx)</label>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <Button
              icon="upload"
              onClick={yukle}
              disabled={busy || !compId || selectedComp?.locked}
            >
              {busy ? 'Yükleniyor…' : 'İçe aktar'}
            </Button>
          </Card>
        </>
      )}

      {result && (
        <>
          <StatGrid
            stats={[
              { label: 'İşlenen Satır', value: result.imported, icon: 'checkCircle', tone: 'ok' },
              {
                label: 'Hatalı Satır',
                value: result.errors.length,
                icon: 'alert',
                tone: result.errors.length > 0 ? 'danger' : 'ok',
              },
            ]}
          />

          <Card title="Hata raporu" icon="fileText">
            {result.errors.length === 0 ? (
              <EmptyState
                icon="checkCircle"
                title="Hata yok"
                sub="Tüm satırlar başarıyla içe aktarıldı."
              />
            ) : (
              <DataTable
                rows={result.errors}
                csv
                csvName="ice-aktar-hatalar"
                search={false}
                columns={[
                  {
                    key: 'index',
                    header: 'Satır',
                    num: true,
                    sortable: true,
                    value: (e) => e.index,
                    render: (e) => (e.index >= 0 ? e.index + 1 : '—'),
                  },
                  {
                    key: 'studentNo',
                    header: 'Öğrenci No',
                    value: (e) => e.studentNo,
                    render: (e) => e.studentNo || '—',
                  },
                  {
                    key: 'reason',
                    header: 'Neden',
                    value: (e) => e.reason,
                    render: (e) => <Badge tone="danger">{e.reason}</Badge>,
                  },
                ]}
              />
            )}
          </Card>
        </>
      )}
    </>
  );
}
