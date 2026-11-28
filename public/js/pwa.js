/**
 * PWA registration and install handshake.
 *
 * The manifest is already linked by Base.astro. This adds the service worker
 * (installability requirement #2) and exposes the browser install prompt so a
 * future UI can call window.gwillInstallPWA() without another script.
 */
(function () {
  'use strict';

  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;

  var manifest = document.querySelector('link[rel="manifest"]');
  var swUrl = manifest ? new URL('sw.js', manifest.href).href : '/sw.js';
  var scope = manifest ? new URL('./', manifest.href).href : '/';

  window.addEventListener('load', function () {
    navigator.serviceWorker.register(swUrl, { scope: scope }).catch(function (err) {
      console.warn('PWA service worker registration failed:', err);
    });
  });

  var deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', function (event) {
    event.preventDefault();
    deferredPrompt = event;
    document.documentElement.classList.add('pwa-installable');
    document.dispatchEvent(new CustomEvent('gwill:installavailable'));
  });

  window.gwillInstallPWA = function () {
    if (!deferredPrompt) return Promise.resolve(false);
    var prompt = deferredPrompt;
    deferredPrompt = null;
    return prompt.prompt().then(function () {
      return prompt.userChoice.then(function (choice) {
        document.documentElement.classList.remove('pwa-installable');
        return choice.outcome === 'accepted';
      });
    });
  };

  window.addEventListener('appinstalled', function () {
    document.documentElement.classList.remove('pwa-installable');
    deferredPrompt = null;
    document.dispatchEvent(new CustomEvent('gwill:installed'));
  });
})();
