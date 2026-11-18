"""Create display JPEGs while preserving original product photographs for zoom.
Run from the repository root with Python 3 and Pillow installed.
"""
import json
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / 'data/products.json'


def main():
    products = json.loads(CATALOG.read_text(encoding='utf-8'))
    outputs = {}
    for product in products:
        for field in ('image', 'image2'):
            current = product.get(field)
            if not current:
                continue
            original = product.get(field + '_original', current)
            relative = Path(original)
            if relative.is_absolute() or '..' in relative.parts or relative.parts[0] != 'images':
                raise ValueError(f'Expected local image path: {original}')
            source = ROOT / relative
            target = Path('images/optimized') / relative.relative_to('images').with_suffix('.jpg')
            if original not in outputs:
                destination = ROOT / target
                destination.parent.mkdir(parents=True, exist_ok=True)
                with Image.open(source) as photo:
                    photo = ImageOps.exif_transpose(photo).convert('RGB')
                    photo.thumbnail((1600, 1600), Image.Resampling.LANCZOS)
                    photo.save(destination, 'JPEG', quality=86, optimize=True, progressive=True)
                # Keep an already smaller source rather than increasing download size.
                if destination.stat().st_size >= source.stat().st_size:
                    destination.unlink()
                    outputs[original] = original
                else:
                    outputs[original] = target.as_posix()
            product[field] = outputs[original]
            if product[field] != original:
                product[field + '_original'] = original
    CATALOG.write_text(json.dumps(products, ensure_ascii=False, indent=2), encoding='utf-8')
    before = sum((ROOT / src).stat().st_size for src in outputs)
    after = sum((ROOT / dst).stat().st_size for dst in outputs.values())
    print(f'{len(outputs)} images: {before:,} -> {after:,} bytes ({100 * (1-after/before):.1f}% less)')


if __name__ == '__main__':
    main()
