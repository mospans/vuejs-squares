import { registerSW } from 'virtual:pwa-register';

if (import.meta.env.PROD) {
  registerSW({
    immediate: true,
    onOfflineReady() {
      console.log('App is ready to work offline.');
    },
    onNeedRefresh() {
      console.log('New content is available; please refresh.');
    },
    onRegisteredSW(swUrl) {
      console.log(`Service worker registered: ${swUrl}`);
    },
    onRegisterError(error) {
      console.error('Error during service worker registration:', error);
    },
  });
}
