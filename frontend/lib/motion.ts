'use client';

export interface MotionData {
  shakeDetected: boolean;
  /** Crater slope from the phone tilt; undefined until the first orientation event arrives */
  slopeAngle?: number;
  gamma: number;
  beta: number;
}

export async function requestMotionPermission(): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  type WithPermission = { requestPermission?: () => Promise<'granted' | 'denied'> };
  const motion = (typeof DeviceMotionEvent !== 'undefined' ? DeviceMotionEvent : undefined) as unknown as
    | WithPermission
    | undefined;
  const orientation = (typeof DeviceOrientationEvent !== 'undefined' ? DeviceOrientationEvent : undefined) as unknown as
    | WithPermission
    | undefined;

  if (typeof motion?.requestPermission === 'function') {
    try {
      // iOS 13+: tilt (slope) comes from DeviceOrientation, shake (fall) from DeviceMotion.
      // Both prompts must start inside the same tap, so they are requested together.
      const [m, o] = await Promise.all([
        motion.requestPermission(),
        typeof orientation?.requestPermission === 'function'
          ? orientation.requestPermission().catch(() => 'granted' as const)
          : Promise.resolve('granted' as const),
      ]);
      return m === 'granted' && o === 'granted';
    } catch {
      return false;
    }
  }

  return true;
}

export function subscribeMotion(
  onMotion: (data: MotionData) => void
): () => void {
  if (typeof window === 'undefined') return () => {};

  let lastX = 0;
  let lastY = 0;
  let lastZ = 0;
  let lastTime = 0;
  let currentSlope: number | undefined; // unknown until the gyroscope reports (was a fake 4°)
  let currentGamma = 0;
  let currentBeta = 0;

  const SHAKE_THRESHOLD = 18; // m/s^2 change

  const handleMotion = (event: DeviceMotionEvent) => {
    const acc = event.accelerationIncludingGravity || event.acceleration;
    if (!acc) return;

    const x = acc.x ?? 0;
    const y = acc.y ?? 0;
    const z = acc.z ?? 0;

    const now = Date.now();
    if (now - lastTime > 100) {
      const diffTime = now - lastTime;
      const speed = (Math.abs(x - lastX) + Math.abs(y - lastY) + Math.abs(z - lastZ)) / diffTime * 10000;

      let shake = false;
      if (speed > SHAKE_THRESHOLD * 50) {
        shake = true;
      }

      lastX = x;
      lastY = y;
      lastZ = z;
      lastTime = now;

      onMotion({
        shakeDetected: shake,
        slopeAngle: currentSlope,
        gamma: currentGamma,
        beta: currentBeta,
      });
    }
  };

  const handleOrientation = (event: DeviceOrientationEvent) => {
    const beta = event.beta ?? 0;
    const gamma = event.gamma ?? 0;
    currentGamma = Math.round(gamma);
    currentBeta = Math.round(beta);

    // Map forward/back pitch (beta) into 0-22 degree crater slope
    const pitch = Math.abs(beta);
    const mappedSlope = Math.min(22, Math.max(0, Math.round((pitch / 45) * 22)));
    currentSlope = mappedSlope;

    onMotion({
      shakeDetected: false,
      slopeAngle: mappedSlope,
      gamma: currentGamma,
      beta: currentBeta,
    });
  };

  window.addEventListener('devicemotion', handleMotion);
  window.addEventListener('deviceorientation', handleOrientation);

  return () => {
    window.removeEventListener('devicemotion', handleMotion);
    window.removeEventListener('deviceorientation', handleOrientation);
  };
}
