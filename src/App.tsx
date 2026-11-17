import './App.css'

const metrics = [
  { label: 'Total applied', value: '128', delta: '+12%' },
  { label: 'Applied this week', value: '19', delta: '+4 vs last week' },
  { label: 'Interview rate', value: '31%', delta: '+6pp' },
  { label: 'Avg / week', value: '9.1', delta: 'steady' },
]

const designTokens = [
  { name: 'Canvas', value: '#F5F3EE' },
  { name: 'Panel', value: '#FFFFFF' },
  { name: 'Ink', value: '#1A1A1A' },
  { name: 'Muted', value: '#5B5B5B' },
  { name: 'Accent', value: '#1B6B6B' },
  { name: 'Accent soft', value: '#DDEFEF' },
  { name: 'Positive', value: '#156C3A' },
  { name: 'Warning', value: '#B66E1F' },
  { name: 'Border', value: '#D9D0C5' },
]

const typeScale = [
  { name: 'Display', value: '48/56 • 700' },
  { name: 'Heading', value: '32/40 • 600' },
  { name: 'Section', value: '18/28 • 600' },
  { name: 'Body', value: '16/24 • 400' },
  { name: 'Meta', value: '12/18 • 600' },
]

const layoutScale = [
  { name: '4px', value: 'XS' },
  { name: '8px', value: 'SM' },
  { name: '12px', value: 'MD' },
  { name: '16px', value: 'LG' },
  { name: '24px', value: 'XL' },
  { name: '32px', value: '2XL' },
]

function App() {
  return (
    <div className="page-shell">
      <header className="topbar">
        <div className="brand-block" aria-label="Apply Pilot brand">
          <img className="brand-mark" src="/icons/app-icon.png" alt="" />
          <div>
            <p className="eyebrow">Phase 1</p>
            <h1>Apply Pilot</h1>
          </div>
        </div>
        <nav className="topbar-actions" aria-label="Primary navigation">
          <button type="button" className="ghost-button">Design brief</button>
          <button type="button" className="primary-button">Capture flow</button>
        </nav>
      </header>

      <main className="content-grid">
        <section className="hero-panel panel">
          <div className="hero-copy">
            <p className="eyebrow accent">Product direction</p>
            <h2>Calm, trustworthy job tracking for serious applicants.</h2>
            <p className="lede">
              Apply Pilot helps job seekers stay organised without friction. The interface feels
              precise and focused, with the capture flow doing the work in the background while
              the dashboard keeps decisions clear and actionable.
            </p>
            <div className="hero-actions">
              <button type="button" className="primary-button">View target user</button>
              <button type="button" className="ghost-button">Read assumptions</button>
            </div>
          </div>
          <div className="mini-dashboard" aria-label="Summary preview">
            {metrics.map((metric) => (
              <div key={metric.label} className="mini-card">
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
                <small>{metric.delta}</small>
              </div>
            ))}
          </div>
        </section>

        <section className="panel brief-panel">
          <div className="section-heading">
            <p className="eyebrow">Requirements & assumptions</p>
            <h3>Audience, principles, tone</h3>
          </div>
          <div className="two-column-list">
            <ul>
              <li><strong>Audience:</strong> active job seekers, career switchers, and professionals applying to multiple roles across a busy browser workflow.</li>
              <li><strong>Principles:</strong> clarity over cleverness, resilient capture over perfect extraction, and privacy by default.</li>
              <li><strong>Tone:</strong> calm, precise, trustworthy, and focused; never robotic or noisy.</li>
            </ul>
            <ul>
              <li><strong>Risk:</strong> site variability makes generic extraction essential, but detection must avoid false positives.</li>
              <li><strong>Assumption:</strong> users want a browser-first workflow that stays local to their device and respects permission limits.</li>
              <li><strong>Priority:</strong> reliable save flow and a clean dashboard matter more than ambitious but fragile features.</li>
            </ul>
          </div>
        </section>

        <section className="panel design-panel">
          <div className="section-heading">
            <p className="eyebrow">Design system</p>
            <h3>Colours, type, spacing, motion</h3>
          </div>

          <div className="token-grid">
            {designTokens.map((token) => (
              <div key={token.name} className="token-card">
                <span className="swatch" style={{ background: token.value }} aria-hidden="true" />
                <div>
                  <strong>{token.name}</strong>
                  <small>{token.value}</small>
                </div>
              </div>
            ))}
          </div>

          <div className="type-grid">
            {typeScale.map((type) => (
              <div key={type.name} className="type-row">
                <span>{type.name}</span>
                <strong>{type.value}</strong>
              </div>
            ))}
          </div>

          <div className="scale-grid">
            {layoutScale.map((space) => (
              <div key={space.name} className="scale-item">
                <span className="scale-box" style={{ width: space.name }} aria-hidden="true" />
                <small>{space.name}</small>
                <strong>{space.value}</strong>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
