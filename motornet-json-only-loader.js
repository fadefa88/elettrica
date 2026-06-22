(function(){
  const CATALOG_URL = 'data/cars_motornet.json';
  const CATALOG_NAME = 'Motornet';
  let applied = false;

  function byId(id){ return document.getElementById(id); }
  function clean(value){ return String(value === null || value === undefined ? '' : value).replace(/\s+/g, ' ').trim(); }
  function esc(value){
    return clean(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function uniqueSorted(values){
    return Array.from(new Set(values.map(clean).filter(Boolean))).sort(function(a,b){ return a.localeCompare(b, 'it'); });
  }
  function optionList(values, label){
    return '<option value="all">'+esc(label || 'Tutte')+'</option>' + values.map(function(v){
      return '<option value="'+esc(v)+'">'+esc(v)+'</option>';
    }).join('');
  }
  function validCar(car){
    return car && typeof car === 'object' && clean(car.id) && clean(car.brand) && clean(car.model);
  }
  function cloneJsonCar(car){
    // Deliberately keep values from data/cars_motornet.json only.
    // No brand maps, no URL/code inference, no derived model names, no generated specs.
    return Object.assign({}, car);
  }
  function imageFromJson(car){
    return clean(car.image_url || car.image_local_path || car.image_source_url);
  }
  function refreshBasicSelects(){
    const evBrand = byId('evBrandPick');
    const iceBrand = byId('iceBrandPick');
    if(evBrand && Array.isArray(EV)){
      const current = evBrand.value || 'all';
      const brands = uniqueSorted(EV.map(function(car){ return car.brand; }));
      evBrand.innerHTML = optionList(brands, 'Tutte');
      evBrand.value = brands.includes(current) ? current : 'all';
    }
    if(iceBrand && Array.isArray(IC)){
      const current = iceBrand.value || 'all';
      const brands = uniqueSorted(IC.map(function(car){ return car.brand; }));
      iceBrand.innerHTML = optionList(brands, 'Tutte');
      iceBrand.value = brands.includes(current) ? current : 'all';
    }
  }
  function refreshUi(){
    refreshBasicSelects();
    try { if(typeof fillEvSelect === 'function') fillEvSelect(); } catch(e) {}
    try { if(typeof fillIceSelect === 'function') fillIceSelect(); } catch(e) {}
    try { if(typeof setAutoFields === 'function') setAutoFields(); } catch(e) {}
    try { if(typeof calculate === 'function') calculate(); } catch(e) {}
    try { if(typeof updateNavigation === 'function') updateNavigation(); } catch(e) {}
  }
  async function applyJsonOnly(){
    if(applied) return;
    applied = true;
    let payload = {cars: []};
    try{
      const response = await fetch(CATALOG_URL + '?v=' + Date.now(), {cache: 'no-store'});
      if(response.ok) payload = await response.json();
    }catch(e){
      console.error('[motornet-json-only-loader] unable to load catalog', e);
      payload = {cars: []};
    }

    const imported = (payload.cars || []).filter(validCar).map(cloneJsonCar);
    const ev = imported.filter(function(car){ return clean(car.category) === 'electric'; });
    const ice = imported.filter(function(car){ return clean(car.category) !== 'electric'; });

    try { EV = ev; } catch(e) { window.EV = ev; }
    try { IC = ice; } catch(e) { window.IC = ice; }
    try { IMG = {}; } catch(e) { window.IMG = {}; }

    imported.forEach(function(car){
      const src = imageFromJson(car);
      if(!src) return;
      try { IMG[car.id] = {src: src, source: car.source_site || CATALOG_NAME, license: 'Motornet'}; }
      catch(e) { window.IMG = window.IMG || {}; window.IMG[car.id] = {src: src, source: car.source_site || CATALOG_NAME, license: 'Motornet'}; }
    });

    window.__motornetJsonOnlyApplied = true;
    window.__motornetJsonOnlyCounts = {total: imported.length, electric: ev.length, thermal: ice.length};
    console.log('[motornet-json-only-loader] applied', window.__motornetJsonOnlyCounts);
    refreshUi();
    setTimeout(refreshUi, 250);
    setTimeout(refreshUi, 1000);
  }

  window.__motornetApplyJsonOnly = applyJsonOnly;
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){ setTimeout(applyJsonOnly, 0); });
  else setTimeout(applyJsonOnly, 0);
  window.addEventListener('load', function(){ setTimeout(applyJsonOnly, 0); });
})();
