import type { Button } from '../input/input';

/** One line of a minigame's controls: which inputs, and what they do. */
export interface ControlEntry {
  /** 'stick' covers the stick and d-pad. */
  keys: ('stick' | Button)[];
  text: string;
}

/** The controls that apply to one role ("Pilot", "Runners"...), or to everyone. */
export interface ControlRole {
  role: string | null;
  entries: ControlEntry[];
}

const KEY_WORD = /\b(stick|d-pad|left\/right|hold|[ABXY])\b/i;

function keysIn(s: string): ('stick' | Button)[] {
  const keys: ('stick' | Button)[] = [];
  if (/stick|d-pad|left\/right/i.test(s)) keys.push('stick');
  for (const m of s.matchAll(/\b([ABXY])\b/g)) {
    const b = m[1].toLowerCase() as Button;
    if (!keys.includes(b)) keys.push(b);
  }
  return keys;
}

/** Notes like "hold" or "(before landing)" travel with the action text. */
function entry(keyPart: string, action: string): ControlEntry | null {
  const keys = keysIn(keyPart);
  if (!keys.length) return null;
  const notes: string[] = [];
  if (/\bhold\b/i.test(keyPart)) notes.push('hold');
  for (const m of keyPart.matchAll(/\(([^)]+)\)/g)) if (!/hold/i.test(m[1])) notes.push(m[1]);
  const inAir = keyPart.match(/\bin the air\b/i);
  if (inAir) notes.push('in the air');
  const text = action.trim() + (notes.length ? ` (${notes.join(', ')})` : '');
  return { keys, text };
}

/**
 * Reads a minigame's free-text controls ("Stick: move · A: jump", or
 * "Pilot: stick to fly, hold A to beam · Runners: stick to run") into
 * per-role button lists, so the preview can say what each button does.
 */
export function parseControls(controls: string): ControlRole[] {
  const roles: ControlRole[] = [];
  const shared: ControlRole = { role: null, entries: [] };
  for (const seg of controls.split(/\s+·\s+/)) {
    const colon = seg.indexOf(':');
    if (colon < 0) continue;
    const head = seg.slice(0, colon).trim();
    const body = seg.slice(colon + 1).trim();
    if (KEY_WORD.test(head)) {
      const e = entry(head, body);
      if (e) shared.entries.push(e);
      continue;
    }
    // "Role: stick to fly, hold A to beam"
    const role: ControlRole = { role: head, entries: [] };
    for (const clause of body.split(/,\s*/)) {
      const m = clause.match(/^(.*?)\s+to\s+(.+)$/);
      if (!m) continue;
      const e = entry(m[1], m[2]);
      if (e) role.entries.push(e);
    }
    roles.push(role);
  }
  if (!roles.length) return [shared];
  // Shared lines (rare in role games) apply to every role.
  for (const r of roles) r.entries.push(...shared.entries);
  return roles;
}

/**
 * Which role a player has: in 1 vs 3 the solo player (team 0) takes the first
 * role; in 2 vs 2 role games the first teammate takes the first role.
 */
export function roleIndex(kind: string, team: number, indexInTeam: number): number {
  if (kind === '1v3') return team === 0 ? 0 : 1;
  if (kind === '2v2') return indexInTeam;
  return 0;
}
