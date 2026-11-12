/**
 * Ön koşul / koşul motoru. VE/VEYA ağaçları olarak ders kayıt kurallarını
 * değerlendirir. Ders kayıt, mezuniyet ve intibak akışları bunu kullanır.
 *
 * Parametrik: kural ağacı DB'den gelir, burada gömülü kural yoktur.
 */

export type ConditionNode =
  | { type: 'always' }
  | { type: 'course'; courseCode: string } // dersi başarmış olmak
  | { type: 'minCredit'; credit: number } // toplam kazanılmış kredi eşiği
  | { type: 'minGpa'; gpa: number } // asgari GNO
  | { type: 'and'; children: ConditionNode[] }
  | { type: 'or'; children: ConditionNode[] }
  | { type: 'not'; child: ConditionNode };

export interface StudentContext {
  /** Başarıyla tamamlanmış ders kodları. */
  passedCourses: ReadonlySet<string>;
  /** Kazanılmış toplam kredi. */
  earnedCredit: number;
  /** Güncel GNO. */
  gpa: number;
}

/** Koşul ağacını öğrenci bağlamına göre değerlendirir. */
export function evaluateCondition(node: ConditionNode, ctx: StudentContext): boolean {
  switch (node.type) {
    case 'always':
      return true;
    case 'course':
      return ctx.passedCourses.has(node.courseCode);
    case 'minCredit':
      return ctx.earnedCredit >= node.credit;
    case 'minGpa':
      return ctx.gpa >= node.gpa;
    case 'and':
      return node.children.every((c) => evaluateCondition(c, ctx));
    case 'or':
      return node.children.some((c) => evaluateCondition(c, ctx));
    case 'not':
      return !evaluateCondition(node.child, ctx);
  }
}

/**
 * Koşul karşılanmadıysa, karşılanmayan yaprak koşulları döner (öğrenciye
 * "şu ön koşulu sağlamıyorsun" açıklaması için). Karşılanıyorsa boş dizi.
 */
export function unmetLeaves(node: ConditionNode, ctx: StudentContext): ConditionNode[] {
  if (evaluateCondition(node, ctx)) {
    return [];
  }
  switch (node.type) {
    case 'and':
      return node.children.flatMap((c) => unmetLeaves(c, ctx));
    case 'or':
      // VEYA tamamı sağlanmadı: tüm dalların eksikleri aday.
      return node.children.flatMap((c) => unmetLeaves(c, ctx));
    case 'not':
      return [node];
    default:
      return [node];
  }
}
