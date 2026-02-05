/**
 * Image compression utility using browser-image-compression
 * Compresses images before upload to reduce storage and bandwidth
 */
import imageCompression from 'browser-image-compression';

export interface CompressionOptions {
    maxSizeMB?: number;
    maxWidthOrHeight?: number;
    useWebWorker?: boolean;
}

const DEFAULT_OPTIONS: CompressionOptions = {
    maxSizeMB: 1,           // Target max file size of 1MB
    maxWidthOrHeight: 1920, // Max dimension
    useWebWorker: true,     // Use web worker for better performance
};

/**
 * Compress an image file before upload
 * @param file - The image file to compress
 * @param options - Optional compression settings
 * @returns Compressed file (or original if compression fails/not needed)
 */
export async function compressImage(
    file: File,
    options: CompressionOptions = {}
): Promise<File> {
    // Only compress images
    if (!file.type.startsWith('image/')) {
        return file;
    }

    // Skip already small files (< 200KB)
    if (file.size < 200 * 1024) {
        console.log('[ImageCompression] File already small, skipping:', file.name);
        return file;
    }

    // Skip SVGs and GIFs (compression can break them)
    if (file.type === 'image/svg+xml' || file.type === 'image/gif') {
        console.log('[ImageCompression] Skipping unsupported format:', file.type);
        return file;
    }

    const compressionOptions = {
        ...DEFAULT_OPTIONS,
        ...options,
    };

    try {
        console.log('[ImageCompression] Compressing:', file.name, 'Size:', (file.size / 1024 / 1024).toFixed(2), 'MB');

        const compressedFile = await imageCompression(file, compressionOptions);

        const savings = ((file.size - compressedFile.size) / file.size * 100).toFixed(1);
        console.log('[ImageCompression] Compressed:', file.name,
            'New size:', (compressedFile.size / 1024 / 1024).toFixed(2), 'MB',
            `(${savings}% reduction)`
        );

        return compressedFile;
    } catch (error) {
        console.error('[ImageCompression] Failed to compress:', file.name, error);
        // Return original file if compression fails
        return file;
    }
}

/**
 * Check if a file is an image that can be compressed
 */
export function isCompressibleImage(file: File): boolean {
    const compressibleTypes = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp',
    ];
    return compressibleTypes.includes(file.type);
}
