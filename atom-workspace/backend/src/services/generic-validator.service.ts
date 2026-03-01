import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export class GenericValidatorService {
  /**
   * Executes a Validator Node dynamically using its visually-configured prompt and required fields.
   */
  async validateRequest(
    chatHistory: Message[],
    newMessage: string,
    summary: string,
    userName: string | null,
    nodeData: any, // The specific node's data from the visual graph
  ): Promise<{
    isValid: boolean;
    missingInfoMessage?: string;
    extractedData?: Record<string, string>;
  }> {
    
    const requiredFields: string[] = nodeData?.requiredFields || [];
    const customPrompt = nodeData?.prompt || 'You are a data validation agent. Extract the required parameters.';
    const modelId = nodeData?.model || 'gemini-2.5-flash';

    console.log(`[GenericValidator] Processing with requiredFields: [${requiredFields.join(', ')}]`);

    // 1. Build a dynamic Zod schema based ONLY on what the user configured in the UI!
    const schemaShape: Record<string, any> = {
       missingInformationResponse: z.string().optional().describe('If ANY required parameter is missing, write a polite, conversational request asking the user for exactly what is missing.'),
    };

    requiredFields.forEach((field) => {
       // Boolean check to see if it was found
       schemaShape[`has_${field}`] = z.boolean();
       // Extracted value
       schemaShape[`extracted_${field}`] = z.string().optional().describe(`The extracted value for ${field}`);
    });

    const ValidatorSchema = z.object(schemaShape);

    // 2. Build the System Prompt — includes current date so the LLM can resolve relative dates
    const now = new Date();
    const todayISO = now.toISOString().split('T')[0]; // e.g. "2026-03-01"
    const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' }); // e.g. "Saturday"

    const systemPrompt = `
${customPrompt}

IMPORTANT CONTEXT:
- Today's date is ${todayISO} (${dayOfWeek}).
- The current year is ${now.getFullYear()}.
- When the user says "this Tuesday", "tomorrow", "next week", etc., resolve it relative to today's date (${todayISO}).
- ALL dates must be output in ISO format YYYY-MM-DD.

User Name: ${userName || 'Unknown'}
Conversation Summary: ${summary || 'None'}

You must extract the following specific fields from the conversation:
${requiredFields.map(f => `- ${f}`).join('\n')}

If ANY of those fields are missing, you MUST provide a missingInformationResponse.
`;

    const messagesToSend: Message[] = [
      ...chatHistory,
      { role: 'user', content: newMessage },
    ];

    try {
      const { object } = await generateObject({
        model: google(modelId),
        schema: ValidatorSchema,
        system: systemPrompt,
        messages: messagesToSend,
      });

      console.log('[GenericValidator] Raw LLM output:', JSON.stringify(object));

      // 3. Evaluate if ALL required fields were found
      let isValid = true;
      const extractedData: Record<string, string> = {};

      for (const field of requiredFields) {
         if (!object[`has_${field}`]) {
            isValid = false;
            console.log(`[GenericValidator] Missing field: ${field}`);
         } else if (object[`extracted_${field}`]) {
            extractedData[field] = String(object[`extracted_${field}`]);
            console.log(`[GenericValidator] Extracted ${field} = "${extractedData[field]}"`);
         }
      }

      console.log(`[GenericValidator] Result: isValid=${isValid}, extractedData=${JSON.stringify(extractedData)}`);

      return {
        isValid,
        missingInfoMessage: !isValid ? (object.missingInformationResponse ? String(object.missingInformationResponse) : undefined) : undefined,
        extractedData: isValid ? extractedData : undefined,
      };

    } catch (error) {
      console.error('[GenericValidator] Error:', error);
      return {
        isValid: false,
        missingInfoMessage: "I'm having trouble extracting the exact details needed. Could you please clarify your request?",
      };
    }
  }
}
