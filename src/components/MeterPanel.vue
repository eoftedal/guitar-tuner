<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { GuitarString, NoteReading } from '../lib/notes'

const props = defineProps<{
  /** Offset from the selected string in cents, or null when nothing is heard. */
  cents: number | null
  detected: NoteReading | null
  frequency: number | null
  target: GuitarString
  listening: boolean
}>()

/** Half the scale width, in cents. */
const RANGE = 50
/** The scale spans ±52°, which reads as a wide analogue sweep without crowding. */
const DEG_PER_CENT = 1.04
/** Anything inside this is close enough that no ear will hear it. */
const IN_TUNE_CENTS = 5
const SWEEP_MS = 1050

const PIVOT_X = 180
const PIVOT_Y = 236

const reduceMotion =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

const r2 = (value: number) => Math.round(value * 100) / 100

function polar(cents: number, radius: number) {
  const angle = (cents * DEG_PER_CENT * Math.PI) / 180
  return {
    x: r2(PIVOT_X + radius * Math.sin(angle)),
    y: r2(PIVOT_Y - radius * Math.cos(angle)),
  }
}

const ticks = Array.from({ length: 21 }, (_, index) => {
  const cents = -RANGE + index * 5
  const major = cents % 25 === 0
  const outer = polar(cents, 196)
  const inner = polar(cents, major ? 174 : 185)
  return { cents, major, x1: outer.x, y1: outer.y, x2: inner.x, y2: inner.y }
})

const labels = [-50, -25, 0, 25, 50].map((cents) => ({
  cents,
  text: String(Math.abs(cents)),
  ...polar(cents, 160),
}))

const stopPins = [-54, 54].map((cents) => {
  const outer = polar(cents, 197)
  const inner = polar(cents, 186)
  return { x1: outer.x, y1: outer.y, x2: inner.x, y2: inner.y }
})

const inTuneBand = (() => {
  const a = polar(-IN_TUNE_CENTS, 196)
  const b = polar(IN_TUNE_CENTS, 196)
  const c = polar(IN_TUNE_CENTS, 174)
  const d = polar(-IN_TUNE_CENTS, 174)
  return `M ${a.x} ${a.y} A 196 196 0 0 1 ${b.x} ${b.y} L ${c.x} ${c.y} A 174 174 0 0 0 ${d.x} ${d.y} Z`
})()

const scaleArc = (() => {
  const a = polar(-RANGE, 196)
  const b = polar(RANGE, 196)
  return `M ${a.x} ${a.y} A 196 196 0 0 1 ${b.x} ${b.y}`
})()

// --- needle ballistics -----------------------------------------------------
// A real meter movement has mass. Driving the needle with a damped spring gives
// it the overshoot and settle that makes the reading feel physical rather than
// like a number being redrawn.
const needle = ref(0)
let velocity = 0
let sweepUntil = 0
let lastFrame = 0
let frameId = 0

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)

/** The power-on self-test every analogue instrument does: peg both ends, settle. */
function sweepPosition(progress: number): number {
  if (progress < 0.34) return -RANGE * easeInOut(progress / 0.34)
  if (progress < 0.68) return -RANGE + 2 * RANGE * easeInOut((progress - 0.34) / 0.34)
  return RANGE * (1 - easeInOut((progress - 0.68) / 0.32))
}

function restingTarget(): number {
  if (props.cents === null) return 0
  return Math.max(-RANGE, Math.min(RANGE, props.cents))
}

function frame(now: number) {
  const dt = Math.min((now - lastFrame) / 1000, 1 / 20)
  lastFrame = now

  const sweeping = now < sweepUntil
  const target = sweeping ? sweepPosition(1 - (sweepUntil - now) / SWEEP_MS) : restingTarget()

  if (reduceMotion) {
    needle.value = target
    velocity = 0
  } else {
    const stiffness = 15
    const damping = 0.55
    velocity +=
      (stiffness * stiffness * (target - needle.value) - 2 * damping * stiffness * velocity) * dt
    needle.value += velocity * dt
  }

  // Park the loop once there is nothing left to animate. `wake()` restarts it
  // the moment a reading arrives.
  const settled = Math.abs(target - needle.value) < 0.02 && Math.abs(velocity) < 0.05
  if (!sweeping && props.cents === null && settled) {
    needle.value = target
    velocity = 0
    frameId = 0
    return
  }

  frameId = requestAnimationFrame(frame)
}

function wake() {
  if (frameId) return
  lastFrame = performance.now()
  frameId = requestAnimationFrame(frame)
}

watch(
  () => props.listening,
  (on) => {
    if (on && !reduceMotion) sweepUntil = performance.now() + SWEEP_MS
    wake()
  },
)

watch(() => props.cents, wake)

onMounted(wake)
onBeforeUnmount(() => cancelAnimationFrame(frameId))

// --- readouts --------------------------------------------------------------
const clamped = computed(() => Math.max(-58, Math.min(58, needle.value)))
const angle = computed(() => r2(clamped.value * DEG_PER_CENT))

const state = computed(() => {
  if (!props.listening || props.cents === null) return 'idle'
  if (Math.abs(props.cents) <= IN_TUNE_CENTS) return 'tuned'
  return props.cents < 0 ? 'flat' : 'sharp'
})

/** Follows the needle rather than the raw pitch, so the two never disagree. */
const shownCents = computed(() => (props.cents === null ? null : Math.round(clamped.value)))

const verdict = computed(() => {
  switch (state.value) {
    case 'tuned':
      return 'In tune'
    case 'flat':
      return 'Tune up'
    case 'sharp':
      return 'Tune down'
    default:
      return props.listening ? 'Pluck the string' : 'Standing by'
  }
})
</script>

<template>
  <section class="meter" :class="[`is-${state}`, { 'is-live': listening }]">
    <div class="meter__window">
      <svg class="dial" viewBox="0 0 360 200" role="img" :aria-label="`Tuning meter, ${verdict}`">
        <defs>
          <radialGradient id="faceGlow" cx="50%" cy="88%" r="72%">
            <stop offset="0%" class="glow-hot" />
            <stop offset="100%" class="glow-cold" />
          </radialGradient>
          <linearGradient id="glassSheen" x1="0" y1="0" x2="0.65" y2="1">
            <stop offset="0%" stop-color="#ffffff" stop-opacity="0.34" />
            <stop offset="42%" stop-color="#ffffff" stop-opacity="0.06" />
            <stop offset="43%" stop-color="#ffffff" stop-opacity="0" />
          </linearGradient>
          <linearGradient id="needleBody" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="#8f2118" />
            <stop offset="45%" stop-color="#d2402c" />
            <stop offset="100%" stop-color="#7c1a13" />
          </linearGradient>
        </defs>

        <rect x="6" y="6" width="348" height="188" rx="7" fill="url(#faceGlow)" />

        <path :d="scaleArc" class="dial__arc" />
        <path :d="inTuneBand" class="dial__band" />

        <line
          v-for="tick in ticks"
          :key="tick.cents"
          :x1="tick.x1"
          :y1="tick.y1"
          :x2="tick.x2"
          :y2="tick.y2"
          class="dial__tick"
          :class="{ 'dial__tick--major': tick.major }"
        />

        <text
          v-for="label in labels"
          :key="label.cents"
          :x="label.x"
          :y="label.y"
          class="dial__label"
          text-anchor="middle"
        >
          {{ label.text }}
        </text>

        <text x="34" y="96" class="dial__sign">♭</text>
        <text x="326" y="96" class="dial__sign">♯</text>
        <text x="20" y="182" class="dial__print">REF A=440</text>
        <text x="340" y="182" class="dial__print" text-anchor="end">CENTS</text>

        <!-- stop pins the needle would clatter against -->
        <line
          v-for="pin in stopPins"
          :key="pin.x1"
          class="dial__pin"
          :x1="pin.x1"
          :y1="pin.y1"
          :x2="pin.x2"
          :y2="pin.y2"
        />

        <g class="needle needle--shadow" :style="{ transform: `translate(5px, 7px) rotate(${angle}deg)` }">
          <polygon points="175.5,236 184.5,236 181.2,31 178.8,31" />
        </g>
        <g class="needle" :style="{ transform: `rotate(${angle}deg)` }">
          <polygon points="175.5,236 184.5,236 181.2,31 178.8,31" fill="url(#needleBody)" />
        </g>

        <rect x="6" y="6" width="348" height="188" rx="7" fill="url(#glassSheen)" pointer-events="none" />
        <rect x="6" y="6" width="348" height="188" rx="7" class="dial__frame" />
      </svg>
      <div class="meter__hood" aria-hidden="true" />
    </div>

    <div class="readout">
      <div class="lamp lamp--flat" :class="{ 'is-on': state === 'flat' }">
        <span class="lamp__bulb" />
        <span class="lamp__text">Tune up</span>
      </div>

      <div class="readout__core">
        <div class="readout__note">
          <span class="readout__letter">{{ target.note }}</span>
          <span class="readout__octave">{{ target.octave }}</span>
        </div>
        <div class="readout__hz">
          <span class="readout__hz-value">{{ frequency ? frequency.toFixed(1) : '––.–' }}</span>
          <span class="readout__hz-unit">Hz</span>
        </div>
      </div>

      <div class="lamp lamp--sharp" :class="{ 'is-on': state === 'sharp' }">
        <span class="lamp__bulb" />
        <span class="lamp__text">Tune down</span>
      </div>
    </div>

    <p class="verdict" aria-live="polite">
      <span class="verdict__word">{{ verdict }}</span>
      <span v-if="shownCents !== null" class="verdict__cents">
        {{ shownCents > 0 ? '+' : shownCents < 0 ? '−' : '±' }}{{ Math.abs(shownCents) }} cents
      </span>
      <span v-else-if="detected" class="verdict__cents">heard {{ detected.name }}{{ detected.octave }}</span>
    </p>
  </section>
</template>

<style scoped>
.meter {
  display: grid;
  gap: clamp(0.9rem, 2.4vw, 1.4rem);
}

.meter__window {
  position: relative;
  border-radius: 10px;
  padding: 10px;
  background: linear-gradient(180deg, #241f1a, #100d0b 60%, #1c1815);
  box-shadow:
    inset 0 2px 0 rgba(255, 255, 255, 0.07),
    inset 0 -2px 6px rgba(0, 0, 0, 0.7),
    0 18px 40px -22px rgba(0, 0, 0, 0.95);
}

.meter__hood {
  position: absolute;
  inset: 10px;
  border-radius: 7px;
  pointer-events: none;
  box-shadow:
    inset 0 10px 18px -10px rgba(60, 32, 10, 0.75),
    inset 0 0 0 1px rgba(0, 0, 0, 0.55);
}

.dial {
  display: block;
  width: 100%;
  height: auto;
}

/* The face is lit by a warm bulb behind it; tuning up turns the bulb green. */
.glow-hot {
  stop-color: #f3e7cd;
  transition: stop-color 420ms ease;
}
.glow-cold {
  stop-color: #d8c7a4;
  transition: stop-color 420ms ease;
}
.meter.is-live .glow-hot {
  stop-color: #fdf3d9;
}
.meter.is-tuned .glow-hot {
  stop-color: #e9f4d4;
}
.meter.is-tuned .glow-cold {
  stop-color: #c3d7a8;
}

.dial__arc {
  fill: none;
  stroke: rgba(28, 20, 12, 0.55);
  stroke-width: 1.2;
}

.dial__band {
  fill: rgba(104, 122, 62, 0.16);
  transition: fill 320ms ease;
}
.meter.is-tuned .dial__band {
  fill: rgba(86, 140, 52, 0.5);
}

.dial__tick {
  stroke: #2a2118;
  stroke-width: 1.1;
  opacity: 0.62;
}
.dial__tick--major {
  stroke-width: 2.4;
  opacity: 0.9;
}

.dial__pin {
  stroke: #6d5a42;
  stroke-width: 3.4;
  stroke-linecap: round;
}

.dial__label {
  font-family: var(--font-mono);
  font-size: 13px;
  fill: #2a2118;
  letter-spacing: 0.04em;
}

.dial__sign {
  font-family: var(--font-display);
  font-size: 26px;
  fill: #5c4a33;
  text-anchor: middle;
}

.dial__print {
  font-family: var(--font-panel);
  font-size: 7.5px;
  font-weight: 600;
  letter-spacing: 0.22em;
  fill: rgba(42, 33, 24, 0.5);
}

.dial__frame {
  fill: none;
  stroke: rgba(20, 14, 8, 0.5);
  stroke-width: 1;
}

.needle {
  transform-box: view-box;
  transform-origin: 180px 236px;
}
.needle--shadow polygon {
  fill: rgba(40, 26, 14, 0.22);
}

/* --- readout strip --- */
.readout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: clamp(0.6rem, 2vw, 1.5rem);
}

.lamp {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  font-family: var(--font-panel);
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--ink-faint);
  transition: color 200ms ease;
}
.lamp--sharp {
  justify-content: flex-end;
  flex-direction: row-reverse;
}

.lamp__bulb {
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #6b5a48, #241c15 70%);
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.7), inset 0 1px 2px rgba(255, 255, 255, 0.16);
  transition: background 160ms ease, box-shadow 160ms ease;
}

.lamp.is-on {
  color: var(--amber);
}
.lamp.is-on .lamp__bulb {
  background: radial-gradient(circle at 35% 30%, #ffd9a1, var(--amber) 55%, #8a3d09 100%);
  box-shadow:
    inset 0 0 0 1px rgba(0, 0, 0, 0.4),
    0 0 10px 1px rgba(226, 122, 34, 0.75),
    0 0 26px 4px rgba(226, 122, 34, 0.28);
  animation: pulse 1.1s ease-in-out infinite;
}

@keyframes pulse {
  50% {
    opacity: 0.72;
  }
}

.readout__core {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: baseline;
  gap: 0.15rem 0.7rem;
  padding: 0 clamp(0.4rem, 2vw, 1.1rem);
}

.readout__note {
  display: flex;
  align-items: baseline;
  color: var(--ink);
}
.readout__letter {
  font-family: var(--font-display);
  font-size: clamp(2.6rem, 9vw, 3.6rem);
  line-height: 0.85;
  letter-spacing: -0.02em;
}
.readout__octave {
  font-family: var(--font-mono);
  font-size: 0.95rem;
  color: var(--ink-faint);
  margin-left: 0.12em;
}

.readout__hz {
  font-family: var(--font-mono);
  font-size: 0.82rem;
  color: var(--ink-dim);
  white-space: nowrap;
}
.readout__hz-unit {
  color: var(--ink-faint);
  margin-left: 0.25em;
}

/* --- verdict --- */
.verdict {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  margin: 0;
  padding-top: clamp(0.6rem, 2vw, 0.9rem);
  border-top: 1px solid var(--rule);
}

.verdict__word {
  font-family: var(--font-panel);
  font-size: clamp(0.95rem, 3.4vw, 1.15rem);
  font-weight: 700;
  letter-spacing: 0.26em;
  text-transform: uppercase;
  color: var(--ink-dim);
  transition: color 220ms ease, text-shadow 220ms ease;
}
.meter.is-flat .verdict__word,
.meter.is-sharp .verdict__word {
  color: var(--amber);
}
.meter.is-tuned .verdict__word {
  color: var(--green);
  text-shadow: 0 0 22px rgba(126, 196, 92, 0.45);
}

.verdict__cents {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  letter-spacing: 0.08em;
  color: var(--ink-faint);
  font-variant-numeric: tabular-nums;
}

@media (max-width: 480px) {
  .lamp__text {
    display: none;
  }
  .lamp--flat {
    justify-content: flex-start;
  }
  .lamp--sharp {
    justify-content: flex-end;
  }
}
</style>
