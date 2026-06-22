(function(){
  const nativeAddEventListener = window.addEventListener.bind(window);

  // motornet-catalog.js still exists in the page, but its old load listener must not run:
  // that path normalized/derived values from Motornet URLs. The catalogue must come from
  // data/cars_motornet.json only.
  window.addEventListener = function(type, listener, options){
    try {
      if(type === 'load' && typeof listener === 'function' && String(listener).includes('applyCatalog')){
        window.__motornetDeferredCatalogLoad = listener;
        return;
      }
    } catch(e) {}
    return nativeAddEventListener(type, listener, options);
  };

  function appendScript(src, flagName){
    if(flagName && window[flagName]) return;
    if(flagName) window[flagName] = true;
    function append(){
      if(document.querySelector('script[src^="' + src + '"]')) return;
      const script = document.createElement('script');
      script.src = src;
      script.defer = true;
      document.body.appendChild(script);
    }
    if(document.body) append();
    else if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', append);
    else append();
  }

  function loadJsonOnlyCatalog(){
    appendScript('motornet-json-only-loader.js?v=20260622-eager-json-only', '__motornetJsonOnlyScriptRequested');
  }

  function loadChoiceGuide(){
    appendScript('choice-guide.js', '__choiceGuideScriptRequested');
  }

  // Start loading the real Motornet JSON immediately, not only when the user touches the model field.
  // This avoids the autocomplete/select being rebuilt while the user is already typing.
  loadJsonOnlyCatalog();
  loadChoiceGuide();

  nativeAddEventListener('DOMContentLoaded', function(){
    loadJsonOnlyCatalog();
    loadChoiceGuide();
  });

  nativeAddEventListener('load', function(){
    loadJsonOnlyCatalog();
    loadChoiceGuide();
  });
})();