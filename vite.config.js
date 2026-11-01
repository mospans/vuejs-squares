import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const base = env.VITE_BASE_PATH || '/';

  return {
    base,
    plugins: [
      vue(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: false,
        cleanupOutdatedCaches: true,
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        },
        manifest: {
          name: 'Квадраты',
          short_name: 'Квадраты',
          theme_color: '#2196f3',
          background_color: '#ffffff',
          display: 'fullscreen',
          orientation: 'portrait',
          scope: base,
          start_url: base,
          icons: [
            { src: 'img/icons/icon-72x72.png', sizes: '72x72', type: 'image/png' },
            { src: 'img/icons/icon-96x96.png', sizes: '96x96', type: 'image/png' },
            { src: 'img/icons/icon-128x128.png', sizes: '128x128', type: 'image/png' },
            { src: 'img/icons/icon-144x144.png', sizes: '144x144', type: 'image/png' },
            { src: 'img/icons/icon-152x152.png', sizes: '152x152', type: 'image/png' },
            { src: 'img/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: 'img/icons/icon-384x384.png', sizes: '384x384', type: 'image/png' },
            { src: 'img/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
          ],
        },
      }),
    ],
  };
});
