import React from 'react'
import { Composition } from 'remotion'
import { FPS, JUDR_DURATION, Judr } from './Judr'

export const RemotionRoot: React.FC = () => (
  <Composition id="Judr" component={Judr} durationInFrames={JUDR_DURATION} fps={FPS} width={1920} height={1080} />
)
