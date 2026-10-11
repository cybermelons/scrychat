/*
 * The turn text the Present button sends, as its own module so a test can
 * pin it without a DOM (apps/web/test has no jsdom; every test there asserts
 * a pure *-core module).
 *
 * Why a chat turn rather than a dedicated route: deck_present is already
 * allowlisted and read-only, and the UI renders its result by matching the
 * tool name in the SSE stream (ChatPanel's `=== "deck_present"` branch). A
 * separate endpoint would have to reproduce that render path, so the turn is
 * the cheaper wiring and keeps one code path.
 *
 * The cost of that choice is that the model CHOOSES to call the tool -- the
 * server injects no tool arguments (measured: zero canUseTool/PreToolUse
 * hooks in server.ts). So this text has one job: make deck_present the
 * obvious call. It uses the exact verb from the tool's own description
 * ("Use when the user asks to present, walk through or summarise a deck")
 * and names no other capability, so there is nothing else to reach for.
 */

/**
 * Deliberately does NOT interpolate the deck name. The server already sends
 * `activeDeck` with every turn and injects it as a `[UI context: deck "X"]`
 * line, so naming it here would state the deck twice -- and if the two ever
 * disagreed, the model would have to guess which one the human meant.
 */
export const PRESENT_PROMPT = "Present this deck.";
