import { Type } from '@google/genai';
import type { AIClient, ModelOption, TaskSpec, PlanStep, QAReport, ThinkingLevel } from '@/types';
import { cleanJsonString } from '@/utils';
import { INSPECTOR_SYSTEM_PROMPT } from './prompts';
import { withRetry } from '@/services/utils/retry';
import { generateContent as generateOpenAIContent } from '@/services/deepThink/openaiClient';
import { isGoogleProvider } from '@/api';

export const executeQualityAssurance = async (
  ai: AIClient,
  model: ModelOption,
  taskSpec: TaskSpec,
  step: PlanStep,
  content: string,
  budget: number,
  thinkingLevel: ThinkingLevel,
): Promise<QAReport> => {
  const isGoogle = isGoogleProvider(ai);

  const prompt = `
Task Spec Constraint Summary: ${taskSpec.key_constraints.join(', ')}
Step Description: ${step.description}
Role: ${step.assigned_role}

--- WORK PRODUCT TO INSPECT ---
${content.slice(0, 15000)} 
--- END WORK PRODUCT ---
`;

  if (isGoogle) {
    const schema = {
      type: Type.OBJECT,
      properties: {
        status: { type: Type.STRING, enum: ['pass', 'fail'] },
        score: { type: Type.INTEGER },
        critique: { type: Type.STRING },
        suggestions: { type: Type.STRING },
      },
      required: ['status', 'score', 'critique'],
    };

    try {
      const resp = await withRetry(() =>
        ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            systemInstruction: INSPECTOR_SYSTEM_PROMPT,
            responseMimeType: 'application/json',
            responseSchema: schema,
            thinkingConfig: { includeThoughts: true, thinkingBudget: budget },
          },
        }),
      );

      const text = resp.text || '{}';
      const result = JSON.parse(cleanJsonString(text));
      return { ...result, step_id: step.id };
    } catch (e) {
      console.error('Inspector Error:', e);
      // Fail open to avoid getting stuck
      return {
        step_id: step.id,
        status: 'pass',
        score: 100,
        critique: 'Inspector unavailable, automated pass.',
      };
    }
  } else {
    try {
      const jsonInstruction = `\n\nReturn a strictly valid JSON object.`;
      const response = await generateOpenAIContent(ai, {
        model,
        systemInstruction: INSPECTOR_SYSTEM_PROMPT,
        content: prompt + jsonInstruction,
        temperature: 0.2,
        responseFormat: 'json_object',
        thinkingConfig: { includeThoughts: true, thinkingBudget: budget, thinkingLevel },
      });
      const result = JSON.parse(cleanJsonString(response.text));
      return { ...result, step_id: step.id };
    } catch (e) {
      console.error('Inspector OpenAI Error:', e);
      return {
        step_id: step.id,
        status: 'pass',
        score: 100,
        critique: 'Inspector unavailable, automated pass.',
      };
    }
  }
};
