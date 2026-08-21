# Six String

A guitar tuner that runs entirely in the browser. Pick the string you want to tune,
play it, and an analogue-style needle tells you whether to tune up or down.

Vue 3 + TypeScript, no backend — the microphone signal never leaves the device.

## Running it

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # static bundle in dist/
npm test         # pitch and note maths
```

The build output is plain static files; drop `dist/` on any host. The microphone
needs a secure context, so serve it over HTTPS (`localhost` counts).

## How the tuning works

`src/lib/pitch.ts` implements the **McLeod Pitch Method**. Plain autocorrelation
octave-jumps on plucked strings, because a guitar's second harmonic is often
louder than its fundamental. MPM normalises the autocorrelation (the NSDF) and
then picks the *earliest* peak within 10% of the best one rather than the tallest,
which is what keeps a strong harmonic from winning. Parabolic interpolation
through the chosen peak gets the period to sub-sample accuracy — at 12 kHz one
whole sample is about 15 cents on a low E, far too coarse to tune by.

The signal chain in `src/composables/useTuner.ts`:

| Stage | Why |
| --- | --- |
| `getUserMedia` with AGC, echo cancellation and noise suppression **off** | Voice processing smears the decay and eats the fundamental |
| High-pass at 55 Hz | Removes handling rumble and DC |
| Two low-passes at 1.2 kHz | Leaves nothing to alias when decimating |
| Decimate 48 kHz → 12 kHz | 16× less correlation work; the top open string is only 330 Hz |
| MPM over a 1024-sample window | ~85 ms of audio, several periods even at low E |
| 5-frame median | Kills outliers without visible lag |

Readings are octave-folded against the target (`foldedCents`), so a harmonic an
octave up still reads as in tune, while a genuinely wrong string stays off the
scale — and the string bay lights up whichever open string it thinks you played.

The needle itself is driven by a damped spring rather than a CSS transition, so
it overshoots and settles the way a real meter movement does.

## Layout

```
src/lib/pitch.ts             MPM detector, decimation, RMS  (pure, tested)
src/lib/notes.ts             equal temperament, cents, standard tuning (pure, tested)
src/composables/useTuner.ts  microphone, audio graph, analysis loop
src/components/MeterPanel.vue  the meter, needle ballistics, lamps
src/components/StringBay.vue   string selection
```
