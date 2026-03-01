import { generateText } from 'ai';
import { google } from '@ai-sdk/google';

export type Intent = 'GENERAL_INFO' | 'CATALOG' | 'APPOINTMENT' | 'GENERIC';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * Service to orchestrate the routing of incoming messages based on user intent.
 */
export class OrchestratorService {
  /**
   * Classifies the intent of the conversation.
   * @param chatHistory The recent chat history for context.
   * @param newMessage The latest user message.
   * @returns The classified Intent.
   */
  async classifyIntent(chatHistory: Message[], newMessage: string): Promise<Intent> {
    const systemPrompt = `
You are the Orchestrator for a Car Dealership AI Assistant.
Your sole job is to classify the user's intent based on their latest message and recent chat history.

You must output ONLY ONE of the following precise words, with no punctuation or extra text:
- 'GENERAL_INFO': If the user is asking about dealership hours, location, or general policies.
- 'CATALOG': If the user is looking for a car, asking about inventory, prices, models, or types of vehicles.
- 'APPOINTMENT': If the user explicitly wants to schedule a test drive or service appointment.
- 'GENERIC': If none of the above fit, or if it's just a greeting or small talk.
`;

    const messagesToSend: Message[] = [
      ...chatHistory,
      { role: 'user', content: newMessage }
    ];

    try {
      const { text } = await generateText({
        model: google('gemini-2.5-flash'), // Fast model for routing
        system: systemPrompt,
        messages: messagesToSend,
      });

      const intentText = text.trim().toUpperCase();

      // Validate the output matches our exact types, default to GENERIC if it hallucinated
      if (['GENERAL_INFO', 'CATALOG', 'APPOINTMENT'].includes(intentText)) {
        return intentText as Intent;
      }
      return 'GENERIC';
      
    } catch (error) {
      console.error('Error classifying intent:', error);
      return 'GENERIC'; // Default safe route on error
    }
  }
}
