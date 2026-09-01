import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  YT_DLP_VERSION,
  installYtDlpAsset,
  isAcceptedYtDlpVersion,
  resolveYtDlp,
  selectYtDlpAsset,
  ytDlpCacheDirectory,
} from "./yt-dlp.mjs";

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

test("maps supported operating systems to pinned official assets", () => {
  assert.equal(
    selectYtDlpAsset({ platform: "darwin", arch: "arm64" }).filename,
    "yt-dlp_macos",
  );
  assert.equal(
    selectYtDlpAsset({
      platform: "linux",
      arch: "x64",
      libc: "glibc",
    }).filename,
    "yt-dlp_linux",
  );
  assert.equal(
    selectYtDlpAsset({
      platform: "linux",
      arch: "arm64",
      libc: "musl",
    }).filename,
    "yt-dlp_musllinux_aarch64",
  );
  assert.equal(
    selectYtDlpAsset({ platform: "win32", arch: "x64" }).filename,
    "yt-dlp.exe",
  );
  assert.throws(
    () => selectYtDlpAsset({ platform: "freebsd", arch: "x64" }),
    /manual yt-dlp installation/u,
  );
});

test("accepts the pinned or newer date version only", () => {
  assert.equal(isAcceptedYtDlpVersion(YT_DLP_VERSION), true);
  assert.equal(isAcceptedYtDlpVersion("2026.08.01"), true);
  assert.equal(isAcceptedYtDlpVersion("2026.07.04.232815"), true);
  assert.equal(isAcceptedYtDlpVersion("2026.06.09"), false);
  assert.equal(isAcceptedYtDlpVersion("nightly"), false);
});

test("uses a sufficiently recent system downloader without fetching", async () => {
  let fetched = false;
  const executable = await resolveYtDlp({
    fetchImpl: async () => {
      fetched = true;
      throw new Error("unexpected fetch");
    },
    probeVersionImpl: async (command) =>
      command === "yt-dlp" ? YT_DLP_VERSION : undefined,
  });
  assert.equal(executable, "yt-dlp");
  assert.equal(fetched, false);
});

test("requires approval before downloading a managed downloader", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "audioflow-ytdlp-test-"));
  let fetched = false;
  try {
    await assert.rejects(
      resolveYtDlp({
        arch: "arm64",
        cacheDirectory: root,
        fetchImpl: async () => {
          fetched = true;
          throw new Error("must not fetch");
        },
        platform: "darwin",
        probeVersionImpl: async () => undefined,
      }),
      /no tool was downloaded.*--allow-tool-download/u,
    );
    assert.equal(fetched, false);
    assert.deepEqual(await readdir(root), []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("does not accept a missing or outdated system downloader", async () => {
  for (const version of [undefined, "2026.06.09"]) {
    await assert.rejects(
      resolveYtDlp({
        arch: "x64",
        platform: "freebsd",
        probeVersionImpl: async () => version,
      }),
      /manual yt-dlp installation/u,
    );
  }
});

test("uses the platform user cache without trusting a relative override", () => {
  assert.equal(
    ytDlpCacheDirectory({
      platform: "linux",
      environment: { XDG_CACHE_HOME: "relative" },
      homeDirectory: "/users/example",
    }),
    `/users/example/.cache/transcribe-media/yt-dlp/${YT_DLP_VERSION}`,
  );
  assert.equal(
    ytDlpCacheDirectory({
      platform: "linux",
      environment: { XDG_CACHE_HOME: "/cache" },
      homeDirectory: "/users/example",
    }),
    `/cache/transcribe-media/yt-dlp/${YT_DLP_VERSION}`,
  );
});

test("downloads, verifies, atomically caches, and reuses an asset", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "audioflow-ytdlp-test-"));
  const bytes = Buffer.from("verified yt-dlp fixture");
  const asset = Object.freeze({
    filename: "yt-dlp-test",
    sha256: digest(bytes),
  });
  let fetches = 0;
  const options = {
    cacheDirectory: root,
    fetchImpl: async () => {
      fetches += 1;
      return new Response(bytes, {
        headers: { "content-length": String(bytes.byteLength) },
        status: 200,
      });
    },
    probeVersionImpl: async (command) =>
      command.includes("yt-dlp-test") ? YT_DLP_VERSION : undefined,
  };
  try {
    const [first, concurrent] = await Promise.all([
      installYtDlpAsset(asset, options),
      installYtDlpAsset(asset, options),
    ]);
    const second = await installYtDlpAsset(asset, options);
    assert.equal(first, concurrent);
    assert.equal(first, second);
    assert.deepEqual(await readFile(first), bytes);
    assert.equal(fetches, 1);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects a bad digest and removes partial cache files", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "audioflow-ytdlp-test-"));
  const asset = Object.freeze({
    filename: "yt-dlp-test",
    sha256: digest("expected"),
  });
  try {
    await assert.rejects(
      installYtDlpAsset(asset, {
        cacheDirectory: root,
        fetchImpl: async () => new Response("tampered", { status: 200 }),
        probeVersionImpl: async () => YT_DLP_VERSION,
      }),
      /SHA-256/u,
    );
    assert.deepEqual(await readdir(root), []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects an oversized release before reading its body", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "audioflow-ytdlp-test-"));
  const asset = Object.freeze({
    filename: "yt-dlp-test",
    sha256: digest("unused"),
  });
  try {
    await assert.rejects(
      installYtDlpAsset(asset, {
        cacheDirectory: root,
        fetchImpl: async () =>
          new Response("x", {
            headers: { "content-length": String(65 * 1024 * 1024) },
            status: 200,
          }),
        probeVersionImpl: async () => YT_DLP_VERSION,
      }),
      /too large/u,
    );
    assert.deepEqual(await readdir(root), []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("cleans partial state when the official release is offline", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "audioflow-ytdlp-test-"));
  const asset = Object.freeze({
    filename: "yt-dlp-test",
    sha256: digest("unused"),
  });
  try {
    await assert.rejects(
      installYtDlpAsset(asset, {
        cacheDirectory: root,
        fetchImpl: async () => {
          throw new Error("offline");
        },
        probeVersionImpl: async () => YT_DLP_VERSION,
      }),
      /offline/u,
    );
    assert.deepEqual(await readdir(root), []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
