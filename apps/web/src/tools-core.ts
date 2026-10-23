/**
 * Tool boundary for web chat turns. permissionMode is "dontAsk", so this list
 * is the whole boundary. The 23 MCP tools are the entire data surface: no
 * Read/Grep (they reach the OAuth credential, other users' chats and
 * /proc/self/environ). Do NOT add Bash, Write, Edit or WebFetch -- see CLAUDE.md.
 */
export const ALLOWED_TOOLS = [
  "mcp__scrychat__search_cards",
  "mcp__scrychat__get_card",
  "mcp__scrychat__search_tags",
  "mcp__scrychat__find_alternatives",
  "mcp__scrychat__find_combos",
  "mcp__scrychat__deck_list",
  "mcp__scrychat__deck_create",
  "mcp__scrychat__deck_get",
  "mcp__scrychat__deck_add",
  "mcp__scrychat__deck_remove",
  "mcp__scrychat__deck_import",
  "mcp__scrychat__deck_set_card_tags",
  "mcp__scrychat__deck_rename",
  "mcp__scrychat__deck_set_commander",
  // Edits deck metadata (bracket, budget, role targets), never cards.
  "mcp__scrychat__deck_set_meta",
  "mcp__scrychat__deck_export",
  "mcp__scrychat__goldfish_deck",
  "mcp__scrychat__goldfish_compare",
  "mcp__scrychat__deck_present",
  // Suggestions propose a change for a human to accept or reject; they
  // do not edit the deck. deck_suggestion_decide does edit it, but only
  // on an explicit accept, so the chat turn can queue and the UI decides.
  "mcp__scrychat__deck_suggest",
  "mcp__scrychat__deck_suggestions",
  "mcp__scrychat__deck_suggestion_decide",
] as const;

export const DISALLOWED_TOOLS = [
  "Bash",
  "Write",
  "Edit",
  "NotebookEdit",
  "WebFetch",
  "WebSearch",
  "Task",
  "KillShell",
] as const;
