import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  Platform,
} from "react-native";

const API_BASE_URL =
  Platform.OS === "web"
    ? "http://localhost:8000"
    : Platform.OS === "android"
    ? "http://10.0.2.2:8000"
    : "http://localhost:8000";

const showAlert = (title: string, message?: string) => {
  if (Platform.OS === "web") {
    window.alert(`${title}${message ? `: ${message}` : ""}`);
  } else {
    Alert.alert(title, message);
  }
};

const api = {
  get: async (endpoint: string, token?: string) => {
    const res = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  post: async (endpoint: string, body: any, token?: string) => {
    const res = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  patch: async (endpoint: string, body: any, token?: string) => {
    const res = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
};

export default function DashboardScreen() {
  const [token, setToken] = useState<string>("");
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [authMode, setAuthMode] = useState<"LOGIN" | "REGISTER">("LOGIN");
  const [registerRole, setRegisterRole] = useState<"STUDENT" | "RECRUITER">("STUDENT");
  const [activeRole, setActiveRole] = useState<"STUDENT" | "RECRUITER">("STUDENT");
  const [loading, setLoading] = useState<boolean>(false);

  // Authenticated Entity Data
  const [myStudent, setMyStudent] = useState<any>(null);
  const [myCompany, setMyCompany] = useState<any>(null);

  // Authentication Credentials
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");

  // Student Registration Details
  const [regFullName, setRegFullName] = useState("");
  const [regBranch, setRegBranch] = useState("");
  const [regGradYear, setRegGradYear] = useState("");

  // Recruiter Registration Details
  const [regCompanyName, setRegCompanyName] = useState("");
  const [regIndustry, setRegIndustry] = useState("");
  const [regLocation, setRegLocation] = useState("");

  // Student Profile Metrics
  const [studentProfile, setStudentProfile] = useState({
    cgpa: "",
    ssc_marks: "",
    hsc_marks: "",
    internships: "",
    projects: "",
    workshops_certifications: "",
    aptitude_test_score: "",
    soft_skills_rating: "",
    extracurricular_activities: "",
    placement_training: "",
  });

  // Student Skills & Awareness List
  const [newSkill, setNewSkill] = useState("");
  const [skillProficiency, setSkillProficiency] = useState("");
  const [studentSkillsList, setStudentSkillsList] = useState<any[]>([]);
  const [fetchingSkills, setFetchingSkills] = useState(false);

  // Recommendations & Predictions
  const [recommendedJobs, setRecommendedJobs] = useState<any[]>([]);
  const [predictionResult, setPredictionResult] = useState<{
    status: string;
    score: number;
  } | null>(null);

  // Recruiter Postings & Target Skill Vectors
  const [jobsList, setJobsList] = useState<any[]>([]);
  const [newJob, setNewJob] = useState({
    job_title: "",
    job_description: "",
    job_type: "",
    min_cgpa: "",
    max_backlogs: "",
    salary_lpa: "",
    location: "",
    graduation_year: "",
    deadline: "",
  });
  const [jobSkillName, setJobSkillName] = useState("");
  const [jobSkillLevel, setJobSkillLevel] = useState("");
  const [jobSkillImportance, setJobSkillImportance] = useState("");
  const [selectedJobIdForSkill, setSelectedJobIdForSkill] = useState<number | null>(null);

  // --- Authentication Workflows ---
  const handleRegister = async () => {
    if (!authEmail.trim() || !authPassword.trim()) {
      showAlert("Missing Fields", "Please enter an email and password.");
      return;
    }
    try {
      setLoading(true);
      if (registerRole === "STUDENT") {
        if (!regFullName.trim() || !regBranch.trim()) {
          showAlert("Missing Fields", "Please enter your name and branch.");
          return;
        }
        await api.post("/api/auth/register/student", {
          full_name: regFullName.trim(),
          email: authEmail.trim(),
          password: authPassword,
          branch: regBranch.trim(),
          graduation_year: parseInt(regGradYear) || 2027,
        });
      } else {
        if (!regCompanyName.trim()) {
          showAlert("Missing Fields", "Please enter your company name.");
          return;
        }
        await api.post("/api/auth/register/recruiter", {
          company_name: regCompanyName.trim(),
          email: authEmail.trim(),
          password: authPassword,
          industry: regIndustry.trim() || null,
          location: regLocation.trim() || null,
        });
      }

      await executeLogin(authEmail.trim(), authPassword);
    } catch (err: any) {
      showAlert("Registration Failed", err.message || "Could not register account");
    } finally {
      setLoading(false);
    }
  };
  const fetchRecruiterDataWithCompany = async (companyId: number, authToken: string) => {
  try {
    setLoading(true);
    const allJobs = await api.get("/api/jobs?status=ALL", authToken);
    setJobsList(allJobs.filter((j: any) => j.company_id === companyId));
  } catch (err) {
    console.log("Error loading openings:", err);
  } finally {
    setLoading(false);
  }
};

const fetchRecruiterData = async () => {
  try {
    setLoading(true);
    let comp = myCompany;
    if (!comp?.company_id) {
      try {
        comp = await api.get("/api/companies/me", token);
        setMyCompany(comp);
      } catch (e) {
        showAlert("Registration Required", "Company must register first before logging in.");
        return;
      }
    }

    if (comp?.company_id) {
      const allJobs = await api.get("/api/jobs?status=ALL", token);
      setJobsList(allJobs.filter((j: any) => j.company_id === comp.company_id));
    }
  } catch (err: any) {
    console.log("Recruiter fetch error:", err);
  } finally {
    setLoading(false);
  }
};
  const executeLogin = async (emailToLogin: string, passwordToLogin: string) => {
    try {
      const res = await api.post("/api/auth/login", {
        email: emailToLogin.trim(),
        password: passwordToLogin,
      });

      setToken(res.access_token);
      setCurrentUser(res.user);
      setActiveRole(res.user.role);

      if (res.user.role === "STUDENT") {
        try {
          const student = await api.get("/api/students/me", res.access_token);
          setMyStudent(student);
          showAlert("Welcome", `Hi, ${student.full_name}`);
        } catch (_) {}
      } else {
        try {
          const comp = await api.get("/api/companies/me", res.access_token);
          setMyCompany(comp);
          showAlert("Welcome", `Hi, ${comp.company_name}`);
          fetchRecruiterDataWithCompany(comp.company_id, res.access_token);
        } catch (_) {
          showAlert("Alert", "Company must register first before logging in.");
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!authEmail.trim() || !authPassword.trim()) {
      showAlert("Missing Fields", "Please provide email and password.");
      return;
    }
    try {
      setLoading(true);
      await executeLogin(authEmail.trim(), authPassword);
    } catch (err: any) {
      setLoading(false);
      let errorMsg = err.message || "Invalid credentials";
      try {
        const parsed = JSON.parse(err.message);
        if (parsed.detail) errorMsg = parsed.detail;
      } catch (_) {}
      showAlert("Login Notice", errorMsg);
    }
  };

  const handleLogout = async () => {
    try {
      if (token) await api.post("/api/auth/logout", {}, token);
    } catch (err) {
      // Continue client cleanup
    } finally {
      setToken("");
      setCurrentUser(null);
      setMyStudent(null);
      setMyCompany(null);
      setPredictionResult(null);
      setRecommendedJobs([]);
      setJobsList([]);
      setStudentSkillsList([]);
      setSelectedJobIdForSkill(null);
    }
  };

  // --- Student Workflows ---
  const saveStudentProfile = async () => {
    try {
      setLoading(true);
      await api.patch(
        "/api/students/me/profile",
        {
          cgpa: studentProfile.cgpa ? parseFloat(studentProfile.cgpa) : null,
          ssc_marks: studentProfile.ssc_marks ? parseFloat(studentProfile.ssc_marks) : null,
          hsc_marks: studentProfile.hsc_marks ? parseFloat(studentProfile.hsc_marks) : null,
          internships: studentProfile.internships ? parseInt(studentProfile.internships) : 0,
          projects: studentProfile.projects ? parseInt(studentProfile.projects) : 0,
          workshops_certifications: studentProfile.workshops_certifications
            ? parseInt(studentProfile.workshops_certifications)
            : 0,
          aptitude_test_score: studentProfile.aptitude_test_score
            ? parseFloat(studentProfile.aptitude_test_score)
            : null,
          soft_skills_rating: studentProfile.soft_skills_rating
            ? parseFloat(studentProfile.soft_skills_rating)
            : null,
          extracurricular_activities: studentProfile.extracurricular_activities || null,
          placement_training: studentProfile.placement_training || null,
        },
        token
      );
      showAlert("Success", "Profile details persisted to database.");
    } catch (err: any) {
      showAlert("Save Error", err.message);
    } finally {
      setLoading(false);
    }
  };

  const runPrediction = async () => {
    try {
      setLoading(true);
      const res = await api.post("/api/students/me/predict", {}, token);
      setPredictionResult({
        status: res.predicted_status,
        score: res.model_score,
      });
      showAlert(
        "Placement Analysis",
        `Prediction: ${res.predicted_status}\nScore: ${(res.model_score * 100).toFixed(1)}%`
      );
    } catch (err: any) {
      showAlert("Prediction Failed", err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchStudentSkills = async () => {
    if (!token) return;
    try {
      setFetchingSkills(true);
      const data = await api.get("/api/students/me/skills", token);
      setStudentSkillsList(data || []);
    } catch (err) {
      console.log("Error loading student skills:", err);
    } finally {
      setFetchingSkills(false);
    }
  };

  const addStudentSkill = async () => {
    if (!newSkill.trim()) {
      showAlert("Input Required", "Please enter a skill name.");
      return;
    }
    const level = parseInt(skillProficiency);
    if (isNaN(level) || level < 1 || level > 5) {
      showAlert("Invalid Level", "Proficiency level must be between 1 and 5.");
      return;
    }

    try {
      setLoading(true);
      await api.post(
        "/api/students/me/skills",
        {
          skill_name: newSkill.trim(),
          level: level,
        },
        token
      );
      setNewSkill("");
      setSkillProficiency("");
      showAlert("Skill Added", `Saved "${newSkill.trim()}" at level ${level}.`);
      await fetchStudentSkills();
      fetchRecommendations();
    } catch (err: any) {
      showAlert("Skill Error", err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchRecommendations = async () => {
    try {
      setLoading(true);
      let s = myStudent;
      if (!s) {
        s = await api.get("/api/students/me", token);
        setMyStudent(s);
      }
      const recs = await api.get(`/api/students/${s.student_id}/recommendations`, token);
      // Retains all jobs with > 0% cosine match across all companies
      const matchedOnly = recs.filter((j: any) => j.match_score > 0);
      setRecommendedJobs(matchedOnly);
    } catch (err: any) {
      console.log(err);
    } finally {
      setLoading(false);
    }
  };

  const applyForJob = async (jobId: number) => {
    try {
      setLoading(true);
      let s = myStudent;
      if (!s) {
        s = await api.get("/api/students/me", token);
        setMyStudent(s);
      }
      await api.post(
        "/api/applications",
        {
          student_id: s.student_id,
          job_id: jobId,
        },
        token
      );
      showAlert("Application Sent", "Successfully submitted application.");
    } catch (err: any) {
      showAlert("Application Error", err.message);
    } finally {
      setLoading(false);
    }
  };
  const createJobPost = async () => {
    if (!newJob.job_title.trim()) {
      showAlert("Missing Fields", "Please enter a valid job title.");
      return;
    }
    if (!myCompany?.company_id) {
      showAlert("Profile Loading", "Please wait for your recruiter company profile to load.");
      return;
    }
    try {
      setLoading(true);
      const res = await api.post(
        "/api/jobs",
        {
          company_id: myCompany.company_id,
          job_title: newJob.job_title.trim(),
          job_description: newJob.job_description.trim() || null,
          job_type: newJob.job_type.trim() || "FULL_TIME",
          min_cgpa: newJob.min_cgpa ? parseFloat(newJob.min_cgpa) : null,
          max_backlogs: newJob.max_backlogs ? parseInt(newJob.max_backlogs) : 0,
          salary_lpa: newJob.salary_lpa ? parseFloat(newJob.salary_lpa) : null,
          location: newJob.location.trim() || null,
          graduation_year: newJob.graduation_year ? parseInt(newJob.graduation_year) : null,
          deadline: newJob.deadline.trim() || null,
          job_status: "OPEN",
        },
        token
      );
      showAlert("Job Created", `Job #${res.job_id} posted. Now specify required skills.`);
      setSelectedJobIdForSkill(res.job_id);
      setNewJob({
        job_title: "",
        job_description: "",
        job_type: "",
        min_cgpa: "",
        max_backlogs: "",
        salary_lpa: "",
        location: "",
        graduation_year: "",
        deadline: "",
      });
      fetchRecruiterData();
    } catch (err: any) {
      showAlert("Creation Error", err.message);
    } finally {
      setLoading(false);
    }
  };
  const attachSkillToJob = async () => {
    if (!selectedJobIdForSkill || !jobSkillName.trim()) {
      showAlert("Missing Info", "Select a job first and specify a skill requirement.");
      return;
    }
    try {
      setLoading(true);
      await api.post(
        `/api/jobs/${selectedJobIdForSkill}/skills`,
        {
          skill_name: jobSkillName.trim(),
          required_level: parseInt(jobSkillLevel) || 3,
          importance: parseInt(jobSkillImportance) || 50,
        },
        token
      );
      setJobSkillName("");
      setJobSkillLevel("");
      setJobSkillImportance("");
      showAlert("Success", "Required skill attached to job.");
      fetchRecruiterData();
    } catch (err: any) {
      showAlert("Attach Failed", err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      if (activeRole === "STUDENT") {
        fetchStudentSkills();
        fetchRecommendations();
      } else {
        fetchRecruiterData();
      }
    }
  }, [token, activeRole]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#4C1D95" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoLetter}>C</Text>
          </View>
          <Text style={styles.logoText}>CareerSync</Text>
        </View>
        {token ? (
          <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
            <Text style={styles.logoutButtonText}>Logout</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Authentication View */}
      {!token ? (
        <ScrollView contentContainerStyle={styles.authContainer}>
          <View style={styles.authCard}>
            <View style={styles.authToggleRow}>
              <TouchableOpacity
                style={[styles.authToggleBtn, authMode === "LOGIN" && styles.authToggleBtnActive]}
                onPress={() => setAuthMode("LOGIN")}
              >
                <Text style={[styles.authToggleText, authMode === "LOGIN" && styles.authToggleTextActive]}>
                  Sign In
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.authToggleBtn, authMode === "REGISTER" && styles.authToggleBtnActive]}
                onPress={() => setAuthMode("REGISTER")}
              >
                <Text style={[styles.authToggleText, authMode === "REGISTER" && styles.authToggleTextActive]}>
                  Create Account
                </Text>
              </TouchableOpacity>
            </View>

            {authMode === "REGISTER" ? (
              <View>
                <Text style={styles.label}>Account Role:</Text>
                <View style={styles.rolePickerRow}>
                  <TouchableOpacity
                    style={[styles.roleOption, registerRole === "STUDENT" && styles.roleOptionActive]}
                    onPress={() => setRegisterRole("STUDENT")}
                  >
                    <Text style={[styles.roleOptionText, registerRole === "STUDENT" && styles.roleOptionTextActive]}>
                      Student
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.roleOption, registerRole === "RECRUITER" && styles.roleOptionActive]}
                    onPress={() => setRegisterRole("RECRUITER")}
                  >
                    <Text style={[styles.roleOptionText, registerRole === "RECRUITER" && styles.roleOptionTextActive]}>
                      Recruiter
                    </Text>
                  </TouchableOpacity>
                </View>

                {registerRole === "STUDENT" ? (
                  <>
                    <Text style={styles.label}>Full Name</Text>
                    <TextInput
                      style={styles.input}
                      value={regFullName}
                      onChangeText={setRegFullName}
                      placeholder="e.g. John Doe"
                      placeholderTextColor="#94A3B8"
                    />
                    <View style={styles.rowInputs}>
                      <View style={styles.flexHalf}>
                        <Text style={styles.label}>Branch</Text>
                        <TextInput
                          style={styles.input}
                          value={regBranch}
                          onChangeText={setRegBranch}
                          placeholder="e.g. CSE"
                          placeholderTextColor="#94A3B8"
                        />
                      </View>
                      <View style={styles.flexHalf}>
                        <Text style={styles.label}>Graduation Year</Text>
                        <TextInput
                          style={styles.input}
                          value={regGradYear}
                          onChangeText={setRegGradYear}
                          keyboardType="numeric"
                          placeholder="e.g. 2027"
                          placeholderTextColor="#94A3B8"
                        />
                      </View>
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={styles.label}>Company Name</Text>
                    <TextInput
                      style={styles.input}
                      value={regCompanyName}
                      onChangeText={setRegCompanyName}
                      placeholder="e.g. Tata Consultancy Services"
                      placeholderTextColor="#94A3B8"
                    />
                    <View style={styles.rowInputs}>
                      <View style={styles.flexHalf}>
                        <Text style={styles.label}>Industry</Text>
                        <TextInput
                          style={styles.input}
                          value={regIndustry}
                          onChangeText={setRegIndustry}
                          placeholder="e.g. IT / Software"
                          placeholderTextColor="#94A3B8"
                        />
                      </View>
                      <View style={styles.flexHalf}>
                        <Text style={styles.label}>Location</Text>
                        <TextInput
                          style={styles.input}
                          value={regLocation}
                          onChangeText={setRegLocation}
                          placeholder="e.g. Kolkata / Bengaluru"
                          placeholderTextColor="#94A3B8"
                        />
                      </View>
                    </View>
                  </>
                )}

                <Text style={styles.label}>Email Address</Text>
                <TextInput
                  style={styles.input}
                  value={authEmail}
                  onChangeText={setAuthEmail}
                  placeholder="e.g. user@test.com"
                  placeholderTextColor="#94A3B8"
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
                <Text style={styles.label}>Password (min 8 chars)</Text>
                <TextInput
                  style={styles.input}
                  value={authPassword}
                  onChangeText={setAuthPassword}
                  placeholder="••••••••"
                  placeholderTextColor="#94A3B8"
                  secureTextEntry
                />

                <TouchableOpacity style={styles.primaryButton} onPress={handleRegister} disabled={loading}>
                  {loading ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Register & Enter Portal</Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              <View>
                <Text style={styles.label}>Email Address</Text>
                <TextInput
                  style={styles.input}
                  value={authEmail}
                  onChangeText={setAuthEmail}
                  placeholder="e.g. user@test.com"
                  placeholderTextColor="#94A3B8"
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
                <Text style={styles.label}>Password</Text>
                <TextInput
                  style={styles.input}
                  value={authPassword}
                  onChangeText={setAuthPassword}
                  placeholder="••••••••"
                  placeholderTextColor="#94A3B8"
                  secureTextEntry
                />
                <TouchableOpacity style={styles.primaryButton} onPress={handleLogin} disabled={loading}>
                  {loading ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Sign In</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>
          {/* Personalized User Greeting Banner */}
          <View style={styles.greetingHeader}>
            <View>
              <Text style={styles.greetingTitle}>
                Hi,{" "}
                {activeRole === "STUDENT"
                  ? myStudent?.full_name || currentUser?.email || "Student"
                  : myCompany?.company_name || currentUser?.email || "Recruiter"}
              </Text>
              <Text style={styles.greetingSubtitle}>
                {activeRole === "STUDENT"
                  ? "Explore job matches & view your placement prediction."
                  : "Manage your company openings & skill requirement vectors."}
              </Text>
            </View>
            <View style={styles.roleBadgeHeader}>
              <Text style={styles.roleBadgeHeaderText}>{activeRole}</Text>
            </View>
          </View>

          {/* Top Switcher */}
          <View style={styles.tabContainer}>
  <View style={[styles.tabButton, styles.activeTabButton]}>
    <Text style={[styles.tabText, styles.activeTabText]}>
      {currentUser?.role === "STUDENT" ? "Student Portal" : "Recruiter Portal"}
    </Text>
  </View>
</View>

          <ScrollView contentContainerStyle={styles.scrollContent}>
            {activeRole === "STUDENT" ? (
              /* ==================== STUDENT VIEW ==================== */
              <View>
                {predictionResult && (
                  <View
                    style={[
                      styles.predictionBanner,
                      predictionResult.status === "Placed"
                        ? styles.placedBanner
                        : styles.notPlacedBanner,
                    ]}
                  >
                    <Text style={styles.predictionStatusText}>
                      Result: {predictionResult.status.toUpperCase()}
                    </Text>
                    <Text style={styles.predictionScoreText}>
                      Model Match Probability: {(predictionResult.score * 100).toFixed(2)}%
                    </Text>
                  </View>
                )}

                {/* Profile Card */}
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Academic & Placement Metrics</Text>
                  <Text style={styles.cardSubtitle}>
                    Stored in Oracle CS_STUDENTS and used for Placement ML Prediction
                  </Text>

                  <View style={styles.rowInputs}>
                    <View style={styles.flexHalf}>
                      <Text style={styles.label}>CGPA</Text>
                      <TextInput
                        style={styles.input}
                        value={studentProfile.cgpa}
                        onChangeText={(v) => setStudentProfile({ ...studentProfile, cgpa: v })}
                        placeholder="e.g. 8.5"
                        placeholderTextColor="#94A3B8"
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={styles.flexHalf}>
                      <Text style={styles.label}>Internships</Text>
                      <TextInput
                        style={styles.input}
                        value={studentProfile.internships}
                        onChangeText={(v) =>
                          setStudentProfile({ ...studentProfile, internships: v })
                        }
                        placeholder="e.g. 2"
                        placeholderTextColor="#94A3B8"
                        keyboardType="numeric"
                      />
                    </View>
                  </View>

                  <View style={styles.rowInputs}>
                    <View style={styles.flexHalf}>
                      <Text style={styles.label}>Projects</Text>
                      <TextInput
                        style={styles.input}
                        value={studentProfile.projects}
                        onChangeText={(v) => setStudentProfile({ ...studentProfile, projects: v })}
                        placeholder="e.g. 3"
                        placeholderTextColor="#94A3B8"
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={styles.flexHalf}>
                      <Text style={styles.label}>Certifications</Text>
                      <TextInput
                        style={styles.input}
                        value={studentProfile.workshops_certifications}
                        onChangeText={(v) =>
                          setStudentProfile({
                            ...studentProfile,
                            workshops_certifications: v,
                          })
                        }
                        placeholder="e.g. 1"
                        placeholderTextColor="#94A3B8"
                        keyboardType="numeric"
                      />
                    </View>
                  </View>

                  <View style={styles.rowInputs}>
                    <View style={styles.flexHalf}>
                      <Text style={styles.label}>SSC Marks (%)</Text>
                      <TextInput
                        style={styles.input}
                        value={studentProfile.ssc_marks}
                        onChangeText={(v) => setStudentProfile({ ...studentProfile, ssc_marks: v })}
                        placeholder="e.g. 85"
                        placeholderTextColor="#94A3B8"
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={styles.flexHalf}>
                      <Text style={styles.label}>HSC Marks (%)</Text>
                      <TextInput
                        style={styles.input}
                        value={studentProfile.hsc_marks}
                        onChangeText={(v) => setStudentProfile({ ...studentProfile, hsc_marks: v })}
                        placeholder="e.g. 80"
                        placeholderTextColor="#94A3B8"
                        keyboardType="numeric"
                      />
                    </View>
                  </View>
                <View style={styles.rowInputs}>
  <View style={styles.flexHalf}>
    <Text style={styles.label}>Aptitude Score (%)</Text>
    <TextInput
      style={styles.input}
      value={studentProfile.aptitude_test_score}
      onChangeText={(v) =>
        setStudentProfile({ ...studentProfile, aptitude_test_score: v })
      }
      placeholder="e.g. 85"
      placeholderTextColor="#94A3B8"
      keyboardType="numeric"
    />
  </View>
  <View style={styles.flexHalf}>
    <Text style={styles.label}>Soft Skills (1-5)</Text>
    <TextInput
      style={styles.input}
      value={studentProfile.soft_skills_rating}
      onChangeText={(v) =>
        setStudentProfile({ ...studentProfile, soft_skills_rating: v })
      }
      placeholder="e.g. 4.5"
      placeholderTextColor="#94A3B8"
      keyboardType="numeric"
    />
  </View>
</View>
                  <View style={styles.rowInputs}>
                    <View style={styles.flexHalf}>
                      <Text style={styles.label}>Extracurricular (Yes/No)</Text>
                      <TextInput
                        style={styles.input}
                        value={studentProfile.extracurricular_activities}
                        onChangeText={(v) =>
                          setStudentProfile({
                            ...studentProfile,
                            extracurricular_activities: v,
                          })
                        }
                        placeholder="Yes or No"
                        placeholderTextColor="#94A3B8"
                      />
                    </View>
                    <View style={styles.flexHalf}>
                      <Text style={styles.label}>Placement Training</Text>
                      <TextInput
                        style={styles.input}
                        value={studentProfile.placement_training}
                        onChangeText={(v) =>
                          setStudentProfile({
                            ...studentProfile,
                            placement_training: v,
                          })
                        }
                        placeholder="Yes or No"
                        placeholderTextColor="#94A3B8"
                      />
                    </View>
                  </View>

                  <View style={styles.rowButtons}>
                    <TouchableOpacity
                      style={[styles.actionButton, styles.outlineButton]}
                      onPress={saveStudentProfile}
                    >
                      <Text style={styles.outlineButtonText}>Save Details</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionButton, styles.primaryButton]}
                      onPress={runPrediction}
                    >
                      <Text style={styles.primaryButtonText}>Run Placement ML</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Add Candidate Skill with Awareness Section */}
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Add Candidate Skill</Text>
                  <Text style={styles.cardSubtitle}>
                    Calculates Cosine Similarity matches with active recruiter job requirements[cite: 30].
                  </Text>

                  <View style={styles.rowInputs}>
                    <View style={{ flex: 2, marginRight: 8 }}>
                      <Text style={styles.label}>Skill Name</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="e.g. Python, Linux, SQL"
                        placeholderTextColor="#94A3B8"
                        value={newSkill}
                        onChangeText={setNewSkill}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>Level (1-5)</Text>
                      <TextInput
                        style={styles.input}
                        value={skillProficiency}
                        onChangeText={setSkillProficiency}
                        placeholder="1-5"
                        placeholderTextColor="#94A3B8"
                        keyboardType="numeric"
                      />
                    </View>
                  </View>

                  <TouchableOpacity style={styles.primaryButton} onPress={addStudentSkill}>
                    <Text style={styles.primaryButtonText}>Save Skill & Re-rank Jobs</Text>
                  </TouchableOpacity>

                  {/* Registered Competencies Display */}
                  <View style={styles.awarenessSection}>
                    <View style={styles.awarenessHeader}>
                      <Text style={styles.awarenessTitle}>
                        Your Registered Competencies ({studentSkillsList.length})
                      </Text>
                      {fetchingSkills && <ActivityIndicator size="small" color="#4C1D95" />}
                    </View>

                    {studentSkillsList.length === 0 ? (
                      <View style={styles.emptySkillsBox}>
                        <Text style={styles.emptySkillsText}>
                          No skills added yet. Use the input boxes above to register competencies and trigger matching against vacancies.
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.skillsBadgeContainer}>
                        {studentSkillsList.map((skill) => (
                          <View key={skill.skill_id} style={styles.studentSkillBadge}>
                            <Text style={styles.studentSkillBadgeName}>{skill.skill_name}</Text>
                            <View style={styles.proficiencyTag}>
                              <Text style={styles.proficiencyText}>Level {skill.proficiency}</Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                </View>

                {/* Recommendations */}
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionHeading}>Recommended For You</Text>
                  <TouchableOpacity onPress={fetchRecommendations}>
                    <Text style={styles.refreshText}>Refresh</Text>
                  </TouchableOpacity>
                </View>

                {recommendedJobs.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>No matching jobs found.</Text>
                    <Text style={styles.emptySubText}>
                      Enter your skills above (e.g. Network Security, Python) to match with active recruiter postings.
                    </Text>
                  </View>
                ) : (
                  recommendedJobs.map((job) => (
                    <View key={job.job_id} style={styles.jobCard}>
                      <View style={styles.jobCardTop}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.companyName}>{job.company_name}</Text>
                          <Text style={styles.jobTitle}>{job.job_title}</Text>
                          <Text style={styles.jobSalary}>₹{job.salary_lpa} LPA</Text>
                        </View>
                        <View style={styles.matchScoreBadge}>
                          <Text style={styles.matchScoreVal}>{job.match_score}%</Text>
                          <Text style={styles.matchScoreLbl}>Match</Text>
                        </View>
                      </View>
                      <View style={styles.jobCardFooter}>
                        <View style={styles.tag}>
                          <Text style={styles.tagText}>{job.location || "Remote"}</Text>
                        </View>
                        <TouchableOpacity
                          style={styles.applyBtn}
                          onPress={() => applyForJob(job.job_id)}
                        >
                          <Text style={styles.applyBtnText}>Apply Now</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))
                )}
              </View>
            ) : (
              /* ==================== RECRUITER VIEW ==================== */
              <View>
                {/* Post Job */}
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Post New Campus Opening</Text>
                  <Text style={styles.cardSubtitle}>
                    {myCompany
                      ? `Posting for: ${myCompany.company_name}`
                      : "Create openings for registered students"}
                  </Text>

                  <Text style={styles.label}>Job Title</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. Data Analyst, ML Engineer"
                    placeholderTextColor="#94A3B8"
                    value={newJob.job_title}
                    onChangeText={(v) => setNewJob({ ...newJob, job_title: v })}
                  />

                  <Text style={styles.label}>Job Description</Text>
                  <TextInput
                    style={[styles.input, { height: 60 }]}
                    multiline
                    placeholder="e.g. Build pipelines and ML models"
                    placeholderTextColor="#94A3B8"
                    value={newJob.job_description}
                    onChangeText={(v) => setNewJob({ ...newJob, job_description: v })}
                  />

                  <View style={styles.rowInputs}>
                    <View style={styles.flexHalf}>
                      <Text style={styles.label}>Salary (LPA)</Text>
                      <TextInput
                        style={styles.input}
                        value={newJob.salary_lpa}
                        onChangeText={(v) => setNewJob({ ...newJob, salary_lpa: v })}
                        placeholder="e.g. 10.0"
                        placeholderTextColor="#94A3B8"
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={styles.flexHalf}>
                      <Text style={styles.label}>Min CGPA</Text>
                      <TextInput
                        style={styles.input}
                        value={newJob.min_cgpa}
                        onChangeText={(v) => setNewJob({ ...newJob, min_cgpa: v })}
                        placeholder="e.g. 7.0"
                        placeholderTextColor="#94A3B8"
                        keyboardType="numeric"
                      />
                    </View>
                  </View>

                  <TouchableOpacity style={styles.primaryButton} onPress={createJobPost}>
                    <Text style={styles.primaryButtonText}>Publish Job</Text>
                  </TouchableOpacity>
                </View>

                {/* Attach Skills to Job */}
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Configure Cosine Vector Requirements</Text>
                  <Text style={styles.cardSubtitle}>
                    Active Target Job ID:{" "}
                    {selectedJobIdForSkill
                      ? `#${selectedJobIdForSkill}`
                      : "None selected (click 'Select' on a job below)"}
                  </Text>

                  <Text style={styles.label}>Required Skill Name</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. Python, SQL, React"
                    placeholderTextColor="#94A3B8"
                    value={jobSkillName}
                    onChangeText={setJobSkillName}
                  />

                  <View style={styles.rowInputs}>
                    <View style={styles.flexHalf}>
                      <Text style={styles.label}>Required Level (1-5)</Text>
                      <TextInput
                        style={styles.input}
                        value={jobSkillLevel}
                        onChangeText={setJobSkillLevel}
                        placeholder="e.g. 4"
                        placeholderTextColor="#94A3B8"
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={styles.flexHalf}>
                      <Text style={styles.label}>Weight / Importance (1-100)</Text>
                      <TextInput
                        style={styles.input}
                        value={jobSkillImportance}
                        onChangeText={setJobSkillImportance}
                        placeholder="e.g. 90"
                        placeholderTextColor="#94A3B8"
                        keyboardType="numeric"
                      />
                    </View>
                  </View>

                  <TouchableOpacity style={styles.primaryButton} onPress={attachSkillToJob}>
                    <Text style={styles.primaryButtonText}>Attach Requirement to Job</Text>
                  </TouchableOpacity>
                </View>

                {/* Posted Openings Header */}
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionHeading}>Current Posted Openings</Text>
                  <TouchableOpacity onPress={fetchRecruiterData}>
                    <Text style={styles.refreshText}>Refresh</Text>
                  </TouchableOpacity>
                </View>

                {/* Recruiter Empty State vs List */}
                {jobsList.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>No posted openings yet.</Text>
                    <Text style={styles.emptySubText}>
                      Publish your first job vacancy above to start receiving student applications.
                    </Text>
                  </View>
                ) : (
                  jobsList.map((j) => (
                    <View key={j.job_id} style={styles.jobCard}>
                      <View style={styles.jobCardTop}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.companyName}>Job ID: #{j.job_id}</Text>
                          <Text style={styles.jobTitle}>{j.job_title}</Text>
                          <Text style={styles.jobSalary}>
                            ₹{j.salary_lpa} LPA • Min CGPA: {j.min_cgpa}
                          </Text>

                          {/* Required Skills Badges */}
                          <View style={styles.skillsContainer}>
                            {j.skills ? (
                              j.skills.split(", ").map((skillStr: string, idx: number) => (
                                <View key={idx} style={styles.skillBadge}>
                                  <Text style={styles.skillBadgeText}>{skillStr}</Text>
                                </View>
                              ))
                            ) : (
                              <Text style={styles.noSkillsText}>No required skills attached yet</Text>
                            )}
                          </View>
                        </View>

                        <TouchableOpacity
                          style={[
                            styles.selectJobBtn,
                            selectedJobIdForSkill === j.job_id && styles.selectJobBtnActive,
                          ]}
                          onPress={() => setSelectedJobIdForSkill(j.job_id)}
                        >
                          <Text
                            style={[
                              styles.selectJobText,
                              selectedJobIdForSkill === j.job_id && styles.selectJobTextActive,
                            ]}
                          >
                            {selectedJobIdForSkill === j.job_id ? "Active" : "Select"}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))
                )}
              </View>
            )}
          </ScrollView>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  header: {
    backgroundColor: "#4C1D95",
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  logoBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  logoLetter: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#4C1D95",
  },
  logoText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  logoutButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 6,
  },
  logoutButtonText: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 12,
  },
  greetingHeader: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  greetingTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
  },
  greetingSubtitle: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  roleBadgeHeader: {
    backgroundColor: "#EDE9FE",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  roleBadgeHeaderText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#4C1D95",
  },
  authContainer: {
    padding: 20,
    justifyContent: "center",
    flexGrow: 1,
  },
  authCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  authToggleRow: {
    flexDirection: "row",
    backgroundColor: "#F1F5F9",
    borderRadius: 8,
    padding: 4,
    marginBottom: 16,
  },
  authToggleBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 6,
  },
  authToggleBtnActive: {
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  authToggleText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
  },
  authToggleTextActive: {
    color: "#4C1D95",
  },
  rolePickerRow: {
    flexDirection: "row",
    marginBottom: 12,
    marginTop: 4,
  },
  roleOption: {
    flex: 1,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    alignItems: "center",
    marginHorizontal: 4,
  },
  roleOptionActive: {
    borderColor: "#4C1D95",
    backgroundColor: "#EDE9FE",
  },
  roleOptionText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
  },
  roleOptionTextActive: {
    color: "#4C1D95",
  },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  tabButton: {
    flex: 1,
    paddingVertical: 14,
    alignItems: "center",
  },
  activeTabButton: {
    borderBottomWidth: 3,
    borderBottomColor: "#4C1D95",
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748B",
  },
  activeTabText: {
    color: "#4C1D95",
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  cardSubtitle: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
    marginBottom: 14,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: "#334155",
    marginBottom: 4,
    marginTop: 8,
  },
  input: {
    backgroundColor: "#F1F5F9",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: "#0F172A",
  },
  rowInputs: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  flexHalf: {
    flex: 0.48,
  },
  rowButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 16,
  },
  actionButton: {
    flex: 0.48,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButton: {
    backgroundColor: "#4C1D95",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 14,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  outlineButton: {
    borderWidth: 1.5,
    borderColor: "#4C1D95",
    backgroundColor: "#FFFFFF",
  },
  outlineButtonText: {
    color: "#4C1D95",
    fontSize: 14,
    fontWeight: "700",
  },
  predictionBanner: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    alignItems: "center",
  },
  placedBanner: {
    backgroundColor: "#DCFCE7",
    borderColor: "#16A34A",
    borderWidth: 1,
  },
  notPlacedBanner: {
    backgroundColor: "#FEE2E2",
    borderColor: "#DC2626",
    borderWidth: 1,
  },
  predictionStatusText: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
  },
  predictionScoreText: {
    fontSize: 13,
    color: "#334155",
    marginTop: 4,
  },
  awarenessSection: {
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  awarenessHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  awarenessTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#334155",
  },
  emptySkillsBox: {
    backgroundColor: "#F8FAFC",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  emptySkillsText: {
    fontSize: 12,
    color: "#94A3B8",
    lineHeight: 18,
  },
  skillsBadgeContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  studentSkillBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EDE9FE",
    borderRadius: 8,
    paddingLeft: 10,
    paddingRight: 6,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: "#DDD6FE",
  },
  studentSkillBadgeName: {
    fontSize: 13,
    fontWeight: "600",
    color: "#4C1D95",
    marginRight: 8,
  },
  proficiencyTag: {
    backgroundColor: "#6D28D9",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  proficiencyText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
    marginBottom: 12,
  },
  sectionHeading: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
  },
  refreshText: {
    color: "#4C1D95",
    fontWeight: "600",
    fontSize: 13,
  },
  emptyContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginVertical: 8,
  },
  emptyText: {
    color: "#475569",
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
  },
  emptySubText: {
    color: "#94A3B8",
    fontSize: 12,
    textAlign: "center",
    marginTop: 6,
    lineHeight: 18,
  },
  jobCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  jobCardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  companyName: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "600",
  },
  jobTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
    marginTop: 2,
  },
  jobSalary: {
    fontSize: 13,
    color: "#059669",
    fontWeight: "600",
    marginTop: 4,
  },
  matchScoreBadge: {
    backgroundColor: "#EDE9FE",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: "center",
  },
  matchScoreVal: {
    fontSize: 14,
    fontWeight: "800",
    color: "#4C1D95",
  },
  matchScoreLbl: {
    fontSize: 10,
    color: "#6D28D9",
    fontWeight: "600",
  },
  jobCardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  tag: {
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  tagText: {
    fontSize: 11,
    color: "#475569",
    fontWeight: "500",
  },
  applyBtn: {
    backgroundColor: "#4C1D95",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
  },
  applyBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },
  selectJobBtn: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  selectJobBtnActive: {
    backgroundColor: "#4C1D95",
    borderColor: "#4C1D95",
  },
  selectJobText: {
    fontSize: 12,
    color: "#475569",
    fontWeight: "600",
  },
  selectJobTextActive: {
    color: "#FFFFFF",
  },
  skillsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 8,
    gap: 6,
  },
  skillBadge: {
    backgroundColor: "#EDE9FE",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#DDD6FE",
  },
  skillBadgeText: {
    fontSize: 11,
    color: "#6D28D9",
    fontWeight: "600",
  },
  noSkillsText: {
    fontSize: 11,
    color: "#94A3B8",
    fontStyle: "italic",
    marginTop: 4,
  },
});