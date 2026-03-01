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
  language: string | null;
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
      
      // 1. Fetch the lightweight session document (only contains summary & userName)
      const doc = await docRef.get();

      if (!doc.exists) {
        return { messages: [], summary: '', userName: null, language: null };
      }

      const data = doc.data();
      const summary: string = data?.summary || '';
      const userName: string | null = data?.userName || null;
      const language: string | null = data?.language || null;

      // 2. Fetch ONLY the most recent N messages from the subcollection
      // This is the major optimization!
      const messagesSnapshot = await docRef
        .collection('messages')
        .orderBy('timestamp', 'desc')
        .limit(this.MAX_MESSAGES)
        .get();

      const messages: Message[] = [];
      messagesSnapshot.forEach((msgDoc) => {
        const msgData = msgDoc.data();
        messages.push({
          role: msgData.role,
          content: msgData.content,
          timestamp: msgData.timestamp?.toDate ? msgData.timestamp.toDate() : new Date(msgData.timestamp),
        });
      });

      // We ordered descending to get the newest, but the LLM needs them in chronological order
      messages.reverse();

      if (messages.length === 0 && data?.messages && Array.isArray(data.messages)) {
         return {
             messages: data.messages.slice(-this.MAX_MESSAGES),
             summary,
             userName,
             language
         };
      }

      return {
        messages,
        summary,
        userName,
        language
      };
    } catch (error) {
      console.error(
        `Error fetching session data for session ${sessionId}:`,
        error,
      );
      return { messages: [], summary: '', userName: null, language: null };
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
    language: string | null,
  ): Promise<void> {
    try {
      const docRef = db.collection(this.collectionPath).doc(sessionId);

      // 1. Update the lightweight session document
      // Notice we no longer use arrayUnion for messages here.
      await docRef.set(
        {
          summary,
          userName,
          language,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      // 2. Add the new messages to the subcollection using a Batch Write
      if (newMessages && newMessages.length > 0) {
        const batch = db.batch();
        const messagesRef = docRef.collection('messages');
        
        for (const msg of newMessages) {
          const newMsgRef = messagesRef.doc(); // Auto-generate ID
          batch.set(newMsgRef, {
            role: msg.role,
            content: msg.content,
            timestamp: msg.timestamp || admin.firestore.FieldValue.serverTimestamp(),
          });
        }
        
        await batch.commit();
      }
    } catch (error) {
      console.error(
        `Error updating session data for session ${sessionId}:`,
        error,
      );
    }
  }
}
