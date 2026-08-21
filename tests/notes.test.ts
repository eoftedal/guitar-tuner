import { describe, expect, it } from 'vitest'
import {
  STANDARD_TUNING,
  centsBetween,
  describeFrequency,
  foldedCents,
  frequencyToMidi,
  midiToFrequency,
  nearestString,
} from '../src/lib/notes'

describe('note maths', () => {
  it('anchors on A4 = 440 Hz', () => {
    expect(midiToFrequency(69)).toBe(440)
    expect(frequencyToMidi(440)).toBe(69)
  })

  it('measures cents symmetrically', () => {
    expect(centsBetween(440 * Math.pow(2, 1 / 12), 440)).toBeCloseTo(100, 6)
    expect(centsBetween(220, 440)).toBeCloseTo(-1200, 6)
  })

  it('folds octave slips back onto the scale', () => {
    // A harmonic an octave up is still telling you the string is in tune.
    expect(foldedCents(82.41 * 2, 82.41)).toBeCloseTo(0, 6)
    expect(foldedCents(82.41 * 4, 82.41)).toBeCloseTo(0, 6)
    // A genuinely different string stays off the scale: E to A is 500 cents.
    expect(foldedCents(midiToFrequency(45), midiToFrequency(40))).toBeCloseTo(500, 6)
  })

  it('names the nearest note and the offset from it', () => {
    expect(describeFrequency(440)).toMatchObject({ name: 'A', octave: 4, midi: 69 })
    expect(describeFrequency(440).cents).toBeCloseTo(0, 6)

    const sharp = describeFrequency(443)
    expect(sharp.name).toBe('A')
    expect(sharp.cents).toBeCloseTo(11.76, 1)

    expect(describeFrequency(82.41)).toMatchObject({ name: 'E', octave: 2 })
    expect(describeFrequency(311.13)).toMatchObject({ name: 'D♯', octave: 4 })
  })
})

describe('standard tuning', () => {
  it('matches the published open string frequencies', () => {
    const frequencies = STANDARD_TUNING.map((string) =>
      Number(string.frequency.toFixed(2)),
    )
    expect(frequencies).toEqual([82.41, 110, 146.83, 196, 246.94, 329.63])
  })

  it('runs from the 6th string to the 1st, with the low three wound', () => {
    expect(STANDARD_TUNING.map((string) => string.number)).toEqual([6, 5, 4, 3, 2, 1])
    expect(STANDARD_TUNING.map((string) => string.note)).toEqual(['E', 'A', 'D', 'G', 'B', 'E'])
    expect(STANDARD_TUNING.filter((string) => string.wound).map((s) => s.number)).toEqual([6, 5, 4])
  })

  it('identifies which string is sounding', () => {
    expect(nearestString(112)?.number).toBe(5)
    expect(nearestString(330)?.number).toBe(1)
    // A whole tone off any open string is nobody's idea of "near".
    expect(nearestString(123, STANDARD_TUNING, 120)).toBeNull()
  })
})
