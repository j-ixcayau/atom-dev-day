# Atom - No-Code Graph AI Agent Builder
Atom is a powerful, fully customizable **drag-and-drop Visual AI Engine** designed to let anyone build complex, multi-agent AI workflows without writing a single line of backend logic. 

Originally conceived as an automotive sales assistant, the platform has been completely refactored into a **100% Generic Graph Execution Engine**. This means you can use the UI to build a pizza delivery bot, a technical support agent, a medical triage assistant, or anything else you can imagine, dynamically.

## 🚀 How to Run Locally from Scratch

This repository uses [Nx](https://nx.dev/) to manage the monorepo architecture (Angular Frontend + Node Backend).

### Prerequisites
1. **Node.js** (v18 or higher recommended)
2. **pnpm** (Package manager, run `npm install -g pnpm`)
3. **Firebase CLI** (`npm install -g firebase-tools`)

### 1. Install Dependencies
```bash
pnpm install
```

### 2. Set Up Environment Variables
In the `backend` folder, create a `.env` file with your API keys:
```env
# /backend/.env
GOOGLE_GENERATIVE_AI_API_KEY="your-gemini-key"
TELEGRAM_TOKEN="your-telegram-bot-token"
```

### 3. Start the Frontend
The Visual Editor is built with Angular 19. Run the development server:
```bash
pnpm exec nx run frontend:serve:development
```
Open `http://localhost:4200` in your browser.

### 4. Start the Backend / Deploy
The AI Engine runs on Firebase Cloud Functions. You can test locally using the Firebase emulator or deploy straight to the cloud.

To build and deploy the Cloud Functions:
```bash
pnpm exec firebase deploy --only functions
```

---

## 🛠 How to Modify the AI (No Code Required)

The core innovation of Atom is that the **backend is completely dumb**. It contains zero hardcoded prompts, schemas, or intent logic. Every single piece of behavior is driven by the graph you draw in the UI and save to the database.

### 1. Drag & Drop Nodes
Open the frontend flow editor. You will see several node types in the left-hand toolbox:
* **Incoming Message**: The entry point for Telegram or the web chat.
* **Memory**: Retrieves past conversation history from Firestore.
* **Orchestrator**: The routing brain. It uses LLMs to classify user intent.
* **Validator**: Extracts specific data from a user's message.
* **Specialist**: Generates custom responses based on context and extracted data.

### 2. Configure Node Properties
Click on any node to open the **Properties Panel** on the right side.

#### Dynamic Validation (The Secret Sauce)
Instead of hardcoding what data to collect, you use the Visual UI. If you place a **Validator** node onto the canvas, you can define an array of `Required Fields` directly in the UI (e.g., `["budget", "vehicleType"]` or `["pizzaSize", "toppings"]`). 

When deployed, the backend's `GenericValidatorService` reads those fields from the database and **dynamically compiles a Zod Schema** at runtime to force the LLM to extract exactly those variables.

#### Custom Prompts
You can type custom system prompts for every node in the UI. If you want the agent to be a pirate, select the Specialist node and type *"You are a pirate selling software."* The backend `GenericSpecialistService` will execute whatever was typed.

### 3. Connect the Edges
Draw lines between nodes to define the execution path. The backend `main.ts` loop will literally traverse the JSON edges you drew, passing data from node to node sequentially. 

### 4. Attach Side Effects (Actions)
Need the AI to book a Google Calendar meeting?
1. Click a node.
2. Under "Node Actions", click **Add Action -> Google Calendar**.
3. Type your Calendar ID.
4. When the AI execution loop reaches this node, the backend will automatically parse the config and fire the Google Calendar API trigger.

### 5. Click Deploy
Click the blue **Deploy** button in the top right of the UI. This compiles your visual graph into JSON and pushes it directly to Firestore under `flowConfigs/active`. The backend cloud functions instantly inherit the new brain.

---

## 💡 What Can You Do With This?
Because the backend uses a dynamic traversal loop (`Generic Graph Engine`), you can create branching, looping, multi-agent systems.

**Example: IT Helpdesk Configuration**
1. **Orchestrator Node**: Output Routes -> `["PASSWORD_RESET", "HARDWARE_ISSUE"]`
2. Connect `PASSWORD_RESET` to a **Validator Node**.
3. Require Fields: `["employeeId", "department"]`.
4. Connect the Validator to a **Specialist Node**.
5. Prompt: *"Tell the user we have found their ID and will send a temporary password to their manager."*
6. Connect `HARDWARE_ISSUE` to a custom generic agent that opens Jira tickets.

Zero backend code modified. Infinite use cases.

---

## ⚖️ Licensing
This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**. 
For more details, see the `LICENSE` file.
