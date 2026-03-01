import { generateText } from 'ai';
import { google } from '@ai-sdk/google';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

export class GenericSpecialistService {
  /**
   * Generates a conversational response using the specific Custom Prompt defined in the
   * visual Node Editor, injecting the variables extracted by the parent Validator node.
   */
  async generateResponse(
    userMessage: string,
    extractedData: Record<string, string>,
    userName: string | null,
    nodeData: any, // The specific node's data from the visual graph
    actionResults?: { type: string; success: boolean }[],
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

    // Dynamically query Vector DB for selected data sources
    const DATA_SOURCE_MAP: Record<string, { label: string }> = {
      autos: { label: '[Vehicle Inventory Database]' },
      dates: { label: '[Available Appointment Slots]' },
      faq:   { label: '[FAQ Knowledge Base]' },
    };

    let inventoryContext = '';
    const dataSources: string[] = nodeData?.dataSources || [];
    
    if (dataSources.length > 0) {
      try {
        // 2a. Embed the user's message
        const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!);
        const embeddingModel = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });
        const result = await embeddingModel.embedContent(userMessage);
        const queryEmbedding = result.embedding.values;

        const db = admin.firestore();
        const knowledgeBaseRef = db.collection('knowledge_base');

        for (const sourceId of dataSources) {
          if (sourceId === 'dates') {
            // Dates isn't vectorized, fallback to raw ingestion for dates
            let dataPath = path.join(__dirname, `../assets/dates.json`);
            if (!fs.existsSync(dataPath)) {
              dataPath = path.join(__dirname, `backend/src/assets/dates.json`);
            }
            if (fs.existsSync(dataPath)) {
              inventoryContext += `\n\n${DATA_SOURCE_MAP[sourceId].label}\n${fs.readFileSync(dataPath, 'utf-8')}`;
            }
            continue;
          }

          // RAG retrieval: Find closest matches for the user's query
          const matches = await knowledgeBaseRef
            .where('source', '==', sourceId)
            // @ts-ignore
            .findNearest('embedding', admin.firestore.FieldValue.vector(queryEmbedding), {
               limit: 3,
               distanceMeasure: 'COSINE' 
            })
            .get();
            
          if (!matches.empty) {
            inventoryContext += `\n\n${DATA_SOURCE_MAP[sourceId]?.label || '[Related Context]'}\n`;
            matches.forEach(doc => {
              inventoryContext += `${doc.data()['content']}\n\n`;
            });
          }
        }
      } catch (err) {
        console.error('[RAG Engine] Error querying vector database', err);
      }
    }

    // 2. Build action results context
    let actionContext = '';
    if (actionResults && actionResults.length > 0) {
      actionContext = '\n[ACTION EXECUTION RESULTS]:\n';
      for (const result of actionResults) {
        actionContext += `- Action "${result.type}": ${result.success ? 'SUCCESS' : 'FAILED'}\n`;
      }
      actionContext += `\nIMPORTANT: If a google_calendar action SUCCEEDED, confirm the appointment to the user enthusiastically and give them a summary of the booked date/time. Do NOT re-present available slots.\nIf a google_calendar action FAILED, apologize and tell the user their preferred slot has been noted and the team will follow up to confirm manually.\n`;
    }

    // 3. Build the System Prompt
    const systemPrompt = `
${customPrompt}

User Name: ${userName || 'Unknown'}

${contextStr}
${inventoryContext}
${actionContext}

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
