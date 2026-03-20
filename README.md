# AI Recruitment Copilot ATS

An AI-powered internal Applicant Tracking System (ATS) with recruiter copilot workflows, candidate pipeline management, interview scheduling, and OpenClaw + Telegram integration.

This project demonstrates how AI can assist recruiters beyond simple automation — helping with prioritization, follow-ups, candidate comparison, and drafting decisions in real time.

---

## 🚀 Overview

This is a full-stack recruitment system built for internal recruiter workflows. It combines a structured ATS pipeline with an AI-powered recruiter copilot that can:

- Suggest what to prioritize
- Identify candidates needing follow-up
- Compare candidates intelligently
- Draft follow-up messages
- Provide conversational insights via chat (Telegram + Web-ready)

The system is designed as a hybrid architecture:
- Backend = source of truth (data + logic)
- AI layer = reasoning, drafting, and conversational support

---

## ✨ Core Features

### ATS System
- Recruiter authentication
- Job creation with optional screening questions
- Internal candidate/application creation
- Candidate pipeline management (status tracking)
- Candidate detail view with notes and activity logs
- Interview scheduling and tracking
- Dashboard summary and metrics
- Filtering and pagination
- Bulk recruiter actions

### AI & Copilot
- AI-based candidate evaluation (from screening answers)
- Recruiter copilot endpoints:
  - Prioritize today
  - Follow-up needed candidates
  - Top candidates per role
  - Candidate comparison
  - Follow-up drafting context
- Hybrid chatbot (`/api/openclaw/chat`) with:
  - deterministic + reasoning modes
  - multi-turn conversation support
  - context-aware follow-ups

### OpenClaw Integration
- Telegram-based recruiter assistant
- Real-time chatbot responses via backend
- Message routing and assistant workflows
- Backend-driven intelligence (OpenClaw as delivery + orchestration layer)

---

## 🧠 Example Copilot Queries

- `what should I prioritize today?`
- `which candidates need follow-up?`
- `best candidates for frontend developer`
- `compare the first two`
- `why is the first one better?`
- `draft follow-up for the second candidate`

---

## 🏗️ Architecture

### 1. Core ATS System
- Jobs
- Applications
- Screening questions
- Notes & activity logs
- Interviews
- Dashboard & metrics
- Authentication

### 2. Copilot Layer (Backend)
- `/api/copilot/*` → structured data endpoints
- `/api/openclaw/chat` → conversational entrypoint
- Hybrid logic:
  - simple queries → backend formatting
  - reasoning queries → LLM (Gemini)

### 3. OpenClaw Layer
- Telegram bot interface
- Message relay to backend
- Assistant orchestration
- Notification handling

---

## 🧩 Tech Stack

### Frontend
- Next.js
- TypeScript
- Tailwind CSS

### Backend
- Node.js
- Express
- TypeScript

### Database
- PostgreSQL
- Prisma ORM

### AI / Copilot
- Gemini API

### Agent / Automation Layer
- OpenClaw

### Messaging
- Telegram Bot API

---

## 🔄 Key Workflows

### Job + Screening Setup
1. Recruiter creates a job
2. Adds optional screening questions (TEXT / YES_NO / NUMBER)

### Application Creation
1. Recruiter creates internal application
2. Selects job
3. Screening questions appear dynamically
4. Answers are saved

### AI Evaluation
1. Screening answers trigger AI evaluation
2. Candidate is scored and added to pipeline

### Recruiter Workflow
- View candidate details
- Add notes
- Schedule interviews
- Track activity

### Copilot Interaction
- Ask via Telegram or website chat
- Backend resolves context + reasoning
- Returns recruiter-friendly response

---

## ⚙️ Setup Instructions

### 1. Clone repo
```bash
git clone https://github.com/your-username/ai-recruitment-copilot-ats.git
cd ai-recruitment-copilot-ats
