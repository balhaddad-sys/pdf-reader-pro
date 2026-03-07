const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY as string || '';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';

const MAX_RETRIES = 4;

const SYSTEM_PROMPT = [
  'You are a helpful PDF reading assistant embedded in a PDF reader app.',
  'Answer based on the page content provided. Be concise, well-structured, and accurate.',
  'Use markdown formatting: **bold** for key terms, bullet lists for multiple points, `code` for technical terms.',
  'IMPORTANT: Always reply in the same language the user writes their question in.',
  'If the user asks in Arabic, reply in Arabic. If French, reply in French. Match the user\'s language exactly.',
  'If the user\'s message references previous conversation, use the chat history to understand context.',
].join(' ');

async function callClaude(messages: { role: string; content: unknown }[]): Promise<string> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const response = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages,
      }),
    });

    if (response.status === 429) {
      const delay = (attempt + 1) * 3000;
      await new Promise(r => setTimeout(r, delay));
      continue;
    }

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Claude API error ${response.status}: ${err}`);
    }

    const data = await response.json();
    return data.content?.[0]?.text ?? 'No response from Claude.';
  }

  return 'Rate limited. Please wait a moment and try again.';
}

/** Text-based: send extracted page text */
export async function askClaude(pageText: string, question: string): Promise<string> {
  if (!ANTHROPIC_API_KEY) {
    return 'Anthropic API key not configured. Add VITE_ANTHROPIC_API_KEY to your .env file.';
  }

  const trimmedText = pageText.slice(0, 8000);

  const messages = [{
    role: 'user',
    content: [
      '--- PAGE CONTENT ---',
      trimmedText,
      '--- END PAGE CONTENT ---',
      '',
      question,
    ].join('\n'),
  }];

  return callClaude(messages);
}

/** Vision-based: send page screenshots when no text layer exists */
export async function askClaudeVision(imageDataUrls: string[], question: string): Promise<string> {
  if (!ANTHROPIC_API_KEY) {
    return 'Anthropic API key not configured. Add VITE_ANTHROPIC_API_KEY to your .env file.';
  }

  const content: Record<string, unknown>[] = [
    { type: 'text', text: 'The user is viewing a PDF. Below are screenshots of the pages. Read the text from the images and answer the question.' },
  ];

  for (const dataUrl of imageDataUrls) {
    const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
    if (match) {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: match[1],
          data: match[2],
        },
      });
    }
  }

  content.push({ type: 'text', text: question });

  const messages = [{ role: 'user', content }];

  return callClaude(messages);
}
