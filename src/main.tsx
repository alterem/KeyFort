import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import App from './App'
import { PasswordGeneratorPage } from './components/PasswordGeneratorPage'
import { PublicAccessPage } from './components/PublicAccessPage'
import { ShareAccessPage } from './components/ShareAccessPage'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/public" element={<PublicAccessPage />} />
        <Route path="/generator" element={<PasswordGeneratorPage />} />
        <Route path="/share/:token" element={<ShareAccessPage />} />
        <Route path="/*" element={<App />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
