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

/**
 * Service to handle fetching and saving chat history using Firestore.
 */
export class MemoryService {
  private collectionPath = 'sessions';
  private MAX_MESSAGES = 10;

  /**
   * Fetches the last 5-10 messages for a given session ID (Telegram chat ID).
   */
  async getChatHistory(sessionId: string): Promise<Message[]> {
    try {
      const docRef = db.collection(this.collectionPath).doc(sessionId);
      const doc = await docRef.get();

      if (!doc.exists) {
        return [];
      }

      const data = doc.data();
      const messages: Message[] = data?.messages || [];
      
      // Ensure we only return the most recent MAX_MESSAGES
      return messages.slice(-this.MAX_MESSAGES);
    } catch (error) {
      console.error(`Error fetching chat history for session ${sessionId}:`, error);
      return [];
    }
  }

  /**
   * Appends new messages (user and AI) to the session's chat history.
   */
  async appendMessages(sessionId: string, newMessages: Message[]): Promise<void> {
    try {
      const docRef = db.collection(this.collectionPath).doc(sessionId);
      
      // We use set with merge: true to create the document if it doesn't exist
      // and FieldValue.arrayUnion to efficiently append to the array.
      // Note: We'll manually manage the array size if it gets too large in a real app,
      // but arrayUnion is great for hackathons.
      
      await docRef.set({
        messages: admin.firestore.FieldValue.arrayUnion(...newMessages)
      }, { merge: true });
      
    } catch (error) {
      console.error(`Error appending messages for session ${sessionId}:`, error);
    }
  }
}
