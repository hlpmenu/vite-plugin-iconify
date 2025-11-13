import { buildSvgUrl, fetchSvg, type IconAttributes } from './utils';

const pluginName = '[vite-plugin-iconify] ';

/**
 * Transform React components by replacing <Icon /> components with inline SVGs.
 * @param code Source code of the module.
 * @param id Module identifier.
 */
export default async function transformReact(code: string, id: string): Promise<string | void> {
  const iconRegex = /<Icon\s+([^>]*?)\/>/g;
  const matches = [...code.matchAll(iconRegex)];
  if (!matches.length) return;

  let transformedCode = code;

  for (const match of matches) {
    const fullMatch = match[0];
    const attributes = parseReactAttributes(match[1]);

    if (!attributes.icon) {
      console.warn(`${pluginName}Missing 'icon' attribute in <Icon />.`);
      continue;
    }

    const [prefix, name] = attributes.icon.split(':');
    if (!prefix || !name) {
      console.warn(`${pluginName}Invalid 'icon' format in <Icon />: "${attributes.icon}".`);
      continue;
    }

    const svgUrl = buildSvgUrl(prefix, name, attributes);
    const svgContent = await fetchSvg(svgUrl);

    if (!svgContent) {
      console.warn(`${pluginName}Failed to fetch SVG for "${attributes.icon}".`);
      continue;
    }

    // Preserve non-icon attributes on the resulting <svg> element.
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
 * @param attributesString Raw attributes string from the match.
 */
function parseReactAttributes(attributesString: string): IconAttributes {
  const attributes: IconAttributes = {};
  const regex = /(\w[\w-]*)={"([^}]*)"}/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(attributesString)) !== null) {
    attributes[match[1]] = match[2];
  }
  return attributes;
}
