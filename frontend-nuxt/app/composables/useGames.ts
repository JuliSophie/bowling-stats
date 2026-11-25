import { useFetch, useRuntimeConfig } from "#app";
import { validateGames } from "../domain/game-contract";

export function useGames() {
  const app = useRuntimeConfig().app;
  if (!app || typeof app !== "object" || !("baseURL" in app) || typeof app.baseURL !== "string") {
    throw new Error("Der Nuxt-Basispfad fehlt.");
  }
  const base = app.baseURL.replace(/\/?$/, "/");
  return useFetch(`${base}fixtures/games.json`, {
    key: "pilot-games",
    credentials: "omit",
    transform: validateGames,
  });
}
