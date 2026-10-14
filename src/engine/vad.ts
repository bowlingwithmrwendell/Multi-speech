// Spec §5 VAD Timeout (Pediatric Wait-Time): dynamic window between 1.2 s and 2.8 s
// based on child age and fluency score.

export const VAD_MIN_MS = 1200;
export const VAD_MAX_MS = 2800;

/**
 * Younger children and less fluent speakers get more time.
 * Age 3 or younger → full 2.8 s; age 8+ → 1.2 s baseline; low fluency adds up to 40% of the range.
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
