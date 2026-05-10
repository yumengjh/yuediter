import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider } from 'antd'
import { editorTheme } from './theme'
import './styles/tokens.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider theme={editorTheme}>
      <App />
    </ConfigProvider>
  </StrictMode>,
)
