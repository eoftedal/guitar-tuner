/** Note maths in equal temperament, plus the six open strings of a guitar. */

export const A4_MIDI = 69
export const A4_FREQUENCY = 440

const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'] as const

export interface GuitarString {
  /** As printed on chord charts: 1 is the thinnest (high E), 6 the thickest. */
  number: number
  note: string
  octave: number
  midi: number
  frequency: number
  /** The bottom three are wound; the top three are plain steel. */
  wound: boolean
  /** Relative thickness, used to draw the string. */
  gauge: number
}

export interface NoteReading {
  name: string
  octave: number
  midi: number
  /** How far the frequency sits from the nearest note, -50..50 cents. */
  cents: number
}

export function midiToFrequency(midi: number, a4 = A4_FREQUENCY): number {
  return a4 * Math.pow(2, (midi - A4_MIDI) / 12)
}

export function frequencyToMidi(frequency: number, a4 = A4_FREQUENCY): number {
  return A4_MIDI + 12 * Math.log2(frequency / a4)
}

/** Signed distance in cents. Positive means `frequency` is sharp of `reference`. */
export function centsBetween(frequency: number, reference: number): number {
  return 1200 * Math.log2(frequency / reference)
}

/**
 * Cents from `reference`, folded into ±600.
 *
 * Harmonics and octave slips are the most common way a reading goes wrong, and
 * a string that reads exactly one octave high is still telling you it is in
 * tune — so fold rather than send the needle off the scale.
 */
export function foldedCents(frequency: number, reference: number): number {
  const raw = centsBetween(frequency, reference)
  return raw - 1200 * Math.round(raw / 1200)
}

/** Nearest equal-tempered note to a frequency, and the offset from it. */
export function describeFrequency(frequency: number, a4 = A4_FREQUENCY): NoteReading {
  const exact = frequencyToMidi(frequency, a4)
  const midi = Math.round(exact)
  return {
    name: NOTE_NAMES[((midi % 12) + 12) % 12],
    octave: Math.floor(midi / 12) - 1,
    midi,
    cents: (exact - midi) * 100,
  }
}

function string(number: number, midi: number, wound: boolean, gauge: number): GuitarString {
  const reading = describeFrequency(midiToFrequency(midi))
  return {
    number,
    note: reading.name,
    octave: reading.octave,
    midi,
    frequency: midiToFrequency(midi),
    wound,
    gauge,
  }
}

/** Standard tuning, thickest string first: E2 A2 D3 G3 B3 E4. */
export const STANDARD_TUNING: readonly GuitarString[] = [
  string(6, 40, true, 1),
  string(5, 45, true, 0.82),
  string(4, 50, true, 0.66),
  string(3, 55, false, 0.5),
  string(2, 59, false, 0.38),
  string(1, 64, false, 0.28),
]

/** The open string a frequency is closest to, or null if nothing is near. */
export function nearestString(
  frequency: number,
  strings: readonly GuitarString[] = STANDARD_TUNING,
  toleranceCents = 200,
): GuitarString | null {
  let best: GuitarString | null = null
  let bestDistance = Infinity
  for (const candidate of strings) {
    const distance = Math.abs(centsBetween(frequency, candidate.frequency))
    if (distance < bestDistance) {
      bestDistance = distance
      best = candidate
    }
  }
  return bestDistance <= toleranceCents ? best : null
}
