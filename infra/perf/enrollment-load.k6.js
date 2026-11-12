/* eslint-disable */
// OBS ders kayıt yük testi — "kayıt sabahı" senaryosu (§M3, §6.5).
// Çalıştırma:  k6 run -e BASE_URL=http://localhost:3000 -e TENANT_ID=<uuid> \
//                     -e TERM_ID=<uuid> infra/perf/enrollment-load.k6.js
//
// Hedef (README/docs/performance): kayıt açılış dakikasında p95 < 800ms,
// 20.000 eşzamanlı öğrenci. Aşağıdaki ramp lokal doğrulama içindir; gerçek
// hedef yük ayrı bir perf ortamında (dağıtık k6) koşulur.
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const TENANT_ID = __ENV.TENANT_ID || '';
const TERM_ID = __ENV.TERM_ID || '';

export const options = {
  scenarios: {
    kayit_sabahi: {
      executor: 'ramping-vus',
      startVUs: 0,
      // Lokal doğrulama rampı; perf ortamında hedef 20k'ya çıkarılır.
      stages: [
        { duration: '30s', target: 200 },
        { duration: '1m', target: 500 },
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: {
    // Master prompt hedefi.
    http_req_duration: ['p(95)<800'],
    http_req_failed: ['rate<0.01'],
  },
};

const headers = { 'x-tenant-id': TENANT_ID, 'Content-Type': 'application/json' };

export default function () {
  // Okuma yolu: canlı izleme + program listesi (kayıt haftasında en çok vurulan).
  const health = http.get(`${BASE_URL}/api/v1/health`);
  check(health, { 'health 200': (r) => r.status === 200 });

  const programs = http.get(`${BASE_URL}/api/v1/programs`, { headers });
  check(programs, { 'programs 200': (r) => r.status === 200 });

  if (TERM_ID) {
    const stats = http.get(`${BASE_URL}/api/v1/enrollment/stats/${TERM_ID}`, { headers });
    check(stats, { 'stats 200': (r) => r.status === 200 });
  }

  sleep(1);
}
