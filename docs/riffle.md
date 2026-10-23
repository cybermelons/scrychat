# Riffle view (spec)

Status: sections 1-3 built and deployed (c07f2ce, 6fb6f15), 2026-10-23. Sections 4 (piles) and 5 (stable state) are NOT built; the owner closed the work without them. Owner requests are quoted; decisions made
without the owner are marked **(guess)**. Change a guess by editing this file.

## Idea

"The deck view is always going to be a deck." Every view is a different way to
cut the same deck, and you riffle through it as if you held it in your hand.
"It should be like this is my deck that I'm holding."

## 1. Riffle

Owner: "scroll thru the deck like flipping thru a deck, we see the front facing
card, but the scroll view is a cascade of the headers, and settle on which ends
up the front of your deck pack."

- One card is the front card. It is fully visible.
- The other cards show only their header strip (the name bar, about the top 12-14%
  of the card) in a cascade.
- At rest the scroll snaps so that exactly 1 card is the front.
- At most 8 headers show in the cascade. Older headers collapse under it,
  so a 100-card deck keeps the front card on screen. **(guess)**
- Keyboard: ArrowDown/ArrowUp move 1 card. PageDown/PageUp move to the next or
  previous group.
- Main board only. **(guess)**

## 2. Direction and entry

Owner: "swiping down from the top will start pulling the riffle view down ...
you'll start pulling one or two names from the top of the sorted." Then: "down
from the top to start pulling and showing the cascade. If you pull the cascade
all the way down, then you're into a full riffle view."

- The normal deck view (the list) is the resting state.
- When you pull down at the top of the list, the cascade starts to show. The next 1 or 2 card names peel down first.
- If you release past about 40% of the pull, the view snaps to the full riffle view. **(guess: 40%)**
  If you release before that, the view snaps back to the list.
- In the riffle, a swipe down pulls the next card out of the cascade, and it becomes the front.
- To leave the riffle: pull up past its bottom, press Esc, or use the "↑ list" handle.
- The Flip and List buttons stay. They jump to the same 2 positions.
- A small mouse-wheel move at the list top must not enter the riffle by accident.
- Native scroll snap only. No gesture library.

## 3. Cuts (groups)

Owner: "if you want to filter or sort by tags, it would be splitting the deck
stack into its groups, and you're still riffling through the deck, but you have
handles to riffle by group to the next group. It's all about how you cut the
deck." And: "you can sort within the groups, or further subdivide your stacks.
That's all from that riffle view."

- A cut bar in the riffle: `Cut by [group]  then [sub-group]  sort [order]`.
  It reuses the existing group and sort keys of the deck panel (tag, type, CMC
  and so on).
- A cut splits the stack into sub-stacks in group order. The riffle still goes
  through the whole deck, 1 card at a time.
- Each group starts with a handle: a strip with the group name and card count.
  The handle stacks in the cascade like a header. A click on a handle jumps to
  the first card of that group.
- A rail of index tabs, 1 for each group, sits at the side. The current group is
  highlighted. At phone width the rail moves to the top or is dropped.
- The sort applies inside each group.
- 1 nested level: group, then sub-group. A sub-group handle is a smaller strip. **(guess: 2 levels)**
- A filter removes cards from the stack. The riffle covers only the rest.
- No cut: 1 stack, no handles.

## 4. Piles and hands

Owner: "you can have a hand ... or multiple hands ... multiple piles, and those
will pick from the deck. Click draw, and it'll draw from random or draw from
this, or pick from a pile and draw, and that'll add it to your hand and then
ghost it into the riffle view, or just remove it, whatever the setting is."

- A piles tray sits at the bottom of the riffle. It starts with 1 pile, "Hand".
  "+ pile" adds Pile 2, Pile 3 and so on. A click on a pile name renames it.
- Draw actions put the card into the selected pile:
  - Draw random: a random card from the stack, after the filter.
  - Draw from group: a random card from the group of the front card.
  - Take front: the front card.
  - Draw 7: a fresh hand. It uses the seeded shuffle in `packages/core/src/playtest.ts`.
- × on a pile card returns it to the deck. Reset returns all pile cards.
- Setting "Drawn cards: ghost | remove". Ghost keeps the card in the riffle,
  dimmed, with a pile badge. Remove takes it out of the stack. Default: ghost.
  **(guess)**
- A draw never edits the deck file.

## 5. Stable state

Owner: "variables are kept after reload, it should stay stable. It's like an
app on your phone."

- Each deck keeps its riffle state after a reload, or when you come back to it:
  - Riffle or list position.
  - The front card, stored by card name. If the card is gone, the nearest card takes its place.
  - The cut, sub-cut, sort and filter.
  - The piles (names, cards, the selected pile) and the ghost/remove setting.
- The view restores before first paint, with no visible jump.
- A deck rename moves the state. A deck delete or a draft discard removes it.
- Storage: localStorage key `sc:riffle:<deck name>`, so each browser keeps its own state. **(guess)**
  If you need the same state on every device, move it to `users/<email>/`.
- A missing or corrupt state gives the defaults. A pile card that is no longer in
  the deck is dropped.

## Not in scope yet

- Drag of cards between piles (only if cheap).
- State shared across devices.
- Cut levels deeper than 2.
