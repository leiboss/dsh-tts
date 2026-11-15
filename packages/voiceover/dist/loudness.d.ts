/** One normalisation request. */
export interface LoudnessInput {
    inputPath: string;
    outputPath: string;
    /** Binary to run; defaults to `ffmpeg` from PATH. */
    ffmpegPath?: string;
    /** Hard stop for a pathological encode; a six-hour book still fits. */
    timeoutMs?: number;
}
/** What happened, and why when nothing did. */
export interface LoudnessResult {
    applied: boolean;
    reason?: string;
}
/** ffmpeg arguments for one conservative speech loudness pass. */
export declare function loudnessArgs(input: string, output: string): string[];
/**
 * Run the normaliser, resolving to a skip instead of throwing.
 *
 * The caller only needs to know whether the file was replaced; reporting why it
 * was not is what keeps the episode honest about its loudness.
 */
export declare function normalizeLoudness(input: LoudnessInput): Promise<LoudnessResult>;
//# sourceMappingURL=loudness.d.ts.map