import React from 'react'
import { Link } from 'react-router-dom'
import { CheckIllustration, SmallCopyIllustration, WhaleIllustration } from '../components/Whale'
import { formatUsd } from '../utils/format'

const Arrow: React.FC = () => (
  <svg className="name-arrow" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 12H20M14 6L20 12L14 18" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const Rows: React.FC<{ rows: [string, string][]; total?: [string, string] }> = ({ rows, total }) => (
  <ul className="rows">
    {rows.map(([label, value]) => (
      <li key={label}>
        <span>{label}</span>
        <span className="money">{value}</span>
      </li>
    ))}
    {total && (
      <li className="total">
        <span>{total[0]}</span>
        <span className="money">{total[1]}</span>
      </li>
    )}
  </ul>
)

const ExampleMeter: React.FC<{ label: string; value: number; limit: number; limitLabel: string }> = ({ label, value, limit, limitLabel }) => (
  <div className="meter">
    <div className="meter__row">
      <span>{label}</span>
      <span className="meter__value">
        {value}% <span className="meter__limit">· {limitLabel} {limit}%</span>
      </span>
    </div>
    <div className="meter__track">
      <span className="meter__fill" style={{ width: `${value}%` }} />
      <span className="meter__tick" style={{ left: `${limit}%` }} />
    </div>
  </div>
)

const CHAPTERS: { title: string; text: string; panel: React.ReactNode }[] = [
  {
    title: 'A trader you follow makes a move',
    text: 'You pick one Polymarket wallet to follow. The agent checks it every 5 seconds and picks up new buys worth $100 or more.',
    panel: (
      <Rows
        rows={[
          ['Bought', 'YES'],
          ['Price per share', formatUsd(0.5)],
          ['Shares', '1,000'],
        ]}
        total={['Trader spent', formatUsd(500)]}
      />
    ),
  },
  {
    title: 'The agent reads the news',
    text: 'It searches recent articles about that market, along with general economic news, so the trade gets judged against what is happening now.',
    panel: (
      <Rows
        rows={[
          ['News site A', 'Supports'],
          ['News site B', 'Supports'],
          ['News site C', 'Off topic'],
        ]}
      />
    ),
  },
  {
    title: 'The AI gives its opinion',
    text: 'The AI scores how confident it is and how risky the trade looks. You set the limits for both on the dashboard.',
    panel: (
      <>
        <ExampleMeter label="Confidence" value={85} limit={65} limitLabel="min" />
        <ExampleMeter label="Risk" value={30} limit={70} limitLabel="max" />
      </>
    ),
  },
  {
    title: 'Fixed rules have the final say',
    text: 'An opinion is not enough. Every one of these rules has to pass, or the trade is blocked and the dashboard tells you why.',
    panel: (
      <ul className="checklist">
        <li>The trader bought, not sold</li>
        <li>The trade is under 2 minutes old</li>
        <li>News articles were found</li>
        <li>At least 2 different sites support it</li>
        <li>More sites support it than contradict it</li>
        <li>The price has moved less than 2 cents</li>
      </ul>
    ),
  },
  {
    title: 'A small copy, inside your limits',
    text: 'The copy is a small slice of the original trade, never more than your limits allow. A Solana program enforces those limits and approves each trade only once. In dry run you see exactly what would have happened, and no order is sent.',
    panel: (
      <Rows
        rows={[
          ['1% of trader’s amount', formatUsd(5)],
          ['Limit per order', formatUsd(5)],
          ['Limit per day', formatUsd(25)],
          ['Highest price accepted', formatUsd(0.52)],
        ]}
        total={['Dry run result', `Would buy ${formatUsd(5)}`]}
      />
    ),
  },
]

const SETUP = [
  {
    title: 'Add your settings',
    body: (
      <>
        Copy <code>.env.example</code> to <code>bot-agent/.env</code>. Add your API keys and the wallet to follow.
      </>
    ),
  },
  {
    title: 'Start the app',
    body: (
      <>
        Run <code>./START_SERVICES.sh</code> from the project folder.
      </>
    ),
  },
  { title: 'Set your limits', body: <>Open the Agent Dashboard, check it says Agent online, and adjust the risk sliders.</> },
  { title: 'Watch in dry run', body: <>Read each decision and why trades were blocked. Stay here until the choices make sense to you.</> },
]

const Home: React.FC = () => (
  <main className="page">
    <section className="hero">
      <div>
        <h1 className="hero__title">Copy big trades only when the evidence agrees.</h1>
        <p className="hero__lead">
          Follow a Polymarket trader and let an AI agent check each of their buys against the latest news and your own limits.
          It starts in dry run, so you can watch every decision before any money moves.
        </p>
        <div className="hero__actions">
          <Link className="button" to="/agent">
            Open Agent Dashboard
          </Link>
          <a className="button button--secondary" href="#story">
            See how a trade works
          </a>
        </div>
      </div>

      <div>
        <p className="example-label">Example decision</p>
        <div className="verdict">
          <p className="verdict__market">Will the Fed cut rates in December?</p>
          <Rows
            rows={[
              ['Trader bought', `YES at ${formatUsd(0.5)}`],
              ['Rules passed', '6 of 6'],
            ]}
          />
          <div className="verdict__result">
            <p className="muted">Would buy</p>
            <p className="verdict__amount">{formatUsd(5)}</p>
            <p className="muted">Dry run. No order was sent.</p>
          </div>
        </div>
      </div>
    </section>

    <section className="home-section" aria-labelledby="name-title">
      <h2 className="home-section__title" id="name-title">
        Why <span className="name-whale">Whale</span>check?
      </h2>
      <p className="home-section__lead">A whale is a trader who moves big money. Whalecheck checks their move before you follow it.</p>

      <div className="name-graphic">
        <div className="name-step">
          <WhaleIllustration />
          <h3>The whale</h3>
          <p className="name-step__value">{formatUsd(500)}</p>
          <p className="name-step__text">A big trader makes a buy on Polymarket.</p>
        </div>
        <Arrow />
        <div className="name-step name-step--check">
          <CheckIllustration />
          <h3>The check</h3>
          <p className="name-step__value">6 rules</p>
          <p className="name-step__text">News, timing and price all have to agree.</p>
        </div>
        <Arrow />
        <div className="name-step">
          <SmallCopyIllustration />
          <h3>Your copy</h3>
          <p className="name-step__value">{formatUsd(5)}</p>
          <p className="name-step__text">You follow with a small amount, inside your limits.</p>
        </div>
      </div>
      <p className="name-outcome">
        <strong>If any rule fails, nothing is copied,</strong> and the dashboard tells you why.
      </p>
    </section>

    <section className="home-section" id="story">
      <h2 className="home-section__title">Follow one trade from start to finish</h2>
      <p className="home-section__lead">
        Here is what happens in the seconds after a trader buys. The numbers are an example using the default settings.
      </p>

      <ol className="story">
        {CHAPTERS.map((chapter, index) => (
          <li className="chapter" key={chapter.title}>
            <span className="chapter__number" aria-hidden="true">
              {index + 1}
            </span>
            <div>
              <h3 className="chapter__title">{chapter.title}</h3>
              <p className="chapter__text">{chapter.text}</p>
            </div>
            <div className="chapter__panel">{chapter.panel}</div>
          </li>
        ))}
      </ol>
    </section>

    <section className="home-section">
      <h2 className="home-section__title">Get started</h2>
      <ol className="setup">
        {SETUP.map((step, index) => (
          <li key={step.title}>
            <span className="setup__n">{index + 1}</span>
            <h3>{step.title}</h3>
            <p>{step.body}</p>
          </li>
        ))}
      </ol>
    </section>

    <section className="caution">
      <h2>Before you use real money</h2>
      <ul className="checklist">
        <li>You can lose everything you put into a market.</li>
        <li>The AI’s scores are not financial advice, and a good dry run doesn’t promise profit.</li>
        <li>Use a separate wallet holding only what you can afford to lose.</li>
        <li>Keep your per-order and daily limits small at first.</li>
        <li>Check that Polymarket is allowed where you live.</li>
        <li>Leave Auto-execute off until you trust the decisions you see.</li>
      </ul>
    </section>
  </main>
)

export default Home
