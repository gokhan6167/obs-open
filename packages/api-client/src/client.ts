import type {
  GraduationStatus,
  HealthStatus,
  Program,
  StudentView,
  Term,
  VerifyResult,
} from './types.js';

export interface ObsClientOptions {
  baseUrl: string;
  tenantId: string;
  /** Auth stub (dev/test): actor kimliği. Üretimde JWT ile değişir. */
  actorUserId?: string;
  roles?: readonly string[];
  /** Test/SSR için enjekte edilebilir fetch. */
  fetchImpl?: typeof fetch;
}

export class ObsApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`OBS API ${status}: ${body}`);
    this.name = 'ObsApiError';
  }
}

/**
 * OBS tipli API istemcisi (Faz 10). Web ve mobil ortak kullanır. Tenant + auth
 * başlıklarını yönetir, tipli yanıt döner, hata durumunda ObsApiError fırlatır.
 */
export class ObsClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: ObsClientOptions) {
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      'x-tenant-id': this.opts.tenantId,
      'content-type': 'application/json',
    };
    if (this.opts.actorUserId) {
      h['x-user-id'] = this.opts.actorUserId;
    }
    if (this.opts.roles && this.opts.roles.length > 0) {
      h['x-user-roles'] = this.opts.roles.join(',');
    }
    return h;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const init: RequestInit = { method, headers: this.headers() };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }
    const res = await this.fetchImpl(`${this.opts.baseUrl}/api/v1${path}`, init);
    if (!res.ok) {
      throw new ObsApiError(res.status, await res.text());
    }
    return (await res.json()) as T;
  }

  health(): Promise<HealthStatus> {
    return this.request<HealthStatus>('GET', '/health');
  }

  listPrograms(): Promise<Program[]> {
    return this.request<Program[]>('GET', '/programs');
  }

  activeTerm(): Promise<Term | null> {
    return this.request<Term | null>('GET', '/calendar/active-term');
  }

  getStudent(id: string): Promise<StudentView> {
    return this.request<StudentView>('GET', `/students/${id}`);
  }

  graduationStatus(studentId: string): Promise<GraduationStatus> {
    return this.request<GraduationStatus>('GET', `/graduation/students/${studentId}/status`);
  }

  studentDebt(studentId: string): Promise<{ studentId: string; outstanding: number }> {
    return this.request('GET', `/finance/students/${studentId}/debt`);
  }

  createRequest(
    studentId: string,
    type: string,
    payload?: Record<string, unknown>,
  ): Promise<{ requestId: string; status: string }> {
    return this.request('POST', '/requests', { studentId, type, payload });
  }

  /** Herkese açık belge doğrulama — tenant/kimlik gerektirmez. */
  verifyDocument(code: string): Promise<VerifyResult> {
    return this.request<VerifyResult>('GET', `/public/verify/${code}`);
  }
}
