const config = require('./config');
const Room = require('./Room');

// No I, O, 0 or 1 so codes are easy to read out loud and type.
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

class RoomManager {
  constructor(io) {
    this.io = io;
    this.rooms = new Map(); // code -> Room
    this.playerRoom = new Map(); // socket id -> room code
  }

  generateCode() {
    let code;
    do {
      code = '';
      for (let i = 0; i < config.ROOM_CODE_LENGTH; i++) {
        code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
      }
    } while (this.rooms.has(code));
    return code;
  }

  // options: { mode: 'solo' | 'multiplayer', durationSec: 120 | 150 | 180 }
  createRoom(options = {}) {
    const code = this.generateCode();
    const room = new Room(code, this.io, (c) => this.rooms.delete(c), options);
    this.rooms.set(code, room);
    return room;
  }

  getRoom(code) {
    return this.rooms.get(String(code || '').trim().toUpperCase()) || null;
  }

  roomOf(socketId) {
    const code = this.playerRoom.get(socketId);
    return code ? this.rooms.get(code) || null : null;
  }

  join(socket, room, name, character) {
    this.leave(socket.id); // a socket can only be in one room at a time
    const player = room.addPlayer(socket, name, character);
    this.playerRoom.set(socket.id, room.code);
    return player;
  }

  leave(socketId) {
    const room = this.roomOf(socketId);
    this.playerRoom.delete(socketId);
    if (room) room.removePlayer(socketId);
  }

  // Small summary for the HTTP API and debugging.
  list() {
    return [...this.rooms.values()].map((r) => ({
      code: r.code,
      mode: r.mode,
      state: r.state,
      players: r.players.size,
      maxPlayers: r.maxPlayers,
    }));
  }
}

module.exports = RoomManager;
