# Benchaura v2 — Production Upgrade Guide

## What Changed in v2

| Area | v1 | v2 |
|------|----|----|
| Room storage | In-memory Map (lost on restart) | Firestore-backed + in-memory cache |
| TURN servers | Hardcoded free STUN only | Dynamic Twilio credentials endpoint |
| Auth on socket | None (anyone could claim any UID) | Firebase token verification |
| Rate limiting | Basic per-IP join limiting | Per-event socket limiting + Express |
| Error monitoring | console.log | Pino structured JSON + Sentry |
| Firestore rules | Basic | Room-based access + field-level rules |
| Frontend errors | White screen | Error boundary + toast notifications |
| Connection quality | None | RTCPeerConnection.getStats() monitor |
| Shutdown | process.exit | Graceful SIGTERM with client notification |

---

## Integration Steps

### Step 1 — Copy new server files

Replace these files in your `server/src/` directory:
```
server/
└── src/
    ├── index.ts              ← REPLACE (full rewrite)
    ├── utils/
    │   └── logger.ts         ← NEW
    ├── services/
    │   ├── firebase.ts       ← NEW (Admin SDK)
    │   ├── roomStore.ts      ← REPLACE (was rooms.ts)
    │   └── turn.ts           ← NEW
    └── middleware/
        ├── auth.ts           ← NEW
        └── rateLimit.ts      ← NEW (was inline in index.ts)
```

### Step 2 — Update server package.json

Add new dependencies:
```bash
cd server
npm install @sentry/node firebase-admin pino pino-http express-rate-limit twilio uuid
npm install -D pino-pretty @types/uuid
```

### Step 3 — Get Firebase Service Account

1. Firebase Console → Project Settings → Service accounts
2. Click "Generate new private key" → downloads JSON file
3. Open the JSON file → copy the entire contents
4. In Railway dashboard → your server service → Variables:
   ```
   FIREBASE_SERVICE_ACCOUNT = (paste the entire JSON as one line)
   FIREBASE_PROJECT_ID = benchaura-56750
   ```

### Step 4 — Add TURN server (optional but recommended)

**Free option** (already configured as fallback in `turn.ts` — no setup needed):
Uses openrelay.metered.ca community TURN. OK for < 100 users/month.

**Twilio option** (recommended for production):
1. Sign up at twilio.com (free trial gives $15 credit)
2. Go to Account → API Keys → Create API Key
3. Add to Railway env vars:
   ```
   TWILIO_ACCOUNT_SID = ACxxxxxxxx
   TWILIO_AUTH_TOKEN = your_token
   ```

### Step 5 — Update frontend Socket.io connection

Update `web/src/hooks/useSocket.ts` to send Firebase ID token:

```typescript
// Add this to useSocket.ts useEffect:
import { auth } from '@/lib/firebase';

const token = await auth.currentUser?.getIdToken();
const socket = io(SOCKET_URL, {
  auth: { token },           // ← ADD THIS
  transports: ['websocket', 'polling'],
  // ... rest of config
});
```

### Step 6 — Add new frontend hooks

Copy these to `web/src/hooks/`:
- `useIceServers.ts` — fetches dynamic TURN credentials
- `useConnectionQuality.ts` — monitors RTT/packet loss
- `useReconnection.ts` — handles dropped peer connections

Copy to `web/src/components/`:
- `ui/ErrorBoundary.tsx` — catches React errors in video room
- `room/ConnectionQuality.tsx` — signal strength badge

### Step 7 — Update room page

In `web/src/app/room/[code]/page.tsx`:

```typescript
// 1. Replace hardcoded ICE config with dynamic fetch
import { useIceServers } from '@/hooks/useIceServers';
const { iceServers, isLoading: iceLoading } = useIceServers();

// 2. Pass iceServers to useWebRTC
const { broadcastMediaState } = useWebRTC({
  socket, localStream, enabled, iceServers,  // ← ADD iceServers
});

// 3. Wrap VideoGrid with ErrorBoundary
<ErrorBoundary fallback={<div>Video error — try refreshing</div>}>
  <VideoGrid ... />
</ErrorBoundary>

// 4. Add ConnectionQualityBadge to topbar
<ConnectionQualityBadge quality={quality} rtt={rtt} />
```

### Step 8 — Deploy Firestore security rules

```bash
firebase deploy --only firestore:rules
```

Test that unauthenticated writes are rejected:
```bash
# Should fail with PERMISSION_DENIED
curl -X POST "https://firestore.googleapis.com/v1/projects/benchaura-56750/databases/(default)/documents/rooms" \
  -H "Content-Type: application/json" \
  -d '{"fields":{"test":{"stringValue":"should fail"}}}'
```

### Step 9 — Set up Sentry (optional)

1. Create account at sentry.io → New Project → Next.js
2. Install: `npm install @sentry/nextjs` in web/
3. Run: `npx @sentry/wizard@latest -i nextjs`
4. Add DSN to Railway: `SENTRY_DSN=https://xxx@sentry.io/xxx`

---

## Environment Variables Summary

### Server (Railway)
```
NODE_ENV=production
CLIENT_URL=https://your-app.vercel.app
FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}
FIREBASE_PROJECT_ID=benchaura-56750
TWILIO_ACCOUNT_SID=ACxxxxxxxx        (optional)
TWILIO_AUTH_TOKEN=xxxxxxxxx          (optional)
SENTRY_DSN=https://xxx@sentry.io/xxx (optional)
LOG_LEVEL=info
```

### Web (Vercel)
```
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=benchaura-56750
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
NEXT_PUBLIC_SOCKET_URL=https://your-server.railway.app
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
SENTRY_DSN=https://xxx@sentry.io/xxx (optional)
```
