import { describe, expect, it } from 'vitest';
import { AWAY_BOT_AFTER_MS, Room, RoomFailure, type ServerMessage, newRoomCode } from '../server/rooms';
import { chooseBotAction } from '../src/engine/bot';

function setup() {
  const inbox = new Map<string, ServerMessage[]>();
  let clock = 1_000;
  const room = new Room('ABCD', (token, msg) => {
    if (!inbox.has(token)) inbox.set(token, []);
    inbox.get(token)!.push(msg);
  }, () => clock);
  const last = (token: string) => inbox.get(token)?.at(-1);
  return { room, inbox, last, advance: (ms: number) => (clock += ms) };
}

function failCode(fn: () => void): string | undefined {
  try {
    fn();
  } catch (e) {
    return e instanceof RoomFailure ? e.code : 'OTHER';
  }
  return undefined;
}

describe('rooms', () => {
  it('codes are 4 readable letters and unique', () => {
    const code = newRoomCode(() => false);
    expect(code).toMatch(/^[A-HJKMNP-Z]{4}$/);
    let n = 0;
    expect(newRoomCode(() => n++ < 3)).toHaveLength(4);
  });

  it('players join the lobby; host starts and bots fill the empty seats', () => {
    const { room, last } = setup();
    const host = room.join('Батыр');
    const guest = room.join('Аня');
    expect(host.seat).toBe(0);
    expect(guest.seat).toBe(1);
    room.broadcast([]);
    expect(last(guest.token)).toMatchObject({ t: 'lobby', you: 1, host: 0, players: [{ name: 'Батыр' }, { name: 'Аня' }] });

    expect(failCode(() => room.start(1, 6))).toBe('NOT_HOST');
    room.start(0, 6);
    expect(room.seats).toHaveLength(6);
    expect(room.seats.filter((s) => s.bot)).toHaveLength(4);
    expect(last(host.token)).toMatchObject({ t: 'game', you: 0 });
    expect(failCode(() => room.join('Поздно'))).toBe('GAME_STARTED');
  });

  it('each player receives only their own hand', () => {
    const { room, last } = setup();
    const a = room.join('A');
    const b = room.join('B');
    room.start(0, 2);
    const msgA = last(a.token);
    const msgB = last(b.token);
    if (msgA?.t !== 'game' || msgB?.t !== 'game') throw new Error('expected game messages');
    const handB = room.state!.players[1]!.hand;
    const jsonA = JSON.stringify(msgA);
    for (const card of handB) expect(jsonA).not.toContain(`"${card.id}"`);
    for (const card of room.state!.players[0]!.faceDown) expect(jsonA).not.toContain(`"${card.id}"`);
    expect(msgB.view.hand).toEqual(handB);
  });

  it('a move is taken as the sender’s seat, whatever the message claims', () => {
    const { room } = setup();
    room.join('A');
    room.join('B');
    room.start(0, 2);
    const active = room.state!.activePlayer;
    const other = active === 0 ? 1 : 0;
    const action = chooseBotAction(
      (room.messageFor(active) as Extract<ServerMessage, { t: 'game' }>).view,
    );
    // Sent by the player who is NOT on turn, pretending to be the active one.
    expect(failCode(() => room.act(other, { ...action, player: active }))).toBe('NOT_YOUR_TURN');
    room.act(active, action);
    expect(room.state!.turn).toBe(1);
  });

  it('bots move on their own; a disconnected human is covered by a bot after a grace period', () => {
    const { room, advance } = setup();
    room.join('A');
    room.start(0, 3);
    // Let bots play until it is the human's turn.
    for (let i = 0; i < 50 && room.needsBotMove(); i++) room.botStep();
    if (room.state!.phase !== 'playing') return;
    expect(room.state!.activePlayer).toBe(0);
    expect(room.needsBotMove()).toBe(false);

    room.disconnect(0);
    expect(room.needsBotMove()).toBe(false);
    advance(AWAY_BOT_AFTER_MS);
    expect(room.needsBotMove()).toBe(true);
    expect(room.botStep()).toBe(true);
  });

  it('a player reclaims their seat with the token after reconnecting', () => {
    const { room } = setup();
    const a = room.join('A');
    room.join('B');
    room.start(0, 2);
    room.disconnect(1);
    const back = room.join('ignored', room.seats[1]!.token!);
    expect(back.seat).toBe(1);
    expect(room.seats[1]!.connected).toBe(true);
    expect(room.seats[1]!.name).toBe('B');
    expect(a.seat).toBe(0);
  });

  it('a guest leaving the lobby frees the place; the host keeps theirs', () => {
    const { room } = setup();
    room.join('Host');
    const g = room.join('Guest');
    const h = room.join('Third');
    room.disconnect(room.seatOf(g.token));
    expect(room.seats.map((s) => s.name)).toEqual(['Host', 'Third']);
    expect(room.seatOf(h.token)).toBe(1);
    room.disconnect(0);
    expect(room.seats).toHaveLength(2);
  });

  it('the host can deal a new game after one finishes, keeping the humans', () => {
    const { room } = setup();
    room.join('A');
    room.start(0, 4);
    room.state = { ...room.state!, phase: 'finished' };
    room.start(0, 2);
    expect(room.seats).toHaveLength(2);
    expect(room.seats[0]!.name).toBe('A');
    expect(room.state!.phase).toBe('playing');
  });

  it('cleans up names', () => {
    const { room } = setup();
    expect(room.seats[room.join('  <b>Очень-очень-длинное-имя</b>  ').seat]!.name).toBe('bОчень-очень-дли');
    expect(room.seats[room.join('').seat]!.name).toBe('Игрок 2');
  });
});
