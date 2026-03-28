<!-- # 🧠 Adaptive AI Interviewer v2

Full-stack AI interview platform with **user authentication**, **persistent chat history**, and **adaptive questioning** powered by Anthropic Claude.

---

## What's New in v2

| Feature | Details |
|---|---|
| **User Login / Register** | JWT-based auth — create an account, sign in, sessions tied to your identity |
| **Persistent Chat History** | Every interview auto-saved to MongoDB with full Q&A transcript |
| **History Dashboard** | View all past sessions, filter by mode, see full transcript + scores |
| **Score Progression Chart** | Line chart showing your improvement across sessions |
| **Competency Map Carries Over** | Your skill map from past interviews pre-loads into new sessions |
| **Python Backend** | FastAPI + Motor (async MongoDB) replaces Node.js |

---

## Project Structure

```
ai-interviewer/
│
├── frontend/                          ← React + Vite
│   ├── src/
│   │   ├── index.jsx                  ← Entry point
│   │   ├── App.jsx                    ← Router: auth → dashboard → interview
│   │   ├── AuthContext.jsx            ← JWT token + user state (shared across app)
│   │   ├── AuthScreen.jsx             ← Login + Register UI
│   │   ├── HistoryDashboard.jsx       ← Past sessions, stats, transcript viewer
│   │   ├── AdaptiveInterviewer.jsx    ← Interview UI (auth-aware, auto-saves)
│   │   └── index.css                  ← Global styles + animations
│   ├── index.html
│   ├── vite.config.js                 ← Proxies /api → localhost:8000
│   ├── package.json
│   └── .env.example
│
├── backend/                           ← Python FastAPI
│   ├── main.py                        ← Server entry point, MongoDB connection
│   ├── requirements.txt               ← All Python dependencies
│   ├── .env.example                   ← Copy to .env and fill in keys
│   │
│   ├── middleware/
│   │   └── auth.py                    ← JWT create/verify, bcrypt, get_current_user
│   │
│   ├── models/
│   │   └── schemas.py                 ← All Pydantic request/response models
│   │
│   ├── routes/
│   │   ├── auth.py                    ← /register /login /me
│   │   ├── interview.py               ← /question (SSE) /evaluate /save
│   │   ├── history.py                 ← / (list) /:id (detail) /stats /delete
│   │   └── upload.py                  ← /resume (PDF parsing)
│   │
│   └── uploads/                       ← Temp folder for uploaded files (auto-cleaned)
│
└── README.md
```

---

## Setup — Step by Step

### Prerequisites

- **Python 3.11+** — https://python.org
- **Node.js 18+** — https://nodejs.org
- **Anthropic API key** — https://console.anthropic.com
- **MongoDB** — free Atlas cluster at https://mongodb.com/atlas (or local MongoDB)

---

### Step 1 — Get your Anthropic API Key

1. Go to https://console.anthropic.com
2. Sign in → **API Keys** → **Create Key**
3. Copy the key starting with `sk-ant-...`

---

### Step 2 — Get a MongoDB connection string

**Option A — MongoDB Atlas (recommended, free tier):**
1. Go to https://cloud.mongodb.com → Create a free M0 cluster
2. Create a database user (username + password)
3. Go to **Network Access** → Add IP → Allow access from anywhere (`0.0.0.0/0`) for development
4. Go to **Connect** → **Drivers** → Copy the connection string
5. Replace `<password>` with your actual password

**Option B — Local MongoDB:**
```
mongodb://localhost:27017
```
Install MongoDB locally from https://www.mongodb.com/try/download/community

---

### Step 3 — Set up the Python Backend

```bash
cd ai-interviewer/backend

# Create a virtual environment (keeps packages isolated)
python -m venv venv

# Activate it:
# On Mac/Linux:
source venv/bin/activate
# On Windows:
venv\Scripts\activate

# Install all dependencies
pip install -r requirements.txt

# Create your environment file
cp .env.example .env
```

Now open `backend/.env` in any text editor and fill in:

```env
ANTHROPIC_API_KEY=sk-ant-your-actual-key-here
JWT_SECRET=any-long-random-string-at-least-32-chars
MONGODB_URI=mongodb+srv://youruser:yourpass@cluster0.xxxxx.mongodb.net/ai_interviewer
```

**Generate a secure JWT secret:**
```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

Start the backend:
```bash
uvicorn main:app --reload --port 8000
```

You should see:
```
🧠  AI Interviewer Backend starting...
    Anthropic key : ✅ set
    MongoDB URI   : ✅ set
    JWT secret    : ✅ set

INFO:     Uvicorn running on http://0.0.0.0:8000
```

---

### Step 4 — Set up the Frontend

Open a **new terminal**:

```bash
cd ai-interviewer/frontend

# Install npm packages
npm install

# Start the dev server
npm run dev
```

You should see:
```
  VITE v5.x  ready

  ➜  Local:   http://localhost:3000/
```

---

### Step 5 — Open the App

1. Go to **http://localhost:3000**
2. You'll see the **Register / Sign In** screen
3. Create an account with your name, email, and password
4. You'll be taken to your **dashboard** (empty at first)
5. Click **New Interview** → choose a mode → start interviewing
6. When finished, the session auto-saves and appears in your history

---

## API Reference

All endpoints require `Authorization: Bearer <token>` except `/auth/register` and `/auth/login`.

### Auth
| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/api/auth/register` | `{name, email, password}` | `{access_token, user}` |
| POST | `/api/auth/login` | `{email, password}` | `{access_token, user}` |
| GET  | `/api/auth/me` | — | user profile + competency map |

### Interview
| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/api/interview/question` | `{messages, competency_map, resume_context, mode}` | SSE stream |
| POST | `/api/interview/evaluate` | `{question, answer, mode, competency_map}` | evaluation JSON |
| POST | `/api/interview/save` | `{mode, transcript, competency_map, ...}` | `{interview_id}` |

### History
| Method | Path | Query | Returns |
|---|---|---|---|
| GET | `/api/history/` | `?page=1&limit=8&mode=Technical` | paginated sessions list |
| GET | `/api/history/stats` | — | stats + spider data + score history |
| GET | `/api/history/:id` | — | full session with complete transcript |
| DELETE | `/api/history/:id` | — | confirmation |

### Upload
| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/api/upload/resume` | multipart file | `{context, filename, chars}` |

---

## How Authentication Works

1. **Register** → backend hashes your password with bcrypt → stores in MongoDB `users` collection → returns a JWT token
2. **JWT token** → stored in `localStorage` → sent as `Authorization: Bearer <token>` header with every API call
3. **Token expiry** → 30 days → after that, you'll be automatically logged out
4. **Every protected route** uses the `get_current_user` FastAPI dependency which decodes the JWT → extracts `user_id`, `email`, `name`

---

## How Chat History Works

1. **During interview** → each Q&A turn is stored in React state (`transcript[]`)
2. **On interview end** → `POST /api/interview/save` is called automatically
3. **Backend saves** → full transcript + scores + competency map → MongoDB `interviews` collection
4. **User's competency map** → merged with their profile → available in next interview
5. **Dashboard** → `GET /api/history/` shows all past sessions → click any to see full transcript

---

## MongoDB Collections

### `users`
```json
{
  "_id": "ObjectId",
  "name": "Ada Lovelace",
  "email": "ada@example.com",
  "password": "<bcrypt hash>",
  "competency_map": {"Closures": 7, "System Design": 5},
  "total_interviews": 4,
  "avg_score": 6.8,
  "created_at": "ISODate"
}
```

### `interviews`
```json
{
  "_id": "ObjectId",
  "user_id": "string",
  "mode": "Technical",
  "transcript": [
    {
      "turn_number": 1,
      "question": "What is a closure?",
      "answer": "A closure is...",
      "scores": {"technicalAccuracy": 7, "communicationClarity": 8, "depthOfExperience": 6},
      "overall_score": 7.0,
      "strengths": ["Correct definition"],
      "gaps": ["Missing memory leak example"],
      "suggested_better": "A stronger answer would...",
      "topics_covered": ["Closures"],
      "filler_word_count": 2,
      "timestamp": "ISODate"
    }
  ],
  "competency_map": {"Closures": 7},
  "overall_score": 7.2,
  "duration": 840,
  "resume_used": true,
  "created_at": "ISODate"
}
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `ANTHROPIC_API_KEY not set` | Check `backend/.env` — no quotes, no spaces around `=` |
| `pip install` fails | Make sure your venv is activated: `source venv/bin/activate` |
| MongoDB connection refused | Check Atlas IP whitelist. Add `0.0.0.0/0` for dev. |
| `401 Unauthorized` on all requests | Token expired or wrong — log out and log in again |
| Port 8000 already in use | `lsof -ti:8000 \| xargs kill` or change port in `uvicorn` command |
| PDF text extraction empty | File may be scanned/image-based. Try a text-based PDF. |
| Speech recognition not working | Use Chrome or Edge. Click the padlock icon → allow microphone. |
| Frontend shows blank page | Check browser console. Run `npm install` again if errors show. |

---

## Deployment

### Recommended Stack
- **Frontend** → Vercel (free) — `npm run build`, deploy `dist/`
- **Backend** → Railway (free tier) — point to `backend/` folder, set env vars
- **Database** → MongoDB Atlas M0 (free forever)

### Environment variables for production
**Backend (Railway):**
```
ANTHROPIC_API_KEY=sk-ant-...
JWT_SECRET=<your 32-char secret>
MONGODB_URI=mongodb+srv://...
FRONTEND_URL=https://your-app.vercel.app
```

**Frontend (Vercel):**
```
VITE_API_URL=https://your-backend.up.railway.app/api
``` -->

# 🧠 Adaptive AI Interviewer v2

Full-stack AI interview platform with **user authentication**, **persistent chat history**, and **adaptive questioning** powered by Anthropic Claude.

---

## What's New in v2

| Feature | Details |
|---|---|
| **User Login / Register** | JWT-based auth — create an account, sign in, sessions tied to your identity |
| **Persistent Chat History** | Every interview auto-saved to MongoDB with full Q&A transcript |
| **History Dashboard** | View all past sessions, filter by mode, see full transcript + scores |
| **Score Progression Chart** | Line chart showing your improvement across sessions |
| **Competency Map Carries Over** | Your skill map from past interviews pre-loads into new sessions |
| **Python Backend** | FastAPI + Motor (async MongoDB) replaces Node.js |

---

## Project Structure

```
ai-interviewer/
│
├── frontend/                          ← React + Vite
│   ├── src/
│   │   ├── index.jsx                  ← Entry point
│   │   ├── App.jsx                    ← Router: auth → dashboard → interview
│   │   ├── AuthContext.jsx            ← JWT token + user state (shared across app)
│   │   ├── AuthScreen.jsx             ← Login + Register UI
│   │   ├── HistoryDashboard.jsx       ← Past sessions, stats, transcript viewer
│   │   ├── AdaptiveInterviewer.jsx    ← Interview UI (auth-aware, auto-saves)
│   │   └── index.css                  ← Global styles + animations
│   ├── index.html
│   ├── vite.config.js                 ← Proxies /api → localhost:8000
│   ├── package.json
│   └── .env.example
│
├── backend/                           ← Python FastAPI
│   ├── main.py                        ← Server entry point, MongoDB connection
│   ├── requirements.txt               ← All Python dependencies
│   ├── .env.example                   ← Copy to .env and fill in keys
│   │
│   ├── middleware/
│   │   └── auth.py                    ← JWT create/verify, bcrypt, get_current_user
│   │
│   ├── models/
│   │   └── schemas.py                 ← All Pydantic request/response models
│   │
│   ├── routes/
│   │   ├── auth.py                    ← /register /login /me
│   │   ├── interview.py               ← /question (SSE) /evaluate /save
│   │   ├── history.py                 ← / (list) /:id (detail) /stats /delete
│   │   └── upload.py                  ← /resume (PDF parsing)
│   │
│   └── uploads/                       ← Temp folder for uploaded files (auto-cleaned)
│
└── README.md
```

---

## Setup — Step by Step

### Prerequisites

- **Python 3.11+** — https://python.org
- **Node.js 18+** — https://nodejs.org
- **Anthropic API key** — https://console.anthropic.com
- **MongoDB** — free Atlas cluster at https://mongodb.com/atlas (or local MongoDB)

---

### Step 1 — Get your Anthropic API Key

1. Go to https://console.anthropic.com
2. Sign in → **API Keys** → **Create Key**
3. Copy the key starting with `sk-ant-...`

---

### Step 2 — Get a MongoDB connection string

**Option A — MongoDB Atlas (recommended, free tier):**
1. Go to https://cloud.mongodb.com → Create a free M0 cluster
2. Create a database user (username + password)
3. Go to **Network Access** → Add IP → Allow access from anywhere (`0.0.0.0/0`) for development
4. Go to **Connect** → **Drivers** → Copy the connection string
5. Replace `<password>` with your actual password

**Option B — Local MongoDB:**
```
mongodb://localhost:27017
```
Install MongoDB locally from https://www.mongodb.com/try/download/community

---

### Step 3 — Set up the Python Backend

```bash
cd ai-interviewer/backend

# Create a virtual environment (keeps packages isolated)
python -m venv venv

# Activate it:
# On Mac/Linux:
source venv/bin/activate
# On Windows:
venv\Scripts\activate

# Install all dependencies
pip install -r requirements.txt

# Create your environment file
cp .env.example .env
```

Now open `backend/.env` in any text editor and fill in:

```env
ANTHROPIC_API_KEY=sk-ant-your-actual-key-here
JWT_SECRET=any-long-random-string-at-least-32-chars
MONGODB_URI=mongodb+srv://youruser:yourpass@cluster0.xxxxx.mongodb.net/ai_interviewer
```

**Generate a secure JWT secret:**
```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

Start the backend:
```bash
uvicorn main:app --reload --port 8000
```

You should see:
```
🧠  AI Interviewer Backend starting...
    Anthropic key : ✅ set
    MongoDB URI   : ✅ set
    JWT secret    : ✅ set

INFO:     Uvicorn running on http://0.0.0.0:8000
```

---

### Step 4 — Set up the Frontend

Open a **new terminal**:

```bash
cd ai-interviewer/frontend

# Install npm packages
npm install

# Start the dev server
npm run dev
```

You should see:
```
  VITE v5.x  ready

  ➜  Local:   http://localhost:3000/
```

---

### Step 5 — Open the App

1. Go to **http://localhost:3000**
2. You'll see the **Register / Sign In** screen
3. Create an account with your name, email, and password
4. You'll be taken to your **dashboard** (empty at first)
5. Click **New Interview** → choose a mode → start interviewing
6. When finished, the session auto-saves and appears in your history

---

## API Reference

All endpoints require `Authorization: Bearer <token>` except `/auth/register` and `/auth/login`.

### Auth
| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/api/auth/register` | `{name, email, password}` | `{access_token, user}` |
| POST | `/api/auth/login` | `{email, password}` | `{access_token, user}` |
| GET  | `/api/auth/me` | — | user profile + competency map |

### Interview
| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/api/interview/question` | `{messages, competency_map, resume_context, mode}` | SSE stream |
| POST | `/api/interview/evaluate` | `{question, answer, mode, competency_map}` | evaluation JSON |
| POST | `/api/interview/save` | `{mode, transcript, competency_map, ...}` | `{interview_id}` |

### History
| Method | Path | Query | Returns |
|---|---|---|---|
| GET | `/api/history/` | `?page=1&limit=8&mode=Technical` | paginated sessions list |
| GET | `/api/history/stats` | — | stats + spider data + score history |
| GET | `/api/history/:id` | — | full session with complete transcript |
| DELETE | `/api/history/:id` | — | confirmation |

### Upload
| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/api/upload/resume` | multipart file | `{context, filename, chars}` |

---

## How Authentication Works

1. **Register** → backend hashes your password with bcrypt → stores in MongoDB `users` collection → returns a JWT token
2. **JWT token** → stored in `localStorage` → sent as `Authorization: Bearer <token>` header with every API call
3. **Token expiry** → 30 days → after that, you'll be automatically logged out
4. **Every protected route** uses the `get_current_user` FastAPI dependency which decodes the JWT → extracts `user_id`, `email`, `name`

---

## How Chat History Works

1. **During interview** → each Q&A turn is stored in React state (`transcript[]`)
2. **On interview end** → `POST /api/interview/save` is called automatically
3. **Backend saves** → full transcript + scores + competency map → MongoDB `interviews` collection
4. **User's competency map** → merged with their profile → available in next interview
5. **Dashboard** → `GET /api/history/` shows all past sessions → click any to see full transcript

---

## MongoDB Collections

### `users`
```json
{
  "_id": "ObjectId",
  "name": "Ada Lovelace",
  "email": "ada@example.com",
  "password": "<bcrypt hash>",
  "competency_map": {"Closures": 7, "System Design": 5},
  "total_interviews": 4,
  "avg_score": 6.8,
  "created_at": "ISODate"
}
```

### `interviews`
```json
{
  "_id": "ObjectId",
  "user_id": "string",
  "mode": "Technical",
  "transcript": [
    {
      "turn_number": 1,
      "question": "What is a closure?",
      "answer": "A closure is...",
      "scores": {"technicalAccuracy": 7, "communicationClarity": 8, "depthOfExperience": 6},
      "overall_score": 7.0,
      "strengths": ["Correct definition"],
      "gaps": ["Missing memory leak example"],
      "suggested_better": "A stronger answer would...",
      "topics_covered": ["Closures"],
      "filler_word_count": 2,
      "timestamp": "ISODate"
    }
  ],
  "competency_map": {"Closures": 7},
  "overall_score": 7.2,
  "duration": 840,
  "resume_used": true,
  "created_at": "ISODate"
}
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `ANTHROPIC_API_KEY not set` | Check `backend/.env` — no quotes, no spaces around `=` |
| `pip install` fails | Make sure your venv is activated: `source venv/bin/activate` |
| MongoDB connection refused | Check Atlas IP whitelist. Add `0.0.0.0/0` for dev. |
| `401 Unauthorized` on all requests | Token expired or wrong — log out and log in again |
| Port 8000 already in use | `lsof -ti:8000 \| xargs kill` or change port in `uvicorn` command |
| PDF text extraction empty | File may be scanned/image-based. Try a text-based PDF. |
| Speech recognition not working | Use Chrome or Edge. Click the padlock icon → allow microphone. |
| Frontend shows blank page | Check browser console. Run `npm install` again if errors show. |

---

## Deployment

### Recommended Stack
- **Frontend** → Vercel (free) — `npm run build`, deploy `dist/`
- **Backend** → Railway (free tier) — point to `backend/` folder, set env vars
- **Database** → MongoDB Atlas M0 (free forever)

### Environment variables for production
**Backend (Railway):**
```
ANTHROPIC_API_KEY=sk-ant-...
JWT_SECRET=<your 32-char secret>
MONGODB_URI=mongodb+srv://...
FRONTEND_URL=https://your-app.vercel.app
```

**Frontend (Vercel):**
```
VITE_API_URL=https://your-backend.up.railway.app/api
```
