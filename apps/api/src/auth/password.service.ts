import { Injectable } from '@nestjs/common';
import { Algorithm, hash as argonHash, verify as argonVerify } from '@node-rs/argon2';

/**
 * Argon2id parola özeti (master prompt §5). Parametreler dev için makul
 * varsayılan; üretim maliyeti tenant/altyapı bazında ayarlanabilir.
 *
 * @node-rs/argon2 (NAPI prebuilt) kullanılır: serverless/Lambda ortamında
 * derleme gerektirmez. Ürettiği PHC ($argon2id$...) özeti standarttır ve
 * `argon2` (node) ile üretilmiş eski özetlerle karşılıklı doğrulanabilir.
 */
const OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19_456, // ~19 MB (OWASP asgari önerisi)
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class PasswordService {
  async hash(plain: string): Promise<string> {
    return argonHash(plain, OPTIONS);
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argonVerify(hash, plain);
    } catch {
      // Bozuk/eski format özet -> doğrulama başarısız, hata sızdırma.
      return false;
    }
  }
}
