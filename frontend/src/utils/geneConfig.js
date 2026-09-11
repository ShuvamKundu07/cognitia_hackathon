/**
 * Bro Conversational Assistant Configuration & Natural Language Helpers.
 * Provides regex matching for wake words, termination phrases, and dialogue timers.
 */

export const GENE_CONFIG = {
  NAME: 'Bro',
  WAKE_WORD: 'hey bro',
  DEFAULT_LANGUAGE: 'en-IN',
  SILENCE_TIMEOUT_MS: 10000,       // 10 seconds of silence before checking presence
  PRESENCE_RETRY_TIMEOUT_MS: 5000, // 5 seconds to respond to "Are you still there?"
  MAX_HISTORY_TURNS: 6,
};

export const DEFAULT_EXIT_PHRASES = [
  'thank you',
  'thanks',
  'thank you bro',
  'thanks bro',
  'thank',
  "that's all",
  'that is all',
  'stop conversation',
  'stop listening',
  'stop',
  'goodbye',
  'goodbye bro',
  'goodbye gene',
  'you can stop',
  'bye bro',
  'bye gene',
  'bye',
];

/**
 * Evaluates whether spoken text is an intentional wake word activation for Bro.
 * Supports: "hey bro", "Hey Bro", "HEY BRO", "hey, bro", "ok bro", "hi bro".
 */
export function isWakePhrase(text) {
  if (!text) return false;
  const clean = text.trim().toLowerCase().replace(/[.,!?;:]/g, '');

  // Exact wake phrases
  if (
    clean === 'hey bro' ||
    clean === 'hay bro' ||
    clean === 'hi bro' ||
    clean === 'hello bro' ||
    clean === 'ok bro' ||
    clean === 'okay bro' ||
    clean === 'bro' ||
    clean === 'hey gene' ||
    clean === 'hay gene' ||
    clean === 'hi gene' ||
    clean === 'hello gene' ||
    clean === 'ok gene' ||
    clean === 'okay gene'
  ) {
    return true;
  }

  // Matches wake phrase as an isolated phrase / salutation
  // E.g., "Hey Bro", "Hello Bro, turn on the camera", "Hi, Bro"
  const wakeRegex = /(?:^|[.!?]|,)\s*(?:hey|hay|hi|hello|ok|okay)[\s,]+(?:bro|gene)(?:\b|[.!?]|,|$)/i;
  return wakeRegex.test(text);
}

/**
 * Evaluates whether user speech matches a natural termination phrase.
 * Guards against false positives like "I want to thank my friend".
 */
export function isExitPhrase(text, customPhrases = DEFAULT_EXIT_PHRASES) {
  if (!text) return false;
  const clean = text.trim().toLowerCase().replace(/[.,!?;:]/g, '');

  // Check direct equality
  for (const phrase of customPhrases) {
    const p = phrase.toLowerCase();
    if (clean === p || clean === `${p} bro` || clean === `${p} gene` || clean === `${p} please`) {
      return true;
    }
  }

  // Check phrase boundaries
  for (const phrase of customPhrases) {
    const p = phrase.toLowerCase();
    const regex = new RegExp(`(^|[.!?]|,)\\s*${p}\\s*(?:bro|gene|please)?([.!?]|,|$|\\b)`, 'i');
    if (regex.test(text.trim())) {
      // Guard: "I want to thank someone"
      if (p === 'thank' || p === 'thanks') {
        if (/\b(?:want to|like to|should|must|have to|wanna)\s+thank\b/i.test(clean)) {
          return false;
        }
      }
      return true;
    }
  }

  return false;
}

