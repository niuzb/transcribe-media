# transcribe-media

An Agent Skill that turns local audio/video files and public single-item media
links into text. It prefers existing captions or official transcripts and uses
VoiceFlow ASR only when no usable text is available.

> 中文简介：这是一个音视频与播客转文字 Skill。它会优先提取网页已有字幕，
> 没有可用文本时再通过 VoiceFlow ASR 转写。

## Features

- Transcribes local FLAC, M4A, MP3, MP4, MPEG, OGG, WAV, and WebM files.
- Extracts captions from public single-video and podcast-episode pages before
  falling back to speech recognition.
- Supports public media pages handled by `yt-dlp`, including YouTube, Bilibili,
  TikTok, Vimeo, X/Twitter, Xiaoyuzhou, and many other sites.
- Handles Xiaoyuzhou episodes through public audio only—no phone number, SMS
  code, CAPTCHA result, or account credential is requested.
- Obtains a VoiceFlow token through browser approval and stores it in the user
  configuration directory with private permissions.
- Keeps transcript text on standard output and progress or diagnostics on
  standard error, making the CLI easy to automate.

## Requirements

- Node.js 24 or later.
- FFmpeg for local video audio extraction and remote formats that require
  conversion.
- A VoiceFlow token only when ASR is required. Public captions can be extracted
  without creating a token.

The skill can use an existing compatible `yt-dlp` executable or download and
verify a pinned official release in the user cache.

## Install as a Codex skill

Clone the complete repository into the personal Codex skills directory:

```bash
git clone https://github.com/niuzb/transcribe-media.git \
  "${CODEX_HOME:-$HOME/.codex}/skills/transcribe-media"
```

Restart Codex if the skill is not discovered immediately. Other Agent
Skills-compatible runners can install the repository in their configured skills
directory.

## Use with an agent

Invoke the skill explicitly or ask the agent to transcribe supported media:

```text
Use $transcribe-media to transcribe /absolute/path/to/interview.mp3.
```

```text
Use $transcribe-media to extract the transcript from this public video URL:
https://example.com/watch/id
```

The skill returns the raw transcript directly. It does not automatically
proofread, rewrite, summarize, or translate the result.

## Use the CLI directly

Transcribe a local file:

```bash
node scripts/transcribe.mjs --file "/absolute/path/to/audio.wav"
```

Extract captions or transcribe public media:

```bash
node scripts/transcribe.mjs --url "https://example.com/watch/id"
```

Add a language only when the source language is known:

```bash
node scripts/transcribe.mjs \
  --file "/absolute/path/to/audio.wav" \
  --language en
```

Run `node scripts/transcribe.mjs --help` for model, provider, polling, and
timeout options.

## VoiceFlow authorization

For a public URL, run the transcription command first: the page may already
provide captions. For local media or a URL that requires ASR, check the current
authorization state:

```bash
node scripts/auth.mjs status
```

If the status is `not_connected`, start browser approval:

```bash
node scripts/auth.mjs begin
```

Open the returned verification URL, approve the request, and then complete the
flow:

```bash
node scripts/auth.mjs wait
```

You can alternatively provide `VOICEFLOW_TOKEN` in the environment. Environment
tokens take precedence and are not persisted by the skill.

## Input boundaries

- Local files are limited to 512 MiB.
- Remote input must be a public HTTPS page for one video or podcast episode.
- Playlists, channels, profiles, search pages, live streams, private or paid
  media, login-required content, DRM media, and private-network URLs are
  rejected.
- Website behavior changes over time, so a supported platform may occasionally
  require an upstream `yt-dlp` update.

## Security and privacy

- Never put a VoiceFlow token in command arguments, logs, source files, or Git.
- Browser authorization generates the complete token locally and submits only
  its digest during approval.
- Stored credentials use private file permissions on Unix systems.
- Media is sent to VoiceFlow ASR only when no usable page text exists or when a
  local file must be transcribed.
- Review the privacy requirements of your media before submitting sensitive
  audio or video to a remote ASR service.

## Development

The runtime uses Node.js built-ins and does not require an npm install. Run the
complete test suite with:

```bash
node --test scripts/*.test.mjs
```

Repository layout:

```text
.
├── SKILL.md                 Agent workflow and safety rules
├── agents/openai.yaml       Skill display metadata
├── references/              Platform-specific instructions
└── scripts/                 Runtime modules and Node.js tests
```

## License

Licensed under the [Apache License 2.0](LICENSE).
