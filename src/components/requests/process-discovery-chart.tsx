
"use client";

import { useMemo } from 'react';
import type { EnrichedRequest, EnrichedWorkflowStep } from '@/lib/types';
import { GitBranch, Clock } from 'lucide-react';
import { differenceInHours, parseISO } from 'date-fns';

interface ProcessNode {
  id: string;
  name: string;
  isDeviation: boolean;
  x: number;
  y: number;
}

interface ProcessEdge {
  id: string;
  sourceId: string;
  targetId: string;
  duration: number; // in hours
}

// Function to normalize duration to a stroke width (e.g., 1 to 10)
const normalizeDuration = (duration: number, maxDuration: number, minDuration: number) => {
  if (maxDuration === minDuration) return 2;
  const normalized = (duration - minDuration) / (maxDuration - minDuration);
  return Math.max(1.5, normalized * 8 + 1.5); // From 1.5px to 9.5px
};

export function ProcessDiscoveryChart({ request }: { request: EnrichedRequest }) {
  const { nodes, edges } = useMemo(() => {
    const processNodes: ProcessNode[] = [];
    const processEdges: ProcessEdge[] = [];
    
    // Sort steps by completion time to reconstruct the actual path
    const path = [...request.steps].sort((a, b) => {
      if (!a.completedAt) return 1;
      if (!b.completedAt) return -1;
      return parseISO(a.completedAt).getTime() - parseISO(b.completedAt).getTime();
    });

    // Determine which steps are deviations
    const templateStepIds = new Set(request.template?.steps.map(s => s.id));
    const allSteps = request.steps.map((step, index) => ({
      ...step,
      isDeviation: !templateStepIds.has(step.id),
      y: index * 90 + 50,
      x: 100, // simple linear layout for now
    }));

    // Add "Start" and "End" nodes
    processNodes.push({ id: 'start', name: 'Inicio', isDeviation: false, x: 100, y: 0 });
    
    allSteps.forEach(step => {
        processNodes.push({
            id: step.id,
            name: step.name,
            isDeviation: step.isDeviation,
            x: step.x,
            y: step.y,
        });
    });

    const endY = allSteps.length > 0 ? allSteps[allSteps.length - 1].y + 90 : 90;
    processNodes.push({ id: 'end', name: 'Fin', isDeviation: false, x: 100, y: endY });

    // Create edges based on the actual path taken
    let lastTimestamp = parseISO(request.createdAt);
    let lastNodeId = 'start';
    
    path.forEach(step => {
        if (step.completedAt) {
            const currentTimestamp = parseISO(step.completedAt);
            const duration = differenceInHours(currentTimestamp, lastTimestamp);
            processEdges.push({
                id: `${lastNodeId}->${step.id}`,
                sourceId: lastNodeId,
                targetId: step.id,
                duration: duration,
            });
            lastTimestamp = currentTimestamp;
            lastNodeId = step.id;
        }
    });

    // Add edge to End node if process is completed
    if (request.status === 'Completed' && request.completedAt) {
         const duration = differenceInHours(parseISO(request.completedAt), lastTimestamp);
         processEdges.push({
            id: `${lastNodeId}->end`,
            sourceId: lastNodeId,
            targetId: 'end',
            duration,
        });
    }

    return { nodes: processNodes, edges: processEdges };

  }, [request]);

  if (nodes.length <= 2) {
     return (
        <div className="flex h-56 w-full items-center justify-center rounded-lg border border-dashed">
            <p className="text-muted-foreground">No hay suficientes datos para generar el mapa del proceso.</p>
        </div>
     )
  }

  const maxDuration = Math.max(...edges.map(e => e.duration), 0);
  const minDuration = Math.min(...edges.map(e => e.duration), 0);
  
  return (
    <div className="h-full min-h-56 w-full overflow-x-auto">
        <svg width="100%" height={nodes[nodes.length-1].y + 50} className="font-sans">
            <defs>
                <marker
                    id="arrowhead"
                    viewBox="0 0 10 10"
                    refX="8"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                >
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="hsl(var(--muted-foreground))" />
                </marker>
            </defs>
            {edges.map(edge => {
                const sourceNode = nodes.find(n => n.id === edge.sourceId);
                const targetNode = nodes.find(n => n.id === edge.targetId);
                if (!sourceNode || !targetNode) return null;
                
                const strokeWidth = normalizeDuration(edge.duration, maxDuration, minDuration);

                return (
                    <g key={edge.id}>
                        <path
                            d={`M ${sourceNode.x} ${sourceNode.y + 20} C ${sourceNode.x} ${sourceNode.y + 60}, ${targetNode.x} ${targetNode.y - 40}, ${targetNode.x} ${targetNode.y - 20}`}
                            stroke="hsl(var(--muted-foreground))"
                            strokeWidth={strokeWidth}
                            fill="none"
                            markerEnd="url(#arrowhead)"
                        />
                        <text
                            x={sourceNode.x + 15}
                            y={(sourceNode.y + targetNode.y) / 2}
                            dy=".3em"
                            textAnchor="start"
                            className="fill-muted-foreground text-xs font-medium"
                        >
                            <Clock className="inline-block h-3 w-3 mr-1" />
                            {edge.duration}h
                        </text>
                    </g>
                );
            })}
             {nodes.map(node => (
                <g key={node.id} transform={`translate(${node.x - 75}, ${node.y - 20})`}>
                    <rect
                        width="150"
                        height="40"
                        rx="8"
                        className={cn(
                            "stroke-border",
                            node.isDeviation ? "fill-destructive/10 stroke-destructive" : "fill-background stroke-2"
                        )}
                     />
                    <text
                        x="75"
                        y="20"
                        dy=".3em"
                        textAnchor="middle"
                        className={cn("font-semibold text-sm", node.isDeviation ? "fill-destructive" : "fill-foreground")}
                    >
                        {node.isDeviation && <GitBranch className="inline-block h-4 w-4 mr-2" />}
                        {node.name}
                    </text>
                </g>
            ))}
        </svg>
    </div>
  );
}
