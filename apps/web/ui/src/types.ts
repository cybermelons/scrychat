export type CardEntry = {
  name: string;
  role?: string;
  count?: number;
  image?: string | null;
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

export type DeckReport = {
  total: number;
  byRole: Record<string, number>;
  curve: Record<string, number>;
  quotaCheck: {
    lands: QuotaCheck;
    ramp: QuotaCheck;
    draw: QuotaCheck;
    interaction: QuotaCheck;
    wipes: QuotaCheck;
  };
  identityViolations: string[];
};

export type DeckResponse = {
  deck: Deck;
  report: DeckReport;
};

export type RejectedCard = { name: string; reason: string };

export type AddCardsResult = {
  added: CardEntry[];
  rejected: RejectedCard[];
};

export const CARD_ROLES = [
  "land",
  "ramp",
  "draw",
  "interaction",
  "wipe",
  "wincon",
  "synergy",
  "other",
] as const;

export type ChatEvent =
  | { type: "text-delta"; text: string }
  | { type: "tool-use"; name: string; input: unknown }
  | { type: "done"; sessionId?: string; result?: string | null; isError?: boolean; error?: string };

export type ChatMessage = {
  role: "user" | "assistant";
  text: string;
  tools: { name: string; input: unknown }[];
};
