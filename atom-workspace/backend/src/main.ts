import 'dotenv/config';
import * as functions from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import TelegramBot from 'node-telegram-bot-api';
import { OrchestratorService } from './services/orchestrator.service';
import { CatalogSpecialistService } from './services/catalog.service';
import { GeneralInfoService } from './services/general-info.service';
import { AppointmentService } from './services/appointment.service';
import { MemoryService, Message } from './services/memory.service';

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

/**
 * Configure the Telegram bot.
 * We use polling false because Cloud Functions act as a webhook receiver.
 */
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || 'YOUR_TELEGRAM_BOT_TOKEN_HERE';
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });

/**
 * Save Flow Configuration Endpoint
 * The frontend "Deploy" button POSTs the graph JSON here.
 * It's stored in Firestore under flowConfigs/active.
 */
export const saveFlowConfig = functions.https.onRequest(async (request, response) => {
  // CORS headers
  response.set('Access-Control-Allow-Origin', '*');
  response.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.set('Access-Control-Allow-Headers', 'Content-Type');

  if (request.method === 'OPTIONS') {
    response.status(204).send('');
    return;
  }

  try {
    const { graph } = request.body;

    if (!graph) {
      response.status(400).json({ error: 'Missing graph payload' });
      return;
    }

    await db.collection('flowConfigs').doc('active').set({
      graph,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      nodeCount: graph.nodes?.length || 0,
      edgeCount: graph.edges?.length || 0,
    });

    response.status(200).json({ success: true, message: 'Flow config saved to Firestore' });
  } catch (error) {
    console.error('Error saving flow config:', error);
    response.status(500).json({ error: 'Failed to save flow config' });
  }
});

/**
 * Web Chat Endpoint — for the in-app chat tester.
 * Unlike the Telegram webhook, this returns the AI response directly.
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

    // 1. Memory Node: Retrieve context
    const chatHistory = await memoryService.getChatHistory(chatSessionId);

    // 2. Orchestrator Node: Classify Intent
    const intent = await orchestrator.classifyIntent(chatHistory, message);

    let aiResponse = '';

    switch (intent) {
      case 'CATALOG': {
        const validation = await catalogSpecialist.validateRequest(chatHistory, message);
        if (!validation.isValid && validation.missingInfoMessage) {
          aiResponse = validation.missingInfoMessage;
        } else if (validation.extractedData) {
          aiResponse = await catalogSpecialist.generateResponse(validation.extractedData);
        }
        break;
      }
      case 'GENERAL_INFO': {
        aiResponse = await generalInfoService.generateResponse(chatHistory, message);
        break;
      }
      case 'APPOINTMENT': {
        const apptValidation = await appointmentService.validateRequest(chatHistory, message);
        if (!apptValidation.isValid && apptValidation.missingInfoMessage) {
          aiResponse = apptValidation.missingInfoMessage;
        } else if (apptValidation.extractedData) {
          aiResponse = await appointmentService.generateConfirmation(apptValidation.extractedData);
        }
        break;
      }
      case 'GENERIC':
      default:
        aiResponse = "Hello! 👋 I'm your Atom Auto assistant. I can help you:\n\n🚗 Search our vehicle catalog\n📅 Schedule a test drive or consultation\nℹ️ Answer questions about financing, warranties, and more\n\nWhat would you like to do?";
        break;
    }

    // Save to memory
    const newMessages: Message[] = [
      { role: 'user', content: message, timestamp: new Date() },
      { role: 'assistant', content: aiResponse, timestamp: new Date() }
    ];
    await memoryService.appendMessages(chatSessionId, newMessages);

    // Return the AI response directly to the frontend
    response.status(200).json({ response: aiResponse, intent, sessionId: chatSessionId });
  } catch (error) {
    console.error('Error in web chat:', error);
    response.status(500).json({ error: 'AI processing failed', details: String(error) });
  }
});

/**
 * Main Webhook Endpoint to handle incoming updates from Telegram
 */
export const telegramWebhook = functions.https.onRequest(async (request, response) => {
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

      // 1. Memory Node: Retrieve context for this specific user/chat session
      const chatHistory = await memoryService.getChatHistory(chatId);

      // 2. Orchestrator Node: Classify Intent
      const intent = await orchestrator.classifyIntent(chatHistory, userMessage);

      let finalAIResponseText = '';

      switch (intent) {
        case 'CATALOG': {
          // 3a. Catalog Route: Validator → Specialist
          const validation = await catalogSpecialist.validateRequest(chatHistory, userMessage);

          if (!validation.isValid && validation.missingInfoMessage) {
            finalAIResponseText = validation.missingInfoMessage;
          } else if (validation.extractedData) {
            finalAIResponseText = await catalogSpecialist.generateResponse(validation.extractedData);
          }
          break;
        }

        case 'GENERAL_INFO': {
          // 3b. General Info Route: AI-powered FAQ agent
          finalAIResponseText = await generalInfoService.generateResponse(chatHistory, userMessage);
          break;
        }

        case 'APPOINTMENT': {
          // 3c. Appointment Route: Validator → Confirmation
          const apptValidation = await appointmentService.validateRequest(chatHistory, userMessage);

          if (!apptValidation.isValid && apptValidation.missingInfoMessage) {
            finalAIResponseText = apptValidation.missingInfoMessage;
          } else if (apptValidation.extractedData) {
            finalAIResponseText = await appointmentService.generateConfirmation(apptValidation.extractedData);
          }
          break;
        }

        case 'GENERIC':
        default:
          finalAIResponseText = "Hello! 👋 I'm your Atom Auto assistant. I can help you:\n\n🚗 Search our vehicle catalog\n📅 Schedule a test drive or consultation\nℹ️ Answer questions about financing, warranties, and more\n\nWhat would you like to do?";
          break;
      }

      // 5. Output: Send the final text via the Telegram Bot API
      try {
        await bot.sendMessage(chatId, finalAIResponseText, { parse_mode: 'Markdown' });
      } catch {
        // Fallback: Telegram rejects malformed Markdown, so send as plain text
        await bot.sendMessage(chatId, finalAIResponseText);
      }

      // 6. Memory Append: Save the interaction context for the future
      const newMessages: Message[] = [
        { role: 'user', content: userMessage, timestamp: new Date() },
        { role: 'assistant', content: finalAIResponseText, timestamp: new Date() }
      ];
      await memoryService.appendMessages(chatId, newMessages);
    }

    // Always return 200 OK so Telegram knows we received it
    response.status(200).send('OK');
  } catch (error) {
    console.error('Error handling Telegram Webhook:', error);
    response.status(500).send('Internal Server Error');
  }
});
