import { useCallback, useRef } from 'react';
import {
  DeepThinkRuntimeBridge,
  runDeepThinkOrchestration,
} from '@/services/deepThink/orchestrator';
import { RequestQueue } from '@/services/utils/retry';
import type { AppConfig, ChatMessage, ModelOption } from '@/types';
import { useDeepThinkState } from '@/hooks/useDeepThinkState';

function useExpertQueue() {
  const queueRef = useRef(new RequestQueue(3));
  const concurrencyRef = useRef(3);

  const updateConcurrency = useCallback((concurrency: number) => {
    concurrencyRef.current = concurrency;
    queueRef.current = new RequestQueue(concurrency);
  }, []);

  return { queueRef, updateConcurrency };
}

export const useDeepThink = () => {
  const { queueRef, updateConcurrency: updateQueueConcurrency } = useExpertQueue();
  const {
    appState,
    setAppState,
    managerAnalysis,
    setManagerAnalysis,
    taskSpec,
    setTaskSpec,
    executionPlan,
    setExecutionPlan,
    deliveryPhase,
    setDeliveryPhase,
    experts,
    expertsDataRef,
    finalOutput,
    setFinalOutput,
    synthesisThoughts,
    setSynthesisThoughts,
    processStartTime,
    setProcessStartTime,
    processEndTime,
    setProcessEndTime,
    abortControllerRef,
    resetDeepThink,
    stopDeepThink,
    updateExpertAt,
    setInitialExperts,
    appendExperts,
  } = useDeepThinkState();

  const runDeepThink = useCallback(
    async (query: string, history: ChatMessage[], model: ModelOption, config: AppConfig) => {
      const bridge: DeepThinkRuntimeBridge = {
        queueRef,
        abortControllerRef,
        expertsDataRef,
        updateQueueConcurrency,
        setAppState,
        setManagerAnalysis,
        setInitialExperts,
        appendExperts,
        updateExpertAt,
        setFinalOutput,
        setSynthesisThoughts,
        setProcessStartTime,
        setProcessEndTime,
        setTaskSpec,
        setExecutionPlan,
        setDeliveryPhase,
      };

      console.log('[DeepThink Debug] runDeepThink hook: Calling runDeepThinkOrchestration');
      try {
        await runDeepThinkOrchestration(query, history, model, config, bridge);
        console.log('[DeepThink Debug] runDeepThink hook: runDeepThinkOrchestration resolved');
      } catch (err) {
        console.error('[DeepThink Debug] runDeepThink hook: runDeepThinkOrchestration threw:', err);
        throw err;
      }
    },
    [
      appendExperts,
      abortControllerRef,
      expertsDataRef,
      queueRef,
      setAppState,
      setFinalOutput,
      setInitialExperts,
      setManagerAnalysis,
      setProcessEndTime,
      setProcessStartTime,
      setSynthesisThoughts,
      updateExpertAt,
      updateQueueConcurrency,
      setTaskSpec,
      setExecutionPlan,
      setDeliveryPhase,
    ],
  );

  return {
    appState,
    managerAnalysis,
    taskSpec,
    executionPlan,
    deliveryPhase,
    experts,
    finalOutput,
    synthesisThoughts,
    runDeepThink,
    stopDeepThink,
    resetDeepThink,
    processStartTime,
    processEndTime,
  };
};
