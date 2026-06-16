(function(){
  const scripts = [
    'motornet-alpine-fix.js',
    'motornet-extra-brand-fix.js',
    'mercedes-dedupe-fix.js',
    'car-lightbox.js',
    'motornet-consumption-ui.js',
    'motornet-ev-spec-fix.js',
    'motornet-tiger-fix.js',
    'motornet-base-trim-ui.js',
    'motornet-final-chip-renderer.js',
    'motornet-mobile-autocomplete-fix.js'
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

  async function loadAll(){
    for(const src of scripts){
      await loadScript(src);
    }
  }

  loadAll();
})();
