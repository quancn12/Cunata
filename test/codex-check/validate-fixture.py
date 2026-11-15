"""Independent standard-library validation of the generated DOCX fixture."""
import struct
import xml.etree.ElementTree as ET
import zipfile
import zlib
from pathlib import Path

path = Path(__file__).parent / 'fixtures' / 'minimal.docx'
with zipfile.ZipFile(path) as archive:
    assert archive.testzip() is None, 'ZIP CRC/size mismatch'
    assert len(archive.namelist()) == 5
    for name in archive.namelist():
        if name.endswith(('.xml', '.rels')):
            ET.fromstring(archive.read(name))
    document = archive.read('word/document.xml')
    assert b'TABLE-KEEP-42' in document and b'IMAGE-KEEP-42' in document
    png = archive.read('word/media/image1.png')
    assert png[:8] == bytes.fromhex('89504e470d0a1a0a')
    offset, compressed = 8, []
    while offset < len(png):
        size = struct.unpack('>I', png[offset:offset + 4])[0]
        tag = png[offset + 4:offset + 8]
        data = png[offset + 8:offset + 8 + size]
        checksum = struct.unpack('>I', png[offset + 8 + size:offset + 12 + size])[0]
        assert zlib.crc32(tag + data) == checksum, f'PNG {tag} CRC mismatch'
        if tag == b'IDAT':
            compressed.append(data)
        offset += size + 12
    assert zlib.decompress(b''.join(compressed)) == bytes([0, 255, 0, 0, 255])
print('PASS: 5 ZIP entries; ZIP CRC32 and sizes valid; XML/relationships parse; table/image present; 1x1 RGBA PNG chunk CRC32 and decompressed pixels valid.')
