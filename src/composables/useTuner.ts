import { onScopeDispose, ref, shallowRef } from 'vue'
import { detectPitch, downsample, rms } from '../lib/pitch'

export type TunerStatus = 'idle' | 'starting' | 'listening' | 'denied' | 'unsupported' | 'error'

/** Samples per analysis window before decimation. ~85 ms at 48 kHz. */
const FFT_SIZE = 4096
/** Decimate towards this rate; a guitar's top open string is only 330 Hz. */
const TARGET_SAMPLE_RATE = 12000
/** Drop the reading after this long without a usable pitch. */
const HOLD_MS = 800
/** Median window — long enough to kill outliers, short enough to feel live. */
const MEDIAN_WINDOW = 5

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function resolveAudioContext(): typeof AudioContext | undefined {
  if (typeof window === 'undefined') return undefined
  const legacy = (window as unknown as { webkitAudioContext?: typeof AudioContext })
    .webkitAudioContext
  return window.AudioContext ?? legacy
}

/**
 * Owns the microphone, the audio graph and the analysis loop, and exposes the
 * current pitch as reactive state.
 */
export function useTuner() {
  const status = ref<TunerStatus>('idle')
  const errorMessage = ref('')
  /** Smoothed fundamental in Hz, or null when nothing is being played. */
  const frequency = ref<number | null>(null)
  /** Periodicity of the current reading, 0..1. */
  const clarity = ref(0)
  /** Input level for the meter, 0..1. */
  const level = ref(0)

  const stream = shallowRef<MediaStream | null>(null)
  const context = shallowRef<AudioContext | null>(null)
  let frameId = 0
  let history: number[] = []
  let lastPitchAt = 0

  function handleVisibility() {
    if (document.visibilityState === 'visible' && context.value?.state === 'suspended') {
      void context.value.resume()
    }
  }

  function teardown() {
    if (frameId) cancelAnimationFrame(frameId)
    frameId = 0
    document.removeEventListener('visibilitychange', handleVisibility)
    stream.value?.getTracks().forEach((track) => track.stop())
    stream.value = null
    void context.value?.close()
    context.value = null
    history = []
    frequency.value = null
    clarity.value = 0
    level.value = 0
  }

  async function start() {
    if (status.value === 'listening' || status.value === 'starting') return

    const AudioCtx = resolveAudioContext()
    if (!navigator.mediaDevices?.getUserMedia || !AudioCtx) {
      status.value = 'unsupported'
      errorMessage.value = 'This browser has no microphone access. Try Chrome, Safari or Firefox.'
      return
    }

    status.value = 'starting'
    errorMessage.value = ''

    // iOS only unlocks audio for a context created and resumed inside the tap
    // that started it. Awaiting getUserMedia first drops us out of that gesture,
    // so open the context up front and let it warm up while permission resolves.
    const ctx = new AudioCtx()
    void ctx.resume()

    let micStream: MediaStream
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        // The browser's voice processing fights pitch detection: gain riding
        // smears the decay and noise suppression eats the fundamental.
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      })
    } catch (error) {
      void ctx.close()
      const name = error instanceof DOMException ? error.name : ''
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        status.value = 'denied'
        errorMessage.value = 'Microphone blocked. Allow it in your browser settings and try again.'
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        status.value = 'error'
        errorMessage.value = 'No microphone found.'
      } else {
        status.value = 'error'
        errorMessage.value = error instanceof Error ? error.message : 'Could not open the microphone.'
      }
      return
    }

    // Safari can still hand the context back suspended.
    if (ctx.state === 'suspended') await ctx.resume()

    const source = ctx.createMediaStreamSource(micStream)

    const highpass = ctx.createBiquadFilter()
    highpass.type = 'highpass'
    highpass.frequency.value = 55
    highpass.Q.value = 0.7

    // Two poles of low-pass so decimation has nothing left to alias down.
    const lowpassA = ctx.createBiquadFilter()
    lowpassA.type = 'lowpass'
    lowpassA.frequency.value = 1200
    lowpassA.Q.value = 0.7
    const lowpassB = ctx.createBiquadFilter()
    lowpassB.type = 'lowpass'
    lowpassB.frequency.value = 1200
    lowpassB.Q.value = 0.7

    const analyser = ctx.createAnalyser()
    analyser.fftSize = FFT_SIZE
    analyser.smoothingTimeConstant = 0

    source.connect(highpass)
    highpass.connect(lowpassA)
    lowpassA.connect(lowpassB)
    lowpassB.connect(analyser)
    // Deliberately not connected to ctx.destination — feeding the mic back to
    // the speakers is how you get a howl.

    stream.value = micStream
    context.value = ctx
    status.value = 'listening'
    document.addEventListener('visibilitychange', handleVisibility)

    const factor = Math.max(1, Math.floor(ctx.sampleRate / TARGET_SAMPLE_RATE))
    const workingRate = ctx.sampleRate / factor
    const raw = new Float32Array(analyser.fftSize)
    const decimated = new Float32Array(Math.floor(analyser.fftSize / factor))

    lastPitchAt = performance.now()

    const tick = () => {
      frameId = requestAnimationFrame(tick)
      analyser.getFloatTimeDomainData(raw)
      downsample(raw, factor, decimated)

      // Map RMS onto a decibel-ish curve so quiet playing still moves the meter.
      const loudness = rms(decimated)
      const db = 20 * Math.log10(Math.max(loudness, 1e-6))
      level.value = Math.max(0, Math.min(1, (db + 60) / 60))

      const result = detectPitch(decimated, workingRate)
      const now = performance.now()

      if (result) {
        history.push(result.frequency)
        if (history.length > MEDIAN_WINDOW) history.shift()
        frequency.value = median(history)
        clarity.value = result.clarity
        lastPitchAt = now
      } else if (now - lastPitchAt > HOLD_MS) {
        history = []
        frequency.value = null
        clarity.value = 0
      }
    }

    tick()
  }

  function stop() {
    teardown()
    status.value = 'idle'
  }

  onScopeDispose(teardown)

  return { status, errorMessage, frequency, clarity, level, start, stop }
}
