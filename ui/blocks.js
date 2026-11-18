/// <reference lib="dom" />
import { resolveAssetUrl } from './security.js';
function getDoc(options) {
    if (options?.document)
        return options.document;
    if (typeof document !== 'undefined')
        return document;
    throw new Error('DOM Document is required to render UI blocks');
}
/**
 * Safely renders plain text into an element without ever using innerHTML.
 */
export function renderText(text, options) {
    const doc = getDoc(options);
    const el = doc.createElement('div');
    el.className = 'cunata-text-block';
    // textContent or appendChild(createTextNode) ensures HTML tags are escaped and never evaluated
    el.textContent = typeof text === 'string' ? text : String(text ?? '');
    return el;
}
/**
 * Safely renders a math formula container without any external CDN/renderer dependencies.
 * Conforms to WEB-contract.md §4.1 & §9.
 */
export function renderMath(mathBlock, options) {
    const doc = getDoc(options);
    const container = doc.createElement('span');
    container.className = 'cunata-math';
    container.setAttribute('data-format', mathBlock.format);
    container.setAttribute('data-verified', String(mathBlock.verified));
    container.setAttribute('role', 'math');
    container.setAttribute('aria-label', `Công thức: ${mathBlock.source}`);
    const codeEl = doc.createElement('code');
    codeEl.className = 'cunata-math-source';
    // Escaped plain text rendering
    codeEl.textContent = mathBlock.source;
    container.appendChild(codeEl);
    return container;
}
/**
 * Safely renders an image block, validating URLs/MIMEs and protecting against layout overflow.
 */
export function renderImage(imageBlock, options) {
    const doc = getDoc(options);
    const safeUrl = resolveAssetUrl(imageBlock.assetId, options?.assets);
    if (safeUrl) {
        const figure = doc.createElement('figure');
        figure.className = 'cunata-image-container';
        const img = doc.createElement('img');
        img.className = 'cunata-image';
        img.setAttribute('alt', imageBlock.alt || 'Hình minh họa');
        img.setAttribute('loading', 'lazy');
        img.src = safeUrl;
        if (options?.onImageError) {
            img.onerror = () => {
                options.onImageError?.(imageBlock.assetId);
            };
        }
        figure.appendChild(img);
        return figure;
    }
    // Fallback placeholder when URL is unsafe, external, or not found
    const placeholder = doc.createElement('span');
    placeholder.className = 'cunata-image-placeholder cunata-image-unsafe';
    placeholder.setAttribute('role', 'img');
    placeholder.setAttribute('aria-label', `Hình ảnh bị chặn hoặc không khả dụng: ${imageBlock.alt || imageBlock.assetId}`);
    placeholder.textContent = `[Hình ảnh: ${imageBlock.alt || imageBlock.assetId} (không khả dụng hoặc bị chặn)]`;
    return placeholder;
}
/**
 * Safely renders a table block with nested block cells.
 */
export function renderTable(tableBlock, options) {
    const doc = getDoc(options);
    const wrapper = doc.createElement('div');
    wrapper.className = 'cunata-table-wrapper';
    const table = doc.createElement('table');
    table.className = 'cunata-table';
    const tbody = doc.createElement('tbody');
    for (let rowIndex = 0; rowIndex < tableBlock.rows.length; rowIndex++) {
        const row = tableBlock.rows[rowIndex];
        if (!row)
            continue;
        const tr = doc.createElement('tr');
        for (let colIndex = 0; colIndex < row.length; colIndex++) {
            const cell = row[colIndex];
            if (!cell)
                continue;
            // Use th for first row if multiple rows, or td
            const cellTag = rowIndex === 0 && tableBlock.rows.length > 1 ? 'th' : 'td';
            const cellEl = doc.createElement(cellTag);
            // Clamp rowSpan and colSpan to safe integers >= 1
            const rowSpan = Math.max(1, Math.floor(Number(cell.rowSpan) || 1));
            const colSpan = Math.max(1, Math.floor(Number(cell.colSpan) || 1));
            if (rowSpan > 1)
                cellEl.setAttribute('rowspan', String(rowSpan));
            if (colSpan > 1)
                cellEl.setAttribute('colspan', String(colSpan));
            // Render cell blocks recursively
            if (cell.blocks && cell.blocks.length > 0) {
                for (const childBlock of cell.blocks) {
                    cellEl.appendChild(renderBlock(childBlock, options));
                }
            }
            tr.appendChild(cellEl);
        }
        tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    wrapper.appendChild(table);
    return wrapper;
}
/**
 * Dispatches and renders a single Block node safely.
 */
export function renderBlock(block, options) {
    switch (block.type) {
        case 'text':
            return renderText(block.text, options);
        case 'math':
            return renderMath(block, options);
        case 'image':
            return renderImage(block, options);
        case 'table':
            return renderTable(block, options);
        default: {
            // Safe fallback for unexpected block types
            const unknownBlock = block;
            return renderText(`[Khối không xác định: ${String(unknownBlock?.type ?? 'unknown')}]`, options);
        }
    }
}
/**
 * Renders an array of Blocks into a container element.
 */
export function renderBlocks(blocks, options) {
    const doc = getDoc(options);
    const container = doc.createElement('div');
    container.className = 'cunata-blocks-container';
    for (const block of blocks) {
        container.appendChild(renderBlock(block, options));
    }
    return container;
}
