# COMPILER — AI-Powered System Architecture Compiler

> Transform a plain English prompt into a full-stack system architecture in seconds.

**COMPILER** is a 4-stage AI pipeline that takes a single natural language description of a software system and outputs production-ready, structured schemas for your database, API, UI, and authentication layers — all validated and cross-checked for consistency.

---

## 🚀 Live Demo
live demo : https://compiler-q2w6.onrender.com
Run locally with one command:

```bash
npm install && npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

---

## 🧠 How It Works — The 4-Stage Pipeline

Each stage is an isolated Next.js API route that calls Groq's `llama-3.1-8b-instant` model with a structured prompt, validates the JSON output with Zod, and attempts automatic repair on failure before falling back to a sensible mock.

```
User Prompt
    │
    ▼
┌────────────────────────────────────────┐
│  Stage 1 — Intent Extraction           │
│  /api/stage1                           │
│  Identifies: app type, entities,       │
│  roles, features, business rules       │
└──────────────────┬─────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────┐
│  Stage 2 — System Architecture         │
│  /api/stage2                           │
│  Generates: architecture pattern,      │
│  data model, workflows, access control │
└──────────────────┬─────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────┐
│  Stage 3 — Schema Generation (4 sub-stages, sequential) │
│                                        │
│  3A /api/stage3 → DB Schema            │
│     PostgreSQL tables, columns, FKs    │
│                                        │
│  3B /api/stage3 → API Schema           │
│     Full REST CRUD + Auth endpoints    │
│     (10–15 minimum endpoints)          │
│                                        │
│  3C /api/stage3 → UI Schema            │
│     Pages, components, data bindings   │
│                                        │
│  3D /api/stage3 → Auth Schema          │
│     JWT strategy, RBAC, rate limits    │
└──────────────────┬─────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────┐
│  Stage 4 — Cross-Layer Validation      │
│  /api/stage4                           │
│  Checks: UI→API, API→DB, FK validity,  │
│  role consistency, auth enforcement    │
└──────────────────┬─────────────────────┘
                   │
                   ▼
         Output Page + ZIP Download
```

---

## 🏗 Project Structure

```
compiler/
├── app/
│   ├── page.tsx              # Landing page — prompt input
│   ├── generate/
│   │   └── page.tsx          # Live pipeline execution with stage cards
│   ├── output/
│   │   └── page.tsx          # Schema viewer with JSON tabs + validation results
│   ├── eval/
│   │   └── page.tsx          # Evaluation dashboard
│   └── api/
│       ├── stage1/route.ts   # Intent extraction
│       ├── stage2/route.ts   # System architecture
│       ├── stage3/route.ts   # Schema generation (DB, API, UI, Auth)
│       ├── stage4/route.ts   # Cross-layer validation
│       └── validate/route.ts # Standalone validation endpoint
├── lib/
│   ├── groqClient.ts         # Groq API wrapper with timeout, retry, abort
│   ├── ValidationEngine.ts   # Zod validation + cross-layer consistency checks
│   └── schemaContracts.ts    # Zod schemas for all 4 output stages
├── prompts/
│   ├── stage1.ts             # Intent extraction prompts
│   ├── stage2.ts             # Architecture design prompts
│   ├── stage3.ts             # DB / API / UI / Auth generation prompts
│   └── stage4.ts             # Validation & fix prompts
└── .env.local                # GROQ_API_KEY goes here
```

---

## ⚙️ Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| AI Model | Groq — `llama-3.1-8b-instant` |
| Schema Validation | Zod |
| Styling | Vanilla CSS with CSS Variables |
| File Export | JSZip (client-side ZIP download) |

---

## 🔑 Environment Setup

Create a `.env.local` file in the project root:

```env
GROQ_API_KEY=your_groq_api_key_here
```

Get a free API key at [console.groq.com](https://console.groq.com).

---

## 📦 Installation & Running

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
npm start
```

---

## 🛡 Architecture Decisions

### Defensive Pipeline Design
- **Graceful Degradation**: Every stage has a fallback mock. If the LLM fails, the pipeline continues with a minimal but valid placeholder — ensuring you always reach the Output page.
- **Zod Validation + Auto-Repair**: Every LLM response is validated against a strict Zod schema. On failure, the raw output is sent back to the LLM for repair (up to 2 retries) before falling back to the mock.
- **25s Timeout per Call**: Each Groq call uses `AbortController` to enforce a hard 25-second timeout, preventing pipeline hangs.
- **Sequential Stage 3**: Sub-stages 3A→3B→3C→3D run sequentially to avoid Groq free-tier rate limits (6000 TPM). Each sub-stage uses the output of the previous as context.

### API Safety
- Every route handler is wrapped in a top-level `try/catch` — it always returns `NextResponse.json()`, never an HTML error page.
- `GROQ_API_KEY` is checked at the top of every route with a clear JSON error if missing.

### Cross-Layer Consistency (Stage 4)
Five automated checks are performed after Stage 3:
1. **UI → API**: Every component's `data_source_api` must match a real API endpoint path
2. **API → DB**: Every API request field must exist in a DB table column
3. **API → Auth**: Every role referenced in an endpoint must be defined in the auth config
4. **FK Integrity**: Every foreign key must point to a real `table.column`
5. **Auth Enforcement**: Endpoints with `required_roles` must have `auth_required: true`

---

## 🖥 UI Overview

### Landing Page (`/`)
Clean prompt input with example prompts. Enter any natural language description of an app.

### Generate Page (`/generate`)
Live pipeline execution dashboard showing:
- Stage cards (1–4) with real-time status (running / success / failed / mock)
- Per-stage latency and retry counts
- "Show JSON" button on each card (even on failed stages with partial data)
- Proactive warning at 20s if a stage is slow

### Output Page (`/output`)
- 4-tab JSON viewer (DB / API / UI / Auth)
- Syntax-highlighted, scrollable JSON
- Schema overview cards with entity/endpoint counts
- Cross-layer validation results panel
- One-click ZIP download of all 4 schemas

---

## 📝 Example Prompt

```
Build a project management SaaS with teams, tasks, comments, 
file attachments, role-based access (admin, manager, member), 
and a billing/subscription system with Stripe integration.
```

**Output schemas generated:**
- `db_schema.json` — All tables (users, teams, projects, tasks, comments, files, subscriptions…)
- `api_schema.json` — Full CRUD endpoints for every entity + auth routes
- `ui_schema.json` — Pages and components mapping to API endpoints
- `auth_schema.json` — JWT strategy, RBAC roles, rate limits per role

---

## 🤝 Contributing

Pull requests are welcome. Please ensure:
- TypeScript compiles without errors (`npm run build`)
- All new API routes follow the established pattern (GROQ_API_KEY guard, try/catch root, `NextResponse.json` always)
- New prompt changes are tested with at least 2 different input prompts

---

## 📄 License

MIT — free to use, modify, and distribute.

---

*Built with ❤️ using Next.js + Groq AI*
