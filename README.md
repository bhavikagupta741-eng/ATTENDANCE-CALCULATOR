# Attendix

A per-subject attendance tracker with a configurable target (defaults to 75%).

```
attendix-app/
├── frontend/            HTML + CSS + vanilla JS
├── backend-express/     Node.js + Express API (.env for PORT / CORS_ORIGIN)
└── backend-fastapi/     Python FastAPI API (.env for PORT / CORS_ORIGIN)
```

Each backend folder has its own `.env` file (already filled in with local
defaults) plus a `.env.example` you can use as a template elsewhere:

| Variable      | Default | What it does                                      |
|---------------|---------|----------------------------------------------------|
| `PORT`        | `5000` (Express) / `8000` (FastAPI) | Port the server listens on     |
| `CORS_ORIGIN` | `*`     | Which frontend origin is allowed to call the API   |

`.env` is git-ignored by default — when you deploy, set these as environment
variables in your host's dashboard (Render, Railway, etc.) instead of
committing a `.env` file.

The frontend calls whichever backend is running. If neither is running, it
falls back to the browser's `localStorage` automatically.

---

## Run it locally

### 1. Start a backend (pick one)

**Option A — Node.js + Express**
```bash
cd backend-express
npm install
npm start
# → http://localhost:5000
```

**Option B — Python FastAPI**
```bash
cd backend-fastapi
python -m venv venv && source venv/bin/activate   # optional but recommended
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
# → http://localhost:8000
# interactive docs at http://localhost:8000/docs
```

If you run FastAPI instead of Express, open `frontend/script.js` and change
the first line of config:
```js
const API_BASE = "http://localhost:5000/api"; // Express
```
to:
```js
const API_BASE = "http://localhost:8000/api"; // FastAPI
```

### 2. Serve the frontend

Don't just double-click `index.html` — some browsers block `fetch()` calls
from `file://` pages. Serve it instead:

```bash
cd frontend
python -m http.server 8080
# → http://localhost:8080
```

(Any static server works — `npx serve`, VS Code's Live Server, etc.)

Open `http://localhost:8080` in your browser. You should see "backend
connected — syncing live" at the bottom of the home screen. If it says
"backend offline," double check the backend is running and `API_BASE`
matches its port.

---

## Deploying it for real

**Frontend** — `frontend/` is fully static, so it deploys as-is to any static
host: Netlify, Vercel, GitHub Pages, Cloudflare Pages, or an S3 bucket.
Before deploying, update `API_BASE` in `script.js` to your deployed backend's
public URL (not `localhost`).

**Backend** — either one deploys as a normal Node or Python web service:
- Express → Render, Railway, Fly.io, or a plain VPS (`npm start`, keep it
  alive with `pm2` or a systemd service).
- FastAPI → Render, Railway, Fly.io, or a VPS (`uvicorn main:app --host 0.0.0.0 --port $PORT`).

Two things to change before going live:
1. **CORS** — both servers currently allow all origins (`*`) via `CORS_ORIGIN`
   in `.env`, which is fine for local dev. Once you know your frontend's real
   domain, set `CORS_ORIGIN=https://yourapp.com` in that host's environment
   variables (not in a committed `.env` file).
2. **Storage** — both backends persist to a local `data.json` file. That's
   fine for a single small deployment, but most hosts wipe the filesystem on
   redeploy. For anything beyond personal/demo use, swap `readData`/`writeData`
   (Express) or `read_data`/`write_data` (FastAPI) for a real database —
   SQLite is a drop-in first step, Postgres for anything shared across users.

---

## API reference (identical on both backends)

| Method | Route                 | Body                                         | Description                        |
|--------|------------------------|-----------------------------------------------|-------------------------------------|
| GET    | `/api/health`          | —                                              | Health check                        |
| GET    | `/api/subjects`        | —                                              | List subjects with computed stats   |
| POST   | `/api/subjects`        | `{ name, target?, total?, attended? }`        | Add a subject (target defaults 75)  |
| PUT    | `/api/subjects/:id`    | `{ name?, target?, total?, attended? }`       | Update a subject / log a class      |
| DELETE | `/api/subjects/:id`    | —                                              | Remove a subject                    |
| POST   | `/api/calculate`       | `{ total, attended, target? }`                | One-off calculation, no storage     |

Every subject response includes:
- `percentage` — current attendance %
- `isSafe` — whether it's at or above its target
- `classesNeeded` — consecutive classes to attend to reach target (if below)
- `classesCanSkip` — classes that can still be missed and stay at target (if above)

### The math

- **Below target:** `needed = ceil((target/100 × total − attended) / (target/100))`
- **At or above target:** `skippable = floor(attended / (target/100) − total)`

---

## Data storage (local)

Both backends persist to a local `data.json` file next to the server code —
no database setup required for local use. Delete that file (or reset it to
`[]`) to clear all data.
