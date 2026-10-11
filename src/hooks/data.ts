import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type {
  AddToCartInput,
  Cart,
  CatalogQuery,
  Favorites,
  Network,
  PasswordChangeInput,
  ProfileInput,
  WalletInput,
  WalletRole,
} from "@/api/contracts";
import { api, qk } from "@/api/endpoints";
import { ApiError } from "@/lib/http";
import { sessionStore, useSession } from "@/lib/session";

/*
 * Data hooks. Rules:
 *  - private keys are namespaced by user id (qk.*), so data never leaks across sessions;
 *  - the AbortSignal from TanStack Query is forwarded to axios: obsolete requests are cancelled and
 *    a late response can only land in its own (now unused) key — never on the current screen;
 *  - mutations update the cache with the server's response (the server prices everything).
 */

// ------------------------------------------------------------------ catalog

export function useCatalog(query: CatalogQuery) {
  return useQuery({
    queryKey: qk.catalog(query),
    queryFn: ({ signal }) => api.nfts.list(query, signal),
    placeholderData: keepPreviousData,
  });
}

export function useNft(nftId: string) {
  return useQuery({
    queryKey: qk.nft(nftId),
    queryFn: ({ signal }) => api.nfts.get(nftId, signal),
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 2 && error instanceof ApiError && error.transient,
  });
}

// ------------------------------------------------------------------ favorites (optimistic)

export function useFavorites() {
  const session = useSession();
  return useQuery({
    queryKey: qk.favorites(session?.user.id ?? "anonymous"),
    queryFn: ({ signal }) => api.favorites.list(signal),
    enabled: Boolean(session),
  });
}

/** Optimistic toggle with rollback: the heart flips immediately; a failure restores it. */
export function useToggleFavorite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ nftId, favorite }: { nftId: string; favorite: boolean; name?: string }) =>
      favorite ? api.favorites.add(nftId) : api.favorites.remove(nftId),
    onMutate: async ({ nftId, favorite }) => {
      const userId = sessionStore.userId();
      if (!userId) return undefined;
      const key = qk.favorites(userId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Favorites>(key);
      queryClient.setQueryData<Favorites>(key, (old) => {
        const ids = new Set(old?.nftIds ?? []);
        if (favorite) ids.add(nftId);
        else ids.delete(nftId);
        return { nftIds: [...ids] };
      });
      return { key, previous };
    },
    onError: (error, vars, ctx) => {
      if (ctx) {
        // If the list had not loaded yet there is no snapshot: undo exactly our own change
        // (setQueryData(undefined) would be a no-op and leave the optimistic state behind).
        queryClient.setQueryData<Favorites>(ctx.key, (current) => {
          if (ctx.previous) return ctx.previous;
          const ids = new Set(current?.nftIds ?? []);
          if (vars.favorite) ids.delete(vars.nftId);
          else ids.add(vars.nftId);
          return { nftIds: [...ids] };
        });
        void queryClient.invalidateQueries({ queryKey: ctx.key });
      }
      toast.error(`Não foi possível ${vars.favorite ? "favoritar" : "remover dos favoritos"}${vars.name ? ` ${vars.name}` : ""}.`, {
        description: error instanceof ApiError ? error.message : undefined,
      });
    },
    onSuccess: (data, vars) => {
      const userId = sessionStore.userId();
      if (userId) queryClient.setQueryData(qk.favorites(userId), data);
      toast.success(vars.favorite ? "Adicionado aos favoritos" : "Removido dos favoritos");
    },
  });
}

// ------------------------------------------------------------------ cart

export const cartOwner = () => sessionStore.userId() ?? "guest";

export function useCart() {
  const session = useSession();
  return useQuery({
    queryKey: qk.cart(session?.user.id ?? "guest"),
    queryFn: ({ signal }) => api.cart.get(signal),
    staleTime: 10_000,
  });
}

/*
 * Feedback for mutations whose component may unmount (optimistic removal) lives here, at hook
 * level: callbacks passed to mutate() are skipped by TanStack Query once the caller unmounted.
 */
function useCartMutation<V>(
  fn: (vars: V) => Promise<Cart>,
  opts: { optimistic?: (cart: Cart, vars: V) => Cart; onSuccess?: (vars: V) => void; onError?: (error: unknown, vars: V) => void } = {},
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onMutate: async (vars: V) => {
      const key = qk.cart(cartOwner());
      if (!opts.optimistic) return { key, previous: undefined as Cart | undefined };
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Cart>(key);
      if (previous) queryClient.setQueryData(key, opts.optimistic(previous, vars));
      return { key, previous };
    },
    onError: (error, vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(ctx.key, ctx.previous);
      void queryClient.invalidateQueries({ queryKey: qk.cartAll });
      opts.onError?.(error, vars);
    },
    onSuccess: (cart, vars, ctx) => {
      queryClient.setQueryData(ctx.key, cart);
      opts.onSuccess?.(vars);
    },
  });
}

export const useAddToCart = () => useCartMutation((input: AddToCartInput) => api.cart.add(input));
export const useUpdateCartItem = () =>
  useCartMutation(({ itemId, quantity }: { itemId: string; quantity: number }) => api.cart.update(itemId, quantity));
export const useRemoveCartItem = () =>
  useCartMutation(({ itemId }: { itemId: string; name: string }) => api.cart.remove(itemId), {
    // Optimistic removal: the line disappears at once; totals are replaced by the server response.
    optimistic: (cart, { itemId }) => ({ ...cart, items: cart.items.filter((i) => i.id !== itemId) }),
    onSuccess: ({ name }) => toast.success(`${name} removido do carrinho`),
    onError: (error, { name }) =>
      toast.error(`Não foi possível remover ${name}. O item voltou ao carrinho.`, {
        description: error instanceof ApiError ? error.message : undefined,
      }),
  });
export const useApplyCoupon = () => useCartMutation((code: string) => api.cart.applyCoupon(code));
export const useRemoveCoupon = () => useCartMutation(() => api.cart.removeCoupon());
export const useAcknowledgePrices = () => useCartMutation(() => api.cart.acknowledge());

// ------------------------------------------------------------------ account

export function useProfile() {
  const session = useSession();
  return useQuery({
    queryKey: qk.profile(session?.user.id ?? "anonymous"),
    queryFn: ({ signal }) => api.profile.get(signal),
    enabled: Boolean(session),
  });
}

function useProfileMutation<V>(fn: (vars: V) => Promise<import("@/api/contracts").User>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (user) => {
      queryClient.setQueryData(qk.profile(user.id), user);
      sessionStore.updateUser(user);
    },
  });
}

export const useUpdateProfile = () => useProfileMutation((input: ProfileInput) => api.profile.update(input));
export const useSetAvatar = () => useProfileMutation((dataUrl: string) => api.profile.setAvatar(dataUrl));
export const useRemoveAvatar = () => useProfileMutation(() => api.profile.removeAvatar());
export const useChangePassword = () => useMutation({ mutationFn: (input: PasswordChangeInput) => api.profile.changePassword(input) });

export function useWallets() {
  const session = useSession();
  return useQuery({
    queryKey: qk.wallets(session?.user.id ?? "anonymous"),
    queryFn: ({ signal }) => api.wallets.list(signal).then((r) => r.items),
    enabled: Boolean(session),
  });
}

export function useSaveWallet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role, input }: { id?: string; role: WalletRole; input: WalletInput }) =>
      id ? api.wallets.update(id, input) : api.wallets.create(role, input),
    onSuccess: () => {
      const userId = sessionStore.userId();
      if (userId) void queryClient.invalidateQueries({ queryKey: qk.wallets(userId) });
    },
  });
}

export function useConnectWallet() {
  return useMutation({
    mutationFn: ({ walletId, network }: { walletId: string; network: Network }) => api.wallets.connect(walletId, network),
  });
}
