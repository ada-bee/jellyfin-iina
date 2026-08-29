import { CLIENT_NAME, DEBUG_LOGS, DEVICE_NAME, TICKS_PER_SECOND } from "../shared/constants";

export { CLIENT_VERSION } from "../shared/version";
export { CLIENT_NAME, DEBUG_LOGS, DEVICE_NAME, TICKS_PER_SECOND };

export const TICKS_PER_MINUTE = TICKS_PER_SECOND * 60;

export const FIELDS_LIBRARY_ITEMS = "Overview,Genres,MediaSources,UserData,RunTimeTicks,SeriesId,SeasonId";
export const FIELDS_EPISODES = "Overview,MediaSources,UserData,RunTimeTicks,SeriesName,ParentIndexNumber,IndexNumber,SeriesId,SeasonId";
export const FIELDS_HOME_ITEMS = "Overview,UserData,RunTimeTicks,SeriesName,ProductionYear,ParentIndexNumber,IndexNumber,SeriesId,SeasonId";
export const FIELDS_SEARCH = "Overview,UserData,RunTimeTicks,SeriesName,ProductionYear,ParentIndexNumber,IndexNumber,SeriesId,SeasonId,RecursiveItemCount,ChildCount";
export const FIELDS_SEASONS = "Overview,UserData,RunTimeTicks,IndexNumber";
export const ITEM_DETAILS_FIELDS = "Overview,Taglines,Genres,MediaSources,UserData,RunTimeTicks,OfficialRating,ProductionYear,PremiereDate,EndDate,Status,RecursiveItemCount,ChildCount,ParentIndexNumber,IndexNumber,SeriesName,SeriesId,SeasonId,ParentId,Type";
