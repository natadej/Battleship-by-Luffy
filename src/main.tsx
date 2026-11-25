import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/fredoka/latin-500.css'
import '@fontsource/fredoka/latin-700.css'
import './index.css'
import App from './App.tsx'
import './cartoon-preview.css'

// Branch-only art study. The original option leaves all existing game styles intact.
document.documentElement.dataset.art = new URLSearchParams(location.search).get('art') === 'original' ? 'original' : 'cartoon'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
