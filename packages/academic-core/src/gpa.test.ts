import { describe, expect, it } from 'vitest';
import { computeGpa, selectByRepeatPolicy } from './gpa.js';
import type { CourseAttempt, GpaPolicy } from './types.js';
import golden from './__golden__/transcripts.json' with { type: 'json' };

const HALF_UP_2: GpaPolicy = { repeatPolicy: 'last', rounding: { digits: 2, mode: 'half-up' } };

function attempt(over: Partial<CourseAttempt>): CourseAttempt {
  return {
    courseCode: 'X',
    credit: 1,
    coefficient: 0,
    countsInGpa: true,
    termOrder: 1,
    ...over,
  };
}

describe('computeGpa — golden senaryolar', () => {
  for (const c of golden.cases) {
    it(`golden: ${c.name}`, () => {
      const result = computeGpa(c.attempts, c.policy as GpaPolicy);
      expect(result.gpa).toBe(c.expected.gpa);
      expect(result.totalCredit).toBe(c.expected.totalCredit);
    });
  }
});

describe('computeGpa — birim', () => {
  it('ağırlıklı ortalamayı doğru hesaplar', () => {
    const r = computeGpa(
      [
        attempt({ courseCode: 'A', credit: 6, coefficient: 4 }),
        attempt({ courseCode: 'B', credit: 4, coefficient: 3 }),
      ],
      HALF_UP_2,
    );
    expect(r.raw).toBeCloseTo(3.6, 10);
    expect(r.gpa).toBe(3.6);
    expect(r.totalCredit).toBe(10);
    expect(r.countedAttempts).toHaveLength(2);
  });

  it('toplam kredi 0 ise GNO 0 döner', () => {
    const r = computeGpa(
      [attempt({ courseCode: 'A', credit: 3, countsInGpa: false })],
      HALF_UP_2,
    );
    expect(r).toEqual({ gpa: 0, totalCredit: 0, raw: 0, countedAttempts: [] });
  });

  it('kredisi 0 olan derslerde de GNO 0', () => {
    const r = computeGpa([attempt({ courseCode: 'A', credit: 0, coefficient: 4 })], HALF_UP_2);
    expect(r.gpa).toBe(0);
    expect(r.totalCredit).toBe(0);
  });
});

describe('selectByRepeatPolicy', () => {
  const attempts: CourseAttempt[] = [
    attempt({ courseCode: 'A', coefficient: 3, termOrder: 1 }),
    attempt({ courseCode: 'A', coefficient: 1, termOrder: 2 }),
    attempt({ courseCode: 'B', coefficient: 2, termOrder: 1 }),
  ];

  it("'last' en güncel denemeyi seçer", () => {
    const chosen = selectByRepeatPolicy(attempts, 'last');
    const a = chosen.find((c) => c.courseCode === 'A');
    expect(a?.coefficient).toBe(1);
    expect(chosen).toHaveLength(2);
  });

  it("'highest' en yüksek katsayıyı seçer", () => {
    const chosen = selectByRepeatPolicy(attempts, 'highest');
    const a = chosen.find((c) => c.courseCode === 'A');
    expect(a?.coefficient).toBe(3);
  });

  it("'highest' katsayı eşitse en güncel denemeyi seçer", () => {
    const tie: CourseAttempt[] = [
      attempt({ courseCode: 'A', coefficient: 2, termOrder: 1 }),
      attempt({ courseCode: 'A', coefficient: 2, termOrder: 5 }),
    ];
    const chosen = selectByRepeatPolicy(tie, 'highest');
    expect(chosen[0]?.termOrder).toBe(5);
  });
});
