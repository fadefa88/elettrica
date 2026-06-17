(async function(){
  const scripts = [
    'motornet-alpine-fix.js',
    'motornet-extra-brand-fix.js',
    'mercedes-dedupe-fix.js',
    'motornet-consumption-ui.js',
    'motornet-tiger-fix.js',
    'motornet-base-trim-ui.js',
    'motornet-final-chip-renderer.js'
  ];

  function alreadyLoaded(src){
    return Array.from(document.scripts).some(function(script){
      return script.getAttribute('src') === src || (script.src && script.src.endsWith('/' + src));
    });
  }

  function loadScript(src){
    return new Promise(function(resolve){
      if(alreadyLoaded(src)) return resolve();
      const script = document.createElement('script');
      script.src = src;
      script.onload = function(){ resolve(); };
      script.onerror = function(){
        console.error('[motornet-ui] Unable to load', src);
        resolve();
      };
      document.body.appendChild(script);
    });
  }

  // Inline safe utility: car-lightbox.js
  (function(){
    function ensureLightbox(){
      let box = document.getElementById('carLightbox');
      if(box) return box;
      box = document.createElement('div');
      box.id = 'carLightbox';
      box.className = 'car-lightbox';
      box.hidden = true;
      box.innerHTML = '<button type="button" aria-label="Chiudi immagine">×</button><img alt=""><div class="car-lightbox-caption"></div>';
      document.body.appendChild(box);
      box.addEventListener('click', function(event){
        if(event.target === box || event.target.tagName === 'BUTTON') closeLightbox();
      });
      document.addEventListener('keydown', function(event){
        if(event.key === 'Escape') closeLightbox();
      });
      return box;
    }
    function openLightbox(img){
      if(!img || !img.src) return;
      const box = ensureLightbox();
      const target = box.querySelector('img');
      const caption = box.querySelector('.car-lightbox-caption');
      target.src = img.currentSrc || img.src;
      target.alt = img.alt || 'Immagine auto';
      caption.textContent = img.alt || '';
      box.hidden = false;
      document.body.style.overflow = 'hidden';
    }
    function closeLightbox(){
      const box = document.getElementById('carLightbox');
      if(!box) return;
      box.hidden = true;
      const img = box.querySelector('img');
      if(img) img.removeAttribute('src');
      document.body.style.overflow = '';
    }
    document.addEventListener('click', function(event){
      const img = event.target.closest('img.car-photo');
      if(!img) return;
      event.preventDefault();
      event.stopPropagation();
      openLightbox(img);
    });
  })();

  // Inline compatibility stub: motornet-ev-spec-fix.js
  (function(){
    window.__motornetEvSpecFixLoaded = true;
    window.addEventListener('load', function(){
      try { if(typeof setAutoFields === 'function') setAutoFields(); } catch(e) {}
    });
  })();

  for(const src of scripts){
    await loadScript(src);
  }

  // Inline mobile autocomplete + latest UI policy fixes.
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

  (function(){
    function byId(id){ return document.getElementById(id); }
    function numeric(id){ return Number(byId(id)?.value || 0); }
    function checked(id){ return !!byId(id)?.checked; }
    function activeStep(){
      const active = document.querySelector('.screen.active[data-step]');
      return active ? Number(active.dataset.step) : -1;
    }
    const euro0 = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

    function selectedElectricCar(){
      try{
        return typeof window.selectedEv === 'function' ? window.selectedEv() : null;
      }catch(e){
        return null;
      }
    }

    function setTaxLabel(){
      const checkbox = byId('overrideEvTax');
      if(!checkbox) return;
      const span = checkbox.closest('span');
      if(!span) return;
      span.childNodes.forEach(function(node){
        if(node.nodeType === Node.TEXT_NODE){
          node.nodeValue = ' Override bollo elettrica';
        }
      });
    }

    function applyEvTaxPolicy(){
      const years = numeric('years');
      const input = byId('evTaxAfter5');
      const checkbox = byId('overrideEvTax');
      if(!input || !checkbox) return;

      setTaxLabel();

      if(years <= 5){
        checkbox.checked = false;
        checkbox.disabled = true;
        input.value = '0';
        input.readOnly = true;
        input.classList.add('readonly');
        input.title = 'Il bollo elettrico è considerato 0 fino a 5 anni di possesso.';
        return;
      }

      checkbox.disabled = false;
      input.title = '';
      const ev = selectedElectricCar();
      if(!checkbox.checked){
        if(ev && typeof window.estimateEvTax === 'function'){
          const tax = window.estimateEvTax(ev);
          if(Number.isFinite(tax)) input.value = String(tax);
        }
        input.readOnly = true;
        input.classList.add('readonly');
      }else{
        input.readOnly = false;
        input.classList.remove('readonly');
      }
    }

    function evTaxSummaryText(){
      const years = numeric('years');
      if(years <= 5) return euro0.format(0);
      return euro0.format(numeric('evTaxAfter5')) + ' all’anno (dal sesto anno)';
    }

    function iceTaxSummaryText(){
      return euro0.format(numeric('iceTax')) + ' all’anno';
    }

    function updateSummaryTaxText(){
      const grid = byId('summaryGrid');
      if(!grid) return;
      grid.querySelectorAll('div').forEach(function(row){
        const label = row.querySelector('small');
        const value = row.querySelector('b');
        if(!label || !value) return;
        if(/bollo\s+elettrica/i.test(label.textContent || '')){
          value.textContent = evTaxSummaryText() + ' / ' + iceTaxSummaryText();
        }
      });
    }

    function removeMotornetBadge(){
      const direct = byId('motornetCatalogBadge') || byId('autoitCatalogBadge');
      if(direct) direct.remove();
      document.querySelectorAll('.app-shell > div').forEach(function(node){
        const text = node.textContent || '';
        if(/Catalogo\s+Motornet\s+attivo/i.test(text) || /Catalogo\s+Motornet\s+vuoto/i.test(text)){
          node.remove();
        }
      });
    }

    function photovoltaicValid(){
      return checked('noPv') || numeric('solarShare') > 0;
    }

    function ensurePvHint(){
      let hint = byId('pvRequiredHint');
      if(hint) return hint;
      const pvScreen = document.querySelector('.screen[data-step="5"]');
      if(!pvScreen) return null;
      hint = document.createElement('p');
      hint.id = 'pvRequiredHint';
      hint.className = 'source-note';
      hint.style.marginTop = '10px';
      hint.style.color = '#8a4b00';
      hint.textContent = 'Per proseguire seleziona “Non ho impianto fotovoltaico” oppure indica una quota fotovoltaico maggiore di 0%.';
      const card = pvScreen.querySelector('.card.soft') || pvScreen;
      card.appendChild(hint);
      return hint;
    }

    function updatePvValidationUi(){
      const hint = ensurePvHint();
      if(hint) hint.hidden = photovoltaicValid();
    }

    function runPolicy(){
      applyEvTaxPolicy();
      updateSummaryTaxText();
      updatePvValidationUi();
      removeMotornetBadge();
    }

    if(typeof window.setAutoFields === 'function'){
      const originalSetAutoFields = window.setAutoFields;
      window.setAutoFields = function(){
        const result = originalSetAutoFields.apply(this, arguments);
        runPolicy();
        return result;
      };
    }

    if(typeof window.calculate === 'function'){
      const originalCalculate = window.calculate;
      window.calculate = function(){
        applyEvTaxPolicy();
        const result = originalCalculate.apply(this, arguments);
        applyEvTaxPolicy();
        updateSummaryTaxText();
        removeMotornetBadge();
        return result;
      };
    }

    if(typeof window.drawSummary === 'function'){
      const originalDrawSummary = window.drawSummary;
      window.drawSummary = function(){
        applyEvTaxPolicy();
        const result = originalDrawSummary.apply(this, arguments);
        updateSummaryTaxText();
        removeMotornetBadge();
        return result;
      };
    }

    if(typeof window.canProceed === 'function'){
      const originalCanProceed = window.canProceed;
      window.canProceed = function(){
        const base = originalCanProceed.apply(this, arguments);
        if(!base) return false;
        if(activeStep() === 5) return photovoltaicValid();
        return true;
      };
    }

    if(typeof window.updateNavigation === 'function'){
      const originalUpdateNavigation = window.updateNavigation;
      window.updateNavigation = function(){
        runPolicy();
        return originalUpdateNavigation.apply(this, arguments);
      };
    }

    document.addEventListener('input', function(event){
      if(['years','solarShare','noPv','unknownPv','overrideEvTax','evTaxAfter5'].includes(event.target && event.target.id)){
        setTimeout(function(){
          runPolicy();
          if(typeof window.updateNavigation === 'function') window.updateNavigation();
          if(typeof window.calculate === 'function') window.calculate();
        }, 0);
      }
    }, true);

    document.addEventListener('change', function(event){
      if(['years','solarShare','noPv','unknownPv','overrideEvTax','evTaxAfter5'].includes(event.target && event.target.id)){
        setTimeout(function(){
          runPolicy();
          if(typeof window.updateNavigation === 'function') window.updateNavigation();
          if(typeof window.calculate === 'function') window.calculate();
        }, 0);
      }
    }, true);

    document.addEventListener('DOMContentLoaded', runPolicy);
    window.addEventListener('load', function(){
      runPolicy();
      let count = 0;
      const timer = setInterval(function(){
        runPolicy();
        count += 1;
        if(count >= 40) clearInterval(timer);
      }, 250);

      if(window.MutationObserver){
        const shell = document.querySelector('.app-shell') || document.body;
        const observer = new MutationObserver(removeMotornetBadge);
        observer.observe(shell, {childList: true, subtree: false});
        setTimeout(function(){ observer.disconnect(); }, 15000);
      }
    });
  })();
})();
