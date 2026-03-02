# DevDay Atom 2026: Visual AI Agent Flow Editor 🚗🤖

> **A drag-and-drop AI agent orchestration platform for car dealerships** — built for the DevDay Atom 2026 hackathon.

Build, configure, and test multi-agent conversational flows visually. Connect specialized AI agents that handle vehicle catalog searches, appointment scheduling, and general inquiries — all powered by **Google Gemini** and deployable to **Telegram** via **Firebase Cloud Functions**.

## 🌍 Live Demos

- **Web App**: [https://atom-dev-day.ixcayau.com](https://atom-dev-day.ixcayau.com)
  - **User**: `jonathan@ixcayau.com`
  - **Password**: `Abcd123$`
- **Telegram Client**: [https://t.me/atom_dev_day_bot](https://t.me/atom_dev_day_bot)

---

## 🏗️ Architecture Overview

```
┌───────────────────────────────────────────────────────────────────┐
│                 FRONTEND (Angular 21 + Tailwind)                  │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────────┐  │
│  │ Flow Editor  │  │  Properties  │  │     Chat Test Panel     │  │
│  │ (CDK D&D +   │  │  Panel       │  │ (In-app agent testing)  │  │
│  │  SVG Edges)  │  │  (Prompt,    │  │                         │  │
│  │              │  │   Model)     │  │                         │  │
│  └──────┬───────┘  └──────────────┘  └───────────┬─────────────┘  │
│         │ Deploy (JSON)                          │ Test Message   │
└─────────┼────────────────────────────────────────┼────────────────┘
          ▼                                        ▼
┌───────────────────────────────────────────────────────────────────┐
│                BACKEND (Firebase Cloud Functions)                 │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                  Telegram Webhook Handler                   │  │
│  │                                                             │  │
│  │ 1. Memory Node ──→ Firestore (last 10 messages)             │  │
│  │ 2. Orchestrator ──→ Gemini 2.5 Flash (intent classifier)    │  │
│  │ 3. Route:                                                   │  │
│  │    ├─ CATALOG ──→ Validator (Zod) ──→ Specialist (search)   │  │
│  │    ├─ GENERAL_INFO ──→ General Info Agent (FAQ AI)          │  │
│  │    ├─ APPOINTMENT ──→ Appointment Agent (Zod scheduling)    │  │
│  │    └─ GENERIC ──→ Welcome / redirect                        │  │
│  │ 4. Output ──→ Telegram Bot API + Firestore memory save      │  │
│  └─────────────────────────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                 saveFlowConfig Endpoint                     │  │
│  │                 Stores graph JSON in Firestore              │  │
│  └─────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Tech Stack

| Layer                 | Technology                                                          |
| --------------------- | ------------------------------------------------------------------- |
| **Frontend**          | Angular 21 · TypeScript · Tailwind CSS                              |
| **Node Editor**       | Custom implementation (Angular CDK Drag & Drop + SVG Bezier Curves) |
| **Backend**           | Node.js · Firebase Cloud Functions (v2)                             |
| **AI Framework**      | Vercel AI SDK (`ai` + `@ai-sdk/google`)                             |
| **AI Model**          | Google Gemini 2.5 Flash                                             |
| **Database**          | Firebase Firestore (memory + flow configs)                          |
| **Chat Interface**    | Telegram Bot API                                                    |
| **Monorepo**          | Nx Workspace                                                        |
| **Structured Output** | Zod schemas for Validator + Appointment agents                      |

---

## 🤖 Implemented Use Cases (3/3)

### 1. Vehicle Catalog Search ✅

- **Validator Agent**: Uses Gemini + Zod structured output to extract budget, vehicle type, and condition preference
- **Specialist Agent**: Searches a 25-vehicle JSON catalog, filters by user criteria, and generates an enthusiastic sales response
- If missing info, the validator asks for it conversationally

### 2. General Inquiries ✅

- AI-powered FAQ agent with full dealership knowledge baked into the system prompt
- Covers: hours, location, financing options, warranties, services, trade-ins
- Uses Gemini 2.5 Flash for fast, conversational responses

### 3. Appointment Scheduling ✅

- **Validator**: Extracts name, preferred date, time, and visit type (test drive / consultation / service)
- **Confirmation**: Generates a professional appointment confirmation with dealership address
- Uses Zod structured output for reliable field extraction

---

## 🎨 Visual Flow Editor Features

| Feature                    | Status                                                                           |
| -------------------------- | -------------------------------------------------------------------------------- |
| **6 Node Types**           | Incoming Message · Memory · Orchestrator · Validator · Specialist · Generic      |
| **Drag & Drop**            | Angular CDK-powered, smooth positioning                                          |
| **SVG Bezier Edges**       | Animated connections with glow effects                                           |
| **Labeled Output Handles** | Orchestrator has 4 labeled outputs (GENERAL_INFO, CATALOG, APPOINTMENT, GENERIC) |
| **Properties Panel**       | Slide-out panel for editing prompt, AI model, and required fields per node       |
| **Manual Edge Creation**   | Click output port → click input port to connect nodes                            |
| **JSON Export**            | View and copy the full graph configuration as JSON                               |
| **Snap-to-Grid**           | 24px grid with visual dot overlay                                                |
| **Graph Persistence**      | localStorage + Firestore on deploy                                               |
| **Dark Mode**              | Glassmorphism UI with dark/light toggle                                          |
| **Deploy Button**          | Saves graph config to Firestore via Cloud Function                               |
| **In-App Chat Testing**    | Test your flow directly in the browser                                           |
| **Deployment History**     | Track all deployments with live/replaced status                                  |

---

## 🏆 Bonus Points

| Bonus                          | Status | Details                                           |
| ------------------------------ | ------ | ------------------------------------------------- |
| **Persistent Memory** (+5)     | ✅     | Firestore stores last 10 messages per session ID  |
| **Real API Tooling** (+5)      | ✅     | Real Gemini AI calls with structured output (Zod) |
| **Real RAG** (+5)              | ⬜     | —                                                 |
| **WhatsApp Integration** (+10) | ⬜     | —                                                 |

---

## 📂 Project Structure

```
atom-workspace/
├── apps/
│   └── frontend/               # Angular 21 application
│       ├── components/
│       │   ├── node-editor.ts   # Custom drag-drop flow editor
│       │   ├── node-editor.html # Node rendering + ports + edges
│       │   └── node-editor.css  # Glassmorphism node styles
│       └── src/app/
│           ├── app.ts           # Main app component (all state + logic)
│           ├── app.html         # Full template with 5 views
│           └── app.css          # Animations + custom scrollbar
├── backend/
│   └── src/
│       ├── main.ts              # Firebase Cloud Functions (webhook + saveConfig)
│       ├── services/
│       │   ├── orchestrator.service.ts   # Intent classifier (Gemini)
│       │   ├── catalog.service.ts        # Validator + Specialist (Zod + Gemini)
│       │   ├── general-info.service.ts   # FAQ agent (Gemini)
│       │   ├── appointment.service.ts    # Scheduling agent (Zod + Gemini)
│       │   └── memory.service.ts         # Firestore chat history
│       └── assets/
│           └── vehicle-catalog.json      # 25 vehicles (SUV, Sedan, Truck, Coupe)
├── firebase.json                # Hosting + Functions + Firestore config
├── firestore.rules              # Security rules
└── package.json                 # Dependencies
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js ≥ 20
- Firebase CLI (`npm i -g firebase-tools`)
- pnpm (`npm i -g pnpm`)
- Nx CLI (`npm i -g nx`)
- [just](https://github.com/casey/just) (optional, for running repo commands)

### Local Development

```bash
# Clone and install
git clone <repo-url>
cd atom-workspace
pnpm install

# Start frontend dev server
pnpm exec nx serve frontend
# → http://localhost:4200

# Build backend
pnpm exec nx build backend
```

### Development Workflow (using `just`)

We use a [`justfile`](./justfile) to simplify running common monorepo tasks cleanly:

- `just dev`: Starts the frontend development server (`http://localhost:4200`).
- `just format`: Formats all files in the workspace.
- `just lint`: Runs the linter across all projects.
- `just check`: Runs the pre-commit checks (`format` and `lint`).
- `just build`: Builds all libraries and applications for production.

### Deploy to Firebase

```bash
# Login to Firebase
firebase login

# Deploy everything (functions + hosting + firestore)
firebase deploy

# Register Telegram webhook (after deploying functions)
node backend/register-webhook.js https://us-central1-atom-dev-day.cloudfunctions.net/telegramWebhook
```

### Environment Variables

Create `backend/.env`:

```
TELEGRAM_TOKEN=<your-telegram-bot-token>
GOOGLE_GENERATIVE_AI_API_KEY=<your-gemini-api-key>
```

---

## 🧠 AI Agent Flow (How It Works)

1. **User sends a message** (via Telegram or the in-app chat tester)
2. **Memory Node** retrieves the last 10 messages from Firestore using the session ID
3. **Orchestrator Agent** (Gemini 2.5 Flash) classifies intent into one of 4 routes:
   - `CATALOG` → Validator checks for budget/type/condition → Specialist searches inventory
   - `GENERAL_INFO` → FAQ agent responds with dealership knowledge
   - `APPOINTMENT` → Validator checks for name/date/time/type → Confirmation generated
   - `GENERIC` → Friendly welcome with available options
4. **Response saved** to Firestore memory and sent back to the user

---

_Built with ❤️🫰 for DevDay Atom 2026 — Guatemala City_
