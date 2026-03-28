"""
Interview Routes — Ollama version
All Anthropic SDK calls replaced with httpx calls to the local Ollama REST API.

Ollama API used:
  POST http://localhost:11434/api/chat   — streaming + non-streaming chat
  GET  http://localhost:11434/api/tags   — list available models

Ollama chat API format:
  {
    "model": "llama3",
    "messages": [{"role": "system", "content": "..."}, ...],
    "stream": true
  }

Each streamed chunk is a newline-delimited JSON object:
  {"model":"llama3","message":{"role":"assistant","content":"Hello"},"done":false}
"""

from fastapi import APIRouter, Depends, Request, HTTPException
from fastapi.responses import StreamingResponse
import httpx
import os
import json
import bson
from datetime import datetime
from typing import AsyncGenerator

from models.schemas import QuestionRequest, EvaluateRequest, SaveSessionRequest
from middleware.auth import get_current_user

router = APIRouter()

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL    = os.getenv("OLLAMA_MODEL",    "llama3")
OLLAMA_CHAT_URL = f"{OLLAMA_BASE_URL}/api/chat"
OLLAMA_TAGS_URL = f"{OLLAMA_BASE_URL}/api/tags"


def get_db(request: Request):
    return request.app.state.db


def build_system_prompt(mode: str, competency_map: dict, resume_context: str) -> str:
    map_str = "\n".join(
        f"  * {topic}: {score}/10" for topic, score in competency_map.items()
    ) or "  (none yet - building from scratch)"

    mode_instructions = {
        "Technical": """You are a senior software engineer conducting a rigorous TECHNICAL interview.

CHAIN-OF-THOUGHT PROCESS (run internally before each question):
1. Analyse the candidate last answer - was it correct, shallow, or wrong?
2. Check the competency map - which topics score below 6?
3. Decide: probe the gap deeper, follow up on a misconception, or advance to a harder concept
4. Ask exactly ONE focused, specific question

TOPIC PROGRESSION:
  Fundamentals (data structures, complexity) to Language-specific (closures, async, memory)
  to System Design (scalability, databases, caching) to Architecture patterns""",

        "Behavioral": """You are an experienced hiring manager conducting a BEHAVIORAL interview.

CHAIN-OF-THOUGHT PROCESS:
1. Parse the answer for STAR elements (Situation, Task, Action, Result)
2. If any element is missing, ask a targeted follow-up to extract it
3. Probe for ownership, leadership, conflict handling, failure and learning
4. Escalate from tell me about a time to situational hypotheticals""",

        "English": """You are a professional English communication coach.

CHAIN-OF-THOUGHT PROCESS:
1. Count filler words used (um, uh, like, you know, basically, literally)
2. Assess grammar errors and sentence structure
3. Note vocabulary choices - professional vs casual
4. Identify clarity issues"""
    }

    base = mode_instructions.get(mode, mode_instructions["Technical"])

    prompt = f"""{base}

CURRENT COMPETENCY MAP:
{map_str}

"""
    if resume_context:
        prompt += f"""CANDIDATE RESUME CONTEXT (personalise every question using this):
{resume_context}

"""

    prompt += """ABSOLUTE RULES:
- Ask EXACTLY ONE question per response. No compound questions.
- Maximum 2-3 sentences. No preambles. Never say "Great answer!".
- Never repeat a topic scoring 8 or above.
- If a topic scores 4 or below, ask 2-3 follow-up questions before moving on.
- For the very first message "Start the interview.", greet in one sentence then ask Q1.
- Be direct and professional."""

    return prompt


async def question_stream(
    messages: list,
    competency_map: dict,
    resume_context: str,
    mode: str
) -> AsyncGenerator[str, None]:
    system_prompt = build_system_prompt(mode, competency_map, resume_context)

    ollama_messages = [{"role": "system", "content": system_prompt}] + messages[-20:]

    payload = {
        "model":    OLLAMA_MODEL,
        "messages": ollama_messages,
        "stream":   True,
        "options":  {"temperature": 0.7, "num_predict": 512}
    }

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream("POST", OLLAMA_CHAT_URL, json=payload) as response:
                if response.status_code != 200:
                    error_body = await response.aread()
                    yield f"data: {json.dumps({'text': f'[Ollama error {response.status_code}: {error_body.decode()[:200]}]'})}\n\n"
                    yield "data: [DONE]\n\n"
                    return

                async for line in response.aiter_lines():
                    if not line.strip():
                        continue
                    try:
                        chunk = json.loads(line)
                        text  = chunk.get("message", {}).get("content", "")
                        if text:
                            yield f"data: {json.dumps({'text': text})}\n\n"
                        if chunk.get("done"):
                            break
                    except json.JSONDecodeError:
                        continue

        yield "data: [DONE]\n\n"

    except httpx.ConnectError:
        yield f"data: {json.dumps({'text': f'[Cannot connect to Ollama at {OLLAMA_BASE_URL}. Is Ollama running? Run: ollama serve]'})}\n\n"
        yield "data: [DONE]\n\n"
    except httpx.TimeoutException:
        yield f"data: {json.dumps({'text': '[Ollama timed out. The model may be loading - try again in a moment.]'})}\n\n"
        yield "data: [DONE]\n\n"
    except Exception as e:
        yield f"data: {json.dumps({'text': f'[Unexpected error: {str(e)}]'})}\n\n"
        yield "data: [DONE]\n\n"


@router.post("/question")
async def next_question(
    body: QuestionRequest,
    current_user: dict = Depends(get_current_user)
):
    return StreamingResponse(
        question_stream(
            body.messages,
            body.competency_map,
            body.resume_context,
            body.mode
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control":     "no-cache",
            "Connection":        "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


@router.post("/evaluate")
async def evaluate_answer(
    body: EvaluateRequest,
    current_user: dict = Depends(get_current_user)
):
    prompt = f"""You are an expert interview evaluator. Evaluate this response carefully.

Mode: {body.mode}
Current competency map: {json.dumps(body.competency_map)}

Question asked: "{body.question}"
Candidate answer: "{body.answer}"

Respond ONLY with valid JSON. No markdown fences, no explanation, nothing else.
Use this exact structure:
{{
  "scores": {{
    "technicalAccuracy": <integer 0-10>,
    "communicationClarity": <integer 0-10>,
    "depthOfExperience": <integer 0-10>
  }},
  "overallScore": <float one decimal>,
  "strengths": ["string"],
  "gaps": ["string"],
  "suggestedBetter": "2-3 sentence model answer",
  "topicsCovered": ["string"],
  "fillerWordCount": <integer>,
  "competencyUpdates": {{"topic name": <integer 0-10>}}
}}"""

    payload = {
        "model":    OLLAMA_MODEL,
        "messages": [
            {"role": "system", "content": "You output only valid JSON. No markdown, no explanation, no extra text."},
            {"role": "user",   "content": prompt}
        ],
        "stream":  False,
        "options": {"temperature": 0.1, "num_predict": 900}
    }

    fallback = {
        "scores": {"technicalAccuracy": 5, "communicationClarity": 5, "depthOfExperience": 5},
        "overallScore": 5.0,
        "strengths": ["Attempted to answer the question"],
        "gaps": ["Could provide more specific examples"],
        "suggestedBetter": "A stronger answer includes concrete examples and measurable outcomes.",
        "topicsCovered": [body.mode],
        "fillerWordCount": 0,
        "competencyUpdates": {}
    }

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(OLLAMA_CHAT_URL, json=payload)

        if response.status_code != 200:
            return fallback

        data = response.json()
        raw  = data.get("message", {}).get("content", "").strip()

        # Strip accidental markdown fences
        if raw.startswith("```"):
            lines = raw.split("\n")
            raw = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

        # Extract JSON object boundaries
        start = raw.find("{")
        end   = raw.rfind("}") + 1
        if start != -1 and end > start:
            raw = raw[start:end]

        return json.loads(raw)

    except (json.JSONDecodeError, ValueError):
        return fallback
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail=f"Cannot connect to Ollama at {OLLAMA_BASE_URL}. Run: ollama serve")
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Ollama timed out during evaluation.")


@router.post("/save")
async def save_session(
    body: SaveSessionRequest,
    request: Request,
    current_user: dict = Depends(get_current_user)
):
    db      = get_db(request)
    user_id = current_user["user_id"]
    now     = datetime.utcnow()

    transcript_docs = []
    for i, turn in enumerate(body.transcript):
        transcript_docs.append({
            "turn_number":       i + 1,
            "question":          turn.get("q", ""),
            "answer":            turn.get("a", ""),
            "scores":            turn.get("eval", {}).get("scores"),
            "overall_score":     turn.get("eval", {}).get("overallScore"),
            "strengths":         turn.get("eval", {}).get("strengths", []),
            "gaps":              turn.get("eval", {}).get("gaps", []),
            "suggested_better":  turn.get("eval", {}).get("suggestedBetter"),
            "topics_covered":    turn.get("eval", {}).get("topicsCovered", []),
            "filler_word_count": turn.get("eval", {}).get("fillerWordCount", 0),
            "timestamp":         now,
        })

    all_gaps      = list({g for t in transcript_docs for g in t.get("gaps", [])})
    all_strengths = list({s for t in transcript_docs for s in t.get("strengths", [])})

    interview_doc = {
        "_id":                   bson.ObjectId(),
        "user_id":               user_id,
        "mode":                  body.mode,
        "transcript":            transcript_docs,
        "competency_map":        body.competency_map,
        "topics_covered":        body.topics_covered,
        "overall_score":         body.overall_score,
        "duration":              body.duration,
        "resume_used":           body.resume_used,
        "areas_for_improvement": all_gaps,
        "strengths":             all_strengths,
        "question_count":        len(transcript_docs),
        "model_used":            OLLAMA_MODEL,
        "created_at":            now,
        "completed_at":          now,
    }

    await db["interviews"].insert_one(interview_doc)

    user         = await db["users"].find_one({"_id": bson.ObjectId(user_id)})
    existing_map = user.get("competency_map", {}) if user else {}
    merged_map   = {**existing_map}

    for topic, score in body.competency_map.items():
        merged_map[topic] = round(
            (merged_map[topic] + score) / 2 if topic in merged_map else score, 1
        )

    current_total = user.get("total_interviews", 0) if user else 0
    current_avg   = user.get("avg_score") if user else None
    new_total     = current_total + 1
    new_avg = (
        body.overall_score if current_avg is None
        else round(((current_avg * current_total) + (body.overall_score or 0)) / new_total, 1)
    )

    await db["users"].update_one(
        {"_id": bson.ObjectId(user_id)},
        {"$set": {
            "competency_map":    merged_map,
            "total_interviews":  new_total,
            "avg_score":         new_avg,
            "last_interview_at": now,
        }}
    )

    return {
        "interview_id": str(interview_doc["_id"]),
        "message":      "Session saved successfully.",
        "model_used":   OLLAMA_MODEL,
        "stats":        {"total_interviews": new_total, "avg_score": new_avg}
    }


@router.get("/models")
async def list_models(current_user: dict = Depends(get_current_user)):
    """Lists all models currently pulled in Ollama."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(OLLAMA_TAGS_URL)
        if response.status_code != 200:
            return {"models": [], "current": OLLAMA_MODEL}
        data   = response.json()
        models = [m["name"] for m in data.get("models", [])]
        return {"models": models, "current": OLLAMA_MODEL}
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail=f"Cannot connect to Ollama at {OLLAMA_BASE_URL}")
