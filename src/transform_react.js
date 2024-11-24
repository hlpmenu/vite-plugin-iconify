import { buildSvgUrl, fetchSvg } from './utils.js';

/**
 * Transform function for processing React components and replacing <Icon> components with inline SVGs.
 * @param {string} code - The source code of the module.
 * @param {string} id - The identifier of the module.
 * @returns {Promise<string|void>} The transformed code or void if no transformation is needed.
 */
async function transformReact(code, id) {
  const iconRegex = /<Icon\s+([^>]*?)\/>/g;
  const matches = [...code.matchAll(iconRegex)];
  if (!matches.length) return;

  let transformedCode = code;

  for (const match of matches) {
    const fullMatch = match[0];
    const attributes = parseReactAttributes(match[1]);

    if (!attributes.icon) {
      console.warn(`[vite-plugin-iconify] Missing 'icon' attribute in <Icon />.`);
      continue;
    }

    const [prefix, name] = attributes.icon.split(':');
    if (!prefix || !name) {
      console.warn(`[vite-plugin-iconify] Invalid 'icon' format in <Icon />: "${attributes.icon}".`);
      continue;
    }

    const svgUrl = buildSvgUrl(prefix, name, attributes);
    const svgContent = await fetchSvg(svgUrl);

    if (!svgContent) {
      console.warn(`[vite-plugin-iconify] Failed to fetch SVG for "${attributes.icon}".`);
      continue;
    }

    // Insert original attributes (except the icon-specific ones) into the <svg> tag
    const filteredAttributes = Object.entries(attributes)
      .filter(([key]) => !['icon', 'width', 'height', 'color', 'flip'].includes(key))
      .map(([key, value]) => `${key}={${JSON.stringify(value)}}`)
      .join(' ');

    const svg = svgContent.replace('<svg', `<svg ${filteredAttributes}`);
    transformedCode = transformedCode.replace(fullMatch, svg);
  }

  return transformedCode;
}

/**
 * Parse attributes from the <Icon /> tag in React components.
 * @param {string} attributesString - The string containing the attributes.
 * @returns {object} An object representing the parsed attributes.
 */
function parseReactAttributes(attributesString) {
  const attributes = {};
  const regex = /(\w[\w-]*)={"([^}]*)"}/g;
  let match;
  while ((match = regex.exec(attributesString))) {
    attributes[match[1]] = match[2];
  }
  return attributes;
}

export default transformReact;
