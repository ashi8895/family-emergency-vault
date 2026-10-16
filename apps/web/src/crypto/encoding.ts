const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const utf8 = (s: string): Uint8Array => encoder.encode(s);
export const fromUtf8 = (b: ArrayBuffer | Uint8Array): string => decoder.decode(b);

export function toB64(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = '';
  const CHUNK = 0x8000; // avoid call-stack limits on big buffers
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function fromB64(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export const randomBytes = (n: number): Uint8Array => crypto.getRandomValues(new Uint8Array(n));
