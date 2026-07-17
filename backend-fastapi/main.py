"""
Attendix backend — Python FastAPI

Mirrors the Node/Express API 1:1 so the same frontend can talk to
either backend. Run on port 8000 by default.
"""

import json
import math
import os
import uuid
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv()

DATA_FILE = Path(__file__).parent / "data.json"
PORT = int(os.getenv("PORT", 8000))
CORS_ORIGIN = os.getenv("CORS_ORIGIN", "*")

app = FastAPI(title="Attendix API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[CORS_ORIGIN] if CORS_ORIGIN != "*" else ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- models ----------

class SubjectCreate(BaseModel):
    name: str
    target: int = 75
    total: int = 0
    attended: int = 0


class SubjectUpdate(BaseModel):
    name: Optional[str] = None
    target: Optional[int] = None
    total: Optional[int] = None
    attended: Optional[int] = None


class CalculateRequest(BaseModel):
    total: int
    attended: int
    target: int = 75


# ---------- tiny JSON "database" ----------

def read_data() -> list[dict]:
    if not DATA_FILE.exists():
        return []
    try:
        return json.loads(DATA_FILE.read_text())
    except json.JSONDecodeError:
        return []


def write_data(subjects: list[dict]) -> None:
    DATA_FILE.write_text(json.dumps(subjects, indent=2))


# ---------- attendance math ----------

def compute_stats(attended: float, total: float, target: float = 75) -> dict:
    attended = float(attended or 0)
    total = float(total or 0)
    target_pct = float(target or 75)
    t = target_pct / 100
    percentage = (attended / total) * 100 if total > 0 else 0

    classes_needed = 0
    classes_can_skip = 0

    if total > 0:
        if percentage < target_pct:
            classes_needed = max(0, math.ceil((t * total - attended) / t))
        else:
            classes_can_skip = max(0, math.floor(attended / t - total))

    return {
        "percentage": round(percentage, 2),
        "isSafe": percentage >= target_pct,
        "classesNeeded": classes_needed,
        "classesCanSkip": classes_can_skip,
    }


# ---------- routes ----------

@app.get("/api/health")
def health():
    return {"status": "ok", "service": "attendix-fastapi"}


@app.get("/api/subjects")
def list_subjects():
    subjects = read_data()
    return [{**s, **compute_stats(s["attended"], s["total"], s.get("target", 75))} for s in subjects]


@app.post("/api/subjects", status_code=201)
def create_subject(payload: SubjectCreate):
    if payload.attended > payload.total:
        raise HTTPException(status_code=400, detail="attended cannot exceed total")

    subjects = read_data()
    subject = {
        "id": str(uuid.uuid4()),
        "name": payload.name.strip(),
        "target": payload.target,
        "total": payload.total,
        "attended": payload.attended,
    }
    subjects.append(subject)
    write_data(subjects)
    return {**subject, **compute_stats(subject["attended"], subject["total"], subject["target"])}


@app.put("/api/subjects/{subject_id}")
def update_subject(subject_id: str, payload: SubjectUpdate):
    subjects = read_data()
    idx = next((i for i, s in enumerate(subjects) if s["id"] == subject_id), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="subject not found")

    if payload.name is not None:
        subjects[idx]["name"] = payload.name.strip()
    if payload.target is not None:
        subjects[idx]["target"] = payload.target
    if payload.total is not None:
        subjects[idx]["total"] = payload.total
    if payload.attended is not None:
        subjects[idx]["attended"] = payload.attended

    if subjects[idx]["attended"] > subjects[idx]["total"]:
        raise HTTPException(status_code=400, detail="attended cannot exceed total")

    write_data(subjects)
    return {**subjects[idx], **compute_stats(subjects[idx]["attended"], subjects[idx]["total"], subjects[idx].get("target", 75))}


@app.delete("/api/subjects/{subject_id}", status_code=204)
def delete_subject(subject_id: str):
    subjects = read_data()
    next_subjects = [s for s in subjects if s["id"] != subject_id]
    if len(next_subjects) == len(subjects):
        raise HTTPException(status_code=404, detail="subject not found")
    write_data(next_subjects)
    return None


@app.post("/api/calculate")
def calculate(payload: CalculateRequest):
    return compute_stats(payload.attended, payload.total, payload.target)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=True)

# Or run with: uvicorn main:app --reload --port 8000
