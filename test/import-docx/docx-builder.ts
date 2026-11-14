/**
 * Synthetic DOCX package builder for unit and integration testing.
 * Creates byte-level controlled DOCX files without external dependencies.
 */

import { buildSyntheticZip } from "../import-zip/builder.ts";
import type { SyntheticZipEntry } from "../import-zip/builder.ts";

const utf8Encoder = new TextEncoder();

export function encodeUtf8(str: string): Uint8Array {
  return utf8Encoder.encode(str);
}

export interface SyntheticDocxOptions {
  documentXml?: string;
  relsXml?: string;
  numberingXml?: string;
  stylesXml?: string;
  contentTypesXml?: string;
  packageRelsXml?: string;
  mediaEntries?: { name: string; bytes: Uint8Array }[];
  extraEntries?: { name: string; bytes: Uint8Array }[];
  omitDocumentXml?: boolean;
}

export const DEFAULT_CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Default Extension="emf" ContentType="image/x-emf"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

export const DEFAULT_PACKAGE_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

export const DEFAULT_DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rIdNum" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
</Relationships>`;

/**
 * Builds a valid or synthetic DOCX file buffer.
 */
export async function buildSyntheticDocx(options: SyntheticDocxOptions = {}): Promise<Uint8Array> {
  const entries: SyntheticZipEntry[] = [];

  // [Content_Types].xml
  entries.push({
    name: "[Content_Types].xml",
    data: encodeUtf8(options.contentTypesXml ?? DEFAULT_CONTENT_TYPES),
  });

  // _rels/.rels
  entries.push({
    name: "_rels/.rels",
    data: encodeUtf8(options.packageRelsXml ?? DEFAULT_PACKAGE_RELS),
  });

  // word/document.xml
  if (!options.omitDocumentXml) {
    const docXml =
      options.documentXml ??
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:p><w:r><w:t>Đề thi thử tốt nghiệp THPT</w:t></w:r></w:p>
  </w:body>
</w:document>`;
    entries.push({
      name: "word/document.xml",
      data: encodeUtf8(docXml),
    });
  }

  // word/_rels/document.xml.rels
  if (options.relsXml !== undefined) {
    entries.push({
      name: "word/_rels/document.xml.rels",
      data: encodeUtf8(options.relsXml),
    });
  } else {
    entries.push({
      name: "word/_rels/document.xml.rels",
      data: encodeUtf8(DEFAULT_DOC_RELS),
    });
  }

  // word/numbering.xml
  if (options.numberingXml !== undefined) {
    entries.push({
      name: "word/numbering.xml",
      data: encodeUtf8(options.numberingXml),
    });
  }

  // word/styles.xml
  if (options.stylesXml !== undefined) {
    entries.push({
      name: "word/styles.xml",
      data: encodeUtf8(options.stylesXml),
    });
  }

  // Media entries
  if (options.mediaEntries) {
    for (const media of options.mediaEntries) {
      entries.push({
        name: media.name.startsWith("word/") ? media.name : `word/${media.name}`,
        data: media.bytes,
      });
    }
  }

  // Extra entries
  if (options.extraEntries) {
    for (const extra of options.extraEntries) {
      entries.push({
        name: extra.name,
        data: extra.bytes,
      });
    }
  }

  return buildSyntheticZip({ entries });
}

/**
 * Creates a File-like mock for testing importDocx in Node.
 */
export function createMockDocxFile(
  bytes: Uint8Array,
  name: string = "test-exam.docx",
): File {
  return {
    name,
    size: bytes.byteLength,
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  } as unknown as File;
}
