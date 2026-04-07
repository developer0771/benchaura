# Benchaura — Production Architecture

> Real-time video study platform. Built with Next.js 14, Socket.io, WebRTC, and Firebase.

---

## What This Codebase Solves vs. The Original

| Problem (Original)                      | Solution (This Codebase)                    |
|-----------------------------------------|---------------------------------------------|
| Video room was fake (setTimeout)        | Real WebRTC peer connections via Socket.io signaling |
| Chat only visible to yourself           | Firestore real-time subscriptions           |
| `isHost` flag in localStorage = hackable| Firebase Auth UID + server-side validation  |
| State dies on tab close                 | Zustand persist + Firestore                 |
| Room codes generated client-side        | Server validates room existence in Firestore|
| No identity verification                | Email magic link (passwordless auth)        |
| All JS inline in HTML files             | Modular React hooks + TypeScript            |

---

## Folder Structure

```
benchaura/
├── server/                    ← Node.js signaling server
│   └── src/
│       ├── index.ts           ← Express + Socket.io entry
│       └── rooms.ts           ← In-memory room registry
│
├── web/                       ← Next.js 14 frontend
│   └── src/
│       ├── app/               ← App Router pages
│       │   ├── layout.tsx     ← Root layout (fonts, AuthProvider)
│       │   ├── page.tsx       ← Landing page
│       │   ├── join/page.tsx  ← Auth + room creation/join
│       │   ├── room/[code]/   ← Dynamic room page
│       │   │   └── page.tsx
│       │   └── profile/page.tsx
│       │
│       ├── components/
│       │   ├── layout/
│       │   │   └── AuthProvider.tsx
│       │   ├── room/
│       │   │   ├── VideoCard.tsx      ← Single participant tile
│       │   │   ├── VideoGrid.tsx      ← Grid of all tiles
│       │   │   ├── ChatPanel.tsx      ← Firestore-backed sidebar
│       │   │   ├── RoomControls.tsx   ← Mic/cam/screen/leave
│       │   │   └── PermissionsGate.tsx
│       │   └── ui/
│       │       └── Toast.tsx
│       │
│       ├── hooks/
│       │   ├── useMedia.ts        ← Camera/mic stream management
│       │   ├── useSocket.ts       ← Socket.io connection
│       │   ├── useWebRTC.ts       ← RTCPeerConnection management
│       │   ├── useChat.ts         ← Firestore message subscription
│       │   └── useAuthListener.ts ← Firebase Auth state sync
│       │
│       ├── store/
│       │   ├── useAuthStore.ts    ← User identity (Zustand + persist)
│       │   └── useRoomStore.ts    ← Room state (Zustand, ephemeral)
│       │
│       └── lib/
│           ├── firebase.ts        ← Firebase SDK init
│           ├── firestore.ts       ← All Firestore operations
│           └── utils.ts           ← Pure utility functions
│
├── firestore.rules            ← Security rules
├── firebase.json
└── package.json               ← Monorepo root
```

---

## Setup Guide

### Step 1 — Firebase Project

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. **Create project** → name it `benchaura`
3. **Authentication** → Sign-in method → Enable **Email/Link (passwordless)**
4. **Firestore Database** → Create database → Start in **test mode**
5. **Project Settings** → Your apps → Add web app → Copy the config object

### Step 2 — Environment Variables

```bash
# In web/ directory
cp .env.example .env.local
# Fill in your Firebase config values
```

```bash
# In server/ directory
cp .env.example .env
# Set CLIENT_URL=http://localhost:3000
```

### Step 3 — Install & Run

```bash
# From root
npm install

# Run both server and web in parallel
npm run dev

# Or separately:
cd server && npm run dev     # Signaling server on :4000
cd web    && npm run dev     # Next.js on :3000
```

### Step 4 — Firebase Security Rules

Once you've tested locally, lock down Firestore:

```bash
npm install -g firebase-tools
firebase login
firebase use --add   # Select your project
firebase deploy --only firestore:rules,firestore:indexes
```

---

## Architecture Deep Dive

### How WebRTC Works Here

```
  Peer A (already in room)          Server          Peer B (joining)
       │                              │                    │
       │                              │  emit('join-room') │
       │                              │◄───────────────────│
       │  emit('peer-joined')         │                    │
       │◄─────────────────────────────│                    │
       │                              │                    │
       │  createOffer()               │                    │
       │  setLocalDescription(offer)  │                    │
       │  emit('webrtc-offer') ───────►──────────────────► │
       │                              │   setRemoteDesc()  │
       │                              │   createAnswer()   │
       │◄─────────────────────────────────emit('webrtc-answer')
       │  setRemoteDescription(answer)│                    │
       │                              │                    │
       │◄═══════════════ ICE candidates both ways ════════►│
       │                              │                    │
       │◄════════════════════ P2P Video/Audio ════════════►│
                    (server no longer involved)
```

**Key insight:** The server is a "dumb pipe" for signaling. Once the WebRTC handshake completes, all video/audio flows directly between browsers. The server doesn't see or pay for your video traffic.

### State Flow

```
Firebase Auth
    │ onAuthStateChanged
    ▼
useAuthListener → useAuthStore (Zustand + localStorage)
                      │
                      ▼
              student.uid / name / email
                      │
          ┌───────────┼───────────┐
          ▼           ▼           ▼
      useMedia    useSocket    useChat (Firestore)
          │           │
          └─────┬─────┘
                ▼
           useWebRTC
                │
                ▼
         useRoomStore (Zustand)
                │
                ▼
    VideoGrid / ChatPanel / RoomControls
```

### Why Each Library Was Chosen

| Library | Why |
|---------|-----|
| **Next.js 14** | File-based routing maps to your pages; built-in image optimization; API routes for future backend needs |
| **Firebase Auth** | Passwordless email link in 10 lines of code; handles token refresh, security |
| **Firestore** | Real-time `onSnapshot` replaces your setTimeout chat; free tier handles thousands of users |
| **Socket.io** | Reliable WebSocket with fallback to polling; room management built-in |
| **Zustand** | 1/10th the boilerplate of Redux; selective re-renders prevent video lag |
| **TypeScript** | Catches type errors at compile time, not runtime — critical in a multi-hook app |

---

## Deployment

### Frontend → Vercel (free)

```bash
cd web
npx vercel

# Set environment variables in Vercel dashboard:
# NEXT_PUBLIC_FIREBASE_* (all your Firebase config)
# NEXT_PUBLIC_SOCKET_URL=https://your-server.railway.app
# NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

### Signaling Server → Railway (free tier)

```bash
cd server

# Install Railway CLI
npm install -g @railway/cli
railway login
railway init
railway up

# Set environment variables in Railway dashboard:
# CLIENT_URL=https://your-app.vercel.app
# PORT=4000 (Railway sets this automatically)
```

**After deployment:** Update Firebase Authentication → Authorized domains → Add your Vercel domain.

### Firestore Rules

```bash
firebase deploy --only firestore:rules
```

---

## Production Checklist

- [ ] Firebase Auth authorized domains includes your Vercel URL
- [ ] Firestore security rules deployed (not in test mode)
- [ ] `.env.local` never committed to Git
- [ ] CORS in `server/src/index.ts` set to your Vercel domain
- [ ] Add a TURN server for users behind strict firewalls (~15% of users)
  - Free option: [Metered.ca](https://www.metered.ca/tools/openrelay/) TURN server
  - Production: Twilio Network Traversal Service (~$0.40/GB)

---

## What to Build Next

1. **TURN server** — Without it, ~15% of users (corporate firewalls) can't connect via WebRTC
2. **Room password protection** — Optional passcode on room creation
3. **Raised hands** — Socket event for "I have a question"
4. **Recording** — MediaRecorder API to record local video
5. **Whiteboard** — Collaborative canvas via Socket.io + Canvas API
6. **Breakout rooms** — Split one room into sub-rooms (create child room codes)
