(function(){
  const codeMap = JSON.parse(atob('eyJERU4iOiJEZW56YSIsIkNPUiI6IkNvcnZldHRlIiwiREZTIjoiREZTSyIsIkRPRyI6IkRvbmdmZW5nIiwiRlRIIjoiRm9ydGhpbmciLCJHUlciOiJHcmVhdCBXYWxsIiwiR0VOIjoiR2VuZXNpcyIsIkdFRSI6IkdlZWx5IiwiRk9UIjoiRm90b24iLCJHVlQiOiJHaW90dGkgVmljdG9yaWEiLCJJQ0giOiJJQ0gtWCIsIklTVSI6IklzdXp1IiwiSkFFIjoiSmFlY29vIiwiTEFNIjoiTGFtYm9yZ2hpbmkifQ=='));
  const fragmentMap = JSON.parse(atob('eyJEZW56YSI6WyJERU4gemEiLCJERU56YSIsInphIl0sIkNvcnZldHRlIjpbIkNPUiB2ZXR0ZSIsIkNPUnZldHRlIiwidmV0dGUiXSwiREZTSyI6WyJERlMgSyIsIkRGU0siLCJLIl0sIkRvbmdmZW5nIjpbIkRPRyBEb25nZmVuZyIsIkRPR0RvbmdmZW5nIl0sIkZvcnRoaW5nIjpbIkZUSCBGb3J0aGluZyIsIkZUSEZvcnRoaW5nIl0sIkdyZWF0IFdhbGwiOlsiR1JXIEdyZWF0IFdhbGwiLCJHUldHcmVhdCBXYWxsIiwiR1JXR3JlYXRXYWxsIl0sIkdlbmVzaXMiOlsiR0VOIGVzaXMiLCJHRU5lc2lzIiwiZXNpcyJdLCJHZWVseSI6WyJHRUUgbHkiLCJHRUVseSIsImx5Il0sIkZvdG9uIjpbIkZPVCBvbiIsIkZPVG9uIiwib24iXSwiR2lvdHRpIFZpY3RvcmlhIjpbIkdWVCBHaW90dGkgVmljdG9yaWEiLCJHVlRHaW90dGkgVmljdG9yaWEiLCJHVlRHaW90dGlWaWN0b3JpYSJdLCJJQ0gtWCI6WyJJQ0ggLVgiLCJJQ0gtWCIsIi1YIl0sIklzdXp1IjpbIklTVSB6dSIsIklTVXp1IiwienUiXSwiSmFlY29vIjpbIkpBRSBjb28gSmFlY29vIiwiSkFFIGNvbyIsIkpBRWNvb0phZWNvbyIsIkpBRWNvbyIsImNvbyBKYWVjb28iLCJjb28iXSwiTGFtYm9yZ2hpbmkiOlsiTEFNIGJvcmdoaW5pIiwiTEFNYm9yZ2hpbmkiLCJMYW1ib3JnaGluaSBib3JnaGluaSIsImJvcmdoaW5pIl19'));
  let lastSignature = '';

  function byId(id){ return document.getElementById(id); }
  function clean(value){ return String(value || '').replace(/\bundefined\b/gi, '').replace(/\s+/g, ' ').trim(); }
  function esc(value){ return String(value || '').replace(/"/g, '&quot;'); }
  function uniq(values){ return Array.from(new Set(values.filter(Boolean))).sort(); }
  function dataSignature(){
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
  function removePrefix(text, prefix){
    text = clean(text);
    prefix = clean(prefix);
    if(!text || !prefix) return text;
    return text.toLowerCase().startsWith(prefix.toLowerCase()) ? clean(text.slice(prefix.length)) : text;
  }
  function fixText(value, brand){
    let text = clean(value);
    const fragments = fragmentMap[brand] || [];
    for(const fragment of fragments){ text = removePrefix(text, fragment); }
    text = removePrefix(text, brand);
    for(const fragment of fragments){ text = removePrefix(text, fragment); }
    return text;
  }
  function fixDrModel(car, code, raw){
    if(code !== 'DR' && raw !== 'DR') return;
    car.model = removePrefix(car.model || car.version || car.powertrain, 'DR') || car.model;
    car.version = removePrefix(car.version || car.model, 'DR') || car.version;
    car.powertrain = removePrefix(car.powertrain || car.version || car.model, 'DR') || car.powertrain;
  }
  function fixCar(car){
    if(!car) return;
    const code = carCode(car);
    const raw = clean(car.brand).toUpperCase();
    fixDrModel(car, code, raw);
    const brand = codeMap[code] || codeMap[raw];
    if(!brand) return;
    car.brand = brand;
    const model = fixText(car.model || car.version || car.powertrain, brand);
    const version = fixText(car.version || car.model, brand);
    const powertrain = fixText(car.powertrain || car.version || car.model, brand);
    car.model = model || brand;
    car.version = version || car.model;
    car.powertrain = powertrain || car.model;
  }
  function label(car){
    const brand = clean(car && car.brand);
    const model = clean(car && car.model);
    if(model.toLowerCase() === brand.toLowerCase()) return brand;
    if(model.toLowerCase().startsWith(brand.toLowerCase() + ' ')) return model;
    return clean(brand + ' ' + model);
  }
  function fillBrands(list, pickId){
    const pick = byId(pickId);
    if(!pick || !Array.isArray(list)) return;
    const current = pick.value || 'all';
    const brands = uniq(list.map(c => c.brand));
    pick.innerHTML = '<option value="all">Tutte</option>' + brands.map(b => '<option value="'+esc(b)+'">'+b+'</option>').join('');
    pick.value = brands.includes(current) ? current : 'all';
  }
  function fillModels(list, brandPickId, modelPickId, placeholder){
    const pick = byId(modelPickId);
    if(!pick || !Array.isArray(list)) return;
    const current = pick.value || '';
    const brand = byId(brandPickId) ? byId(brandPickId).value : 'all';
    const arr = list.filter(c => brand === 'all' || c.brand === brand);
    pick.innerHTML = '<option value="">'+placeholder+'</option>' + arr.map(c => '<option value="'+esc(c.id)+'">'+label(c)+' '+(c.year || '')+'</option>').join('');
    pick.value = arr.some(c => c.id === current) ? current : '';
  }
  function refresh(){
    try{
      const signature = dataSignature();
      if(signature === lastSignature) return;
      lastSignature = signature;
      if(Array.isArray(EV)) EV.forEach(fixCar);
      if(Array.isArray(IC)) IC.forEach(fixCar);
      fillBrands(EV, 'evBrandPick');
      fillBrands(IC, 'iceBrandPick');
      fillModels(EV, 'evBrandPick', 'evSelect', 'Seleziona modello elettrico');
      fillModels(IC, 'iceBrandPick', 'iceSelect', 'Seleziona modello termico');
      if(typeof setAutoFields === 'function') setAutoFields();
      if(typeof calculate === 'function') calculate();
      if(typeof updateNavigation === 'function') updateNavigation();
    }catch(e){}
  }
  window.addEventListener('load', function(){
    let n = 0;
    const timer = setInterval(function(){
      refresh();
      n += 1;
      if(n >= 20) clearInterval(timer);
    }, 500);
  });
})();
