(function(){
  const CATALOG_URL = 'data/cars_motornet.json';
  const CATALOG_NAME = 'Motornet';

  const FUEL_BY_CODE = {
    E: 'elettrica', EH: 'elettrica_idrogeno', B: 'benzina', D: 'diesel',
    IB: 'ibrida_benzina', ID: 'ibrida_diesel', G: 'gpl', IG: 'ibrida_gpl',
    M: 'metano', IM: 'ibrida_metano'
  };
  const EV_FUELS = ['elettrica','elettrica_idrogeno'];
  const ICE_FUELS = ['benzina','diesel','ibrida_benzina','ibrida_diesel','gpl','ibrida_gpl','metano','ibrida_metano'];
  const FUEL_LABELS = {
    elettrica: 'Elettrica', elettrica_idrogeno: 'Elettrica a idrogeno',
    benzina: 'Benzina', diesel: 'Diesel', ibrida_benzina: 'Ibrida benzina',
    ibrida_diesel: 'Ibrida diesel', gpl: 'GPL', ibrida_gpl: 'Ibrida GPL',
    metano: 'Metano', ibrida_metano: 'Ibrida metano'
  };
  const BRAND_BY_CODE = {
    ABA:'Abarth', ALF:'Alfa Romeo', AST:'Aston Martin', AUD:'Audi', BMW:'BMW', BYD:'BYD', CAD:'Cadillac', CHE:'Chevrolet', CHC:'Chrysler', CIT:'Citroen', CUP:'Cupra', DAC:'Dacia', DOD:'Dodge', DR:'DR', DS:'DS', EVO:'EVO', FER:'Ferrari', FIA:'Fiat', FOR:'Ford', GMC:'GMC', HON:'Honda', HYU:'Hyundai', INE:'INEOS', JAG:'Jaguar', JEE:'Jeep', KIA:'Kia', LAN:'Lancia', LND:'Land Rover', LEX:'Lexus', LOT:'Lotus', MAS:'Maserati', MAZ:'Mazda', MCL:'McLaren', MER:'Mercedes-Benz', MG:'MG', MIL:'Militem', MIN:'Mini', MIT:'Mitsubishi', NIS:'Nissan', OPE:'Opel', PEU:'Peugeot', POL:'Polestar', POR:'Porsche', REN:'Renault', ROL:'Rolls-Royce', SEA:'Seat', SKO:'Skoda', SMA:'Smart', SUB:'Subaru', SUZ:'Suzuki', TES:'Tesla', TOY:'Toyota', VLK:'Volkswagen', VLV:'Volvo', VOL:'Volvo'
  };
  const KNOWN_BRANDS = Array.from(new Set(Object.values(BRAND_BY_CODE))).sort((a,b)=>b.length-a.length);

  function byId(id){ return document.getElementById(id); }
  function esc(value){ return String(value || '').replace(/"/g,'&quot;'); }
  function cleanName(value){
    let text = String(value || '').replace(/\bundefined\b/gi,'').replace(/\s+/g,' ').trim();
    [/^e\s+listini\s+del\s+nuovo\s+/i,/^listini\s+del\s+nuovo\s+/i,/^modelli\s+/i,/^modello\s+/i,/^motornet\s+/i].forEach(rx => { text = text.replace(rx,'').trim(); });
    while(text.endsWith('-')) text = text.slice(0,-1).trim();
    return text;
  }
  function uniqueSorted(values){ return [...new Set(values.filter(Boolean))].sort(); }
  function optionListLocal(values, label){ return '<option value="all">'+(label || 'Tutte')+'</option>'+values.map(v=>'<option value="'+esc(v)+'">'+(FUEL_LABELS[v] || v)+'</option>').join(''); }
  function fuelOptions(values, includeAll){ return (includeAll ? '<option value="all">Tutti</option>' : '') + values.map(v=>'<option value="'+esc(v)+'">'+(FUEL_LABELS[v] || v)+'</option>').join(''); }
  function positiveNumber(value){ const n = Number(value); return Number.isFinite(n) && n > 0 ? n : undefined; }
  function parseNumber(value){
    if(value === null || value === undefined) return undefined;
    const match = String(value).replace(/\s+/g,'').replace(',','.').match(/-?\d+(?:\.\d+)?/);
    if(!match) return undefined;
    const n = Number(match[0]);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }
  function specExact(car, wanted){
    const raw = car && car.specs_raw;
    if(!raw || typeof raw !== 'object') return undefined;
    const key = String(wanted).toLowerCase().replace(/\s+/g,' ').trim();
    for(const [k,v] of Object.entries(raw)){
      if(String(k || '').toLowerCase().replace(/\s+/g,' ').trim() === key) return v;
    }
    return undefined;
  }
  function codeFromUrl(text){
    const s = String(text || '');
    let m = s.match(/allestimento\/([A-Z0-9]{3})/i);
    if(m) return m[1].toUpperCase();
    m = s.match(/\/img\/modelli\/auto\/([A-Z0-9]{3})\//i);
    return m ? m[1].toUpperCase() : '';
  }
  function brandFromText(text){
    const s = cleanName(text).toLowerCase();
    for(const b of KNOWN_BRANDS){
      const bl = b.toLowerCase();
      if(s === bl || s.startsWith(bl + ' ') || s.includes(' ' + bl + ' ')) return b;
    }
    return '';
  }
  function normalizeBrand(car){
    const code = codeFromUrl([car.source_url, car.motornet_detail_url, car.image_source_url, car.image_local_path].join(' '));
    if(BRAND_BY_CODE[code]) return BRAND_BY_CODE[code];
    return brandFromText([car.brand, car.model, car.version, car.powertrain].join(' ')) || cleanName(car.brand) || 'Motornet';
  }
  function stripBrand(value, brand){
    let text = cleanName(value);
    const b = cleanName(brand);
    if(!text || !b) return text;
    const rx = new RegExp('^'+b.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s+', 'i');
    while(rx.test(text)) text = text.replace(rx,'').trim();
    return cleanName(text);
  }
  function normalizeFuel(car){
    const code = String(car.fuel_code || '').toUpperCase();
    if(FUEL_BY_CODE[code]) return FUEL_BY_CODE[code];
    const raw = String(car.fuel || car.fuel_original || '').toLowerCase();
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
    if(raw.includes('elettr')) return 'elettrica';
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
  function modelFromCar(car, brand){
    for(const value of [car.model, car.version, car.powertrain]){
      const model = stripBrand(value, brand);
      if(model && model.toLowerCase() !== brand.toLowerCase() && !/^e\s+listini\s+del\s+nuovo/i.test(model)) return model;
    }
    return 'Modello Motornet';
  }
  function motornetConsumptionL(car){
    const combined = parseNumber(specExact(car, 'Consumo Combinato'));
    return combined || positiveNumber(car.consumption_l_100km);
  }
  function motornetConsumptionKg(car){
    const combined = parseNumber(specExact(car, 'Consumo Gas Combinato'));
    return combined || positiveNumber(car.consumption_kg_100km);
  }
  function estimateEvConsumption(car, fuel){
    const direct = positiveNumber(car.consumption_kwh_100km);
    if(direct) return direct;
    const battery = positiveNumber(car.battery_kwh);
    const range = positiveNumber(car.range_wltp_km);
    if(battery && range) return Math.round((battery / range * 100) * 10) / 10;
    if(fuel === 'elettrica_idrogeno') return 18;
    return undefined;
  }
  function normalizeCar(car){
    const fuel = normalizeFuel(car);
    const category = fuel === 'elettrica' || fuel === 'elettrica_idrogeno' ? 'electric' : 'thermal';
    const brand = normalizeBrand(car);
    const model = modelFromCar(car, brand);
    const normalized = {
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
    if(category === 'electric'){
      const rawEv = positiveNumber(car.consumption_kwh_100km);
      normalized.consumption_kwh_100km = estimateEvConsumption(car, fuel);
      normalized.consumption_kwh_100km_estimated = false;
      if(!rawEv && !normalized.consumption_kwh_100km) delete normalized.consumption_kwh_100km;
    } else if(fuel.includes('metano')){
      const kg = motornetConsumptionKg(car);
      if(kg) normalized.consumption_kg_100km = kg;
      delete normalized.consumption_l_100km;
    } else {
      const l = motornetConsumptionL(car);
      if(l) normalized.consumption_l_100km = l;
      delete normalized.consumption_kg_100km;
    }
    return normalized;
  }
  function validCar(car){ return car && car.id && car.brand && car.model; }

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
  function addBadge(evCount, iceCount, empty){
    const old = document.getElementById('motornetCatalogBadge') || document.getElementById('autoitCatalogBadge');
    if(old) old.remove();
    const shell = document.querySelector('.app-shell');
    if(!shell) return;
    const badge = document.createElement('div');
    badge.id = 'motornetCatalogBadge';
    badge.style.cssText = 'margin:0 0 12px;padding:10px 14px;border-radius:999px;background:rgba(66,245,147,.16);border:1px solid rgba(66,245,147,.35);font-weight:800;font-size:.86rem;color:#0b3d26;display:inline-flex;gap:8px;align-items:center';
    badge.innerHTML = '<i class="fa-solid fa-database"></i> '+(empty ? 'Catalogo '+CATALOG_NAME+' vuoto · nessun fallback legacy attivo' : 'Catalogo '+CATALOG_NAME+' attivo · '+evCount+' elettriche · '+iceCount+' termiche');
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
  function patchSelectors(){
    if(window.__motornetSelectorPatched) return;
    window.__motornetSelectorPatched = true;
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
        if(byId('evChoiceHint')) byId('evChoiceHint').textContent = arr.length ? '' : 'Nessuna auto Motornet disponibile per questo filtro.';
        if(typeof setAutoFields === 'function') setAutoFields();
        if(typeof calculate === 'function') calculate();
        if(typeof updateNavigation === 'function') updateNavigation();
      };
      fillIceSelect = function(){
        const fuel = byId('iceFuelPick')?.value || 'all';
        const brand = byId('iceBrandPick')?.value || 'all';
        const current = byId('iceSelect')?.value || '';
        const arr = IC.filter(c=>(fuel === 'all' || c.fuel === fuel) && (brand === 'all' || c.brand === brand));
        if(byId('iceSelect')){
          byId('iceSelect').innerHTML = '<option value="">Seleziona modello termico</option>'+arr.map(c=>'<option value="'+esc(c.id)+'">'+esc(c.brand)+' '+esc(c.model)+' '+(c.year||'')+'</option>').join('');
          byId('iceSelect').value = arr.some(c=>c.id === current) ? current : '';
        }
        if(byId('iceChoiceHint')) byId('iceChoiceHint').textContent = arr.length ? '' : 'Nessuna auto Motornet disponibile per questo filtro.';
        if(typeof setAutoFields === 'function') setAutoFields();
        if(typeof calculate === 'function') calculate();
        if(typeof updateNavigation === 'function') updateNavigation();
      };
    } catch(e) {}
  }
  function refillControls(){
    patchSelectors();
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
  async function applyCatalog(attempt){
    attempt = attempt || 1;
    if(typeof EV === 'undefined' || typeof IC === 'undefined' || typeof IMG === 'undefined'){
      if(attempt < 20) setTimeout(()=>applyCatalog(attempt+1), 500);
      return;
    }
    patchLegacyFuelHelpers();
    let payload;
    try{
      const response = await fetch(CATALOG_URL+'?v='+Date.now());
      payload = response.ok ? await response.json() : {cars:[]};
    }catch(e){ payload = {cars:[]}; }

    const imported = (payload.cars || []).map(normalizeCar).filter(validCar);
    const autoEv = imported.filter(c=>c.category === 'electric').sort((a,b)=>(a.price_eur||0)-(b.price_eur||0));
    const autoIc = imported.filter(c=>c.category !== 'electric').sort((a,b)=>(a.price_eur||0)-(b.price_eur||0));

    // No fallback: Motornet is the only catalogue source used by the UI.
    EV = autoEv;
    IC = autoIc;
    IMG = {};
    imported.forEach(car=>{
      if(car.image_url){ IMG[car.id] = {src: car.image_url, source: car.source_site || CATALOG_NAME, license: 'Motornet'}; }
    });

    addBadge(autoEv.length, autoIc.length, imported.length === 0);
    refillControls();
  }

  window.addEventListener('load',()=>setTimeout(()=>applyCatalog(),700));
})();
