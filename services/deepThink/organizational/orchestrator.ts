import { getThinkingBudget } from '@/config';
import type {
  AppConfig,
  AppState,
  ChatMessage,
  ExpertResult,
  ModelOption,
  TaskSpec,
  ExecutionPlan,
} from '@/types';
import { executeDemandsAnalysis } from './analyst';
import { executeStrategicPlanning } from './planner';
import { executeQualityAssurance } from './inspector';
import { streamExpertResponse } from './expert';
import { streamDeliveryManager as streamRRDeliveryManager } from './rrSynthesis';
import { streamDeliveryManager as streamSGDeliveryManager } from './sgSynthesis';

import { getAI, resolveModelApiConfig } from '@/api';

export interface OrgDeepThinkRuntimeBridge {
  queueRef: { current: any }; // Using any for queue to avoid circular dependency
  abortControllerRef: { current: AbortController | null };
  expertsDataRef: { current: ExpertResult[] };
  updateQueueConcurrency: (concurrency: number) => void;
  setAppState: (state: AppState) => void;
  setInitialExperts: (experts: ExpertResult[]) => void;
  updateExpertAt: (
    index: number,
    update: Partial<ExpertResult> | ((prev: ExpertResult) => ExpertResult),
  ) => void;
  setFinalOutput: (output: string) => void;
  setProcessStartTime: (time: number | null) => void;
  setProcessEndTime: (time: number | null) => void;
  // New organizational methods
  setTaskSpec: (spec: TaskSpec | null) => void;
  setExecutionPlan: (plan: ExecutionPlan | null) => void;
  setDeliveryPhase: (phase: string) => void;
}

const getRecentHistory = (history: ChatMessage[]): string => {
  return history
    .slice(0, -1)
    .slice(-5)
    .map((message) => `${message.role === 'user' ? 'User' : 'Model'}: ${message.content}`)
    .join('\n');
};

const getCurrentAttachments = (history: ChatMessage[]) => {
  const lastMessage = history[history.length - 1];
  return lastMessage?.role === 'user' ? lastMessage.attachments || [] : [];
};

const formatSynthesisErrorMessage = (error: unknown, query: string): string => {
  const message = error instanceof Error ? error.message : 'Failed to aggregate expert responses.';

  const guidance = message.includes('Target host not allowed')
    ? 'Docker API 代理未放行当前 Base URL 域名。请把该域名加入 PRISMA_PROXY_ALLOWED_HOSTS 后重新部署。'
    : 'Please check your API keys and try again.';

  return `## Error in Synthesis\n\n${message}\n\n${guidance}`;
};

export const runOrganizationalDeepThinkOrchestration = async (
  mode: 'rr' | 'sg',
  query: string,
  history: ChatMessage[],
  model: ModelOption,
  config: AppConfig,
  bridge: OrgDeepThinkRuntimeBridge,
) => {
  console.log('[DeepThink Debug] runOrganizationalDeepThinkOrchestration: STARTING for mode:', mode);
  
  if (!query.trim() && (!history.length || !history[history.length - 1].attachments?.length)) {
    console.log('[DeepThink Debug] runOrganizationalDeepThinkOrchestration: empty query/attachments, returning early');
    return;
  }

  if (bridge.abortControllerRef.current) bridge.abortControllerRef.current.abort();
  const abortController = new AbortController();
  bridge.abortControllerRef.current = abortController;
  const signal = abortController.signal;

  bridge.updateQueueConcurrency(1); // Organizational is sequential
  bridge.setInitialExperts([]);
  bridge.setFinalOutput('');
  bridge.setTaskSpec(null);
  bridge.setExecutionPlan(null);
  bridge.setDeliveryPhase('');
  bridge.setProcessStartTime(Date.now());
  bridge.setProcessEndTime(null);

  try {
    const ai = getAI(resolveModelApiConfig(model, config));
    const planningBudget = getThinkingBudget(config.planningLevel, model);
    const expertBudget = getThinkingBudget(config.expertLevel, model);
    const synthesisBudget = getThinkingBudget(config.synthesisLevel, model);
    const currentAttachments = getCurrentAttachments(history);
    const recentHistory = getRecentHistory(history);

    // 1. Demands Analysis
    console.log('[DeepThink Debug] runOrganizationalDeepThinkOrchestration: Step 1 Demands Analysis');
    bridge.setAppState('analyzing');
    if (signal.aborted) return;
    const taskSpec = await executeDemandsAnalysis(
      ai,
      model,
      query,
      recentHistory,
      currentAttachments,
      planningBudget,
      config.planningLevel
    );
    console.log('[DeepThink Debug] runOrganizationalDeepThinkOrchestration: Demands Analysis Result', taskSpec);
    bridge.setTaskSpec(taskSpec);

    // 2. Strategic Planning
    bridge.setAppState('planning');
    if (signal.aborted) return;
    const rawPlan = await executeStrategicPlanning(
      ai,
      model,
      taskSpec,
      planningBudget,
      config.planningLevel
    );

    // Normalize Plan
    const executionPlan: ExecutionPlan = {
      thought_process: rawPlan.thought_process,
      steps: (rawPlan.steps || []).map((step, index) => ({
        ...step,
        id: `step-${index}`,
        step_number: step.step_number || index + 1,
        input_dependencies: step.input_dependencies || [],
      })),
    };
    bridge.setExecutionPlan(executionPlan);

    // 3. Generate initial experts
    const initialExperts: ExpertResult[] = executionPlan.steps.map((step) => ({
      id: step.id,
      role: step.assigned_role,
      description: step.role_description,
      temperature: step.temperature || 1.0,
      prompt: step.description,
      status: 'pending',
      round: 1,
    }));
    bridge.setInitialExperts(initialExperts);

    // 4. Execute sequence
    for (let i = 0; i < executionPlan.steps.length; i++) {
      if (signal.aborted) return;
      const step = executionPlan.steps[i];
      let expert = bridge.expertsDataRef.current[i];
      
      // Build context from dependencies
      let stepContext = '';
      if (step.input_dependencies && step.input_dependencies.length > 0) {
        stepContext = 'Input from previous steps:\n';
        for (const depId of step.input_dependencies) {
          const depExpert = bridge.expertsDataRef.current.find((e) => e.id === depId);
          if (depExpert && depExpert.content) {
            stepContext += `[${depExpert.role} Output]:\n${depExpert.content}\n\n`;
          }
        }
      } else if (i > 0) {
        const prevExpert = bridge.expertsDataRef.current[i - 1];
        if (prevExpert && prevExpert.content) {
          stepContext = `Input from previous step [${prevExpert.role}]:\n${prevExpert.content}\n\n`;
        }
      }

      bridge.setAppState('executing');
      bridge.updateExpertAt(i, { status: 'thinking', startTime: Date.now() });

      let retryCount = 0;
      const maxRetries = config.maxRetryAttempts ?? 2;
      let stepSuccess = false;
      let fullContent = '';
      let fullThoughts = '';

      while (retryCount <= maxRetries && !stepSuccess) {
        if (signal.aborted) return;
        fullContent = '';
        fullThoughts = '';
        
        try {
          await streamExpertResponse(
            ai,
            model,
            expert,
            taskSpec,
            stepContext,
            currentAttachments,
            expertBudget,
            config.expertLevel,
            signal,
            (textChunk, thoughtChunk) => {
              fullContent += textChunk;
              fullThoughts += thoughtChunk;
              bridge.updateExpertAt(i, { thoughts: fullThoughts, content: fullContent });
            }
          );
        } catch (error: any) {
          console.error(`Expert ${expert.role} error:`, error);
          if (signal.aborted) return;
          bridge.updateExpertAt(i, { status: 'error', content: error.message, endTime: Date.now() });
          break; // Stop retry on stream exception
        }

        if (signal.aborted) return;
        
        // Quality Control
        bridge.setAppState('quality_control');
        bridge.updateExpertAt(i, { status: 'reviewing' });

        try {
          const qaReport = await executeQualityAssurance(
            ai,
            model,
            taskSpec,
            step,
            fullContent,
            expertBudget,
            config.expertLevel
          );
          
          if (signal.aborted) return;
          bridge.updateExpertAt(i, { qa_report: qaReport });

          if (qaReport.status === 'pass') {
            stepSuccess = true;
            bridge.updateExpertAt(i, { status: 'completed', endTime: Date.now() });
          } else {
            retryCount++;
            if (retryCount <= maxRetries) {
              bridge.updateExpertAt(i, { retry_count: retryCount, status: 'pending' });
              // Append QA feedback to context for retry
              stepContext += `\n\n--- PREVIOUS ATTEMPT FAILED QA ---\nCritique: ${qaReport.critique}\nSuggestions: ${qaReport.suggestions}\nImprove your output based on this feedback.`;
              expert = bridge.expertsDataRef.current[i];
            } else {
              bridge.updateExpertAt(i, { status: 'completed', endTime: Date.now() }); // Move on
            }
          }
        } catch (qaError) {
          console.error("QA error", qaError);
          stepSuccess = true;
          bridge.updateExpertAt(i, { status: 'completed', endTime: Date.now() });
        }
      }
    }

    if (signal.aborted) return;

    // 5. Delivery Synthesis
    bridge.setAppState('delivering');
    let fullFinalText = '';
    
    try {
      if (mode === 'rr') {
        await streamRRDeliveryManager(
          ai,
          model,
          taskSpec,
          bridge.expertsDataRef.current,
          currentAttachments,
          synthesisBudget,
          config.synthesisLevel,
          signal,
          (textChunk, thoughtChunk, phase) => {
            fullFinalText += textChunk;
            bridge.setFinalOutput(fullFinalText);
            if (phase) bridge.setDeliveryPhase(phase);
          }
        );
      } else {
        await streamSGDeliveryManager(
          ai,
          model,
          taskSpec,
          bridge.expertsDataRef.current,
          currentAttachments,
          synthesisBudget,
          config.synthesisLevel,
          signal,
          (textChunk, thoughtChunk, phase) => {
            fullFinalText += textChunk;
            bridge.setFinalOutput(fullFinalText);
            if (phase) bridge.setDeliveryPhase(phase);
          }
        );
      }
    } catch (synthesisError: unknown) {
      console.error('Synthesis error:', synthesisError);
      if (!fullFinalText) {
        bridge.setFinalOutput(formatSynthesisErrorMessage(synthesisError, String(query)));
      }
    }

    if (!signal.aborted) {
      bridge.setAppState('completed');
      bridge.setProcessEndTime(Date.now());
      console.log('[DeepThink Debug] runOrganizationalDeepThinkOrchestration: COMPLETED normally');
    }

  } catch (error: unknown) {
    if (!signal.aborted) {
      console.error('[DeepThink Debug] Organizational DeepThink Error:', error);
      bridge.setAppState('idle');
      bridge.setProcessEndTime(Date.now());
    }
  } finally {
    if (bridge.abortControllerRef.current === abortController) {
      bridge.abortControllerRef.current = null;
    }
  }
};
