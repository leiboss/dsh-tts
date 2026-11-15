/**
 * A single-episode RSS 2.0 feed, which is what a podcast directory ingests.
 *
 * The feed is written next to the episode file, so a directory only needs the
 * `baseUrl` the host will publish from: every URL in here is absolute, because
 * podcast clients reject relative enclosures.
 */
/** Everything one episode feed needs. */
export interface FeedInput {
    /** Episode title, also the channel title. */
    title: string;
    /** Absolute URL of the merged mp3. */
    audioUrl: string;
    /** Size in bytes; iTunes uses it for the download hint. */
    bytes: number;
    durationMs: number;
    /** Publication instant; ISO string or Date. */
    publishedAt: string | Date;
    description?: string;
    link?: string;
    author?: string;
    /** Absolute URL of the cover image, when one was written. */
    imageUrl?: string;
}
/** XML text escaping for element content and attributes. */
export declare function escapeXml(value: string): string;
/** Render one episode as an RSS document. */
export declare function renderFeed(input: FeedInput): string;
//# sourceMappingURL=feed.d.ts.map