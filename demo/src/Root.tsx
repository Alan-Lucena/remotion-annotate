import { Composition } from "remotion";
import { Demo } from "./Demo";

export const Root: React.FC = () => (
  <Composition
    id="Demo"
    component={Demo}
    width={1280}
    height={800}
    fps={30}
    durationInFrames={400}
  />
);
