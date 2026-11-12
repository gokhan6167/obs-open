import { describe, expect, it, vi } from 'vitest';
import { ObsApiError, ObsClient } from './client.js';

type FetchMock = ReturnType<typeof makeFetch>;

function makeFetch(status: number, body: unknown) {
  return vi.fn((_url: string, _init: RequestInit): Promise<Response> =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
    } as Response),
  );
}

function client(f: FetchMock, over: Record<string, unknown> = {}): ObsClient {
  return new ObsClient({ baseUrl: 'http://api.test', tenantId: 'T1', fetchImpl: f as unknown as typeof fetch, ...over });
}

function callOf(f: FetchMock, i = 0): { url: string; init: RequestInit; headers: Record<string, string> } {
  const call = f.mock.calls[i]!;
  const init = call[1];
  return { url: call[0], init, headers: init.headers as Record<string, string> };
}

describe('ObsClient', () => {
  it('GET isteğini doğru URL + tenant başlığıyla yapar', async () => {
    const f = makeFetch(200, { status: 'ok', deploymentMode: 'multi-tenant', time: 't' });
    const r = await client(f).health();
    expect(r.status).toBe('ok');
    const { url, init, headers } = callOf(f);
    expect(url).toBe('http://api.test/api/v1/health');
    expect(init.method).toBe('GET');
    expect(headers['x-tenant-id']).toBe('T1');
  });

  it('actor kimliği/rolleri başlığa eklenir', async () => {
    const f = makeFetch(200, []);
    await client(f, { actorUserId: 'u1', roles: ['ogrenci', 'oidb'] }).listPrograms();
    const { headers } = callOf(f);
    expect(headers['x-user-id']).toBe('u1');
    expect(headers['x-user-roles']).toBe('ogrenci,oidb');
  });

  it('POST gövdeyi JSON serialize eder', async () => {
    const f = makeFetch(201, { requestId: 'r1', status: 'submitted' });
    const r = await client(f).createRequest('s1', 'kayit_dondurma', { reason: 'x' });
    expect(r.status).toBe('submitted');
    const { init } = callOf(f);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      studentId: 's1',
      type: 'kayit_dondurma',
      payload: { reason: 'x' },
    });
  });

  it('hata durumunda ObsApiError fırlatır', async () => {
    const f = makeFetch(403, 'Yetkiniz yok');
    await expect(client(f).getStudent('s1')).rejects.toBeInstanceOf(ObsApiError);
  });

  it('public verify doğru yolu çağırır', async () => {
    const f = makeFetch(200, { valid: true });
    const r = await client(f).verifyDocument('KOD');
    expect(r.valid).toBe(true);
    expect(callOf(f).url).toBe('http://api.test/api/v1/public/verify/KOD');
  });
});
