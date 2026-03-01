import '@google-cloud/functions-framework';
import 'dotenv/config';
import * as functions from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import TelegramBot from 'node-telegram-bot-api';
import { OrchestratorService } from './services/orchestrator.service';
import { MemoryService, Message } from './services/memory.service';
import { SummarizerService } from './services/summarizer.service';
import { GenericService } from './services/generic.service';
import { FlowEngineService, FlowGraph } from './services/flow-engine.service';
import { ActionRunnerService } from './services/action-runner.service';
import { GenericValidatorService } from './services/generic-validator.service';
import { GenericSpecialistService } from './services/generic-specialist.service';

// ... (Firebase and DB initialization remains exactly the same below this line)
if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = admin.firestore();

// Initialize generic graph services
const orchestrator = new OrchestratorService();
const memoryService = new MemoryService();
const summarizerService = new SummarizerService();
const flowEngine = new FlowEngineService();
const actionRunner = new ActionRunnerService();

const genericValidator = new GenericValidatorService();
const genericSpecialist = new GenericSpecialistService();
const genericService = new GenericService(); // Fallback Generic Node processing

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || 'YOUR_TELEGRAM_BOT_TOKEN_HERE';
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });

async function processMessage(sessionId: string, userMessage: string): Promise<{ response: string; intent: string }> {
  const { messages: chatHistory, summary, userName, language } = await memoryService.getSessionData(sessionId);

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

  const orchestratorNode = flowEngine.findNodeByType(graph, 'orchestrator');
  if (!orchestratorNode) {
     return { response: "System: Flow configuration error. Missing Orchestrator Node. Please add it to the graph.", intent: "NONE" };
  }

  const behaviorRules = [];
  if (language) {
    behaviorRules.push(`The user has chosen to speak the ISO language code '${language}'. You MUST reply strictly in '${language}' natively.`);
  }
  behaviorRules.push(`Keep your answers short, concise, conversational, and human-like. Do NOT be robotic or overly formal. Avoid long paragraphs.`);
  const enhancedSummary = `${summary}\n\n[SYSTEM BEHAVIOR INSTRUCTIONS]:\n${behaviorRules.join('\n')}`;

  // 1. Ask Orchestrator to output ONE of the user's custom visual labels
  const intent = await orchestrator.classifyIntent(enhancedSummary, userName, userMessage, orchestratorNode.data);
  
  // 2. Resolve Graph Connections!
  let nextNodeId = flowEngine.findNextNodeId(graph, orchestratorNode.id, intent);
  let aiResponse = '';
  // Track extracted data to pass between connected nodes
  let activeExtractedData: Record<string, string> = {}; 

  if (!nextNodeId) {
     aiResponse = `System: The Orchestrator classified this as '${intent}', but there is no edge connected to the output handle '${intent}' in the visual editor. Please connect this path and Deploy.`;
  } else {
     // 3. Dynamic Execution Loop
     // We process the *first* node attached to orchestrator. If it's a Validator, we might follow its output edge to a Specialist!
     let limit = 0;
     while (nextNodeId && limit < 3) { // Limit iterations to prevent infinite recursion bugs
        limit++;
        const targetNode = graph.nodes.find(n => n.id === nextNodeId);
        if (!targetNode) break;

        const nodeType = targetNode.type;
        const nodeData = targetNode.data || {};

        if (nodeType === 'validator') {
             // Run dynamically generated Zod Array validation
             const validation = await genericValidator.validateRequest(chatHistory, userMessage, enhancedSummary, userName, nodeData);
             if (!validation.isValid && validation.missingInfoMessage) {
                 // Early exit: we have to wait for the user to provide the missing required parameters
                 aiResponse = validation.missingInfoMessage;
                 nextNodeId = null; 
             } else if (validation.extractedData) {
                 // Success! Save the data to pass to the sequential node (if one exists)
                 activeExtractedData = { ...activeExtractedData, ...validation.extractedData };
                 // Traverse to the *next* node in the visual UI linked from this Validator
                 nextNodeId = flowEngine.findNextNodeId(graph, targetNode.id); 
                 
                 // If the graph literally just stops at the Validator, at least acknowledge it
                 if (!nextNodeId) {
                    aiResponse = `System: Evaluated Validator node perfectly, but there is no trailing node connected to generate a final response.`;
                 }
             }
        } 
        else if (nodeType === 'specialist') {
             // Run text generation using visually defined prompt, natively injecting variables from prior Validators
             aiResponse = await genericSpecialist.generateResponse(activeExtractedData, userName, nodeData);
             // Execute attached Actions!
             if (nodeData.actions && nodeData.actions.length > 0) {
                 for (const action of nodeData.actions) {
                     await actionRunner.executeAction(action, activeExtractedData, userName);
                 }
             }
             nextNodeId = null; // Execution finishes at specialists
        } 
        else if (nodeType === 'generic') {
             // Basic fallback
             aiResponse = await genericService.generateResponse(chatHistory, userMessage, enhancedSummary, userName);
             nextNodeId = null;
        } else {
             aiResponse = `System: Reached an unknown node type '${nodeType}'. Stopping execution.`;
             nextNodeId = null;
        }
     }
  }

  // 4. Summarize & Save
  const updatedState = await summarizerService.updateState(summary, userName, language, userMessage, aiResponse);
  const newMessages: Message[] = [
    { role: 'user', content: userMessage, timestamp: new Date() },
    { role: 'assistant', content: aiResponse, timestamp: new Date() },
  ];
  await memoryService.updateSessionData(
    sessionId,
    newMessages,
    updatedState.summary,
    updatedState.userName,
    updatedState.language,
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
