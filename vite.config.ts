import build from '@hono/vite-build/vercel'
import devServer from '@hono/vite-dev-server'
import adapter from '@hono/vite-dev-server/node'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    build({
      vercel: {
        function: { runtime: 'nodejs22.x' },
      },
    }),
    devServer({
      adapter,
      entry: 'src/index.tsx'
    })
  ]
})
