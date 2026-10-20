from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_current_user
from ..models import Tenant, User
from ..schemas import RegisterRequest, TokenResponse, UserOut
from ..security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=409, detail="Email already registered")

    tenant = Tenant(name=body.tenant_name, tier=body.tier)
    db.add(tenant)
    db.flush()  # assigns tenant.id

    user = User(tenant_id=tenant.id, email=body.email, hashed_password=hash_password(body.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    db.refresh(tenant)

    token = create_access_token(subject=user.id)
    return TokenResponse(access_token=token, tenant=tenant)


@router.post("/login", response_model=TokenResponse)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == form.username).first()
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    token = create_access_token(subject=user.id)
    return TokenResponse(access_token=token, tenant=user.tenant)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user
