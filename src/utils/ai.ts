const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string || '';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent';

const MAX_RETRIES = 4;

const SYSTEM_PROMPT = 'You are a helpful PDF reading assistant. Answer the user\'s question based on the page content provided. Be concise and accurate. IMPORTANT: Always reply in the same language the user writes their question in. If the user asks in Arabic, reply in Arabic. If they ask in French, reply in French. Match the user\'s language exactly.';

async function callGemini(body: string): Promise<string> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (response.status === 429) {
      const delay = (attempt + 1) * 3000;
      await new Promise(r => setTimeout(r, delay));
      continue;
    }

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Gemini API error ${response.status}: ${err}`);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? 'No response from Gemini.';
  }

  return 'Rate limited by Gemini API. Please wait a moment and try again.';
}

/** Text-based: send extracted page text */
export async function askGemini(pageText: string, question: string): Promise<string> {
  if (!GEMINI_API_KEY) {
    return 'Gemini API key not configured. Add VITE_GEMINI_API_KEY to your .env file.';
  }

  const trimmedText = pageText.slice(0, 8000);

  const body = JSON.stringify({
    contents: [{
      parts: [{
        text: [
          SYSTEM_PROMPT,
          '',
          '--- PAGE CONTENT ---',
          trimmedText,
          '--- END PAGE CONTENT ---',
          '',
          `User question: ${question}`,
        ].join('\n'),
      }],
    }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
  });

  return callGemini(body);
}

/** Vision-based: send page screenshots when no text layer exists */
export async function askGeminiVision(imageDataUrls: string[], question: string): Promise<string> {
  if (!GEMINI_API_KEY) {
    return 'Gemini API key not configured. Add VITE_GEMINI_API_KEY to your .env file.';
  }

  // Build parts array: system prompt text, then each image, then the question
  const parts: Record<string, unknown>[] = [
    { text: SYSTEM_PROMPT + '\n\nThe user is viewing a PDF. Below are screenshots of the pages. Read the text from the images and answer the question.' },
  ];

  for (const dataUrl of imageDataUrls) {
    // dataUrl format: "data:image/jpeg;base64,/9j/4AAQ..."
    const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
    if (match) {
      parts.push({
        inline_data: {
          mime_type: match[1],
          data: match[2],
        },
      });
    }
  }

  parts.push({ text: `User question: ${question}` });

  const body = JSON.stringify({
    contents: [{ parts }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
  });

  return callGemini(body);
}
