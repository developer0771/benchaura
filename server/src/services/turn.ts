// server/src/services/turn.ts
// Generates ephemeral Twilio TURN credentials on demand.
//
// WHY EPHEMERAL CREDENTIALS:
//   Never hardcode TURN username/password in client code — anyone can
//   extract them from your JS bundle and use your TURN server for free.
//   Twilio's Network Traversal Service issues time-limited tokens (1hr TTL)
//   that only work for the requesting client's IP.
//
// COST:
//   Twilio NTS: ~$0.40/GB relayed. Most WebRTC sessions use <50MB.
//   Free alternative: add openrelay.metered.ca credentials below.

import twilio from 'twilio';
import { logger } from '../utils/logger';

interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

interface CachedCredentials {
  servers: IceServer[];
  expiresAt: number;
}

// Cache credentials for 50 minutes (they're valid 60min, 10min safety margin)
const CACHE_TTL_MS = 50 * 60 * 1000;
const credentialCache = new Map<string, CachedCredentials>();

// Always-available STUN servers (free, no credentials needed)
const STUN_SERVERS: IceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

// Free community TURN server (ok for dev/testing, NOT for production)
const FREE_TURN_SERVERS: IceServer[] = [
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turns:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

export async function getIceServers(clientIp: string): Promise<IceServer[]> {
  const cacheKey = clientIp;
  const cached = credentialCache.get(cacheKey);

  // Return cached if still valid
  if (cached && Date.now() < cached.expiresAt) {
    return cached.servers;
  }

  const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioAuthToken  = process.env.TWILIO_AUTH_TOKEN;

  // If Twilio is configured, use it
  if (twilioAccountSid && twilioAuthToken) {
    try {
      const client = twilio(twilioAccountSid, twilioAuthToken);
      const token = await client.tokens.create({ ttl: 3600 });

      const servers: IceServer[] = [
        ...STUN_SERVERS,
        ...token.iceServers.map((s: any) => ({
          urls:       s.url || s.urls,
          username:   s.username,
          credential: s.credential,
        })),
      ];

      credentialCache.set(cacheKey, { servers, expiresAt: Date.now() + CACHE_TTL_MS });
      logger.debug({ clientIp }, 'Twilio TURN credentials issued');
      return servers;
    } catch (err) {
      logger.error({ err, clientIp }, 'Twilio TURN credential generation failed — falling back');
    }
  }

  // Fallback: free TURN + STUN
  logger.debug({ clientIp }, 'Using free TURN servers (no Twilio configured)');
  return [...STUN_SERVERS, ...FREE_TURN_SERVERS];
}
