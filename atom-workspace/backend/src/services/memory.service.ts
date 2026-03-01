import * as admin from 'firebase-admin';

// Initialize the app if it hasn't been initialized yet
if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface SessionData {
  messages: Message[];
  summary: string;
  userName: string | null;
}

/**
 * Service to handle fetching and saving chat history using Firestore.
 */
export class MemoryService {
  private collectionPath = 'sessions';
  private MAX_MESSAGES = 10;

  /**
   * Fetches the session data including last messages, summary, and user name.
   */
  async getSessionData(sessionId: string): Promise<SessionData> {
    try {
      const docRef = db.collection(this.collectionPath).doc(sessionId);
      const doc = await docRef.get();

      if (!doc.exists) {
        return { messages: [], summary: '', userName: null };
      }

      const data = doc.data();
      const messages: Message[] = data?.messages || [];
      const summary: string = data?.summary || '';
      const userName: string | null = data?.userName || null;

      // Ensure we only return the most recent MAX_MESSAGES
      return {
        messages: messages.slice(-this.MAX_MESSAGES),
        summary,
        userName,
      };
    } catch (error) {
      console.error(
        `Error fetching session data for session ${sessionId}:`,
        error,
      );
      return { messages: [], summary: '', userName: null };
    }
  }

  /**
   * Appends new messages and updates summary and user name.
   */
  async updateSessionData(
    sessionId: string,
    newMessages: Message[],
    summary: string,
    userName: string | null,
  ): Promise<void> {
    try {
      const docRef = db.collection(this.collectionPath).doc(sessionId);

      await docRef.set(
        {
          messages: admin.firestore.FieldValue.arrayUnion(...newMessages),
          summary,
          userName,
        },
        { merge: true },
      );
    } catch (error) {
      console.error(
        `Error updating session data for session ${sessionId}:`,
        error,
      );
    }
  }
}
