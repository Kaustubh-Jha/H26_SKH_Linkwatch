# LinkWatch - Dependency Exit Capsule Generator

An intelligent developer tool designed to perform repository dependency analysis, track upgrade risks, process analysis with AI endpoints, and generate a structured Dependency Exit Capsule.

## 🏆 Hackathon Track & AI Disclosure
* **Track:** Track 1: Gemma 4 - Dependency Resilience
* **AI Model:** Gemma 4 (via Hosted API)
* **Access Method:** Direct REST API execution via hosted API endpoint.
* **Usage:** Gemma 4 acts as the core reasoning engine in the backend (`analyzer.py`) to dynamically inspect dependencies, evaluate migration risks, propose modern replacement packages, and outline step-by-step migration plans.

🌐 **Live Application:** https://linkwatch-six.vercel.app/?apiKey=AQ.Ab8RN6I-jiXfWC5tU58JBmmj6mgW-bk_fQU81YMFkkO4jRd7Aw

---

## 🛠️ Tech Stack
* **Frontend:** Next.js, React, Tailwind CSS (Deployed on Vercel)
* **Backend Engine:** Python 3.12 / 3.13 (`analyzer.py`) for repository scanning, AST inspection, and exit capsule compilation.
* **AI Engine:** Gemma 4 for intelligent risk assessment and migration strategies.

---

## 📂 Repository Structure
* `/app`, `/components`, `/lib` — Next.js frontend UI and analysis views.
* `analyzer.py` — Python backend script for local dependency scanning and exit capsule compilation.
* `requirements.txt` / `package.json` — Dependency manifests.

---

## 🚀 How to Run Locally

### 1. Frontend Setup
```bash
npm install
npm run dev
