(function(){
  const ITEM_SELECTOR = '.motornet-autocomplete-results .motornet-autocomplete-item[data-key]';
  let lastActivationAt = 0;

  function byId(id){ return document.getElementById(id); }

  function injectStyles(){
    if(byId('motornetMobileAutocompleteFixStyles')) return;
    const style = document.createElement('style');
    style.id = 'motornetMobileAutocompleteFixStyles';
    style.textContent = `
      .motornet-smart-model-label{position:relative;overflow:visible!important;}
      .motornet-autocomplete-results{z-index:9999!important;pointer-events:auto!important;-webkit-overflow-scrolling:touch;touch-action:pan-y;}
      .motornet-autocomplete-item{pointer-events:auto!important;touch-action:manipulation;-webkit-tap-highlight-color:rgba(0,0,0,.08);}
    `;
    document.head.appendChild(style);
  }

  function activateAutocompleteItem(btn, event){
    if(!btn) return;
    const now = Date.now();
    if(now - lastActivationAt < 250) return;
    lastActivationAt = now;

    if(event){
      event.preventDefault();
      event.stopPropagation();
    }

    btn.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      view: window
    }));

    setTimeout(function(){
      const active = document.activeElement;
      if(active && active.classList && active.classList.contains('motornet-model-search')) active.blur();
    }, 30);
  }

  document.addEventListener('pointerdown', function(event){
    const btn = event.target && event.target.closest ? event.target.closest(ITEM_SELECTOR) : null;
    if(btn) activateAutocompleteItem(btn, event);
  }, true);

  document.addEventListener('touchstart', function(event){
    const btn = event.target && event.target.closest ? event.target.closest(ITEM_SELECTOR) : null;
    if(btn) activateAutocompleteItem(btn, event);
  }, {capture: true, passive: false});

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectStyles);
  else injectStyles();
})();

(function(){
  function clean(value){
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function codeFromUrl(text){
    const s = String(text || '');
    let m = s.match(/allestimento\/([A-Z0-9]{3})/i);
    if(m) return m[1].toUpperCase();
    m = s.match(/\/img\/modelli\/auto\/([A-Z0-9]{3})\//i);
    return m ? m[1].toUpperCase() : '';
  }

  function carCode(car){
    return codeFromUrl([
      car && car.source_url,
      car && car.motornet_detail_url,
      car && car.image_source_url,
      car && car.image_local_path
    ].join(' '));
  }

  function normalizeVoyahText(value){
    let text = clean(value);
    if(!text) return text;
    text = text.replace(/\bVOY\b/gi, 'Voyah');
    text = text.replace(/\bVoy\s+ah\b/gi, 'Voyah');
    text = text.replace(/\bVoyah\s+ah\b/gi, 'Voyah');
    text = text.replace(/^Voyah\s+Voyah\b/i, 'Voyah');
    return clean(text);
  }

  function isVoyah(car){
    if(!car) return false;
    const raw = clean(car.brand).toUpperCase();
    const code = carCode(car);
    const text = [car.brand, car.model, car.version, car.powertrain].join(' ');
    return raw === 'VOY' || code === 'VOY' || /\bVoy\s+ah\b/i.test(text);
  }

  function fixVoyahCar(car){
    if(!isVoyah(car)) return;
    car.brand = 'Voyah';
    ['model','version','powertrain'].forEach(function(key){
      const next = normalizeVoyahText(car[key]);
      if(next) car[key] = next;
    });
    if(clean(car.model).toLowerCase() === 'voyah' && clean(car.version)){
      car.model = normalizeVoyahText(car.version);
    }
  }

  function fixAllVoyah(){
    try{
      if(Array.isArray(window.EV)) window.EV.forEach(fixVoyahCar);
      if(Array.isArray(window.IC)) window.IC.forEach(fixVoyahCar);
    }catch(e){}
  }

  function removeImageCaptions(){
    ['evVisual','iceVisual'].forEach(function(id){
      const box = document.getElementById(id);
      if(!box) return;
      box.querySelectorAll('em').forEach(function(node){
        const txt = clean(node.textContent);
        if(/^Immagine:/i.test(txt) || /^Immagine non ancora scaricata:/i.test(txt)){
          node.remove();
        }
      });
    });
  }

  function run(){
    fixAllVoyah();
    removeImageCaptions();
  }

  if(typeof window.renderCarVisual === 'function'){
    const originalRenderCarVisual = window.renderCarVisual;
    window.renderCarVisual = function(id, car, type){
      fixVoyahCar(car);
      const result = originalRenderCarVisual.apply(this, arguments);
      removeImageCaptions();
      return result;
    };
  }

  if(typeof window.setAutoFields === 'function'){
    const originalSetAutoFields = window.setAutoFields;
    window.setAutoFields = function(){
      fixAllVoyah();
      const result = originalSetAutoFields.apply(this, arguments);
      removeImageCaptions();
      return result;
    };
  }

  document.addEventListener('DOMContentLoaded', run);
  window.addEventListener('load', function(){
    run();
    let count = 0;
    const timer = setInterval(function(){
      run();
      count += 1;
      if(count >= 40) clearInterval(timer);
    }, 250);
  });
  document.addEventListener('click', function(){ setTimeout(run, 0); }, true);
  document.addEventListener('change', function(){ setTimeout(run, 0); }, true);
})();
