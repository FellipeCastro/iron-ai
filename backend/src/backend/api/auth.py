from collections.abc import Iterator
from functools import lru_cache

import jwt
from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from backend.config import settings
from backend.models.db import User
from backend.services.users import get_or_create_user
from backend.utils.database import SessionLocal


@lru_cache
def _jwks_client() -> jwt.PyJWKClient:
    return jwt.PyJWKClient(f"{settings.clerk_issuer}/.well-known/jwks.json", cache_keys=True)


def verify_clerk_token(token: str) -> dict:
    """Valida a assinatura (JWKS do Clerk), o emissor e a expiração do JWT de sessão."""
    if not settings.clerk_issuer:
        raise HTTPException(status_code=500, detail="Clerk não configurado")
    try:
        key = _jwks_client().get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            key.key,
            algorithms=["RS256"],
            issuer=settings.clerk_issuer,
            options={"require": ["exp", "iat", "sub"], "verify_aud": False},
            leeway=10,
        )
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Token inválido") from None


def get_db() -> Iterator[Session]:
    with SessionLocal.begin() as session:
        yield session


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="Não autenticado")
    claims = verify_clerk_token(token)
    return get_or_create_user(db, claims["sub"])
