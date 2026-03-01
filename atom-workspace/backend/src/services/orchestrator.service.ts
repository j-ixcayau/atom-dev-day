import { generateText } from 'ai';
import { google } from '@ai-sdk/google';

export type Intent = 'GENERAL_INFO' | 'CATALOG' | 'APPOINTMENT' | 'GENERIC';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface OrchestratorNodeData {
  prompt?: string;
  model?: string;
  outputLabels?: string[];
}

/**
 * Service to orchestrate the routing of incoming messages based on user intent.
 */
export class OrchestratorService {
  /**
   * Classifies the intent of the conversation.
   */
  async classifyIntent(
    summary: string,
    userName: string | null,
    newMessage: string,
    nodeData?: OrchestratorNodeData,
  ): Promise<string> {
    const editorPrompt = nodeData?.prompt || 'You are an intent classifier. Analyze the message.';
    const modelId = nodeData?.model || 'gemini-2.5-flash';
    const validLabels = nodeData?.outputLabels || ['GENERIC'];

    const systemPrompt = `
${editorPrompt}

User's Name: ${userName || 'Unknown'}
Conversation Summary: ${summary || 'No prior conversation'}

You MUST output EXACTLY ONE of the following tags, and absolutely nothing else:
${validLabels.map(label => `- ${label}`).join('\n')}
`;

    const messagesToSend: Message[] = [{ role: 'user', content: newMessage }];

    try {
      const { text } = await generateText({
        model: google(modelId),
        system: systemPrompt,
        messages: messagesToSend,
      });

      const intentText = text.trim().toUpperCase();

      // Validate the output matches the explicitly defined labels
      if (validLabels.includes(intentText)) {
        return intentText;
      }
      
      // Fallback if it hallucinates
      return validLabels.includes('GENERIC') ? 'GENERIC' : validLabels[0];
    } catch (error) {
      console.error('Error classifying intent:', error);
      return validLabels.includes('GENERIC') ? 'GENERIC' : validLabels[0];
    }
  }
}

