import argparse
import json
import os
from pathlib import Path
import re
import tempfile
import zipfile


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ARCHIVE = ROOT / 'bins' / 'scripts' / 'google-chrome-plugin.zip'
FIXED_TIMESTAMP = (1980, 1, 1, 0, 0, 0)
ALLOWED_LEGACY_TOKENS = {
    'yakit_badge',
    'yakit_inject_script',
    'yakit_to_extension_page',
}
ASSET_SOURCES = {
    'images/icon16.png': ROOT / 'product' / 'brand' / 'icons' / '16x16.png',
    'images/icon48.png': ROOT / 'product' / 'brand' / 'icons' / '48x48.png',
    'images/icon128.png': ROOT / 'product' / 'brand' / 'icons' / '128x128.png',
    'images/ruiyan-logo.png': ROOT / 'product' / 'brand' / 'renyan-logo-light.png',
    'images/ruiyan-icon.svg': ROOT / 'product' / 'brand' / 'renyan-icon.svg',
}
ENTRY_RENAMES = {
    'images/yakitlogo.png': 'images/ruiyan-logo.png',
    'images/yak.svg': 'images/ruiyan-icon.svg',
}
TEXT_REPLACEMENTS = (
    ('Yakit Chrome Endpoint', 'RuiYan Chrome Endpoint'),
    ('A Endpoint for Yakit MITM or more', 'Browser endpoint for RuiYan MITM and proxy workflows'),
    ('Yakit MITM', 'RuiYan MITM'),
    ('images/yakitlogo.png', 'images/ruiyan-logo.png'),
    ('images/yak.svg', 'images/ruiyan-icon.svg'),
    ('yakit-proxy-panel', 'ruiyan-proxy-panel'),
    ('yakitProxyPanelPosition', 'ruiyanProxyPanelPosition'),
    ('--yakit-primary', '--ruiyan-primary'),
    ('yak-proxy-root', 'ruiyan-proxy-root'),
    ('yak-icon', 'ruiyan-icon'),
    ('alt="Yak"', 'alt="RuiYan"'),
    ('alt:"Yak"', 'alt:"RuiYan"'),
    ('<title>React App</title>', '<title>RuiYan Proxy</title>'),
    ('<title>My Sidepanel</title>', '<title>RuiYan Proxy</title>'),
    ('<h1>All sites sidepanel extension</h1>', '<h1>RuiYan Proxy</h1>'),
    (
        '<p>This side panel is enabled on all sites</p>',
        '<p>RuiYan proxy controls are available on supported pages.</p>',
    ),
    ('<title>代理设置</title>', '<title>RuiYan 代理设置</title>'),
    ('#F28B44', '#315EFB'),
    ('#f28b44', '#315efb'),
    ('#f4a061', '#4b72ff'),
    ('#e87633', '#2448c7'),
    ('#fff5eb', '#edf2ff'),
    ('rgba(242, 139, 68, 0.1)', 'rgba(49, 94, 251, 0.1)'),
    ('#fff7e6', '#edf2ff'),
    ('#ffd591', '#9db2ff'),
    ('#ff6b00', '#315efb'),
    ('rgba(255,107,0,0.3)', 'rgba(49,94,251,0.3)'),
    ('rgba(255, 107, 0, 0.3)', 'rgba(49, 94, 251, 0.3)'),
)
TEXT_SUFFIXES = {'.css', '.html', '.js', '.json', '.svg', '.txt'}
LEGACY_PALETTE = re.compile(
    r'#f28b44|#f4a061|#e87633|#fff5eb|#fff7e6|#ff6b00|#ffd591|'
    r'rgba\(242,\s*139,\s*68|rgba\(255,\s*107,\s*0',
    re.IGNORECASE,
)


def transform_text(entry_name, data):
    try:
        text = data.decode('utf-8')
    except UnicodeDecodeError:
        return data

    for source, target in TEXT_REPLACEMENTS:
        text = text.replace(source, target)

    if entry_name == 'manifest.json':
        manifest = json.loads(text)
        manifest['name'] = 'RuiYan Chrome Endpoint'
        manifest['description'] = 'Browser endpoint for RuiYan MITM and proxy workflows'
        for resource_group in manifest.get('web_accessible_resources', []):
            resource_group['resources'] = [
                'images/ruiyan-icon.svg' if resource.lstrip('/') == 'images/ruiyan-icon.svg' else resource
                for resource in resource_group.get('resources', [])
            ]
        text = json.dumps(manifest, ensure_ascii=False, indent=2) + '\n'

    return text.encode('utf-8')


def read_archive_entries(archive_path, apply_transform):
    entries = {}
    with zipfile.ZipFile(archive_path, 'r') as archive:
        for source_info in archive.infolist():
            entry_name = (
                ENTRY_RENAMES.get(source_info.filename, source_info.filename)
                if apply_transform
                else source_info.filename
            )
            if source_info.is_dir():
                entries[entry_name] = None
                continue
            data = archive.read(source_info)
            if apply_transform and Path(entry_name).suffix.lower() in TEXT_SUFFIXES:
                data = transform_text(entry_name, data)
            entries[entry_name] = data

    if apply_transform:
        for entry_name, source_path in ASSET_SOURCES.items():
            if not source_path.is_file():
                raise RuntimeError(f'缺少浏览器扩展品牌资源：{source_path}')
            entries[entry_name] = source_path.read_bytes()

    return entries


def validate_entries(entries):
    expected_images = set(ASSET_SOURCES)
    actual_images = {name for name, data in entries.items() if name.startswith('images/') and data is not None}
    if actual_images != expected_images:
        raise RuntimeError(f'浏览器扩展图标清单不一致：{sorted(actual_images)}')

    legacy_entry_names = sorted(name for name in entries if 'yakit' in name.lower() or name == 'images/yak.svg')
    if legacy_entry_names:
        raise RuntimeError(f'浏览器扩展仍包含旧品牌资源名：{legacy_entry_names}')

    for entry_name, source_path in ASSET_SOURCES.items():
        if entries.get(entry_name) != source_path.read_bytes():
            raise RuntimeError(f'浏览器扩展品牌资源内容不一致：{entry_name}')

    manifest = json.loads(entries['manifest.json'].decode('utf-8'))
    if manifest.get('name') != 'RuiYan Chrome Endpoint':
        raise RuntimeError('浏览器扩展名称未改为 RuiYan')
    if manifest.get('description') != 'Browser endpoint for RuiYan MITM and proxy workflows':
        raise RuntimeError('浏览器扩展描述未改为 RuiYan')
    resources = [
        resource
        for resource_group in manifest.get('web_accessible_resources', [])
        for resource in resource_group.get('resources', [])
    ]
    if 'images/ruiyan-icon.svg' not in resources or any(resource.lstrip('/') == 'images/yak.svg' for resource in resources):
        raise RuntimeError('浏览器扩展矢量图标引用未改为 RuiYan')

    text_payload = []
    for entry_name, data in entries.items():
        if data is None or Path(entry_name).suffix.lower() not in TEXT_SUFFIXES:
            continue
        text_payload.append(data.decode('utf-8'))
    combined_text = '\n'.join(text_payload)
    legacy_tokens = {match.lower() for match in re.findall(r'yakit[\w-]*', combined_text, re.IGNORECASE)}
    unexpected_tokens = sorted(legacy_tokens - ALLOWED_LEGACY_TOKENS)
    if unexpected_tokens:
        raise RuntimeError(f'浏览器扩展仍包含旧品牌文本：{unexpected_tokens}')
    if LEGACY_PALETTE.search(combined_text):
        raise RuntimeError('浏览器扩展仍包含旧橙色品牌值')
    if 'RuiYan MITM' not in entries['proxy.js'].decode('utf-8'):
        raise RuntimeError('浏览器扩展代理名称未改为 RuiYan')


def write_archive(archive_path, entries):
    archive_path.parent.mkdir(parents=True, exist_ok=True)
    file_descriptor, temporary_name = tempfile.mkstemp(
        prefix=f'{archive_path.name}.',
        suffix='.tmp',
        dir=archive_path.parent,
    )
    os.close(file_descriptor)
    temporary_path = Path(temporary_name)
    try:
        with zipfile.ZipFile(temporary_path, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            for entry_name in sorted(entries):
                data = entries[entry_name]
                info = zipfile.ZipInfo(entry_name, FIXED_TIMESTAMP)
                info.create_system = 3
                if data is None:
                    info.compress_type = zipfile.ZIP_STORED
                    info.external_attr = (0o40755 << 16) | 0x10
                    archive.writestr(info, b'')
                else:
                    info.compress_type = zipfile.ZIP_DEFLATED
                    info.external_attr = 0o100644 << 16
                    archive.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
        os.replace(temporary_path, archive_path)
    finally:
        temporary_path.unlink(missing_ok=True)


def rebrand_archive(archive_path):
    entries = read_archive_entries(archive_path, apply_transform=True)
    validate_entries(entries)
    write_archive(archive_path, entries)


def validate_archive(archive_path):
    entries = read_archive_entries(archive_path, apply_transform=False)
    validate_entries(entries)


def main():
    parser = argparse.ArgumentParser(description='重建 RuiYan 浏览器扩展安装载荷')
    parser.add_argument('--archive', type=Path, default=DEFAULT_ARCHIVE)
    parser.add_argument('--check', action='store_true')
    arguments = parser.parse_args()
    archive_path = arguments.archive.resolve()
    if not archive_path.is_file():
        raise RuntimeError(f'浏览器扩展压缩包不存在：{archive_path}')
    if arguments.check:
        validate_archive(archive_path)
        print(f'浏览器扩展品牌校验通过：{archive_path}')
        return
    rebrand_archive(archive_path)
    print(f'浏览器扩展品牌重建完成：{archive_path}')


if __name__ == '__main__':
    main()
