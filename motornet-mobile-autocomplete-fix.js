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
