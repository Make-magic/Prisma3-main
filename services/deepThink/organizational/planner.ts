import { Type } from '@google/genai';
import type { AIClient, ModelOption, TaskSpec, ExecutionPlan, ThinkingLevel } from '@/types';
import { cleanJsonString } from '@/utils';
import { PLANNER_SYSTEM_PROMPT } from './prompts';
import { withRetry } from '@/services/utils/retry';
import { generateContent as generateOpenAIContent } from '@/services/deepThink/openaiClient';
import { isGoogleProvider } from '@/api';

export const executeStrategicPlanning = async (
  ai: AIClient,
  model: ModelOption,
  taskSpec: TaskSpec,
  budget: number,
  thinkingLevel: ThinkingLevel,
): Promise<ExecutionPlan> => {
  const isGoogle = isGoogleProvider(ai);
  const prompt = `Task Specification:\n${JSON.stringify(taskSpec, null, 2)}`;

  if (isGoogle) {
    const schema = {
      type: Type.OBJECT,
      properties: {
        thought_process: { type: Type.STRING },
        steps: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              step_number: { type: Type.INTEGER },
              description: { type: Type.STRING },
              assigned_role: { type: Type.STRING },
              role_description: { type: Type.STRING },
              input_dependencies: { type: Type.ARRAY, items: { type: Type.STRING } },
              temperature: { type: Type.NUMBER },
            },
            required: ['step_number', 'description', 'assigned_role', 'temperature'],
          },
        },
      },
      required: ['thought_process', 'steps'],
    };

    try {
      const resp = await withRetry(() =>
        ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            systemInstruction: PLANNER_SYSTEM_PROMPT,
            responseMimeType: 'application/json',
            responseSchema: schema,
            thinkingConfig: { includeThoughts: true, thinkingBudget: budget },
          },
        }),
      );

      const text = resp.text || '{}';
      return JSON.parse(cleanJsonString(text)) as ExecutionPlan;
    } catch (e) {
      console.error('Planner Error:', e);
      return {
        thought_process: 'Fallback to direct execution.',
        steps: [
          {
            id: 'fallback-1',
            step_number: 1,
            description: 'Directly answer the user query.',
            assigned_role: 'General Assistant',
            role_description: 'Helpful assistant',
            input_dependencies: [],
            temperature: 0.7,
          },
        ],
      } as ExecutionPlan;
    }
  } else {
    try {
      const jsonInstruction = `\n\nReturn a strictly valid JSON object.`;
      const response = await generateOpenAIContent(ai, {
        model,
        systemInstruction: PLANNER_SYSTEM_PROMPT,
        content: prompt + jsonInstruction,
        temperature: 0.7,
        responseFormat: 'json_object',
        thinkingConfig: { includeThoughts: true, thinkingBudget: budget, thinkingLevel },
      });
      return JSON.parse(cleanJsonString(response.text)) as ExecutionPlan;
    } catch (e) {
      console.error('Planner OpenAI Error:', e);
      return {
        thought_process: 'Fallback to direct execution.',
        steps: [
          {
            id: 'fallback-1',
            step_number: 1,
            description: 'Directly answer the user query.',
            assigned_role: 'General Assistant',
            role_description: 'Helpful assistant',
            input_dependencies: [],
            temperature: 0.7,
          },
        ],
      } as ExecutionPlan;
    }
  }
};
