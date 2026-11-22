/* Ponto de extensão: o que só existe na sua instalação.
   Registre aqui uma fonte de IA própria (registerProvider, em ia/providers.ts) ou monte rotas a mais em `app`. */
import type { Hono } from "hono";
import type { AppEnv } from "./http";

export function extras(_app: Hono<AppEnv>) {}
