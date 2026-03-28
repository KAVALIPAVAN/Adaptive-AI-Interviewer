"""
Pydantic schemas — shared data models across routes
"""

from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Dict, Any
from datetime import datetime


# ── Auth ────────────────────────────────────────────────────

class UserRegister(BaseModel):
    name: str = Field(..., min_length=2, max_length=80)
    email: EmailStr
    password: str = Field(..., min_length=6)

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserOut(BaseModel):
    id: str
    name: str
    email: str
    created_at: datetime

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ── Interview ────────────────────────────────────────────────

class QuestionRequest(BaseModel):
    messages: List[Dict[str, str]]
    competency_map: Dict[str, float] = {}
    resume_context: str = ""
    mode: str = "Technical"
    session_id: Optional[str] = None  # tracks current interview session

class EvaluateRequest(BaseModel):
    question: str
    answer: str
    mode: str = "Technical"
    competency_map: Dict[str, float] = {}

class EvaluationScores(BaseModel):
    technical_accuracy: float
    communication_clarity: float
    depth_of_experience: float

class EvaluationResponse(BaseModel):
    scores: EvaluationScores
    overall_score: float
    strengths: List[str]
    gaps: List[str]
    suggested_better: str
    topics_covered: List[str]
    filler_word_count: int
    competency_updates: Dict[str, float]

class SaveSessionRequest(BaseModel):
    session_id: Optional[str] = None
    mode: str
    transcript: List[Dict[str, Any]]
    competency_map: Dict[str, float]
    topics_covered: List[str]
    overall_score: Optional[float]
    duration: int  # seconds
    resume_used: bool = False


# ── History ─────────────────────────────────────────────────

class TurnRecord(BaseModel):
    question: str
    answer: str
    scores: Optional[Dict[str, float]]
    overall_score: Optional[float]
    strengths: List[str] = []
    gaps: List[str] = []
    suggested_better: Optional[str]
    topics_covered: List[str] = []
    filler_word_count: int = 0
    timestamp: datetime

class InterviewRecord(BaseModel):
    id: str
    user_id: str
    mode: str
    transcript: List[TurnRecord]
    competency_map: Dict[str, float]
    topics_covered: List[str]
    overall_score: Optional[float]
    duration: int
    resume_used: bool
    created_at: datetime

class InterviewSummary(BaseModel):
    id: str
    mode: str
    overall_score: Optional[float]
    duration: int
    question_count: int
    topics_covered: List[str]
    created_at: datetime
