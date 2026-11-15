/**
 * The smallest ID3v2.4 writer a chaptered episode needs.
 *
 * Players show chapters by reading `CHAP`/`CTOC` frames, so one MP3 can behave
 * like a book. Written here instead of pulled in: the tag is a header plus a
 * handful of frames, and the plugin ships without a runtime dependency budget.
 *
 * Text frames use UTF-8 (v2.4 encoding byte 0x03), and every frame size is
 * syncsafe — that is what makes v2.4 tags differ from the v2.3 ones a naive
 * writer produces.
 */
/** One chapter marker in the finished file. */
export interface Id3Chapter {
    id: string;
    title: string;
    startMs: number;
    endMs: number;
}
/** Everything this writer can put in one tag. */
export interface Id3TagInput {
    title?: string;
    artist?: string;
    album?: string;
    year?: string;
    cover?: {
        mime: string;
        data: Buffer;
    };
    chapters: readonly Id3Chapter[];
}
/** Build a complete tag; no padding, since the writer owns the whole file head. */
export declare function buildId3v24(input: Id3TagInput): Buffer;
//# sourceMappingURL=id3.d.ts.map