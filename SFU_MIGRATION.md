# SFU Architecture — When and How to Migrate

## Current Architecture: Mesh WebRTC

Every peer connects directly to every other peer.

```
Peer A ←→ Peer B
Peer A ←→ Peer C  
Peer B ←→ Peer C
```

**Upload cost per peer = (N-1) × stream_bitrate**

For 4 peers at 500kbps each:
- Each peer uploads 3 streams = 1.5 Mbps upload
- Total network load = 4 × 1.5 Mbps = 6 Mbps

**Mesh works well up to ~4 peers on good connections.**
Beyond 4 peers, upload bandwidth becomes the bottleneck.

---

## SFU (Selective Forwarding Unit) Architecture

A server receives one stream from each peer and forwards it to others.

```
Peer A → SFU → Peer B
Peer B → SFU → Peer A
Peer C → SFU → Peer A, B
```

**Upload cost per peer = 1 stream (always)**

Each peer uploads once regardless of how many others are in the room.
The SFU does the forwarding — peers only download.

**SFU works for 4–100+ peers.**

---

## Recommended SFU: LiveKit (open source)

LiveKit is the easiest production SFU to self-host or use as a service.

### Option 1: LiveKit Cloud (fastest)
$0.05/hour per room. Zero infrastructure.

```bash
npm install livekit-client @livekit/components-react
```

Replace your WebRTC hooks with:
```tsx
import { LiveKitRoom, VideoConference } from '@livekit/components-react';

<LiveKitRoom
  serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL}
  token={roomToken}
  connect={true}
>
  <VideoConference />
</LiveKitRoom>
```

You get: adaptive bitrate, simulcast, screen share, recording, 
active speaker detection — all built in.

### Option 2: Self-hosted LiveKit on Railway

```bash
# docker-compose.yml for your Railway service
services:
  livekit:
    image: livekit/livekit-server:latest
    command: --dev --bind 0.0.0.0
    ports:
      - "7880:7880"
      - "7881:7881"
      - "7882:7882/udp"
```

---

## Migration Plan: Mesh → LiveKit

### Phase 1: Add LiveKit alongside existing code (1 week)
- Keep current Socket.io signaling for rooms ≤ 4 peers
- Add LiveKit for rooms where peer count exceeds 4
- Switch automatically when 5th peer joins

### Phase 2: Replace WebRTC hooks (1 week)
- Remove `useWebRTC.ts` 
- Replace with LiveKit React SDK
- Keep `useChat.ts` (Firestore chat stays the same)
- Keep `useMedia.ts` (local stream management same)

### Phase 3: Remove signaling server (optional)
- LiveKit handles its own signaling
- Keep Socket.io only for non-video events (typing indicators, reactions)
- Or remove Socket.io entirely if LiveKit covers all needs

---

## When You Actually Need This

| Room size | Architecture | Monthly cost |
|-----------|-------------|--------------|
| 1–4 peers | Current mesh WebRTC | $0 (only TURN costs) |
| 5–20 peers | LiveKit Cloud | ~$15–60/month |
| 20–100 peers | LiveKit Cloud or self-hosted | ~$60–200/month |
| 100+ peers | LiveKit self-hosted | $100+/month (infra) |

**Recommendation:** Don't migrate until you regularly have rooms with 5+ people.
The current mesh WebRTC implementation is correct and production-ready for
the typical 2–4 person study group use case.
