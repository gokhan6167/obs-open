import { cp, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// tsc .sql kopyalamaz; migrate runtime'ı dist/db/migrations'ı okur. Derlemeden
// sonra migration dosyalarını dist'e kopyala (üretim imajı için zorunlu).
const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', 'src', 'db', 'migrations');
const dest = join(here, '..', 'dist', 'db', 'migrations');

await mkdir(dest, { recursive: true });
await cp(src, dest, { recursive: true });
console.warn('migrations -> dist/db/migrations kopyalandı');
