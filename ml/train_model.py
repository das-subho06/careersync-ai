
from pathlib import Path
import json

import joblib
import pandas as pd

from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.neural_network import MLPClassifier
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    roc_auc_score,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler


# --------------------------------------------------
# 1. Paths
# --------------------------------------------------

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"
ARTIFACT_DIR = PROJECT_ROOT / "ml" / "artifacts"

ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)

TRAIN_FILE = DATA_DIR / "train.csv"
VALIDATION_FILE = DATA_DIR / "validation.csv"
TEST_FILE = DATA_DIR / "test.csv"

TARGET = "PlacementStatus"

# Exclude aptitude and soft-skills ratings because we
# don't want to require those scores from every student.
NUMERIC_FEATURES = [
    "CGPA",
    "Internships",
    "Projects",
    "Workshops/Certifications",
    "SSC_Marks",
    "HSC_Marks",
]

CATEGORICAL_FEATURES = [
    "ExtracurricularActivities",
    "PlacementTraining",
]

FEATURES = NUMERIC_FEATURES + CATEGORICAL_FEATURES


# --------------------------------------------------
# 2. Load and validate the datasets
# --------------------------------------------------

def load_dataset(path):
    if not path.exists():
        raise FileNotFoundError(f"Dataset not found: {path}")

    df = pd.read_csv(path)

    required = FEATURES + [TARGET]
    missing = [column for column in required if column not in df.columns]

    if missing:
        raise ValueError(
            f"{path.name} is missing columns: {missing}\n"
            f"Available columns: {df.columns.tolist()}"
        )

    # Use only features available to our model.
    df = df[required].copy()

    # Normalize categorical text and missing-value markers.
    for column in CATEGORICAL_FEATURES + [TARGET]:
        df[column] = df[column].apply(
            lambda value: value.strip() if isinstance(value, str) else value
        )

    df[TARGET] = df[TARGET].replace("", pd.NA)
    df = df.dropna(subset=[TARGET])

    # Normalize target labels.
    df[TARGET] = df[TARGET].astype(str).str.lower()

    label_map = {
        "placed": "Placed",
        "notplaced": "NotPlaced",
        "not placed": "NotPlaced",
    }

    df[TARGET] = df[TARGET].map(label_map)

    if df[TARGET].isna().any():
        invalid = df.loc[df[TARGET].isna(), TARGET].unique()
        raise ValueError(f"Unexpected target labels in {path.name}: {invalid}")

    # Treat common textual missing markers as missing.
    df = df.replace(
        ["", "NA", "N/A", "null", "None"],
        pd.NA
    )

    return df


train_df = load_dataset(TRAIN_FILE)
validation_df = load_dataset(VALIDATION_FILE)
test_df = load_dataset(TEST_FILE)

X_train = train_df[FEATURES]
y_train = train_df[TARGET]

X_validation = validation_df[FEATURES]
y_validation = validation_df[TARGET]

X_test = test_df[FEATURES]
y_test = test_df[TARGET]

print("Dataset sizes")
print("------------------------------")
print(f"Training:   {len(train_df)}")
print(f"Validation: {len(validation_df)}")
print(f"Testing:    {len(test_df)}")
print(f"Features:   {FEATURES}")
print("\nTraining target distribution:")
print(y_train.value_counts())


# --------------------------------------------------
# 3. Preprocessing
# --------------------------------------------------

numeric_pipeline = Pipeline([
    ("imputer", SimpleImputer(strategy="median")),
    ("scaler", StandardScaler()),
])

categorical_pipeline = Pipeline([
    ("imputer", SimpleImputer(strategy="most_frequent")),
    ("encoder", OneHotEncoder(handle_unknown="ignore")),
])

preprocessor = ColumnTransformer([
    ("numeric", numeric_pipeline, NUMERIC_FEATURES),
    ("categorical", categorical_pipeline, CATEGORICAL_FEATURES),
])


# --------------------------------------------------
# 4. Build and train the classifier
# --------------------------------------------------


model = Pipeline([
    ("preprocessor", preprocessor),
    ("classifier", MLPClassifier(
        hidden_layer_sizes=(64, 32),
        activation="relu",
        solver="adam",
        alpha=0.001,
        learning_rate_init=0.001,
        max_iter=500,
        early_stopping=True,
        validation_fraction=0.15,
        n_iter_no_change=20,
        random_state=42
    )),
])


model.fit(X_train, y_train)

print("\nModel training completed.")


# --------------------------------------------------
# 5. Evaluate on validation and test sets
# --------------------------------------------------

def evaluate(dataset_name, X, y):
    predictions = model.predict(X)

    print(f"\n{'=' * 45}")
    print(f"{dataset_name} RESULTS")
    print("=" * 45)

    print(f"Accuracy: {accuracy_score(y, predictions):.4f}")
    print("\nClassification report:")
    print(classification_report(y, predictions, zero_division=0))

    labels = ["NotPlaced", "Placed"]
    print("Confusion matrix:")
    print(confusion_matrix(y, predictions, labels=labels))

    if len(set(y)) == 2:
        probabilities = model.predict_proba(X)
        classes = list(model.named_steps["classifier"].classes_)
        placed_index = classes.index("Placed")
        placed_probabilities = probabilities[:, placed_index]

        print(
            "ROC-AUC:",
            f"{roc_auc_score((y == 'Placed').astype(int), placed_probabilities):.4f}"
        )


evaluate("VALIDATION", X_validation, y_validation)

# Keep the test set for final evaluation, not model selection.
evaluate("TEST", X_test, y_test)


# --------------------------------------------------
# 6. Save the model and metadata
# --------------------------------------------------

model_path = ARTIFACT_DIR / "placement_model.joblib"
metadata_path = ARTIFACT_DIR / "metadata.json"

joblib.dump(model, model_path)

metadata = {
    "model_version": "1.0.0",
    "target": TARGET,
    "features": FEATURES,
    "numeric_features": NUMERIC_FEATURES,
    "categorical_features": CATEGORICAL_FEATURES,
    "excluded_features": [
        "AptitudeTestScore",
        "SoftSkillsRating",
    ],
    "positive_class": "Placed",
    "dataset_note": (
        "Evaluation results describe performance on this dataset and "
        "do not establish real-world placement probabilities."
    ),
}

metadata_path.write_text(json.dumps(metadata, indent=4), encoding="utf-8")

print("\nModel saved to:", model_path)
print("Metadata saved to:", metadata_path)
