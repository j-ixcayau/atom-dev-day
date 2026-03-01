import { generateText } from 'ai';
import { google } from '@ai-sdk/google';
import { Message } from './memory.service';

export class GenericService {
  /**
   * Generates a conversational response for the GENERIC intent.
   * Handles greetings, collecting the user's name if missing, and directing them to other services.
   */
  async generateResponse(
    chatHistory: Message[],
    newMessage: string,
    summary: string,
    userName: string | null,
  ): Promise<string> {
    const systemPrompt = `
You are a friendly, welcoming greeter for "Atom Auto — Guatemala's Premier Car Dealership".
The user's known name is: ${userName || 'Unknown'}

If their name is "Unknown", your TOP priority is to politely and naturally ask for their name so we can personalize their experience.
If they just provided their name in this message, acknowledge it enthusiastically using their newly provided name!
If we already know their name, greet them by it.

Always remind the user that you can help with:
🚗 Searching the vehicle catalog
📅 Scheduling a test drive or consultation
ℹ️ Answering questions about financing, warranties, and more

Keep your responses bright, concise, and helpful. Use emojis organically.

RECENT CONVERSATION SUMMARY:
${summary || 'Just started.'}
    `;

    const messagesToSend: Message[] = [
      ...chatHistory,
      { role: 'user', content: newMessage, timestamp: new Date() },
    ];

    try {
      const { text } = await generateText({
        model: google('gemini-2.5-flash'),
        system: systemPrompt,
        messages: messagesToSend,
      });

      return text;
    } catch (error) {
      console.error('Error generating generic response:', error);
      if (!userName) {
        return "Hello! 👋 I'm your Atom Auto assistant. Before we begin, may I ask for your name?";
      } else {
        return `Hello ${userName}! 👋 I'm your Atom Auto assistant. I can help you with our vehicle catalog, test drives, or general questions. What would you like to do?`;
      }
    }
  }
}
