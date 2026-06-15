(function(){
  function byId(id){ return document.getElementById(id); }
  function clean(value){ return String(value || '').replace(/\bundefined\b/gi, '').replace(/\s+/g, ' ').trim(); }
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
  function refill(){
    try{
      if(Array.isArray(EV)) EV.forEach(fixCar);
      if(Array.isArray(IC)) IC.forEach(fixCar);
    }catch(e){ return; }

    try{
      const iceBrand = byId('iceBrandPick');
      if(iceBrand && Array.isArray(IC)){
        const current = iceBrand.value || 'all';
        const brands = Array.from(new Set(IC.map(c => c.brand).filter(Boolean))).sort();
        iceBrand.innerHTML = '<option value="all">Tutte</option>' + brands.map(b => '<option value="'+String(b).replace(/"/g,'&quot;')+'">'+b+'</option>').join('');
        iceBrand.value = brands.includes(current) ? current : 'all';
      }
      const fuel = byId('iceFuelPick') ? byId('iceFuelPick').value : 'all';
      const brand = byId('iceBrandPick') ? byId('iceBrandPick').value : 'all';
      const current = byId('iceSelect') ? byId('iceSelect').value : '';
      const list = Array.isArray(IC) ? IC.filter(c => (fuel === 'all' || c.fuel === fuel) && (brand === 'all' || c.brand === brand)) : [];
      if(byId('iceSelect')){
        byId('iceSelect').innerHTML = '<option value="">Seleziona modello termico</option>' + list.map(c => '<option value="'+String(c.id).replace(/"/g,'&quot;')+'">'+optionLabel(c)+' '+(c.year || '')+'</option>').join('');
        byId('iceSelect').value = list.some(c => c.id === current) ? current : '';
      }
      if(typeof setAutoFields === 'function') setAutoFields();
      if(typeof calculate === 'function') calculate();
      if(typeof updateNavigation === 'function') updateNavigation();
    }catch(e){}
  }
  window.addEventListener('load', function(){
    let n = 0;
    const timer = setInterval(function(){
      refill();
      n += 1;
      if(n >= 20) clearInterval(timer);
    }, 500);
  });
})();
