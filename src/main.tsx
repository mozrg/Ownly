import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/tokens.css'
import './styles/shell.css'
import './styles/components.css'
import './styles/pages.css'
import './styles/motion.css'

// Keep renderer failures visible to the screenshot harness; a blank page with
// no explanation is the hardest kind of bug to chase.
const errorLog: string[] = []
;(window as unknown as { __ownlyErrors: string[] }).__ownlyErrors = errorLog
window.addEventListener('error', (event) => errorLog.push(String(event.message)))
window.addEventListener('unhandledrejection', (event) => errorLog.push(String(event.reason)))

const container = document.getElementById('root')
if (!container) throw new Error('Root element missing')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

/* Fade out the boot splash once the first paint is ready. */
requestAnimationFrame(() => {
  window.setTimeout(() => {
    document.getElementById('boot')?.classList.add('done')
  }, 260)
})
