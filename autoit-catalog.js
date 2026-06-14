(function(){
  const AUTOIT_CATALOG_URL = 'data/cars_autoit.json';

  const FUEL_BY_CODE = {
    E: 'elettrica',
    EH: 'elettrica_idrogeno',
    B: 'benzina',
    D: 'diesel',
    IB: 'ibrida_benzina',
    ID: 'ibrida_diesel',
    G: 'gpl',
    IG: 'ibrida_gpl',
    M: 'metano',
    IM: 'ibrida_metano'
  };

  const FUEL_LABELS = {
    elettrica: 'Elettrica',
    elettrica_idrogeno: 'Elettrica a idrogeno',
    benzina: 'Benzina',
    diesel: 'Diesel',
    ibrida_benzina: 'Ibrida benzina',
    ibrida_diesel: 'Ibrida diesel',
    gpl: 'GPL',
    ibrida_gpl: 'Ibrida GPL',
    metano: 'Metano',
    ibrida_metano: 'Ibrida metano'
  };

  function byId(id){ return document.getElementById(id); }
  function uniqueSorted(values){ return [...new Set(values.filter(Boolean))].sort(); }
  function esc(value){ return String(value || '').replace(/"/g,'&quot;'); }
  function optionListLocal(values, label){ return '<option value="all">'+(label || 'Tutte')+'</option>'+values.map(v=>'<option value="'+esc(v)+'">'+(FUEL_LABELS[v] || v)+'</option>').join(''); }

  function cleanName(value){
    return String(value || '')
      .replace(/\bundefined\b/gi,'')
      .replace(/^Modelli\s+/i,'')
      .replace(/^Modello\s+/i,'')
      .replace(/\s+/g,' ')
      .trim();
  }

  function stripBrand(value, brand){
    let text = cleanName(value);
    const b = cleanName(brand);
    if(!text || !b) return text;
    const rx = new RegExp('^'+b.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s+', 'i');
    while(rx.test(text)) text = text.replace(rx,'').trim();
    return text;
  }

  function normalizeFuel(car){
    const code = String(car.fuel_code || '').toUpperCase();
    if(FUEL_BY_CODE[code]) return FUEL_BY_CODE[code];
    const raw = String(car.fuel || '').toLowerCase();
    if(FUEL_LABELS[raw]) return raw;
    if(raw.includes('idrogeno')) return 'elettrica_idrogeno';
    if(raw.includes('ibrida') && raw.includes('diesel')) return 'ibrida_diesel';
    if(raw.includes('ibrida') && raw.includes('gpl')) return 'ibrida_gpl';
    if(raw.includes('ibrida') && raw.includes('metano')) return 'ibrida_metano';
    if(raw.includes('ibrida') && raw.includes('benzina')) return 'ibrida_benzina';
    if(raw.includes('diesel')) return 'diesel';
    if(raw.includes('gpl')) return 'gpl';
    if(raw.includes('metano')) return 'metano';
    if(raw.includes('benzina')) return 'benzina';
    if(raw.includes('elettrica')) return 'elettrica';
    return raw || 'benzina';
  }

  function costFuel(fuel){
    const f = normalizeFuel({fuel});
    if(f.includes('diesel')) return 'diesel';
    if(f.includes('gpl')) return 'gpl';
    if(f.includes('metano')) return 'metano';
    if(f.includes('elettrica')) return 'elettrica';
    return 'benzina';
  }

  function patchLegacyFuelHelpers(){
    try { fuelLabel = function(f){ return FUEL_LABELS[normalizeFuel({fuel:f})] || f || '-'; }; } catch(e) {}
    try { fuelKey = function(f){ return costFuel(f) === 'diesel' ? 'gasolio' : costFuel(f); }; } catch(e) {}
    try { unit = function(f){ return costFuel(f) === 'metano' ? 'kg' : 'l'; }; } catch(e) {}
    try {
      baseFuelPrice = function(f){
        const k = costFuel(f);
        const sourceKey = k === 'diesel' ? 'gasolio' : k;
        const fuel = P.fuel || {};
        return fuel[sourceKey] || ({benzina:1.82,diesel:1.70,gpl:.73,metano:1.45}[k] || 1.82);
      };
    } catch(e) {}
  }

  function resolveModel(car, brand){
    const rawModel = cleanName(car.model);
    const versionModel = stripBrand(car.version, brand);
    const powertrainModel = stripBrand(car.powertrain, brand);
    const strippedModel = stripBrand(rawModel, brand);
    const b = cleanName(brand).toLowerCase();
    const m = cleanName(rawModel).toLowerCase();
    const badModel = !strippedModel || strippedModel.toLowerCase() === b || m === (b+' '+b).trim() || /undefined/i.test(rawModel);
    return badModel ? (versionModel || powertrainModel || strippedModel || 'Modello Auto.it') : strippedModel;
  }

  function normalizeCar(car){
    const fuel = normalizeFuel(car);
    const category = fuel === 'elettrica' || fuel === 'elettrica_idrogeno' ? 'electric' : 'thermal';
    const brand = cleanName(car.brand) || 'Auto.it';
    const model = resolveModel(car, brand);
    return {
      ...car,
      brand,
      model,
      category,
      fuel,
      fuel_original: car.fuel,
      fuel_cost_key: costFuel(fuel),
      powertrain: stripBrand(car.powertrain, brand) || stripBrand(car.version, brand) || FUEL_LABELS[fuel] || fuel,
      price_eur: Number(car.price_eur || car.price || 0) || 0,
      power_kw: Number(car.power_kw || 0) || undefined,
      power_cv: Number(car.power_cv || 0) || undefined,
      image_url: car.image_local_path || car.image_url || car.image_source_url || ''
    };
  }

  function validCar(car){ return car && car.id && car.brand && car.model && Number(car.price_eur || 0) > 0; }

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
      byId('iceFuelPick').innerHTML = '<option value="all">Tutti</option>'+fuels.map(f=>'<option value="'+esc(f)+'">'+(FUEL_LABELS[f] || f)+'</option>').join('');
    }
    if(typeof fillEvSelect === 'function') fillEvSelect();
    if(typeof fillIceSelect === 'function') fillIceSelect();
    if(typeof calculate === 'function') calculate();
    if(typeof updateNavigation === 'function') updateNavigation();
  }

  function setupLightbox(){
    if(document.getElementById('carImageLightbox')) return;
    const box = document.createElement('div');
    box.id = 'carImageLightbox';
    box.className = 'car-lightbox';
    box.innerHTML = '<button class="car-lightbox-close" type="button" aria-label="Chiudi">×</button><img alt="Auto selezionata"><div class="car-lightbox-caption"></div>';
    document.body.appendChild(box);
    function close(){ box.classList.remove('active'); }
    box.addEventListener('click', e=>{ if(e.target === box || e.target.classList.contains('car-lightbox-close')) close(); });
    document.addEventListener('keydown', e=>{ if(e.key === 'Escape') close(); });
    document.addEventListener('click', e=>{
      const img = e.target.closest && e.target.closest('.car-photo');
      if(!img || !img.getAttribute('src')) return;
      box.querySelector('img').src = img.getAttribute('src');
      box.querySelector('.car-lightbox-caption').textContent = img.getAttribute('alt') || '';
      box.classList.add('active');
    });
  }

  async function applyAutoItCatalog(attempt){
    attempt = attempt || 1;
    if(typeof EV === 'undefined' || typeof IC === 'undefined' || typeof IMG === 'undefined'){
      if(attempt < 20) setTimeout(()=>applyAutoItCatalog(attempt+1), 500);
      return;
    }
    patchLegacyFuelHelpers();
    setupLightbox();
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
      if(car.image_url){ IMG[car.id] = {src: car.image_url, source: car.source_site || 'auto.it / motornet.it', license: 'autorizzata'}; }
    });

    addBadge(autoEv.length || oldEvCount, autoIc.length || oldIcCount, !autoEv.length || !autoIc.length);
    refillControls();
  }

  window.addEventListener('load',()=>setTimeout(()=>applyAutoItCatalog(),700));
})();
