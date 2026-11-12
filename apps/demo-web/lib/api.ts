'use client';
import { API_BASE, TENANT_ID } from './config';

const TOKEN_KEY = 'obs_token';

export interface JwtPayload {
  sub: string;
  tenant: string;
  roles: string[];
  exp?: number;
}

export function saveToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}
export function getToken(): string | null {
  return typeof window === 'undefined' ? null : localStorage.getItem(TOKEN_KEY);
}
export function logout(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/** JWT payload'ı client-side çöz (imza sunucuda doğrulanır; burada sadece rol yönlendirmesi). */
export function decodeToken(token: string): JwtPayload | null {
  try {
    const [, payload] = token.split('.');
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

export function currentRoles(): string[] {
  const t = getToken();
  const p = t ? decodeToken(t) : null;
  if (p?.exp && p.exp * 1000 < Date.now()) {
    logout();
    return [];
  }
  return p?.roles ?? [];
}

/** Rol -> varsayılan panel yolu (öncelik sırasıyla; her rol kendi base'ine gider). */
export interface RolePanel {
  role: string;
  href: string;
  label: string;
}

/**
 * Rol -> panel haritası (öncelik sırasıyla). Bir kullanıcı birden çok role
 * sahip olabilir (ör. öğretim elemanı + bölüm başkanı); bu durumda tüm
 * panellerine erişir ve üst menüden geçiş yapar.
 */
export const ROLE_PANELS: RolePanel[] = [
  { role: 'oidb', href: '/oidb', label: 'Öğrenci İşleri' },
  { role: 'dekanlik', href: '/dekanlik', label: 'Dekanlık' },
  { role: 'bolum_baskani', href: '/bolum', label: 'Bölüm Başkanlığı' },
  { role: 'koordinator', href: '/koordinator', label: 'Koordinatörlük' },
  { role: 'fakulte_sekreteri', href: '/sekreter', label: 'Fakülte Sekreterliği' },
  { role: 'mali_isler', href: '/mali', label: 'Mali İşler' },
  { role: 'rektorluk', href: '/rektorluk', label: 'Rektörlük' },
  { role: 'sistem_yoneticisi', href: '/sistem', label: 'Sistem Yönetimi' },
  { role: 'danisman', href: '/danisman', label: 'Danışmanlık' },
  { role: 'ogretim_elemani', href: '/hoca', label: 'Öğretim Elemanı' },
  { role: 'ogrenci', href: '/ogrenci', label: 'Öğrenci' },
];

/** Kullanıcının rollerinin açtığı TÜM paneller (öncelik sırasıyla). */
export function rolePanels(roles: string[]): RolePanel[] {
  return ROLE_PANELS.filter((p) => roles.includes(p.role));
}

export function roleHome(roles: string[]): string {
  return rolePanels(roles)[0]?.href ?? '/';
}

export async function login(email: string, password: string): Promise<string[]> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-tenant-id': TENANT_ID },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Giriş başarısız');
  }
  const data = (await res.json()) as { accessToken: string; roles: string[] };
  saveToken(data.accessToken);
  return data.roles;
}

/** JWT ile korunan istek. 401 -> oturum düşer. */
export async function api<T = unknown>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    method: init?.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  if (res.status === 401) {
    logout();
    throw new Error('Oturum sona erdi, tekrar giriş yapın');
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error((data as { message?: string })?.message ?? `Hata ${res.status}`);
  }
  return data as T;
}

/**
 * Liste uçları için güvenli okuma.
 *
 * Bazı uçlar düz dizi (`[...]`), bazıları sayfalı zarf (`{items:[...], total}`)
 * döndürüyor. Çağıran taraf dizi varsayıp `.filter/.map` çağırınca ekran
 * "client-side exception" ile çöküyordu (canlıda seçmeli ders havuzunda görüldü).
 * Bu yardımcı iki şekli de kabul eder ve HER ZAMAN dizi döndürür.
 */
export async function apiList<T = unknown>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T[]> {
  const data = await api<unknown>(path, init);
  if (Array.isArray(data)) return data as T[];
  const items = (data as { items?: unknown } | null)?.items;
  return Array.isArray(items) ? (items as T[]) : [];
}
