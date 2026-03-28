# 🧠 Adaptive AI Interviewer

> An open-source, self-hosted AI interview platform that adapts in real-time to your answers — powered by a local LLM via Ollama, with full user authentication and persistent session history.

![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat-square&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?style=flat-square&logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black)
![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?style=flat-square&logo=mongodb&logoColor=white)
![Ollama](https://img.shields.io/badge/Ollama-local%20LLM-000000?style=flat-square)
<!-- ![License](https://img.shields.io/badge/license-MIT-green?style=flat-square) -->

---

## Overview

Adaptive AI Interviewer is a full-stack application that conducts intelligent mock interviews. Unlike static question banks, it uses **chain-of-thought reasoning** to analyse each of your answers and dynamically generate the next question — probing deeper into weak areas and advancing past topics you've mastered.

It runs entirely on your machine using Ollama, meaning **no API costs, no data sent to external servers, and no internet connection required** during interviews.

---

## Features

- **Adaptive questioning** — each question is generated from your previous answer using chain-of-thought reasoning; weak topics get more follow-ups, strong topics get skipped
- **Three interview modes** — Technical (DSA, system design, language depth), Behavioral (STAR method, leadership), English (grammar, vocabulary, filler word detection)
- **Live competency map** — per-topic skill scores (0–10) update in real time on the sidebar as you answer
- **Streaming text** — questions appear word by word via Server-Sent Events
- **Speech I/O** — built-in Text-to-Speech (read question aloud) and Speech-to-Text (record your answer) via the Web Speech API
- **Resume personalisation** — upload a PDF resume and questions are tailored to your actual experience and projects
- **User authentication** — JWT-based register/login; every session is tied to your account
- **Persistent history** — every interview auto-saves to MongoDB with the full transcript, per-answer scores, and "stronger answer" suggestions
- **History dashboard** — view all past sessions, filter by mode, track your score progression over time with charts
- **Post-interview report** — skill spider web chart, complete Q&A transcript with model answers, improvement roadmap
- **100% local** — runs on Ollama with any supported model (llama3, mistral, gemma2, phi3, and more)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Recharts, Lucide React |
| Backend | Python 3.11, FastAPI, Uvicorn |
| AI | Ollama (local LLM — llama3, mistral, gemma2, etc.) |
| Database | MongoDB (Atlas free tier or local) |
| Auth | JWT (python-jose) + bcrypt (passlib) |
| PDF parsing | pdfplumber |
| HTTP client | httpx (async) |

---

## Architecture
```
Browser (React + Vite)
        │
        │  /api/interview/question  →  SSE stream
        │  /api/interview/evaluate  →  JSON scores
        │  /api/upload/resume       →  text extraction
        │  /api/auth/*              →  JWT tokens
        │  /api/history/*           →  session CRUD
        ▼
FastAPI Server (Python)
        │
        ├── httpx ──────────────────→  Ollama  (localhost:11434)
        │    POST /api/chat               └── llama3 / mistral / gemma2
        │    streaming + non-streaming
        │
        ├── pdfplumber ─────────────→  Resume text extraction
        │
        └── motor (async) ──────────→  MongoDB Atlas
              interviews collection       full transcripts + competency maps
              users collection            JWT identity + cumulative skill map
```

**How adaptive questioning works:** After each answer, the backend calls Ollama with a system prompt that includes the current competency map (e.g. `"Closures: 3/10, Async: 8/10"`). The model is instructed to probe topics below 6 with follow-ups and skip topics above 7. This feedback loop — answer → evaluate → update map → inject map → generate question — is what makes the interview feel intelligent without any hardcoded question lists.

---

## Prerequisites

- Python 3.11 or higher
- Node.js 18 or higher
- [Ollama](https://ollama.com) installed and running
- MongoDB — free M0 cluster at [MongoDB Atlas](https://mongodb.com/atlas) or a local instance

---

## Quick Start

### 1. Install and start Ollama
```bash
# macOS / Linux
curl -fsSL https://ollama.com/install.sh | sh

# Windows: download from https://ollama.com/download

# Pull a model (choose one)
ollama pull llama3        # 4.7 GB — recommended
ollama pull mistral       # 4.1 GB — faster responses
ollama pull gemma2        # 5.4 GB — strong reasoning
ollama pull phi3          # 2.3 GB — lightweight, good for low-RAM machines

# Start the Ollama server
ollama serve
```

### 2. Clone the repository
```bash
git clone https://github.com/your-username/adaptive-ai-interviewer.git
cd adaptive-ai-interviewer
```

### 3. Backend setup
```bash
cd backend

# Create and activate a virtual environment
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
```

Open `.env` and fill in the required values:
```env
# Ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3

# Generate a secret: python -c "import secrets; print(secrets.token_hex(32))"
JWT_SECRET=your-long-random-secret-here

# MongoDB Atlas connection string
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/ai_interviewer

FRONTEND_URL=http://localhost:3000
```

Start the backend:
```bash
uvicorn main:app --reload --port 8000
```

### 4. Frontend setup

Open a new terminal:
```bash
cd frontend
npm install
npm run dev
```

### 5. Open the app

Navigate to [http://localhost:3000](http://localhost:3000), create an account, and start your first interview.

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `OLLAMA_BASE_URL` | No | `http://localhost:11434` | URL where Ollama is running |
| `OLLAMA_MODEL` | No | `llama3` | Model name — must be pulled with `ollama pull` first |
| `JWT_SECRET` | **Yes** | — | Secret key for signing JWT tokens — use a long random string |
| `MONGODB_URI` | **Yes** | — | MongoDB connection string |
| `FRONTEND_URL` | No | `http://localhost:3000` | Allowed CORS origin |

---

## API Reference

All endpoints except `/api/auth/register` and `/api/auth/login` require the header:
```
Authorization: Bearer <token>
```

### Auth
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Create a new account |
| POST | `/api/auth/login` | Sign in and get a JWT token |
| GET | `/api/auth/me` | Get current user profile and competency map |

### Interview
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/interview/question` | Stream the next question (SSE) |
| POST | `/api/interview/evaluate` | Evaluate an answer and get scores |
| POST | `/api/interview/save` | Save a completed session to MongoDB |
| GET | `/api/interview/models` | List available Ollama models |

### History
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/history/` | Paginated list of past sessions |
| GET | `/api/history/stats` | Aggregated stats, competency map, score progression |
| GET | `/api/history/{id}` | Full session with complete transcript |
| DELETE | `/api/history/{id}` | Delete a session |

### Upload
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/upload/resume` | Upload a PDF/DOC resume for question personalisation |

---

## Supported Models

Any model available in Ollama works. Recommended options:

| Model | Size | Best for |
|---|---|---|
| `llama3` | 4.7 GB | General use — good balance of quality and speed |
| `mistral` | 4.1 GB | Fast responses, good instruction following |
| `gemma2` | 5.4 GB | Strong reasoning and structured output |
| `llama3.1` | 4.9 GB | Better reasoning than llama3 |
| `phi3` | 2.3 GB | Low-RAM machines, still capable |
| `deepseek-r1` | varies | Excellent for technical topics |

Switch models by changing `OLLAMA_MODEL` in your `.env` file and restarting the backend.

---

## Project Structure
```
adaptive-ai-interviewer/
├── frontend/
│   ├── src/
│   │   ├── App.jsx                   # Router: auth → dashboard → interview
│   │   ├── AuthContext.jsx           # JWT token management (shared state)
│   │   ├── AuthScreen.jsx            # Login and register UI
│   │   ├── AdaptiveInterviewer.jsx   # Main interview UI
│   │   └── HistoryDashboard.jsx      # Past sessions, stats, transcript viewer
│   ├── vite.config.js                # Proxies /api to backend on port 8000
│   └── package.json
│
└── backend/
    ├── main.py                       # FastAPI app, MongoDB connection, startup
    ├── requirements.txt
    ├── middleware/
    │   └── auth.py                   # JWT creation/verification, bcrypt, dependency
    ├── models/
    │   └── schemas.py                # All Pydantic request/response models
    └── routes/
        ├── auth.py                   # /register /login /me
        ├── interview.py              # /question (SSE) /evaluate /save /models
        ├── history.py                # Session CRUD and stats aggregation
        └── upload.py                 # PDF/DOCX text extraction
```

---

## Deployment

### Vercel (frontend) + Railway (backend)

**Backend on Railway:**
1. Connect your GitHub repo to [Railway](https://railway.app)
2. Set root directory to `backend`
3. Add environment variables in the Railway dashboard
4. Note your Railway URL (e.g. `https://your-app.up.railway.app`)

> Note: Railway does not run Ollama. For production, you will need a server with a GPU or use a hosted Ollama provider. Alternatively, swap `routes/interview.py` back to the Anthropic version for cloud deployment.

**Frontend on Vercel:**
1. Connect your repo to [Vercel](https://vercel.com)
2. Set root directory to `frontend`
3. Add environment variable: `VITE_API_URL=https://your-backend.up.railway.app/api`

### Self-hosted with Docker Compose
```yaml
version: "3.9"
services:
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    environment:
      - OLLAMA_BASE_URL=http://host.docker.internal:11434
      - OLLAMA_MODEL=llama3
      - JWT_SECRET=${JWT_SECRET}
      - MONGODB_URI=${MONGODB_URI}
    extra_hosts:
      - "host.docker.internal:host-gateway"

  frontend:
    build: ./frontend
    ports:
      - "3000:80"
    depends_on:
      - backend
```

---

## Troubleshooting

| Problem | Solution |
|---|---|
| `Cannot connect to Ollama` | Run `ollama serve` in a terminal. Make sure it shows `Listening on 127.0.0.1:11434`. |
| Model not found | Run `ollama pull llama3` (or whichever model is in your `.env`). |
| Slow responses | Local LLMs are slower than cloud APIs. Use `phi3` or `mistral` for faster output on lower-end hardware. |
| Evaluation returns default scores | The model may not be following the JSON format. Try `mistral` or `gemma2` which handle structured output better. |
| MongoDB connection refused | Check Atlas IP whitelist — add `0.0.0.0/0` for development. Verify your connection string has the correct password. |
| `401 Unauthorized` on all requests | Your JWT token has expired (30-day limit). Log out and sign in again. |
| PDF upload returns no text | The file may be scanned/image-based. Use a text-based PDF. |
| Speech recognition not working | Requires Chrome or Edge. Click the padlock in the address bar and allow microphone access. |
| Port 8000 already in use | Run `lsof -ti:8000 \| xargs kill` or change the port in your `uvicorn` command. |

---

## Contributing

Contributions are welcome. Please open an issue first to discuss what you would like to change.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes (`git commit -m 'Add your feature'`)
4. Push to the branch (`git push origin feature/your-feature`)
5. Open a Pull Request

---

<!-- ## License

MIT License — see [LICENSE](LICENSE) for details.

--- -->

## Acknowledgements

- [Ollama](https://ollama.com) — for making local LLMs accessible
- [FastAPI](https://fastapi.tiangolo.com) — async Python web framework
- [Recharts](https://recharts.org) — composable charting library for React
- [MongoDB Atlas](https://www.mongodb.com/atlas) — managed database hosting