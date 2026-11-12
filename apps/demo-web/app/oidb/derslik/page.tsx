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
  EmptyState,
  toast,
} from '@/app/ui';

interface Building {
  id: string;
  code: string;
  name: string;
  campus: string;
  address: string;
}
interface Classroom {
  id: string;
  code: string;
  name: string;
  kind: 'derslik' | 'amfi' | 'lab';
  capacity: number;
}

const KIND_TONE: Record<Classroom['kind'], 'muted' | 'ok' | 'warn'> = {
  derslik: 'muted',
  amfi: 'ok',
  lab: 'warn',
};
const KIND_LABEL: Record<Classroom['kind'], string> = {
  derslik: 'Derslik',
  amfi: 'Amfi',
  lab: 'Laboratuvar',
};

export default function DerslikTanimlama(): React.ReactElement {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [err, setErr] = useState('');
  const [loaded, setLoaded] = useState(false);

  const [selected, setSelected] = useState<Building | null>(null);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [crErr, setCrErr] = useState('');
  const [crLoading, setCrLoading] = useState(false);

  // Yeni bina paneli
  const [openBuilding, setOpenBuilding] = useState(false);
  const [bCode, setBCode] = useState('');
  const [bName, setBName] = useState('');
  const [bCampus, setBCampus] = useState('');
  const [bAddress, setBAddress] = useState('');
  const [bSaving, setBSaving] = useState(false);

  // Yeni derslik paneli
  const [openClassroom, setOpenClassroom] = useState(false);
  const [cCode, setCCode] = useState('');
  const [cName, setCName] = useState('');
  const [cKind, setCKind] = useState<Classroom['kind']>('derslik');
  const [cCapacity, setCCapacity] = useState('30');
  const [cSaving, setCSaving] = useState(false);

  const load = useCallback(async () => {
    const b = await apiList<Building>('/facilities/buildings');
    setBuildings(b ?? []);
    setLoaded(true);
  }, []);

  useEffect(() => {
    load().catch((e) => setErr(e instanceof Error ? e.message : 'Hata'));
  }, [load]);

  const loadClassrooms = useCallback(async (b: Building) => {
    setSelected(b);
    setCrLoading(true);
    setCrErr('');
    setClassrooms([]);
    try {
      const c = await api<Classroom[]>(`/facilities/classrooms?buildingId=${b.id}`);
      setClassrooms(c ?? []);
    } catch (e) {
      setCrErr(e instanceof Error ? e.message : 'Derslikler alınamadı');
    } finally {
      setCrLoading(false);
    }
  }, []);

  const openBuildingPanel = useCallback(() => {
    setBCode('');
    setBName('');
    setBCampus('');
    setBAddress('');
    setOpenBuilding(true);
  }, []);

  const createBuilding = useCallback(async () => {
    if (!bCode.trim() || !bName.trim() || !bCampus.trim()) {
      toast('Eksik bilgi', { tone: 'err', body: 'Kod, ad ve kampüs zorunludur.' });
      return;
    }
    setBSaving(true);
    try {
      await api('/facilities/buildings', {
        method: 'POST',
        body: {
          code: bCode.trim(),
          name: bName.trim(),
          campus: bCampus.trim(),
          address: bAddress.trim(),
        },
      });
      toast('Bina eklendi', { tone: 'ok', body: `${bCode.trim()} · ${bName.trim()}` });
      setOpenBuilding(false);
      await load();
    } catch (e) {
      toast('Bina eklenemedi', { tone: 'err', body: e instanceof Error ? e.message : 'Hata' });
    } finally {
      setBSaving(false);
    }
  }, [bCode, bName, bCampus, bAddress, load]);

  const openClassroomPanel = useCallback(() => {
    setCCode('');
    setCName('');
    setCKind('derslik');
    setCCapacity('30');
    setOpenClassroom(true);
  }, []);

  const createClassroom = useCallback(async () => {
    if (!selected) return;
    const cap = Number(cCapacity);
    if (!cCode.trim() || !cName.trim() || !Number.isInteger(cap) || cap <= 0) {
      toast('Eksik bilgi', { tone: 'err', body: 'Kod, ad ve geçerli kapasite zorunludur.' });
      return;
    }
    setCSaving(true);
    try {
      await api('/facilities/classrooms', {
        method: 'POST',
        body: {
          buildingId: selected.id,
          code: cCode.trim(),
          name: cName.trim(),
          kind: cKind,
          capacity: cap,
        },
      });
      toast('Derslik eklendi', {
        tone: 'ok',
        body: `${cCode.trim()} · ${KIND_LABEL[cKind]} · ${cap} kişi`,
      });
      setOpenClassroom(false);
      await loadClassrooms(selected);
    } catch (e) {
      toast('Derslik eklenemedi', { tone: 'err', body: e instanceof Error ? e.message : 'Hata' });
    } finally {
      setCSaving(false);
    }
  }, [selected, cCode, cName, cKind, cCapacity, loadClassrooms]);

  const crStats = useMemo(() => {
    const totalCap = classrooms.reduce((s, c) => s + c.capacity, 0);
    const labs = classrooms.filter((c) => c.kind === 'lab').length;
    const amfi = classrooms.filter((c) => c.kind === 'amfi').length;
    return { totalCap, labs, amfi };
  }, [classrooms]);

  if (err) return <Alert tone="err">{err}</Alert>;

  return (
    <>
      <PageHeader
        title="Derslik Tanımlama"
        sub="Bina ve derslik/amfi/laboratuvar kayıtlarını yönetin."
        actions={
          <Button icon="grade" onClick={openBuildingPanel}>
            Yeni Bina
          </Button>
        }
      />

      {!loaded ? (
        <Skeleton lines={6} />
      ) : (
        <>
          <StatGrid
            stats={[
              { label: 'Toplam bina', value: buildings.length, icon: 'building' },
              {
                label: 'Kampüs sayısı',
                value: new Set(buildings.map((b) => b.campus)).size,
                icon: 'home',
              },
            ]}
          />

          <Card
            title="Binalar"
            icon="grade"
            hint="Dersliklerini görüntülemek için bir bina seçin."
          >
            <DataTable
              rows={buildings}
              csv
              csvName="binalar"
              empty="Henüz bina tanımlanmadı."
              columns={[
                {
                  key: 'code',
                  header: 'Kod',
                  value: (r) => r.code,
                  render: (r) => <Badge tone="muted">{r.code}</Badge>,
                },
                { key: 'name', header: 'Ad', value: (r) => r.name },
                { key: 'campus', header: 'Kampüs', value: (r) => r.campus },
                {
                  key: 'address',
                  header: 'Adres',
                  value: (r) => r.address ?? '',
                  render: (r) =>
                    r.address ? r.address : <span className="muted">—</span>,
                },
                {
                  key: 'action',
                  header: '',
                  sortable: false,
                  render: (r) => (
                    <Button
                      variant={selected?.id === r.id ? 'primary' : 'subtle'}
                      sm
                      icon="chevronRight"
                      onClick={() => loadClassrooms(r)}
                    >
                      Derslikler
                    </Button>
                  ),
                },
              ]}
            />
          </Card>

          {selected ? (
            <Card
              title={`${selected.code} · ${selected.name} — Derslikler`}
              icon="book"
              hint="Bu binaya derslik, amfi veya laboratuvar ekleyin."
              actions={
                <Button sm icon="grade" onClick={openClassroomPanel}>
                  Yeni Derslik
                </Button>
              }
            >
              {crErr ? (
                <Alert tone="err">{crErr}</Alert>
              ) : crLoading ? (
                <Skeleton lines={4} />
              ) : (
                <>
                  <StatGrid
                    stats={[
                      { label: 'Derslik sayısı', value: classrooms.length, icon: 'book' },
                      { label: 'Toplam kapasite', value: crStats.totalCap, icon: 'users' },
                      { label: 'Amfi', value: crStats.amfi, icon: 'grade' },
                      { label: 'Laboratuvar', value: crStats.labs, icon: 'grade' },
                    ]}
                  />
                  <DataTable
                    rows={classrooms}
                    csv
                    csvName={`derslikler-${selected.code}`}
                    empty="Bu binada henüz derslik tanımlanmadı."
                    columns={[
                      {
                        key: 'code',
                        header: 'Kod',
                        value: (r) => r.code,
                        render: (r) => <Badge tone="muted">{r.code}</Badge>,
                      },
                      { key: 'name', header: 'Ad', value: (r) => r.name },
                      {
                        key: 'kind',
                        header: 'Tür',
                        value: (r) => KIND_LABEL[r.kind],
                        render: (r) => (
                          <Badge tone={KIND_TONE[r.kind]}>{KIND_LABEL[r.kind]}</Badge>
                        ),
                      },
                      {
                        key: 'capacity',
                        header: 'Kapasite',
                        num: true,
                        value: (r) => r.capacity,
                      },
                    ]}
                  />
                </>
              )}
            </Card>
          ) : (
            <EmptyState
              icon="book"
              title="Bina seçilmedi"
              sub="Dersliklerini görmek için yukarıdaki listeden bir bina seçin."
            />
          )}
        </>
      )}

      {/* Yeni bina */}
      <Drawer open={openBuilding} onClose={() => setOpenBuilding(false)} title="Yeni Bina">
        <div className="field">
          <label>Kod</label>
          <input
            value={bCode}
            onChange={(e) => setBCode(e.target.value)}
            placeholder="örn. A"
            maxLength={20}
          />
        </div>
        <div className="field">
          <label>Ad</label>
          <input
            value={bName}
            onChange={(e) => setBName(e.target.value)}
            placeholder="örn. Mühendislik Binası"
            maxLength={120}
          />
        </div>
        <div className="field">
          <label>Kampüs</label>
          <input
            value={bCampus}
            onChange={(e) => setBCampus(e.target.value)}
            placeholder="örn. Merkez Kampüs"
            maxLength={120}
          />
        </div>
        <div className="field">
          <label>Adres</label>
          <input
            value={bAddress}
            onChange={(e) => setBAddress(e.target.value)}
            placeholder="isteğe bağlı"
            maxLength={240}
          />
        </div>
        <Button block icon="check" onClick={createBuilding} disabled={bSaving}>
          {bSaving ? 'Kaydediliyor…' : 'Binayı Ekle'}
        </Button>
      </Drawer>

      {/* Yeni derslik */}
      <Drawer
        open={openClassroom}
        onClose={() => setOpenClassroom(false)}
        title="Yeni Derslik"
      >
        {selected && (
          <>
            <div className="info-box" style={{ marginTop: 0 }}>
              Bina: <b>{selected.code} · {selected.name}</b>
            </div>
            <div className="field">
              <label>Kod</label>
              <input
                value={cCode}
                onChange={(e) => setCCode(e.target.value)}
                placeholder="örn. A-101"
                maxLength={20}
              />
            </div>
            <div className="field">
              <label>Ad</label>
              <input
                value={cName}
                onChange={(e) => setCName(e.target.value)}
                placeholder="örn. 101 No'lu Derslik"
                maxLength={120}
              />
            </div>
            <div className="field">
              <label>Tür</label>
              <select
                value={cKind}
                onChange={(e) => setCKind(e.target.value as Classroom['kind'])}
                aria-label="Tür"
              >
                <option value="derslik">Derslik</option>
                <option value="amfi">Amfi</option>
                <option value="lab">Laboratuvar</option>
              </select>
            </div>
            <div className="field">
              <label>Kapasite</label>
              <input
                type="number"
                min={1}
                max={2000}
                value={cCapacity}
                onChange={(e) => setCCapacity(e.target.value)}
              />
            </div>
            <Button block icon="check" onClick={createClassroom} disabled={cSaving}>
              {cSaving ? 'Kaydediliyor…' : 'Dersliği Ekle'}
            </Button>
          </>
        )}
      </Drawer>
    </>
  );
}
