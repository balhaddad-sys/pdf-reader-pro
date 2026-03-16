// On web, use the server proxy. On Capacitor (Android/iOS), call Anthropic directly.
const IS_CAPACITOR = typeof window !== 'undefined' && (
  window.location.protocol === 'capacitor:'
  || navigator.userAgent.includes('wv')
  || 'Capacitor' in window
);

const PROXY_URL = '/api/chat';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY || '';
const MODEL = 'claude-sonnet-4-6';
const SYSTEM_PROMPT = [
  'You are a helpful PDF reading assistant embedded in a PDF reader app.',
  'Answer based on the page content provided. Be concise, well-structured, and accurate.',
  'Use markdown formatting: **bold** for key terms, bullet lists for multiple points, `code` for technical terms.',
  'IMPORTANT: Always reply in the same language the user writes their question in.',
  "If the user asks in Arabic, reply in Arabic. If French, reply in French. Match the user's language exactly.",
].join(' ');

const MAX_RETRIES = 3;

async function callClaude(messages: { role: string; content: unknown }[]): Promise<string> {
  const cappedMessages = messages.slice(-8);

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    let response: Response;

    if (IS_CAPACITOR && ANTHROPIC_KEY) {
      // Direct API call for Android/iOS builds
      response = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 2048,
          system: SYSTEM_PROMPT,
          messages: cappedMessages,
        }),
      });
    } else {
      // Web: use server proxy
      response = await fetch(PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: cappedMessages }),
      });
    }

    if (response.status === 429) {
      await new Promise(r => setTimeout(r, (attempt + 1) * 3000));
      continue;
    }

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`API error ${response.status}: ${err}`);
    }

    const data = await response.json();
    return data.content?.[0]?.text ?? 'No response from Claude.';
  }

  return 'Rate limited. Please wait a moment and try again.';
}

/** Text-based: send extracted page text */
export async function askClaude(pageText: string, question: string): Promise<string> {
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
