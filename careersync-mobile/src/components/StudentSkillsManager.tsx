import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from "react-native";

export interface SkillItem {
  skill_id: number;
  skill_name: string;
  proficiency: number;
}

interface StudentSkillsManagerProps {
  token: string;
  api: {
    get: (endpoint: string, token?: string) => Promise<any>;
    post: (endpoint: string, body: any, token?: string) => Promise<any>;
  };
  showAlert: (title: string, message?: string) => void;
  onSkillsUpdated: () => void;
}

export default function StudentSkillsManager({
  token,
  api,
  showAlert,
  onSkillsUpdated,
}: StudentSkillsManagerProps) {
  const [skillsList, setSkillsList] = useState<SkillItem[]>([]);
  const [newSkill, setNewSkill] = useState("");
  const [skillProficiency, setSkillProficiency] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetchingSkills, setFetchingSkills] = useState(false);

  // Fetch all competencies currently saved for the logged-in student in Oracle
  const fetchMySkills = async () => {
    if (!token) return;
    try {
      setFetchingSkills(true);
      const data = await api.get("/api/students/me/skills", token);
      setSkillsList(data || []);
    } catch (err) {
      console.log("Could not load skills list:", err);
    } finally {
      setFetchingSkills(false);
    }
  };

  useEffect(() => {
    fetchMySkills();
  }, [token]);

  // Handle saving a new competency to Oracle DB via POST /api/students/me/skills
  const handleAddSkill = async () => {
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
      showAlert("Skill Saved", `Added "${newSkill.trim()}" at level ${level}.`);

      // Refresh both the displayed skills badges and job recommendation rankings
      await fetchMySkills();
      onSkillsUpdated();
    } catch (err: any) {
      showAlert("Skill Error", err.message || "Failed to persist skill.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Add Candidate Skill</Text>
      <Text style={styles.cardSubtitle}>
        Calculates Cosine Similarity matches with active recruiter job requirements.
      </Text>

      {/* 1. Skill Input Form (Kept fully interactive for student) */}
      <View style={styles.rowInputs}>
        <View style={{ flex: 2, marginRight: 8 }}>
          <Text style={styles.label}>Skill Name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Python, SQL, React"
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

      <TouchableOpacity
        style={styles.primaryButton}
        onPress={handleAddSkill}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.primaryButtonText}>Save Skill & Re-rank Jobs</Text>
        )}
      </TouchableOpacity>

      {/* 2. Added Skills Awareness Section (Directly underneath form) */}
      <View style={styles.awarenessSection}>
        <View style={styles.awarenessHeader}>
          <Text style={styles.awarenessTitle}>
            Your Registered Competencies ({skillsList.length})
          </Text>
          {fetchingSkills && <ActivityIndicator size="small" color="#4C1D95" />}
        </View>

        {skillsList.length === 0 ? (
          <View style={styles.emptySkillsBox}>
            <Text style={styles.emptySkillsText}>
              No skills added yet. Use the input boxes above to register your skills and view personalized job matches.
            </Text>
          </View>
        ) : (
          <View style={styles.skillsBadgeContainer}>
            {skillsList.map((skill) => (
              <View key={skill.skill_id} style={styles.skillBadge}>
                <Text style={styles.skillBadgeName}>{skill.skill_name}</Text>
                <View style={styles.proficiencyTag}>
                  <Text style={styles.proficiencyText}>Level {skill.proficiency}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
  skillBadge: {
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
  skillBadgeName: {
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
});