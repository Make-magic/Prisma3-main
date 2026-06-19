import type { ModelOption, ExpertResult, TaskSpec, MessageAttachment, ThinkingLevel, AIClient } from '@/types';
import { getDraftingPrompt, getCritiquePrompt, getFinalPolisherPrompt } from './prompts';
import { withRetry } from '@/services/utils/retry';
import { generateContent as generateOpenAIContent, generateContentStream as generateOpenAIStream } from '@/services/deepThink/openaiClient';
import { isGoogleProvider } from '@/api';

export const streamDeliveryManager = async (
  ai: AIClient,
  model: ModelOption,
  taskSpec: TaskSpec,
  expertResults: ExpertResult[],
  attachments: MessageAttachment[], // Using attachments if needed, but usually synthesis doesn't use it.
  budget: number,
  thinkingLevel: ThinkingLevel,
  signal: AbortSignal,
  onChunk: (text: string, thought: string, currentSection?: string) => void
): Promise<void> => {
  const isGoogle = isGoogleProvider(ai);

  // --- Phase 1: Drafting ---
  const draftingPrompt = getDraftingPrompt(taskSpec, expertResults);
  onChunk('', '', 'Phase 1: Generative Drafting...');
  
  let firstDraft = "";
  
  if (isGoogle) {
    const stream = await withRetry(() => ai.models.generateContentStream({
      model: model,
      contents: draftingPrompt,
      config: { thinkingConfig: { thinkingBudget: budget, includeThoughts: true } }
    }));
    for await (const chunk of stream) {
      if (signal.aborted) break;
      if (chunk.candidates?.[0]?.content?.parts) {
        for (const part of chunk.candidates[0].content.parts) {
           if (part.text && !part.thought) {
             firstDraft += part.text;
             onChunk(part.text, '', 'Phase 1: Generative Drafting...');
           } else if (part.thought) {
             onChunk('', part.text || '', 'Phase 1: Generative Drafting...');
           }
        }
      }
    }
  } else {
    const stream = generateOpenAIStream(ai, {
      model, content: draftingPrompt, thinkingConfig: { includeThoughts: true, thinkingBudget: budget, thinkingLevel }
    });
    for await (const chunk of stream) {
      if (signal.aborted) break;
      if (chunk.text) {
        firstDraft += chunk.text;
        onChunk(chunk.text, '', 'Phase 1: Generative Drafting...');
      }
      if (chunk.thought) {
        onChunk('', chunk.thought, 'Phase 1: Generative Drafting...');
      }
    }
  }

  if (signal.aborted) return;

  // --- Phase 2: Critique (Refiner) ---
  onChunk('\n\n---\n\n', '', 'Phase 2: Critical Review...');
  
  const critiquePrompt = getCritiquePrompt(taskSpec, expertResults, firstDraft);
  let critique = "";

  try {
    if (isGoogle) {
      const resp = await withRetry(() => ai.models.generateContent({
        model: model,
        contents: critiquePrompt,
        config: { thinkingConfig: { thinkingBudget: 2048, includeThoughts: true } }
      }));
      critique = resp.text || "No critique generated.";
    } else {
      const resp = await generateOpenAIContent(ai, {
        model, content: critiquePrompt, thinkingConfig: { includeThoughts: true, thinkingBudget: 1024, thinkingLevel }
      });
      critique = resp.text || "No critique generated.";
    }
  } catch (e) {
    console.warn("Critique phase failed, proceeding with draft.", e);
    critique = "No issues found.";
  }

  if (signal.aborted) return;

  // --- Phase 3: Final Polish (Patching) ---
  const finalPrompt = getFinalPolisherPrompt(taskSpec, firstDraft, critique);
  onChunk('', '', 'Phase 3: Final Refinement & Patching...');
  
  onChunk(`**Refinement Feedback:**\n> ${critique.replace(/\n/g, '\n> ')}\n\n**Final Polished Report:**\n\n`, '', 'Phase 3: Final Refinement & Patching...');

  if (isGoogle) {
    const stream = await withRetry(() => ai.models.generateContentStream({
      model: model,
      contents: finalPrompt,
      config: { thinkingConfig: { thinkingBudget: budget, includeThoughts: true } }
    }));
    for await (const chunk of stream) {
      if (signal.aborted) break;
      if (chunk.candidates?.[0]?.content?.parts) {
        for (const part of chunk.candidates[0].content.parts) {
           if (part.text && !part.thought) {
             onChunk(part.text, '', 'Phase 3: Final Refinement & Patching...');
           } else if (part.thought) {
             onChunk('', part.text || '', 'Phase 3: Final Refinement & Patching...');
           }
        }
      }
    }
  } else {
    const stream = generateOpenAIStream(ai, {
      model, content: finalPrompt, thinkingConfig: { includeThoughts: true, thinkingBudget: budget, thinkingLevel }
    });
    for await (const chunk of stream) {
      if (signal.aborted) break;
      onChunk(chunk.text, chunk.thought || '', 'Phase 3: Final Refinement & Patching...');
    }
  }
};
