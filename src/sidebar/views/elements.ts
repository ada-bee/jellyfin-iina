export function buildDisclosureChevron(): SVGElement {
    const namespace = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(namespace, "svg");
    svg.setAttribute("width", "13");
    svg.setAttribute("height", "13");
    svg.setAttribute("viewBox", "0 0 14 14");
    svg.setAttribute("fill", "none");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS(namespace, "path");
    path.setAttribute("d", "m5 2.5 4 4.5-4 4.5");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "1.6");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.appendChild(path);
    return svg;
}
