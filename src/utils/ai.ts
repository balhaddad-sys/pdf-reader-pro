const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string || '';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent';

const MAX_RETRIES = 4;

export async function askGemini(pageText: string, question: string): Promise<string> {
  if (!GEMINI_API_KEY) {
    return 'Gemini API key not configured. Add VITE_GEMINI_API_KEY to your .env file.';
  }

  // Trim page text to avoid hitting token limits on large pages
  const trimmedText = pageText.slice(0, 8000);

  const body = JSON.stringify({
    contents: [{
      parts: [{
        text: [
          'You are a helpful PDF reading assistant. Answer the user\'s question based on the page content provided. Be concise and accurate. IMPORTANT: Always reply in the same language the user writes their question in. If the user asks in Arabic, reply in Arabic. If they ask in French, reply in French. Match the user\'s language exactly.',
          '',
          '--- PAGE CONTENT ---',
          trimmedText,
          '--- END PAGE CONTENT ---',
          '',
          `User question: ${question}`,
        ].join('\n'),
      }],
    }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 1024,
    },
  });

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (response.status === 429) {
      // Rate limited — wait and retry with exponential backoff
      const delay = (attempt + 1) * 3000; // 3s, 6s, 9s, 12s
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
