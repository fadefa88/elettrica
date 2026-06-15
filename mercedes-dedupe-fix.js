(function(){
  function clean(value){ return String(value || '').replace(/\s+/g, ' ').trim(); }
  function isMercedesBrand(value){ return clean(value).toLowerCase() === 'mercedes-benz'; }
  function isMercedesResidual(value){
    const text = clean(value).toLowerCase();
    return text === 'mercedes' || text === 'mercedes-benz mercedes' || text === 'mercedes benz mercedes';
  }
  function normalizeMercedesCar(car){
    if(!car || !isMercedesBrand(car.brand)) return false;
    let changed = false;
    ['model','version','powertrain'].forEach(function(key){
      if(isMercedesResidual(car[key])){
        car[key] = 'Mercedes-Benz';
        changed = true;
      }
    });
    return changed;
  }
  function normalizeAll(){
    let changed = false;
    if(Array.isArray(window.EV)) window.EV.forEach(function(car){ changed = normalizeMercedesCar(car) || changed; });
    if(Array.isArray(window.IC)) window.IC.forEach(function(car){ changed = normalizeMercedesCar(car) || changed; });
    return changed;
  }
  function carById(id){
    return (Array.isArray(window.EV) ? window.EV : []).concat(Array.isArray(window.IC) ? window.IC : []).find(function(car){ return car && car.id === id; });
  }
  function displayLabel(car, withYear){
    if(!car) return '';
    const brand = clean(car.brand);
    const model = clean(car.model);
    let label;
    if(isMercedesBrand(brand) && isMercedesResidual(model)) label = 'Mercedes-Benz';
    else if(model.toLowerCase() === brand.toLowerCase()) label = brand;
    else if(model.toLowerCase().startsWith(brand.toLowerCase() + ' ')) label = model;
    else label = clean(brand + ' ' + model);
    return clean(label + (withYear && car.year ? ' ' + car.year : ''));
  }
  function patchSelect(selectId, withYear){
    const select = document.getElementById(selectId);
    if(!select) return;
    Array.from(select.options).forEach(function(option){
      if(!option.value) return;
      const car = carById(option.value);
      if(car) option.textContent = displayLabel(car, withYear);
    });
  }
  function patchVisibleText(){
    document.querySelectorAll('b').forEach(function(el){
      const text = clean(el.textContent);
      if(text.toLowerCase() === 'mercedes-benz mercedes') el.textContent = 'Mercedes-Benz';
    });
  }
  function refreshMercedesLabels(){
    normalizeAll();
    patchSelect('evSelect', false);
    patchSelect('iceSelect', true);
    patchVisibleText();
  }
  function wrapFill(name, selectId, withYear){
    const original = window[name];
    if(typeof original !== 'function' || original.__mercedesWrapped) return;
    window[name] = function(){
      const result = original.apply(this, arguments);
      refreshMercedesLabels();
      return result;
    };
    window[name].__mercedesWrapped = true;
  }
  function bindHandlers(){
    wrapFill('fillEvSelect', 'evSelect', false);
    wrapFill('fillIceSelect', 'iceSelect', true);
    const evBrand = document.getElementById('evBrandPick');
    if(evBrand && typeof window.fillEvSelect === 'function') evBrand.oninput = window.fillEvSelect;
    ['iceFuelPick','iceBrandPick'].forEach(function(id){
      const el = document.getElementById(id);
      if(el && typeof window.fillIceSelect === 'function') el.oninput = window.fillIceSelect;
    });
  }
  window.addEventListener('load', function(){
    let n = 0;
    const timer = setInterval(function(){
      bindHandlers();
      refreshMercedesLabels();
      n += 1;
      if(n >= 24) clearInterval(timer);
    }, 500);
  });
})();
