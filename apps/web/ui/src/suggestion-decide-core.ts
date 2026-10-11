/*
 * The request body for a suggestion verdict, as its own module so a test can
 * pin it without a DOM. Every test in apps/web/test asserts a `*-core.ts`
 * module for this reason: the suite has no jsdom and no React testing
 * library, so logic reachable only from inside a component is logic nothing
 * checks.
 *
 * The bug this exists to prevent shipped once: Suggestions.tsx sent a literal
 * `body: "{}"` while the server route (server.ts, `req.body?.note`), the MCP
 * tool (deck_suggestion_decide) and core (decideSuggestion) all already
 * accepted a note. The whole path was wired and the UI discarded the value,
 * which no typecheck can see -- "{}" is a valid body.
 */

/**
 * Body for POST /api/decks/:name/suggestions/:id/:verdict.
 *
 * `note` is omitted rather than sent empty. core's decideSuggestion guards
 * with `if (note)`, so an empty string is already ignored there; sending one
 * would record that a note was offered when it was not, and it makes the two
 * sides disagree about what "no note" looks like on the wire.
 */
export function decideBody(note?: string): string {
  const trimmed = note?.trim();
  return JSON.stringify(trimmed ? { note: trimmed } : {});
}
