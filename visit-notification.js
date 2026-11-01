/* Independent of calculator data, storage and rendering. */
(() => {
  if (location.origin !== 'https://khadra-t.netlify.app') return;
  const key = 'khadra-t:visit-notification:v1';
  const ttl = 30 * 60 * 1000;
  let started = false;
  async function notify() {
    try {
      const previous = Number(localStorage.getItem(key));
      if (previous > 0 && Date.now() - previous >= 0 && Date.now() - previous < ttl) return;
      // Reserve before sending; no automatic retry that might duplicate delivery.
      localStorage.setItem(key, String(Date.now()));
    } catch { /* The server's signed cookie still suppresses ordinary reloads. */ }
    try {
      await fetch('/.netlify/functions/visit', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'X-Khadra-Visit': '1' }, signal: AbortSignal.timeout(8000)
      });
    } catch { /* Notifications must never interrupt the calculator. */ }
  }
  function start() {
    if (started || document.visibilityState !== 'visible') return;
    started = true;
    if (navigator.locks) navigator.locks.request(key, notify).catch(() => {});
    else void notify();
  }
  document.addEventListener('visibilitychange', start);
  start();
})();
