import { Injectable } from '@nestjs/common';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import QRCode from 'qrcode';

export interface TranscriptLine {
  code: string;
  name: string;
  ects: number;
  letter: string;
}

export interface TranscriptData {
  universityName: string;
  studentNo: string;
  programName: string;
  gpa: number;
  totalEcts: number;
  lines: TranscriptLine[];
  verificationCode: string;
  verifyUrl: string;
  /** PAdES e-imza alanı ileride buraya (adaptör hazır). */
}

/**
 * Belge PDF üretimi (M5). Transkript + QR doğrulama. e-imza (PAdES) ileride
 * adaptörle takılır; şimdilik imzasız + QR doğrulamalı (master prompt §4 direktifi).
 *
 * NOT: StandardFonts (WinAnsi) ş/ğ/ı/İ kodlayamaz; bu karakterler ASCII'ye
 * indirgenir. Tam Türkçe için gömülü TTF (fontkit) Faz 10 cilası.
 */
@Injectable()
export class PdfService {
  private winAnsiSafe(text: string): string {
    return text
      .replace(/ş/g, 's')
      .replace(/Ş/g, 'S')
      .replace(/ğ/g, 'g')
      .replace(/Ğ/g, 'G')
      .replace(/ı/g, 'i')
      .replace(/İ/g, 'I');
  }

  async buildTranscriptPdf(data: TranscriptData): Promise<Buffer> {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]); // A4
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const s = (t: string): string => this.winAnsiSafe(t);

    let y = 800;
    const draw = (t: string, size = 10, f = font, x = 50): void => {
      page.drawText(s(t), { x, y, size, font: f, color: rgb(0, 0, 0) });
      y -= size + 6;
    };

    draw(data.universityName, 16, bold);
    draw('TRANSKRIPT / TRANSCRIPT OF RECORDS', 12, bold);
    y -= 6;
    draw(`Ogrenci No / Student No: ${data.studentNo}`);
    draw(`Program: ${data.programName}`);
    y -= 8;
    draw('Ders / Course                         AKTS   Not', 10, bold);
    for (const line of data.lines) {
      const name = line.name.length > 30 ? line.name.slice(0, 30) : line.name.padEnd(30);
      draw(`${line.code.padEnd(8)} ${name}  ${String(line.ects).padStart(4)}   ${line.letter}`);
      if (y < 120) {
        break; // sayfa taşması: v2'de çok sayfa
      }
    }
    y -= 8;
    draw(`GNO / GPA: ${data.gpa.toFixed(2)}    Toplam AKTS: ${data.totalEcts}`, 11, bold);

    // QR doğrulama kodu.
    const qrPng = await QRCode.toBuffer(data.verifyUrl, { width: 120, margin: 1 });
    const qrImage = await pdf.embedPng(qrPng);
    page.drawImage(qrImage, { x: 430, y: 60, width: 100, height: 100 });
    page.drawText(s(`Dogrulama: ${data.verificationCode}`), {
      x: 50,
      y: 70,
      size: 9,
      font,
    });
    page.drawText(s(data.verifyUrl), { x: 50, y: 58, size: 8, font });

    const bytes = await pdf.save();
    return Buffer.from(bytes);
  }
}
