"""
Authentication & Role-Based Access Control (RBAC) Service.

Provides:
- Native bcrypt password hashing and verification
- PyJWT token issuance and decoding
- FastAPI dependency injection for current user & role enforcement
- WebSocket token validation & exam hall scoping
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Tuple
import bcrypt
import jwt
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models import User, UserRole

logger = logging.getLogger(__name__)
settings = get_settings()

security = HTTPBearer(auto_error=False)


# --- Password Hashing (Direct bcrypt, bypassing passlib version bugs) ---

def hash_password(password: str) -> str:
    """Hash a plaintext password using bcrypt with a generated salt."""
    pwd_bytes = password.encode("utf-8")[:72]
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(pwd_bytes, salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plaintext password against an existing bcrypt hash."""
    try:
        pwd_bytes = plain_password.encode("utf-8")[:72]
        hash_bytes = hashed_password.encode("utf-8")
        return bcrypt.checkpw(pwd_bytes, hash_bytes)
    except Exception as e:
        logger.warning(f"Password verification error: {e}")
        return False


# --- JWT Token Lifecycle ---

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Generate a signed JWT access token."""
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode.update({"exp": expire, "iat": now})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> Optional[dict]:
    """Decode and validate a JWT access token."""
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM]
        )
        return payload
    except jwt.ExpiredSignatureError:
        logger.debug("JWT token has expired")
        return None
    except jwt.InvalidTokenError as e:
        logger.debug(f"Invalid JWT token: {e}")
        return None


# --- FastAPI RBAC Dependencies ---

async def get_current_user(
    auth: Optional[HTTPAuthorizationCredentials] = Security(security),
    db: Session = Depends(get_db)
) -> User:
    """
    Extract and validate current authenticated user from Bearer token.
    Raises HTTP 401 if missing, expired, or invalid.
    """
    if auth is None or not auth.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials were not provided.",
            headers={"WWW-Authenticate": "Bearer"}
        )

    payload = decode_access_token(auth.credentials)
    if not payload or "sub" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token.",
            headers={"WWW-Authenticate": "Bearer"}
        )

    user_id = payload["sub"]
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user or not bool(user.is_active):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account is deactivated or not found.",
            headers={"WWW-Authenticate": "Bearer"}
        )

    return user


async def get_current_user_optional(
    auth: Optional[HTTPAuthorizationCredentials] = Security(security),
    db: Session = Depends(get_db)
) -> Optional[User]:
    """Extract user if valid Bearer token provided, otherwise return None."""
    if auth is None or not auth.credentials:
        return None

    payload = decode_access_token(auth.credentials)
    if not payload or "sub" not in payload:
        return None

    user_id = payload["sub"]
    user = db.query(User).filter(User.user_id == user_id).first()
    return user if (user and bool(user.is_active)) else None


def require_roles(*allowed_roles: UserRole):
    """
    Factory creating a FastAPI dependency that verifies the current user
    holds one of the specified roles.
    """
    async def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles:
            role_names = ", ".join([r.value for r in allowed_roles])
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Operation not permitted. Required role: {role_names} (current: {current_user.role.value})"
            )
        return current_user

    return role_checker


# Convenient role shortcuts
require_admin = require_roles(UserRole.ADMIN)
require_auditor_or_admin = require_roles(UserRole.ADMIN, UserRole.AUDITOR)
require_proctor = require_roles(UserRole.ADMIN, UserRole.PROCTOR)
require_any_authenticated = get_current_user


def check_exam_access(user: User, exam_id: str) -> bool:
    """
    Check if a user is permitted to monitor/access a specific exam hall.
    - Admins and Auditors have global visibility across all exams.
    - Proctors without assigned_exam_id have global visibility.
    - Proctors with assigned_exam_id are restricted to that exam.
    """
    if user.role in [UserRole.ADMIN, UserRole.AUDITOR]:
        return True
    assigned = getattr(user, "assigned_exam_id", None)
    if not assigned:
        return True
    return bool(assigned == exam_id)


def verify_ws_token(token: Optional[str], exam_id: str, db: Session) -> Tuple[bool, Optional[User], str]:
    """
    Verify WebSocket query token and validate exam room access.
    Returns (is_valid, user, reason).
    """
    # Allow 'demo' token for development/backward-compatibility
    if token == "demo" and settings.ENVIRONMENT == "development":
        return True, None, "demo_mode"

    if not token:
        return False, None, "Token missing"

    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        return False, None, "Invalid or expired token"

    user = db.query(User).filter(User.user_id == payload["sub"]).first()
    if not user or not bool(user.is_active):
        return False, None, "User inactive or not found"

    if not check_exam_access(user, exam_id):
        return False, user, f"User {user.username} is not assigned to exam {exam_id}"

    return True, user, "ok"
