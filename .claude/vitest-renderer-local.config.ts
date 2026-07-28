import path from 'node:path'

const rendererRoot = path.resolve(__dirname, '../app/renderer/src/main')

export default {
  root: rendererRoot,
  resolve: {
    alias: {
      '@': path.resolve(rendererRoot, 'src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [path.resolve(rendererRoot, 'src/setupTests.ts')],
  },
}
