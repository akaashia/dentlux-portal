import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
export function createCrypto(config) {
  const key = Buffer.from(config.encryptionKey, 'hex');
  return {
    encrypt(value) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const ciphertext = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
      return [iv, cipher.getAuthTag(), ciphertext].map((b) => b.toString('base64url')).join('.');
    },
    decrypt(value) {
      const [iv, tag, ciphertext] = value.split('.').map((s) => Buffer.from(s, 'base64url'));
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    },
    hash(value) {
      return createHmac('sha256', config.pepper).update(value).digest('hex');
    },
  };
}
