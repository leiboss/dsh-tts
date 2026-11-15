/**
 * The skill the agent sees in its catalog.
 *
 * Tools alone tell the model *what* exists; a skill tells it *when* to reach for
 * it and which habit to avoid. The habit that matters here is calling
 * `tts_generate` once per paragraph: that produces a pile of files instead of a
 * resumable project, and it is what a model does by default without guidance.
 */
export const VOICEOVER_SKILL = {
  name: 'voiceover',
  description:
    'Turn a long document into chaptered audio files with subtitles, a manifest, and resumable progress.',
  whenToUse:
    'Use when the user wants a document spoken end to end: an audiobook, a podcast episode from notes, a course chapter, or a spoken version of a long article. Do not use for a single sentence or a one-line reply.',
  content: `# Voiceover: a document, not a sentence

This plugin turns one document into a set of chapter audio files, subtitles, and
a manifest. It plans chapters, adapts the text for speaking (when a model is
configured), synthesizes, aligns subtitles, and keeps a resumable state file.

## When to use it

- The user hands you a document and wants it spoken: audiobook, podcast, course
  chapter, long article.
- The output should be chaptered files with subtitles, not one monolithic mp3.

## When not to use it

- One sentence, a notification, a short reply: call \`tts_generate\` instead.
- Never call \`tts_generate\` in a loop over paragraphs. That produces N loose
  files, loses resume, and has no subtitles or manifest.

## Workflow

1. \`voiceover_create({ sourcePath })\` — prefer a file path for anything longer
   than a few paragraphs, so the text never enters the conversation. It returns
   immediately with a \`projectId\`; the run continues in the background.
2. Do not poll in a loop. Tell the user the project started and that progress
   shows in the panel under the tool call and in the strip under your reply.
   Call \`voiceover_status({ projectId })\` only when the user asks.
3. On failure, \`voiceover_rerun({ projectId })\` resumes unfinished chapters;
   \`voiceover_rerun({ projectId, chapter: 'ch-03' })\` retries one.
4. When the user wants the files, call \`voiceover_export({ projectId })\` and
   report the absolute paths.
5. When the user wants **one finished recording** — a podcast episode, an
   audiobook, "整段音频", something to upload or send — call
   \`voiceover_episode({ projectId })\`. It merges every finished chapter into one
   MP3 with chapter markers, writes a merged SRT next to it, and reports the
   duration. Pass \`coverPath\` for artwork and \`gapMs\` to change the silence
   between chapters (default 300 ms). \`feedBaseUrl\` also writes a one-episode
   RSS feed; \`loudness: true\` runs one ffmpeg normalisation pass (-16 LUFS) and
   is skipped with a warning when ffmpeg is unavailable. Do not re-encode by
   hand: mixed encoder settings are refused with \`EPISODE_FORMAT_UNSUPPORTED\`,
   and that error is the actionable part.

## Reading the result honestly

- \`capability.llm=false\` means no model is configured: chapters are split by
  length and the text is read as written. Say that instead of promising a
  rewrite.
- A chapter's error code is the actionable part: \`UPSTREAM_THROTTLED\` means wait
  and retry, \`SPAWN_EPERM\` means the sandbox blocked a process,
  \`OUTPUT_DIR_NOT_WRITABLE\` means permissions.
- Subtitles are sidecar \`.srt\` files. Windows' built-in player does not load
  them; VLC does. The panel shows the current line while playing.
- Re-running the same source with the same settings reuses the project: finished
  chapters are skipped. That is the intended way to resume, not a new project.
`,
} as const
