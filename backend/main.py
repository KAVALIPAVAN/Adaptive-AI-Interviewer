"""
Adaptive AI Interviewer — Python FastAPI Backend (Ollama version)
Entry point: uvicorn main:app --reload --port 8000
"""
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import motor.motor_asyncio
import os


from routes.auth      import router as auth_router
from routes.interview import router as interview_router
from routes.upload    import router as upload_router
from routes.history   import router as history_router



MONGO_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
client    = motor.motor_asyncio.AsyncIOMotorClient(MONGO_URI)
db        = client["ai_interviewer"]

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.db = db

    ollama_url   = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    ollama_model = os.getenv("OLLAMA_MODEL",    "llama3")

    print(f"\n  AI Interviewer Backend (Ollama mode)")
    print(f"    Ollama URL  : {ollama_url}")
    print(f"    Model       : {ollama_model}")
    print(f"    MongoDB     : {'set' if os.getenv('MONGODB_URI') else 'using localhost'}")
    print(f"    JWT secret  : {'set' if os.getenv('JWT_SECRET') else 'WARNING: using default - change this!'}\n")

    await db["users"].create_index("email", unique=True)
    await db["interviews"].create_index([("user_id", 1), ("created_at", -1)])

    yield
    client.close()


app = FastAPI(title="Adaptive AI Interviewer API (Ollama)", version="3.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_URL", "http://localhost:3000")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router,      prefix="/api/auth",     tags=["auth"])
app.include_router(interview_router, prefix="/api/interview", tags=["interview"])
app.include_router(upload_router,    prefix="/api/upload",    tags=["upload"])
app.include_router(history_router,   prefix="/api/history",   tags=["history"])

@app.get("/api/health")
async def health():
    return {
        "status":       "ok",
        "mode":         "ollama",
        "ollama_url":   os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
        "model":        os.getenv("OLLAMA_MODEL", "llama3"),
        "mongodb":      MONGO_URI != "mongodb://localhost:27017"
    }
