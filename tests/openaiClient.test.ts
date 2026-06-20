import { describe, expect, it, vi } from 'vitest';

import { generateContentStream } from '@/services/deepThink/openaiClient';
import type { OpenAIClient } from '@/types';

type DeltaChunk = {
  content?: string;
  reasoning_content?: string;
};

async function* streamChunks(chunks: DeltaChunk[]) {
  for (const delta of chunks) {
    yield { choices: [{ delta }] };
  }
}

const makeClient = (chunks: DeltaChunk[]) =>
  ({
    chat: {
      completions: {
        create: vi.fn(async () => streamChunks(chunks)),
      },
    },
  }) as unknown as OpenAIClient;

const collectStream = async (chunks: DeltaChunk[]) => {
  const client = makeClient(chunks);
  const collected: Array<{ text: string; thought?: string }> = [];

  for await (const chunk of generateContentStream(client, {
    model: 'glm-5-turbo',
    content: 'prompt',
    thinkingConfig: {
      includeThoughts: true,
      thinkingBudget: 100,
      thinkingLevel: 'medium',
    },
  })) {
    collected.push(chunk);
  }

  return collected;
};

describe('generateContentStream', () => {
  it('preserves visible text when thinking tags share a stream chunk with the answer', async () => {
    const chunks = await collectStream([
      { content: 'Intro <thinking>hidden plan</thinking>final answer' },
    ]);

    expect(chunks.map((chunk) => chunk.text).join('')).toBe('Intro final answer');
    expect(chunks.map((chunk) => chunk.thought || '').join('')).toBe('hidden plan');
  });

  it('handles thinking tags split across multiple stream chunks', async () => {
    const chunks = await collectStream([
      { content: 'Intro <thin' },
      { content: 'king>hidden ' },
      { content: 'plan</think' },
      { content: 'ing>final answer' },
    ]);

    expect(chunks.map((chunk) => chunk.text).join('')).toBe('Intro final answer');
    expect(chunks.map((chunk) => chunk.thought || '').join('')).toBe('hidden plan');
  });

  it('passes reasoning_content deltas through as thought text', async () => {
    const chunks = await collectStream([
      { reasoning_content: 'reasoning ', content: 'answer' },
      { reasoning_content: 'trace' },
    ]);

    expect(chunks.map((chunk) => chunk.text).join('')).toBe('answer');
    expect(chunks.map((chunk) => chunk.thought || '').join('')).toBe('reasoning trace');
  });
});

import { generateContent } from '@/services/deepThink/openaiClient';

describe('openai-responses provider', () => {
  it('generateContent parses non-streaming responses correctly', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      output_text: 'Hello from Responses API',
      output: [
        {
          type: 'message',
          content: [{ type: 'output_text', text: 'Hello from Responses API' }],
        },
        {
          type: 'reasoning',
          reasoning: { text: 'Reasoning process explanation' },
        },
      ],
    });

    const client = {
      provider: 'openai-responses',
      responses: {
        create: mockCreate,
      },
    } as unknown as OpenAIClient;

    const result = await generateContent(client, {
      model: 'o1-preview',
      content: 'hello',
      thinkingConfig: {
        includeThoughts: true,
        thinkingBudget: 100,
        thinkingLevel: 'medium',
      },
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'o1-preview',
        input: 'hello',
        reasoning: {
          effort: 'medium',
        },
      }),
    );
    expect(result.text).toBe('Hello from Responses API');
    expect(result.thought).toBe('Reasoning process explanation');
  });

  it('generateContentStream streams output_text and reasoning_text deltas correctly', async () => {
    async function* mockEventStream() {
      yield { type: 'response.reasoning_text.delta', delta: 'Think' };
      yield { type: 'response.reasoning_text.delta', delta: 'ing' };
      yield { type: 'response.output_text.delta', delta: 'Hello' };
      yield { type: 'response.output_text.delta', delta: ' world' };
    }

    const mockCreate = vi.fn().mockResolvedValue(mockEventStream());

    const client = {
      provider: 'openai-responses',
      responses: {
        create: mockCreate,
      },
    } as unknown as OpenAIClient;

    const collected: Array<{ text: string; thought?: string }> = [];
    for await (const chunk of generateContentStream(client, {
      model: 'o3-mini',
      content: [
        { type: 'text', text: 'Prompt text' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } },
      ],
      thinkingConfig: {
        includeThoughts: true,
        thinkingBudget: 100,
      },
    })) {
      collected.push(chunk);
    }

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'o3-mini',
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_text', text: 'Prompt text' },
              { type: 'input_image', image_url: 'data:image/png;base64,abc' },
            ],
          },
        ],
        stream: true,
      }),
    );

    const fullText = collected.map((c) => c.text).join('');
    const fullThought = collected.map((c) => c.thought || '').join('');

    expect(fullText).toBe('Hello world');
    expect(fullThought).toBe('Thinking');
  });
});
