<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import type { GuitarString } from '../lib/notes'

const props = defineProps<{
  strings: readonly GuitarString[]
  selected: GuitarString
  /** The string currently being heard, if it isn't the selected one. */
  heard: GuitarString | null
  /** True while a note is actually sounding — the selected string vibrates. */
  ringing: boolean
}>()

const emit = defineEmits<{ select: [value: GuitarString] }>()

/** Tab order: thinnest string on top, the way a chord chart is drawn. */
const rows = computed(() => [...props.strings].reverse())

/** Wound strings are drawn thicker, and the low E noticeably so. */
const thickness = (gauge: number) => 1.6 + gauge * 4.2

// A radio group is expected to move with the arrow keys, with only the checked
// option in the tab order.
const buttons = ref<(HTMLButtonElement | null)[]>([])

function setButton(el: unknown, index: number) {
  buttons.value[index] = el instanceof HTMLButtonElement ? el : null
}

function onKeydown(event: KeyboardEvent) {
  const step = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 }[event.key]
  if (step === undefined) return
  event.preventDefault()

  const order = rows.value
  const current = order.findIndex((string) => string.number === props.selected.number)
  const nextIndex = (current + step + order.length) % order.length
  emit('select', order[nextIndex])
  void nextTick(() => buttons.value[nextIndex]?.focus())
}
</script>

<template>
  <section class="bay">
    <h2 class="bay__title">
      <span>Select string</span>
      <span class="bay__hint">standard · E A D G B E</span>
    </h2>

    <div class="bay__board">
      <div class="bay__nut" aria-hidden="true" />

      <ul class="bay__list" role="radiogroup" aria-label="Guitar string" @keydown="onKeydown">
        <li v-for="(string, index) in rows" :key="string.number">
          <button
            :ref="(el) => setButton(el, index)"
            type="button"
            role="radio"
            :tabindex="string.number === selected.number ? 0 : -1"
            class="string"
            :class="{
              'is-selected': string.number === selected.number,
              'is-ringing': ringing && string.number === selected.number,
              'is-heard': heard?.number === string.number,
            }"
            :aria-checked="string.number === selected.number"
            @click="emit('select', string)"
          >
            <span class="string__peg" aria-hidden="true">{{ string.number }}</span>

            <span class="string__note">
              <span class="string__letter">{{ string.note }}</span>
              <span class="string__octave">{{ string.octave }}</span>
            </span>

            <span class="string__wire-track">
              <span
                class="string__wire"
                :class="{ 'string__wire--wound': string.wound }"
                :style="{ height: `${thickness(string.gauge)}px` }"
              />
            </span>

            <span class="string__hz">{{ string.frequency.toFixed(2) }}</span>
            <span class="sr-only">
              String {{ string.number }}, {{ string.note }}{{ string.octave }}
            </span>
          </button>
        </li>
      </ul>

      <div class="bay__bridge" aria-hidden="true" />
    </div>
  </section>
</template>

<style scoped>
.bay {
  --peg: 2.1rem;
  --note: 2.6rem;
  --hz: 3.4rem;
  --gap: 0.75rem;
  --pad: 0.55rem;
  /* Where the wire column begins and ends, so the nut and bridge land on it. */
  --wire-start: calc(var(--pad) + var(--peg) + var(--note) + var(--gap) * 2);
  --wire-end: calc(var(--pad) + var(--hz) + var(--gap));

  display: grid;
  gap: 0.9rem;
  align-content: start;
}

.bay__title {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.35rem 0.75rem;
  margin: 0;
  font-family: var(--font-panel);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  color: var(--ink-dim);
}

.bay__hint {
  font-weight: 500;
  letter-spacing: 0.14em;
  color: var(--ink-faint);
  text-transform: none;
}

.bay__board {
  position: relative;
  padding: 0.35rem 0;
}

/* The nut and bridge the strings appear to run between. */
.bay__nut,
.bay__bridge {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 5px;
  border-radius: 2px;
  background: linear-gradient(90deg, #4a4137, #cbbfa8 45%, #6a5d4c);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.55), 0 2px 6px rgba(0, 0, 0, 0.5);
}
.bay__nut {
  left: calc(var(--wire-start) - 2.5px);
}
.bay__bridge {
  right: calc(var(--wire-end) - 2.5px);
  background: linear-gradient(90deg, #3d352c, #8d7f69 45%, #4a4137);
}

.bay__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
}

.string {
  position: relative;
  width: 100%;
  display: grid;
  grid-template-columns: var(--peg) var(--note) 1fr var(--hz);
  align-items: center;
  gap: var(--gap);
  padding: 0.5rem var(--pad);
  min-height: 44px;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  user-select: none;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
  transition: background 180ms ease;
}

.string::before {
  content: '';
  position: absolute;
  inset: 2px 0.35rem;
  border-radius: 5px;
  background: linear-gradient(90deg, rgba(226, 122, 34, 0.16), rgba(226, 122, 34, 0.02) 70%);
  opacity: 0;
  transition: opacity 200ms ease;
}
.string:hover::before {
  opacity: 0.55;
}
.string.is-selected::before {
  opacity: 1;
}

.string:focus-visible {
  outline: 2px solid var(--amber);
  outline-offset: 2px;
}

/* Machine head: a knurled disc with the string number stamped on it. */
.string__peg {
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 1.9rem;
  height: 1.9rem;
  border-radius: 50%;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: #d9cdb8;
  background:
    repeating-conic-gradient(from 0deg, rgba(255, 255, 255, 0.09) 0deg 4deg, transparent 4deg 8deg),
    radial-gradient(circle at 34% 28%, #7c6e5c, #2f2822 78%);
  box-shadow:
    inset 0 0 0 1px rgba(0, 0, 0, 0.6),
    inset 0 1px 1px rgba(255, 255, 255, 0.18),
    0 2px 5px rgba(0, 0, 0, 0.45);
  transition: color 200ms ease, box-shadow 200ms ease;
}
.string.is-selected .string__peg {
  color: #1b1510;
  background:
    repeating-conic-gradient(from 0deg, rgba(0, 0, 0, 0.1) 0deg 4deg, transparent 4deg 8deg),
    radial-gradient(circle at 34% 28%, #f6cf8a, var(--brass) 76%);
  box-shadow:
    inset 0 0 0 1px rgba(0, 0, 0, 0.4),
    0 0 14px rgba(214, 160, 74, 0.45);
}

.string__note {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: baseline;
  color: var(--ink-dim);
  transition: color 200ms ease;
}
.string.is-selected .string__note {
  color: var(--ink);
}

.string__letter {
  font-family: var(--font-display);
  font-size: 1.5rem;
  line-height: 1;
}
.string__octave {
  font-family: var(--font-mono);
  font-size: 0.65rem;
  color: var(--ink-faint);
  margin-left: 0.15em;
}

.string__wire-track {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  height: 1.6rem;
}

.string__wire {
  position: relative;
  display: block;
  width: 100%;
  border-radius: 2px;
  background: linear-gradient(180deg, #4c463c 0%, #cec5b1 38%, #8e8676 62%, #3a352d 100%);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.55);
  transition: filter 200ms ease;
}

/* Wound strings show the winding wrapped around the core. */
.string__wire--wound {
  background-image:
    repeating-linear-gradient(
      74deg,
      rgba(0, 0, 0, 0.42) 0 1px,
      rgba(255, 255, 255, 0.24) 1px 2px,
      rgba(0, 0, 0, 0.1) 2px 3.4px
    ),
    linear-gradient(180deg, #4c463c 0%, #cec5b1 38%, #8e8676 62%, #3a352d 100%);
}

.string.is-selected .string__wire {
  filter: brightness(1.25) saturate(1.1);
}

/* Sympathetic blur while the note rings — amplitude, not just movement. */
.string__wire::after {
  content: '';
  position: absolute;
  inset: -5px 0;
  border-radius: 6px;
  background: linear-gradient(180deg, transparent, rgba(240, 230, 205, 0.5), transparent);
  opacity: 0;
  filter: blur(3px);
  transition: opacity 220ms ease;
}

.string.is-ringing .string__wire {
  animation: wire-shake 0.075s linear infinite;
  filter: brightness(1.35) blur(0.35px);
}
.string.is-ringing .string__wire::after {
  opacity: 0.55;
  animation: wire-halo 0.3s ease-in-out infinite;
}

@keyframes wire-shake {
  0%,
  100% {
    transform: translateY(-1.2px);
  }
  50% {
    transform: translateY(1.2px);
  }
}

@keyframes wire-halo {
  50% {
    opacity: 0.28;
  }
}

.string__hz {
  position: relative;
  z-index: 1;
  font-family: var(--font-mono);
  font-size: 0.7rem;
  color: var(--ink-faint);
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.string.is-selected .string__hz {
  color: var(--brass);
}

/* Something is sounding on a string other than the one being tuned. */
.string.is-heard:not(.is-selected) .string__note {
  color: var(--amber);
}
.string.is-heard:not(.is-selected) .string__peg {
  box-shadow:
    inset 0 0 0 1px rgba(0, 0, 0, 0.6),
    0 0 10px rgba(226, 122, 34, 0.5);
}

@media (prefers-reduced-motion: reduce) {
  .string.is-ringing .string__wire,
  .string.is-ringing .string__wire::after {
    animation: none;
  }
}

@media (max-width: 460px) {
  .bay {
    --peg: 1.9rem;
    --note: 2.3rem;
    --hz: 3rem;
    --gap: 0.55rem;
  }
}
</style>
