import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import productConfig from '../../../product/renyan.json'

const productHtmlPlugin = {
  name: 'renyan-product-html',
  transformIndexHtml: (html: string) => html.replaceAll('%PRODUCT_DISPLAY_NAME%', productConfig.displayName),
}

export default defineConfig({
  base: './',
  plugins: [react(), productHtmlPlugin],
  server: {
    host: true,
    port: 5173,
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
