"""
JWT Auth Middleware
- Creates and verifies JWT tokens
- FastAPI dependency: get_current_user
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from passlib.context import CryptContext
from datetime import datetime, timedelta
import os
from typing import Optional

SECRET_KEY  = os.getenv("JWT_SECRET", "change-this-secret-in-production-please")
ALGORITHM   = "HS256"
TOKEN_EXPIRE_DAYS = 30

pwd_ctx  = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer   = HTTPBearer()

# ── Password helpers ─────────────────────────────────────────

def hash_password(plain: str) -> str:
    return pwd_ctx.hash(plain[:72])

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_ctx.verify(plain, hashed)

# ── Token helpers ────────────────────────────────────────────

def create_access_token(user_id: str, email: str, name: str) -> str:
    expire = datetime.utcnow() + timedelta(days=TOKEN_EXPIRE_DAYS)
    payload = {
        "sub":   user_id,
        "email": email,
        "name":  name,
        "exp":   expire,
        "iat":   datetime.utcnow(),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None

# ── FastAPI dependency ───────────────────────────────────────

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer)
) -> dict:
    """
    Inject this into any route that requires authentication:
        current_user: dict = Depends(get_current_user)

    Returns the decoded JWT payload dict with keys: sub, email, name
    """
    token   = credentials.credentials
    payload = decode_token(token)

    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return {
        "user_id": payload["sub"],
        "email":   payload["email"],
        "name":    payload["name"],
    }
