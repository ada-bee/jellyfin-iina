import { createSidebarRequests } from "../../sidebar/requests";
import { apiRequest, fetchItemDetails } from "./sidebarApi";

export const sidebarRequests = createSidebarRequests({
    requestJson: apiRequest,
    fetchItemDetails
});
