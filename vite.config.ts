import type { Plugin } from 'vite'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * The renderer shows third-party strings and paints third-party images, so it
 * gets a strict policy. It is injected only into the built page: the dev server
 * needs inline scripts and a websocket for HMR.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  // Inline styles come from the boot splash and from component style props.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://i.ytimg.com https://*.ytimg.com https://i.scdn.co https://*.scdn.co https://*.dzcdn.net https://*.deezer.com https://*.yandex.net",
  // Signed audio URLs live on googlevideo.
  "media-src 'self' blob: https://*.googlevideo.com",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "frame-src 'none'",
  "worker-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

function contentSecurityPolicy(): Plugin {
  return {
    name: 'ownly-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<head>',
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
      )
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [react(), contentSecurityPolicy()],
  server: {
    port: 5273,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    target: 'chrome130',
    assetsInlineLimit: 2048,
    chunkSizeWarningLimit: 1200,
  },
})
