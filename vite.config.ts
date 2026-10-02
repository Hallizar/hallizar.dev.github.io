import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';
import { githubAuthMiddleware } from './src/server/github-auth-middleware.ts';

function githubAuthPlugin(): Plugin {
  return {
    name: 'github-auth-plugin',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        githubAuthMiddleware(req, res, next);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        githubAuthMiddleware(req, res, next);
      });
    },
  };
}

export default defineConfig(() => {
  const cnamePath = path.resolve('public/CNAME');
  const hasCustomDomain = fs.existsSync(cnamePath) && fs.readFileSync(cnamePath, 'utf8').trim().length > 0;
  const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';
  const repoName = 'hallizar.dev.github.io';
  const base = process.env.BASE_PATH || (isGitHubActions && !hasCustomDomain ? `/${repoName}/` : './');

  return {
    base,
    plugins: [react(), tailwindcss(), githubAuthPlugin()],
    resolve: {
      alias: {
        '@': path.resolve('.'),
      },
    },
    build: {
      emptyOutDir: false,
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true as const,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
