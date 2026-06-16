(function(){
  const nativeAddEventListener = window.addEventListener.bind(window);
  let catalogLoadListener = null;
  let catalogRequested = false;
  let earlyBootDone = false;

  function byId(id){ return document.getElementById(id); }

  // motornet-catalog.js registers a load listener that starts the huge JSON fetch/parse.
  // Capture it here and run it only when the user reaches the car-selection steps.
  window.addEventListener = function(type, listener, options){
    try {
      if(type === 'load' && typeof listener === 'function' && String(listener).includes('applyCatalog')){
        catalogLoadListener = listener;
        window.__motornetDeferredCatalogLoad = listener;
        return;
      }
    } catch(e) {}
    return nativeAddEventListener(type, listener, options);
  };

  function requestCatalogLoad(){
    if(catalogRequested) return;
    catalogRequested = true;
    const fn = catalogLoadListener || window.__motornetDeferredCatalogLoad;
    if(typeof fn === 'function'){
      setTimeout(function(){
        try { fn.call(window, new Event('load')); } catch(e) {}
      }, 0);
    }
  }
  window.__motornetRequestCatalogLoad = requestCatalogLoad;

  function runLightweight(selectId, hintId){
    const select = byId(selectId);
    if(select && !select.value){
      select.innerHTML = '<option value=""></option>';
    }
    const hint = byId(hintId);
    if(hint) hint.textContent = '';
    try { if(typeof setAutoFields === 'function') setAutoFields(); } catch(e) {}
    try { if(typeof calculate === 'function') calculate(); } catch(e) {}
    try { if(typeof updateNavigation === 'function') updateNavigation(); } catch(e) {}
  }

  function installLightSelectors(){
    try {
      window.__motornetSelectorPatched = true;
      window.fillEvSelect = fillEvSelect = function(){ runLightweight('evSelect', 'evChoiceHint'); };
      window.fillIceSelect = fillIceSelect = function(){ runLightweight('iceSelect', 'iceChoiceHint'); };
    } catch(e) {}
  }

  function bootNavigationEarly(){
    if(earlyBootDone) return;
    earlyBootDone = true;
    try { if(typeof bind === 'function') bind(); } catch(e) {}
    try { if(typeof refreshLocks === 'function') refreshLocks(); } catch(e) {}
    try { if(typeof setStep === 'function') setStep(0); } catch(e) {}
  }

  function installLazyTriggers(){
    const triggerIds = ['nextStep','evBrandPick','evFuelPick','evModelSearch','evSelect','iceFuelPick','iceBrandPick','iceModelSearch','iceSelect'];
    triggerIds.forEach(function(id){
      const el = byId(id);
      if(!el || el.__motornetLazyBound) return;
      el.__motornetLazyBound = true;
      el.addEventListener('focus', requestCatalogLoad, {passive:true});
      el.addEventListener('pointerdown', function(){
        setTimeout(function(){
          try {
            if(typeof currentStep !== 'undefined' && currentStep >= 1) requestCatalogLoad();
          } catch(e) { requestCatalogLoad(); }
        }, 0);
      }, {passive:true});
      el.addEventListener('click', function(){
        setTimeout(function(){
          try {
            if(typeof currentStep !== 'undefined' && currentStep >= 1) requestCatalogLoad();
          } catch(e) { requestCatalogLoad(); }
        }, 0);
      }, {passive:true});
    });
  }

  installLightSelectors();
  setTimeout(bootNavigationEarly, 0);
  setTimeout(installLazyTriggers, 0);
  nativeAddEventListener('DOMContentLoaded', function(){
    installLightSelectors();
    bootNavigationEarly();
    installLazyTriggers();
  });
  nativeAddEventListener('load', function(){
    installLightSelectors();
    bootNavigationEarly();
    installLazyTriggers();
  });
})();