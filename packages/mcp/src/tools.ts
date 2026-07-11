/**
 * Tool registrations for the scrychat MCP server.
 *
 * Every tool returns a single `text` content block containing compact JSON.
 * Errors are caught and returned as `{ error: message }` text (never thrown),
 * so a bad query from the calling model degrades gracefully instead of
 * killing the tool call.
 */

import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  searchCards,
  getCard,
  searchTags,
  findCombos,
  findAlternatives,
  collectionStats,
  getOwnedIndex,
} from "@scrychat/core";
import type { OwnedIndex } from "@scrychat/core";
import {
  listDecks,
  createDeck,
  getDeck,
  deleteDeck,
  addCards,
  removeCards,
  deckReport,
  deckSummary,
  renameDeck,
  setCommander,
  setCardTagsResult,
  renameTag,
  setCardCount,
  exportDeck,
} from "@scrychat/core";
import { importDecklist } from "@scrychat/core";
import type { CardResolver, CardEntry, QuotaTargets } from "@scrychat/core";
import type { Card } from "@scrychat/core";

const decksDir = path.resolve(process.cwd(), "decks");

/**
 * Loads `quotaTargets` from scrychat.config.json (repo root, cwd-relative) once
 * at module init. Tolerates an absent or invalid config file (falls back to
 * undefined, letting decks.ts's built-in defaults apply). Per-deck overrides
 * (Deck.quotaTargets) still win over this global config — see decks.ts's
 * resolveQuotaTargets.
 */
function loadGlobalQuotaTargets(): Partial<QuotaTargets> | undefined {
  try {
    const configPath = path.resolve(process.cwd(), "scrychat.config.json");
    const raw = fs.readFileSync(configPath, "utf8");
    const config = JSON.parse(raw);
    if (config && typeof config === "object" && config.quotaTargets && typeof config.quotaTargets === "object") {
      return config.quotaTargets as Partial<QuotaTargets>;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

const globalQuotaTargets = loadGlobalQuotaTargets();

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
    arena: card.arena,
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

/** Checks card ownership by oracle_id, falling back to name (incl. front-face for DFCs). */
function ownedFlag(card: Card, idx: OwnedIndex): boolean {
  if (card.oracleId && idx.oracleIds.has(card.oracleId)) return true;
  const lower = card.name.toLowerCase();
  if (idx.names.has(lower)) return true;
  const frontFace = lower.split(" // ")[0];
  return idx.names.has(frontFace);
}

function shortCard(card: Card, idx?: OwnedIndex | null) {
  return {
    n: card.name,
    mc: card.manaCost,
    cmc: card.cmc,
    t: card.typeLine,
    ci: card.colorIdentity.join(""),
    usd: card.usd,
    r: card.edhrecRank,
    o: truncate(card.oracleText, 200),
    arena: card.arena,
    ...(idx ? { owned: ownedFlag(card, idx) } : {}),
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
        const idx = getOwnedIndex();
        return {
          total: result.total,
          cards: result.cards.map((c) => shortCard(c, idx)),
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
        const idx = getOwnedIndex();
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
          arena: card.arena,
          brawlLegal: card.brawlLegal,
          standardBrawlLegal: card.standardBrawlLegal,
          historicLegal: card.historicLegal,
          timelessLegal: card.timelessLegal,
          producedMana: card.producedMana,
          ...(idx ? { owned: ownedFlag(card, idx) } : {}),
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
        owned_only: z
          .boolean()
          .optional()
          .describe("If true, only return alternatives already in the imported collection (requires a collection import; errors if none exists)"),
      },
    },
    async ({ card, color_identity_within, max_price, limit_per_role, owned_only }) => {
      return safe(async () => {
        const idx = getOwnedIndex();
        if (owned_only && !idx) {
          return { error: "no collection imported" };
        }
        const result = await findAlternatives(card, {
          colorIdentityWithin: color_identity_within,
          maxPrice: max_price,
          limitPerRole: limit_per_role,
        });
        return {
          card: result.card,
          roles: result.roles.map((role) => {
            let members = role.members.map((c) => ({
              n: c.name,
              usd: c.usd,
              ci: c.colorIdentity.join(""),
              arena: c.arena,
              ...(idx ? { owned: ownedFlag(c, idx) } : {}),
            }));
            if (owned_only && idx) {
              members = members.filter((m) => m.owned);
            }
            return {
              slug: role.slug,
              label: role.label,
              members,
            };
          }),
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
        "Fetches a deck's full card list (grouped by tag) plus a deck report: quota check against " +
        "recommended counts (lands/ramp/draw/interaction/wipes), mana curve, any color identity violations, " +
        "and arenaCheck (MTG Arena availability: onArena/total copies plus missing/unknown name lists). " +
        "Answer whole-deck Arena questions ('is this deck playable on Arena', 'what's missing from Arena') " +
        "from arenaCheck directly — do not re-derive it via per-card lookups.",
      inputSchema: {
        name: z.string().describe("Deck name"),
      },
    },
    async ({ name }) => {
      return safe(async () => {
        const deck = await getDeck(name, decksDir);
        if (!deck) return { error: `Deck not found: ${name}` };

        const byTag: Record<string, CardEntry[]> = {};
        for (const card of deck.cards) {
          const tags = card.tags ?? [];
          if (tags.length === 0) {
            (byTag["untagged"] ??= []).push(card);
          } else {
            for (const tag of tags) {
              (byTag[tag] ??= []).push(card);
            }
          }
        }

        const report = await deckReport(name, resolveCard, decksDir, globalQuotaTargets);

        return {
          name: deck.name,
          commander: deck.commander,
          commanderIdentity: deck.commanderIdentity.join(""),
          byTag,
          report: {
            total: report.total,
            quotaCheck: report.quotaCheck,
            curve: report.curve,
            byTag: report.byTag,
            untaggedForQuota: report.untaggedForQuota,
            identityViolations: report.identityViolations,
            arenaCheck: report.arenaCheck,
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
        "Use free-form 'tags' (e.g. ['ramp'], ['removal', 'combo piece']) to label a card's strategic role(s); " +
        "'role' is still accepted as a deprecated single-tag alias. " +
        "Returns which cards were added and which were rejected (with reasons).",
      inputSchema: {
        name: z.string().describe("Deck name"),
        cards: z
          .array(
            z.object({
              name: z.string(),
              tags: z
                .array(z.string())
                .optional()
                .describe("Free-form strategy tags, e.g. ['ramp'], ['land'], ['removal', 'combo piece'] (preferred)"),
              role: z.string().optional().describe("Deprecated back-compat alias for a single tag, e.g. 'ramp', 'land', 'removal'"),
              count: z.number().int().positive().optional().describe("Count, default 1 (only >1 for Basic Land)"),
            }),
          )
          .describe("Cards to add"),
      },
    },
    async ({ name, cards }) => {
      return safe(async () => {
        const result = await addCards(name, cards as CardEntry[], resolveCard, decksDir);
        const summary = await deckSummary(name, resolveCard, decksDir, globalQuotaTargets);
        return { ...result, summary };
      });
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
        const summary = await deckSummary(name, resolveCard, decksDir, globalQuotaTargets);
        return {
          name: deck.name,
          commander: deck.commander,
          total: deck.cards.reduce((sum, c) => sum + (c.count ?? 1), 0),
          summary,
        };
      });
    },
  );

  server.registerTool(
    "deck_import",
    {
      title: "Import decklist",
      description:
        "Parses a pasted decklist (Moxfield/Archidekt/MTGO/plain-text export style, including *CMDR* markers, " +
        "section headers, set/collector/foil suffixes) and either creates a new deck or adds to an existing one. " +
        "Mode is inferred from the presence of *CMDR*-marked entries unless explicitly given. " +
        "Returns a full accounting: created deck info (if new), added cards, rejected cards with reasons, and " +
        "any unparsed lines — nothing from the input is silently dropped.",
      inputSchema: {
        text: z.string().describe("Raw pasted decklist text"),
        deck_name: z.string().optional().describe("Target deck name (existing mode) or new deck name (new mode)"),
        mode: z.enum(["new", "existing"]).optional().describe("Override automatic new-vs-existing inference"),
      },
    },
    async ({ text, deck_name, mode }) => {
      return safe(async () => importDecklist(text, { deckName: deck_name, mode, targets: globalQuotaTargets }, resolveCard, decksDir));
    },
  );

  server.registerTool(
    "deck_set_card_tags",
    {
      title: "Set card tags",
      description:
        "Bulk-sets the strategy tags on cards already in a deck (replaces each card's tags wholesale). " +
        "Does not add cards. Returns which cards were updated and which were rejected " +
        "(e.g. card not in deck), per-item.",
      inputSchema: {
        deck_name: z.string(),
        cards: z
          .array(z.object({ name: z.string(), tags: z.array(z.string()) }))
          .describe("cards (must already be in deck) with their new full tag list"),
      },
    },
    async ({ deck_name, cards }) => {
      return safe(async () => {
        const result = await setCardTagsResult(deck_name, cards, decksDir);
        const summary = await deckSummary(deck_name, resolveCard, decksDir, globalQuotaTargets);
        return { updated: result.updated, rejected: result.rejected, summary };
      });
    },
  );

  server.registerTool(
    "deck_rename_tag",
    {
      title: "Rename tag",
      description: "Bulk-renames a tag across all cards in a deck (exact string match). Deduplicates if the target tag is already present on a card.",
      inputSchema: {
        deck_name: z.string(),
        from: z.string().describe("existing tag to rename"),
        to: z.string().describe("new tag name"),
      },
    },
    async ({ deck_name, from, to }) => {
      return safe(async () => {
        const deck = await renameTag(deck_name, from, to, decksDir);
        const summary = await deckSummary(deck_name, resolveCard, decksDir, globalQuotaTargets);
        return {
          name: deck.name,
          commander: deck.commander,
          total: deck.cards.reduce((sum, c) => sum + (c.count ?? 1), 0),
          summary,
        };
      });
    },
  );

  server.registerTool(
    "deck_set_card_count",
    {
      title: "Set card count",
      description:
        "Sets the copy count in place for a card already in the deck (e.g. adjust a Basic Land's count without " +
        "remove+re-add). Counts greater than 1 are only allowed for Basic Land cards.",
      inputSchema: {
        deck_name: z.string(),
        card: z.string().describe("Card name (must already be in deck)"),
        count: z.number().int().positive().describe("New count, >=1 (only >1 for Basic Land)"),
      },
    },
    async ({ deck_name, card, count }) => {
      return safe(async () => {
        const result = await setCardCount(deck_name, card, count, resolveCard, decksDir);
        const summary = await deckSummary(deck_name, resolveCard, decksDir, globalQuotaTargets);
        return { updated: result.updated, rejected: result.rejected, summary };
      });
    },
  );

  server.registerTool(
    "deck_rename",
    {
      title: "Rename deck",
      description:
        "Renames a deck (file + name field); rejects if the target name already exists — never overwrites.",
      inputSchema: {
        name: z.string().describe("current deck name"),
        new_name: z.string().describe("new deck name"),
      },
    },
    async ({ name, new_name }) => {
      return safe(async () => {
        const deck = await renameDeck(name, new_name, decksDir);
        return {
          name: deck.name,
          commander: deck.commander,
          total: deck.cards.reduce((sum, c) => sum + (c.count ?? 1), 0),
        };
      });
    },
  );

  server.registerTool(
    "deck_set_commander",
    {
      title: "Set deck commander",
      description:
        "Changes a deck's commander (must be a legal legendary commander); revalidates all cards against the " +
        "new color identity and REPORTS newly-illegal cards but does NOT remove them — the caller decides.",
      inputSchema: {
        deck_name: z.string(),
        commander: z.string().describe("new commander card name"),
      },
    },
    async ({ deck_name, commander }) => {
      return safe(async () => {
        const r = await setCommander(deck_name, commander, resolveCard, decksDir);
        const summary = await deckSummary(deck_name, resolveCard, decksDir, globalQuotaTargets);
        return {
          name: r.deck.name,
          commander: r.deck.commander,
          commanderIdentity: r.deck.commanderIdentity.join(""),
          changed: r.changed,
          nowIllegal: r.nowIllegal,
          summary,
        };
      });
    },
  );

  server.registerTool(
    "deck_export",
    {
      title: "Export decklist",
      description:
        "Exports a saved deck as plain decklist TEXT for copy-paste. " +
        "format: 'mtga' (default; Arena import shape with Commander/Deck section headers), " +
        "'moxfield' (N Name lines, commander line suffixed *CMDR*, no section headers), " +
        "'plain' (commander line with *CMDR* suffix, blank line, then card lines). " +
        "Returns { text } — the raw decklist. The model should paste this VERBATIM inside a markdown code fence; " +
        "never add [[card refs]] inside the fenced block.",
      inputSchema: {
        deck_name: z.string().describe("Deck name to export"),
        format: z.enum(["plain", "mtga", "moxfield"]).optional().describe("Export format, default 'mtga'"),
      },
    },
    async ({ deck_name, format }) => {
      return safe(async () => {
        const text = await exportDeck(deck_name, format ?? "mtga", decksDir);
        return { text };
      });
    },
  );

  server.registerTool(
    "collection_stats",
    {
      title: "Collection stats",
      description:
        "Returns summary stats for the imported Arena collection (unique owned cards, total copies, unmatched " +
        "arena ids). Use to check whether a collection is imported before relying on 'owned' fields elsewhere.",
      inputSchema: {},
    },
    async () => {
      return safe(async () => {
        const stats = collectionStats();
        if (!stats.exists) {
          return { exists: false, hint: "import via web UI: link Arena log folder or drag-drop Player.log" };
        }
        return stats;
      });
    },
  );
}

/** Exposed for tests/tools that need to clean up a throwaway deck. */
export { deleteDeck, decksDir };
