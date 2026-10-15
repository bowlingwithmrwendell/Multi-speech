# MultiPlay Speech — MVP

An interactive speech-development web app for young children, built from the
*MultiPlay Speech – Technical Specifications*. A child sees a picture, hears a
question, answers out loud, and the app adapts difficulty as they go.

This MVP implements the spec's **engine logic for real** and uses the browser's
built-in speech recognition and voices in place of the custom pediatric ASR/TTS
models, behind provider interfaces so production models can be swapped in later.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests for the engines
npm run build      # production build in dist/
```

Voice play works best in **Chrome or Edge** (desktop or Android). In browsers
without speech recognition, the app switches to tap/type answers automatically.

## How it maps to the spec

| Spec section | Where it lives | MVP status |
|---|---|---|
| §1 Client presentation layer | `src/ui/` | Web app (phones, tablets, desktop) |
| §1 Ingress & signal processing | `src/audio/meter.ts` | Browser mic with noise suppression, 80 Hz high-pass, energy VAD, dBFS metering |
| §1 Dialog State Engine | `src/engine/dialog.ts`, `src/engine/rounds.ts` | Prompt-tree walker with scaffold fallback, retry, answer modelling, and multi-round play |
| §2.1 Profile schema | `src/types.ts`, `src/profile/profiles.ts` | UUIDv4 profiles, on-device storage only |
| §2.2 Adaptive engine (EWMA α = 0.15) | `src/engine/adaptive.ts` | Score → Level 1–5; Level 1 starts on either/or scaffolds |
| §2.2 Verbal attempt metrics | `src/engine/session.ts` | Latency, vocal energy (dBFS), duration, completion |
| §2.2 Fluency evaluation | `src/engine/fluency.ts` | Pauses > 800 ms, false starts, repetitions, syllables/sec |
| §2.2 Vocabulary mapping (CDI) | `src/content/cdi.ts` | Words produced grouped by MacArthur-Bates CDI category |
| §3 Theme-agnostic content engine | `src/content/registry.ts`, `src/content/modules/*.json` | Declarative JSON packs, validated on load |
| §3.2 Domains | content modules | Spec's Animals, Tools, Everyday, Vehicles, plus Food, Colors, Body, Weather (11 packs, incl. a Spanish farm pack) |
| §4.2 Language matrix | `src/speech/languages.ts` | All 9 languages listed; browser ASR used per locale |
| §4.1 Pediatric ASR (VTLN, log-mel, Conformer) | `src/speech/providers.ts` interface | **Not in MVP** — needs trained models + server |
| §5 Wait-time (spec 1.2–2.8 s) | `src/engine/vad.ts` | **Widened to 4–8 s** by age and fluency — the spec window was too short in testing with children |
| §5 Latency < 850 ms | play screen grown-up tools | Engine response time measured and shown |

## Adding content

Drop a new JSON file into `src/content/modules/`. It follows the spec §3.1 schema
plus a few optional MVP fields:

- `next_node` — where to go after a correct answer
- `image` / `emoji` — picture for the prompt (emoji shows until the image exists)
- `praise_template` — what to say on success (`{intent}` is replaced)
- `intent_synonyms` — extra words that count, e.g. `{ "drinking": ["drink", "sip"] }`

Every module is validated at load time (and in `npm test`).

## Images

See **[IMAGE_LIST.md](IMAGE_LIST.md)** for every picture the app uses, with the
exact file name and what it should show. Save the PNGs under `public/images/…`.
After adding new modules, regenerate the list with `node scripts/gen-image-list.mjs`.

## Privacy

Profiles hold only a first name or nickname, age, language and target sounds.
Everything is stored in the browser on that device; nothing is uploaded.
Parents can export or delete a child's data from the Grown-ups page.
A server-backed version must add verifiable parental consent (COPPA),
encryption at rest, and a HIPAA-compliant host before storing any child data.

## Roadmap to the full spec

1. Server gateway (WebSocket/gRPC) streaming 16 kHz PCM from the client
2. Pediatric ASR: fine-tune Conformer/XLSR models on child speech; plug in via `ASRProvider`
3. Neural TTS voices via `TTSProvider`
4. Phonetic aligner scoring of `phonetic_target_set` sounds
5. Cloud profile store with consent, encryption and audit logging
6. Native iOS/Android shells
