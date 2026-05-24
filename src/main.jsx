import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { startNativeSelfDevelopmentAutostart } from './services/nativeSelfDevelopmentAutostartService'

const runNativeProofAttempt = async (attempt = 1) => {
  const result = await startNativeSelfDevelopmentAutostart()
  if (result?.cycle || ['ready', 'recorded', 'running', 'blocked'].includes(result?.state)) {
    return
  }
  if (attempt < 12) {
    window.setTimeout(() => {
      void runNativeProofAttempt(attempt + 1)
    }, 3000)
  }
}

window.setTimeout(() => {
  void runNativeProofAttempt()
}, 1000)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
