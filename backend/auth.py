
import hashlib
import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr, Field
from pwdlib import PasswordHash

from database import get_db_cursor


router = APIRouter(prefix="/api/auth", tags=["Authentication"])

password_hasher = PasswordHash.recommended()
bearer_scheme = HTTPBearer(auto_error=False)

SESSION_HOURS = 12


# ---------- Request models ----------

class StudentRegister(BaseModel):
    full_name: str = Field(min_length=2, max_length=150)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    branch: str = Field(min_length=1, max_length=100)
    graduation_year: int = Field(ge=2020, le=2100)


class RecruiterRegister(BaseModel):
    company_name: str = Field(min_length=2, max_length=200)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    industry: str | None = Field(default=None, max_length=100)
    location: str | None = Field(default=None, max_length=200)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


# ---------- Helpers ----------

def normalize_email(email: str) -> str:
    return email.strip().lower()


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return password_hasher.verify(password, password_hash)
    except Exception:
        return False


def create_session(cursor, user_id: int) -> str:
    # The raw token is returned only to the client.
    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode()).hexdigest()

    cursor.execute(
        """
        INSERT INTO CS_SESSIONS
            (USER_ID, TOKEN_HASH, EXPIRES_AT)
        VALUES (
            :user_id,
            :token_hash,
            SYSTIMESTAMP + NUMTODSINTERVAL(:hours, 'HOUR')
        )
        """,
        {
            "user_id": user_id,
            "token_hash": token_hash,
            "hours": SESSION_HOURS,
        },
    )

    return token


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(
        bearer_scheme
    ),
):
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token_hash = hashlib.sha256(
        credentials.credentials.encode()
    ).hexdigest()

    with get_db_cursor() as cursor:
        cursor.execute(
            """
            SELECT u.USER_ID, u.EMAIL, u.ROLE, u.ACCOUNT_STATUS
            FROM CS_USERS u
            JOIN CS_SESSIONS s ON s.USER_ID = u.USER_ID
            WHERE s.TOKEN_HASH = :token_hash
              AND s.REVOKED_AT IS NULL
              AND s.EXPIRES_AT > SYSTIMESTAMP
              AND u.ACCOUNT_STATUS = 'ACTIVE'
            """,
            {"token_hash": token_hash},
        )
        row = cursor.fetchone()

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired, revoked, or invalid",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return {
        "user_id": row[0],
        "email": row[1],
        "role": row[2],
        "account_status": row[3],
    }


def require_role(*allowed_roles: str):
    def role_dependency(user=Depends(get_current_user)):
        if user["role"] not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action",
            )
        return user

    return role_dependency


# ---------- Student registration ----------

@router.post("/register/student", status_code=201)
def register_student(payload: StudentRegister):
    email = normalize_email(str(payload.email))
    password_hash = hash_password(payload.password)

    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT USER_ID FROM CS_USERS WHERE LOWER(EMAIL) = :email",
            {"email": email},
        )
        if cursor.fetchone():
            raise HTTPException(409, "An account with this email already exists")

        user_id_var = cursor.var(int)

        cursor.execute(
            """
            INSERT INTO CS_USERS
                (EMAIL, PASSWORD_HASH, ROLE, ACCOUNT_STATUS,
                 EMAIL_VERIFIED)
            VALUES
                (:email, :password_hash, 'STUDENT', 'ACTIVE', 0)
            RETURNING USER_ID INTO :user_id
            """,
            {
                "email": email,
                "password_hash": password_hash,
                "user_id": user_id_var,
            },
        )

        user_id = int(user_id_var.getvalue()[0])

        cursor.execute(
            """
            INSERT INTO CS_STUDENTS
                (USER_ID, FULL_NAME, EMAIL, BRANCH, GRADUATION_YEAR)
            VALUES
                (:user_id, :full_name, :email, :branch, :graduation_year)
            """,
            {
                "user_id": user_id,
                "full_name": payload.full_name.strip(),
                "email": email,
                "branch": payload.branch.strip(),
                "graduation_year": payload.graduation_year,
            },
        )

    return {
        "message": "Student account created",
        "user_id": user_id,
        "email": email,
        "role": "STUDENT",
    }


# ---------- Recruiter registration ----------

@router.post("/register/recruiter", status_code=201)
def register_recruiter(payload: RecruiterRegister):
    email = normalize_email(str(payload.email))
    password_hash = hash_password(payload.password)

    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT USER_ID FROM CS_USERS WHERE LOWER(EMAIL) = :email",
            {"email": email},
        )
        if cursor.fetchone():
            raise HTTPException(409, "An account with this email already exists")

        user_id_var = cursor.var(int)

        cursor.execute(
            """
            INSERT INTO CS_USERS
                (EMAIL, PASSWORD_HASH, ROLE, ACCOUNT_STATUS,
                 EMAIL_VERIFIED)
            VALUES
                (:email, :password_hash, 'RECRUITER', 'ACTIVE', 0)
            RETURNING USER_ID INTO :user_id
            """,
            {
                "email": email,
                "password_hash": password_hash,
                "user_id": user_id_var,
            },
        )

        user_id = int(user_id_var.getvalue()[0])

        cursor.execute(
            """
            INSERT INTO CS_COMPANIES
                (USER_ID, COMPANY_NAME, EMAIL, INDUSTRY, LOCATION)
            VALUES
                (:user_id, :company_name, :email, :industry, :location)
            """,
            {
                "user_id": user_id,
                "company_name": payload.company_name.strip(),
                "email": email,
                "industry": payload.industry,
                "location": payload.location,
            },
        )

    return {
        "message": "Recruiter account created",
        "user_id": user_id,
        "email": email,
        "role": "RECRUITER",
    }


# ---------- Login ----------

@router.post("/login")
def login(payload: LoginRequest):
    email = normalize_email(str(payload.email))

    with get_db_cursor() as cursor:
        cursor.execute(
            """
            SELECT USER_ID, EMAIL, PASSWORD_HASH, ROLE, ACCOUNT_STATUS
            FROM CS_USERS
            WHERE LOWER(EMAIL) = :email
            """,
            {"email": email},
        )
        row = cursor.fetchone()

        # Use the same error for an unknown email and a wrong password.
        if row is None or not verify_password(payload.password, row[2]):
            raise HTTPException(
                status_code=401,
                detail="Invalid email or password",
                headers={"WWW-Authenticate": "Bearer"},
            )

        if row[4] != "ACTIVE":
            raise HTTPException(
                status_code=403,
                detail="This account is not active",
            )

        token = create_session(cursor, int(row[0]))

    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in": SESSION_HOURS * 60 * 60,
        "user": {
            "user_id": row[0],
            "email": row[1],
            "role": row[3],
        },
    }


# ---------- Current logged-in user ----------

@router.get("/me")
def read_current_user(user=Depends(get_current_user)):
    return {"user": user}


# ---------- Logout ----------

@router.post("/logout")
def logout(
    credentials: HTTPAuthorizationCredentials | None = Depends(
        bearer_scheme
    ),
):
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Not authenticated")

    token_hash = hashlib.sha256(
        credentials.credentials.encode()
    ).hexdigest()

    with get_db_cursor() as cursor:
        cursor.execute(
            """
            UPDATE CS_SESSIONS
            SET REVOKED_AT = SYSTIMESTAMP
            WHERE TOKEN_HASH = :token_hash
              AND REVOKED_AT IS NULL
            """,
            {"token_hash": token_hash},
        )

        if cursor.rowcount == 0:
            raise HTTPException(
                status_code=401,
                detail="Session is invalid or already logged out",
            )

    return {"message": "Logged out successfully"}
