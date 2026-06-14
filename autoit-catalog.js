(function(){
  const AUTOIT_CATALOG_URL = 'data/cars_autoit.json';

  function byId(id){ return document.getElementById(id); }
  function uniqueSorted(values){ return [...new Set(values.filter(Boolean))].sort(); }
  function optionListLocal(values, label){
    return '<option value="all">'+(label || 'Tutte')+'</option>'+values.map(v=>'<option value="'+String(v).replace(/"/g,'&quot;')+'">'+v+'</option>').join('');
  }
  function normalizeFuel(fuel){
    const f = String(fuel || '').toLowerCase();
    if(f === 'ib' || f.includes('ibrida_benzina')) return 'benzina';
    if(f === 'id' || f.includes('ibrida_diesel')) return 'diesel';
    if(f === 'ig' || f.includes('ibrida_gpl')) return 'gpl';
    if(f === 'im' || f.includes('ibrida_metano')) return 'metano';
    if(f === 'd' || f.includes('diesel')) return 'diesel';
    if(f === 'g' || f.includes('gpl')) return 'gpl';
    if(f === 'm' || f.includes('metano')) return 'metano';
    if(f === 'b' || f.includes('benzina')) return 'benzina';
    if(f === 'e' || f.includes('elettrica')) return 'elettrica';
    return f || 'benzina';
  }
  function cleanName(value){
    return String(value || '').replace(/\bundefined\b/gi,'').replace(/^Modelli\s+/i,'').replace(/\s+/g,' ').trim();
  }
  function normalizeCar(car){
    const rawFuel = car.fuel || car.fuel_code || '';
    const category = car.category === 'electric' || normalizeFuel(rawFuel) === 'elettrica' ? 'electric' : 'thermal';
    const brand = cleanName(car.brand) || 'Auto.it';
    let model = cleanName(car.model) || cleanName(car.version) || cleanName(car.powertrain) || 'Modello Auto.it';
    if(model.toLowerCase().startsWith(brand.toLowerCase()+' ')) model = model.slice(brand.length).trim();
    if(!model) model = cleanName(car.version) || 'Modello Auto.it';
    const fuel = category === 'electric' ? 'elettrica' : normalizeFuel(rawFuel);
    return {
      ...car,
      brand,
      model,
      category,
      fuel,
      fuel_original: car.fuel,
      powertrain: cleanName(car.powertrain) || cleanName(car.version) || car.fuel || fuel,
      price_eur: Number(car.price_eur || car.price || 0) || 0,
      power_kw: Number(car.power_kw || 0) || undefined,
      power_cv: Number(car.power_cv || 0) || undefined,
      image_url: car.image_local_path || car.image_url || car.image_source_url || ''
    };
  }
  function validCar(car){
    return car && car.id && car.brand && car.model && Number(car.price_eur || 0) > 0;
  }
  function addBadge(evCount, iceCount, partial){
    if(document.getElementById('autoitCatalogBadge')) return;
    const shell = document.querySelector('.app-shell');
    if(!shell) return;
    const badge = document.createElement('div');
    badge.id = 'autoitCatalogBadge';
    badge.style.cssText = 'margin:0 0 12px;padding:10px 14px;border-radius:999px;background:rgba(66,245,147,.16);border:1px solid rgba(66,245,147,.35);font-weight:800;font-size:.86rem;color:#0b3d26;display:inline-flex;gap:8px;align-items:center';
    badge.innerHTML = '<i class="fa-solid fa-database"></i> Catalogo Auto.it attivo · '+evCount+' elettriche · '+iceCount+' termiche'+(partial?' · fallback dove manca Auto.it':'');
    shell.prepend(badge);
  }
  function refillControls(){
    if(byId('evBrandPick') && typeof EV !== 'undefined') byId('evBrandPick').innerHTML = optionListLocal(uniqueSorted(EV.map(c=>c.brand)), 'Tutte');
    if(byId('iceBrandPick') && typeof IC !== 'undefined') byId('iceBrandPick').innerHTML = optionListLocal(uniqueSorted(IC.map(c=>c.brand)), 'Tutte');
    if(byId('iceFuelPick') && typeof IC !== 'undefined'){
      const fuels = uniqueSorted(IC.map(c=>c.fuel));
      byId('iceFuelPick').innerHTML = '<option value="all">Tutti</option>'+fuels.map(f=>'<option value="'+f+'">'+(typeof fuelLabel === 'function' ? fuelLabel(f) : f)+'</option>').join('');
    }
    if(typeof fillEvSelect === 'function') fillEvSelect();
    if(typeof fillIceSelect === 'function') fillIceSelect();
    if(typeof calculate === 'function') calculate();
    if(typeof updateNavigation === 'function') updateNavigation();
  }
  async function applyAutoItCatalog(attempt){
    attempt = attempt || 1;
    if(typeof EV === 'undefined' || typeof IC === 'undefined' || typeof IMG === 'undefined'){
      if(attempt < 20) setTimeout(()=>applyAutoItCatalog(attempt+1), 500);
      return;
    }
    let payload;
    try{
      const response = await fetch(AUTOIT_CATALOG_URL+'?v='+Date.now());
      if(!response.ok) return;
      payload = await response.json();
    }catch(e){ return; }

    const imported = (payload.cars || []).map(normalizeCar).filter(validCar);
    if(!imported.length) return;

    const autoEv = imported.filter(c=>c.category === 'electric').sort((a,b)=>a.price_eur-b.price_eur);
    const autoIc = imported.filter(c=>c.category !== 'electric').sort((a,b)=>a.price_eur-b.price_eur);

    const oldEvCount = EV.length;
    const oldIcCount = IC.length;
    if(autoEv.length) EV = autoEv;
    if(autoIc.length) IC = autoIc;

    imported.forEach(car=>{
      if(car.image_url){
        IMG[car.id] = {src: car.image_url, source: car.source_site || 'auto.it / motornet.it', license: 'autorizzata'};
      }
    });

    addBadge(autoEv.length || oldEvCount, autoIc.length || oldIcCount, !autoEv.length || !autoIc.length);
    refillControls();
  }

  window.addEventListener('load',()=>setTimeout(()=>applyAutoItCatalog(),700));
})();
