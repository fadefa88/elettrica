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

  const EV_FUELS = ['elettrica','elettrica_idrogeno'];
  const ICE_FUELS = ['benzina','diesel','ibrida_benzina','ibrida_diesel','gpl','ibrida_gpl','metano','ibrida_metano'];

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
  function fuelOptions(values, includeAll){ return (includeAll ? '<option value="all">Tutti</option>' : '') + values.map(v=>'<option value="'+esc(v)+'">'+(FUEL_LABELS[v] || v)+'</option>').join(''); }

  function injectAutoItStyles(){
    if(document.getElementById('autoitInjectedStyles')) return;
    const style = document.createElement('style');
    style.id = 'autoitInjectedStyles';
    style.textContent = '#evVisual{max-width:860px}.car-photo{cursor:zoom-in}.car-art.has-photo,.mini-photo.has-photo{cursor:zoom-in}.car-visual{width:100%;max-width:100%;grid-template-columns:minmax(0,190px) minmax(0,1fr);overflow:hidden}.car-visual>div{min-width:0}.car-visual b,.car-visual span,.car-visual em{overflow-wrap:anywhere;word-break:normal}.car-art.has-photo,.mini-photo.has-photo{background:#eef4f0}.car-lightbox{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.78);display:none;align-items:center;justify-content:center;padding:28px}.car-lightbox.active{display:flex}.car-lightbox img{max-width:min(1120px,94vw);max-height:82vh;border-radius:24px;background:#fff;box-shadow:0 30px 90px rgba(0,0,0,.45);object-fit:contain}.car-lightbox-close{position:absolute;top:22px;right:22px;width:48px;height:48px;padding:0;border-radius:999px;background:#fff;color:#07110e;font-size:32px;line-height:1}.car-lightbox-caption{position:absolute;left:50%;bottom:24px;transform:translateX(-50%);max-width:90vw;padding:10px 16px;border-radius:999px;background:rgba(255,255,255,.92);font-weight:900;color:#07110e;text-align:center}@media(max-width:760px){.car-visual{grid-template-columns:1fr}.car-lightbox{padding:16px}.car-lightbox img{max-width:96vw;max-height:78vh;border-radius:18px}.car-lightbox-close{top:14px;right:14px}}';
    document.head.appendChild(style);
  }

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

  function positiveNumber(value){
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }

  function estimateEvConsumption(car, fuel){
    const direct = positiveNumber(car.consumption_kwh_100km);
    if(direct) return direct;

    const battery = positiveNumber(car.battery_kwh);
    const range = positiveNumber(car.range_wltp_km);
    if(battery && range) return Math.round((battery / range * 100) * 10) / 10;

    const price = positiveNumber(car.price_eur) || 0;
    const text = (String(car.brand || '')+' '+String(car.model || '')+' '+String(car.version || '')+' '+String(car.powertrain || '')).toLowerCase();

    if(fuel === 'elettrica_idrogeno') return 18;
    if(text.includes('suv') || text.includes('maybach') || text.includes('spectre') || (battery && battery >= 95) || price >= 100000) return 22;
    if((battery && battery >= 75) || price >= 65000) return 19.5;
    if(price && price <= 30000) return 15.5;
    return 17.5;
  }

  function normalizeCar(car){
    const fuel = normalizeFuel(car);
    const category = fuel === 'elettrica' || fuel === 'elettrica_idrogeno' ? 'electric' : 'thermal';
    const brand = cleanName(car.brand) || 'Auto.it';
    const model = resolveModel(car, brand);
    const evConsumption = category === 'electric' ? estimateEvConsumption(car, fuel) : positiveNumber(car.consumption_kwh_100km);
    const rawEvConsumption = positiveNumber(car.consumption_kwh_100km);
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
      consumption_kwh_100km: evConsumption,
      consumption_kwh_100km_estimated: category === 'electric' && !rawEvConsumption,
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

  function ensureEvFuelControl(){
    if(byId('evFuelPick')) return;
    const brand = byId('evBrandPick');
    if(!brand) return;
    const label = document.createElement('label');
    label.innerHTML = 'Alimentazione<select id="evFuelPick">'+fuelOptions(EV_FUELS, false)+'</select>';
    const brandLabel = brand.closest('label');
    if(brandLabel && brandLabel.parentNode) brandLabel.parentNode.insertBefore(label, brandLabel);
    else brand.parentNode?.insertBefore(label, brand);
    byId('evFuelPick').value = 'elettrica';
    byId('evFuelPick').addEventListener('change', ()=>{ fillEvBrands(); if(typeof fillEvSelect === 'function') fillEvSelect(); });
  }

  function fillEvBrands(){
    ensureEvFuelControl();
    const pick = byId('evBrandPick');
    if(!pick || typeof EV === 'undefined') return;
    const current = pick.value || 'all';
    const fuel = byId('evFuelPick')?.value || 'elettrica';
    const brands = uniqueSorted(EV.filter(c=>c.fuel === fuel).map(c=>c.brand));
    pick.innerHTML = optionListLocal(brands, 'Tutte');
    pick.value = brands.includes(current) ? current : 'all';
  }

  function patchEvSelector(){
    if(window.__autoitEvSelectorPatched) return;
    window.__autoitEvSelectorPatched = true;
    const originalToggle = typeof toggleManualEv === 'function' ? toggleManualEv : null;

    try {
      fillEvSelect = function(){
        ensureEvFuelControl();
        const fuel = byId('evFuelPick')?.value || 'elettrica';
        const brand = byId('evBrandPick')?.value || 'all';
        const current = byId('evSelect')?.value || '';
        const arr = EV.filter(c=>(c.fuel === fuel) && (brand === 'all' || c.brand === brand));
        if(byId('evSelect')){
          byId('evSelect').innerHTML = '<option value="">Seleziona modello '+(FUEL_LABELS[fuel] || 'elettrico')+'</option>'+arr.map(c=>'<option value="'+esc(c.id)+'">'+esc(c.brand)+' '+esc(c.model)+'</option>').join('');
          byId('evSelect').value = arr.some(c=>c.id === current) ? current : '';
        }
        if(byId('evChoiceHint')) byId('evChoiceHint').textContent = '';
        if(typeof setAutoFields === 'function') setAutoFields();
        if(typeof calculate === 'function') calculate();
        if(typeof updateNavigation === 'function') updateNavigation();
      };
    } catch(e) {}

    try {
      toggleManualEv = function(){
        if(originalToggle) originalToggle();
        const on = byId('manualEvMode')?.checked;
        if(byId('evFuelPick')) byId('evFuelPick').disabled = !!on;
      };
    } catch(e) {}
  }

  function refillControls(){
    patchEvSelector();
    fillEvBrands();
    if(byId('iceBrandPick') && typeof IC !== 'undefined') byId('iceBrandPick').innerHTML = optionListLocal(uniqueSorted(IC.map(c=>c.brand)), 'Tutte');
    if(byId('iceFuelPick')){
      const current = byId('iceFuelPick').value || 'all';
      byId('iceFuelPick').innerHTML = fuelOptions(ICE_FUELS, true);
      byId('iceFuelPick').value = current === 'all' || ICE_FUELS.includes(current) ? current : 'all';
    }
    if(typeof fillEvSelect === 'function') fillEvSelect();
    if(typeof fillIceSelect === 'function') fillIceSelect();
    if(typeof calculate === 'function') calculate();
    if(typeof updateNavigation === 'function') updateNavigation();
  }

  function setupLightbox(){
    if(document.getElementById('carImageLightbox')) return;
    injectAutoItStyles();
    const box = document.createElement('div');
    box.id = 'carImageLightbox';
    box.className = 'car-lightbox';
    box.innerHTML = '<button class="car-lightbox-close" type="button" aria-label="Chiudi">×</button><img alt="Auto selezionata"><div class="car-lightbox-caption"></div>';
    document.body.appendChild(box);
    function close(){ box.classList.remove('active'); }
    box.addEventListener('click', e=>{ if(e.target === box || e.target.classList.contains('car-lightbox-close')) close(); });
    document.addEventListener('keydown', e=>{ if(e.key === 'Escape') close(); });
    document.addEventListener('click', e=>{
      const target = e.target.closest && e.target.closest('.car-photo,.car-art.has-photo,.mini-photo.has-photo');
      if(!target) return;
      const img = target.matches && target.matches('img.car-photo') ? target : target.querySelector('img.car-photo');
      if(!img || !img.getAttribute('src')) return;
      e.preventDefault();
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