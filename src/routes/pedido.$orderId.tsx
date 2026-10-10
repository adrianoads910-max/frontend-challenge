import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/pedido/$orderId")({ component: () => <div className="container-page py-20">Pedido (em construção)</div> });
