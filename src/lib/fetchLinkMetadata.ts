// Link Metadata Fetcher using CORS proxy
// Fetches Open Graph metadata from URLs

export interface LinkMetadata {
    title: string;
    description: string;
    image: string | null;
    favicon: string | null;
    siteName: string | null;
}

// Multiple CORS proxy options for reliability
const CORS_PROXIES = [
    'https://api.allorigins.win/raw?url=',
    'https://corsproxy.io/?',
];

/**
 * Fetch Open Graph metadata from a URL
 */
export async function fetchLinkMetadata(url: string): Promise<LinkMetadata | null> {
    if (!url || !isValidUrl(url)) return null;

    // Try each proxy until one works
    for (const proxy of CORS_PROXIES) {
        try {
            const response = await fetch(`${proxy}${encodeURIComponent(url)}`, {
                headers: { 'Accept': 'text/html' },
                signal: AbortSignal.timeout(5000), // 5 second timeout
            });

            if (!response.ok) continue;

            const html = await response.text();
            return parseMetadata(html, url);
        } catch (error) {
            console.warn(`Proxy ${proxy} failed:`, error);
            continue;
        }
    }

    // All proxies failed, return basic fallback
    return {
        title: extractDomainName(url),
        description: '',
        image: null,
        favicon: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(new URL(url).hostname)}&sz=64`,
        siteName: extractDomainName(url),
    };
}

/**
 * Parse HTML to extract Open Graph metadata
 */
function parseMetadata(html: string, originalUrl: string): LinkMetadata {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const getMeta = (selectors: string[]): string => {
        for (const selector of selectors) {
            const el = doc.querySelector(selector);
            if (el) {
                const content = el.getAttribute('content') || el.textContent || '';
                if (content.trim()) return content.trim();
            }
        }
        return '';
    };

    const getAbsoluteUrl = (path: string | null | undefined, baseUrl: string): string | null => {
        if (!path) return null;
        if (path.startsWith('http')) return path;
        try {
            return new URL(path, baseUrl).href;
        } catch {
            return path;
        }
    };

    // Extract title
    const title = getMeta([
        'meta[property="og:title"]',
        'meta[name="twitter:title"]',
        'title',
    ]) || extractDomainName(originalUrl);

    // Extract description
    const description = getMeta([
        'meta[property="og:description"]',
        'meta[name="twitter:description"]',
        'meta[name="description"]',
    ]);

    // Extract image
    const rawImage = getMeta([
        'meta[property="og:image"]',
        'meta[name="twitter:image"]',
        'meta[property="og:image:url"]',
    ]);
    const image = getAbsoluteUrl(rawImage, originalUrl);

    // Extract favicon
    const faviconEl = doc.querySelector('link[rel="icon"]') || doc.querySelector('link[rel="shortcut icon"]');
    const rawFavicon = faviconEl?.getAttribute('href');
    const favicon = getAbsoluteUrl(rawFavicon, originalUrl)
        || `https://www.google.com/s2/favicons?domain=${encodeURIComponent(new URL(originalUrl).hostname)}&sz=64`;

    // Extract site name
    const siteName = getMeta([
        'meta[property="og:site_name"]',
    ]) || extractDomainName(originalUrl);

    return { title, description, image, favicon, siteName };
}

/**
 * Extract domain name from URL for display
 */
function extractDomainName(url: string): string {
    try {
        const hostname = new URL(url).hostname;
        return hostname.replace(/^www\./, '');
    } catch {
        return url;
    }
}

/**
 * Basic URL validation
 */
function isValidUrl(url: string): boolean {
    try {
        new URL(url);
        return url.startsWith('http://') || url.startsWith('https://');
    } catch {
        return false;
    }
}
