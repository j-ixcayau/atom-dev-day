import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';

export interface SummaryData {
  summary: string;
  userName: string | null;
}

export class SummarizerService {
  /**
   * Updates the ongoing summary and extracts the user's name if provided.
   */
  async updateState(
    currentSummary: string,
    currentUserName: string | null,
    userMessage: string,
    aiResponse: string,
  ): Promise<SummaryData> {
    const systemPrompt = `
You are the Summarizer for a Car Dealership AI Assistant.
Your job is to read the latest turn of a conversation along with the running summary and the known user's name, and output an updated summary and the user's name (if it was newly provided).
Extract the user's name if they mention it. If it was already known, keep it. If they haven't mentioned it yet, return null.
The summary should be concise, capturing what the user is looking for and the assistant's previous actions.

Current Summary: ${currentSummary || 'None'}
Current Known Name: ${currentUserName || 'None'}
    `;

    try {
      const { object } = await generateObject({
        model: google('gemini-2.5-flash'),
        system: systemPrompt,
        messages: [
          { role: 'user', content: userMessage },
          { role: 'assistant', content: aiResponse },
        ],
        schema: z.object({
          summary: z
            .string()
            .describe(
              'The updated concise running summary of the conversation.',
            ),
          userName: z
            .string()
            .nullable()
            .describe(
              'The name of the user, if known or just provided. Null if unknown.',
            ),
        }),
      });

      const result = {
        summary: object.summary,
        userName: object.userName || currentUserName, // Fallback to currentUserName if LLM returns null
      };

      console.log('[Summarizer] LLM Input (Known Name):', currentUserName);
      console.log('[Summarizer] LLM Output (Name):', object.userName);
      console.log('[Summarizer] Final State returned:', result);

      return result;
    } catch (error) {
      console.error('Error updating summary:', error);
      // Fallback to existing state on error
      return { summary: currentSummary, userName: currentUserName };
    }
  }
}
