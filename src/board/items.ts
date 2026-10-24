export type ItemId = 'turbo' | 'gold' | 'key' | 'swap' | 'glove' | 'chest' | 'lamp';

export interface ItemDef {
  id: ItemId;
  name: string;
  /** Shop price in coins. */
  price: number;
  /** Relative chance on an item space. */
  weight: number;
  /** Used automatically (the key opens gates) instead of before a roll. */
  passive?: boolean;
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
