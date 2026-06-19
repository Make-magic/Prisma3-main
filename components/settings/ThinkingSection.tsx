import React from 'react';
import { RefreshCw, BrainCircuit } from 'lucide-react';
import type { AppConfig, ModelOption, ThinkingLevel } from '@/types';
import { getValidThinkingLevels, getAllModels } from '@/config';
import LevelSelect from '@/components/settings/LevelSelect';

interface ThinkingSectionProps {
  config: AppConfig;
  globalConfig: AppConfig;
  model: ModelOption | null;
  onSetThinkingLevel: (
    key: 'planningLevel' | 'expertLevel' | 'synthesisLevel',
    value: ThinkingLevel,
  ) => void;
  onSetRecursiveLoop: (value: boolean) => void;
  onSetThinkingMode: (mode: 'dynamic' | 'rr' | 'sg') => void;
  onSetMaxRetryAttempts: (attempts: number) => void;
}

const ThinkingSection = ({
  config,
  globalConfig,
  model,
  onSetThinkingLevel,
  onSetRecursiveLoop,
  onSetThinkingMode,
  onSetMaxRetryAttempts,
}: ThinkingSectionProps) => {
  // Find display name for the current model
  const allModels = getAllModels(globalConfig);
  const modelInfo = model ? allModels.find((m) => m.value === model) : undefined;
  const modelLabel = modelInfo?.label || model || '未选择模型';
  const validLevels: ThinkingLevel[] = model
    ? getValidThinkingLevels(model)
    : ['minimal', 'low', 'medium', 'high'];

  if (!model) {
    return (
      <div className="space-y-3 rounded-xl border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-secondary)] p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--theme-text-tertiary)]">
            思考过程
          </h3>
          <span className="rounded border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-input)] px-2 py-0.5 text-[10px] font-medium text-[var(--theme-text-secondary)]">
            {modelLabel}
          </span>
        </div>
        <p className="text-sm leading-relaxed text-[var(--theme-text-tertiary)]">
          添加并选择一个模型后，可为它配置推理深度和递归优化。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-secondary)] p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--theme-text-tertiary)]">
          思考过程
        </h3>
        <span className="rounded border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-input)] px-2 py-0.5 text-[10px] font-medium text-[var(--theme-text-secondary)]">
          {modelLabel}
        </span>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 rounded-lg border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-input)] p-3.5">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-secondary)]">
              <BrainCircuit size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--theme-text-primary)]">思考模式</p>
              <p className="mt-1 text-xs leading-relaxed text-[var(--theme-text-tertiary)]">
                选择智能体的思考与组织流程。
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  { value: 'dynamic', label: 'Dynamic (默认)' },
                  { value: 'rr', label: 'Research Report (RR)' },
                  { value: 'sg', label: 'Section Generation (SG)' }
                ].map((m) => (
                  <button
                    key={m.value}
                    onClick={() => onSetThinkingMode(m.value as 'dynamic' | 'rr' | 'sg')}
                    className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                      (config.thinkingMode ?? 'dynamic') === m.value
                        ? 'border-[var(--theme-border-focus)] bg-[var(--theme-bg-accent)] text-[var(--theme-text-primary)]'
                        : 'border-[var(--theme-border-secondary)] bg-[var(--theme-bg-secondary)] text-[var(--theme-text-secondary)] hover:bg-[var(--theme-bg-tertiary)] hover:text-[var(--theme-text-primary)]'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Max QA Retry Attempts (only show for rr/sg) */}
        {(config.thinkingMode === 'rr' || config.thinkingMode === 'sg') && (
          <div className="flex items-center justify-between gap-6 rounded-lg border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-input)] p-3.5">
            <div className="flex min-w-0 items-start gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--theme-text-primary)]">最大重试次数 (QA)</p>
                <p className="mt-1 text-xs leading-relaxed text-[var(--theme-text-tertiary)]">
                  在专家环节执行 QA 时，如果未通过将最多重试的次数 (1-5)。
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <input
                type="number"
                min="1"
                max="5"
                value={config.maxRetryAttempts ?? 2}
                onChange={(e) => onSetMaxRetryAttempts(Math.max(1, Math.min(5, parseInt(e.target.value) || 2)))}
                className="w-16 rounded border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-secondary)] px-2 py-1 text-center text-sm text-[var(--theme-text-primary)] outline-none focus:border-[var(--theme-border-focus)]"
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-6 rounded-lg border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-input)] p-3.5 max-sm:flex-col max-sm:items-stretch">
          <div className="flex min-w-0 items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-secondary)]">
              <RefreshCw size={16} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--theme-text-primary)]">递归优化</p>
              <p className="mt-1 text-xs leading-relaxed text-[var(--theme-text-tertiary)]">
                循环生成专家输出直到满意为止 (适用于 Dynamic)。
              </p>
            </div>
          </div>
          <label className="relative inline-flex cursor-pointer items-center self-center max-sm:self-start">
            <input
              type="checkbox"
              checked={config.enableRecursiveLoop ?? false}
              onChange={(e) => onSetRecursiveLoop(e.target.checked)}
              className="sr-only peer"
            />
            <div className="peer h-5 w-9 rounded-full bg-[var(--theme-border-secondary)] after:absolute after:start-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:border after:border-[var(--theme-border-secondary)] after:bg-[var(--theme-bg-input)] after:transition-all after:content-[''] peer-checked:bg-[var(--theme-bg-accent)] peer-checked:after:translate-x-full peer-checked:after:border-[var(--theme-bg-input)] peer-focus:outline-none"></div>
          </label>
        </div>
      </div>

      <div className="divide-y divide-[var(--theme-border-primary)] rounded-lg border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-input)] px-3.5">
        <LevelSelect
          label="管理者：规划策略"
          value={config.planningLevel}
          validLevels={validLevels}
          onChange={(v) => onSetThinkingLevel('planningLevel', v)}
          desc="控制初始查询分析和专家委派的深度。"
        />

        <LevelSelect
          label="专家：执行深度"
          value={config.expertLevel}
          validLevels={validLevels}
          onChange={(v) => onSetThinkingLevel('expertLevel', v)}
          desc="决定每个专家角色对其特定任务的思考深度。"
        />

        <LevelSelect
          label="管理者：最终综合"
          value={config.synthesisLevel}
          validLevels={validLevels}
          onChange={(v) => onSetThinkingLevel('synthesisLevel', v)}
          desc="控制将结果汇总为最终答案的推理力度。"
        />
      </div>
    </div>
  );
};

export default ThinkingSection;
