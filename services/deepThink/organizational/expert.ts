import type OpenAI from 'openai';
import type {
  AIClient,
  ModelOption,
  ExpertResult,
  MessageAttachment,
  ThinkingLevel,
  TaskSpec,
} from '@/types';
import { getExpertSystemInstruction } from './prompts';
import { generateContentStream as generateOpenAIStream } from '@/services/deepThink/openaiClient';
import { buildGoogleContents, buildOpenAIContent } from '@/services/deepThink/contentBuilder';
import { isGoogleProvider } from '@/api';

export const streamExpertResponse = async (
  ai: AIClient,
  model: ModelOption,
  expert: ExpertResult,
  taskSpec: TaskSpec,
  context: string,
  attachments: MessageAttachment[],
  budget: number,
  thinkingLevel: ThinkingLevel,
  signal: AbortSignal,
  onChunk: (text: string, thought: string) => void,
): Promise<void> => {
  const isGoogle = isGoogleProvider(ai);
  
  // The user prompt includes context, previous steps' outputs, and the expert's specific task.
  const userPrompt = context ? `Context / Inputs:\n${context}\n\nTask:\n${expert.prompt}` : `Task:\n${expert.prompt}`;

  if (isGoogle) {
    const contents = buildGoogleContents(userPrompt, attachments);

    const streamResult = await ai.models.generateContentStream({
      model: model,
      contents: contents,
      config: {
        systemInstruction: getExpertSystemInstruction(expert.role, expert.description, taskSpec),
        temperature: expert.temperature,
        thinkingConfig: {
          thinkingBudget: budget,
          includeThoughts: true,
        },
      },
    });

    try {
      for await (const chunk of streamResult) {
        if (signal.aborted) break;

        let chunkText = '';
        let chunkThought = '';

        if (chunk.candidates?.[0]?.content?.parts) {
          for (const part of chunk.candidates[0].content.parts) {
            if (part.thought) {
              chunkThought += part.text || '';
            } else if (part.text) {
              chunkText += part.text;
            }
          }
          onChunk(chunkText, chunkThought);
        }
      }
    } catch (streamError) {
      console.error(`Stream interrupted for expert ${expert.role}:`, streamError);
      throw streamError;
    }
  } else {
    const { content } = buildOpenAIContent(userPrompt, attachments);
    const contentPayload = content as string | OpenAI.Chat.ChatCompletionContentPart[];

    const stream = generateOpenAIStream(ai, {
      model,
      systemInstruction: getExpertSystemInstruction(expert.role, expert.description, taskSpec),
      content: contentPayload,
      temperature: expert.temperature,
      thinkingConfig: {
        thinkingBudget: budget,
        thinkingLevel,
        includeThoughts: true,
      },
    });

    try {
      for await (const chunk of stream) {
        if (signal.aborted) break;
        onChunk(chunk.text, chunk.thought || '');
      }
    } catch (streamError) {
      console.error(`Stream interrupted for expert ${expert.role}:`, streamError);
      throw streamError;
    }
  }
};
