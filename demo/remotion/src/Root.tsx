import React from 'react'
import { Composition } from 'remotion'
import { FPS, JUDR_DURATION, Judr } from './Judr'
import { Thumb } from './Thumb'

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="Judr" component={Judr} durationInFrames={JUDR_DURATION} fps={FPS} width={1920} height={1080} />
    {/* The YouTube thumbnail: one frame, rendered with `npm run thumb`. */}
    <Composition id="Thumb" component={Thumb} durationInFrames={120} fps={FPS} width={1920} height={1080} />
  </>
)
