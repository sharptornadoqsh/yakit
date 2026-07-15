from html import escape
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[2]
CONFIG = json.loads((ROOT / 'product' / 'renyan.json').read_text(encoding='utf-8'))
MASTER_SIZE = 2048
ICON_SIZES = (16, 24, 32, 48, 64, 96, 128, 192, 256, 512, 1024)
ICO_SIZES = ((16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256))
OUTPUTS = []


def rgb(value):
    value = value.lstrip('#')
    return tuple(int(value[index : index + 2], 16) for index in (0, 2, 4))


def blend(start, end, ratio):
    return tuple(round(start[index] + (end[index] - start[index]) * ratio) for index in range(3))


def scale_point(point, factor):
    return tuple(round(value * factor) for value in point)


def quadratic_points(start, control, end, factor, steps=96):
    points = []
    for index in range(steps + 1):
        value = index / steps
        inverse = 1 - value
        x = inverse * inverse * start[0] + 2 * inverse * value * control[0] + value * value * end[0]
        y = inverse * inverse * start[1] + 2 * inverse * value * control[1] + value * value * end[1]
        points.append(scale_point((x, y), factor))
    return points


def write_text(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding='utf-8', newline='\n')
    OUTPUTS.append(path)


def save_image(image, path, **options):
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, **options)
    OUTPUTS.append(path)


def create_icon_master():
    factor = MASTER_SIZE / 1024
    primary = rgb(CONFIG['primaryColor'])
    success = rgb(CONFIG['successColor'])
    background_start = rgb('#0A1538')
    background_end = blend(primary, rgb('#142A55'), 0.5)

    image = Image.new('RGBA', (MASTER_SIZE, MASTER_SIZE), (0, 0, 0, 0))
    gradient = Image.new('RGB', image.size)
    gradient_draw = ImageDraw.Draw(gradient)
    for y in range(MASTER_SIZE):
        ratio = y / (MASTER_SIZE - 1)
        gradient_draw.line((0, y, MASTER_SIZE, y), fill=blend(background_start, background_end, ratio))

    mask = Image.new('L', image.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, MASTER_SIZE - 1, MASTER_SIZE - 1), radius=round(218 * factor), fill=255)
    image.paste(gradient.convert('RGBA'), (0, 0), mask)
    draw = ImageDraw.Draw(image)

    line_width = round(54 * factor)
    eye_start = (168, 512)
    eye_end = (856, 512)
    draw.line(
        quadratic_points(eye_start, (512, 188), eye_end, factor),
        fill=(244, 248, 255, 255),
        width=line_width,
        joint='curve',
    )
    draw.line(
        quadratic_points(eye_start, (512, 836), eye_end, factor),
        fill=(244, 248, 255, 255),
        width=line_width,
        joint='curve',
    )

    center = scale_point((512, 512), factor)
    radius = round(148 * factor)
    hexagon = []
    for index in range(6):
        angle = math.radians(30 + index * 60)
        hexagon.append((round(center[0] + radius * math.cos(angle)), round(center[1] + radius * math.sin(angle))))
    draw.polygon(hexagon, fill=(*success, 255))
    draw.ellipse(
        (
            center[0] - round(68 * factor),
            center[1] - round(68 * factor),
            center[0] + round(68 * factor),
            center[1] + round(68 * factor),
        ),
        fill=(*background_start, 255),
    )
    draw.ellipse(
        (
            center[0] - round(24 * factor),
            center[1] - round(24 * factor),
            center[0] + round(24 * factor),
            center[1] + round(24 * factor),
        ),
        fill=(255, 255, 255, 255),
    )

    bracket_color = (*primary, 255)
    bracket_width = round(32 * factor)
    brackets = (
        ((178, 330), (178, 204), (304, 204)),
        ((720, 204), (846, 204), (846, 330)),
        ((178, 694), (178, 820), (304, 820)),
        ((720, 820), (846, 820), (846, 694)),
    )
    for bracket in brackets:
        draw.line([scale_point(point, factor) for point in bracket], fill=bracket_color, width=bracket_width, joint='curve')

    for point in ((168, 512), (856, 512), (512, 188), (512, 836)):
        x, y = scale_point(point, factor)
        node_radius = round(14 * factor)
        draw.ellipse((x - node_radius, y - node_radius, x + node_radius, y + node_radius), fill=(*success, 255))

    return image


def icon_markup(identifier='renyan'):
    primary = escape(CONFIG['primaryColor'])
    success = escape(CONFIG['successColor'])
    return f'''<defs>
  <linearGradient id="{identifier}-background" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#0A1538" />
    <stop offset="1" stop-color="#244A98" />
  </linearGradient>
</defs>
<rect width="1024" height="1024" rx="218" fill="url(#{identifier}-background)" />
<path d="M168 512 Q512 188 856 512" fill="none" stroke="#F4F8FF" stroke-width="54" stroke-linecap="round" />
<path d="M168 512 Q512 836 856 512" fill="none" stroke="#F4F8FF" stroke-width="54" stroke-linecap="round" />
<path d="M512 364 640 438 640 586 512 660 384 586 384 438Z" fill="{success}" />
<circle cx="512" cy="512" r="68" fill="#0A1538" />
<circle cx="512" cy="512" r="24" fill="#FFFFFF" />
<path d="M304 204H178V330 M720 204H846V330 M304 820H178V694 M720 820H846V694" fill="none" stroke="{primary}" stroke-width="32" stroke-linecap="round" stroke-linejoin="round" />
<g fill="{success}">
  <circle cx="168" cy="512" r="14" /><circle cx="856" cy="512" r="14" />
  <circle cx="512" cy="188" r="14" /><circle cx="512" cy="836" r="14" />
</g>'''


def icon_svg():
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" aria-labelledby="title">
<title id="title">{escape(CONFIG['displayName'])}</title>
{icon_markup('icon')}
</svg>
'''


def wordmark_svg(theme):
    foreground = '#12213F' if theme == 'light' else '#F4F7FF'
    secondary = '#52627F' if theme == 'light' else '#AEBBCE'
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 920 220" role="img" aria-labelledby="title">
<title id="title">{escape(CONFIG['displayName'])}</title>
<g transform="translate(18 18) scale(.18)">{icon_markup(f'wordmark-{theme}')}</g>
<text x="230" y="100" fill="{foreground}" font-family="Microsoft YaHei, PingFang SC, Noto Sans CJK SC, sans-serif" font-size="52" font-weight="700">{escape(CONFIG['displayName'])}</text>
<text x="232" y="148" fill="{secondary}" font-family="Inter, Segoe UI, sans-serif" font-size="25" font-weight="600" letter-spacing="2">{escape(CONFIG['shortName'])}</text>
</svg>
'''


def startup_panel_svg(theme):
    is_light = theme == 'light'
    background = '#EEF4FF' if is_light else '#091128'
    surface = '#FFFFFF' if is_light else '#101E3E'
    grid = '#BED0F7' if is_light else '#213967'
    foreground = '#14254A' if is_light else '#F3F7FF'
    secondary = '#5B6D90' if is_light else '#A4B5D3'
    primary = escape(CONFIG['primaryColor'])
    success = escape(CONFIG['successColor'])
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 944 1152" role="img" aria-labelledby="title">
<title id="title">{escape(CONFIG['displayName'])}</title>
<defs>
  <linearGradient id="panel-{theme}" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="{background}" /><stop offset="1" stop-color="{surface}" />
  </linearGradient>
  <pattern id="grid-{theme}" width="64" height="64" patternUnits="userSpaceOnUse">
    <path d="M64 0H0V64" fill="none" stroke="{grid}" stroke-width="1" opacity=".55" />
  </pattern>
</defs>
<rect width="944" height="1152" rx="32" fill="url(#panel-{theme})" />
<rect width="944" height="1152" rx="32" fill="url(#grid-{theme})" />
<path d="M96 280H254L330 356H514L618 252H848" fill="none" stroke="{primary}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" />
<path d="M96 844H236L330 750H566L682 866H848" fill="none" stroke="{success}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" />
<g fill="{primary}"><circle cx="96" cy="280" r="12" /><circle cx="848" cy="252" r="12" /><circle cx="330" cy="356" r="12" /></g>
<g fill="{success}"><circle cx="96" cy="844" r="12" /><circle cx="848" cy="866" r="12" /><circle cx="566" cy="750" r="12" /></g>
<g transform="translate(300 394) scale(.34)">{icon_markup(f'panel-mark-{theme}')}</g>
<text x="472" y="820" text-anchor="middle" fill="{foreground}" font-family="Microsoft YaHei, PingFang SC, Noto Sans CJK SC, sans-serif" font-size="54" font-weight="700">{escape(CONFIG['displayName'])}</text>
<text x="472" y="884" text-anchor="middle" fill="{secondary}" font-family="Inter, Segoe UI, sans-serif" font-size="25" font-weight="600" letter-spacing="3">{escape(CONFIG['shortName'])}</text>
<text x="472" y="936" text-anchor="middle" fill="{secondary}" font-family="Microsoft YaHei, PingFang SC, Noto Sans CJK SC, sans-serif" font-size="27">{escape(CONFIG['tagline'])}</text>
</svg>
'''


def primary_background_svg():
    primary = escape(CONFIG['primaryColor'])
    success = escape(CONFIG['successColor'])
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">
<defs>
  <linearGradient id="background" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#07122E" /><stop offset="1" stop-color="#173A7A" /></linearGradient>
  <pattern id="grid" width="80" height="80" patternUnits="userSpaceOnUse"><path d="M80 0H0V80" fill="none" stroke="#7899DB" stroke-width="1" opacity=".16" /></pattern>
</defs>
<rect width="1600" height="1000" fill="url(#background)" /><rect width="1600" height="1000" fill="url(#grid)" />
<path d="M0 760H300L430 630H720L900 810H1260L1400 670H1600" fill="none" stroke="{success}" stroke-width="8" opacity=".65" />
<path d="M0 210H280L410 340H680L860 160H1190L1360 330H1600" fill="none" stroke="{primary}" stroke-width="8" opacity=".75" />
<g transform="translate(1030 245) scale(.42)" opacity=".2">{icon_markup('background-mark')}</g>
</svg>
'''


def find_font(bold):
    names = [
        'C:/Windows/Fonts/msyhbd.ttc' if bold else 'C:/Windows/Fonts/msyh.ttc',
        'C:/Windows/Fonts/simhei.ttf',
        '/System/Library/Fonts/PingFang.ttc',
        '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc' if bold else '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
    ]
    for name in names:
        path = Path(name)
        if path.exists():
            return path
    raise RuntimeError('未找到可用于生成中文品牌位图的字体')


def wordmark_png(master, theme):
    foreground = '#12213F' if theme == 'light' else '#F4F7FF'
    secondary = '#52627F' if theme == 'light' else '#AEBBCE'
    image = Image.new('RGBA', (920, 220), (0, 0, 0, 0))
    image.alpha_composite(master.resize((184, 184), Image.Resampling.LANCZOS), (18, 18))
    draw = ImageDraw.Draw(image)
    draw.text((230, 45), CONFIG['displayName'], font=ImageFont.truetype(find_font(True), 52), fill=foreground)
    draw.text((232, 126), CONFIG['shortName'], font=ImageFont.truetype(find_font(False), 25), fill=secondary, stroke_width=0)
    return image


def generate():
    master = create_icon_master()
    brand_root = ROOT / 'product' / 'brand'
    app_assets = ROOT / 'app' / 'assets'
    main_public = ROOT / 'app' / 'renderer' / 'src' / 'main' / 'public'
    main_assets = ROOT / 'app' / 'renderer' / 'src' / 'main' / 'src' / 'assets'
    startup_assets = ROOT / 'app' / 'renderer' / 'engine-link-startup' / 'src' / 'assets'

    write_text(brand_root / 'renyan-icon.svg', icon_svg())
    for theme in ('light', 'dark'):
        wordmark = wordmark_svg(theme)
        panel = startup_panel_svg(theme)
        write_text(brand_root / f'renyan-logo-{theme}.svg', wordmark)
        write_text(brand_root / f'renyan-startup-{theme}.svg', panel)
        save_image(wordmark_png(master, theme), brand_root / f'renyan-logo-{theme}.png', format='PNG', optimize=True)
        write_text(main_assets / f'renyan-logo-{theme}.svg', wordmark)
        write_text(startup_assets / f'renyan-logo-{theme}.svg', wordmark)
        write_text(startup_assets / f'renyan-startup-panel-{theme}.svg', panel)

    write_text(main_assets / 'renyan-icon.svg', icon_svg())
    write_text(startup_assets / 'renyan-icon.svg', icon_svg())
    write_text(main_assets / 'uiLayout' / 'RenYanPrimaryBg.svg', primary_background_svg())

    for size in ICON_SIZES:
        resized = master.resize((size, size), Image.Resampling.LANCZOS)
        save_image(resized, brand_root / 'icons' / f'{size}x{size}.png', format='PNG', optimize=True)

    save_image(master.resize((1024, 1024), Image.Resampling.LANCZOS), brand_root / 'renyan-icon.png', format='PNG', optimize=True)
    save_image(master.resize((512, 512), Image.Resampling.LANCZOS), app_assets / 'renyan-icon.png', format='PNG', optimize=True)
    save_image(master.resize((128, 128), Image.Resampling.LANCZOS), app_assets / 'renyan-close.png', format='PNG', optimize=True)
    save_image(master.resize((32, 32), Image.Resampling.LANCZOS), app_assets / 'renyan-tray.png', format='PNG', optimize=True)
    save_image(master, app_assets / 'renyan-icon.ico', format='ICO', sizes=ICO_SIZES)
    save_image(
        master,
        app_assets / 'renyan-icon.icns',
        format='ICNS',
        append_images=[master.resize((size, size), Image.Resampling.LANCZOS) for size in (16, 32, 64, 128, 256, 512)],
    )
    save_image(master, main_public / 'favicon.ico', format='ICO', sizes=ICO_SIZES)
    save_image(master.resize((192, 192), Image.Resampling.LANCZOS), main_public / 'logo192.png', format='PNG', optimize=True)
    save_image(master.resize((512, 512), Image.Resampling.LANCZOS), main_public / 'logo512.png', format='PNG', optimize=True)

    manifest = {
        'short_name': CONFIG['shortName'],
        'name': CONFIG['displayName'],
        'icons': [
            {'src': 'favicon.ico', 'sizes': '256x256 128x128 64x64 48x48 32x32 24x24 16x16', 'type': 'image/x-icon'},
            {'src': 'logo192.png', 'type': 'image/png', 'sizes': '192x192'},
            {'src': 'logo512.png', 'type': 'image/png', 'sizes': '512x512'},
        ],
        'start_url': '.',
        'display': 'standalone',
        'theme_color': CONFIG['primaryColor'],
        'background_color': '#FFFFFF',
    }
    write_text(main_public / 'manifest.json', json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')


def validate():
    brand_root = ROOT / 'product' / 'brand'
    app_assets = ROOT / 'app' / 'assets'
    for size in ICON_SIZES:
        with Image.open(brand_root / 'icons' / f'{size}x{size}.png') as image:
            if image.format != 'PNG' or image.size != (size, size):
                raise RuntimeError(f'PNG 图标尺寸验证失败：{size}')

    with Image.open(app_assets / 'renyan-icon.ico') as image:
        if image.format != 'ICO' or not set(ICO_SIZES).issubset(image.info.get('sizes', set())):
            raise RuntimeError('ICO 图标尺寸集合验证失败')

    with Image.open(app_assets / 'renyan-icon.icns') as image:
        sizes = image.info.get('sizes', [])
        if image.format != 'ICNS' or (512, 512, 2) not in sizes or (16, 16, 2) not in sizes:
            raise RuntimeError('ICNS 图标尺寸集合验证失败')

    for path in OUTPUTS:
        if path.suffix == '.svg' and '<svg' not in path.read_text(encoding='utf-8'):
            raise RuntimeError(f'SVG 资源验证失败：{path}')


if __name__ == '__main__':
    generate()
    validate()
    print(f'品牌资源生成完成，共写入 {len(OUTPUTS)} 个文件')
