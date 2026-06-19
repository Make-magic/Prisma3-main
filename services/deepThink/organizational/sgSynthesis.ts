import type { ModelOption, ExpertResult, TaskSpec, MessageAttachment, ThinkingLevel, AIClient } from '@/types';
import { getOutlinePrompt, getSectionWriterPrompt } from './prompts';
import { withRetry } from '@/services/utils/retry';
import { generateContent as generateOpenAIContent, generateContentStream as generateOpenAIStream } from '@/services/deepThink/openaiClient';
import { cleanJsonString } from '@/utils';
import { isGoogleProvider } from '@/api';

export const streamDeliveryManager = async (
  ai: AIClient,
  model: ModelOption,
  taskSpec: TaskSpec,
  expertResults: ExpertResult[],
  attachments: MessageAttachment[],
  budget: number,
  thinkingLevel: ThinkingLevel,
  signal: AbortSignal,
  onChunk: (text: string, thought: string, currentSection?: string) => void
): Promise<void> => {
  const isGoogle = isGoogleProvider(ai);

  // --- Step 1: Generate Outline ---
  const outlinePrompt = getOutlinePrompt(taskSpec, expertResults);
  onChunk('', 'Planning document structure...', 'Planning Structure...');

  let sections: string[] = [];
  try {
    if (isGoogle) {
      const outlineResp = await withRetry(() => ai.models.generateContent({
        model: model,
        contents: outlinePrompt,
        config: {
          responseMimeType: "application/json",
          thinkingConfig: { thinkingBudget: budget, includeThoughts: true }
        }
      }));
      const outlineData = JSON.parse(cleanJsonString(outlineResp.text || "{}"));
      sections = outlineData.sections || ["Executive Summary", "Details", "Conclusion"];
    } else {
      const jsonInstruction = `\n\nReturn a strictly valid JSON object.`;
      const outlineResp = await generateOpenAIContent(ai, {
        model,
        content: outlinePrompt + jsonInstruction,
        responseFormat: 'json_object',
        thinkingConfig: { includeThoughts: true, thinkingBudget: budget, thinkingLevel }
      });
      const outlineData = JSON.parse(cleanJsonString(outlineResp.text));
      sections = outlineData.sections || ["Executive Summary", "Details", "Conclusion"];
    }
  } catch (e) {
    console.warn("Failed to generate custom outline, using default.", e);
    sections = ["Introduction", "Analysis", "Technical Implementation", "Final Conclusion"];
  }

  if (signal.aborted) return;

  // --- Step 2: Sequential Section Drafting ---
  let fullDocument = "";
  let contextForNextSection = "";

  for (let i = 0; i < sections.length; i++) {
    const sectionTitle = sections[i];
    if (signal.aborted) break;

    onChunk('', `Drafting section ${i+1}/${sections.length}: ${sectionTitle}`, sectionTitle);
    
    const sectionPrompt = getSectionWriterPrompt(
      taskSpec, 
      expertResults, 
      sectionTitle, 
      contextForNextSection
    );

    let currentSectionContent = "";

    if (isGoogle) {
      const stream = await withRetry(() => ai.models.generateContentStream({
        model: model,
        contents: sectionPrompt,
        config: {
          thinkingConfig: { thinkingBudget: budget, includeThoughts: true }
        }
      }));

      for await (const chunk of stream) {
        if (signal.aborted) break;
        if (chunk.candidates?.[0]?.content?.parts) {
          for (const part of chunk.candidates[0].content.parts) {
            if (!part.thought && part.text) {
              currentSectionContent += part.text;
              onChunk(part.text, '', sectionTitle);
            } else if (part.thought) {
              onChunk('', part.text || '', sectionTitle);
            }
          }
        }
      }
    } else {
      const stream = generateOpenAIStream(ai, {
        model,
        content: sectionPrompt,
        thinkingConfig: { includeThoughts: true, thinkingBudget: budget, thinkingLevel }
      });

      for await (const chunk of stream) {
        if (signal.aborted) break;
        if (chunk.text) {
          currentSectionContent += chunk.text;
        }
        onChunk(chunk.text, chunk.thought || '', sectionTitle);
      }
    }

    fullDocument += `\n\n## ${sectionTitle}\n\n${currentSectionContent}`;
    
    // Update context for continuity (last part of previous content or simple summary)
    contextForNextSection = `Just finished section: "${sectionTitle}". Summary of content so far: ${fullDocument.slice(-1000)}`;
    
    // Add spacer in UI
    onChunk('\n\n', '', sectionTitle);
  }
};
