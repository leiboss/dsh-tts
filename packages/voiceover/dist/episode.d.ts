/** Silence inserted between chapters when a caller does not ask for one. */
export declare const DEFAULT_GAP_MS = 300;
/** How one project chapter reaches the assembler. */
export interface EpisodeChapterInput {
    id: string;
    order: number;
    title: string;
    audioPath: string;
    durationMs: number;
    subtitlesPath?: string;
}
/** One episode request. */
export interface EpisodeInput {
    projectId: string;
    projectDir: string;
    title: string;
    author?: string;
    coverPath?: string;
    /** Silence between chapters in milliseconds; 0 disables it. */
    gapMs?: number;
    /** Run one ffmpeg loudness pass over the merged audio; skipped when it cannot run. */
    loudness?: boolean;
    /** ffmpeg binary; defaults to `ffmpeg` from PATH. */
    ffmpegPath?: string;
    /** Write a single-episode RSS feed pointing at `baseUrl`. */
    feed?: {
        baseUrl: string;
        description?: string;
        link?: string;
    };
    chapters: readonly EpisodeChapterInput[];
}
/** One chapter as recorded in the episode metadata. */
export interface EpisodeChapterMetadata {
    id: string;
    title: string;
    startMs: number;
    endMs: number;
    durationMs: number;
}
/** Persisted facts about one assembled episode. */
export interface EpisodeMetadata {
    schemaVersion: 1;
    projectId: string;
    title: string;
    author?: string;
    durationMs: number;
    bytes: number;
    gapMs: number;
    chapters: EpisodeChapterMetadata[];
    /** Identifies the inputs; an unchanged fingerprint reuses the file. */
    fingerprint: string;
    createdAt: string;
    /** File names relative to the episode directory. */
    audio: string;
    subtitles: string;
    /** `applied` only when ffmpeg actually replaced the audio. */
    loudness: 'applied' | 'skipped';
    /** Cover file name, when one was written next to the episode. */
    cover?: string;
    /** Feed file name, when a feed was written. */
    feed?: string;
}
/** What one assembled episode produced. */
export interface EpisodeResult {
    audioPath: string;
    /** Empty when the project has no subtitles at all. */
    subtitlesPath: string;
    metadataPath: string;
    /** Empty when no feed was requested. */
    feedPath: string;
    durationMs: number;
    bytes: number;
    chapters: number;
    /** Whether the ffmpeg loudness pass replaced the audio. */
    loudness: 'applied' | 'skipped';
    warnings: string[];
    /** True when an identical episode already existed and nothing was rewritten. */
    reused: boolean;
}
/** A failure a caller can act on, carrying its own code. */
export declare class EpisodeError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
/** Filesystem-safe file stem for the episode; never empty, never a device name. */
export declare function slugify(title: string): string;
/** Read the one episode metadata file a project may hold. */
export declare function readEpisodeMetadata(projectDir: string): Promise<{
    metadata: EpisodeMetadata;
    audioPath: string;
    subtitlesPath: string;
} | undefined>;
/**
 * Merge the chapters, tag the result and write the sidecar artifacts.
 *
 * Returns the paths rather than serving them: minting a URL is the route
 * owner's job, and this module must stay usable from the CLI and from tests.
 */
export declare function buildEpisode(input: EpisodeInput): Promise<EpisodeResult>;
//# sourceMappingURL=episode.d.ts.map