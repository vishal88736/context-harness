import type { Provider } from "./api";

// Connection templates contain no model IDs or credentials. Discovery remains authoritative.
export const providerPresets: {
  id: string;
  name: string;
  kind: Provider["kind"];
  baseUrl: string;
  description: string;
  outputTokenParameter?: "max_tokens";
}[] = [
  {
    id: "openai",
    name: "OpenAI",
    kind: "compatible",
    baseUrl: "https://api.openai.com/v1",
    description: "Chat Completions API",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    kind: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    description: "Native Messages API",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    kind: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    description: "Native Gemini API",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    kind: "compatible",
    baseUrl: "https://openrouter.ai/api/v1",
    description: "Models across providers",
    outputTokenParameter: "max_tokens",
  },
  {
    id: "groq",
    name: "Groq",
    kind: "compatible",
    baseUrl: "https://api.groq.com/openai/v1",
    description: "Compatible hosted API",
    outputTokenParameter: "max_tokens",
  },
  {
    id: "ollama",
    name: "Ollama",
    kind: "ollama",
    baseUrl: "http://127.0.0.1:11434",
    description: "Local models",
  },
  {
    id: "lmstudio",
    name: "LM Studio",
    kind: "compatible",
    baseUrl: "http://127.0.0.1:1234/v1",
    description: "Local compatible server",
    outputTokenParameter: "max_tokens",
  },
  {
    id: "custom",
    name: "Custom endpoint",
    kind: "compatible",
    baseUrl: "",
    description: "Bring your own API base URL",
  },
];

export const adapterBaseUrls: Record<Provider["kind"], string> = {
  compatible: "",
  ollama: "http://127.0.0.1:11434",
  anthropic: "https://api.anthropic.com/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta",
};
