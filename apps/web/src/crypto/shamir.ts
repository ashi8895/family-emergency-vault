/**
 * Shamir's Secret Sharing over GF(2^8), implemented from scratch (no library) so it can be explained line by line.
 *
 * Idea: hide the secret as the constant term of a random polynomial of degree k-1 and hand out n points on it.
 * Any k points determine the polynomial (Lagrange interpolation) and therefore the secret.
 * Any k-1 points are consistent with EVERY possible secret, so they reveal nothing at all.
 * We do this independently for each byte of the secret.
 *
 * Field: GF(2^8) with the AES polynomial x^8 + x^4 + x^3 + x + 1 (0x11B). Addition and subtraction are XOR.
 * Share format: [x, y_0, y_1, ... y_(len-1)] where x in 1..255 is the share's index.
 */

const EXP = new Uint8Array(512); // EXP[i] = 3^i (3 is a generator of this field)
const LOG = new Uint8Array(256); // LOG[3^i] = i

(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    let x2 = x << 1; // multiply by 2 ...
    if (x2 & 0x100) x2 ^= 0x11b; // ... reduce modulo the field polynomial
    x = x2 ^ x; // multiply by 3 = (x * 2) + x
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; // avoid a modulo in gfMul
})();

export function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

export function gfDiv(a: number, b: number): number {
  if (b === 0) throw new Error('Division by zero in GF(256)');
  if (a === 0) return 0;
  return EXP[LOG[a] + 255 - LOG[b]];
}

/** Split `secret` into `n` shares; any `k` of them rebuild it. */
export function split(secret: Uint8Array, n: number, k: number): Uint8Array[] {
  if (!Number.isInteger(n) || !Number.isInteger(k)) throw new Error('n and k must be integers');
  if (k < 2) throw new Error('Threshold must be at least 2');
  if (k > n) throw new Error('Threshold cannot be larger than the number of shares');
  if (n > 255) throw new Error('At most 255 shares are supported');
  if (secret.length === 0) throw new Error('Secret is empty');

  const shares = Array.from({ length: n }, (_, i) => {
    const s = new Uint8Array(secret.length + 1);
    s[0] = i + 1; // x coordinate; never 0, because f(0) is the secret itself
    return s;
  });

  const coeffs = new Uint8Array(k); // coeffs[0] = secret byte, coeffs[1..k-1] = fresh random numbers
  for (let b = 0; b < secret.length; b++) {
    coeffs[0] = secret[b];
    crypto.getRandomValues(coeffs.subarray(1));
    for (let i = 0; i < n; i++) {
      const x = i + 1;
      let y = 0;
      for (let d = k - 1; d >= 0; d--) y = gfMul(y, x) ^ coeffs[d]; // Horner's method
      shares[i][b + 1] = y;
    }
  }
  coeffs.fill(0);
  return shares;
}

/**
 * Rebuild the secret from shares (Lagrange interpolation at x = 0).
 * IMPORTANT: with fewer than k shares this does NOT throw; it returns a wrong value.
 * That is inherent to Shamir, so callers must verify the result (see recovery.ts key check).
 */
export function combine(shares: Uint8Array[]): Uint8Array {
  if (shares.length < 2) throw new Error('At least 2 shares are needed');
  const len = shares[0].length;
  if (len < 2) throw new Error('Share is too short');
  if (shares.some((s) => s.length !== len)) throw new Error('Shares have different lengths');

  const xs = shares.map((s) => s[0]);
  if (xs.some((x) => x === 0)) throw new Error('Invalid share index');
  if (new Set(xs).size !== xs.length) throw new Error('Duplicate shares');

  // Lagrange basis at 0: L_i(0) = prod_{j != i} x_j / (x_i + x_j)   (+ is XOR in GF(2^8))
  const basis = xs.map((xi, i) => {
    let l = 1;
    for (let j = 0; j < xs.length; j++) {
      if (j !== i) l = gfMul(l, gfDiv(xs[j], xi ^ xs[j]));
    }
    return l;
  });

  const secret = new Uint8Array(len - 1);
  for (let b = 0; b < secret.length; b++) {
    let acc = 0;
    for (let i = 0; i < shares.length; i++) acc ^= gfMul(shares[i][b + 1], basis[i]);
    secret[b] = acc;
  }
  return secret;
}
