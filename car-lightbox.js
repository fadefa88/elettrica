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
    const visual = event.target.closest('.car-visual, .mini-car-card');
    if(!visual) return;
    const img = visual.querySelector('.car-photo');
    if(!img) return;
    event.preventDefault();
    openLightbox(img);
  });
})();
