(function(){
  // Kept as a compatibility stub. EV consumption, WLTP range and battery chips
  // are now handled centrally by motornet-consumption-ui.js.
  // This file must not wrap renderCarVisual anymore, otherwise it can remove
  // richer chips created by the main Motornet chip renderer.
  window.__motornetEvSpecFixLoaded = true;
  window.addEventListener('load', function(){
    try { if(typeof setAutoFields === 'function') setAutoFields(); } catch(e) {}
  });
})();
