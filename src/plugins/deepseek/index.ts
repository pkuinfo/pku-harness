import { definePlugin } from '@/core/runtime/types';
import { listOpenAIModels, openAICompatibleModel } from '@/plugins/openai-compatible/model';

/**
 * DeepSeek, the default model provider. Catalog follows DeepSeek Harness
 * (`packages/llm/llm-deepseek/src/models.ts`); the live `/models` listing wins when available.
 * An `account` provider (DeepSeek sign-in, like `llm-deepseek-account`) can be added here.
 */
export const deepseekPlugin = definePlugin({
  id: 'deepseek',
  name: 'DeepSeek',
  description: 'DeepSeek 官方 API（默认 AI 服务）。',
  version: '0.1.0',
  icon: 'sparkles',
  scopes: ['api.deepseek.com'],
  tools: {},
  providers: {
    api: {
      name: 'DeepSeek',
      description: '使用 DeepSeek 开放平台的 API Key',
      auth: 'apiKey',
      defaultBaseURL: 'https://api.deepseek.com',
      models: [
        { id: 'deepseek-flash', name: 'DeepSeek-V4.1-Flash', description: '快速、经济，日常任务' },
        { id: 'deepseek-v4-pro', name: 'DeepSeek-V4-Pro', description: '更强的推理与复杂任务' },
      ],
      defaultModel: 'deepseek-flash',
      credentialHint: '在 platform.deepseek.com 的 API Keys 页面创建',
      listModels: listOpenAIModels,
      createModel: (config) => openAICompatibleModel('deepseek', config),
    },
  },
});
