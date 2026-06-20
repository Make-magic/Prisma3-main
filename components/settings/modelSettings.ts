import type { ApiProvider } from '@/types';

export const PROVIDER_OPTIONS: { value: ApiProvider; label: string; shortLabel: string }[] = [
  { value: 'google', label: 'Gemini（v1beta）', shortLabel: 'Gemini' },
  { value: 'openai', label: 'OpenAI compatible（v1）', shortLabel: 'OpenAI compatible' },
  { value: 'openai-responses', label: 'OpenAI Responses（v1）', shortLabel: 'OpenAI Responses' },
];
