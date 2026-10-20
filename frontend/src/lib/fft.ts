/**
 * Minimal iterative radix-2 Cooley-Tukey FFT for the lab view's frequency-domain plot
 * (section 7: "a frequency-domain view"). Real input is zero-padded up to the next power
 * of 2 — a standard, simple approach; no windowing function applied (a rectangular window),
 * which is a known simplification (spectral leakage) documented here rather than silently
 * assumed away, same spirit as backend/data/README.md's fs/decimation caveats.
 */

function nextPow2(n: number): number {
  let p = 1
  while (p < n) p *= 2
  return p
}

/** In-place iterative radix-2 FFT. re/im are modified. Length must be a power of 2. */
function fftInPlace(re: Float64Array, im: Float64Array): void {
  const n = re.length
  // bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j], re[i]]
      ;[im[i], im[j]] = [im[j], im[i]]
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    const wRe = Math.cos(ang)
    const wIm = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let curRe = 1
      let curIm = 0
      for (let k = 0; k < len / 2; k++) {
        const uRe = re[i + k]
        const uIm = im[i + k]
        const vRe = re[i + k + len / 2] * curRe - im[i + k + len / 2] * curIm
        const vIm = re[i + k + len / 2] * curIm + im[i + k + len / 2] * curRe
        re[i + k] = uRe + vRe
        im[i + k] = uIm + vIm
        re[i + k + len / 2] = uRe - vRe
        im[i + k + len / 2] = uIm - vIm
        const nextRe = curRe * wRe - curIm * wIm
        const nextIm = curRe * wIm + curIm * wRe
        curRe = nextRe
        curIm = nextIm
      }
    }
  }
}

/**
 * Returns { freqs, magnitudes } for the one-sided spectrum of a real signal sampled at
 * fs_hz. Magnitudes are normalized by N so amplitude is comparable across window lengths.
 */
export function realSpectrum(signal: number[], fsHz: number): { freqs: number[]; magnitudes: number[] } {
  const n = nextPow2(signal.length)
  const re = new Float64Array(n)
  const im = new Float64Array(n)
  const mean = signal.reduce((a, b) => a + b, 0) / signal.length
  for (let i = 0; i < signal.length; i++) re[i] = signal[i] - mean // remove DC for readability
  fftInPlace(re, im)

  const half = n / 2
  const freqs: number[] = new Array(half)
  const magnitudes: number[] = new Array(half)
  for (let i = 0; i < half; i++) {
    freqs[i] = (i * fsHz) / n
    magnitudes[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]) / n
  }
  return { freqs, magnitudes }
}
