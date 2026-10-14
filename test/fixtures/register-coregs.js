// Local Compose only; not copied into the production image.
import { register } from "node:module";
register("./coregs-loader.js", import.meta.url);
