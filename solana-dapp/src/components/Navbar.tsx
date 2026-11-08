import React from 'react'
import { Link, NavLink } from 'react-router-dom'
import { BrandWhale } from './Whale'
import { useAgentStatus } from '../context/useAgentStatus'

const LINKS = [
  { to: '/', label: 'How it works' },
  { to: '/markets', label: 'Markets' },
  { to: '/agent', label: 'Agent Dashboard' },
  { to: '/history', label: 'History' },
]

/** Whether real money is at stake stays visible on every page. */
const ModeBadge: React.FC = () => {
  const status = useAgentStatus()

  if (status === undefined) return <span className="mode">Checking mode…</span>
  if (status === null) return <span className="mode">Agent offline</span>
  if (status.executionMode === 'live') return <span className="mode mode--live">LIVE · real money</span>
  return <span className="mode mode--dry">Dry run · no real orders</span>
}

const Navbar: React.FC = () => (
  <header className="nav">
    <div className="nav__inner">
      <div className="nav__left">
        <Link to="/" className="brand">
          <BrandWhale />
          Whalecheck
        </Link>
        <ModeBadge />
      </div>
      <nav className="nav__links" aria-label="Main">
        {LINKS.map((link) => (
          <NavLink key={link.to} to={link.to} end={link.to === '/'} className="nav__link">
            {link.label}
          </NavLink>
        ))}
      </nav>
    </div>
  </header>
)

export default Navbar
