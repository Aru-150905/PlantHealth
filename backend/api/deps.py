from __future__ import annotations

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from .db import get_db
from .models import Tenant, User
from .security import decode_access_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_access_token(token)
        user_id = payload.get("sub")
    except jwt.PyJWTError:
        raise credentials_error
    if user_id is None:
        raise credentials_error
    user = db.get(User, user_id)
    if user is None:
        raise credentials_error
    return user


def get_current_tenant(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Tenant:
    tenant = db.get(Tenant, user.tenant_id)
    if tenant is None:
        raise HTTPException(status_code=404, detail="Tenant not found")
    if tenant.suspended:
        raise HTTPException(status_code=403, detail="This tenant has been suspended by an administrator")
    return tenant


def require_admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user
