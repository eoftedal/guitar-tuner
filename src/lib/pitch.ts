/**
 * Monophonic pitch detection using the McLeod Pitch Method (MPM).
 *
 * MPM builds a Normalised Square Difference Function (NSDF) and picks the first
 * peak that is "nearly as good" as the best one, which is what makes it resist
 * the octave errors plain autocorrelation makes on plucked strings — a guitar's
 * second harmonic is often louder than its fundamental.
 */

export interface PitchResult {
  /** Estimated fundamental in Hz. */
  frequency: number
  /** How periodic the window was, 0..1. Below ~0.8 is usually noise or decay. */
  clarity: number
}

export interface PitchOptions {
  /** Lowest fundamental to look for. Default 60 Hz (below a drop-D low E). */
  minFrequency?: number
  /** Highest fundamental to look for. Default 1300 Hz. */
  maxFrequency?: number
  /** Reject results less periodic than this. Default 0.8. */
  clarityThreshold?: number
  /** Reject windows quieter than this RMS. Default 0.004. */
  rmsThreshold?: number
}

/** Root mean square amplitude of a buffer, 0..1 for normalised audio. */
export function rms(samples: Float32Array): number {
  if (samples.length === 0) return 0
  let sum = 0
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i]
  return Math.sqrt(sum / samples.length)
}

/**
 * Decimate by an integer factor, averaging each group of samples.
 *
 * The box average is a crude low-pass that stacks on top of the filters in the
 * audio graph, and dropping 48 kHz to ~12 kHz cuts the correlation work by 16x
 * while keeping far more resolution than a guitar's ~330 Hz top note needs.
 */
export function downsample(
  input: Float32Array,
  factor: number,
  out: Float32Array = new Float32Array(Math.floor(input.length / factor)),
): Float32Array {
  if (factor <= 1) {
    out.set(input.subarray(0, out.length))
    return out
  }
  for (let i = 0; i < out.length; i++) {
    let sum = 0
    const base = i * factor
    for (let j = 0; j < factor; j++) sum += input[base + j]
    out[i] = sum / factor
  }
  return out
}

export function detectPitch(
  samples: Float32Array,
  sampleRate: number,
  options: PitchOptions = {},
): PitchResult | null {
  const {
    minFrequency = 60,
    maxFrequency = 1300,
    clarityThreshold = 0.8,
    rmsThreshold = 0.004,
  } = options

  const size = samples.length
  if (rms(samples) < rmsThreshold) return null

  const minTau = Math.max(2, Math.floor(sampleRate / maxFrequency))
  const maxTau = Math.min(size - 1, Math.ceil(sampleRate / minFrequency))
  if (maxTau <= minTau + 1) return null

  // NSDF: n(tau) = 2 * sum(x[i] * x[i+tau]) / sum(x[i]^2 + x[i+tau]^2), which is
  // 1.0 for a perfectly periodic window and self-normalising against decay.
  const nsdf = new Float32Array(maxTau + 1)
  for (let tau = minTau; tau <= maxTau; tau++) {
    let correlation = 0
    let energy = 0
    for (let i = 0, n = size - tau; i < n; i++) {
      const a = samples[i]
      const b = samples[i + tau]
      correlation += a * b
      energy += a * a + b * b
    }
    nsdf[tau] = energy > 0 ? (2 * correlation) / energy : 0
  }

  // Skip the main lobe hanging off tau = 0, then take the highest point of each
  // positive run — those are the period candidates.
  let tau = minTau
  while (tau <= maxTau && nsdf[tau] > 0) tau++
  if (tau > maxTau) return null

  const peaks: number[] = []
  let bestValue = -1
  while (tau <= maxTau) {
    if (nsdf[tau] <= 0) {
      tau++
      continue
    }
    let peak = tau
    while (tau <= maxTau && nsdf[tau] > 0) {
      if (nsdf[tau] > nsdf[peak]) peak = tau
      tau++
    }
    peaks.push(peak)
    if (nsdf[peak] > bestValue) bestValue = nsdf[peak]
  }

  if (peaks.length === 0 || bestValue < clarityThreshold) return null

  // The octave-error guard: prefer the *earliest* peak within 10% of the best
  // rather than the tallest, so a strong second harmonic doesn't win.
  const cutoff = 0.9 * bestValue
  let chosen = peaks[0]
  for (const candidate of peaks) {
    if (nsdf[candidate] >= cutoff) {
      chosen = candidate
      break
    }
  }

  // Parabolic interpolation through the peak and its neighbours: a period is
  // rarely a whole number of samples, and 1 sample at 12 kHz is ~15 cents on a
  // low E — far too coarse to tune by.
  let period = chosen
  let clarity = nsdf[chosen]
  if (chosen > minTau && chosen < maxTau) {
    const left = nsdf[chosen - 1]
    const mid = nsdf[chosen]
    const right = nsdf[chosen + 1]
    const curvature = left - 2 * mid + right
    if (curvature !== 0) {
      const shift = (left - right) / (2 * curvature)
      if (Math.abs(shift) <= 1) {
        period = chosen + shift
        clarity = mid - 0.25 * (left - right) * shift
      }
    }
  }

  const frequency = sampleRate / period
  if (frequency < minFrequency || frequency > maxFrequency) return null

  return { frequency, clarity: Math.max(0, Math.min(1, clarity)) }
}
