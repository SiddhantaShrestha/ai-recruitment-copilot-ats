# Recruit Nepal ATS — Backend Workflow Documentation

## Overview

This backend powers an ATS (Applicant Tracking System) with recruiter authentication, job/application management, screening questions, AI evaluation, interviews, and OpenClaw/Telegram integration.

---

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────────────┐
│                        BACKEND (Express + Prisma)                     │
├─────────────────────────────────────────────────────────────────────┤
│  Auth        │ Jobs         │ Applications   │ Copilot/OpenClaw      │
│  /api/auth   │ /api/jobs    │ /api/applications │ /api/copilot       │
│              │              │                │ /api/openclaw         │
├──────────────┴──────────────┴────────────────┴───────────────────────┤
│  PostgreSQL (Prisma) │ Gemini AI │ Telegram (optional) │ OpenClaw     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 1. Authentication

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/auth/login` | POST | No | Login with email/password. Returns JWT. |
| `/api/auth/me` | GET | Yes | Returns current recruiter. |

**Flow:** Recruiter logs in → JWT stored (e.g. `localStorage`) → `Authorization: Bearer <token>` sent on protected requests.

---

## 2. Jobs

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/jobs` | POST | Yes | Create job (title, department, location, description, isActive, optional screeningQuestions). |
| `/api/jobs/search` | GET | Yes | Search jobs by title for dropdowns. `?q=...&limit=...` |
| `/api/jobs/:jobId/screening-questions` | POST | Yes | Add screening questions to existing job. |
| `/api/jobs/:jobId/screening-questions` | GET | Yes | List screening questions for a job. |

**Internal workflow:** Create job → optionally add screening questions (TEXT / YES_NO / NUMBER) in same request or separately.

---

## 3. Applications

### 3.1 Standard Create (Public-ish)

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/applications` | POST | No | Create application (fullName, email, phone?, resumeUrl?, jobId). Creates candidate if needed. |
| `/api/applications` | GET | No | List applications with filters (search, status, jobId, recommendation, scoreMin, pagination). |
| `/api/applications/:applicationId/answers` | POST | No | Submit screening answers. Triggers AI evaluation and status update. |
| `/api/applications/:applicationId/evaluate` | POST | No | Manually trigger AI evaluation. |

### 3.2 Internal Admin Create

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/applications/internal-create` | POST | Yes | Create application + candidate + optional screening answers in one request. If job has questions, answers are required; AI evaluation runs automatically. |

**Flow:** Recruiter fills form → candidate + application created → if screening questions exist, answers saved → AI evaluation runs → status updated (SCREENED / SHORTLISTED / REJECTED) → OpenClaw/Telegram notified.

### 3.3 Pipeline & Actions

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/applications/:id/move` | PATCH | Yes | Move single application to new status. |
| `/api/applications/bulk-move` | PATCH | Yes | Bulk move applications by IDs. |
| `/api/applications/:id/status` | PATCH | No | Update status (legacy). |
| `/api/applications/:id/notes` | GET/POST | GET: No, POST: Yes | List/add recruiter notes. |
| `/api/applications/:id/activity` | GET | No | List activity log. |
| `/api/applications/:id/interviews` | GET/POST | GET: No, POST: Yes | List/schedule interviews. |

---

## 4. AI Evaluation

**Triggered by:**  
- `POST /api/applications/:applicationId/answers`  
- `POST /api/applications/internal-create` (when job has screening questions)  
- `POST /api/applications/:applicationId/evaluate`

**Flow:**
1. Fetch application with candidate, job, screening answers.
2. Build prompt with job details + Q&A.
3. Call Gemini with `responseMimeType: application/json`.
4. Parse `{ score, summary, recommendation }` (SHORTLIST / MAYBE / REJECT).
5. Update `aiScore`, `aiSummary`, `aiRecommendation`.
6. Map recommendation to status: SHORTLIST → SHORTLISTED, REJECT → REJECTED, MAYBE → SCREENED.
7. Log `AI_EVALUATED` and `STATUS_CHANGED` activities.
8. Trigger OpenClaw workflow (Telegram notification).

---

## 5. OpenClaw Integration

**Simple fetch-and-show endpoints (used by chatbot):**

| Endpoint | Description |
|----------|-------------|
| `GET /api/openclaw/shortlisted` | Top shortlisted candidates. |
| `GET /api/openclaw/interviews/today` | Today's interviews. |
| `GET /api/openclaw/dashboard-summary` | Pipeline counts. |
| `POST /api/openclaw/query` | Intent-based dispatch to above. |
| `POST /api/openclaw/chat` | Hybrid chat: deterministic ATS + optional Gemini reasoning. |

**Flow:** User asks in Telegram or web Copilot → intent detected → fetch data or call copilot endpoints → format reply → send back.

---

## 6. Copilot (Agentic Workflows)

Used for higher-value assistant queries (priorities, follow-ups, comparisons):

| Endpoint | Description |
|----------|-------------|
| `GET /api/copilot/jobs/search` | Fuzzy job title search. |
| `GET /api/copilot/priorities` | Candidates stuck, interviews today, stale applications. |
| `GET /api/copilot/followup-needed` | Candidates needing follow-up. |
| `GET /api/copilot/compare?applicationIdA=...&applicationIdB=...` | Side-by-side comparison. |
| `GET /api/copilot/job-top-candidates?jobId=...&limit=3` | Top candidates for a job. |
| `GET /api/copilot/followup-context/:applicationId` | Context for drafting follow-up messages. |

---

## 7. Dashboard

| Endpoint | Description |
|----------|-------------|
| `GET /api/dashboard/metrics` | Aggregated pipeline stats, top candidates, recent activity. |

---

## 8. Data Model (Core)

| Entity | Key Fields |
|--------|------------|
| **Recruiter** | id, fullName, email, passwordHash, role |
| **Candidate** | id, fullName, email, phone?, resumeUrl? |
| **Job** | id, title, department, location, description, isActive |
| **Application** | id, candidateId, jobId, status, aiScore, aiSummary, aiRecommendation |
| **ScreeningQuestion** | id, jobId, question, order, type (TEXT/YES_NO/NUMBER) |
| **ScreeningAnswer** | id, applicationId, candidateId, screeningQuestionId, answer |
| **ApplicationActivity** | type (APPLIED, ANSWERS_SUBMITTED, AI_EVALUATED, STATUS_CHANGED, ...) |
| **ApplicationNote** | recruiterId, content |
| **ApplicationInterview** | scheduledAt, mode (ONLINE/ONSITE), status |

**Application status flow:**  
APPLIED → SCREENED → SHORTLISTED → INTERVIEW → OFFER → HIRED  
Terminal: REJECTED, HIRED

---

## 9. Environment Variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `PORT` | Server port (default 5000) |
| `GEMINI_API_KEY` | AI evaluation + Copilot LLM |
| `GEMINI_MODEL` | Model name (e.g. gemini-2.0-flash) |
| `TELEGRAM_BOT_TOKEN` | Direct Telegram delivery |
| `OPENCLAW_TELEGRAM_TO` | Target chat ID (e.g. telegram:123...) |
| `OPENCLAW_WEBHOOK_URL` | OpenClaw webhook (fallback) |
| `OPENCLAW_HOOKS_TOKEN` | Auth for OpenClaw webhook |

---

## 10. Internal Admin Workflows

### Job creation with screening questions

1. `POST /api/jobs` with `screeningQuestions: [{ question, order, type }]`
2. Job and questions created in one transaction.

### Application creation with screening answers

1. `POST /api/applications/internal-create` with candidate data + `jobId` + `answers: [{ screeningQuestionId, answer }]`
2. Candidate upserted, application created, answers saved.
3. AI evaluation runs, status updated, OpenClaw notified.

---

*Last updated: system workflow documentation.*
