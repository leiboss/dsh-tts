/**
 * A single-episode RSS 2.0 feed, which is what a podcast directory ingests.
 *
 * The feed is written next to the episode file, so a directory only needs the
 * `baseUrl` the host will publish from: every URL in here is absolute, because
 * podcast clients reject relative enclosures.
 */
/** XML text escaping for element content and attributes. */
export function escapeXml(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}
/** `HH:MM:SS` for `itunes:duration`, which wants seconds or a clock. */
function clock(durationMs) {
    const total = Math.max(0, Math.round(durationMs / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
}
/** RFC 822 date, the format RSS 2.0 requires. */
function rfc822(value) {
    const date = value instanceof Date ? value : new Date(value);
    const parsed = Number.isNaN(date.getTime()) ? new Date() : date;
    return parsed.toUTCString();
}
/** Render one episode as an RSS document. */
export function renderFeed(input) {
    const title = escapeXml(input.title);
    const description = escapeXml(input.description ?? input.title);
    const link = escapeXml(input.link ?? input.audioUrl);
    const published = rfc822(input.publishedAt);
    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">',
        '<channel>',
        `<title>${title}</title>`,
        `<link>${link}</link>`,
        `<description>${description}</description>`,
        '<language>zh-CN</language>',
        `<lastBuildDate>${published}</lastBuildDate>`,
        ...(input.author === undefined ? [] : [`<itunes:author>${escapeXml(input.author)}</itunes:author>`]),
        ...(input.imageUrl === undefined ? [] : [`<itunes:image href="${escapeXml(input.imageUrl)}"/>`]),
        '<item>',
        `<title>${title}</title>`,
        `<description>${description}</description>`,
        `<guid isPermaLink="false">${escapeXml(input.audioUrl)}</guid>`,
        `<pubDate>${published}</pubDate>`,
        `<itunes:duration>${clock(input.durationMs)}</itunes:duration>`,
        ...(input.imageUrl === undefined ? [] : [`<itunes:image href="${escapeXml(input.imageUrl)}"/>`]),
        `<enclosure url="${escapeXml(input.audioUrl)}" length="${Math.max(0, Math.round(input.bytes))}" type="audio/mpeg"/>`,
        '</item>',
        '</channel>',
        '</rss>',
        '',
    ].join('\n');
}
//# sourceMappingURL=feed.js.map