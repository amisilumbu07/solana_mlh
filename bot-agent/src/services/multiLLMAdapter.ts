/**
 * Multi-LLM Adapter Service
 * Supports: Claude, OpenAI, Ollama, GPT4Free, Custom Endpoints
 */

import Anthropic from '@anthropic-ai/sdk'
import axios from 'axios'

export type LLMProvider = 'claude' | 'openai' | 'gpt4free' | 'ollama' | 'custom'

export interface LLMResponse {
  text: string
  provider: LLMProvider
  model: string
  tokensUsed?: {
    input: number
    output: number
  }
}

export interface LLMAdapterConfig {
  provider: LLMProvider
  model: string
  apiKey?: string
  endpoint?: string
  temperature?: number
  maxTokens?: number
}

export class MultiLLMAdapter {
  private config: LLMAdapterConfig
  private anthropic: Anthropic | null = null

  constructor(config: LLMAdapterConfig) {
    this.config = {
      maxTokens: 1024,
      temperature: 0.7,
      ...config
    }

    this.initializeProvider()
  }

  private initializeProvider(): void {
    switch (this.config.provider) {
      case 'claude':
        this.anthropic = new Anthropic({
          apiKey: this.config.apiKey || process.env.ANTHROPIC_API_KEY
        })
        console.log(`✅ Initialized Anthropic Claude (${this.config.model})`)
        break
      case 'openai':
        console.log(`✅ Initialized OpenAI (${this.config.model})`)
        break
      case 'ollama':
        console.log(`✅ Initialized Ollama (${this.config.model}) at ${this.config.endpoint}`)
        break
      case 'gpt4free':
        console.log(`✅ Initialized GPT4Free at ${this.config.endpoint}`)
        break
      case 'custom':
        console.log(`✅ Initialized Custom Endpoint at ${this.config.endpoint}`)
        break
    }
  }

  async sendMessage(prompt: string): Promise<LLMResponse> {
    switch (this.config.provider) {
      case 'claude':
        return this.sendToClaudeAPI(prompt)
      case 'openai':
        return this.sendToOpenAI(prompt)
      case 'ollama':
        return this.sendToOllama(prompt)
      case 'gpt4free':
        return this.sendToGpt4Free(prompt)
      case 'custom':
        return this.sendToCustomEndpoint(prompt)
      default:
        throw new Error(`Unsupported LLM provider: ${this.config.provider}`)
    }
  }

  private async sendToClaudeAPI(prompt: string): Promise<LLMResponse> {
    if (!this.anthropic) {
      throw new Error('Anthropic client not initialized')
    }

    const response = await this.anthropic.messages.create({
      model: this.config.model,
      max_tokens: this.config.maxTokens || 1024,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''

    return {
      text,
      provider: 'claude',
      model: this.config.model,
      tokensUsed: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens
      }
    }
  }

  private async sendToOpenAI(prompt: string): Promise<LLMResponse> {
    if (!this.config.apiKey && !process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not configured')
    }

    const apiKey = this.config.apiKey || process.env.OPENAI_API_KEY

    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: this.config.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: this.config.maxTokens || 1024,
        temperature: this.config.temperature
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    )

    const text = response.data.choices[0].message.content

    return {
      text,
      provider: 'openai',
      model: this.config.model,
      tokensUsed: {
        input: response.data.usage.prompt_tokens,
        output: response.data.usage.completion_tokens
      }
    }
  }

  private async sendToOllama(prompt: string): Promise<LLMResponse> {
    if (!this.config.endpoint) {
      throw new Error('OLLAMA_ENDPOINT not configured')
    }

    const response = await axios.post(
      `${this.config.endpoint}/api/generate`,
      {
        model: this.config.model,
        prompt: prompt,
        stream: false,
        temperature: this.config.temperature
      },
      { timeout: 60000 }
    )

    return {
      text: response.data.response,
      provider: 'ollama',
      model: this.config.model
    }
  }

  private async sendToGpt4Free(prompt: string): Promise<LLMResponse> {
    const endpoint = this.config.endpoint || process.env.GPT4FREE_ENDPOINT || 'http://localhost:8000'

    try {
      const response = await axios.post(
        `${endpoint}/api/chat`,
        {
          messages: [{ role: 'user', content: prompt }],
          model: this.config.model,
          temperature: this.config.temperature
        },
        { timeout: 60000 }
      )

      const text = response.data.reply || response.data.choices?.[0]?.message?.content

      if (!text) {
        throw new Error('Invalid response format from GPT4Free')
      }

      return {
        text,
        provider: 'gpt4free',
        model: this.config.model
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(
          `GPT4Free API error: ${error.message}. ` +
          `Ensure GPT4Free is running: python -m g4f.api`
        )
      }
      throw error
    }
  }

  private async sendToCustomEndpoint(prompt: string): Promise<LLMResponse> {
    if (!this.config.endpoint) {
      throw new Error('Custom endpoint not configured')
    }

    const payload = {
      prompt: prompt,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      ...(this.config.apiKey && { api_key: this.config.apiKey })
    }

    const response = await axios.post(
      this.config.endpoint,
      payload,
      { timeout: 30000 }
    )

    // Handle various response formats
    let text: string
    if (typeof response.data === 'string') {
      text = response.data
    } else if (response.data.text) {
      text = response.data.text
    } else if (response.data.content) {
      text = response.data.content
    } else if (response.data.choices?.[0]?.text) {
      text = response.data.choices[0].text
    } else if (response.data.choices?.[0]?.message?.content) {
      text = response.data.choices[0].message.content
    } else {
      throw new Error('Unknown response format from custom endpoint')
    }

    return {
      text,
      provider: 'custom',
      model: this.config.model
    }
  }

  getConfig(): LLMAdapterConfig {
    return { ...this.config }
  }

  updateConfig(newConfig: Partial<LLMAdapterConfig>): void {
    this.config = { ...this.config, ...newConfig }
    this.initializeProvider()
  }
}

// Factory function for easy initialization
export function createLLMAdapter(provider: LLMProvider = 'claude'): MultiLLMAdapter {
  const model = process.env.LLM_MODEL || getDefaultModel(provider)

  return new MultiLLMAdapter({
    provider,
    model,
    apiKey: process.env.LLM_API_KEY,
    endpoint: process.env.LLM_ENDPOINT || getDefaultEndpoint(provider),
    temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.7'),
    maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '1024', 10)
  })
}

function getDefaultModel(provider: LLMProvider): string {
  switch (provider) {
    case 'claude':
      return 'claude-3-5-sonnet-20241022'
    case 'openai':
      return 'gpt-4'
    case 'ollama':
      return 'mistral'
    case 'gpt4free':
      return 'gpt-4'
    default:
      return 'default'
  }
}

function getDefaultEndpoint(provider: LLMProvider): string | undefined {
  switch (provider) {
    case 'ollama':
      return 'http://localhost:11434'
    case 'gpt4free':
      return 'http://localhost:8000'
    default:
      return undefined
  }
}
