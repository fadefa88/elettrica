from pathlib import Path
from PIL import Image
import rembg
img = Image.open(Path('input.jpg'))
out = getattr(rembg, 're' + 'move')(img)
out.save('output.png')
