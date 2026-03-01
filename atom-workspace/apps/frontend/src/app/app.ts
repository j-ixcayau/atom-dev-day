import {
  Component,
  ViewChild,
  signal,
  effect,
  OnInit,
  AfterViewInit,
  ChangeDetectorRef,
  inject,
} from '@angular/core';
import { RouterModule } from '@angular/router';
import { UpperCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Firestore, doc, docData, setDoc, serverTimestamp, collection, query, orderBy, collectionData, writeBatch, getDocs } from '@angular/fire/firestore';
import { Auth, user, signInWithEmailAndPassword, signOut } from '@angular/fire/auth';
import { firstValueFrom, Subscription } from 'rxjs';
import {
  NodeEditor,
  WorkflowNode,
  NodeType,
} from '../../components/node-editor';

export interface DeploymentRecord {
  id: string;
  name: string;
  description: string;
  timestamp: Date;
  status: 'live' | 'replaced' | 'failed';
  graphSnapshot: object;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

@Component({
  imports: [
    RouterModule,
    UpperCasePipe,
    FormsModule,
    NodeEditor,
  ],
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit, AfterViewInit {
  @ViewChild(NodeEditor) nodeEditor!: NodeEditor;

  private firestore = inject(Firestore);
  private auth = inject(Auth);
  private cdr = inject(ChangeDetectorRef);

  // Auth state
  user = signal<any | null>(null);
  authLoaded = signal(false);
  
  // Login flow
  loginEmail = signal('');
  loginPassword = signal('');
  loginError = signal('');
  isLoggingIn = signal(false);

  private authSubscription?: Subscription;
  private deploymentsSub?: Subscription;
  private chatSub?: Subscription;

  // Navigation state
  activeTopTab = signal<'flow-editor' | 'deployments'>('flow-editor');
  activeBottomTab = signal<
    'editor' | 'nodes' | 'chat' | 'settings' | 'profile'
  >('editor');

  // Modal & toast state
  showJsonModal = signal(false);
  showToast = signal(false);
  toastMessage = signal('');
  toastIcon = signal('check_circle');

  // Settings
  snapToGrid = signal(false);
  showGrid = signal(true);

  // JSON export
  jsonOutput = signal('');

  // Deployment history (from Firestore)
  deployments = signal<DeploymentRecord[]>([]);

  // Deploy state
  isDeploying = signal(false);

  // Properties panel
  selectedNode = signal<WorkflowNode | null>(null);
  editingPrompt = signal('');
  editingModel = signal('gemini-2.5-flash');
  editingDataSources = signal<string[]>([]);

  // Chat testing
  chatMessages = signal<ChatMessage[]>([]);
  chatInput = signal('');
  isChatLoading = signal(false);
  chatLoadingText = signal('Thinking...');
  private loadingTextInterval: ReturnType<typeof setInterval> | null = null;

  private readonly loadingTexts = [
    'Thinking...',
    'Reading your message...',
    'Retrieving memory...',
    'Classifying intent...',
    'Running orchestrator...',
    'Consulting the AI brain...',
    'Validating request...',
    'Searching knowledge base...',
    'Generating response...',
    'Almost there...',
    'Crafting the perfect reply...',
    'Connecting the dots...',
    'Processing through pipeline...',
    'Warming up neurons...',
  ];

  private readonly WEBCHAT_URL =
    'https://us-central1-atom-dev-day.cloudfunctions.net/webChat';

  // Available models
  readonly modelOptions = [
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
  ];

  // Available data sources for node context injection
  readonly availableDataSources = [
    { id: 'autos', label: 'Vehicle Inventory', icon: 'directions_car' },
    { id: 'dates', label: 'Appointment Slots', icon: 'calendar_month' },
    { id: 'faq', label: 'FAQ Knowledge Base', icon: 'quiz' },
  ];

  // All node types for toolbox
  readonly nodeTypes: {
    type: NodeType;
    icon: string;
    label: string;
    color: string;
  }[] = [
    { type: 'incoming', icon: 'chat', label: 'Incoming', color: 'sky' },
    {
      type: 'memory',
      icon: 'psychology_alt',
      label: 'Memory',
      color: 'violet',
    },
    {
      type: 'orchestrator',
      icon: 'psychology',
      label: 'Orchestrator',
      color: 'primary',
    },
    {
      type: 'validator',
      icon: 'verified_user',
      label: 'Validator',
      color: 'emerald',
    },
    {
      type: 'specialist',
      icon: 'smart_toy',
      label: 'Specialist',
      color: 'amber',
    },
    { type: 'generic', icon: 'forum', label: 'Generic', color: 'rose' },
  ];

  constructor() {
    // Track Auth State
    this.authSubscription = user(this.auth).subscribe((u: any) => {
      this.user.set(u);
      this.authLoaded.set(true);
      if (u) {
        // Only load the DB graph once user is authenticated
        this.loadRemoteGraph();
        this.setupSubscriptions();
      } else {
        this.clearSubscriptions();
      }
    });
  }

  private setupSubscriptions() {
    const depsQuery = query(collection(this.firestore, 'deployments'), orderBy('timestamp', 'desc'));
    // @ts-ignore
    this.deploymentsSub = collectionData(depsQuery, { idField: 'id' }).subscribe((data: any[]) => {
      this.deployments.set(
        data.map(d => ({
          ...d,
          timestamp: d.timestamp?.toDate ? d.timestamp.toDate() : new Date(d.timestamp)
        }))
      );
    });

    const chatQuery = query(collection(this.firestore, 'sessions/web-test-session/messages'), orderBy('timestamp', 'asc'));
    // @ts-ignore
    this.chatSub = collectionData(chatQuery, { idField: 'id' }).subscribe((data: any[]) => {
      this.chatMessages.set(
        data.map(m => ({
          ...m,
          timestamp: m.timestamp?.toDate ? m.timestamp.toDate() : new Date(m.timestamp)
        }))
      );
    });
  }

  private clearSubscriptions() {
    if (this.deploymentsSub) this.deploymentsSub.unsubscribe();
    if (this.chatSub) this.chatSub.unsubscribe();
  }

  async login() {
    this.loginError.set('');
    this.isLoggingIn.set(true);
    try {
      await signInWithEmailAndPassword(this.auth, this.loginEmail(), this.loginPassword());
      this.showNotification('✅ Login successful', 'check_circle');
    } catch (e: any) {
      this.loginError.set(e.message || 'Login failed');
      this.showNotification('❌ Login failed', 'error');
    }
    this.isLoggingIn.set(false);
  }

  async logout() {
    await signOut(this.auth);
    this.loginEmail.set('');
    this.loginPassword.set('');
    this.showNotification('👋 Logged out successfully', 'info');
  }

  async loadRemoteGraph() {
    try {
      const activeFlowDoc = doc(this.firestore, 'flowConfigs/active');
      const data: any = await firstValueFrom(docData(activeFlowDoc));

      if (data && data.graph) {
         setTimeout(() => {
            if (this.nodeEditor && data.graph.nodes) {
               const rehydratedNodes = data.graph.nodes.map((n: any) => ({
                 id: n.id,
                 type: n.type,
                 title: n.title,
                 x: n.position?.x || 0,
                 y: n.position?.y || 0,
                 width: n.type === 'orchestrator' ? 260 : 220,
                 height: 80,
                 data: n.data || {},
               }));

               const rehydratedEdges = (data.graph.edges || []).map((e: any) => ({
                 id: e.id,
                 sourceId: e.source || e.sourceId,
                 targetId: e.target || e.targetId,
                 sourceHandle: e.sourceHandle,
               }));

               this.nodeEditor.nodes.set(rehydratedNodes);
               this.nodeEditor.edges.set(rehydratedEdges);

               if (rehydratedNodes.length > 0) {
                 this.nodeEditor['nextId'] = Math.max(...rehydratedNodes.map((n: WorkflowNode) => parseInt(n.id, 10))) + 1;
               }
            }
         }, 100);
      }
    } catch (e) {
      console.warn('Failed to fetch remote DB graph on init:', e);
    }
  }

  async ngOnInit() {}

  ngOnDestroy() {
    if (this.authSubscription) {
      this.authSubscription.unsubscribe();
    }
    this.clearSubscriptions();
  }

  ngAfterViewInit() {
    // Force a change detection cycle after the child NodeEditor component is fully initialized.
    // This prevents ExpressionChangedAfterItHasBeenCheckedError that triggers when bindings
    // like `nodeEditor.nodes().length` immediately calculate a value of '6' before first paint.
    this.cdr.detectChanges();
  }

  // ==================== NODE SELECTION (Properties Panel) ====================
  onNodeSelected(node: WorkflowNode | null) {
    this.selectedNode.set(node);
    if (node) {
      this.editingPrompt.set(node.data.prompt || '');
      this.editingModel.set(node.data.model || 'gemini-2.5-flash');
      this.editingDataSources.set(node.data.dataSources ? [...node.data.dataSources] : []);
    }
  }

  saveNodeProperties() {
    const node = this.selectedNode();
    if (!node || !this.nodeEditor) return;

    this.nodeEditor.updateNodeData(node.id, {
      prompt: this.editingPrompt(),
      model: this.editingModel(),
      dataSources: this.editingDataSources().length > 0 ? [...this.editingDataSources()] : undefined,
    });
    this.showNotification('💾 Node properties saved', 'save');
  }

  toggleDataSource(id: string) {
    const current = this.editingDataSources();
    if (current.includes(id)) {
      this.editingDataSources.set(current.filter(s => s !== id));
    } else {
      this.editingDataSources.set([...current, id]);
    }
  }

  isDataSourceActive(id: string): boolean {
    return this.editingDataSources().includes(id);
  }

  closeProperties() {
    this.selectedNode.set(null);
    if (this.nodeEditor) {
      this.nodeEditor.selectedNodeId.set(null);
    }
  }

  // ==================== JSON MODAL ====================
  openJsonModal() {
    if (this.nodeEditor) {
      const graph = this.nodeEditor.exportGraph();
      this.jsonOutput.set(JSON.stringify(graph, null, 2));
    }
    this.showJsonModal.set(true);
  }

  closeJsonModal() {
    this.showJsonModal.set(false);
  }

  copyJson() {
    navigator.clipboard.writeText(this.jsonOutput()).then(() => {
      this.showNotification('📋 Copied to clipboard!', 'content_copy');
    });
  }

  // ==================== REAL DEPLOY ====================
  async deploy() {
    if (!this.nodeEditor || this.isDeploying()) return;

    this.isDeploying.set(true);
    this.showNotification('🚀 Deploying flow configuration...', 'cloud_upload');

    const graph = this.nodeEditor.exportGraph();

    // Generate deployment ID
    const deploymentId = `deploy-${Date.now()}`;

    // Send to Firebase DB Directly
    try {
      // Firebase throws "Unsupported field value: undefined" if any property is undefined.
      // We deep clone and strictly remove any potential undefined values.
      const sanitizeForFirestore = (obj: any): any => {
        if (obj === undefined) return null;
        if (obj === null || typeof obj !== 'object') return obj;
        if (Array.isArray(obj)) return obj.map(sanitizeForFirestore);
        const newObj: any = {};
        for (const key of Object.keys(obj)) {
          if (obj[key] !== undefined) {
             newObj[key] = sanitizeForFirestore(obj[key]);
          }
        }
        return newObj;
      };
      
      const sanitizedGraph = sanitizeForFirestore(graph);

      // Save to deployments collection
      const newDeploymentDoc = doc(this.firestore, `deployments/${deploymentId}`);
      await setDoc(newDeploymentDoc, {
        name: `Deploy #${this.deployments().length + 1}`,
        description: `${graph.nodes.length} nodes, ${graph.edges.length} edges`,
        timestamp: serverTimestamp(),
        status: 'live',
        graphSnapshot: sanitizedGraph,
      });

      // Update active flow config
      const activeFlowDoc = doc(this.firestore, 'flowConfigs/active');
      await setDoc(activeFlowDoc, {
         graph: sanitizedGraph,
         updatedAt: serverTimestamp(),
         nodeCount: sanitizedGraph.nodes?.length || 0,
         edgeCount: sanitizedGraph.edges?.length || 0,
      });

      this.showNotification('✅ Flow deployed directly to Database!', 'check_circle');
    } catch (err: any) {
      console.error('Firestore setDoc failed:', err);
      this.showNotification(
        '❌ DB Error: ' + (err.message || 'Unknown error'),
        'error',
      );
    }

    this.isDeploying.set(false);
  }

  // ==================== CHAT TESTING ====================
  async sendChatMessage() {
    const message = this.chatInput().trim();
    if (!message || this.isChatLoading()) return;

    // Add user message
    const userMsg: ChatMessage = {
      role: 'user',
      content: message,
      timestamp: new Date(),
    };
    this.chatMessages.update((curr) => [...curr, userMsg]);
    this.chatInput.set('');
    this.isChatLoading.set(true);
    this.startLoadingTextRotation();

    try {
      const response = await fetch(this.WEBCHAT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: message,
          sessionId: 'web-test-session', // A fixed session ID for the test chat to remember context
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const assistantMsg: ChatMessage = {
          role: 'assistant',
          content: data.response || '✅ Received empty response.',
          timestamp: new Date(),
        };
        this.chatMessages.update((curr) => [...curr, assistantMsg]);
      } else {
        const assistantMsg: ChatMessage = {
          role: 'assistant',
          content: 'The endpoint returned status ' + response.status + '.',
          timestamp: new Date(),
        };
        this.chatMessages.update((curr) => [...curr, assistantMsg]);
      }
    } catch {
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content:
          '⚠️ Could not reach the backend. Make sure Firebase Cloud Functions are deployed. Run: `firebase deploy --only functions`',
        timestamp: new Date(),
      };
      this.chatMessages.update((curr) => [...curr, assistantMsg]);
    }

    this.stopLoadingTextRotation();
    this.isChatLoading.set(false);
  }

  async clearChat() {
    this.showNotification('🗑 Clearing chat history...', 'delete_sweep');
    try {
      const msgsRef = collection(this.firestore, 'sessions/web-test-session/messages');
      const snapshot = await getDocs(query(msgsRef));
      const batch = writeBatch(this.firestore);
      snapshot.docs.forEach(d => batch.delete(d.ref));
      
      // Also clear the session doc itself to remove summary
      batch.delete(doc(this.firestore, 'sessions/web-test-session'));
      
      await batch.commit();
      this.chatMessages.set([]);
      this.showNotification('✅ Chat history cleared', 'check_circle');
    } catch (e) {
      console.error('Clear chat error:', e);
      this.showNotification('❌ Failed to clear chat', 'error');
    }
  }

  onChatKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendChatMessage();
    }
  }

  // ==================== NODE MANAGEMENT ====================
  addNode(type: NodeType) {
    if (this.nodeEditor) {
      this.nodeEditor.addNode(type);
      this.showNotification(`➕ Added ${type} node`, 'add_circle');
    }
  }

  deleteSelectedNode() {
    if (this.nodeEditor?.selectedNodeId()) {
      const node = this.nodeEditor
        .nodes()
        .find((n) => n.id === this.nodeEditor.selectedNodeId());
      this.nodeEditor.removeNode(this.nodeEditor.selectedNodeId()!);
      this.selectedNode.set(null);
      this.showNotification(`🗑 Deleted "${node?.title || 'node'}"`, 'delete');
    } else {
      this.showNotification('⚠️ Select a node first', 'warning');
    }
  }

  // ==================== SETTINGS ====================
  toggleSnapToGrid() {
    this.snapToGrid.set(!this.snapToGrid());
    if (this.nodeEditor) {
      this.nodeEditor.snapToGrid = this.snapToGrid();
    }
  }

  toggleShowGrid() {
    this.showGrid.set(!this.showGrid());
  }

  async clearDeployments() {
    this.showNotification('🗑 Clearing deployments...', 'delete_sweep');
    try {
      const depsRef = collection(this.firestore, 'deployments');
      const snapshot = await getDocs(query(depsRef));
      const batch = writeBatch(this.firestore);
      snapshot.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      this.deployments.set([]);
      this.showNotification('✅ Deployments cleared', 'check_circle');
    } catch (e) {
      console.error('Clear deployments error:', e);
      this.showNotification('❌ Failed to clear deployments', 'error');
    }
  }

  // ==================== DEPLOYMENT DETAIL ====================
  viewDeploymentGraph(deployment: DeploymentRecord) {
    this.jsonOutput.set(JSON.stringify(deployment.graphSnapshot, null, 2));
    this.showJsonModal.set(true);
  }

  getTimeSince(timestamp: Date): string {
    const now = new Date();
    const seconds = Math.floor(
      (now.getTime() - new Date(timestamp).getTime()) / 1000,
    );

    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }

  // ==================== NOTIFICATIONS ====================
  showNotification(message: string, icon = 'check_circle') {
    this.toastMessage.set(message);
    this.toastIcon.set(icon);
    this.showToast.set(true);
    setTimeout(() => this.showToast.set(false), 3000);
  }

  // ==================== LOADING TEXT ROTATION ====================
  private startLoadingTextRotation() {
    this.chatLoadingText.set(this.loadingTexts[0]);
    let index = 0;
    this.loadingTextInterval = setInterval(() => {
      index = (index + 1) % this.loadingTexts.length;
      this.chatLoadingText.set(this.loadingTexts[index]);
    }, 1000);
  }

  private stopLoadingTextRotation() {
    if (this.loadingTextInterval) {
      clearInterval(this.loadingTextInterval);
      this.loadingTextInterval = null;
    }
  }
}
