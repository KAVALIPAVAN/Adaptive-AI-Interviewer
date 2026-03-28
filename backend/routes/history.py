"""
History Routes — all interview history for a logged-in user
GET  /api/history/             — paginated list of past interviews
GET  /api/history/:id          — full session with complete transcript
GET  /api/history/stats        — aggregated stats + competency map
DELETE /api/history/:id        — delete a session
"""

from fastapi import APIRouter, Depends, Request, HTTPException, Query
import bson
from datetime import datetime

from middleware.auth import get_current_user

router = APIRouter()

def get_db(request: Request):
    return request.app.state.db


# ── GET /api/history/ ─────────────────────────────────────────

@router.get("/")
async def list_interviews(
    request:      Request,
    current_user: dict = Depends(get_current_user),
    page:         int  = Query(1, ge=1),
    limit:        int  = Query(10, ge=1, le=50),
    mode:         str  = Query(None),    # filter by mode
):
    """
    Returns paginated list of past interview sessions.
    Each item is a summary (no full transcript) — fast to load.
    """
    db      = get_db(request)
    user_id = current_user["user_id"]

    query = {"user_id": user_id}
    if mode:
        query["mode"] = mode

    skip  = (page - 1) * limit
    total = await db["interviews"].count_documents(query)

    cursor = db["interviews"].find(
        query,
        {
            # Exclude the full transcript from list view for performance
            "transcript": 0
        }
    ).sort("created_at", -1).skip(skip).limit(limit)

    sessions = []
    async for doc in cursor:
        sessions.append({
            "id":             str(doc["_id"]),
            "mode":           doc.get("mode"),
            "overall_score":  doc.get("overall_score"),
            "duration":       doc.get("duration", 0),
            "question_count": doc.get("question_count", 0),
            "topics_covered": doc.get("topics_covered", []),
            "resume_used":    doc.get("resume_used", False),
            "created_at":     doc.get("created_at").isoformat() if doc.get("created_at") else None,
        })

    return {
        "sessions":    sessions,
        "total":       total,
        "page":        page,
        "limit":       limit,
        "total_pages": -(-total // limit),   # ceiling division
    }


# ── GET /api/history/stats ────────────────────────────────────

@router.get("/stats")
async def get_stats(
    request:      Request,
    current_user: dict = Depends(get_current_user),
):
    """
    Returns aggregated statistics for the logged-in user:
    - Total interviews, average score, best score
    - Per-mode breakdown
    - Cumulative competency map (merged across all sessions)
    - Score history (for progress chart on frontend)
    - Top areas for improvement
    """
    db      = get_db(request)
    user_id = current_user["user_id"]

    # Fetch user document (has cached competency map)
    user = await db["users"].find_one({"_id": bson.ObjectId(user_id)})

    # Aggregate stats from interviews collection
    pipeline = [
        {"$match": {"user_id": user_id}},
        {"$group": {
            "_id":        "$mode",
            "count":      {"$sum": 1},
            "avg_score":  {"$avg": "$overall_score"},
            "best_score": {"$max": "$overall_score"},
        }}
    ]
    mode_stats_cursor = db["interviews"].aggregate(pipeline)
    mode_stats = {}
    async for doc in mode_stats_cursor:
        mode_stats[doc["_id"]] = {
            "count":      doc["count"],
            "avg_score":  round(doc["avg_score"], 1) if doc["avg_score"] else None,
            "best_score": doc["best_score"],
        }

    # Score history (last 20 sessions, for charting)
    score_cursor = db["interviews"].find(
        {"user_id": user_id, "overall_score": {"$ne": None}},
        {"overall_score": 1, "mode": 1, "created_at": 1, "duration": 1}
    ).sort("created_at", 1).limit(20)

    score_history = []
    async for doc in score_cursor:
        score_history.append({
            "date":  doc["created_at"].isoformat(),
            "score": doc["overall_score"],
            "mode":  doc["mode"],
        })

    # Top improvement areas (from last 5 sessions)
    improvement_cursor = db["interviews"].find(
        {"user_id": user_id},
        {"areas_for_improvement": 1}
    ).sort("created_at", -1).limit(5)

    all_gaps = []
    async for doc in improvement_cursor:
        all_gaps.extend(doc.get("areas_for_improvement", []))

    # Count frequency of each gap
    gap_counts = {}
    for g in all_gaps:
        gap_counts[g] = gap_counts.get(g, 0) + 1
    top_gaps = sorted(gap_counts.items(), key=lambda x: -x[1])[:8]

    return {
        "user": {
            "name":             user["name"] if user else "",
            "total_interviews": user.get("total_interviews", 0) if user else 0,
            "avg_score":        user.get("avg_score") if user else None,
        },
        "competency_map":  user.get("competency_map", {}) if user else {},
        "mode_breakdown":  mode_stats,
        "score_history":   score_history,
        "top_gaps":        [{"area": g, "count": c} for g, c in top_gaps],
    }


# ── GET /api/history/:id ──────────────────────────────────────

@router.get("/{interview_id}")
async def get_interview(
    interview_id: str,
    request:      Request,
    current_user: dict = Depends(get_current_user),
):
    """
    Returns the FULL interview session including complete transcript,
    every Q&A, scores, and suggested better answers.
    Only accessible by the owner.
    """
    db      = get_db(request)
    user_id = current_user["user_id"]

    try:
        oid = bson.ObjectId(interview_id)
    except bson.errors.InvalidId:
        raise HTTPException(status_code=400, detail="Invalid interview ID.")

    doc = await db["interviews"].find_one({"_id": oid, "user_id": user_id})
    if not doc:
        raise HTTPException(
            status_code=404,
            detail="Interview not found or you don't have access to it."
        )

    # Serialize transcript
    transcript = []
    for turn in doc.get("transcript", []):
        transcript.append({
            "turn_number":      turn.get("turn_number"),
            "question":         turn.get("question", ""),
            "answer":           turn.get("answer", ""),
            "scores":           turn.get("scores"),
            "overall_score":    turn.get("overall_score"),
            "strengths":        turn.get("strengths", []),
            "gaps":             turn.get("gaps", []),
            "suggested_better": turn.get("suggested_better"),
            "topics_covered":   turn.get("topics_covered", []),
            "filler_word_count":turn.get("filler_word_count", 0),
            "timestamp":        turn["timestamp"].isoformat() if turn.get("timestamp") else None,
        })

    return {
        "id":              str(doc["_id"]),
        "user_id":         doc["user_id"],
        "mode":            doc.get("mode"),
        "transcript":      transcript,
        "competency_map":  doc.get("competency_map", {}),
        "topics_covered":  doc.get("topics_covered", []),
        "overall_score":   doc.get("overall_score"),
        "duration":        doc.get("duration", 0),
        "question_count":  doc.get("question_count", 0),
        "resume_used":     doc.get("resume_used", False),
        "areas_for_improvement": doc.get("areas_for_improvement", []),
        "strengths":       doc.get("strengths", []),
        "created_at":      doc["created_at"].isoformat() if doc.get("created_at") else None,
        "completed_at":    doc["completed_at"].isoformat() if doc.get("completed_at") else None,
    }


# ── DELETE /api/history/:id ───────────────────────────────────

@router.delete("/{interview_id}")
async def delete_interview(
    interview_id: str,
    request:      Request,
    current_user: dict = Depends(get_current_user),
):
    """Deletes a session. Only the owner can delete their own sessions."""
    db      = get_db(request)
    user_id = current_user["user_id"]

    try:
        oid = bson.ObjectId(interview_id)
    except bson.errors.InvalidId:
        raise HTTPException(status_code=400, detail="Invalid interview ID.")

    result = await db["interviews"].delete_one({"_id": oid, "user_id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Interview not found.")

    # Recalculate user stats after deletion
    pipeline = [
        {"$match": {"user_id": user_id, "overall_score": {"$ne": None}}},
        {"$group": {
            "_id":       None,
            "count":     {"$sum": 1},
            "avg_score": {"$avg": "$overall_score"},
        }}
    ]
    stats_cursor = db["interviews"].aggregate(pipeline)
    stats_list   = [doc async for doc in stats_cursor]
    stats        = stats_list[0] if stats_list else {"count": 0, "avg_score": None}

    await db["users"].update_one(
        {"_id": bson.ObjectId(user_id)},
        {"$set": {
            "total_interviews": stats["count"],
            "avg_score": round(stats["avg_score"], 1) if stats["avg_score"] else None,
        }}
    )

    return {"message": "Interview deleted.", "deleted_id": interview_id}
