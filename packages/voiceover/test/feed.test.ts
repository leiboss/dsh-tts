import assert from 'node:assert/strict'
import test from 'node:test'
import { escapeXml, renderFeed } from '../src/feed.ts'

test('escapes XML in text and attribute positions', () => {
  assert.equal(escapeXml(`a & b < c > d "quoted" 'single'`), 'a &amp; b &lt; c &gt; d &quot;quoted&quot; &apos;single&apos;')
})

test('renders one episode with an absolute enclosure and an itunes duration', () => {
  const xml = renderFeed({
    title: '只写文档 & 附件',
    audioUrl: 'https://example.com/audio/%E5%8F%AA%E5%86%99.mp3',
    bytes: 139_423,
    durationMs: 3_723_000,
    publishedAt: '2026-11-15T14:00:00.000Z',
    description: '一集 <测试>',
    author: 'leiboss',
    imageUrl: 'https://example.com/audio/cover.jpg',
  })

  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/)
  assert.match(xml, /<rss version="2\.0" xmlns:itunes=/)
  assert.match(xml, /<title>只写文档 &amp; 附件<\/title>/)
  assert.match(xml, /<description>一集 &lt;测试&gt;<\/description>/)
  assert.match(xml, /<itunes:duration>01:02:03<\/itunes:duration>/)
  assert.match(xml, /<itunes:image href="https:\/\/example\.com\/audio\/cover\.jpg"\/>/)
  assert.match(xml, /<enclosure url="https:\/\/example\.com\/audio\/%E5%8F%AA%E5%86%99\.mp3" length="139423" type="audio\/mpeg"\/>/)
  assert.match(xml, /<pubDate>Sun, 15 Nov 2026 14:00:00 GMT<\/pubDate>/)
})

test('omits optional elements instead of writing empty ones', () => {
  const xml = renderFeed({
    title: 'x',
    audioUrl: 'https://example.com/x.mp3',
    bytes: 1,
    durationMs: 1000,
    publishedAt: new Date(0),
  })
  assert.doesNotMatch(xml, /<itunes:image/)
  assert.doesNotMatch(xml, /<itunes:author/)
  assert.match(xml, /<link>https:\/\/example\.com\/x\.mp3<\/link>/, 'the link falls back to the audio URL')
  assert.match(xml, /<itunes:duration>00:00:01<\/itunes:duration>/)
})
