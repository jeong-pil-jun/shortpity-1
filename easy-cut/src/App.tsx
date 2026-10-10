import { Route, Routes } from 'react-router-dom'
import RequireAuth from './components/RequireAuth'
import Layout from './components/Layout'
import BillingSuccess from './pages/BillingSuccess'
import Create from './pages/Create'
import Guide from './pages/Guide'
import Home from './pages/Home'
import Login from './pages/Login'
import Pricing from './pages/Pricing'
import Projects from './pages/Projects'
import Templates from './pages/Templates'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route element={<RequireAuth />}>
          <Route path="create" element={<Create />} />
          <Route path="create/:projectId" element={<Create />} />
          <Route path="projects" element={<Projects />} />
          <Route path="billing/success" element={<BillingSuccess />} />
        </Route>
        <Route path="templates" element={<Templates />} />
        <Route path="pricing" element={<Pricing />} />
        <Route path="guide" element={<Guide />} />
        <Route path="login" element={<Login />} />
        <Route path="*" element={<Home />} />
      </Route>
    </Routes>
  )
}
