import { generateObject, generateText } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * Service to handle Appointment Scheduling for test drives and sales consultations.
 * Uses a Validator + Specialist pattern (same as CatalogSpecialistService).
 */
export class AppointmentService {

  /**
   * Phase 1: Validate that we have enough info to schedule an appointment.
   * Required: name, preferred date, preferred time, visit type (test drive / consultation / service).
   */
  async validateRequest(chatHistory: Message[], newMessage: string): Promise<{
    isValid: boolean;
    missingInfoMessage?: string;
    extractedData?: { name?: string; date?: string; time?: string; visitType?: string; vehicleInterest?: string };
  }> {
    const AppointmentSchema = z.object({
      hasName: z.boolean(),
      hasDate: z.boolean(),
      hasTime: z.boolean(),
      hasVisitType: z.boolean(),
      extractedName: z.string().optional().describe("The user's name"),
      extractedDate: z.string().optional().describe("Preferred date, e.g., 'March 5, 2026' or 'next Monday'"),
      extractedTime: z.string().optional().describe("Preferred time, e.g., '10:00 AM' or 'afternoon'"),
      extractedVisitType: z.string().optional().describe("e.g., 'test drive', 'sales consultation', 'service appointment'"),
      extractedVehicleInterest: z.string().optional().describe("If they mention a specific car they want to test drive"),
      missingInformationResponse: z.string().optional()
        .describe("If information is missing, a polite, conversational request asking for what is specifically missing.")
    });

    const systemPrompt = `
You are an Appointment Scheduler for a Car Dealership.
Analyze the conversation to extract appointment details.
We need four pieces of information: Name, Preferred Date, Preferred Time, and Visit Type.
Visit types can be: "test drive", "sales consultation", or "service appointment".
Extract what you can. If any of the four are missing, provide a friendly message asking for them.
Be conversational and helpful.
`;

    const messagesToSend: Message[] = [...chatHistory, { role: 'user', content: newMessage }];

    try {
      const { object } = await generateObject({
        model: google('gemini-2.5-flash'),
        schema: AppointmentSchema,
        system: systemPrompt,
        messages: messagesToSend,
      });

      const isValid = object.hasName && object.hasDate && object.hasTime && object.hasVisitType;

      return {
        isValid,
        missingInfoMessage: !isValid ? object.missingInformationResponse : undefined,
        extractedData: {
          name: object.extractedName,
          date: object.extractedDate,
          time: object.extractedTime,
          visitType: object.extractedVisitType,
          vehicleInterest: object.extractedVehicleInterest
        }
      };

    } catch (error) {
      console.error('Error in Appointment Validator:', error);
      return {
        isValid: false,
        missingInfoMessage: "I'd love to help schedule your appointment! Could you please tell me your name, preferred date and time, and whether you'd like a test drive, sales consultation, or service appointment?"
      };
    }
  }

  /**
   * Phase 2: Generate a confirmation response once all details are collected.
   */
  async generateConfirmation(details: {
    name?: string; date?: string; time?: string; visitType?: string; vehicleInterest?: string;
  }): Promise<string> {
    const systemPrompt = `
You are an Appointment Confirmation Agent for "Atom Auto" car dealership in Guatemala City.

The user has provided all the necessary details for their appointment. Generate a warm, professional confirmation message.

Appointment Details:
- Name: ${details.name || 'N/A'}
- Date: ${details.date || 'N/A'}
- Time: ${details.time || 'N/A'}
- Visit Type: ${details.visitType || 'N/A'}
${details.vehicleInterest ? `- Vehicle Interest: ${details.vehicleInterest}` : ''}

Include:
1. A confirmation of their appointment details
2. The dealership address: 12 Calle 1-25 Zona 10, Guatemala City
3. A note that they'll receive a reminder
4. A friendly closing

Do not use markdown formatting — keep responses plain text suitable for Telegram.
`;

    try {
      const { text } = await generateText({
        model: google('gemini-2.5-flash'),
        system: systemPrompt,
        prompt: 'Generate the appointment confirmation message.',
      });

      return text;
    } catch (error) {
      console.error('Error generating appointment confirmation:', error);
      return `Great news, ${details.name || 'there'}! Your ${details.visitType || 'appointment'} has been scheduled for ${details.date || 'your requested date'} at ${details.time || 'your requested time'}. Please visit us at 12 Calle 1-25 Zona 10, Guatemala City. See you then!`;
    }
  }
}
