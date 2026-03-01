import '@google-cloud/functions-framework';
import 'dotenv/config';
import * as functions from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import TelegramBot from 'node-telegram-bot-api';
import { OrchestratorService } from './services/orchestrator.service';
import { CatalogSpecialistService } from './services/catalog.service';
import { GeneralInfoService } from './services/general-info.service';
import { AppointmentService } from './services/appointment.service';
import { MemoryService, Message } from './services/memory.service';
import { SummarizerService } from './services/summarizer.service';
import { GenericService } from './services/generic.service';
import { FlowEngineService, FlowGraph } from './services/flow-engine.service';

// Initialize Firebase Admin (if not already initialized by MemoryService)
if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = admin.firestore();

// Initialize services
const orchestrator = new OrchestratorService();
const catalogSpecialist = new CatalogSpecialistService();
const generalInfoService = new GeneralInfoService();
const appointmentService = new AppointmentService();
const memoryService = new MemoryService();
const summarizerService = new SummarizerService();
const genericService = new GenericService();
const flowEngine = new FlowEngineService();

/**
 * Configure the Telegram bot.
 * We use polling false because Cloud Functions act as a webhook receiver.
 */
const TELEGRAM_TOKEN =
  process.env.TELEGRAM_TOKEN || 'YOUR_TELEGRAM_BOT_TOKEN_HERE';
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });

/**
 * Shared Dynamic Flow Execution Helper
 */
async function processMessage(sessionId: string, userMessage: string): Promise<{ response: string; intent: string }> {
  // 1. Fetch memory
  const { messages: chatHistory, summary, userName } = await memoryService.getSessionData(sessionId);

  // 2. Load Active Flow Configuration
  let graph: FlowGraph | null = null;
  try {
    const activeFlowDoc = await db.collection('flowConfigs').doc('active').get();
    if (activeFlowDoc.exists) {
      graph = activeFlowDoc.data()?.graph as FlowGraph;
    }
  } catch (e) {
    console.warn('Could not load flow config:', e);
  }

  if (!graph || !graph.nodes || !graph.edges) {
     return { response: "System: No dynamic flow configuration found in Firestore. Please 'Deploy' from the visual editor first.", intent: "NONE" };
  }

  // 3. Find Orchestrator Node
  const orchestratorNode = flowEngine.findNodeByType(graph, 'orchestrator');
  if (!orchestratorNode) {
     return { response: "System: Flow configuration error. Missing Orchestrator Node. Please add it to the graph.", intent: "NONE" };
  }

  // 4. Classify Intent Dynamically using the node's configured prompt and labels
  const intent = await orchestrator.classifyIntent(summary, userName, userMessage, orchestratorNode.data);
  
  // 5. Evaluate Topology: Find if a path exists for this label
  const nextNodeId = flowEngine.findNextNodeId(graph, orchestratorNode.id, intent);
  let aiResponse = '';

  if (!nextNodeId) {
     // The edge does not exist in the visual editor for this intent!
     aiResponse = `System: The Orchestrator classified this as '${intent}', but there is no edge connected to the output handle '${intent}' in the visual editor. Please connect this path and Deploy.`;
  } else {
     // A valid edge exists, route to the robust specialized service logic
     switch (intent) {
        case 'CATALOG': {
          const validation = await catalogSpecialist.validateRequest(chatHistory, userMessage, summary, userName);
          if (!validation.isValid && validation.missingInfoMessage) {
            aiResponse = validation.missingInfoMessage;
          } else if (validation.extractedData) {
            aiResponse = await catalogSpecialist.generateResponse(validation.extractedData, userName);
          }
          break;
        }
        case 'GENERAL_INFO': {
          aiResponse = await generalInfoService.generateResponse(chatHistory, userMessage, summary, userName);
          break;
        }
        case 'APPOINTMENT': {
          const apptValidation = await appointmentService.validateRequest(chatHistory, userMessage, summary, userName);
          if (!apptValidation.isValid && apptValidation.missingInfoMessage) {
            aiResponse = apptValidation.missingInfoMessage;
          } else if (apptValidation.extractedData) {
            aiResponse = await appointmentService.generateConfirmation(apptValidation.extractedData, userName);
          }
          break;
        }
        case 'GENERIC':
        default:
          aiResponse = await genericService.generateResponse(chatHistory, userMessage, summary, userName);
          break;
     }
  }

  // 6. Push state update through pipeline
  const updatedState = await summarizerService.updateState(summary, userName, userMessage, aiResponse);
  const newMessages: Message[] = [
    { role: 'user', content: userMessage, timestamp: new Date() },
    { role: 'assistant', content: aiResponse, timestamp: new Date() },
  ];
  await memoryService.updateSessionData(
    sessionId,
    newMessages,
    updatedState.summary,
    updatedState.userName,
  );

  return { response: aiResponse, intent };
}

/**
 * Web Chat Endpoint — for the in-app chat tester.
 */
export const webChat = functions.https.onRequest(async (request, response) => {
  // CORS headers
  response.set('Access-Control-Allow-Origin', '*');
  response.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.set('Access-Control-Allow-Headers', 'Content-Type');

  if (request.method === 'OPTIONS') {
    response.status(204).send('');
    return;
  }

  try {
    const { message, sessionId } = request.body;

    if (!message) {
      response.status(400).json({ error: 'Missing message' });
      return;
    }

    const chatSessionId = sessionId || `web-${Date.now()}`;
    
    // Execute dynamic pipeline
    const result = await processMessage(chatSessionId, message);

    // Return the AI response directly to the frontend
    response
      .status(200)
      .json({ response: result.response, intent: result.intent, sessionId: chatSessionId });
  } catch (error) {
    console.error('Error in web chat:', error);
    response
      .status(500)
      .json({ error: 'AI processing failed', details: String(error) });
  }
});

/**
 * Main Webhook Endpoint to handle incoming updates from Telegram
 */
export const telegramWebhook = functions.https.onRequest(
  async (request, response) => {
    // CORS headers
    response.set('Access-Control-Allow-Origin', '*');
    response.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.set('Access-Control-Allow-Headers', 'Content-Type');

    if (request.method === 'OPTIONS') {
      response.status(204).send('');
      return;
    }

    try {
      const update = request.body;

      // Only process text messages from a valid chat
      if (update.message && update.message.text && update.message.chat?.id) {
        const chatId = update.message.chat.id.toString();
        const userMessage = update.message.text;

        // Execute dynamic pipeline
        const result = await processMessage(chatId, userMessage);

        try {
          await bot.sendMessage(chatId, result.response, {
            parse_mode: 'Markdown',
          });
        } catch {
          // Fallback: Telegram rejects malformed Markdown, so send as plain text
          await bot.sendMessage(chatId, result.response);
        }
      }

      // Always return 200 OK so Telegram knows we received it
      response.status(200).send('OK');
    } catch (error) {
      console.error('Error handling Telegram Webhook:', error);
      response.status(500).send('Internal Server Error');
    }
  },
);
