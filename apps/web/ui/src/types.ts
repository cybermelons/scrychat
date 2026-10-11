export type CardEntry = {
  name: string;
  tags?: string[];
  count?: number;
  image?: string | null;
  manaCost?: string | null;
  producedMana?: string[] | null;
  typeLine?: string | null;
  owned?: boolean;
  arena?: boolean | null;
};

export type Deck = {
  name: string;
  commander: string;
  commanderIdentity: string[];
  cards: CardEntry[];
  updatedAt: string;
  commanderImage?: string | null;
};

export type DeckSummary = {
  name: string;
  commander: string;
  updatedAt: string;
};

export type QuotaCheck = {
  have: number;
  want: string;
  ok: boolean;
};

export type ArenaCheck = {
  onArena: number;
  total: number;
  missing: string[];
  unknown: string[];
};

export type DeckReport = {
  total: number;
  byTag: Record<string, number>;
  untaggedForQuota: number;
  curve: Record<string, number>;
  quotaCheck: {
    lands: QuotaCheck;
    ramp: QuotaCheck;
    draw: QuotaCheck;
    interaction: QuotaCheck;
    wipes: QuotaCheck;
  };
  identityViolations: string[];
  arenaCheck?: ArenaCheck;
};

export type DeckResponse = {
  deck: Deck;
  report: DeckReport;
  collection?: {
    importedAt: string;
    ownedCount: number;
    missingCount: number;
  };
};

export type RejectedCard = { name: string; reason: string };

export type AddCardsResult = {
  added: CardEntry[];
  rejected: RejectedCard[];
};

export type IllegalCard = { name: string; reason: string };

export type CommanderChangeResult = {
  deck: Deck;
  changed: boolean;
  nowIllegal: IllegalCard[];
};

export type ImportCandidate = { name: string; [key: string]: unknown };

export type DeckImportResult = {
  error?: string;
  needsCommander?: boolean;
  candidates?: ImportCandidate[];
  deck?: Deck;
  added?: CardEntry[];
  rejected?: RejectedCard[];
  unparsed?: string[];
  summary?: string;
};

export type ExportFormat = "mtga" | "plain" | "moxfield";

export type QuotaTargetKey = "lands" | "ramp" | "draw" | "interaction" | "wipes";

export type QuotaTargets = Partial<Record<QuotaTargetKey, [number, number]>>;

export type EffectiveQuotaTargets = Record<QuotaTargetKey, [number, number]>;

export type AppConfig = {
  linkifyPass: boolean;
  defaultExportFormat: ExportFormat;
  quotaTargets?: QuotaTargets;
  goldfishSeed: number;
  recognizedQuotaTags: string[];
  effectiveQuotaTargets: EffectiveQuotaTargets;
};

export type ConfigPatchResult = AppConfig | { errors: string[] };

export const LEGACY_ROLE_TAGS = [
  "land",
  "ramp",
  "draw",
  "interaction",
  "wipe",
  "wincon",
  "synergy",
  "other",
] as const;

export type ChatSegment =
  | { type: "text"; text: string }
  | { type: "tool"; name: string; input: unknown; result?: string };

/**
 * Mirrors ChartSpec in @scrychat/core (the UI cannot import from core, so the
 * shape is restated here). Rendered by Chart in ChatPanel.tsx; always
 * validated by parseChartSpec first, since it arrives as untrusted tool output.
 */
export type ChartSpec = {
  type: "bar";
  data: { x: string; y: number }[];
  x: string;
  y: string;
  caption?: string;
};

/**
 * Mirrors the deck_present result in @scrychat/mcp (the UI cannot import it, so
 * the shape is restated here). Rendered by SlideStrip in ChatPanel.tsx; always
 * validated by parseSlideSpec first. A slide has text, a chart, or both.
 */
export type Slide = { title: string; text?: string; chart?: ChartSpec };
export type SlideSpec = { slides: Slide[] };

export type ChatEvent =
  | { type: "chat"; chatId: string }
  | { type: "text-delta"; text: string }
  | { type: "tool-use"; name: string; input: unknown }
  | { type: "tool-result"; toolIndex: number; result: string }
  | { type: "done"; sessionId?: string; result?: string | null; isError?: boolean; error?: string; interrupted?: boolean }
  | { type: "segments-update"; segments: ChatSegment[] };

export type ChatMessage = {
  role: "user" | "assistant";
  text: string;
  tools: { name: string; input: unknown }[];
  segments: ChatSegment[];
  interrupted?: boolean;
};

export type ChatSummary = {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
};

export type ChatFileMsg = {
  role: "user" | "assistant";
  text: string;
  tools?: { name: string; input: unknown }[];
  segments?: ChatSegment[];
  at: string;
};

export type ChatFile = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  sdkSessionId?: string;
  lastSeenActionIdx: number;
  messages: ChatFileMsg[];
  deckRefs?: string[];
};

/**
 * Mirrors Suggestion in @scrychat/core. The UI cannot import from core
 * (the browser bundle has no access to the workspace package), so the
 * shape is restated here and must stay in step with
 * packages/core/src/suggestions.ts.
 */
export type SuggestionKind = "add" | "cut" | "swap";
export type SuggestionStatus = "pending" | "accepted" | "rejected";

export type Suggestion = {
  id: string;
  kind: SuggestionKind;
  status: SuggestionStatus;
  out?: string;
  in?: string;
  role?: string;
  why: string;
  createdAt: string;
  decidedAt?: string;
  note?: string;
};

/**
 * Mirrors the result of the goldfish_compare MCP tool (packages/mcp/src/tools.ts;
 * the UI cannot import from core or mcp, so the shape is restated here). Only the
 * fields CompareTable reads are carried. Always validated by parseCompareSpec
 * first, since it arrives as untrusted tool output. mulliganRate is a 0..1
 * fraction; delta = builds[0].turnsToOnline - builds[1].turnsToOnline, so
 * NEGATIVE means the first build is faster.
 */
export type CompareBuild = {
  label: string;
  turnsToOnline: number;
  mulliganRate: number;
  stalledGames: number;
};
export type CompareSpec = {
  seed: number;
  iterations: number;
  maxTurns: number;
  onlineThreshold: number;
  builds: [CompareBuild, CompareBuild];
  delta: number;
};
