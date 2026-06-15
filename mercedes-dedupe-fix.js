(function(){
  function clean(value){ return String(value || '').replace(/\s+/g, ' ').trim(); }
  function lower(value){ return clean(value).toLowerCase(); }
  function isMercedesBrand(value){ return lower(value) === 'mercedes-benz'; }
  function hasCars(name){
    try{ return Array.isArray(eval(name)); }catch(e){ return false; }
  }
  function list(name){
    try{ return Array.isArray(eval(name)) ? eval(name) : []; }catch(e){ return []; }
  }
  function normalizeMercedesText(value){
    const text = clean(value);
    const l = text.toLowerCase();
    const rules = [
      'mercedes-benz mercedes ',
      'mercedes benz mercedes ',
      'mercedes-benz ',
      'mercedes benz ',
      'mercedes '
    ];
    if(l === 'mercedes' || l === 'mercedes-benz mercedes' || l === 'mercedes benz mercedes') return 'Mercedes-Benz';
    for(const rule of rules){
      if(l.startsWith(rule)){
        const rest = clean(text.slice(rule.length));
        return rest || 'Mercedes-Benz';
      }
    }
    return text;
  }
  function normalizeMercedesCar(car){
    if(!car || !isMercedesBrand(car.brand)) return false;
    let changed = false;
    ['model','version','powertrain'].forEach(function(key){
      const before = clean(car[key]);
      const after = normalizeMercedesText(before);
      if(after !== before){
        car[key] = after;
        changed = true;
      }
    });
    return changed;
  }
  function normalizeAll(){
    let changed = false;
    list('EV').forEach(function(car){ changed = normalizeMercedesCar(car) || changed; });
    list('IC').forEach(function(car){ changed = normalizeMercedesCar(car) || changed; });
    return changed;
  }
  function carById(id){
    return list('EV').concat(list('IC')).find(function(car){ return car && car.id === id; });
  }
  function displayLabel(car, withYear){
    if(!car) return '';
    const brand = clean(car.brand);
    let model = clean(car.model);
    if(isMercedesBrand(brand)) model = normalizeMercedesText(model);
    let label;
    if(model.toLowerCase() === brand.toLowerCase()) label = brand;
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
      else option.textContent = clean(option.textContent)
        .replace(/^Mercedes-Benz\s+Mercedes-Benz\s+Mercedes\s+/i, 'Mercedes-Benz ')
        .replace(/^Mercedes-Benz\s+Mercedes\s+/i, 'Mercedes-Benz ')
        .replace(/^Mercedes-Benz\s+Mercedes$/i, 'Mercedes-Benz');
    });
  }
  function patchVisibleText(){
    document.querySelectorAll('b').forEach(function(el){
      el.textContent = clean(el.textContent)
        .replace(/^Mercedes-Benz\s+Mercedes-Benz\s+Mercedes\s+/i, 'Mercedes-Benz ')
        .replace(/^Mercedes-Benz\s+Mercedes\s+/i, 'Mercedes-Benz ')
        .replace(/^Mercedes-Benz\s+Mercedes$/i, 'Mercedes-Benz');
    });
  }
  function refreshMercedesLabels(){
    normalizeAll();
    patchSelect('evSelect', false);
    patchSelect('iceSelect', true);
    patchVisibleText();
  }
  function wrapFill(name){
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
    wrapFill('fillEvSelect');
    wrapFill('fillIceSelect');
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
      if(n >= 40) clearInterval(timer);
    }, 500);
  });
})();
