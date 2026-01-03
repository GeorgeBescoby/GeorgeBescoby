import Anthropic from '@anthropic-ai/sdk';
import { ClaudeModel } from '../types';

export interface ClaudeAPIConfig {
  apiKey: string;
  model: ClaudeModel;
}

export const callClaudeAPI = async (
  prompt: string,
  config: ClaudeAPIConfig
): Promise<string> => {
  try {
    const client = new Anthropic({
      apiKey: config.apiKey,
      dangerouslyAllowBrowser: true, // Required for browser usage
    });

    const message = await client.messages.create({
      model: config.model,
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    // Extract text from response
    const textContent = message.content.find((block) => block.type === 'text');
    if (textContent && textContent.type === 'text') {
      return textContent.text;
    }

    throw new Error('No text content in Claude response');
  } catch (error: any) {
    if (error.status === 401) {
      throw new Error('Invalid Claude API key');
    } else if (error.status === 429) {
      throw new Error('Claude API rate limit exceeded');
    } else if (error.message) {
      throw new Error(`Claude API error: ${error.message}`);
    } else {
      throw new Error('Unknown Claude API error');
    }
  }
};

export const validateAPIKey = async (apiKey: string): Promise<boolean> => {
  try {
    const client = new Anthropic({
      apiKey,
      dangerouslyAllowBrowser: true,
    });

    // Simple test message
    await client.messages.create({
      model: ClaudeModel.HAIKU,
      max_tokens: 10,
      messages: [{ role: 'user', content: 'test' }],
    });

    return true;
  } catch {
    return false;
  }
};
