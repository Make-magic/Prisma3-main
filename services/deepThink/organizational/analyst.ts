import { Type } from '@google/genai';
import type { AIClient, ModelOption, TaskSpec, MessageAttachment, ThinkingLevel } from '@/types';
import { cleanJsonString } from '@/utils';
import { ANALYST_SYSTEM_PROMPT } from './prompts';
import { withRetry } from '@/services/utils/retry';
import { generateContent as generateOpenAIContent } from '@/services/deepThink/openaiClient';
import { buildGoogleContents, buildOpenAIContent } from '@/services/deepThink/contentBuilder';
import { isGoogleProvider } from '@/api';

export const executeDemandsAnalysis = async (
  ai: AIClient,
  model: ModelOption,
  query: string,
  historyContext: string,
  attachments: MessageAttachment[],
  budget: number,
  thinkingLevel: ThinkingLevel,
): Promise<TaskSpec> => {
  const isGoogle = isGoogleProvider(ai);
  const prompt = `Context:\n${historyContext}\n\nCurrent User Query: "${query}"`;

  if (isGoogle) {
    const schema = {
      type: Type.OBJECT,
      properties: {
        original_query: { type: Type.STRING },
        core_intent: { type: Type.STRING },
        key_constraints: { type: Type.ARRAY, items: { type: Type.STRING } },
        forbidden_actions: { type: Type.ARRAY, items: { type: Type.STRING } },
        output_format_requirements: { type: Type.STRING },
        complexity_score: { type: Type.INTEGER },
      },
      required: ['core_intent', 'key_constraints', 'output_format_requirements'],
    };

    const contents = buildGoogleContents(prompt, attachments);

    try {
      const resp = await withRetry(() =>
        ai.models.generateContent({
          model,
          contents,
          config: {
            systemInstruction: ANALYST_SYSTEM_PROMPT,
            responseMimeType: 'application/json',
            responseSchema: schema,
            thinkingConfig: { includeThoughts: true, thinkingBudget: budget },
          },
        }),
      );

      const text = resp.text || '{}';
      return JSON.parse(cleanJsonString(text)) as TaskSpec;
    } catch (e) {
      console.error('Analyst Error:', e);
      // Fallback spec
      return {
        original_query: query,
        core_intent: query,
        key_constraints: [],
        forbidden_actions: [],
        output_format_requirements: 'Markdown',
        complexity_score: 5,
      };
    }
  } else {
    try {
      const { content } = buildOpenAIContent(prompt, attachments);
      let contentPayload = content as string | import('openai').OpenAI.Chat.ChatCompletionContentPart[];

      const jsonInstruction = `\n\nReturn a strictly valid JSON object.`;

      if (Array.isArray(contentPayload)) {
        const firstPart = contentPayload[0];
        if ('text' in firstPart) {
          firstPart.text += jsonInstruction;
        }
      } else {
        contentPayload += jsonInstruction;
      }

      const response = await generateOpenAIContent(ai, {
        model,
        systemInstruction: ANALYST_SYSTEM_PROMPT,
        content: contentPayload,
        temperature: 0.7, // aligned with manager.ts
        responseFormat: 'json_object',
        thinkingConfig: { includeThoughts: true, thinkingBudget: budget, thinkingLevel },
      });

      return JSON.parse(cleanJsonString(response.text)) as TaskSpec;
    } catch (e) {
      console.error('Analyst OpenAI Error:', e);
      return {
        original_query: query,
        core_intent: query,
        key_constraints: [],
        forbidden_actions: [],
        output_format_requirements: 'Markdown',
        complexity_score: 5,
      };
    }
  }
};
