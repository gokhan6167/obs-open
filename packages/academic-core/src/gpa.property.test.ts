import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { computeGpa } from './gpa.js';
import type { CourseAttempt, GpaPolicy } from './types.js';

const POLICY: GpaPolicy = { repeatPolicy: 'last', rounding: { digits: 2, mode: 'half-up' } };

const rowArb = fc.record({
  coefficient: fc.double({ min: 0, max: 4, noNaN: true }),
  credit: fc.integer({ min: 1, max: 30 }),
});

describe('computeGpa — property (değişmezler)', () => {
  it('ham GNO daima katsayıların min-max aralığındadır', () => {
    fc.assert(
      fc.property(fc.array(rowArb, { minLength: 1, maxLength: 50 }), (rows) => {
        const attempts: CourseAttempt[] = rows.map((r, i) => ({
          courseCode: `C${i}`,
          credit: r.credit,
          coefficient: r.coefficient,
          countsInGpa: true,
          termOrder: 1,
        }));
        const res = computeGpa(attempts, POLICY);
        const coeffs = rows.map((r) => r.coefficient);
        const min = Math.min(...coeffs);
        const max = Math.max(...coeffs);
        expect(res.raw).toBeGreaterThanOrEqual(min - 1e-9);
        expect(res.raw).toBeLessThanOrEqual(max + 1e-9);
      }),
    );
  });

  it('GNO hiçbir girdide 0-4 aralığı dışına çıkmaz', () => {
    fc.assert(
      fc.property(fc.array(rowArb, { maxLength: 50 }), (rows) => {
        const attempts: CourseAttempt[] = rows.map((r, i) => ({
          courseCode: `C${i}`,
          credit: r.credit,
          coefficient: r.coefficient,
          countsInGpa: true,
          termOrder: 1,
        }));
        const res = computeGpa(attempts, POLICY);
        expect(res.gpa).toBeGreaterThanOrEqual(0);
        expect(res.gpa).toBeLessThanOrEqual(4);
      }),
    );
  });

  it('tek dersin GNO ham değeri kendi katsayısına eşittir', () => {
    fc.assert(
      fc.property(rowArb, (row) => {
        const res = computeGpa(
          [
            {
              courseCode: 'A',
              credit: row.credit,
              coefficient: row.coefficient,
              countsInGpa: true,
              termOrder: 1,
            },
          ],
          POLICY,
        );
        expect(res.raw).toBeCloseTo(row.coefficient, 10);
      }),
    );
  });
});
