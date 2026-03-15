export type GradientType = 'linear' | 'radial' | 'conic' | 'mesh';

export interface ColorStop {
  id: string;
  color: string;
  position: number; // 0 to 100
  midpoint?: number; // 0 to 100, relative position between this stop and the next. Default 50.
  x: number; // 0 to 100
  y: number; // 0 to 100
}

export interface MeshPoint {
  id: string;
  color: string;
  x: number; // 0 to 100
  y: number; // 0 to 100
  radius: number; // 0 to 100
}

export interface GradientSettings {
  type: GradientType;
  angle: number; // For linear
  stops: ColorStop[];
  meshPoints: MeshPoint[];
  backgroundColor: string;
  noise: number; // 0 to 100
  ratio: {
    width: number;
    height: number;
  };
  exportDpi: number;
  controlPoints?: {
    start: { x: number; y: number };
    end: { x: number; y: number };
  };
}
