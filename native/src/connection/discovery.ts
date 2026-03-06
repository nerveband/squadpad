import { UdpSocket } from '../../modules/expo-udp';
import { MSG, PORT } from '../protocol/constants';
import { buildGameQuery } from '../protocol/encoder';
import { decodeGameResponse } from '../protocol/decoder';

export interface DiscoveredGame {
  address: string;
  port: number;
  gameName: string;
  lastSeen: number;
}

const SCAN_INTERVAL = 2000;
const STALE_TIMEOUT = 6000;

export class Discovery {
  private socket: UdpSocket | null = null;
  private games = new Map<string, DiscoveredGame>();
  private scanTimer: ReturnType<typeof setInterval> | null = null;
  private onChange: (games: DiscoveredGame[]) => void;
  private running = false;
  private queryCount = 0;
  private broadcastAddress: string = '255.255.255.255';

  constructor(onChange: (games: DiscoveredGame[]) => void) {
    this.onChange = onChange;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    // Get the subnet broadcast address (e.g. 192.168.1.255)
    // iOS blocks 255.255.255.255 with EHOSTUNREACH
    const subnetBroadcast = UdpSocket.getBroadcastAddress();
    if (subnetBroadcast) {
      this.broadcastAddress = subnetBroadcast;
      console.log('[Discovery] Using subnet broadcast:', this.broadcastAddress);
    } else {
      console.warn('[Discovery] Could not detect broadcast address, falling back to 255.255.255.255');
    }

    this.socket = new UdpSocket();
    const socketId = await this.socket.bind(0);
    console.log('[Discovery] Socket bound, id:', socketId);

    this.socket.setBroadcast(true);

    this.socket.onMessage((data, address, port) => {
      if (data.length > 0 && data[0] === MSG.GAME_RESPONSE) {
        const gameName = decodeGameResponse(data);
        const key = `${address}:${port}`;
        const isNew = !this.games.has(key);
        if (isNew) {
          console.log('[Discovery] Found game:', gameName, 'at', key);
        }
        this.games.set(key, {
          address,
          port: PORT,
          gameName,
          lastSeen: Date.now(),
        });
        this.emitGames();
      }
    });

    this.sendQuery();

    this.scanTimer = setInterval(() => {
      this.pruneStale();
      this.sendQuery();
    }, SCAN_INTERVAL);

    // Log diagnostics after 5 seconds
    setTimeout(() => {
      if (this.socket) {
        const diag = this.socket.diagnostics();
        console.log('[Discovery] Diagnostics:', JSON.stringify(diag));
      }
    }, 5000);
  }

  stop(): void {
    this.running = false;
    if (this.scanTimer) {
      clearInterval(this.scanTimer);
      this.scanTimer = null;
    }
    this.socket?.close();
    this.socket = null;
    this.games.clear();
  }

  private sendQuery(): void {
    if (!this.socket) return;
    const query = buildGameQuery();
    const result = this.socket.send(query, this.broadcastAddress, PORT);
    this.queryCount++;
    if (this.queryCount <= 3 || this.queryCount % 10 === 0) {
      console.log(`[Discovery] GAME_QUERY #${this.queryCount} to ${this.broadcastAddress}:${PORT} => ${result}`);
    }
  }

  private pruneStale(): void {
    const now = Date.now();
    let changed = false;
    for (const [key, game] of this.games) {
      if (now - game.lastSeen > STALE_TIMEOUT) {
        this.games.delete(key);
        changed = true;
      }
    }
    if (changed) this.emitGames();
  }

  private emitGames(): void {
    this.onChange(Array.from(this.games.values()));
  }
}
