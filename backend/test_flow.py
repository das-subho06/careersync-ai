import json
import time
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8000"
STAMP = str(int(time.time()))
passed, failed = 0, 0


def call(method, path, body=None, token=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read()
            return resp.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as err:
        raw = err.read()
        try:
            return err.code, json.loads(raw)
        except Exception:
            return err.code, raw.decode(errors="replace")[:300]


def step(name, method, path, body=None, token=None, expect=200):
    global passed, failed
    status, payload = call(method, path, body, token)
    if status == expect:
        passed += 1
        print(f"PASS  {name}  [{status}]")
    else:
        failed += 1
        print(f"FAIL  {name}  [got {status}, expected {expect}]")
        print(f"      {str(payload)[:300]}")
    return payload


email = f"student{STAMP}@test.com"
password = "TestPass123"

print("=== Health ===")
step("API health", "GET", "/api/health")
step("Database health", "GET", "/api/health/database")

print("\n=== Accounts ===")
step("Register student", "POST", "/api/auth/register/student", {
    "full_name": "Flow Tester", "email": email, "password": password,
    "branch": "CSE", "graduation_year": 2027,
}, expect=201)
step("Duplicate register is rejected", "POST", "/api/auth/register/student", {
    "full_name": "Flow Tester", "email": email, "password": password,
    "branch": "CSE", "graduation_year": 2027,
}, expect=409)
step("Wrong password is rejected", "POST", "/api/auth/login",
     {"email": email, "password": "WrongPass999"}, expect=401)
login = step("Login", "POST", "/api/auth/login",
             {"email": email, "password": password})
token = login["access_token"] if isinstance(login, dict) else None
if not token:
    print("\nCannot continue without a login token.")
    raise SystemExit(1)
step("Current user (/me)", "GET", "/api/auth/me", token=token)
step("/me without token is rejected", "GET", "/api/auth/me", expect=401)
step("Register recruiter", "POST", "/api/auth/register/recruiter", {
    "company_name": f"FlowCorp {STAMP}", "email": f"recruiter{STAMP}@test.com",
    "password": password, "industry": "IT", "location": "Bengaluru",
}, expect=201)

print("\n=== Student profile and placement prediction ===")
me = step("Get my student row", "GET", "/api/students/me", token=token)
student_id = me["student_id"] if isinstance(me, dict) else None
step("Predict from incomplete profile is refused", "POST",
     "/api/students/me/predict", token=token, expect=422)
step("Update profile", "PATCH", "/api/students/me/profile", {
    "cgpa": 8.2, "ssc_marks": 85, "hsc_marks": 80, "internships": 2,
    "projects": 3, "workshops_certifications": 1,
    "extracurricular_activities": "Yes", "placement_training": "Yes",
}, token=token)
mine = step("Predict from stored profile (saves)", "POST",
            "/api/students/me/predict", token=token)
if isinstance(mine, dict):
    print(f"      -> {mine.get('predicted_status')}  score={mine.get('model_score')}")

strong = {"cgpa": 8.5, "internships": 2, "projects": 3,
          "workshops_certifications": 2, "ssc_marks": 88, "hsc_marks": 85,
          "extracurricular_activities": "Yes", "placement_training": "Yes"}
weak = {"cgpa": 6.5, "internships": 0, "projects": 0,
        "workshops_certifications": 0, "ssc_marks": 55, "hsc_marks": 55,
        "extracurricular_activities": "No", "placement_training": "No"}
p_strong = step("Predict (strong profile)", "POST", "/api/predict", strong)
p_weak = step("Predict (weak profile)", "POST", "/api/predict", weak)
if isinstance(p_strong, dict) and isinstance(p_weak, dict):
    ok = p_strong["model_score"] > p_weak["model_score"]
    print(f"{'PASS' if ok else 'FAIL'}  Strong score > weak score "
          f"({p_strong['model_score']} vs {p_weak['model_score']})")
    passed, failed = (passed + 1, failed) if ok else (passed, failed + 1)
step("Predict and save via student id", "POST",
     f"/api/students/{student_id}/predict", strong)

print("\n=== Skills, company, jobs ===")
for name, level in [("Python", 4), ("SQL", 4), ("Communication", 3)]:
    step(f"Student skill: {name}", "POST", "/api/students/me/skills",
         {"skill_name": name, "level": level}, token=token)

company = step("Create company", "POST", "/api/companies", {
    "company_name": f"TechNova {STAMP}", "email": f"hr{STAMP}@technova.com",
    "industry": "IT", "location": "Bengaluru",
}, expect=201)
company_id = company["company_id"] if isinstance(company, dict) else None

jobs = {
    "Data Analyst": [("Python", 4, 90), ("SQL", 4, 90), ("Communication", 3, 50)],
    "ML Engineer": [("Python", 4, 90), ("Machine Learning", 5, 100)],
    "Frontend Developer": [("React", 4, 90), ("Communication", 3, 50)],
}
job_ids = {}
for title, reqs in jobs.items():
    created = step(f"Create job: {title}", "POST", "/api/jobs", {
        "company_id": company_id, "job_title": f"{title} {STAMP}",
        "job_description": f"{title} role for testing.",
        "job_type": "FULL_TIME", "min_cgpa": 6.5, "max_backlogs": 0,
        "salary_lpa": 8, "location": "Bengaluru",
        "graduation_year": 2027, "deadline": "2030-12-31", "job_status": "OPEN",
    }, expect=201)
    if isinstance(created, dict):
        job_ids[title] = created["job_id"]
        for skill, lvl, imp in reqs:
            step(f"  {title} needs {skill}", "POST",
                 f"/api/jobs/{created['job_id']}/skills",
                 {"skill_name": skill, "required_level": lvl, "importance": imp},
                 expect=201)

step("List jobs", "GET", "/api/jobs")

print("\n=== Job recommendations ===")
recs = step("Recommendations", "GET", f"/api/students/{student_id}/recommendations")
if isinstance(recs, list):
    mine_only = [r for r in recs if r["job_id"] in job_ids.values()]
    for r in mine_only:
        print(f"      {r['match_score']:>6}  {r['job_title']}")
    ok = bool(mine_only) and mine_only[0]["job_id"] == job_ids.get("Data Analyst")
    print(f"{'PASS' if ok else 'FAIL'}  Data Analyst ranks first for a Python+SQL student")
    passed, failed = (passed + 1, failed) if ok else (passed, failed + 1)

print("\n=== Applications ===")
app_row = step("Apply for job", "POST", "/api/applications",
               {"student_id": student_id, "job_id": job_ids.get("Data Analyst")},
               expect=201)
step("Apply again is rejected", "POST", "/api/applications",
     {"student_id": student_id, "job_id": job_ids.get("Data Analyst")}, expect=409)
step("My applications", "GET", f"/api/students/{student_id}/applications")
if isinstance(app_row, dict):
    app_id = app_row["application_id"]
    step("Update status", "PATCH", f"/api/applications/{app_id}/status",
         {"application_status": "SHORTLISTED"})
    step("Invalid status is rejected", "PATCH", f"/api/applications/{app_id}/status",
         {"application_status": "NONSENSE"}, expect=422)

print("\n=== Lists and logout ===")
step("List students", "GET", "/api/students")
step("List companies", "GET", "/api/companies")
step("Logout", "POST", "/api/auth/logout", token=token)
step("/me after logout is rejected", "GET", "/api/auth/me", token=token, expect=401)

print(f"\nDone: {passed} passed, {failed} failed")