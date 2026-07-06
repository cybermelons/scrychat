// Client-side Scryfall card image lookup with in-memory cache.
// null = fetch failed / no image; undefined = not fetched yet.
const cache = new Map<string, string | null>();
const inflight = new Map<string, Promise<string | null>>();

type ScryfallCard = {
  image_uris?: { normal?: string; large?: string; small?: string };
  card_faces?: { image_uris?: { normal?: string; large?: string; small?: string } }[];
};

function extractImage(card: ScryfallCard): string | null {
  if (card.image_uris?.normal) return card.image_uris.normal;
  if (card.card_faces) {
    for (const face of card.card_faces) {
      if (face.image_uris?.normal) return face.image_uris.normal;
    }
  }
  return null;
}

export function getCardImage(name: string): Promise<string | null> {
  const key = name.toLowerCase();
  if (cache.has(key)) return Promise.resolve(cache.get(key) ?? null);
  const pending = inflight.get(key);
  if (pending) return pending;

  const p = fetch(
    `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`
  )
    .then((r) => (r.ok ? r.json() : null))
    .then((card: ScryfallCard | null) => {
      const url = card ? extractImage(card) : null;
      cache.set(key, url);
      inflight.delete(key);
      return url;
    })
    .catch(() => {
      cache.set(key, null);
      inflight.delete(key);
      return null;
    });

  inflight.set(key, p);
  return p;
}
