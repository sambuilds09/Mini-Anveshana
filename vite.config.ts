import build from '@hono/vite-build/vercel'
import devServer from '@hono/vite-dev-server'
import adapter from '@hono/vite-dev-server/node'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  Object.assign(process.env, env)

  return {
    plugins: [
      build({
        vercel: {
          function: { runtime: 'nodejs22.x' },
        },
      }),
      devServer({
        adapter,
        env,
        entry: 'src/index.tsx',
      }),
    ],
  }
})
