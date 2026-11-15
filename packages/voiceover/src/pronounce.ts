/**
 * Pronunciation substitution, applied to the text the engine speaks.
 *
 * Chinese TTS gets names, abbreviations and polyphones wrong often enough that
 * a small dictionary is worth more than another voice. The substitution is
 * deliberately literal and longest-key-first: rules are phrases, not regexes,
 * so a user never has to escape anything.
 *
 * The written script keeps the original wording. When a rule fires the subtitle
 * timing is aligned proportionally instead of by word boundaries, because the
 * engine's per-word offsets describe the substituted text.
 */

/** Result of one script pass. */
export interface PronunciationResult {
  /** Text to synthesize. */
  text: string
  /** Rule keys that actually fired, in application order. */
  applied: string[]
}

/**
 * Replace every rule in `text`, longest key first.
 *
 * @param text - the script exactly as it will be read.
 * @param rules - literal phrase → spoken form; empty keys and values are ignored.
 */
export function applyPronunciations(
  text: string,
  rules: Readonly<Record<string, string>> | undefined,
): PronunciationResult {
  if (text.length === 0 || rules === undefined) return { text, applied: [] }
  const entries = Object.entries(rules)
    .filter(([from, to]) => from.length > 0 && to.length > 0 && from !== to)
    // Longest first, so "马克·陈" wins over "马克" and no rule eats another's prefix.
    .sort((left, right) => right[0].length - left[0].length)
  let out = text
  const applied: string[] = []
  for (const [from, to] of entries) {
    if (!out.includes(from)) continue
    out = out.split(from).join(to)
    applied.push(from)
  }
  return { text: out, applied }
}
