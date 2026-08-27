import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  resolveRemoteInput,
  selectSubtitleTrack,
  subtitleToText,
  validateVideoUrl,
} from "./remote-media.mjs";

const PUBLIC_LOOKUP = async () => [{ address: "8.8.8.8", family: 4 }];

function valueAfter(argumentsList, option) {
  const index = argumentsList.indexOf(option);
  return index === -1 ? undefined : argumentsList[index + 1];
}

test("validates public HTTPS URL shape before any downloader call", () => {
  assert.equal(
    validateVideoUrl("https://video.example/watch?id=one").hostname,
    "video.example",
  );
  for (const source of [
    "http://video.example/watch",
    "https://user:pass@video.example/watch",
    "https://localhost/watch",
    "https://127.0.0.1/watch",
    "https://video.example:8443/watch",
    "https://video.example/watch#fragment",
  ]) {
    assert.throws(() => validateVideoUrl(source), /public HTTPS/u);
  }
  assert.equal(
    validateVideoUrl(
      "https://www.xiaoyuzhoufm.com/episode/6a14d62e32093460940e970c?s=share",
    ).hostname,
    "www.xiaoyuzhoufm.com",
  );
  for (const source of [
    "https://www.xiaoyuzhoufm.com/podcast/61933ace1b4320461e91fd55",
    "https://xiaoyuzhoufm.com/episode/not-an-id",
  ]) {
    assert.throws(() => validateVideoUrl(source), /Xiaoyuzhou episode/u);
  }
});

test("selects human captions before original automatic captions", () => {
  const track = selectSubtitleTrack({
    automatic_captions: { "en-orig": [{ ext: "vtt" }] },
    language: "en",
    subtitles: { en: [{ ext: "srt" }] },
  });
  assert.deepEqual(track, { source: "manual", language: "en" });
});

test("uses original automatic captions but not translated variants", () => {
  const track = selectSubtitleTrack({
    automatic_captions: {
      en: [{ ext: "vtt" }],
      "en-orig": [{ ext: "vtt" }],
      "zh-Hans": [{ ext: "vtt" }],
    },
    language: "en",
    subtitles: {},
  });
  assert.deepEqual(track, {
    source: "automatic",
    language: "en-orig",
  });
  assert.deepEqual(
    selectSubtitleTrack(
      {
        automatic_captions: {
          "en-orig": [{ ext: "vtt" }],
          "zh-Hans": [{ ext: "vtt" }],
        },
        language: "en",
        subtitles: {},
      },
      "zh",
    ),
    { source: "automatic", language: "en-orig" },
  );
});

test("falls back from requested language to webpage language then a unique track", () => {
  assert.deepEqual(
    selectSubtitleTrack(
      {
        automatic_captions: { "en-orig": [{ ext: "vtt" }] },
        language: "en",
        subtitles: { fr: [{ ext: "srt" }] },
      },
      "zh",
    ),
    { source: "automatic", language: "en-orig" },
  );
  assert.deepEqual(
    selectSubtitleTrack(
      {
        automatic_captions: {},
        language: "de",
        subtitles: { fr: [{ ext: "srt" }] },
      },
      "zh",
    ),
    { source: "manual", language: "fr" },
  );
});

test("does not guess among ambiguous subtitle languages", () => {
  assert.equal(
    selectSubtitleTrack({
      automatic_captions: {},
      subtitles: {
        de: [{ ext: "vtt" }],
        en: [{ ext: "vtt" }],
      },
    }),
    undefined,
  );
  assert.deepEqual(
    selectSubtitleTrack({
      automatic_captions: {},
      subtitles: { en: [{ ext: "vtt" }] },
    }),
    { source: "manual", language: "en" },
  );
});

test("normalizes SRT, VTT, TTML, and JSON3 into distinct plain text", () => {
  assert.equal(
    subtitleToText(
      [
        "1",
        "00:00:00,000 --> 00:00:01,000",
        "<b>Hello &amp; welcome</b>",
        "",
        "2",
        "00:00:01,000 --> 00:00:02,000",
        "<b>Hello &amp; welcome</b>",
        "World",
      ].join("\n"),
      "srt",
    ),
    "Hello & welcome\nWorld",
  );
  assert.equal(
    subtitleToText(
      "WEBVTT\n\n00:00.000 --> 00:01.000\nOne\n\n00:01.000 --> 00:02.000\nTwo",
      "vtt",
    ),
    "One\nTwo",
  );
  assert.equal(
    subtitleToText(
      "<tt><body><p>First<br/>line</p><p>Second</p></body></tt>",
      "ttml",
    ),
    "First\nline\nSecond",
  );
  assert.equal(
    subtitleToText(
      JSON.stringify({
        events: [
          { segs: [{ utf8: "Alpha" }] },
          { segs: [{ utf8: "Alpha" }] },
          { segs: [{ utf8: "Beta" }] },
        ],
      }),
      "json3",
    ),
    "Alpha\nBeta",
  );
});

test("returns a human subtitle and removes its temporary files", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "voiceflow-remote-test-"));
  const calls = [];
  try {
    const result = await resolveRemoteInput({
      source: "https://video.example/watch?id=one",
      lookupImpl: PUBLIC_LOOKUP,
      resolveYtDlpImpl: async () => "fake-yt-dlp",
      runYtDlpImpl: async (_executable, argumentsList) => {
        calls.push(argumentsList);
        if (argumentsList.includes("--dump-single-json")) {
          return JSON.stringify({
            automatic_captions: { "en-orig": [{ ext: "vtt" }] },
            formats: [{ has_drm: false }],
            language: "en",
            subtitles: { en: [{ ext: "srt" }] },
          });
        }
        const template = valueAfter(argumentsList, "--output");
        await mkdir(path.dirname(template), { recursive: true });
        await writeFile(
          path.join(path.dirname(template), "subtitle.en.srt"),
          "1\n00:00:00,000 --> 00:00:01,000\nExisting caption\n",
        );
        return "";
      },
      temporaryBase: root,
    });
    assert.deepEqual(result, {
      kind: "subtitle",
      text: "Existing caption",
    });
    assert.equal(calls.length, 2);
    assert.equal(calls[1].includes("--write-subs"), true);
    assert.equal(calls[1].includes("--write-auto-subs"), false);
    assert.deepEqual(await readdir(root), []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("falls back to one compatible media download when captions are ambiguous", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "voiceflow-remote-test-"));
  let mediaDownloads = 0;
  try {
    const result = await resolveRemoteInput({
      source: "https://video.example/watch?id=one",
      lookupImpl: PUBLIC_LOOKUP,
      resolveYtDlpImpl: async () => "fake-yt-dlp",
      runYtDlpImpl: async (_executable, argumentsList) => {
        if (argumentsList.includes("--dump-single-json")) {
          return JSON.stringify({
            automatic_captions: {},
            formats: [{ has_drm: false }],
            subtitles: {
              de: [{ ext: "vtt" }],
              en: [{ ext: "vtt" }],
            },
          });
        }
        mediaDownloads += 1;
        const template = valueAfter(argumentsList, "--output");
        await mkdir(path.dirname(template), { recursive: true });
        await writeFile(
          path.join(path.dirname(template), "media.m4a"),
          "media fixture",
        );
        return "";
      },
      temporaryBase: root,
    });
    assert.equal(result.kind, "media");
    assert.equal(path.extname(result.filePath), ".m4a");
    assert.equal(mediaDownloads, 1);
    await result.cleanup();
    await result.cleanup();
    assert.deepEqual(await readdir(root), []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("downloads standalone MP3 podcast audio exposed as the best format", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "voiceflow-remote-test-"));
  try {
    const result = await resolveRemoteInput({
      source: "https://podcast.example/episode/one",
      lookupImpl: PUBLIC_LOOKUP,
      resolveYtDlpImpl: async () => "fake-yt-dlp",
      runYtDlpImpl: async (_executable, argumentsList) => {
        if (argumentsList.includes("--dump-single-json")) {
          return JSON.stringify({
            _type: "video",
            automatic_captions: null,
            ext: "mp3",
            formats: null,
            subtitles: null,
            url: "https://media.example/episode.mp3",
          });
        }
        const formatSelector = valueAfter(argumentsList, "--format");
        assert.equal(formatSelector.split("/").includes("best[ext=mp3]"), true);
        const template = valueAfter(argumentsList, "--output");
        await mkdir(path.dirname(template), { recursive: true });
        await writeFile(
          path.join(path.dirname(template), "media.mp3"),
          "podcast fixture",
        );
        return "";
      },
      temporaryBase: root,
    });
    assert.equal(result.kind, "media");
    assert.equal(path.extname(result.filePath), ".mp3");
    await result.cleanup();
    assert.deepEqual(await readdir(root), []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("always downloads Xiaoyuzhou episode audio instead of subtitles", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "voiceflow-remote-test-"));
  const calls = [];
  try {
    const result = await resolveRemoteInput({
      source: "https://www.xiaoyuzhoufm.com/episode/6a14d62e32093460940e970c",
      lookupImpl: PUBLIC_LOOKUP,
      resolveYtDlpImpl: async () => "fake-yt-dlp",
      runYtDlpImpl: async (_executable, argumentsList) => {
        calls.push(argumentsList);
        if (argumentsList.includes("--dump-single-json")) {
          return JSON.stringify({
            automatic_captions: { zh: [{ ext: "vtt" }] },
            formats: [{ has_drm: false }],
            language: "zh",
            subtitles: { zh: [{ ext: "srt" }] },
          });
        }
        const template = valueAfter(argumentsList, "--output");
        await mkdir(path.dirname(template), { recursive: true });
        await writeFile(
          path.join(path.dirname(template), "media.mp3"),
          "xiaoyuzhou fixture",
        );
        return "";
      },
      temporaryBase: root,
    });
    assert.equal(result.kind, "media");
    assert.equal(path.extname(result.filePath), ".mp3");
    assert.equal(calls.length, 2);
    assert.equal(calls[1].includes("--format"), true);
    assert.equal(calls[1].includes("--write-subs"), false);
    assert.equal(calls[1].includes("--write-auto-subs"), false);
    await result.cleanup();
    assert.deepEqual(await readdir(root), []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("suggests FFmpeg when the site exposes no compatible media format", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "voiceflow-remote-test-"));
  try {
    await assert.rejects(
      resolveRemoteInput({
        source: "https://video.example/watch?id=one",
        lookupImpl: PUBLIC_LOOKUP,
        resolveYtDlpImpl: async () => "fake-yt-dlp",
        runYtDlpImpl: async (_executable, argumentsList) =>
          argumentsList.includes("--dump-single-json")
            ? JSON.stringify({
                automatic_captions: {},
                formats: [{ has_drm: false }],
                subtitles: {},
              })
            : "",
        temporaryBase: root,
      }),
      /Installing FFmpeg/u,
    );
    assert.deepEqual(await readdir(root), []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("stops before dependency resolution when already interrupted", async () => {
  const controller = new AbortController();
  controller.abort();
  let resolverCalls = 0;
  await assert.rejects(
    resolveRemoteInput({
      source: "https://video.example/watch",
      signal: controller.signal,
      lookupImpl: PUBLIC_LOOKUP,
      resolveYtDlpImpl: async () => {
        resolverCalls += 1;
        return "fake-yt-dlp";
      },
    }),
    /timed out or was interrupted/u,
  );
  assert.equal(resolverCalls, 0);
});

test("rejects private DNS, playlists, live, authenticated, and DRM media", async () => {
  await assert.rejects(
    resolveRemoteInput({
      source: "https://video.example/watch",
      lookupImpl: async () => [{ address: "10.0.0.1", family: 4 }],
      resolveYtDlpImpl: async () => {
        throw new Error("must not run");
      },
    }),
    /public addresses/u,
  );

  for (const [metadata, expected] of [
    [{ _type: "playlist", entries: [] }, /playlists/u],
    [{ is_live: true }, /Live/u],
    [{ availability: "needs_auth" }, /login or payment/u],
    [{ has_drm: true }, /DRM/u],
  ]) {
    await assert.rejects(
      resolveRemoteInput({
        source: "https://video.example/watch",
        lookupImpl: PUBLIC_LOOKUP,
        resolveYtDlpImpl: async () => "fake-yt-dlp",
        runYtDlpImpl: async () => JSON.stringify(metadata),
      }),
      expected,
    );
  }
});
