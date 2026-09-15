import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import productConfig from '../../../product/renyan.json'
import devSession from '../../../scripts/dev-session.js'

const productHtmlPlugin = {
  name: 'renyan-product-html',
  transformIndexHtml: (html: string) => html.replaceAll('%PRODUCT_DISPLAY_NAME%', productConfig.displayName),
}

export default defineConfig({
  base: './',
  plugins: [
    react(),
    productHtmlPlugin,
    {
      name: 'development-session',
      apply: 'serve',
      configureServer(server) {
        server.middlewares.use(devSession.createSessionMiddleware())
      },
    },
  ],
  server: {
    host: '127.0.0.1',
    port: Number(process.env.PORT) || 5173,
    strictPort: Boolean(process.env.YAKIT_DEV_SESSION_ID),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        format: 'es',
      },
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'antd', 'monaco-editor'],
  },
})
