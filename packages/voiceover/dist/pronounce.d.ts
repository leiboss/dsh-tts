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
    text: string;
    /** Rule keys that actually fired, in application order. */
    applied: string[];
}
/**
 * Replace every rule in `text`, longest key first.
 *
 * @param text - the script exactly as it will be read.
 * @param rules - literal phrase → spoken form; empty keys and values are ignored.
 */
export declare function applyPronunciations(text: string, rules: Readonly<Record<string, string>> | undefined): PronunciationResult;
//# sourceMappingURL=pronounce.d.ts.map