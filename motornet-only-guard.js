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

  function normalizeUrl(resource){
    const raw = typeof resource === 'string' ? resource : (resource && resource.url) || '';
    if(!raw) return '';
    try{
      const u = new URL(raw, window.location.href);
      return u.pathname.replace(/^\/+/, '');
    }catch(e){
      return raw.split('?')[0].replace(/^\/+/, '');
    }
  }

  const originalFetch = window.fetch.bind(window);
  window.fetch = function(resource, init){
    const path = normalizeUrl(resource);
    if(BLOCKED.has(path)){
      return Promise.resolve(new Response(EMPTY_CATALOG, {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      }));
    }
    return originalFetch(resource, init);
  };
})();
