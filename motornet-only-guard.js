(function(){
  const EMPTY_CATALOG = JSON.stringify({ cars: [], images: {} });
  const BLOCKED = new Set([
    'data/cars_ev.json',
    'data/cars_ev_2.json',
    'data/cars_ev_3.json',
    'data/cars_ev_4.json',
    'data/cars_ev_5.json',
    'data/cars_ev_6.json',
    'data/cars_ev_7.json',
    'data/cars_ev_8.json',
    'data/ice_cars_seed.json',
    'data/ice_cars_2.json',
    'data/ice_cars_diesel.json',
    'data/ice_cars_more_petrol_gpl_methane.json',
    'data/ice_cars_more_petrol_gpl_methane_2.json',
    'data/car_images.json'
  ]);

  function rawUrl(resource){
    return typeof resource === 'string' ? resource : (resource && resource.url) || '';
  }

  function normalizeUrl(resource){
    const raw = rawUrl(resource);
    if(!raw) return '';
    try{
      const u = new URL(raw, window.location.href);
      return u.pathname.replace(/^\/+/, '').replace(/^elettrica\//, '');
    }catch(e){
      return raw.split('?')[0].replace(/^\/+/, '').replace(/^elettrica\//, '');
    }
  }

  function isBlockedLegacyPath(path){
    if(BLOCKED.has(path)) return true;
    return Array.from(BLOCKED).some(function(blocked){
      return path.endsWith('/' + blocked) || path.endsWith(blocked);
    });
  }

  const originalFetch = window.fetch.bind(window);
  window.fetch = function(resource, init){
    const path = normalizeUrl(resource);
    if(isBlockedLegacyPath(path)){
      return Promise.resolve(new Response(EMPTY_CATALOG, {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      }));
    }
    return originalFetch(resource, init);
  };

  // Prevent the Motornet catalogue loader from rendering thousands of legacy
  // <option> nodes into evSelect/iceSelect before the smart autocomplete UI runs.
  // motornet-base-trim-ui.js later replaces these lightweight functions with
  // the real autocomplete-backed selector logic.
  window.__motornetSelectorPatched = true;

  function byId(id){ return document.getElementById(id); }
  function lightweightFill(selectId, hintId){
    const select = byId(selectId);
    if(select && !select.value){
      select.innerHTML = '<option value=""></option>';
    }
    const hint = byId(hintId);
    if(hint) hint.textContent = '';
    try { if(typeof setAutoFields === 'function') setAutoFields(); } catch(e) {}
    try { if(typeof calculate === 'function') calculate(); } catch(e) {}
    try { if(typeof updateNavigation === 'function') updateNavigation(); } catch(e) {}
  }

  try {
    window.fillEvSelect = function(){ lightweightFill('evSelect', 'evChoiceHint'); };
    window.fillIceSelect = function(){ lightweightFill('iceSelect', 'iceChoiceHint'); };
  } catch(e) {}
})();
