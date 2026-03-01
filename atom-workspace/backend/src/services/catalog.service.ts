import { generateObject, generateText } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';

// Define the interface for our mock catalog
interface Vehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  price: number;
  type: string;
  condition: string;
  color: string;
  mileage: number;
}

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * Validates Catalog intent and processes Specialist queries.
 */
export class CatalogSpecialistService {
  private catalog: Vehicle[] = [];

  constructor() {
    this.loadCatalog();
  }

  private loadCatalog() {
    try {
      let dataPath = path.join(__dirname, '../assets/vehicle-catalog.json');
      if (!fs.existsSync(dataPath)) {
        // Fallback for Nx esbuild flat bundle output
        dataPath = path.join(
          __dirname,
          'backend/src/assets/vehicle-catalog.json',
        );
      }
      const rawData = fs.readFileSync(dataPath, 'utf-8');
      this.catalog = JSON.parse(rawData);
    } catch (err) {
      console.error('Failed to load vehicle catalog JSON:', err);
    }
  }

  /**
   * Phase 1: The Validator Node
   * Checks if we have enough information from the user to search the catalog.
   */
  async validateRequest(
    chatHistory: Message[],
    newMessage: string,
    summary: string,
    userName: string | null,
  ): Promise<{
    isValid: boolean;
    missingInfoMessage?: string;
    extractedData?: { budget?: number; type?: string; condition?: string };
  }> {
    const ValidatorSchema = z.object({
      hasBudget: z.boolean(),
      hasVehicleType: z.boolean(),
      hasConditionPreference: z.boolean(),
      extractedBudget: z
        .number()
        .optional()
        .describe('Numeric budget if mentioned, e.g., 20000'),
      extractedType: z.string().optional().describe('e.g., SUV, Sedan, Truck'),
      extractedCondition: z.string().optional().describe('e.g., New, Used'),
      missingInformationResponse: z
        .string()
        .optional()
        .describe(
          'If information is missing, a polite, conversational request asking the user for what is specifically missing.',
        ),
    });

    const systemPrompt = `
You are a Validator Agent for a Car Dealership. 
You must analyze the user's latest message and conversation history to extract car preferences.

User Name: ${userName || 'Unknown'}
Conversation Summary: ${summary || 'None'}

We need three key pieces of information: Budget, Vehicle Type, and Condition.
Extract what you can. If any of the three are missing, provide a friendly message asking for them.
`;

    const messagesToSend: Message[] = [
      ...chatHistory,
      { role: 'user', content: newMessage },
    ];

    try {
      const { object } = await generateObject({
        model: google('gemini-2.5-flash'),
        schema: ValidatorSchema,
        system: systemPrompt,
        messages: messagesToSend,
      });

      const isValid =
        object.hasBudget &&
        object.hasVehicleType &&
        object.hasConditionPreference;

      return {
        isValid,
        missingInfoMessage: !isValid
          ? object.missingInformationResponse
          : undefined,
        extractedData: {
          budget: object.extractedBudget,
          type: object.extractedType,
          condition: object.extractedCondition,
        },
      };
    } catch (error) {
      console.error('Error in Validator Node:', error);
      return {
        isValid: false,
        missingInfoMessage:
          "I'm having trouble understanding. Could you please tell me your budget, preferred car type, and if you want new or used?",
      };
    }
  }

  /**
   * Phase 2: The Specialist Node
   * If valid, we search our JSON catalog and ask the LLM to format a response.
   */
  async generateResponse(
    preferences: { budget?: number; type?: string; condition?: string },
    userName: string | null,
  ): Promise<string> {
    // 1. Backend Search Logic
    const matches = this.catalog.filter((car) => {
      if (preferences.budget && car.price > preferences.budget) return false;
      if (
        preferences.type &&
        car.type.toLowerCase() !== preferences.type.toLowerCase()
      )
        return false;
      if (
        preferences.condition &&
        preferences.condition.toLowerCase() !== 'any' &&
        car.condition.toLowerCase() !== preferences.condition.toLowerCase()
      )
        return false;
      return true;
    });

    // 2. Format LLM Response Generator
    const systemPrompt = `
You are a knowledgeable and enthusiastic Car Sales Specialist talking to ${userName || 'a customer'}.
A user has requested a car. We have searched our inventory database.
Here are the matches found in JSON format:
${JSON.stringify(matches, null, 2)}

Provide a helpful, conversational response summarizing their options. 
If no matches were found, politely let them know we don't have exactly what they're looking for right now but offer alternatives.
Do not output raw JSON to the user, format it nicely.
`;

    try {
      const { text } = await generateText({
        model: google('gemini-2.5-flash'), // Use the stronger model for formatted generation
        system: systemPrompt,
        prompt: 'Please summarize the inventory matches for the user.',
      });

      return text;
    } catch (error) {
      console.error('Error generating specialist response:', error);
      return "I'm sorry, I'm having trouble checking the inventory system right now. Please try again later.";
    }
  }
}
