import assert from "node:assert/strict";
import { mkdtemp, rm, truncate, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  execute,
  inspectMedia,
  loadConfiguration,
  parseArguments,
} from "./transcribe.mjs";

const XIAOYUZHOU_URL =
  "https://www.xiaoyuzhoufm.com/episode/6a14d62e32093460940e970c";

test("always uses the shared production API origin", async () => {
  assert.deepEqual(
    await loadConfiguration({
      loadAudioflowTokenImpl: async () => ({
        token: "test",
        apiOrigin: "https://asr.audioflow123.com",
      }),
    }),
    { token: "test", baseUrl: "https://asr.audioflow123.com" },
  );
  assert.deepEqual(
    await loadConfiguration({
      loadAudioflowTokenImpl: async () => ({ token: "test" }),
    }),
    { token: "test", baseUrl: "https://asr.audioflow123.com" },
  );
});

test("requires exactly one local file or public URL input", () => {
  assert.throws(() => parseArguments([]), /Exactly one/u);
  assert.throws(
    () =>
      parseArguments([
        "--file",
        "audio.wav",
        "--url",
        "https://video.example/watch",
      ]),
    /Exactly one/u,
  );
  assert.equal(
    parseArguments(["--file", "audio.wav"]).filePath.endsWith("audio.wav"),
    true,
  );
  assert.equal(
    parseArguments(["--url", "https://video.example/watch"]).sourceUrl,
    "https://video.example/watch",
  );
  const approved = parseArguments([
    "--allow-tool-download",
    "--file",
    "audio.wav",
    "--allow-remote-asr",
  ]);
  assert.equal(approved.allowRemoteAsr, true);
  assert.equal(approved.allowToolDownload, true);
  assert.equal(
    parseArguments(["--file", "audio.wav"]).allowRemoteAsr,
    false,
  );
  assert.throws(
    () => parseArguments(["--url", XIAOYUZHOU_URL, "--xiaoyuzhou-mode", "asr"]),
    /Unknown or incomplete/u,
  );
});

test("transcribes downloaded Xiaoyuzhou episode audio", async () => {
  let cleaned = 0;
  let transcriptionCalls = 0;
  const result = await execute(
    parseArguments(["--url", XIAOYUZHOU_URL, "--allow-remote-asr"]),
    new AbortController().signal,
    {
      inspectMediaImpl: async () => ({ filePath: "/private/episode.mp3" }),
      loadConfigurationImpl: async () => ({ token: "test" }),
      progress: () => {},
      resolveRemoteInputImpl: async ({ source }) => {
        assert.equal(source, XIAOYUZHOU_URL);
        return {
          kind: "media",
          filePath: "/private/episode.mp3",
          cleanup: async () => {
            cleaned += 1;
          },
        };
      },
      transcribeImpl: async () => {
        transcriptionCalls += 1;
        return "ASR transcript";
      },
    },
  );
  assert.equal(result, "ASR transcript");
  assert.equal(transcriptionCalls, 1);
  assert.equal(cleaned, 1);
});

test("returns a remote subtitle without reading the token or calling ASR", async () => {
  let configurationLoads = 0;
  let transcriptionCalls = 0;
  const result = await execute(
    parseArguments(["--url", "https://video.example/watch"]),
    new AbortController().signal,
    {
      loadConfigurationImpl: () => {
        configurationLoads += 1;
        throw new Error("must not load token");
      },
      progress: () => {},
      resolveRemoteInputImpl: async () => ({
        kind: "subtitle",
        text: "Existing subtitle",
      }),
      transcribeImpl: async () => {
        transcriptionCalls += 1;
        return "unexpected";
      },
    },
  );
  assert.equal(result, "Existing subtitle");
  assert.equal(configurationLoads, 0);
  assert.equal(transcriptionCalls, 0);
});

test("requires per-run consent before local media can leave the device", async () => {
  let prepared = 0;
  let configurationLoads = 0;
  await assert.rejects(
    execute(
      parseArguments(["--file", "audio.wav"]),
      new AbortController().signal,
      {
        prepareLocalMediaImpl: async () => {
          prepared += 1;
          throw new Error("must not prepare");
        },
        loadConfigurationImpl: async () => {
          configurationLoads += 1;
          throw new Error("must not load credentials");
        },
      },
    ),
    /No media was uploaded.*--allow-remote-asr/u,
  );
  assert.equal(prepared, 0);
  assert.equal(configurationLoads, 0);
});

test("requires per-run consent before downloaded media can be uploaded", async () => {
  let cleaned = 0;
  let configurationLoads = 0;
  let inspected = 0;
  await assert.rejects(
    execute(
      parseArguments(["--url", "https://video.example/watch"]),
      new AbortController().signal,
      {
        inspectMediaImpl: async () => {
          inspected += 1;
          throw new Error("must not inspect");
        },
        loadConfigurationImpl: async () => {
          configurationLoads += 1;
          throw new Error("must not load credentials");
        },
        progress: () => {},
        resolveRemoteInputImpl: async () => ({
          kind: "media",
          filePath: "/private/media.m4a",
          cleanup: async () => {
            cleaned += 1;
          },
        }),
      },
    ),
    /No media was uploaded.*--allow-remote-asr/u,
  );
  assert.equal(cleaned, 1);
  assert.equal(configurationLoads, 0);
  assert.equal(inspected, 0);
});

test("submits one ASR call and cleans downloaded media", async () => {
  let cleaned = 0;
  let transcriptionCalls = 0;
  const media = Object.freeze({
    contentType: "audio/mp4",
    filePath: "/private/media.m4a",
    filename: "media.m4a",
    sizeBytes: 10,
  });
  const result = await execute(
    parseArguments([
      "--url",
      "https://video.example/watch",
      "--allow-remote-asr",
    ]),
    new AbortController().signal,
    {
      inspectMediaImpl: async (filePath) => {
        assert.equal(filePath, "/private/media.m4a");
        return media;
      },
      loadConfigurationImpl: () => ({ token: "test" }),
      progress: () => {},
      resolveRemoteInputImpl: async () => ({
        kind: "media",
        filePath: "/private/media.m4a",
        cleanup: async () => {
          cleaned += 1;
        },
      }),
      transcribeImpl: async (_options, configuration, inspectedMedia) => {
        transcriptionCalls += 1;
        assert.deepEqual(configuration, { token: "test" });
        assert.equal(inspectedMedia, media);
        return "ASR transcript";
      },
    },
  );
  assert.equal(result, "ASR transcript");
  assert.equal(transcriptionCalls, 1);
  assert.equal(cleaned, 1);
});

test("cleans downloaded media when ASR fails", async () => {
  let cleaned = 0;
  await assert.rejects(
    execute(
      parseArguments([
        "--url",
        "https://video.example/watch",
        "--allow-remote-asr",
      ]),
      new AbortController().signal,
      {
        inspectMediaImpl: async () => ({ filePath: "media.m4a" }),
        loadConfigurationImpl: () => ({ token: "test" }),
        progress: () => {},
        resolveRemoteInputImpl: async () => ({
          kind: "media",
          filePath: "/private/media.m4a",
          cleanup: async () => {
            cleaned += 1;
          },
        }),
        transcribeImpl: async () => {
          throw new Error("ASR failed");
        },
      },
    ),
    /ASR failed/u,
  );
  assert.equal(cleaned, 1);
});

test("keeps the existing local-file execution path", async () => {
  let remoteCalls = 0;
  let transcriptionCalls = 0;
  const options = parseArguments([
    "--file",
    "audio.wav",
    "--language",
    "en",
    "--allow-remote-asr",
  ]);
  const result = await execute(options, new AbortController().signal, {
    inspectMediaImpl: async (filePath) => ({ filePath }),
    loadConfigurationImpl: () => ({ token: "test" }),
    resolveRemoteInputImpl: async () => {
      remoteCalls += 1;
      throw new Error("unexpected remote call");
    },
    transcribeImpl: async (receivedOptions, configuration, media) => {
      transcriptionCalls += 1;
      assert.equal(receivedOptions.language, "en");
      assert.deepEqual(configuration, { token: "test" });
      assert.equal(media.filePath, options.filePath);
      return "Local transcript";
    },
  });
  assert.equal(result, "Local transcript");
  assert.equal(remoteCalls, 0);
  assert.equal(transcriptionCalls, 1);
});

test("extracts local video media to audio before ASR", async () => {
  let prepared = 0;
  let transcribed = 0;
  let cleaned = 0;
  const options = parseArguments([
    "--file",
    "video.mp4",
    "--allow-remote-asr",
  ]);
  const result = await execute(options, new AbortController().signal, {
    prepareLocalMediaImpl: async (filePath) => {
      assert.equal(filePath, options.filePath);
      prepared += 1;
      return {
        filePath: "/private/media.mp3",
        cleanup: async () => {
          cleaned += 1;
        },
      };
    },
    inspectMediaImpl: async (filePath) => {
      assert.equal(filePath, "/private/media.mp3");
      return {
        filePath,
        filename: "media.mp3",
        contentType: "audio/mpeg",
        sizeBytes: 10,
      };
    },
    loadConfigurationImpl: () => ({ token: "test" }),
    progress: () => {},
    transcribeImpl: async (_options, configuration, media) => {
      transcribed += 1;
      assert.deepEqual(configuration, { token: "test" });
      assert.equal(media.filePath, "/private/media.mp3");
      return "Video transcript";
    },
  });
  assert.equal(result, "Video transcript");
  assert.equal(prepared, 1);
  assert.equal(transcribed, 1);
  assert.equal(cleaned, 1);
});

test("prompts to install FFmpeg when local video conversion is unavailable", async () => {
  let inspected = 0;
  await assert.rejects(
    execute(
      parseArguments(["--file", "video.mp4", "--allow-remote-asr"]),
      new AbortController().signal,
      {
        extractAudioWithFfmpegImpl: async () => {
          const error = new Error("spawn ffmpeg ENOENT");
          error.code = "ENOENT";
          throw error;
        },
        inspectMediaImpl: async () => {
          inspected += 1;
          throw new Error("must not inspect");
        },
      },
    ),
    /Install FFmpeg/i,
  );
  assert.equal(inspected, 0);
});

test("cleans converted local video media when ASR fails", async () => {
  let cleaned = 0;
  const options = parseArguments([
    "--file",
    "video.mp4",
    "--allow-remote-asr",
  ]);
  await assert.rejects(
    execute(options, new AbortController().signal, {
      prepareLocalMediaImpl: async () => ({
        filePath: "/private/media.mp3",
        cleanup: async () => {
          cleaned += 1;
        },
      }),
      inspectMediaImpl: async () => ({
        filePath: "/private/media.mp3",
        filename: "media.mp3",
        contentType: "audio/mpeg",
        sizeBytes: 10,
      }),
      loadConfigurationImpl: () => ({ token: "test" }),
      transcribeImpl: async () => {
        throw new Error("ASR failed");
      },
    }),
    /ASR failed/u,
  );
  assert.equal(cleaned, 1);
});

test("keeps the 512 MiB local and downloaded media limit", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "audioflow-media-test-"));
  const filePath = path.join(root, "oversized.m4a");
  try {
    await writeFile(filePath, "x");
    await truncate(filePath, 512 * 1024 * 1024 + 1);
    await assert.rejects(inspectMedia(filePath), /512 MiB/u);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
