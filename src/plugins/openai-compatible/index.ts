import { definePlugin } from '@/core/runtime/types';

import { listOpenAIModels, openAICompatibleModel } from './model';

/** Any OpenAI-compatible endpoint (Kimi, GLM, Qwen, OpenRouter, a LAN Ollama …). */
export const openAICompatiblePlugin = definePlugin({
  id: 'openai-compatible',
  name: 'OpenAI 兼容服务',
  description: '接入任意兼容 OpenAI Chat Completions 接口的模型服务。',
  version: '0.1.0',
  icon: 'server',
  scopes: ['用户填写的 Base URL'],
  tools: {},
  providers: {
    custom: {
      name: 'OpenAI 兼容',
      description: '自定义 Base URL、模型和 API Key',
      auth: 'apiKey',
      defaultBaseURL: 'https://api.openai.com/v1',
      editableBaseURL: true,
      models: [],
      defaultModel: '',
      credentialHint: '服务商提供的 API Key；本地服务可留空',
      listModels: listOpenAIModels,
      createModel: (config) => openAICompatibleModel('custom', config),
    },
  },
});
