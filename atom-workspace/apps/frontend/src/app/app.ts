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
import { HttpClient, HttpClientModule } from '@angular/common/http';
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
    HttpClientModule,
    FormsModule,
    NodeEditor,
  ],
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit, AfterViewInit {
  @ViewChild(NodeEditor) nodeEditor!: NodeEditor;

  private http = inject(HttpClient);
  private cdr = inject(ChangeDetectorRef);

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

  // Settings (persisted in localStorage)
  snapToGrid = signal(false);
  showGrid = signal(true);

  // JSON export
  jsonOutput = signal('');

  // Deployment history (persisted in localStorage)
  deployments = signal<DeploymentRecord[]>([]);

  // Deploy state
  isDeploying = signal(false);

  // Properties panel
  selectedNode = signal<WorkflowNode | null>(null);
  editingPrompt = signal('');
  editingModel = signal('gemini-2.5-flash');

  // Chat testing
  chatMessages = signal<ChatMessage[]>([]);
  chatInput = signal('');
  isChatLoading = signal(false);

  // Firebase endpoints
  private readonly SAVE_CONFIG_URL =
    'https://saveflowconfig-gcfb7e7ryq-uc.a.run.app';
  private readonly WEBCHAT_URL =
    'https://us-central1-atom-dev-day.cloudfunctions.net/webChat';

  // Available models
  readonly modelOptions = [
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
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
    // Persist settings
    effect(() => {
      localStorage.setItem(
        'atom-snap-to-grid',
        JSON.stringify(this.snapToGrid()),
      );
    });

    effect(() => {
      localStorage.setItem('atom-show-grid', JSON.stringify(this.showGrid()));
    });
  }

  ngOnInit() {
    // Restore settings from localStorage
    const snapToGrid = localStorage.getItem('atom-snap-to-grid');
    if (snapToGrid !== null) this.snapToGrid.set(JSON.parse(snapToGrid));

    const showGrid = localStorage.getItem('atom-show-grid');
    if (showGrid !== null) this.showGrid.set(JSON.parse(showGrid));

    // Restore deployment history
    const deployments = localStorage.getItem('atom-deployments');
    if (deployments) {
      try {
        const parsed = JSON.parse(deployments);
        this.deployments.set(
          parsed.map((d: DeploymentRecord) => ({
            ...d,
            timestamp: new Date(d.timestamp),
          })),
        );
      } catch {
        /* ignore corrupted data */
      }
    }

    // Restore chat history
    const chat = localStorage.getItem('atom-chat-messages');
    if (chat) {
      try {
        const parsed = JSON.parse(chat);
        this.chatMessages.set(
          parsed.map((m: ChatMessage) => ({
            ...m,
            timestamp: new Date(m.timestamp),
          })),
        );
      } catch {
        /* ignore corrupted data */
      }
    }
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
    }
  }

  saveNodeProperties() {
    const node = this.selectedNode();
    if (!node || !this.nodeEditor) return;

    this.nodeEditor.updateNodeData(node.id, {
      prompt: this.editingPrompt(),
      model: this.editingModel(),
    });
    this.showNotification('💾 Node properties saved', 'save');
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

    // Record the deployment
    const deployment: DeploymentRecord = {
      id: `deploy-${Date.now()}`,
      name: `Deploy #${this.deployments().length + 1}`,
      description: `${graph.nodes.length} nodes, ${graph.edges.length} edges`,
      timestamp: new Date(),
      status: 'live',
      graphSnapshot: graph,
    };

    // Mark previous deployments as replaced
    const updatedHistory = this.deployments().map((d) => ({
      ...d,
      status: 'replaced' as const,
    }));

    const newHistory = [deployment, ...updatedHistory];
    this.deployments.set(newHistory);
    this.persistDeployments();

    // Save graph to localStorage as the "deployed" version
    localStorage.setItem('atom-deployed-graph', JSON.stringify(graph));

    // Send to Firebase saveFlowConfig endpoint
    try {
      const response = await fetch(this.SAVE_CONFIG_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ graph }),
      });

      if (response.ok) {
        this.showNotification('✅ Flow deployed to Firestore!', 'check_circle');
      } else {
        this.showNotification(
          '✅ Flow saved locally! (Firestore: ' + response.status + ')',
          'cloud_done',
        );
      }
    } catch {
      this.showNotification(
        '✅ Flow config saved locally! (endpoint offline)',
        'cloud_done',
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
    this.persistChat();

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

    this.isChatLoading.set(false);
    this.persistChat();
  }

  clearChat() {
    this.chatMessages.set([]);
    localStorage.removeItem('atom-chat-messages');
    this.showNotification('🗑 Chat history cleared', 'delete_sweep');
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

  clearDeployments() {
    this.deployments.set([]);
    this.persistDeployments();
    this.showNotification('🗑 Deployment history cleared', 'delete_sweep');
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

  // ==================== PERSISTENCE ====================
  private persistDeployments() {
    localStorage.setItem(
      'atom-deployments',
      JSON.stringify(this.deployments()),
    );
  }

  private persistChat() {
    localStorage.setItem(
      'atom-chat-messages',
      JSON.stringify(this.chatMessages()),
    );
  }
}
