import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// RFC 4648 Base32; RFC 6238 SHA-1 / 6 digits / 30 seconds, compatible with authenticators.
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function newTotpSecret(): string {
  const bytes = randomBytes(20); let bits=0, value=0, result='';
  for (const byte of bytes) { value=(value<<8)|byte; bits+=8; while(bits>=5) { bits-=5; result+=alphabet[(value>>>bits)&31]; } }
  return result;
}
function decode(secret: string) {
  if (!/^[A-Z2-7]{32}$/.test(secret)) throw new Error('Invalid TOTP secret');
  let bits=0,value=0; const output:number[]=[];
  for(const char of secret) { value=(value<<5)|alphabet.indexOf(char); bits+=5; if(bits>=8) { bits-=8; output.push((value>>>bits)&255); } }
  return Buffer.from(output);
}
export function totp(secret: string, step: number): string {
  const counter=Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(step));
  const mac=createHmac('sha1',decode(secret)).update(counter).digest(), offset=mac[mac.length-1]&15;
  return ((mac.readUInt32BE(offset)&0x7fffffff)%1_000_000).toString().padStart(6,'0');
}
export function totpStep(secret: string, code: unknown, timestamp: number, previous=-1): number|null {
  if(typeof code!=='string'||!/^\d{6}$/.test(code))return null;
  const current=Math.floor(timestamp/30);
  for(const step of [current,current-1,current+1]) if(step>previous && timingSafeEqual(Buffer.from(totp(secret,step)),Buffer.from(code)))return step;
  return null;
}
function key(value: string|undefined) { if(!value||!/^[a-f0-9]{64}$/.test(value))throw new Error('CMS_MFA_KEY unavailable');return Buffer.from(value,'hex'); }
export function sealSecret(secret: string, accountId: string, encryptionKey: string|undefined): string {
  const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',key(encryptionKey),iv);
  cipher.setAAD(Buffer.from(accountId));
  const ciphertext=Buffer.concat([cipher.update(secret,'utf8'),cipher.final()]);
  return ['v1',iv.toString('hex'),cipher.getAuthTag().toString('hex'),ciphertext.toString('hex')].join(':');
}
export function openSecret(encoded: string, accountId: string, encryptionKey: string|undefined): string {
  if(!/^v1:[a-f0-9]{24}:[a-f0-9]{32}:[a-f0-9]{64}$/.test(encoded))throw new Error('Invalid encrypted secret');
  const [,iv,tag,ciphertext]=encoded.split(':'), decipher=createDecipheriv('aes-256-gcm',key(encryptionKey),Buffer.from(iv,'hex'));
  decipher.setAAD(Buffer.from(accountId));decipher.setAuthTag(Buffer.from(tag,'hex'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext,'hex')),decipher.final()]).toString('utf8');
}
