import { createClient } from "@mohammadsaddam-dev/hubspot-toolkit";
import axios from "axios";

let axiosInstance = null;
let hubspotClient = null;

function getHubspotClient() {
  if (hubspotClient) return hubspotClient;

  if (!hubspotClient && process.env.HUBSPOT_ACCESS_TOKEN) {
    hubspotClient = createClient({
      apiKey: process.env.HUBSPOT_API_KEY, // or ACCESS TOKEN
      accessToken: process.env.HUBSPOT_ACCESS_TOKEN,
    });
  }
  return hubspotClient;
}

function getHSAxios() {
  if (axiosInstance) return axiosInstance;
  return (axiosInstance = axios.create({
    baseURL: process.env.HUBSPOT_BASE_URL,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`,
    },
  }));
}

export { axiosInstance, hubspotClient, getHubspotClient, getHSAxios };
