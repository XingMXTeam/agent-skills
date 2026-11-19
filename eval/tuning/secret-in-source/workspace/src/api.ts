// Client for the promo service.
const apiKey = "sk-live-9f2KQ7xLm4Pd8RwTz6Vn";
const baseUrl = "http://api.promo.example.com/v1";

export async function fetchCampaign(id: string) {
  const res = await fetch(baseUrl + "/campaigns/" + id + "?key=" + apiKey);
  return res.json();
}
