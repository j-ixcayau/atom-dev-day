import { generateText } from 'ai';
import { google } from '@ai-sdk/google';
import * as admin from 'firebase-admin';
import { GoogleGenerativeAI } from '@google/generative-ai';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * Service to handle General Inquiries about the car dealership.
 * Covers FAQs: schedules, financing, warranties, location, policies, etc.
 */
export class GeneralInfoService {
  /**
   * Generates an AI-driven response for general dealership inquiries.
   */
  async generateResponse(
    chatHistory: Message[],
    newMessage: string,
    summary: string,
    userName: string | null,
  ): Promise<string> {
    
    let faqContext = '';
    
    try {
      const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!);
      const embeddingModel = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });
      const result = await embeddingModel.embedContent(newMessage);
      const queryEmbedding = result.embedding.values;

      const db = admin.firestore();
      const knowledgeBaseRef = db.collection('knowledge_base');

      const matches = await knowledgeBaseRef
        .where('source', '==', 'faq')
        // @ts-ignore
        .findNearest('embedding', admin.firestore.FieldValue.vector(queryEmbedding), {
             limit: 3,
             distanceMeasure: 'COSINE' 
        })
        .get();

      if (!matches.empty) {
        faqContext = `\n**Knowledge Base Information:**\n`;
        matches.forEach(doc => {
          faqContext += `${doc.data()['content']}\n\n`;
        });
      }
    } catch(err) {
      console.error('[GeneralInfoService] Error querying vector database', err);
    }

    const systemPrompt = `
You are a friendly, professional Customer Service Agent for "Atom Auto — Guatemala's Premier Car Dealership", talking to ${userName || 'a customer'}.

Conversation Summary: ${summary || 'None'}

You have access to the following dealership information and must use it to answer questions:
${faqContext}

Be conversational, helpful, and concise. If the user asks about something outside your knowledge, gently redirect them to call us at +502 2332-4567 or visit the showroom.
Do not use markdown formatting — keep responses plain text suitable for Telegram.
CRITICAL: Always reply in the exact same language the user is speaking. If the user speaks Spanish, reply entirely in Spanish.
`;

    const messagesToSend: Message[] = [
      ...chatHistory,
      { role: 'user', content: newMessage },
    ];

    try {
      const { text } = await generateText({
        model: google('gemini-2.5-flash'),
        system: systemPrompt,
        messages: messagesToSend,
      });

      return text;
    } catch (error) {
      console.error('Error generating general info response:', error);
      return "I'm sorry, I'm having a bit of trouble right now. For immediate help, please call us at +502 2332-4567 or visit our showroom at 12 Calle 1-25 Zona 10. We're happy to help!";
    }
  }
}
