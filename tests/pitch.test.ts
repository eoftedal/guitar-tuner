import { describe, expect, it } from 'vitest'
import { detectPitch, downsample, rms } from '../src/lib/pitch'
import { STANDARD_TUNING, centsBetween } from '../src/lib/notes'

/** The rate the tuner actually analyses at, after decimating the mic input. */
const RATE = 12000
/** One analysis window: 4096 samples at 48 kHz, decimated by 4. */
const WINDOW = 1024

/**
 * A plucked string is a stack of harmonics, not a sine. `partials` gives the
 * amplitude of each harmonic starting at the fundamental.
 */
function pluck(frequency: number, partials: number[], length = WINDOW, rate = RATE): Float32Array {
  const samples = new Float32Array(length)
  for (let i = 0; i < length; i++) {
    let value = 0
    for (let h = 0; h < partials.length; h++) {
      const phase = (2 * Math.PI * frequency * (h + 1) * i) / rate + h * 0.83
      value += partials[h] * Math.sin(phase)
    }
    samples[i] = value
  }
  const peak = Math.max(...samples, -Math.min(...samples))
  for (let i = 0; i < length; i++) samples[i] = (samples[i] / peak) * 0.7
  return samples
}

describe('detectPitch', () => {
  it('finds a pure tone to within a cent', () => {
    const result = detectPitch(pluck(220, [1]), RATE)
    expect(result).not.toBeNull()
    expect(Math.abs(centsBetween(result!.frequency, 220))).toBeLessThan(1)
    expect(result!.clarity).toBeGreaterThan(0.95)
  })

  it.each(STANDARD_TUNING.map((string) => [`${string.note}${string.octave}`, string.frequency]))(
    'tracks the open %s string (%f Hz) to within 2 cents',
    (_name, frequency) => {
      const result = detectPitch(pluck(frequency as number, [1, 0.55, 0.32, 0.18, 0.1]), RATE)
      expect(result).not.toBeNull()
      expect(Math.abs(centsBetween(result!.frequency, frequency as number))).toBeLessThan(2)
    },
  )

  it('does not jump an octave when the second harmonic dominates', () => {
    // Typical of a plucked low E near the bridge: the octave is the loudest partial.
    const result = detectPitch(pluck(82.41, [0.35, 1, 0.6, 0.4, 0.25]), RATE)
    expect(result).not.toBeNull()
    expect(Math.abs(centsBetween(result!.frequency, 82.41))).toBeLessThan(3)
  })

  it('resolves a string that is audibly flat', () => {
    const flat = 82.41 * Math.pow(2, -18 / 1200)
    const result = detectPitch(pluck(flat, [1, 0.5, 0.25]), RATE)
    expect(result).not.toBeNull()
    expect(centsBetween(result!.frequency, 82.41)).toBeCloseTo(-18, 0)
  })

  it('reports nothing for silence or noise', () => {
    expect(detectPitch(new Float32Array(WINDOW), RATE)).toBeNull()

    const noise = new Float32Array(WINDOW)
    let seed = 7
    for (let i = 0; i < WINDOW; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      noise[i] = (seed / 0x3fffffff - 1) * 0.5
    }
    expect(detectPitch(noise, RATE)).toBeNull()
  })

  it('ignores tones below the search range', () => {
    // 45 Hz never completes a period inside the longest lag we look at, so no
    // candidate is periodic enough to report.
    expect(detectPitch(pluck(45, [1]), RATE)).toBeNull()
  })
})

describe('downsample', () => {
  it('averages each group of samples', () => {
    const input = Float32Array.from([0, 2, 4, 6, 8, 10, 12, 14])
    expect([...downsample(input, 4)]).toEqual([3, 11])
  })

  it('preserves pitch through decimation', () => {
    const original = pluck(196, [1, 0.5], WINDOW * 4, RATE * 4)
    const result = detectPitch(downsample(original, 4), RATE)
    expect(result).not.toBeNull()
    expect(Math.abs(centsBetween(result!.frequency, 196))).toBeLessThan(2)
  })

  it('measures level', () => {
    expect(rms(new Float32Array(64))).toBe(0)
    expect(rms(Float32Array.from({ length: 64 }, () => 0.5))).toBeCloseTo(0.5, 6)
  })
})
