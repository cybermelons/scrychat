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
