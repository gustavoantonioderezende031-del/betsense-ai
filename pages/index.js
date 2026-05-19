import { useState, useEffect, useRef } from 'react'
import Head from 'next/head'

const SPORTS = [
  { key: 'soccer_brazil_campeonato',         label: '🇧🇷 Brasileirao'    },
  { key: 'soccer_epl',                        label: '🏴󠁧󠁢󠁥󠁮󠁧󠁿 Premier League' },
  { key: 'soccer_spain_la_liga',              label: '🇪🇸 La Liga'        },
  { key: 'soccer_germany_bundesliga',         label: '🇩🇪 Bundesliga'     },
  { key: 'soccer_italy_serie_a',              label: '🇮🇹 Serie A'        },
  { key: 'soccer_france_ligue_one',           label: '🇫🇷 Ligue 1'        },
  { key: 'soccer_uefa_champs_league',         label: '🏆 Champions'      },
  { key: 'soccer_conmebol_copa_libertadores', label: '🏆 Libertadores'   },
]

const C = {
  bg: '#04070F', surface: '#0C1220', card: '#101828',
  border: 'rgba(255,255,255,0.08)', text: '#F0F4FF',
  muted: '#5A6680', dim: '#8897B0',
  cyan: '#00E5FF', green: '#10B981', red: '#F43F5E',
  gold: '#F59E0B', purple: '#8B5CF6', blue: '#3B82F6',
}

function ip(odds) { return odds > 1 ? (100 / odds).toFixed(0) : 0 }
function fmtTime(iso) {
  if (!iso) return ''
  const d = new Date(iso), diff = d - Date.now()
  if (diff < 0) return 'Em andamento'
  if (diff < 3600000) return Math.floor(diff / 60000) + ' min'
  if (diff < 86400000) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
function short(n, max = 18) { return n && n.length > max ? n.slice(0, max - 1) + '…' : (n || '') }
function confColor(s) { return s >= 75 ? C.green : s >= 60 ? C.gold : C.red }
function evColor(e) { return e > 5 ? C.green : e > 0 ? C.gold : C.red }

function parseGame(raw) {
  if (!raw) return null
  let bH = 0, bD = 0, bA = 0, o25 = 0, u25 = 0, bY = 0, bN = 0
  for (const book of (raw.bookmakers || [])) {
    for (const mkt of (book.markets || [])) {
      if (mkt.key === 'h2h') for (const o of mkt.outcomes) {
        if (o.name === raw.home_team && o.price > bH) bH = o.price
        if (o.name === 'Draw' && o.price > bD) bD = o.price
        if (o.name === raw.away_team && o.price > bA) bA = o.price
      }
      if (mkt.key === 'totals') for (const o of mkt.outcomes) {
        if (o.name === 'Over'  && o.point === 2.5 && o.price > o25) o25 = o.price
        if (o.name === 'Under' && o.point === 2.5 && o.price > u25) u25 = o.price
      }
      if (mkt.key === 'btts') for (const o of mkt.outcomes) {
        if (o.name === 'Yes' && o.price > bY) bY = o.price
        if (o.name === 'No'  && o.price > bN) bN = o.price
      }
    }
  }
  return {
    id: raw.id, sport_title: raw.sport_title,
    home: raw.home_team, away: raw.away_team, time: raw.commence_time,
    bH: bH || null, bD: bD || null, bA: bA || null,
    o25: o25 || null, u25: u25 || null,
    bttsY: bY || null, bttsN: bN || null,
    booksCount: (raw.bookmakers || []).length,
    bookNames: (raw.bookmakers || []).map(b => b.title),
  }
}

async function callProxy(type, payload) {
  const res = await fetch('/api/proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, payload }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Erro')
  return data
}

function buildAnalysisPrompt(game) {
  const mkts = []
  if (game.bH) mkts.push(`1X2: Casa ${game.bH} | Empate ${game.bD || '-'} | Fora ${game.bA || '-'}`)
  if (game.o25) mkts.push(`Over 2.5: ${game.o25} | Under 2.5: ${game.u25 || '-'}`)
  if (game.bttsY) mkts.push(`BTTS Sim: ${game.bttsY} | Nao: ${game.bttsN || '-'}`)
  const margin = game.bH && game.bD && game.bA
    ? ((100/game.bH + 100/game.bD + 100/game.bA) - 100).toFixed(2) : 'N/A'
  return `Analise este jogo como analista quantitativo de apostas. Retorne SOMENTE JSON valido.

JOGO: ${game.home} vs ${game.away}
LIGA: ${game.sport_title}
DATA: ${new Date(game.time).toLocaleString('pt-BR')}
BOOKMAKERS: ${game.booksCount}
MERCADOS: ${mkts.join(' | ')}
MARGEM: ${margin}%

Retorne SOMENTE este JSON (sem texto antes ou depois):
{
  "best_bet": "descricao clara da aposta",
  "best_odds": 1.85,
  "confidence": 68,
  "ev_score": 5.2,
  "risk": "medium",
  "home_real_prob": 42,
  "draw_real_prob": 28,
  "away_real_prob": 30,
  "analysis": "analise tecnica em 2-3 frases em portugues",
  "key_factors": ["fator 1", "fator 2", "fator 3"],
  "stake_suggestion": 2,
  "bookmaker_suggestion": "Bet365"
}`
}

// ── COMPONENTS ──────────────────────────────────────────────

function ProbBars({ home, draw, away, game }) {
  return (
    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
      {[[short(game.home, 14), home, C.green], ['Empate', draw, C.gold], [short(game.away, 14), away, C.blue]].map(([l, v, c]) => (
        <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 72, fontSize: 10, color: C.muted, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l}</div>
          <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: v + '%', height: '100%', background: c, transition: 'width .6s ease' }} />
          </div>
          <div style={{ fontSize: 10, fontWeight: 500, color: c, width: 28, textAlign: 'right' }}>{v}%</div>
        </div>
      ))}
    </div>
  )
}

function AIResult({ a, game }) {
  const cC = confColor(a.confidence || 0)
  const cE = evColor(a.ev_score || 0)
  const riskLabel = { low: 'Baixo', medium: 'Medio', high: 'Alto' }[a.risk] || 'Medio'
  const riskColor = { low: C.green, medium: C.gold, high: C.red }[a.risk] || C.gold
  return (
    <div style={{ background: 'rgba(0,229,255,0.04)', border: '1px solid rgba(0,229,255,0.15)', borderRadius: 11, padding: 12, marginTop: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
        <span style={{ fontSize: 10, color: C.cyan, fontWeight: 500, letterSpacing: '0.07em' }}>ANALISE IA</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <span style={{ fontSize: 11, color: cC, fontWeight: 500 }}>{a.confidence}% conf</span>
          <span style={{ fontSize: 11, color: cE, fontWeight: 500 }}>EV+{(a.ev_score || 0).toFixed(1)}%</span>
        </div>
      </div>
      <div style={{ fontSize: 14, fontWeight: 500, color: C.cyan, marginBottom: 8 }}>
        {a.best_bet} @ {a.best_odds ? a.best_odds.toFixed(2) : '—'}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 5, marginBottom: 8 }}>
        {[['CONF', a.confidence + '%', cC], ['EV+', '+' + (a.ev_score || 0).toFixed(1) + '%', cE], ['RISCO', riskLabel, riskColor], ['STAKE', (a.stake_suggestion || 1) + 'u', C.text]].map(([l, v, c]) => (
          <div key={l} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '6px 5px', textAlign: 'center' }}>
            <div style={{ fontSize: 8, color: C.muted, fontWeight: 500 }}>{l}</div>
            <div style={{ fontSize: 12, fontWeight: 500, color: c, marginTop: 2 }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.55, marginBottom: 8 }}>{a.analysis}</div>
      {a.key_factors?.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
          {a.key_factors.map(f => (
            <span key={f} style={{ fontSize: 10, color: C.cyan, background: 'rgba(0,229,255,0.1)', padding: '2px 8px', borderRadius: 10 }}>{f}</span>
          ))}
        </div>
      )}
      <ProbBars home={a.home_real_prob || 0} draw={a.draw_real_prob || 0} away={a.away_real_prob || 0} game={game} />
      {a.bookmaker_suggestion && (
        <div style={{ marginTop: 8, fontSize: 11, color: C.muted }}>
          Procure em: <strong style={{ color: C.text }}>{a.bookmaker_suggestion}</strong>
        </div>
      )}
    </div>
  )
}

function GameCard({ game }) {
  const [analysis, setAnalysis] = useState(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)

  const analyze = async () => {
    setLoading(true); setError(null)
    try {
      const { text } = await callProxy('claude', {
        messages: [{ role: 'user', content: buildAnalysisPrompt(game) }]
      })
      const s = text.indexOf('{'), e = text.lastIndexOf('}')
      if (s === -1) throw new Error('Resposta invalida')
      setAnalysis(JSON.parse(text.slice(s, e + 1)))
    } catch (e) { setError(e.message) }
    setLoading(false)
  }

  return (
    <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 14, padding: 15, transition: 'border-color .2s' }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(0,229,255,0.25)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 10 }}>
        {game.sport_title} · {fmtTime(game.time)}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 13 }}>
        <div style={{ flex: 1, fontSize: 13, fontWeight: 500, color: C.text }}>{short(game.home)}</div>
        <div style={{ fontSize: 11, color: C.muted, flexShrink: 0 }}>vs</div>
        <div style={{ flex: 1, fontSize: 13, fontWeight: 500, color: C.text, textAlign: 'right' }}>{short(game.away)}</div>
      </div>
      {game.bH && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5, marginBottom: 8 }}>
          {[['Casa', game.bH], ['Empate', game.bD], ['Fora', game.bA]].map(([l, v]) => (
            <div key={l} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 9, padding: '7px 5px', textAlign: 'center' }}>
              <div style={{ fontSize: 9, color: C.muted, fontWeight: 500, marginBottom: 2 }}>{l}</div>
              <div style={{ fontSize: 14, fontWeight: 500, color: C.gold, fontFamily: 'monospace' }}>{v ? v.toFixed(2) : '—'}</div>
              <div style={{ fontSize: 9, color: C.muted, marginTop: 1 }}>{v ? ip(v) + '%' : ''}</div>
            </div>
          ))}
        </div>
      )}
      {game.o25 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginBottom: 8 }}>
          {[['Over 2.5', game.o25], ['Under 2.5', game.u25]].map(([l, v]) => (
            <div key={l} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '6px 5px', textAlign: 'center' }}>
              <div style={{ fontSize: 9, color: C.muted, marginBottom: 2 }}>{l}</div>
              <div style={{ fontSize: 13, fontWeight: 500, color: C.blue, fontFamily: 'monospace' }}>{v ? v.toFixed(2) : '—'}</div>
            </div>
          ))}
        </div>
      )}
      {analysis ? (
        <AIResult a={analysis} game={game} />
      ) : (
        <button onClick={analyze} disabled={loading}
          style={{ width: '100%', padding: '9px', borderRadius: 10, border: 'none', cursor: loading ? 'default' : 'pointer', fontSize: 12, fontWeight: 500, fontFamily: 'inherit', background: loading ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg,' + C.cyan + ',#0097B2)', color: loading ? C.muted : '#000', transition: 'opacity .2s' }}>
          {loading ? 'Analisando...' : '🤖 Analisar com IA'}
        </button>
      )}
      {error && <div style={{ marginTop: 8, fontSize: 11, color: C.red }}>{error}</div>}
      <div style={{ marginTop: 8, fontSize: 10, color: C.muted, textAlign: 'right' }}>{game.booksCount} bookmakers</div>
    </div>
  )
}

// ── PAGES ────────────────────────────────────────────────────

function JogosPage() {
  const [sport, setSport]   = useState(SPORTS[0].key)
  const [games, setGames]   = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState(null)

  const load = async (s) => {
    setLoading(true); setError(null); setGames([])
    try {
      const { games: raw } = await callProxy('odds', { sport: s })
      setGames((raw || []).map(parseGame).filter(Boolean))
    } catch (e) { setError(e.message) }
    setLoading(false)
  }

  useEffect(() => { load(sport) }, [sport])

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 20, fontWeight: 500, color: C.text, marginBottom: 4 }}>Jogos & Odds Reais</div>
        <div style={{ fontSize: 12, color: C.muted }}>Odds ao vivo de 80+ bookmakers internacionais</div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 18 }}>
        {SPORTS.map(s => (
          <button key={s.key} onClick={() => setSport(s.key)}
            style={{ padding: '6px 12px', borderRadius: 9, border: '1px solid ' + (sport === s.key ? C.cyan : C.border), background: sport === s.key ? 'rgba(0,229,255,0.1)' : 'transparent', color: sport === s.key ? C.cyan : C.muted, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s' }}>
            {s.label}
          </button>
        ))}
      </div>
      {loading && <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '40px 0', color: C.muted, fontSize: 13 }}>
        <div style={{ width: 20, height: 20, border: '2px solid rgba(0,229,255,0.2)', borderTopColor: C.cyan, borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
        Buscando jogos reais...
      </div>}
      {error && <div style={{ padding: '14px 18px', background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.3)', borderRadius: 12, color: C.red, fontSize: 13 }}>{error}</div>}
      {!loading && games.length === 0 && !error && <div style={{ textAlign: 'center', padding: '50px 0', color: C.muted, fontSize: 13 }}>Nenhum jogo nos proximos 4 dias para esta liga.</div>}
      {!loading && games.length > 0 && (
        <>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 14 }}>{games.length} jogos encontrados</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(290px,1fr))', gap: 12 }}>
            {games.map(g => <GameCard key={g.id} game={g} />)}
          </div>
        </>
      )}
    </div>
  )
}

function ApostasPage() {
  const [selected, setSelected] = useState(SPORTS.slice(0, 5).map(s => s.key))
  const [picks, setPicks]       = useState([])
  const [loading, setLoading]   = useState(false)
  const [status, setStatus]     = useState('')
  const [ran, setRan]           = useState(false)

  const toggle = (key) => setSelected(p => p.includes(key) ? (p.length > 1 ? p.filter(k => k !== key) : p) : [...p, key])

  const run = async () => {
    setLoading(true); setPicks([]); setRan(true)
    const all = []
    for (const sport of selected) {
      setStatus('Buscando ' + (SPORTS.find(s => s.key === sport)?.label || sport) + '...')
      try {
        const { games: raw } = await callProxy('odds', { sport })
        all.push(...(raw || []).slice(0, 3).map(parseGame).filter(Boolean))
      } catch (_) {}
    }
    setStatus('Analisando ' + all.length + ' jogos com Claude AI...')
    const results = []
    for (const game of all) {
      try {
        const { text } = await callProxy('claude', { messages: [{ role: 'user', content: buildAnalysisPrompt(game) }] })
        const s = text.indexOf('{'), e = text.lastIndexOf('}')
        if (s !== -1) {
          const a = JSON.parse(text.slice(s, e + 1))
          if ((a.ev_score || 0) > 2 && (a.confidence || 0) >= 55) results.push({ game, analysis: a })
        }
      } catch (_) {}
    }
    results.sort((a, b) => (b.analysis.ev_score || 0) - (a.analysis.ev_score || 0))
    setPicks(results)
    setStatus(results.length + ' apostas com valor encontradas em ' + all.length + ' jogos')
    setLoading(false)
  }

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 20, fontWeight: 500, color: C.text, marginBottom: 4 }}>Melhores Apostas do Dia</div>
        <div style={{ fontSize: 12, color: C.muted }}>IA analisa jogos reais e filtra apostas com EV+ positivo</div>
      </div>
      <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 16, padding: 18, marginBottom: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: C.text, marginBottom: 12 }}>Selecione as ligas:</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
          {SPORTS.map(s => (
            <button key={s.key} onClick={() => toggle(s.key)}
              style={{ padding: '6px 12px', borderRadius: 9, border: '1px solid ' + (selected.includes(s.key) ? C.cyan : C.border), background: selected.includes(s.key) ? 'rgba(0,229,255,0.1)' : 'transparent', color: selected.includes(s.key) ? C.cyan : C.muted, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
              {s.label}
            </button>
          ))}
        </div>
        <button onClick={run} disabled={loading}
          style={{ padding: '10px 24px', borderRadius: 11, border: 'none', background: loading ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg,' + C.cyan + ',#0097B2)', color: loading ? C.muted : '#000', fontSize: 13, fontWeight: 500, cursor: loading ? 'default' : 'pointer', fontFamily: 'inherit' }}>
          {loading ? 'Analisando...' : '⚡ Buscar Apostas de Valor'}
        </button>
      </div>
      {status && <div style={{ fontSize: 12, color: loading ? C.muted : C.green, marginBottom: 14 }}>{status}</div>}
      {ran && !loading && picks.length === 0 && <div style={{ textAlign: 'center', padding: '40px 0', color: C.muted, fontSize: 13 }}>Nenhuma aposta com EV+ encontrada. Tente mais ligas.</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {picks.map(({ game, analysis }, idx) => {
          const cC = confColor(analysis.confidence || 0)
          const cE = evColor(analysis.ev_score || 0)
          const riskLabel = { low: 'Baixo', medium: 'Medio', high: 'Alto' }[analysis.risk] || 'Medio'
          const riskColor = { low: C.green, medium: C.gold, high: C.red }[analysis.risk] || C.gold
          return (
            <div key={game.id} style={{ background: C.card, border: '1px solid ' + (idx === 0 ? C.gold : C.border), borderRadius: 18, overflow: 'hidden', boxShadow: idx === 0 ? '0 0 30px rgba(245,158,11,0.08)' : 'none' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid ' + C.border }}>
                {idx === 0 && <div style={{ display: 'inline-block', padding: '3px 12px', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 20, fontSize: 10, color: C.gold, fontWeight: 500, marginBottom: 8 }}>🏆 MELHOR APOSTA DO DIA</div>}
                <div style={{ fontSize: 17, fontWeight: 500, color: C.text }}>{short(game.home, 22)} <span style={{ color: C.muted, fontWeight: 400, fontSize: 14 }}>vs</span> {short(game.away, 22)}</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>{game.sport_title} · {fmtTime(game.time)}</div>
              </div>
              <div style={{ padding: '16px 20px' }}>
                <div style={{ background: 'rgba(0,229,255,0.06)', border: '1px solid rgba(0,229,255,0.15)', borderRadius: 11, padding: '11px 14px', marginBottom: 14 }}>
                  <div style={{ fontSize: 10, color: C.muted, fontWeight: 500, marginBottom: 3 }}>SELECAO DA IA</div>
                  <div style={{ fontSize: 16, fontWeight: 500, color: C.cyan }}>{analysis.best_bet} @ {analysis.best_odds ? analysis.best_odds.toFixed(2) : '—'}</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 14 }}>
                  {[['CONF', analysis.confidence + '%', cC], ['EV+', '+' + (analysis.ev_score || 0).toFixed(1) + '%', cE], ['RISCO', riskLabel, riskColor], ['STAKE', (analysis.stake_suggestion || 1) + 'u', C.text]].map(([l, v, c]) => (
                    <div key={l} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
                      <div style={{ fontSize: 9, color: C.muted, fontWeight: 500 }}>{l}</div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: c, marginTop: 2 }}>{v}</div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 13, color: C.dim, lineHeight: 1.6, marginBottom: 10 }}>{analysis.analysis}</div>
                {analysis.key_factors?.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
                    {analysis.key_factors.map(f => <span key={f} style={{ fontSize: 10, color: C.cyan, background: 'rgba(0,229,255,0.1)', padding: '2px 8px', borderRadius: 10 }}>{f}</span>)}
                  </div>
                )}
                <ProbBars home={analysis.home_real_prob || 0} draw={analysis.draw_real_prob || 0} away={analysis.away_real_prob || 0} game={game} />
                {analysis.bookmaker_suggestion && <div style={{ marginTop: 10, fontSize: 11, color: C.muted }}>Procure em: <strong style={{ color: C.text }}>{analysis.bookmaker_suggestion}</strong></div>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CalcPage() {
  const [odds, setOdds]   = useState('1.85')
  const [prob, setProb]   = useState('60')
  const [stake, setStake] = useState('100')
  const [bank, setBank]   = useState('1000')
  const [legs, setLegs]   = useState([{ id: 1, v: '2.00' }, { id: 2, v: '1.80' }])

  const o = parseFloat(odds) || 1, p = parseFloat(prob) / 100 || 0
  const s = parseFloat(stake) || 0, b = parseFloat(bank) || 1000
  const ev = ((o * p) - 1) * 100, imp = (1 / o) * 100, edge = p * 100 - imp
  const kelly = Math.max(0, ((o - 1) * p - (1 - p)) / (o - 1))
  const k4 = kelly / 4 * b
  const accOdds = legs.reduce((a, l) => a * (parseFloat(l.v) || 1), 1)
  const evC = ev > 5 ? C.green : ev > 0 ? C.gold : C.red
  const edgeC = edge > 0 ? C.green : C.red

  const Input = ({ label, value, onChange }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 11, color: C.muted, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</label>
      <input type="number" value={value} onChange={e => onChange(e.target.value)} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid ' + C.border, borderRadius: 10, padding: '10px 13px', color: C.text, fontSize: 14, fontFamily: 'inherit', outline: 'none' }} />
    </div>
  )

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 20, fontWeight: 500, color: C.text, marginBottom: 4 }}>Calculadora EV+ e Kelly</div>
        <div style={{ fontSize: 12, color: C.muted }}>Calcule valor esperado e stake ideal</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 18 }}>
        <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: C.text }}>Parametros</div>
          <Input label="Odd Decimal" value={odds} onChange={setOdds} />
          <Input label="Sua Probabilidade Real (%)" value={prob} onChange={setProb} />
          <Input label="Valor da Aposta (R$)" value={stake} onChange={setStake} />
          <Input label="Bankroll Total (R$)" value={bank} onChange={setBank} />
        </div>
        <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 16, padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: C.text, marginBottom: 14 }}>Resultado</div>
          {[['Valor Esperado (EV)', (ev >= 0 ? '+' : '') + ev.toFixed(2) + '%', evC], ['Probabilidade Implicita', imp.toFixed(1) + '%', C.text], ['Edge sobre mercado', (edge >= 0 ? '+' : '') + edge.toFixed(1) + '%', edgeC], ['Kelly 1/4 (conservador)', 'R$ ' + k4.toFixed(2), C.gold], ['Retorno Potencial', 'R$ ' + (s * o).toFixed(2), C.cyan], ['Lucro Potencial', 'R$ ' + (s * o - s).toFixed(2), C.green]].map(([l, v, c]) => (
            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid ' + C.border }}>
              <span style={{ fontSize: 12, color: C.muted }}>{l}</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: c, fontFamily: 'monospace' }}>{v}</span>
            </div>
          ))}
          <div style={{ marginTop: 14, padding: '10px 13px', borderRadius: 10, fontSize: 12, fontWeight: 500, background: ev > 5 ? 'rgba(16,185,129,0.1)' : ev > 0 ? 'rgba(245,158,11,0.1)' : 'rgba(244,63,94,0.1)', border: '1px solid ' + (ev > 5 ? 'rgba(16,185,129,0.25)' : ev > 0 ? 'rgba(245,158,11,0.25)' : 'rgba(244,63,94,0.25)'), color: evC }}>
            {ev > 5 ? 'Aposta com valor! EV de ' + ev.toFixed(2) + '% - recomendado.' : ev > 0 ? 'EV positivo. Apostar com cautela.' : 'EV negativo - sem valor esperado positivo.'}
          </div>
        </div>
      </div>
      <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 16, padding: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: C.text, marginBottom: 14 }}>Construtor de Acumulador</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 12 }}>
          {legs.map((leg, i) => (
            <div key={leg.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(0,229,255,0.1)', border: '1px solid ' + C.border, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: C.cyan, flexShrink: 0 }}>{i + 1}</div>
              <input type="number" step="0.01" value={leg.v} onChange={e => setLegs(p => p.map(l => l.id === leg.id ? { ...l, v: e.target.value } : l))} style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid ' + C.border, borderRadius: 10, padding: '9px 12px', color: C.text, fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
              {legs.length > 1 && <button onClick={() => setLegs(p => p.filter(l => l.id !== leg.id))} style={{ background: 'transparent', border: 'none', color: C.red, cursor: 'pointer', fontSize: 18, padding: '0 4px' }}>×</button>}
            </div>
          ))}
        </div>
        <button onClick={() => setLegs(p => [...p, { id: Date.now(), v: '1.85' }])} style={{ padding: '7px 16px', borderRadius: 10, border: '1px solid ' + C.border, background: 'transparent', color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 14 }}>+ Adicionar selecao</button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <span style={{ fontSize: 13, color: C.muted }}>Odd Total:</span>
          <span style={{ fontSize: 22, fontWeight: 500, color: C.gold, fontFamily: 'monospace' }}>{accOdds.toFixed(2)}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))', gap: 8 }}>
          {[25, 50, 100, 200, 500].map(v => (
            <div key={v} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 9, padding: '8px 10px', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: C.muted }}>R$ {v}</div>
              <div style={{ fontSize: 14, fontWeight: 500, color: C.green, fontFamily: 'monospace', marginTop: 2 }}>R$ {(v * accOdds).toFixed(2)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ChatPage() {
  const [msgs, setMsgs]     = useState([{ role: 'assistant', content: 'Ola! Sou o BetSense AI 🤖\n\nEspecialista em apostas esportivas e analise quantitativa. Posso te ajudar com EV+, Kelly Criterion, odds, mercados e estrategias de bankroll.\n\nComo posso ajudar?' }])
  const [input, setInput]   = useState('')
  const [loading, setLoading] = useState(false)
  const ref = useRef(null)

  useEffect(() => { ref.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

  const send = async () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    const newMsgs = [...msgs, { role: 'user', content: text }]
    setMsgs(newMsgs)
    setLoading(true)
    try {
      const history = newMsgs.map(m => ({ role: m.role, content: m.content }))
      const { text: reply } = await callProxy('claude', {
        system: 'Voce e o BetSense AI, especialista em apostas esportivas e analise quantitativa. Especialidades: EV+, Kelly Criterion, bankroll, odds, mercados (1X2, Over/Under, BTTS, Handicap Asiatico), probabilidades implicitas, xG. Seja tecnico e use exemplos numericos. Nunca incentive apostas irresponsaveis. Responda sempre em portugues brasileiro.',
        messages: history,
      })
      setMsgs(p => [...p, { role: 'assistant', content: reply }])
    } catch (e) {
      setMsgs(p => [...p, { role: 'assistant', content: 'Erro de conexao. Tente novamente.' }])
    }
    setLoading(false)
  }

  const sugs = ['Como calcular EV+?', 'O que e Kelly Criterion?', 'Qual mercado tem melhor ROI?', 'Como ler handicap asiatico?']

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 20, fontWeight: 500, color: C.text, marginBottom: 4 }}>AI Chat</div>
        <div style={{ fontSize: 12, color: C.muted }}>Analise quantitativa de apostas com Claude AI</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: '16px 16px 0 0', padding: 18, minHeight: 350, maxHeight: 450, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {msgs.map((m, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexDirection: m.role === 'assistant' ? 'row' : 'row-reverse' }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, background: m.role === 'assistant' ? 'linear-gradient(135deg,' + C.cyan + ',' + C.purple + ')' : 'linear-gradient(135deg,' + C.gold + ',#D97706)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>
                {m.role === 'assistant' ? '🤖' : '👤'}
              </div>
              <div style={{ maxWidth: '78%', padding: '10px 14px', fontSize: 13, lineHeight: 1.65, color: C.dim, borderRadius: m.role === 'assistant' ? '4px 14px 14px 14px' : '14px 4px 14px 14px', background: m.role === 'assistant' ? 'rgba(0,229,255,0.05)' : 'rgba(245,158,11,0.08)', border: '1px solid ' + (m.role === 'assistant' ? 'rgba(0,229,255,0.12)' : 'rgba(245,158,11,0.2)'), whiteSpace: 'pre-wrap' }}>
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,' + C.cyan + ',' + C.purple + ')', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🤖</div>
              <div style={{ padding: '12px 16px', background: 'rgba(0,229,255,0.05)', border: '1px solid rgba(0,229,255,0.12)', borderRadius: '4px 14px 14px 14px', display: 'flex', gap: 4, alignItems: 'center' }}>
                {[0, 1, 2].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: C.cyan, animation: 'bounce 1s ' + i * 0.2 + 's infinite' }} />)}
              </div>
            </div>
          )}
          <div ref={ref} />
        </div>
        {msgs.length === 1 && (
          <div style={{ background: '#0C1220', borderLeft: '1px solid ' + C.border, borderRight: '1px solid ' + C.border, padding: '8px 14px', display: 'flex', gap: 7, overflowX: 'auto' }}>
            {sugs.map(s => (
              <button key={s} onClick={() => setInput(s)} style={{ padding: '5px 12px', background: 'rgba(0,229,255,0.08)', border: '1px solid rgba(0,229,255,0.15)', borderRadius: 20, color: C.cyan, fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, fontFamily: 'inherit' }}>{s}</button>
            ))}
          </div>
        )}
        <div style={{ background: C.card, border: '1px solid ' + C.border, borderTop: 'none', borderRadius: '0 0 16px 16px', padding: '11px 14px', display: 'flex', gap: 9, alignItems: 'center' }}>
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()} placeholder="Pergunte sobre EV+, Kelly, odds, estrategias..." style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid ' + C.border, borderRadius: 11, padding: '10px 14px', color: C.text, fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
          <button onClick={send} disabled={!input.trim() || loading} style={{ padding: '10px 18px', borderRadius: 11, border: 'none', background: (input.trim() && !loading) ? 'linear-gradient(135deg,' + C.cyan + ',#0097B2)' : 'rgba(255,255,255,0.06)', color: (input.trim() && !loading) ? '#000' : C.muted, fontSize: 13, fontWeight: 500, cursor: (input.trim() && !loading) ? 'pointer' : 'default', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>Enviar ⚡</button>
        </div>
      </div>
    </div>
  )
}

// ── MAIN ─────────────────────────────────────────────────────

const PAGES = [
  { id: 'jogos',    label: 'Jogos & Odds',    icon: '⚽', component: JogosPage    },
  { id: 'apostas',  label: 'Melhores Apostas', icon: '🎯', component: ApostasPage  },
  { id: 'calc',     label: 'Calculadora',      icon: '🧮', component: CalcPage     },
  { id: 'chat',     label: 'AI Chat',          icon: '🤖', component: ChatPage     },
]

export default function App() {
  const [page, setPage] = useState('jogos')
  const Page = PAGES.find(p => p.id === page)?.component || JogosPage

  return (
    <>
      <Head>
        <title>BetSense AI</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #04070F; color: #F0F4FF; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes bounce { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
        input::placeholder { color: rgba(90,102,128,0.7); }
        input:focus { border-color: #00E5FF !important; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
        @media (max-width: 768px) { .sidebar { display: none; } .main { margin-left: 0 !important; } .bottom-nav { display: flex !important; } }
      `}</style>

      <div style={{ display: 'flex', minHeight: '100vh' }}>
        {/* Sidebar desktop */}
        <div className="sidebar" style={{ width: 210, background: C.surface, borderRight: '1px solid ' + C.border, display: 'flex', flexDirection: 'column', position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 100 }}>
          <div style={{ padding: '20px 18px', borderBottom: '1px solid ' + C.border, display: 'flex', alignItems: 'center', gap: 11 }}>
            <div style={{ width: 38, height: 38, borderRadius: 12, background: 'linear-gradient(135deg,#00E5FF,#8B5CF6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>⚡</div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 500, color: C.text }}>BetSense</div>
              <div style={{ fontSize: 9, color: C.cyan, letterSpacing: '0.12em' }}>AI POWERED</div>
            </div>
          </div>
          <nav style={{ flex: 1, padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 1 }}>
            {PAGES.map(p => (
              <button key={p.id} onClick={() => setPage(p.id)} style={{ width: '100%', padding: '10px 12px', borderRadius: 11, border: 'none', background: page === p.id ? 'rgba(0,229,255,0.1)' : 'transparent', color: page === p.id ? C.cyan : C.muted, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13, fontWeight: page === p.id ? 500 : 400, fontFamily: 'inherit', textAlign: 'left', transition: 'all .15s' }}>
                <span style={{ fontSize: 16 }}>{p.icon}</span> {p.label}
              </button>
            ))}
          </nav>
          <div style={{ padding: '12px 14px', borderTop: '1px solid ' + C.border }}>
            <div style={{ background: 'rgba(0,229,255,0.08)', border: '1px solid rgba(0,229,255,0.15)', borderRadius: 10, padding: '9px 11px' }}>
              <div style={{ fontSize: 10, color: C.cyan, fontWeight: 500, marginBottom: 2 }}>🟢 APIs Ativas</div>
              <div style={{ fontSize: 10, color: C.dim }}>Odds API + Claude AI</div>
            </div>
          </div>
        </div>

        {/* Main content */}
        <div className="main" style={{ flex: 1, marginLeft: 210, padding: '24px 24px 80px', maxWidth: 1200, width: '100%' }}>
          <Page />
        </div>

        {/* Bottom nav mobile */}
        <div className="bottom-nav" style={{ display: 'none', position: 'fixed', bottom: 0, left: 0, right: 0, background: C.surface, borderTop: '1px solid ' + C.border, padding: '8px 0', zIndex: 100 }}>
          {PAGES.map(p => (
            <button key={p.id} onClick={() => setPage(p.id)} style={{ flex: 1, background: 'transparent', border: 'none', color: page === p.id ? C.cyan : C.muted, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, cursor: 'pointer', padding: '4px 0', fontFamily: 'inherit' }}>
              <span style={{ fontSize: 20 }}>{p.icon}</span>
              <span style={{ fontSize: 9 }}>{p.label.split(' ')[0]}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
