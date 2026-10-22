// Spec §5 VAD Timeout (Pediatric Wait-Time): dynamic window based on child age and fluency.
// The spec's 1.2–2.8 s proved too short in real testing with children, so the window is
// now 4–8 s (younger / less fluent children get the most time).

export const VAD_MIN_MS = 4000;
export const VAD_MAX_MS = 8000;
/** Once the child has started talking, how long a pause we allow before the turn ends.
 *  Raised from 2 s to 3.5 s: kids often pause mid-answer ("a... cow"). */
export const END_OF_TURN_PAUSE_MS = 3500;
/** Short beat after the narrator finishes before the mic opens, so the tail of the
 *  narrator's voice isn't heard as the child's answer. */
export const MIC_OPEN_DELAY_MS = 400;
/** Narrator speaking speed (1 = browser normal). Slowed from 0.9 for young listeners. */
export const NARRATOR_RATE = 0.75;

/**
 * Younger children and less fluent speakers get more time.
 * Age 3 or younger → full 8 s; age 8+ → 4 s baseline; low fluency adds up to 40% of the range.
 */
export function vadWaitTimeMs(ageYears: number, fluencyScore: number): number {
  const range = VAD_MAX_MS - VAD_MIN_MS;
  const ageFactor = 1 - (Math.min(Math.max(ageYears, 3), 8) - 3) / 5; // 1 at 3y, 0 at 8y
  const fluencyFactor = 1 - Math.min(Math.max(fluencyScore, 0), 1); // 1 = not fluent
  const ms = VAD_MIN_MS + range * (0.6 * ageFactor + 0.4 * fluencyFactor);
  return Math.round(Math.min(VAD_MAX_MS, Math.max(VAD_MIN_MS, ms)));
}

/** Spec §5 End-to-end latency target: speech end-of-utterance → TTS first byte. */
export const E2E_LATENCY_TARGET_MS = 850;
