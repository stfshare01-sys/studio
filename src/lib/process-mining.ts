/**
 * Process Mining Utilities Library
 *
 * Provides advanced process mining calculations including:
 * - Process Variants Analysis
 * - Conformance Checking
 * - Statistical Process Control
 * - Resource Analytics
 * - Predictive Metrics
 */

import { Request, Task, Template, User } from './types';
import { differenceInHours, differenceInMinutes, parseISO, startOfDay, format } from 'date-fns';

// ============================================
// TYPES
// ============================================

export interface ProcessVariant {
  id: string;
  path: string[];
  frequency: number;
  percentage: number;
  avgCycleTime: number; // in hours
  minCycleTime: number;
  maxCycleTime: number;
  requests: string[]; // request IDs
}

export interface ConformanceMetrics {
  overallCompliance: number; // 0-100
  fitnesScore: number; // How well the log fits the model
  precisionScore: number; // How precise the model is
  deviations: ConformanceDeviation[];
  complianceByTemplate: Record<string, number>;
}

export interface ConformanceDeviation {
  requestId: string;
  requestTitle: string;
  deviationType: 'skipped_step' | 'extra_step' | 'out_of_order' | 'timeout';
  description: string;
  severity: 'low' | 'medium' | 'high';
  stepName?: string;
}

export interface SPCDataPoint {
  date: string;
  value: number;
  ucl: number; // Upper Control Limit
  lcl: number; // Lower Control Limit
  mean: number;
  isAnomaly: boolean;
}

export interface ResourceMetrics {
  userId: string;
  userName: string;
  tasksCompleted: number;
  avgCompletionTime: number; // hours
  workloadScore: number; // 0-100
  efficiency: number; // 0-100, compared to team average
  tasksByType: Record<string, number>;
}

export interface BottleneckAnalysis {
  stepName: string;
  avgDuration: number;
  medianDuration: number;
  stdDeviation: number;
  frequency: number;
  bottleneckScore: number; // 0-100, higher = more bottleneck
  trend: 'improving' | 'stable' | 'worsening';
  previousAvgDuration?: number;
}

// ============================================
// PROCESS VARIANTS ANALYSIS
// ============================================

export function analyzeProcessVariants(requests: Request[]): ProcessVariant[] {
  const variantMap = new Map<string, {
    path: string[];
    requests: Request[];
  }>();

  // Group requests by their execution path
  requests.forEach(request => {
    const completedSteps = request.steps
      .filter(s => s.status === 'Completed' && s.completedAt)
      .sort((a, b) => parseISO(a.completedAt!).getTime() - parseISO(b.completedAt!).getTime());

    const path = completedSteps.map(s => s.name);
    const pathKey = path.join(' → ');

    if (!variantMap.has(pathKey)) {
      variantMap.set(pathKey, { path, requests: [] });
    }
    variantMap.get(pathKey)!.requests.push(request);
  });

  const totalRequests = requests.length;
  const variants: ProcessVariant[] = [];

  variantMap.forEach((data, pathKey) => {
    const cycleTimes = data.requests
      .filter(r => r.completedAt)
      .map(r => differenceInHours(parseISO(r.completedAt!), parseISO(r.createdAt)));

    variants.push({
      id: pathKey || 'empty-path',
      path: data.path,
      frequency: data.requests.length,
      percentage: totalRequests > 0 ? (data.requests.length / totalRequests) * 100 : 0,
      avgCycleTime: cycleTimes.length > 0
        ? cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length
        : 0,
      minCycleTime: cycleTimes.length > 0 ? Math.min(...cycleTimes) : 0,
      maxCycleTime: cycleTimes.length > 0 ? Math.max(...cycleTimes) : 0,
      requests: data.requests.map(r => r.id),
    });
  });

  // Sort by frequency descending
  return variants.sort((a, b) => b.frequency - a.frequency);
}

// ============================================
// CONFORMANCE CHECKING
// ============================================

export function analyzeConformance(
  requests: Request[],
  templates: Template[]
): ConformanceMetrics {
  const deviations: ConformanceDeviation[] = [];
  let totalSteps = 0;
  let conformingSteps = 0;
  const complianceByTemplate: Record<string, { conforming: number; total: number }> = {};

  requests.forEach(request => {
    const template = templates.find(t => t.id === request.templateId) || request.template;
    if (!template) return;

    if (!complianceByTemplate[template.id]) {
      complianceByTemplate[template.id] = { conforming: 0, total: 0 };
    }

    const templateStepIds = new Set(template.steps.map(s => s.id));
    const templateStepOrder = template.steps.map(s => s.id);

    // Check for skipped steps
    const completedStepIds = new Set(
      request.steps.filter(s => s.status === 'Completed').map(s => s.id)
    );

    template.steps.forEach(templateStep => {
      totalSteps++;
      complianceByTemplate[template.id].total++;

      if (completedStepIds.has(templateStep.id)) {
        conformingSteps++;
        complianceByTemplate[template.id].conforming++;
      } else if (request.status === 'Completed') {
        // Step was skipped in a completed request
        deviations.push({
          requestId: request.id,
          requestTitle: request.title,
          deviationType: 'skipped_step',
          description: `El paso "${templateStep.name}" fue omitido`,
          severity: 'medium',
          stepName: templateStep.name,
        });
      }
    });

    // Check for extra steps (not in template)
    request.steps.forEach(step => {
      if (!templateStepIds.has(step.id) && step.status === 'Completed') {
        deviations.push({
          requestId: request.id,
          requestTitle: request.title,
          deviationType: 'extra_step',
          description: `Se añadió un paso adicional: "${step.name}"`,
          severity: 'low',
          stepName: step.name,
        });
      }
    });

    // Check for out-of-order execution
    const executionOrder = request.steps
      .filter(s => s.completedAt && templateStepIds.has(s.id))
      .sort((a, b) => parseISO(a.completedAt!).getTime() - parseISO(b.completedAt!).getTime())
      .map(s => s.id);

    let expectedIndex = 0;
    executionOrder.forEach(stepId => {
      const templateIndex = templateStepOrder.indexOf(stepId);
      if (templateIndex < expectedIndex) {
        const step = request.steps.find(s => s.id === stepId);
        deviations.push({
          requestId: request.id,
          requestTitle: request.title,
          deviationType: 'out_of_order',
          description: `El paso "${step?.name}" se ejecutó fuera de orden`,
          severity: 'low',
          stepName: step?.name,
        });
      }
      expectedIndex = Math.max(expectedIndex, templateIndex);
    });
  });

  const overallCompliance = totalSteps > 0 ? (conformingSteps / totalSteps) * 100 : 100;

  // Calculate fitness (how well traces fit the model)
  const fitnessScore = requests.length > 0
    ? Math.max(0, 100 - (deviations.filter(d => d.deviationType === 'skipped_step').length / requests.length) * 20)
    : 100;

  // Calculate precision (how precise the model is - fewer extra steps = better)
  const precisionScore = requests.length > 0
    ? Math.max(0, 100 - (deviations.filter(d => d.deviationType === 'extra_step').length / requests.length) * 15)
    : 100;

  const templateCompliance: Record<string, number> = {};
  Object.entries(complianceByTemplate).forEach(([templateId, data]) => {
    templateCompliance[templateId] = data.total > 0
      ? (data.conforming / data.total) * 100
      : 100;
  });

  return {
    overallCompliance: Math.round(overallCompliance * 10) / 10,
    fitnesScore: Math.round(fitnessScore * 10) / 10,
    precisionScore: Math.round(precisionScore * 10) / 10,
    deviations: deviations.slice(0, 50), // Limit to 50 most recent
    complianceByTemplate: templateCompliance,
  };
}

// ============================================
// STATISTICAL PROCESS CONTROL
// ============================================

export function calculateSPCData(
  requests: Request[],
  metric: 'cycle_time' | 'steps_count' = 'cycle_time',
  periodDays: number = 30
): SPCDataPoint[] {
  // Group by day
  const dataByDate = new Map<string, number[]>();

  requests.forEach(request => {
    if (!request.completedAt) return;

    const dateKey = format(startOfDay(parseISO(request.completedAt)), 'yyyy-MM-dd');

    let value: number;
    if (metric === 'cycle_time') {
      value = differenceInHours(parseISO(request.completedAt), parseISO(request.createdAt));
    } else {
      value = request.steps.filter(s => s.status === 'Completed').length;
    }

    if (!dataByDate.has(dateKey)) {
      dataByDate.set(dateKey, []);
    }
    dataByDate.get(dateKey)!.push(value);
  });

  // Calculate daily averages
  const dailyAverages: { date: string; value: number }[] = [];
  dataByDate.forEach((values, date) => {
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    dailyAverages.push({ date, value: avg });
  });

  // Sort by date
  dailyAverages.sort((a, b) => a.date.localeCompare(b.date));

  if (dailyAverages.length < 2) {
    return dailyAverages.map(d => ({
      ...d,
      ucl: d.value * 1.5,
      lcl: Math.max(0, d.value * 0.5),
      mean: d.value,
      isAnomaly: false,
    }));
  }

  // Calculate mean and standard deviation
  const allValues = dailyAverages.map(d => d.value);
  const mean = allValues.reduce((a, b) => a + b, 0) / allValues.length;
  const variance = allValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / allValues.length;
  const stdDev = Math.sqrt(variance);

  // Control limits (3-sigma)
  const ucl = mean + 3 * stdDev;
  const lcl = Math.max(0, mean - 3 * stdDev);

  return dailyAverages.map(d => ({
    date: d.date,
    value: Math.round(d.value * 10) / 10,
    ucl: Math.round(ucl * 10) / 10,
    lcl: Math.round(lcl * 10) / 10,
    mean: Math.round(mean * 10) / 10,
    isAnomaly: d.value > ucl || d.value < lcl,
  }));
}

// ============================================
// RESOURCE ANALYTICS
// ============================================

export function analyzeResources(
  tasks: Task[],
  users: User[]
): ResourceMetrics[] {
  const userTaskMap = new Map<string, Task[]>();

  // Group tasks by assignee
  tasks.forEach(task => {
    if (!task.assigneeId) return;
    if (!userTaskMap.has(task.assigneeId)) {
      userTaskMap.set(task.assigneeId, []);
    }
    userTaskMap.get(task.assigneeId)!.push(task);
  });

  // Calculate team average completion time
  const allCompletedTasks = tasks.filter(t => t.status === 'Completed' && t.completedAt);
  const teamAvgTime = allCompletedTasks.length > 0
    ? allCompletedTasks.reduce((sum, t) =>
        sum + differenceInHours(parseISO(t.completedAt!), parseISO(t.createdAt)), 0
      ) / allCompletedTasks.length
    : 0;

  const metrics: ResourceMetrics[] = [];

  userTaskMap.forEach((userTasks, userId) => {
    const user = users.find(u => u.id === userId);
    if (!user) return;

    const completedTasks = userTasks.filter(t => t.status === 'Completed' && t.completedAt);
    const pendingTasks = userTasks.filter(t => t.status === 'Pending' || t.status === 'Active');

    const avgTime = completedTasks.length > 0
      ? completedTasks.reduce((sum, t) =>
          sum + differenceInHours(parseISO(t.completedAt!), parseISO(t.createdAt)), 0
        ) / completedTasks.length
      : 0;

    // Calculate workload score (pending tasks relative to max)
    const maxPendingTasks = 10; // Configurable threshold
    const workloadScore = Math.min(100, (pendingTasks.length / maxPendingTasks) * 100);

    // Calculate efficiency (faster than team average = higher efficiency)
    let efficiency = 50; // Default
    if (teamAvgTime > 0 && avgTime > 0) {
      efficiency = Math.min(100, Math.max(0, (teamAvgTime / avgTime) * 50));
    }

    // Group by task type
    const tasksByType: Record<string, number> = {};
    completedTasks.forEach(t => {
      tasksByType[t.name] = (tasksByType[t.name] || 0) + 1;
    });

    metrics.push({
      userId,
      userName: user.fullName,
      tasksCompleted: completedTasks.length,
      avgCompletionTime: Math.round(avgTime * 10) / 10,
      workloadScore: Math.round(workloadScore),
      efficiency: Math.round(efficiency),
      tasksByType,
    });
  });

  // Sort by tasks completed descending
  return metrics.sort((a, b) => b.tasksCompleted - a.tasksCompleted);
}

// ============================================
// BOTTLENECK ANALYSIS
// ============================================

export function analyzeBottlenecks(
  tasks: Task[],
  previousPeriodTasks?: Task[]
): BottleneckAnalysis[] {
  const tasksByName = new Map<string, Task[]>();

  // Group current tasks by name
  tasks.filter(t => t.status === 'Completed' && t.completedAt).forEach(task => {
    if (!tasksByName.has(task.name)) {
      tasksByName.set(task.name, []);
    }
    tasksByName.get(task.name)!.push(task);
  });

  // Group previous period tasks if provided
  const prevTasksByName = new Map<string, Task[]>();
  if (previousPeriodTasks) {
    previousPeriodTasks.filter(t => t.status === 'Completed' && t.completedAt).forEach(task => {
      if (!prevTasksByName.has(task.name)) {
        prevTasksByName.set(task.name, []);
      }
      prevTasksByName.get(task.name)!.push(task);
    });
  }

  const bottlenecks: BottleneckAnalysis[] = [];
  let maxAvgDuration = 0;

  tasksByName.forEach((taskGroup, name) => {
    const durations = taskGroup.map(t =>
      differenceInHours(parseISO(t.completedAt!), parseISO(t.createdAt))
    );

    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    maxAvgDuration = Math.max(maxAvgDuration, avgDuration);

    // Calculate median
    const sorted = [...durations].sort((a, b) => a - b);
    const medianDuration = sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];

    // Calculate standard deviation
    const variance = durations.reduce((sum, d) => sum + Math.pow(d - avgDuration, 2), 0) / durations.length;
    const stdDeviation = Math.sqrt(variance);

    // Calculate previous period average for trend
    let previousAvgDuration: number | undefined;
    let trend: 'improving' | 'stable' | 'worsening' = 'stable';

    const prevGroup = prevTasksByName.get(name);
    if (prevGroup && prevGroup.length > 0) {
      const prevDurations = prevGroup.map(t =>
        differenceInHours(parseISO(t.completedAt!), parseISO(t.createdAt))
      );
      previousAvgDuration = prevDurations.reduce((a, b) => a + b, 0) / prevDurations.length;

      const change = ((avgDuration - previousAvgDuration) / previousAvgDuration) * 100;
      if (change < -10) trend = 'improving';
      else if (change > 10) trend = 'worsening';
    }

    bottlenecks.push({
      stepName: name,
      avgDuration: Math.round(avgDuration * 10) / 10,
      medianDuration: Math.round(medianDuration * 10) / 10,
      stdDeviation: Math.round(stdDeviation * 10) / 10,
      frequency: taskGroup.length,
      bottleneckScore: 0, // Will be calculated below
      trend,
      previousAvgDuration: previousAvgDuration ? Math.round(previousAvgDuration * 10) / 10 : undefined,
    });
  });

  // Calculate bottleneck scores (normalized 0-100)
  bottlenecks.forEach(b => {
    if (maxAvgDuration > 0) {
      b.bottleneckScore = Math.round((b.avgDuration / maxAvgDuration) * 100);
    }
  });

  // Sort by bottleneck score descending
  return bottlenecks.sort((a, b) => b.bottleneckScore - a.bottleneckScore);
}

// ============================================
// CYCLE TIME PREDICTION
// ============================================

export function predictCycleTime(
  requests: Request[],
  templateId: string
): { predicted: number; confidence: number; range: { min: number; max: number } } {
  const templateRequests = requests.filter(
    r => r.templateId === templateId && r.status === 'Completed' && r.completedAt
  );

  if (templateRequests.length < 3) {
    return { predicted: 0, confidence: 0, range: { min: 0, max: 0 } };
  }

  const cycleTimes = templateRequests.map(r =>
    differenceInHours(parseISO(r.completedAt!), parseISO(r.createdAt))
  );

  const mean = cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length;
  const sorted = [...cycleTimes].sort((a, b) => a - b);

  // Calculate 90th percentile for range
  const p10Index = Math.floor(cycleTimes.length * 0.1);
  const p90Index = Math.floor(cycleTimes.length * 0.9);

  // Confidence based on sample size
  const confidence = Math.min(95, 50 + (templateRequests.length * 5));

  return {
    predicted: Math.round(mean * 10) / 10,
    confidence: Math.round(confidence),
    range: {
      min: Math.round(sorted[p10Index] * 10) / 10,
      max: Math.round(sorted[p90Index] * 10) / 10,
    },
  };
}

// ============================================
// HELPER: Calculate Process Health Score
// ============================================

export function calculateProcessHealthScore(
  conformance: ConformanceMetrics,
  bottlenecks: BottleneckAnalysis[],
  spcData: SPCDataPoint[]
): number {
  // Weights for each component
  const weights = {
    conformance: 0.4,
    bottleneck: 0.3,
    stability: 0.3,
  };

  // Conformance score (already 0-100)
  const conformanceScore = conformance.overallCompliance;

  // Bottleneck score (inverse - fewer severe bottlenecks = better)
  const avgBottleneckScore = bottlenecks.length > 0
    ? bottlenecks.reduce((sum, b) => sum + b.bottleneckScore, 0) / bottlenecks.length
    : 0;
  const bottleneckHealth = 100 - avgBottleneckScore;

  // Stability score (fewer anomalies = better)
  const anomalyRate = spcData.length > 0
    ? spcData.filter(d => d.isAnomaly).length / spcData.length
    : 0;
  const stabilityScore = (1 - anomalyRate) * 100;

  const healthScore =
    conformanceScore * weights.conformance +
    bottleneckHealth * weights.bottleneck +
    stabilityScore * weights.stability;

  return Math.round(healthScore);
}
