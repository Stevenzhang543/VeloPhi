//! SHA-256 (FIPS 180-4), incremental, dependency-free (port of `src/core/record/sha256.ts`).

const K: [u32; 64] = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74,
    0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d,
    0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e,
    0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
    0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

const H0: [u32; 8] = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

/// Incremental SHA-256 hasher.
#[derive(Clone)]
pub struct Sha256 {
    h: [u32; 8],
    buf: [u8; 64],
    buf_len: usize,
    total: u64,
}

impl Default for Sha256 {
    fn default() -> Self {
        Self::new()
    }
}

impl Sha256 {
    /// A fresh hasher.
    pub fn new() -> Self {
        Sha256 { h: H0, buf: [0; 64], buf_len: 0, total: 0 }
    }

    /// Feed bytes.
    pub fn update(&mut self, data: &[u8]) -> &mut Self {
        let mut data = data;
        self.total += data.len() as u64;
        if self.buf_len > 0 {
            let take = (64 - self.buf_len).min(data.len());
            self.buf[self.buf_len..self.buf_len + take].copy_from_slice(&data[..take]);
            self.buf_len += take;
            data = &data[take..];
            if self.buf_len < 64 {
                return self;
            }
            let block = self.buf;
            compress(&mut self.h, &block);
            self.buf_len = 0;
        }
        let mut blocks = data.chunks_exact(64);
        for block in &mut blocks {
            compress(&mut self.h, block.try_into().expect("64 bytes"));
        }
        let rest = blocks.remainder();
        self.buf[..rest.len()].copy_from_slice(rest);
        self.buf_len = rest.len();
        self
    }

    /// Feed the little-endian IEEE-754 bytes of the values.
    pub fn update_f64(&mut self, values: &[f64]) -> &mut Self {
        let mut tmp = [0u8; 512];
        for chunk in values.chunks(64) {
            for (j, v) in chunk.iter().enumerate() {
                tmp[8 * j..8 * j + 8].copy_from_slice(&v.to_le_bytes());
            }
            self.update(&tmp[..8 * chunk.len()]);
        }
        self
    }

    /// Finish and return the 32-byte digest.
    pub fn digest(mut self) -> [u8; 32] {
        let bits = self.total.wrapping_mul(8);
        let pad_len = (if self.buf_len < 56 { 56 } else { 120 }) - self.buf_len + 8;
        let mut pad = [0u8; 128];
        pad[0] = 0x80;
        pad[pad_len - 8..pad_len].copy_from_slice(&bits.to_be_bytes());
        self.update(&pad[..pad_len]);
        let mut out = [0u8; 32];
        for i in 0..8 {
            out[4 * i..4 * i + 4].copy_from_slice(&self.h[i].to_be_bytes());
        }
        out
    }

    /// Finish and return the digest as lowercase hex.
    pub fn digest_hex(self) -> String {
        to_hex(&self.digest())
    }
}

/// The SHA-256 compression function on one 64-byte block (rounds unrolled by a macro).
#[inline]
fn compress(state: &mut [u32; 8], b: &[u8; 64]) {
    let mut w = [0u32; 64];
    for (i, c) in b.chunks_exact(4).enumerate() {
        w[i] = u32::from_be_bytes([c[0], c[1], c[2], c[3]]);
    }
    for i in 16..64 {
        let x = w[i - 15];
        let y = w[i - 2];
        let s0 = x.rotate_right(7) ^ x.rotate_right(18) ^ (x >> 3);
        let s1 = y.rotate_right(17) ^ y.rotate_right(19) ^ (y >> 10);
        w[i] = w[i - 16].wrapping_add(s0).wrapping_add(w[i - 7]).wrapping_add(s1);
    }
    let [mut a, mut b_, mut c, mut d, mut e, mut f, mut g, mut h] = *state;
    macro_rules! round {
        ($a:ident, $b:ident, $c:ident, $d:ident, $e:ident, $f:ident, $g:ident, $h:ident, $i:expr) => {
            let s1 = $e.rotate_right(6) ^ $e.rotate_right(11) ^ $e.rotate_right(25);
            let ch = ($e & $f) ^ (!$e & $g);
            let t1 = $h.wrapping_add(s1).wrapping_add(ch).wrapping_add(K[$i]).wrapping_add(w[$i]);
            let s0 = $a.rotate_right(2) ^ $a.rotate_right(13) ^ $a.rotate_right(22);
            let maj = ($a & $b) ^ ($a & $c) ^ ($b & $c);
            $d = $d.wrapping_add(t1);
            $h = t1.wrapping_add(s0.wrapping_add(maj));
        };
    }
    let mut i = 0;
    while i < 64 {
        round!(a, b_, c, d, e, f, g, h, i);
        round!(h, a, b_, c, d, e, f, g, i + 1);
        round!(g, h, a, b_, c, d, e, f, i + 2);
        round!(f, g, h, a, b_, c, d, e, i + 3);
        round!(e, f, g, h, a, b_, c, d, i + 4);
        round!(d, e, f, g, h, a, b_, c, i + 5);
        round!(c, d, e, f, g, h, a, b_, i + 6);
        round!(b_, c, d, e, f, g, h, a, i + 7);
        i += 8;
    }
    state[0] = state[0].wrapping_add(a);
    state[1] = state[1].wrapping_add(b_);
    state[2] = state[2].wrapping_add(c);
    state[3] = state[3].wrapping_add(d);
    state[4] = state[4].wrapping_add(e);
    state[5] = state[5].wrapping_add(f);
    state[6] = state[6].wrapping_add(g);
    state[7] = state[7].wrapping_add(h);
}

/// Lowercase hex of bytes.
pub fn to_hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push(HEX[(b >> 4) as usize] as char);
        s.push(HEX[(b & 15) as usize] as char);
    }
    s
}

/// SHA-256 of the bytes as lowercase hex.
pub fn sha256_hex(data: &[u8]) -> String {
    let mut h = Sha256::new();
    h.update(data);
    h.digest_hex()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_vectors() {
        assert_eq!(sha256_hex(b""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
        assert_eq!(sha256_hex(b"abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
        let long = vec![b'a'; 1000];
        let mut h = Sha256::new();
        for c in long.chunks(7) {
            h.update(c);
        }
        assert_eq!(h.digest_hex(), sha256_hex(&long));
    }
}
