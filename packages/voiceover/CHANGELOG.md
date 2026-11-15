# Changelog

## 0.5.0

- **Pronunciation dictionary.** The plugin config accepts `pronunciations`, a
  literal phrase → spoken form map (`"OpenAI": "Open A I"`). Rules apply to the
  text the engine reads and to nothing else: the stored script and the subtitles
  keep the readable wording, and the longest key wins so `马克·陈` is not eaten by
  `马克`. Because the engine's word offsets then describe a different text, a
  chapter where a rule fired reports `estimated` subtitle timing and records a
  warning instead of claiming exact alignment.
- **Per-chapter voices.** `voiceOverrides` maps a chapter id to a voice
  (`{"ch-03": "zh-CN-YunxiNeural"}`). The chapter record keeps the voice it
  actually used, and the project key does not change, so different casting is a
  rerun of the same project rather than a new one.

## 0.4.1

- **A one-episode RSS feed.** `voiceover_episode({ feedBaseUrl })` writes
  `episode/feed.xml`: RSS 2.0 with the iTunes namespace, an absolute
  percent-encoded `enclosure`, `itunes:duration`, the cover as `itunes:image`
  and a `pubDate`. Relative enclosures are the usual reason a directory refuses
  a feed, so the base URL is required rather than guessed.
- **Optional loudness normalisation.** `loudness: true` runs one ffmpeg pass
  (`loudnorm=I=-16:TP=-1.5:LRA=11`) over the merged audio before tagging, so the
  chapter markers describe the bytes that ship. ffmpeg is not a dependency: when
  it is missing or blocked the episode is still produced and the warning says
  loudness was skipped. `ffmpegPath` in the plugin config points at a
  non-standard binary.
- The cover is also written next to the episode as `cover.jpg`/`cover.png`, which
  is what the feed points at.

## 0.4.0

- **One finished file per project.** `voiceover_episode` merges the chapters into
  a single MP3 that carries ID3v2.4 chapter markers (`CHAP`/`CTOC`), so a podcast
  client or phone shows the book's outline instead of one long unknown track. A
  cover (`coverPath`), title and author go into the same tag, the chapter
  subtitles are merged into one `.srt` on the episode timeline, and
  `episode/<name>.json` records the chapter start times, sizes and an input
  fingerprint.
- The merge is a frame-level concatenation, not a re-encode: chapters produced
  with different encoder settings are refused (`EPISODE_FORMAT_UNSUPPORTED`)
  instead of being written into a file that plays at the wrong speed. 300 ms of
  in-band silence separates chapters by default (`gapMs` changes or disables it).
- Re-running with unchanged inputs is a no-op: the metadata fingerprint decides,
  so the episode is only rewritten when a chapter, the title, the cover or the
  gap actually changed.
- The panel gains an episode row with its own player and file name, fed by the
  new `episode` field of the panel snapshot.

## 0.3.8

- **The strip plays the whole book.** It mounted one chapter and stopped when
  that chapter ended. It now walks the playable chapters in order, advances on
  `ended`, shows where it is (`ch-02 · 2/5`), cycles playback speed
  (1×/1.25×/1.5×/2×), and remembers the listening position per project: a
  reload continues where the listener stopped, without auto-playing.

## 0.3.7

- **The strip moved above the composer, full width.** 0.3.6 put it in
  `conversation.composer.dock`, below the composer card; the same single-instance
  intent is served better by `conversation.input.dock`, which is the full-width
  seat directly above the input. Still one player per Session, never one per
  reply.

## 0.3.6

- **One player per session, not one per reply.** The strip was registered in
  `conversation.chat.turnTail`, which renders on every completed Turn, so a
  project that had finished put an identical player under every exchange in the
  conversation. It now lives in `conversation.composer.dock`: ambient, rendered
  once per session, and still on screen after the Turn that started the job has
  scrolled away.

## 0.3.5

- **The progress strip is a player once the job is done.** The thin bar in the
  conversation result was always the job's percentage, so a finished project left
  a full bar next to the play button that never moved while the audio played. It
  now follows the audio clock once nothing is left to generate (and while audio
  is actually playing), is taller, is clickable to seek, and exposes
  `role="progressbar"` with the played position.
- **Progress is measured against the plan, not the record count.** One finished
  chapter of eight used to read 100%, and a one-chapter job jumped straight from
  0 to 100. Every planned chapter is recorded as `queued` before the first one
  runs, and each stage (adapted, audited, synthesized) is written to
  `state.json`, throttled to one write per 500 ms with a forced flush at the
  chapter boundary. A failed progress write is logged, not turned into a chapter
  failure.
- **The subtitle line no longer flashes the status between cues.** While audio
  plays the line is reserved, so `已完成 · 15:15` stopped appearing between every
  subtitle; it returns when playback stops.
- The panel's player keeps its audio URL across polls, the freshest project wins
  when two surfaces poll the same session, the session-to-project mapping
  survives a restart, and a failing strip renders its own error row instead of
  the host's placeholder.
- README shots for the strip in both states, rendered from the same client
  bundle as the panel shots.

## 0.3.4

- Display metadata. The plugin row had a title only through the package-name
  fallback because this package shipped no locale resources; `locale/en.json` and
  `locale/zh.json` now carry `meta.title` and `meta.description`, and they are
  exported and published.
- `icon` is declared as a top-level manifest field, which takes priority over the
  `./icon` export, so Plugin Manager reads it before activation.
## 0.3.3

- The engine dependency is now `^0.3.2` instead of `^0.3.0`. Installing this
  package used to resolve `@leiboss/dsh-tts@0.3.0`, whose client half never
  loaded, so `tts_generate` rendered without its player even though the manifest
  here was correct.
## 0.3.2

- A skill (`voiceover`) registered through `ctx.skills`, so the agent knows when a
  document should become a project instead of a pile of `tts_generate` calls. The
  body forbids the per-paragraph loop and explains the resume and export steps.
  Registration is optional: a host without the skills service still gets the tools.
- A progress strip in the conversation result. Tool views render inside the
  collapsed process group, so a running job was invisible unless the call was
  expanded. The strip registers into `conversation.chat.turnTail`, which renders
  in the message flow when a Turn completes: title, `done/total`, a thin bar and
  the failed count, pointing back to the panel for per-chapter actions. It
  reuses the panel's polls through a per-session store, so there is still one
  poller. It hides once nothing is pending and nothing failed.
## 0.3.1

- **The conversation panel never appeared.** `dsh.client.inject` named three
  modules that the page cannot resolve (`dsh-client-runtime`,
  `dsh-client-ui-tool`, `dsh-client-ui-slots`), so the loader skipped the whole
  client half and every `voiceover_create` result fell back to the generic tool
  row. It now injects `@deepseek-ai/dsh-client-ui-conversation`, the package that
  owns `tool.call.toolview`.
- A manifest contract test now asserts the inject list, the exported client
  entry and its presence under a published `files` directory, plus the bundle
  patch and the version constant. Module-level tests stub the loader, which is
  why this class of bug passed them.
## 0.3.0

- The progress track had no background of its own (`bg-layer-2` is white in the
  light theme), so the unfilled part was invisible and the bar read as a full
  streak. It now uses the neutral step, which is visible in both themes.

- Subtitles are now visible where they are actually used: the panel shows the
  current line under the player, synced to playback, and the host serves
  `/voiceover/panel/<id>/subtitles/<chapter>` (plus `.vtt` conversion for browser
  `<track>`). A sidecar SRT alone is invisible in Windows players and in an
  `<audio>` element, which made the earlier deliverable look subtitle-free.

- Localisation: every panel string lives in the client locale namespace `voiceover`
  with `zh` and `en` dictionaries registered on mount. Lookups read the active
  language at call time and a locale subscription re-renders mounted panels, so
  switching language applies without a reload. A client without the locale
  service falls back to Chinese.

- Accessibility: the progress bar exposes `role="progressbar"` with value text, the
  state line is a polite live region, the panel's buttons are native with a visible
  `:focus-visible` ring, and decorative counts are hidden from screen readers.

- Single-chapter rerun: `voiceover_rerun({ chapter })`, the per-row retry button and
  `POST /v1/projects/:id/rerun {"chapter":"ch-03"}` all narrow the same operation.
  Untargeted chapters keep their artifacts; an unknown id fails instead of doing
  nothing.

- The daemon answers `429` with `Retry-After` when the engine is throttled, so a
  caller backs off instead of treating a busy upstream as a bad request.

- `dsh-voiceover serve`: a local daemon exposing the same operations over HTTP
  (bearer token on every route, Range-capable audio, 202 async jobs).
- The daemon keys projects with the shared `normalizeSource`, so a project
  created through the API and one created through the Tool land on the same id.
- Snapshot building moved to `snapshot.ts`, shared by the panel and the API.
- MCP transport is not implemented yet; the HTTP API is the current surface.
## 0.2.0

- `voiceover_rerun` tool plus a panel button: one operation (`operations.ts`) called
  from both paths. Finished chapters are skipped by content hash, failed ones rerun.
- Persist the spoken style in project state so a rerun reproduces the same project
  key; the operation refuses rather than writing into a directory that other
  settings produced.
- Project identity is now computed from the normalized text, so a rerun that reads
  the persisted source file lands on the same key as the original run.
## 0.1.1

- Playback: host registers `/voiceover/audio` (the engine's `AudioRoute` with its own
  prefix, Range + session fence); the panel shows one player plus a per-chapter play
  button, and the URL is captured on click so progress refreshes do not interrupt.
## 0.1.0

- Conversation panel: a client view for `voiceover_create` / `voiceover_status` that
  polls a read-only host route (`GET /voiceover/panel/<projectId>.json`) and shows
  progress, per-chapter status, durations, subtitles and degradation warnings.
- The panel route sits behind the host connection fence and exposes no script text
  or filesystem paths.
- Persist the plan state before the first chapter runs, so the panel shows progress
  instead of a 404 during chapter one.

- The bundle patch inserts the engine with the engine bundle's own id
  (`dsh-tts`), so installing both packages merges into one mount instead of
  publishing `ctx.tts` twice.

- First cut of the voiceover pipeline: chapter planning (block map + outline
  reduce), spoken-script adaptation, audit with one repair round, synthesis via
  `ctx.tts`, subtitle alignment, and a schema-validated manifest.
- Resume by content hash: unchanged chapters are skipped, changed chapters rerun.
- Rule-based subtitle splitting and timing fallback when no model is available,
  labelled `estimated` (the file is written as `*.est.srt`).
- Tools: `voiceover_create`, `voiceover_status`, `voiceover_export`.