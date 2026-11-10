import { MAX_SEATS, ROSTER, type CharacterDef } from './roster';

/**
 * Dev aid: the four characters for a debug game. `&cast=wisp,bolt` puts those
 * ids in the first seats; the rest fill in from the roster in order.
 */
export function debugCast(): CharacterDef[] {
  const ids = (new URLSearchParams(location.search).get('cast') ?? '').split(',');
  const picked = ids.map((id) => ROSTER.find((d) => d.id === id)).filter((d): d is CharacterDef => !!d);
  return [...new Set([...picked, ...ROSTER])].slice(0, MAX_SEATS);
}
