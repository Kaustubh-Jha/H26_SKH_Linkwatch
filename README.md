# LinkWatch / DEPEX (Dependency Exit Capsule Generator)

An intelligent developer tool designed to perform repository dependency analysis, track upgrade risks, process analysis with AI endpoints, and generate a structured **Dependency Exit Capsule**.

## 🌐 Live Web Application
- **Vercel Live URL:** [https://linkwatch-six.vercel.app/](https://linkwatch-six.vercel.app/)

## 🛠️ Tech Stack & Architecture
- **Frontend:** Next.js, React, Tailwind CSS (Deployed on Vercel)
- **Backend Engine:** Python 3.12 / 3.13 (`analyzer.py`)
- **Core Output:** JSON-formatted Dependency Exit Capsule report

## 📂 Repository Structure
- `/app`, `/components`, `/lib` - Next.js frontend UI and analysis views (built via v0)
- `analyzer.py` - Python backend script for local dependency scanning and exit capsule compilation
- `requirements.txt` / `package.json` - Dependency manifests

## 🚀 How to Run Locally

### 1. Run the Frontend (Next.js)
```bash
npm install
npm run dev
