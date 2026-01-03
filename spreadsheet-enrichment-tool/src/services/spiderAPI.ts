export interface SpiderConfig {
  apiKey: string;
  maxPages?: number;
  timeout?: number;
}

export interface ScrapedContent {
  url: string;
  content: string;
  title?: string;
}

export const scrapeWebsite = async (
  domain: string,
  config: SpiderConfig
): Promise<ScrapedContent[]> => {
  try {
    const url = new URL('https://api.spider.cloud/crawl');

    const requestBody = {
      url: ensureValidURL(domain),
      limit: config.maxPages || 10,
      return_format: 'markdown',
      metadata: true,
    };

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(config.timeout || 60000),
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Invalid Spider API key');
      } else if (response.status === 429) {
        throw new Error('Spider API rate limit exceeded');
      } else {
        throw new Error(`Spider API error: ${response.status}`);
      }
    }

    const data = await response.json();

    // Handle different response formats
    if (!data || !Array.isArray(data)) {
      throw new Error('Invalid Spider API response format');
    }

    const scrapedContent: ScrapedContent[] = data.map((page: any) => ({
      url: page.url || domain,
      content: page.content || page.markdown || '',
      title: page.title || '',
    }));

    if (scrapedContent.length === 0) {
      throw new Error('No content scraped from website');
    }

    return scrapedContent;
  } catch (error: any) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      throw new Error('Spider scraping timeout');
    } else if (error.message) {
      throw error;
    } else {
      throw new Error('Unknown Spider API error');
    }
  }
};

const ensureValidURL = (domain: string): string => {
  let url = domain.trim();

  // If it doesn't start with http:// or https://, add https://
  if (!url.match(/^https?:\/\//i)) {
    url = 'https://' + url;
  }

  try {
    new URL(url);
    return url;
  } catch {
    throw new Error(`Invalid domain: ${domain}`);
  }
};

export const validateSpiderAPIKey = async (apiKey: string): Promise<boolean> => {
  try {
    const response = await fetch('https://api.spider.cloud/crawl', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: 'https://example.com',
        limit: 1,
      }),
      signal: AbortSignal.timeout(5000),
    });

    // A 200 or 400 status code means the API key is valid
    // 401 means invalid key
    return response.status !== 401;
  } catch {
    return false;
  }
};
