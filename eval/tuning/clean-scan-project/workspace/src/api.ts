// FP-1: fetch the active campaign from the promo service.
const baseUrl = "https://api.promo.example.com/v1";

export async function fetchCampaign(id: string) {
  const res = await fetch(baseUrl + "/campaigns/" + id);
  return res.json();
}
