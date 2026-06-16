(function(){
  // This file runs before Motornet catalog load-time processing.
  // It prevents motornet-catalog.js from rendering thousands of <option> nodes
  // into the legacy evSelect/iceSelect controls. The smart autocomplete UI loaded
  // later keeps those legacy selects hidden and uses them only as technical state.
  window.__motornetSelectorPatched = true;

  function byId(id){ return document.getElementById(id); }

  function lightweightFill(selectId, hintId){
    const select = byId(selectId);
    if(select && !select.value){
      // Keep the legacy select tiny. setHiddenSelection() in motornet-base-trim-ui.js
      // will inject the selected allestimento option when the user chooses one.
      select.innerHTML = '<option value=""></option>';
    }
    const hint = byId(hintId);
    if(hint) hint.textContent = '';
    try { if(typeof setAutoFields === 'function') setAutoFields(); } catch(e) {}
    try { if(typeof calculate === 'function') calculate(); } catch(e) {}
    try { if(typeof updateNavigation === 'function') updateNavigation(); } catch(e) {}
  }

  try {
    window.fillEvSelect = function(){ lightweightFill('evSelect', 'evChoiceHint'); };
    window.fillIceSelect = function(){ lightweightFill('iceSelect', 'iceChoiceHint'); };
  } catch(e) {}
})();
