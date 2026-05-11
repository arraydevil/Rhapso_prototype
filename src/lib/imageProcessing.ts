import { removeBackground } from '@imgly/background-removal';

export interface ProcessedGarment {
  imageUrl: string;
  width: number;
  height: number;
  category: string;
}

export interface GarmentDimensions {
  x: number;
  y: number;
  width: number;
  height: number;
  transform: string;
}

export const removeBackgroundFromImage = async (imageUrl: string): Promise<string> => {
  try {
    const blob = await removeBackground(imageUrl);
    return URL.createObjectURL(blob);
  } catch (error) {
    console.error('Background removal failed:', error);
    return imageUrl;
  }
};

export const processGarmentImage = async (imageUrl: string, category: string): Promise<ProcessedGarment> => {
  const cleanImageUrl = await removeBackgroundFromImage(imageUrl);

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({
        imageUrl: cleanImageUrl,
        width: img.naturalWidth,
        height: img.naturalHeight,
        category,
      });
    };
    img.onerror = () => {
      resolve({
        imageUrl: cleanImageUrl,
        width: 200,
        height: 200,
        category,
      });
    };
    img.src = cleanImageUrl;
  });
};

export const getGarmentTransform = (
  category: string,
  bodyType: string,
  containerWidth: number,
  containerHeight: number
) => {
  const transforms: Record<string, Record<string, any>> = {
    top: {
      slim: { scale: 0.85, offsetY: -5, offsetX: 0 },
      standard: { scale: 1, offsetY: 0, offsetX: 0 },
      athletic: { scale: 1.05, offsetY: 0, offsetX: 0 },
      curvy: { scale: 1.15, offsetY: 5, offsetX: 0 },
    },
    bottom: {
      slim: { scale: 0.8, offsetY: 5, offsetX: 0 },
      standard: { scale: 1, offsetY: 0, offsetX: 0 },
      athletic: { scale: 1.08, offsetY: 0, offsetX: 0 },
      curvy: { scale: 1.2, offsetY: -5, offsetX: 0 },
    },
    shoes: {
      slim: { scale: 0.9, offsetY: 0, offsetX: 0 },
      standard: { scale: 1, offsetY: 0, offsetX: 0 },
      athletic: { scale: 1.05, offsetY: 0, offsetX: 0 },
      curvy: { scale: 1.05, offsetY: 0, offsetX: 0 },
    },
    accessory: {
      slim: { scale: 0.85, offsetY: 0, offsetX: 0 },
      standard: { scale: 1, offsetY: 0, offsetX: 0 },
      athletic: { scale: 1, offsetY: 0, offsetX: 0 },
      curvy: { scale: 1.05, offsetY: 0, offsetX: 0 },
    },
  };

  const categoryTransforms = transforms[category] || transforms.top;
  return categoryTransforms[bodyType] || categoryTransforms.standard;
};

export const calculateGarmentDimensions = (
  originalWidth: number,
  originalHeight: number,
  containerWidth: number,
  containerHeight: number,
  scale: number = 1,
  offsetY: number = 0,
  offsetX: number = 0
): GarmentDimensions => {
  const aspect = originalWidth / originalHeight;
  let width = containerWidth * 0.9;
  let height = width / aspect;

  if (height > containerHeight * 0.95) {
    height = containerHeight * 0.95;
    width = height * aspect;
  }

  width *= scale;
  height *= scale;

  const x = (containerWidth - width) / 2 + offsetX;
  const y = (containerHeight - height) / 2 + offsetY;

  // Retorna também um transform CSS para melhor compatibilidade
  const transformString = `translate(${x}px, ${y}px) scale(${scale})`;

  return { x, y, width, height, transform: transformString };
};

export const downloadGarmentAsImage = async (
  imageUrl: string,
  garmentName: string
) => {
  try {
    const a = document.createElement('a');
    a.href = imageUrl;
    a.download = `${garmentName.replace(/\s+/g, '_')}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch (error) {
    console.error('Download failed:', error);
  }
};
