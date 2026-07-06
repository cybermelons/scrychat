#!/usr/bin/env node
// Probe: confirm the Claude Agent SDK can run on subscription (Max) auth,
// NOT API billing. The machine has a stale ANTHROPIC_API_KEY in the ambient
// env that causes 401s against subscription-authed sessions, so we build a
// cleaned env (stale key/token stripped) and pass it explicitly via
// query()'s `env` option rather than relying on process.env mutation alone.

import { query } from "@anthropic-ai/claude-agent-sdk";

const cleanedEnv = { ...process.env };
delete cleanedEnv.ANTHROPIC_API_KEY;
delete cleanedEnv.ANTHROPIC_AUTH_TOKEN;

// Also strip from process.env itself in case any code path reads it directly
// instead of the env passed to spawn.
delete process.env.ANTHROPIC_API_KEY;
delete process.env.ANTHROPIC_AUTH_TOKEN;

async function main() {
  const q = query({
    prompt: "Reply with exactly: PROBE_OK",
    options: {
      env: cleanedEnv,
      settingSources: [],
      allowedTools: [],
      maxTurns: 1,
    },
  });

  let finalText = "";
  for await (const message of q) {
    if (message.type === "assistant") {
      for (const block of message.message.content) {
        if (block.type === "text") finalText += block.text;
      }
    }
    if (message.type === "result") {
      console.log("--- result message ---");
      console.log(JSON.stringify(message, null, 2));
    }
  }

  console.log("--- final assistant text ---");
  console.log(finalText.trim());
}

main().catch((err) => {
  console.error("PROBE FAILED:", err);
  process.exit(1);
});
