import { describe, expect, it } from 'vitest';
import { checkCompletion, type CompletionInput, type RequiredCourse } from './completion.js';

const required: RequiredCourse[] = [
  { courseCode: 'MAT101', ects: 6, isMandatory: true },
  { courseCode: 'FIZ101', ects: 5, isMandatory: true },
  { courseCode: 'SEC101', ects: 4, isMandatory: false },
];

function input(over: Partial<CompletionInput>): CompletionInput {
  return {
    required,
    passedCourseCodes: new Set(),
    earnedEcts: 0,
    gpa: 0,
    minGraduationGpa: 2.0,
    minTotalEcts: 240,
    ...over,
  };
}

describe('checkCompletion', () => {
  it('tüm koşullar sağlanınca tamamlanmış', () => {
    const r = checkCompletion(
      input({
        passedCourseCodes: new Set(['MAT101', 'FIZ101']),
        earnedEcts: 240,
        gpa: 3.1,
      }),
    );
    expect(r.isComplete).toBe(true);
    expect(r.missingMandatory).toHaveLength(0);
    expect(r.missingMandatoryEcts).toBe(0);
  });

  it('eksik zorunlu ders -> tamamlanmamış + doğru eksik liste/AKTS', () => {
    const r = checkCompletion(
      input({ passedCourseCodes: new Set(['MAT101']), earnedEcts: 240, gpa: 3.1 }),
    );
    expect(r.isComplete).toBe(false);
    expect(r.missingMandatory).toEqual(['FIZ101']);
    expect(r.missingMandatoryEcts).toBe(5);
  });

  it('seçmeli ders eksikliği tamamlamayı engellemez', () => {
    const r = checkCompletion(
      input({ passedCourseCodes: new Set(['MAT101', 'FIZ101']), earnedEcts: 240, gpa: 2.5 }),
    );
    expect(r.missingMandatory).not.toContain('SEC101');
    expect(r.isComplete).toBe(true);
  });

  it('düşük GNO -> tamamlanmamış', () => {
    const r = checkCompletion(
      input({ passedCourseCodes: new Set(['MAT101', 'FIZ101']), earnedEcts: 240, gpa: 1.8 }),
    );
    expect(r.meetsGpa).toBe(false);
    expect(r.isComplete).toBe(false);
  });

  it('düşük AKTS -> tamamlanmamış', () => {
    const r = checkCompletion(
      input({ passedCourseCodes: new Set(['MAT101', 'FIZ101']), earnedEcts: 200, gpa: 3.0 }),
    );
    expect(r.meetsEcts).toBe(false);
    expect(r.isComplete).toBe(false);
  });
});
