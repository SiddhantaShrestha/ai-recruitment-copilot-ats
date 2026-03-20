# Recruit Nepal ATS — Frontend Workflow Documentation

## Overview

Next.js 15 frontend for recruiters: authentication, pipeline, dashboard, internal job/application creation, and Copilot chat.

---

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────────────┐
│                     FRONTEND (Next.js 15 + React)                     │
├─────────────────────────────────────────────────────────────────────┤
│  Pages           │ Components       │ API Layer    │ Auth Context    │
│  /candidates     │ AppHeader        │ lib/api.ts   │ AuthProvider    │
│  /jobs/create    │ PipelineFilters  │ lib/adminApi │ useAuth()       │
│  /applications/  │ CopilotChat      │              │                 │
│    create        │ ScreeningAnswer  │              │                 │
│  /copilot        │ Field            │              │                 │
│  /dashboard      │ ApplicationsTable│              │                 │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    Backend (localhost:5000)
```

---

## 1. Routes & Pages

| Route | Auth | Description |
|-------|------|-------------|
| `/` | No | Landing page with links to pipeline, login, copilot. |
| `/login` | No | Login form → JWT stored, redirect to /candidates. |
| `/candidates` | Yes | Pipeline: list applications, filters, bulk actions, status move. |
| `/dashboard` | Yes | Metrics, top candidates, recent activity. |
| `/copilot` | Yes | Recruiter Copilot chat (hybrid ATS + reasoning). |
| `/jobs/create` | Yes | Internal job creation with optional screening questions. |
| `/applications/create` | Yes | Internal application creation with job search and screening answers. |

---

## 2. Authentication Flow

1. User visits `/login`.
2. Submits email/password → `POST /api/auth/login`.
3. JWT and user stored (`localStorage` + `AuthContext`).
4. Redirect to `/candidates`.
5. `AppHeader` shows user name and “Log out”.
6. Protected pages use `useAuth()` and redirect to `/login` if not authenticated.

---

## 3. Pipeline (`/candidates`)

**Flow:**
- Fetches applications via `GET /api/applications` with filters (search, status, jobId, etc.).
- Displays table with candidate, job, status, AI score, recommendation.
- Bulk move: select rows → `PATCH /api/applications/bulk-move`.
- Row actions: move status, add note, schedule interview.
- Opens `CandidateDetailsDrawer` for notes, activity, interviews.

---

## 4. Internal Job Creation (`/jobs/create`)

**Flow:**
1. Recruiter fills: title, department, location, description, isActive.
2. Optionally adds screening questions (Add question) with question text, order, type (TEXT / YES_NO / NUMBER).
3. Submit → `POST /api/jobs` with `screeningQuestions` in body.
4. On success, form resets and success message shown.

---

## 5. Internal Application Creation (`/applications/create`)

**Flow:**
1. Recruiter fills candidate: fullName, email, phone (optional), resumeUrl (optional).
2. Searches job by title → `GET /api/jobs/search?q=...` (debounced).
3. Selects job from dropdown.
4. If job has screening questions:
   - Fetches `GET /api/jobs/:jobId/screening-questions`.
   - Renders answer fields (TEXT / YES_NO / NUMBER) via `ScreeningAnswerField`.
   - All answers required.
5. Submit → `POST /api/applications/internal-create` with candidate + jobId + answers.
6. Backend creates application, saves answers, runs AI evaluation, updates status.
7. Success message shown; form resets.

**Disclaimer shown:**  
“Answering these screening questions helps the system evaluate the candidate using AI and may improve the quality of selection decisions.”

---

## 6. Copilot Chat (`/copilot`)

**Flow:**
1. User types message or clicks quick suggestion.
2. `POST /api/openclaw/chat` with `message` and recent `history`.
3. Backend classifies as SIMPLE_QUERY (deterministic ATS) or REASONING_QUERY (LLM + context).
4. Response returned with `reply`, optional `metadata`, `mode`.
5. Message appended to chat; history kept for follow-ups (“compare the first two”, “draft follow-up”).

---

## 7. API Layer

| Module | Purpose |
|--------|---------|
| `lib/api.ts` | Auth, applications, dashboard, copilot chat, shared helpers. |
| `lib/adminApi.ts` | Admin-only: job search, screening questions, job create, internal application create. |

**Auth:** `getStoredToken()`, `authHeaders()`, `jsonHeaders()` used for protected endpoints.

---

## 8. Key Components

| Component | Purpose |
|-----------|---------|
| `AppHeader` | Nav links (Pipeline, Create Job, Create Application, Dashboard, Copilot), user name, logout. |
| `PipelineFilters` | Search, status, job, recommendation, min score filters. |
| `ApplicationsTable` | Application list, bulk select, row actions. |
| `CandidateDetailsDrawer` | Notes, activity, interviews for selected application. |
| `CopilotChat` | Chat UI, history, quick suggestions, loading, errors. |
| `ScreeningAnswerField` | Renders TEXT (textarea), YES_NO (select), NUMBER (input) per question type. |

---

## 9. Environment

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_API_BASE_URL` | Backend base URL (e.g. http://localhost:5000). Defaults to localhost:5000. |

---

## 10. User Flows Summary

| Flow | Pages | APIs |
|------|-------|------|
| **Login** | /login | POST /api/auth/login |
| **View pipeline** | /candidates | GET /api/applications |
| **Create job with questions** | /jobs/create | POST /api/jobs |
| **Create application with answers** | /applications/create | GET /api/jobs/search, GET /api/jobs/:id/screening-questions, POST /api/applications/internal-create |
| **Chat with Copilot** | /copilot | POST /api/openclaw/chat |
| **Bulk move / add note** | /candidates | PATCH /api/applications/bulk-move, POST /api/applications/:id/notes |

---

*Last updated: system workflow documentation.*
