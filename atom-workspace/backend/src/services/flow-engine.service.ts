export interface FlowGraph {
  nodes: any[];
  edges: any[];
}

/**
 * Service to handle querying and traversing the JSON flow configuration
 * produced by the visual editor.
 */
export class FlowEngineService {
  /**
   * Finds a node by its frontend type (e.g., 'orchestrator', 'memory').
   */
  findNodeByType(graph: FlowGraph, type: string) {
    return graph.nodes.find((n) => n.type === type);
  }

  /**
   * Finds the target node ID connected to the source node via a specific handle.
   * If sourceHandle is provided:
   *   1. Finds an exact match edge.
   *   2. Falls back to a default edge (no handle) if no specific match exists.
   */
  findNextNodeId(
    graph: FlowGraph,
    sourceId: string,
    sourceHandle?: string,
  ): string | null {
    const edge = graph.edges.find(
      (e) =>
        e.source === sourceId &&
        (sourceHandle ? e.sourceHandle === sourceHandle : true),
    );

    if (!edge && sourceHandle) {
      // Fallback to default edge with no defined handle
      const defaultEdge = graph.edges.find(
        (e) => e.source === sourceId && !e.sourceHandle,
      );
      return defaultEdge ? defaultEdge.target : null;
    }

    return edge ? edge.target : null;
  }
}
