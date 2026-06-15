(function(){
  const FUEL_LABELS = {
    benzina: 'Benzina',
    diesel: 'Diesel',
    gpl: 'GPL',
    metano: 'Metano',
    ibrida_benzina: 'Ibrida benzina',
    ibrida_diesel: 'Ibrida diesel',
    ibrida_gpl: 'Ibrida GPL',
    ibrida_metano: 'Ibrida metano'
  };

  function byId(id){ return document.getElementById(id); }
  function clean(value){ return String(value || '').replace(/\bundefined\b/gi, '').replace(/\s+/g, ' ').trim(); }
  function esc(value){ return String(value || '').replace(/"/g, '&quot;'); }
  function uniq(values){ return Array.from(new Set(values.filter(Boolean))).sort(); }
  function fuelLabel(fuel){ return FUEL_LABELS[fuel] || clean(fuel) || '-'; }

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
  function stripLeadingBrand(value, brand){
    let text = clean(value);
    const b = clean(brand);
    if(!text || !b) return text;
    const escaped = b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp('^' + escaped + '\\s+', 'i');
    while(rx.test(text)) text = clean(text.replace(rx, ''));
    return text;
  }
  function fixCar(car){
    if(!car) return;
    const code = carCode(car);
    const rawBrand = clean(car.brand).toUpperCase();
    if(code === 'ALN' || code === 'ALP' || rawBrand === 'ALN' || rawBrand === 'ALP'){
      car.brand = 'Alpine';
      car.model = stripLeadingBrand(car.model || car.version || car.powertrain, 'Alpine') || 'Modello';
      car.version = stripLeadingBrand(car.version || car.model, 'Alpine') || car.model;
      car.powertrain = stripLeadingBrand(car.powertrain || car.version || car.model, 'Alpine') || car.model;
    }
  }
  function optionLabel(car){
    const model = clean(car && car.model);
    const brand = clean(car && car.brand);
    if(model.toLowerCase().startsWith(brand.toLowerCase() + ' ')) return model;
    return clean(brand + ' ' + model);
  }
  function selectedIceCar(){
    const id = byId('iceSelect') ? byId('iceSelect').value : '';
    if(!id || !Array.isArray(IC)) return null;
    return IC.find(c => c.id === id) || null;
  }
  function availableFuelsForCurrentSelection(){
    if(!Array.isArray(IC)) return [];
    const selected = selectedIceCar();
    if(selected && selected.fuel) return [selected.fuel];

    const brand = byId('iceBrandPick') ? byId('iceBrandPick').value : 'all';
    const list = brand && brand !== 'all' ? IC.filter(c => c.brand === brand) : IC;
    return uniq(list.map(c => c.fuel));
  }
  function refillFuelOptions(){
    const fuelPick = byId('iceFuelPick');
    if(!fuelPick || !Array.isArray(IC)) return 'all';

    const selected = selectedIceCar();
    const current = fuelPick.value || 'all';
    const fuels = availableFuelsForCurrentSelection();
    const forcedSingle = selected || fuels.length === 1;

    let nextValue = current;
    if(forcedSingle){
      nextValue = fuels[0] || 'all';
      fuelPick.innerHTML = fuels.map(f => '<option value="'+esc(f)+'">'+fuelLabel(f)+'</option>').join('');
    }else{
      fuelPick.innerHTML = '<option value="all">Tutti</option>' + fuels.map(f => '<option value="'+esc(f)+'">'+fuelLabel(f)+'</option>').join('');
      if(!fuels.includes(nextValue)) nextValue = 'all';
    }

    fuelPick.value = nextValue;
    fuelPick.disabled = forcedSingle && fuels.length === 1 && !byId('manualIceMode')?.checked;
    return nextValue;
  }
  function refillBrandOptions(){
    const iceBrand = byId('iceBrandPick');
    if(!iceBrand || !Array.isArray(IC)) return;
    const current = iceBrand.value || 'all';
    const brands = uniq(IC.map(c => c.brand));
    iceBrand.innerHTML = '<option value="all">Tutte</option>' + brands.map(b => '<option value="'+esc(b)+'">'+b+'</option>').join('');
    iceBrand.value = brands.includes(current) ? current : 'all';
  }
  function refillModelOptions(){
    const iceSelect = byId('iceSelect');
    if(!iceSelect || !Array.isArray(IC)) return;

    const current = iceSelect.value || '';
    const selected = selectedIceCar();
    const brand = byId('iceBrandPick') ? byId('iceBrandPick').value : 'all';
    const fuel = byId('iceFuelPick') ? byId('iceFuelPick').value : 'all';

    const list = IC.filter(c => {
      const brandOk = brand === 'all' || c.brand === brand;
      const fuelOk = selected ? true : (fuel === 'all' || c.fuel === fuel);
      return brandOk && fuelOk;
    });

    iceSelect.innerHTML = '<option value="">Seleziona modello termico</option>' + list.map(c => '<option value="'+esc(c.id)+'">'+optionLabel(c)+' '+(c.year || '')+'</option>').join('');
    iceSelect.value = list.some(c => c.id === current) ? current : '';
  }
  function refreshDependentFilters(origin){
    try{
      if(Array.isArray(EV)) EV.forEach(fixCar);
      if(Array.isArray(IC)) IC.forEach(fixCar);
    }catch(e){ return; }

    try{
      refillBrandOptions();
      if(origin === 'brand'){
        if(byId('iceSelect')) byId('iceSelect').value = '';
      }
      refillFuelOptions();
      refillModelOptions();
      refillFuelOptions();

      if(typeof setAutoFields === 'function') setAutoFields();
      if(typeof calculate === 'function') calculate();
      if(typeof updateNavigation === 'function') updateNavigation();
    }catch(e){}
  }
  function wire(){
    const fuelPick = byId('iceFuelPick');
    const brandPick = byId('iceBrandPick');
    const modelPick = byId('iceSelect');
    if(fuelPick && !fuelPick.dataset.dependentFuelWired){
      fuelPick.dataset.dependentFuelWired = '1';
      fuelPick.addEventListener('change', function(){ refreshDependentFilters('fuel'); });
      fuelPick.addEventListener('input', function(){ refreshDependentFilters('fuel'); });
    }
    if(brandPick && !brandPick.dataset.dependentFuelWired){
      brandPick.dataset.dependentFuelWired = '1';
      brandPick.addEventListener('change', function(){ refreshDependentFilters('brand'); });
      brandPick.addEventListener('input', function(){ refreshDependentFilters('brand'); });
    }
    if(modelPick && !modelPick.dataset.dependentFuelWired){
      modelPick.dataset.dependentFuelWired = '1';
      modelPick.addEventListener('change', function(){ refreshDependentFilters('model'); });
      modelPick.addEventListener('input', function(){ refreshDependentFilters('model'); });
    }
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
