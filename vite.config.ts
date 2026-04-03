import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

function normalizeBasePath(value: string | undefined): string {
  if (!value) return '/';
  const withLeadingSlash = value.startsWith('/') ? value : `/${value}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const base = normalizeBasePath(env.VITE_BASE_PATH);
  const serverPort = env.PORT || '3000';
  const vitePort = Number.parseInt(env.VITE_PORT || '5173', 10);

  return {
    plugins: [
      react(),
      {
        name: 'base-path-root-redirect',
        configureServer(server) {
          if (base === '/') {
            return;
          }
          const baseWithoutTrailingSlash = base.endsWith('/') ? base.slice(0, -1) : base;

          server.middlewares.use((req, res, next) => {
            if (
              req.url === '/' ||
              req.url === '' ||
              (baseWithoutTrailingSlash.length > 0 && req.url === baseWithoutTrailingSlash)
            ) {
              res.statusCode = 302;
              res.setHeader('Location', base);
              res.end();
              return;
            }

            next();
          });
        },
      },
    ],
    root: '.',
    base,
    resolve: {
      alias: {
        '@client': path.resolve(__dirname, 'src/client'),
        '@lib': path.resolve(__dirname, 'src/lib'),
      },
    },
    server: {
      port: Number.isFinite(vitePort) ? vitePort : 5173,
      proxy: {
        [`${base}api`]: {
          target: `http://localhost:${serverPort}`,
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist/client',
      emptyOutDir: true,
    },
  };
});
