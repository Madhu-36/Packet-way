const ASSETS = {
  CYCLE: '/vehicles/bicycle.png',
  CAR: '/vehicles/sedan.png',
  TRUCK: '/vehicles/truck.png',
  BUS: '/vehicles/bus.png'
};

const loadedImages = {};

export const preloadAssets = () => {
  return new Promise((resolve) => {
    const keys = Object.keys(ASSETS);
    let loadedCount = 0;

    if (keys.length === 0) return resolve(loadedImages);

    keys.forEach(key => {
      const img = new Image();
      img.src = ASSETS[key];
      
      const onload = () => {
        loadedImages[key] = img;
        loadedCount++;
        if (loadedCount === keys.length) {
          resolve(loadedImages);
        }
      };

      const onerror = () => {
        console.warn(`Failed to load asset: ${ASSETS[key]}. Using fallback.`);
        // Create a fallback 1x1 transparent pixel so the app doesn't crash
        const fallback = new Image();
        fallback.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
        loadedImages[key] = fallback;
        loadedCount++;
        if (loadedCount === keys.length) {
          resolve(loadedImages);
        }
      };

      img.onload = onload;
      img.onerror = onerror;
    });
  });
};

export const getAsset = (type) => {
  return loadedImages[type];
};
