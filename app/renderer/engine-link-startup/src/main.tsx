import { createRoot } from 'react-dom/client'
import './index.scss'
import App from './App'
import { productConfig } from './config/product'

document.title = productConfig.displayName

createRoot(document.getElementById('root')!).render(<App />)
