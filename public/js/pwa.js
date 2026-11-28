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

  var installPromptAvailable = false;
  window.addEventListener('beforeinstallprompt', function () {
    // Do not preventDefault: let the browser show its own install affordance.
    // The class is available if a future custom install button is added.
    installPromptAvailable = true;
    document.documentElement.classList.add('pwa-installable');
    document.dispatchEvent(new CustomEvent('gwill:installavailable'));
  });

  window.gwillPWAAvailable = function () { return installPromptAvailable; };

  window.addEventListener('appinstalled', function () {
    installPromptAvailable = false;
    document.documentElement.classList.remove('pwa-installable');
    document.dispatchEvent(new CustomEvent('gwill:installed'));
  });
})();
