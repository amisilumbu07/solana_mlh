import { Link, Route, Routes } from 'react-router-dom'
import Home from './pages/Home'
import Dashboard from './pages/Dashboard'
import DashboardAgent from './pages/DashboardAgent'
import Market from './pages/Market'
import History from './pages/History'
import Navbar from './components/Navbar'

const NotFound = () => (
  <main className="page page--narrow">
    <div className="empty">
      <strong>Page not found</strong>
      <Link to="/markets">Back to markets</Link>
    </div>
  </main>
)

function App() {
  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/markets" element={<Dashboard />} />
        <Route path="/agent" element={<DashboardAgent />} />
        <Route path="/market/:id" element={<Market />} />
        <Route path="/history" element={<History />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  )
}

export default App
