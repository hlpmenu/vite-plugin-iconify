const pluginName = '[vite-plugin-iconify] ';

export interface IconAttributes {
  [key: string]: string | undefined;
  width?: string;
  height?: string;
  color?: string;
  flip?: string;
}

/**
 * Parse attributes from the <Icon /> tag.
 * @param attributesString The string containing the attributes.
 * @returns An object representing the parsed attributes.
 */
export function parseAttributes(attributesString: string): IconAttributes {
  const attributes: IconAttributes = {};
  const regex = /([:@]?\w[\w-]*)="([^"]*)"/g;
  let match: RegExpExecArray | null = regex.exec(attributesString);
  while (match !== null) {
    attributes[match[1]] = match[2];
    match = regex.exec(attributesString);
  }
  return attributes;
}

/**
 * Build the SVG URL with query parameters.
 * @param prefix The prefix of the icon (e.g., icon set).
 * @param name The name of the icon.
 * @param attributes The attributes from the <Icon /> tag.
 * @returns The URL to fetch the SVG.
 */
export function buildSvgUrl(prefix: string, name: string, attributes: IconAttributes): string {
  const baseUrl = `https://api.iconify.design/${prefix}/${name}.svg`;
  const params = new URLSearchParams();
  if (attributes.width) params.set('width', attributes.width);
  if (attributes.height) params.set('height', attributes.height);
  if (attributes.color) params.set('color', attributes.color);
  if (attributes.flip) params.set('flip', attributes.flip);
  const query = params.toString();
  return `${baseUrl}?${query}`;
}

/**
 * Fetch SVG content from the specified URL.
 * @param url The URL to fetch the SVG from.
 * @returns The SVG content as a string.
 */
export async function fetchSvg(url: string): Promise<string> {
  console.log(`${pluginName}fetching svg: ${url}`);
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const svg = await response.text();
    return svg;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${pluginName}Failed to fetch SVG: ${message}`);
  }
}
