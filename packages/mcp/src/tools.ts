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
  deckSummary,
  renameDeck,
  setCommander,
  setCardTagsResult,
  exportDeck,
} from "@scrychat/core";
import { parseDecklist } from "@scrychat/core";
import type { CardResolver, CardEntry } from "@scrychat/core";
import type { Card } from "@scrychat/core";
import type { DeckImportEntry } from "@scrychat/core";

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
    arena: card.arena,
  };
}

function toCardEntry(e: DeckImportEntry): CardEntry {
  return { name: e.name, count: e.count };
}

/**
 * Implements the deck_import tool's behavior. See registerTools() for the
 * inputSchema; this is factored out as a plain async function so it can be
 * called from inside `safe(...)` in the handler.
 */
async function deckImport(
  text: string,
  deckNameArg: string | undefined,
  modeArg: "new" | "existing" | undefined,
): Promise<unknown> {
  const parsed = parseDecklist(text);
  const parsedOut = { entries: parsed.entries, unparsed: parsed.unparsed };
  const commanderEntries = parsed.entries.filter((e) => e.commander);

  const mode: "new" | "existing" = modeArg ?? (commanderEntries.length > 0 ? "new" : "existing");

  if (mode === "existing") {
    if (!deckNameArg) {
      return { error: "deck_name required for existing-deck import", parsed: parsedOut };
    }
    const deck = await getDeck(deckNameArg, decksDir);
    if (!deck) {
      return { error: `Deck not found: ${deckNameArg}`, parsed: parsedOut };
    }
    const result = await addCards(deckNameArg, parsed.entries.map(toCardEntry), resolveCard, decksDir);
    const summary = await deckSummary(deckNameArg, resolveCard, decksDir);
    return {
      mode,
      added: result.added,
      rejected: result.rejected,
      unparsed: parsed.unparsed,
      summary,
    };
  }

  // mode === "new"
  let commanderName: string | undefined;
  let commanderNote: string | undefined;
  let nonCommanderEntries: DeckImportEntry[];

  if (commanderEntries.length === 1) {
    commanderName = commanderEntries[0].name;
    nonCommanderEntries = parsed.entries.filter((e) => e !== commanderEntries[0]);
  } else if (commanderEntries.length > 1) {
    // Partner/background pair or ambiguous multi-marker list. Phase 1: keep it
    // simple, use the first as commander, demote the rest to normal cards.
    commanderName = commanderEntries[0].name;
    commanderNote =
      `Multiple *CMDR* markers found; used "${commanderName}" as commander and treated ` +
      `the rest (${commanderEntries.slice(1).map((e) => e.name).join(", ")}) as normal cards ` +
      `(partner/background pairing is not auto-resolved in phase 1).`;
    nonCommanderEntries = parsed.entries.filter((e) => e !== commanderEntries[0]);
  } else {
    // Zero commander-marked entries but mode forced to "new": try to infer a
    // single legal-commander candidate by resolving every entry. Only done in
    // this rare forced path — the common (marked) path above never resolves.
    const candidateEntries: DeckImportEntry[] = [];
    for (const entry of parsed.entries) {
      const resolved = await resolveCard(entry.name);
      if (resolved && resolved.typeLine.includes("Legendary") && resolved.typeLine.includes("Creature")) {
        candidateEntries.push(entry);
      }
    }
    // Dedupe candidate NAMES for the needsCommander list (a duplicate legendary
    // line shouldn't make it look like 2 distinct candidates).
    const candidates = [...new Set(candidateEntries.map((e) => e.name))];
    if (candidates.length === 1) {
      commanderName = candidates[0];
      const commanderEntry = candidateEntries[0]; // first matching entry object
      nonCommanderEntries = parsed.entries.filter((e) => e !== commanderEntry);
    } else if (candidates.length > 1) {
      return { needsCommander: true, candidates, parsed: parsedOut };
    } else {
      return {
        error: "No commander found in list; specify deck_name + a commander.",
        parsed: parsedOut,
      };
    }
  }

  const deckName = deckNameArg ?? commanderName!;
  if (!deckNameArg) {
    const defaultNote = `deck_name not given; defaulted to commander name "${deckName}".`;
    commanderNote = commanderNote ? `${commanderNote} ${defaultNote}` : defaultNote;
  }

  let deck;
  try {
    deck = await createDeck(deckName, commanderName!, resolveCard, decksDir);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: message, parsed: parsedOut };
  }

  const result = await addCards(deckName, nonCommanderEntries!.map(toCardEntry), resolveCard, decksDir);
  const summary = await deckSummary(deckName, resolveCard, decksDir);

  return {
    mode,
    created: {
      name: deck.name,
      commander: deck.commander,
      commanderIdentity: deck.commanderIdentity.join(""),
    },
    ...(commanderNote ? { commanderNote } : {}),
    added: result.added,
    rejected: result.rejected,
    unparsed: parsed.unparsed,
    summary,
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
          arena: card.arena,
          brawlLegal: card.brawlLegal,
          standardBrawlLegal: card.standardBrawlLegal,
          historicLegal: card.historicLegal,
          timelessLegal: card.timelessLegal,
          producedMana: card.producedMana,
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
            members: role.members.map((c) => ({ n: c.name, usd: c.usd, ci: c.colorIdentity.join(""), arena: c.arena })),
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
        "Fetches a deck's full card list (grouped by tag) plus a deck report: quota check against " +
        "recommended counts (lands/ramp/draw/interaction/wipes), mana curve, and any color identity violations.",
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

        const report = await deckReport(name, resolveCard, decksDir);

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
        const summary = await deckSummary(name, resolveCard, decksDir);
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
        const summary = await deckSummary(name, resolveCard, decksDir);
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
      return safe(async () => deckImport(text, deck_name, mode));
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
        const summary = await deckSummary(deck_name, resolveCard, decksDir);
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
        const summary = await deckSummary(deck_name, resolveCard, decksDir);
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
        "Exports a saved deck as plain decklist TEXT for copy-paste (Moxfield/Archidekt/MTGA import-compatible). " +
        "format: 'plain' (default; commander marked with *CMDR*), 'mtga', or 'moxfield' (both use Commander/Deck section headers). " +
        "Returns { text } — the raw decklist. The model should paste this VERBATIM inside a markdown code fence; " +
        "never add [[card refs]] inside the fenced block.",
      inputSchema: {
        deck_name: z.string().describe("Deck name to export"),
        format: z.enum(["plain", "mtga", "moxfield"]).optional().describe("Export format, default 'plain'"),
      },
    },
    async ({ deck_name, format }) => {
      return safe(async () => {
        const text = await exportDeck(deck_name, format ?? "plain", decksDir);
        return { text };
      });
    },
  );
}

/** Exposed for tests/tools that need to clean up a throwaway deck. */
export { deleteDeck, decksDir };
