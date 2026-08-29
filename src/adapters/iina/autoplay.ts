import { requestJson } from "./apiClient";
import { createAutoplayResolver } from "./autoplayResolver";

export const resolveAutoplayNextEpisode = createAutoplayResolver({ requestJson });
