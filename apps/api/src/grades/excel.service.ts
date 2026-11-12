import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import type { RawGradeRow } from './bulk.js';

/**
 * Excel şablonu dışa aktarma + yüklenen dosyayı satırlara çözme (M4 toplu not).
 * Doğrulama/hatalı-satır mantığı bulk.ts'te (saf); bu adaptör sadece xlsx I/O.
 *
 * NOT: exceljs'in Buffer tipi ile Node 22 Buffer<ArrayBufferLike> arasındaki
 * uyumsuzluk için hedeflenmiş cast'ler kullanılır (any değil, tipli cast).
 */
@Injectable()
export class ExcelService {
  private readonly sheetName = 'Notlar';

  async buildScoreTemplate(students: { studentNo: string; name: string }[]): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(this.sheetName);
    ws.columns = [
      { header: 'Öğrenci No', key: 'studentNo', width: 16 },
      { header: 'Ad Soyad', key: 'name', width: 28 },
      { header: 'Puan', key: 'score', width: 10 },
    ];
    for (const s of students) {
      ws.addRow({ studentNo: s.studentNo, name: s.name });
    }
    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf as unknown as Uint8Array);
  }

  async parseScoreSheet(buffer: Buffer): Promise<RawGradeRow[]> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0]);
    const ws = wb.worksheets[0];
    if (!ws) {
      return [];
    }
    const rows: RawGradeRow[] = [];
    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        return; // başlık
      }
      // .text daima string döner (obje stringification riski yok).
      const studentNo = row.getCell(1).text.trim();
      const score = row.getCell(3).text.trim();
      if (studentNo === '' && score === '') {
        return; // boş satır
      }
      rows.push({ studentNo, score });
    });
    return rows;
  }
}
