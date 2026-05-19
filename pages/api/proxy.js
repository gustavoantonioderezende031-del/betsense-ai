export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { type, payload } = req.body

  try {
    // ── CLAUDE AI ──────────────────────────────────────────
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
          system: payload.system || 'Voce e o BetSense AI, especialista em apostas esportivas. Responda em portugues brasileiro.',
          messages: payload.messages,
        }),
      })
      const data = await response.json()
      if (!response.ok) return res.status(response.status).json({ error: data.error?.message || 'Claude error' })
      const text = (data.content || []).map(c => c.text || '').join('')
      return res.status(200).json({ text })
    }

    // ── THE ODDS API ───────────────────────────────────────
    if (type === 'odds') {
      const { sport } = payload
      const url = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${process.env.ODDS_KEY}|| '15e67228d0c78ef660c09d37a8f5bf6f'&regions=eu,uk&markets=h2h,totals,btts&oddsFormat=decimal&dateFormat=iso&daysFrom=4`
      const response = await fetch(url)
      const data = await response.json()
      if (!response.ok) return res.status(response.status).json({ error: 'Odds API error' })
      return res.status(200).json({ games: data })
    }

    return res.status(400).json({ error: 'Unknown type' })

  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
