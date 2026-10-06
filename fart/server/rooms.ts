import { randomBytes, randomInt } from 'node:crypto';
import { chooseBotAction } from '../src/engine/bot';
import { MAX_PLAYERS, MIN_PLAYERS, applyAction, createGame } from '../src/engine/engine';
import { createRng, type Rng } from '../src/engine/rng';
import type { ErrorCode, GameAction, GameEvent, GameState, PlayerId } from '../src/engine/types';
import { type PlayerView, getPlayerView } from '../src/engine/view';

/** A human keeps their seat while away; after this long a bot plays for them until they return. */
export const AWAY_BOT_AFTER_MS = 30_000;
const NAME_MAX = 16;
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ'; // no I, L, O: easy to read aloud

export interface Seat {
  name: string;
  bot: boolean;
  /** Secret that lets a human reclaim this seat after a reconnect. Null for bots. */
  token: string | null;
  connected: boolean;
  /** When the human last disconnected; null while connected. */
  awaySince: number | null;
}

export interface PublicSeat {
  name: string;
  bot: boolean;
  connected: boolean;
}

export type ServerMessage =
  | { t: 'joined'; code: string; seat: number; token: string }
  | { t: 'lobby'; code: string; you: number; host: number; players: PublicSeat[] }
  | { t: 'game'; code: string; you: number; host: number; players: PublicSeat[]; view: PlayerView; events: GameEvent[] }
  | { t: 'error'; code: ErrorCode | RoomError; message: string };

export type RoomError = 'ROOM_NOT_FOUND' | 'ROOM_FULL' | 'GAME_STARTED' | 'NOT_HOST' | 'NOT_IN_ROOM' | 'BAD_REQUEST';

export class RoomFailure extends Error {
  constructor(
    readonly code: RoomError | ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/** One table. Holds the authoritative GameState; every client only ever receives its own PlayerView. */
export class Room {
  readonly seats: Seat[] = [];
  state: GameState | null = null;
  readonly host = 0;
  lastActivity = Date.now();
  private botRng: Rng = createRng(randomInt(2 ** 31));

  constructor(
    readonly code: string,
    /** Delivers a message to the human holding `token`. */
    private readonly send: (token: string, msg: ServerMessage) => void,
    private readonly now: () => number = Date.now,
  ) {}

  get started(): boolean {
    return this.state !== null;
  }

  /** Seat index for a token. Indices can shift in the lobby, so connections hold tokens, not seats. */
  seatOf(token: string): number {
    return this.seats.findIndex((s) => s.token === token);
  }

  humans(): number {
    return this.seats.filter((s) => !s.bot).length;
  }

  /** Join as a new player, or reclaim a seat with its token. */
  join(rawName: string, token?: string): { seat: number; token: string } {
    this.touch();
    if (token) {
      const seat = this.seats.findIndex((s) => s.token === token);
      if (seat !== -1) {
        const s = this.seats[seat]!;
        s.connected = true;
        s.awaySince = null;
        return { seat, token };
      }
    }
    if (this.started) throw new RoomFailure('GAME_STARTED', 'The game has already started.');
    if (this.seats.length >= MAX_PLAYERS) throw new RoomFailure('ROOM_FULL', 'The room is full.');
    const fresh = randomBytes(16).toString('hex');
    this.seats.push({ name: cleanName(rawName, this.seats.length), bot: false, token: fresh, connected: true, awaySince: null });
    return { seat: this.seats.length - 1, token: fresh };
  }

  disconnect(seat: number): void {
    const s = this.seats[seat];
    if (!s || s.bot) return;
    s.connected = false;
    s.awaySince = this.now();
    if (!this.started) {
      // Before the deal a guest who leaves frees the place; the host keeps theirs so the room survives.
      if (seat !== this.host) this.seats.splice(seat, 1);
    }
    this.broadcast([]);
  }

  /** Host deals. Empty places up to `playerCount` are filled with bots. */
  start(seat: number, playerCount: number): void {
    this.touch();
    if (seat !== this.host) throw new RoomFailure('NOT_HOST', 'Only the host can start the game.');
    if (this.started && this.state?.phase === 'playing') throw new RoomFailure('GAME_STARTED', 'The game is already running.');
    // A restart keeps the humans and drops last game's bots before refilling.
    for (let i = this.seats.length - 1; i >= 0; i--) if (this.seats[i]!.bot) this.seats.splice(i, 1);
    const wanted = Number.isFinite(playerCount) ? Math.floor(playerCount) : MAX_PLAYERS;
    const count = Math.max(this.seats.length, MIN_PLAYERS, Math.min(MAX_PLAYERS, wanted));
    let botNo = 1;
    while (this.seats.length < count) {
      this.seats.push({ name: `Бот ${botNo++}`, bot: true, token: null, connected: true, awaySince: null });
    }
    this.state = createGame({ seed: randomInt(2 ** 31), playerCount: this.seats.length });
    this.broadcast([]);
  }

  /** A human's move. The seat comes from the connection, never from the message. */
  act(seat: number, action: GameAction): void {
    this.touch();
    if (!this.state) throw new RoomFailure('BAD_REQUEST', 'The game has not started yet.');
    const res = applyAction(this.state, { ...action, player: seat } as GameAction);
    if (!res.ok) throw new RoomFailure(res.code, res.message);
    this.state = res.state;
    this.broadcast(res.events);
  }

  /** Whether the seat to move should be played by the server right now. */
  needsBotMove(): boolean {
    const s = this.state;
    if (!s || s.phase !== 'playing') return false;
    const seat = this.seats[s.activePlayer]!;
    if (seat.bot) return true;
    return !seat.connected && seat.awaySince !== null && this.now() - seat.awaySince >= AWAY_BOT_AFTER_MS;
  }

  /** Plays one bot move if one is due. Returns true if it moved. */
  botStep(): boolean {
    if (!this.needsBotMove()) return false;
    const s = this.state!;
    const res = applyAction(s, chooseBotAction(getPlayerView(s, s.activePlayer), this.botRng));
    if (!res.ok) return false;
    this.state = res.state;
    this.broadcast(res.events);
    return true;
  }

  publicSeats(): PublicSeat[] {
    return this.seats.map((s) => ({ name: s.name, bot: s.bot, connected: s.connected }));
  }

  /** Sends each seat its own message: the lobby before the deal, its private view after. */
  broadcast(events: GameEvent[]): void {
    const players = this.publicSeats();
    this.seats.forEach((s, seat) => {
      if (s.bot || !s.connected || !s.token) return;
      this.send(s.token, this.messageFor(seat, events, players));
    });
  }

  messageFor(seat: number, events: GameEvent[] = [], players = this.publicSeats()): ServerMessage {
    if (!this.state) return { t: 'lobby', code: this.code, you: seat, host: this.host, players };
    return {
      t: 'game',
      code: this.code,
      you: seat,
      host: this.host,
      players,
      view: getPlayerView(this.state, seat as PlayerId),
      events,
    };
  }

  private touch(): void {
    this.lastActivity = this.now();
  }
}

export function newRoomCode(taken: (code: string) => boolean): string {
  for (;;) {
    let code = '';
    for (let i = 0; i < 4; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    if (!taken(code)) return code;
  }
}

function cleanName(raw: string, seat: number): string {
  const name = String(raw ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, NAME_MAX);
  return name || `Игрок ${seat + 1}`;
}
