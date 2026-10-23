type Drafty = { name: string; draft?: true };

/** Prefill for the Save-draft name prompt: the commander's name, else empty. */
export const draftSaveName = (commander: string): string => commander.trim();

/** Draft bar text for the open deck, or null when the deck is a saved one. */
export const draftBarText = (d: { draft?: true } | null): string | null =>
  d?.draft ? "New deck — unsaved" : null;

/** Where to go after discarding: the deck open before New deck, if it still exists, else the first saved deck. */
export function afterDiscard(list: Drafty[], prev: string | null): string | null {
  const saved = list.filter((d) => !d.draft);
  return saved.find((d) => d.name === prev)?.name ?? null;
}
