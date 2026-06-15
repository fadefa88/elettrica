(function(){
  const FUEL_LABELS = {
    elettrica: 'Elettrica',
    elettrica_idrogeno: 'Elettrica a idrogeno',
    benzina: 'Benzina',
    diesel: 'Diesel',
    gpl: 'GPL',
    metano: 'Metano',
    ibrida_benzina: 'Ibrida benzina',
    ibrida_diesel: 'Ibrida diesel',
    ibrida_gpl: 'Ibrida GPL',
    ibrida_metano: 'Ibrida metano'
  };
  const BRAND_BY_CODE = {
    ALN: 'Alpine',
    ALP: 'Alpine',
    BEN: 'Bentley',
    BES: 'Bestune',
    CAT: 'Caterham',
    CHA: 'Changan'
  };
  const BROKEN_BRAND_TEXT = {
    Caterham: [/^CAT\s*erham\b/i, /^CATerham\b/i],
    Changan: [/^CHA\s*ngan\b/i, /^CHAngan\b/i]
  };
  const RESIDUAL_BROKEN_BRAND_TEXT = {
    Caterham: [/^erham\b\s*/i],
    Changan: [/^ngan\b\s*/i]
  };
  let lastTimerSignature = '';

  function byId(id){ return document.getElementById(id); }
  function clean(value){ return String(value || '').replace(/\bundefined\b/gi, '').replace(/\s+/g, ' ').trim(); }
  function esc(value){ return String(value || '').replace(/"/g, '&quot;'); }
  function uniq(values){ return Array.from(new Set(values.filter(Boolean))).sort(); }
  function fuelLabel(fuel){ return FUEL_LABELS[fuel] || clean(fuel) || '-'; }
  function catalogSignature(){
    const ev = Array.isArray(EV) ? EV : [];
    const ic = Array.isArray(IC) ? IC : [];
    return [ev.length, ic.length, ev[0]?.id || '', ev[ev.length - 1]?.id || '', ic[0]?.id || '', ic[ic.length - 1]?.id || ''].join('|');
  }

  function codeFromUrl(text){
    const s = String(text || '');
    let m = s.match(/allestimento\/([A-Z0-9]{3})/i);
    if(m) return m[1].toUpperCase();
    m = s.match(/\/img\/modelli\/auto\/([A-Z0-9]{3})\//i);
    return m ? m[1].toUpperCase() : '';
  }
  function carCode(car){
    return codeFromUrl([car && car.source_url, car && car.motornet_detail_url, car && car.image_source_url, car && car.image_local_path].join(' '));
  }
  function normalizeBrokenBrandText(value, brand){
    let text = clean(value);
    const rules = BROKEN_BRAND_TEXT[brand] || [];
    rules.forEach(rx => { text = clean(text.replace(rx, brand)); });
    return text;
  }
  function stripResidualBrokenBrandText(value, brand){
    let text = clean(value);
    const rules = RESIDUAL_BROKEN_BRAND_TEXT[brand] || [];
    rules.forEach(rx => { text = clean(text.replace(rx, '')); });
    return text;
  }
  function stripLeadingBrand(value, brand){
    let text = normalizeBrokenBrandText(value, brand);
    const b = clean(brand);
    if(!text || !b) return text;
    const escaped = b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp('^' + escaped + '\\s+', 'i');
    while(rx.test(text)) text = clean(text.replace(rx, ''));
    text = stripResidualBrokenBrandText(text, brand);
    return text;
  }
  function fixCar(car){
    if(!car) return;
    const code = carCode(car);
    const rawBrand = clean(car.brand).toUpperCase();
    const normalizedBrand = BRAND_BY_CODE[code] || BRAND_BY_CODE[rawBrand];
    if(normalizedBrand){
      car.brand = normalizedBrand;
      const model = stripLeadingBrand(car.model || car.version || car.powertrain, normalizedBrand);
      const version = stripLeadingBrand(car.version || car.model, normalizedBrand);
      const powertrain = stripLeadingBrand(car.powertrain || car.version || car.model, normalizedBrand);
      car.model = model || normalizedBrand;
      car.version = version || car.model;
      car.powertrain = powertrain || car.model;
    }
  }
  function optionLabel(car){
    const model = clean(car && car.model);
    const brand = clean(car && car.brand);
    if(model.toLowerCase() === brand.toLowerCase()) return brand;
    if(model.toLowerCase().startsWith(brand.toLowerCase() + ' ')) return model;
    return clean(brand + ' ' + model);
  }

  function selectedCar(selectId, list){
    const id = byId(selectId) ? byId(selectId).value : '';
    if(!id || !Array.isArray(list)) return null;
    return list.find(c => c.id === id) || null;
  }
  function availableFuels(list, brandSelectId, modelSelectId){
    if(!Array.isArray(list)) return [];
    const selected = selectedCar(modelSelectId, list);
    if(selected && selected.fuel) return [selected.fuel];

    const brand = byId(brandSelectId) ? byId(brandSelectId).value : 'all';
    const scoped = brand && brand !== 'all' ? list.filter(c => c.brand === brand) : list;
    return uniq(scoped.map(c => c.fuel));
  }
  function refillFuelOptions(cfg){
    const fuelPick = byId(cfg.fuelSelectId);
    if(!fuelPick || !Array.isArray(cfg.list)) return 'all';

    const selected = selectedCar(cfg.modelSelectId, cfg.list);
    const current = fuelPick.value || cfg.defaultFuel || 'all';
    const fuels = availableFuels(cfg.list, cfg.brandSelectId, cfg.modelSelectId);
    const forcedSingle = selected || fuels.length === 1 || cfg.noAll;

    let nextValue = current;
    if(forcedSingle){
      nextValue = fuels.includes(current) ? current : (fuels[0] || cfg.defaultFuel || 'all');
      fuelPick.innerHTML = fuels.map(f => '<option value="'+esc(f)+'">'+fuelLabel(f)+'</option>').join('');
    }else{
      fuelPick.innerHTML = '<option value="all">Tutti</option>' + fuels.map(f => '<option value="'+esc(f)+'">'+fuelLabel(f)+'</option>').join('');
      if(!fuels.includes(nextValue)) nextValue = 'all';
    }

    fuelPick.value = nextValue;
    fuelPick.disabled = forcedSingle && fuels.length === 1 && !byId(cfg.manualModeId)?.checked;
    return nextValue;
  }
  function refillBrandOptions(cfg){
    const brandPick = byId(cfg.brandSelectId);
    if(!brandPick || !Array.isArray(cfg.list)) return;
    const current = brandPick.value || 'all';
    const fuel = byId(cfg.fuelSelectId) ? byId(cfg.fuelSelectId).value : 'all';
    const fuelScoped = fuel && fuel !== 'all' ? cfg.list.filter(c => c.fuel === fuel) : cfg.list;
    const brands = uniq(fuelScoped.map(c => c.brand));
    brandPick.innerHTML = '<option value="all">Tutte</option>' + brands.map(b => '<option value="'+esc(b)+'">'+b+'</option>').join('');
    brandPick.value = brands.includes(current) ? current : 'all';
  }
  function refillModelOptions(cfg){
    const modelPick = byId(cfg.modelSelectId);
    if(!modelPick || !Array.isArray(cfg.list)) return;

    const current = modelPick.value || '';
    const brand = byId(cfg.brandSelectId) ? byId(cfg.brandSelectId).value : 'all';
    const fuel = byId(cfg.fuelSelectId) ? byId(cfg.fuelSelectId).value : 'all';

    const list = cfg.list.filter(c => {
      const brandOk = brand === 'all' || c.brand === brand;
      const fuelOk = fuel === 'all' || c.fuel === fuel;
      return brandOk && fuelOk;
    });

    modelPick.innerHTML = '<option value="">'+cfg.modelPlaceholder+'</option>' + list.map(c => '<option value="'+esc(c.id)+'">'+optionLabel(c)+' '+(c.year || '')+'</option>').join('');
    modelPick.value = list.some(c => c.id === current) ? current : '';
  }

  function fixAllCars(){
    try{
      if(Array.isArray(EV)) EV.forEach(fixCar);
      if(Array.isArray(IC)) IC.forEach(fixCar);
    }catch(e){ return false; }
    return true;
  }
  function refreshEvFilters(origin){
    try{
      if(!Array.isArray(EV)) return;
      const cfg = {
        list: EV,
        fuelSelectId: 'evFuelPick',
        brandSelectId: 'evBrandPick',
        modelSelectId: 'evSelect',
        manualModeId: 'manualEvMode',
        modelPlaceholder: 'Seleziona modello elettrico',
        defaultFuel: 'elettrica',
        noAll: false
      };
      if(origin === 'evBrand'){
        if(byId('evSelect')) byId('evSelect').value = '';
      }
      refillFuelOptions(cfg);
      refillBrandOptions(cfg);
      refillModelOptions(cfg);
      refillFuelOptions(cfg);
    }catch(e){}
  }
  function refreshIceFilters(origin){
    try{
      if(!Array.isArray(IC)) return;
      const cfg = {
        list: IC,
        fuelSelectId: 'iceFuelPick',
        brandSelectId: 'iceBrandPick',
        modelSelectId: 'iceSelect',
        manualModeId: 'manualIceMode',
        modelPlaceholder: 'Seleziona modello termico',
        defaultFuel: 'all',
        noAll: false
      };
      if(origin === 'iceBrand'){
        if(byId('iceSelect')) byId('iceSelect').value = '';
      }
      refillFuelOptions(cfg);
      refillBrandOptions(cfg);
      refillModelOptions(cfg);
      refillFuelOptions(cfg);
    }catch(e){}
  }
  function refreshDependentFilters(origin){
    if(!fixAllCars()) return;
    const signature = catalogSignature();
    if(origin === 'timer' && signature === lastTimerSignature) return;
    if(origin === 'timer') lastTimerSignature = signature;
    refreshEvFilters(origin);
    refreshIceFilters(origin);

    try{
      if(typeof setAutoFields === 'function') setAutoFields();
      if(typeof calculate === 'function') calculate();
      if(typeof updateNavigation === 'function') updateNavigation();
    }catch(e){}
  }
  function wireOne(id, origin){
    const el = byId(id);
    if(!el || el.dataset.dependentFuelWired) return;
    el.dataset.dependentFuelWired = '1';
    el.addEventListener('change', function(){ refreshDependentFilters(origin); });
    el.addEventListener('input', function(){ refreshDependentFilters(origin); });
  }
  function wire(){
    wireOne('evFuelPick', 'evFuel');
    wireOne('evBrandPick', 'evBrand');
    wireOne('evSelect', 'evModel');
    wireOne('iceFuelPick', 'iceFuel');
    wireOne('iceBrandPick', 'iceBrand');
    wireOne('iceSelect', 'iceModel');
  }

  window.addEventListener('load', function(){
    let n = 0;
    const timer = setInterval(function(){
      wire();
      refreshDependentFilters('timer');
      n += 1;
      if(n >= 20) clearInterval(timer);
    }, 500);
  });
})();
