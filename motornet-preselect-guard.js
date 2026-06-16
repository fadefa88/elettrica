(function(){
  function byId(id){ return document.getElementById(id); }

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

  function install(){
    try {
      window.__motornetSelectorPatched = true;
      window.fillEvSelect = fillEvSelect = function(){ runLightweight('evSelect', 'evChoiceHint'); };
      window.fillIceSelect = fillIceSelect = function(){ runLightweight('iceSelect', 'iceChoiceHint'); };
    } catch(e) {}
  }

  install();
  window.addEventListener('DOMContentLoaded', install);
  window.addEventListener('load', install);
})();
