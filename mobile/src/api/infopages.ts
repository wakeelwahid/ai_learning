import client from "./client";

// Admin-editable CMS pages: about-us, contact-us, faq, privacy-policy, terms, refund-policy, footer
export const infoPageApi = {
  list: () => client.get("/v1/content/info-pages"),
  get:  (slug: string) => client.get(`/v1/content/info-pages/${slug}`),
};
