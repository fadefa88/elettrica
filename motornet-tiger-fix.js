(function(){
  let lastSignature = '';

  function clean(value){
    return String(value || '').replace(/\bundefined\b/gi, '').replace(/\s+/g, ' ').trim();
  }

  function getList(name){
    try{
      const value = eval(name);
      return Array.isArray(value) ? value : [];
    }catch(e){
      return [];
    }
  }

  function carCode(car){
    const text = [
      car && car.source_url,
      car && car.motornet_detail_url,
      car && car.image_source_url,
      car && car.image_local_path,
      car && car.id
    ].join(' ');
    const match = text.match(/(?:allestimento\/|\/auto\/)(TIG[A-Z0-9]*)/i) || text.match(/\b(TIG[A-Z0-9]*)\b/i);
    return match ? match[1].toUpperCase() : '';
  }

  function isTiger(car){
    if(!car) return false;
    const rawBrand = clean(car.brand).toUpperCase();
    const code = carCode(car);
    return rawBrand === 'TIG' || code.startsWith('TIG') || /^TIG\s*er\b/i.test(clean(car.model || car.version || car.powertrain));
  }

  function fixTigerText(value){
    let text = clean(value);
    if(!text) return text;
    text = text.replace(/^TIG\s*er\b/i, 'Tiger');
    text = text.replace(/^TIGer\b/i, 'Tiger');
    text = text.replace(/^TIG\b/i, 'Tiger');
    text = text.replace(/^er\b/i, 'Tiger');
    return clean(text);
  }

  function fixCar(car){
    if(!isTiger(car)) return false;
    const before = [car.brand, car.model, car.version, car.powertrain].join('|');
    car.brand = 'Tiger';
    car.model = fixTigerText(car.model || car.version || car.powertrain) || 'Tiger';
    car.version = fixTigerText(car.version || car.model) || car.model;
    car.powertrain = fixTigerText(car.powertrain || car.version || car.model) || car.version;
    if(clean(car.model).toLowerCase() === 'er') car.model = 'Tiger';
    if(clean(car.version).toLowerCase() === 'er') car.version = car.model;
    if(clean(car.powertrain).toLowerCase() === 'er') car.powertrain = car.version;
    const after = [car.brand, car.model, car.version, car.powertrain].join('|');
    return before !== after;
  }

  function signature(){
    const ev = getList('EV');
    const ic = getList('IC');
    return [
      ev.length,
      ic.length,
      ev[0] && ev[0].id || '',
      ev[ev.length - 1] && ev[ev.length - 1].id || '',
      ic[0] && ic[0].id || '',
      ic[ic.length - 1] && ic[ic.length - 1].id || '',
      ic.filter(function(car){ return clean(car.brand).toUpperCase() === 'TIG' || /^TIG\s*er\b/i.test(clean(car.model)); }).length
    ].join('|');
  }

  function refresh(){
    const sig = signature();
    if(sig === lastSignature) return;
    lastSignature = sig;

    let changed = false;
    getList('EV').forEach(function(car){ changed = fixCar(car) || changed; });
    getList('IC').forEach(function(car){ changed = fixCar(car) || changed; });

    if(changed){
      try{ if(typeof fillEvSelect === 'function') fillEvSelect(); }catch(e){}
      try{ if(typeof fillIceSelect === 'function') fillIceSelect(); }catch(e){}
      try{ if(typeof setAutoFields === 'function') setAutoFields(); }catch(e){}
      try{ if(typeof calculate === 'function') calculate(); }catch(e){}
      try{ if(typeof updateNavigation === 'function') updateNavigation(); }catch(e){}
    }
  }

  window.addEventListener('load', function(){
    let ticks = 0;
    const timer = setInterval(function(){
      refresh();
      ticks += 1;
      if(ticks >= 40) clearInterval(timer);
    }, 500);
  });
})();
