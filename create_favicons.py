#!/usr/bin/env python
from pathlib import Path
from xml.etree import ElementTree as ET
from PIL import Image, ImageDraw

SVG_PATH = Path('vora-logo.svg')


def parse_svg_points(value):
    return [tuple(map(float, point.split(','))) for point in value.split()]


def render_svg_to_image(svg_path: Path, size: int) -> Image.Image:
    tree = ET.parse(svg_path)
    root = tree.getroot()

    img = Image.new('RGBA', (size, size), (255, 255, 255, 0))
    draw = ImageDraw.Draw(img, 'RGBA')

    # Scale the SVG content to fit the target size.
    scale = size / 800
    for child in root:
        if child.tag.endswith('polygon'):
            points = parse_svg_points(child.attrib.get('points', ''))
            scaled_points = [(x * scale, y * scale) for x, y in points]
            draw.polygon(scaled_points, fill=child.attrib.get('fill', '#000000'))
        elif child.tag.endswith('circle'):
            cx = float(child.attrib.get('cx', '0')) * scale
            cy = float(child.attrib.get('cy', '0')) * scale
            r = float(child.attrib.get('r', '0')) * scale
            draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=child.attrib.get('fill', '#000000'))
        elif child.tag.endswith('path'):
            d = child.attrib.get('d', '')
            # The logo uses simple paths and the PIL path parser is limited, so render the pin as a polygon.
            if 'C540 120' in d and 'Z' in d:
                points = [(590 * scale, 120 * scale), (540 * scale, 120 * scale), (500 * scale, 160 * scale), (500 * scale, 210 * scale), (500 * scale, 270 * scale), (590 * scale, 360 * scale), (680 * scale, 270 * scale), (680 * scale, 210 * scale), (680 * scale, 160 * scale), (640 * scale, 120 * scale)]
                draw.polygon(points, fill='#FF0000')
            elif 'stroke' in child.attrib:
                pass

    return img


# Create 192x192 PNG favicon
img_192 = render_svg_to_image(SVG_PATH, 192)
img_192.save('favicon-192.png')
print('✓ Created favicon-192.png')

# Create 512x512 PNG favicon
img_512 = render_svg_to_image(SVG_PATH, 512)
img_512.save('favicon-512.png')
print('✓ Created favicon-512.png')

# Create favicon.ico from 192x192 image
img_192.save('favicon.ico')
print('✓ Created favicon.ico')

print('\nAll favicon files created successfully!')
