// server/src/services/livekit.ts
// Mints short-lived LiveKit access tokens for authenticated users.
//
// WHY A SERVER ENDPOINT:
//   The LiveKit API secret MUST NOT leak to the browser. Clients call our
//   /livekit/token endpoint with their Firebase ID token; we verify the
//   Firebase identity, then generate a LiveKit JWT scoped to one room with
//   publish + subscribe + data permissions. TTL is 6 hours — long enough for
//   a study session, short enough that a leaked token expires quickly.
//
// LIVEKIT ROOM NAMING:
//   We reuse the room code (e.g. "AB1-XYZW") as the LiveKit room name.
//   LiveKit auto-creates rooms on first connection, so no pre-provisioning.

import { AccessToken, TrackSource } from 'livekit-server-sdk';
import { logger } from '../utils/logger';

const LIVEKIT_API_KEY    = process.env.LIVEKIT_API_KEY    || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';
const LIVEKIT_URL        = process.env.LIVEKIT_URL        || '';

export function isLiveKitConfigured(): boolean {
  return Boolean(LIVEKIT_API_KEY && LIVEKIT_API_SECRET && LIVEKIT_URL);
}

export function getLiveKitUrl(): string {
  return LIVEKIT_URL;
}

interface TokenParams {
  identity: string;   // Firebase UID — stable user identifier
  name:     string;   // Display name shown to other participants
  roomName: string;   // Benchaura room code (e.g. "AB1-XYZW")
  metadata?: string;  // Optional JSON string (isHost, etc.)
}

export async function createLiveKitToken({
  identity, name, roomName, metadata,
}: TokenParams): Promise<string> {
  if (!isLiveKitConfigured()) {
    throw new Error('LiveKit is not configured. Set LIVEKIT_API_KEY / LIVEKIT_API_SECRET / LIVEKIT_URL in server/.env.local');
  }

  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity,
    name,
    metadata,
    ttl: 60 * 60 * 6, // 6 hours
  });

  at.addGrant({
    roomJoin:      true,
    room:          roomName,
    canPublish:    true,
    canSubscribe:  true,
    canPublishData: true,
    // Allow camera, mic, and screen share
    canPublishSources: [
      TrackSource.CAMERA,
      TrackSource.MICROPHONE,
      TrackSource.SCREEN_SHARE,
      TrackSource.SCREEN_SHARE_AUDIO,
    ],
  });

  const jwt = await at.toJwt();
  logger.info({ identity, roomName }, 'Minted LiveKit token');
  return jwt;
}
