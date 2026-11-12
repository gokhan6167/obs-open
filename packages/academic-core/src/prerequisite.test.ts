import { describe, expect, it } from 'vitest';
import { evaluateCondition, unmetLeaves, type ConditionNode } from './prerequisite.js';
import type { StudentContext } from './prerequisite.js';

const ctx: StudentContext = {
  passedCourses: new Set(['MAT101', 'FIZ101']),
  earnedCredit: 60,
  gpa: 2.8,
};

describe('evaluateCondition', () => {
  it('always daima true', () => {
    expect(evaluateCondition({ type: 'always' }, ctx)).toBe(true);
  });

  it('course: geçilmiş dersi kontrol eder', () => {
    expect(evaluateCondition({ type: 'course', courseCode: 'MAT101' }, ctx)).toBe(true);
    expect(evaluateCondition({ type: 'course', courseCode: 'KIM101' }, ctx)).toBe(false);
  });

  it('minCredit ve minGpa eşiklerini kontrol eder', () => {
    expect(evaluateCondition({ type: 'minCredit', credit: 60 }, ctx)).toBe(true);
    expect(evaluateCondition({ type: 'minCredit', credit: 61 }, ctx)).toBe(false);
    expect(evaluateCondition({ type: 'minGpa', gpa: 2.0 }, ctx)).toBe(true);
    expect(evaluateCondition({ type: 'minGpa', gpa: 3.0 }, ctx)).toBe(false);
  });

  it('and: tüm çocuklar sağlanmalı', () => {
    const node: ConditionNode = {
      type: 'and',
      children: [
        { type: 'course', courseCode: 'MAT101' },
        { type: 'course', courseCode: 'FIZ101' },
      ],
    };
    expect(evaluateCondition(node, ctx)).toBe(true);
    node.children.push({ type: 'course', courseCode: 'KIM101' });
    expect(evaluateCondition(node, ctx)).toBe(false);
  });

  it('or: en az bir çocuk sağlanmalı', () => {
    const node: ConditionNode = {
      type: 'or',
      children: [
        { type: 'course', courseCode: 'KIM101' },
        { type: 'course', courseCode: 'MAT101' },
      ],
    };
    expect(evaluateCondition(node, ctx)).toBe(true);
  });

  it('not: çocuğu tersler', () => {
    expect(evaluateCondition({ type: 'not', child: { type: 'course', courseCode: 'KIM101' } }, ctx)).toBe(
      true,
    );
    expect(evaluateCondition({ type: 'not', child: { type: 'course', courseCode: 'MAT101' } }, ctx)).toBe(
      false,
    );
  });
});

describe('unmetLeaves', () => {
  it('koşul sağlanıyorsa boş döner', () => {
    expect(unmetLeaves({ type: 'course', courseCode: 'MAT101' }, ctx)).toEqual([]);
  });

  it('and altındaki eksik yaprakları toplar', () => {
    const node: ConditionNode = {
      type: 'and',
      children: [
        { type: 'course', courseCode: 'MAT101' },
        { type: 'course', courseCode: 'KIM101' },
        { type: 'minCredit', credit: 120 },
      ],
    };
    const unmet = unmetLeaves(node, ctx);
    expect(unmet).toContainEqual({ type: 'course', courseCode: 'KIM101' });
    expect(unmet).toContainEqual({ type: 'minCredit', credit: 120 });
    expect(unmet).not.toContainEqual({ type: 'course', courseCode: 'MAT101' });
  });

  it('or tamamen sağlanmadıysa tüm dalların eksiklerini verir', () => {
    const node: ConditionNode = {
      type: 'or',
      children: [
        { type: 'course', courseCode: 'KIM101' },
        { type: 'course', courseCode: 'BIO101' },
      ],
    };
    expect(unmetLeaves(node, ctx)).toHaveLength(2);
  });

  it('not sağlanmadıysa düğümün kendisini verir', () => {
    const node: ConditionNode = { type: 'not', child: { type: 'course', courseCode: 'MAT101' } };
    expect(unmetLeaves(node, ctx)).toEqual([node]);
  });

  it('tek yaprak sağlanmadıysa kendisini verir', () => {
    expect(unmetLeaves({ type: 'minGpa', gpa: 3.5 }, ctx)).toEqual([{ type: 'minGpa', gpa: 3.5 }]);
  });
});
