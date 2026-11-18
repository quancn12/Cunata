/// <reference lib="dom" />
/** Original line drawings for Cunata; no third-party icon assets. */
const paths = {
    book: ['M4 4h6a3 3 0 0 1 2 1 3 3 0 0 1 2-1h6v15h-6a3 3 0 0 0-2 1 3 3 0 0 0-2-1H4Z', 'M12 5v15'],
    student: ['M3 8l9-5 9 5-9 5Z', 'M6 10v6c4 3 8 3 12 0v-6', 'M21 8v8'],
    teacher: ['M9 20v-3c0-4-6-4-6 0v3', 'M4 7a2 2 0 1 0 4 0 2 2 0 1 0-4 0', 'M11 4h10v12H11', 'M14 8h4', 'M14 12h3'],
    classes: ['M3 5h18v14H3Z', 'M7 9h3v3H7Z', 'M14 9h3', 'M14 13h3', 'M7 16h10'],
    results: ['M4 20h16', 'M7 16v-5', 'M12 16V5', 'M17 16V8'],
    close: ['M6 6l12 12', 'M18 6 6 18'],
    check: ['M4 12l5 5L20 6'],
    warning: ['M12 3 2 21h20Z', 'M12 9v5', 'M12 17v1'],
    offline: ['M3 3l18 18', 'M4 8a15 15 0 0 1 16 0', 'M7 12a9 9 0 0 1 10 0', 'M10 16a3 3 0 0 1 4 0', 'M12 20h0'],
    plus: ['M12 4v16', 'M4 12h16'],
    arrow: ['M4 12h16', 'M14 6l6 6-6 6'],
    logout: ['M10 4H4v16h6', 'M9 12h12', 'M16 7l5 5-5 5'],
    clock: ['M21 12a9 9 0 1 1-18 0 9 9 0 1 1 18 0', 'M12 7v5l3 2'],
    search: ['M16 10a6 6 0 1 1-12 0 6 6 0 1 1 12 0', 'M15 15l6 6'],
    copy: ['M8 8h12v13H8Z', 'M16 8V3H3v13h5'],
    menu: ['M4 6h16', 'M4 12h16', 'M4 18h16'],
    download: ['M12 3v12', 'M7 10l5 5 5-5', 'M4 16v5h16v-5'],
    edit: ['M4 16 16 4l4 4L8 20H4Z', 'M13 7l4 4'],
    trash: ['M3 6h18', 'M9 6V3h6v3', 'M6 6v15h12V6', 'M10 10v7', 'M14 10v7'],
    refresh: ['M20 8a9 9 0 1 0 1 8', 'M20 3v5h-5'],
    user: ['M16 7a4 4 0 1 1-8 0 4 4 0 1 1 8 0', 'M4 21v-3c0-7 16-7 16 0v3'],
};
export function Icon(name, doc = document) {
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.75', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false', class: 'ui-icon' }))
        svg.setAttribute(key, value);
    for (const d of paths[name]) {
        const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', d);
        svg.append(path);
    }
    return svg;
}
export const createIcon = Icon;
