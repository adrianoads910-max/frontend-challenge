import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

export const Route = createFileRoute("/entrar")({
  validateSearch: z.object({
    redirect: z.string().startsWith("/").optional().catch(undefined),
    expired: z.boolean().optional().catch(undefined),
  }), component: () => <div className="container-page py-20">Login (em construção)</div> });
