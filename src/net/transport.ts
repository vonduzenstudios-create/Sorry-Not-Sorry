import Peer, { type DataConnection, type PeerOptions } from 'peerjs';

/** Every room id on the PeerJS broker gets this prefix so codes stay short. */
const PREFIX = 'sorry-not-sorry-';
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

export type Message = Record<string, unknown> & { t: string };

/** One open data channel to another player. */
export interface Link {
  send(msg: Message): void;
  close(): void;
  onMessage: (msg: Message) => void;
  onClose: () => void;
}

/**
 * `?peerhost=localhost&peerport=9000` points at a self-hosted PeerServer
 * (handy for testing); otherwise the free PeerJS cloud broker is used. The
 * broker only introduces peers; game traffic goes peer to peer over WebRTC.
 */
function peerOptions(): PeerOptions {
  const params = new URLSearchParams(location.search);
  const host = params.get('peerhost');
  if (!host) return { debug: 1 };
  // Local testing: no STUN, peers on the same machine connect directly.
  return { host, port: Number(params.get('peerport')) || 9000, path: '/', secure: false, debug: 1, config: { iceServers: [] } };
}

function wrap(conn: DataConnection): Link {
  const link: Link = {
    send: (msg) => {
      if (conn.open) void conn.send(msg);
    },
    close: () => conn.close(),
    onMessage: () => {},
    onClose: () => {},
  };
  conn.on('data', (d) => link.onMessage(d as Message));
  conn.on('close', () => link.onClose());
  conn.on('error', () => link.onClose());
  return link;
}

export function randomCode(): string {
  let s = '';
  for (let i = 0; i < 4; i++) s += CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)];
  return s;
}

/** Hosts a room: resolves with the room code once the broker accepts it. */
export function hostRoom(onGuest: (link: Link) => void, onError: (msg: string) => void): Promise<{ code: string; peer: Peer }> {
  return new Promise((resolve, reject) => {
    const code = randomCode();
    const peer = new Peer(PREFIX + code, peerOptions());
    peer.on('open', () => resolve({ code, peer }));
    peer.on('connection', (conn) => {
      conn.on('open', () => onGuest(wrap(conn)));
    });
    peer.on('error', (e) => {
      onError(String(e.type ?? e));
      reject(e);
    });
  });
}

/** Joins a room by code: resolves with the link to the host. */
export function joinRoom(code: string, onError: (msg: string) => void): Promise<{ link: Link; peer: Peer }> {
  return new Promise((resolve, reject) => {
    const peer = new Peer(peerOptions());
    peer.on('open', () => {
      const conn = peer.connect(PREFIX + code.toUpperCase(), { reliable: true, serialization: 'json' });
      conn.on('open', () => resolve({ link: wrap(conn), peer }));
    });
    peer.on('error', (e) => {
      const type = (e as { type?: string }).type;
      const msg = type === 'peer-unavailable' ? `No room called ${code.toUpperCase()}` : String(type ?? e);
      onError(msg);
      reject(e);
    });
  });
}
