// adapted from https://vite.dev/guide/build#multi-page-app

import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default
defineConfig({
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        config: resolve(__dirname, 'config.html'),
        tree: resolve(__dirname, 'tree.html'),
      },
    },
  },
});
