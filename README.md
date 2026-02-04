# SplitMint — Your Gateway to Karbon

A MERN-style expense splitting app with groups, participants, expenses, balance engine, dashboards, and optional MintSense AI parsing.

## Tech
- React + Vite (client)
- Node + Express (server)
- MongoDB (database)

## Setup
```bash
npm run install:all
```

## Run locally (easy)
1) Create `.env.local` in the repo root:
```
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_long_random_secret
```
2) Start both server + client:
```bash
npm run dev
```

Client: http://localhost:5173
Server: http://localhost:4001

## Deploy to Vercel
1) Push repo to GitHub
2) Create a MongoDB Atlas database and copy `MONGO_URI`
3) In Vercel project settings, set env vars:
   - `MONGO_URI`
   - `JWT_SECRET`
4) Deploy the repo root

## Quick deploy checklist
- `MONGO_URI` set in Vercel env
- `JWT_SECRET` set in Vercel env
- Build command uses repo root (see `vercel.json`)
- API works: `/api/auth/me` returns 401 without a token

## Notes
- Each group supports up to 3 additional participants + the primary user.
- MintSense is a local heuristic parser; no external APIs are used.
