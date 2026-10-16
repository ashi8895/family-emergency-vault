/**
 * A key piece is 33 bytes. To let trusted people hand theirs to whoever is opening the vault (read aloud, WhatsApp, paper)
 * without the server ever seeing it, we turn it into a short human-friendly code:
 *   33 piece bytes + 2 checksum bytes = 35 bytes = 56 Crockford-base32 characters, shown as 14 groups of 4.
 * Crockford's alphabet has no I, L, O or U, ignores case, and reads O as 0 and I/L as 1, so a code read out loud or
 * typed from paper survives the usual mix-ups. The 16-bit checksum catches most remaining typos.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const PIECE_BYTES = 33;
const CHECK_BYTES = 2;

async function checksum(piece: Uint8Array): Promise<Uint8Array> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', piece as BufferSource));
  return d.subarray(0, CHECK_BYTES);
}

function toBase32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function fromBase32(s: string): Uint8Array {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of s) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error('Invalid character');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Uint8Array.from(out);
}

export async function encodePiece(piece: Uint8Array): Promise<string> {
  if (piece.length !== PIECE_BYTES) throw new Error('Unexpected key piece size');
  const bytes = new Uint8Array(PIECE_BYTES + CHECK_BYTES);
  bytes.set(piece);
  bytes.set(await checksum(piece), PIECE_BYTES);
  return toBase32(bytes).match(/.{1,4}/g)!.join('-');
}

export type DecodeError = 'format' | 'checksum';
export class PieceCodeError extends Error {
  constructor(public kind: DecodeError) {
    super(kind === 'format' ? 'The code has the wrong length or characters' : 'The code has a typo');
  }
}

/** Forgiving about case, spaces, dashes, line breaks and O/I/L look-alikes. Throws PieceCodeError. */
export async function decodePiece(code: string): Promise<Uint8Array> {
  const clean = code
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  if (clean.length !== 56 || [...clean].some((c) => !ALPHABET.includes(c))) throw new PieceCodeError('format');
  const bytes = fromBase32(clean).subarray(0, PIECE_BYTES + CHECK_BYTES);
  const piece = bytes.slice(0, PIECE_BYTES);
  const given = bytes.slice(PIECE_BYTES);
  const expected = await checksum(piece);
  if (given[0] !== expected[0] || given[1] !== expected[1]) throw new PieceCodeError('checksum');
  return piece;
}
