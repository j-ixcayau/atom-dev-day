import { generateText } from 'ai';
import { google } from '@ai-sdk/google';
import * as fs from 'fs';
import * as path from 'path';

export class GenericSpecialistService {
  /**
   * Generates a conversational response using the specific Custom Prompt defined in the
   * visual Node Editor, injecting the variables extracted by the parent Validator node.
   */
  async generateResponse(
    extractedData: Record<string, string>,
    userName: string | null,
    nodeData: any, // The specific node's data from the visual graph
  ): Promise<string> {
    const customPrompt = nodeData?.prompt || 'You are an AI assistant. Please respond conversationally to the user.';
    const modelId = nodeData?.model || 'gemini-2.5-flash';

    // 1. Compile all available extracted data context
    let contextStr = '';
    if (extractedData && Object.keys(extractedData).length > 0) {
       contextStr = `The user has securely provided the following required parameters:\n`;
       for (const [key, value] of Object.entries(extractedData)) {
          contextStr += `- ${key}: ${value}\n`;
       }
    }

    // [Optional/Hackathon Flex]: We still loosely load the catalog JSON if present, 
    // so any node can magically utilize it if their prompt mentions "inventory" or "catalog"!
    let inventoryContext = '';
    try {
       // Check if the prompt even cares about inventory
       if (customPrompt.toLowerCase().includes('inventory') || customPrompt.toLowerCase().includes('catalog')) {
          let dataPath = path.join(__dirname, '../assets/vehicle-catalog.json');
          if (!fs.existsSync(dataPath)) {
             dataPath = path.join(__dirname, 'backend/src/assets/vehicle-catalog.json');
          }
          if (fs.existsSync(dataPath)) {
             inventoryContext = `\n\n[Current Database Context]\n${fs.readFileSync(dataPath, 'utf-8')}`;
          }
       }
    } catch (e) {
       // Suppress missing database errors for generic nodes
    }

    // 2. Build the System Prompt
    const systemPrompt = `
${customPrompt}

User Name: ${userName || 'Unknown'}

${contextStr}
${inventoryContext}

Please fulfill your designated role based primarily on your core instruction above. 
Your response will be sent directly to the user.
`;

    try {
      const { text } = await generateText({
        model: google(modelId),
        system: systemPrompt,
        // For simple generation, we just ask it to process the prompt!
        prompt: 'Please provide the final response to the user based on your system instructions and extracted context.',
      });

      return text;
    } catch (error) {
      console.error('[GenericSpecialist] Error:', error);
      return "I'm sorry, I'm experiencing a technical error processing this request.";
    }
  }
}
