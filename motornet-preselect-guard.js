(function(){
  const nativeAddEventListener = window.addEventListener.bind(window);
  let catalogLoadListener = null;
  let catalogRequested = false;
  let earlyBootDone = false;

  function byId(id){ return document.getElementById(id); }

  // motornet-catalog.js registers a load listener that starts the old runtime normalizer.
  // Capture it, but do not execute it: the Motornet catalogue must be loaded from
  // data/cars_motornet.json as-is, without brand maps, URL/code inference or derived fields.
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

  function loadJsonOnlyCatalog(){
    if(window.__motornetJsonOnlyApplied && typeof window.__motornetApplyJsonOnly === 'function'){
      try { window.__motornetApplyJsonOnly(); } catch(e) {}
      return;
    }
    if(window.__motornetJsonOnlyScriptRequested) return;
    window.__motornetJsonOnlyScriptRequested = true;
    const script = document.createElement('script');
    script.src = 'motornet-json-only-loader.js?v=20260622-json-only';
    script.defer = true;
    script.onload = function(){
      try { if(typeof window.__motornetApplyJsonOnly === 'function') window.__motornetApplyJsonOnly(); } catch(e) {}
    };
    script.onerror = function(){
      console.error('[motornet-preselect-guard] Unable to load motornet-json-only-loader.js');
    };
    document.body.appendChild(script);
  }

  function requestCatalogLoad(){
    if(catalogRequested) return;
    catalogRequested = true;
    // Do not call catalogLoadListener / __motornetDeferredCatalogLoad here.
    // That old path normalizes brands/models from Motornet codes. Use JSON-only loader instead.
    loadJsonOnlyCatalog();
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

  function loadChoiceGuide(){
    if(window.__choiceGuideScriptRequested) return;
    window.__choiceGuideScriptRequested = true;
    function append(){
      if(document.querySelector('script[src="choice-guide.js"]')) return;
      const script = document.createElement('script');
      script.src = 'choice-guide.js';
      script.defer = true;
      document.body.appendChild(script);
    }
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', append);
    else append();
  }

  installLightSelectors();
  loadChoiceGuide();
  setTimeout(bootNavigationEarly, 0);
  setTimeout(installLazyTriggers, 0);
  nativeAddEventListener('DOMContentLoaded', function(){
    installLightSelectors();
    loadChoiceGuide();
    bootNavigationEarly();
    installLazyTriggers();
  });
  nativeAddEventListener('load', function(){
    installLightSelectors();
    loadChoiceGuide();
    bootNavigationEarly();
    installLazyTriggers();
  });
})();
