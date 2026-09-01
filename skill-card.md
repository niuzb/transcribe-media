## Description:

Transcribes local audio and video files, public single-item media links, and podcast episodes by reusing existing captions when available and using AudioFlow ASR only when needed.

This skill is ready for use.

## Publisher:

[niuzb](https://clawhub.ai/niuzb)

### License/Terms of Use:

MIT-0

### ClawHub Catalog:

**Categories:** Creative, Productivity

**Topics:** transcription, audio, video, podcast, subtitles

## Use Case:

Developers, creators, and employees use this skill to obtain raw transcripts from supported local media files, public single-video links, and public podcast episode URLs. It is intended for caption-first extraction with ASR fallback when usable page text is unavailable. An AudioFlow account with prepaid credit is required for ASR fallback; existing page captions can be extracted without consuming balance.

### Deployment Geography for Use:

Global

## Known Risks and Mitigations:

Risk: Media may be sent to AudioFlow and a signed storage URL when captions are unavailable.

Mitigation: The skill checks captions first and requires explicit per-run approval before remote ASR. AudioFlow deletes uploaded media when transcription reaches a terminal state, before returning that result; a mandatory private-storage lifecycle removes an object within 2–3 days if immediate best-effort deletion is interrupted.

Risk: The skill may store AudioFlow credentials or cache a managed copy of yt-dlp, and some media formats require FFmpeg.

Mitigation: Managed yt-dlp is downloaded only after explicit approval and SHA-256 verification. The skill never installs FFmpeg silently, and it uses private user configuration and cache directories.

Risk: Persistent transcription credentials could expose account access if mishandled.

Mitigation: Prefer the documented token flow, keep tokens out of command arguments and logs, and use the configured credential directory with restrictive file permissions.

## Reference(s):

- [Xiaoyuzhou single-episode transcription reference](references/xiaoyuzhou.md)
- [AudioFlow sign-up](https://audioflow123.com/signup)
- [AudioFlow billing](https://audioflow123.com/dashboard/billing)
- [AudioFlow dashboard](https://audioflow123.com/dashboard)
- [yt-dlp installation documentation](https://github.com/yt-dlp/yt-dlp/wiki/Installation)

## Skill Output:

**Output Type(s):** [Text, JSON, Shell commands, Configuration guidance]

**Output Format:** [Plain text transcript or JSON transcript payload, with brief Markdown guidance for authorization or failure handling.]

**Output Parameters:** [1D]

**Other Properties Related to Output:** [Returns transcript text verbatim by default; when explicitly requested, uses the transcript to summarize, answer questions, or extract information.]

## Skill Version(s):

1.0.6 (ClawHub release)

## Ethical Considerations:

Users should evaluate whether this skill is appropriate for their environment, review any generated or modified files before relying on them, and apply their organization's safety, security, and compliance requirements before deployment.
