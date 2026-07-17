// Attendix backend — Node.js + Express
// REST API for storing subjects and calculating attendance stats
// against each subject's own target percentage (defaults to 75%).

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 5000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
const DATA_FILE = path.join(__dirname, "data.json");

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

// ---------- tiny JSON "database" ----------

function readData() {
  if (!fs.existsSync(DATA_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function writeData(subjects) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(subjects, null, 2));
}

// ---------- attendance math ----------

function computeStats(attended, total, target) {
  attended = Number(attended) || 0;
  total = Number(total) || 0;
  const targetPct = Number(target) || 75;
  const t = targetPct / 100;
  const percentage = total > 0 ? (attended / total) * 100 : 0;

  let classesNeeded = 0;   // consecutive classes to attend to reach target
  let classesCanSkip = 0;  // classes that can still be missed and stay at/above target

  if (total > 0) {
    if (percentage < targetPct) {
      classesNeeded = Math.max(0, Math.ceil((t * total - attended) / t));
    } else {
      classesCanSkip = Math.max(0, Math.floor(attended / t - total));
    }
  }

  return {
    percentage: Math.round(percentage * 100) / 100,
    isSafe: percentage >= targetPct,
    classesNeeded,
    classesCanSkip,
  };
}

// ---------- routes ----------

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "attendix-express" });
});

// list all subjects with computed stats
app.get("/api/subjects", (req, res) => {
  const subjects = readData().map((s) => ({ ...s, ...computeStats(s.attended, s.total, s.target) }));
  res.json(subjects);
});

// add a subject
app.post("/api/subjects", (req, res) => {
  const { name, target = 75, total = 0, attended = 0 } = req.body;
  if (!name || typeof name !== "string") {
    return res.status(400).json({ error: "name is required" });
  }
  if (Number(attended) > Number(total)) {
    return res.status(400).json({ error: "attended cannot exceed total" });
  }

  const subjects = readData();
  const subject = {
    id: crypto.randomUUID(),
    name: name.trim(),
    target: Number(target),
    total: Number(total),
    attended: Number(attended),
  };
  subjects.push(subject);
  writeData(subjects);

  res.status(201).json({ ...subject, ...computeStats(subject.attended, subject.total, subject.target) });
});

// update a subject (log a class, edit target, rename)
app.put("/api/subjects/:id", (req, res) => {
  const subjects = readData();
  const idx = subjects.findIndex((s) => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "subject not found" });

  const { name, target, total, attended } = req.body;
  if (name !== undefined) subjects[idx].name = String(name).trim();
  if (target !== undefined) subjects[idx].target = Number(target);
  if (total !== undefined) subjects[idx].total = Number(total);
  if (attended !== undefined) subjects[idx].attended = Number(attended);

  if (subjects[idx].attended > subjects[idx].total) {
    return res.status(400).json({ error: "attended cannot exceed total" });
  }

  writeData(subjects);
  res.json({ ...subjects[idx], ...computeStats(subjects[idx].attended, subjects[idx].total, subjects[idx].target) });
});

// delete a subject
app.delete("/api/subjects/:id", (req, res) => {
  const subjects = readData();
  const next = subjects.filter((s) => s.id !== req.params.id);
  if (next.length === subjects.length) return res.status(404).json({ error: "subject not found" });
  writeData(next);
  res.status(204).send();
});

// standalone calculator — no need to save a subject first
app.post("/api/calculate", (req, res) => {
  const { total, attended, target } = req.body;
  if (total === undefined || attended === undefined) {
    return res.status(400).json({ error: "total and attended are required" });
  }
  res.json(computeStats(attended, total, target));
});

app.listen(PORT, () => {
  console.log(`Attendix Express API running at http://localhost:${PORT}`);
});
