import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Dev-only middleware so the /api serverless functions also run under
// `npm run dev` (Vite). In production these are real Vercel functions.
function devApi(env) {
  return {
    name: 'dev-api',
    configureServer(server) {
      // make server-only secrets available to the handler in dev
      if (env.GEMINI_API_KEY) process.env.GEMINI_API_KEY = env.GEMINI_API_KEY
      if (env.SUPABASE_SERVICE_ROLE_KEY) process.env.SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
      if (env.VITE_SUPABASE_URL) process.env.VITE_SUPABASE_URL = env.VITE_SUPABASE_URL
      if (env.VITE_SUPABASE_ANON_KEY) process.env.VITE_SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY
      server.middlewares.use(async (req, res, next) => {
        const path = (req.url || '').split('?')[0]
        // Route any /api/<name> to api/<name>.js so all serverless functions
        // run under `npm run dev`, matching Vercel's behaviour in production.
        const m = path.match(/^\/api\/([a-z0-9-]+)$/i)
        if (m) {
          try {
            const mod = await server.ssrLoadModule(`/api/${m[1]}.js`)
            return mod.default(req, res)
          } catch (e) {
            res.statusCode = 500
            res.end(JSON.stringify({ error: 'dev api failed', detail: String(e) }))
            return
          }
        }
        next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '') // load ALL vars (incl. non-VITE_)
  return {
    plugins: [react(), devApi(env)],
  }
})
