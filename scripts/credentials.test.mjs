import assert from "node:assert/strict";
import {
  chmod,
  lstat,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  clearPendingCredentials,
  loadVoiceflowToken,
  maskedToken,
  promotePendingCredentials,
  readCredentialState,
  resolveCredentialPath,
  savePendingCredentials,
  writeCredentialState,
} from "./credentials.mjs";

const TOKEN = `vf_stt_${"a".repeat(43)}`;
const POLL_SECRET = "b".repeat(43);

function options(root) {
  return {
    environment: { VOICEFLOW_CONFIG_DIR: root },
    platform: process.platform,
    homeDirectory: root,
  };
}

test("resolves portable user configuration paths", () => {
  assert.equal(
    resolveCredentialPath({
      environment: { XDG_CONFIG_HOME: "/config" },
      platform: "linux",
      homeDirectory: "/home/test",
    }),
    "/config/voiceflow/credentials.json",
  );
  assert.equal(
    resolveCredentialPath({
      environment: { APPDATA: "C:\\Users\\test\\AppData\\Roaming" },
      platform: "win32",
      homeDirectory: "C:\\Users\\test",
    }),
    path.win32.join(
      "C:\\Users\\test\\AppData\\Roaming",
      "VoiceFlow",
      "credentials.json",
    ),
  );
  assert.throws(
    () =>
      resolveCredentialPath({
        environment: { VOICEFLOW_CONFIG_DIR: "relative" },
        platform: "linux",
        homeDirectory: "/home/test",
      }),
    /absolute/u,
  );
});

test("writes credentials atomically with private permissions", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "voiceflow-credentials-"));
  try {
    await writeCredentialState(
      {
        version: 1,
        active: {
          token: TOKEN,
          approvedAt: new Date().toISOString(),
        },
      },
      options(root),
    );
    const filePath = path.join(root, "credentials.json");
    const info = await lstat(filePath);
    if (process.platform !== "win32") assert.equal(info.mode & 0o777, 0o600);
    assert.equal(
      (await readCredentialState(options(root))).active.token,
      TOKEN,
    );
    assert.equal((await readFile(filePath, "utf8")).includes(TOKEN), true);
    assert.equal(
      (await readFile(filePath, "utf8")).includes("apiOrigin"),
      false,
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects loose credential file permissions", async () => {
  if (process.platform === "win32") return;
  const root = await mkdtemp(path.join(os.tmpdir(), "voiceflow-credentials-"));
  try {
    const filePath = path.join(root, "credentials.json");
    await writeFile(filePath, '{"version":1}\n', { mode: 0o644 });
    await chmod(filePath, 0o644);
    await assert.rejects(readCredentialState(options(root)), /permissions/u);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects credentials containing the retired API origin", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "voiceflow-credentials-"));
  try {
    const filePath = path.join(root, "credentials.json");
    await writeFile(
      filePath,
      `${JSON.stringify({
        version: 1,
        active: {
          token: TOKEN,
          approvedAt: new Date().toISOString(),
          apiOrigin: "https://api.example.com",
        },
      })}\n`,
      { mode: 0o600 },
    );
    await assert.rejects(
      readCredentialState(options(root)),
      /retired apiOrigin field/u,
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("prefers the environment and promotes resumable pending credentials", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "voiceflow-credentials-"));
  try {
    await savePendingCredentials(
      {
        token: TOKEN,
        pollSecret: POLL_SECRET,
        clientName: "transcribe-media",
        clientVersion: "1.3.0",
        startedAt: new Date().toISOString(),
      },
      options(root),
    );
    assert.equal(
      (await readCredentialState(options(root))).pending.token,
      TOKEN,
    );
    await promotePendingCredentials(
      {
        apiTokenId: "11111111-1111-4111-8111-111111111111",
      },
      options(root),
    );
    assert.deepEqual(await loadVoiceflowToken(options(root)), {
      token: TOKEN,
      source: "configuration",
    });
    assert.equal(
      (await readFile(path.join(root, "credentials.json"), "utf8")).includes(
        "apiOrigin",
      ),
      false,
    );
    assert.deepEqual(
      await loadVoiceflowToken({
        ...options(root),
        environment: {
          VOICEFLOW_CONFIG_DIR: root,
          VOICEFLOW_TOKEN: `vf_stt_${"z".repeat(43)}`,
        },
      }),
      { token: `vf_stt_${"z".repeat(43)}`, source: "environment" },
    );
    await clearPendingCredentials(options(root));
    assert.equal((await readCredentialState(options(root))).pending, undefined);
    assert.equal(maskedToken(TOKEN), `vf_stt_${"a".repeat(8)}…aaaa`);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
