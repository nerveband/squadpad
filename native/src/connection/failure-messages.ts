import type { ConnectionFailure, ConnectionStage } from './connection-manager';

export type ConnectionMode = 'lan' | 'relay';

export const STAGE_TEXT: Record<ConnectionStage, string> = {
  connecting: 'Connecting...',
  joining: 'Joining room...',
  waiting_for_host: 'Waiting for the host to add you to BombSquad...',
};

/** Plain-language explanation of a failed connection. Relay wording matches web/src/js/ui.js. */
export function describeFailure(failure: ConnectionFailure, mode: ConnectionMode): string {
  switch (failure.reason) {
    case 'not_found':
      return 'Room not found. Check the code, or ask the host to click Go Online again.';
    case 'room_full': {
      const count = failure.playerCount || 8;
      return `Room is full (${count}/${count} players). Ask someone to leave and try again.`;
    }
    case 'rate_limited':
      return 'Too many attempts. Wait a minute and try again.';
    case 'bombsquad_unreachable':
      if (mode === 'lan') {
        return `Couldn't reach BombSquad${failure.detail ? ` at ${failure.detail}` : ''}. `
          + 'Make sure BombSquad is open on that device and both are on the same Wi-Fi.';
      }
      return `You reached the host, but their SquadPad app can't reach BombSquad${failure.detail ? ` at ${failure.detail}` : ''}. `
        + 'The host needs the desktop version of BombSquad (Windows, Mac, or Linux) running on the same computer.';
    case 'bombsquad_refused':
      return 'BombSquad turned the controller away. On the host, make sure the Remote App setting isn\'t disabled in BombSquad\'s controller settings.';
    case 'bombsquad_version':
      return 'The host\'s BombSquad version doesn\'t accept SquadPad controllers.';
    case 'host_timeout':
      return 'The host didn\'t respond. Ask them to restart sharing in the SquadPad app, or update it to the latest version.';
    case 'host_left':
      return 'The host has left the game.';
    case 'kicked':
      return 'BombSquad disconnected this controller.';
    case 'connection_lost':
      return mode === 'lan'
        ? 'Lost the connection to BombSquad. Check that it\'s still running and you\'re on the same Wi-Fi.'
        : 'Lost the connection to the room.';
    case 'relay_unreachable':
      return 'Can\'t reach the SquadPad relay. Check your internet connection.';
    default:
      return failure.detail || 'Connection error.';
  }
}
