"""
Auth Routes
POST /api/auth/register  — create new account
POST /api/auth/login     — get JWT token
GET  /api/auth/me        — get current user profile
"""

from fastapi import APIRouter, HTTPException, status, Request, Depends
from datetime import datetime
import bson

from models.schemas import UserRegister, UserLogin, TokenResponse, UserOut
from middleware.auth import hash_password, verify_password, create_access_token, get_current_user

router = APIRouter()

def get_db(request: Request):
    return request.app.state.db


# ── Register ─────────────────────────────────────────────────

@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(body: UserRegister, request: Request):
    db = get_db(request)

    # Check if email already exists
    existing = await db["users"].find_one({"email": body.email.lower()})
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists."
        )

    # Create user document
    user_doc = {
        "_id":         bson.ObjectId(),
        "name":        body.name.strip(),
        "email":       body.email.lower(),
        "password":    hash_password(body.password),
        "created_at":  datetime.utcnow(),
        "competency_map": {},      # persistent across all interviews
        "total_interviews": 0,
        "avg_score": None,
    }

    await db["users"].insert_one(user_doc)

    user_id = str(user_doc["_id"])
    token   = create_access_token(user_id, body.email.lower(), body.name.strip())

    return TokenResponse(
        access_token=token,
        user=UserOut(
            id=user_id,
            name=user_doc["name"],
            email=user_doc["email"],
            created_at=user_doc["created_at"],
        )
    )


# ── Login ────────────────────────────────────────────────────

@router.post("/login", response_model=TokenResponse)
async def login(body: UserLogin, request: Request):
    db = get_db(request)

    user = await db["users"].find_one({"email": body.email.lower()})
    if not user or not verify_password(body.password, user["password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password."
        )

    user_id = str(user["_id"])
    token   = create_access_token(user_id, user["email"], user["name"])

    return TokenResponse(
        access_token=token,
        user=UserOut(
            id=user_id,
            name=user["name"],
            email=user["email"],
            created_at=user["created_at"],
        )
    )


# ── Me ───────────────────────────────────────────────────────

@router.get("/me")
async def get_me(request: Request, current_user: dict = Depends(get_current_user)):
    db   = get_db(request)
    user = await db["users"].find_one({"_id": bson.ObjectId(current_user["user_id"])})

    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    return {
        "id":               str(user["_id"]),
        "name":             user["name"],
        "email":            user["email"],
        "created_at":       user["created_at"],
        "total_interviews": user.get("total_interviews", 0),
        "avg_score":        user.get("avg_score"),
        "competency_map":   user.get("competency_map", {}),
    }


# ── Update profile ───────────────────────────────────────────

@router.patch("/me")
async def update_profile(
    body: dict,
    request: Request,
    current_user: dict = Depends(get_current_user)
):
    db      = get_db(request)
    allowed = {}

    if "name" in body and isinstance(body["name"], str):
        allowed["name"] = body["name"].strip()

    if not allowed:
        raise HTTPException(status_code=400, detail="Nothing to update.")

    await db["users"].update_one(
        {"_id": bson.ObjectId(current_user["user_id"])},
        {"$set": allowed}
    )
    return {"message": "Profile updated."}
