import type OpenAI from 'openai';

export type AIClient = GoogleGenAIClient | OpenAIClient;

export interface GoogleGenAIClient {
  provider: 'google';
  models: {
    generateContent(params: Record<string, unknown>): Promise<GoogleGenAIResponse>;
    generateContentStream(
      params: Record<string, unknown>,
    ): Promise<AsyncIterable<GoogleGenAIStreamChunk>>;
  };
}

export interface GoogleGenAIResponse {
  text: string;
  candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
}

export interface GoogleGenAIStreamChunk {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
}

export type OpenAIClient = Pick<OpenAI, 'chat'>;

export type OpenAIChatCompletion = OpenAI.Chat.ChatCompletion;

export type ModelOption = string;
export type ThinkingMode = 'dynamic' | 'rr' | 'sg';
export type ThinkingLevel = 'minimal' | 'low' | 'medium' | 'high';
export type ApiProvider = 'google' | 'openai';

export type ModelCatalogItem = {
  value: ModelOption;
  label: string;
  desc: string;
  provider: ApiProvider;
};

export type ModelPreferences = {
  thinkingMode?: ThinkingMode;
  planningLevel?: ThinkingLevel;
  expertLevel?: ThinkingLevel;
  synthesisLevel?: ThinkingLevel;
  expertConcurrency?: number;
  enableRecursiveLoop?: boolean;
  maxRetryAttempts?: number;
};

export type CustomModel = {
  id: string;
  name: string; // The Actual Model ID (e.g., 'gpt-4o')
  displayName?: string; // Friendly name for UI (e.g., 'My GPT-4')
  provider: ApiProvider;
  apiKey?: string;
  baseUrl?: string;
};

export type TaskSpec = {
  original_query: string;
  core_intent: string;
  key_constraints: string[];
  forbidden_actions: string[];
  output_format_requirements: string;
  complexity_score: number; // 1-10
};

export type PlanStep = {
  id: string;
  step_number: number;
  description: string;
  assigned_role: string;
  role_description: string;
  input_dependencies: string[]; // output from which previous steps?
  temperature: number;
};

export type ExecutionPlan = {
  thought_process: string;
  steps: PlanStep[];
};

export type QAReport = {
  step_id: string;
  status: 'pass' | 'fail';
  score: number; // 0-100
  critique: string;
  suggestions?: string;
};

export type ExpertConfig = {
  id: string;
  role: string;
  description: string;
  temperature: number;
  prompt: string;
};

export type ExpertResult = ExpertConfig & {
  status: 'pending' | 'thinking' | 'completed' | 'error' | 'reviewing';
  content?: string;
  thoughts?: string;
  thoughtProcess?: string;
  startTime?: number;
  endTime?: number;
  round?: number; // Track which iteration this expert belongs to
  qa_report?: QAReport | null;
  retry_count?: number;
};

export type AnalysisResult = {
  thought_process: string;
  experts: Omit<ExpertConfig, 'id'>[];
};

export type ReviewResult = {
  satisfied: boolean;
  critique: string;
  next_round_strategy?: string;
  refined_experts?: Omit<ExpertConfig, 'id'>[];
};

export type AppState =
  | 'idle'
  | 'analyzing'
  | 'planning'
  | 'experts_working'
  | 'executing'
  | 'quality_control'
  | 'reviewing'
  | 'synthesizing'
  | 'delivering'
  | 'completed';

export type AppConfig = {
  thinkingMode?: ThinkingMode;
  planningLevel: ThinkingLevel;
  expertLevel: ThinkingLevel;
  synthesisLevel: ThinkingLevel;
  enableRecursiveLoop?: boolean;
  customModels?: CustomModel[];
  expertConcurrency?: number;
  maxRetryAttempts?: number;
  /** Per-model preference overrides. Key = model name (e.g. 'glm-5-turbo'). */
  modelPreferences?: Record<string, ModelPreferences>;
};

export type MessageAttachment = {
  id: string;
  type: 'image' | 'pdf' | 'video' | 'audio' | 'document';
  name?: string;
  mimeType: string;
  data: string; // Base64 string
  url?: string; // For display
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'model';
  content: string;
  attachments?: MessageAttachment[];
  thinkingMode?: ThinkingMode;
  taskSpec?: TaskSpec | null;
  executionPlan?: ExecutionPlan | null;
  deliveryPhase?: string;
  // DeepThink Artifacts (only for model messages)
  analysis?: AnalysisResult | null;
  experts?: ExpertResult[];
  synthesisThoughts?: string;
  isThinking?: boolean;
  totalDuration?: number; // Total time in ms
};

export type ChatGroup = {
  id: string;
  title: string;
  createdAt: number;
  isExpanded?: boolean;
};

export type ChatSession = {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  model: ModelOption;
  groupId?: string | null;
  isPinned?: boolean;
};
