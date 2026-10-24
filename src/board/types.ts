import type * as THREE from 'three';
import type { Song } from '../audio/sequencer';

export type SpaceType = 'start' | 'blue' | 'red' | 'happening' | 'item' | 'battle' | 'villain' | 'shop';

export interface Space {
  id: number;
  type: SpaceType;
  /** World position on the ground plane (y is the space's top). */
  pos: THREE.Vector3;
  /** Ids of the spaces you can move to next. More than one = a junction. */
  next: number[];
  /** The star can appear here. */
  starCandidate: boolean;
  /** A locked gate stands at the entrance to this space; a Skeleton Key opens it. */
  gate?: boolean;
}

/** A board's data plus the board-specific pieces (scenery, music, happening event). */
export interface BoardDef {
  id: string;
  name: string;
  spaces: Space[];
  startId: number;
  song: Song;
  /** Adds water, islands, props... to the scene. */
  buildScenery(scene: THREE.Scene, spaces: Space[]): void;
  /** Animated scenery bits (waves, flags). */
  updateScenery?(t: number): void;
  happening: {
    title: string;
    description: string;
  };
}
