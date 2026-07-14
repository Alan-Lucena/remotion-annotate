import { Composition } from "remotion";
import { Demo } from "./Demo";
import { MotionCompare } from "./MotionCompare";

export const Root: React.FC = () => (
  <>
    <Composition
      id="Demo"
      component={Demo}
      width={1280}
      height={800}
      fps={30}
      durationInFrames={430}
    />
    <Composition
      id="MotionCompare"
      component={MotionCompare}
      width={1280}
      height={760}
      fps={30}
      durationInFrames={560}
    />
  </>
);
