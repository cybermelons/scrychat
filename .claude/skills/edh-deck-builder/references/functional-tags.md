# Functional Tags Reference

Generated from Scryfall's oracle_tags bulk export. Do not hand-edit — regenerate with:

```
pnpm --filter @scrychat/core build-tag-index
```

Each line: `slug | label | count | parent | description`. `count` is the number of cards tagged (from the bulk export's per-card taggings). `parent` is the immediate parent slug, or `-` for top-level tags.

## 40k model (`40k-model`)

40k-model | 40k model | 128 | - | Cards named after and representing a Warhammer 40,000 model.

## activated ability (`activated-ability`)

activate-from-command-zone | activate from command zone | 3 | activated-ability | -
activate-from-exile | activate from exile | 5 | activated-ability | Abilities that can be activated from exile.
activate-from-graveyard | activate from graveyard | 192 | activated-ability | Abilities that can be activated from inside a graveyard.
activate-from-hand | activate from hand | 529 | activated-ability | Activated abilities that can be activated from your hand.
activate-from-stack | activate from stack | 3 | activated-ability | Abilities that can be activated from an object on the stack.
activated-ability | activated ability | 9026 | - | Cards with activated abilities.
crew | crew | 198 | activated-ability | Compilation tag for the Crew keyword. Should be 1:1 with [kw:crew](https://scryfall.com/search?q=kw%3Acrew).
exhaust | exhaust | 103 | activated-ability | Abilities that you can only activate once.

## addendum (`addendum`)

addendum | addendum | 18 | - | Instant-speed cards that do something extra if you played them during your main phase.

## adds multiple mana (`adds-multiple-mana`)

adds-multiple-mana | adds multiple mana | 519 | - | Cards that add more than one mana at a time.

## aesthetic counter (`aesthetic-counter`)

aesthetic-counter | aesthetic counter | 301 | - | Counters that have no rules meaning, just aesthetic.
functional-reminder-counter | functional reminder counter | 17 | aesthetic-counter | Arbitrarily long effects tracked with a counter, such that removing the counter functionally changes the tracked effect…
nonfunctional-reminder-counter | nonfunctional reminder counter | 13 | aesthetic-counter | Effects that last forever tracked with a nonfunctional reminder counter, such that removing the counter makes no functi…

## aikido (`aikido`)

aikido | aikido | 154 | - | Effects that turn your opponent's strength against them.

## alt-commander (`alt-commander`)

alt-commander | alt-commander | 32 | - | Legendary creatures printed as backup commanders in preconstructed decks, with the same color identity as the face comm…

## alternate-cost-gain-life (`alternate-cost-gain-life`)

alternate-cost-gain-life | alternate-cost-gain-life | 3 | - | Cards that let you give your opponents life to play them for less or no mana

## alternate-equip-cost (`alternate-equip-cost`)

alternate-equip-cost | alternate-equip-cost | 29 | - | -

## alternate win condition (`alternate-win-condition`)

alternate-win-condition | alternate win condition | 83 | - | New ways for you to win the game (or cause your opponent to lose)

## animate dead-like (`animate-dead-like`)

animate-dead-like | animate dead-like | 7 | - | Enchantments that put stuff on the battlefield and then become Auras enchanting those things.

## anthem (`anthem`)

anthem | anthem | 466 | - | Your entire team gets +N/+N. Possibly limited to creature types or colors.

## any player ability (`any-player-ability`)

any-player-ability | any player ability | 41 | - | -

## arc lightning (`arc-lightning`)

arc-lightning | arc lightning | 15 | - | Deals X damage divided as you choose among one, two, or three targets.

## armoring (`armoring`)

armoring | armoring | 43 | - | A toughness-pumping ability. See also [firebreathing] in red and [shade pump] in black.

## artifact matters (`artifact-matters`)

artifact-matters | artifact matters | 1 | - | -

## attacking matters (`attacking-matters`)

affinity-for-attacking | affinity for attacking | 9 | attacking-matters | -
attacking-matters | attacking matters | 1214 | - | Cards that care about you attacking.
attacking-opponents-matters | attacking opponents matters | 15 | attacking-matters | Cards that synergize with any attacker, as long as they're attacking an opponent of the card's controller.
gains-battle-cry | gains battle cry | 2 | attacking-matters | -
gives-firebending | gives firebending | 4 | attacking-matters | -

## attacking matters-any (`attacking-matters-any`)

attacking-matters-any | attacking matters-any | 14 | - | Cards that care about anyone attacking.

## attacking matters-self (`attacking-matters-self`)

attacking-matters-self | attacking matters-self | 1592 | - | Cards that care about themselves attacking.
gains-firebending | gains firebending | 1 | attacking-matters-self | -

## auto buyback (`auto-buyback`)

auto-buyback | auto buyback | 24 | - | Derived from the buyback keyword, this ability will automatically return a card to your hand after casting it usually a…

## bablovian faction leader (`bablovian-faction-leader`)

bablovian-faction-leader | bablovian faction leader | 8 | - | -

## ball lightning (`ball-lightning`)

ball-lightning | ball lightning | 41 | - | A high-damage one-turn creature.

## battalion (`battalion`)

battalion | battalion | 25 | - | Attacking with at least two other creatures matters.

## behold (`behold`)

behold | behold | 18 | - | Cards that have an effect if you control something or reveal from your hand a card with a specific attribute.

## bible reference (`bible-reference`)

bible-reference | bible reference | 5 | - | Cards that were originally explicitly based on The Bible

## birthing pod (`birthing-pod`)

birthing-pod | birthing pod | 16 | - | Derived from the titular card, this refers to the ability that allows to sacrifice a permanent, search your library for…

## black effect (`black-effect`)

black-effect | black effect | 0 | - | Effects which are iconically black.
deal-with-the-devil | deal with the devil | 44 | black-effect | Black enchantments that come with a major drawback that could doom you. See also [Lich effect](/tags/card/lich-effect)
discard | discard | 577 | black-effect | Gets cards out of your opponent's hand and into their graveyard.
hungry-demon | hungry demon | 29 | black-effect | Cards that make you sacrifice a creature, either automatically or with a downside if you can't or won't.
life-for-cards | life for cards | 281 | black-effect | Get cards in exchange for your life (damage causes loss of life).
no-mercy | no mercy | 7 | black-effect | Cards that destroy creatures that damage you.
thoughtseize | thoughtseize | 144 | black-effect | Opponent reveals their hand, and you choose a card for them to discard.
torment | torment | 17 | black-effect | A stock punisher effect where you force an opponent to choose between discarding, sacrificing, or losing life.
tutor-card | tutor-card | 111 | black-effect | Cards that tutor any cards.

## block additional (`block-additional`)

block-additional | block additional | 30 | - | Block additional creatures beyond just the one.
block-unlimited | block unlimited | 12 | block-additional | Block an unlimited, or practically unlimited, number of creatures.

## block when tapped (`block-when-tapped`)

block-when-tapped | block when tapped | 2 | - | -

## block without creature (`block-without-creature`)

block-without-creature | block without creature | 5 | - | These cards make something be blocked ... without anything actually doing the blocking.

## blood moon effect (`blood-moon-effect`)

blood-moon-effect | blood moon effect | 20 | - | Derived from the titular card, this refers to the effect in which lands lose their land type and/or abilities, being re…

## blue effect (`blue-effect`)

blue-effect | blue effect | 0 | - | Effects which are iconically blue.
counterspell | counterspell | 96 | blue-effect | Spells that counter stuff. See child tags for variants on the behaviour; notably [counterspell-soft](/tags/card/counter…
extra-turn | extra turn | 64 | blue-effect | -
loot | loot | 109 | blue-effect | Draw a card, then discard a card. Mainly blue. See also [rummage](/tags/card/rummage), the red version, which discards…
loot-to-library | loot to library | 9 | blue-effect | Draw, then shuffle cards into your library or put them on the bottom of it. Contrast [brainstorm](brainstorm).
removal-bounce | removal-bounce | 362 | blue-effect | -

## board-reset (`board-reset`)

board-reset | board-reset | 3 | - | -

## borrow ability (`borrow-ability`)

borrow-ability | borrow ability | 23 | - | Cards that give themselves or other creatures keyword abilities if something else has it. See also [keyword soup](keywo…

## bottom of library matters (`bottom-of-library-matters`)

bottom-of-library-matters | bottom of library matters | 12 | - | -

## bounce (`bounce`)

alternate-cost-bounce | alternate-cost-bounce | 6 | bounce | Cards that let you return permanents to your hand to play them for less/no mana
bounce | bounce | 6 | - | Returning a permanent from the battlefield to its owner's hand
bounce-self | bounce-self | 161 | bounce | -
removal-bounce | removal-bounce | 362 | bounce | -
rescue | rescue | 4 | bounce | Bounce something you control.

## bounty (`bounty`)

bounty | bounty | 12 | - | -

## breaks-ktk-morph-rule (`breaks-ktk-morph-rule`)

breaks-ktk-morph-rule | breaks-ktk-morph-rule | 35 | - | Cards with morph (or a similar ability) which break the Khans of Tarkir block development rule which stated that a morp…

## bring your own crew (`bring-your-own-crew`)

bring-your-own-crew | bring your own crew | 26 | - | A vehicle (or spacecraft) that comes with a built-in pilot to crew (or station) it.

## buff mana (`buff-mana`)

buff-mana | buff mana | 32 | - | Mana that comes with additional benefits when spent.

## buff pact (`buff-pact`)

buff-pact | buff pact | 9 | - | Tap something to buff a creature; if that creature leaves play, destroy whatever buffed it. Was also used as an early w…

## burn (`burn`)

bombard | bombard | 96 | burn | Sacrifice something else to deal N damage. See also [fling](/tags/card/fling), [bombard-self](bombard-self).
bombard-self | bombard-self | 134 | burn | Sacrifice this permanent to deal N damage. See also [fling-self](/tags/card/fling-self), [bombard](bombard).
burn | burn | 0 | - | Effects that deal damage, whether to creatures, players, or planeswalkers.
burn-battle | burn battle | 13 | burn | -
burn-player | burn player | 876 | burn | -
removal-burn | removal-burn | 0 | burn | -

## burn-you (`burn-you`)

burn-player-each | burn player-each | 131 | burn-you | -
burn-you | burn-you | 139 | - | Sometimes your own cards hurt you the most.

## card advantage (`card-advantage`)

card-advantage | card advantage | 71 | - | Things that give you access to more cards. (The technical meaning of card advantage can be much broader than this, but…
consult | consult | 35 | card-advantage | Dig through your library until you find a card meeting some criteria.
draw | draw | 0 | card-advantage | Spells and abilities that textually draw you cards. See also [pure draw](pure-draw).
impulse | impulse | 65 | card-advantage | Look at the top N cards and put 1+ of them into your hand. Not to be confused with Red's pseudo-card-draw effect, [impu…
impulsive-draw | impulsive draw | 31 | card-advantage | Cards which let you cast a card for a limited time off the top of a library (via exile). Use it or lose it. Typically a…
impulsive-mill | impulsive mill | 5 | card-advantage | -
land-or-hand | land or hand | 16 | card-advantage | -
life-for-cards | life for cards | 281 | card-advantage | Get cards in exchange for your life (damage causes loss of life).
regrowth | regrowth | 36 | card-advantage | Effects that return cards from your graveyard to your hand.
repeatable-card-advantage | repeatable card advantage | 217 | card-advantage | Things that give you access to more cards, repeatably.
seek | seek | 0 | card-advantage | -
tome | tome | 128 | card-advantage | Providing incremental card advantage over time (usually by tapping to draw cards, although there are variants that [tut…

## card game reference (`card-game-reference`)

card-game-reference | card game reference | 5 | - | A series of cards in Mystery Booster 2 that reference other card games.

## card names (`card-names`)

alliteration | alliteration | 4344 | card-names | Cards that alliterate, either properly or per Treacherous Trapezist.
anagram | anagram | 45 | card-names | Cards whose names are intentional anagrams.
card-names | card names | 0 | - | A collection of tags identifying properties and naming schemes in cards.
creature-type-name | creature type name | 46 | card-names | Cards with names comprised of creature types.
dnd-spell | dnd spell | 42 | card-names | Cards originally from DnD sets that are named after and representing DnD spells.
doctor-who-episode-name | doctor who episode name | 20 | card-names | -
eponymous | eponymous | 91 | card-names | Non-token cards with a name matching their subtypes.
eponymous-planeswalker | eponymous planeswalker | 34 | card-names | Planeswalker cards that are just the full names of the character in question
fallout-perk-name | fallout perk name | 6 | card-names | -
fallout-vault-saga | fallout vault saga | 8 | card-names | -
game-name | game name | 31 | card-names | Cards that are named after game terms.
inscryption-achievement | inscryption achievement | 40 | card-names | Cards that share a name with achievements in the PC game Inscryption
marvel-storyline-name | marvel storyline name | 4 | card-names | -
mathy-name | mathy name | 22 | card-names | -
mob-name | mob name | 11 | card-names | -
namesake-spell | namesake spell | 1616 | card-names | Spells (or, mostly spells) with names that identify them with a specific named character.
onomatopoeia | onomatopoeia | 15 | card-names | Boom! Crash! Kapow!
portmanteau | portmanteau | 145 | card-names | Cards named with a portmanteau—a word that's a combination of two words.
preexisting-dnd-background | preexisting dnd background | 20 | card-names | Cards named after Dungeons &amp; Dragons backgrounds that already exist! 🎲
punny-name | punny name | 520 | card-names | Names that are puns or otherwise a play on words
quote-name | quote name | 29 | card-names | Card names that are explicitly based on an existing quote.
real-life-animal-name | real life animal name | 60 | card-names | Card names that match real world english animal names. "Manta ray" is accepted, while "Hurr jackal" is not. Adjectives…
rhyming-name | rhyming name | 159 | card-names | Cards whose names contain a rhyme, or come very close to it.
roman-numeral | roman numeral | 14 | card-names | Cards with a roman numeral in the name.
school-name | school name | 16 | card-names | -
shares-name-with-a-format | shares name with a format | 7 | card-names | -
shares-name-with-a-mechanic | shares name with a mechanic | 44 | card-names | Regardless of whether it relates to that mechanic.
shares-name-with-a-set | shares name with a set | 32 | card-names | -
single-english-word-name | single english word name | 1297 | card-names | Cards named with a single word in English. This may be a compound word.
sports-name | sports name | 13 | card-names | -
three-letter-name | three-letter name | 28 | card-names | -
tongue-twister | tongue twister | 8 | card-names | Try saying any of these card names three times fast!

## card types matter (`card-types-matter`)

card-types-in-graveyard-matter | card types in graveyard matter | 105 | card-types-matter | Cards that care about the card types of cards in a graveyard.
card-types-matter | card types matter | 14 | - | -
imprinted-card-types-matter | imprinted card types matter | 8 | card-types-matter | Cards that care about the card types of other cards that they've exiled with a linked ability.

## cards in exile matter (`cards-in-exile-matter`)

cards-in-exile-matter | cards in exile matter | 20 | - | Mechanics that care about the cards in Exile.

## cards in graveyard matter (`cards-in-graveyard-matter`)

affinity-for-graveyard | affinity for graveyard | 1 | cards-in-graveyard-matter | -
card-types-in-graveyard-matter | card types in graveyard matter | 105 | cards-in-graveyard-matter | Cards that care about the card types of cards in a graveyard.
cards-in-graveyard-matter | cards in graveyard matter | 172 | - | Mechanics that care about the cards in one or more graveyards.
lands-in-graveyard-matter | lands in graveyard matter | 28 | cards-in-graveyard-matter | -
lhurgoyf | lhurgoyf | 75 | cards-in-graveyard-matter | Cards with power and/or toughness equal to number of cards in the graveyard, or a similar variant. This term is referen…
threshold | threshold | 109 | cards-in-graveyard-matter | Cards that care about you having seven or more cards in your graveyard.
undergrowth | undergrowth | 116 | cards-in-graveyard-matter | Cards that care about the number of creature cards in your graveyard.

## cast on resolution (`cast-on-resolution`)

cast-on-resolution | cast on resolution | 410 | - | Spells and abilities that let you cast spells as part of their resolution.
demilich-effect | demilich effect | 32 | cast-on-resolution | Exiles cards from graveyard, but lets you cast copies of them. Essentially (usually) one-time recursion
expertise | expertise | 14 | cast-on-resolution | Effects that allow you to cast a card with a given mana value or less from your hand without paying its mana cost, usua…
gives-madness | gives madness | 1 | cast-on-resolution | -
gives-miracle | gives miracle | 4 | cast-on-resolution | -
gives-rebound | gives rebound | 5 | cast-on-resolution | -
gives-suspend | gives suspend | 17 | cast-on-resolution | -
madness | madness | 63 | cast-on-resolution | The specific keyword, madness (Used for applying specific subtags)

## castable from nonhand (`castable-from-nonhand`)

castable-from-exile | castable from exile | 430 | castable-from-nonhand | Cards you can cast or access from exile.
castable-from-graveyard | castable from graveyard | 403 | castable-from-nonhand | Cards you can cast or access from the graveyard.
castable-from-library | castable from library | 5 | castable-from-nonhand | Cards you can cast or access from your library.
castable-from-nonhand | castable from nonhand | 0 | - | -

## casting restriction (`casting-restriction`)

casting-restriction | casting restriction | 8 | - | Spells with unusual conditions restricting their casting.
mana-restriction | mana restriction | 7 | casting-restriction | Spells with unusual restrictions on how they can be paid for.
timing-restriction | timing restriction | 10 | casting-restriction | Spells with unusual restrictions on when they can be cast.

## catch-22 (`catch-22`)

catch-22 | catch-22 | 16 | - | At the end of turn, if a condition isn't met, a consequence is given.
werewolf-mechanic | werewolf mechanic | 69 | catch-22 | Going a turn without casting spells transforms this to its back face. Casting two spells in a turn returns it to the fr…

## catch up (`catch-up`)

catch-up | catch up | 94 | - | Players who have less get more.

## chain spell (`chain-spell`)

chain-spell | chain spell | 9 | - | -

## change target (`change-target`)

change-target | change target | 47 | - | Cards that change the targets of something on the stack.

## characteristic-defining ability (`characteristic-defining-ability`)

cda-color | cda-color | 146 | characteristic-defining-ability | -
cda-power | cda-power | 249 | characteristic-defining-ability | Creatures that have their power determined by a characteristic-defining ability.
cda-subtype | cda-subtype | 8 | characteristic-defining-ability | -
cda-toughness | cda-toughness | 190 | characteristic-defining-ability | Creatures whose toughness is determined via a characteristic-defining ability.
characteristic-defining-ability | characteristic-defining ability | 0 | - | Cards that have an ability that define something about it that would normally be found somewhere else on the card. Spei…

## cheaper than mv (`cheaper-than-mv`)

cheaper-than-mv | cheaper than mv | 1352 | - | The actual cost you pay for an effect (or for an alternate mode) will often be lower than the card's mana value.
discount-self | discount-self | 204 | cheaper-than-mv | Cards that have a way to reduce their own cost
pitch-spell | pitch spell | 3 | cheaper-than-mv | Cards that let you discard or exile another card from your hand to cast for less or no mana
potentially-free | potentially free | 36 | cheaper-than-mv | Cards that can be played without spending any resources (Mana, life, tapping creatures, etc). Cards must be able to be…

## cheat death (`cheat-death`)

cheat-death | cheat death | 98 | - | Return a creature or permanent to the battlefield or to your hand at the moment it dies.
cheat-death-self | cheat death-self | 102 | cheat-death | Cards that return themselves to the battlefield or to your hand at the moment they die.
earthbend | earthbend | 36 | cheat-death | Collection tag used to apply the various tags that comprise the keyword Earthbend. Should be 1:1 with kw:earthbend.
gives-persist | gives persist | 7 | cheat-death | -
gives-undying | gives undying | 4 | cheat-death | -

## class type only (`class-type-only`)

class-type-only | class type only | 59 | - | These creatures have only a class type, and no type correlating to whatever fantasy race they might belong to.

## coin flip (`coin-flip`)

coin-flip | coin flip | 89 | - | Cards that flip coins. For cards that care about coin flips see [coin flips matter](coin-flips-matter).

## coin flips matter (`coin-flips-matter`)

coin-flips-matter | coin flips matter | 12 | - | -

## color break (`color-break`)

color-break | color break | 154 | - | Cards known to break the modern color pie, granting a color access to something it shouldn't be able to do.

## color change (`color-change`)

any-zone-color-change | any zone color change | 3 | color-change | -
color-change | color change | 162 | - | -
color-change-self | color change-self | 88 | color-change | -

## color-choose-land (`color-choose-land`)

color-choose-land | color-choose-land | 27 | - | Lands that produce a mana of the color you specified when entering

## color count matters (`color-count-matters`)

color-count-matters | color count matters | 7 | - | Cards that care about how many colors a card has.

## color ward (`color-ward`)

color-ward | color ward | 2 | - | -

## combat manipulation (`combat-manipulation`)

combat-arbiter | combat arbiter | 10 | combat-manipulation | Cards that limit how many can attack and/or block in some way.
combat-manipulation | combat manipulation | 0 | - | -
control-attacker | control attacker | 7 | combat-manipulation | -
control-blocker | control blocker | 11 | combat-manipulation | -
force-attacker | force attacker | 168 | combat-manipulation | -
force-blocker | force blocker | 33 | combat-manipulation | -

## combat ping (`combat-ping`)

combat-ping | combat ping | 19 | - | Cards that deal a small amount of damage during the combat step.

## combat trick (`combat-trick`)

combat-trick | combat trick | 713 | - | Effects that can be used during combat to help a creature survive, destroy opposing creatures, or deal additional comba…
giant-growth | giant growth | 169 | combat-trick | Combat tricks that give a creature +N/+N. See also [Enlarge](enlarge).

## commander matters (`commander-matters`)

commander-identity-matters | commander identity matters | 10 | commander-matters | Cards that care about your commander's color identity.
commander-matters | commander matters | 0 | - | Cards that care about commander mechanics. See child tags for the specific mechanics being engaged in.
commander-tax-evasion | commander tax evasion | 11 | commander-matters | Don't pay the {2}, become a tax evader! These effects replace, discount, or eliminate commander tax.
commander-tax-matters | commander tax matters | 16 | commander-matters | The extra mana paid to recast your commander matters to these cards.
recasting-commander-matters | recasting commander matters | 14 | commander-matters | These cards care about you recasting your commander, or the number of times it's been cast.

## commander set booster cards (`commander-set-booster-cards`)

commander-set-booster-cards | commander set booster cards | 100 | - | Card that debuted in a Commander Set but were only obtainable through boosters of the set it was released with.

## conditional aura (`conditional-aura`)

conditional-aura | conditional aura | 14 | - | Auras that have a different effect depending on what is being enchanted.

## conditional control (`conditional-control`)

conditional-control | conditional control | 3 | - | -

## conditional tapland (`conditional-tapland`)

boltland | boltland | 1 | conditional-tapland | Lands you can pay 3 life/take 3 damage to have them enter untapped.
conditional-tapland | conditional tapland | 16 | - | Lands that will enter the battlefield tapped or untapped depending on certain conditions.
shockland | shockland | 1 | conditional-tapland | Lands which enter tapped unless you pay two life.

## cone spell (`cone-spell`)

cone-spell | cone spell | 10 | - | Based on Cone of Flame, these are cards with a theme of doing something three times with the values 1, 2, and 3.

## control changing effects (`control-changing-effects`)

control-changing-effects | control changing effects | 0 | - | Effects that change control of cards, permanents, and spells.
defector | defector | 66 | control-changing-effects | Permanents that move around the board on their own
donate | donate | 75 | control-changing-effects | Effects that give control of a card you control to another player
exchange-control | exchange control | 46 | control-changing-effects | -
theft | theft | 20 | control-changing-effects | Effects that let you steal cards and resources from your opponent.

## copy (`copy`)

clone | clone | 72 | copy | Cards that enter as copies of other things
copy | copy | 7 | - | Effects that copy things
copy-ability | copy-ability | 50 | copy | -
copy-artifact | copy-artifact | 69 | copy | -
copy-aura | copy-aura | 24 | copy | -
copy-creature | copy-creature | 357 | copy | -
copy-enchantment | copy-enchantment | 17 | copy | -
copy-equipment | copy-equipment | 28 | copy | -
copy-instant | copy-instant | 158 | copy | -
copy-land | copy-land | 17 | copy | -
copy-legendary | copy-legendary | 47 | copy | These cards can give you a copy of a legendary permanent you control that you can actually keep (instead of immediately…
copy-noncreature | copy-noncreature | 4 | copy | -
copy-nonland | copy-nonland | 10 | copy | Effects that allow you to copy permanents of any type except for land.
copy-planeswalker | copy-planeswalker | 16 | copy | -
copy-self | copy-self | 309 | copy | Cards that make a copy of themselves
copy-sorcery | copy-sorcery | 153 | copy | -
copy-spell | copy-spell | 151 | copy | Make a copy of a spell on the stack.
copy-token | copy-token | 55 | copy | Effects that copy specifically tokens, like populate.
reanimate-copy | reanimate copy | 52 | copy | "Brings back" a copy of a permanent card in a graveyard instead of the original. Could be a token copy, could be turnin…
shapesharing | shapesharing | 68 | copy | Something on the battlefield becomes a copy of something else.

## cost ignorer (`cost-ignorer`)

cost-ignorer | cost ignorer | 121 | - | -
sneak | sneak | 15 | cost-ignorer | Put a permanent from your hand onto the battlefield. (With or without a requirement to sacrifice it later.) Not related…
sneak-from-library | sneak from library | 17 | cost-ignorer | -

## cost increaser (`cost-increaser`)

cost-increaser | cost increaser | 73 | - | -

## cost reducer (`cost-reducer`)

cost-reducer | cost reducer | 155 | - | Cards that make other spells cost less. (Does not apply to effects that reduce a spell's own cost, like delve.)
cost-reducer-activated-ability | cost-reducer-activated-ability | 24 | cost-reducer | -
cost-reducer-artifact | cost-reducer-artifact | 19 | cost-reducer | -
cost-reducer-battle | cost-reducer-battle | 1 | cost-reducer | -
cost-reducer-colored-mana | cost-reducer-colored-mana | 21 | cost-reducer | -
cost-reducer-creature | cost-reducer-creature | 51 | cost-reducer | -
cost-reducer-enchantment | cost-reducer-enchantment | 9 | cost-reducer | -
cost-reducer-equip-ability | cost-reducer-equip-ability | 19 | cost-reducer | -
cost-reducer-instant | cost-reducer-instant | 2 | cost-reducer | -
cost-reducer-legendary | cost-reducer-legendary | 3 | cost-reducer | -
cost-reducer-noncreature | cost-reducer-noncreature | 9 | cost-reducer | -
cost-reducer-nonland | cost-reducer-nonland | 1 | cost-reducer | -
cost-reducer-planeswalker | cost-reducer-planeswalker | 4 | cost-reducer | -
cost-reducer-sorcery | cost-reducer-sorcery | 1 | cost-reducer | -
gives-affinity | gives affinity | 17 | cost-reducer | -
gives-convoke | gives convoke | 14 | cost-reducer | -
gives-improvise | gives improvise | 5 | cost-reducer | -
gives-undaunted | gives undaunted | 1 | cost-reducer | -

## counter increaser (`counter-increaser`)

counter-doubler | counter doubler | 63 | counter-increaser | -
counter-increaser | counter increaser | 19 | - | -

## counters matter (`counters-matter`)

counter-fuel | counter fuel | 0 | counters-matter | Remove counters to do something.
counter-preservation | counter preservation | 12 | counters-matter | When something else leaves, put its counters on another thing
counter-preservation-self | counter preservation-self | 43 | counters-matter | When this thing leaves, put its counters on something else you control.
counters-matter | counters matter | 287 | - | -
counters-remain | counters remain | 2 | counters-matter | Counters don't leave when they normally would.
mm-counters-matter | mm counters matter | 28 | counters-matter | Cards that care about -1/-1 counters in some way.
oil-counters-matter | oil counters matter | 17 | counters-matter | -
pp-counters-matter | pp counters matter | 349 | counters-matter | -
synergy-modified | synergy-modified | 48 | counters-matter | -
unique-counters-matter | unique counters matter | 8 | counters-matter | -

## counts as a type (`counts-as-a-type`)

counts-as-a-type | counts as a type | 25 | - | Cards that used the deprecated "counts as a ..." language in their early prints.

## cr 107.3f x card (`cr-107-3f-x-card`)

cr-107-3f-x-card | cr 107.3f x card | 28 | - | 107.3f - Sometimes X appears in the text of a spell or ability but not in a mana cost, alternative cost, additional cos…

## creates oracle copy (`creates-oracle-copy`)

creates-oracle-copy | creates oracle copy | 6 | - | These cards create a copy of an Oracle card by name and cast it. (CR 707.13)

## creates oracle token (`creates-oracle-token`)

creates-oracle-token | creates oracle token | 24 | - | These cards create a token version of an Oracle card by name (CR 111.11)

## creature-ability-noncreature (`creature-ability-noncreature`)

creature-ability-noncreature | creature-ability-noncreature | 59 | - | Noncreature, non-Vehicle, non-Spacecraft permanents with abilities that become more relevant when they're animated as c…

## creature count matters (`creature-count-matters`)

affinity-for-creatures | affinity for creatures | 7 | creature-count-matters | -
creature-count-matters | creature count matters | 187 | - | -
outnumber | outnumber | 26 | creature-count-matters | Deal damage to a creature based on your creature count.
warlord | warlord | 71 | creature-count-matters | This creature's P/T is equal to the number of creatures you control. Named in the Color Pie 2017 article.

## creature type bodyguard (`creature-type-bodyguard`)

creature-type-bodyguard | creature type bodyguard | 3 | - | -

## creature type enchantress (`creature-type-enchantress`)

creature-type-enchantress | creature type enchantress | 3 | - | -

## creature type fungusaur (`creature-type-fungusaur`)

creature-type-fungusaur | creature type fungusaur | 1 | - | -

## creature type guardian (`creature-type-guardian`)

creature-type-guardian | creature type guardian | 10 | - | -

## creature type hero (`creature-type-hero`)

creature-type-hero | creature type hero | 3 | - | The Hero type originally appeared on several older cards before being deprecated in the Grand Creature Type Update of 2…

## creature type lycanthrope (`creature-type-lycanthrope`)

creature-type-lycanthrope | creature type lycanthrope | 2 | - | -

## creature type monster (`creature-type-monster`)

creature-type-monster | creature type monster | 3 | - | -

## creature type phantasm (`creature-type-phantasm`)

creature-type-phantasm | creature type phantasm | 5 | - | -

## creature type ship (`creature-type-ship`)

creature-type-ship | creature type ship | 15 | - | These were ships, but now are the type that is crewing them (Not the keyword, you know what I mean)

## creature type townsfolk (`creature-type-townsfolk`)

creature-type-townsfolk | creature type townsfolk | 12 | - | -

## creature type undead (`creature-type-undead`)

creature-type-undead | creature type undead | 3 | - | -

## crewless vehicle (`crewless-vehicle`)

crewless-vehicle | crewless vehicle | 21 | - | -

## cross-game card (`cross-game-card`)

cross-game-card | cross-game card | 1 | - | -

## cunning (`cunning`)

cunning | cunning | 5 | - | If X attacks and isn't blocked, you may choose to have it deal damage to another target. If done so, X will deal no com…

## cycle (`cycle`)

cycle | cycle | 0 | - | All the cycles from Magic history.
nemesis-mega-cycle | nemesis-mega-cycle | 3 | cycle | A currently incomplete cycle of creatures printed in commander precons that provide a pseudo-targeted static ability th…
vertical-cycle | vertical-cycle | 0 | cycle | Cycles where the cards are in different states of progressions, usually by increasing costs, effects, and/or colors.

## cycling-non-mana (`cycling-non-mana`)

cycling-non-mana | cycling-non-mana | 2 | - | -

## damage increaser (`damage-increaser`)

damage-increaser | damage increaser | 30 | - | Things deal +N damage. See also [damage multiplier](/tags/card/damage-multiplier).

## damage multiplier (`damage-multiplier`)

damage-multiplier | damage multiplier | 53 | - | Things deal double or triple damage. See also [damage increaser](/tags/card/damage-increaser).

## damage prevention (`damage-prevention`)

ablative-armor | ablative armor | 21 | damage-prevention | Lose counters instead of taking damage
absorb | absorb | 24 | damage-prevention | A static ability preventing a fixed number of damage to permanents or players.
circle-of-protection | circle of protection | 8 | damage-prevention | -
damage-prevention | damage prevention | 372 | - | -
damage-redirection | damage redirection | 51 | damage-prevention | -
dolmen-ability | dolmen ability | 9 | damage-prevention | Derived from the titular card, this ability prevents all combat damage that would be dealt to attacking creatures you c…
fog | fog | 35 | damage-prevention | Effects that can prevent all or most of the damage from an entire combat, similar to the card Fog. See also [pseudo-fog…

## damage prevention-permanent (`damage-prevention-permanent`)

damage-prevention-permanent | damage prevention-permanent | 3 | - | -

## damage prevention-player (`damage-prevention-player`)

damage-prevention-player | damage prevention-player | 24 | - | -

## damage prevention-self (`damage-prevention-self`)

damage-prevention-self | damage prevention-self | 104 | - | -

## damage prevention-you (`damage-prevention-you`)

damage-prevention-you | damage prevention-you | 160 | - | -

## damage stays (`damage-stays`)

damage-stays | damage stays | 7 | - | Cards that prevent damage from being removed from one or more creatures during cleanup steps.

## day/night (`day-night`)

day-night | day/night | 53 | - | Effects that make use of or interact with the Day/Night mechanic introduced in Innistrad: Midnight Hunt, including but…

## deck requirement (`deck-requirement`)

deck-requirement | deck requirement | 28 | - | Cards that require you to have a deck with specific attributes, or with an effect that requires you to have your deck b…

## delayed payment (`delayed-payment`)

delayed-payment | delayed payment | 7 | - | Cards which you can play now, and pay for later

## delayed replacement effect (`delayed-replacement-effect`)

delayed-replacement-effect | delayed replacement effect | 34 | - | -

## depletion land (`depletion-land`)

depletion-land | depletion land | 0 | - | -

## deprecated card types (`deprecated-card-types`)

deprecated-card-types | deprecated card types | 0 | - | Cards featuring deprecated card types in some of their prints.
deprecated-legend-type | deprecated legend type | 204 | deprecated-card-types | These cards were originally printed with the Legend creature type. Their type line read “Summon Legend” or “Creature —…
interrupt | interrupt | 52 | deprecated-card-types | This spell was an interrupt before Sixth Edition Rules introduced the stack.
mana-source-type | mana source (type) | 2 | deprecated-card-types | These cards had the deprecated mana source type during some of their prints.

## deprecated mechanics (`deprecated-mechanics`)

ante-matters | ante matters | 8 | deprecated-mechanics | Ante is a depreciated game mechanic where players would remove the top card of their deck from the game and give it to…
delayed-cantrip | delayed cantrip | 59 | deprecated-mechanics | Draw a card next turn.
deprecated-legend-restriction | deprecated legend restriction | 3 | deprecated-mechanics | Until Champions of Kamigawa introduced the Legendary Supertype, the Legend rule was built into the creature type, meani…
deprecated-mechanics | deprecated mechanics | 0 | - | Mechanics that have been deprecated by newer developments.
deprecated-p-t-counter | deprecated p/t counter | 39 | deprecated-mechanics | In the early days Magic used all kinds of power/toughness modifying counters. Nowadays it just sticks with +1/+1 and -1…
deprecated-untapped-artifact | deprecated untapped artifact | 5 | deprecated-mechanics | Until 6th edition, artifacts were deactivated when they were tapped. These cards from prior to 6ed have that behaviour…
deprecated-wall-restriction | deprecated wall restriction | 4 | deprecated-mechanics | Until Champions of Kamigawa introduced defender, the Wall subtype would make a creature unable to attack. As such, cert…
dexterity | dexterity | 67 | deprecated-mechanics | Cards that require physical interaction outside of normal game scope, such as tossing cards or specific usage of one's…
expansion-sweeper | expansion sweeper | 5 | deprecated-mechanics | You know how sets sometimes have broken cards? What if you could just delete that set from the game? A mechanism Wizard…
graveyard-order-matters | graveyard order matters | 23 | deprecated-mechanics | These cards care about the order of cards in a graveyard, or rearrange them somehow. If any of these cards are in a pla…
landhome | landhome | 35 | deprecated-mechanics | An old two-part mechanic: you had to control a land of a certain type to keep this creature on the battlefield, and the…
old-blocking-deathtouch | old blocking deathtouch | 35 | deprecated-mechanics | Before the keyword was made evergreen in Magic 2010, deathtouch was sometimes a triggered ability based on blocking. Se…
old-damage-deathtouch | old damage deathtouch | 23 | deprecated-mechanics | Before the keyword was made evergreen in Magic 2010, deathtouch was sometimes a triggered ability based on damage. See…
old-fight | old fight | 10 | deprecated-mechanics | Before Fight was keyworded in Innistrad, it was a one-then-the-other procedure spelled out in oracle text.
old-lifelink | old lifelink | 29 | deprecated-mechanics | Before lifelink was keyworded in Magic 2010, it was a triggered ability.
old-mana-burn-clause | old mana burn clause | 4 | deprecated-mechanics | "Mana Burn" was a removed rule that made you lose life upon losing unspent mana. Older cards that gave you mana sometim…
pseudo-equipment | pseudo-equipment | 13 | deprecated-mechanics | Before Equipment arrived in Mirrodin, WotC experimented with a number of effects that granted boosts that stuck but cou…
substance | substance | 12 | deprecated-mechanics | Substance is an obsolete static ability that has no effect at all. It existed briefly only as a technical detail to sup…

## dice roll (`dice-roll`)

dice-roll | dice roll | 0 | - | Cards that make you roll dice. For things that like or help when you roll dice, see [Synergy Dice](synergy-dice)
roll-d10 | roll d10 | 3 | dice-roll | -
roll-d12 | roll d12 | 3 | dice-roll | -
roll-d20 | roll d20 | 55 | dice-roll | -
roll-d4 | roll d4 | 5 | dice-roll | -
roll-d6 | roll d6 | 127 | dice-roll | 🎲
roll-d8 | roll d8 | 4 | dice-roll | -
roll-planar-die | roll planar die | 1 | dice-roll | Effects that instruct you to roll the planar die. NOT for responding to its rolls.

## digital-only mechanics (`digital-only-mechanics`)

conjure | conjure | 0 | digital-only-mechanics | -
digital-only-mechanics | digital-only mechanics | 305 | - | Cards with mechanics designed for the digital environment of Magic Arena. Includes Unknown and acorn cards with mechani…
gives-double-team | gives double team | 5 | digital-only-mechanics | -
seek | seek | 0 | digital-only-mechanics | -

## digital replacement (`digital-replacement`)

digital-replacement | digital replacement | 1 | - | -

## digital to paper (`digital-to-paper`)

digital-to-paper | digital to paper | 13 | - | These cards were originally created for a set that did not see a physical printing, but were later printed in paper.

## dilemma (`dilemma`)

dilemma | dilemma | 0 | - | Effects that give you two equally bad choices.
divvy | divvy | 14 | dilemma | Cards that make you choose from two or more piles.
gifts-ungiven | gifts ungiven | 16 | dilemma | Get X cards from a location, opponent picks an amount of those you get to keep.
punisher | punisher | 139 | dilemma | Effects that give you a choice of two damnations.

## discard matters (`discard-matters`)

discard-matters | discard matters | 12 | - | -
opponent-discard-matters | opponent-discard matters | 33 | discard-matters | Cards that reward you for making opponents discard cards from their hand. See also [hate empty hand](hate-empty-hand) f…
self-discard-matters | self-discard matters | 109 | discard-matters | Cards that reward you for tossing your own hand into the graveyard. For cards that reward you for having a small hand,…

## discard outlet (`discard-outlet`)

discard-outlet | discard outlet | 480 | - | -
discard-outlet-artifact | discard outlet-artifact | 4 | discard-outlet | -
discard-outlet-creature | discard outlet-creature | 28 | discard-outlet | -
discard-outlet-land | discard outlet-land | 53 | discard-outlet | -
discard-outlet-last-drawn | discard outlet-last drawn | 5 | discard-outlet | -
discard-outlet-nonland | discard outlet-nonland | 2 | discard-outlet | -
free-discard-outlet | free discard outlet | 69 | discard-outlet | Ways to discard repeatedly that require no additional cost or numerical limit.
loot | loot | 109 | discard-outlet | Draw a card, then discard a card. Mainly blue. See also [rummage](/tags/card/rummage), the red version, which discards…
rummage | rummage | 131 | discard-outlet | Discard a card, then draw a card. Mainly red. See also [loot](/tags/card/loot), the blue version, which draws then disc…

## discard outlet-random (`discard-outlet-random`)

discard-outlet-random | discard outlet-random | 45 | - | -

## discard-symmetrical (`discard-symmetrical`)

discard-symmetrical | discard-symmetrical | 6 | - | -

## discarded type matters (`discarded-type-matters`)

compulsive-research | compulsive research | 13 | discarded-type-matters | Cards with a function of "draw N cards, then discard 2 unless you discard [type]"
discarded-type-matters | discarded type matters | 58 | - | The type of card you discard matters for some effect.

## disintegrate (`disintegrate`)

disintegrate | disintegrate | 61 | - | Damaged creatures are exiled instead of dying.

## distinct echo cost (`distinct-echo-cost`)

distinct-echo-cost | distinct echo cost | 11 | - | Cards where the echo cost is different from the casting cost

## ditch hand (`ditch-hand`)

ditch-hand | ditch hand | 142 | - | Cards that let you get rid of your current hand in some way or other.
hellbending | hellbending | 74 | ditch-hand | Cards that let you go hellbent, usually by letting you empty your entire hand.

## divides battlefield (`divides-battlefield`)

divides-battlefield | divides battlefield | 4 | - | Cards which divide all Creatures on the Battlefield into two or more sections, which often but not always can't block e…

## division (`division`)

division | division | 47 | - | Cards that ask for a divided value. For cards that include a fractional value or a number that is not a whole number, s…
life-divider | life divider | 0 | division | Effects that make players lose fractions of their life total. See also [set life total](/tags/card/set-life-total) and…

## dnd (`dnd`)

dnd | dnd | 0 | - | Cards made to reference mechanical parts of the Dungeons and Dragons TTRPG.
dnd-book | dnd book | 8 | dnd | Cards that are named after an actual printed Dungeons and Dragons book or adventure module.
dnd-character | dnd character | 208 | dnd | Cards that represent Dungeons and Dragons characters: name, rules text, etc. See also the [dungeons and dragons](/tags/…
dnd-item | dnd item | 61 | dnd | Cards named after and representing DnD items.
dnd-mechanic | dnd mechanic | 57 | dnd | Cards named after and representing DnD mechanics.
dnd-monster | dnd monster | 97 | dnd | Cards named after and representing monsters from DnD.
dnd-spell | dnd spell | 42 | dnd | Cards originally from DnD sets that are named after and representing DnD spells.

## doesn't untap (`doesn-t-untap`)

doesn-t-untap | doesn't untap | 42 | - | Cards that prevent their own untapping in some way.

## donate mana (`donate-mana`)

donate-mana | donate mana | 22 | - | -

## donate rampant growth (`donate-rampant-growth`)

donate-rampant-growth | donate rampant growth | 28 | - | Cards that allow you to ramp another player's mana by putting a land from their (or your) deck onto the battlefield.

## donate token (`donate-token`)

donate-token | donate token | 184 | - | Effects that can create tokens under an opponents control.

## draft matters (`draft-matters`)

draft-matters | draft matters | 23 | - | Cards that care about their use in limited formats in some way
extra-draft | extra draft | 5 | draft-matters | Draft additional cards outside the normal bounds of drafting.

## draft signpost (`draft-signpost`)

draft-signpost | draft signpost | 0 | - | Cards that represent a draft archetype in a given set. Typically designed as ten two-color uncommons (2CUDS).

## draw matters (`draw-matters`)

draw-matters | draw matters | 107 | - | -
second-draw-matters | second draw matters | 66 | draw-matters | Cards that care when the player casting or controlling them draws their second card for the turn.
third-draw-matters | third draw matters | 6 | draw-matters | -

## draw to seven (`draw-to-seven`)

draw-to-seven | draw to seven | 3 | - | -

## drawback (`drawback`)

alternate-loss-condition | alternate loss condition | 31 | drawback | New ways for you to lose the game
deal-with-the-devil | deal with the devil | 44 | drawback | Black enchantments that come with a major drawback that could doom you. See also [Lich effect](/tags/card/lich-effect)
drawback | drawback | 1334 | - | Cards that have some kind of disadvantage.
forced-attacker | forced attacker | 87 | drawback | Creatures that have to attack every combat if possible.
high-flying | high flying | 34 | drawback | Flying creatures that can only block other flying creatures. See also [gives high flying](gives-high-flying).
hungry-demon | hungry demon | 29 | drawback | Cards that make you sacrifice a creature, either automatically or with a downside if you can't or won't.
illusion-ability | illusion ability | 29 | drawback | Permanents that sacrifice themselves if they get targeted by anything
landhome | landhome | 35 | drawback | An old two-part mechanic: you had to control a land of a certain type to keep this creature on the battlefield, and the…
restricted-attacker | restricted attacker | 114 | drawback | Cards that can only attack in specific circumstances.
restricted-blocker | restricted blocker | 117 | drawback | Cards that can block, but only in specific circumstances.
rupture-spire | rupture spire | 7 | drawback | Not only does this land enter tapped, it also requires you to tap another land when you play it.

## dual land (`dual-land`)

dual-land | dual land | 5 | - | -

## eldrazi titan (`eldrazi-titan`)

eldrazi-titan | eldrazi titan | 9 | - | The various Eldrazi Titan trios.

## embalm token (`embalm-token`)

embalm-token | embalm token | 15 | - | -

## emblem-lite (`emblem-lite`)

emblem-lite | emblem-lite | 9 | - | Effects that work like emblems, but aren't emblems.

## eminence (`eminence`)

eminence | eminence | 10 | - | An ability that works either in the command zone or on the battlefield, introduced by the tribal leaders of Commander 2…

## end turn (`end-turn`)

end-turn | end turn | 9 | - | -

## energy generator (`energy-generator`)

energy-generator | energy generator | 125 | - | Cards that in some way give you energy counters.

## energy increaser (`energy-increaser`)

energy-increaser | energy increaser | 6 | - | Cards that increase the amount of energy you get.

## enlarge (`enlarge`)

enlarge | enlarge | 199 | - | Effects that give a creature +N/+M. One of these values should be significant, at least 3.

## enrage (`enrage`)

enrage | enrage | 72 | - | An effect that triggers when the creature (or attached/enchanted creature) takes damage.
fungusaur-effect | fungusaur effect | 10 | enrage | -
jackal-pup-ability | jackal pup ability | 9 | enrage | Whenever a creature is dealt damage, it deals that much damage to its controller.
spite-damage | spite damage | 36 | enrage | When you deal me damage, I deal you damage right back.

## equipless equipment (`equipless-equipment`)

equipless-equipment | equipless equipment | 6 | - | Equipment that do not have an "Equip – [Cost]" ability printed on them.

## eternalize token (`eternalize-token`)

eternalize-token | eternalize token | 13 | - | -

## evasion (`evasion`)

daunt | daunt | 40 | evasion | The "can't be blocked by power 2 or less" as named by WotC. See also [gives daunt](gives-daunt).
evasion | evasion | 4565 | - | Creatures that are harder to block through keywords (flying, menace) or other means.
fake-flying | fake flying | 8 | evasion | Creatures without flying that can't be blocked except by creatures with flying or reach. See also [gives fake flying](g…
french-vanilla-walker | french vanilla walker | 68 | evasion | French vanilla creatures with only a landwalk ability.
gains-fear | gains fear | 13 | evasion | -
gains-flying | gains flying | 314 | evasion | -
gains-intimidate | gains intimidate | 5 | evasion | -
gains-landwalk | gains landwalk | 7 | evasion | -
gains-menace | gains menace | 86 | evasion | -
gains-protection | gains protection | 42 | evasion | -
gains-shadow | gains shadow | 6 | evasion | -
high-flying | high flying | 34 | evasion | Flying creatures that can only block other flying creatures. See also [gives high flying](gives-high-flying).
howlgeist-ability | howlgeist ability | 12 | evasion | Creatures with lesser power can't block these creatures.
nimble | nimble | 8 | evasion | "Can't be blocked by creatures with power 3 or greater", an opposite of [daunt](daunt) first seen on Amrou Kithkin and…
pseudo-intimidate | pseudo-intimidate | 4 | evasion | -
skulk | skulk | 18 | evasion | Creatures with power greater than X's power can't block it.
stalking | stalking | 27 | evasion | The "can't be blocked by more than one creature" ability, [as named by the designers](http://markrosewater.tumblr.com/p…
super-menace | super-menace | 13 | evasion | Because you can get more menacing than menace.
unblockable | unblockable | 203 | evasion | -
unique-evasion | unique evasion | 51 | evasion | -

## even/odd matters (`even-odd-matters`)

even-odd-matters | even/odd matters | 25 | - | Cards that care about things being even or odd. (Zero is Even)

## exile-self (`exile-self`)

exile-on-resolution | exile on resolution | 112 | exile-self | Cards that exile themselves once they've finished all their effects. Commonly seen on extra turn cards.
exile-self | exile-self | 841 | - | Cards which exile themselves (from the battlefield, from the graveyard, from your hand, etc.)
exile-self-dfc-transform | exile-self-dfc-transform | 90 | exile-self | DFCs that exile themselves as part of their transformation.
flicker-self | flicker-self | 39 | exile-self | -
graveyard-fuel-self | graveyard fuel-self | 34 | exile-self | -
madness | madness | 63 | exile-self | The specific keyword, madness (Used for applying specific subtags)

## exile with tax (`exile-with-tax`)

exile-with-tax | exile with tax | 17 | - | Exile something, but let them pay to get it back.

## exiletouch (`exiletouch`)

exiletouch | exiletouch | 5 | - | -

## explore-like (`explore-like`)

explore-like | explore-like | 14 | - | Look at the top card, then you may draw it. If you don't, you may put it away.

## exponential (`exponential`)

exponential | exponential | 120 | - | Effects that involve some amount of exponential growth. This can be an exponential value, or a token creation effect th…

## extra untap (`extra-untap`)

extra-untap | extra untap | 105 | - | Cards that give you a way to untap things en masse, either with a new untap step or by an ability that untaps multiple…

## extract (`extract`)

extract | extract | 44 | - | Exile cards from a library. They're just gone now.

## face-commander (`face-commander`)

face-commander | face-commander | 18 | - | A card that is the primary, marquee legendary creature featured on the packaging of a pre-constructed Commander deck. I…

## face-up-face-down-effects (`face-up-face-down-effects`)

face-up-face-down-effects | face-up-face-down-effects | 12 | - | -
gives-disguise | gives disguise | 1 | face-up-face-down-effects | -
hate-face-down | hate-face-down | 7 | face-up-face-down-effects | -
hate-morph | hate-morph | 2 | face-up-face-down-effects | -
reanimate-face-down | reanimate-face-down | 9 | face-up-face-down-effects | -
synergy-disguise | synergy-disguise | 1 | face-up-face-down-effects | -
synergy-face-down | synergy-face-down | 27 | face-up-face-down-effects | Cards that have synergy with the various face down mechanics in the game, such as manifest, morph, cloak, etc.
synergy-face-down-cast | synergy-face-down-cast | 7 | face-up-face-down-effects | -
synergy-manifest | synergy-manifest | 1 | face-up-face-down-effects | -
synergy-manifest-dread | synergy-manifest-dread | 2 | face-up-face-down-effects | -
synergy-morph | synergy-morph | 2 | face-up-face-down-effects | -
turn-face-down | turn-face-down | 10 | face-up-face-down-effects | -
turn-face-down-self | turn-face-down-self | 6 | face-up-face-down-effects | -
turn-face-up | turn-face-up | 16 | face-up-face-down-effects | -
turn-face-up-trigger | turn-face-up-trigger | 29 | face-up-face-down-effects | -
turn-face-up-trigger-self | turn-face-up-trigger-self | 107 | face-up-face-down-effects | -

## faux targeting (`faux-targeting`)

faux-targeting | faux targeting | 127 | - | Things that have to choose "targets", but don't actually *target*, meaning this bypasses keywords such as hexproof, pro…

## fire drake (`fire-drake`)

fire-drake | fire drake | 5 | - | A small family of drakes with once-only firebreathing abilities.

## firebreathing (`firebreathing`)

firebreathing | firebreathing | 284 | - | Give a creature +X/+0 until end of turn via an activated ability.

## flavors of vanilla (`flavors-of-vanilla`)

flavors-of-vanilla | flavors of vanilla | 0 | - | Magic has various flavors of "vanilla", referencing cards with no abilities or only keyword abilities. For vanilla crea…
french-vanilla | french vanilla | 1536 | flavors-of-vanilla | These creatures, vehicles and spacecraft have only keyword abilities.
noncreature-french-vanilla | noncreature french vanilla | 18 | flavors-of-vanilla | These noncreature, nonvehicle, nonspacecraft cards have only keyword abilities. (For vehicles and spacecraft, see [fren…
virtual-french-vanilla | virtual french vanilla | 1287 | flavors-of-vanilla | Creatures and vehicles that are french vanilla (having only keyword abilities) after entering the battlefield. They may…
virtual-vanilla | virtual vanilla | 1581 | flavors-of-vanilla | These creatures are effectively just vanilla after entering the battlefield. They may have an enters-the-battlefield or…

## flicker (`flicker`)

flicker | flicker | 1 | - | Exile a card then return it to the battlefield (now or soon).
flicker-artifact | flicker-artifact | 16 | flicker | -
flicker-creature | flicker-creature | 133 | flicker | -
flicker-enchantment | flicker-enchantment | 3 | flicker | -
flicker-land | flicker-land | 4 | flicker | -
flicker-nonenchantment | flicker-nonenchantment | 1 | flicker | -
flicker-planeswalker | flicker-planeswalker | 1 | flicker | -
flicker-self | flicker-self | 39 | flicker | -
flicker-slow | flicker-slow | 105 | flicker | Exile a card to be brought back after a set time (usually at end of turn).
flicker-vehicle | flicker-vehicle | 1 | flicker | -

## flowstone (`flowstone`)

flowstone | flowstone | 106 | - | Abilities that grant +N/-N and/or -N/+N
morphling | morphling | 10 | flowstone | Cards with flowstone and capacity to gain additional abilities or evasion.

## force draw (`force-draw`)

force-draw | force draw | 277 | - | Force an opponent to draw cards, whether they like it or not. The lesser used mode on Ancestral Recall.

## form (`form`)

form | form | 9 | - | Cards with the intent of "transforming you" into something, usually involving various benefits and drawbacks.

## four loyalty abilities (`four-loyalty-abilities`)

four-loyalty-abilities | four loyalty abilities | 11 | - | -

## four plus creature types (`four-plus-creature-types`)

four-plus-creature-types | four plus creature types | 22 | - | Non-Changeling creatures that have four or more creature types
multiclass-party-member | multiclass party member | 4 | four-plus-creature-types | Creatures that are each of the four party classes.

## fourth spell matters (`fourth-spell-matters`)

fourth-spell-matters | fourth spell matters | 3 | - | -

## free-cast-another (`free-cast-another`)

free-cast-another | free-cast-another | 412 | - | Cast other things without paying their mana cost.

## freeze (`freeze`)

freeze | freeze | 0 | - | A permanent doesn't untap during its next N untap steps. For effects that prevent untapping indefinitely, see [lockdown…
freeze-artifact | freeze-artifact | 10 | freeze | -
freeze-creature | freeze-creature | 184 | freeze | Prevent a creature from untapping for its next N untaps. For effects that prevent untapping indefinitely, see [lockdown…
freeze-land | freeze-land | 10 | freeze | -
freeze-nonland | freeze-nonland | 6 | freeze | -
freeze-permanent-any | freeze-permanent-any | 6 | freeze | Freeze/stun effects that work against permanents of all types.
orochi-ability | orochi ability | 9 | freeze | Freeze creatures with combat damage. This ability was used on Orochi in Kamigawa.

## french vanilla aura (`french-vanilla-aura`)

french-vanilla-aura | french vanilla aura | 109 | - | Auras that give stat changes and/or keywords with no other effects.

## french vanilla equipment (`french-vanilla-equipment`)

french-vanilla-equipment | french vanilla equipment | 51 | - | Equipment that give a creature a stat change and/or a keyword with no other effects.

## front-card (`front-card`)

front-card | front-card | 291 | - | -

## fulfilled futureshift (`fulfilled-futureshift`)

fulfilled-futureshift | fulfilled futureshift | 12 | - | This card was initially futureshifted, and has now received its proper print in its future expansion.

## fun (`fun`)

fun | fun | 1 | - | -

## fun ruling (`fun-ruling`)

fun-ruling | fun ruling | 375 | - | Cards with rulings where the rules manager is having fun with us. Not necessarily laugh-out-loud funny.

## gains annihilator (`gains-annihilator`)

gains-annihilator | gains annihilator | 2 | - | -

## gains banding (`gains-banding`)

gains-banding | gains banding | 8 | - | -

## gains bushido (`gains-bushido`)

gains-bushido | gains bushido | 2 | - | -

## gains cascade (`gains-cascade`)

gains-cascade | gains cascade | 1 | - | -

## gains deathtouch (`gains-deathtouch`)

gains-deathtouch | gains deathtouch | 86 | - | -

## gains defender (`gains-defender`)

gains-defender | gains defender | 7 | - | -

## gains dethrone (`gains-dethrone`)

gains-dethrone | gains dethrone | 1 | - | -

## gains double strike (`gains-double-strike`)

gains-double-strike | gains double strike | 62 | - | -

## gains exploit (`gains-exploit`)

gains-exploit | gains exploit | 1 | - | -

## gains first strike (`gains-first-strike`)

gains-first-strike | gains first strike | 160 | - | -

## gains flash (`gains-flash`)

gains-flash | gains flash | 50 | - | -

## gains haste (`gains-haste`)

gains-haste | gains haste | 276 | - | -
gains-suspend | gains suspend | 3 | gains-haste | -

## gains indestructible (`gains-indestructible`)

gains-indestructible | gains indestructible | 142 | - | -

## gains mm counters (`gains-mm-counters`)

gains-mm-counters | gains mm counters | 50 | - | -
persist | persist | 26 | gains-mm-counters | -

## gains pp counters (`gains-pp-counters`)

devour | devour | 26 | gains-pp-counters | Before a creature enters the battlefield, the player may sacrifice a number of permanents and the creature will enter w…
gains-pp-counters | gains pp counters | 1737 | - | -
hunger | hunger | 13 | gains-pp-counters | Creatures dying to this one make this one grow stronger. Coined by Maro: http://markrosewater.tumblr.com/post/178364542…
monstrosity | monstrosity | 36 | gains-pp-counters | -
renown | renown | 20 | gains-pp-counters | Collection tag used to apply the various tags that comprise the keyword Renown. Should be 1:1 with kw:renown.
tribute | tribute | 11 | gains-pp-counters | Collection tag used to apply the various tags that comprise the keyword Tribute. Should be 1:1 with kw:tribute.

## gains provoke (`gains-provoke`)

gains-provoke | gains provoke | 1 | - | -

## gains prowess (`gains-prowess`)

gains-prowess | gains prowess | 2 | - | -

## gains rampage (`gains-rampage`)

gains-rampage | gains rampage | 2 | - | -

## gains reach (`gains-reach`)

gains-reach | gains reach | 27 | - | -

## gains soulshift (`gains-soulshift`)

gains-soulshift | gains soulshift | 1 | - | -

## gains split second (`gains-split-second`)

gains-split-second | gains split second | 1 | - | -

## gains trample (`gains-trample`)

gains-trample | gains trample | 151 | - | -

## gains umbra armor (`gains-umbra-armor`)

gains-umbra-armor | gains umbra armor | 1 | - | -

## gains vigilance (`gains-vigilance`)

gains-vigilance | gains vigilance | 99 | - | -

## gains ward (`gains-ward`)

gains-ward | gains ward | 7 | - | -

## gains wither (`gains-wither`)

gains-wither | gains wither | 3 | - | -

## genesis effect (`genesis-effect`)

genesis-effect | genesis effect | 18 | - | Effects that put creatures onto the battlefield from near the top of your library.

## gives absorb (`gives-absorb`)

gives-absorb | gives absorb | 1 | - | -

## gives afflict (`gives-afflict`)

gives-afflict | gives afflict | 8 | - | -

## gives afterlife (`gives-afterlife`)

gives-afterlife | gives afterlife | 2 | - | -

## gives annihilator (`gives-annihilator`)

gives-annihilator | gives annihilator | 7 | - | -

## gives banding (`gives-banding`)

gives-banding | gives banding | 14 | - | -

## gives basic landcycling (`gives-basic-landcycling`)

gives-basic-landcycling | gives basic landcycling | 1 | - | -

## gives battle cry (`gives-battle-cry`)

gives-battle-cry | gives battle cry | 2 | - | -

## gives bushido (`gives-bushido`)

gives-bushido | gives bushido | 2 | - | -

## gives castable from nonhand (`gives-castable-from-nonhand`)

gives-castable-from-exile | gives castable from exile | 264 | gives-castable-from-nonhand | Cards that let you cast things from exile.
gives-castable-from-graveyard | gives castable from graveyard | 115 | gives-castable-from-nonhand | Allows you to play other cards from the graveyard.
gives-castable-from-library | gives castable from library | 17 | gives-castable-from-nonhand | -
gives-castable-from-nonhand | gives castable from nonhand | 16 | - | Allows you to play other cards from zones other than your hand.

## gives charge counter (`gives-charge-counter`)

gives-charge-counter | gives charge counter | 11 | - | -

## gives cumulative upkeep (`gives-cumulative-upkeep`)

gives-cumulative-upkeep | gives cumulative upkeep | 5 | - | -

## gives cycling (`gives-cycling`)

gives-cycling | gives cycling | 6 | - | -

## gives deathtouch (`gives-deathtouch`)

gives-deathtouch | gives deathtouch | 186 | - | -

## gives deathtouch noncreature (`gives-deathtouch-noncreature`)

gives-deathtouch-noncreature | gives deathtouch noncreature | 2 | - | -

## gives decayed (`gives-decayed`)

gives-decayed | gives decayed | 3 | - | -

## gives defender (`gives-defender`)

gives-defender | gives defender | 15 | - | -

## gives delve (`gives-delve`)

gives-delve | gives delve | 1 | - | -

## gives demonstrate (`gives-demonstrate`)

gives-demonstrate | gives demonstrate | 5 | - | -

## gives dethrone (`gives-dethrone`)

gives-dethrone | gives dethrone | 1 | - | -

## gives devoid (`gives-devoid`)

gives-devoid | gives devoid | 2 | - | -

## gives devour (`gives-devour`)

gives-devour | gives devour | 1 | - | -

## gives double strike (`gives-double-strike`)

gives-double-strike | gives double strike | 152 | - | -

## gives dredge (`gives-dredge`)

gives-dredge | gives dredge | 1 | - | -

## gives echo (`gives-echo`)

gives-echo | gives echo | 1 | - | -

## gives emerge (`gives-emerge`)

gives-emerge | gives emerge | 1 | - | -

## gives epic (`gives-epic`)

gives-epic | gives epic | 1 | - | -

## gives evasion (`gives-evasion`)

gives-daunt | gives daunt | 8 | gives-evasion | -
gives-evasion | gives evasion | 27 | - | Cards that make a creature harder or impossible to block.
gives-fake-flying | gives fake flying | 3 | gives-evasion | Cards that make creatures unblockable except by creatures with flying or reach without giving them flying, known as [fa…
gives-fear | gives fear | 29 | gives-evasion | -
gives-flying | gives flying | 460 | gives-evasion | -
gives-horsemanship | gives horsemanship | 10 | gives-evasion | -
gives-intimidate | gives intimidate | 18 | gives-evasion | -
gives-landwalk | gives landwalk | 9 | gives-evasion | -
gives-menace | gives menace | 178 | gives-evasion | -
gives-nimble | gives nimble | 4 | gives-evasion | -
gives-protection | gives protection | 127 | gives-evasion | -
gives-shadow | gives shadow | 13 | gives-evasion | -
gives-skulk | gives skulk | 9 | gives-evasion | -
gives-stalking | gives stalking | 13 | gives-evasion | Cards that make creatures only be blockable by no more than one creature, also known as "[stalking](stalking)".
gives-unblockable | gives unblockable | 162 | gives-evasion | -

## gives evolve (`gives-evolve`)

gives-evolve | gives evolve | 3 | - | -

## gives exploit (`gives-exploit`)

gives-exploit | gives exploit | 2 | - | -

## gives fabricate (`gives-fabricate`)

gives-fabricate | gives fabricate | 1 | - | -

## gives first strike (`gives-first-strike`)

gives-first-strike | gives first strike | 282 | - | -

## gives flanking (`gives-flanking`)

gives-flanking | gives flanking | 6 | - | -

## gives flash (`gives-flash`)

gives-flash | gives flash | 64 | - | -

## gives fossilize (`gives-fossilize`)

gives-fossilize | gives fossilize | 1 | - | -

## gives freerunning (`gives-freerunning`)

gives-freerunning | gives freerunning | 1 | - | -

## gives frenzy (`gives-frenzy`)

gives-frenzy | gives frenzy | 1 | - | -

## gives haste (`gives-haste`)

awaken | awaken | 15 | gives-haste | Collection tag used to apply the various tags that comprise the keyword Awaken. Should be 1-1 with kw:awaken.
earthbend | earthbend | 36 | gives-haste | Collection tag used to apply the various tags that comprise the keyword Earthbend. Should be 1:1 with kw:earthbend.
gives-blitz | gives blitz | 3 | gives-haste | -
gives-encore | gives encore | 4 | gives-haste | -
gives-haste | gives haste | 626 | - | -
gives-riot | gives riot | 4 | gives-haste | -
gives-suspend | gives suspend | 17 | gives-haste | -
gives-unearth | gives unearth | 9 | gives-haste | -

## gives high flying (`gives-high-flying`)

gives-high-flying | gives high flying | 4 | - | These cards give other creatures [high flying](high-flying).

## gives ingest (`gives-ingest`)

gives-ingest | gives ingest | 13 | - | -

## gives mana ability (`gives-mana-ability`)

gives-mana-ability | gives mana ability | 109 | - | -

## gives mentor (`gives-mentor`)

gives-mentor | gives mentor | 3 | - | -

## gives mm counters (`gives-mm-counters`)

gives-mm-counters | gives mm counters | 183 | - | -
gives-persist | gives persist | 7 | gives-mm-counters | -
gives-wither-noncreature | gives wither noncreature | 1 | gives-mm-counters | -
mm-counter-cost | mm counter cost | 40 | gives-mm-counters | Cards that put -1/-1 counters on your stuff as a cost or requirement for other effects.

## gives mobilize (`gives-mobilize`)

gives-mobilize | gives mobilize | 2 | - | -

## gives modular (`gives-modular`)

gives-modular | gives modular | 1 | - | -

## gives ninjutsu (`gives-ninjutsu`)

gives-ninjutsu | gives ninjutsu | 2 | - | -

## gives offspring (`gives-offspring`)

gives-offspring | gives offspring | 2 | - | -

## gives phasing (`gives-phasing`)

gives-phasing | gives phasing | 4 | - | -

## gives player ability (`gives-player-ability`)

gives-player-ability | gives player ability | 2 | - | Cards that give a player a keyword ability, such as hexproof.
gives-player-hexproof | gives player hexproof | 23 | gives-player-ability | -
gives-player-protection | gives player protection | 14 | gives-player-ability | -
gives-player-shroud | gives player shroud | 5 | gives-player-ability | -

## gives pp counters (`gives-pp-counters`)

awaken | awaken | 15 | gives-pp-counters | Collection tag used to apply the various tags that comprise the keyword Awaken. Should be 1-1 with kw:awaken.
earthbend | earthbend | 36 | gives-pp-counters | Collection tag used to apply the various tags that comprise the keyword Earthbend. Should be 1:1 with kw:earthbend.
gives-bloodthirst | gives bloodthirst | 2 | gives-pp-counters | -
gives-outlast | gives outlast | 3 | gives-pp-counters | -
gives-pp-counters | gives pp counters | 1324 | - | Cards that give +1/+1 counters. For permanents that only give +1/+1 counters to themselves, see [gains pp counters](gai…
gives-pp-counters-to-all | gives pp counters to all | 187 | gives-pp-counters | Put +1/+1 counters on all of your creatures.
gives-riot | gives riot | 4 | gives-pp-counters | -
gives-training | gives training | 2 | gives-pp-counters | -
repeatable-maps | repeatable maps | 6 | gives-pp-counters | -
repeatable-mutagens | repeatable mutagens | 8 | gives-pp-counters | -
support | support | 64 | gives-pp-counters | Put a +1/+1 counter on each of up to N target creatures.
take-the-initiative | take the initiative | 23 | gives-pp-counters | Cards that take the initiative, allowing you to enter Undercity and venture further into it on future turns.

## gives provoke (`gives-provoke`)

gives-provoke | gives provoke | 3 | - | -

## gives prowl (`gives-prowl`)

gives-prowl | gives prowl | 1 | - | -

## gives reach (`gives-reach`)

gives-reach | gives reach | 94 | - | -

## gives read ahead (`gives-read-ahead`)

gives-read-ahead | gives read ahead | 1 | - | -

## gives relentless (`gives-relentless`)

gives-relentless | gives relentless | 1 | - | -

## gives scavenge (`gives-scavenge`)

gives-scavenge | gives scavenge | 3 | - | -

## gives sneak (`gives-sneak`)

gives-sneak | gives sneak | 1 | - | -

## gives split second (`gives-split-second`)

gives-split-second | gives split second | 4 | - | -

## gives super haste (`gives-super-haste`)

gives-super-haste | gives super haste | 1 | - | -

## gives thoughtweft (`gives-thoughtweft`)

gives-thoughtweft | gives thoughtweft | 1 | - | -

## gives trample (`gives-trample`)

gives-trample | gives trample | 454 | - | -
overrun | overrun | 78 | gives-trample | Effects that grant trample and +P/+T

## gives triple strike (`gives-triple-strike`)

gives-triple-strike | gives triple strike | 1 | - | -

## gives umbra armor (`gives-umbra-armor`)

gives-umbra-armor | gives umbra armor | 1 | - | -

## gives unleash (`gives-unleash`)

gives-unleash | gives unleash | 1 | - | -

## gives unstoppable (`gives-unstoppable`)

gives-unstoppable | gives unstoppable | 8 | - | Make your creatures assign combat damage as though they weren't blocked. See also [unstoppable](unstoppable).

## gives vigilance (`gives-vigilance`)

gives-vigilance | gives vigilance | 282 | - | See also [untapper-creature](untapper-creature).

## gives web-slinging (`gives-web-slinging`)

gives-web-slinging | gives web-slinging | 1 | - | -

## gives wither (`gives-wither`)

gives-wither | gives wither | 10 | - | -

## grafted skullcap (`grafted-skullcap`)

grafted-skullcap | grafted skullcap | 7 | - | -

## grave pact (`grave-pact`)

grave-pact | grave pact | 6 | - | Cards that have abilities worded: "whenever creature you contol dies, each opponent sacrifices a creature."

## graveyard fuel (`graveyard-fuel`)

delve | delve | 30 | graveyard-fuel | Exile cards from your graveyard to reduce the cost
graveyard-fuel | graveyard fuel | 181 | - | Cards that require exiling other cards in graveyard as a cost for abilities and effects.
graveyard-fuel-artifact | graveyard fuel-artifact | 28 | graveyard-fuel | -
graveyard-fuel-creature | graveyard fuel-creature | 181 | graveyard-fuel | Exiles creatures from the graveyard for value
graveyard-fuel-historic | graveyard fuel-historic | 2 | graveyard-fuel | -
graveyard-fuel-instant | graveyard fuel-instant | 39 | graveyard-fuel | -
graveyard-fuel-land | graveyard fuel-land | 8 | graveyard-fuel | -
graveyard-fuel-legendary | graveyard fuel-legendary | 2 | graveyard-fuel | -
graveyard-fuel-noncreature | graveyard fuel-noncreature | 3 | graveyard-fuel | -
graveyard-fuel-nonland | graveyard fuel-nonland | 7 | graveyard-fuel | -
graveyard-fuel-permanent | graveyard fuel-permanent | 4 | graveyard-fuel | -
graveyard-fuel-saga | graveyard fuel-saga | 1 | graveyard-fuel | -
graveyard-fuel-sorcery | graveyard fuel-sorcery | 37 | graveyard-fuel | -

## graveyard fuel-enchantment (`graveyard-fuel-enchantment`)

graveyard-fuel-enchantment | graveyard fuel-enchantment | 3 | - | -

## great-designer-search-3 (`great-designer-search-3`)

great-designer-search-3 | great-designer-search-3 | 10 | - | Cards that are directly from or seemingly inspired by card designs from The Great Designer Search 3, a competition to f…

## green effect (`green-effect`)

gives-stalking | gives stalking | 13 | green-effect | Cards that make creatures only be blockable by no more than one creature, also known as "[stalking](stalking)".
green-effect | green effect | 0 | - | Effects which are iconically green
hurricane | hurricane | 35 | green-effect | Spells that deal damage to creatures with flying. See [earthquake](earthquake) for the inverse effect.
lure | lure | 30 | green-effect | All creatures able to block this creature must do so. See also [lure-limited](lure-limited) and [provoke lite](provoke-…
mana-increaser | mana increaser | 61 | green-effect | Cards that increase the mana produced by mana producers, usually lands.
stalking | stalking | 27 | green-effect | The "can't be blocked by more than one creature" ability, [as named by the designers](http://markrosewater.tumblr.com/p…
tutor-land-any | tutor-land-any | 42 | green-effect | Tutors with restricted effects that are able to search for any land.

## group hug (`group-hug`)

bribery | bribery | 23 | group-hug | Give an opponent something in exchange for a benefit to you.
group-hug | group hug | 184 | - | Cards that can be used to benefit other players, including opponents, usually by giving them resources
selective-group-hug | selective group hug | 210 | group-hug | Group Hug cards that benefit only certain opponents in particular.

## group slug (`group-slug`)

burn-player-each | burn player-each | 131 | group-slug | -
group-slug | group slug | 643 | - | Cards that are able to deal damage or otherwise target multiple players at once.

## guess (`guess`)

guess | guess | 43 | - | Effects that force you to guess at unknown information.

## guest designer (`guest-designer`)

guest-designer | guest designer | 16 | - | Cards created by an external guest designer.

## hand disruption (`hand-disruption`)

discard | discard | 577 | hand-disruption | Gets cards out of your opponent's hand and into their graveyard.
discard-to-exile | discard to exile | 72 | hand-disruption | Put cards from the opponent's hand into exile, either permanently or by [banishing](banish-hand) them.
discard-to-library | discard to library | 22 | hand-disruption | Put cards from the opponent's hand back into their library.
discard-with-set-s-mechanic | discard with set's mechanic | 200 | hand-disruption | -
hand-disruption | hand disruption | 15 | - | Mess with your opponent's hand.
random-discard | random discard | 39 | hand-disruption | -
specter-ability | specter ability | 62 | hand-disruption | Damaging the opponent strips cards out of their hand.
thoughtseize | thoughtseize | 144 | hand-disruption | Opponent reveals their hand, and you choose a card for them to discard.

## hand-negative (`hand-negative`)

hand-negative | hand-negative | 241 | - | Card (dis)advantage spells and abilities that leave you with less cards in hand after resolving.

## hand-neutral (`hand-neutral`)

hand-neutral | hand-neutral | 1827 | - | Card advantage spells and abilities that leave you with the same amount of cards in hand after resolving.

## hand-positive (`hand-positive`)

hand-positive | hand-positive | 1036 | - | Card advantage spells and abilities that leave you with more cards in hand after resolving.

## hand size decrease (`hand-size-decrease`)

hand-size-decrease | hand size decrease | 15 | - | -

## hand size increase (`hand-size-increase`)

hand-size-increase | hand size increase | 55 | - | Cards that increase the maximum amount of cards you can hold.

## hand size matters (`hand-size-matters`)

hand-size-hate | hand size hate | 1 | hand-size-matters | -
hand-size-matters | hand size matters | 121 | - | -
heckbent | heckbent | 11 | hand-size-matters | Effects that care about having one or fewer cards in hand.
hellbent | hellbent | 54 | hand-size-matters | Effects that care about having no cards in hand.
maro | maro | 28 | hand-size-matters | Cards with P/T equal to cards in hand. Named after the card Maro, a nickname for Mark Rosewater, the head designer for…

## harmonic (`harmonic`)

harmonic | harmonic | 24 | - | Cards that care about artifacts and enchantments separately.

## hate (`hate`)

draw-hate | draw hate | 61 | hate | Cards that can hate on players drawing cards.
hand-size-hate | hand size hate | 1 | hate | -
hate | hate | 0 | - | Cards that hate on things — colors, card types, zones, etc.
hate-activation | hate-activation | 27 | hate | -
hate-adventure | hate-adventure | 3 | hate | -
hate-arcane | hate-arcane | 5 | hate | -
hate-artifact | hate-artifact | 191 | hate | -
hate-artifact-creature | hate-artifact-creature | 21 | hate | -
hate-artifact-land | hate-artifact-land | 2 | hate | -
hate-attacker | hate-attacker | 366 | hate | -
hate-attraction | hate-attraction | 4 | hate | -
hate-aura | hate-aura | 27 | hate | -
hate-backup | hate-backup | 1 | hate | -
hate-banding | hate-banding | 2 | hate | -
hate-battle | hate-battle | 3 | hate | -
hate-blocker | hate-blocker | 364 | hate | -
hate-blood | hate-blood | 1 | hate | -
hate-clue | hate-clue | 1 | hate | -
hate-color | hate-color | 2 | hate | Color hate for one or more colors. See also [hate-colorless](/tags/card/hate-colorless).
hate-color-non-share | hate-color-non-share | 3 | hate | -
hate-color-share | hate-color-share | 27 | hate | -
hate-commander | hate-commander | 7 | hate | -
hate-conspiracy | hate-conspiracy | 1 | hate | -
hate-contraption | hate-contraption | 1 | hate | -
hate-counters | hate-counters | 1 | hate | Cards that hate on counters (the gameplay marker).
hate-counterspell | hate-counterspell | 123 | hate | -
hate-creatureland | hate-creatureland | 4 | hate | -
hate-curse | hate-curse | 1 | hate | -
hate-cycling | hate-cycling | 8 | hate | -
hate-damaged | hate-damaged | 31 | hate | Cards that do stuff to things that have already received damage.
hate-deathtouch | hate-deathtouch | 5 | hate | -
hate-defender | hate-defender | 7 | hate | -
hate-desert | hate-desert | 4 | hate | -
hate-dice | hate-dice | 1 | hate | -
hate-discard | hate-discard | 134 | hate | Your opponent had better think twice before targeting you with that [Mind Rot](https://tagger.scryfall.com/card/ori/281…
hate-disturb | hate-disturb | 1 | hate | -
hate-double-strike | hate-double-strike | 2 | hate | -
hate-enchantment | hate-enchantment | 50 | hate | -
hate-enchantment-creature | hate-enchantment-creature | 4 | hate | -
hate-equipment | hate-equipment | 15 | hate | -
hate-exile-cast | hate-exile-cast | 3 | hate | -
hate-face-down | hate-face-down | 7 | hate | -
hate-fear | hate-fear | 1 | hate | -
hate-first-strike | hate-first-strike | 10 | hate | -
hate-flanking | hate-flanking | 1 | hate | -
hate-flash | hate-flash | 19 | hate | -
hate-flashback | hate-flashback | 2 | hate | -
hate-flying | hate-flying | 138 | hate | -
hate-food | hate-food | 2 | hate | -
hate-forest | hate-forest | 15 | hate | -
hate-free-spell | hate-free-spell | 12 | hate | -
hate-goad | hate-goad | 1 | hate | -
hate-graveyard | hate-graveyard | 300 | hate | -
hate-graveyard-cast | hate-graveyard-cast | 10 | hate | -
hate-haste | hate-haste | 2 | hate | -
hate-high-pt | hate-high-pt | 154 | hate | Cards that specifically hate on cards with high power or toughness, typically at least 3-4.
hate-horsemanship | hate-horsemanship | 4 | hate | -
hate-hybrid | hate-hybrid | 1 | hate | -
hate-infect | hate-infect | 3 | hate | -
hate-instant | hate-instant | 92 | hate | -
hate-island | hate-island | 27 | hate | -
hate-kicker | hate-kicker | 1 | hate | -
hate-legendary | hate-legendary | 19 | hate | -
hate-library-cast | hate-library-cast | 2 | hate | -
hate-life-payment | hate-life-payment | 3 | hate | -
hate-lifegain | hate-lifegain | 34 | hate | -
hate-lifelink | hate-lifelink | 1 | hate | -
hate-low-power | hate-low-power | 51 | hate | -
hate-low-toughness | hate-low-toughness | 21 | hate | Cards that punish low toughness in ways beyond just the usual [damaging](burn-creature) or [shrinking](removal-toughnes…
hate-menace | hate-menace | 1 | hate | -
hate-mm-counter | hate-mm-counter | 1 | hate | -
hate-morph | hate-morph | 2 | hate | -
hate-mountain | hate-mountain | 16 | hate | -
hate-nonartifact | hate-nonartifact | 2 | hate | -
hate-nonbasic-land | hate-nonbasic-land | 82 | hate | -
hate-noncreature | hate-noncreature | 33 | hate | -
hate-nonhand-cast | hate-nonhand-cast | 4 | hate | -
hate-off-turn-cast | hate-off-turn-cast | 7 | hate | -
hate-phasing | hate-phasing | 3 | hate | -
hate-plains | hate-plains | 17 | hate | -
hate-planeswalker | hate-planeswalker | 56 | hate | Effects that specifically answer or are better against planeswalkers. This does not include effects that happen to trig…
hate-planeswalker-bolas | hate-planeswalker-bolas | 1 | hate | -
hate-planeswalker-chandra | hate-planeswalker-chandra | 1 | hate | -
hate-planeswalker-jace | hate-planeswalker-jace | 1 | hate | -
hate-plot | hate-plot | 1 | hate | -
hate-protection | hate-protection | 3 | hate | -
hate-ramp | hate-ramp | 6 | hate | -
hate-reach | hate-reach | 2 | hate | -
hate-regenerate | hate-regenerate | 141 | hate | -
hate-room | hate-room | 1 | hate | -
hate-sacrifice | hate-sacrifice | 10 | hate | -
hate-saga | hate-saga | 1 | hate | -
hate-scry | hate-scry | 1 | hate | -
hate-set-mechanic | hate-set-mechanic | 257 | hate | Cards that "hate" on one or more mechanics in the set they were printed in.
hate-shadow | hate-shadow | 12 | hate | -
hate-shuffle | hate-shuffle | 4 | hate | -
hate-snow | hate-snow | 19 | hate | -
hate-sorcery | hate-sorcery | 79 | hate | -
hate-spacecraft | hate-spacecraft | 5 | hate | -
hate-speed | hate-speed | 1 | hate | -
hate-splice | hate-splice | 1 | hate | -
hate-storm | hate-storm | 18 | hate | -
hate-surveil | hate-surveil | 1 | hate | -
hate-suspect | hate-suspect | 5 | hate | -
hate-suspend | hate-suspend | 7 | hate | -
hate-swamp | hate-swamp | 18 | hate | -
hate-tapped | hate-tapped | 155 | hate | -
hate-target | hate-target | 59 | hate | Cards that make it harder for your opponents to target your stuff or punish them for doing so.
hate-theft | hate-theft | 12 | hate | -
hate-token | hate-token | 27 | hate | -
hate-town | hate-town | 1 | hate | -
hate-toxic | hate-toxic | 1 | hate | -
hate-transform | hate-transform | 2 | hate | -
hate-trap | hate-trap | 1 | hate | -
hate-treasure | hate-treasure | 2 | hate | -
hate-tutor | hate-tutor | 17 | hate | -
hate-typal | hate-typal | 0 | hate | Hates out one or more creature types.
hate-untapped | hate-untapped | 2 | hate | -
hate-vehicle | hate-vehicle | 28 | hate | -
hate-vigilance | hate-vigilance | 2 | hate | -
hate-ward | hate-ward | 1 | hate | -
hate-warp | hate-warp | 1 | hate | -
hate-wide | hate-wide | 35 | hate | The more creatures your opponent controls, the more these cards scale up to punish them for it.
hatebear | hatebear | 58 | hate | Creatures that are low-cost (2 MV or less) and have low-power/toughness with relevant effects that may disrupt an oppon…
hatebird | hatebird | 16 | hate | (Usually) 3 MV flying creatures that mirror the lower-costed [hatebears](hatebear).
prevent-extra-turns | prevent extra turns | 4 | hate | -

## hate-color-every (`hate-color-every`)

hate-color-every | hate-color-every | 9 | - | -

## hate-colorless (`hate-colorless`)

hate-colorless | hate-colorless | 14 | - | Hate on colorless cards. See also [hate-color](/tags/card/hate-color) for color hate.

## hate-etb (`hate-etb`)

hate-etb | hate-etb | 8 | - | Disrupts enters-the-battlefield triggers

## hate-landwalk (`hate-landwalk`)

hate-landwalk | hate-landwalk | 16 | - | -

## hate-typal-assassin (`hate-typal-assassin`)

hate-typal-assassin | hate-typal-assassin | 2 | - | -

## hate-typal-coyote (`hate-typal-coyote`)

hate-typal-coyote | hate-typal-coyote | 1 | - | -

## hate-typal-dalek (`hate-typal-dalek`)

hate-typal-dalek | hate-typal-dalek | 2 | - | -

## hate-typal-elk (`hate-typal-elk`)

hate-typal-elk | hate-typal-elk | 1 | - | -

## hate-typal-non-god (`hate-typal-non-god`)

hate-typal-non-god | hate-typal-non-god | 1 | - | -

## hate-typal-ox (`hate-typal-ox`)

hate-typal-ox | hate-typal-ox | 2 | - | -

## hate-typal-phyrexian (`hate-typal-phyrexian`)

hate-typal-phyrexian | hate-typal-phyrexian | 1 | - | -

## hate-typal-pirate (`hate-typal-pirate`)

hate-typal-pirate | hate-typal-pirate | 1 | - | -

## hate-typal-warlock (`hate-typal-warlock`)

hate-typal-warlock | hate-typal-warlock | 1 | - | -

## hate-typal-warrior (`hate-typal-warrior`)

hate-typal-warrior | hate-typal-warrior | 1 | - | -

## hateboar (`hateboar`)

hateboar | hateboar | 1 | - | -

## haven (`haven`)

haven | haven | 88 | - | Exile your permanents to return them at much later point, essentially storing them somewhere safe. Not to be confused w…

## helper card (`helper-card`)

cover-card | cover card | 4 | helper-card | Cards that are meant to cover face down cards.
helper-card | helper card | 0 | - | Cards printed to assist you with using mechanics.
pile-card | pile card | 9 | helper-card | A "put things here" card.
reminder-card | reminder card | 9 | helper-card | Cards that remind you of your game state.
substitute-card | substitute card | 2 | helper-card | -

## high x matters (`high-x-matters`)

high-x-matters | high x matters | 40 | - | Cards with X values that do something extra beyond the X effect, as long as X surpasses a specific threshold.

## humble (`humble`)

humble | humble | 132 | - | Nerf a creature's stats and/or abilities as a form of removal. See also [shapechange](/tags/card/shapechange), [swap re…

## imprint (`imprint`)

imprint | imprint | 67 | - | Cards that exile other cards (or themselves) to use as reference for another effect.
imprinted-card-types-matter | imprinted card types matter | 8 | imprint | Cards that care about the card types of other cards that they've exiled with a linked ability.

## indefinite effect (`indefinite-effect`)

indefinite-effect | indefinite effect | 1 | - | Effects that last forever, sometimes tracked, sometimes untracked.
nonfunctional-reminder-counter | nonfunctional reminder counter | 13 | indefinite-effect | Effects that last forever tracked with a nonfunctional reminder counter, such that removing the counter makes no functi…
untracked-indefinite-effect | untracked indefinite effect | 319 | indefinite-effect | Effects that last forever but aren't tracked by anything. For these purposes we're not counting ETB clones.

## infernal spawn family (`infernal-spawn-family`)

infernal-spawn-family | infernal spawn family | 3 | - | -

## inspired (`inspired`)

inspired | inspired | 34 | - | Cards that care about the action of untapping a permanent. For cards that care about untapped permanents, see [synergy-…

## instant loyalty ability (`instant-loyalty-ability`)

instant-loyalty-ability | instant loyalty ability | 5 | - | -

## instant-sorcery-dichotomous (`instant-sorcery-dichotomous`)

instant-sorcery-dichotomous | instant-sorcery-dichotomous | 16 | - | Cards that care about instants and sorceries separately.

## instant speed discard (`instant-speed-discard`)

instant-speed-discard | instant speed discard | 20 | - | Discard effects that can deny the opponent the card they draw each turn

## inverted effects (`inverted-effects`)

drain-life | drain life | 373 | inverted-effects | Hurt your opponent and gain life to match.
drain-strength | drain strength | 21 | inverted-effects | One thing gets bigger, another gets smaller.
inverted-effects | inverted effects | 70 | - | -
persecution-effect | persecution effect | 7 | inverted-effects | Some Creatures get +N/+N, while other creatures get -N/-N

## invitational card (`invitational-card`)

invitational-card | invitational card | 11 | - | Cards designed by players who won Invitationals. The original print traditionally features the winning player. See also…

## jump (`jump`)

jump | jump | 187 | - | A creature gains flying until end of turn.

## just shuffle (`just-shuffle`)

just-shuffle | just shuffle | 10 | - | -

## keyword anthem (`keyword-anthem`)

keyword-anthem | keyword anthem | 473 | - | Give your entire team a keyword.

## keyword counter (`keyword-counter`)

deathtouch-counter | deathtouch counter | 21 | keyword-counter | -
decayed-counter | decayed counter | 1 | keyword-counter | -
double-strike-counter | double strike counter | 7 | keyword-counter | -
exalted-counter | exalted counter | 1 | keyword-counter | -
first-strike-counter | first strike counter | 16 | keyword-counter | -
flying-counter | flying counter | 45 | keyword-counter | -
haste-counter | haste counter | 4 | keyword-counter | -
hexproof-counter | hexproof counter | 8 | keyword-counter | -
indestructible-counter | indestructible counter | 27 | keyword-counter | -
keyword-counter | keyword counter | 0 | - | A collection of all the keyword counters referenced by cards.
lifelink-counter | lifelink counter | 28 | keyword-counter | -
menace-counter | menace counter | 16 | keyword-counter | -
reach-counter | reach counter | 14 | keyword-counter | -
shadow-counter | shadow counter | 2 | keyword-counter | -
trample-counter | trample counter | 21 | keyword-counter | -
vigilance-counter | vigilance counter | 20 | keyword-counter | -

## keyword soup (`keyword-soup`)

keyword-soup | keyword soup | 27 | - | These cards list out all or almost all the keyword abilities found in their set, possibly restricted by color.

## keywords matter (`keywords-matter`)

keywords-matter | keywords matter | 7 | - | -

## kismet effect (`kismet-effect`)

kismet-effect | kismet effect | 29 | - | Cards that make certain types of permanents enter the battlefield tapped.

## land kavu (`land-kavu`)

land-kavu | land kavu | 3 | - | -

## lands matter (`lands-matter`)

affinity-for-land-type | affinity for land type | 9 | lands-matter | Affinity abilities that care about land types.
differently-named-lands-matter | differently named lands matter | 8 | lands-matter | These cards want you to have multiple lands with different names.
land-count-matters | land count matters | 91 | lands-matter | -
landfall | landfall | 223 | lands-matter | Cards which reward you for playing lands.
lands-matter | lands matter | 102 | - | -
maro-sorcerer | maro-sorcerer | 76 | lands-matter | Creatures that scale in power and toughness with the number of lands you control.

## landslow (`landslow`)

landslow | landslow | 12 | - | Cards that prevent or otherwise limit the lands one can play

## leaving graveyard matters (`leaving-graveyard-matters`)

leaves-graveyard-trigger | leaves graveyard trigger | 45 | leaving-graveyard-matters | Cards that have triggers whenever a card (or cards) leave your graveyard
leaving-graveyard-matters | leaving graveyard matters | 8 | - | -

## legacy (`legacy`)

ante-matters | ante matters | 8 | legacy | Ante is a depreciated game mechanic where players would remove the top card of their deck from the game and give it to…
legacy | legacy | 17 | - | Effects that involve physical alteration or selection of the card itself before or during the game, usually with the im…
tearing | tearing | 2 | legacy | Cards which involve physically tearing the card.

## legends retold (`legends-retold`)

legends-retold | legends retold | 20 | - | A series of Set Booster-exclusives released in Dominaria United, all of which are reworks of some of the original legen…

## library manipulation (`library-manipulation`)

bottom-deck-manipulation | bottom deck manipulation | 5 | library-manipulation | -
library-manipulation | library manipulation | 0 | - | -
top-deck-manipulation | top deck manipulation | 11 | library-manipulation | -

## library size matters (`library-size-matters`)

empty-library | empty library | 9 | library-size-matters | Cards that respond to an empty library.
library-size-matters | library size matters | 12 | - | -

## lich effect (`lich-effect`)

lich-effect | lich effect | 14 | - | Effects which turn damage into the loss of cards or permanents. See also [Deal with the devil](/tags/card/deal-with-the…

## life doubler (`life-doubler`)

life-doubler | life doubler | 5 | - | Double someone's life. See also [set life total](/tags/card/set-life-total) and [life divider](/tags/card/life-divider).

## life loss matters (`life-loss-matters`)

gives-spectacle | gives spectacle | 1 | life-loss-matters | -
life-loss-matters | life loss matters | 124 | - | -
self-life-loss-matters | self life loss matters | 35 | life-loss-matters | -

## life payment (`life-payment`)

alternate-cost-life | alternate-cost-life | 7 | life-payment | Cards that let you pay life to play them for less or no mana
boltland | boltland | 1 | life-payment | Lands you can pay 3 life/take 3 damage to have them enter untapped.
life-for-cards | life for cards | 281 | life-payment | Get cards in exchange for your life (damage causes loss of life).
life-payment | life payment | 344 | - | Cards that cost life to use; not necessarily with the "pay" keyword.
painland | painland | 37 | life-payment | Lands that deal damage to the user upon tapping them for mana
phyrexian-mana | phyrexian mana | 0 | life-payment | -
shockland | shockland | 1 | life-payment | Lands which enter tapped unless you pay two life.

## life-total-matters-self (`life-total-matters-self`)

life-total-matters-self | life-total-matters-self | 75 | - | Cards that care about your life total being above or below a certain amount. This doesn’t include cards like Phyrexian…

## lifegain (`lifegain`)

drain-creature | drain creature | 75 | lifegain | Hurt a creature and gain life to match.
drain-life | drain life | 373 | lifegain | Hurt your opponent and gain life to match.
gainland | gainland | 7 | lifegain | Lands that have you gain life when they enter the battlefield.
gains-lifelink | gains lifelink | 104 | lifegain | -
gives-lifelink | gives lifelink | 230 | lifegain | -
gives-lifelink-noncreature | gives lifelink noncreature | 9 | lifegain | -
lifegain | lifegain | 881 | - | -
old-lifelink | old lifelink | 29 | lifegain | Before lifelink was keyworded in Magic 2010, it was a triggered ability.
repeatable-lifegain | repeatable lifegain | 1385 | lifegain | -

## lifegain increaser (`lifegain-increaser`)

lifegain-increaser | lifegain increaser | 14 | - | -

## lifegain matters (`lifegain-matters`)

infusion | infusion | 41 | lifegain-matters | If you gained life this turn, do a thing
lifegain-matters | lifegain matters | 127 | - | -
lifegain-to-damage | lifegain to damage | 18 | lifegain-matters | Transforms player lifegain into player damage.
pridemate | pridemate | 42 | lifegain-matters | Effects that put +1/+1 counters on something when you gain life.

## lightning bolt redux (`lightning-bolt-redux`)

lightning-bolt-redux | lightning bolt redux | 14 | - | These cards deal 3 damage for {R} under the right circumstances, like Lightning Bolt.

## liliana's pact demon (`liliana-s-pact-demon`)

liliana-s-pact-demon | liliana's pact demon | 4 | - | -

## lockdown (`lockdown`)

dehydration-with-set-mechanic | dehydration with set mechanic | 16 | lockdown | -
lockdown | lockdown | 2 | - | A permanent stays tapped. Named in the Color Pie 2017 article. See also [freeze](freeze).
lockdown-artifact | lockdown-artifact | 15 | lockdown | -
lockdown-creature | lockdown-creature | 107 | lockdown | -
lockdown-land | lockdown-land | 10 | lockdown | -
lockdown-nonland | lockdown-nonland | 2 | lockdown | -
lockdown-permanent | lockdown-permanent | 4 | lockdown | -
lockdown-planeswalker | lockdown-planeswalker | 2 | lockdown | -

## lockdown-spacecraft (`lockdown-spacecraft`)

lockdown-spacecraft | lockdown-spacecraft | 1 | - | -

## loner (`loner`)

loner | loner | 13 | - | Cards that want you to have only one creature, or creatures that want to be the only creature a player controls

## low x matters (`low-x-matters`)

low-x-matters | low x matters | 3 | - | -

## mana abilities matter (`mana-abilities-matter`)

mana-abilities-matter | mana abilities matter | 13 | - | -

## mana ability with extra effect (`mana-ability-with-extra-effect`)

mana-ability-with-extra-effect | mana ability with extra effect | 71 | - | Mana abilities that have some extra effect upon activating them, meaning that they can do actions in strange cases such…

## mana cost matters (`mana-cost-matters`)

mana-cost-matters | mana cost matters | 9 | - | Cards that care about the actual symbols in a mana cost.
x-cost-matters | x cost matters | 22 | mana-cost-matters | -

## mana filter (`mana-filter`)

filterland | filterland | 39 | mana-filter | Lands that take one mana and give you back another colour of mana, sometimes in greater quantities.
mana-filter | mana filter | 131 | - | Convert mana to other colors.

## mana fix (`mana-fix`)

mana-fix | mana fix | 58 | - | Allows your lands to tap for additional color(s) of mana. See also [mana filter](https://tagger.scryfall.com/tags/card/…

## mana sink (`mana-sink`)

bottomless-mana-sink | bottomless mana sink | 776 | mana-sink | Repeatable effects that, if an arbitrary amount of mana is dumped into them, will probably win you the game—for example…
leveler | leveler | 26 | mana-sink | -
mana-sink | mana sink | 763 | - | Cards with repeatable effects that you can dump a bunch of mana (at least 3) into each turn.

## mana spent matters (`mana-spent-matters`)

amount-spent-matters | amount spent matters | 100 | mana-spent-matters | The amount of mana you spent to do the thing matters.
color-spent-matters | color spent matters | 66 | mana-spent-matters | Spells and abilities that care about the color(s) of mana spent on them.
mana-spent-matters | mana spent matters | 24 | - | Effects that care about the amount, type, and/or qualities of mana spent to do a thing.

## mana storage (`mana-storage`)

mana-storage | mana storage | 55 | - | Cards that can be used to store mana for later phases and/or turns. The storing methods are varied—many use counters to…
storage-land | storage land | 5 | mana-storage | Lands that can store up mana over time for later use.

## mana value matters (`mana-value-matters`)

clash-like | clash-like | 37 | mana-value-matters | Cards that compare the mana values of multiple players' revealed cards
emerge | emerge | 0 | mana-value-matters | Creatures that let you sacrifice something to cast them at a cost reduced by the mana cost of the creature sacrificed
mana-value-matters | mana value matters | 779 | - | -

## manaless land (`manaless-land`)

manaless-land | manaless land | 19 | - | The vast majority of lands in the game can either tap for mana or be exchanged for another land that does. This tag rep…

## manaless value (`manaless-value`)

manaless-value | manaless value | 204 | - | Cards that can provide some amount of value without untapped lands.

## mass fight (`mass-fight`)

mass-fight | mass fight | 12 | - | -

## mass land denial (`mass-land-denial`)

mass-land-denial | mass land denial | 111 | - | Effects that regularly destroy, exile, and bounce other lands, keep lands tapped, or change what mana is produced by fo…

## mass reanimation (`mass-reanimation`)

mass-reanimation | mass reanimation | 56 | - | Reanimate everything (or every thing of a kind) from one or more graveyards (or potentially do this).

## match points matter (`match-points-matter`)

match-points-matter | match points matter | 1 | - | -

## mechanical foreshadow (`mechanical-foreshadow`)

mechanical-foreshadow | mechanical foreshadow | 13 | - | Cards that refer to another card, card type, or named mechanic that was not yet in the game (or sometimes later in Stan…

## meme (`meme`)

meme | meme | 129 | - | Cards that have become memes in Magic, or are explicitly based off of memes.

## mill (`mill`)

grind | grind | 10 | mill | Mill cards until N land cards are milled.
mill | mill | 0 | - | A keyword action used in Magic to describe the action of a player taking cards from the top of their library and puttin…
mill-any | mill-any | 187 | mill | Cards that let you choose a library to mill. Could be yours, could be theirs. It could also be an indirect choice, e.g.…
mill-exile | mill-exile | 117 | mill | Exile cards from the top of a library.
mill-opponent | mill-opponent | 194 | mill | -
mill-self | mill-self | 332 | mill | Cards that put cards from top of your own library to the graveyard. Check the tag "mill" for more.

## mimic (`mimic`)

mimic | mimic | 36 | - | Cards that can copy (mimic) the abilities of other cards.

## minigame (`minigame`)

bid | bid | 4 | minigame | -
minigame | minigame | 99 | - | Engages one or more other players in a bet or mind game (not necessarily explicitly).

## mirrored knight (`mirrored-knight`)

mirrored-knight | mirrored knight | 32 | - | Magic has a history of having pairs of knights oppose each other.

## misnomer (`misnomer`)

misnomer | misnomer | 46 | - | Cards with names that imply something that card isn't, such as a mechanic or a color.

## mix-and-match (`mix-and-match`)

mix-and-match | mix-and-match | 158 | - | Two or more non-evergreen mechanics blended together on the same card.

## mixed subtypes (`mixed-subtypes`)

mixed-subtypes | mixed subtypes | 88 | - | These cards have subtypes on the same type line that belong to different card types. (For example, Dryad is a creature…

## modal (`modal`)

charm | charm | 54 | modal | Modal spells where you pick one option out of three
command | command | 14 | modal | Modal spells where you pick two options out of four
confluence | confluence | 4 | modal | Modal spells where you pick three options out of three, with the ability to choose a mode multiple times
modal | modal | 593 | - | Spells which give you your choice from two or more distinct functions.
modal-inverse-choices | modal inverse choices | 43 | modal | Spells where the modal options are: X, Mirror of X
siege-modal | siege (modal) | 5 | modal | Named ongoing modal effect. Chosen when entering and tracked by players.

## monarch matters (`monarch-matters`)

monarch-matters | monarch matters | 46 | - | -

## morbid (`morbid`)

morbid | morbid | 129 | - | Effects that care about at least one creature dying this turn.

## more expensive than mv (`more-expensive-than-mv`)

more-expensive-than-mv | more expensive than mv | 963 | - | The actual cost you pay for an effect (or for an alternate mode) will often be higher than the card's mana value. See a…
multicolor-kicker | multicolor kicker | 19 | more-expensive-than-mv | -
multiple-kicker-costs | multiple kicker costs | 18 | more-expensive-than-mv | -
offcolor-additional-cost | offcolor additional cost | 84 | more-expensive-than-mv | Cards with an additional cost of mana beyond the card's own colors.

## move counters (`move-counters`)

move-counters | move counters | 67 | - | -

## multi character card (`multi-character-card`)

legendary-team-up | legendary team-up | 48 | multi-character-card | March of the Machines introduced a number of cards representing legendary cards teaming up. (And some playtest cards ex…
multi-character-card | multi character card | 88 | - | This card represents multiple distinct identifiable characters on one face. Avoid using this for nameless mobs.

## multicast (`multicast`)

multicast | multicast | 4 | - | A spell that involves casting multiple spells. (Not copying, but actually casting.)

## multiplayer (`multiplayer`)

lose-trigger | lose trigger | 11 | multiplayer | Cards that trigger when an opponent loses the game (as opposed a replacement effect for yourself).
multiplayer | multiplayer | 144 | - | Cards that interact with all of the players in the game. They might scale with the number of players or affect the turn…
per-player | per-player | 385 | multiplayer | Effects that scale positively with the number of players; i. e., "for each player", "for each opponent", etc.

## multiple bodies (`multiple-bodies`)

enters-in-company | enters in company | 489 | multiple-bodies | Creatures that come with more creatures attached on ETB without reanimating them.
multiple-bodies | multiple bodies | 418 | - | One-shot effects that put two or more creatures onto the battlefield on resolution.

## multiple species types (`multiple-species-types`)

multiple-species-types | multiple species types | 96 | - | Creatures that have two or more types that are considered to be a species, such as "Human" or "Elf"

## multiple targets (`multiple-targets`)

multiple-targets | multiple targets | 1476 | - | These cards can target more than one object or player. Not mutually exclusive with [single target instant/sorcery](/tag…

## mutiny (`mutiny`)

mutiny | mutiny | 9 | - | Cards that can make multiple creatures under the same players control fight (or [bite](one-sided-fight))

## name matters (`name-matters`)

differently-named-lands-matter | differently named lands matter | 8 | name-matters | These cards want you to have multiple lands with different names.
hate-named | hate-named | 23 | name-matters | Hate a specific card of your choice. Yes, that one.
name-matters | name matters | 198 | - | Effects that care about card names: different names, same name, specific name, etc.
scales-with-multiple | scales with multiple | 70 | name-matters | Cards that scale as you play more copies of themselves.
tutor-copy | tutor-copy | 17 | name-matters | Tutors for something with the same name as something else
tutors-by-name | tutors by name | 82 | name-matters | These cards tutor other cards by their name. For their tutor targets, see [tutored by name](tutored-by-name).

## named choice (`named-choice`)

named-choice | named choice | 41 | - | Players choose something, but the choices are given names, rather than choosing the effect itself.
siege-modal | siege (modal) | 5 | named-choice | Named ongoing modal effect. Chosen when entering and tracked by players.

## named token (`named-token`)

named-token | named token | 81 | - | Tokens that have a specific name, rather than inheriting their name from their type line.

## neo-regenerate (`neo-regenerate`)

neo-regenerate | neo-regenerate | 22 | - | An activated ability that says "this gains indestructible; tap it" is the new Regenerate.

## night matters (`night-matters`)

night-matters | night matters | 3 | - | -

## no-creature-type (`no-creature-type`)

no-creature-type | no-creature-type | 9 | - | Creatures without any creature types

## non mana ability mana (`non-mana-ability-mana`)

gains-firebending | gains firebending | 1 | non-mana-ability-mana | -
gives-firebending | gives firebending | 4 | non-mana-ability-mana | -
non-mana-ability-mana | non mana ability mana | 182 | - | Abilities that produce mana, but aren't mana abilities (as defined by CR 605.1)

## nonbasic-basic-land-type (`nonbasic-basic-land-type`)

nonbasic-basic-land-type | nonbasic-basic-land-type | 106 | - | -

## noncreature virtual vanilla (`noncreature-virtual-vanilla`)

noncreature-virtual-vanilla | noncreature virtual vanilla | 3 | - | -

## nonstandard-bestow (`nonstandard-bestow`)

nonstandard-bestow | nonstandard-bestow | 5 | - | Bestow creatures that, when attached to a creature, do something other than exactly providing a P/T boost equal to thei…

## noted tracked information (`noted-tracked-information`)

noted-tracked-information | noted tracked information | 19 | - | Cards that have you note something down in order to track it.

## notorious templating (`notorious-templating`)

notorious-templating | notorious templating | 77 | - | Cards with effects that have to be templated in such a way that they are confusing to read at first glance. They don't…

## off-turn casting matters (`off-turn-casting-matters`)

off-turn-casting-matters | off-turn casting matters | 31 | - | -

## offcolor ability (`offcolor-ability`)

offcolor-ability | offcolor ability | 332 | - | Abilities with a mana cost outside the card's colors.

## offcolor mana generation (`offcolor-mana-generation`)

offcolor-mana-generation | offcolor mana generation | 20 | - | Non-colorless cards that generate colored mana, but don't generate their own color of mana.

## old banish templating (`old-banish-templating`)

old-banish-templating | old banish templating | 16 | - | Banish effects in which the "exile" and "return" effects are separate linked abilities.

## one-off (`one-off`)

one-off | one-off | 6 | - | These are cards that have only one known printing of them, as a one-off celebration card. This tag isn't for specific o…

## open attraction (`open-attraction`)

open-attraction | open attraction | 46 | - | -

## opponent chooses (`opponent-chooses`)

arena-effect | arena effect | 3 | opponent-chooses | You and an opponent pick a creature you own, then they fight! (Or kiss, in the tunnel of love)
fact-or-fiction | fact or fiction | 22 | opponent-chooses | Pile/dilemma based card advantage. An opponent is involved in choosing or making the piles.
gifts-ungiven | gifts ungiven | 16 | opponent-chooses | Get X cards from a location, opponent picks an amount of those you get to keep.
opponent-chooses | opponent chooses | 107 | - | -
tribute | tribute | 11 | opponent-chooses | Collection tag used to apply the various tags that comprise the keyword Tribute. Should be 1:1 with kw:tribute.

## opponent lifegain (`opponent-lifegain`)

opponent-lifegain | opponent lifegain | 57 | - | -

## opponent loses life (`opponent-loses-life`)

opponent-loses-life | opponent loses life | 900 | - | -

## opponent sacrifices (`opponent-sacrifices`)

opponent-sacrifices | opponent sacrifices | 7 | - | -

## out of color token (`out-of-color-token`)

out-of-color-token | out of color token | 311 | - | -

## pair-commander (`pair-commander`)

pair-commander | pair-commander | 247 | - | These cards can be one half of a two-card pair of commanders

## paper-compatible (`paper-compatible`)

paper-compatible | paper-compatible | 183 | - | Online-only cards that would work if printed in paper, albeit annoying to track or execute at times

## parasitic aura (`parasitic-aura`)

parasitic-aura | parasitic aura | 48 | - | Auras that harm the enchanted permanent's controller (usually by dealing damage or causing loss of life)

## passive ability (`passive-ability`)

passive-ability | passive ability | 93 | - | Planeswalkers with non-loyalty abilities.

## peek (`peek`)

peek | peek | 0 | - | Cards that give you access to hidden information (Yours or other players)
peek-face-down | peek-face-down | 9 | peek | Cards that allow you to look at face-down creatures you don't control.
peek-hand | peek-hand | 91 | peek | Take a quick look at a players hand
peek-library | peek-library | 20 | peek | Look at some number of cards from the top of libraries

## perpetual aura (`perpetual-aura`)

perpetual-aura | perpetual aura | 8 | - | Auras that come back to your hand as they "fall off".

## personal-text (`personal-text`)

personal-text | personal-text | 111 | - | Cards referring to themselves or other objects in ways that personify them beyond a singular objectified ‘it’.

## phase manipulation (`phase-manipulation`)

extra-combat-phase | extra combat phase | 53 | phase-manipulation | -
extra-draw-step | extra draw step | 4 | phase-manipulation | -
extra-upkeep | extra upkeep | 7 | phase-manipulation | -
phase-manipulation | phase manipulation | 15 | - | Cards that interact with the phases of a turn, usually by having players skip or gain additonal ones.
skip-draw-step | skip draw step | 20 | phase-manipulation | -
skip-untap-step | skip untap step | 11 | phase-manipulation | -

## phasing (`phasing`)

phasing | phasing | 72 | - | Cards that involve phasing, whether the action or ability.

## phyrexian token (`phyrexian-token`)

phyrexian-token | phyrexian token | 11 | - | These tokens had Phyrexian variants added in Modern Horizons 2 errata.

## pierce (`pierce`)

pierce | pierce | 6 | - | Cards whose excess damage is dealt to their target's controller instead.

## pile (`pile`)

pile | pile | 10 | - | Effects that make you put things in a pile for selection/grouping purposes

## pillage effect (`pillage-effect`)

pillage-effect | pillage effect | 9 | - | Cards that loot/rummage and create Treasure(s).

## pillowfort (`pillowfort`)

pillowfort | pillowfort | 19 | - | Cards that disincentivise or make it harder for opponents to attack you
tax-attack | tax attack | 40 | pillowfort | Cards that prevent players from attacking unless they pay a cost, usually mana

## pinger (`pinger`)

pinger | pinger | 411 | - | Effects that deal just 1-2 damage repeatedly.

## place sticker (`place-sticker`)

place-sticker | place sticker | 58 | - | All cards that put a sticker onto a card.

## planechase mechanic (`planechase-mechanic`)

planechase-mechanic | planechase mechanic | 14 | - | -

## planeswalker deck face card (`planeswalker-deck-face-card`)

planeswalker-deck-face-card | planeswalker deck face card | 41 | - | -

## planeswalker deck staples (`planeswalker-deck-staples`)

planeswalker-deck-staples | planeswalker deck staples | 0 | - | Cards that are formulaic includes of planeswalker decks: [tutors](/tags/card/pwdeck-tutor) to help you find the deck's…
pwdeck-sidekick | pwdeck-sidekick | 38 | planeswalker-deck-staples | Cards from Planeswalker Decks that care about having the corresponding planeswalker out.
pwdeck-tutor | pwdeck-tutor | 36 | planeswalker-deck-staples | Cards from Planeswalker Decks that tutor for the corresponding planeswalker.

## player spotlight (`player-spotlight`)

player-spotlight | player spotlight | 5 | - | Player Spotlight cards are Magic: The Gathering cards that celebrate the winners of the World Championships, similar to…

## playtest forecast (`playtest-forecast`)

playtest-forecast | playtest forecast | 27 | - | These playtest cards previewed mechanics seen within 2-3 years of release, meaning they were being worked on at the tim…

## poison mechanics (`poison-mechanics`)

gains-infect | gains infect | 4 | poison-mechanics | -
gains-toxic | gains toxic | 2 | poison-mechanics | -
gives-infect | gives infect | 8 | poison-mechanics | -
gives-poisonous | gives poisonous | 5 | poison-mechanics | Gives a creature the ability to give a set amount of poison counters to opponents upon combat damage, like the poisonou…
gives-toxic | gives toxic | 9 | poison-mechanics | -
poison-mechanics | poison mechanics | 11 | - | Cards and effects that interact with poison counters by name.
poison-opponents | poison opponents | 21 | poison-mechanics | Gives poison counters directly to opponents, preferebly to all at once, without damage.
poisonous | poisonous | 131 | poison-mechanics | Makes, or is, a creature that poisons a player when it hits them.
removes-infect | removes infect | 1 | poison-mechanics | -
synergy-poison | synergy-poison | 42 | poison-mechanics | -

## polymorph (`polymorph`)

polymorph | polymorph | 39 | - | Effects that remove a permanent and replace it with another random one.

## potentially black border (`potentially-black-border`)

potentially-black-border | potentially black border | 514 | - | Cards not intended for constructed play that could have been printed in a vintage/commander legal product instead if th…

## power boost to all (`power-boost-to-all`)

battle-cry | battle cry | 18 | power-boost-to-all | Whenever this attacks, each other attacking creature gets +1/+0 until end of turn.
gives-pp-counters-to-all | gives pp counters to all | 187 | power-boost-to-all | Put +1/+1 counters on all of your creatures.
overrun | overrun | 78 | power-boost-to-all | Effects that grant trample and +P/+T
power-boost-to-all | power boost to all | 937 | - | Cards that provide power to all creatures you control. May be limited to certain types or colors.
prowess-anthem | prowess anthem | 7 | power-boost-to-all | -
trumpet-blast | trumpet blast | 31 | power-boost-to-all | Instants that give +N/+0 to all your (attacking) creatures until end of turn.

## power matters (`power-matters`)

daunt | daunt | 40 | power-matters | The "can't be blocked by power 2 or less" as named by WotC. See also [gives daunt](gives-daunt).
ferocious | ferocious | 117 | power-matters | Cards that care about you controlling creatures with power 4 or greater.
gives-daunt | gives daunt | 8 | power-matters | -
gives-nimble | gives nimble | 4 | power-matters | -
naya-ferocious | naya ferocious | 27 | power-matters | Cards that care about you controlling creatures with power 5 or greater.
nimble | nimble | 8 | power-matters | "Can't be blocked by creatures with power 3 or greater", an opposite of [daunt](daunt) first seen on Amrou Kithkin and…
power-doubler | power doubler | 61 | power-matters | -
power-matters | power matters | 301 | - | -
power-matters-individual | power matters-individual | 40 | power-matters | Effects which care about the power of one creature (or multiple creatures individually, as opposed to as a total).
power-matters-self | power matters-self | 296 | power-matters | -
power-matters-total | power matters-total | 12 | power-matters | Effects which care about the total power of some set of creatures.
scales-with-power | scales with power | 93 | power-matters | Effects which scale with the power of one or more creatures.
specific-power-matters | specific power matters | 14 | power-matters | -
synergy-low-power | synergy-low-power | 69 | power-matters | Effects that care about you having creatures with power below some boundary value.
tap-fuel-power | tap fuel-power | 113 | power-matters | -

## power nine (`power-nine`)

power-nine | power nine | 9 | - | Nine rare cards from Alpha considered to be the most powerful nine cards in the entire game.

## predefined token (`predefined-token`)

predefined-token | predefined token | 19 | - | CR 111.10 - Some effects instruct a player to create a predefined token.

## prepare matters (`prepare-matters`)

prepare-matters | prepare matters | 2 | - | -

## prevent activation (`prevent-activation`)

detain | detain | 18 | prevent-activation | Prevent a creature from attacking, blocking, or using it's activated abilities until one's next turn.
null-rod | null rod | 6 | prevent-activation | -
prevent-activation | prevent activation | 67 | - | -

## prevent attack (`prevent-attack`)

detain | detain | 18 | prevent-attack | Prevent a creature from attacking, blocking, or using it's activated abilities until one's next turn.
prevent-attack | prevent attack | 150 | - | -

## prevent blocker (`prevent-blocker`)

detain | detain | 18 | prevent-blocker | Prevent a creature from attacking, blocking, or using it's activated abilities until one's next turn.
prevent-blocker | prevent blocker | 258 | - | -
prevent-mass-blockers | prevent mass blockers | 44 | prevent-blocker | Cards that sweepingly prevent blocks from happening.

## prevent cast (`prevent-cast`)

nevermore | nevermore | 12 | prevent-cast | Cards with a certain name can't be cast. See also [lobotomy](/tags/card/lobotomy), where certain cards can't be exist.
prevent-cast | prevent cast | 55 | - | -
silence | silence | 27 | prevent-cast | Prevent opponents from casting spells, and possibly also active abilities.

## prevent damage redirection (`prevent-damage-redirection`)

prevent-damage-redirection | prevent damage redirection | 3 | - | -

## prevent etb (`prevent-etb`)

prevent-etb | prevent etb | 9 | - | Cards that prevent permanents from entering the battlefield.

## prevent sacrifice (`prevent-sacrifice`)

prevent-sacrifice | prevent sacrifice | 16 | - | Cards that prevent something from being sacrificed.

## prevent-transform (`prevent-transform`)

prevent-transform | prevent-transform | 2 | - | -

## prevent trigger (`prevent-trigger`)

prevent-trigger | prevent trigger | 7 | - | -

## prevents win/loss (`prevents-win-loss`)

platinum-angel-effect | platinum angel effect | 11 | prevents-win-loss | Cards that stop you specifically from losing while preventing your opponents from winning.
prevents-win-loss | prevents win/loss | 15 | - | -
save-from-death | save from death | 7 | prevents-win-loss | -

## promotes to commander (`promotes-to-commander`)

promotes-to-commander | promotes to commander | 7 | - | Cards that make things that aren't commanders, commanders.

## protection (`protection`)

gains-hexproof | gains hexproof | 61 | protection | -
gains-protection | gains protection | 42 | protection | -
gains-shroud | gains shroud | 20 | protection | -
gives-hexproof | gives hexproof | 160 | protection | -
gives-indestructible | gives indestructible | 282 | protection | -
gives-player-hexproof | gives player hexproof | 23 | protection | -
gives-player-protection | gives player protection | 14 | protection | -
gives-player-shroud | gives player shroud | 5 | protection | -
gives-protection | gives protection | 127 | protection | -
gives-shroud | gives shroud | 49 | protection | -
gives-ward | gives ward | 69 | protection | -
protection | protection | 0 | - | Effects relating to protecting your permanents (not necessarily via the protection keyword.)
protects-all | protects-all | 217 | protection | Effects that give a form of protection to all permanents of a kind. (That may be hexproof, indestructible, protection,…
protects-artifact | protects-artifact | 60 | protection | -
protects-creature | protects-creature | 723 | protection | Effects that can protect a creature, e.g. with protection, hexproof, indestructible, etc.
protects-enchantment | protects-enchantment | 31 | protection | -
protects-land | protects-land | 34 | protection | -
protects-nonland | protects-nonland | 6 | protection | -
protects-permanent | protects-permanent | 36 | protection | -
protects-planeswalker | protects-planeswalker | 99 | protection | -
protects-vehicle | protects-vehicle | 1 | protection | -

## pseudo-dethrone (`pseudo-dethrone`)

pseudo-dethrone | pseudo-dethrone | 12 | - | Cards that give benefits if their owner is attacking the opponent/player with the highest life total

## pseudo-exert (`pseudo-exert`)

pseudo-exert | pseudo-exert | 6 | - | -

## pseudo-fog (`pseudo-fog`)

pseudo-fog | pseudo-fog | 65 | - | Effects that can protect you from an entire combat phase, similar to the card Fog, but using less conventional means th…

## pseudo-haste (`pseudo-haste`)

pseudo-haste | pseudo-haste | 6 | - | -

## pseudo-hexproof (`pseudo-hexproof`)

pseudo-hexproof | pseudo-hexproof | 8 | - | Cards that do something very much like hexproof, but not hexproof.

## pseudo-legendary (`pseudo-legendary`)

pseudo-legendary | pseudo-legendary | 2 | - | Cards that aren't typed 'legendary', yet still have rules that prevent multiple copies of them being in play simultaneo…

## pseudo-leveler (`pseudo-leveler`)

pseudo-leveler | pseudo-leveler | 9 | - | Creatures with abilities that add incremental layers of growth.

## pseudo-proliferate (`pseudo-proliferate`)

pseudo-proliferate | pseudo-proliferate | 26 | - | Effects that sorta-proliferate some counters.

## pseudo-shroud (`pseudo-shroud`)

pseudo-shroud | pseudo-shroud | 14 | - | Prevents targeting from certain things from any player, including it's controller.
shroud-from-black | shroud from black | 1 | pseudo-shroud | -
shroud-from-blue | shroud from blue | 1 | pseudo-shroud | -
shroud-from-nongreen | shroud from nongreen | 1 | pseudo-shroud | -
shroud-from-red | shroud from red | 1 | pseudo-shroud | -
shroud-from-white | shroud from white | 2 | pseudo-shroud | -

## pseudo-vehicle (`pseudo-vehicle`)

pseudo-vehicle | pseudo-vehicle | 1 | - | -

## punchcard (`punchcard`)

punchcard | punchcard | 2 | - | -

## quadratic (`quadratic`)

quadratic | quadratic | 76 | - | Cards with some kind of effect increases to the second power. This could mean something like a power increase, token cr…

## quick attach (`quick-attach`)

quick-attach | quick attach | 2 | - | Abilities that instantly attach equipment and/or auras.
quick-enchant | quick enchant | 22 | quick-attach | Abilities that attach auras.
quick-equip | quick equip | 104 | quick-attach | Non-Equip abilities that attach equipment.

## raid (`raid`)

raid | raid | 50 | - | Cards that have an upside if you attacked this turn.

## rainbow land (`rainbow-land`)

rainbow-land | rainbow land | 118 | - | A land that can net one or more mana of any color.

## ramp (`ramp`)

combat-ramp | combat ramp | 171 | ramp | Generate mana/more lands by attacking and/or dealing combat damage
extra-land | extra land | 36 | ramp | Effects that allow you to put additional lands from your hand, top of the library, or graveyard onto the battlefield ou…
land-ramp | land ramp | 487 | ramp | Ramp spells that net you more lands on your side of the battlefield.
mana-increaser | mana increaser | 61 | ramp | Cards that increase the mana produced by mana producers, usually lands.
mana-producer | mana producer | 105 | ramp | Nonland cards that generate mana.
ramp | ramp | 565 | - | Effects that increase available mana for current or later turns.
ramp-with-set-s-mechanic | ramp with set's mechanic | 78 | ramp | -
repeatable-landers | repeatable landers | 3 | ramp | -
ritual | ritual | 53 | ramp | Spells that add mana.

## random card (`random-card`)

conjure-random | conjure-random | 19 | random-card | Cards that conjure random cards.
random-card | random card | 24 | - | Cards that involve bringing up a Magic: The Gathering card at random, either from the entire card pool or with certain…

## ransom (`ransom`)

ransom | ransom | 36 | - | Cards that remove permanents unless a cost is paid.

## reanimate matters (`reanimate-matters`)

reanimate-matters | reanimate matters | 22 | - | -

## recursion (`recursion`)

demilich-effect | demilich effect | 32 | recursion | Exiles cards from graveyard, but lets you cast copies of them. Essentially (usually) one-time recursion
gives-castable-from-graveyard | gives castable from graveyard | 115 | recursion | Allows you to play other cards from the graveyard.
grim-return | grim return | 14 | recursion | Get stuff that just went away back on the battlefield. Compare [cheat death](cheat-death).
impulsive-recursion | impulsive recursion | 18 | recursion | Sends cards to exile from the graveyard and you can cast them for a limited time. Similar to [Impulsive Draw](/tags/car…
reanimate | reanimate | 11 | recursion | Return permanent cards from the graveyard to the battlefield.
reanimate-copy | reanimate copy | 52 | recursion | "Brings back" a copy of a permanent card in a graveyard instead of the original. Could be a token copy, could be turnin…
recursion | recursion | 0 | - | Get stuff back from your graveyard to use it again. See: reanimate (to battlefield), regrowth (to hand), and restock (t…
recursion-any | recursion-any | 0 | recursion | -
recursion-artifact | recursion-artifact | 2 | recursion | -
recursion-battle | recursion-battle | 0 | recursion | -
recursion-creature | recursion-creature | 1 | recursion | -
recursion-enchantment | recursion-enchantment | 1 | recursion | -
recursion-instant | recursion-instant | 13 | recursion | -
recursion-land | recursion-land | 0 | recursion | -
recursion-permanent | recursion-permanent | 1 | recursion | -
recursion-planeswalker | recursion-planeswalker | 0 | recursion | -
recursion-self | recursion-self | 0 | recursion | -
recursion-sorcery | recursion-sorcery | 11 | recursion | -
regrowth | regrowth | 36 | recursion | Effects that return cards from your graveyard to your hand.
restock | restock | 0 | recursion | Effects that return cards from the graveyard to the library. (Named in Maro's color pie 2017 article.)

## recycle (`recycle`)

recycle | recycle | 26 | - | Sacrifice a thing to get another thing back from the graveyard.

## red effect (`red-effect`)

abrade | abrade | 33 | red-effect | Modal instant or sorcery spells that offer the option to either deal damage to creature(s) or remove artifact(s).
earthquake | earthquake | 52 | red-effect | Spells that deal damage to creatures without flying.
gamble | gamble | 6 | red-effect | Search for a card, and then discard a card at random (with a chance to discard the card you tutored for)
impulsive-draw | impulsive draw | 31 | red-effect | Cards which let you cast a card for a limited time off the top of a library (via exile). Use it or lose it. Typically a…
last-chance | last chance | 6 | red-effect | Red cards that manipulate the turn cycle, then kill you.
red-effect | red effect | 0 | - | Effects which are iconically red.
rummage | rummage | 131 | red-effect | Discard a card, then draw a card. Mainly red. See also [loot](/tags/card/loot), the blue version, which draws then disc…
rummage-to-library | rummage to library | 9 | red-effect | Rummage with the discarded cards tucked in your library.

## references keyword (`references-keyword`)

references-keyword | references keyword | 14 | - | Cards that reference a keyword or mechanic that don't actually have that mechanic.

## refund (`refund`)

full-refund | full refund | 97 | refund | Cards that give you mana equal to or greater than the amount of mana spent for it, either in the form of a immediately…
mini-refund | mini refund | 332 | refund | Immediately gives you a small amount of mana or untapped lands back (typically no more than about one-third of the mana…
refund | refund | 258 | - | Immediately get mana or untapped lands back.

## regenerates other (`regenerates-other`)

regenerates-other | regenerates other | 99 | - | Cards with effects that regenerate other things (and possibly including themselves.)

## regenerates self (`regenerates-self`)

regenerates-self | regenerates self | 178 | - | Cards with effects that regenerate themselves.

## relaxed commander restriction (`relaxed-commander-restriction`)

relaxed-commander-restriction | relaxed commander restriction | 7 | - | (Typically) playtest cards that bend the rules of what you can or cannot run in your commander deck, such as deck size…

## relentless (`relentless`)

relentless | relentless | 13 | - | Cards you can have more than the usual number of in your deck.

## removal (`removal`)

multi-removal | multi removal | 638 | removal | Removal for more than one, but less than all. See also [spot removal](spot-removal) and [sweeper](sweeper).
removal | removal | 0 | - | Get things off the table.
removal-artifact | removal-artifact | 342 | removal | -
removal-aura | removal-aura | 28 | removal | -
removal-battle | removal-battle | 12 | removal | -
removal-bounce | removal-bounce | 362 | removal | -
removal-burn | removal-burn | 0 | removal | -
removal-creature | removal-creature | 1928 | removal | -
removal-destroy | removal-destroy | 1708 | removal | -
removal-enchantment | removal-enchantment | 222 | removal | -
removal-equipment | removal-equipment | 22 | removal | -
removal-exile | removal-exile | 448 | removal | -
removal-land | removal-land | 301 | removal | -
removal-noncreature | removal-noncreature | 15 | removal | -
removal-nonenchantment | removal-nonenchantment | 3 | removal | -
removal-nonland | removal-nonland | 394 | removal | -
removal-planeswalker | removal-planeswalker | 148 | removal | -
removal-sacrifice | removal-sacrifice | 385 | removal | -
removal-spacecraft | removal-spacecraft | 3 | removal | -
removal-token | removal-token | 7 | removal | -
removal-tuck | removal-tuck | 146 | removal | -
removal-vehicle | removal-vehicle | 13 | removal | -
repeatable-removal | repeatable removal | 1770 | removal | -
spot-removal | spot removal | 4979 | removal | Removal for one target specifically. See also [sweeper](sweeper) and [multi removal](multi-removal).
sunder | sunder | 11 | removal | Remove everything attached to a permanent while possibly leaving the permanent behind. (Some of these taggings consider…
sweeper | sweeper | 740 | removal | _o\ Destroy all the things! See also [spot removal](spot-removal) and [multi removal](multi-removal).

## remove counters (`remove-counters`)

remove-counters | remove counters | 0 | - | Remove counters from stuff.
remove-counters-other | remove counters-other | 47 | remove-counters | Remove counters from your opponents or their stuff.
remove-counters-player | remove counters-player | 9 | remove-counters | Remove counters from players.
remove-counters-you | remove counters-you | 44 | remove-counters | Remove counters from your permanents or yourself.

## remove from combat (`remove-from-combat`)

remove-from-combat | remove from combat | 25 | - | -

## remove-from-stack (`remove-from-stack`)

remove-from-stack | remove-from-stack | 42 | - | -

## removes banding (`removes-banding`)

removes-banding | removes banding | 2 | - | -

## removes deathtouch (`removes-deathtouch`)

removes-deathtouch | removes deathtouch | 1 | - | -

## removes defender (`removes-defender`)

removes-defender | removes defender | 14 | - | -

## removes double strike (`removes-double-strike`)

removes-double-strike | removes double strike | 1 | - | -

## removes first strike (`removes-first-strike`)

removes-first-strike | removes first strike | 6 | - | -

## removes hexproof (`removes-hexproof`)

removes-hexproof | removes hexproof | 11 | - | -

## removes indestructible (`removes-indestructible`)

removes-indestructible | removes indestructible | 12 | - | -

## removes landwalk (`removes-landwalk`)

removes-landwalk | removes landwalk | 4 | - | -

## removes protection (`removes-protection`)

removes-protection | removes protection | 2 | - | -

## removes shadow (`removes-shadow`)

removes-shadow | removes shadow | 2 | - | -

## removes shroud (`removes-shroud`)

removes-shroud | removes shroud | 2 | - | -

## removes toxic (`removes-toxic`)

removes-toxic | removes toxic | 1 | - | -

## removes trample (`removes-trample`)

removes-trample | removes trample | 4 | - | -

## removes ward (`removes-ward`)

removes-ward | removes ward | 1 | - | -

## repeatable crime (`repeatable-crime`)

repeatable-crime | repeatable crime | 3667 | - | Repeatable ways to commit crimes by targeting an opponent or something they control.
repeatable-mutagens | repeatable mutagens | 8 | repeatable-crime | -

## repeatable pp counters (`repeatable-pp-counters`)

repeatable-maps | repeatable maps | 6 | repeatable-pp-counters | -
repeatable-mutagens | repeatable mutagens | 8 | repeatable-pp-counters | -
repeatable-pp-counters | repeatable pp counters | 1668 | - | Repeatable ways of putting +1/+1 counters on creatures.
slith-ability | slith ability | 60 | repeatable-pp-counters | Whenever a creature deals combat damage to a player, it gets a +1/+1 counter.

## repeatable token generator (`repeatable-token-generator`)

repeatable-artifact-tokens | repeatable artifact tokens | 172 | repeatable-token-generator | -
repeatable-creature-tokens | repeatable creature tokens | 1440 | repeatable-token-generator | Repeatable ways to create creature tokens
repeatable-enchantment-tokens | repeatable enchantment tokens | 23 | repeatable-token-generator | -
repeatable-noncreature-tokens | repeatable noncreature tokens | 35 | repeatable-token-generator | Repeatable ways to create noncreature tokens
repeatable-token-generator | repeatable token generator | 3 | - | Repeatable ways to create tokens

## repeated effect (`repeated-effect`)

repeated-effect | repeated effect | 3 | - | -
repeated-keyword | repeated keyword | 87 | repeated-effect | Repetition or stacking of a keyword.

## restart game (`restart-game`)

restart-game | restart game | 2 | - | -

## restart turn (`restart-turn`)

restart-turn | restart turn | 1 | - | -

## restock-noncreature (`restock-noncreature`)

restock-noncreature | restock-noncreature | 1 | - | -

## restock-permanent (`restock-permanent`)

restock-permanent | restock-permanent | 1 | - | -

## restores old rule (`restores-old-rule`)

restores-old-rule | restores old rule | 8 | - | Cards that have an effect that effectively brings back a rule that was changed or removed

## restricted mana (`restricted-mana`)

powerstone-mana | powerstone mana | 35 | restricted-mana | Mana that can't be spent to cast nonartifact spells.
restricted-mana | restricted mana | 193 | - | Mana that has restrictions on what you can or cannot use it on.

## retaliate to damage (`retaliate-to-damage`)

no-mercy | no mercy | 7 | retaliate-to-damage | Cards that destroy creatures that damage you.
retaliate-to-damage | retaliate to damage | 27 | - | Effects that retaliate to damage inflicted upon you, by benefitting you or punishing the opponent.

## reveal hand (`reveal-hand`)

reveal-hand | reveal hand | 15 | - | Makes players reveal their hands more permanently than [peek](peek-hand)

## revolt (`revolt`)

revolt | revolt | 35 | - | Effects that care if a permanent (or creature, etc) you controlled left the battlefield this turn.

## ritual-untap (`ritual-untap`)

ritual-untap | ritual-untap | 20 | - | Single use effects that untap mana-producing permanents greater than or equal to their cost

## rule of law (`rule-of-law`)

rule-of-law | rule of law | 13 | - | Cards that limit the number of spells a player can cast each turn.

## rules nightmare (`rules-nightmare`)

rules-nightmare | rules nightmare | 51 | - | Cards that are known for having interactions that are difficult or nearly impossible to resolve within comprehensive ru…

## saboteur (`saboteur`)

curiosity-like | curiosity-like | 77 | saboteur | Cards that can give you some form of card advantage upon dealing damage, usually combat damage, to a player.
ingest | ingest | 35 | saboteur | Permanents that exile one or more cards from the top of an opponent's library upon dealing combat damage.
omnivore-ability | omnivore ability | 9 | saboteur | -
quietus-effect | quietus effect | 11 | saboteur | Get hit and lose a sizeable fraction of your life.
renown | renown | 20 | saboteur | Collection tag used to apply the various tags that comprise the keyword Renown. Should be 1:1 with kw:renown.
saboteur | saboteur | 546 | - | Effects that trigger when you deal damage to an opponent.
slith-ability | slith ability | 60 | saboteur | Whenever a creature deals combat damage to a player, it gets a +1/+1 counter.
specter-ability | specter ability | 62 | saboteur | Damaging the opponent strips cards out of their hand.

## sacrifice cost land (`sacrifice-cost-land`)

sacrifice-cost-land | sacrifice cost land | 9 | - | Lands that require you to sacrifice another land before they come into play.

## sacrifice outlet (`sacrifice-outlet`)

alternate-cost-sacrifice | alternate-cost-sacrifice | 31 | sacrifice-outlet | Cards that let you sacrifice permanents to play them for free/a reduced amount of mana
bombard | bombard | 96 | sacrifice-outlet | Sacrifice something else to deal N damage. See also [fling](/tags/card/fling), [bombard-self](bombard-self).
buttfling | buttfling | 1 | sacrifice-outlet | Fling, but using toughness for damage.
devour | devour | 26 | sacrifice-outlet | Before a creature enters the battlefield, the player may sacrifice a number of permanents and the creature will enter w…
plunder | plunder | 71 | sacrifice-outlet | Sacrifice something else to draw cards.
repeatable-sacrifice-outlet | repeatable sacrifice outlet | 574 | sacrifice-outlet | Repeatedly sacrifice stuff.
sacrifice-outlet | sacrifice outlet | 1 | - | -
sacrifice-outlet-artifact | sacrifice outlet-artifact | 301 | sacrifice-outlet | -
sacrifice-outlet-creature | sacrifice outlet-creature | 883 | sacrifice-outlet | -
sacrifice-outlet-enchantment | sacrifice outlet-enchantment | 62 | sacrifice-outlet | -
sacrifice-outlet-land | sacrifice outlet-land | 238 | sacrifice-outlet | -
sacrifice-outlet-nonland | sacrifice outlet-nonland | 15 | sacrifice-outlet | -
sacrifice-outlet-permanent | sacrifice outlet-permanent | 56 | sacrifice-outlet | -
sacrifice-outlet-planeswalker | sacrifice outlet-planeswalker | 12 | sacrifice-outlet | -
sacrifice-outlet-token | sacrifice outlet-token | 43 | sacrifice-outlet | -

## sacrifice self (`sacrifice-self`)

bombard-self | bombard-self | 134 | sacrifice-self | Sacrifice this permanent to deal N damage. See also [fling-self](/tags/card/fling-self), [bombard](bombard).
egg | egg | 306 | sacrifice-self | Artifacts that have to be sacrificed to do something.
fetchland | fetchland | 17 | sacrifice-self | Lands that sacrifice to tutor for other lands
martyr | martyr | 530 | sacrifice-self | Creatures that sacrifice themselves for benefit.
sacrifice-self | sacrifice self | 352 | - | -

## scales with damage dealt (`scales-with-damage-dealt`)

drawlink | drawlink | 11 | scales-with-damage-dealt | Effects that cause combat damage dealt to draw that many cards.
old-lifelink | old lifelink | 29 | scales-with-damage-dealt | Before lifelink was keyworded in Magic 2010, it was a triggered ability.
omnivore-ability | omnivore ability | 9 | scales-with-damage-dealt | -
scales-with-damage-dealt | scales with damage dealt | 59 | - | Effects that scale with how much damage a creature deals.
tokenlink | tokenlink | 28 | scales-with-damage-dealt | Dealing N damage creates N tokens (or similar).

## scene (`scene`)

scene | scene | 24 | - | -

## second spell matters (`second-spell-matters`)

second-spell-matters | second spell matters | 71 | - | Cards that care when the player casting or controlling them casts their second spell for the turn.

## secretly choose (`secretly-choose`)

secretly-choose | secretly choose | 30 | - | -

## self-replacement effect (`self-replacement-effect`)

self-replacement-effect | self-replacement effect | 364 | - | A resolving spell or ability partially or completely replacing one of its own effects.

## serpent-like (`serpent-like`)

serpent-like | serpent-like | 24 | - | -

## set life total (`set-life-total`)

set-life-total | set life total | 64 | - | Your life total becomes N. See also [life divider](/tags/card/life-divider) and [life doubler](/tags/card/life-doubler).

## set matters (`set-matters`)

expansion-sweeper | expansion sweeper | 5 | set-matters | You know how sets sometimes have broken cards? What if you could just delete that set from the game? A mechanism Wizard…
set-matters | set matters | 17 | - | Cards that care about sets.

## shade pump (`shade-pump`)

shade-pump | shade pump | 278 | - | Effects that give an arbitrary amount of +1/+1 until end of turn. See also [firebreathing] in red and [armoring] in whi…

## shapechange (`shapechange`)

shapechange | shapechange | 250 | - | Set creatures' power/toughness, not necessarily a nerf. See also [humble](/tags/card/humble).

## share counters (`share-counters`)

share-counters | share counters | 8 | - | -

## show and tell (`show-and-tell`)

show-and-tell | show and tell | 7 | - | -

## shrink (`shrink`)

mass-shrink | mass shrink | 46 | shrink | Shrink your opponent's whole board (or part of it).
shrink | shrink | 107 | - | Nerf a creature's power, temporarily or otherwise. Not to be confused with [humble](humble).

## sideboard matters (`sideboard-matters`)

sideboard-matters | sideboard matters | 6 | - | -

## single target instant/sorcery (`single-target-instant-sorcery`)

single-target-instant-sorcery | single target instant/sorcery | 4630 | - | Instant/sorcery spells that may target only one target. This is materially important for some effects that care about s…

## singleton matters (`singleton-matters`)

singleton-matters | singleton matters | 3 | - | -

## skip turn (`skip-turn`)

skip-turn | skip turn | 14 | - | Someone skips a turn. See also [prevent extra turns](/tags/card/prevent-extra-turns).

## sliver-stackable (`sliver-stackable`)

sliver-stackable | sliver-stackable | 46 | - | Slivers having abilities where more than one instance of the ability does provide additional benefit.

## sneak from command zone (`sneak-from-command-zone`)

sneak-from-command-zone | sneak from command zone | 7 | - | -

## sneaky-self-trigger (`sneaky-self-trigger`)

sneaky-self-trigger | sneaky-self-trigger | 25 | - | Cards that are worded in a way that makes it easy to miss that they trigger one of their own abilities.

## sol land (`sol-land`)

sol-land | sol land | 12 | - | Lands that mimic the mana ability of Sol Ring: add two colorless mana.

## special action (`special-action`)

special-action | special action | 25 | - | CR 116: Special actions are actions a player may take when they have priority that don’t use the stack. These are not t…

## specialized (`specialized`)

specialized | specialized | 95 | - | Cards which are the result of the specialize mechanic.

## speed matters (`speed-matters`)

speed-matters | speed matters | 11 | - | Effects that care about speed directly, other than max speed.

## spell with no casting cost (`spell-with-no-casting-cost`)

spell-with-no-casting-cost | spell with no casting cost | 20 | - | Non-land, non-extra cards that have no mana cost (as in, printed on the card).

## square stats matter (`square-stats-matter`)

square-stats-matter | square stats matter | 4 | - | -

## staple with set's mechanic (`staple-with-set-s-mechanic`)

5c-set-mechanic-commander | 5c set mechanic commander | 35 | staple-with-set-s-mechanic | A five-color identity commander designed to support one or more themes and/or mechanics in a set.
bear-with-set-s-mechanic | bear with set's mechanic | 294 | staple-with-set-s-mechanic | A 2/2 for 2 with one of the set's iconic mechanics
burn-bright-with-set-mechanic | burn bright with set mechanic | 19 | staple-with-set-s-mechanic | Cards like [Burn Bright](https://scryfall.com/card/rna/93/burn-bright) or [Trumpet Blast](https://scryfall.com/card/m10…
burn-with-set-s-mechanic | burn with set's mechanic | 278 | staple-with-set-s-mechanic | Burn spells that have the mechanic of the set they debuted in.
counterspell-with-set-mechanic | counterspell with set mechanic | 165 | staple-with-set-s-mechanic | -
dehydration-with-set-mechanic | dehydration with set mechanic | 16 | staple-with-set-s-mechanic | -
discard-with-set-s-mechanic | discard with set's mechanic | 200 | staple-with-set-s-mechanic | -
giant-growth-with-set-mechanic | giant growth with set mechanic | 136 | staple-with-set-s-mechanic | -
mana-rock-with-set-s-mechanic | mana rock with set's mechanic | 108 | staple-with-set-s-mechanic | -
naturalize-with-set-mechanic | naturalize with set mechanic | 65 | staple-with-set-s-mechanic | -
o-ring-with-set-mechanic | o-ring with set mechanic | 25 | staple-with-set-s-mechanic | -
phoenix-with-set-s-mechanic | phoenix with set's mechanic | 14 | staple-with-set-s-mechanic | A phoenix with one of the set's iconic mechanics or mechanical themes.
ramp-with-set-s-mechanic | ramp with set's mechanic | 78 | staple-with-set-s-mechanic | -
staple-with-set-s-mechanic | staple with set's mechanic | 52 | - | A common card design that is related to one or more of the main mechanics in a set
tapland-with-set-s-mechanic | tapland with set's mechanic | 82 | staple-with-set-s-mechanic | -
threaten-with-set-s-mechanic | threaten with set's mechanic | 51 | staple-with-set-s-mechanic | -
wind-drake-with-set-s-mechanic | wind drake with set's mechanic | 31 | staple-with-set-s-mechanic | A 2/2 flyer for 3 with one of the set's iconic mechanics.

## start of game (`start-of-game`)

leyline | leyline | 5 | start-of-game | Cards that start the game on the battlefield if they're in your opening hand.
start-of-game | start of game | 35 | - | Cards that are particularly effective when you start the game with them.

## starting player matters (`starting-player-matters`)

starting-player-matters | starting player matters | 17 | - | Cards that care about or interact with who is the starting player.

## stasis (`stasis`)

stasis | stasis | 15 | - | -

## static effect in graveyard (`static-effect-in-graveyard`)

static-effect-in-graveyard | static effect in graveyard | 10 | - | Cards with static effects that work from inside the graveyard.

## stock turn (`stock-turn`)

stock-turn | stock turn | 3 | - | Skip a turn now in exchange for an extra turn later.

## storm count matters (`storm-count-matters`)

storm-count-matters | storm count matters | 26 | - | Storm count is the number of spells cast in a turn, named for [the Storm mechanic](//scryfall.com/search?q=keyword%3Ast…

## storm-like (`storm-like`)

storm-like | storm-like | 18 | - | Cards exploring design space in the vicinity of the Storm mechanic. Maybe one of these will be the progenitor of a futu…

## strive (`strive`)

strive | strive | 96 | - | Cards that require paying an additional cost per additional target.

## stronger in singleton formats (`stronger-in-singleton-formats`)

stronger-in-singleton-formats | stronger in singleton formats | 6 | - | -

## stun counters matter (`stun-counters-matter`)

stun-counters-matter | stun counters matter | 3 | - | -

## supercycle-legendary-land (`supercycle-legendary-land`)

supercycle-legendary-land | supercycle-legendary-land | 5 | - | -

## surge (`surge`)

surge | surge | 21 | - | Get a benefit if you've cast another spell this turn.

## swap removal (`swap-removal`)

swap-removal | swap removal | 129 | - | Sorry I messed up your stuff. Here's a thing in exchange. (See also [humble](/tags/card/humble).)

## sword of x and y (`sword-of-x-and-y`)

sword-of-x-and-y | sword of x and y | 4 | - | Originally a slow cycle of swords that give an protection from an enemy coloured pairing and additional bonuses based o…

## symmetrical (`symmetrical`)

symmetrical | symmetrical | 761 | - | Cards that affect the whole battlefield/all players in symmetrical, equal manner.
wheel-symmetrical | wheel-symmetrical | 39 | symmetrical | Wheel effects that effect each player, sometimes with no choice on whether they want to or not.

## synergy-activated-ability (`synergy-activated-ability`)

synergy-activated-ability | synergy-activated-ability | 62 | - | -

## synergy-adventure (`synergy-adventure`)

synergy-adventure | synergy-adventure | 18 | - | -

## synergy-affinity (`synergy-affinity`)

synergy-affinity | synergy-affinity | 1 | - | -

## synergy-airbending (`synergy-airbending`)

synergy-airbending | synergy-airbending | 1 | - | -

## synergy-arcane (`synergy-arcane`)

synergy-arcane | synergy-arcane | 81 | - | -

## synergy-artifact (`synergy-artifact`)

affinity-for-artifacts | affinity for artifacts | 42 | synergy-artifact | -
artifactfall | artifactfall | 93 | synergy-artifact | -
cost-reducer-artifact | cost-reducer-artifact | 19 | synergy-artifact | -
cranial-plating | cranial plating | 25 | synergy-artifact | Buffs based on the number of artifacts or Equipment you control/in play. See also [armament ability](armament-ability).…
metalcraft | metalcraft | 40 | synergy-artifact | Effects when the player controls three or more artifacts.
synergy-artifact | synergy-artifact | 703 | - | -
synergy-historic | synergy-historic | 45 | synergy-artifact | -
tap-fuel-artifact | tap fuel-artifact | 70 | synergy-artifact | -

## synergy-artifact-creature (`synergy-artifact-creature`)

synergy-artifact-creature | synergy-artifact-creature | 146 | - | -

## synergy-attraction (`synergy-attraction`)

roll-to-visit | roll to visit | 2 | synergy-attraction | Cards that let you roll to visit your attractions (Outside of the regular main phase roll)
synergy-attraction | synergy-attraction | 12 | - | -

## synergy-augment (`synergy-augment`)

synergy-augment | synergy-augment | 8 | - | -

## synergy-aura (`synergy-aura`)

synergy-aura | synergy-aura | 136 | - | -
synergy-modified | synergy-modified | 48 | synergy-aura | -
uril-ability | uril ability | 16 | synergy-aura | An ability in which the P/T of one or more creatures can increase based on the number of aura attached to one creature…

## synergy-awaken (`synergy-awaken`)

synergy-awaken | synergy-awaken | 1 | - | -

## synergy-backup (`synergy-backup`)

synergy-backup | synergy-backup | 2 | - | -

## synergy-banana (`synergy-banana`)

synergy-banana | synergy-banana | 1 | - | -

## synergy-banding (`synergy-banding`)

synergy-banding | synergy-banding | 5 | - | -

## synergy-bargain (`synergy-bargain`)

synergy-bargain | synergy-bargain | 1 | - | -

## synergy-basic (`synergy-basic`)

synergy-basic | synergy-basic | 66 | - | -

## synergy-battle (`synergy-battle`)

synergy-battle | synergy-battle | 32 | - | -

## synergy-black (`synergy-black`)

synergy-black | synergy-black | 181 | - | -

## synergy-blitz (`synergy-blitz`)

synergy-blitz | synergy-blitz | 1 | - | -

## synergy-blocker (`synergy-blocker`)

gives-tantrum | gives tantrum | 2 | synergy-blocker | -
synergy-blocker | synergy-blocker | 102 | - | -

## synergy-blocker-self (`synergy-blocker-self`)

bushido | bushido | 44 | synergy-blocker-self | Whenever X blocks or becomes blocked, it's power and toughness is modified until end of turn.
synergy-blocker-self | synergy-blocker-self | 167 | - | -

## synergy-blood (`synergy-blood`)

synergy-blood | synergy-blood | 18 | - | -

## synergy-blue (`synergy-blue`)

synergy-blue | synergy-blue | 166 | - | -

## synergy-boast (`synergy-boast`)

synergy-boast | synergy-boast | 3 | - | -

## synergy-bobblehead (`synergy-bobblehead`)

synergy-bobblehead | synergy-bobblehead | 7 | - | -

## synergy-boon (`synergy-boon`)

synergy-boon | synergy-boon | 1 | - | -

## synergy-bounce (`synergy-bounce`)

synergy-bounce | synergy-bounce | 12 | - | -

## synergy-burn (`synergy-burn`)

synergy-burn | synergy-burn | 59 | - | -

## synergy-bushido (`synergy-bushido`)

synergy-bushido | synergy-bushido | 1 | - | -

## synergy-cascade (`synergy-cascade`)

synergy-cascade | synergy-cascade | 3 | - | -

## synergy-case (`synergy-case`)

synergy-case | synergy-case | 1 | - | -

## synergy-cave (`synergy-cave`)

synergy-cave | synergy-cave | 12 | - | -

## synergy-changeling (`synergy-changeling`)

synergy-changeling | synergy-changeling | 1 | - | -

## synergy-chorus (`synergy-chorus`)

synergy-chorus | synergy-chorus | 5 | - | -

## synergy-clash (`synergy-clash`)

synergy-clash | synergy-clash | 4 | - | -

## synergy-class (`synergy-class`)

synergy-class | synergy-class | 2 | - | -

## synergy-clue (`synergy-clue`)

synergy-clue | synergy-clue | 34 | - | -

## synergy-collect evidence (`synergy-collect-evidence`)

synergy-collect-evidence | synergy-collect evidence | 3 | - | -

## synergy-color-choose (`synergy-color-choose`)

synergy-color-choose | synergy-color-choose | 22 | - | -

## synergy-color-each (`synergy-color-each`)

synergy-color-each | synergy-color-each | 31 | - | Cards that have a scaling effect for each color on permanents or cards. See [synergy-color-every](synergy-color-every)…
vivid | vivid | 29 | synergy-color-each | Cards that care about the number of colors among permanents you control.

## synergy-color-non-share (`synergy-color-non-share`)

synergy-color-non-share | synergy-color-non-share | 1 | - | -

## synergy-color-share (`synergy-color-share`)

convoke | convoke | 111 | synergy-color-share | Cards that let you tap creatures to pay less or no mana for them.
synergy-color-share | synergy-color-share | 49 | - | -

## synergy-colored (`synergy-colored`)

synergy-colored | synergy-colored | 10 | - | -

## synergy-colorless (`synergy-colorless`)

synergy-colorless | synergy-colorless | 63 | - | -

## synergy-colorless-mana (`synergy-colorless-mana`)

synergy-colorless-mana | synergy-colorless-mana | 3 | - | -

## synergy-commander (`synergy-commander`)

synergy-commander | synergy-commander | 195 | - | -

## synergy-conjure (`synergy-conjure`)

synergy-conjure | synergy-conjure | 4 | - | -

## synergy-connive (`synergy-connive`)

synergy-connive | synergy-connive | 4 | - | -

## synergy-contraption (`synergy-contraption`)

synergy-contraption | synergy-contraption | 6 | - | -

## synergy-convoke (`synergy-convoke`)

synergy-convoke | synergy-convoke | 3 | - | -

## synergy-copy (`synergy-copy`)

magecraft | magecraft | 33 | synergy-copy | -
synergy-copy | synergy-copy | 6 | - | -

## synergy-counterspell (`synergy-counterspell`)

synergy-counterspell | synergy-counterspell | 5 | - | Cards that make countering spells and abilities better.

## synergy-craft (`synergy-craft`)

synergy-craft | synergy-craft | 1 | - | -

## synergy-creatureland (`synergy-creatureland`)

synergy-creatureland | synergy-creatureland | 20 | - | -

## synergy-cumulative upkeep (`synergy-cumulative-upkeep`)

synergy-cumulative-upkeep | synergy-cumulative upkeep | 2 | - | -

## synergy-curse (`synergy-curse`)

synergy-curse | synergy-curse | 5 | - | -

## synergy-cycling (`synergy-cycling`)

synergy-cycling | synergy-cycling | 48 | - | -

## synergy-damage-prevention (`synergy-damage-prevention`)

synergy-damage-prevention | synergy-damage-prevention | 1 | - | -

## synergy-dash (`synergy-dash`)

synergy-dash | synergy-dash | 1 | - | -

## synergy-deathtouch (`synergy-deathtouch`)

synergy-deathtouch | synergy-deathtouch | 30 | - | -

## synergy-defender (`synergy-defender`)

synergy-defender | synergy-defender | 24 | - | -

## synergy-desert (`synergy-desert`)

synergy-desert | synergy-desert | 31 | - | -

## synergy-devoid (`synergy-devoid`)

synergy-devoid | synergy-devoid | 2 | - | -

## synergy-devour (`synergy-devour`)

synergy-devour | synergy-devour | 1 | - | -

## synergy-dfc (`synergy-dfc`)

synergy-dfc | synergy-dfc | 5 | - | -

## synergy-dice (`synergy-dice`)

dice-reroll | dice reroll | 5 | synergy-dice | -
exchange-dice-roll | exchange dice roll | 2 | synergy-dice | Cards that let you exchange a dice roll for a number they have.
krarks-other-thumb-effect | krarks other thumb effect | 8 | synergy-dice | If you'd roll a die, instead roll that many plus extra, then pick/get the best results.
scooch-dice | scooch dice | 4 | synergy-dice | Just nudge the result a little, it's not cheating I promise.
synergy-dice | synergy-dice | 30 | - | Various effects that either make dice rolling better, or love when you [roll dice](dice-roll).

## synergy-discover (`synergy-discover`)

synergy-discover | synergy-discover | 2 | - | -

## synergy-disturb (`synergy-disturb`)

synergy-disturb | synergy-disturb | 5 | - | -

## synergy-doctor's companion (`synergy-doctor-s-companion`)

synergy-doctor-s-companion | synergy-doctor's companion | 2 | - | -

## synergy-double-strike (`synergy-double-strike`)

synergy-double-strike | synergy-double-strike | 24 | - | -

## synergy-dungeon (`synergy-dungeon`)

synergy-dungeon | synergy-dungeon | 28 | - | -

## synergy-earthbending (`synergy-earthbending`)

synergy-earthbending | synergy-earthbending | 1 | - | -

## synergy-echo (`synergy-echo`)

synergy-echo | synergy-echo | 1 | - | -

## synergy-embalm (`synergy-embalm`)

synergy-embalm | synergy-embalm | 1 | - | -

## synergy-emblem (`synergy-emblem`)

synergy-emblem | synergy-emblem | 2 | - | -

## synergy-enchantment (`synergy-enchantment`)

affinity-for-enchantments | affinity for enchantments | 2 | synergy-enchantment | -
cost-reducer-enchantment | cost-reducer-enchantment | 9 | synergy-enchantment | -
enchantmentfall | enchantmentfall | 73 | synergy-enchantment | Cards that care about enchantments entering the batllefield.
ethereal-armor | ethereal armor | 14 | synergy-enchantment | Buffs based on the number of enchantments or Auras you control/in play. See also [Uril ability](uril-ability). For the…
synergy-enchantment | synergy-enchantment | 155 | - | -

## synergy-enchantment-creature (`synergy-enchantment-creature`)

synergy-enchantment-creature | synergy-enchantment-creature | 22 | - | -

## synergy-energy (`synergy-energy`)

synergy-energy | synergy-energy | 2 | - | Cards that care about obtaining or having energy counters, but not by spending them.

## synergy-enlist (`synergy-enlist`)

synergy-enlist | synergy-enlist | 2 | - | -

## synergy-equipment (`synergy-equipment`)

armament-ability | armament ability | 18 | synergy-equipment | An ability in which the P/T of one or more creatures can increase based on the number of equipment attached to one crea…
synergy-equipment | synergy-equipment | 180 | - | -
synergy-modified | synergy-modified | 48 | synergy-equipment | -

## synergy-equipment-legendary (`synergy-equipment-legendary`)

synergy-equipment-legendary | synergy-equipment-legendary | 1 | - | -

## synergy-eternalize (`synergy-eternalize`)

synergy-eternalize | synergy-eternalize | 1 | - | -

## synergy-exert (`synergy-exert`)

synergy-exert | synergy-exert | 5 | - | -

## synergy-exhaust (`synergy-exhaust`)

synergy-exhaust | synergy-exhaust | 8 | - | -

## synergy-exile-cast (`synergy-exile-cast`)

paradox | paradox | 43 | synergy-exile-cast | Cards that care about casting spells from anywhere other than your hand.
synergy-exile-cast | synergy-exile-cast | 31 | - | Cards that care about casting spells from exile.

## synergy-exiling (`synergy-exiling`)

synergy-exiling | synergy-exiling | 23 | - | These effects care about cards being exiled (as in the action).

## synergy-exploit (`synergy-exploit`)

synergy-exploit | synergy-exploit | 4 | - | -

## synergy-explore (`synergy-explore`)

synergy-explore | synergy-explore | 8 | - | -

## synergy-fear (`synergy-fear`)

synergy-fear | synergy-fear | 4 | - | -

## synergy-fight (`synergy-fight`)

synergy-fight | synergy-fight | 4 | - | -

## synergy-firebending (`synergy-firebending`)

synergy-firebending | synergy-firebending | 1 | - | -

## synergy-first-strike (`synergy-first-strike`)

synergy-first-strike | synergy-first-strike | 26 | - | -

## synergy-flanking (`synergy-flanking`)

synergy-flanking | synergy-flanking | 3 | - | -

## synergy-flash (`synergy-flash`)

synergy-flash | synergy-flash | 10 | - | -

## synergy-flashback (`synergy-flashback`)

synergy-flashback | synergy-flashback | 14 | - | -

## synergy-flying (`synergy-flying`)

synergy-flying | synergy-flying | 114 | - | -

## synergy-food (`synergy-food`)

synergy-food | synergy-food | 88 | - | -
tutor-artifact-food | tutor-artifact-food | 1 | synergy-food | -

## synergy-forage (`synergy-forage`)

synergy-forage | synergy-forage | 2 | - | -

## synergy-forest (`synergy-forest`)

forestfall | forestfall | 7 | synergy-forest | -
synergy-forest | synergy-forest | 118 | - | -

## synergy-foretell (`synergy-foretell`)

synergy-foretell | synergy-foretell | 9 | - | -

## synergy-freerunning (`synergy-freerunning`)

synergy-freerunning | synergy-freerunning | 2 | - | -

## synergy full hand (`synergy-full-hand`)

synergy-full-hand | synergy full hand | 9 | - | -

## synergy-gate (`synergy-gate`)

gatefall | gatefall | 3 | synergy-gate | -
synergy-gate | synergy-gate | 33 | - | -

## synergy-gift (`synergy-gift`)

synergy-gift | synergy-gift | 1 | - | -

## synergy-goad (`synergy-goad`)

synergy-goad | synergy-goad | 8 | - | -

## synergy-graveyard-cast (`synergy-graveyard-cast`)

paradox | paradox | 43 | synergy-graveyard-cast | Cards that care about casting spells from anywhere other than your hand.
synergy-graveyard-cast | synergy-graveyard-cast | 45 | - | Cards that care about casting spells from graveyards.

## synergy-green (`synergy-green`)

synergy-green | synergy-green | 195 | - | -

## synergy-haste (`synergy-haste`)

synergy-haste | synergy-haste | 51 | - | -

## synergy-haunt (`synergy-haunt`)

synergy-haunt | synergy-haunt | 1 | - | -

## synergy-hexproof (`synergy-hexproof`)

synergy-hexproof | synergy-hexproof | 18 | - | -

## synergy-horsemanship (`synergy-horsemanship`)

synergy-horsemanship | synergy-horsemanship | 2 | - | -

## synergy-hybrid (`synergy-hybrid`)

synergy-hybrid | synergy-hybrid | 2 | - | -

## synergy-incubator (`synergy-incubator`)

synergy-incubator | synergy-incubator | 10 | - | -

## synergy-indestructible (`synergy-indestructible`)

synergy-indestructible | synergy-indestructible | 20 | - | -

## synergy-infect (`synergy-infect`)

synergy-infect | synergy-infect | 2 | - | -

## synergy-ingest (`synergy-ingest`)

synergy-ingest | synergy-ingest | 1 | - | -

## synergy-initiative (`synergy-initiative`)

synergy-initiative | synergy-initiative | 9 | - | -

## synergy-instant (`synergy-instant`)

cost-reducer-instant | cost-reducer-instant | 2 | synergy-instant | -
magecraft | magecraft | 33 | synergy-instant | -
synergy-instant | synergy-instant | 474 | - | -
young-pyromancer-ability | young pyromancer ability | 36 | synergy-instant | Whenever you cast an instant or sorcery spell, create a creature token.

## synergy-intimidate (`synergy-intimidate`)

synergy-intimidate | synergy-intimidate | 1 | - | -

## synergy-investigate (`synergy-investigate`)

synergy-investigate | synergy-investigate | 2 | - | -

## synergy-island (`synergy-island`)

islandfall | islandfall | 5 | synergy-island | -
synergy-island | synergy-island | 82 | - | -

## synergy-islandwalk (`synergy-islandwalk`)

synergy-islandwalk | synergy-islandwalk | 2 | - | -

## synergy-jump-start (`synergy-jump-start`)

synergy-jump-start | synergy-jump-start | 1 | - | -

## synergy-junk (`synergy-junk`)

synergy-junk | synergy-junk | 2 | - | -

## synergy-kicker (`synergy-kicker`)

synergy-kicker | synergy-kicker | 15 | - | -

## synergy-land-graveyard (`synergy-land-graveyard`)

synergy-land-graveyard | synergy-land-graveyard | 12 | - | Triggered Abilities that trigger whenever a land card hits the graveyard from anywhere (library, hand, battlefield etc)

## synergy-lander (`synergy-lander`)

synergy-lander | synergy-lander | 2 | - | -

## synergy-landwalk (`synergy-landwalk`)

synergy-landwalk | synergy-landwalk | 5 | - | -

## synergy-leaves-creature (`synergy-leaves-creature`)

synergy-leaves-creature | synergy-leaves-creature | 3 | - | -

## synergy-legendary (`synergy-legendary`)

legendfall | legendfall | 16 | synergy-legendary | Cards that care about legendaries entering the battlefield.
mirror-gallery | mirror gallery | 8 | synergy-legendary | Cards that void the legendary rule, allowing you to have multiple copies of legendary permanents on the battlefield
synergy-historic | synergy-historic | 45 | synergy-legendary | -
synergy-legendary | synergy-legendary | 193 | - | -

## synergy-lesson (`synergy-lesson`)

cost-reducer-lesson | cost-reducer-lesson | 1 | synergy-lesson | -
synergy-lesson | synergy-lesson | 28 | - | -

## synergy-level-up (`synergy-level-up`)

synergy-level-up | synergy-level-up | 3 | - | -

## synergy-library-cast (`synergy-library-cast`)

paradox | paradox | 43 | synergy-library-cast | Cards that care about casting spells from anywhere other than your hand.
synergy-library-cast | synergy-library-cast | 4 | - | Cards that care about casting spells from the library.

## synergy-life-payment (`synergy-life-payment`)

synergy-life-payment | synergy-life-payment | 2 | - | -

## synergy-lifelink (`synergy-lifelink`)

synergy-lifelink | synergy-lifelink | 22 | - | -

## synergy-locus (`synergy-locus`)

synergy-locus | synergy-locus | 7 | - | -

## synergy-madness (`synergy-madness`)

synergy-madness | synergy-madness | 1 | - | -

## synergy-map (`synergy-map`)

synergy-map | synergy-map | 1 | - | -

## synergy-menace (`synergy-menace`)

synergy-menace | synergy-menace | 23 | - | -

## synergy-mentor (`synergy-mentor`)

synergy-mentor | synergy-mentor | 1 | - | -

## synergy-mill (`synergy-mill`)

synergy-mill | synergy-mill | 91 | - | -

## synergy-modal (`synergy-modal`)

synergy-modal | synergy-modal | 3 | - | -

## synergy-modular (`synergy-modular`)

synergy-modular | synergy-modular | 2 | - | -

## synergy-monocolor (`synergy-monocolor`)

synergy-monocolor | synergy-monocolor | 7 | - | Cards that care about things being a single color.

## synergy-mountain (`synergy-mountain`)

mountainfall | mountainfall | 5 | synergy-mountain | -
synergy-mountain | synergy-mountain | 89 | - | -

## synergy-multicolor (`synergy-multicolor`)

synergy-color-every | synergy-color-every | 9 | synergy-multicolor | Cards that want all five colors to be present. See also [synergy-color-each](synergy-color-each) for effects that still…
synergy-multicolor | synergy-multicolor | 76 | - | Cards that care about you using multicolored cards.
synergy-multicolor-pair | synergy-multicolor-pair | 7 | synergy-multicolor | -
synergy-multicolor-trio | synergy-multicolor-trio | 2 | synergy-multicolor | -

## synergy-mutate (`synergy-mutate`)

synergy-mutate | synergy-mutate | 7 | - | -

## synergy-ninjutsu (`synergy-ninjutsu`)

synergy-ninjutsu | synergy-ninjutsu | 5 | - | -

## synergy-nonbasic-land (`synergy-nonbasic-land`)

synergy-nonbasic-land | synergy-nonbasic-land | 6 | - | -

## synergy-noncreature (`synergy-noncreature`)

gives-prowess | gives prowess | 7 | synergy-noncreature | -
synergy-noncreature | synergy-noncreature | 304 | - | -

## synergy-omen (`synergy-omen`)

synergy-omen | synergy-omen | 4 | - | -

## synergy-partner (`synergy-partner`)

synergy-partner | synergy-partner | 1 | - | -

## synergy-phasing (`synergy-phasing`)

synergy-phasing | synergy-phasing | 4 | - | -

## synergy-pin (`synergy-pin`)

synergy-pin | synergy-pin | 2 | - | -

## synergy-plains (`synergy-plains`)

plainsfall | plainsfall | 2 | synergy-plains | -
synergy-plains | synergy-plains | 59 | - | -

## synergy-plan (`synergy-plan`)

synergy-plan | synergy-plan | 1 | - | -

## synergy-planeswalker (`synergy-planeswalker`)

gatewatch-oath | gatewatch oath | 3 | synergy-planeswalker | -
synergy-planeswalker | synergy-planeswalker | 144 | - | -
synergy-pw-ajani | synergy-pw-ajani | 2 | synergy-planeswalker | -
synergy-pw-angrath | synergy-pw-angrath | 1 | synergy-planeswalker | -
synergy-pw-ashiok | synergy-pw-ashiok | 1 | synergy-planeswalker | -
synergy-pw-basri | synergy-pw-basri | 1 | synergy-planeswalker | -
synergy-pw-bolas | synergy-pw-bolas | 5 | synergy-planeswalker | -
synergy-pw-chandra | synergy-pw-chandra | 7 | synergy-planeswalker | -
synergy-pw-choose | synergy-pw-choose | 2 | synergy-planeswalker | Effects that let you choose which planeswalker type they apply to.
synergy-pw-domri | synergy-pw-domri | 1 | synergy-planeswalker | -
synergy-pw-dovin | synergy-pw-dovin | 1 | synergy-planeswalker | -
synergy-pw-garruk | synergy-pw-garruk | 4 | synergy-planeswalker | -
synergy-pw-gideon | synergy-pw-gideon | 5 | synergy-planeswalker | -
synergy-pw-jace | synergy-pw-jace | 3 | synergy-planeswalker | -
synergy-pw-liliana | synergy-pw-liliana | 5 | synergy-planeswalker | -
synergy-pw-nissa | synergy-pw-nissa | 3 | synergy-planeswalker | -
synergy-pw-oko | synergy-pw-oko | 1 | synergy-planeswalker | -
synergy-pw-ral | synergy-pw-ral | 1 | synergy-planeswalker | -
synergy-pw-rowan | synergy-pw-rowan | 1 | synergy-planeswalker | -
synergy-pw-sarkhan | synergy-pw-sarkhan | 1 | synergy-planeswalker | -
synergy-pw-teferi | synergy-pw-teferi | 2 | synergy-planeswalker | -
synergy-pw-tezzeret | synergy-pw-tezzeret | 2 | synergy-planeswalker | -
synergy-pw-ugin | synergy-pw-ugin | 1 | synergy-planeswalker | -
synergy-pw-vivien | synergy-pw-vivien | 2 | synergy-planeswalker | -
synergy-pw-vraska | synergy-pw-vraska | 2 | synergy-planeswalker | -
synergy-pw-yanggu | synergy-pw-yanggu | 1 | synergy-planeswalker | -
synergy-pw-yanling | synergy-pw-yanling | 2 | synergy-planeswalker | -

## synergy-planet (`synergy-planet`)

synergy-planet | synergy-planet | 5 | - | -

## synergy-playtest (`synergy-playtest`)

synergy-playtest | synergy-playtest | 7 | - | -

## synergy-plot (`synergy-plot`)

synergy-plot | synergy-plot | 1 | - | -

## synergy-power-up (`synergy-power-up`)

synergy-power-up | synergy-power-up | 5 | - | -

## synergy-powerstone (`synergy-powerstone`)

synergy-powerstone | synergy-powerstone | 2 | - | -

## synergy-proliferate (`synergy-proliferate`)

synergy-proliferate | synergy-proliferate | 7 | - | -

## synergy-protection (`synergy-protection`)

synergy-protection | synergy-protection | 9 | - | -

## synergy-pw-davriel (`synergy-pw-davriel`)

synergy-pw-davriel | synergy-pw-davriel | 1 | - | -

## synergy-pw-elspeth (`synergy-pw-elspeth`)

synergy-pw-elspeth | synergy-pw-elspeth | 1 | - | -

## synergy-pw-huatli (`synergy-pw-huatli`)

synergy-pw-huatli | synergy-pw-huatli | 1 | - | -

## synergy-pw-lukka (`synergy-pw-lukka`)

synergy-pw-lukka | synergy-pw-lukka | 1 | - | -

## synergy-pw-tamiyo (`synergy-pw-tamiyo`)

synergy-pw-tamiyo | synergy-pw-tamiyo | 1 | - | -

## synergy-pw-tyvar (`synergy-pw-tyvar`)

synergy-pw-tyvar | synergy-pw-tyvar | 5 | - | -

## synergy-reach (`synergy-reach`)

synergy-reach | synergy-reach | 21 | - | -

## synergy-red (`synergy-red`)

synergy-red | synergy-red | 187 | - | -

## synergy-regenerate (`synergy-regenerate`)

synergy-regenerate | synergy-regenerate | 1 | - | -

## synergy-renown (`synergy-renown`)

synergy-renown | synergy-renown | 3 | - | -

## synergy-ring (`synergy-ring`)

synergy-ring | synergy-ring | 13 | - | -

## synergy-role (`synergy-role`)

synergy-role | synergy-role | 1 | - | -

## synergy-room (`synergy-room`)

synergy-room | synergy-room | 26 | - | -

## synergy-rune (`synergy-rune`)

synergy-rune | synergy-rune | 2 | - | -

## synergy-sacrifice (`synergy-sacrifice`)

synergy-sacrifice | synergy-sacrifice | 103 | - | -

## synergy-sacrifice-self (`synergy-sacrifice-self`)

synergy-sacrifice-self | synergy-sacrifice-self | 15 | - | When *I* am sacrificed...

## synergy-saga (`synergy-saga`)

counter-fuel-lore | counter fuel-lore | 1 | synergy-saga | -
synergy-historic | synergy-historic | 45 | synergy-saga | -
synergy-saga | synergy-saga | 17 | - | -

## synergy-scry (`synergy-scry`)

synergy-scry | synergy-scry | 22 | - | -

## synergy-seek (`synergy-seek`)

synergy-seek | synergy-seek | 3 | - | -

## synergy-self-burn (`synergy-self-burn`)

synergy-self-burn | synergy-self-burn | 3 | - | Cards that care about sources you control dealing damage to you.

## synergy-shadow (`synergy-shadow`)

synergy-shadow | synergy-shadow | 5 | - | -

## synergy-shrine (`synergy-shrine`)

synergy-shrine | synergy-shrine | 28 | - | -

## synergy-shroud (`synergy-shroud`)

synergy-shroud | synergy-shroud | 3 | - | -

## synergy-skulk (`synergy-skulk`)

synergy-skulk | synergy-skulk | 2 | - | -

## synergy-sneak (`synergy-sneak`)

synergy-sneak | synergy-sneak | 1 | - | -

## synergy-snow (`synergy-snow`)

snowfall | snowfall | 3 | synergy-snow | Cards that care about snow permanents entering the battlefield, not the weather condition.
synergy-snow | synergy-snow | 59 | - | -

## synergy-solo-attack (`synergy-solo-attack`)

exalted | exalted | 48 | synergy-solo-attack | Creatures attacking alone get +N/+N
gives-exalted | gives exalted | 11 | synergy-solo-attack | -
synergy-solo-attack | synergy-solo-attack | 43 | - | Cards that care about attacking with only one creature

## synergy-sorcery (`synergy-sorcery`)

cost-reducer-sorcery | cost-reducer-sorcery | 1 | synergy-sorcery | -
magecraft | magecraft | 33 | synergy-sorcery | -
synergy-sorcery | synergy-sorcery | 473 | - | -
young-pyromancer-ability | young pyromancer ability | 36 | synergy-sorcery | Whenever you cast an instant or sorcery spell, create a creature token.

## synergy-soulbond (`synergy-soulbond`)

synergy-soulbond | synergy-soulbond | 2 | - | -

## synergy-spacecraft (`synergy-spacecraft`)

synergy-spacecraft | synergy-spacecraft | 15 | - | -

## synergy-spectacle (`synergy-spectacle`)

synergy-spectacle | synergy-spectacle | 1 | - | -

## synergy-sphere (`synergy-sphere`)

synergy-sphere | synergy-sphere | 3 | - | -

## synergy-start-your-engines (`synergy-start-your-engines`)

synergy-start-your-engines | synergy-start-your-engines | 1 | - | -

## synergy-sticker (`synergy-sticker`)

synergy-ability-sticker | synergy-ability-sticker | 3 | synergy-sticker | -
synergy-art-sticker | synergy-art-sticker | 10 | synergy-sticker | -
synergy-name-sticker | synergy-name-sticker | 22 | synergy-sticker | -
synergy-p-t-sticker | synergy-p/t-sticker | 2 | synergy-sticker | -
synergy-sticker | synergy-sticker | 42 | - | -

## synergy-surveil (`synergy-surveil`)

synergy-surveil | synergy-surveil | 13 | - | Beneficial effects for the Surveil keyword.

## synergy-suspect (`synergy-suspect`)

synergy-suspect | synergy-suspect | 10 | - | -

## synergy-suspend (`synergy-suspend`)

synergy-suspend | synergy-suspend | 25 | - | -

## synergy-swamp (`synergy-swamp`)

swampfall | swampfall | 6 | synergy-swamp | -
synergy-swamp | synergy-swamp | 94 | - | -

## synergy-tantrum (`synergy-tantrum`)

synergy-tantrum | synergy-tantrum | 1 | - | -

## synergy-tapped (`synergy-tapped`)

synergy-tapped | synergy-tapped | 50 | - | Effects that care about your tapped permanents. For cards that care about something *becoming* tapped, see [uninspired]…

## synergy-target (`synergy-target`)

heroic | heroic | 136 | synergy-target | Whenever you cast a spell targeting your permanent, something good happens.
radiate | radiate | 20 | synergy-target | Effects that copy spells and abilities targeting a single creature.
synergy-target | synergy-target | 11 | - | -
unheroic | unheroic | 56 | synergy-target | Whenever you target something that's not yours, something good happens

## synergy-teamwork (`synergy-teamwork`)

synergy-teamwork | synergy-teamwork | 2 | - | -

## synergy-theft (`synergy-theft`)

synergy-theft | synergy-theft | 28 | - | -

## synergy-token (`synergy-token`)

synergy-token | synergy-token | 104 | - | -
synergy-token-creature | synergy-token-creature | 110 | synergy-token | -
tokenfall | tokenfall | 20 | synergy-token | -

## synergy-town (`synergy-town`)

affinity-for-towns | affinity for towns | 1 | synergy-town | -
synergy-town | synergy-town | 6 | - | -

## synergy-toxic (`synergy-toxic`)

synergy-toxic | synergy-toxic | 10 | - | -

## synergy-trample (`synergy-trample`)

synergy-trample | synergy-trample | 31 | - | -

## synergy-transform (`synergy-transform`)

synergy-transform | synergy-transform | 16 | - | -

## synergy-treasure (`synergy-treasure`)

synergy-treasure | synergy-treasure | 52 | - | -

## synergy-tuck (`synergy-tuck`)

synergy-tuck | synergy-tuck | 2 | - | -

## synergy-tutor (`synergy-tutor`)

synergy-tutor | synergy-tutor | 5 | - | -

## synergy-type-change (`synergy-type-change`)

synergy-type-change | synergy-type-change | 1 | - | -

## synergy-unearth (`synergy-unearth`)

synergy-unearth | synergy-unearth | 3 | - | -

## synergy-untapped (`synergy-untapped`)

synergy-untapped | synergy-untapped | 10 | - | Effects that care about other untapped permanents. For cards that care about the *action* of untapping a permanent, see…

## synergy-urza's (`synergy-urza-s`)

synergy-urza-s | synergy-urza's | 1 | - | -

## synergy-vanilla (`synergy-vanilla`)

synergy-vanilla | synergy-vanilla | 6 | - | Synergizes with creatures that have no abilities.

## synergy-vehicle (`synergy-vehicle`)

regrowth-vehicle | regrowth-vehicle | 4 | synergy-vehicle | -
synergy-vehicle | synergy-vehicle | 126 | - | -

## synergy-vigilance (`synergy-vigilance`)

synergy-vigilance | synergy-vigilance | 28 | - | -

## synergy-villainous-choice (`synergy-villainous-choice`)

synergy-villainous-choice | synergy-villainous-choice | 1 | - | -

## synergy-vote (`synergy-vote`)

synergy-vote | synergy-vote | 8 | - | -

## synergy-warp (`synergy-warp`)

synergy-warp | synergy-warp | 22 | - | -

## synergy-wastes (`synergy-wastes`)

synergy-wastes | synergy-wastes | 2 | - | -

## synergy-waterbending (`synergy-waterbending`)

synergy-waterbending | synergy-waterbending | 1 | - | -

## synergy-white (`synergy-white`)

synergy-white | synergy-white | 211 | - | -

## synergy-wither (`synergy-wither`)

synergy-wither | synergy-wither | 1 | - | -

## table order matters (`table-order-matters`)

table-order-matters | table order matters | 20 | - | -

## tap outlet (`tap-outlet`)

gives-tap-ability | gives tap ability | 132 | tap-outlet | -
tap-fuel-artifact | tap fuel-artifact | 70 | tap-outlet | -
tap-fuel-creature | tap fuel-creature | 319 | tap-outlet | Tap a creature to pay for/activate an effect
tap-fuel-land | tap fuel-land | 25 | tap-outlet | -
tap-fuel-permanent | tap fuel-permanent | 5 | tap-outlet | -
tap-fuel-token | tap fuel-token | 6 | tap-outlet | -
tap-outlet | tap outlet | 2 | - | Cards that allow you to tap another permanent as part of an ability cost.

## tapland (`tapland`)

bounceland | bounceland | 2 | tapland | Non-basic lands which tap for two mana, but require you to return a land to your hand when you play them.
rupture-spire | rupture spire | 7 | tapland | Not only does this land enter tapped, it also requires you to tap another land when you play it.
tapland | tapland | 60 | - | Non-basic lands which come into play tapped
tapland-with-set-s-mechanic | tapland with set's mechanic | 82 | tapland | -
tricycle-land | tricycle-land | 0 | tapland | Lands that can tap for three colors of mana and have the ability to cycle.

## tappable enchantment (`tappable-enchantment`)

tappable-enchantment | tappable enchantment | 4 | - | There's a design guideline that enchantments should never tap themselves (which also means no {T} costs.) These ones br…

## tapped matters-self (`tapped-matters-self`)

tapped-matters-self | tapped matters-self | 31 | - | Permanents that care about being tapped. For cards that care about other tapped permanents, see [synergy-tapped](synerg…

## tapper (`tapper`)

tapper | tapper | 0 | - | -
tapper-artifact | tapper-artifact | 68 | tapper | -
tapper-creature | tapper-creature | 612 | tapper | -
tapper-land | tapper-land | 56 | tapper | -
tapper-planeswalker | tapper-planeswalker | 5 | tapper | Tap effects don't normally work on planeswalkers because planeswalkers don't normally care about being tapped. These ca…
twiddle | twiddle | 62 | tapper | Tap or untap something.

## tapper-spacecraft (`tapper-spacecraft`)

tapper-spacecraft | tapper-spacecraft | 1 | - | -

## tax (`tax`)

cast-tax | cast tax | 17 | tax | When a spell is cast, something happens unless the player casting the spell pays a cost, usually mana.
rhystic | rhystic | 259 | tax | Effects that opponents can buy off if they pay mana.
tax | tax | 1 | - | Extract resources from your opponents when they try to do stuff, either by making them spend extra resources or by gene…
toll | toll | 177 | tax | Generate resources from your opponent's actions without them being able to pay it off.

## tax block (`tax-block`)

tax-block | tax block | 7 | - | -

## team matters (`team-matters`)

team-matters | team matters | 19 | - | Cards designed for Unknown events that care about what team you've chosen.

## temporary counter (`temporary-counter`)

temporary-counter | temporary counter | 4 | - | -

## temporary reanimation (`temporary-reanimation`)

temporary-reanimation | temporary reanimation | 97 | - | -

## temporary token (`temporary-token`)

temporary-token | temporary token | 211 | - | -

## text change (`text-change`)

change-name | change name | 12 | text-change | Cards that change the name of themselves or other cards.
text-change | text change | 25 | - | Cards that directly change the text of a card.
text-change-color | text change color | 10 | text-change | -

## the doctor (`the-doctor`)

the-doctor | the doctor | 17 | - | Cards that represent The Doctor, the eponymous lead of Doctor Who.

## theft-commander (`theft-commander`)

theft-commander | theft-commander | 1 | - | -

## theft-noncreature (`theft-noncreature`)

theft-noncreature | theft-noncreature | 3 | - | -

## theft-ownership (`theft-ownership`)

theft-ownership | theft-ownership | 15 | - | -

## theft-spacecraft (`theft-spacecraft`)

theft-spacecraft | theft-spacecraft | 1 | - | -

## thingfall (`thingfall`)

artifactfall | artifactfall | 93 | thingfall | -
creaturefall | creaturefall | 546 | thingfall | Cards that care about a creature entering the battlefield. Also known as Alliance in New Capenna.
enchantmentfall | enchantmentfall | 73 | thingfall | Cards that care about enchantments entering the batllefield.
landfall | landfall | 223 | thingfall | Cards which reward you for playing lands.
legendfall | legendfall | 16 | thingfall | Cards that care about legendaries entering the battlefield.
permanentfall | permanentfall | 18 | thingfall | -
snowfall | snowfall | 3 | thingfall | Cards that care about snow permanents entering the battlefield, not the weather condition.
thingfall | thingfall | 0 | - | Abilities that trigger when something (other than itself) enters the battlefield
tokenfall | tokenfall | 20 | thingfall | -

## third-spell-matters (`third-spell-matters`)

third-spell-matters | third-spell-matters | 3 | - | -

## token increaser (`token-increaser`)

token-doubler | token doubler | 17 | token-increaser | If you would make X tokens, twice are made instead.
token-increaser | token increaser | 14 | - | Cards that increase the amount of tokens you make, either by increasing the amount of tokens that are to be made or add…

## token replacer (`token-replacer`)

token-replacer | token replacer | 7 | - | Cards that completely replace the tokens that will be created with other tokens.

## token versions of cards (`token-versions-of-cards`)

creates-token-of-a-card | creates token of a card | 72 | token-versions-of-cards | These cards create a token with characteristics seen on a printed card. There may not be an associated physical token.…
has-identical-token | has identical token | 39 | token-versions-of-cards | A token exists that's identical to these cards. See more: [token versions of cards](token-versions-of-cards).
token-version-of-a-card | token version of a card | 16 | token-versions-of-cards | These tokens are identical to a card. See the parent tag above for more information.
token-versions-of-cards | token versions of cards | 0 | - | Some cards create tokens identical to existing cards (except for CMC). See: [cards creating these tokens](/tags/card/cr…

## token without a card (`token-without-a-card`)

token-without-a-card | token without a card | 15 | - | No cards make these tokens, probably due to errata.

## top matters (`top-matters`)

top-matters | top matters | 13 | - | The top card of your library matters for purposes other than playing it or drawing it.

## toughness boost to all (`toughness-boost-to-all`)

gives-pp-counters-to-all | gives pp counters to all | 187 | toughness-boost-to-all | Put +1/+1 counters on all of your creatures.
prowess-anthem | prowess anthem | 7 | toughness-boost-to-all | -
toughness-boost-to-all | toughness boost to all | 736 | - | -

## toughness matters (`toughness-matters`)

buttcrew | buttcrew | 2 | toughness-matters | Cards that crew with toughness rather than power.
buttfight | buttfight | 4 | toughness-matters | -
buttfling | buttfling | 1 | toughness-matters | Fling, but using toughness for damage.
buttlink | buttlink | 1 | toughness-matters | -
buttsaddle | buttsaddle | 1 | toughness-matters | Cards that saddle with toughness rather than power.
buttstation | buttstation | 1 | toughness-matters | Cards that station using their toughness rather than their power.
buttstrike | buttstrike | 23 | toughness-matters | Creatures assign damage equal to their toughness.
specific-toughness-matters | specific toughness matters | 8 | toughness-matters | -
toughness-matters | toughness matters | 143 | - | Other than in, you know, the usual way.
toughness-matters-self | toughness matters-self | 21 | toughness-matters | -
toughness-matters-total | toughness matters-total | 5 | toughness-matters | -

## toys matter (`toys-matter`)

toys-matter | toys matter | 3 | - | -

## trading post like (`trading-post-like`)

trading-post-like | trading post like | 6 | - | -

## transferrable aura (`transferrable-aura`)

transferrable-aura | transferrable aura | 22 | - | Auras that have a built-in way to move them between permanents.

## transform-improvement (`transform-improvement`)

transform-improvement | transform-improvement | 38 | - | Cards that do the same effect but better, or the same effects but with extra when they transform.

## transform-mirror (`transform-mirror`)

transform-mirror | transform-mirror | 7 | - | Cards that mirror themselves mechanically when they transform

## trigger doubler (`trigger-doubler`)

trigger-doubler | trigger doubler | 41 | - | -

## triggered ability (`triggered-ability`)

attack-trigger | attack trigger | 2061 | triggered-ability | -
block-trigger | block trigger | 420 | triggered-ability | -
cast-trigger | cast trigger | 151 | triggered-ability | -
combat-neutral-damage-trigger | combat-neutral damage trigger | 108 | triggered-ability | Creature abilities that trigger upon dealing any amount of damage, no matter if it was done in combat or not. Compare a…
death-trigger | death trigger | 624 | triggered-ability | Abilities that trigger from permanents being sent to a graveyard. See also [leaves trigger](leaves-battlefield-trigger).
delayed-trigger | delayed trigger | 1114 | triggered-ability | Create a triggered ability that may trigger later. Similar to a [reflexive trigger](reflexive-trigger).
gains-vanishing | gains vanishing | 2 | triggered-ability | -
intervening-if-clause | intervening if clause | 2170 | triggered-ability | At/When/Whenever [event], if [clause], [effect].
leaves-battlefield-trigger | leaves battlefield trigger | 68 | triggered-ability | Cards that trigger on something leaving the battlefield. See also [death trigger](death-trigger).
leaves-graveyard-trigger | leaves graveyard trigger | 45 | triggered-ability | Cards that have triggers whenever a card (or cards) leave your graveyard
lose-trigger | lose trigger | 11 | triggered-ability | Cards that trigger when an opponent loses the game (as opposed a replacement effect for yourself).
non-mana-ward | non-mana ward | 53 | triggered-ability | Ward abilities with non-mana payments.
old-damage-deathtouch | old damage deathtouch | 23 | triggered-ability | Before the keyword was made evergreen in Magic 2010, deathtouch was sometimes a triggered ability based on damage. See…
reflexive-trigger | reflexive trigger | 310 | triggered-ability | An ability that triggers based on actions taken earlier during a spell or ability's resolution.
state-trigger | state trigger | 66 | triggered-ability | Cards that use a state trigger, which is a particular and rare kind of trigger. A common one is "When you control no [X…
trigger-from-exile | trigger from exile | 84 | triggered-ability | Abilities that trigger from inside exile.
trigger-from-graveyard | trigger from graveyard | 145 | triggered-ability | Abilities that trigger from inside the graveyard.
triggered-ability | triggered ability | 7886 | - | -
triggers-at-cleanup-step | triggers at cleanup step | 2 | triggered-ability | Cards that trigger at the cleanup step, rather than what would usually be the end step.
turn-face-up-trigger | turn-face-up-trigger | 29 | triggered-ability | -
turn-face-up-trigger-self | turn-face-up-trigger-self | 107 | triggered-ability | -
unblocked-trigger | unblocked trigger | 44 | triggered-ability | -

## triland (`triland`)

shardland | shardland | 5 | triland | Lands that produce mana from a "shard" (three allied colours).
triland | triland | 1 | - | Lands which tap for three colors. For triland cycles specifically see [cycle-triland](/tags/card/cycle-triland).
wedgeland | wedgeland | 3 | triland | Lands that produce mana from a "wedge" (2 allied colours and their shared enemy)

## tuck (`tuck`)

counterspell-tuck | counterspell-tuck | 12 | tuck | Counter a spell by putting it into its owner's library.
removal-tuck | removal-tuck | 146 | tuck | -
tuck | tuck | 11 | - | Effects that put a spell or permanent into its owner's library.
tuck-self | tuck-self | 60 | tuck | -

## tuck-outlet (`tuck-outlet`)

brainstorm | brainstorm | 15 | tuck-outlet | Draw a number of cards, then put cards from your hand on top of your library in any order.
loot-to-library | loot to library | 9 | tuck-outlet | Draw, then shuffle cards into your library or put them on the bottom of it. Contrast [brainstorm](brainstorm).
rummage-to-library | rummage to library | 9 | tuck-outlet | Rummage with the discarded cards tucked in your library.
tuck-outlet | tuck-outlet | 8 | - | Cards that let you put cards from your hand into your library.

## turn control (`turn-control`)

turn-control | turn control | 11 | - | Cards that make one player control another player's turn, either for the entire turn or for specific times during that…

## turns off defender (`turns-off-defender`)

turns-off-defender | turns off defender | 12 | - | Turn your defender into an attacker with this one weird trick!

## turns off defender-self (`turns-off-defender-self`)

turns-off-defender-self | turns off defender-self | 72 | - | -

## turns taken matter (`turns-taken-matter`)

turns-taken-matter | turns taken matter | 13 | - | -

## tutor (`tutor`)

gamble | gamble | 6 | tutor | Search for a card, and then discard a card at random (with a chance to discard the card you tutored for)
tutor | tutor | 0 | - | Cards that directly search for a card from your library, and sometimes other locations as well.
tutor-artifact | tutor-artifact | 46 | tutor | Cards that tutor artifact cards.
tutor-artifact-creature | tutor-artifact-creature | 2 | tutor | Cards that tutor artifact creature cards.
tutor-augment | tutor-augment | 3 | tutor | Cards that tutor cards with augment.
tutor-battle | tutor-battle | 3 | tutor | -
tutor-card | tutor-card | 111 | tutor | Cards that tutor any cards.
tutor-cast | tutor-cast | 9 | tutor | Cards that tutor something and cast it immediately.
tutor-color | tutor-color | 0 | tutor | Cards that tutor by color.
tutor-copy | tutor-copy | 17 | tutor | Tutors for something with the same name as something else
tutor-creature | tutor-creature | 99 | tutor | Cards that tutor creature cards.
tutor-enchantment | tutor-enchantment | 15 | tutor | Cards that tutor enchantment cards.
tutor-flash | tutor-flash | 2 | tutor | Cards that tutor cards with flash.
tutor-flashback | tutor-flashback | 1 | tutor | Cards that tutor cards with flashback.
tutor-from-opponent | tutor-from-opponent | 17 | tutor | Cards that tutor cards from an opponent's library.
tutor-host | tutor-host | 1 | tutor | Cards that tutor host cards.
tutor-instant | tutor-instant | 23 | tutor | Cards that tutor instant cards.
tutor-land | tutor-land | 0 | tutor | Cards that tutor land cards.
tutor-legendary | tutor-legendary | 7 | tutor | Cards that tutor legendary cards.
tutor-mv | tutor-mv | 83 | tutor | Cards that tutor cards with a certain mana value.
tutor-noncreature | tutor-noncreature | 0 | tutor | -
tutor-nonland | tutor-nonland | 6 | tutor | Cards that tutor nonland cards.
tutor-permanent | tutor-permanent | 7 | tutor | Cards that tutor for any permanent.
tutor-permanent-snow | tutor-permanent-snow | 1 | tutor | -
tutor-planeswalker | tutor-planeswalker | 8 | tutor | Cards that tutor planeswalker cards.
tutor-sorcery | tutor-sorcery | 16 | tutor | Cards that tutor sorcery cards.
tutor-to | tutor-to | 0 | tutor | Tutor to specific zones.
tutors-by-name | tutors by name | 82 | tutor | These cards tutor other cards by their name. For their tutor targets, see [tutored by name](tutored-by-name).

## tutor-creature-bird (`tutor-creature-bird`)

tutor-creature-bird | tutor-creature-bird | 1 | - | -

## tutor-creature-demigod (`tutor-creature-demigod`)

tutor-creature-demigod | tutor-creature-demigod | 1 | - | -

## tutor-creature-doctor (`tutor-creature-doctor`)

tutor-creature-doctor | tutor-creature-doctor | 5 | - | -

## tutor-creature-god (`tutor-creature-god`)

tutor-creature-god | tutor-creature-god | 2 | - | -

## tutor-creature-ninja (`tutor-creature-ninja`)

tutor-creature-ninja | tutor-creature-ninja | 1 | - | -

## tutor-creature-phyrexian (`tutor-creature-phyrexian`)

tutor-creature-phyrexian | tutor-creature-phyrexian | 1 | - | -

## tutor-creature-squirrel (`tutor-creature-squirrel`)

tutor-creature-squirrel | tutor-creature-squirrel | 1 | - | -

## tutor-interaction (`tutor-interaction`)

tutor-interaction | tutor-interaction | 9 | - | -

## tutor-rune (`tutor-rune`)

tutor-rune | tutor-rune | 2 | - | -

## tutored by name (`tutored-by-name`)

tutor-self | tutor-self | 25 | tutored-by-name | -
tutored-by-name | tutored by name | 118 | - | These cards are tutored by another specifically by their name. For the cards that tutor them, see [tutors by name](tuto…

## typal (`typal`)

typal | typal | 0 | - | -
typal-creature | typal-creature | 0 | typal | -

## typal coupling (`typal-coupling`)

synergy-party | synergy-party | 39 | typal-coupling | -
typal-coupling | typal coupling | 195 | - | Cards that care about two or more different creature types.
typal-goblin-orc | typal-goblin-orc | 14 | typal-coupling | Green, mean, and ready to hit you in the spleen. In Lord of the Rings, often seen alongside Army.
typal-lupine | typal-lupine | 27 | typal-coupling | Typal effects for Wolves and Werewolves.
typal-multi-sea-monster | typal-multi-sea-monster | 9 | typal-coupling | Kraken, Leviathan, Octopus, Serpent. Sometimes merfolk join in too.
typal-mutant-ninja-turtle | typal-mutant-ninja-turtle | 5 | typal-coupling | Typal mutant ninja turtle! *Sick guitar riff* (Please look up the 2003 TMNT intro to understand this reference)
typal-neo-solo-attack | typal-neo-solo-attack | 18 | typal-coupling | Kamigawa: Neon Dynasty coupled Samurai and Warriors as card types that care about attacking alone.
typal-outlaw | typal-outlaw | 19 | typal-coupling | -
typal-sneaky | typal-sneaky | 6 | typal-coupling | Ninjas and rogues, with their powers combined

## typal-glimmer (`typal-glimmer`)

typal-glimmer | typal-glimmer | 1 | - | -

## typal-lizard (`typal-lizard`)

typal-lizard | typal-lizard | 12 | - | -

## typal-non-assassin (`typal-non-assassin`)

typal-non-assassin | typal-non-assassin | 1 | - | -

## typal-otter (`typal-otter`)

typal-otter | typal-otter | 11 | - | -

## typal-villain (`typal-villain`)

typal-villain | typal-villain | 36 | - | -

## type addition book (`type-addition-book`)

type-addition-book | type addition book | 46 | - | The release of Secrets of Strixhaven introduced the Book subtype, with errata to previous artifacts.

## type addition frog (`type-addition-frog`)

type-addition-frog | type addition frog | 6 | - | -

## type addition from none (`type-addition-from-none`)

type-addition-from-none | type addition from none | 161 | - | Some creatures (Commonly artifact creatures) prior to the Grand Creature Type update were printed without Creature Type…

## type addition human (`type-addition-human`)

type-addition-human | type addition human | 573 | - | Creatures that weren't previously a human and just identified by their job, despite being a human, and then gained that…

## type addition noble (`type-addition-noble`)

type-addition-noble | type addition noble | 24 | - | Gained the Noble type, either after it was reintroduced with the big sweep at Eldraine launch, or at a later date.

## type addition phyrexian (`type-addition-phyrexian`)

type-addition-phyrexian | type addition phyrexian | 231 | - | Gained the Phyrexian type, either after it was introduced with the big sweep at Modern Horizons 2 launch, or at a later…

## type addition rabbit (`type-addition-rabbit`)

type-addition-rabbit | type addition rabbit | 2 | - | -

## type addition sorcerer (`type-addition-sorcerer`)

type-addition-sorcerer | type addition sorcerer | 24 | - | These creatures gained the Sorcerer type with the release of Lorwyn Eclipsed

## type change (`type-change`)

animate | animate | 0 | type-change | Effects that turn things into creatures.
any-zone-type-change | any zone type change | 9 | type-change | These cards change types in every and any zone.
artifactify | artifactify | 65 | type-change | Effects that turn things into artifacts.
auraify | auraify | 64 | type-change | Effects that turn things into auras.
becomes-changeling | becomes changeling | 5 | type-change | -
deanimate | deanimate | 21 | type-change | Uncreaturize a creature. For creatures that deanimate themselves, see [deanimate self](deanimate-self).
deanimate-self | deanimate self | 125 | type-change | Creatures that can stop being creatures. For noncreatures that may become creatures, see [animate self](animate-self).
enchantmentize | enchantmentize | 37 | type-change | Effects that turn things into enchantments.
gives-changeling | gives changeling | 18 | type-change | Granting the changeling ability doesn't actually do anything in the layer system, so these cards grant all creature typ…
land-conversion | land conversion | 81 | type-change | Effects that change or add land types and affect how lands produce mana.
the-ring-tempts-you | the ring tempts you | 49 | type-change | -
type-change | type change | 281 | - | -
universal-type-change | universal type change | 108 | type-change | Cards that turn every type A into type B. Might be just one player or all, just the battlefield or not.

## type removal cat rakshasa (`type-removal-cat-rakshasa`)

type-removal-cat-rakshasa | type removal cat rakshasa | 6 | - | Rakshasa used to be Cat Demons or Cat Devils, but they have now lost the Cat type

## un-design (`un-design`)

old-typeline | old typeline | 5 | un-design | Cards that intentionally bring back the old typelines after they were changed for the sake of nostalgia and/or humor. C…
un-design | un-design | 0 | - | Features characteristic of and unique to the world of un-sets.
un-set-mechanics | un-set mechanics | 2 | un-design | Card tags showing mechanics that (at least nowadays) only show up in un-sets.

## un-forecast (`un-forecast`)

un-forecast | un-forecast | 21 | - | Un-set cards that would later pave the way for black bordered mechanics

## unexile (`unexile`)

castable-from-exile | castable from exile | 430 | unexile | Cards you can cast or access from exile.
processing | processing | 25 | unexile | Removes a card of your opponent's from the exile zone for value or to deny them resources.
recursion-from-exile | recursion from exile | 19 | unexile | Brings itself or other cards you own back from exile, regardless of what effect might have put them there. For effects…
unexile | unexile | 11 | - | -

## uninspired (`uninspired`)

uninspired | uninspired | 148 | - | Effects that trigger when something becomes tapped. For cards that care about tapped permanents, see [synergy-tapped](s…

## unique counter (`unique-counter`)

unique-counter | unique counter | 148 | - | These cards use a type of counter no other card does.

## unique cr reference (`unique-cr-reference`)

unique-cr-reference | unique cr reference | 71 | - | There is an entire rule in the CR just to cover this card and no other card.

## unique doubler (`unique-doubler`)

unique-doubler | unique doubler | 3 | - | -

## unique enchant target (`unique-enchant-target`)

unique-enchant-target | unique enchant target | 32 | - | -

## unique keyword (`unique-keyword`)

unique-keyword | unique keyword | 68 | - | This card uses a keyword action, ability, or variant thereof that's found on no other cards.

## unique mana cost (`unique-mana-cost`)

unique-mana-cost | unique mana cost | 326 | - | This card's mana cost isn't found on any other card.

## unique mana symbol (`unique-mana-symbol`)

unique-mana-symbol | unique mana symbol | 10 | - | Cards with mana symbols that only appear on them.

## unique noncreature token (`unique-noncreature-token`)

unique-noncreature-token | unique noncreature token | 22 | - | -

## unique p/t (`unique-p-t`)

unique-p-t | unique p/t | 38 | - | Cards with a power/toughness not seen on any other card.

## unique protection (`unique-protection`)

unique-protection | unique protection | 42 | - | -

## unique token (`unique-token`)

unique-token | unique token | 381 | - | This token is created by only one card.

## unique token type (`unique-token-type`)

unique-token-type | unique token type | 5 | - | -

## unique-type-exclusion (`unique-type-exclusion`)

unique-type-exclusion | unique-type-exclusion | 32 | - | Cards that say "non-type" where no other card does that for that type.

## unique type line (`unique-type-line`)

unique-creature-type | unique creature type | 49 | unique-type-line | Creatures with one or more single creature types that are unique to them, not counting creature types on tokens.
unique-plane-type | unique plane type | 71 | unique-type-line | -
unique-planeswalker-type | unique planeswalker type | 37 | unique-type-line | -
unique-type-line | unique type line | 2182 | - | No other card has this same type line. Acorn, playtest, and rebalanced cards may count as unique, but they don't make n…

## unnoted tracked information (`unnoted-tracked-information`)

unnoted-tracked-information | unnoted tracked information | 227 | - | Spells or abilities that require tracking events without explicitly noting them. See also [noted tracked information](n…

## unpreventable-damage (`unpreventable-damage`)

unpreventable-damage | unpreventable-damage | 36 | - | -

## unprinted token (`unprinted-token`)

unprinted-token | unprinted token | 132 | - | Cards whose tokens haven't yet been printed in paper.

## unstable variant (`unstable-variant`)

unstable-killbot | unstable killbot | 4 | unstable-variant | Beep boop! 🤖 Unstable killbots share the same collector number but have different names.
unstable-secret-base | unstable secret base | 1 | unstable-variant | There are five Secret Base cards in Unstable. They share the same collector number but have different art, flavor text…
unstable-variant | unstable variant | 0 | - | Cards in Unstable that have multiple versions with the same collector number.

## unstoppable (`unstoppable`)

unstoppable | unstoppable | 15 | - | Assign combat damage as though the creature weren't blocked. Also known as super-trample. See also [gives unstoppable](…

## untapped matters-self (`untapped-matters-self`)

untapped-matters-self | untapped matters-self | 33 | - | Permanents that care about being untapped. For cards that care about other untapped permanents, see [synergy-untapped](…

## untapper (`untapper`)

etb-untapper | etb-untapper | 8 | untapper | Cards that make things enter the battlefield untapped.
twiddle | twiddle | 62 | untapper | Tap or untap something.
untapper | untapper | 0 | - | Cards that can untap things.
untapper-artifact | untapper-artifact | 48 | untapper | -
untapper-creature | untapper-creature | 443 | untapper | -
untapper-land | untapper-land | 99 | untapper | -
untapper-nonland | untapper-nonland | 12 | untapper | -
untapper-permanent | untapper-permanent | 76 | untapper | -
untaps-self | untaps self | 173 | untapper | -

## untapper-equipment (`untapper-equipment`)

untapper-equipment | untapper-equipment | 1 | - | -

## untapper-planeswalker (`untapper-planeswalker`)

untapper-planeswalker | untapper-planeswalker | 1 | - | -

## untracked effect (`untracked-effect`)

untracked-effect | untracked effect | 7 | - | -

## upkeep cost (`upkeep-cost`)

upkeep-cost | upkeep cost | 230 | - | Cards that ask you to pay some kind of cost on your upkeep step.

## utility land (`utility-land`)

creatureland | creatureland | 28 | utility-land | Lands that can animate themselves.
utility-land | utility land | 574 | - | -

## vanilla aura (`vanilla-aura`)

vanilla-aura | vanilla aura | 45 | - | Auras that only change power and toughness.

## vanilla equipment (`vanilla-equipment`)

vanilla-equipment | vanilla equipment | 35 | - | Equipment that only changes power and toughness.

## variable effect, same ability (`variable-effect-same-ability`)

variable-effect-same-ability | variable effect, same ability | 36 | - | -

## vigor effect (`vigor-effect`)

vigor-effect | vigor effect | 14 | - | Turn damage into +1/+1 counters.

## virtual legendary (`virtual-legendary`)

virtual-legendary | virtual legendary | 292 | - | This card represents a one-of-a-kind creature or object, and could conceivably have been legendary. Usually cards are i…

## voting (`voting`)

voting | voting | 35 | - | -

## weaker in singleton formats (`weaker-in-singleton-formats`)

useless-in-singleton-formats | useless in singleton formats | 25 | weaker-in-singleton-formats | Cards that have little to no use in formats that are Singleton (allowing only one of most cards save for basic lands) s…
weaker-in-singleton-formats | weaker in singleton formats | 88 | - | Cards that have reduced use in formats that do not allow more than one card with the same name to be used, such as in C…

## white effect (`white-effect`)

balance | balance | 5 | white-effect | Effects that attempt to equalize the board state between players by forcing players to sacrifice permanents on the batt…
silence | silence | 27 | white-effect | Prevent opponents from casting spells, and possibly also active abilities.
white-effect | white effect | 0 | - | Effects which are iconically white.

## white elephant (`white-elephant`)

white-elephant | white elephant | 18 | - | Permanents that can be given to opponents and have detrimental effects.

## wish (`wish`)

booster-tutor | booster tutor | 14 | wish | Cards, usually acorn cards, that have you open booster packs to add into the game.
wish | wish | 61 | - | Effects which allow you to bring in cards from outside the game.

## worse in multiplayer (`worse-in-multiplayer`)

worse-in-multiplayer | worse in multiplayer | 1 | - | -

## worship (`worship`)

worship | worship | 10 | - | If you would go below 1 life, go to 1 life instead.

## x doesn't matter (`x-doesn-t-matter`)

x-doesn-t-matter | x doesn't matter | 12 | - | Cards that don't explicitly care about the value of the {X} in their costs (usually because [mana spent matters](mana-s…

## y value (`y-value`)

y-value | y value | 6 | - | Cards that use "Y" for a value, usually for "+X/+Y" effects on creatures.

## you make the card (`you-make-the-card`)

you-make-the-card | you make the card | 4 | - | These cards came from community-driven "You Make the Card" events, where the Magic community works through multiple sta…

## zoo (`zoo`)

zoo | zoo | 20 | - | Cards that create multiple tokens of different types.
