export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const { type, payload } = req.body
  try {
    if (type === 'claude') {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.CLAUDE_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-opus-4-5',
          max_tokens: 1024,
          system: payload.system || 'Voce e o BetSense AI, especialista em apostas. Responda em portugues.',
          messages: payload.messages,
        }),
      })
      const data = await response.json()
      if (!response.ok) return res.status(response.status).json({ error: data.error?.message || 'Claude error' })
      const text = (data.content || []).map(c => c.text || '').join('')
      return res.status(200).json({ text })
    }
    if (type === 'fixtures') {
      const { league, season, next } = payload
      const url = 'https://v3.football.api-sports.io/fixtures?league=' + league + '&season=' + season + '&next=' + (next || 10)
      const response = await fetch(url, {
        headers: { 'x-apisports-key': '39fe3549b154af9333aaf9a791a7cb4b' }
      })
      const data = await response.json()
      if (!response.ok) return res.status(response.status).json({ error: 'API-Football error' })
      return res.status(200).json({ fixtures: data.response || [] })
    }
    return res.status(400).json({ error: 'Unknown type' })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
