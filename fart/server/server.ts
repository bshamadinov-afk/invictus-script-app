import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import type { GameAction } from '../src/engine/types';
import { Room, RoomFailure, type ServerMessage, newRoomCode } from './rooms';

const PORT = Number(process.env.PORT) || 3000;
const BOT_DELAY_MS = 900;
const ROOM_IDLE_MS = 15 * 60_000;
const MAX_ROOMS = 500;
const MAX_MESSAGE_BYTES = 4096;

// The same page that plays offline vs bots; the flag switches on the online menu.
const page = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8').replace(
  '</head>',
  '<script>window.FART_SERVER = true;</script></head>',
);

interface Conn {
  ws: WebSocket;
  room: Room | null;
  token: string | null;
  alive: boolean;
}

const conns = new Set<Conn>();
const rooms = new Map<string, Room>();
const sockets = new Map<string, WebSocket>(); // token → socket
const botTimers = new Map<Room, NodeJS.Timeout>();

function deliver(token: string, msg: ServerMessage): void {
  const ws = sockets.get(token);
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

/** Keeps bots (and away humans) moving, one move at a time so clients can animate each. */
function pump(room: Room): void {
  if (botTimers.has(room) || !room.needsBotMove()) return;
  botTimers.set(
    room,
    setTimeout(() => {
      botTimers.delete(room);
      room.botStep();
      pump(room);
    }, BOT_DELAY_MS),
  );
}

function reply(conn: Conn, msg: ServerMessage): void {
  if (conn.ws.readyState === conn.ws.OPEN) conn.ws.send(JSON.stringify(msg));
}

function handle(conn: Conn, raw: string): void {
  let msg: { t?: string; [k: string]: unknown };
  try {
    msg = JSON.parse(raw);
  } catch {
    throw new RoomFailure('BAD_REQUEST', 'Malformed message.');
  }
  switch (msg.t) {
    case 'create': {
      if (rooms.size >= MAX_ROOMS) throw new RoomFailure('ROOM_FULL', 'Too many rooms right now. Try again later.');
      leave(conn);
      const code = newRoomCode((c) => rooms.has(c));
      const room = new Room(code, deliver);
      rooms.set(code, room);
      enter(conn, room, String(msg.name ?? ''));
      return;
    }
    case 'join': {
      const code = String(msg.code ?? '').trim().toUpperCase();
      const room = rooms.get(code);
      if (!room) throw new RoomFailure('ROOM_NOT_FOUND', 'No room with that code.');
      if (conn.room !== room) leave(conn);
      enter(conn, room, String(msg.name ?? ''), typeof msg.token === 'string' ? msg.token : undefined);
      return;
    }
    case 'start': {
      const { room, seat } = seated(conn);
      room.start(seat, Number(msg.players));
      pump(room);
      return;
    }
    case 'action': {
      const { room, seat } = seated(conn);
      room.act(seat, msg.action as GameAction);
      pump(room);
      return;
    }
    case 'leave':
      leave(conn);
      return;
    default:
      throw new RoomFailure('BAD_REQUEST', 'Unknown message.');
  }
}

function enter(conn: Conn, room: Room, name: string, token?: string): void {
  const joined = room.join(name, token);
  conn.room = room;
  conn.token = joined.token;
  const previous = sockets.get(joined.token);
  if (previous && previous !== conn.ws) previous.close(4000, 'replaced');
  sockets.set(joined.token, conn.ws);
  reply(conn, { t: 'joined', code: room.code, seat: joined.seat, token: joined.token });
  room.broadcast([]);
  pump(room);
}

function seated(conn: Conn): { room: Room; seat: number } {
  const seat = conn.room && conn.token ? conn.room.seatOf(conn.token) : -1;
  if (!conn.room || seat === -1) throw new RoomFailure('NOT_IN_ROOM', 'Join a room first.');
  return { room: conn.room, seat };
}

function leave(conn: Conn): void {
  if (!conn.room || !conn.token) return;
  const seat = conn.room.seatOf(conn.token);
  if (sockets.get(conn.token) === conn.ws) sockets.delete(conn.token);
  if (seat !== -1) conn.room.disconnect(seat);
  conn.room = null;
  conn.token = null;
}

const http = createServer((req, res) => {
  const path = (req.url ?? '/').split('?')[0];
  if (path === '/healthz') {
    res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
    return;
  }
  if (path === '/favicon.ico') {
    res.writeHead(204).end();
    return;
  }
  if (path === '/' || path === '/index.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' }).end(page);
    return;
  }
  res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
});

const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: MAX_MESSAGE_BYTES });

wss.on('connection', (ws) => {
  const conn: Conn = { ws, room: null, token: null, alive: true };
  conns.add(conn);
  ws.on('pong', () => (conn.alive = true));
  ws.on('message', (data) => {
    try {
      handle(conn, data.toString());
    } catch (err) {
      const e = err instanceof RoomFailure ? err : new RoomFailure('BAD_REQUEST', 'Something went wrong.');
      if (!(err instanceof RoomFailure)) console.error(err);
      reply(conn, { t: 'error', code: e.code, message: e.message });
    }
  });
  ws.on('close', () => {
    conns.delete(conn);
    // A socket replaced by a newer one for the same seat must not mark the seat away.
    if (conn.token && sockets.get(conn.token) === ws) leave(conn);
  });
});

// Heartbeat (drops dead phones), away-player takeover, and idle room cleanup.
setInterval(() => {
  for (const conn of conns) {
    if (!conn.alive) {
      conn.ws.terminate();
      continue;
    }
    conn.alive = false;
    conn.ws.ping();
  }
  const now = Date.now();
  for (const [code, room] of rooms) {
    pump(room);
    const anyoneHere = room.seats.some((s) => !s.bot && s.connected);
    if (!anyoneHere && now - room.lastActivity > ROOM_IDLE_MS) {
      clearTimeout(botTimers.get(room));
      botTimers.delete(room);
      rooms.delete(code);
    }
  }
}, 10_000);

http.listen(PORT, () => console.log(`FART server on :${PORT}`));
