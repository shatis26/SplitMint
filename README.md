# SplitMint — Smart Expense Splitter

A production-ready MERN web app to manage shared expenses across groups. Create groups, add participants, track expenses with multiple split modes, and see who owes whom with instant settlement suggestions. Includes optional MintSense AI parsing for quick expense entry.

## Features
- **Auth**: Email/password registration and login
- **Groups**: Create, rename, delete groups (max 3 participants + primary user)
- **Participants**: Add/edit/remove with safe handling for linked expenses
- **Expenses**: Add/edit/delete with equal, custom, and percentage splits
- **Balances**: Real-time net balance calculation and minimal settlement suggestions
- **Dashboards**: Summary cards, balance tables, ledger view
- **Search & Filters**: By text, participant, date range, amount
- **MintSense (AI)**: Parse natural language into structured expenses + summaries

---

## Tech Stack
- **Frontend**: React + Vite
- **Backend**: Node.js + Express
- **Database**: MongoDB (Mongoose)
- **Deployment**: Vercel (API as serverless function)

---

## Local Setup (Recommended)
### 1) Install dependencies
```bash
npm run install:all
```

### 2) Create `.env.local`
Create a file named `.env.local` in the project root with:
```env
MONGO_URI=mongodb+srv://user:password@cluster.mongodb.net/splitmint?retryWrites=true&w=majority
JWT_SECRET=your_long_random_secret
PORT=4001
```

### 3) Run locally
```bash
npm run dev
```

- Client: http://localhost:5173
- Server: http://localhost:4001

---

## Deployment (Vercel)
1. Push the repository to GitHub
2. Create a **MongoDB Atlas** database and copy your connection string
3. In Vercel → Project → Environment Variables, add:
   - `MONGO_URI`
   - `JWT_SECRET`
4. Deploy the repository root

---

## API Overview (Key Routes)
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/groups`
- `POST /api/groups`
- `PUT /api/groups/:id`
- `DELETE /api/groups/:id`
- `GET /api/groups/:id/participants`
- `POST /api/groups/:id/participants`
- `PUT /api/participants/:id`
- `DELETE /api/participants/:id`
- `GET /api/groups/:id/expenses`
- `POST /api/groups/:id/expenses`
- `PUT /api/expenses/:id`
- `DELETE /api/expenses/:id`
- `GET /api/groups/:id/balances`
- `GET /api/groups/:id/summary`
- `POST /api/ai/parse`
- `POST /api/ai/summary`

---

## Project Structure
```
SplitMint/
├─ api/                # Vercel serverless entry
├─ client/             # React UI
├─ server/             # Express API (local dev)
├─ .env.example
├─ vercel.json
└─ README.md
```

---

## Notes
- MintSense uses a local heuristic parser (no external AI APIs).
- The primary user is auto-added to each group and cannot be deleted.
- Custom splits must sum exactly to the expense total.

---

## License
MIT
