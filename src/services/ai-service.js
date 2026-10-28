async function getAssistantReply(question, language) {
  const key = process.env.AI_API_KEY;
  const baseUrl = process.env.AI_BASE_URL;
  const model = process.env.AI_MODEL;
  if (!key || !baseUrl || !model) {
    return {
      mode: 'basic',
      language,
      reply: 'I can help explain parcel booking steps, required details, packing, and what a tracking reference means. Live rates and confirmed bookings require a connected courier provider.'
    };
  }
  // Provider-agnostic OpenAI-compatible endpoint. Keep the key server-side.
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: `You are Stratic Global Market's parcel help assistant. Reply in language code ${language}. Never claim a shipment was booked, priced, delivered, or tracked unless the server confirms it. Do not request payment card secrets or OTPs.` },
        { role: 'user', content: question }
      ],
      temperature: 0.3
    }),
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw Object.assign(new Error('AI provider request failed'), { status: 502 });
  const data = await response.json();
  return { mode: 'ai', language, reply: data.choices?.[0]?.message?.content || 'Sorry, I could not answer that.' };
}
module.exports = { getAssistantReply };
