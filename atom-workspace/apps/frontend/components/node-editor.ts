import { Component, signal, computed, OnInit, output } from '@angular/core';
import { DragDropModule, CdkDragEnd } from '@angular/cdk/drag-drop';
import { CommonModule } from '@angular/common';

export type NodeType =
  | 'incoming'
  | 'memory'
  | 'orchestrator'
  | 'validator'
  | 'specialist'
  | 'generic';

export interface NodeData {
  prompt?: string;
  model?: string;
  requiredFields?: string[];
  outputLabels?: string[];
}

export interface WorkflowNode {
  id: string;
  type: NodeType;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  data: NodeData;
}

export interface WorkflowEdge {
  id: string;
  sourceId: string;
  targetId: string;
  sourceHandle?: string;
}

const STORAGE_KEY = 'atom-graph-data';

const NODE_DEFAULTS: Record<
  NodeType,
  { title: string; icon: string; data: NodeData }
> = {
  incoming: {
    title: 'Incoming Message',
    icon: 'chat',
    data: { prompt: 'Receives user messages from Telegram or the test chat.' },
  },
  memory: {
    title: 'Memory Retrieval',
    icon: 'psychology_alt',
    data: {
      prompt:
        'Retrieves the last 10 messages from Firestore using the session ID for context.',
    },
  },
  orchestrator: {
    title: 'Orchestrator Agent',
    icon: 'psychology',
    data: {
      prompt:
        'You are an intent classifier for a car dealership. Analyze the message and context. Output ONLY ONE of: GENERAL_INFO, CATALOG, APPOINTMENT, or GENERIC.',
      model: 'gemini-2.5-flash',
      outputLabels: ['GENERAL_INFO', 'CATALOG', 'APPOINTMENT', 'GENERIC'],
    },
  },
  validator: {
    title: 'Validator Node',
    icon: 'verified_user',
    data: {
      prompt:
        'Extract and validate required user data (budget, vehicle type, condition preference) from the conversation.',
      model: 'gemini-2.5-flash',
      requiredFields: ['budget', 'vehicleType', 'condition'],
    },
  },
  specialist: {
    title: 'Specialist Node',
    icon: 'smart_toy',
    data: {
      prompt:
        'You are a knowledgeable car sales specialist. Use the extracted data to search the inventory and format an enthusiastic, helpful response.',
      model: 'gemini-2.5-flash',
    },
  },
  generic: {
    title: 'Generic Agent',
    icon: 'forum',
    data: {
      prompt:
        'You are a friendly assistant. Handle greetings, small talk, and out-of-scope requests with a helpful response.',
      model: 'gemini-2.5-flash',
    },
  },
};

@Component({
  selector: 'app-node-editor',
  standalone: true,
  imports: [CommonModule, DragDropModule],
  templateUrl: './node-editor.html',
  styleUrl: './node-editor.css',
  host: {
    class: 'block w-full h-full absolute inset-0',
  },
})
export class NodeEditor implements OnInit {
  private nextId = 7;
  snapToGrid = false;
  private readonly GRID_SIZE = 24;

  // Edge creation mode
  edgeCreationSource = signal<{ nodeId: string; handle?: string } | null>(null);

  // Selection emitter for properties panel
  selectedNodeChanged = output<WorkflowNode | null>();

  nodes = signal<WorkflowNode[]>([
    {
      id: '1',
      type: 'incoming',
      title: 'Incoming Message',
      x: 60,
      y: 350,
      width: 220,
      height: 80,
      data: { ...NODE_DEFAULTS.incoming.data },
    },
    {
      id: '2',
      type: 'memory',
      title: 'Memory Retrieval',
      x: 340,
      y: 350,
      width: 220,
      height: 80,
      data: { ...NODE_DEFAULTS.memory.data },
    },
    {
      id: '3',
      type: 'orchestrator',
      title: 'Orchestrator Agent',
      x: 620,
      y: 350,
      width: 260,
      height: 80,
      data: { ...NODE_DEFAULTS.orchestrator.data },
    },
    {
      id: '4',
      type: 'validator',
      title: 'Catalog Validator',
      x: 980,
      y: 150,
      width: 220,
      height: 80,
      data: { ...NODE_DEFAULTS.validator.data },
    },
    {
      id: '5',
      type: 'specialist',
      title: 'Car Specialist',
      x: 1260,
      y: 150,
      width: 220,
      height: 80,
      data: { ...NODE_DEFAULTS.specialist.data },
    },
    {
      id: '6',
      type: 'generic',
      title: 'Generic Agent',
      x: 980,
      y: 550,
      width: 220,
      height: 80,
      data: { ...NODE_DEFAULTS.generic.data },
    },
  ]);

  edges = signal<WorkflowEdge[]>([
    { id: 'e1-2', sourceId: '1', targetId: '2' },
    { id: 'e2-3', sourceId: '2', targetId: '3' },
    { id: 'e3-4', sourceId: '3', targetId: '4', sourceHandle: 'CATALOG' },
    { id: 'e4-5', sourceId: '4', targetId: '5' },
    { id: 'e3-6', sourceId: '3', targetId: '6', sourceHandle: 'GENERIC' },
  ]);

  selectedNodeId = signal<string | null>(null);

  selectedNode = computed(() => {
    const id = this.selectedNodeId();
    return id ? (this.nodes().find((n) => n.id === id) ?? null) : null;
  });

  svgPaths = computed(() => {
    return this.edges().map((edge) => {
      const source = this.nodes().find((n) => n.id === edge.sourceId);
      const target = this.nodes().find((n) => n.id === edge.targetId);

      if (!source || !target) return { path: '', edge };

      const startX = source.x + source.width;
      let startY = source.y + source.height / 2;

      // If source has output labels (orchestrator), offset Y per handle
      if (source.data?.outputLabels && edge.sourceHandle) {
        const labels = source.data.outputLabels;
        const idx = labels.indexOf(edge.sourceHandle);
        if (idx >= 0) {
          const step = source.height / (labels.length + 1);
          startY = source.y + step * (idx + 1);
        }
      }

      const endX = target.x;
      const endY = target.y + target.height / 2;

      const dx = Math.abs(endX - startX);
      const cp = Math.max(80, dx * 0.4);

      return {
        path: `M ${startX},${startY} C ${startX + cp},${startY} ${endX - cp},${endY} ${endX},${endY}`,
        edge,
      };
    });
  });

  ngOnInit() {
    this.loadFromStorage();
  }

  onDragEnd(event: CdkDragEnd, node: WorkflowNode) {
    const transform = event.source.getFreeDragPosition();
    let newX = node.x + transform.x;
    let newY = node.y + transform.y;

    if (this.snapToGrid) {
      newX = Math.round(newX / this.GRID_SIZE) * this.GRID_SIZE;
      newY = Math.round(newY / this.GRID_SIZE) * this.GRID_SIZE;
    }

    this.nodes.update((curr) =>
      curr.map((n) => (n.id === node.id ? { ...n, x: newX, y: newY } : n)),
    );
    event.source._dragRef.reset();
    this.saveToStorage();
  }

  onNodeClick(event: MouseEvent, node: WorkflowNode) {
    event.stopPropagation();
    const newId = this.selectedNodeId() === node.id ? null : node.id;
    this.selectedNodeId.set(newId);
    this.selectedNodeChanged.emit(newId ? node : null);
  }

  onCanvasClick() {
    this.selectedNodeId.set(null);
    this.selectedNodeChanged.emit(null);
    // Cancel edge creation
    this.edgeCreationSource.set(null);
  }

  // ==================== EDGE CREATION ====================
  onOutputPortClick(event: MouseEvent, node: WorkflowNode, handle?: string) {
    event.stopPropagation();
    this.edgeCreationSource.set({ nodeId: node.id, handle });
  }

  onInputPortClick(event: MouseEvent, node: WorkflowNode) {
    event.stopPropagation();
    const source = this.edgeCreationSource();
    if (source && source.nodeId !== node.id) {
      // Check for duplicate
      const exists = this.edges().some(
        (e) =>
          e.sourceId === source.nodeId &&
          e.targetId === node.id &&
          e.sourceHandle === source.handle,
      );
      if (!exists) {
        const newEdge: WorkflowEdge = {
          id: `e${source.nodeId}-${node.id}-${Date.now()}`,
          sourceId: source.nodeId,
          targetId: node.id,
          sourceHandle: source.handle,
        };
        this.edges.update((curr) => [...curr, newEdge]);
        this.saveToStorage();
      }
    }
    this.edgeCreationSource.set(null);
  }

  removeEdge(edgeId: string) {
    this.edges.update((curr) => curr.filter((e) => e.id !== edgeId));
    this.saveToStorage();
  }

  // ==================== NODE MANAGEMENT ====================
  addNode(type: NodeType) {
    const defaults = NODE_DEFAULTS[type];
    const id = String(this.nextId++);
    const offsetX = 200 + Math.random() * 400;
    const offsetY = 200 + Math.random() * 300;
    const w = type === 'orchestrator' ? 260 : 220;

    const newNode: WorkflowNode = {
      id,
      type,
      title: `${defaults.title}`,
      x: this.snapToGrid
        ? Math.round(offsetX / this.GRID_SIZE) * this.GRID_SIZE
        : offsetX,
      y: this.snapToGrid
        ? Math.round(offsetY / this.GRID_SIZE) * this.GRID_SIZE
        : offsetY,
      width: w,
      height: 80,
      data: {
        ...defaults.data,
        outputLabels: defaults.data.outputLabels
          ? [...defaults.data.outputLabels]
          : undefined,
        requiredFields: defaults.data.requiredFields
          ? [...defaults.data.requiredFields]
          : undefined,
      },
    };
    this.nodes.update((curr) => [...curr, newNode]);
    this.saveToStorage();
  }

  removeNode(id: string) {
    this.nodes.update((curr) => curr.filter((n) => n.id !== id));
    this.edges.update((curr) =>
      curr.filter((e) => e.sourceId !== id && e.targetId !== id),
    );
    if (this.selectedNodeId() === id) {
      this.selectedNodeId.set(null);
      this.selectedNodeChanged.emit(null);
    }
    this.saveToStorage();
  }

  renameNode(id: string, newTitle: string) {
    this.nodes.update((curr) =>
      curr.map((n) => (n.id === id ? { ...n, title: newTitle } : n)),
    );
    this.saveToStorage();
  }

  updateNodeData(id: string, data: Partial<NodeData>) {
    this.nodes.update((curr) =>
      curr.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...data } } : n,
      ),
    );
    this.saveToStorage();
  }

  exportGraph() {
    return {
      nodes: this.nodes().map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        position: { x: n.x, y: n.y },
        data: n.data,
      })),
      edges: this.edges().map((e) => ({
        id: e.id,
        source: e.sourceId,
        target: e.targetId,
        sourceHandle: e.sourceHandle,
      })),
    };
  }

  resetGraph() {
    this.nodes.set([
      {
        id: '1',
        type: 'incoming',
        title: 'Incoming Message',
        x: 60,
        y: 350,
        width: 220,
        height: 80,
        data: { ...NODE_DEFAULTS.incoming.data },
      },
      {
        id: '2',
        type: 'memory',
        title: 'Memory Retrieval',
        x: 340,
        y: 350,
        width: 220,
        height: 80,
        data: { ...NODE_DEFAULTS.memory.data },
      },
      {
        id: '3',
        type: 'orchestrator',
        title: 'Orchestrator Agent',
        x: 620,
        y: 350,
        width: 260,
        height: 80,
        data: { ...NODE_DEFAULTS.orchestrator.data },
      },
      {
        id: '4',
        type: 'validator',
        title: 'Catalog Validator',
        x: 980,
        y: 150,
        width: 220,
        height: 80,
        data: { ...NODE_DEFAULTS.validator.data },
      },
      {
        id: '5',
        type: 'specialist',
        title: 'Car Specialist',
        x: 1260,
        y: 150,
        width: 220,
        height: 80,
        data: { ...NODE_DEFAULTS.specialist.data },
      },
      {
        id: '6',
        type: 'generic',
        title: 'Generic Agent',
        x: 980,
        y: 550,
        width: 220,
        height: 80,
        data: { ...NODE_DEFAULTS.generic.data },
      },
    ]);
    this.edges.set([
      { id: 'e1-2', sourceId: '1', targetId: '2' },
      { id: 'e2-3', sourceId: '2', targetId: '3' },
      { id: 'e3-4', sourceId: '3', targetId: '4', sourceHandle: 'CATALOG' },
      { id: 'e4-5', sourceId: '4', targetId: '5' },
      { id: 'e3-6', sourceId: '3', targetId: '6', sourceHandle: 'GENERIC' },
    ]);
    this.nextId = 7;
    this.selectedNodeId.set(null);
    this.selectedNodeChanged.emit(null);
    this.saveToStorage();
  }

  getIcon(type: string) {
    return NODE_DEFAULTS[type as NodeType]?.icon || 'hub';
  }

  getColorClass(type: string) {
    switch (type) {
      case 'incoming':
        return 'bg-sky-500/20 text-sky-400 border-sky-500/40';
      case 'memory':
        return 'bg-violet-500/20 text-violet-400 border-violet-500/40';
      case 'orchestrator':
        return 'bg-primary/20 text-primary border-primary/40';
      case 'validator':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40';
      case 'specialist':
        return 'bg-amber-500/20 text-amber-500 border-amber-500/40';
      case 'generic':
        return 'bg-rose-500/20 text-rose-400 border-rose-500/40';
      default:
        return 'bg-slate-800 text-slate-200 border-slate-600';
    }
  }

  getAccentColor(type: string) {
    switch (type) {
      case 'incoming':
        return '#38bdf8';
      case 'memory':
        return '#a78bfa';
      case 'orchestrator':
        return '#7c3aed';
      case 'validator':
        return '#34d399';
      case 'specialist':
        return '#f59e0b';
      case 'generic':
        return '#fb7185';
      default:
        return '#94a3b8';
    }
  }

  // ==================== PERSISTENCE ====================
  private saveToStorage() {
    const data = {
      nodes: this.nodes(),
      edges: this.edges(),
      nextId: this.nextId,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  private loadFromStorage() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const data = JSON.parse(stored);
        if (data.nodes?.length > 0) {
          // Migrate old nodes that don't have the 'data' property
          const migratedNodes = data.nodes.map((n: any) => ({
            ...n,
            data:
              n.data ||
              (NODE_DEFAULTS[n.type as NodeType]?.data ?? { prompt: '' }),
          }));
          this.nodes.set(migratedNodes);
          this.edges.set(data.edges || []);
          this.nextId =
            data.nextId ||
            Math.max(
              ...data.nodes.map((n: WorkflowNode) => parseInt(n.id, 10)),
            ) + 1;
        }
      } catch {
        /* ignore corrupted data */
      }
    }
  }
}
