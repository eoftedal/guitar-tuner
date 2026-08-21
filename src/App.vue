<script setup lang="ts">
import { computed, ref } from 'vue'
import MeterPanel from './components/MeterPanel.vue'
import StringBay from './components/StringBay.vue'
import { useTuner } from './composables/useTuner'
import {
  STANDARD_TUNING,
  describeFrequency,
  foldedCents,
  nearestString,
  type GuitarString,
} from './lib/notes'

const { status, errorMessage, frequency, level, start, stop } = useTuner()

const selected = ref<GuitarString>(STANDARD_TUNING[0])

const listening = computed(() => status.value === 'listening')
const ringing = computed(() => listening.value && frequency.value !== null)

const detected = computed(() =>
  frequency.value === null ? null : describeFrequency(frequency.value),
)

/** Offset from the string being tuned, octave-folded so harmonics still read. */
const cents = computed(() =>
  frequency.value === null ? null : foldedCents(frequency.value, selected.value.frequency),
)

/** Set when what's sounding is clearly a different open string. */
const heard = computed(() => {
  if (frequency.value === null) return null
  const near = nearestString(frequency.value, STANDARD_TUNING, 120)
  return near && near.number !== selected.value.number ? near : null
})

const ORDINALS = ['', '1st', '2nd', '3rd', '4th', '5th', '6th']

const statusLine = computed(() => {
  switch (status.value) {
    case 'idle':
      return 'Press listen, then allow microphone access.'
    case 'starting':
      return 'Opening the microphone…'
    case 'denied':
    case 'unsupported':
    case 'error':
      return errorMessage.value
    default:
      if (heard.value) {
        return `That sounds like the ${ORDINALS[heard.value.number]} string — ${heard.value.note}${heard.value.octave}.`
      }
      if (frequency.value === null) {
        return `Pluck the ${ORDINALS[selected.value.number]} string, open.`
      }
      return `Reading ${detected.value?.name}${detected.value?.octave} — turn the peg slowly.`
  }
})

const faulted = computed(() =>
  status.value === 'denied' || status.value === 'error' || status.value === 'unsupported',
)

const segments = Array.from({ length: 14 }, (_, index) => index)

function toggle() {
  if (listening.value || status.value === 'starting') stop()
  else void start()
}
</script>

<template>
  <div class="shell">
    <div class="panel">
      <span class="screw screw--tl" aria-hidden="true" />
      <span class="screw screw--tr" aria-hidden="true" />
      <span class="screw screw--bl" aria-hidden="true" />
      <span class="screw screw--br" aria-hidden="true" />

      <header class="plate">
        <div class="plate__mark">
          <h1 class="plate__name">Six String</h1>
          <p class="plate__model">Model 6 · chromatic read · A=440</p>
        </div>

        <div class="plate__controls">
          <div
            class="ladder"
            role="meter"
            aria-label="Input level"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-valuenow="Math.round(level * 100)"
          >
            <span
              v-for="index in segments"
              :key="index"
              class="ladder__seg"
              :class="{
                'is-lit': listening && level * segments.length > index,
                'is-peak': index > 10,
              }"
            />
            <span class="ladder__label">input</span>
          </div>

          <button
            type="button"
            class="power"
            :class="{ 'is-live': listening, 'is-busy': status === 'starting' }"
            :aria-pressed="listening"
            @click="toggle"
          >
            <span class="power__lamp" />
            <span class="power__label">{{ listening ? 'Stop' : 'Listen' }}</span>
          </button>
        </div>
      </header>

      <div class="panel__body">
        <StringBay
          :strings="STANDARD_TUNING"
          :selected="selected"
          :heard="heard"
          :ringing="ringing"
          @select="selected = $event"
        />

        <MeterPanel
          :cents="cents"
          :detected="detected"
          :frequency="frequency"
          :target="selected"
          :listening="listening"
        />
      </div>

      <footer class="footer">
        <p class="footer__status" :class="{ 'is-fault': faulted }" aria-live="polite">
          {{ statusLine }}
        </p>
        <p class="footer__print">Audio never leaves this device.</p>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.shell {
  width: min(1080px, 100%);
  margin: 0 auto;
  padding: clamp(1rem, 4vw, 3.5rem) clamp(0.75rem, 3vw, 2rem);
  padding-left: max(clamp(0.75rem, 3vw, 2rem), env(safe-area-inset-left));
  padding-right: max(clamp(0.75rem, 3vw, 2rem), env(safe-area-inset-right));
  padding-bottom: max(clamp(1rem, 4vw, 3.5rem), env(safe-area-inset-bottom));
}

/* The device: a lacquered metal enclosure with a brushed grain. */
.panel {
  position: relative;
  padding: clamp(1.25rem, 3.4vw, 2.25rem);
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background:
    repeating-linear-gradient(
      90deg,
      rgba(255, 255, 255, 0.014) 0 1px,
      transparent 1px 3px
    ),
    linear-gradient(168deg, #26221d 0%, #191612 46%, #221e19 100%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.09),
    inset 0 -1px 0 rgba(0, 0, 0, 0.6),
    0 40px 80px -40px rgba(0, 0, 0, 0.95),
    0 2px 0 rgba(0, 0, 0, 0.5);
}

.screw {
  position: absolute;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: radial-gradient(circle at 34% 30%, #8a7c68, #38312a 70%);
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.6), 0 1px 2px rgba(255, 255, 255, 0.05);
}
.screw::after {
  content: '';
  position: absolute;
  inset: 45% 22%;
  border-radius: 1px;
  background: rgba(0, 0, 0, 0.62);
}
.screw--tl {
  top: 12px;
  left: 12px;
}
.screw--tr {
  top: 12px;
  right: 12px;
}
.screw--tr::after {
  transform: rotate(58deg);
}
.screw--bl {
  bottom: 12px;
  left: 12px;
}
.screw--bl::after {
  transform: rotate(112deg);
}
.screw--br {
  bottom: 12px;
  right: 12px;
}
.screw--br::after {
  transform: rotate(24deg);
}

/* --- brand plate --- */
.plate {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem 1.5rem;
  padding-bottom: clamp(0.9rem, 2.4vw, 1.4rem);
  border-bottom: 1px solid var(--rule);
}

.plate__name {
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(1.9rem, 6vw, 2.9rem);
  font-style: italic;
  font-weight: 400;
  line-height: 0.95;
  letter-spacing: -0.015em;
  color: var(--ink);
}

.plate__model {
  margin: 0.45rem 0 0;
  font-family: var(--font-panel);
  font-size: 0.62rem;
  font-weight: 600;
  letter-spacing: 0.34em;
  text-transform: uppercase;
  color: var(--ink-faint);
}

.plate__controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem clamp(0.9rem, 3vw, 1.75rem);
}

/* --- input level ladder --- */
.ladder {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  align-items: center;
  gap: 3px;
}

.ladder__seg {
  flex: 0 1 3px;
  min-width: 2px;
  height: 16px;
  border-radius: 1px;
  background: rgba(240, 231, 214, 0.09);
  transition: background 90ms linear, box-shadow 90ms linear;
}
.ladder__seg.is-lit {
  background: var(--green);
  box-shadow: 0 0 7px rgba(126, 196, 92, 0.6);
}
.ladder__seg.is-peak.is-lit {
  background: var(--red);
  box-shadow: 0 0 7px rgba(200, 64, 44, 0.65);
}

.ladder__label {
  margin-left: 0.5rem;
  font-family: var(--font-panel);
  font-size: 0.56rem;
  font-weight: 600;
  letter-spacing: 0.26em;
  text-transform: uppercase;
  color: var(--ink-faint);
}

/* --- power button --- */
.power {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  min-height: 44px;
  padding: 0.72rem 1.3rem;
  border: 1px solid rgba(0, 0, 0, 0.65);
  border-radius: 999px;
  cursor: pointer;
  font-family: var(--font-panel);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--ink);
  background: linear-gradient(180deg, #3a332b, #221d18);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.14),
    0 3px 0 rgba(0, 0, 0, 0.55),
    0 10px 20px -12px rgba(0, 0, 0, 0.9);
  transition: transform 90ms ease, box-shadow 90ms ease, background 220ms ease;
}
.power:hover {
  background: linear-gradient(180deg, #443c32, #262019);
}
.power:active {
  transform: translateY(2px);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 1px 0 rgba(0, 0, 0, 0.55);
}
.power:focus-visible {
  outline: 2px solid var(--amber);
  outline-offset: 3px;
}
.power.is-live {
  background: linear-gradient(180deg, #4a3520, #2b1d11);
}

.power__lamp {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #4a4038;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.7);
  transition: background 200ms ease, box-shadow 200ms ease;
}
.power.is-live .power__lamp {
  background: var(--red);
  box-shadow: 0 0 10px rgba(200, 64, 44, 0.85), inset 0 0 0 1px rgba(0, 0, 0, 0.4);
}
.power.is-busy .power__lamp {
  background: var(--brass);
  animation: blink 0.6s steps(2, end) infinite;
}

@keyframes blink {
  50% {
    opacity: 0.25;
  }
}

/* --- layout --- */
.panel__body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr);
  gap: clamp(1.25rem, 4vw, 2.75rem);
  padding: clamp(1.25rem, 3.5vw, 2rem) 0;
}

@media (max-width: 820px) {
  .panel__body {
    grid-template-columns: minmax(0, 1fr);
  }
  /* On a phone the meter is what you stare at, so it leads. */
  .panel__body > :first-child {
    order: 2;
  }
}

/* --- footer --- */
.footer {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem 1.5rem;
  padding-top: clamp(0.9rem, 2.4vw, 1.3rem);
  border-top: 1px solid var(--rule);
}

.footer__status {
  margin: 0;
  font-family: var(--font-panel);
  font-size: 0.8rem;
  letter-spacing: 0.02em;
  color: var(--ink-dim);
}
.footer__status.is-fault {
  color: var(--red);
}

.footer__print {
  margin: 0;
  font-family: var(--font-panel);
  font-size: 0.58rem;
  font-weight: 600;
  letter-spacing: 0.26em;
  text-transform: uppercase;
  color: var(--ink-faint);
}
</style>
