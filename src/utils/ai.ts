const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string || '';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

export async function askGemini(pageText: string, question: string): Promise<string> {
  if (!GEMINI_API_KEY) {
    return 'Gemini API key not configured. Add VITE_GEMINI_API_KEY to your .env file.';
  }

  const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: [
            'You are a helpful PDF reading assistant. Answer the user\'s question based on the page content provided. Be concise and accurate.',
            '',
            '--- PAGE CONTENT ---',
            pageText,
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
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? 'No response from Gemini.';
}
