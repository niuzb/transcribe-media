import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  authorizationStatus,
  beginAuthorization,
  waitForAuthorization,
} from "./auth.mjs";
import { readCredentialState } from "./credentials.mjs";

const REQUEST_ID = "11111111-1111-4111-8111-111111111111";
const TOKEN_ID = "22222222-2222-4222-8222-222222222222";

function credentialOptions(root) {
  return {
    environment: { AUDIOFLOW_CONFIG_DIR: root },
    platform: process.platform,
    homeDirectory: root,
  };
}

function response(status, body, headers = {}) {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

test("begin sends only token digests and prints resumable safe metadata", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "audioflow-auth-"));
  let requestBody;
  try {
    const result = await beginAuthorization(
      { clientName: "transcribe-media", clientVersion: "1.4.0" },
      {
        credentialOptions: credentialOptions(root),
        fetchImpl: async (_url, init) => {
          requestBody = JSON.parse(init.body);
          return response(201, {
            request_id: REQUEST_ID,
            user_code: "ABCDEFGH",
            verification_uri_complete: `https://audioflow123.com/connect-agent?request_id=${REQUEST_ID}&user_code=ABCDEFGH`,
            expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
            interval: 5,
          });
        },
      },
    );
    const state = await readCredentialState(credentialOptions(root));
    assert.match(state.pending.token, /^vf_stt_[A-Za-z0-9_-]{43}$/u);
    assert.equal(
      requestBody.token_hash,
      createHash("sha256").update(state.pending.token).digest("hex"),
    );
    assert.equal(
      requestBody.poll_secret_hash,
      createHash("sha256").update(state.pending.pollSecret).digest("hex"),
    );
    assert.equal(
      JSON.stringify(requestBody).includes(state.pending.token),
      false,
    );
    assert.equal(JSON.stringify(result).includes(state.pending.token), false);
    assert.equal(result.status, "authorization_pending");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("begin resumes an existing authorization without another request", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "audioflow-auth-"));
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return response(201, {
      request_id: REQUEST_ID,
      user_code: "ABCDEFGH",
      verification_uri_complete: `https://audioflow123.com/connect-agent?request_id=${REQUEST_ID}&user_code=ABCDEFGH`,
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      interval: 5,
    });
  };
  try {
    const options = {
      clientName: "transcribe-media",
      clientVersion: "1.4.0",
    };
    await beginAuthorization(options, {
      credentialOptions: credentialOptions(root),
      fetchImpl,
    });
    await beginAuthorization(options, {
      credentialOptions: credentialOptions(root),
      fetchImpl,
    });
    assert.equal(calls, 1);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("wait promotes the local token, acknowledges, and never receives plaintext", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "audioflow-auth-"));
  const calls = [];
  try {
    await beginAuthorization(
      { clientName: "transcribe-media", clientVersion: "1.4.0" },
      {
        credentialOptions: credentialOptions(root),
        fetchImpl: async () =>
          response(201, {
            request_id: REQUEST_ID,
            user_code: "ABCDEFGH",
            verification_uri_complete: `https://audioflow123.com/connect-agent?request_id=${REQUEST_ID}&user_code=ABCDEFGH`,
            expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
            interval: 5,
          }),
      },
    );
    const result = await waitForAuthorization({
      credentialOptions: credentialOptions(root),
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), body: JSON.parse(init.body) });
        if (String(url).endsWith("/poll")) {
          return response(200, {
            status: "approved",
            token_type: "Bearer",
            api_token_id: TOKEN_ID,
          });
        }
        return response(204, {});
      },
    });
    const state = await readCredentialState(credentialOptions(root));
    assert.equal(result.status, "connected");
    assert.equal(state.pending, undefined);
    assert.match(state.active.token, /^vf_stt_/u);
    assert.equal(state.active.apiTokenId, TOKEN_ID);
    assert.equal(Object.hasOwn(state.active, "apiOrigin"), false);
    assert.equal(Object.hasOwn(result, "api_origin"), false);
    assert.equal(
      (await readFile(path.join(root, "credentials.json"), "utf8")).includes(
        "apiOrigin",
      ),
      false,
    );
    assert.equal(
      calls.some((call) => call.url.endsWith("/ack")),
      true,
    );
    assert.equal(JSON.stringify(calls).includes(state.active.token), false);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("denial clears pending local credentials", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "audioflow-auth-"));
  try {
    await beginAuthorization(
      { clientName: "transcribe-media", clientVersion: "1.4.0" },
      {
        credentialOptions: credentialOptions(root),
        fetchImpl: async () =>
          response(201, {
            request_id: REQUEST_ID,
            user_code: "ABCDEFGH",
            verification_uri_complete: `https://audioflow123.com/connect-agent?request_id=${REQUEST_ID}&user_code=ABCDEFGH`,
            expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
            interval: 5,
          }),
      },
    );
    await assert.rejects(
      waitForAuthorization({
        credentialOptions: credentialOptions(root),
        fetchImpl: async () =>
          response(403, { error: { code: "access_denied" } }),
      }),
      /denied/u,
    );
    assert.equal(
      (
        await authorizationStatus({
          credentialOptions: credentialOptions(root),
        })
      ).status,
      "not_connected",
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("credential files do not leak through safe status output", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "audioflow-auth-"));
  try {
    await beginAuthorization(
      { clientName: "transcribe-media", clientVersion: "1.4.0" },
      {
        credentialOptions: credentialOptions(root),
        fetchImpl: async () =>
          response(201, {
            request_id: REQUEST_ID,
            user_code: "ABCDEFGH",
            verification_uri_complete: `https://audioflow123.com/connect-agent?request_id=${REQUEST_ID}&user_code=ABCDEFGH`,
            expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
            interval: 5,
          }),
      },
    );
    const raw = await readFile(path.join(root, "credentials.json"), "utf8");
    const token = JSON.parse(raw).pending.token;
    assert.equal(
      JSON.stringify(
        await authorizationStatus({
          credentialOptions: credentialOptions(root),
        }),
      ).includes(token),
      false,
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
