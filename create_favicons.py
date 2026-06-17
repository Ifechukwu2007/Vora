#!/usr/bin/env python
from PIL import Image, ImageDraw

# Create 192x192 PNG favicon
img_192 = Image.new('RGB', (192, 192), color='#6366F1')  # Indigo background
draw_192 = ImageDraw.Draw(img_192)
# Draw a simple circle in the center
circle_radius = 80
circle_bbox = [(96 - circle_radius, 96 - circle_radius), (96 + circle_radius, 96 + circle_radius)]
draw_192.ellipse(circle_bbox, fill='#4F46E5', outline='white', width=3)
# Add 'V' text
draw_192.text((70, 60), 'V', fill='white')
img_192.save('favicon-192.png')
print('✓ Created favicon-192.png')

# Create 512x512 PNG favicon
img_512 = Image.new('RGB', (512, 512), color='#6366F1')  # Indigo background
draw_512 = ImageDraw.Draw(img_512)
# Draw a simple circle in the center
circle_radius = 200
circle_bbox = [(256 - circle_radius, 256 - circle_radius), (256 + circle_radius, 256 + circle_radius)]
draw_512.ellipse(circle_bbox, fill='#4F46E5', outline='white', width=6)
# Add 'V' text
draw_512.text((200, 170), 'V', fill='white')
img_512.save('favicon-512.png')
print('✓ Created favicon-512.png')

# Create favicon.ico from 192x192 image
img_192.save('favicon.ico')
print('✓ Created favicon.ico')

print('\nAll favicon files created successfully!')
