export type ItemId =
  | 'turbo'
  | 'gold'
  | 'key'
  | 'swap'
  | 'glove'
  | 'chest'
  | 'lamp'
  // Attack items: they hurt rivals' board HP.
  | 'cork'
  | 'storm'
  | 'trap'
  | 'quake'
  | 'boulder';

export interface ItemDef {
  id: ItemId;
  name: string;
  /** Shop price in coins. */
  price: number;
  /** Relative chance on an item space. */
  weight: number;
  /** Used automatically (the key opens gates) instead of before a roll. */
  passive?: boolean;
  /** Damages rivals' board HP. */
  attack?: boolean;
  /** Single glyph for the HUD chip. */
  glyph: string;
  color: string;
  description: string;
}

export const ITEMS: Record<ItemId, ItemDef> = {
  turbo: { id: 'turbo', name: 'Turbo Boot', price: 5, weight: 5, glyph: '×2', color: '#ff7a7a', description: 'Roll two dice this turn.' },
  gold: { id: 'gold', name: 'Gold Boot', price: 10, weight: 3, glyph: '×3', color: '#ffd23f', description: 'Roll three dice this turn.' },
  key: { id: 'key', name: 'Skeleton Key', price: 5, weight: 4, passive: true, glyph: 'K', color: '#c9a36b', description: 'Opens a locked gate shortcut.' },
  swap: { id: 'swap', name: 'Swap Block', price: 10, weight: 3, glyph: '⇄', color: '#6fb7ff', description: 'Swap places with a random rival.' },
  glove: { id: 'glove', name: 'Duel Glove', price: 10, weight: 3, glyph: 'VS', color: '#ffa65c', description: 'Challenge a rival to a duel for coins.' },
  chest: { id: 'chest', name: 'Pickpocket Chest', price: 15, weight: 2, glyph: '$', color: '#a98bff', description: "Steal a rival's item." },
  lamp: { id: 'lamp', name: 'Star Lamp', price: 25, weight: 1, glyph: '★', color: '#fff0a8', description: 'Warp straight to the star.' },
  cork: { id: 'cork', name: 'Cork Cannon', price: 5, weight: 4, attack: true, glyph: '➶', color: '#ffb0cf', description: 'Pop a rival up to 5 spaces away for 4 damage.' },
  storm: { id: 'storm', name: 'Storm Jar', price: 10, weight: 3, attack: true, glyph: 'ϟ', color: '#a9dcff', description: 'Zap any rival on the board for 3 damage.' },
  trap: { id: 'trap', name: 'Snap Trap', price: 5, weight: 3, attack: true, glyph: '✲', color: '#cfcfdc', description: 'Set a trap on your space. The next rival to step on it takes 5 damage.' },
  quake: { id: 'quake', name: 'Quake Drum', price: 10, weight: 3, attack: true, glyph: '≋', color: '#ffc27a', description: 'Pound the ground: 3 damage to every rival within 3 spaces.' },
  boulder: { id: 'boulder', name: 'Bowling Boulder', price: 15, weight: 2, attack: true, glyph: '◍', color: '#d2bc9c', description: 'Roll a boulder 10 spaces ahead: 4 damage to every rival in its path.' },
};

export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];

/** Weighted random item for an item space. */
export function rollItem(r: number): ItemId {
  const total = ITEM_IDS.reduce((n, id) => n + ITEMS[id].weight, 0);
  let x = r * total;
  for (const id of ITEM_IDS) {
    x -= ITEMS[id].weight;
    if (x < 0) return id;
  }
  return 'turbo';
}

export function itemChip(id: ItemId): string {
  const it = ITEMS[id];
  return `<span class="item-chip" style="background:${it.color}" title="${it.name}">${it.glyph}</span>`;
}
