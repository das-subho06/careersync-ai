
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from fastapi import FastAPI, HTTPException, Query, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, EmailStr, Field

from database import get_connection, get_db_cursor
from auth import router as auth_router, get_current_user

# =========================================================
# APPLICATION SETUP
# =========================================================

BASE_DIR = Path(__file__).resolve().parent.parent
MODEL_PATH = BASE_DIR / "ml" / "artifacts" / "placement_model.joblib"

if not MODEL_PATH.exists():
    raise RuntimeError(
        f"Model not found: {MODEL_PATH}. Train it first."
    )

model = joblib.load(MODEL_PATH)

app = FastAPI(
    title="CareerSync AI API",
    description="Campus placement and job recommendation platform",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8081",
        "http://127.0.0.1:8081",
        "http://localhost:19006",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)


# =========================================================
# REQUEST MODELS
# =========================================================

class StudentCreate(BaseModel):
    full_name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    branch: str | None = Field(default=None, max_length=100)
    graduation_year: int | None = Field(default=None, ge=2020, le=2100)
    cgpa: float | None = Field(default=None, ge=0, le=10)
    ssc_marks: float | None = Field(default=None, ge=0, le=100)
    hsc_marks: float | None = Field(default=None, ge=0, le=100)
    internships: int = Field(default=0, ge=0)
    projects: int = Field(default=0, ge=0)
    workshops_certifications: int = Field(default=0, ge=0)
    aptitude_test_score: float | None = Field(default=None, ge=0, le=100)
    soft_skills_rating: float | None = Field(default=None, ge=0, le=5)
    extracurricular_activities: str | None = None
    placement_training: str | None = None


class CompanyCreate(BaseModel):
    company_name: str = Field(min_length=1, max_length=150)
    email: EmailStr
    industry: str | None = Field(default=None, max_length=100)
    location: str | None = Field(default=None, max_length=150)


class JobCreate(BaseModel):
    company_id: int = Field(gt=0)
    job_title: str = Field(min_length=1, max_length=150)
    job_description: str | None = None
    job_type: str | None = Field(default=None, max_length=30)
    min_cgpa: float | None = Field(default=None, ge=0, le=10)
    max_backlogs: int = Field(default=0, ge=0)
    salary_lpa: float | None = Field(default=None, ge=0)
    location: str | None = Field(default=None, max_length=150)
    graduation_year: int | None = Field(default=None, ge=2020, le=2100)
    deadline: str | None = None
    job_status: str = "OPEN"


class ApplicationCreate(BaseModel):
    student_id: int = Field(gt=0)
    job_id: int = Field(gt=0)


class ApplicationStatusUpdate(BaseModel):
    application_status: str


class StudentFeatures(BaseModel):
    cgpa: float | None = Field(default=None, ge=0, le=10)
    internships: int = Field(default=0, ge=0)
    projects: int = Field(default=0, ge=0)
    workshops_certifications: int = Field(default=0, ge=0)
    ssc_marks: float | None = Field(default=None, ge=0, le=100)
    hsc_marks: float | None = Field(default=None, ge=0, le=100)
    extracurricular_activities: str | None = None
    placement_training: str | None = None


# =========================================================
# HELPERS
# =========================================================

def db_error(exc):
    """Return a generic database error without leaking credentials."""
    import traceback

    print("Database error:", str(exc))
    traceback.print_exc()
    raise HTTPException(
        status_code=500,
        detail="A database operation failed. Check the backend terminal.",
    )


def normalize_yes_no(value, field_name):
    if value is None:
        return None

    normalized = value.strip().lower()

    if normalized not in {"yes", "no"}:
        raise HTTPException(
            status_code=422,
            detail=f"{field_name} must be Yes or No.",
        )

    return normalized.title()

class StudentProfileUpdate(BaseModel):
    cgpa: float | None = Field(default=None, ge=0, le=10)
    ssc_marks: float | None = Field(default=None, ge=0, le=100)
    hsc_marks: float | None = Field(default=None, ge=0, le=100)
    internships: int | None = Field(default=None, ge=0)
    projects: int | None = Field(default=None, ge=0)
    workshops_certifications: int | None = Field(default=None, ge=0)
    aptitude_test_score: float | None = Field(default=None, ge=0, le=100)
    soft_skills_rating: float | None = Field(default=None, ge=0, le=5)
    extracurricular_activities: str | None = None
    placement_training: str | None = None


class StudentSkillSet(BaseModel):
    skill_name: str = Field(min_length=1, max_length=80)
    level: int = Field(default=3, ge=1, le=5)


class JobSkillSet(BaseModel):
    skill_name: str = Field(min_length=1, max_length=80)
    required_level: int = Field(default=3, ge=1, le=5)
    importance: int = Field(default=50, ge=1, le=100)


def get_or_create_skill_id(cursor, skill_name):
    name = skill_name.strip()
    cursor.execute(
        "SELECT SKILL_ID FROM CS_SKILLS WHERE LOWER(SKILL_NAME) = LOWER(:name)",
        {"name": name},
    )
    row = cursor.fetchone()
    if row:
        return row[0]

    new_id = cursor.var(int)
    cursor.execute(
        """
        INSERT INTO CS_SKILLS (SKILL_NAME) VALUES (:name)
        RETURNING SKILL_ID INTO :new_id
        """,
        {"name": name, "new_id": new_id},
    )
    return new_id.getvalue()[0]


def current_student_id(cursor, user):
    if user["role"] != "STUDENT":
        raise HTTPException(status_code=403, detail="Students only.")

    cursor.execute(
        "SELECT STUDENT_ID FROM CS_STUDENTS WHERE USER_ID = :owner_id",
        {"owner_id": user["user_id"]},
    )
    row = cursor.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Student profile not found.")
    return row[0]

def predict_features(student: StudentFeatures):
    row = pd.DataFrame([{
        "CGPA": student.cgpa,
        "Internships": student.internships,
        "Projects": student.projects,
        "Workshops/Certifications": student.workshops_certifications,
        "SSC_Marks": student.ssc_marks,
        "HSC_Marks": student.hsc_marks,
        "ExtracurricularActivities": normalize_yes_no(
            student.extracurricular_activities,
            "extracurricular_activities",
        ),
        "PlacementTraining": normalize_yes_no(
            student.placement_training,
            "placement_training",
        ),
    }])

    predicted_status = str(model.predict(row)[0])
    probabilities = model.predict_proba(row)[0]
    classes = list(model.classes_)
    placed_index = classes.index("Placed")

    return {
        "predicted_status": predicted_status,
        "model_score": round(float(probabilities[placed_index]), 6),
        "model_version": "1.0.0",
    }


# =========================================================
# HEALTH
# =========================================================

@app.get("/")
def root():
    return {
        "message": "CareerSync AI API is running",
        "documentation": "/docs",
    }


@app.get("/api/health")
def health():
    return {"status": "healthy", "model_loaded": True}


@app.get("/api/health/database")
def database_health():
    connection = None

    try:
        connection = get_connection()

        with connection.cursor() as cursor:
            cursor.execute("SELECT 1 FROM DUAL")
            cursor.fetchone()

        return {"status": "connected", "database": "Oracle"}

    except Exception:
        raise HTTPException(
            status_code=503,
            detail="Oracle connection failed. Check .env and connection details.",
        )

    finally:
        if connection is not None:
            connection.close()


# =========================================================
# STUDENTS
# =========================================================

@app.post("/api/students", status_code=201)
def create_student(student: StudentCreate):
    data = student.model_dump()

    data["extracurricular_activities"] = normalize_yes_no(
        data["extracurricular_activities"], "extracurricular_activities"
    )
    data["placement_training"] = normalize_yes_no(
        data["placement_training"], "placement_training"
    )

    sql = """
        INSERT INTO CS_STUDENTS (
            FULL_NAME, EMAIL, BRANCH, GRADUATION_YEAR, CGPA,
            SSC_MARKS, HSC_MARKS, INTERNSHIPS, PROJECTS,
            WORKSHOPS_CERTIFICATIONS, APTITUDE_TEST_SCORE,
            SOFT_SKILLS_RATING, EXTRACURRICULAR_ACTIVITIES,
            PLACEMENT_TRAINING
        )
        VALUES (
            :full_name, :email, :branch, :graduation_year, :cgpa,
            :ssc_marks, :hsc_marks, :internships, :projects,
            :workshops_certifications, :aptitude_test_score,
            :soft_skills_rating, :extracurricular_activities,
            :placement_training
        )
        RETURNING STUDENT_ID INTO :new_id
    """

    try:
        with get_db_cursor() as cursor:
            new_id = cursor.var(int)
            cursor.execute(sql, {**data, "new_id": new_id})

            return {
                "student_id": new_id.getvalue()[0],
                "message": "Student profile created",
            }

    except Exception as exc:
        if "ORA-00001" in str(exc):
            raise HTTPException(
                status_code=409,
                detail="A student with this email already exists.",
            )
        db_error(exc)


@app.get("/api/students")
def list_students(limit: int = Query(default=50, ge=1, le=200)):
    try:
        with get_db_cursor() as cursor:
            cursor.execute(
                """
                SELECT STUDENT_ID, FULL_NAME, EMAIL, BRANCH,
                       GRADUATION_YEAR, CGPA, SSC_MARKS, HSC_MARKS,
                       INTERNSHIPS, PROJECTS, WORKSHOPS_CERTIFICATIONS,
                       EXTRACURRICULAR_ACTIVITIES, PLACEMENT_TRAINING
                FROM CS_STUDENTS
                ORDER BY STUDENT_ID
                FETCH FIRST :limit ROWS ONLY
                """,
                {"limit": limit},
            )

            columns = [col[0].lower() for col in cursor.description]
            return [
                dict(zip(columns, row))
                for row in cursor.fetchall()
            ]

    except Exception as exc:
        db_error(exc)

@app.get("/api/students/me")
def get_my_student(user=Depends(get_current_user)):
    try:
        with get_db_cursor() as cursor:
            student_id = current_student_id(cursor, user)
            cursor.execute(
                """
                SELECT STUDENT_ID, FULL_NAME, EMAIL, BRANCH, GRADUATION_YEAR,
                       CGPA, SSC_MARKS, HSC_MARKS, INTERNSHIPS, PROJECTS,
                       WORKSHOPS_CERTIFICATIONS, APTITUDE_TEST_SCORE,
                       SOFT_SKILLS_RATING, EXTRACURRICULAR_ACTIVITIES,
                       PLACEMENT_TRAINING
                FROM CS_STUDENTS WHERE STUDENT_ID = :id
                """,
                {"id": student_id},
            )
            columns = [col[0].lower() for col in cursor.description]
            return dict(zip(columns, cursor.fetchone()))
    except HTTPException:
        raise
    except Exception as exc:
        db_error(exc)

@app.get("/api/students/me/skills")
def get_my_skills(user=Depends(get_current_user)):
    try:
        with get_db_cursor() as cursor:
            student_id = current_student_id(cursor, user)
            cursor.execute(
                """
                SELECT S.SKILL_ID, S.SKILL_NAME, SS.PROFICIENCY
                FROM CS_STUDENT_SKILLS SS
                JOIN CS_SKILLS S ON S.SKILL_ID = SS.SKILL_ID
                WHERE SS.STUDENT_ID = :sid
                ORDER BY S.SKILL_NAME ASC
                """,
                {"sid": student_id},
            )
            columns = [col[0].lower() for col in cursor.description]
            return [dict(zip(columns, row)) for row in cursor.fetchall()]
    except HTTPException:
        raise
    except Exception as exc:
        db_error(exc)

@app.patch("/api/students/me/profile")
def update_my_profile(
    update: StudentProfileUpdate,
    user=Depends(get_current_user),
):
    data = update.model_dump(exclude_unset=True)

    if "extracurricular_activities" in data:
        data["extracurricular_activities"] = normalize_yes_no(
            data["extracurricular_activities"], "extracurricular_activities"
        )
    if "placement_training" in data:
        data["placement_training"] = normalize_yes_no(
            data["placement_training"], "placement_training"
        )

    if not data:
        raise HTTPException(status_code=422, detail="No fields to update.")

    # Column names come from the model's own field names, never from user text.
    assignments = ", ".join(f"{name.upper()} = :{name}" for name in data)

    try:
        with get_db_cursor() as cursor:
            student_id = current_student_id(cursor, user)
            cursor.execute(
                f"UPDATE CS_STUDENTS SET {assignments} WHERE STUDENT_ID = :sid",
                {**data, "sid": student_id},
            )
        return {"message": "Profile updated", "updated_fields": list(data)}
    except HTTPException:
        raise
    except Exception as exc:
        db_error(exc)


@app.post("/api/students/me/skills")
def set_my_skill(skill: StudentSkillSet, user=Depends(get_current_user)):
    try:
        with get_db_cursor() as cursor:
            student_id = current_student_id(cursor, user)
            skill_id = get_or_create_skill_id(cursor, skill.skill_name)
            cursor.execute(
                """
                MERGE INTO CS_STUDENT_SKILLS t
                USING (SELECT :sid AS STUDENT_ID, :skid AS SKILL_ID FROM DUAL) s
                ON (t.STUDENT_ID = s.STUDENT_ID AND t.SKILL_ID = s.SKILL_ID)
                WHEN MATCHED THEN UPDATE SET t.PROFICIENCY = :lvl
                WHEN NOT MATCHED THEN INSERT (STUDENT_ID, SKILL_ID, PROFICIENCY)
                    VALUES (s.STUDENT_ID, s.SKILL_ID, :lvl)
                """,
                {"sid": student_id, "skid": skill_id, "lvl": skill.level},
            )
        return {"message": "Skill saved", "skill_id": skill_id}
    except HTTPException:
        raise
    except Exception as exc:
        db_error(exc)


@app.post("/api/students/me/predict")
def predict_my_placement(user=Depends(get_current_user)):
    """Reads the stored profile from Oracle, runs the model, saves the result."""
    try:
        with get_db_cursor() as cursor:
            student_id = current_student_id(cursor, user)
            cursor.execute(
                """
                SELECT CGPA, INTERNSHIPS, PROJECTS, WORKSHOPS_CERTIFICATIONS,
                       SSC_MARKS, HSC_MARKS, EXTRACURRICULAR_ACTIVITIES,
                       PLACEMENT_TRAINING
                FROM CS_STUDENTS WHERE STUDENT_ID = :id
                """,
                {"id": student_id},
            )
            row = cursor.fetchone()

            if any(value is None for value in row):
                raise HTTPException(
                    status_code=422,
                    detail="Complete your profile first: PATCH /api/students/me/profile",
                )

            features = StudentFeatures(
                cgpa=float(row[0]),
                internships=int(row[1]),
                projects=int(row[2]),
                workshops_certifications=int(row[3]),
                ssc_marks=float(row[4]),
                hsc_marks=float(row[5]),
                extracurricular_activities=row[6],
                placement_training=row[7],
            )
            result = predict_features(features)

            prediction_id = cursor.var(int)
            cursor.execute(
                """
                INSERT INTO CS_PREDICTIONS (
                    STUDENT_ID, PLACEMENT_PROBABILITY, MODEL_VERSION
                )
                VALUES (:student_id, :probability, :version)
                RETURNING PREDICTION_ID INTO :prediction_id
                """,
                {
                    "student_id": student_id,
                    "probability": result["model_score"],
                    "version": result["model_version"],
                    "prediction_id": prediction_id,
                },
            )

            return {
                "prediction_id": prediction_id.getvalue()[0],
                "student_id": student_id,
                **result,
                "saved": True,
            }
    except HTTPException:
        raise
    except Exception as exc:
        db_error(exc)


@app.post("/api/jobs/{job_id}/skills", status_code=201)
def set_job_skill(job_id: int, skill: JobSkillSet):
    try:
        with get_db_cursor() as cursor:
            cursor.execute("SELECT 1 FROM CS_JOBS WHERE JOB_ID = :id", {"id": job_id})
            if cursor.fetchone() is None:
                raise HTTPException(status_code=404, detail="Job not found")

            skill_id = get_or_create_skill_id(cursor, skill.skill_name)
            cursor.execute(
                """
                MERGE INTO CS_JOB_SKILLS t
                USING (SELECT :jid AS JOB_ID, :skid AS SKILL_ID FROM DUAL) s
                ON (t.JOB_ID = s.JOB_ID AND t.SKILL_ID = s.SKILL_ID)
                WHEN MATCHED THEN UPDATE
                    SET t.REQUIRED_LEVEL = :lvl, t.IMPORTANCE = :imp
                WHEN NOT MATCHED THEN INSERT
                    (JOB_ID, SKILL_ID, REQUIRED_LEVEL, IMPORTANCE)
                    VALUES (s.JOB_ID, s.SKILL_ID, :lvl, :imp)
                """,
                {
                    "jid": job_id, "skid": skill_id,
                    "lvl": skill.required_level, "imp": skill.importance,
                },
            )
        return {"message": "Job skill saved", "skill_id": skill_id}
    except HTTPException:
        raise
    except Exception as exc:
        db_error(exc)

@app.get("/api/students/{student_id}")
def get_student(student_id: int):
    try:
        with get_db_cursor() as cursor:
            cursor.execute(
                """
                SELECT STUDENT_ID, FULL_NAME, EMAIL, BRANCH,
                       GRADUATION_YEAR, CGPA, SSC_MARKS, HSC_MARKS,
                       INTERNSHIPS, PROJECTS, WORKSHOPS_CERTIFICATIONS,
                       APTITUDE_TEST_SCORE, SOFT_SKILLS_RATING,
                       EXTRACURRICULAR_ACTIVITIES, PLACEMENT_TRAINING
                FROM CS_STUDENTS
                WHERE STUDENT_ID = :student_id
                """,
                {"student_id": student_id},
            )

            row = cursor.fetchone()

            if row is None:
                raise HTTPException(status_code=404, detail="Student not found")

            columns = [col[0].lower() for col in cursor.description]
            return dict(zip(columns, row))

    except HTTPException:
        raise
    except Exception as exc:
        db_error(exc)


# =========================================================
# COMPANIES
# =========================================================

@app.post("/api/companies", status_code=201)
def create_company(company: CompanyCreate):
    try:
        with get_db_cursor() as cursor:
            new_id = cursor.var(int)

            cursor.execute(
                """
                INSERT INTO CS_COMPANIES (
                    COMPANY_NAME, EMAIL, INDUSTRY, LOCATION
                )
                VALUES (
                    :company_name, :email, :industry, :location
                )
                RETURNING COMPANY_ID INTO :new_id
                """,
                {
                    **company.model_dump(),
                    "new_id": new_id,
                },
            )

            return {
                "company_id": new_id.getvalue()[0],
                "message": "Company created",
            }

    except Exception as exc:
        if "ORA-00001" in str(exc):
            raise HTTPException(
                status_code=409,
                detail="A company with this email already exists.",
            )
        db_error(exc)


@app.get("/api/companies")
def list_companies():
    try:
        with get_db_cursor() as cursor:
            cursor.execute(
                """
                SELECT COMPANY_ID, COMPANY_NAME, EMAIL, INDUSTRY, LOCATION
                FROM CS_COMPANIES
                ORDER BY COMPANY_NAME
                """
            )

            columns = [col[0].lower() for col in cursor.description]
            return [dict(zip(columns, row)) for row in cursor.fetchall()]

    except Exception as exc:
        db_error(exc)

@app.get("/api/companies/me")
def get_my_company(user=Depends(get_current_user)):
    if user["role"] != "RECRUITER":
        raise HTTPException(status_code=403, detail="Recruiters only.")
    try:
        with get_db_cursor() as cursor:
            cursor.execute(
                """
                SELECT COMPANY_ID, USER_ID, COMPANY_NAME, EMAIL, INDUSTRY, LOCATION
                FROM CS_COMPANIES WHERE USER_ID = :user_id_val
                """,
                {"user_id_val": user["user_id"]},
            )
            row = cursor.fetchone()
            if row is None:
                raise HTTPException(status_code=404, detail="Company profile not found.")
            columns = [col[0].lower() for col in cursor.description]
            return dict(zip(columns, row))
    except HTTPException:
        raise
    except Exception as exc:
        db_error(exc)
# =========================================================
# JOBS
# =========================================================

@app.post("/api/jobs", status_code=201)
def create_job(job: JobCreate):
    data = job.model_dump()
    data["job_status"] = data["job_status"].upper()

    if data["job_status"] not in {"DRAFT", "OPEN", "CLOSED"}:
        raise HTTPException(
            status_code=422,
            detail="job_status must be DRAFT, OPEN, or CLOSED.",
        )

    sql = """
        INSERT INTO CS_JOBS (
            COMPANY_ID, JOB_TITLE, JOB_DESCRIPTION, JOB_TYPE,
            MIN_CGPA, MAX_BACKLOGS, SALARY_LPA, LOCATION,
            GRADUATION_YEAR, DEADLINE, JOB_STATUS
        )
        VALUES (
            :company_id, :job_title, :job_description, :job_type,
            :min_cgpa, :max_backlogs, :salary_lpa, :location,
            :graduation_year,
            TO_DATE(:deadline, 'YYYY-MM-DD'),
            :job_status
        )
        RETURNING JOB_ID INTO :new_id
    """

    try:
        with get_db_cursor() as cursor:
            new_id = cursor.var(int)
            cursor.execute(sql, {**data, "new_id": new_id})

            return {
                "job_id": new_id.getvalue()[0],
                "message": "Job created",
            }

    except Exception as exc:
        if "ORA-02291" in str(exc):
            raise HTTPException(status_code=404, detail="Company not found")
        db_error(exc)

@app.get("/api/jobs")
def list_jobs(
    status: str = Query(default="OPEN", pattern="^(OPEN|CLOSED|DRAFT|ALL)$"),
    limit: int = Query(default=50, ge=1, le=200),
):
    try:
        with get_db_cursor() as cursor:
            cursor.execute(
                """
                SELECT J.JOB_ID, J.COMPANY_ID, C.COMPANY_NAME,
                       J.JOB_TITLE, J.JOB_DESCRIPTION, J.JOB_TYPE,
                       J.MIN_CGPA, J.MAX_BACKLOGS, J.SALARY_LPA,
                       J.LOCATION, J.GRADUATION_YEAR, J.DEADLINE,
                       J.JOB_STATUS, J.POSTED_AT,
                       (
                           SELECT LISTAGG(S.SKILL_NAME || ' (L' || JS.REQUIRED_LEVEL || ')', ', ')
                           WITHIN GROUP (ORDER BY S.SKILL_NAME)
                           FROM CS_JOB_SKILLS JS
                           JOIN CS_SKILLS S ON S.SKILL_ID = JS.SKILL_ID
                           WHERE JS.JOB_ID = J.JOB_ID
                       ) AS SKILLS
                FROM CS_JOBS J
                JOIN CS_COMPANIES C ON C.COMPANY_ID = J.COMPANY_ID
                WHERE (:status = 'ALL' OR J.JOB_STATUS = :status)
                ORDER BY J.POSTED_AT DESC
                FETCH FIRST :limit ROWS ONLY
                """,
                {"status": status, "limit": limit},
            )

            columns = [col[0].lower() for col in cursor.description]
            return [dict(zip(columns, row)) for row in cursor.fetchall()]

    except Exception as exc:
        db_error(exc)


# =========================================================
# JOB RECOMMENDATIONS USING COSINE SIMILARITY
# =========================================================

@app.get("/api/students/{student_id}/recommendations")
def recommend_jobs(
    student_id: int,
    limit: int = Query(default=10, ge=1, le=50),
):
    try:
        with get_db_cursor() as cursor:
            cursor.execute(
                """
                SELECT SKILL_ID, PROFICIENCY
                FROM CS_STUDENT_SKILLS
                WHERE STUDENT_ID = :student_id
                """,
                {"student_id": student_id},
            )
            student_skills = {
                skill_id: float(level)
                for skill_id, level in cursor.fetchall()
            }

            cursor.execute(
                "SELECT 1 FROM CS_STUDENTS WHERE STUDENT_ID = :id",
                {"id": student_id},
            )
            if cursor.fetchone() is None:
                raise HTTPException(status_code=404, detail="Student not found")

            cursor.execute(
                """
                SELECT J.JOB_ID, J.JOB_TITLE, J.COMPANY_ID,
                       C.COMPANY_NAME, J.MIN_CGPA, J.SALARY_LPA,
                       J.LOCATION, JS.SKILL_ID,
                       JS.REQUIRED_LEVEL, JS.IMPORTANCE
                FROM CS_JOBS J
                JOIN CS_COMPANIES C ON C.COMPANY_ID = J.COMPANY_ID
                LEFT JOIN CS_JOB_SKILLS JS ON JS.JOB_ID = J.JOB_ID
                WHERE J.JOB_STATUS = 'OPEN'
                  AND (J.DEADLINE IS NULL OR J.DEADLINE >= TRUNC(SYSDATE))
                ORDER BY J.JOB_ID
                """
            )
            rows = cursor.fetchall()

        jobs = {}

        for row in rows:
            (
                job_id, title, company_id, company_name,
                min_cgpa, salary, location, skill_id,
                required_level, importance,
            ) = row

            if job_id not in jobs:
                jobs[job_id] = {
                    "job_id": job_id,
                    "job_title": title,
                    "company_id": company_id,
                    "company_name": company_name,
                    "min_cgpa": min_cgpa,
                    "salary_lpa": salary,
                    "location": location,
                    "requirements": {},
                }

            if skill_id is not None:
                jobs[job_id]["requirements"][skill_id] = (
                    float(required_level),
                    float(importance),
                )

        recommendations = []

        for job in jobs.values():
            requirements = job.pop("requirements")

            if not requirements:
                score = 0.0
            else:
                all_skill_ids = set(student_skills) | set(requirements)

                student_vector = np.array([
                    student_skills.get(skill_id, 0.0)
                    for skill_id in all_skill_ids
                ])

                job_vector = np.array([
                    (
                        requirements[skill_id][0]
                        * requirements[skill_id][1] / 100.0
                    )
                    if skill_id in requirements else 0.0
                    for skill_id in all_skill_ids
                ])

                denominator = (
                    np.linalg.norm(student_vector)
                    * np.linalg.norm(job_vector)
                )

                score = (
                    float(np.dot(student_vector, job_vector) / denominator)
                    if denominator else 0.0
                )

            job["match_score"] = round(score * 100, 2)
            recommendations.append(job)

        recommendations.sort(
            key=lambda item: item["match_score"],
            reverse=True,
        )

        return recommendations[:limit]

    except HTTPException:
        raise
    except Exception as exc:
        db_error(exc)


# =========================================================
# APPLICATIONS
# =========================================================

@app.post("/api/applications", status_code=201)
def apply_for_job(application: ApplicationCreate):
    try:
        with get_db_cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO CS_APPLICATIONS (
                    STUDENT_ID, JOB_ID, APPLICATION_STATUS
                )
                SELECT :student_id, J.JOB_ID, 'APPLIED'
                FROM CS_JOBS J
                WHERE J.JOB_ID = :job_id
                  AND J.JOB_STATUS = 'OPEN'
                  AND (J.DEADLINE IS NULL OR J.DEADLINE >= TRUNC(SYSDATE))
                """,
                application.model_dump(),
            )

            if cursor.rowcount == 0:
                raise HTTPException(
                    status_code=404,
                    detail="Open job not found or application deadline passed.",
                )

            cursor.execute(
                """
                SELECT APPLICATION_ID
                FROM CS_APPLICATIONS
                WHERE STUDENT_ID = :student_id AND JOB_ID = :job_id
                """,
                application.model_dump(),
            )
            row = cursor.fetchone()

            return {
                "application_id": row[0],
                "message": "Application submitted",
            }

    except HTTPException:
        raise
    except Exception as exc:
        if "ORA-00001" in str(exc):
            raise HTTPException(
                status_code=409,
                detail="You have already applied for this job.",
            )
        if "ORA-02291" in str(exc):
            raise HTTPException(
                status_code=404,
                detail="Student or job not found.",
            )
        db_error(exc)


@app.get("/api/students/{student_id}/applications")
def student_applications(student_id: int):
    try:
        with get_db_cursor() as cursor:
            cursor.execute(
                """
                SELECT A.APPLICATION_ID, A.JOB_ID, J.JOB_TITLE,
                       C.COMPANY_NAME, A.APPLIED_AT,
                       A.APPLICATION_STATUS, A.MATCH_SCORE
                FROM CS_APPLICATIONS A
                JOIN CS_JOBS J ON J.JOB_ID = A.JOB_ID
                JOIN CS_COMPANIES C ON C.COMPANY_ID = J.COMPANY_ID
                WHERE A.STUDENT_ID = :student_id
                ORDER BY A.APPLIED_AT DESC
                """,
                {"student_id": student_id},
            )

            columns = [col[0].lower() for col in cursor.description]
            return [dict(zip(columns, row)) for row in cursor.fetchall()]

    except Exception as exc:
        db_error(exc)


@app.patch("/api/applications/{application_id}/status")
def update_application_status(
    application_id: int,
    update: ApplicationStatusUpdate,
):
    status = update.application_status.upper()

    allowed = {
        "APPLIED", "SHORTLISTED", "REJECTED",
        "INTERVIEW", "SELECTED", "WITHDRAWN",
    }

    if status not in allowed:
        raise HTTPException(status_code=422, detail="Invalid application status")

    try:
        with get_db_cursor() as cursor:
            cursor.execute(
                """
                UPDATE CS_APPLICATIONS
                SET APPLICATION_STATUS = :status
                WHERE APPLICATION_ID = :application_id
                """,
                {"status": status, "application_id": application_id},
            )

            if cursor.rowcount == 0:
                raise HTTPException(status_code=404, detail="Application not found")

            return {
                "application_id": application_id,
                "application_status": status,
            }

    except HTTPException:
        raise
    except Exception as exc:
        db_error(exc)


# =========================================================
# PLACEMENT PREDICTION
# =========================================================

@app.post("/api/predict")
def predict_placement(student: StudentFeatures):
    try:
        result = predict_features(student)

        return {
            **result,
            "notice": (
                "Experimental model estimate; not a validated "
                "real-world placement probability."
            ),
        }

    except HTTPException:
        raise
    except Exception as exc:
        print("Prediction error:", repr(exc))
        raise HTTPException(status_code=500, detail="Prediction failed")


@app.post("/api/students/{student_id}/predict")
def predict_and_save(student_id: int, student: StudentFeatures):
    result = predict_features(student)

    try:
        with get_db_cursor() as cursor:
            cursor.execute(
                "SELECT 1 FROM CS_STUDENTS WHERE STUDENT_ID = :id",
                {"id": student_id},
            )

            if cursor.fetchone() is None:
                raise HTTPException(status_code=404, detail="Student not found")

             
            prediction_id = cursor.var(int)

            cursor.execute(
                """
                INSERT INTO CS_PREDICTIONS (
                    STUDENT_ID, PLACEMENT_PROBABILITY, MODEL_VERSION
                )
                VALUES (:student_id, :probability, :version)
                RETURNING PREDICTION_ID INTO :prediction_id
                """,
                {
                    "student_id": student_id,
                    "probability": result["model_score"],
                    "version": result["model_version"],
                    "prediction_id": prediction_id,
                },
            )

            
            # Fetch the generated ID through an explicit bind variable
            # in the corrected version below.

            return {
                "prediction_id": prediction_id.getvalue()[0],
                "student_id": student_id,
                **result,
                "saved": True,
                 "notice": (
                    "Experimental model estimate; not a validated "
                    "real-world placement probability."
                ),
            }

    except HTTPException:
        raise
    except Exception as exc:
        db_error(exc)
