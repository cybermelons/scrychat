/**
 * Tool registrations for the scrychat MCP server.
 *
 * Every tool returns a single `text` content block containing compact JSON.
 * Errors are caught and returned as `{ error: message }` text (never thrown),
 * so a bad query from the calling model degrades gracefully instead of
 * killing the tool call.
 */

import path from "node:path";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  searchCards,
  getCard,
  searchTags,
  findCombos,
  findAlternatives,
} from "@scrychat/core";
import {
  listDecks,
  createDeck,
  getDeck,
  deleteDeck,
  addCards,
  removeCards,
  deckReport,
} from "@scrychat/core";
import type { CardResolver, CardEntry } from "@scrychat/core";
import type { Card } from "@scrychat/core";

const decksDir = path.resolve(process.cwd(), "decks");

/** Adapts core's getCard() into the shape decks.ts's CardResolver expects. */
const resolveCard: CardResolver = async (name: string) => {
  const card = await getCard(name);
  if (!card) return null;
  return {
    name: card.name,
    colorIdentity: card.colorIdentity,
    cmc: card.cmc,
    typeLine: card.typeLine,
    legalCommander: card.legalCommander,
  };
};

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}

function errorResult(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }] };
}

/** Wraps a tool handler so any thrown error becomes a JSON {error} text block. */
function safe<T>(fn: () => Promise<T>): Promise<ReturnType<typeof json>> {
  return fn().then(json, errorResult);
}

function truncate(text: string | null, max: number): string {
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function shortCard(card: Card) {
  return {
    n: card.name,
    mc: card.manaCost,
    cmc: card.cmc,
    t: card.typeLine,
    ci: card.colorIdentity.join(""),
    usd: card.usd,
    r: card.edhrecRank,
    o: truncate(card.oracleText, 200),
  };
}

export function registerTools(server: McpServer): void {
  server.registerTool(
    "search_cards",
    {
      title: "Search cards",
      description:
        'Search Scryfall using full Scryfall search syntax (types, colors, otag:, etc). ' +
        '"legal:commander" is appended automatically unless the query already contains "legal:". ' +
        "Returns compact card shorthand: n=name, mc=manaCost, cmc, t=typeLine, ci=colorIdentity (e.g. \"gw\"), " +
        "usd=price, r=edhrecRank, o=oracleText (truncated to 200 chars). Use get_card for full oracle text.",
      inputSchema: {
        query: z.string().describe("Scryfall search syntax, e.g. 'otag:ramp cmc<=2'"),
        limit: z.number().int().positive().max(100).optional().describe("Max results, default 20, max 100"),
        order: z.string().optional().describe("Scryfall sort order, e.g. 'usd', 'edhrec'"),
      },
    },
    async ({ query, limit, order }) => {
      return safe(async () => {
        const q = query.includes("legal:") ? query : `${query} legal:commander`;
        const result = await searchCards(q, { limit, order });
        return {
          total: result.total,
          cards: result.cards.map(shortCard),
        };
      });
    },
  );

  server.registerTool(
    "get_card",
    {
      title: "Get card",
      description:
        "Fetch a single card by (fuzzy) name with full untruncated oracle text. " +
        "Use this after search_cards when you need the complete rules text or exact fields.",
      inputSchema: {
        name: z.string().describe("Card name (fuzzy match supported)"),
      },
    },
    async ({ name }) => {
      return safe(async () => {
        const card = await getCard(name);
        if (!card) return { error: `Card not found: ${name}` };
        return {
          name: card.name,
          manaCost: card.manaCost,
          cmc: card.cmc,
          typeLine: card.typeLine,
          oracleText: card.oracleText,
          colorIdentity: card.colorIdentity,
          usd: card.usd,
          edhrecRank: card.edhrecRank,
          legalCommander: card.legalCommander,
          uri: card.uri,
        };
      });
    },
  );

  server.registerTool(
    "search_tags",
    {
      title: "Search functional tags",
      description:
        "ALWAYS use this to discover functional tag slugs before using otag: in search_cards; never guess slugs. " +
        "Searches tag slug/label/aliases/description and returns matching tag entries.",
      inputSchema: {
        query: z.string().describe("Search text, e.g. 'ramp', 'token-doubler', 'removal'"),
        limit: z.number().int().positive().optional().describe("Max results, default 10"),
      },
    },
    async ({ query, limit }) => {
      return safe(async () => searchTags(query, limit));
    },
  );

  server.registerTool(
    "find_alternatives",
    {
      title: "Find functional alternatives",
      description:
        "Given a card, finds its functional role(s) (e.g. ramp, removal) via the tag index and returns other " +
        "cards that fill the same role(s), grouped by role. Useful for budget swaps or color-identity-constrained substitutions.",
      inputSchema: {
        card: z.string().describe("Card name to find alternatives for"),
        color_identity_within: z
          .string()
          .optional()
          .describe('Restrict results to this color identity, e.g. "gw"'),
        max_price: z.number().optional().describe("Max USD price per alternative"),
        limit_per_role: z.number().int().positive().optional().describe("Max members returned per role"),
      },
    },
    async ({ card, color_identity_within, max_price, limit_per_role }) => {
      return safe(async () => {
        const result = await findAlternatives(card, {
          colorIdentityWithin: color_identity_within,
          maxPrice: max_price,
          limitPerRole: limit_per_role,
        });
        return {
          card: result.card,
          roles: result.roles.map((role) => ({
            slug: role.slug,
            label: role.label,
            members: role.members.map((c) => ({ n: c.name, usd: c.usd, ci: c.colorIdentity.join("") })),
          })),
        };
      });
    },
  );

  server.registerTool(
    "find_combos",
    {
      title: "Find combos",
      description:
        "Looks up Commander Spellbook combos that use ALL of the given cards. " +
        "Returns each combo's pieces, produced effects, color identity, and a link to commanderspellbook.com.",
      inputSchema: {
        cards: z.array(z.string()).describe("Card names that must all be part of the combo"),
        limit: z.number().int().positive().optional().describe("Max combos returned, default 10"),
      },
    },
    async ({ cards, limit }) => {
      return safe(async () => findCombos(cards, limit));
    },
  );

  server.registerTool(
    "deck_list",
    {
      title: "List decks",
      description: "Lists all saved decks with their commander and total card count.",
      inputSchema: {},
    },
    async () => {
      return safe(async () => {
        const decks = await listDecks(decksDir);
        return decks.map((d) => ({
          name: d.name,
          commander: d.commander,
          total: d.cards.reduce((sum, c) => sum + (c.count ?? 1), 0),
        }));
      });
    },
  );

  server.registerTool(
    "deck_create",
    {
      title: "Create deck",
      description:
        "Creates a new deck with the given commander. The commander must be a legal, legendary Commander card. " +
        "Returns the created deck summary, or an error if the commander is invalid.",
      inputSchema: {
        name: z.string().describe("Deck name"),
        commander: z.string().describe("Commander card name"),
      },
    },
    async ({ name, commander }) => {
      return safe(async () => {
        const deck = await createDeck(name, commander, resolveCard, decksDir);
        return {
          name: deck.name,
          commander: deck.commander,
          commanderIdentity: deck.commanderIdentity.join(""),
          total: 0,
        };
      });
    },
  );

  server.registerTool(
    "deck_get",
    {
      title: "Get deck",
      description:
        "Fetches a deck's full card list (grouped by role) plus a deck report: quota check against " +
        "recommended counts (lands/ramp/draw/interaction/wipes), mana curve, and any color identity violations.",
      inputSchema: {
        name: z.string().describe("Deck name"),
      },
    },
    async ({ name }) => {
      return safe(async () => {
        const deck = await getDeck(name, decksDir);
        if (!deck) return { error: `Deck not found: ${name}` };

        const byRole: Record<string, CardEntry[]> = {};
        for (const card of deck.cards) {
          const role = card.role ?? "other";
          (byRole[role] ??= []).push(card);
        }

        const report = await deckReport(name, resolveCard, decksDir);

        return {
          name: deck.name,
          commander: deck.commander,
          commanderIdentity: deck.commanderIdentity.join(""),
          byRole,
          report: {
            total: report.total,
            quotaCheck: report.quotaCheck,
            curve: report.curve,
            identityViolations: report.identityViolations,
          },
        };
      });
    },
  );

  server.registerTool(
    "deck_add",
    {
      title: "Add cards to deck",
      description:
        "Adds one or more cards to a deck. Each card is validated: must exist, be legal in Commander, and stay " +
        "within the commander's color identity; non-basic-land duplicates are rejected (singleton rule). " +
        "Returns which cards were added and which were rejected (with reasons).",
      inputSchema: {
        name: z.string().describe("Deck name"),
        cards: z
          .array(
            z.object({
              name: z.string(),
              role: z.string().optional().describe("Functional role, e.g. 'ramp', 'land', 'removal'"),
              count: z.number().int().positive().optional().describe("Count, default 1 (only >1 for Basic Land)"),
            }),
          )
          .describe("Cards to add"),
      },
    },
    async ({ name, cards }) => {
      return safe(async () => addCards(name, cards as CardEntry[], resolveCard, decksDir));
    },
  );

  server.registerTool(
    "deck_remove",
    {
      title: "Remove cards from deck",
      description: "Removes cards (by name) from a deck. Returns the updated deck summary.",
      inputSchema: {
        name: z.string().describe("Deck name"),
        cards: z.array(z.string()).describe("Card names to remove"),
      },
    },
    async ({ name, cards }) => {
      return safe(async () => {
        const deck = await removeCards(name, cards, decksDir);
        return {
          name: deck.name,
          commander: deck.commander,
          total: deck.cards.reduce((sum, c) => sum + (c.count ?? 1), 0),
        };
      });
    },
  );
}

/** Exposed for tests/tools that need to clean up a throwaway deck. */
export { deleteDeck, decksDir };
