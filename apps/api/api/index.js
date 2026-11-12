// Vercel Serverless Function girişi. Derlenmiş (tsc, decorator metadata'lı)
// NestJS uygulamasını yeniden dışa aktarır; tüm yollar buraya yönlendirilir
// (vercel.json rewrites). DI için önceden derlenmiş dist kullanılır.
export { default } from '../dist/serverless.js';
