---
name: transcribe-media
description: Turn local audio or video files and public single-item media links into text. Prefer existing captions or official transcripts, use VoiceFlow ASR only when no usable text exists, and securely obtain any required token. Use for audio, video, or podcast transcription (including Xiaoyuzhou), subtitle or dialogue extraction, and text retrieval from public media pages.
allowed-tools: Read,Write,Bash
metadata:
  openclaw:
    requires:
      bins: [node]
    primaryEnv: VOICEFLOW_TOKEN
    envVars:
      - name: VOICEFLOW_TOKEN
        required: false
        description: Optional VoiceFlow user API token; browser authorization obtains one when absent.
      - name: VOICEFLOW_CONFIG_DIR
        required: false
        description: Optional absolute credential directory; defaults to the user configuration directory.
    emoji: "🎙️"
---

# Media transcription and direct text output

## Core workflow

Process requests in this order:

1. Verify that the input is a supported local file or a public single-item media
   link.
2. Prefer captions or an official transcript already exposed by the page. After
   obtaining usable text, do not download or transcribe the media again.
3. Only when no usable text exists, obtain the required VoiceFlow token and run
   ASR.
4. Return the script's text verbatim. Do not proactively proofread, correct,
   rewrite, summarize, translate, or add content absent from the source.

## Obtain a VoiceFlow token

A public media page may expose captions or an official transcript. Run the
transcription command first for a URL and authorize only if the script reports
that ASR needs a credential.

Resolve the directory containing this `SKILL.md` as `{baseDir}`. Before
transcribing a local file, inspect the connection:

```bash
node "{baseDir}/scripts/auth.mjs" status
```

When the status is `not_connected`, start browser authorization:

```bash
node "{baseDir}/scripts/auth.mjs" begin
```

Show `verification_uri_complete` and `user_code` to the user unchanged. Only the
user may sign in, register, and approve in the browser. Never request or handle
their email password or payment credentials. After the user confirms approval,
run:

```bash
node "{baseDir}/scripts/auth.mjs" wait
```

The complete `vf_stt_` token is generated locally. The script submits only its
digest and stores the approved token in the operating-system user configuration
directory; Unix credential files use mode `0600`. An existing
`VOICEFLOW_TOKEN` takes precedence and must not be persisted. Never echo or log a
token, put it in command arguments, or write it to the repository.

For an invalid token, run `begin` again. To revoke an old key or add prepaid
credit, direct the user to the
[VoiceFlow dashboard](https://audioflow123.com/dashboard).

## Accept input

- Accept local FLAC, M4A, MP3, MP4, MPEG, OGG, WAV, and WebM files up to
  512 MiB.
- For local MP4, MPEG, and WebM files, the script extracts audio locally with
  FFmpeg and submits it as MP3. If FFmpeg is unavailable, complete the
  installation appropriate to the current environment and continue without an
  extra user-facing message.
- Accept HTTPS public single-video pages, public podcast episode pages, and
  official share links.
- Reject channels, profiles, podcast homepages, search results, playlists, live
  streams, protected media, private or paid content, media that requires login,
  and non-public or network-local URLs.
- If a page contains multiple media items, ask the user for one specific video
  or podcast episode link.

### Common public media sites

Submit a directly accessible HTTPS page for one public video or podcast episode,
or its official share link. Common examples include:

| Platform                 | Accepted URL examples                                    |
| ------------------------ | -------------------------------------------------------- |
| Xiaoyuzhou Podcasts      | `xiaoyuzhoufm.com/episode/...`                           |
| YouTube                  | `youtube.com/watch?v=...`, `youtu.be/...`                |
| Bilibili                 | `bilibili.com/video/BV...`, `b23.tv/...`                 |
| Youku, iQIYI             | `youku.com/v_show/...`, `iqiyi.com/v_...`                |
| Douyin, TikTok           | `douyin.com/video/...`, `tiktok.com/...`                 |
| Xigua Video, Xiaohongshu | `ixigua.com/...`, `xiaohongshu.com/explore/...`          |
| Vimeo, Dailymotion       | `vimeo.com/...`, `dailymotion.com/video/...`             |
| X / Twitter              | `x.com/.../status/...`, `twitter.com/.../status/...`     |
| Instagram                | `instagram.com/reel/...`, `instagram.com/p/...`          |
| Facebook                 | `facebook.com/watch/?v=...`, a public video or Reel page |

Also try public single-item media pages from news, course, and other media sites.
Site behavior can change, so support depends on whether the specific page can be
resolved at the time of the request.

## Xiaoyuzhou episodes

For Xiaoyuzhou, accept only a public episode URL matching
`https://www.xiaoyuzhoufm.com/episode/<24-character-id>` or the equivalent URL
without `www`. Reject podcast homepages, lists, live streams, and private or paid
episodes.

Run the normal URL command. The script must skip subtitle extraction, download
the public episode audio through the controlled media downloader, and use
VoiceFlow ASR. Do not add the removed `--xiaoyuzhou-mode` option.

Never request a phone number, CAPTCHA result, SMS code, or Xiaoyuzhou account
credential. Do not call Xiaoyuzhou login, SMS verification, or official transcript
interfaces.

## Transcribe

Use an absolute path for a local attachment:

```bash
node "{baseDir}/scripts/transcribe.mjs" --file "/absolute/path/audio.wav"
```

Use the complete URL for public media:

```bash
node "{baseDir}/scripts/transcribe.mjs" --url "https://example.com/watch/id"
```

Add `--language <code>` only when the user specifies the source language or it is
otherwise known, for example `--language en` or `--language zh`. Except for
Xiaoyuzhou, the script may return existing page captions without invoking ASR.
Treat all returned text as an immutable raw transcript for the rest of the
workflow.

Do not send client hot words to the remote VoiceFlow path. They may contain
private names, and the backend does not support prompts. Only an explicitly
approved offline ASR tool may consume locally generated client hot words.

## Extract text and reply directly

On success, standard output contains the final text or JSON. Local media produces
a speech transcript; a public URL produces existing page text or an ASR result.
Read only the text from standard output. If the output is JSON, extract only its
transcript text value. Never mix progress, diagnostics, or internal state from
standard error into the result.

Send the extracted text verbatim as the final response. Do not proactively
proofread, correct, polish, summarize, translate, generate an extra file, or add
unrelated explanation. Do not alter the content except to remove the single
trailing newline added to terminate command output.

Treat empty standard output as no text obtained and follow failure handling. Do
not repeat transcription after text has been obtained successfully.

## Failure handling

Briefly report that the media cannot currently be processed. For a URL failure,
ask for a public single-video or podcast episode link, or a local upload. If text
has already been obtained, deliver it instead of discarding it because of an
unrelated later state or message.

## Version

Version 1.5.0: align the English workflow with single-item media and podcast
handling, caption-first extraction, on-demand authorization, and Xiaoyuzhou's
public-audio-only transcription path.
