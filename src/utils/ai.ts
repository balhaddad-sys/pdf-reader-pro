const API_URL = '/api/chat';
const MAX_RETRIES = 4;

async function callClaude(messages: { role: string; content: unknown }[]): Promise<string> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
    });

    if (response.status === 429) {
      const delay = (attempt + 1) * 3000;
      await new Promise(r => setTimeout(r, delay));
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
