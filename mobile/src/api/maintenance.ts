import client from "./client";

export const maintenanceApi = {
  get: () => client.get("/v1/notifications/maintenance"),
};
